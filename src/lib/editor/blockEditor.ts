/**
 * Modifica nell'anteprima, un blocco alla volta (stile Typora).
 *
 * Doppio clic su un blocco: al suo posto compare un piccolo CodeMirror con il sorgente di
 * quelle righe. Ogni modifica va subito nel documento della scheda (una transazione che
 * sostituisce solo quel range), quindi salvataggio automatico, vista divisa e conflitti
 * funzionano come per l'editor principale. L'anteprima non si ridisegna finché il blocco è
 * aperto; si ridisegna alla chiusura. Le tabelle hanno anche la modifica per singola cella.
 */
import { EditorView, keymap } from '@codemirror/view';
import { Prec, type ChangeSet, type Extension, type TransactionSpec } from '@codemirror/state';
import { insertNewline, insertNewlineAndIndent } from '@codemirror/commands';
import { insertNewlineContinueMarkup } from '@codemirror/lang-markdown';
import { searchPanelOpen } from '@codemirror/search';
import { blockRange, enterAction, removeEmptyBlock } from '../markdown/blocks';
import { caretOffset } from '../markdown/caret';
import { parseBlockRanges } from '../markdown/render';
import {
  deleteColumn,
  deleteRow,
  getCell,
  insertColumn,
  insertRow,
  parseTable,
  serializeTable,
  setCell,
  type TableModel
} from '../markdown/table';
import { diffChange, store, type Tab } from '../tabs.svelte';
import { settings } from '../settings.svelte';
import { i18n, t } from '../i18n/index.svelte';
import { createBlockState, focusTracker, phrasesComp, phrasesExtension, themeComp, themeExtension } from './extensions';

export interface BlockHost {
  container: HTMLElement;
  getTab(): Tab;
  /** Ridisegna subito l'intero documento (senza toccare il blocco aperto: non ce n'è mai uno in quel momento). */
  render(): void;
  /** L'anteprima mostra la versione attuale del documento. */
  isFresh(): boolean;
  /** Il blocco o la cella è stato chiuso: ridisegna. */
  closed(): void;
}

interface Span {
  from: number;
  to: number;
}

interface BlockSession {
  kind: 'block';
  tab: Tab;
  view: EditorView;
  el: HTMLElement;
  range: Span;
}

interface CellSession {
  kind: 'cell';
  tab: Tab;
  tableEl: HTMLElement;
  bar: HTMLElement;
  cellEl: HTMLElement;
  model: TableModel;
  r: number;
  c: number;
  startLine: number;
  endLine: number;
  range: Span;
  cleanup: () => void;
}

type Session = BlockSession | CellSession;

/** Il testo impaginato dell'elemento fino al punto (x, y), o null se il punto non è nell'elemento. */
function textBeforePoint(el: HTMLElement, x: number, y: number): string | null {
  const d = el.ownerDocument as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  let node: Node | null = null;
  let offset = 0;
  if (typeof d.caretPositionFromPoint === 'function') {
    const p = d.caretPositionFromPoint(x, y);
    if (p) {
      node = p.offsetNode;
      offset = p.offset;
    }
  } else if (typeof d.caretRangeFromPoint === 'function') {
    const r = d.caretRangeFromPoint(x, y);
    if (r) {
      node = r.startContainer;
      offset = r.startOffset;
    }
  }
  if (!node || !el.contains(node)) return null;
  const range = d.createRange();
  range.setStart(el, 0);
  range.setEnd(node, offset);
  return range.toString();
}

export class BlockController {
  private session: Session | null = null;
  /** Vero mentre una modifica del blocco o della cella viene riversata nel documento. */
  private applying = false;

  constructor(private host: BlockHost) {}

  get isOpen(): boolean {
    return this.session !== null;
  }
  get tab(): Tab | null {
    return this.session?.tab ?? null;
  }

  // ---- apertura ----

  /** Doppio clic su un blocco (elemento di primo livello con `data-source-*`). */
  openBlock(el: HTMLElement, point?: { x: number; y: number }): boolean {
    if (this.session || !this.host.isFresh()) return false;
    const start = Number(el.dataset.sourceStart);
    const end = Number(el.dataset.sourceEnd);
    const tab = this.host.getTab();
    const r = blockRange(tab.cm.doc, start, end);
    if (!r) return false;
    const source = tab.cm.doc.sliceString(r.from, r.to);
    const before = point ? textBeforePoint(el, point.x, point.y) : null;
    this.mount(tab, el, r.startLine, { from: r.from, to: r.to }, caretOffset(source, before));
    return true;
  }

  /** Apre il blocco che comincia alla riga `start` (dopo un ridisegno). `at`: dove mettere il cursore. */
  private openBlockLines(tab: Tab, start: number, end: number, at: 'start' | 'end'): boolean {
    this.host.render();
    const el = this.findBlock(start);
    const r = blockRange(tab.cm.doc, start, end);
    if (!r) return false;
    this.mount(tab, el, r.startLine, { from: r.from, to: r.to }, at === 'end' ? r.to - r.from : 0);
    return true;
  }

  private findBlock(startLine: number): HTMLElement | null {
    const want = String(startLine);
    return (
      (Array.from(this.host.container.children).find(
        (c) => c.getAttribute('data-source-start') === want
      ) as HTMLElement | undefined) ?? null
    );
  }

  private insertAtLine(el: HTMLElement, line: number) {
    const next = Array.from(this.host.container.children).find((c) => {
      const s = c.getAttribute('data-source-start');
      return s !== null && Number(s) >= line;
    });
    if (next) next.before(el);
    else this.host.container.append(el);
  }

  private mount(tab: Tab, replace: HTMLElement | null, atLine: number, range: Span, caret: number) {
    const el = document.createElement('div');
    el.className = 'block-editor';
    if (replace) replace.replaceWith(el);
    else this.insertAtLine(el, atLine);
    const text = tab.cm.doc.sliceString(range.from, range.to);
    const view = new EditorView({
      parent: el,
      state: createBlockState(text, caret, settings.resolvedTheme === 'dark', i18n.lang, [
        Prec.highest(this.keys()),
        EditorView.updateListener.of((u) => {
          if (!u.docChanged) return;
          const s = this.session;
          if (!s || s.kind !== 'block' || s.view !== u.view) return;
          const base = s.range.from;
          const changes: { from: number; to: number; insert: string }[] = [];
          u.changes.iterChanges((fA, tA, _fB, _tB, ins) =>
            changes.push({ from: base + fA, to: base + tA, insert: ins.toString() })
          );
          this.apply(s.tab, { changes });
          s.range = { from: base, to: base + u.state.doc.length };
        })
      ])
    });
    this.session = { kind: 'block', tab, view, el, range };
    tab.blockOpen = true;
    store.blockView = view;
    document.addEventListener('mousedown', this.onOutside, true);
    view.focus();
    el.scrollIntoView({ block: 'nearest' });
  }

  private keys(): Extension {
    return keymap.of([
      {
        key: 'Escape',
        run: (v) => {
          if (searchPanelOpen(v.state)) return false;
          this.closeAll({ removeEmpty: true });
          return true;
        }
      },
      { key: 'Shift-Enter', run: insertNewline },
      { key: 'Enter', run: (v) => this.onEnter(v) },
      { key: 'Backspace', run: (v) => v.state.doc.length === 0 && this.deleteEmpty('prev') },
      { key: 'Delete', run: (v) => v.state.doc.length === 0 && this.deleteEmpty('next') }
    ]);
  }

  // ---- tastiera nel blocco ----

  private onEnter(view: EditorView): boolean {
    const doc = view.state.doc;
    const sel = view.state.selection.main;
    if (!sel.empty || sel.head !== doc.length) return false;
    switch (enterAction(doc.toString())) {
      case 'none':
        return true;
      case 'new-block':
        return this.newBlockAfter();
      case 'continue':
        return insertNewlineContinueMarkup(view) || insertNewlineAndIndent(view);
      case 'newline':
        return insertNewlineAndIndent(view);
      case 'drop-marker': {
        const lines = doc.lines;
        const from = lines > 1 ? doc.line(lines - 1).to : 0;
        view.dispatch({ changes: { from, to: doc.length }, selection: { anchor: from } });
        // la voce vuota se ne va; se il blocco è diventato vuoto, resta lui il nuovo blocco
        return lines > 1 ? this.newBlockAfter() : true;
      }
    }
  }

  /** Chiude il blocco, mette dopo di esso un blocco vuoto (separato da una riga vuota) e lo apre. */
  private newBlockAfter(): boolean {
    const s = this.session;
    if (!s || s.kind !== 'block') return false;
    const { tab } = s;
    const end = s.range.to;
    this.destroyBlock();
    this.apply(tab, { changes: { from: end, to: end, insert: '\n\n' } });
    this.host.render();
    const pos = end + 2;
    this.mount(tab, null, tab.cm.doc.lineAt(pos).number - 1, { from: pos, to: pos }, 0);
    return true;
  }

  /** Backspace / Canc su un blocco vuoto: lo elimina e apre il blocco precedente (cursore in fondo) o il successivo (cursore all'inizio). */
  private deleteEmpty(dir: 'prev' | 'next'): boolean {
    const s = this.session;
    if (!s || s.kind !== 'block') return false;
    const { tab } = s;
    this.destroyBlock();
    const rem = removeEmptyBlock(tab.cm.doc, s.range.from);
    if (rem.to > rem.from) this.apply(tab, { changes: { from: rem.from, to: rem.to } });
    const blocks = parseBlockRanges(tab.cm.doc.toString());
    const target =
      dir === 'prev'
        ? [...blocks].reverse().find((b) => b.end <= rem.line0)
        : blocks.find((b) => b.start >= rem.line0);
    if (!target || !this.openBlockLines(tab, target.start, target.end, dir === 'prev' ? 'end' : 'start')) {
      this.host.closed();
    }
    return true;
  }

  // ---- chiusura ----

  /** Toglie dalla pagina il CodeMirror del blocco, senza ridisegnare né toccare il documento. */
  private destroyBlock() {
    const s = this.session;
    if (!s || s.kind !== 'block') return;
    this.session = null;
    document.removeEventListener('mousedown', this.onOutside, true);
    s.view.destroy();
    s.el.remove();
    s.tab.blockOpen = false;
    if (store.blockView === s.view) store.blockView = null;
    if (focusTracker.last === s.view) focusTracker.last = null;
  }

  /**
   * Chiude il blocco o la cella. `removeEmpty`: un blocco vuoto si toglie con la sua riga di
   * separazione. `silent`: niente ridisegno (lo farà chi chiama).
   */
  closeAll(opts: { removeEmpty?: boolean; silent?: boolean } = {}) {
    const s = this.session;
    if (!s) return;
    if (s.kind === 'cell') {
      this.endCell(s);
    } else {
      const empty = s.view.state.doc.length === 0;
      this.destroyBlock();
      if (empty && opts.removeEmpty && store.tabs.includes(s.tab)) {
        const rem = removeEmptyBlock(s.tab.cm.doc, s.range.from);
        if (rem.to > rem.from) this.apply(s.tab, { changes: { from: rem.from, to: rem.to } });
      }
    }
    if (!opts.silent) this.host.closed();
  }

  private onOutside = (e: MouseEvent) => {
    const s = this.session;
    if (!s) return;
    const target = e.target as Element | null;
    if (!target || !('closest' in target)) return;
    if (target.closest('[data-keep-block]')) return;
    if (s.kind === 'block' ? s.el.contains(target) : s.cellEl.contains(target) || s.bar.contains(target)) return;
    this.closeAll({ removeEmpty: true });
  };

  // ---- il documento cambia fuori dal blocco ----

  /** Cambia il documento: prima del blocco lo sposta, se lo tocca lo chiude (il contenuto è già nel documento). */
  onDocChange(tab: Tab, changes: ChangeSet) {
    const s = this.session;
    if (!s || this.applying || s.tab !== tab) return;
    let shift = 0;
    let touched = false;
    changes.iterChanges((fA, tA, fB, tB) => {
      if (tA < s.range.from) shift += tB - fB - (tA - fA);
      else if (fA > s.range.to) return;
      else touched = true;
    });
    // con una cella aperta, se prima della tabella cambia qualcosa si chiude (le righe di riferimento sarebbero vecchie)
    if (touched || (s.kind === 'cell' && shift !== 0)) this.closeAll();
    else s.range = { from: s.range.from + shift, to: s.range.to + shift };
  }

  /** Ricarica dal disco: il blocco si chiude. */
  onReload(tab: Tab) {
    if (this.session && this.session.tab === tab) this.closeAll({ removeEmpty: true });
  }

  /** Tema o lingua cambiati mentre il blocco è aperto. */
  reconfigure(dark: boolean, lang: 'it' | 'en') {
    const s = this.session;
    if (s?.kind === 'block') {
      s.view.dispatch({
        effects: [themeComp.reconfigure(themeExtension(dark)), phrasesComp.reconfigure(phrasesExtension(lang))]
      });
    }
  }

  private apply(tab: Tab, spec: TransactionSpec) {
    if (!store.tabs.includes(tab)) return;
    this.applying = true;
    try {
      store.applyChange(tab, spec);
    } finally {
      this.applying = false;
    }
  }

  // ---- celle delle tabelle ----

  /** Doppio clic su una cella: solo quella cella diventa modificabile. */
  openCell(table: HTMLElement, cell: HTMLElement, point?: { x: number; y: number }): boolean {
    if (this.session || !this.host.isFresh()) return false;
    const row = cell.parentElement as HTMLTableRowElement | null;
    const section = row?.parentElement;
    if (!row || !section) return false;
    const r = section.tagName === 'THEAD' ? 0 : row.sectionRowIndex + 1;
    const before = point ? textBeforePoint(cell, point.x, point.y) : null;
    const tab = this.host.getTab();
    if (this.startCell(tab, table, r, (cell as HTMLTableCellElement).cellIndex, before)) return true;
    return this.openBlock(table, point);
  }

  private startCell(
    tab: Tab,
    tableEl: HTMLElement,
    r0: number,
    c0: number,
    caretBefore: string | null | 'end'
  ): boolean {
    const startLine = Number(tableEl.dataset.sourceStart);
    const br = blockRange(tab.cm.doc, startLine, Number(tableEl.dataset.sourceEnd));
    if (!br) return false;
    const lines: string[] = [];
    for (let l = br.startLine; l < br.endLine; l++) lines.push(tab.cm.doc.line(l + 1).text);
    const model = parseTable(lines);
    if (!model) return false;
    const rows = tableEl.querySelectorAll('tr');
    if (rows.length !== model.rows.length + 1) return false;
    const r = Math.min(Math.max(r0, 0), model.rows.length);
    const c = Math.min(Math.max(c0, 0), model.header.length - 1);
    const cellEl = rows[r].children[c] as HTMLElement | undefined;
    if (!cellEl) return false;

    const source = getCell(model, r, c);
    cellEl.textContent = source;
    cellEl.setAttribute('contenteditable', 'plaintext-only');
    cellEl.classList.add('cell-editing');
    const bar = this.makeBar();
    tableEl.before(bar);

    const s: CellSession = {
      kind: 'cell',
      tab,
      tableEl,
      bar,
      cellEl,
      model,
      r,
      c,
      startLine,
      endLine: br.endLine,
      range: { from: br.from, to: br.to },
      cleanup: () => {}
    };
    const onInput = () => this.commitCell(s);
    const onKey = (e: KeyboardEvent) => this.onCellKey(s, e);
    const onPaste = (e: ClipboardEvent) => {
      e.preventDefault();
      const text = (e.clipboardData?.getData('text/plain') ?? '').replace(/\s*\r?\n\s*/g, ' ');
      document.execCommand('insertText', false, text);
    };
    cellEl.addEventListener('input', onInput);
    cellEl.addEventListener('keydown', onKey);
    cellEl.addEventListener('paste', onPaste);
    s.cleanup = () => {
      cellEl.removeEventListener('input', onInput);
      cellEl.removeEventListener('keydown', onKey);
      cellEl.removeEventListener('paste', onPaste);
      bar.remove();
    };
    this.session = s;
    document.addEventListener('mousedown', this.onOutside, true);

    cellEl.focus();
    const offset =
      caretBefore === 'end' ? source.length : caretBefore === null ? source.length : caretOffset(source, caretBefore);
    const node = cellEl.firstChild;
    const range = document.createRange();
    if (node) range.setStart(node, Math.min(offset, node.textContent?.length ?? 0));
    else range.setStart(cellEl, 0);
    range.collapse(true);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    return true;
  }

  private makeBar(): HTMLElement {
    const bar = document.createElement('div');
    bar.className = 'table-bar';
    bar.setAttribute('data-keep-block', '');
    const add = (label: string, run: () => void) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.addEventListener('mousedown', (e) => e.preventDefault());
      b.addEventListener('click', run);
      bar.append(b);
    };
    const cur = () => this.session as CellSession;
    add(t('table.addRow'), () => {
      const s = cur();
      this.goto(s, insertRow(this.modelOf(s), s.r + 1), s.r + 1, s.c);
    });
    add(t('table.addCol'), () => {
      const s = cur();
      this.goto(s, insertColumn(this.modelOf(s), s.c + 1), s.r, s.c + 1);
    });
    add(t('table.delRow'), () => {
      const s = cur();
      if (s.r === 0) return;
      const m = deleteRow(this.modelOf(s), s.r);
      this.goto(s, m, Math.min(s.r, m.rows.length), s.c);
    });
    add(t('table.delCol'), () => {
      const s = cur();
      const m = deleteColumn(this.modelOf(s), s.c);
      if (m.header.length === s.model.header.length) return;
      this.goto(s, m, s.r, Math.min(s.c, m.header.length - 1));
    });
    add(t('table.source'), () => {
      const s = cur();
      this.writeTable(s, this.modelOf(s));
      this.endCell(s);
      this.openBlockLines(s.tab, s.startLine, s.endLine, 'start');
    });
    return bar;
  }

  /** Il modello con il testo attuale della cella in modifica. */
  private modelOf(s: CellSession): TableModel {
    const text = (s.cellEl.textContent ?? '').replace(/ /g, ' ').replace(/\r?\n/g, ' ');
    return setCell(s.model, s.r, s.c, text);
  }

  private commitCell(s: CellSession) {
    this.writeTable(s, this.modelOf(s));
  }

  /** Riscrive solo le righe della tabella nel documento (modifica minima). */
  private writeTable(s: CellSession, model: TableModel) {
    const next = serializeTable(model).join('\n');
    const cur = s.tab.cm.doc.sliceString(s.range.from, s.range.to);
    s.model = model;
    if (next === cur) return;
    const d = diffChange(cur, next);
    this.apply(s.tab, {
      changes: { from: s.range.from + d.from, to: s.range.from + d.to, insert: d.insert }
    });
    s.range = { from: s.range.from, to: s.range.from + next.length };
  }

  /** Scrive la tabella, la ridisegna e passa alla cella (r, c). */
  private goto(s: CellSession, model: TableModel, r: number, c: number) {
    this.writeTable(s, model);
    this.endCell(s);
    this.host.render();
    const el = this.findBlock(s.startLine);
    if (!el || !this.startCell(s.tab, el, r, c, 'end')) this.host.closed();
  }

  private endCell(s: CellSession) {
    if (this.session !== s) return;
    this.session = null;
    document.removeEventListener('mousedown', this.onOutside, true);
    s.cleanup();
    s.cellEl.removeAttribute('contenteditable');
    s.cellEl.classList.remove('cell-editing');
  }

  private onCellKey(s: CellSession, e: KeyboardEvent) {
    const cols = s.model.header.length;
    const lastRow = s.model.rows.length;
    if (e.key === 'Escape') {
      e.preventDefault();
      this.commitCell(s);
      this.closeAll();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const m = this.modelOf(s);
      if (e.shiftKey) {
        if (s.c > 0) this.goto(s, m, s.r, s.c - 1);
        else if (s.r > 0) this.goto(s, m, s.r - 1, cols - 1);
      } else if (s.c < cols - 1) this.goto(s, m, s.r, s.c + 1);
      else if (s.r < lastRow) this.goto(s, m, s.r + 1, 0);
      else this.goto(s, insertRow(m, s.r + 1), s.r + 1, 0);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const m = this.modelOf(s);
      if (s.r < lastRow) this.goto(s, m, s.r + 1, s.c);
      else this.goto(s, insertRow(m, s.r + 1), s.r + 1, s.c);
    }
  }
}
