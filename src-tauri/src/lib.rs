use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use reqwest::Client;
use serde_json::Value;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{Emitter, Manager};
use user_idle::UserIdle;

fn make_client() -> Result<Client, String> {
    Client::builder().build().map_err(|e| e.to_string())
}

fn normalize_url(url: &str) -> String {
    url.trim_end_matches('/').to_string()
}

async fn api_get(url: &str, api_key: &str, path: &str, query: Vec<(&'static str, String)>) -> Result<Value, String> {
    let client = make_client()?;
    let full_url = format!("{}{}", normalize_url(url), path);
    let mut req = client.get(&full_url).basic_auth("apikey", Some(api_key));
    for (k, v) in &query {
        req = req.query(&[(k, v)]);
    }
    let resp = req.send().await.map_err(|e| e.to_string())?;
    let status = resp.status();
    let body: Value = resp.json().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("HTTP {}: {}", status, body));
    }
    Ok(body)
}

async fn api_post(url: &str, api_key: &str, path: &str, body: Value) -> Result<Value, String> {
    let client = make_client()?;
    let full_url = format!("{}{}", normalize_url(url), path);
    let resp = client
        .post(&full_url)
        .basic_auth("apikey", Some(api_key))
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let status = resp.status();
    let result: Value = resp.json().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("HTTP {}: {}", status, result));
    }
    Ok(result)
}

async fn api_patch(url: &str, api_key: &str, path: &str, body: Value) -> Result<Value, String> {
    let client = make_client()?;
    let full_url = format!("{}{}", normalize_url(url), path);
    let resp = client
        .patch(&full_url)
        .basic_auth("apikey", Some(api_key))
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let status = resp.status();
    let result: Value = resp.json().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("HTTP {}: {}", status, result));
    }
    Ok(result)
}

// ─── Idle tracker state (lives in Rust, unaffected by WKWebView throttling) ──

#[derive(Default)]
struct IdleTracker {
    enabled: bool,
    threshold_secs: u64,
    is_idle: bool,
    idle_start_ms: u64,
    peak_idle_secs: u64,
}

type SharedIdleTracker = Arc<Mutex<IdleTracker>>;

#[derive(serde::Serialize, Clone)]
struct IdleEndedPayload {
    #[serde(rename = "idleSeconds")]
    idle_seconds: u64,
    #[serde(rename = "idleStartedAt")]
    idle_started_at: u64,
}

// Keeps the TrayIcon alive for the lifetime of the app.
struct TrayState(Mutex<tauri::tray::TrayIcon>);

// ─── Commands ─────────────────────────────────────────────────────────────────

#[tauri::command]
async fn test_connection(url: String, api_key: String) -> Result<Value, String> {
    api_get(&url, &api_key, "/api/v3/users/me", vec![]).await
}

#[tauri::command]
async fn get_work_packages(
    url: String,
    api_key: String,
    filters: String,
    page_size: Option<u32>,
    offset: Option<u32>,
    sort_by: Option<String>,
) -> Result<Value, String> {
    let page_size = page_size.unwrap_or(50).to_string();
    let offset = offset.unwrap_or(1).to_string();
    let sort_by = sort_by.unwrap_or_else(|| r#"[["updatedAt","desc"]]"#.to_string());
    api_get(
        &url,
        &api_key,
        "/api/v3/work_packages",
        vec![
            ("filters", filters),
            ("pageSize", page_size),
            ("offset", offset),
            ("sortBy", sort_by),
        ],
    )
    .await
}

#[tauri::command]
async fn get_work_package(url: String, api_key: String, id: i64) -> Result<Value, String> {
    api_get(&url, &api_key, &format!("/api/v3/work_packages/{}", id), vec![]).await
}

#[tauri::command]
async fn update_work_package(url: String, api_key: String, id: i64, data: Value) -> Result<Value, String> {
    api_patch(&url, &api_key, &format!("/api/v3/work_packages/{}", id), data).await
}

#[tauri::command]
async fn create_work_package(url: String, api_key: String, data: Value) -> Result<Value, String> {
    api_post(&url, &api_key, "/api/v3/work_packages", data).await
}

#[tauri::command]
fn get_idle_seconds() -> u64 {
    UserIdle::get_time().map(|t| t.as_seconds()).unwrap_or(0)
}

/// Enable or disable Rust-side idle tracking. Called from JS when timer starts/stops.
#[tauri::command]
fn set_idle_tracking(
    state: tauri::State<SharedIdleTracker>,
    enabled: bool,
    threshold_secs: u64,
) {
    let mut t = state.lock().unwrap();
    t.enabled = enabled;
    t.threshold_secs = threshold_secs;
    if !enabled {
        t.is_idle = false;
        t.idle_start_ms = 0;
        t.peak_idle_secs = 0;
    }
}

/// Update the menu-bar tray title (shows current timer, macOS only).
#[tauri::command]
fn update_tray_title(state: tauri::State<TrayState>, title: String) {
    if let Ok(tray) = state.0.lock() {
        let text = if title.is_empty() { None } else { Some(title.as_str()) };
        let _ = tray.set_title(text);
    }
}

#[tauri::command]
fn bring_to_front(app: tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
    #[cfg(target_os = "macos")]
    unsafe {
        use objc::{class, msg_send, sel, sel_impl};
        use objc::runtime::YES;
        let ns_app: *mut objc::runtime::Object = msg_send![class!(NSApplication), sharedApplication];
        let _: () = msg_send![ns_app, activateIgnoringOtherApps: YES];
    }
}

#[tauri::command]
async fn get_project_wp_form(url: String, api_key: String, project_id: i64) -> Result<Value, String> {
    let body = serde_json::json!({});
    api_post(&url, &api_key, &format!("/api/v3/projects/{}/work_packages/form", project_id), body).await
}

#[tauri::command]
async fn get_project_members(url: String, api_key: String, project_id: i64) -> Result<Value, String> {
    api_get(&url, &api_key, &format!("/api/v3/projects/{}/members", project_id), vec![("pageSize", "200".to_string())]).await
}

#[tauri::command]
async fn get_project_assignees(url: String, api_key: String, project_id: i64) -> Result<Value, String> {
    let assignees_url = format!("/api/v3/projects/{}/available_assignees", project_id);
    match api_get(&url, &api_key, &assignees_url, vec![("pageSize", "200".to_string())]).await {
        Ok(v) => Ok(v),
        Err(_) => api_get(&url, &api_key, "/api/v3/principals", vec![("pageSize", "200".to_string())]).await,
    }
}

#[tauri::command]
async fn get_project_versions(url: String, api_key: String, project_id: i64) -> Result<Value, String> {
    api_get(&url, &api_key, &format!("/api/v3/projects/{}/versions", project_id), vec![]).await
}

#[tauri::command]
async fn upload_attachment(
    url: String,
    api_key: String,
    work_package_id: i64,
    file_name: String,
    mime_type: String,
    data_base64: String,
) -> Result<(), String> {
    let bytes = B64.decode(&data_base64).map_err(|e| e.to_string())?;
    let client = make_client()?;
    let full_url = format!("{}/api/v3/work_packages/{}/attachments", normalize_url(&url), work_package_id);
    let metadata = serde_json::json!({
        "fileName": file_name,
        "fileSize": bytes.len(),
        "contentType": mime_type,
    });
    let metadata_part = reqwest::multipart::Part::text(metadata.to_string())
        .mime_str("application/json")
        .map_err(|e| e.to_string())?;
    let file_part = reqwest::multipart::Part::bytes(bytes)
        .file_name(file_name)
        .mime_str(&mime_type)
        .map_err(|e| e.to_string())?;
    let form = reqwest::multipart::Form::new()
        .part("metadata", metadata_part)
        .part("file", file_part);
    let resp = client
        .post(&full_url)
        .basic_auth("apikey", Some(&api_key))
        .multipart(form)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let status = resp.status();
    if !status.is_success() {
        let body = resp.text().await.unwrap_or_default();
        return Err(format!("HTTP {}: {}", status, body));
    }
    Ok(())
}

#[tauri::command]
async fn get_work_package_form(url: String, api_key: String, id: i64, lock_version: i64) -> Result<Value, String> {
    let body = serde_json::json!({ "lockVersion": lock_version, "_links": {} });
    api_post(&url, &api_key, &format!("/api/v3/work_packages/{}/form", id), body).await
}

#[tauri::command]
async fn log_time(url: String, api_key: String, data: Value) -> Result<Value, String> {
    api_post(&url, &api_key, "/api/v3/time_entries", data).await
}

#[tauri::command]
async fn get_statuses(url: String, api_key: String) -> Result<Value, String> {
    api_get(&url, &api_key, "/api/v3/statuses", vec![]).await
}

#[tauri::command]
async fn get_projects(url: String, api_key: String) -> Result<Value, String> {
    api_get(&url, &api_key, "/api/v3/projects", vec![("pageSize", "200".to_string())]).await
}

#[tauri::command]
async fn get_types(url: String, api_key: String) -> Result<Value, String> {
    api_get(&url, &api_key, "/api/v3/types", vec![]).await
}

#[tauri::command]
async fn get_priorities(url: String, api_key: String) -> Result<Value, String> {
    api_get(&url, &api_key, "/api/v3/priorities", vec![]).await
}

#[tauri::command]
async fn get_time_entries(url: String, api_key: String, work_package_id: i64) -> Result<Value, String> {
    let filters = format!(
        r#"[{{"workPackage":{{"operator":"=","values":["{}"]}}}}]"#,
        work_package_id
    );
    match api_get(
        &url,
        &api_key,
        "/api/v3/time_entries",
        vec![
            ("filters", filters),
            ("pageSize", "100".to_string()),
            ("sortBy", r#"[["spentOn","desc"]]"#.to_string()),
        ],
    ).await {
        Ok(result) => Ok(result),
        Err(_) => api_get(
            &url,
            &api_key,
            "/api/v3/time_entries",
            vec![
                ("pageSize", "200".to_string()),
                ("sortBy", r#"[["spentOn","desc"]]"#.to_string()),
            ],
        ).await,
    }
}

// ─── Entry point ──────────────────────────────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let tracker: SharedIdleTracker = Arc::new(Mutex::new(IdleTracker::default()));

    tauri::Builder::default()
        .manage(tracker.clone())
        .plugin(tauri_plugin_opener::init())
        .setup(move |app| {
            use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
            use tauri::menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem};

            // ── Background thread: idle detection (unaffected by WKWebView throttle) ──
            let app_handle = app.handle().clone();
            let tracker_thread = tracker.clone();
            thread::spawn(move || {
                loop {
                    thread::sleep(Duration::from_secs(5));

                    let idle_secs = UserIdle::get_time()
                        .map(|t| t.as_seconds())
                        .unwrap_or(0);
                    let now_ms = SystemTime::now()
                        .duration_since(UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_millis() as u64;

                    let mut emit_started = false;
                    let mut emit_ended: Option<IdleEndedPayload> = None;

                    {
                        let mut t = tracker_thread.lock().unwrap();
                        if t.enabled {
                            let threshold = t.threshold_secs;
                            if idle_secs >= threshold && !t.is_idle {
                                t.idle_start_ms = now_ms.saturating_sub(idle_secs * 1000);
                                t.peak_idle_secs = idle_secs;
                                t.is_idle = true;
                                emit_started = true;
                            } else if idle_secs >= threshold {
                                t.peak_idle_secs = idle_secs;
                            } else if idle_secs < threshold && t.is_idle {
                                emit_ended = Some(IdleEndedPayload {
                                    idle_seconds: t.peak_idle_secs,
                                    idle_started_at: t.idle_start_ms,
                                });
                                t.is_idle = false;
                                t.idle_start_ms = 0;
                                t.peak_idle_secs = 0;
                            }
                        }
                    } // lock released before any emit

                    if emit_started {
                        let _ = app_handle.emit("idle-started", ());
                    }
                    if let Some(payload) = emit_ended {
                        // Bring window to front on the main thread, then emit the event.
                        let ah = app_handle.clone();
                        let payload_clone = payload.clone();
                        let _ = app_handle.run_on_main_thread(move || {
                            if let Some(w) = ah.get_webview_window("main") {
                                let _ = w.unminimize();
                                let _ = w.show();
                                let _ = w.set_focus();
                            }
                            #[cfg(target_os = "macos")]
                            unsafe {
                                use objc::{class, msg_send, sel, sel_impl};
                                use objc::runtime::YES;
                                let ns_app: *mut objc::runtime::Object =
                                    msg_send![class!(NSApplication), sharedApplication];
                                let _: () = msg_send![ns_app, activateIgnoringOtherApps: YES];
                            }
                            let _ = ah.emit("idle-ended", payload_clone);
                        });
                    }
                }
            });

            // ── Tray icon ─────────────────────────────────────────────────────────────
            let show_item = MenuItemBuilder::with_id("show", "Show Punchly").build(app)?;
            let sep = PredefinedMenuItem::separator(app)?;
            let quit_item = MenuItemBuilder::with_id("quit", "Quit Punchly").build(app)?;
            let tray_menu = MenuBuilder::new(app)
                .item(&show_item)
                .item(&sep)
                .item(&quit_item)
                .build()?;

            let tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&tray_menu)
                .tooltip("Punchly")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.unminimize();
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(w) = app.get_webview_window("main") {
                            let _ = w.unminimize();
                            let _ = w.show();
                            let _ = w.set_focus();
                        }
                    }
                })
                .build(app)?;

            app.manage(TrayState(Mutex::new(tray)));

            // ── Close → hide (keep alive in tray) ────────────────────────────────────
            if let Some(window) = app.get_webview_window("main") {
                let win = window.clone();
                window.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = win.hide();
                    }
                });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            test_connection,
            get_work_packages,
            get_work_package,
            update_work_package,
            create_work_package,
            log_time,
            get_statuses,
            get_projects,
            get_types,
            get_priorities,
            get_time_entries,
            get_work_package_form,
            get_idle_seconds,
            set_idle_tracking,
            update_tray_title,
            bring_to_front,
            get_project_wp_form,
            get_project_members,
            get_project_assignees,
            get_project_versions,
            upload_attachment,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
