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

fn require_open(state: &AppState, md_path: &str) -> Result<(), FileError> {
    if state.watcher.is_open(md_path) {
        Ok(())
    } else {
        Err(FileError::io("Il documento non è tra i file aperti"))
    }
}

/// Immagine incollata: i byte arrivano come corpo grezzo della chiamata, il percorso del
/// documento e l'estensione nelle intestazioni `x-md-path` (codificato) e `x-ext`.
/// Il nome del file lo costruisce `files::save_image`.
#[tauri::command]
fn save_pasted_image(
    state: State<'_, AppState>,
    request: tauri::ipc::Request<'_>,
) -> Result<String, FileError> {
    let header = |name: &str| {
        request
            .headers()
            .get(name)
            .and_then(|v| v.to_str().ok())
            .map(|s| s.to_string())
    };
    let md_path = header("x-md-path")
        .and_then(|v| files::percent_decode(&v))
        .ok_or_else(|| FileError::io("Percorso del documento mancante"))?;
    let ext = header("x-ext").ok_or_else(|| FileError::io("Estensione mancante"))?;
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err(FileError::io("Dati dell'immagine mancanti"));
    };
    require_open(&state, &md_path)?;
    files::save_image(Path::new(&md_path), bytes, &ext)
}

/// Pulsante «Immagine»: copia nella cartella `immagini` del documento un file scelto dall'utente.
#[tauri::command]
fn import_image(
    state: State<'_, AppState>,
    md_path: String,
    src_path: String,
) -> Result<String, FileError> {
    require_open(&state, &md_path)?;
    let src = Path::new(&src_path);
    let ext = src
        .extension()
        .map(|e| e.to_string_lossy().into_owned())
        .unwrap_or_default();
    files::image_ext(&ext)?;
    // solo file normali: niente collegamenti, cartelle o file speciali
    let link = std::fs::symlink_metadata(src).map_err(FileError::io)?;
    if link.file_type().is_symlink() {
        return Err(FileError::io("L'immagine scelta è un collegamento"));
    }
    let meta = std::fs::metadata(src).map_err(FileError::io)?;
    if !meta.is_file() {
        return Err(FileError::io("L'immagine scelta non è un file normale"));
    }
    let len = meta.len();
    if len > files::MAX_IMAGE_BYTES as u64 {
        return Err(FileError::io("Immagine troppo grande (massimo 20 MB)"));
    }
    let bytes = std::fs::read(src).map_err(FileError::io)?;
    files::save_image(Path::new(&md_path), &bytes, &ext)
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
            save_pasted_image,
            import_image,
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
