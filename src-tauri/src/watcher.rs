//! Sorveglianza dei file aperti con `notify` (con debounce). Si osserva la
//! cartella del file (non ricorsiva), così anche i salvataggi "scrivi su
//! temporaneo e rinomina" di altri programmi vengono visti.

use crate::files::norm_path;
use notify::{RecommendedWatcher, RecursiveMode};
use notify_debouncer_mini::{DebounceEventResult, DebouncedEventBatch, Debouncer, new_debouncer};
use serde::Serialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

#[derive(Serialize, Clone)]
pub struct FileChanged {
    pub path: String,
    /// "modified" oppure "removed"
    pub status: String,
}

type Files = Arc<Mutex<HashMap<String, String>>>; // percorso normalizzato -> originale

struct Inner {
    debouncer: Debouncer<RecommendedWatcher>,
    dirs: HashMap<PathBuf, usize>,
}

#[derive(Default)]
pub struct WatcherState {
    files: Files,
    inner: Mutex<Option<Inner>>,
}

impl WatcherState {
    pub fn watch(&self, app: &AppHandle, path: &str) -> Result<(), String> {
        let key = norm_path(path);
        if self.files.lock().unwrap().contains_key(&key) {
            return Ok(());
        }
        let dir = Path::new(path)
            .parent()
            .ok_or_else(|| "percorso senza cartella".to_string())?
            .to_path_buf();
        let mut guard = self.inner.lock().unwrap();
        if guard.is_none() {
            let files = self.files.clone();
            let handle = app.clone();
            let debouncer = new_debouncer(
                Duration::from_millis(250),
                move |res: DebounceEventResult| {
                    match res {
                        Ok(DebouncedEventBatch::Events(events)) => {
                            handle_events(
                                &handle,
                                &files,
                                Some(events.iter().map(|e| e.path.clone())),
                            );
                        }
                        // eventi persi: si ricontrollano tutti i file sorvegliati
                        Ok(DebouncedEventBatch::Rescan) => {
                            handle_events(&handle, &files, None::<std::vec::IntoIter<PathBuf>>);
                        }
                        _ => {}
                    }
                },
            )
            .map_err(|e| e.to_string())?;
            *guard = Some(Inner {
                debouncer,
                dirs: HashMap::new(),
            });
        }
        let inner = guard.as_mut().unwrap();
        let count = inner.dirs.entry(dir.clone()).or_insert(0);
        if *count == 0 {
            inner
                .debouncer
                .watcher()
                .watch(&dir, RecursiveMode::NonRecursive)
                .map_err(|e| e.to_string())?;
        }
        *count += 1;
        self.files.lock().unwrap().insert(key, path.to_string());
        Ok(())
    }

    pub fn unwatch(&self, path: &str) {
        let key = norm_path(path);
        if self.files.lock().unwrap().remove(&key).is_none() {
            return;
        }
        let Some(dir) = Path::new(path).parent().map(|d| d.to_path_buf()) else {
            return;
        };
        if let Some(inner) = self.inner.lock().unwrap().as_mut()
            && let Some(c) = inner.dirs.get_mut(&dir)
        {
            *c -= 1;
            if *c == 0 {
                inner.dirs.remove(&dir);
                let _ = inner.debouncer.watcher().unwatch(&dir);
            }
        }
    }
}

fn handle_events(app: &AppHandle, files: &Files, paths: Option<impl Iterator<Item = PathBuf>>) {
    let mut affected: Vec<String> = Vec::new();
    {
        let map = files.lock().unwrap();
        let Some(paths) = paths else {
            affected.extend(map.values().cloned());
            drop(map);
            return notify_all(app, affected);
        };
        for p in paths {
            if let Some(orig) = map.get(&norm_path(&p.to_string_lossy()))
                && !affected.contains(orig)
            {
                affected.push(orig.clone());
            }
        }
    }
    notify_all(app, affected);
}

fn notify_all(app: &AppHandle, affected: Vec<String>) {
    let state = app.state::<crate::AppState>();
    for path in affected {
        match std::fs::read(&path) {
            Ok(bytes) => {
                if state.known.is_own(&path, &bytes) {
                    continue; // scrittura nostra o contenuto già noto
                }
                let _ = app.emit(
                    "file-changed",
                    FileChanged {
                        path,
                        status: "modified".into(),
                    },
                );
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                state.known.remove(&path);
                let _ = app.emit(
                    "file-changed",
                    FileChanged {
                        path,
                        status: "removed".into(),
                    },
                );
            }
            Err(_) => {} // file momentaneamente bloccato: arriverà un altro evento
        }
    }
}
