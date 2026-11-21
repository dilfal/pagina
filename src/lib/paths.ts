/** Funzioni sui percorsi, indipendenti dal sistema operativo. */

export function basename(p: string): string {
  const parts = p.split(/[\\/]/);
  return parts[parts.length - 1] || p;
}

export function dirname(p: string): string {
  const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
  if (i < 0) return '';
  if (i === 0) return p.slice(0, 1);
  return p.slice(0, i);
}

/** Chiave per confrontare due percorsi (Windows non distingue le maiuscole). */
export function normPath(p: string): string {
  const s = p.replace(/\\/g, '/');
  return /^[A-Za-z]:/.test(p) || p.includes('\\') ? s.toLowerCase() : s;
}

const WIN_DRIVE = /^[a-zA-Z]:[\\/]/;
const URL_SCHEME = /^([a-zA-Z][a-zA-Z0-9+.-]+:|\/\/)/;

/**
 * Risolve il `src` di un'immagine rispetto alla cartella del file e lo passa a
 * `convert` (in Tauri: `convertFileSrc`). Gli URL assoluti (http, data, blob…)
 * restano com'erano.
 */
export function resolveImageSrc(
  src: string,
  baseDir: string | null | undefined,
  convert: (path: string) => string
): string {
  if (!src) return src;
  if (!WIN_DRIVE.test(src) && URL_SCHEME.test(src)) return src;
  let clean = src.split('#')[0].split('?')[0];
  try {
    clean = decodeURI(clean);
  } catch {
    /* lascia com'è */
  }
  if (WIN_DRIVE.test(clean) || clean.startsWith('/')) return convert(clean);
  if (!baseDir) return src;
  const sep = baseDir.includes('\\') ? '\\' : '/';
  const segments = baseDir.split(/[\\/]/);
  for (const part of clean.split(/[\\/]/)) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      if (segments.length > 1) segments.pop();
    } else {
      segments.push(part);
    }
  }
  return convert(segments.join(sep));
}
