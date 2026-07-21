use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};
use tauri::Manager;

const MAX_AUDIO_BYTES: usize = 10 * 1024 * 1024;
const MAX_STDIO_BYTES: usize = 64 * 1024;
const TRANSCRIPTION_TIMEOUT_SECS: u64 = 120;
const OVERRIDE_ENV: &str = "CRONOS_LOCAL_WHISPER_DIR";

type SharedChild = Arc<Mutex<std::process::Child>>;

static ACTIVE_CHILDREN: OnceLock<Mutex<HashMap<String, SharedChild>>> = OnceLock::new();

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LocalWhisperManifest {
    provider: String,
    runtime_version: String,
    runtime_file: String,
    runtime_sha256: String,
    runtime_source: String,
    model_name: String,
    model_version: String,
    model_file: String,
    model_sha256: String,
    model_source: String,
    architecture: String,
    language_support: Vec<String>,
    audio_format: String,
    license: String,
    created_at: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalWhisperStatus {
    available: bool,
    integrity_ok: bool,
    diagnostic: String,
    runtime_path: String,
    model_path: String,
    model_name: String,
    version: String,
    checksum: String,
    model_sha256: String,
    runtime_sha256: String,
    size_mb: u64,
    manifest_path: String,
    source: String,
    license: String,
    audio_format: String,
    last_started_at: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalTranscriptionRequest {
    request_id: String,
    audio_bytes: Vec<u8>,
    language: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalTranscriptionResult {
    text: String,
    language: String,
    duration_ms: u64,
    processing_ms: u128,
    provider: String,
    model: String,
    status: String,
    warning: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CancelTranscriptionResult {
    request_id: String,
    cancelled: bool,
}

#[tauri::command]
pub fn get_local_whisper_status(app: tauri::AppHandle) -> LocalWhisperStatus {
    match inspect_local_whisper(&app) {
        Ok(status) => status,
        Err(error) => unavailable_status(error),
    }
}

#[tauri::command]
pub fn transcribe_local_audio(
    app: tauri::AppHandle,
    request: LocalTranscriptionRequest,
) -> Result<LocalTranscriptionResult, String> {
    let started = Instant::now();
    let status = inspect_local_whisper(&app)?;
    if !status.available || !status.integrity_ok {
        return Err(status.diagnostic);
    }
    validate_request_id(&request.request_id)?;
    validate_wav(&request.audio_bytes)?;
    let duration_ms = wav_duration_ms(&request.audio_bytes)?;
    let paths = resolve_paths(&app)?;
    let temp_dir = prepare_temp_dir()?;
    let request_prefix = format!("cronos-voice-{}", request.request_id);
    let wav_path = temp_dir.join(format!("{request_prefix}.wav"));
    let output_base = temp_dir.join(format!("{request_prefix}-out"));
    let stdout_path = temp_dir.join(format!("{request_prefix}.stdout.txt"));
    let stderr_path = temp_dir.join(format!("{request_prefix}.stderr.txt"));
    fs::write(&wav_path, &request.audio_bytes).map_err(|error| error.to_string())?;
    let stdout_file = fs::File::create(&stdout_path).map_err(|error| error.to_string())?;
    let stderr_file = fs::File::create(&stderr_path).map_err(|error| error.to_string())?;

    let language = normalize_language(&request.language);
    let child = Command::new(&paths.runtime_path)
        .arg("-m")
        .arg(&paths.model_path)
        .arg("-f")
        .arg(&wav_path)
        .arg("-l")
        .arg(&language)
        .arg("-otxt")
        .arg("-of")
        .arg(&output_base)
        .arg("-nt")
        .current_dir(&paths.base_dir)
        .stdin(Stdio::null())
        .stdout(Stdio::from(stdout_file))
        .stderr(Stdio::from(stderr_file))
        .spawn()
        .map_err(|error| format!("Nao foi possivel iniciar whisper-cli.exe: {error}"))?;

    let child = Arc::new(Mutex::new(child));
    active_children()
        .lock()
        .map_err(|_| "Falha ao registrar processo local de voz.".to_string())?
        .insert(request.request_id.clone(), child.clone());

    let result = wait_for_child(&request.request_id, child, started);
    let _ = active_children()
        .lock()
        .map(|mut children| children.remove(&request.request_id));
    let stdout_text = read_file_limited(&stdout_path, MAX_STDIO_BYTES);
    let stderr_text = read_file_limited(&stderr_path, MAX_STDIO_BYTES);
    let output_path = output_base.with_extension("txt");

    let exit_status = match result {
        Ok(status) => status,
        Err(error) => {
            let _ = cleanup_temp_files(&[wav_path, output_path, stdout_path, stderr_path]);
            return Err(error);
        }
    };
    if !exit_status.success() {
        let _ = cleanup_temp_files(&[wav_path, output_path, stdout_path, stderr_path]);
        return Err(format!(
            "whisper-cli.exe finalizou com codigo {:?}. {}",
            exit_status.code(),
            sanitize_cli_text(&stderr_text)
        ));
    }

    let output_text = fs::read_to_string(&output_path).unwrap_or_else(|_| stdout_text.clone());
    cleanup_temp_files(&[wav_path, output_path, stdout_path, stderr_path])?;
    let text = sanitize_transcript(&output_text);
    if text.is_empty() {
        return Err("Provider local retornou transcricao vazia.".to_string());
    }

    Ok(LocalTranscriptionResult {
        text,
        language,
        duration_ms,
        processing_ms: started.elapsed().as_millis(),
        provider: "cronos-local-whisper".to_string(),
        model: status.model_name,
        status: "completed".to_string(),
        warning: sanitize_cli_text(&stderr_text),
    })
}

#[tauri::command]
pub fn cancel_local_transcription(request_id: String) -> Result<CancelTranscriptionResult, String> {
    validate_request_id(&request_id)?;
    let child = active_children()
        .lock()
        .map_err(|_| "Falha ao acessar processos locais de voz.".to_string())?
        .remove(&request_id);
    if let Some(child) = child {
        if let Ok(mut process) = child.lock() {
            let _ = process.kill();
            let _ = process.wait();
        }
        Ok(CancelTranscriptionResult {
            request_id,
            cancelled: true,
        })
    } else {
        Ok(CancelTranscriptionResult {
            request_id,
            cancelled: false,
        })
    }
}

pub fn cancel_all_transcriptions() {
    if let Ok(mut children) = active_children().lock() {
        for (_, child) in children.drain() {
            if let Ok(mut process) = child.lock() {
                let _ = process.kill();
                let _ = process.wait();
            }
        }
    }
}

struct LocalWhisperPaths {
    base_dir: PathBuf,
    manifest_path: PathBuf,
    runtime_path: PathBuf,
    model_path: PathBuf,
}

fn inspect_local_whisper(app: &tauri::AppHandle) -> Result<LocalWhisperStatus, String> {
    let paths = resolve_paths(app)?;
    let manifest = read_manifest(&paths.manifest_path)?;
    let runtime_exists = paths.runtime_path.is_file();
    let model_exists = paths.model_path.is_file();
    let runtime_hash = runtime_exists
        .then(|| sha256_file(&paths.runtime_path))
        .transpose()?
        .unwrap_or_default();
    let model_hash = model_exists
        .then(|| sha256_file(&paths.model_path))
        .transpose()?
        .unwrap_or_default();
    let manifest_has_checksums = is_real_checksum(&manifest.runtime_sha256)
        && is_real_checksum(&manifest.model_sha256);
    let integrity_ok = runtime_exists
        && model_exists
        && manifest_has_checksums
        && runtime_hash.eq_ignore_ascii_case(&manifest.runtime_sha256)
        && model_hash.eq_ignore_ascii_case(&manifest.model_sha256);
    let available = integrity_ok;
    let diagnostic = if !runtime_exists {
        "Runtime whisper-cli.exe ausente no pacote local.".to_string()
    } else if !model_exists {
        "Modelo ggml-base.bin ausente no pacote local.".to_string()
    } else if !manifest_has_checksums {
        "Manifest local ainda nao possui checksums reais do runtime/modelo.".to_string()
    } else if !integrity_ok {
        "Checksum do runtime ou modelo local diverge do manifest.".to_string()
    } else {
        "Provider local pronto e validado por SHA-256.".to_string()
    };
    let model_size = if model_exists {
        paths.model_path.metadata().map(|item| item.len()).unwrap_or(0)
    } else {
        0
    };

    Ok(LocalWhisperStatus {
        available,
        integrity_ok,
        diagnostic,
        runtime_path: paths.runtime_path.display().to_string(),
        model_path: paths.model_path.display().to_string(),
        model_name: manifest.model_name,
        version: manifest.runtime_version,
        checksum: manifest.model_sha256.clone(),
        model_sha256: manifest.model_sha256,
        runtime_sha256: manifest.runtime_sha256,
        size_mb: model_size / 1024 / 1024,
        manifest_path: paths.manifest_path.display().to_string(),
        source: format!(
            "{} | {} | {} | {} | {:?} | {}",
            manifest.runtime_source,
            manifest.model_source,
            manifest.model_version,
            manifest.architecture,
            manifest.language_support,
            manifest.created_at
        ),
        license: manifest.license,
        audio_format: manifest.audio_format,
        last_started_at: String::new(),
    })
}

fn resolve_paths(app: &tauri::AppHandle) -> Result<LocalWhisperPaths, String> {
    let base_dir = if let Ok(path) = std::env::var(OVERRIDE_ENV) {
        PathBuf::from(path)
    } else if let Ok(resource_dir) = app.path().resource_dir() {
        resource_dir.join("voice").join("whisper")
    } else {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("resources")
            .join("voice")
            .join("whisper")
    };
    let manifest_path = base_dir.join("manifest.json");
    let manifest = read_manifest(&manifest_path)?;
    let runtime_path = base_dir.join(&manifest.runtime_file);
    let model_path = base_dir.join(&manifest.model_file);
    ensure_inside(&base_dir, &runtime_path)?;
    ensure_inside(&base_dir, &model_path)?;
    Ok(LocalWhisperPaths {
        base_dir,
        manifest_path,
        runtime_path,
        model_path,
    })
}

fn read_manifest(path: &Path) -> Result<LocalWhisperManifest, String> {
    let text = fs::read_to_string(path)
        .map_err(|error| format!("Manifest local de voz nao encontrado: {error}"))?;
    let manifest: LocalWhisperManifest = serde_json::from_str(&text)
        .map_err(|error| format!("Manifest local de voz invalido: {error}"))?;
    if manifest.provider != "cronos-local-whisper" {
        return Err("Manifest local de voz possui provider inesperado.".to_string());
    }
    Ok(manifest)
}

fn active_children() -> &'static Mutex<HashMap<String, SharedChild>> {
    ACTIVE_CHILDREN.get_or_init(|| Mutex::new(HashMap::new()))
}

fn prepare_temp_dir() -> Result<PathBuf, String> {
    let local_app_data =
        std::env::var_os("LOCALAPPDATA").ok_or("LOCALAPPDATA nao esta definido.")?;
    let temp_dir = PathBuf::from(local_app_data)
        .join("CRONOS")
        .join("runtime")
        .join("voice-temp");
    fs::create_dir_all(&temp_dir).map_err(|error| error.to_string())?;
    Ok(temp_dir)
}

fn wait_for_child(
    request_id: &str,
    child: SharedChild,
    started: Instant,
) -> Result<std::process::ExitStatus, String> {
    loop {
        if started.elapsed() > Duration::from_secs(TRANSCRIPTION_TIMEOUT_SECS) {
            let _ = cancel_local_transcription(request_id.to_string());
            return Err("Transcricao local excedeu o timeout.".to_string());
        }
        {
            let mut process = child
                .lock()
                .map_err(|_| "Falha ao monitorar processo local de voz.".to_string())?;
            if let Some(status) = process.try_wait().map_err(|error| error.to_string())? {
                return Ok(status);
            }
        }
        std::thread::sleep(Duration::from_millis(80));
    }
}

fn read_file_limited(path: &Path, limit: usize) -> String {
    let Ok(mut stream) = fs::File::open(path) else {
        return String::new();
    };
    let mut buffer = vec![0; limit];
    match stream.read(&mut buffer) {
        Ok(size) => String::from_utf8_lossy(&buffer[..size]).to_string(),
        Err(_) => String::new(),
    }
}

fn cleanup_temp_files(paths: &[PathBuf]) -> Result<(), String> {
    for path in paths {
        if path.exists() {
            fs::remove_file(path).map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

fn validate_request_id(request_id: &str) -> Result<(), String> {
    let valid = !request_id.is_empty()
        && request_id.len() <= 80
        && request_id
            .chars()
            .all(|item| item.is_ascii_alphanumeric() || item == '-');
    if valid {
        Ok(())
    } else {
        Err("ID de requisicao de voz invalido.".to_string())
    }
}

fn validate_wav(bytes: &[u8]) -> Result<(), String> {
    if bytes.len() > MAX_AUDIO_BYTES {
        return Err("Audio excede o limite seguro de tamanho.".to_string());
    }
    if bytes.len() < 44 || &bytes[0..4] != b"RIFF" || &bytes[8..12] != b"WAVE" {
        return Err("Audio WAV invalido.".to_string());
    }
    let audio_format = u16::from_le_bytes([bytes[20], bytes[21]]);
    let channels = u16::from_le_bytes([bytes[22], bytes[23]]);
    let sample_rate = u32::from_le_bytes([bytes[24], bytes[25], bytes[26], bytes[27]]);
    let bits_per_sample = u16::from_le_bytes([bytes[34], bytes[35]]);
    if audio_format != 1 || channels != 1 || sample_rate != 16_000 || bits_per_sample != 16 {
        return Err("Audio deve ser PCM WAV mono 16 kHz 16-bit.".to_string());
    }
    Ok(())
}

fn wav_duration_ms(bytes: &[u8]) -> Result<u64, String> {
    let data_len = u32::from_le_bytes([bytes[40], bytes[41], bytes[42], bytes[43]]) as u64;
    Ok(data_len * 1000 / 2 / 16_000)
}

fn normalize_language(language: &str) -> String {
    if language.to_ascii_lowercase().starts_with("pt") {
        "pt".to_string()
    } else {
        "en".to_string()
    }
}

fn sha256_file(path: &Path) -> Result<String, String> {
    let mut file = fs::File::open(path).map_err(|error| error.to_string())?;
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    loop {
        let read = file.read(&mut buffer).map_err(|error| error.to_string())?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(format!("{:x}", hasher.finalize()))
}

fn is_real_checksum(value: &str) -> bool {
    value.len() == 64 && value.chars().all(|item| item.is_ascii_hexdigit())
}

fn ensure_inside(base: &Path, child: &Path) -> Result<(), String> {
    let base = base
        .canonicalize()
        .unwrap_or_else(|_| base.to_path_buf());
    let parent = child
        .parent()
        .ok_or("Caminho local de voz invalido.")?
        .canonicalize()
        .unwrap_or_else(|_| child.parent().unwrap_or(base.as_path()).to_path_buf());
    if parent.starts_with(base) {
        Ok(())
    } else {
        Err("Caminho local de voz fora do diretorio permitido.".to_string())
    }
}

fn sanitize_transcript(text: &str) -> String {
    text.lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .filter(|line| !line.starts_with("whisper_") && !line.starts_with("system_info"))
        .collect::<Vec<_>>()
        .join(" ")
        .trim()
        .to_string()
}

fn sanitize_cli_text(text: &str) -> String {
    text.lines()
        .take(6)
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>()
        .join(" | ")
}

fn unavailable_status(diagnostic: String) -> LocalWhisperStatus {
    LocalWhisperStatus {
        available: false,
        integrity_ok: false,
        diagnostic,
        runtime_path: String::new(),
        model_path: String::new(),
        model_name: "ggml-base.bin".to_string(),
        version: "whisper.cpp v1.8.5".to_string(),
        checksum: "TO_BE_FILLED_BY_PREPARE_SCRIPT".to_string(),
        model_sha256: "TO_BE_FILLED_BY_PREPARE_SCRIPT".to_string(),
        runtime_sha256: "TO_BE_FILLED_BY_PREPARE_SCRIPT".to_string(),
        size_mb: 0,
        manifest_path: String::new(),
        source: "https://github.com/ggml-org/whisper.cpp".to_string(),
        license: "MIT".to_string(),
        audio_format: "mono PCM WAV 16 kHz 16-bit".to_string(),
        last_started_at: String::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_valid_pcm_wav_header() {
        let wav = test_wav(16_000, 1, 16, 320);
        assert!(validate_wav(&wav).is_ok());
        assert_eq!(wav_duration_ms(&wav).unwrap(), 10);
    }

    #[test]
    fn rejects_invalid_sample_rate() {
        let wav = test_wav(48_000, 1, 16, 960);
        assert!(validate_wav(&wav).is_err());
    }

    #[test]
    fn rejects_invalid_request_id() {
        assert!(validate_request_id("abc-123").is_ok());
        assert!(validate_request_id("../abc").is_err());
        assert!(validate_request_id("").is_err());
    }

    #[test]
    fn keeps_webview_logs_out_of_transcript() {
        let text = sanitize_transcript("system_info: test\n Ola Cronos \n");
        assert_eq!(text, "Ola Cronos");
    }

    fn test_wav(sample_rate: u32, channels: u16, bits: u16, data_size: u32) -> Vec<u8> {
        let mut bytes = vec![0_u8; 44 + data_size as usize];
        bytes[0..4].copy_from_slice(b"RIFF");
        bytes[8..12].copy_from_slice(b"WAVE");
        bytes[12..16].copy_from_slice(b"fmt ");
        bytes[16..20].copy_from_slice(&16_u32.to_le_bytes());
        bytes[20..22].copy_from_slice(&1_u16.to_le_bytes());
        bytes[22..24].copy_from_slice(&channels.to_le_bytes());
        bytes[24..28].copy_from_slice(&sample_rate.to_le_bytes());
        bytes[28..32].copy_from_slice(&(sample_rate * channels as u32 * (bits as u32 / 8)).to_le_bytes());
        bytes[32..34].copy_from_slice(&(channels * (bits / 8)).to_le_bytes());
        bytes[34..36].copy_from_slice(&bits.to_le_bytes());
        bytes[36..40].copy_from_slice(b"data");
        bytes[40..44].copy_from_slice(&data_size.to_le_bytes());
        bytes
    }
}
