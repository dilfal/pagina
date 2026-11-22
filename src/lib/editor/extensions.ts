import { Compartment, EditorState, Prec, type Extension } from '@codemirror/state';
import { EditorView, drawSelection, highlightActiveLine, keymap, type ViewUpdate } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { HighlightStyle, defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { highlightSelectionMatches, search, searchKeymap } from '@codemirror/search';
import { oneDarkHighlightStyle } from '@codemirror/theme-one-dark';
import type { Lang } from '../i18n/index.svelte';
import { formatKeymap } from './format';
import { pastedImageFiles } from './imageUtils';

export const themeComp = new Compartment();
export const phrasesComp = new Compartment();

const baseTheme = EditorView.theme({
  '&': { height: '100%', backgroundColor: 'var(--editor-bg)', color: 'var(--fg)' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: 'var(--mono)', fontSize: '14px', lineHeight: '1.65', overflow: 'auto' },
  '.cm-content': { padding: '16px 0', caretColor: 'var(--fg)' },
  '.cm-line': { padding: '0 22px' },
  '.cm-activeLine': { backgroundColor: 'var(--active-line)' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--fg)' },
  // Un selettore piu specifico di quelli del tema base di CodeMirror (`&dark .cm-selectionBackground`,
  // `&dark.cm-focused > ...`, e i `&light` corrispondenti): `.cm-editor` in piu li batte in entrambi i temi,
  // con o senza focus, a prescindere dall'ordine di inserimento. La selezione nativa dentro .cm-line resta
  // trasparente (la nasconde CodeMirror con !important): niente doppia selezione.
  '&.cm-editor .cm-selectionBackground, &.cm-editor.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground':
    { background: 'var(--selection)' },
  '.cm-panels': { backgroundColor: 'var(--panel-bg)', color: 'var(--fg)' },
  '.cm-panels.cm-panels-top': { borderBottom: '1px solid var(--border)' },
  '.cm-panel.cm-search': { padding: '6px 28px 6px 10px', fontFamily: 'var(--sans)' },
  '.cm-panel.cm-search input, .cm-panel.cm-search button': { fontFamily: 'var(--sans)', fontSize: '13px' },
  '.cm-panel.cm-search input[type=text]': {
    backgroundColor: 'var(--editor-bg)',
    color: 'var(--fg)',
    border: '1px solid var(--border)',
    borderRadius: '4px',
    padding: '2px 6px'
  },
  '.cm-panel.cm-search button': {
    backgroundColor: 'var(--btn-bg)',
    color: 'var(--fg)',
    border: '1px solid var(--border)',
    borderRadius: '4px',
    backgroundImage: 'none'
  },
  '.cm-searchMatch': { backgroundColor: 'var(--match)' },
  '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: 'var(--match-selected)' }
});

// Un solo stile di evidenziazione per tutti e due i temi, scritto con le variabili CSS (app.css).
// Le etichette (tag) di Lezer si prendono per nome dagli stili gia' presenti in CodeMirror, senza dipendere da
// @lezer/highlight (che non e' una dipendenza diretta). Non sono raggiungibili da qui `quote` e `monospace`
// (citazioni e codice in linea del Markdown): restano nel colore del testo.
const tagByName = new Map<string, any>();
for (const spec of [...oneDarkHighlightStyle.specs, ...defaultHighlightStyle.specs]) {
  for (const tag of ([] as any[]).concat(spec.tag)) tagByName.set(String(tag), tag);
}
const tg = (...names: string[]) => names.map((n) => tagByName.get(n)).filter(Boolean);

const markdownStyle = HighlightStyle.define([
  { tag: tg('heading'), fontWeight: 'bold', color: 'var(--fg)' },
  { tag: tg('strong'), fontWeight: 'bold' },
  { tag: tg('emphasis'), fontStyle: 'italic' },
  { tag: tg('strikethrough'), textDecoration: 'line-through' },
  { tag: tg('link'), color: 'var(--link)', textDecoration: 'none' },
  { tag: tg('url'), color: 'var(--muted)' },
  { tag: tg('processingInstruction', 'contentSeparator', 'meta', 'comment'), color: 'var(--muted)' },
  { tag: tg('keyword', 'operator', 'operatorKeyword', 'deleted', 'invalid'), color: 'var(--syn-keyword)' },
  { tag: tg('string', 'inserted', 'character', 'escape', 'regexp', 'special(string)'), color: 'var(--syn-string)' },
  { tag: tg('number', 'atom', 'bool', 'color', 'constant(name)', 'standard(name)', 'special(variableName)'), color: 'var(--syn-number)' },
  { tag: tg('function(variableName)', 'labelName'), color: 'var(--syn-func)' },
  { tag: tg('typeName', 'className', 'namespace', 'changed', 'annotation', 'modifier', 'self'), color: 'var(--syn-type)' }
]);

export function themeExtension(dark: boolean): Extension {
  return [EditorView.darkTheme.of(dark), syntaxHighlighting(markdownStyle, { fallback: true })];
}

const itPhrases: Record<string, string> = {
  Find: 'Trova',
  Replace: 'Sostituisci',
  next: 'avanti',
  previous: 'indietro',
  all: 'tutti',
  'match case': 'maiuscole',
  regexp: 'regexp',
  'by word': 'parola intera',
  replace: 'sostituisci',
  'replace all': 'sostituisci tutti',
  close: 'chiudi',
  'Go to line': 'Vai alla riga',
  go: 'vai',
  'current match': 'corrispondenza corrente',
  'on line': 'a riga',
  'replaced $ matches': 'sostituite $ corrispondenze',
  'replaced match on line $': 'sostituita corrispondenza a riga $'
};

export function phrasesExtension(lang: Lang): Extension {
  return EditorState.phrases.of(lang === 'it' ? itPhrases : {});
}

let updateHandler: (u: ViewUpdate) => void = () => {};
export function setUpdateHandler(fn: (u: ViewUpdate) => void) {
  updateHandler = fn;
}

/** Gestore dell'incolla di immagini (lo registra l'interfaccia: qui non si conosce il resto del programma). */
let imagePasteHandler: ((view: EditorView, files: File[]) => void) | null = null;
export function setImagePasteHandler(fn: ((view: EditorView, files: File[]) => void) | null) {
  imagePasteHandler = fn;
}

/** L'ultima vista di CodeMirror (editor principale o blocco aperto) che ha avuto il fuoco. */
export const focusTracker: { last: EditorView | null } = { last: null };

const trackers = [
  EditorView.domEventHandlers({
    focus(_e, view) {
      focusTracker.last = view;
      return false;
    },
    paste(event, view) {
      const files = pastedImageFiles(event.clipboardData ?? {});
      if (files.length === 0 || !imagePasteHandler) return false;
      event.preventDefault();
      imagePasteHandler(view, files);
      return true;
    }
  })
];

/** Estensioni comuni all'editor principale e ai blocchi aperti nell'anteprima. */
export function coreExtensions(dark: boolean, lang: Lang): Extension[] {
  return [
    history(),
    drawSelection(),
    highlightActiveLine(),
    highlightSelectionMatches(),
    EditorView.lineWrapping,
    markdown({ base: markdownLanguage, codeLanguages: languages }),
    search({ top: true }),
    Prec.high(keymap.of(formatKeymap)),
    keymap.of([...searchKeymap, ...historyKeymap, ...defaultKeymap, indentWithTab]),
    baseTheme,
    themeComp.of(themeExtension(dark)),
    phrasesComp.of(phrasesExtension(lang)),
    trackers
  ];
}

/** Stato di CodeMirror di una scheda: ogni scheda ha il suo, quindi la sua cronologia annulla. */
export function createState(doc: string, dark: boolean, lang: Lang): EditorState {
  return EditorState.create({
    doc,
    extensions: [...coreExtensions(dark, lang), EditorView.updateListener.of((u) => updateHandler(u))]
  });
}

/** Stato di un blocco aperto nell'anteprima: stesse estensioni dell'editor, più quelle del blocco. */
export function createBlockState(
  doc: string,
  anchor: number,
  dark: boolean,
  lang: Lang,
  extra: Extension[]
): EditorState {
  return EditorState.create({
    doc,
    selection: { anchor: Math.max(0, Math.min(anchor, doc.length)) },
    extensions: [...coreExtensions(dark, lang), ...extra]
  });
}
