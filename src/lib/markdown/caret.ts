/**
 * Dal punto cliccato nell'anteprima al cursore nel sorgente.
 * Si confronta il testo impaginato prima del clic con il sorgente del blocco, ignorando
 * spazi, caratteri di markup, marcatori di lista e URL dei link.
 */
import { lineStartOffset } from './blocks';

const IGNORED = new Set('*_`#>[]()!~|-'.split(''));
const PUNCT = /[!-/:-@[-`{-~]/;
const PREFIX = /^[ \t]*(?:>[ \t]*)*(?:(?:[-+*]|\d{1,9}[.)])[ \t]+(?:\[[ xX]\][ \t]+)?)*/;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;

interface PlainChar {
  ch: string;
  idx: number;
}

const keep = (c: string) => !/\s/.test(c) && !IGNORED.has(c);

/** Fine della parentesi tonda che si apre in `from` (indice dopo la `)`), o -1. */
function skipParens(src: string, from: number): number {
  let depth = 0;
  for (let i = from; i < src.length; i++) {
    const c = src[i];
    if (c === '\\') i++;
    else if (c === '(') depth++;
    else if (c === ')' && --depth === 0) return i + 1;
    else if (c === '\n' && src[i + 1] === '\n') return -1;
  }
  return -1;
}

/** Caratteri del sorgente che compaiono nel testo impaginato, con la loro posizione. */
export function plainChars(src: string): PlainChar[] {
  const out: PlainChar[] = [];
  let i = 0;
  let fence: string | null = null;
  const n = src.length;
  while (i < n) {
    if (i === 0 || src[i - 1] === '\n') {
      let eol = src.indexOf('\n', i);
      if (eol < 0) eol = n;
      const line = src.slice(i, eol);
      if (fence) {
        const close = new RegExp(`^ {0,3}\\${fence[0]}{${fence.length},}[ \\t]*$`);
        if (close.test(line)) {
          fence = null;
        } else {
          for (let k = 0; k < line.length; k++) if (keep(line[k])) out.push({ ch: line[k], idx: i + k });
        }
        i = eol + 1;
        continue;
      }
      const fm = FENCE.exec(line);
      if (fm) {
        fence = fm[1];
        i = eol + 1;
        continue;
      }
      i += PREFIX.exec(line)![0].length;
      if (i >= n) break;
    }
    const c = src[i];
    if (c === '\n' || /\s/.test(c)) {
      i++;
      continue;
    }
    if (c === '\\' && i + 1 < n && PUNCT.test(src[i + 1])) {
      if (keep(src[i + 1])) out.push({ ch: src[i + 1], idx: i + 1 });
      i += 2;
      continue;
    }
    if (c === '`') {
      let run = 1;
      while (src[i + run] === '`') run++;
      const ticks = '`'.repeat(run);
      const close = src.indexOf(ticks, i + run);
      if (close > 0) {
        for (let k = i + run; k < close; k++) if (keep(src[k])) out.push({ ch: src[k], idx: k });
        i = close + run;
      } else {
        i += run;
      }
      continue;
    }
    if (c === '!' && src[i + 1] === '[') {
      const close = src.indexOf(']', i + 2);
      if (close > 0) {
        i = close + 1;
        if (src[i] === '(') {
          const end = skipParens(src, i);
          if (end > 0) i = end;
        }
        continue;
      }
    }
    if (c === ']') {
      if (src[i + 1] === '(') {
        const end = skipParens(src, i + 1);
        if (end > 0) {
          i = end;
          continue;
        }
      } else if (src[i + 1] === '[') {
        const close = src.indexOf(']', i + 2);
        if (close > 0) {
          i = close + 1;
          continue;
        }
      }
      i++;
      continue;
    }
    if (c === '<') {
      const m = /^<\/?[A-Za-z][^<>\n]*>/.exec(src.slice(i));
      if (m) {
        i += m[0].length;
        continue;
      }
    }
    if (keep(c)) out.push({ ch: c, idx: i });
    i++;
  }
  return out;
}

/** Il testo impaginato ridotto alla stessa forma (virgolette tipografiche → semplici, niente spazi né markup). */
export function normalizeRendered(text: string): string {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, '...')
    .split('')
    .filter(keep)
    .join('');
}

/**
 * Posizione nel sorgente dopo il testo impaginato `before`, oppure null se non c'è
 * corrispondenza. Con `before` vuoto: primo carattere di testo del blocco.
 */
export function locateCaret(source: string, before: string): number | null {
  const plain = plainChars(source);
  const b = normalizeRendered(before);
  if (b.length === 0) return plain.length > 0 ? plain[0].idx : 0;
  if (b.length > plain.length) return null;
  for (let k = 0; k < b.length; k++) {
    const p = plain[k].ch === '’' || plain[k].ch === '‘' ? "'" : plain[k].ch;
    if (p !== b[k]) return null;
  }
  return plain[b.length - 1].idx + 1;
}

/**
 * Cursore da usare per il clic: la corrispondenza del testo, altrimenti l'inizio della
 * riga cliccata (stimata dagli a capo del testo impaginato), altrimenti l'inizio del blocco.
 */
export function caretOffset(source: string, before: string | null): number {
  if (before === null) return 0;
  const found = locateCaret(source, before);
  if (found !== null) return Math.min(found, source.length);
  const lineHint = (before.trim().match(/\n/g) ?? []).length;
  return lineStartOffset(source, Math.min(lineHint, source.split('\n').length - 1));
}
