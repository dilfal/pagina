/** Funzioni pure per le immagini incollate. */

const MIME_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp'
};
const NAME_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp']);

/** Riferimento Markdown a `immagini/<nome>`: gli spazi diventano %20. */
export function imageMarkdown(rel: string): string {
  return `![](${rel.replace(/ /g, '%20')})`;
}

/** Estensione da salvare (png, jpg, jpeg, gif, webp) dal nome del file o dal tipo MIME; null se non è un'immagine ammessa. */
export function imageExtension(name: string, mime: string): string | null {
  const fromMime = MIME_EXT[mime.toLowerCase()];
  if (fromMime) return fromMime;
  const m = /\.([A-Za-z0-9]+)$/.exec(name);
  const ext = m?.[1].toLowerCase();
  return ext && NAME_EXTS.has(ext) ? ext : null;
}

export function isImageFile(f: { name: string; type: string }): boolean {
  return imageExtension(f.name, f.type) !== null;
}

/**
 * I file immagine di un evento incolla, oppure [] se l'incolla va lasciato al testo
 * (per esempio quando negli appunti c'è anche del testo semplice, come da Excel o Word).
 */
export function pastedImageFiles(data: {
  files?: ArrayLike<File> | null;
  getData?: (type: string) => string;
}): File[] {
  const files = Array.from(data.files ?? []).filter(isImageFile);
  if (files.length === 0) return [];
  const text = data.getData?.('text/plain') ?? '';
  return text.trim() !== '' ? [] : files;
}
