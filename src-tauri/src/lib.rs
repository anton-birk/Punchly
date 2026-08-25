use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use reqwest::Client;
use serde_json::Value;
use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicU64, Ordering};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{Emitter, Manager};

// Timestamp (ms) of last user input event, updated by CGEventTap on macOS.
// Zero = CGEventTap not running (fall back to user_idle polling).
static LAST_EVENT_MS: AtomicU64 = AtomicU64::new(0);

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() as u64
}

// ─── macOS: CGEventTap + Accessibility ───────────────────────────────────────
#[cfg(target_os = "macos")]
mod macos_events {
    use std::os::raw::c_void;
    use std::sync::atomic::Ordering;

    // CGEventTap constants
    const K_CG_SESSION_EVENT_TAP: u32 = 1;
    const K_CG_HEAD_INSERT_EVENT_TAP: u32 = 0;
    const K_CG_EVENT_TAP_OPTION_LISTEN_ONLY: u32 = 1;

    // Listen to all meaningful user-input events
    const EVENT_MASK: u64 =
        (1 << 1)  | // leftMouseDown
        (1 << 2)  | // leftMouseUp
        (1 << 3)  | // rightMouseDown
        (1 << 4)  | // rightMouseUp
        (1 << 5)  | // mouseMoved
        (1 << 6)  | // leftMouseDragged
        (1 << 7)  | // rightMouseDragged
        (1 << 10) | // keyDown
        (1 << 11) | // keyUp
        (1 << 22) | // scrollWheel
        (1 << 25);  // otherMouseDown

    type CGEventTapCallBack = unsafe extern "C" fn(
        proxy: *mut c_void,
        event_type: u32,
        event: *mut c_void,
        user_info: *mut c_void,
    ) -> *mut c_void;

    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGEventTapCreate(
            tap: u32, place: u32, options: u32,
            events: u64, cb: CGEventTapCallBack, user_info: *mut c_void,
        ) -> *mut c_void;
        fn CGEventTapEnable(tap: *mut c_void, enable: bool);
    }

    #[link(name = "CoreFoundation", kind = "framework")]
    extern "C" {
        fn CFMachPortCreateRunLoopSource(
            allocator: *const c_void, port: *mut c_void, order: isize,
        ) -> *mut c_void;
        fn CFRunLoopGetCurrent() -> *mut c_void;
        fn CFRunLoopAddSource(rl: *mut c_void, source: *mut c_void, mode: *const c_void);
        fn CFRunLoopRun();
        fn CFRelease(cf: *mut c_void);
        static kCFRunLoopDefaultMode: *const c_void;
    }

    #[link(name = "ApplicationServices", kind = "framework")]
    extern "C" {
        fn AXIsProcessTrusted() -> bool;
        fn AXIsProcessTrustedWithOptions(options: *const c_void) -> bool;
    }

    pub fn is_accessibility_granted() -> bool {
        unsafe { AXIsProcessTrusted() }
    }

    /// Opens System Settings → Privacy → Accessibility prompt.
    pub fn request_accessibility() {
        unsafe {
            use objc::{class, msg_send, sel, sel_impl};
            use objc::runtime::{Object, YES};
            let key: *mut Object = {
                let s = "AXTrustedCheckOptionPrompt\0";
                let obj: *mut Object = msg_send![class!(NSString), alloc];
                msg_send![obj, initWithUTF8String: s.as_ptr() as *const u8]
            };
            let val: *mut Object = msg_send![class!(NSNumber), numberWithBool: YES];
            let dict: *mut Object = msg_send![
                class!(NSDictionary),
                dictionaryWithObject: val forKey: key
            ];
            AXIsProcessTrustedWithOptions(dict as *const c_void);
        }
    }

    /// CGEventTap callback — fires on every user input event.
    unsafe extern "C" fn on_event(
        _proxy: *mut c_void,
        _etype: u32,
        event: *mut c_void,
        _info: *mut c_void,
    ) -> *mut c_void {
        super::LAST_EVENT_MS.store(super::now_ms(), Ordering::Relaxed);
        event
    }

    /// Starts the event tap on the calling thread (blocks via CFRunLoopRun).
    /// Returns false if Accessibility is not granted.
    pub fn run_event_tap() -> bool {
        unsafe {
            if !AXIsProcessTrusted() { return false; }

            let tap = CGEventTapCreate(
                K_CG_SESSION_EVENT_TAP,
                K_CG_HEAD_INSERT_EVENT_TAP,
                K_CG_EVENT_TAP_OPTION_LISTEN_ONLY,
                EVENT_MASK,
                on_event,
                std::ptr::null_mut(),
            );
            if tap.is_null() { return false; }

            let src = CFMachPortCreateRunLoopSource(std::ptr::null(), tap, 0);
            let rl = CFRunLoopGetCurrent();
            CFRunLoopAddSource(rl, src, kCFRunLoopDefaultMode);
            CGEventTapEnable(tap, true);

            // Seed the timestamp so idle isn't triggered immediately.
            super::LAST_EVENT_MS.store(super::now_ms(), Ordering::Relaxed);

            CFRunLoopRun(); // blocks
            CFRelease(src);
            true
        }
    }
}

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
    use user_idle::UserIdle;
    UserIdle::get_time().map(|t| t.as_seconds()).unwrap_or(0)
}

/// Returns true if CGEventTap (Accessibility) is running and providing real event timestamps.
#[tauri::command]
fn accessibility_granted() -> bool {
    #[cfg(target_os = "macos")]
    { macos_events::is_accessibility_granted() }
    #[cfg(not(target_os = "macos"))]
    { true }
}

/// Opens the macOS Accessibility permission prompt.
#[tauri::command]
fn request_accessibility() {
    #[cfg(target_os = "macos")]
    macos_events::request_accessibility();
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
        .plugin(tauri_plugin_notification::init())
        .setup(move |app| {
            use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
            use tauri::menu::{MenuBuilder, MenuItemBuilder, PredefinedMenuItem};

            // ── Prevent App Nap so the background thread keeps running on locked screen ──
            #[cfg(target_os = "macos")]
            unsafe {
                use objc::{class, msg_send, sel, sel_impl};
                let process_info: *mut objc::runtime::Object =
                    msg_send![class!(NSProcessInfo), processInfo];
                let reason_str = "Punchly idle time tracking\0";
                let ns_reason: *mut objc::runtime::Object = {
                    let s: *mut objc::runtime::Object = msg_send![class!(NSString), alloc];
                    msg_send![s, initWithUTF8String: reason_str.as_ptr() as *const std::ffi::c_char]
                };
                // NSActivityUserInitiatedAllowingIdleSystemSleep = 0x00FFFFFF
                let activity: *mut objc::runtime::Object =
                    msg_send![process_info, beginActivityWithOptions: 0x00FFFFFFu64 reason: ns_reason];
                // Retain to keep the activity alive for the app's lifetime.
                let _: () = msg_send![activity, retain];
            }

            // ── macOS: request Accessibility on first launch if not granted ──
            #[cfg(target_os = "macos")]
            if !macos_events::is_accessibility_granted() {
                macos_events::request_accessibility();
            }

            // ── macOS: CGEventTap thread — retries until Accessibility is granted ──
            #[cfg(target_os = "macos")]
            thread::spawn(|| {
                loop {
                    if macos_events::run_event_tap() {
                        // Tap stopped unexpectedly — restart after a short delay.
                    }
                    thread::sleep(Duration::from_secs(10));
                }
            });

            // ── Background thread: idle detection (unaffected by WKWebView throttle) ──
            let app_handle = app.handle().clone();
            let tracker_thread = tracker.clone();
            thread::spawn(move || {
                loop {
                    thread::sleep(Duration::from_secs(2));

                    // On macOS: prefer CGEventTap timestamps (accurate, event-driven).
                    // Fall back to UserIdle polling when Accessibility is not granted.
                    #[cfg(target_os = "macos")]
                    let idle_secs = {
                        let last = LAST_EVENT_MS.load(Ordering::Relaxed);
                        if last > 0 {
                            now_ms().saturating_sub(last) / 1000
                        } else {
                            use user_idle::UserIdle;
                            UserIdle::get_time().map(|t| t.as_seconds()).unwrap_or(0)
                        }
                    };
                    #[cfg(not(target_os = "macos"))]
                    let idle_secs = {
                        use user_idle::UserIdle;
                        UserIdle::get_time().map(|t| t.as_seconds()).unwrap_or(0)
                    };
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
                        let ah = app_handle.clone();
                        let payload_clone = payload.clone();
                        let _ = app_handle.run_on_main_thread(move || {
                            use tauri_plugin_notification::NotificationExt;

                            // Native notification — works across all Spaces and after unlock.
                            let mins = payload_clone.idle_seconds / 60;
                            let body = if mins >= 1 {
                                format!("You were away for {} min — open Punchly to keep or deduct the time.", mins)
                            } else {
                                "You were briefly away — open Punchly to review idle time.".to_string()
                            };
                            let _ = ah.notification()
                                .builder()
                                .title("Idle time detected")
                                .body(&body)
                                .show();

                            // Try to bring window to front (works when app is in same Space).
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
            accessibility_granted,
            request_accessibility,
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
