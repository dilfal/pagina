//! Lettura e scrittura dei file di testo: BOM, fine riga, scrittura atomica,
//! riconoscimento delle proprie scritture (hash del contenuto) e rilevamento
//! dei conflitti con modifiche esterne.

use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::hash::Hasher;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

const BOM: &[u8] = &[0xEF, 0xBB, 0xBF];

/// Errore serializzabile verso il frontend.
#[derive(Debug, Serialize, Clone, PartialEq)]
pub struct FileError {
    /// "conflict", "notfound" oppure "io"
    pub kind: String,
    pub message: String,
}

impl FileError {
    pub fn io(message: impl ToString) -> Self {
        FileError {
            kind: "io".into(),
            message: message.to_string(),
        }
    }
    pub fn conflict() -> Self {
        FileError {
            kind: "conflict".into(),
            message: "Il file è stato modificato sul disco".into(),
        }
    }
}

#[derive(Debug, Serialize, Clone, PartialEq)]
pub struct FileData {
    /// Contenuto con fine riga normalizzati a "\n".
    pub content: String,
    /// Fine riga originale del file: "\n" oppure "\r\n".
    pub eol: String,
    /// Il file iniziava con il BOM UTF-8.
    pub bom: bool,
}

pub fn hash_bytes(bytes: &[u8]) -> u64 {
    let mut h = std::hash::DefaultHasher::new();
    h.write(bytes);
    h.finish()
}

/// Decodifica UTF-8 tollerando il BOM; rileva la fine riga prevalente.
pub fn decode(bytes: &[u8]) -> Result<FileData, FileError> {
    let (bom, body) = match bytes.strip_prefix(BOM) {
        Some(rest) => (true, rest),
        None => (false, bytes),
    };
    let text =
        std::str::from_utf8(body).map_err(|_| FileError::io("Il file non è testo UTF-8 valido"))?;
    let crlf = text.matches("\r\n").count();
    let lf = text.matches('\n').count() - crlf;
    let eol = if crlf > lf { "\r\n" } else { "\n" };
    Ok(FileData {
        content: text.replace("\r\n", "\n"),
        eol: eol.to_string(),
        bom,
    })
}

/// Il contrario di `decode`: riapplica fine riga e BOM originali.
pub fn encode(content: &str, eol: &str, bom: bool) -> Vec<u8> {
    let mut out = Vec::with_capacity(content.len() + 3);
    if bom {
        out.extend_from_slice(BOM);
    }
    if eol == "\r\n" {
        out.extend_from_slice(content.replace('\n', "\r\n").as_bytes());
    } else {
        out.extend_from_slice(content.as_bytes());
    }
    out
}

/// Scrittura atomica: file temporaneo nella stessa cartella, sync, rename.
pub fn atomic_write(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let dir = path.parent().unwrap_or_else(|| Path::new("."));
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_else(|| "file".into());
    let tmp = dir.join(format!(".{name}.pagina-tmp"));
    let result = (|| {
        let mut f = fs::File::create(&tmp)?;
        f.write_all(bytes)?;
        f.sync_all()?;
        drop(f);
        if let Ok(meta) = fs::metadata(path) {
            let _ = fs::set_permissions(&tmp, meta.permissions());
        }
        fs::rename(&tmp, path)
    })();
    if result.is_err() {
        let _ = fs::remove_file(&tmp);
    }
    result
}

/// Chiave di confronto per i percorsi (separatori uniformi, prefisso `\\?\`
/// tolto, minuscole su Windows).
pub fn norm_path(p: &str) -> String {
    let p = p.strip_prefix(r"\\?\").unwrap_or(p);
    let s = p.replace('\\', "/");
    if cfg!(windows) { s.to_lowercase() } else { s }
}

/// Hash dell'ultimo contenuto letto o scritto da noi, per percorso.
#[derive(Default)]
pub struct KnownHashes(Mutex<HashMap<String, u64>>);

impl KnownHashes {
    pub fn set(&self, path: &str, hash: u64) {
        self.0.lock().unwrap().insert(norm_path(path), hash);
    }
    pub fn get(&self, path: &str) -> Option<u64> {
        self.0.lock().unwrap().get(&norm_path(path)).copied()
    }
    pub fn remove(&self, path: &str) {
        self.0.lock().unwrap().remove(&norm_path(path));
    }
    /// Vero se il contenuto sul disco è quello che conosciamo già
    /// (scritto da noi o già letto): l'evento va ignorato.
    pub fn is_own(&self, path: &str, bytes_on_disk: &[u8]) -> bool {
        self.get(path) == Some(hash_bytes(bytes_on_disk))
    }
}

pub fn read_file(known: &KnownHashes, path: &str) -> Result<FileData, FileError> {
    let bytes = fs::read(path).map_err(|e| {
        if e.kind() == std::io::ErrorKind::NotFound {
            FileError {
                kind: "notfound".into(),
                message: e.to_string(),
            }
        } else {
            FileError::io(e)
        }
    })?;
    let data = decode(&bytes)?;
    known.set(path, hash_bytes(&bytes));
    Ok(data)
}

/// Scrive il file. Senza `force`, rifiuta se sul disco c'è un contenuto
/// diverso da quello che conosciamo (modifica esterna non ancora gestita).
pub fn write_file(
    known: &KnownHashes,
    path: &str,
    content: &str,
    eol: &str,
    bom: bool,
    force: bool,
) -> Result<(), FileError> {
    let p = PathBuf::from(path);
    if !force
        && let (Some(k), Ok(disk)) = (known.get(path), fs::read(&p))
        && hash_bytes(&disk) != k
    {
        return Err(FileError::conflict());
    }
    let bytes = encode(content, eol, bom);
    atomic_write(&p, &bytes).map_err(FileError::io)?;
    known.set(path, hash_bytes(&bytes));
    Ok(())
}

/// Trasforma gli argomenti della riga di comando in percorsi assoluti di
/// file esistenti (ignora le opzioni che iniziano con `-`).
pub fn resolve_cli_paths(args: &[String], cwd: Option<&str>) -> Vec<String> {
    args.iter()
        .filter(|a| !a.starts_with('-') && !a.is_empty())
        .filter_map(|a| {
            let p = PathBuf::from(a);
            let abs = if p.is_absolute() {
                p
            } else {
                match cwd {
                    Some(c) => Path::new(c).join(p),
                    None => std::path::absolute(&p).ok()?,
                }
            };
            if abs.is_file() {
                Some(abs.to_string_lossy().into_owned())
            } else {
                None
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmpdir(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("pagina-test-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&d);
        fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn atomic_write_creates_and_replaces_without_leftovers() {
        let d = tmpdir("atomic");
        let f = d.join("a.md");
        atomic_write(&f, b"uno").unwrap();
        assert_eq!(fs::read(&f).unwrap(), b"uno");
        atomic_write(&f, b"due e piu lungo").unwrap();
        assert_eq!(fs::read(&f).unwrap(), b"due e piu lungo");
        let names: Vec<_> = fs::read_dir(&d)
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .collect();
        assert_eq!(names, vec!["a.md".to_string()]);
        fs::remove_dir_all(&d).unwrap();
    }

    #[test]
    fn decode_handles_bom_and_crlf_and_encode_restores() {
        let raw = b"\xEF\xBB\xBFa\r\nb\r\nc";
        let d = decode(raw).unwrap();
        assert!(d.bom);
        assert_eq!(d.eol, "\r\n");
        assert_eq!(d.content, "a\nb\nc");
        assert_eq!(encode(&d.content, &d.eol, d.bom), raw);
        let lf = decode(b"x\ny\n").unwrap();
        assert_eq!((lf.eol.as_str(), lf.bom), ("\n", false));
        assert!(decode(&[0xFF, 0xFE, 0x00]).is_err());
    }

    #[test]
    fn own_writes_are_recognised_and_external_ones_are_not() {
        let d = tmpdir("own");
        let f = d.join("b.md");
        let path = f.to_string_lossy().into_owned();
        let known = KnownHashes::default();
        write_file(&known, &path, "ciao\nmondo", "\n", false, false).unwrap();
        let disk = fs::read(&f).unwrap();
        assert!(known.is_own(&path, &disk));
        fs::write(&f, b"modificato da altri").unwrap();
        let disk = fs::read(&f).unwrap();
        assert!(!known.is_own(&path, &disk));
        fs::remove_dir_all(&d).unwrap();
    }

    #[test]
    fn write_refuses_to_overwrite_external_change_unless_forced() {
        let d = tmpdir("conflict");
        let f = d.join("c.md");
        let path = f.to_string_lossy().into_owned();
        let known = KnownHashes::default();
        write_file(&known, &path, "v1", "\n", false, false).unwrap();
        fs::write(&f, b"esterno").unwrap();
        let err = write_file(&known, &path, "v2", "\n", false, false).unwrap_err();
        assert_eq!(err.kind, "conflict");
        assert_eq!(fs::read(&f).unwrap(), b"esterno");
        write_file(&known, &path, "v2", "\n", false, true).unwrap();
        assert_eq!(fs::read(&f).unwrap(), b"v2");
        fs::remove_dir_all(&d).unwrap();
    }

    #[test]
    fn cli_paths_resolve_relative_and_skip_flags() {
        let d = tmpdir("cli");
        fs::write(d.join("x.md"), "x").unwrap();
        let cwd = d.to_string_lossy().into_owned();
        let args = vec![
            "--flag".to_string(),
            "x.md".to_string(),
            "no.md".to_string(),
        ];
        let r = resolve_cli_paths(&args, Some(&cwd));
        assert_eq!(r.len(), 1);
        assert!(r[0].ends_with("x.md"));
        fs::remove_dir_all(&d).unwrap();
    }
}
