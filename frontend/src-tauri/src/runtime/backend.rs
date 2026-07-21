use super::directories::RuntimeDirectories;
use super::health::wait_for_health;
use super::process::reserve_local_port;
use super::security::{runtime_token, session_id};
use serde::Serialize;
use serde_json::Value;
use std::fs;
use std::io::{Read, Write};
use std::net::TcpStream;
use std::path::Path;
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
        let resource_dir = app
            .path()
            .resource_dir()
            .map_err(|error| error.to_string())?;
        append_desktop_log(
            &desktop_log,
            "INFO",
            "sidecar",
            "STARTUP-010",
            &format!(
                "Starting backend sidecar base_url={} data_dir={} logs_dir={}",
                base_url,
                directories.root.to_string_lossy(),
                directories.logs.to_string_lossy()
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
            .arg(resource_dir.to_string_lossy().to_string());

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
                                        .unwrap_or("0.2.0")
                                        .to_string();
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
        write_session_file(
            &directories,
            &connection.session_id,
            connection.backend_pid,
            port,
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
) -> Result<(), String> {
    let started_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| error.to_string())?
        .as_secs();
    let payload = serde_json::json!({
        "session_id": session_id,
        "pid": backend_pid,
        "executable_path": "binaries/cronos-backend",
        "started_at": started_at,
        "app_version": "0.2.0",
        "port": port
    });
    fs::write(
        directories.runtime.join("current-session.json"),
        serde_json::to_string_pretty(&payload).map_err(|error| error.to_string())?,
    )
    .map_err(|error| error.to_string())
}
