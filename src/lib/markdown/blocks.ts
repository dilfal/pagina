/**
 * Intervalli dei blocchi del sorgente e regole sui blocchi modificabili nell'anteprima.
 * Tutto puro: lavora su `Text` di CodeMirror (o su un finto con la stessa interfaccia) e su stringhe.
 */
import type { Text } from '@codemirror/state';

export interface LineSource {
  readonly lines: number;
  line(n: number): { from: number; to: number; text: string };
}

/** Toglie dal range le righe vuote finali (le liste le includono). `end` è esclusa, 0-based. */
export function trimBlockEnd(isBlank: (line: number) => boolean, start: number, end: number): number {
  let e = end;
  while (e - 1 > start && isBlank(e - 1)) e--;
  return Math.max(e, start + 1);
}

export interface BlockRange {
  /** Prima riga (0-based) e riga dopo l'ultima (esclusa), già ritagliate. */
  startLine: number;
  endLine: number;
  /** Posizioni nel documento. */
  from: number;
  to: number;
}

/** Range in caratteri di un blocco dato dagli attributi `data-source-start/end` (righe 0-based, fine esclusa). */
export function blockRange(doc: LineSource | Text, start: number, end: number): BlockRange | null {
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start) return null;
  if (start >= doc.lines) return null;
  const last = Math.min(end, doc.lines);
  const e = trimBlockEnd((l) => doc.line(l + 1).text.trim() === '', start, last);
  return { startLine: start, endLine: e, from: doc.line(start + 1).from, to: doc.line(e).to };
}

export interface RemovalRange {
  from: number;
  to: number;
  /** Prima riga (0-based) dopo l'eliminazione, dove ora si trova ciò che seguiva. */
  line0: number;
}

/**
 * Cosa togliere per eliminare un blocco vuoto (la riga vuota in cui si trova) insieme a
 * una riga vuota di separazione (quella prima, o altrimenti quella dopo).
 */
export function removeEmptyBlock(doc: LineSource | Text, pos: number): RemovalRange {
  const lineNo = (doc as Text).lineAt ? (doc as Text).lineAt(pos).number : findLine(doc, pos);
  const blank = (n: number) => n >= 1 && n <= doc.lines && doc.line(n).text.trim() === '';
  let a = lineNo;
  let b = lineNo;
  if (blank(lineNo - 1)) a = lineNo - 1;
  else if (blank(lineNo + 1)) b = lineNo + 1;
  const range = deleteLines(doc, a, b);
  return { ...range, line0: a - 1 };
}

function findLine(doc: LineSource, pos: number): number {
  for (let n = 1; n <= doc.lines; n++) if (pos <= doc.line(n).to) return n;
  return doc.lines;
}

/** Elimina le righe `a..b` (1-based, comprese) con un a capo. */
export function deleteLines(doc: LineSource | Text, a: number, b: number): { from: number; to: number } {
  if (b < doc.lines) return { from: doc.line(a).from, to: doc.line(b).to + 1 };
  if (a > 1) return { from: doc.line(a - 1).to, to: doc.line(b).to };
  return { from: 0, to: doc.line(b).to };
}

export type BlockKind = 'fence' | 'list' | 'quote' | 'heading' | 'table' | 'other';

const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})/;
const LIST_ITEM = /^[ \t]*(?:[-+*]|\d{1,9}[.)])(?:[ \t]|$)/;

export function blockKind(text: string): BlockKind {
  const lines = text.split('\n');
  const first = lines[0] ?? '';
  if (FENCE_OPEN.test(first)) return 'fence';
  if (/^ {0,3}#{1,6}(?:\s|$)/.test(first)) return 'heading';
  if (/^[ \t]*>/.test(first)) return 'quote';
  if (LIST_ITEM.test(first) && !/^[ \t]*([-*_])([ \t]*\1){2,}[ \t]*$/.test(first)) return 'list';
  if (lines.length >= 2 && /^[ \t]*\|?[ \t]*:?-+:?[ \t]*(\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/.test(lines[1]) && first.includes('|'))
    return 'table';
  return 'other';
}

/** Il blocco di codice recintato ha la recinzione di chiusura come ultima riga. */
export function fenceClosed(text: string): boolean {
  const lines = text.split('\n');
  const m = FENCE_OPEN.exec(lines[0] ?? '');
  if (!m || lines.length < 2) return false;
  const ch = m[1][0];
  const re = new RegExp(`^ {0,3}\\${ch}{${m[1].length},}[ \\t]*$`);
  return re.test(lines[lines.length - 1]);
}

export type EnterAction = 'none' | 'new-block' | 'continue' | 'drop-marker' | 'newline';

const EMPTY_ITEM = /^[ \t]*(?:[-+*]|\d{1,9}[.)])(?:[ \t]+\[[ xX]\])?[ \t]*$/;
const EMPTY_QUOTE = /^[ \t]*(?:>[ \t]*)+$/;

/** Che cosa fa Invio con il cursore alla fine dell'ultima riga del blocco. */
export function enterAction(text: string): EnterAction {
  if (text.trim() === '') return 'none';
  const kind = blockKind(text);
  const last = text.split('\n').pop() ?? '';
  switch (kind) {
    case 'fence':
      return fenceClosed(text) ? 'new-block' : 'newline';
    case 'list':
      return EMPTY_ITEM.test(last) ? 'drop-marker' : 'continue';
    case 'quote':
      return EMPTY_QUOTE.test(last) ? 'drop-marker' : 'continue';
    default:
      return 'new-block';
  }
}

/** Riga (0-based) per l'inizio di riga di `source` dopo `n` a capo, tenuta nei limiti. */
export function lineStartOffset(source: string, line: number): number {
  let off = 0;
  for (let i = 0; i < line; i++) {
    const nl = source.indexOf('\n', off);
    if (nl < 0) return off;
    off = nl + 1;
  }
  return off;
}
