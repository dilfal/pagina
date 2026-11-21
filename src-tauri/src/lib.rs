mod files;
mod watcher;

use files::{FileData, FileError, KnownHashes, norm_path};
use std::path::Path;
use std::sync::Mutex;
use tauri::{Emitter, Manager, State};
use watcher::WatcherState;

/// File da aprire in attesa che il frontend sia pronto (primo avvio e secondi
/// avvii arrivati troppo presto). Dopo `take` gli arrivi vanno subito al frontend.
#[derive(Default)]
pub struct LaunchQueue(Mutex<LaunchInner>);

#[derive(Default)]
struct LaunchInner {
    ready: bool,
    queue: Vec<String>,
}

impl LaunchQueue {
    pub fn with_files(files: Vec<String>) -> Self {
        LaunchQueue(Mutex::new(LaunchInner {
            ready: false,
            queue: files,
        }))
    }

    /// Se il frontend è pronto restituisce i file da emettere subito; altrimenti li mette in coda.
    pub fn offer(&self, files: Vec<String>) -> Option<Vec<String>> {
        let mut g = self.0.lock().unwrap();
        if g.ready {
            Some(files)
        } else {
            for f in files {
                if !g.queue.contains(&f) {
                    g.queue.push(f);
                }
            }
            None
        }
    }

    /// Il frontend ha registrato i listener: restituisce (una volta) la coda e passa a "pronto".
    pub fn take(&self) -> Vec<String> {
        let mut g = self.0.lock().unwrap();
        g.ready = true;
        std::mem::take(&mut g.queue)
    }
}

#[derive(Default)]
pub struct AppState {
    pub known: KnownHashes,
    pub watcher: WatcherState,
    pub launch: LaunchQueue,
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

/// Radice di un'unità o cartella home: lì l'accesso alle immagini non è ricorsivo.
fn is_broad_dir(dir: &Path, home: Option<&Path>) -> bool {
    if dir.parent().is_none() {
        return true;
    }
    let trim = |p: &Path| {
        norm_path(&p.to_string_lossy())
            .trim_end_matches('/')
            .to_string()
    };
    home.is_some_and(|h| trim(h) == trim(dir))
}

/// Autorizza (solo) la cartella del file per le immagini e ne avvia la sorveglianza.
/// Tauri 2.12 non permette di revocare una cartella dallo scope (`forbid_directory`
/// vieta per sempre), quindi l'autorizzazione dura fino alla chiusura del programma.
#[tauri::command]
fn watch_file(
    app: tauri::AppHandle,
    state: State<'_, AppState>,
    path: String,
) -> Result<(), String> {
    if let Some(dir) = Path::new(&path).parent() {
        let home = app.path().home_dir().ok();
        let recursive = !is_broad_dir(dir, home.as_deref());
        app.asset_protocol_scope()
            .allow_directory(dir, recursive)
            .map_err(|e| e.to_string())?;
    }
    state.watcher.watch(&app, &path)
}

#[tauri::command]
fn unwatch_file(state: State<'_, AppState>, path: String) {
    state.watcher.unwatch(&path);
}

/// Il frontend lo chiama dopo aver registrato i listener: restituisce i file in coda.
#[tauri::command]
fn take_launch_files(state: State<'_, AppState>) -> Vec<String> {
    state.launch.take()
}

fn focus_main(app: &tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

/// Manda i file al frontend se è pronto, altrimenti li accoda.
fn deliver(app: &tauri::AppHandle, list: Vec<String>) {
    if list.is_empty() {
        return;
    }
    if let Some(now) = app.state::<AppState>().launch.offer(list) {
        let _ = app.emit("open-files", now);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let launch_files = files::resolve_cli_paths(&args, None);

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
            let list = files::resolve_cli_paths(&args[1.min(args.len())..], Some(&cwd));
            deliver(app, list);
            focus_main(app);
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .manage(AppState {
            launch: LaunchQueue::with_files(launch_files),
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
            deliver(app, list);
        }
        #[cfg(not(target_os = "macos"))]
        let _ = (app, event);
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn launch_queue_holds_files_until_frontend_is_ready_and_never_duplicates() {
        let q = LaunchQueue::with_files(vec!["a.md".into()]);
        // secondo avvio troppo presto: in coda, niente evento
        assert_eq!(q.offer(vec!["b.md".into(), "a.md".into()]), None);
        assert_eq!(q.take(), vec!["a.md".to_string(), "b.md".to_string()]);
        // ora il frontend è pronto: gli arrivi vanno direttamente all'evento
        assert_eq!(q.offer(vec!["c.md".into()]), Some(vec!["c.md".to_string()]));
        // la coda si legge una volta sola
        assert!(q.take().is_empty());
    }

    #[test]
    fn root_and_home_are_not_recursive() {
        let home = Path::new("/home/utente");
        assert!(is_broad_dir(Path::new("/"), Some(home)));
        assert!(is_broad_dir(Path::new("/home/utente/"), Some(home)));
        assert!(!is_broad_dir(Path::new("/home/utente/doc"), Some(home)));
        assert!(!is_broad_dir(Path::new("/tmp/x"), None));
    }
}
