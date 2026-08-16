use base64::{engine::general_purpose::STANDARD as B64, Engine as _};
use reqwest::Client;
use serde_json::Value;
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

#[tauri::command]
fn bring_to_front(app: tauri::AppHandle) {
    use tauri::Manager;
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
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
