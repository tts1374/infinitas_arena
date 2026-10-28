//! Private debug-only development bridge. Product commands never use this authority.
use serde_json::{json, Value};
use std::{fs, io::{Read, Write}, path::{Path, PathBuf}, time::Duration};
use tauri::Manager;

const MAX_BODY: u64 = 1_048_576;
// Unconfirmed screenshots stay in process memory, never in the evidence spool.
static PENDING_CAPTURE: std::sync::Mutex<Option<(String, Vec<u8>, std::time::Instant)>> = std::sync::Mutex::new(None);

struct Authority {
    root: PathBuf,
    manifest: Value,
    client: Value,
    token: String,
}

#[derive(serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RestartOptions {
    mode: String,
    host_client_id: String,
    opponent_source: String,
    visible_opponents: u16,
    player_count: u16,
}

impl RestartOptions {
    fn validate(&self) -> Result<(), String> {
        if !["ARENA", "BPL", "BPL4", "CASUAL", "TOURNAMENT"].contains(&self.mode.as_str()) ||
            !["A", "B"].contains(&self.host_client_id.as_str()) ||
            !["inf-notebook", "reflux", "daken_counter_v3"].contains(&self.opponent_source.as_str()) {
            return Err("Unsupported restart option".into());
        }
        if !(2..=20).contains(&self.player_count) || self.visible_opponents == 0 || self.visible_opponents >= self.player_count ||
            self.mode == "ARENA" && self.player_count != 4 ||
            ["BPL", "BPL4"].contains(&self.mode.as_str()) && self.player_count != 2 {
            return Err("Invalid restart participant count".into());
        }
        Ok(())
    }
}

#[derive(serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RestartRequest {
    protocol_version: u8,
    session_id: String,
    options: RestartOptions,
}

fn required<'a>(value: &'a Value, key: &str) -> Result<&'a str, String> {
    value.get(key).and_then(Value::as_str).filter(|s| !s.is_empty()).ok_or_else(|| format!("Missing {key}"))
}

fn read_json(path: &Path) -> Result<Value, String> {
    let file = fs::File::open(path).map_err(|e| e.to_string())?;
    if file.metadata().map_err(|e| e.to_string())?.len() > MAX_BODY { return Err("Body too large".into()); }
    serde_json::from_reader(file).map_err(|e| e.to_string())
}

fn validate_manifest(manifest: &Value, root: &Path) -> Result<(), String> {
    if manifest["protocolVersion"] != 1 || manifest["broker"]["host"] != "127.0.0.1" || !manifest["broker"]["port"].as_u64().is_some_and(|port| (1024..65536).contains(&port)) { return Err("Invalid protocol/broker".into()); }
    let session = required(manifest, "sessionId")?;
    let parts: Vec<_> = session.split('-').collect();
    if parts.len() != 2 || parts[0].len() != 15 || !parts[0].starts_with('s') || !parts[0][1..].chars().all(|c| c.is_ascii_digit()) || parts[1].len() != 8 || !parts[1].chars().all(|c| c.is_ascii_hexdigit()) {
        return Err("Invalid session identifier".into());
    }
    if root.file_name().and_then(|name| name.to_str()) != Some(session) || root.parent().and_then(Path::file_name).and_then(|name| name.to_str()) != Some("dev-control") {
        return Err("Invalid dedicated runtime namespace".into());
    }
    let repo = Path::new(required(manifest, "repoRoot")?).canonicalize().map_err(|e| e.to_string())?;
    if root.ancestors().nth(4) != Some(repo.as_path()) || root != repo.join("testdata/runtime/dev-control").join(session) {
        return Err("Runtime is not in the dedicated repository namespace".into());
    }
    if Path::new(required(manifest, "launcherPath")?).canonicalize().map_err(|e| e.to_string())? != repo.join("scripts/start-dev-control.ps1").canonicalize().map_err(|e| e.to_string())? { return Err("Launcher outside repository".into()); }
    let source_head = required(manifest, "sourceHead")?;
    if source_head.len() != 40 || !source_head.chars().all(|c| c.is_ascii_hexdigit()) { return Err("Invalid source HEAD".into()); }
    let clients = manifest["clients"].as_array().ok_or("Clients required")?;
    let mut ids = std::collections::HashSet::new();
    let mut players = std::collections::HashSet::new();
    let mut controllers = 0;
    let mut selves = 0;
    for client in clients {
        let id = required(client, "clientId")?;
        let role = required(client, "role")?;
        if !ids.insert(id) { return Err("Duplicate client".into()); }
        let expected_identifier = format!("com.infinitas.arena.dev.{session}.{}", id.to_ascii_lowercase());
        if required(client, "identifier")? != expected_identifier { return Err("Dedicated identifier namespace required".into()); }
        match role {
            "controller" if id == "controller" && client["playerId"].is_null() && client["transport"].is_null() && client["fixtureRoot"].is_null() && client["source"].is_null() && client["windowLabel"] == "dev-control" => controllers += 1,
            "self" if id == "A" && client["transport"] == "real-client" && client["fixtureRoot"].is_null() && client["windowLabel"] == "main" => selves += 1,
            "participant" if id.len() == 1 && id >= "B" && id <= "T" && matches!(client["transport"].as_str(), Some("real-client" | "headless")) && client["windowLabel"] == "main" => {},
            _ => return Err("Invalid role/window/transport".into()),
        }
        if role != "controller" && !players.insert(required(client, "playerId")?) { return Err("Duplicate player".into()); }
        if !client["source"].is_null() && !matches!(client["source"].as_str(), Some("inf-notebook" | "reflux" | "daken_counter_v3")) { return Err("Unsupported source".into()); }
        for field in ["storageRoot", "spoolRoot"] {
            let path = Path::new(required(client, field)?).canonicalize().map_err(|e| e.to_string())?;
            if !path.starts_with(root) { return Err("Profile outside session".into()); }
        }
    }
    if controllers != 1 || selves != 1 { return Err("Unique controller/self required".into()); }
    Ok(())
}

fn authority(window: &tauri::WebviewWindow) -> Result<Authority, String> {
    if !cfg!(debug_assertions) { return Err("Development control is unavailable in release builds".into()); }
    let manifest_path = PathBuf::from(std::env::var("INF_ARENA_DEV_CONTROL_MANIFEST").map_err(|_| "Dedicated launch required")?);
    let runtime_root = PathBuf::from(std::env::var("INF_ARENA_DEV_CONTROL_ROOT").map_err(|_| "Runtime root required")?);
    if !manifest_path.is_absolute() || !runtime_root.is_absolute() || manifest_path.file_name().and_then(|s| s.to_str()) != Some("manifest.json") {
        return Err("Invalid manifest path".into());
    }
    let root = runtime_root.canonicalize().map_err(|e| e.to_string())?;
    let canonical_manifest = manifest_path.canonicalize().map_err(|e| e.to_string())?;
    if canonical_manifest.parent() != Some(root.as_path()) { return Err("Manifest outside session".into()); }
    let manifest = read_json(&canonical_manifest)?;
    validate_manifest(&manifest, &root)?;
    if manifest["protocolVersion"] != 1 || Path::new(required(&manifest, "runtimeRoot")?).canonicalize().map_err(|e| e.to_string())? != root {
        return Err("Invalid session manifest".into());
    }
    let session = std::env::var("INF_ARENA_DEV_CONTROL_SESSION").map_err(|_| "Session required")?;
    if required(&manifest, "sessionId")? != session { return Err("Session mismatch".into()); }
    let client_id = std::env::var("INF_ARENA_DEV_CONTROL_CLIENT").map_err(|_| "Client required")?;
    let client = manifest["clients"].as_array().and_then(|clients| clients.iter().find(|client| client["clientId"] == client_id)).cloned().ok_or("Unknown client")?;
    if required(&client, "windowLabel")? != window.label() || required(&client, "identifier")? != window.app_handle().config().identifier {
        return Err("Window/identifier mismatch".into());
    }
    let token = std::env::var("INF_ARENA_DEV_CONTROL_TOKEN").map_err(|_| "Token required")?;
    if token.len() < 32 || manifest["broker"]["host"] != "127.0.0.1" {
        return Err("Invalid development authority".into());
    }
    Ok(Authority { root, manifest, client, token })
}

fn controller(auth: &Authority) -> Result<(), String> {
    if auth.client["role"] == "controller" { Ok(()) } else { Err("Controller role required".into()) }
}

fn confined(root: &Path, path: &Path) -> Result<PathBuf, String> {
    if !path.starts_with(root) { return Err("Path outside session".into()); }
    let mut cursor = path.to_path_buf();
    while cursor != root {
        if let Ok(metadata) = fs::symlink_metadata(&cursor) {
            #[cfg(windows)]
            { use std::os::windows::fs::MetadataExt; if metadata.file_attributes() & 0x400 != 0 { return Err("Reparse point rejected".into()); } }
            if metadata.file_type().is_symlink() { return Err("Link rejected".into()); }
        }
        if !cursor.pop() { return Err("Invalid session path".into()); }
    }
    let ancestor = if path.exists() { path } else { path.parent().ok_or("Missing parent")? };
    if !ancestor.canonicalize().map_err(|e| e.to_string())?.starts_with(root) { return Err("Canonical path escaped session".into()); }
    Ok(path.to_path_buf())
}

fn durable_json(auth: &Authority, path: &Path, value: &Value) -> Result<(), String> {
    durable_json_replace(auth, path, value, |source, target| {
        for attempt in 0..8 {
            match fs::rename(source, target) {
                Err(error) if attempt < 7 && (error.kind() == std::io::ErrorKind::PermissionDenied || matches!(error.raw_os_error(), Some(32 | 33))) => std::thread::sleep(Duration::from_millis(20 * (attempt + 1))),
                result => return result,
            }
        }
        unreachable!()
    })
}

fn durable_json_replace(auth: &Authority, path: &Path, value: &Value, replace: impl FnOnce(&Path, &Path) -> std::io::Result<()>) -> Result<(), String> {
    let destination = confined(&auth.root, path)?;
    let data = serde_json::to_vec(value).map_err(|e| e.to_string())?;
    let nonce = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(|e| e.to_string())?.as_nanos();
    let temporary = destination.with_file_name(format!("{}.{}-{}.tmp", destination.file_name().ok_or("Missing filename")?.to_string_lossy(), std::process::id(), nonce));
    let mut file = fs::OpenOptions::new().write(true).create_new(true).open(&temporary).map_err(|e| e.to_string())?;
    let outcome = (|| -> Result<(), String> {
        file.write_all(&data).and_then(|_| file.sync_all()).map_err(|e| e.to_string())?;
        drop(file);
        if fs::read(&temporary).map_err(|e| e.to_string())? != data { return Err("Evidence read-back mismatch".into()); }
        replace(&temporary, &destination).map_err(|e| e.to_string())?;
        if fs::read(&destination).map_err(|e| e.to_string())? != data { return Err("Evidence read-back mismatch".into()); }
        Ok(())
    })();
    let _ = fs::remove_file(&temporary);
    outcome
}

fn hidden(command: &mut std::process::Command) {
    #[cfg(windows)]
    { use std::os::windows::process::CommandExt; command.creation_flags(0x08000000); }
    #[cfg(not(windows))]
    { let _ = command; }
}

fn offline_state(auth: &Authority) -> Result<Value, String> {
    offline_request(auth, None)
}

fn offline_request(auth: &Authority, request: Option<Value>) -> Result<Value, String> {
    let mut command = std::process::Command::new("node");
    // Windows canonicalize() adds a verbatim prefix that Node realpath rejects.
    // authority() already proved that this original path resolves to auth.root.
    command.arg(Path::new(required(&auth.manifest, "repoRoot")?).join("scripts/dev-control/offline.mjs")).arg(Path::new(required(&auth.manifest, "runtimeRoot")?).join("manifest.json"));
    if request.is_some() { command.arg("--stop").stdin(std::process::Stdio::piped()); }
    command.stdout(std::process::Stdio::piped()).stderr(std::process::Stdio::piped());
    hidden(&mut command);
    let mut child = command.spawn().map_err(|e| e.to_string())?;
    if let Some(request) = request {
        child.stdin.take().ok_or("Offline request pipe unavailable")?.write_all(&serde_json::to_vec(&request).map_err(|e|e.to_string())?).map_err(|e|e.to_string())?;
    }
    let output = child.wait_with_output().map_err(|e| e.to_string())?;
    if !output.status.success() { return Err("Offline runtime verification failed; records remain exportable".into()); }
    if output.stdout.len() as u64 > MAX_BODY { return Err("Offline response too large".into()); }
    serde_json::from_slice(&output.stdout).map_err(|e| e.to_string())
}

fn request_broker(auth: &Authority, route: &str, request: Option<Value>) -> Result<Value, String> {
    let port = auth.manifest["broker"]["port"].as_u64().filter(|p| *p > 0 && *p < 65536).ok_or("Invalid broker port")?;
    let timeout = if route == "collect" { 20 } else { 5 };
    let client = reqwest::blocking::Client::builder().redirect(reqwest::redirect::Policy::none()).timeout(Duration::from_secs(timeout)).build().map_err(|e| e.to_string())?;
    let url = format!("http://127.0.0.1:{port}/{route}");
    let builder = if let Some(body) = request { client.post(url).json(&body) } else { client.get(url) };
    let response = builder.header("Authorization", format!("Bearer {}", auth.token))
        .header("X-Dev-Control-Client", required(&auth.client, "clientId")?).send().map_err(|e| e.to_string())?;
    let status = response.status();
    if response.content_length().is_some_and(|length| length > MAX_BODY) { return Err("Body too large".into()); }
    let mut bytes = Vec::new();
    response.take(MAX_BODY + 1).read_to_end(&mut bytes).map_err(|e| e.to_string())?;
    if bytes.len() as u64 > MAX_BODY { return Err("Body too large".into()); }
    let result: Value = serde_json::from_slice(&bytes).map_err(|e| e.to_string())?;
    if !status.is_success() { return Err(result["error"].as_str().unwrap_or("Broker refused request").to_string()); }
    Ok(result)
}

#[tauri::command]
pub fn dev_control_identity(window: tauri::WebviewWindow) -> Result<Value, String> {
    let auth = authority(&window)?;
    Ok(json!({ "protocolVersion": 1, "sessionId": auth.manifest["sessionId"], "clientId": auth.client["clientId"], "role": auth.client["role"] }))
}

#[tauri::command]
pub fn dev_control_state(window: tauri::WebviewWindow) -> Result<Value, String> {
    let auth = authority(&window)?;
    controller(&auth)?;
    match request_broker(&auth, "state", None) {
        Ok(value) => Ok(value),
        Err(_) => offline_state(&auth),
    }
}

#[tauri::command]
pub fn dev_control_command(window: tauri::WebviewWindow, request: Value) -> Result<Value, String> {
    let auth = authority(&window)?;
    controller(&auth)?;
    if std::env::var("INF_ARENA_DEV_CONTROL_READ_ONLY").as_deref() == Ok("1") { return Err("Reopened records are read-only".into()); }
    let target = required(&request, "targetClientId")?;
    let target = auth.manifest["clients"].as_array().and_then(|clients| clients.iter().find(|client| client["clientId"] == target)).ok_or("Unknown target")?;
    if target["role"] == "self" && !matches!(request["action"].as_str(), Some("client.focus" | "state.refresh")) {
        return Err("Proxy mutation of self is forbidden".into());
    }
    if request["sessionId"] != auth.manifest["sessionId"] || request["actorClientId"] != auth.client["clientId"] {
        return Err("Command identity mismatch".into());
    }
    match request_broker(&auth, "command", Some(request.clone())) {
        Ok(value) => Ok(value),
        Err(_) if request["action"] == "session.stop" => offline_request(&auth, Some(request)),
        Err(error) => Err(error),
    }
}

#[tauri::command]
pub async fn dev_control_capture(window: tauri::WebviewWindow, request: Value) -> Result<Value, String> {
    let auth = authority(&window)?;
    if !matches!(auth.client["role"].as_str(), Some("self" | "participant")) { return Err("Real product window required".into()); }
    if request.as_object().is_none_or(|value| value.keys().any(|key| !["kind", "captureId", "context", "deadlineAt"].contains(&key.as_str()))) || request["kind"] != "evidence-capture" || request["context"]["sessionId"] != auth.manifest["sessionId"] || request["context"]["targetClientId"] != auth.client["clientId"] { return Err("Invalid capture identity".into()); }
    let id = required(&request, "captureId")?;
    if id.len() != 36 || !id.chars().all(|c| c.is_ascii_hexdigit() || c == '-') { return Err("Invalid capture id".into()); }
    *PENDING_CAPTURE.lock().map_err(|_|"Capture lock unavailable")?=None;
    let pid = std::process::id();
    let owner = auth.manifest["ownedProcesses"].as_array().and_then(|items| items.iter().find(|item| item["pid"].as_u64() == Some(pid as u64) && item["clientId"] == auth.client["clientId"])).ok_or("Window process has no immutable owner")?;
    if Path::new(required(owner, "executablePath")?).canonicalize().map_err(|e| e.to_string())? != std::env::current_exe().map_err(|e| e.to_string())?.canonicalize().map_err(|e| e.to_string())? { return Err("Window process path mismatch".into()); }
    let mut command = std::process::Command::new("powershell.exe");
    command.args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-File"]).arg(Path::new(required(&auth.manifest, "repoRoot")?).join("scripts/dev-control/window.ps1"))
        .args(["-Action", "Capture", "-MemoryCapture", "-ExpectedPid"]).arg(pid.to_string()).arg("-CreatedAt").arg(required(owner, "createdAt")?).arg("-ExecutablePath").arg(required(owner, "executablePath")?);
    #[cfg(windows)]
    command.arg("-WindowHandle").arg((window.hwnd().map_err(|e| e.to_string())?.0 as isize).to_string());
    hidden(&mut command);
    // PrintWindow needs the webview's UI thread. Never wait for it on that thread.
    let output = tauri::async_runtime::spawn_blocking(move || -> Result<_, String> {
        command.stdout(std::process::Stdio::piped()).stderr(std::process::Stdio::piped());
        let mut child = command.spawn().map_err(|e| e.to_string())?;
        let stdout = child.stdout.take().ok_or("Capture pipe unavailable")?;
        let stderr = child.stderr.take().ok_or("Capture diagnostic pipe unavailable")?;
        let read_image = std::thread::spawn(move || { let mut bytes=Vec::new(); stdout.take(16*1024*1024+1).read_to_end(&mut bytes).map(|_|bytes) });
        let read_errors = std::thread::spawn(move || { let mut bytes=Vec::new(); stderr.take(65536).read_to_end(&mut bytes).map(|_|bytes) });
        let started = std::time::Instant::now();
        while child.try_wait().map_err(|e| e.to_string())?.is_none() {
            if started.elapsed() > Duration::from_secs(10) {
                let _ = child.kill(); let _ = child.wait();
                let _ = read_image.join(); let _ = read_errors.join();
                return Err("Native capture timed out".into());
            }
            std::thread::sleep(Duration::from_millis(50));
        }
        let status=child.wait().map_err(|e|e.to_string())?;
        let bytes=read_image.join().map_err(|_|"Capture reader failed")?.map_err(|e|e.to_string())?;
        let _ = read_errors.join();
        Ok((status,bytes))
    }).await.map_err(|e|e.to_string())??;
    if !output.0.success() { return Ok(json!({"captureId":id,"clientId":auth.client["clientId"],"status":"missing","relativePath":null,"error":"実窓のnative画像を取得できませんでした。"})); }
    let bytes = output.1;
    if bytes.len() < 32 || bytes.len() > 16 * 1024 * 1024 || !bytes.starts_with(&[137,80,78,71,13,10,26,10]) { return Err("Invalid image bytes".into()); }
    *PENDING_CAPTURE.lock().map_err(|_|"Capture lock unavailable")?=Some((id.to_owned(),bytes,std::time::Instant::now()));
    Ok(json!({"captureId":id,"clientId":auth.client["clientId"],"status":"pending","relativePath":null,"error":null}))
}

#[tauri::command]
pub fn dev_control_commit_capture(window: tauri::WebviewWindow, request: Value) -> Result<Value, String> {
    let auth=authority(&window)?;
    commit_capture(&auth,request)
}

fn commit_capture(auth: &Authority, request: Value) -> Result<Value, String> {
    if !matches!(auth.client["role"].as_str(),Some("self"|"participant")) || request.as_object().is_none_or(|value|value.len()!=2||value.keys().any(|key| !["captureId","accept"].contains(&key.as_str()))) { return Err("Invalid capture decision".into()); }
    let id=required(&request,"captureId")?;
    let accept=request["accept"].as_bool().ok_or("Capture decision required")?;
    let mut pending=PENDING_CAPTURE.lock().map_err(|_|"Capture lock unavailable")?;
    if pending.as_ref().is_none_or(|(saved_id,_,_)|saved_id!=id) { return Err("No matching in-memory capture".into()); }
    let (_,bytes,at)=pending.take().ok_or("Capture unavailable")?;
    if !accept || at.elapsed()>Duration::from_secs(20) { return Ok(json!({"captureId":id,"clientId":auth.client["clientId"],"status":"missing","relativePath":null,"error":"画像取得中に画面が変化したため、機密保全のため画像を保存しませんでした。"})); }
    let directory=Path::new(required(&auth.client,"spoolRoot")?).canonicalize().map_err(|e|e.to_string())?.join("captures");
    confined(&auth.root,&directory)?; fs::create_dir_all(&directory).map_err(|e|e.to_string())?;
    let destination=confined(&auth.root,&directory.join(format!("{id}.png")))?;
    let mut file=fs::OpenOptions::new().write(true).create_new(true).open(&destination).map_err(|e|e.to_string())?;
    file.write_all(&bytes).and_then(|_|file.sync_all()).map_err(|e|e.to_string())?;
    if fs::read(&destination).map_err(|e|e.to_string())?!=bytes { return Err("Image read-back mismatch".into()); }
    Ok(json!({"captureId":id,"clientId":auth.client["clientId"],"status":"saved","relativePath":format!("clients/{}/spool/captures/{id}.png",required(&auth.client,"clientId")?),"error":null}))
}

#[tauri::command]
pub fn dev_control_poll(window: tauri::WebviewWindow) -> Result<Value, String> {
    let auth = authority(&window)?;
    if !matches!(auth.client["role"].as_str(), Some("participant" | "self")) || auth.client["transport"] != "real-client" { return Err("Product adapter required".into()); }
    request_broker(&auth, "poll", None)
}

#[tauri::command]
pub fn dev_control_focus(window: tauri::WebviewWindow, request: Value) -> Result<Value, String> {
    let auth = authority(&window)?;
    if !matches!(auth.client["role"].as_str(), Some("self" | "participant")) || request["protocolVersion"] != 1 || request["action"] != "client.focus" || request["sessionId"] != auth.manifest["sessionId"] || request["targetClientId"] != auth.client["clientId"] || request["actorClientId"] != "controller" { return Err("Own product window focus required".into()); }
    let operation_id = required(&request,"operationId")?;
    if operation_id.len() > 128 { return Err("Invalid focus operation".into()); }
    window.unminimize().map_err(|e|e.to_string())?;
    window.show().map_err(|e|e.to_string())?;
    window.set_focus().map_err(|e|e.to_string())?;
    if !window.is_focused().map_err(|e|e.to_string())? || !window.is_visible().map_err(|e|e.to_string())? { return Err("Native focus was not confirmed".into()); }
    Ok(json!({"protocolVersion":1,"operationId":operation_id,"sessionId":auth.manifest["sessionId"],"clientId":auth.client["clientId"],"focused":true}))
}

#[tauri::command]
pub fn dev_control_adapter_state(window: tauri::WebviewWindow) -> Result<Value, String> {
    let auth = authority(&window)?;
    if auth.client["role"] == "controller" { return Err("Product client required".into()); }
    request_broker(&auth, "adapter-state", None)
}

#[tauri::command]
pub fn dev_control_report(window: tauri::WebviewWindow, request: Value) -> Result<Value, String> {
    let auth = authority(&window)?;
    if auth.client["role"] == "controller" { return Err("Controller has no product observations".into()); }
    request_broker(&auth, "report", Some(request))
}

#[tauri::command]
pub fn dev_control_finish(window: tauri::WebviewWindow, request: Value) -> Result<Value, String> {
    let auth = authority(&window)?;
    if !matches!(auth.client["role"].as_str(), Some("participant" | "self")) || auth.client["transport"] != "real-client" { return Err("Product adapter required".into()); }
    request_broker(&auth, "finish", Some(request))
}

/// Offline exporter has no arbitrary URL or path input and works after broker shutdown.
#[tauri::command]
pub fn dev_control_export(window: tauri::WebviewWindow) -> Result<Value, String> {
    let auth = authority(&window)?;
    controller(&auth)?;
    export_for_authority(&auth)
}

fn export_for_authority(auth: &Authority) -> Result<Value, String> {
    match export_evidence(auth) {
        Ok(save) => Ok(save),
        Err(error) => {
            let state_path = auth.root.join("controller-spool/state.json");
            let mut state = read_json(&state_path)?;
            let save = json!({"status":"failed","path":null,"bundleId":null,"attempt":state["save"]["attempt"].as_u64().unwrap_or(0)+1,"error":error,"missing":state["save"]["missing"]});
            state["save"] = save.clone();
            let _ = durable_json(auth,&state_path,&state);
            if state["lifecycle"] == "running" { let _ = request_broker(auth,"export-result",Some(save.clone())); }
            Ok(save)
        }
    }
}

fn export_evidence(auth: &Authority) -> Result<Value, String> {
    // Online collection is bounded. Loss of broker never prevents exporting the retained spool.
    let collection_error = request_broker(&auth, "collect", Some(json!({}))).err();
    let spool = confined(&auth.root, &auth.root.join("controller-spool"))?.canonicalize().map_err(|e| e.to_string())?;
    if !spool.starts_with(&auth.root) { return Err("Spool outside session".into()); }
    let exports_root = confined(&auth.root, &auth.root.join("exports"))?;
    fs::create_dir_all(&exports_root).map_err(|e| e.to_string())?;
    let nonce = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(|e| e.to_string())?.as_nanos();
    let bundle_id = format!("bundle-{nonce}");
    let exports = confined(&auth.root, &exports_root.join(&bundle_id))?;
    fs::create_dir(&exports).map_err(|e| e.to_string())?;
    if !exports.starts_with(&auth.root) { return Err("Export outside session".into()); }
    let state_path = spool.join("state.json");
    let mut state = read_json(&state_path)?;
    let mut missing: Vec<String> = state["save"]["missing"].as_array().map(|items| items.iter().filter_map(Value::as_str).map(str::to_owned).collect()).unwrap_or_default();
    if collection_error.is_some() && !["stopped", "failed"].contains(&state["lifecycle"].as_str().unwrap_or("")) { missing.push("最新の実窓画像・観測を収集できません。保存済みspoolを使用しました。".into()); }
    let mut files = Vec::<Value>::new();
    let mut write_bundle = || -> Result<(), String> {
    for name in ["state.json", "operations.jsonl", "observations.jsonl", "inputs.jsonl", "manifest.json", "shutdown.json"] {
        let source = spool.join(name);
        if name == "shutdown.json" && state["stop"]["phase"] == "idle" { continue; }
        if !source.exists() { missing.push(name.to_string()); continue; }
        let source = confined(&auth.root, &source)?.canonicalize().map_err(|e| e.to_string())?;
        if !source.starts_with(&spool) { return Err("Spool escape".into()); }
        let data = fs::read(&source).map_err(|e| e.to_string())?;
        let destination = confined(&auth.root, &exports.join(name))?;
        if destination.symlink_metadata().is_ok_and(|metadata| metadata.file_type().is_symlink()) { return Err("Export link rejected".into()); }
        let mut file = fs::File::create(&destination).map_err(|e| e.to_string())?;
        file.write_all(&data).and_then(|_| file.sync_all()).map_err(|e| e.to_string())?;
        if fs::read(&destination).map_err(|e| e.to_string())? != data { return Err("Export read-back mismatch".into()); }
        files.push(json!({"path":name,"bytes":data.len(),"readBack":true}));
    }
    // Launcher logs have already crossed the central redaction/projection boundary.
    // Only regular session-local diagnostic files are eligible; never collect source/config.
    let logs = confined(&auth.root, &auth.root.join("logs"))?;
    fs::create_dir(exports.join("logs")).map_err(|e| e.to_string())?;
    for entry in fs::read_dir(&logs).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let name = entry.file_name().to_string_lossy().to_string();
        if !name.ends_with(".log") || !name.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '.')) { continue; }
        let source = confined(&auth.root, &entry.path())?;
        let metadata = fs::metadata(&source).map_err(|e| e.to_string())?;
        if !metadata.is_file() || metadata.len() > MAX_BODY { missing.push(format!("logs/{name}: unavailable or too large")); continue; }
        let data = fs::read(&source).map_err(|e| e.to_string())?;
        let destination = exports.join("logs").join(&name);
        let mut file = fs::OpenOptions::new().write(true).create_new(true).open(&destination).map_err(|e| e.to_string())?;
        file.write_all(&data).and_then(|_|file.sync_all()).map_err(|e|e.to_string())?;
        if fs::read(&destination).map_err(|e|e.to_string())?!=data { return Err("Log export read-back mismatch".into()); }
        files.push(json!({"path":format!("logs/{name}"),"bytes":data.len(),"readBack":true}));
    }
    for capture in state["evidence"]["captures"].as_array().into_iter().flatten() {
        if capture["status"] != "saved" { continue; }
        let id = required(capture,"captureId")?;
        let client_id = required(capture,"clientId")?;
        if id.len()!=36 || !id.chars().all(|c|c.is_ascii_hexdigit()||c=='-') || !matches!(client_id.as_bytes(), [b'A'..=b'T']) { return Err("Invalid image identity".into()); }
        let relative = format!("clients/{client_id}/spool/captures/{id}.png");
        let source = confined(&auth.root, &auth.root.join(&relative))?;
        if !source.exists() { missing.push(format!("{client_id}: image missing")); continue; }
        let data = fs::read(&source).map_err(|e| e.to_string())?;
        let destination = confined(&auth.root,&exports.join(format!("{client_id}-{id}.png")))?;
        let mut file = fs::OpenOptions::new().write(true).create_new(true).open(&destination).map_err(|e| e.to_string())?;
        file.write_all(&data).and_then(|_|file.sync_all()).map_err(|e|e.to_string())?;
        if fs::read(&destination).map_err(|e|e.to_string())?!=data { return Err("Image export read-back mismatch".into()); }
        files.push(json!({"path":destination.file_name().unwrap().to_string_lossy(),"bytes":data.len(),"readBack":true}));
    }
    durable_json(&auth,&exports.join("bundle.json"),&json!({"protocolVersion":1,"sessionId":auth.manifest["sessionId"],"bundleId":bundle_id,"files":files,"missing":missing}))?;
    Ok(())
    };
    let outcome = write_bundle();
    let export_path = exports.to_string_lossy();
    let display_path = export_path.strip_prefix(r"\\?\").unwrap_or(&export_path);
    let save = json!({"status":if outcome.is_err(){"failed"}else if missing.is_empty(){"saved"}else{"partial"},"path":display_path,"bundleId":bundle_id,"attempt":state["save"]["attempt"].as_u64().unwrap_or(0)+1,"error":outcome.err(),"missing":missing});
    state["save"] = save.clone();
    durable_json(&auth,&state_path,&state)?;
    if state["lifecycle"] == "running" { request_broker(&auth,"export-result",Some(save.clone()))?; }
    Ok(save)
}

#[tauri::command]
pub fn dev_control_restart(window: tauri::WebviewWindow, request: RestartRequest) -> Result<Value, String> {
    let auth = authority(&window)?;
    controller(&auth)?;
    if request.protocol_version != 1 || request.session_id != required(&auth.manifest, "sessionId")? { return Err("Restart identity mismatch".into()); }
    request.options.validate()?;
    let state = offline_state(&auth)?;
    if state["lifecycle"] != "stopped" || state["stop"]["phase"] != "complete" || state["stop"]["processesVerified"] != true || state["stop"]["portsVerified"] != true { return Err("Verified runtime shutdown is required before restart".into()); }
    let launcher = PathBuf::from(required(&auth.manifest, "launcherPath")?).canonicalize().map_err(|e| e.to_string())?;
    if launcher.file_name().and_then(|s| s.to_str()) != Some("start-dev-control.ps1") { return Err("Invalid launcher".into()); }
    // An exclusive file in the validated session carries only the closed options DTO.
    // No user-controlled argument, URL, source path or environment field reaches the shell.
    let nonce = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(|e| e.to_string())?.as_nanos();
    let options_path = confined(&auth.root,&auth.root.join(format!("restart-options-{nonce}.json")))?;
    let mut options_file = fs::OpenOptions::new().write(true).create_new(true).open(&options_path).map_err(|e| e.to_string())?;
    options_file.write_all(&serde_json::to_vec(&request).map_err(|e| e.to_string())?).and_then(|_| options_file.sync_all()).map_err(|e| e.to_string())?;
    let mut command = std::process::Command::new("powershell.exe");
    let original_root = Path::new(required(&auth.manifest, "runtimeRoot")?);
    command.args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-File"]).arg(required(&auth.manifest, "launcherPath")?).arg("-RestartFrom").arg(original_root.join("manifest.json")).arg("-RestartOptionsFrom").arg(original_root.join(options_path.file_name().ok_or("Missing options filename")?));
    // The old evidence window is read-only; the new session has fresh authority.
    command.env_remove("INF_ARENA_DEV_CONTROL_READ_ONLY");
    #[cfg(windows)]
    { use std::os::windows::process::CommandExt; command.creation_flags(0x08000000); }
    command.spawn().map_err(|e| e.to_string())?;
    Ok(json!({"status":"launch-requested","requestId":format!("restart-{nonce}"),"oldSessionId":auth.manifest["sessionId"]}))
}

#[cfg(test)]
mod tests {
    use super::*;
    fn export_fixture() -> Authority {
        let nonce = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos();
        let root = std::env::temp_dir().join(format!("dev-control-export-{nonce}"));
        fs::create_dir_all(root.join("controller-spool")).unwrap();
        let root = root.canonicalize().unwrap();
        let auth = Authority { root: root.clone(), manifest: json!({"sessionId":"native-test","broker":{"port":1}}), client: json!({"clientId":"controller","role":"controller"}), token: "c".repeat(64) };
        fs::create_dir(root.join("logs")).unwrap();
        durable_json(&auth,&root.join("logs/worker-runtime.log"),&json!({"diagnostic":"safe projected output"})).unwrap();
        durable_json(&auth,&root.join("controller-spool/state.json"),&json!({"sessionId":"native-test","lifecycle":"stopped","save":{"status":"idle","missing":[],"attempt":0},"evidence":{"captures":[]}})).unwrap();
        for name in ["operations.jsonl","observations.jsonl","inputs.jsonl","manifest.json","shutdown.json"] { durable_json(&auth,&root.join("controller-spool").join(name),&json!({"requestId":"keep-request","operationId":"keep-operation"})).unwrap(); }
        auth
    }
    #[test]
    fn captures_stay_in_memory_until_safe_confirmation_and_reject_replay_or_expiry() {
        let mut auth=export_fixture();
        let spool=auth.root.join("clients/A/spool"); fs::create_dir_all(&spool).unwrap();
        auth.client=json!({"clientId":"A","role":"self","spoolRoot":spool});
        let id="12345678-1234-1234-1234-123456789abc";
        let bytes=vec![5;64];
        *PENDING_CAPTURE.lock().unwrap()=Some((id.into(),bytes.clone(),std::time::Instant::now()));
        assert!(commit_capture(&auth,json!({"captureId":"foreign","accept":true})).is_err());
        assert_eq!(commit_capture(&auth,json!({"captureId":id,"accept":false})).unwrap()["status"],"missing");
        assert!(!spool.join("captures").exists());
        *PENDING_CAPTURE.lock().unwrap()=Some((id.into(),bytes.clone(),std::time::Instant::now()-Duration::from_secs(30)));
        assert_eq!(commit_capture(&auth,json!({"captureId":id,"accept":true})).unwrap()["status"],"missing");
        assert!(!spool.join("captures").exists());
        *PENDING_CAPTURE.lock().unwrap()=Some((id.into(),bytes.clone(),std::time::Instant::now()));
        assert_eq!(commit_capture(&auth,json!({"captureId":id,"accept":true})).unwrap()["status"],"saved");
        assert_eq!(fs::read(spool.join("captures").join(format!("{id}.png"))).unwrap(),bytes);
        assert!(commit_capture(&auth,json!({"captureId":id,"accept":true})).is_err());
    }
    #[test]
    fn offline_export_flushes_readbacks_and_retry_preserves_previous_bundle() {
        let auth = export_fixture();
        let first = export_for_authority(&auth).unwrap();
        assert_eq!(first["status"],"saved");
        let first_path = Path::new(first["path"].as_str().unwrap());
        let original = fs::read(first_path.join("bundle.json")).unwrap();
        let second = export_for_authority(&auth).unwrap();
        assert_eq!(second["status"],"saved");
        assert_ne!(first["bundleId"],second["bundleId"]);
        assert_eq!(fs::read(first_path.join("bundle.json")).unwrap(),original);
        assert!(read_json(&first_path.join("bundle.json")).unwrap()["files"].as_array().unwrap().iter().all(|file|file["readBack"]==true));
        assert_eq!(read_json(&first_path.join("logs/worker-runtime.log")).unwrap()["diagnostic"],"safe projected output");
    }
    #[test]
    fn interrupted_state_replace_retains_valid_original_and_retry_succeeds() {
        let auth = export_fixture();
        let path = auth.root.join("controller-spool/state.json");
        let before = fs::read(&path).unwrap();
        let failed = durable_json_replace(&auth,&path,&json!({"revision":2}),|_,_| Err(std::io::Error::other("injected replacement failure")));
        assert!(failed.unwrap_err().contains("injected replacement failure"));
        assert_eq!(fs::read(&path).unwrap(),before);
        durable_json(&auth,&path,&json!({"revision":2})).unwrap();
        assert_eq!(read_json(&path).unwrap()["revision"],2);
    }
    #[test]
    fn export_write_failure_keeps_spool_and_can_retry_without_runtime() {
        let auth = export_fixture();
        fs::write(auth.root.join("exports"),"blocking file").unwrap();
        let failed = export_for_authority(&auth).unwrap();
        assert_eq!(failed["status"],"failed");
        assert!(auth.root.join("controller-spool/observations.jsonl").exists());
        fs::remove_file(auth.root.join("exports")).unwrap();
        let retry = export_for_authority(&auth).unwrap();
        assert_eq!(retry["status"],"saved");
        assert!(retry["attempt"].as_u64().unwrap()>failed["attempt"].as_u64().unwrap());
    }
    #[test]
    fn missing_images_are_partial_and_failed_copy_does_not_claim_saved() {
        let auth = export_fixture();
        let path = auth.root.join("controller-spool/state.json");
        let mut state = read_json(&path).unwrap();
        state["save"]["missing"] = json!(["B: 実画像がありません。"]);
        durable_json(&auth,&path,&state).unwrap();
        assert_eq!(export_for_authority(&auth).unwrap()["status"],"partial");
        fs::remove_file(auth.root.join("controller-spool/inputs.jsonl")).unwrap();
        fs::create_dir(auth.root.join("controller-spool/inputs.jsonl")).unwrap();
        assert_eq!(export_for_authority(&auth).unwrap()["status"],"failed");
        assert!(confined(&auth.root,&auth.root.join("../escape.json")).is_err());
    }
    #[test]
    fn required_rejects_missing_and_non_strings() {
        assert!(required(&json!({}), "sessionId").is_err());
        assert!(required(&json!({"sessionId":1}), "sessionId").is_err());
        assert_eq!(required(&json!({"sessionId":"test"}), "sessionId").unwrap(), "test");
    }
    #[test]
    fn restart_options_are_closed_and_never_accept_paths_urls_or_cli_arguments() {
        let base = json!({"protocolVersion":1,"sessionId":"session","options":{"mode":"ARENA","hostClientId":"B","opponentSource":"reflux","visibleOpponents":1,"playerCount":4}});
        let parsed: RestartRequest = serde_json::from_value(base.clone()).unwrap();
        assert!(parsed.options.validate().is_ok());
        for (field, value) in [("selfDirectory", json!("C:/private")), ("apiBaseUrl", json!("https://example.com")), ("extraArgs", json!(["-Command", "exit"]))] {
            let mut changed = base.clone(); changed["options"][field] = value;
            assert!(serde_json::from_value::<RestartRequest>(changed).is_err());
        }
        for (field, value) in [("mode", json!("-Command")), ("hostClientId", json!("C")), ("opponentSource", json!("inf_daken_counter")), ("visibleOpponents", json!(0)), ("playerCount", json!(20))] {
            let mut changed = base.clone(); changed["options"][field] = value;
            assert!(serde_json::from_value::<RestartRequest>(changed).unwrap().options.validate().is_err());
        }
        let mut changed = base; changed["options"]["visibleOpponents"] = json!(-1);
        assert!(serde_json::from_value::<RestartRequest>(changed).is_err());
    }
    #[test]
    fn ordinary_debug_identifier_cannot_claim_controller_role() {
        let repo = Path::new(env!("CARGO_MANIFEST_DIR")).ancestors().nth(3).unwrap().canonicalize().unwrap();
        let unique = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().subsec_nanos();
        let session = format!("s20261024010000-{unique:08x}");
        let root = repo.join("testdata/runtime/dev-control").join(&session);
        let controller = root.join("controller");
        let self_root = root.join("A");
        fs::create_dir_all(&controller).unwrap();
        fs::create_dir_all(&self_root).unwrap();
        let root = root.canonicalize().unwrap();
        let mut manifest = json!({"protocolVersion":1,"sessionId":session,"repoRoot":repo,"sourceHead":"0".repeat(40),"broker":{"host":"127.0.0.1","port":19001},"launcherPath":repo.join("scripts/start-dev-control.ps1"),"clients":[
            {"clientId":"controller","identifier":format!("com.infinitas.arena.dev.{session}.controller"),"role":"controller","windowLabel":"dev-control","transport":null,"playerId":null,"source":null,"fixtureRoot":null,"storageRoot":controller,"spoolRoot":controller},
            {"clientId":"A","identifier":format!("com.infinitas.arena.dev.{session}.a"),"role":"self","windowLabel":"main","transport":"real-client","playerId":"a","source":"daken_counter_v3","fixtureRoot":null,"storageRoot":self_root,"spoolRoot":self_root}
        ]});
        assert!(validate_manifest(&manifest, &root).is_ok());
        manifest["clients"][0]["identifier"] = json!("com.infinitas.arena.client");
        assert!(validate_manifest(&manifest, &root).is_err());
        manifest["clients"][0]["identifier"] = json!(format!("com.infinitas.arena.dev.{session}.controller"));
        manifest["clients"][0]["windowLabel"] = json!("main");
        assert!(validate_manifest(&manifest, &root).is_err());
    }
}
