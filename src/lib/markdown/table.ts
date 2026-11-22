/**
 * Tabelle GFM: lettura, scrittura (colonne allineate con spazi, allineamenti conservati,
 * `|` escapato come `\|`) e operazioni su righe e colonne. Funzioni pure.
 * Le righe del modello: indice 0 = intestazione, 1.. = righe del corpo.
 */

export type Align = 'left' | 'center' | 'right' | null;

export interface TableModel {
  header: string[];
  align: Align[];
  rows: string[][];
}

const DELIM_CELL = /^:?-+:?$/;

/** Divide una riga di tabella in celle, rispettando `\|`. Il testo delle celle ha già `\|` → `|`. */
export function splitRow(line: string): string[] {
  const s = line.trim();
  const cells: string[] = [];
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '\\' && i + 1 < s.length) {
      if (s[i + 1] === '|') {
        cur += '|';
      } else {
        cur += c + s[i + 1];
      }
      i++;
    } else if (c === '|') {
      cells.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  cells.push(cur);
  // `|` iniziale e finale non iniziano/chiudono una cella vera
  if (s.startsWith('|')) cells.shift();
  if (endsWithBarePipe(s)) cells.pop();
  return cells.map((c) => c.trim());
}

function endsWithBarePipe(s: string): boolean {
  if (!s.endsWith('|')) return false;
  let k = 0;
  for (let i = s.length - 2; i >= 0 && s[i] === '\\'; i--) k++;
  return k % 2 === 0;
}

/** Legge le righe di una tabella (intestazione, riga di allineamento, corpo) o restituisce null. */
export function parseTable(lines: string[]): TableModel | null {
  if (lines.length < 2) return null;
  if (!lines[0].includes('|')) return null;
  const header = splitRow(lines[0]);
  const delim = splitRow(lines[1]);
  if (header.length === 0 || delim.length !== header.length) return null;
  if (!delim.every((c) => DELIM_CELL.test(c))) return null;
  const align: Align[] = delim.map((c) => {
    const l = c.startsWith(':');
    const r = c.endsWith(':');
    return l && r ? 'center' : l ? 'left' : r ? 'right' : null;
  });
  const cols = header.length;
  const rows: string[][] = [];
  for (const l of lines.slice(2)) {
    const cells = splitRow(l);
    // celle in più dell'intestazione: la tabella resta al sorgente, così non spariscono
    if (cells.length > cols) return null;
    while (cells.length < cols) cells.push('');
    rows.push(cells);
  }
  return { header, align, rows };
}

/** Un `|` preceduto da un numero dispari di backslash è già escapato; altrimenti si aggiunge un backslash. */
export function escapeCell(text: string): string {
  const s = text.replace(/\r?\n/g, ' ').trim();
  let out = '';
  let slashes = 0;
  for (const ch of s) {
    if (ch === '|' && slashes % 2 === 0) out += '\\';
    out += ch;
    slashes = ch === '\\' ? slashes + 1 : 0;
  }
  return out;
}

function pad(text: string, width: number, align: Align): string {
  const gap = width - text.length;
  if (gap <= 0) return text;
  if (align === 'right') return ' '.repeat(gap) + text;
  if (align === 'center') {
    const left = Math.floor(gap / 2);
    return ' '.repeat(left) + text + ' '.repeat(gap - left);
  }
  return text + ' '.repeat(gap);
}

/** Scrive la tabella: una stringa per riga, colonne allineate. */
export function serializeTable(m: TableModel): string[] {
  const cols = m.header.length;
  const head = m.header.map(escapeCell);
  const body = m.rows.map((r) => Array.from({ length: cols }, (_, c) => escapeCell(r[c] ?? '')));
  const widths = Array.from({ length: cols }, (_, c) =>
    Math.max(3, head[c].length, ...body.map((r) => r[c].length))
  );
  const delim = widths.map((w, c) => {
    const a = m.align[c] ?? null;
    if (a === 'center') return ':' + '-'.repeat(w - 2) + ':';
    if (a === 'left') return ':' + '-'.repeat(w - 1);
    if (a === 'right') return '-'.repeat(w - 1) + ':';
    return '-'.repeat(w);
  });
  const line = (cells: string[]) =>
    '| ' + cells.map((t, c) => pad(t, widths[c], m.align[c] ?? null)).join(' | ') + ' |';
  return [line(head), '| ' + delim.join(' | ') + ' |', ...body.map(line)];
}

export function cellCount(m: TableModel): number {
  return m.header.length;
}

/** Riga `r` (0 = intestazione). */
export function getCell(m: TableModel, r: number, c: number): string {
  return (r === 0 ? m.header[c] : m.rows[r - 1]?.[c]) ?? '';
}

export function setCell(m: TableModel, r: number, c: number, text: string): TableModel {
  if (r === 0) return { ...m, header: m.header.map((x, i) => (i === c ? text : x)) };
  return { ...m, rows: m.rows.map((row, i) => (i === r - 1 ? row.map((x, j) => (j === c ? text : x)) : row)) };
}

/** Inserisce una riga vuota del corpo in modo che diventi la riga `r` (≥ 1). */
export function insertRow(m: TableModel, r: number): TableModel {
  const at = Math.min(Math.max(r - 1, 0), m.rows.length);
  const rows = m.rows.slice();
  rows.splice(at, 0, Array.from({ length: m.header.length }, () => ''));
  return { ...m, rows };
}

/** Toglie la riga `r` del corpo (l'intestazione non si toglie). */
export function deleteRow(m: TableModel, r: number): TableModel {
  if (r < 1 || r > m.rows.length) return m;
  return { ...m, rows: m.rows.filter((_, i) => i !== r - 1) };
}

/** Inserisce una colonna vuota in modo che diventi la colonna `c`. */
export function insertColumn(m: TableModel, c: number): TableModel {
  const at = Math.min(Math.max(c, 0), m.header.length);
  const ins = <T,>(a: T[], v: T) => [...a.slice(0, at), v, ...a.slice(at)];
  return {
    header: ins(m.header, ''),
    align: ins(m.align, null as Align),
    rows: m.rows.map((r) => ins(r, ''))
  };
}

/** Toglie la colonna `c` (almeno una colonna resta). */
export function deleteColumn(m: TableModel, c: number): TableModel {
  if (m.header.length <= 1 || c < 0 || c >= m.header.length) return m;
  const del = <T,>(a: T[]) => a.filter((_, i) => i !== c);
  return { header: del(m.header), align: del(m.align), rows: m.rows.map(del) };
}

/** Tabella vuota per l'inserimento dalla barra: intestazione e `bodyRows` righe. */
export function emptyTable(cols: number, bodyRows: number): TableModel {
  return {
    header: Array.from({ length: cols }, () => ''),
    align: Array.from({ length: cols }, () => null as Align),
    rows: Array.from({ length: bodyRows }, () => Array.from({ length: cols }, () => ''))
  };
}
