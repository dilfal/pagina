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
#[serde(rename_all = "camelCase")]
pub struct FileData {
    /// Contenuto con fine riga normalizzati a "\n".
    pub content: String,
    /// Fine riga originale del file: "\n" oppure "\r\n".
    pub eol: String,
    /// Il file iniziava con il BOM UTF-8.
    pub bom: bool,
    /// Il file ha fine riga misti (CRLF e LF insieme) o CR isolati.
    pub mixed_eol: bool,
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
    let lone_cr = text.matches('\r').count() - crlf;
    let mixed_eol = (crlf > 0 && lf > 0) || lone_cr > 0;
    Ok(FileData {
        content: text.replace("\r\n", "\n"),
        eol: eol.to_string(),
        bom,
        mixed_eol,
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
    let mut p = PathBuf::from(path);
    // se la destinazione è un collegamento simbolico si scrive sul file vero:
    // il collegamento resta un collegamento
    if fs::symlink_metadata(&p).is_ok_and(|m| m.file_type().is_symlink()) {
        p = fs::canonicalize(&p).map_err(FileError::io)?;
    }
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

/// Dimensione massima di un'immagine incollata o importata.
pub const MAX_IMAGE_BYTES: usize = 20 * 1024 * 1024;
const IMAGE_EXTS: [&str; 5] = ["png", "jpg", "jpeg", "gif", "webp"];
/// Caratteri che rompono un riferimento Markdown o un nome di file.
const UNSAFE_NAME_CHARS: &str = "#?%()[]<>:*\"|/\\";

/// Estensione accettata (minuscola, senza punto), altrimenti errore.
pub fn image_ext(ext: &str) -> Result<String, FileError> {
    let e = ext.trim().trim_start_matches('.').to_lowercase();
    if IMAGE_EXTS.contains(&e.as_str()) {
        Ok(e)
    } else {
        Err(FileError::io(format!(
            "Formato immagine non supportato: «{ext}» (ammessi png, jpg, jpeg, gif, webp)"
        )))
    }
}

/// Nome del documento ripulito dai caratteri che romperebbero un riferimento Markdown
/// o un nome di file (gli spazi restano: li codifica il frontend).
fn safe_stem(md_path: &Path) -> String {
    let stem = md_path
        .file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_default();
    let cleaned: String = stem
        .chars()
        .map(|c| {
            if c.is_control() || UNSAFE_NAME_CHARS.contains(c) {
                '_'
            } else {
                c
            }
        })
        .collect();
    let cleaned = cleaned.trim().to_string();
    if cleaned.is_empty() {
        "immagine".into()
    } else {
        cleaned
    }
}

/// `<nome-del-md>-AAAAMMGG-HHMMSS[-N].<ext>`
pub fn image_file_name(md_path: &Path, stamp: &str, ext: &str, n: u32) -> String {
    let stem = safe_stem(md_path);
    if n <= 1 {
        format!("{stem}-{stamp}.{ext}")
    } else {
        format!("{stem}-{stamp}-{n}.{ext}")
    }
}

/// La cartella `immagini` esistente deve essere proprio quella accanto al documento: né un
/// collegamento simbolico né (per il confronto dei percorsi reali) una giunzione altrove.
/// L'attributo «reparse point» da solo non basta (lo hanno anche le cartelle di OneDrive).
fn images_dir_is_safe(dir: &Path, md_dir: &Path) -> bool {
    let Ok(meta) = fs::symlink_metadata(dir) else {
        return true; // non esiste ancora: la creiamo noi
    };
    if meta.file_type().is_symlink() {
        return false;
    }
    match (fs::canonicalize(dir), fs::canonicalize(md_dir)) {
        (Ok(real), Ok(base)) => {
            norm_path(&real.to_string_lossy()) == norm_path(&base.join("immagini").to_string_lossy())
        }
        _ => false,
    }
}

/// I primi byte corrispondono al formato dichiarato dall'estensione (jpg e jpeg sono lo stesso).
pub fn image_matches(bytes: &[u8], ext: &str) -> bool {
    match ext {
        "png" => bytes.starts_with(&[0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A]),
        "jpg" | "jpeg" => bytes.starts_with(&[0xFF, 0xD8, 0xFF]),
        "gif" => bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a"),
        "webp" => bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP",
        _ => false,
    }
}

/// Salva un'immagine in `<cartella del md>/immagini/`, senza mai sovrascrivere nulla:
/// il nome si «prenota» con `create_new` (suffisso -2, -3… se esiste), poi il contenuto
/// arriva con la scrittura atomica. Restituisce il nome relativo alla cartella del md
/// (`immagini/<nome>`).
pub fn save_image_at(
    md_path: &Path,
    bytes: &[u8],
    ext: &str,
    stamp: &str,
) -> Result<String, FileError> {
    let ext = image_ext(ext)?;
    if bytes.is_empty() {
        return Err(FileError::io("Immagine vuota"));
    }
    if bytes.len() > MAX_IMAGE_BYTES {
        return Err(FileError::io("Immagine troppo grande (massimo 20 MB)"));
    }
    if !image_matches(bytes, &ext) {
        return Err(FileError::io(
            "Il contenuto non corrisponde al formato dell'immagine (png, jpg, gif, webp)",
        ));
    }
    if !md_path.is_absolute() {
        return Err(FileError::io("Percorso del documento non valido"));
    }
    let dir = md_path
        .parent()
        .ok_or_else(|| FileError::io("Percorso del documento non valido"))?
        .join("immagini");
    if !images_dir_is_safe(&dir, md_path.parent().unwrap_or(Path::new("."))) {
        return Err(FileError::io(
            "La cartella «immagini» è un collegamento: non la uso",
        ));
    }
    fs::create_dir_all(&dir).map_err(FileError::io)?;
    for n in 1..10_000u32 {
        let name = image_file_name(md_path, stamp, &ext, n);
        let target = dir.join(&name);
        match fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&target)
        {
            Ok(claim) => {
                drop(claim);
                if let Err(e) = atomic_write(&target, bytes) {
                    let _ = fs::remove_file(&target);
                    return Err(FileError::io(e));
                }
                return Ok(format!("immagini/{name}"));
            }
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(e) => return Err(FileError::io(e)),
        }
    }
    Err(FileError::io("Troppe immagini con lo stesso nome"))
}

pub fn save_image(md_path: &Path, bytes: &[u8], ext: &str) -> Result<String, FileError> {
    let stamp = chrono::Local::now().format("%Y%m%d-%H%M%S").to_string();
    save_image_at(md_path, bytes, ext, &stamp)
}

/// Decodifica i `%XX` di un valore passato in un'intestazione.
pub fn percent_decode(s: &str) -> Option<String> {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' {
            let hex = s.get(i + 1..i + 3)?;
            out.push(u8::from_str_radix(hex, 16).ok()?);
            i += 3;
        } else {
            out.push(b[i]);
            i += 1;
        }
    }
    String::from_utf8(out).ok()
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
    fn decode_flags_mixed_line_endings() {
        assert!(!decode(b"a\r\nb\r\n").unwrap().mixed_eol);
        assert!(!decode(b"a\nb\n").unwrap().mixed_eol);
        assert!(decode(b"a\r\nb\nc").unwrap().mixed_eol);
        assert!(decode(b"a\rb\n").unwrap().mixed_eol);
    }

    #[test]
    fn write_through_symlink_keeps_the_link() {
        let d = tmpdir("symlink");
        let real = d.join("vero.md");
        let link = d.join("link.md");
        fs::write(&real, b"vecchio").unwrap();
        #[cfg(windows)]
        let made = std::os::windows::fs::symlink_file(&real, &link);
        #[cfg(unix)]
        let made = std::os::unix::fs::symlink(&real, &link);
        if made.is_err() {
            // su Windows senza privilegi il collegamento non si può creare: test saltato
            eprintln!("symlink non creabile, test saltato");
            fs::remove_dir_all(&d).unwrap();
            return;
        }
        let known = KnownHashes::default();
        let path = link.to_string_lossy().into_owned();
        write_file(&known, &path, "nuovo", "\n", false, true).unwrap();
        assert!(
            fs::symlink_metadata(&link)
                .unwrap()
                .file_type()
                .is_symlink()
        );
        assert_eq!(fs::read(&real).unwrap(), b"nuovo");
        assert_eq!(fs::read(&link).unwrap(), b"nuovo");
        fs::remove_dir_all(&d).unwrap();
    }

    const PNG_HEAD: [u8; 8] = [0x89, b'P', b'N', b'G', 0x0D, 0x0A, 0x1A, 0x0A];

    fn png(tail: &[u8]) -> Vec<u8> {
        let mut v = PNG_HEAD.to_vec();
        v.extend_from_slice(tail);
        v
    }

    #[test]
    fn image_name_has_stamp_and_suffix_on_collision() {
        let d = tmpdir("img");
        let md = d.join("Il mio (file) #1.md");
        let first = save_image_at(&md, &png(b"uno"), "PNG", "20260102-030405").unwrap();
        assert_eq!(first, "immagini/Il mio _file_ _1-20260102-030405.png");
        let second = save_image_at(&md, &png(b"due"), "png", "20260102-030405").unwrap();
        assert_eq!(second, "immagini/Il mio _file_ _1-20260102-030405-2.png");
        let third = save_image_at(&md, &png(b"tre"), "png", "20260102-030405").unwrap();
        assert!(third.ends_with("-3.png"));
        assert_eq!(fs::read(d.join(&first)).unwrap(), png(b"uno"));
        assert_eq!(fs::read(d.join(&second)).unwrap(), png(b"due"));
        let left: Vec<_> = fs::read_dir(d.join("immagini"))
            .unwrap()
            .map(|e| e.unwrap().file_name().to_string_lossy().into_owned())
            .filter(|n| n.contains("pagina-tmp"))
            .collect();
        assert!(left.is_empty());
        fs::remove_dir_all(&d).unwrap();
    }

    #[test]
    fn image_never_overwrites_existing_file() {
        let d = tmpdir("img-keep");
        let md = d.join("doc.md");
        fs::create_dir_all(d.join("immagini")).unwrap();
        fs::write(d.join("immagini/doc-20260101-000000.png"), b"originale").unwrap();
        let r = save_image_at(&md, &png(b"nuovo"), "png", "20260101-000000").unwrap();
        assert_eq!(r, "immagini/doc-20260101-000000-2.png");
        assert_eq!(
            fs::read(d.join("immagini/doc-20260101-000000.png")).unwrap(),
            b"originale"
        );
        fs::remove_dir_all(&d).unwrap();
    }

    #[test]
    fn image_rejects_bad_extension_empty_and_too_big() {
        let d = tmpdir("img-bad");
        let md = d.join("doc.md");
        assert!(save_image_at(&md, b"x", "exe", "s").is_err());
        assert!(save_image_at(&md, b"x", "svg", "s").is_err());
        assert!(save_image_at(&md, b"", "png", "s").is_err());
        let mut big = png(&[]);
        big.resize(MAX_IMAGE_BYTES + 1, 0);
        let err = save_image_at(&md, &big, "png", "s").unwrap_err();
        assert!(err.message.contains("troppo grande"));
        let mut ok = png(&[]);
        ok.resize(MAX_IMAGE_BYTES, 0);
        assert!(save_image_at(&md, &ok, "png", "s").is_ok());
        assert!(!d.join("immagini/doc-s.exe").exists());
        fs::remove_dir_all(&d).unwrap();
    }

    #[test]
    fn image_magic_bytes_must_match_extension() {
        let jpeg = [0xFF, 0xD8, 0xFF, 0xE0, 0, 0];
        let mut webp = b"RIFF".to_vec();
        webp.extend_from_slice(&[1, 2, 3, 4]);
        webp.extend_from_slice(b"WEBP");
        assert!(image_matches(&PNG_HEAD, "png"));
        assert!(image_matches(&jpeg, "jpg"));
        assert!(image_matches(&jpeg, "jpeg"));
        assert!(image_matches(b"GIF87a..", "gif"));
        assert!(image_matches(b"GIF89a..", "gif"));
        assert!(image_matches(&webp, "webp"));
        assert!(!image_matches(&jpeg, "png"));
        assert!(!image_matches(&PNG_HEAD, "jpg"));
        assert!(!image_matches(b"RIFF....WAVE", "webp"));
        assert!(!image_matches(b"MZ", "png"));

        let d = tmpdir("img-magic");
        let md = d.join("doc.md");
        // un eseguibile travestito da png viene rifiutato e non lascia nulla
        let err = save_image_at(&md, b"MZ programma", "png", "s").unwrap_err();
        assert!(err.message.contains("non corrisponde"));
        assert!(!d.join("immagini").exists());
        // jpg dichiarato ma contenuto png
        assert!(save_image_at(&md, &png(b"x"), "jpg", "s").is_err());
        assert!(save_image_at(&md, &jpeg, "jpeg", "s").is_ok());
        assert!(save_image_at(&md, &webp, "webp", "s").is_ok());
        fs::remove_dir_all(&d).unwrap();
    }

    #[test]
    fn image_folder_that_is_a_link_is_refused() {
        let d = tmpdir("img-link");
        let md = d.join("doc.md");
        let target = d.join("altrove");
        fs::create_dir_all(&target).unwrap();
        let link = d.join("immagini");
        #[cfg(windows)]
        let made = std::os::windows::fs::symlink_dir(&target, &link).or_else(|_| {
            // senza privilegi per i collegamenti simbolici si prova una giunzione
            std::process::Command::new("cmd")
                .args(["/C", "mklink", "/J"])
                .arg(&link)
                .arg(&target)
                .output()
                .and_then(|o| {
                    if o.status.success() {
                        Ok(())
                    } else {
                        Err(std::io::Error::other("mklink non riuscito"))
                    }
                })
        });
        #[cfg(unix)]
        let made = std::os::unix::fs::symlink(&target, &link);
        if made.is_err() {
            eprintln!("collegamento non creabile, test saltato");
            fs::remove_dir_all(&d).unwrap();
            return;
        }
        let err = save_image_at(&md, &png(b"x"), "png", "s").unwrap_err();
        assert!(err.message.contains("collegamento"));
        assert_eq!(fs::read_dir(&target).unwrap().count(), 0);
        fs::remove_dir(&link).unwrap();
        fs::remove_dir_all(&d).unwrap();
    }

    #[test]
    fn percent_decode_roundtrip() {
        assert_eq!(
            percent_decode("C%3A%5CDoc%20x%C3%A8.md").as_deref(),
            Some("C:\\Doc xè.md")
        );
        assert_eq!(percent_decode("%zz"), None);
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
