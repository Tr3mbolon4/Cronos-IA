use tauri::Manager;
use tauri::WindowEvent;

mod runtime;

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct LocalWhisperStatus {
    available: bool,
    diagnostic: String,
    runtime_path: String,
    model_path: String,
    model_name: String,
    version: String,
    checksum: String,
    size_mb: u16,
    last_started_at: String,
}

#[tauri::command]
fn get_local_whisper_status() -> LocalWhisperStatus {
    let base_dir = std::env::var("CRONOS_LOCAL_WHISPER_DIR")
        .map(std::path::PathBuf::from)
        .ok()
        .or_else(|| {
            std::env::current_exe()
                .ok()
                .and_then(|path| path.parent().map(|parent| parent.join("voice").join("whisper")))
        })
        .unwrap_or_else(|| std::path::PathBuf::from("voice").join("whisper"));

    let runtime_path = base_dir.join("whisper-cli.exe");
    let model_path = base_dir.join("models").join("ggml-base.bin");
    let runtime_exists = runtime_path.is_file();
    let model_exists = model_path.is_file();
    let package_ready = runtime_exists && model_exists;
    let available = false;
    let diagnostic = match (runtime_exists, model_exists) {
        (true, true) => "Runtime e modelo locais encontrados, mas o bridge PCM WAV/transcricao ainda nao foi habilitado para validacao real.".to_string(),
        (false, true) => "Runtime whisper-cli.exe ausente no pacote local.".to_string(),
        (true, false) => "Modelo ggml-base.bin ausente no pacote local.".to_string(),
        (false, false) => "Runtime whisper-cli.exe e modelo ggml-base.bin ausentes no pacote local.".to_string(),
    };

    LocalWhisperStatus {
        available: available && package_ready,
        diagnostic,
        runtime_path: runtime_path.display().to_string(),
        model_path: model_path.display().to_string(),
        model_name: "ggml-base.bin".to_string(),
        version: "whisper.cpp v1.8.x".to_string(),
        checksum: "pending-release-artifact".to_string(),
        size_mb: 142,
        last_started_at: String::new(),
    }
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_focus();
            }
        }))
        .invoke_handler(tauri::generate_handler![
            runtime::backend::get_runtime_connection,
            runtime::backend::get_runtime_status,
            runtime::backend::restart_backend,
            runtime::backend::open_logs_directory,
            runtime::backend::shutdown_cronos,
            get_local_whisper_status,
        ])
        .setup(|app| {
            let runtime = runtime::BackendRuntime::new();
            runtime.start(app.handle().clone())?;
            app.manage(runtime);
            Ok(())
        })
        .on_window_event(|window, event| {
            if matches!(event, WindowEvent::CloseRequested { .. }) {
                let runtime = window.state::<runtime::BackendRuntime>();
                runtime.shutdown();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running CRONOS desktop");
}
