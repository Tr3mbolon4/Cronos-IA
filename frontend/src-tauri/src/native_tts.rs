use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use std::path::PathBuf;
use std::sync::mpsc::{self, Sender};
use std::sync::{Mutex, OnceLock};
use std::thread;
use std::time::{Instant, SystemTime, UNIX_EPOCH};

#[cfg(windows)]
use windows::core::{HSTRING, PCWSTR};
#[cfg(windows)]
use windows::Win32::Media::Speech::{ISpVoice, SpVoice, SPF_ASYNC, SPF_PURGEBEFORESPEAK};
#[cfg(windows)]
use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_ALL, COINIT_APARTMENTTHREADED};

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

#[derive(Clone)]
enum TtsCommand {
    Pause,
    Resume,
    Stop,
}

struct ActiveSpeech {
    tx: Sender<TtsCommand>,
    started: Instant,
    started_at: String,
}

static ACTIVE_SPEECH: OnceLock<Mutex<Option<ActiveSpeech>>> = OnceLock::new();
static LAST_STATUS: OnceLock<Mutex<NativeTtsStatus>> = OnceLock::new();

#[tauri::command]
pub fn native_tts_speak(request: NativeTtsRequest) -> Result<NativeTtsStatus, String> {
    let text = request.text.trim().to_string();
    if text.is_empty() {
        return Err("Texto obrigatorio para TTS.".to_string());
    }
    let _ = native_tts_stop();
    let (tx, rx) = mpsc::channel::<TtsCommand>();
    let started = Instant::now();
    let started_at = utc_timestamp();
    {
        let mut guard = active_speech().lock().map_err(|_| "Falha ao registrar TTS.".to_string())?;
        *guard = Some(ActiveSpeech { tx, started, started_at: started_at.clone() });
    }
    set_status(base_status("playing", started_at.clone(), 0, None, String::new()));
    append_tts_log(&format!(
        "tts_provider=cronos-native-windows-sapi process=internal-thread pid=none parent_pid=cronos-desktop command=\"COM SAPI ISpVoice::Speak(SPF_ASYNC)\" state=playing orphanCount=0"
    ));
    thread::spawn(move || {
        let result = run_sapi_speech(text, request.rate, request.volume, rx, started);
        let elapsed = started.elapsed().as_millis();
        let (state, diagnostic) = match result {
            Ok(TtsCompletion::Completed) => ("completed", String::new()),
            Ok(TtsCompletion::Stopped) => ("stopped", String::new()),
            Err(error) => ("failed", error),
        };
        append_tts_log(&format!(
            "tts_provider=cronos-native-windows-sapi process=internal-thread pid=none state={} elapsedMs={} exit_code=0 orphanCount=0 diagnostic={}",
            state,
            elapsed,
            sanitize_log_text(&diagnostic)
        ));
        if let Ok(mut guard) = active_speech().lock() {
            *guard = None;
        }
        set_status(base_status(state, started_at, elapsed, Some(0), diagnostic));
    });
    Ok(native_tts_status())
}

#[tauri::command]
pub fn native_tts_pause() -> Result<NativeTtsStatus, String> {
    send_command(TtsCommand::Pause, "paused")
}

#[tauri::command]
pub fn native_tts_resume() -> Result<NativeTtsStatus, String> {
    send_command(TtsCommand::Resume, "playing")
}

#[tauri::command]
pub fn native_tts_stop() -> Result<NativeTtsStatus, String> {
    let mut guard = active_speech().lock().map_err(|_| "Falha ao encerrar TTS.".to_string())?;
    if let Some(active) = guard.take() {
        let _ = active.tx.send(TtsCommand::Stop);
        let elapsed = active.started.elapsed().as_millis();
        let status = base_status("stopped", active.started_at, elapsed, Some(0), String::new());
        append_tts_log(&format!("tts_provider=cronos-native-windows-sapi process=internal-thread pid=none state=stopped elapsedMs={} exit_code=0 orphanCount=0", elapsed));
        set_status(status.clone());
        return Ok(status);
    }
    Ok(native_tts_status())
}

#[tauri::command]
pub fn native_tts_status() -> NativeTtsStatus {
    if let Ok(guard) = active_speech().lock() {
        if let Some(active) = guard.as_ref() {
            let last = last_status();
            let state = last.lock().map(|status| status.state.clone()).unwrap_or_else(|_| "playing".to_string());
            return base_status(&state, active.started_at.clone(), active.started.elapsed().as_millis(), None, String::new());
        }
    }
    last_status().lock().map(|status| status.clone()).unwrap_or_else(|_| base_status("idle", String::new(), 0, None, String::new()))
}

pub fn stop_all_tts() {
    let _ = native_tts_stop();
}

fn send_command(command: TtsCommand, state: &str) -> Result<NativeTtsStatus, String> {
    let guard = active_speech().lock().map_err(|_| "Falha ao controlar TTS.".to_string())?;
    let Some(active) = guard.as_ref() else {
        return Ok(native_tts_status());
    };
    active.tx.send(command).map_err(|error| error.to_string())?;
    let status = base_status(state, active.started_at.clone(), active.started.elapsed().as_millis(), None, String::new());
    append_tts_log(&format!("tts_provider=cronos-native-windows-sapi process=internal-thread pid=none state={} command=internal-control orphanCount=0", state));
    set_status(status.clone());
    Ok(status)
}

#[derive(Debug)]
enum TtsCompletion {
    Completed,
    Stopped,
}

#[cfg(windows)]
fn run_sapi_speech(text: String, rate: f32, volume: f32, rx: mpsc::Receiver<TtsCommand>, _started: Instant) -> Result<TtsCompletion, String> {
    unsafe {
        CoInitializeEx(None, COINIT_APARTMENTTHREADED).ok().map_err(|error| format!("COM init falhou: {error}"))?;
        let result = run_sapi_speech_inner(text, rate, volume, rx);
        CoUninitialize();
        result
    }
}

#[cfg(windows)]
unsafe fn run_sapi_speech_inner(text: String, rate: f32, volume: f32, rx: mpsc::Receiver<TtsCommand>) -> Result<TtsCompletion, String> {
    let voice: ISpVoice = CoCreateInstance(&SpVoice, None, CLSCTX_ALL).map_err(|error| format!("SAPI indisponivel: {error}"))?;
    voice.SetRate(((rate - 1.0) * 5.0).round().clamp(-10.0, 10.0) as i32).map_err(|error| error.to_string())?;
    voice.SetVolume((volume * 100.0).round().clamp(0.0, 100.0) as u16).map_err(|error| error.to_string())?;
    let text = HSTRING::from(text);
    let mut stream_number = 0_u32;
    voice.Speak(PCWSTR(text.as_ptr()), SPF_ASYNC.0 as u32, Some(&mut stream_number)).map_err(|error| error.to_string())?;
    loop {
        match rx.try_recv() {
            Ok(TtsCommand::Pause) => {
                let _ = voice.Pause();
            }
            Ok(TtsCommand::Resume) => {
                let _ = voice.Resume();
            }
            Ok(TtsCommand::Stop) => {
                let empty = HSTRING::from("");
                let _ = voice.Speak(PCWSTR(empty.as_ptr()), (SPF_ASYNC.0 | SPF_PURGEBEFORESPEAK.0) as u32, None);
                return Ok(TtsCompletion::Stopped);
            }
            Err(mpsc::TryRecvError::Empty) => {}
            Err(mpsc::TryRecvError::Disconnected) => return Ok(TtsCompletion::Stopped),
        }
        if voice.WaitUntilDone(80).is_ok() {
            return Ok(TtsCompletion::Completed);
        }
    }
}

#[cfg(not(windows))]
fn run_sapi_speech(_text: String, _rate: f32, _volume: f32, _rx: mpsc::Receiver<TtsCommand>, _started: Instant) -> Result<TtsCompletion, String> {
    Err("TTS nativo disponivel apenas no Windows.".to_string())
}

fn base_status(state: &str, started_at: String, elapsed_ms: u128, exit_code: Option<i32>, diagnostic: String) -> NativeTtsStatus {
    NativeTtsStatus {
        available: true,
        provider: "cronos-native-windows-sapi".to_string(),
        state: state.to_string(),
        pid: None,
        command: "COM SAPI ISpVoice::Speak(SPF_ASYNC), processo interno do cronos-desktop".to_string(),
        started_at,
        elapsed_ms,
        exit_code,
        orphan_count: 0,
        log_path: log_path().map(|path| path.display().to_string()).unwrap_or_default(),
        diagnostic,
    }
}

fn set_status(status: NativeTtsStatus) {
    if let Ok(mut guard) = last_status().lock() {
        *guard = status;
    }
}

fn active_speech() -> &'static Mutex<Option<ActiveSpeech>> {
    ACTIVE_SPEECH.get_or_init(|| Mutex::new(None))
}

fn last_status() -> &'static Mutex<NativeTtsStatus> {
    LAST_STATUS.get_or_init(|| Mutex::new(base_status("idle", String::new(), 0, None, String::new())))
}

fn append_tts_log(line: &str) {
    let Some(path) = log_path() else {
        return;
    };
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    if let Ok(mut file) = fs::OpenOptions::new().create(true).append(true).open(path) {
        let _ = writeln!(file, "{}", sanitize_log_text(line));
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
    fn tts_status_uses_internal_sapi_without_shell_process() {
        let status = base_status("playing", "now".to_string(), 10, None, String::new());
        assert!(status.command.contains("ISpVoice"));
        assert!(!status.command.contains("powershell"));
        assert!(!status.command.contains("cmd.exe"));
        assert_eq!(status.pid, None);
        assert_eq!(status.orphan_count, 0);
    }

    #[test]
    fn tts_log_sanitizer_keeps_text_without_control_noise() {
        assert_eq!(sanitize_log_text("tts\u{0000}\nstate"), "tts\nstate");
    }
}
