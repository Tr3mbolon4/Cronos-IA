use serde_json::Value;
use std::fs;
use std::io::Write;
use std::path::PathBuf;
use std::sync::OnceLock;
use std::time::{SystemTime, UNIX_EPOCH};

const LOG_FILE_NAME: &str = "voice-runtime.log";

static PROCESS_ID: OnceLock<u32> = OnceLock::new();

#[tauri::command]
pub fn write_voice_runtime_event(event: Value) -> Result<String, String> {
    append_voice_runtime_event(event)
}

pub fn append_voice_runtime_event(mut event: Value) -> Result<String, String> {
    let path = log_path()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| error.to_string())?;
    }
    let process_id = *PROCESS_ID.get_or_init(std::process::id);
    if let Some(object) = event.as_object_mut() {
        object.entry("at".to_string()).or_insert_with(|| Value::String(utc_timestamp()));
        object.entry("process".to_string()).or_insert_with(|| Value::String("cronos-desktop".to_string()));
        object.entry("pid".to_string()).or_insert_with(|| Value::Number(process_id.into()));
        object.entry("thread".to_string()).or_insert_with(|| Value::String(format!("{:?}", std::thread::current().id())));
    }
    let line = serde_json::to_string(&event).map_err(|error| error.to_string())?;
    let mut file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|error| error.to_string())?;
    writeln!(file, "{line}").map_err(|error| error.to_string())?;
    file.flush().map_err(|error| error.to_string())?;
    Ok(path.display().to_string())
}

pub fn append_voice_runtime_text(event: &str, detail: &str) {
    let _ = append_voice_runtime_event(serde_json::json!({
        "event": event,
        "detail": sanitize_log_text(detail),
    }));
}

fn log_path() -> Result<PathBuf, String> {
    local_cronos_dir().map(|path| path.join("logs").join(LOG_FILE_NAME))
}

fn local_cronos_dir() -> Result<PathBuf, String> {
    std::env::var_os("LOCALAPPDATA")
        .map(|value| PathBuf::from(value).join("CRONOS"))
        .ok_or_else(|| "LOCALAPPDATA nao esta definido.".to_string())
}

fn sanitize_log_text(text: &str) -> String {
    text.chars().filter(|item| !item.is_control() || *item == '\n' || *item == '\t').collect()
}

fn timestamp_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_millis())
        .unwrap_or(0)
}

fn utc_timestamp() -> String {
    format!("{}", timestamp_millis())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn voice_runtime_text_sanitizer_keeps_readable_text() {
        assert_eq!(sanitize_log_text("state\u{0000}\nnext"), "state\nnext");
    }
}
