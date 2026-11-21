/**
 * Commutazione di una casella `[ ]` / `[x]` in una riga del sorgente.
 * Tocca un solo carattere: il resto del testo (fine riga compresi) non cambia.
 */

export interface TextChange {
  from: number;
  to: number;
  insert: string;
}

const TASK_LINE = /^((?:[ \t]*>)*[ \t]*(?:[-+*]|\d{1,9}[.)])[ \t]+\[)([ xX])(\])/;

/** `line` è 0-based. Restituisce null se la riga non è una voce di attività. */
export function taskToggleChange(source: string, line: number): TextChange | null {
  let start = 0;
  for (let i = 0; i < line; i++) {
    const nl = source.indexOf('\n', start);
    if (nl < 0) return null;
    start = nl + 1;
  }
  let end = source.indexOf('\n', start);
  if (end < 0) end = source.length;
  const text = source.slice(start, end).replace(/\r$/, '');
  const m = TASK_LINE.exec(text);
  if (!m) return null;
  const pos = start + m[1].length;
  return { from: pos, to: pos + 1, insert: m[2] === ' ' ? 'x' : ' ' };
}

export function toggleTaskLine(source: string, line: number): string | null {
  const c = taskToggleChange(source, line);
  if (!c) return null;
  return source.slice(0, c.from) + c.insert + source.slice(c.to);
}
