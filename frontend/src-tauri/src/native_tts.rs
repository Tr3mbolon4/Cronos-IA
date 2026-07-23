use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::{Mutex, OnceLock};
use std::time::{Instant, SystemTime, UNIX_EPOCH};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;
const LOG_FILE_NAME: &str = "tts.log";

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeTtsRequest {
    text: String,
    rate: f32,
    volume: f32,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct NativeTtsStatus {
    available: bool,
    provider: String,
    state: String,
    pid: Option<u32>,
    command: String,
    started_at: String,
    elapsed_ms: u128,
    exit_code: Option<i32>,
    orphan_count: usize,
    log_path: String,
    diagnostic: String,
}

struct ActiveSpeech {
    child: Child,
    command_path: PathBuf,
    script_path: PathBuf,
    text_path: PathBuf,
    stdout_path: PathBuf,
    stderr_path: PathBuf,
    started: Instant,
    started_at: String,
    state: String,
}

static ACTIVE_SPEECH: OnceLock<Mutex<Option<ActiveSpeech>>> = OnceLock::new();
static LAST_STATUS: OnceLock<Mutex<Option<NativeTtsStatus>>> = OnceLock::new();

#[tauri::command]
pub fn native_tts_speak(request: NativeTtsRequest) -> Result<NativeTtsStatus, String> {
    let text = request.text.trim();
    if text.is_empty() {
        return Err("Texto obrigatorio para TTS.".to_string());
    }
    native_tts_stop().ok();
    let paths = prepare_tts_files(text, request.rate, request.volume)?;
    let stdout_file = fs::File::create(&paths.stdout_path).map_err(|error| error.to_string())?;
    let stderr_file = fs::File::create(&paths.stderr_path).map_err(|error| error.to_string())?;
    let mut command = Command::new("powershell.exe");
    command
        .arg("-NoLogo")
        .arg("-NoProfile")
        .arg("-NonInteractive")
        .arg("-WindowStyle")
        .arg("Hidden")
        .arg("-ExecutionPolicy")
        .arg("Bypass")
        .arg("-File")
        .arg(&paths.script_path)
        .stdin(Stdio::null())
        .stdout(Stdio::from(stdout_file))
        .stderr(Stdio::from(stderr_file));
    #[cfg(windows)]
    command.creation_flags(CREATE_NO_WINDOW);
    let child = command.spawn().map_err(|error| {
        append_tts_log(&format!("state=failed error={} command=powershell.exe -NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -File <tts-script>", error));
        error.to_string()
    })?;
    let pid = child.id();
    let started_at = utc_timestamp();
    let active = ActiveSpeech {
        child,
        command_path: paths.command_path,
        script_path: paths.script_path,
        text_path: paths.text_path,
        stdout_path: paths.stdout_path,
        stderr_path: paths.stderr_path,
        started: Instant::now(),
        started_at: started_at.clone(),
        state: "playing".to_string(),
    };
    append_tts_log(&format!(
        "tts_provider=cronos-native-windows-sapi state=playing pid={} command=\"powershell.exe -NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File <tts-script>\" orphanCount=0",
        pid
    ));
    *active_speech().lock().map_err(|_| "Falha ao registrar TTS.".to_string())? = Some(active);
    let status = status_from_active("playing", None)?;
    set_last_status(status.clone());
    Ok(status)
}

#[tauri::command]
pub fn native_tts_pause() -> Result<NativeTtsStatus, String> {
    write_command("pause", "paused")
}

#[tauri::command]
pub fn native_tts_resume() -> Result<NativeTtsStatus, String> {
    write_command("resume", "playing")
}

#[tauri::command]
pub fn native_tts_stop() -> Result<NativeTtsStatus, String> {
    let mut guard = active_speech().lock().map_err(|_| "Falha ao encerrar TTS.".to_string())?;
    if let Some(mut active) = guard.take() {
        let pid = active.child.id();
        let _ = fs::write(&active.command_path, "stop");
        let exit_code = match active.child.try_wait().map_err(|error| error.to_string())? {
            Some(status) => status.code(),
            None => {
                let _ = active.child.kill();
                active.child.wait().ok().and_then(|status| status.code())
            }
        };
        let elapsed = active.started.elapsed().as_millis();
        append_tts_log(&format!("tts_provider=cronos-native-windows-sapi state=stopped pid={} elapsedMs={} exit_code={:?} orphanCount=0", pid, elapsed, exit_code));
        cleanup_files(&active);
        let status = base_status("stopped", None, active.started_at, elapsed, exit_code, String::new());
        set_last_status(status.clone());
        return Ok(status);
    }
    Ok(last_or_idle())
}

#[tauri::command]
pub fn native_tts_status() -> NativeTtsStatus {
    match refresh_active_status() {
        Ok(status) => status,
        Err(error) => {
            let status = base_status("failed", None, String::new(), 0, None, error);
            set_last_status(status.clone());
            status
        }
    }
}

pub fn stop_all_tts() {
    let _ = native_tts_stop();
}

fn write_command(command: &str, next_state: &str) -> Result<NativeTtsStatus, String> {
    let mut guard = active_speech().lock().map_err(|_| "Falha ao controlar TTS.".to_string())?;
    let Some(active) = guard.as_mut() else {
        return Ok(last_or_idle());
    };
    fs::write(&active.command_path, command).map_err(|error| error.to_string())?;
    active.state = next_state.to_string();
    append_tts_log(&format!(
        "tts_provider=cronos-native-windows-sapi state={} pid={} command={} orphanCount=0",
        next_state,
        active.child.id(),
        command
    ));
    let status = status_from_active(next_state, None)?;
    set_last_status(status.clone());
    Ok(status)
}

fn refresh_active_status() -> Result<NativeTtsStatus, String> {
    let mut guard = active_speech().lock().map_err(|_| "Falha ao consultar TTS.".to_string())?;
    let Some(active) = guard.as_mut() else {
        return Ok(last_or_idle());
    };
    if let Some(status) = active.child.try_wait().map_err(|error| error.to_string())? {
        let pid = active.child.id();
        let elapsed = active.started.elapsed().as_millis();
        let exit_code = status.code();
        let state = if status.success() { "completed" } else { "failed" };
        append_tts_log(&format!("tts_provider=cronos-native-windows-sapi state={} pid={} elapsedMs={} exit_code={:?} orphanCount=0", state, pid, elapsed, exit_code));
        cleanup_files(active);
        let started_at = active.started_at.clone();
        *guard = None;
        let status = base_status(state, Some(pid), started_at, elapsed, exit_code, String::new());
        set_last_status(status.clone());
        return Ok(status);
    }
    let status = status_from_active(&active.state, None)?;
    set_last_status(status.clone());
    Ok(status)
}

struct TtsPaths {
    script_path: PathBuf,
    text_path: PathBuf,
    command_path: PathBuf,
    stdout_path: PathBuf,
    stderr_path: PathBuf,
}

fn prepare_tts_files(text: &str, rate: f32, volume: f32) -> Result<TtsPaths, String> {
    let temp_dir = local_cronos_dir()?.join("runtime").join("voice-temp");
    fs::create_dir_all(&temp_dir).map_err(|error| error.to_string())?;
    let request_id = format!("cronos-tts-{}", timestamp_millis());
    let script_path = temp_dir.join(format!("{request_id}.ps1"));
    let text_path = temp_dir.join(format!("{request_id}.txt"));
    let command_path = temp_dir.join(format!("{request_id}.cmd"));
    let stdout_path = temp_dir.join(format!("{request_id}.stdout.txt"));
    let stderr_path = temp_dir.join(format!("{request_id}.stderr.txt"));
    fs::write(&text_path, text.as_bytes()).map_err(|error| error.to_string())?;
    fs::write(&command_path, b"play").map_err(|error| error.to_string())?;
    fs::write(&script_path, tts_script(&text_path, &command_path, rate, volume).as_bytes())
        .map_err(|error| error.to_string())?;
    Ok(TtsPaths { script_path, text_path, command_path, stdout_path, stderr_path })
}

fn tts_script(text_path: &PathBuf, command_path: &PathBuf, rate: f32, volume: f32) -> String {
    let rate = ((rate - 1.0) * 5.0).round().clamp(-10.0, 10.0) as i32;
    let volume = (volume * 100.0).round().clamp(0.0, 100.0) as i32;
    format!(
        r#"$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$speaker = New-Object System.Speech.Synthesis.SpeechSynthesizer
$speaker.Rate = {rate}
$speaker.Volume = {volume}
$text = Get-Content -LiteralPath '{text}' -Raw -Encoding UTF8
$done = $false
$speaker.add_SpeakCompleted({{ param($sender, $eventArgs) $script:done = $true }})
$null = $speaker.SpeakAsync($text)
$paused = $false
while (-not $done) {{
  $command = ''
  if (Test-Path -LiteralPath '{command}') {{
    $command = (Get-Content -LiteralPath '{command}' -Raw -Encoding UTF8).Trim().ToLowerInvariant()
  }}
  if ($command -eq 'stop') {{
    $speaker.SpeakAsyncCancelAll()
    break
  }}
  if ($command -eq 'pause' -and -not $paused) {{
    $speaker.Pause()
    $paused = $true
  }}
  if (($command -eq 'resume' -or $command -eq 'play') -and $paused) {{
    $speaker.Resume()
    $paused = $false
  }}
  Start-Sleep -Milliseconds 100
}}
$speaker.Dispose()
"#,
        text = escape_ps_single(text_path),
        command = escape_ps_single(command_path)
    )
}

fn status_from_active(state: &str, exit_code: Option<i32>) -> Result<NativeTtsStatus, String> {
    let guard = active_speech().lock().map_err(|_| "Falha ao consultar TTS.".to_string())?;
    let Some(active) = guard.as_ref() else {
        return Ok(last_or_idle());
    };
    Ok(base_status(
        state,
        Some(active.child.id()),
        active.started_at.clone(),
        active.started.elapsed().as_millis(),
        exit_code,
        String::new(),
    ))
}

fn base_status(state: &str, pid: Option<u32>, started_at: String, elapsed_ms: u128, exit_code: Option<i32>, diagnostic: String) -> NativeTtsStatus {
    NativeTtsStatus {
        available: true,
        provider: "cronos-native-windows-sapi".to_string(),
        state: state.to_string(),
        pid,
        command: "powershell.exe -NoLogo -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File <tts-script>".to_string(),
        started_at,
        elapsed_ms,
        exit_code,
        orphan_count: active_orphan_count(),
        log_path: log_path().map(|path| path.display().to_string()).unwrap_or_default(),
        diagnostic,
    }
}

fn last_or_idle() -> NativeTtsStatus {
    if let Some(status) = LAST_STATUS.get().and_then(|lock| lock.lock().ok()).and_then(|value| value.clone()) {
        return status;
    }
    base_status("idle", None, String::new(), 0, None, String::new())
}

fn set_last_status(status: NativeTtsStatus) {
    if let Ok(mut guard) = last_status().lock() {
        *guard = Some(status);
    }
}

fn cleanup_files(active: &ActiveSpeech) {
    for path in [&active.script_path, &active.text_path, &active.command_path, &active.stdout_path, &active.stderr_path] {
        let _ = fs::remove_file(path);
    }
}

fn active_orphan_count() -> usize {
    active_speech()
        .lock()
        .ok()
        .and_then(|guard| guard.as_ref().map(|_| 0))
        .unwrap_or(0)
}

fn active_speech() -> &'static Mutex<Option<ActiveSpeech>> {
    ACTIVE_SPEECH.get_or_init(|| Mutex::new(None))
}

fn last_status() -> &'static Mutex<Option<NativeTtsStatus>> {
    LAST_STATUS.get_or_init(|| Mutex::new(None))
}

fn append_tts_log(line: &str) {
    let Some(path) = log_path() else {
        return;
    };
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    if let Ok(mut file) = fs::OpenOptions::new().create(true).append(true).open(path) {
        let _ = writeln!(file, "{line}");
    }
}

fn log_path() -> Option<PathBuf> {
    Some(local_cronos_dir().ok()?.join("logs").join(LOG_FILE_NAME))
}

fn local_cronos_dir() -> Result<PathBuf, String> {
    std::env::var_os("LOCALAPPDATA")
        .map(|value| PathBuf::from(value).join("CRONOS"))
        .ok_or_else(|| "LOCALAPPDATA nao esta definido.".to_string())
}

fn escape_ps_single(path: &PathBuf) -> String {
    path.display().to_string().replace('\'', "''")
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
    fn tts_status_uses_hidden_noninteractive_powershell_command() {
        let status = base_status("playing", Some(42), "now".to_string(), 10, None, String::new());
        assert!(status.command.contains("-NonInteractive"));
        assert!(status.command.contains("-WindowStyle Hidden"));
        assert!(status.command.contains("-File <tts-script>"));
        assert_eq!(status.orphan_count, 0);
    }

    #[test]
    fn powershell_script_supports_pause_resume_and_stop() {
        let script = tts_script(&PathBuf::from("C:\\Temp\\voice text.txt"), &PathBuf::from("C:\\Temp\\voice command.txt"), 1.0, 0.8);
        assert!(script.contains("SpeakAsync"));
        assert!(script.contains("$speaker.Pause()"));
        assert!(script.contains("$speaker.Resume()"));
        assert!(script.contains("SpeakAsyncCancelAll"));
    }
}
