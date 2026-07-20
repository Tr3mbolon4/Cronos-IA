use tauri::Manager;
use tauri::WindowEvent;

mod runtime;

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
