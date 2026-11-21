mod files;
mod watcher;

use files::{FileData, FileError, KnownHashes};
use tauri::{Emitter, Manager, State};
use watcher::WatcherState;

#[derive(Default)]
pub struct AppState {
    pub known: KnownHashes,
    pub watcher: WatcherState,
    pub launch_files: Vec<String>,
}

#[tauri::command]
fn read_text_file(state: State<'_, AppState>, path: String) -> Result<FileData, FileError> {
    files::read_file(&state.known, &path)
}

#[tauri::command]
fn write_text_file(
    state: State<'_, AppState>,
    path: String,
    content: String,
    eol: String,
    bom: bool,
    force: bool,
) -> Result<(), FileError> {
    files::write_file(&state.known, &path, &content, &eol, bom, force)
}

/// Autorizza (solo) la cartella del file per le immagini e ne avvia la sorveglianza.
#[tauri::command]
fn watch_file(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    path: String,
) -> Result<(), String> {
    if let Some(dir) = std::path::Path::new(&path).parent() {
        app.asset_protocol_scope()
            .allow_directory(dir, true)
            .map_err(|e| e.to_string())?;
    }
    state.watcher.watch(&app, &path)
}

#[tauri::command]
fn unwatch_file(state: State<'_, AppState>, path: String) {
    state.watcher.unwatch(&path);
}

#[tauri::command]
fn take_launch_files(state: State<'_, AppState>) -> Vec<String> {
    state.launch_files.clone()
}

fn focus_main(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let launch_files = files::resolve_cli_paths(&args, None);

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
            let list = files::resolve_cli_paths(&args[1.min(args.len())..], Some(&cwd));
            if !list.is_empty() {
                let _ = app.emit("open-files", list);
            }
            focus_main(app);
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .manage(AppState {
            launch_files,
            ..Default::default()
        })
        .invoke_handler(tauri::generate_handler![
            read_text_file,
            write_text_file,
            watch_file,
            unwatch_file,
            take_launch_files
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(|app, event| {
        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Opened { urls } = &event {
            let list: Vec<String> = urls
                .iter()
                .filter_map(|u| u.to_file_path().ok())
                .map(|p| p.to_string_lossy().into_owned())
                .collect();
            if !list.is_empty() {
                let _ = app.emit("open-files", list);
            }
        }
        #[cfg(not(target_os = "macos"))]
        let _ = (app, event);
    });
}
