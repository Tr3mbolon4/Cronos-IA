use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};
use tauri::Manager;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

const MAX_AUDIO_BYTES: usize = 10 * 1024 * 1024;
const MAX_STDIO_BYTES: usize = 64 * 1024;
const TRANSCRIPTION_TIMEOUT_SECS: u64 = 120;
const OVERRIDE_ENV: &str = "CRONOS_LOCAL_WHISPER_DIR";
const LOG_FILE_NAME: &str = "whisper.log";
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

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
    model_size: u64,
    model_variant: Option<String>,
    multilingual: Option<bool>,
    official_source: Option<String>,
    imported_from_approved_channel: Option<bool>,
    source_and_destination_hashes_match: Option<bool>,
    integrity_validated: Option<bool>,
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
    source_kind: String,
    source_path: String,
    searched_paths: Vec<String>,
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
    let mut command = Command::new(&paths.runtime_path);
    command
        .arg("-m")
        .arg(&paths.model_path)
        .arg("-f")
        .arg(&wav_path)
        .arg("-l")
        .arg(&language)
        .arg("--prompt")
        .arg(technical_prompt(&language))
        .arg("-otxt")
        .arg("-of")
        .arg(&output_base)
        .arg("-nt")
        .current_dir(&paths.base_dir)
        .stdin(Stdio::null())
        .stdout(Stdio::from(stdout_file))
        .stderr(Stdio::from(stderr_file));
    #[cfg(windows)]
    command.creation_flags(CREATE_NO_WINDOW);
    append_whisper_log(&format!(
        "START request={} runtime={} model={} audioMs={} source={} temp={}",
        request.request_id,
        paths.runtime_path.display(),
        paths.model_path.display(),
        duration_ms,
        paths.source_kind,
        temp_dir.display()
    ));
    let child = command.spawn().map_err(|error| {
        let message = voice_error(
            "VOICE_RUNTIME_START_FAILED",
            "Nao foi possivel iniciar o reconhecimento local de voz.",
            &paths.runtime_path,
            Some(&error),
        );
        append_whisper_log(&message);
        message
    })?;

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
    append_whisper_log(&format!(
        "END request={} exit={:?} processingMs={} stderr={} stdout={}",
        request.request_id,
        exit_status.code(),
        started.elapsed().as_millis(),
        sanitize_cli_text(&stderr_text),
        sanitize_cli_text(&stdout_text)
    ));

    if !exit_status.success() {
        let _ = cleanup_temp_files(&[wav_path, output_path, stdout_path, stderr_path]);
        return Err(format!(
            "VOICE_RUNTIME_START_FAILED: whisper-cli.exe finalizou com codigo {:?}. {}",
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
    source_kind: String,
    searched_paths: Vec<PathBuf>,
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
    let manifest_has_checksums =
        is_real_checksum(&manifest.runtime_sha256) && is_real_checksum(&manifest.model_sha256);
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
        paths
            .model_path
            .metadata()
            .map(|item| item.len())
            .unwrap_or(0)
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
        source_kind: paths.source_kind,
        source_path: paths.base_dir.display().to_string(),
        searched_paths: paths
            .searched_paths
            .iter()
            .map(|path| path.display().to_string())
            .collect(),
    })
}

fn resolve_paths(app: &tauri::AppHandle) -> Result<LocalWhisperPaths, String> {
    let candidates = whisper_candidates(app);
    let searched_paths: Vec<PathBuf> = candidates
        .iter()
        .map(|candidate| candidate.path.clone())
        .collect();
    let mut missing = Vec::new();

    for candidate in candidates {
        let manifest_path = candidate.path.join("manifest.json");
        if !manifest_path.is_file() {
            missing.push(manifest_path.display().to_string());
            continue;
        }
        let manifest = read_manifest(&manifest_path)?;
        let runtime_path = candidate.path.join(&manifest.runtime_file);
        let model_path = candidate.path.join(&manifest.model_file);
        ensure_inside(&candidate.path, &runtime_path)?;
        ensure_inside(&candidate.path, &model_path)?;
        if !runtime_path.is_file() {
            return Err(voice_error(
                "VOICE_RUNTIME_NOT_FOUND",
                "Runtime local do Whisper nao encontrado.",
                &runtime_path,
                None,
            ));
        }
        if !model_path.is_file() {
            return Err(voice_error(
                "VOICE_MODEL_NOT_FOUND",
                "Modelo local do Whisper nao encontrado.",
                &model_path,
                None,
            ));
        }
        return Ok(LocalWhisperPaths {
            base_dir: candidate.path,
            manifest_path,
            runtime_path,
            model_path,
            source_kind: candidate.kind,
            searched_paths,
        });
    }

    Err(format!(
        "VOICE_MANIFEST_NOT_FOUND: Manifest local de voz nao encontrado. Caminhos procurados: {}",
        missing.join(" | ")
    ))
}

fn read_manifest(path: &Path) -> Result<LocalWhisperManifest, String> {
    let text = fs::read_to_string(path).map_err(|error| {
        voice_error(
            "VOICE_MANIFEST_NOT_FOUND",
            "Manifest local de voz nao encontrado.",
            path,
            Some(&error),
        )
    })?;
    let manifest: LocalWhisperManifest = serde_json::from_str(&text).map_err(|error| {
        format!(
            "VOICE_MANIFEST_INVALID: Manifest local de voz invalido. Caminho: {}. {} Erro: {error}",
            path.display(),
            manifest_file_diagnostics(path)
        )
    })?;
    if manifest.provider != "cronos-local-whisper" {
        return Err("Manifest local de voz possui provider inesperado.".to_string());
    }
    if !is_real_checksum(&manifest.runtime_sha256) || !is_real_checksum(&manifest.model_sha256) {
        return Err(
            "Manifest local de voz deve possuir SHA-256 reais de 64 caracteres.".to_string(),
        );
    }
    if manifest.model_name != "ggml-base.bin" || manifest.model_file != "models/ggml-base.bin" {
        return Err(
            "Manifest local de voz deve apontar para ggml-base.bin multilingue.".to_string(),
        );
    }
    if path_is_absolute_or_personal(&manifest.model_file)
        || path_is_absolute_or_personal(&manifest.runtime_file)
    {
        return Err(
            "Manifest local de voz nao pode usar caminhos absolutos ou pessoais.".to_string(),
        );
    }
    if manifest.model_name.contains(".en.") || manifest.model_file.contains(".en.") {
        return Err("Modelo English-only nao e permitido para o provider pt-BR.".to_string());
    }
    if manifest.runtime_file != "bin/whisper-cli.exe" {
        return Err("Manifest local de voz possui runtime inesperado.".to_string());
    }
    if manifest.model_size == 0 {
        return Err("Manifest local de voz deve registrar tamanho real do modelo.".to_string());
    }
    if manifest.model_variant.as_deref() != Some("base") || manifest.multilingual != Some(true) {
        return Err("Manifest local de voz deve declarar modelo base multilingue.".to_string());
    }
    if manifest.imported_from_approved_channel != Some(true)
        || manifest.source_and_destination_hashes_match != Some(true)
        || manifest.integrity_validated != Some(true)
    {
        return Err(
            "Manifest local de voz deve registrar importacao e integridade validadas.".to_string(),
        );
    }
    let official_source = manifest.official_source.as_deref().unwrap_or("");
    if path_is_absolute_or_personal(&manifest.runtime_source)
        || path_is_absolute_or_personal(&manifest.model_source)
        || path_is_absolute_or_personal(official_source)
    {
        return Err(
            "Manifest local de voz nao pode registrar caminho pessoal como origem oficial."
                .to_string(),
        );
    }
    Ok(manifest)
}

struct WhisperCandidate {
    kind: String,
    path: PathBuf,
}

fn whisper_candidates(app: &tauri::AppHandle) -> Vec<WhisperCandidate> {
    let mut candidates = Vec::new();
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            candidates.push(WhisperCandidate {
                kind: "build-resource-dir".to_string(),
                path: exe_dir.join("resources").join("voice").join("whisper"),
            });
        }
    }
    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(WhisperCandidate {
            kind: "tauri-resource-dir".to_string(),
            path: resource_dir.join("voice").join("whisper"),
        });
    }
    if let Ok(path) = std::env::var(OVERRIDE_ENV) {
        candidates.push(WhisperCandidate {
            kind: format!("admin-env:{OVERRIDE_ENV}"),
            path: PathBuf::from(path),
        });
    }
    if let Some(local_app_data) = std::env::var_os("LOCALAPPDATA") {
        let base = PathBuf::from(local_app_data)
            .join("CRONOS")
            .join("models")
            .join("voice");
        candidates.push(WhisperCandidate {
            kind: "localappdata-models".to_string(),
            path: base.join("whisper"),
        });
        candidates.push(WhisperCandidate {
            kind: "localappdata-models-root".to_string(),
            path: base,
        });
    }
    if let Some(program_data) = std::env::var_os("PROGRAMDATA") {
        let base = PathBuf::from(program_data)
            .join("CRONOS")
            .join("models")
            .join("voice");
        candidates.push(WhisperCandidate {
            kind: "programdata-models".to_string(),
            path: base.join("whisper"),
        });
        candidates.push(WhisperCandidate {
            kind: "programdata-models-root".to_string(),
            path: base,
        });
    }
    candidates
}

fn voice_error(
    code: &str,
    message: &str,
    path: &Path,
    io_error: Option<&std::io::Error>,
) -> String {
    let detail = io_error
        .map(|error| format!(" Codigo: {:?}. Erro: {error}", error.raw_os_error()))
        .unwrap_or_default();
    format!("{code}: {message} Caminho: {}.{detail}", path.display())
}

fn manifest_file_diagnostics(path: &Path) -> String {
    let bytes = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(error) => return format!("Nao foi possivel inspecionar bytes: {error}."),
    };
    let size = bytes.len();
    let sha256 = sha256_file(path).unwrap_or_else(|_| "sha256-indisponivel".to_string());
    let first_bytes = bytes
        .iter()
        .take(32)
        .map(|byte| format!("{byte:02X}"))
        .collect::<Vec<_>>()
        .join(" ");
    let encoding = if bytes.starts_with(&[0xEF, 0xBB, 0xBF]) {
        "UTF-8 com BOM"
    } else if bytes.starts_with(&[0xFF, 0xFE]) {
        "UTF-16 LE"
    } else if bytes.starts_with(&[0xFE, 0xFF]) {
        "UTF-16 BE"
    } else if std::str::from_utf8(&bytes).is_ok() {
        "UTF-8 sem BOM"
    } else {
        "desconhecida/nao UTF-8"
    };
    let contains_git_lfs = bytes.starts_with(b"version https://git-lfs.github.com/spec/v1");
    let starts_html = String::from_utf8_lossy(&bytes)
        .trim_start()
        .starts_with('<');
    format!(
        "Tamanho: {size} bytes. SHA-256: {sha256}. Encoding aparente: {encoding}. Primeiros bytes: {first_bytes}. GitLFS: {contains_git_lfs}. HTML: {starts_html}."
    )
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
    cleanup_stale_temp_files(&temp_dir);
    Ok(temp_dir)
}

fn cleanup_stale_temp_files(temp_dir: &Path) {
    let Ok(entries) = fs::read_dir(temp_dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let Some(name) = path.file_name().and_then(|item| item.to_str()) else {
            continue;
        };
        let allowed_extension = matches!(
            path.extension().and_then(|item| item.to_str()),
            Some("wav" | "txt")
        );
        if name.starts_with("cronos-voice-") && allowed_extension {
            let _ = fs::remove_file(path);
        }
    }
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

fn append_whisper_log(line: &str) {
    let Some(log_dir) = std::env::var_os("LOCALAPPDATA")
        .map(|value| PathBuf::from(value).join("CRONOS").join("logs"))
    else {
        return;
    };
    let _ = fs::create_dir_all(&log_dir);
    let path = log_dir.join(LOG_FILE_NAME);
    if let Ok(mut file) = fs::OpenOptions::new().create(true).append(true).open(path) {
        let _ = writeln!(file, "{line}");
    }
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

fn technical_prompt(language: &str) -> &'static str {
    if language == "pt" {
        "Transcreva em portugues do Brasil. Preserve termos tecnicos: IP, ping, ipconfig, CMD, PowerShell, GPU, RAM, PDF, CRONOS."
    } else {
        "Transcribe technical commands and product names exactly."
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

fn path_is_absolute_or_personal(value: &str) -> bool {
    if value.is_empty() {
        return false;
    }
    let lower = value.to_ascii_lowercase();
    Path::new(value).is_absolute()
        || lower.starts_with("\\\\")
        || lower.contains(":\\")
        || lower.contains("\\users\\")
}

fn ensure_inside(base: &Path, child: &Path) -> Result<(), String> {
    let base = base.canonicalize().unwrap_or_else(|_| base.to_path_buf());
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
        source_kind: "not-resolved".to_string(),
        source_path: String::new(),
        searched_paths: Vec::new(),
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
    fn portuguese_prompt_preserves_network_terms() {
        let prompt = technical_prompt(&normalize_language("pt-BR"));
        assert!(prompt.contains("IP"));
        assert!(prompt.contains("ping"));
        assert!(prompt.contains("ipconfig"));
    }

    #[test]
    fn rejects_english_only_model_manifest() {
        let manifest = valid_manifest()
            .replace(
                r#""modelName":"ggml-base.bin""#,
                r#""modelName":"ggml-base.en.bin""#,
            )
            .replace(
                r#""modelFile":"models/ggml-base.bin""#,
                r#""modelFile":"models/ggml-base.en.bin""#,
            );
        assert_manifest_rejected("english-only", &manifest);
    }

    #[test]
    fn rejects_manifest_without_real_sha256() {
        let sha1_manifest = valid_manifest().replace(
            r#""modelSha256":"60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe""#,
            r#""modelSha256":"465707469ff3a37a2b9b8d8f89f2f99de7299dac""#,
        );
        assert_manifest_rejected("sha1", &sha1_manifest);

        let placeholder_manifest = valid_manifest().replace(
            r#""modelSha256":"60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe""#,
            r#""modelSha256":"TO_BE_FILLED_BY_PREPARE_SCRIPT""#,
        );
        assert_manifest_rejected("placeholder", &placeholder_manifest);
    }

    #[test]
    fn rejects_manifest_with_zero_size_or_personal_paths() {
        let zero_size_manifest =
            valid_manifest().replace(r#""modelSize":147951465"#, r#""modelSize":0"#);
        assert_manifest_rejected("zero-size", &zero_size_manifest);

        let absolute_model_manifest = valid_manifest().replace(
            r#""modelFile":"models/ggml-base.bin""#,
            r#""modelFile":"C:\\Users\\alexandre_santos\\Downloads\\ggml-base.bin""#,
        );
        assert_manifest_rejected("absolute-model", &absolute_model_manifest);

        let personal_source_manifest = valid_manifest().replace(
            r#""officialSource":"https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin""#,
            r#""officialSource":"G:\\Cronos-IA\\models\\ggml-base.bin""#,
        );
        assert_manifest_rejected("personal-source", &personal_source_manifest);
    }

    #[test]
    fn accepts_valid_local_whisper_manifest() {
        let path = std::env::temp_dir().join("cronos-valid-local-whisper-manifest.json");
        fs::write(&path, valid_manifest()).unwrap();
        let result = read_manifest(&path);
        let _ = fs::remove_file(path);
        assert!(result.is_ok());
    }

    #[test]
    fn rejects_manifest_with_utf8_bom_like_desktop_parser() {
        let path = std::env::temp_dir().join("cronos-utf8-bom-local-whisper-manifest.json");
        let mut bytes = vec![0xEF, 0xBB, 0xBF];
        bytes.extend_from_slice(valid_manifest().as_bytes());
        fs::write(&path, bytes).unwrap();
        let result = read_manifest(&path);
        let _ = fs::remove_file(path);
        let error = result.err().unwrap_or_default();
        assert!(error.contains("VOICE_MANIFEST_INVALID"));
        assert!(error.contains("UTF-8 com BOM"));
    }

    #[test]
    fn rejects_manifest_with_invalid_json_payloads() {
        assert_manifest_bytes_rejected("empty", &[]);
        assert_manifest_bytes_rejected("only-bom", &[0xEF, 0xBB, 0xBF]);
        let mut utf16 = vec![0xFF, 0xFE];
        for unit in valid_manifest().encode_utf16() {
            utf16.extend_from_slice(&unit.to_le_bytes());
        }
        assert_manifest_bytes_rejected("utf16-le", &utf16);
        assert_manifest_rejected("html", "<html>erro</html>");
        assert_manifest_rejected(
            "git-lfs-pointer",
            "version https://git-lfs.github.com/spec/v1\noid sha256:test\nsize 123",
        );
        assert_manifest_rejected("truncated-json", "{\"provider\":\"cronos-local-whisper\"");
    }

    #[test]
    fn rejects_manifest_with_missing_required_fields() {
        let missing_runtime =
            valid_manifest().replace(r#""runtimeFile":"bin/whisper-cli.exe","#, "");
        assert_manifest_rejected("missing-runtime-file", &missing_runtime);
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
        bytes[28..32]
            .copy_from_slice(&(sample_rate * channels as u32 * (bits as u32 / 8)).to_le_bytes());
        bytes[32..34].copy_from_slice(&(channels * (bits / 8)).to_le_bytes());
        bytes[34..36].copy_from_slice(&bits.to_le_bytes());
        bytes[36..40].copy_from_slice(b"data");
        bytes[40..44].copy_from_slice(&data_size.to_le_bytes());
        bytes
    }

    fn assert_manifest_rejected(name: &str, manifest: &str) {
        let path = std::env::temp_dir().join(format!("cronos-{name}-manifest.json"));
        fs::write(&path, manifest).unwrap();
        let result = read_manifest(&path);
        let _ = fs::remove_file(path);
        assert!(result.is_err(), "manifest {name} should be rejected");
    }

    fn assert_manifest_bytes_rejected(name: &str, manifest: &[u8]) {
        let path = std::env::temp_dir().join(format!("cronos-{name}-manifest.json"));
        fs::write(&path, manifest).unwrap();
        let result = read_manifest(&path);
        let _ = fs::remove_file(path);
        assert!(result.is_err(), "manifest {name} should be rejected");
    }

    fn valid_manifest() -> String {
        r#"{
            "provider":"cronos-local-whisper",
            "runtimeVersion":"whisper.cpp v1.8.5",
            "runtimeFile":"bin/whisper-cli.exe",
            "runtimeSha256":"3716AC2A3203DEF41CB49FC0CB49A03A4E4B75D7C5A1889F77164553D75FE060",
            "runtimeSource":"https://github.com/ggml-org/whisper.cpp/releases/tag/v1.8.5",
            "modelName":"ggml-base.bin",
            "modelVersion":"openai-whisper-base-ggml",
            "modelFile":"models/ggml-base.bin",
            "modelSha256":"60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe",
            "modelSize":147951465,
            "modelVariant":"base",
            "multilingual":true,
            "officialSource":"https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin",
            "importedFromApprovedChannel":true,
            "sourceAndDestinationHashesMatch":true,
            "integrityValidated":true,
            "modelSource":"https://huggingface.co/ggerganov/whisper.cpp",
            "architecture":"windows-x86_64-cpu",
            "languageSupport":["pt-BR","pt","multilingual"],
            "audioFormat":"mono PCM WAV 16 kHz 16-bit",
            "license":"MIT",
            "createdAt":"2026-07-21T00:00:00Z"
        }"#.to_string()
    }
}
