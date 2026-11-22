/**
 * Comandi di formattazione Markdown per CodeMirror (editor principale e blocco aperto
 * nell'anteprima). Ogni comando prende un oggetto con `state` e `dispatch`, quindi si
 * prova anche senza una vista vera.
 */
import {
  EditorSelection,
  type ChangeSpec,
  type EditorState,
  type Line,
  type Transaction,
  type TransactionSpec
} from '@codemirror/state';
import type { KeyBinding } from '@codemirror/view';
import { emptyTable, serializeTable } from '../markdown/table';

export interface Target {
  state: EditorState;
  dispatch: (tr: Transaction) => void;
}
export type Command = (view: Target) => boolean;

function run(view: Target, spec: TransactionSpec): boolean {
  view.dispatch(view.state.update({ scrollIntoView: true, userEvent: 'input.format', ...spec }));
  return true;
}

// ---- marcatori in linea ----

function runBefore(state: EditorState, pos: number, ch: string): number {
  let n = 0;
  while (pos - n - 1 >= 0 && state.doc.sliceString(pos - n - 1, pos - n) === ch) n++;
  return n;
}
function runAfter(state: EditorState, pos: number, ch: string): number {
  let n = 0;
  while (pos + n < state.doc.length && state.doc.sliceString(pos + n, pos + n + 1) === ch) n++;
  return n;
}

/** I marcatori `ch` ripetuti `len` volte sono presenti, dati `n` caratteri consecutivi? */
function present(ch: string, len: number, n: number): boolean {
  if (ch === '*' || ch === '_') return len === 1 ? n % 2 === 1 : n >= 2;
  return n >= len;
}

function toggleInline(ch: string, len: number): Command {
  const marker = ch.repeat(len);
  return (view) => {
    const { state } = view;
    return run(
      view,
      state.changeByRange((range) => {
        let { from, to } = range;
        let expanded = false;
        if (range.empty) {
          const w = state.wordAt(range.head);
          if (w) {
            from = w.from;
            to = w.to;
            expanded = true;
          }
        }
        // marcatori subito fuori dalla selezione
        const n = Math.min(runBefore(state, from, ch), runAfter(state, to, ch));
        if (n > 0 && present(ch, len, n)) {
          const changes: ChangeSpec[] = [
            { from: from - len, to: from },
            { from: to, to: to + len }
          ];
          return {
            changes,
            range: expanded
              ? EditorSelection.cursor(range.head - len)
              : EditorSelection.range(from - len, to - len)
          };
        }
        // marcatori dentro la selezione
        const text = state.doc.sliceString(from, to);
        if (!range.empty && text.length >= 2 * len) {
          let a = 0;
          while (text[a] === ch) a++;
          let b = 0;
          while (text[text.length - 1 - b] === ch) b++;
          const k = Math.min(a, b);
          if (k > 0 && 2 * k <= text.length && present(ch, len, k)) {
            return {
              changes: [
                { from, to: from + len },
                { from: to - len, to }
              ],
              range: EditorSelection.range(from, to - 2 * len)
            };
          }
        }
        if (range.empty && !expanded) {
          return {
            changes: { from, insert: marker + marker },
            range: EditorSelection.cursor(from + len)
          };
        }
        return {
          changes: [
            { from, insert: marker },
            { from: to, insert: marker }
          ],
          range: expanded
            ? EditorSelection.cursor(range.head + len)
            : EditorSelection.range(from + len, to + len)
        };
      })
    );
  };
}

export const bold: Command = toggleInline('*', 2);
export const italic: Command = toggleInline('*', 1);
export const strikethrough: Command = toggleInline('~', 2);
export const inlineCode: Command = toggleInline('`', 1);

// ---- link ----

export const insertLink: Command = (view) => {
  const { state } = view;
  return run(
    view,
    state.changeByRange((range) => {
      let { from, to } = range;
      if (range.empty) {
        const w = state.wordAt(range.head);
        if (w) {
          from = w.from;
          to = w.to;
        }
      }
      const text = state.doc.sliceString(from, to);
      if (text === '') {
        return {
          changes: { from, to, insert: '[](url)' },
          range: EditorSelection.range(from + 3, from + 6)
        };
      }
      if (/^https?:\/\/\S+$/i.test(text)) {
        return {
          changes: { from, to, insert: `[](${text})` },
          range: EditorSelection.cursor(from + 1)
        };
      }
      const insert = `[${text}](url)`;
      const urlFrom = from + text.length + 3;
      return { changes: { from, to, insert }, range: EditorSelection.range(urlFrom, urlFrom + 3) };
    })
  );
};

// ---- righe ----

/** Righe toccate dalle selezioni (senza ripetizioni; l'ultima riga è esclusa se la selezione finisce al suo inizio). */
export function selectedLines(state: EditorState): Line[] {
  const seen = new Set<number>();
  const out: Line[] = [];
  for (const r of state.selection.ranges) {
    const first = state.doc.lineAt(r.from).number;
    let last = state.doc.lineAt(r.to).number;
    if (!r.empty && last > first && state.doc.line(last).from === r.to) last--;
    for (let n = first; n <= last; n++) {
      if (!seen.has(n)) {
        seen.add(n);
        out.push(state.doc.line(n));
      }
    }
  }
  return out;
}

const HEADING = /^( {0,3})#{1,6}[ \t]+/;

function setHeading(level: number): Command {
  return (view) => {
    const changes: ChangeSpec[] = [];
    for (const line of selectedLines(view.state)) {
      const m = HEADING.exec(line.text);
      const from = line.from;
      const to = line.from + (m ? m[0].length : 0);
      const insert = level > 0 ? '#'.repeat(level) + ' ' : '';
      if (!m && level === 0) continue;
      changes.push({ from, to, insert });
    }
    if (changes.length === 0) return true;
    return run(view, { changes });
  };
}

export const heading1 = setHeading(1);
export const heading2 = setHeading(2);
export const heading3 = setHeading(3);
export const normalText = setHeading(0);

type ListKind = 'bullet' | 'number' | 'task';
const TASK_RE = /^([ \t]*)[-+*][ \t]+\[[ xX]\][ \t]+/;
const BULLET_RE = /^([ \t]*)[-+*][ \t]+/;
const NUMBER_RE = /^([ \t]*)\d{1,9}[.)][ \t]+/;

function lineMatch(text: string): { kind: ListKind; len: number; indent: string } | null {
  let m = TASK_RE.exec(text);
  if (m) return { kind: 'task', len: m[0].length, indent: m[1] };
  m = BULLET_RE.exec(text);
  if (m) return { kind: 'bullet', len: m[0].length, indent: m[1] };
  m = NUMBER_RE.exec(text);
  if (m) return { kind: 'number', len: m[0].length, indent: m[1] };
  return null;
}

function toggleList(kind: ListKind): Command {
  return (view) => {
    let lines = selectedLines(view.state);
    const nonBlank = lines.filter((l) => l.text.trim() !== '');
    if (nonBlank.length > 0) lines = nonBlank;
    const allHave = lines.every((l) => lineMatch(l.text)?.kind === kind);
    const changes: ChangeSpec[] = [];
    lines.forEach((l, i) => {
      const m = lineMatch(l.text);
      const indent = m ? m.indent : (/^[ \t]*/.exec(l.text)?.[0] ?? '');
      const bodyFrom = l.from + (m ? m.len : indent.length);
      let marker = '';
      if (!allHave) marker = kind === 'bullet' ? '- ' : kind === 'task' ? '- [ ] ' : `${i + 1}. `;
      changes.push({ from: l.from, to: bodyFrom, insert: indent + marker });
    });
    return run(view, { changes });
  };
}

export const bulletList = toggleList('bullet');
export const numberedList = toggleList('number');
export const taskList = toggleList('task');

export const quote: Command = (view) => {
  const lines = selectedLines(view.state);
  const nonBlank = lines.filter((l) => l.text.trim() !== '');
  const allQuoted = nonBlank.length > 0 && nonBlank.every((l) => /^[ \t]*>/.test(l.text));
  const changes: ChangeSpec[] = [];
  for (const l of lines) {
    if (allQuoted) {
      const m = /^([ \t]*)>[ ]?/.exec(l.text);
      if (m) changes.push({ from: l.from, to: l.from + m[0].length, insert: m[1] });
    } else {
      changes.push({ from: l.from, insert: l.text.trim() === '' ? '>' : '> ' });
    }
  }
  if (changes.length === 0) return true;
  return run(view, { changes });
};

// ---- blocchi ----

const FENCE_LINE = /^ {0,3}(```|~~~)/;

export const codeBlock: Command = (view) => {
  const { state } = view;
  const lines = selectedLines(state);
  const first = lines[0];
  const last = lines[lines.length - 1];
  const isFence = (l: Line) => FENCE_LINE.test(l.text);
  const removeFences = (a: Line, b: Line): boolean => {
    if (b.number === a.number + 1) {
      return run(view, { changes: { from: a.from, to: b.to } });
    }
    return run(view, {
      changes: [
        { from: a.from, to: a.to + 1 },
        { from: b.from - 1, to: b.to }
      ]
    });
  };
  if (first.number < last.number && isFence(first) && isFence(last)) return removeFences(first, last);
  if (first.number > 1 && last.number < state.doc.lines) {
    const prev = state.doc.line(first.number - 1);
    const next = state.doc.line(last.number + 1);
    if (isFence(prev) && isFence(next)) return removeFences(prev, next);
  }
  if (lines.length === 1 && first.text.trim() === '') {
    return run(view, {
      changes: { from: first.from, to: first.to, insert: '```\n\n```' },
      selection: EditorSelection.cursor(first.from + 4)
    });
  }
  return run(view, {
    changes: [
      { from: first.from, insert: '```\n' },
      { from: last.to, insert: '\n```' }
    ],
    selection: EditorSelection.range(first.from + 4, last.to + 4)
  });
};

/** Inserisce un blocco (tabella, linea) come paragrafo a sé, con righe vuote attorno. */
function insertBlock(text: string, caretInText?: number): Command {
  return (view) => {
    const { state } = view;
    const line = state.doc.lineAt(state.selection.main.head);
    const blank = line.text.trim() === '';
    const next = line.number < state.doc.lines ? state.doc.line(line.number + 1) : null;
    let from: number;
    let to: number;
    let lead: string;
    if (blank) {
      from = line.from;
      to = line.to;
      const prevBlank = line.number === 1 || state.doc.line(line.number - 1).text.trim() === '';
      lead = prevBlank ? '' : '\n';
    } else {
      from = to = line.to;
      lead = '\n\n';
    }
    const trail = !next ? '\n\n' : next.text.trim() !== '' ? '\n' : '';
    const insert = lead + text + trail;
    const caret = from + lead.length + (caretInText ?? text.length + trail.length);
    return run(view, {
      changes: { from, to, insert },
      selection: EditorSelection.cursor(caret)
    });
  };
}

/** Tabella 3 colonne: intestazione e due righe. */
export const insertTable: Command = (view) =>
  insertBlock(serializeTable(emptyTable(3, 2)).join('\n'), 2)(view);

export const horizontalRule: Command = insertBlock('---');

/** Inserisce del testo (per esempio il riferimento a un'immagine) al posto della selezione. */
export function insertText(view: Target, text: string): boolean {
  const r = view.state.selection.main;
  return run(view, {
    changes: { from: r.from, to: r.to, insert: text },
    selection: EditorSelection.cursor(r.from + text.length)
  });
}

// ---- scorciatoie ----

export const formatKeymap: KeyBinding[] = [
  { key: 'Mod-b', run: bold, preventDefault: true },
  { key: 'Mod-i', run: italic, preventDefault: true },
  { key: 'Mod-k', run: insertLink, preventDefault: true },
  { key: 'Mod-`', run: inlineCode, preventDefault: true },
  { key: 'Mod-Shift-x', run: strikethrough, preventDefault: true }
];
