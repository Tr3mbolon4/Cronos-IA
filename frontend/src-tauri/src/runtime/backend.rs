use super::directories::RuntimeDirectories;
use super::health::wait_for_health;
use super::process::reserve_local_port;
use super::security::{runtime_token, session_id};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::{Path, PathBuf};
use std::process::Command as SystemCommand;
use std::sync::mpsc;
use std::sync::{Condvar, Mutex};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

#[derive(Clone, Serialize)]
pub struct RuntimeConnection {
    pub base_url: String,
    pub state: String,
    pub version: String,
    pub session_id: String,
    pub backend_pid: Option<u32>,
    pub runtime_token: String,
    pub build_id: String,
    pub git_commit: String,
    pub protocol_version: String,
}

#[derive(Clone, Serialize)]
pub struct RuntimeStatus {
    pub state: String,
    pub base_url: Option<String>,
    pub session_id: Option<String>,
    pub logs_dir: String,
}

struct BackendState {
    connection: Option<RuntimeConnection>,
    child: Option<CommandChild>,
    logs_dir: String,
    runtime_dir: String,
    startup_error: Option<String>,
}

#[derive(Clone, Deserialize)]
struct BuildIdentity {
    #[serde(default)]
    version: String,
    #[serde(rename = "gitCommit", default)]
    git_commit: String,
    #[serde(rename = "buildId", default)]
    build_id: String,
    #[serde(rename = "protocolVersion", default = "default_protocol_version")]
    protocol_version: String,
}

pub struct BackendRuntime {
    state: Mutex<BackendState>,
    ready: Condvar,
}

impl BackendRuntime {
    pub fn new() -> Self {
        Self {
            state: Mutex::new(BackendState {
                connection: None,
                child: None,
                logs_dir: String::new(),
                runtime_dir: String::new(),
                startup_error: None,
            }),
            ready: Condvar::new(),
        }
    }

    pub fn start(&self, app: AppHandle) -> Result<(), String> {
        self.shutdown();
        let directories = RuntimeDirectories::prepare()?;
        let desktop_log = directories.logs.join("desktop.log");
        append_desktop_log(
            &desktop_log,
            "INFO",
            "desktop",
            "STARTUP-001",
            "Starting Cronos Desktop runtime",
        );
        let token = runtime_token()?;
        let session = session_id()?;
        let port = reserve_local_port()?;
        let base_url = format!("http://127.0.0.1:{port}");
        let resource_dir = resolve_resource_dir(&app)?;
        let build_identity = read_build_identity(&resource_dir)?;
        append_desktop_log(
            &desktop_log,
            "INFO",
            "sidecar",
            "STARTUP-010",
            &format!(
                "Starting backend sidecar base_url={} data_dir={} logs_dir={} resource_dir={}",
                base_url,
                directories.root.to_string_lossy(),
                directories.logs.to_string_lossy(),
                resource_dir.to_string_lossy()
            ),
        );
        let (ready_tx, ready_rx) = mpsc::channel::<RuntimeConnection>();

        let mut command = app.shell().sidecar("cronos-backend").map_err(|error| {
            let message = error.to_string();
            append_desktop_log(&desktop_log, "ERROR", "sidecar", "STARTUP-011", &message);
            self.set_startup_error(message.clone());
            message
        })?;
        command = command
            .arg("--host")
            .arg("127.0.0.1")
            .arg("--port")
            .arg(port.to_string())
            .arg("--data-dir")
            .arg(directories.root.to_string_lossy().to_string())
            .arg("--log-dir")
            .arg(directories.logs.to_string_lossy().to_string())
            .arg("--runtime-token")
            .arg(token.clone())
            .arg("--session-id")
            .arg(session.clone())
            .arg("--parent-pid")
            .arg(std::process::id().to_string())
            .arg("--environment")
            .arg("desktop")
            .arg("--resource-dir")
            .arg(resource_dir.to_string_lossy().to_string())
            .arg("--build-id")
            .arg(build_identity.build_id.clone())
            .arg("--git-commit")
            .arg(build_identity.git_commit.clone())
            .arg("--protocol-version")
            .arg(build_identity.protocol_version.clone());

        let (mut rx, child) = command.spawn().map_err(|error| {
            let message = error.to_string();
            append_desktop_log(&desktop_log, "ERROR", "sidecar", "STARTUP-012", &message);
            self.set_startup_error(message.clone());
            message
        })?;
        let logs_dir = directories.logs.to_string_lossy().to_string();
        let backend_log = directories.logs.join("cronos-backend.log");
        let runtime_dir = directories.runtime.clone();
        let ready_token = token.clone();
        let ready_base = base_url.clone();
        let ready_session = session.clone();
        let ready_build_identity = build_identity.clone();

        tauri::async_runtime::spawn(async move {
            while let Some(event) = rx.recv().await {
                match event {
                    CommandEvent::Stdout(bytes) => {
                        let text = String::from_utf8_lossy(&bytes);
                        append_log(&backend_log, &text);
                        for line in text.lines() {
                            if let Ok(value) = serde_json::from_str::<Value>(line) {
                                if value.get("event").and_then(Value::as_str)
                                    == Some("cronos_backend_ready")
                                {
                                    let version = value
                                        .get("version")
                                        .and_then(Value::as_str)
                                        .unwrap_or("0.3.0")
                                        .to_string();
                                    let build_id = value
                                        .get("build_id")
                                        .and_then(Value::as_str)
                                        .unwrap_or("")
                                        .to_string();
                                    let git_commit = value
                                        .get("git_commit")
                                        .and_then(Value::as_str)
                                        .unwrap_or("")
                                        .to_string();
                                    let protocol_version = value
                                        .get("protocol_version")
                                        .and_then(Value::as_str)
                                        .unwrap_or("")
                                        .to_string();
                                    if !ready_build_identity.matches_event(
                                        &version,
                                        &build_id,
                                        &git_commit,
                                        &protocol_version,
                                    ) {
                                        append_log(
                                            &backend_log,
                                            &format!(
                                                "BACKEND_VERSION_MISMATCH ready_event version={} build_id={} git_commit={} protocol_version={} expected_build_id={} expected_git_commit={} expected_protocol_version={}\n",
                                                version,
                                                build_id,
                                                git_commit,
                                                protocol_version,
                                                ready_build_identity.build_id,
                                                ready_build_identity.git_commit,
                                                ready_build_identity.protocol_version
                                            ),
                                        );
                                        continue;
                                    }
                                    let backend_pid = value
                                        .get("pid")
                                        .and_then(Value::as_u64)
                                        .and_then(|pid| u32::try_from(pid).ok());
                                    let _ = ready_tx.send(RuntimeConnection {
                                        base_url: ready_base.clone(),
                                        state: "ready".to_string(),
                                        version,
                                        session_id: ready_session.clone(),
                                        backend_pid,
                                        runtime_token: ready_token.clone(),
                                        build_id,
                                        git_commit,
                                        protocol_version,
                                    });
                                }
                            }
                        }
                    }
                    CommandEvent::Stderr(bytes) => {
                        append_log(&backend_log, &String::from_utf8_lossy(&bytes));
                    }
                    CommandEvent::Terminated(payload) => {
                        append_log(&backend_log, &format!("terminated: {:?}\n", payload));
                        break;
                    }
                    _ => {}
                }
            }
        });

        {
            let mut state = self.state.lock().map_err(|_| "runtime lock poisoned")?;
            state.child = Some(child);
            state.logs_dir = logs_dir;
            state.runtime_dir = runtime_dir.to_string_lossy().to_string();
            state.startup_error = None;
        }

        let connection = ready_rx
            .recv_timeout(Duration::from_secs(30))
            .map_err(|_| {
                let message = "Backend nao emitiu evento ready em 30 segundos.".to_string();
                append_desktop_log(&desktop_log, "ERROR", "sidecar", "STARTUP-013", &message);
                self.set_startup_error(message.clone());
                message
            })?;
        append_desktop_log(
            &desktop_log,
            "INFO",
            "sidecar",
            "STARTUP-014",
            &format!(
                "Backend emitted ready event port={} session_id={} pid={}",
                port,
                session,
                connection
                    .backend_pid
                    .map(|pid| pid.to_string())
                    .unwrap_or_else(|| "unknown".to_string())
            ),
        );
        wait_for_health(port, Duration::from_secs(10)).map_err(|error| {
            append_desktop_log(&desktop_log, "ERROR", "health", "STARTUP-021", &error);
            self.set_startup_error(error.clone());
            error
        })?;
        append_desktop_log(
            &desktop_log,
            "INFO",
            "health",
            "STARTUP-020",
            "Backend health check succeeded",
        );
        validate_runtime_identity(port, &token, &build_identity, connection.backend_pid).map_err(
            |error| {
                append_desktop_log(&desktop_log, "ERROR", "identity", "STARTUP-022", &error);
                self.set_startup_error(error.clone());
                error
            },
        )?;
        append_desktop_log(
            &desktop_log,
            "INFO",
            "identity",
            "STARTUP-023",
            &format!(
                "Backend identity handshake succeeded build_id={} protocol_version={}",
                build_identity.build_id, build_identity.protocol_version
            ),
        );
        write_session_file(
            &directories,
            &connection.session_id,
            connection.backend_pid,
            port,
            &connection.version,
            &resource_dir,
            &build_identity,
        )?;

        let mut state = self.state.lock().map_err(|_| "runtime lock poisoned")?;
        state.connection = Some(connection);
        state.startup_error = None;
        self.ready.notify_all();
        Ok(())
    }

    pub fn shutdown(&self) {
        let (connection, child) = {
            let mut state = match self.state.lock() {
                Ok(state) => state,
                Err(_) => return,
            };
            state.startup_error = None;
            (state.connection.take(), state.child.take())
        };
        if let Some(connection) = connection {
            let _ = request_shutdown(&connection);
        }
        if let Some(child) = child {
            std::thread::sleep(Duration::from_millis(500));
            let _ = child.kill();
        }
    }
}

#[tauri::command]
pub fn get_runtime_connection(runtime: State<BackendRuntime>) -> Result<RuntimeConnection, String> {
    runtime.wait_for_connection(Duration::from_secs(30))
}

#[tauri::command]
pub fn get_runtime_status(runtime: State<BackendRuntime>) -> Result<RuntimeStatus, String> {
    let state = runtime.state.lock().map_err(|_| "runtime lock poisoned")?;
    Ok(RuntimeStatus {
        state: state
            .connection
            .as_ref()
            .map(|connection| connection.state.clone())
            .unwrap_or_else(|| "starting".to_string()),
        base_url: state
            .connection
            .as_ref()
            .map(|connection| connection.base_url.clone()),
        session_id: state
            .connection
            .as_ref()
            .map(|connection| connection.session_id.clone()),
        logs_dir: state.logs_dir.clone(),
    })
}

#[tauri::command]
pub fn restart_backend(
    app: AppHandle,
    runtime: State<BackendRuntime>,
) -> Result<RuntimeConnection, String> {
    runtime.start(app)?;
    get_runtime_connection(runtime)
}

#[tauri::command]
pub fn open_logs_directory(runtime: State<BackendRuntime>) -> Result<(), String> {
    let logs_dir = {
        let state = runtime.state.lock().map_err(|_| "runtime lock poisoned")?;
        state.logs_dir.clone()
    };
    if logs_dir.is_empty() {
        return Err("Diretorio de logs ainda nao esta pronto.".to_string());
    }
    SystemCommand::new("explorer.exe")
        .arg(logs_dir)
        .spawn()
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn shutdown_cronos(app: AppHandle, runtime: State<BackendRuntime>) -> Result<(), String> {
    runtime.shutdown();
    app.exit(0);
    Ok(())
}

fn request_shutdown(connection: &RuntimeConnection) -> Result<(), String> {
    let base = connection
        .base_url
        .strip_prefix("http://127.0.0.1:")
        .ok_or("base_url invalida")?;
    let port: u16 = base.parse().map_err(|_| "porta invalida")?;
    let mut stream = TcpStream::connect(("127.0.0.1", port)).map_err(|error| error.to_string())?;
    let request = format!(
        "POST /runtime/shutdown HTTP/1.1\r\nHost: 127.0.0.1\r\nX-Cronos-Runtime-Token: {}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n",
        connection.runtime_token
    );
    stream
        .write_all(request.as_bytes())
        .map_err(|error| error.to_string())?;
    let mut response = String::new();
    let _ = stream.read_to_string(&mut response);
    Ok(())
}

fn append_log(path: &std::path::Path, text: &str) {
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let Ok(mut file) = fs::OpenOptions::new().create(true).append(true).open(path) else {
        return;
    };
    let _ = file.write_all(text.as_bytes());
}

impl BackendRuntime {
    fn wait_for_connection(&self, timeout: Duration) -> Result<RuntimeConnection, String> {
        let deadline = Instant::now() + timeout;
        let mut state = self.state.lock().map_err(|_| "runtime lock poisoned")?;
        loop {
            if let Some(connection) = state.connection.clone() {
                return Ok(connection);
            }
            if let Some(error) = state.startup_error.clone() {
                return Err(error);
            }
            let now = Instant::now();
            if now >= deadline {
                return Err("Backend ainda nao esta pronto apos 30 segundos.".to_string());
            }
            let wait_for = deadline.saturating_duration_since(now);
            let result = self
                .ready
                .wait_timeout(state, wait_for)
                .map_err(|_| "runtime lock poisoned")?;
            state = result.0;
            if result.1.timed_out() {
                return Err("Backend ainda nao esta pronto apos 30 segundos.".to_string());
            }
        }
    }

    fn set_startup_error(&self, message: String) {
        if let Ok(mut state) = self.state.lock() {
            state.startup_error = Some(message);
            self.ready.notify_all();
        }
    }
}

fn append_desktop_log(path: &Path, level: &str, component: &str, code: &str, message: &str) {
    rotate_log(path);
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0);
    append_log(
        path,
        &format!("{now} {level} {component} {code} {message}\n"),
    );
}

fn resolve_resource_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let tauri_resource_dir = app.path().resource_dir().map_err(|error| error.to_string())?;
    if has_cronos_resources(&tauri_resource_dir) {
        return Ok(tauri_resource_dir);
    }
    let exe_dir = std::env::current_exe()
        .map_err(|error| error.to_string())?
        .parent()
        .ok_or_else(|| "Nao foi possivel resolver o diretorio do executavel.".to_string())?
        .to_path_buf();
    let beside_exe = exe_dir.join("resources");
    if has_cronos_resources(&beside_exe) {
        return Ok(beside_exe);
    }
    Err(format!(
        "Recursos locais do CRONOS nao encontrados. tauri_resource_dir={} beside_exe={}",
        tauri_resource_dir.to_string_lossy(),
        beside_exe.to_string_lossy()
    ))
}

fn has_cronos_resources(path: &Path) -> bool {
    path.join("ai").join("llm").join("manifest.json").is_file()
        && path
            .join("ai")
            .join("embeddings")
            .join("manifest.json")
            .is_file()
}

fn rotate_log(path: &Path) {
    let Ok(metadata) = fs::metadata(path) else {
        return;
    };
    if metadata.len() <= 1_048_576 {
        return;
    }
    let rotated = path.with_extension("log.1");
    let _ = fs::rename(path, rotated);
}

fn write_session_file(
    directories: &RuntimeDirectories,
    session_id: &str,
    backend_pid: Option<u32>,
    port: u16,
    app_version: &str,
    resource_dir: &Path,
    build_identity: &BuildIdentity,
) -> Result<(), String> {
    let started_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_secs();
    let payload = serde_json::json!({
        "session_id": session_id,
        "pid": backend_pid,
        "backend_executable_hint": "cronos-backend sidecar started by Tauri shell",
        "resource_dir": resource_dir.to_string_lossy().to_string(),
        "started_at": started_at,
        "app_version": app_version,
        "build_id": build_identity.build_id,
        "git_commit": build_identity.git_commit,
        "protocol_version": build_identity.protocol_version,
        "port": port,
        "status": "ready"
    });
    fs::write(
        directories.runtime.join("current-session.json"),
        serde_json::to_string_pretty(&payload).map_err(|error| error.to_string())?,
    )
    .map_err(|error| error.to_string())
}

impl BuildIdentity {
    fn matches_event(
        &self,
        version: &str,
        build_id: &str,
        git_commit: &str,
        protocol_version: &str,
    ) -> bool {
        normalize_version(version) == normalize_version(&self.version)
            && build_id == self.build_id
            && git_commit == self.git_commit
            && protocol_version == self.protocol_version
    }
}

fn default_protocol_version() -> String {
    "1".to_string()
}

fn normalize_version(version: &str) -> String {
    version.trim().trim_start_matches('v').to_string()
}

fn read_build_identity(resource_dir: &Path) -> Result<BuildIdentity, String> {
    let path = resource_dir.join("build-info.json");
    let raw = fs::read_to_string(&path)
        .map_err(|error| format!("Build identity ausente em {}: {}", path.to_string_lossy(), error))?;
    let identity: BuildIdentity = serde_json::from_str(&raw)
        .map_err(|error| format!("Build identity invalida em {}: {}", path.to_string_lossy(), error))?;
    if identity.version.is_empty() || identity.build_id.is_empty() || identity.git_commit.is_empty() {
        return Err("Build identity incompleta: version, buildId e gitCommit sao obrigatorios.".to_string());
    }
    Ok(identity)
}

fn validate_runtime_identity(
    port: u16,
    token: &str,
    expected: &BuildIdentity,
    expected_pid: Option<u32>,
) -> Result<(), String> {
    let identity = get_runtime_identity(port, token)?;
    let app_version = identity
        .get("appVersion")
        .and_then(Value::as_str)
        .unwrap_or("");
    let build_id = identity.get("buildId").and_then(Value::as_str).unwrap_or("");
    let runtime_build_id = identity
        .get("runtimeBuildId")
        .and_then(Value::as_str)
        .unwrap_or("");
    let git_commit = identity
        .get("gitCommit")
        .and_then(Value::as_str)
        .unwrap_or("");
    let runtime_git_commit = identity
        .get("runtimeGitCommit")
        .and_then(Value::as_str)
        .unwrap_or("");
    let protocol_version = identity
        .get("protocolVersion")
        .and_then(Value::as_str)
        .unwrap_or("");
    let runtime_protocol_version = identity
        .get("runtimeProtocolVersion")
        .and_then(Value::as_str)
        .unwrap_or("");
    let backend_pid = identity
        .get("backendPid")
        .and_then(Value::as_u64)
        .and_then(|pid| u32::try_from(pid).ok());
    let resource_dir = identity
        .get("resourceDir")
        .and_then(Value::as_str)
        .unwrap_or("");

    let pid_matches = expected_pid.is_none() || backend_pid == expected_pid;
    if normalize_version(app_version) != normalize_version(&expected.version)
        || build_id != expected.build_id
        || runtime_build_id != expected.build_id
        || git_commit != expected.git_commit
        || runtime_git_commit != expected.git_commit
        || protocol_version != expected.protocol_version
        || runtime_protocol_version != expected.protocol_version
        || !pid_matches
        || resource_dir.is_empty()
    {
        return Err(format!(
            "Backend local incompativel. Reinstale ou atualize o CRONOS. expected_build_id={} actual_build_id={} runtime_build_id={} expected_git_commit={} actual_git_commit={} runtime_git_commit={} expected_protocol={} actual_protocol={} runtime_protocol={} expected_pid={:?} actual_pid={:?} resource_dir={}",
            expected.build_id,
            build_id,
            runtime_build_id,
            expected.git_commit,
            git_commit,
            runtime_git_commit,
            expected.protocol_version,
            protocol_version,
            runtime_protocol_version,
            expected_pid,
            backend_pid,
            resource_dir
        ));
    }
    Ok(())
}

fn get_runtime_identity(port: u16, token: &str) -> Result<Value, String> {
    let mut stream = TcpStream::connect(("127.0.0.1", port)).map_err(|error| error.to_string())?;
    let request = format!(
        "GET /runtime/identity HTTP/1.1\r\nHost: 127.0.0.1\r\nX-Cronos-Runtime-Token: {}\r\nConnection: close\r\n\r\n",
        token
    );
    stream
        .write_all(request.as_bytes())
        .map_err(|error| error.to_string())?;
    let mut response = Vec::new();
    stream
        .read_to_end(&mut response)
        .map_err(|error| error.to_string())?;
    parse_http_json(&response)
}

fn parse_http_json(response: &[u8]) -> Result<Value, String> {
    let text = String::from_utf8_lossy(response);
    let mut parts = text.splitn(2, "\r\n\r\n");
    let header = parts.next().unwrap_or("");
    let body = parts.next().unwrap_or("");
    if !header.contains(" 200 ") {
        return Err(format!("Falha ao consultar identidade do backend: {}", header.lines().next().unwrap_or("sem status")));
    }
    serde_json::from_str(body).map_err(|error| error.to_string())
}
