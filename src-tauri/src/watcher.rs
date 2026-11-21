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

/// Registro dei file sorvegliati, con il conteggio dei riferimenti per file
/// (la stessa cosa può essere chiesta due volte) e per cartella.
#[derive(Default)]
pub struct Registry {
    /// percorso normalizzato -> (percorso originale, riferimenti)
    files: HashMap<String, (String, usize)>,
    dirs: HashMap<PathBuf, usize>,
}

impl Registry {
    /// Aggiunge un riferimento. Vero se la cartella va messa sotto sorveglianza adesso.
    pub fn add(&mut self, path: &str, dir: &Path) -> bool {
        let entry = self
            .files
            .entry(norm_path(path))
            .or_insert_with(|| (path.to_string(), 0));
        entry.1 += 1;
        if entry.1 > 1 {
            return false;
        }
        let c = self.dirs.entry(dir.to_path_buf()).or_insert(0);
        *c += 1;
        *c == 1
    }

    /// Toglie un riferimento. Vero se la cartella non serve più e va lasciata.
    pub fn remove(&mut self, path: &str, dir: &Path) -> bool {
        let key = norm_path(path);
        let Some(entry) = self.files.get_mut(&key) else {
            return false;
        };
        entry.1 -= 1;
        if entry.1 > 0 {
            return false;
        }
        self.files.remove(&key);
        match self.dirs.get_mut(dir) {
            Some(c) if *c > 1 => {
                *c -= 1;
                false
            }
            Some(_) => {
                self.dirs.remove(dir);
                true
            }
            None => false,
        }
    }

    #[cfg(test)]
    pub fn refs(&self, path: &str) -> usize {
        self.files.get(&norm_path(path)).map_or(0, |e| e.1)
    }

    fn lookup(&self, normalized: &str) -> Option<&String> {
        self.files.get(normalized).map(|e| &e.0)
    }

    fn originals(&self) -> Vec<String> {
        self.files.values().map(|e| e.0.clone()).collect()
    }
}

type Shared = Arc<Mutex<Registry>>;

#[derive(Default)]
pub struct WatcherState {
    registry: Shared,
    debouncer: Mutex<Option<Debouncer<RecommendedWatcher>>>,
}

impl WatcherState {
    pub fn watch(&self, app: &AppHandle, path: &str) -> Result<(), String> {
        let dir = Path::new(path)
            .parent()
            .ok_or_else(|| "percorso senza cartella".to_string())?
            .to_path_buf();
        let mut guard = self.debouncer.lock().unwrap();
        if guard.is_none() {
            let registry = self.registry.clone();
            let handle = app.clone();
            let debouncer = new_debouncer(
                Duration::from_millis(250),
                move |res: DebounceEventResult| match res {
                    Ok(DebouncedEventBatch::Events(events)) => {
                        handle_events(
                            &handle,
                            &registry,
                            Some(events.iter().map(|e| e.path.clone())),
                        );
                    }
                    // eventi persi: si ricontrollano tutti i file sorvegliati
                    Ok(DebouncedEventBatch::Rescan) => {
                        handle_events(&handle, &registry, None::<std::vec::IntoIter<PathBuf>>);
                    }
                    _ => {}
                },
            )
            .map_err(|e| e.to_string())?;
            *guard = Some(debouncer);
        }
        let need_watch = self.registry.lock().unwrap().add(path, &dir);
        if need_watch
            && let Err(e) = guard
                .as_mut()
                .unwrap()
                .watcher()
                .watch(&dir, RecursiveMode::NonRecursive)
        {
            self.registry.lock().unwrap().remove(path, &dir);
            return Err(e.to_string());
        }
        Ok(())
    }

    pub fn unwatch(&self, path: &str) {
        let Some(dir) = Path::new(path).parent().map(|d| d.to_path_buf()) else {
            return;
        };
        let drop_dir = self.registry.lock().unwrap().remove(path, &dir);
        if drop_dir && let Some(d) = self.debouncer.lock().unwrap().as_mut() {
            let _ = d.watcher().unwatch(&dir);
        }
    }
}

fn handle_events(app: &AppHandle, registry: &Shared, paths: Option<impl Iterator<Item = PathBuf>>) {
    let mut affected: Vec<String> = Vec::new();
    {
        let reg = registry.lock().unwrap();
        match paths {
            None => affected = reg.originals(),
            Some(paths) => {
                for p in paths {
                    if let Some(orig) = reg.lookup(&norm_path(&p.to_string_lossy()))
                        && !affected.contains(orig)
                    {
                        affected.push(orig.clone());
                    }
                }
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn unwatch_only_drops_at_the_last_reference() {
        let mut r = Registry::default();
        let dir = Path::new("/doc");
        assert!(r.add("/doc/a.md", dir)); // prima cartella: va sorvegliata
        assert!(!r.add("/doc/a.md", dir)); // stesso file, secondo riferimento
        assert!(!r.add("/doc/b.md", dir)); // altro file nella stessa cartella
        assert_eq!(r.refs("/doc/a.md"), 2);

        assert!(!r.remove("/doc/a.md", dir)); // resta un riferimento
        assert_eq!(r.refs("/doc/a.md"), 1);
        assert!(r.lookup(&norm_path("/doc/a.md")).is_some());

        assert!(!r.remove("/doc/a.md", dir)); // ultimo di a.md, ma b.md tiene la cartella
        assert_eq!(r.refs("/doc/a.md"), 0);
        assert!(r.remove("/doc/b.md", dir)); // ultimo file: la cartella si lascia
        assert!(!r.remove("/doc/b.md", dir)); // già tolto: niente da fare
    }
}
