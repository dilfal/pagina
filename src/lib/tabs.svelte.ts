import { EditorState, Transaction, type ChangeSet, type Text, type TransactionSpec } from '@codemirror/state';
import type { EditorView, ViewUpdate } from '@codemirror/view';
import { open as openDialog, save as saveDialog } from '@tauri-apps/plugin-dialog';
import { askConfirm } from './dialog.svelte';
import * as api from './fileApi';
import { basename, dirname, normPath } from './paths';
import { createState, focusTracker } from './editor/extensions';
import { i18n, t, tn } from './i18n/index.svelte';
import { settings } from './settings.svelte';
import { taskToggleChange } from './markdown/tasks';

export type ViewMode = 'edit' | 'split' | 'preview';
export type Conflict = null | 'modified' | 'deleted';

const AUTOSAVE_MS = 1000;

export class Tab {
  readonly id = crypto.randomUUID();
  path = $state<string | null>(null);
  untitled = 0;
  mode = $state<ViewMode>('split');
  dirty = $state(false);
  conflict = $state<Conflict>(null);
  /** Aumenta a ogni modifica del testo: l'anteprima si aggiorna in base a questo. */
  rev = $state(0);
  eol: '\n' | '\r\n' = '\n';
  bom = false;
  /** Un blocco (o una cella) è aperto in modifica nell'anteprima. */
  blockOpen = $state(false);
  /** Il file aveva fine riga misti: l'avviso resta finché non si salva o lo si chiude. */
  mixedEol = $state(false);
  cm: EditorState;
  savedDoc: Text;
  scrollTop = 0;
  previewScroll = 0;
  timer: ReturnType<typeof setTimeout> | null = null;
  queue: Promise<unknown> = Promise.resolve();

  constructor(doc: string) {
    this.cm = createState(doc, settings.resolvedTheme === 'dark', i18n.lang);
    this.savedDoc = this.cm.doc;
  }

  get name(): string {
    return this.path ? basename(this.path) : t('untitled', { n: this.untitled });
  }
  get dir(): string | null {
    return this.path ? dirname(this.path) : null;
  }
}

/** Cambia solo la parte di testo che differisce, così cursore e scorrimento restano dove sono. */
export function diffChange(oldS: string, newS: string) {
  const min = Math.min(oldS.length, newS.length);
  let a = 0;
  while (a < min && oldS.charCodeAt(a) === newS.charCodeAt(a)) a++;
  let b = 0;
  while (b < min - a && oldS.charCodeAt(oldS.length - 1 - b) === newS.charCodeAt(newS.length - 1 - b)) b++;
  return { from: a, to: oldS.length - b, insert: newS.slice(a, newS.length - b) };
}

/** Chi, nell'anteprima, deve sapere come cambia il documento: sposta o chiude il blocco aperto. */
export interface BlockHooks {
  change(tab: Tab, changes: ChangeSet): void;
  reload(tab: Tab): void;
  /** Chiude il blocco aperto (di `tab`, o di qualunque scheda se null) togliendo un eventuale blocco vuoto. */
  close(tab: Tab | null): void;
}

class TabsStore {
  tabs = $state<Tab[]>([]);
  activeId = $state<string | null>(null);
  notice = $state<string | null>(null);
  view: EditorView | null = null;
  /** Il CodeMirror del blocco aperto nell'anteprima, se c'è. */
  blockView: EditorView | null = null;
  blockHooks: BlockHooks | null = null;
  /** Scheda a cui appartiene lo stato attualmente nella vista di CodeMirror. */
  viewTabId: string | null = null;
  private untitledCounter = 0;
  /** Percorsi (normalizzati) per cui è in corso un'apertura. */
  private opening = new Set<string>();
  private noticeTimer: ReturnType<typeof setTimeout> | null = null;

  get active(): Tab | null {
    return this.tabs.find((x) => x.id === this.activeId) ?? null;
  }

  notify(msg: string) {
    this.notice = msg;
    if (this.noticeTimer) clearTimeout(this.noticeTimer);
    this.noticeTimer = setTimeout(() => (this.notice = null), 7000);
  }

  // ---- apertura e creazione ----

  newTab() {
    const tab = new Tab('');
    tab.untitled = ++this.untitledCounter;
    tab.mode = 'split';
    this.tabs.push(tab);
    this.activeId = tab.id;
  }

  async openWithDialog() {
    const sel = await openDialog({
      multiple: true,
      directory: false,
      filters: [
        { name: t('dialog.filterMarkdown'), extensions: ['md', 'markdown', 'txt'] },
        { name: t('dialog.filterAll'), extensions: ['*'] }
      ]
    });
    if (!sel) return;
    await this.openPaths(Array.isArray(sel) ? sel : [sel]);
  }

  async openPaths(paths: string[]) {
    // Deduplica prima di qualunque await: i percorsi già aperti o già «in apertura»
    // (anche da un'altra chiamata ravvicinata) non producono una seconda scheda.
    let last: Tab | null = null;
    const toOpen: { path: string; key: string }[] = [];
    for (const p of paths) {
      const key = normPath(p);
      const existing = this.tabs.find((x) => x.path && normPath(x.path) === key);
      if (existing) {
        last = existing;
        continue;
      }
      if (this.opening.has(key)) continue;
      this.opening.add(key);
      toOpen.push({ path: p, key });
    }
    for (const { path: p, key } of toOpen) {
      try {
        const data = await api.readTextFile(p);
        const tab = new Tab(data.content);
        tab.path = p;
        tab.eol = data.eol;
        tab.bom = data.bom;
        tab.mixedEol = data.mixedEol;
        tab.mode = 'preview';
        await api.watchFile(p);
        this.tabs.push(tab);
        last = tab;
      } catch (e) {
        this.notify(t('error.read', { name: basename(p), error: api.errorMessage(e) }));
      } finally {
        this.opening.delete(key);
      }
    }
    if (last) this.activeId = last.id;
  }

  // ---- navigazione ----

  activate(id: string) {
    this.activeId = id;
  }

  cycle(delta: number) {
    if (this.tabs.length < 2) return;
    const i = this.tabs.findIndex((x) => x.id === this.activeId);
    this.activeId = this.tabs[(i + delta + this.tabs.length) % this.tabs.length].id;
  }

  setMode(mode: ViewMode) {
    const tab = this.active;
    if (tab) tab.mode = mode;
  }

  // ---- modifiche ----

  handleUpdate(u: ViewUpdate) {
    const tab = this.tabs.find((x) => x.id === this.viewTabId);
    if (!tab) return;
    tab.cm = u.state;
    if (u.docChanged) {
      this.docChanged(tab);
      this.blockHooks?.change(tab, u.changes);
    }
  }

  /** La vista su cui agisce la barra di formattazione: l'ultima che ha avuto il fuoco, se è utilizzabile. */
  formatTarget(): EditorView | null {
    const tab = this.active;
    if (!tab) return null;
    const last = focusTracker.last;
    if (last && last.dom.isConnected) {
      if (last === this.view && tab.mode !== 'preview') return last;
      if (last === this.blockView && tab.blockOpen) return last;
    }
    if (tab.mode !== 'preview') return this.view;
    return tab.blockOpen ? this.blockView : null;
  }

  private docChanged(tab: Tab) {
    tab.rev++;
    tab.dirty = !tab.cm.doc.eq(tab.savedDoc);
    this.scheduleAutosave(tab);
  }

  /** Applica una modifica allo stato della scheda, attiva o no. */
  applyChange(tab: Tab, spec: TransactionSpec) {
    if (tab.id === this.viewTabId && this.view) {
      this.view.dispatch(spec);
    } else {
      const tr = tab.cm.update(spec);
      tab.cm = tr.state;
      this.docChanged(tab);
      this.blockHooks?.change(tab, tr.changes);
    }
  }

  /** Clic su una casella dell'anteprima: commuta solo quella riga del sorgente. */
  toggleTask(tab: Tab, line: number): boolean {
    const change = taskToggleChange(tab.cm.doc.toString(), line);
    if (!change) return false;
    this.applyChange(tab, { changes: change });
    return true;
  }

  // ---- salvataggio ----

  private clearTimer(tab: Tab) {
    if (tab.timer) clearTimeout(tab.timer);
    tab.timer = null;
  }

  private scheduleAutosave(tab: Tab) {
    this.clearTimer(tab);
    if (!tab.path || tab.conflict || !tab.dirty) return;
    tab.timer = setTimeout(() => void this.save(tab, { auto: true }), AUTOSAVE_MS);
  }

  save(tab: Tab, opts: { as?: boolean; force?: boolean; auto?: boolean } = {}): Promise<boolean> {
    const run = tab.queue.then(() => this.doSave(tab, opts));
    tab.queue = run.catch(() => {});
    return run;
  }

  private async doSave(
    tab: Tab,
    { as = false, force = false, auto = false }: { as?: boolean; force?: boolean; auto?: boolean }
  ): Promise<boolean> {
    this.clearTimer(tab);
    let path = tab.path;
    let forced = force;
    if (auto && (tab.conflict || !path || !tab.dirty)) return false;
    if (as || !path) {
      const picked = await saveDialog({
        defaultPath: path ?? `${tab.name}.md`,
        filters: [{ name: t('dialog.filterMarkdown'), extensions: ['md', 'markdown', 'txt'] }]
      });
      if (!picked) return false;
      path = picked;
      forced = true; // il dialogo del sistema ha già chiesto conferma di sovrascrittura
    }
    // Con un conflitto aperto si salva solo passando dalla barra («Tieni la mia versione»),
    // anche per il salvataggio manuale.
    if (tab.conflict === 'modified' && !forced) return false;
    // Stesso file già aperto in un'altra scheda?
    const other =
      path !== tab.path
        ? this.tabs.find((x) => x.id !== tab.id && x.path && normPath(x.path) === normPath(path!))
        : undefined;
    if (other?.dirty) {
      const ok = await askConfirm({
        message: t('confirm.overwriteOpen', { name: basename(path) }),
        title: t('confirm.title'),
        kind: 'warning',
        okLabel: t('confirm.overwrite'),
        cancelLabel: t('confirm.cancel')
      });
      if (!ok) return false;
    }
    const doc = tab.cm.doc;
    try {
      await api.writeTextFile(path, doc.toString(), tab.eol, tab.bom, forced);
    } catch (e) {
      if (api.errorKind(e) === 'conflict') {
        tab.conflict = 'modified';
        this.clearTimer(tab);
      } else {
        this.notify(t('error.write', { name: basename(path), error: api.errorMessage(e) }));
      }
      return false;
    }
    if (path !== tab.path) {
      const old = tab.path;
      if (old) await api.unwatchFile(old).catch(() => {});
      tab.path = path;
      await api.watchFile(path).catch(() => {});
    }
    if (other) {
      // l'altra scheda (pulita, o scartata su conferma) si chiude dopo la scrittura
      await this.removeTab(other);
      this.activeId = tab.id;
    }
    tab.mixedEol = false; // al salvataggio i fine riga sono diventati uniformi
    tab.savedDoc = doc;
    tab.dirty = !tab.cm.doc.eq(doc);
    if (tab.conflict === 'deleted' || (tab.conflict === 'modified' && forced)) tab.conflict = null;
    this.scheduleAutosave(tab);
    return true;
  }

  async saveActive(as = false) {
    const tab = this.active;
    if (tab) await this.save(tab, { as });
  }

  // ---- file cambiati sul disco ----

  async onFileChanged(path: string, status: string) {
    const tab = this.tabs.find((x) => x.path && normPath(x.path) === normPath(path));
    if (!tab) return;
    if (status === 'removed') {
      this.clearTimer(tab);
      if (tab.conflict !== 'modified') tab.conflict = 'deleted';
      return;
    }
    if (tab.dirty) {
      this.clearTimer(tab);
      tab.conflict = 'modified';
    } else {
      await this.reload(tab, false);
    }
  }

  /** Ricarica dal disco. In silenzio se non ci sono modifiche; su richiesta (conflitto) annullabile con Ctrl+Z. */
  async reload(tab: Tab, manual: boolean) {
    if (!tab.path) return;
    // Controllo prima di leggere: la lettura aggiorna l'hash noto dal lato Rust, quindi
    // con modifiche locali non si deve leggere (e mai segnare il contenuto esterno come noto).
    if (!manual && tab.dirty) {
      this.clearTimer(tab);
      tab.conflict = 'modified';
      return;
    }
    let data: api.FileData;
    try {
      data = await api.readTextFile(tab.path);
    } catch (e) {
      if (api.errorKind(e) === 'notfound') tab.conflict = 'deleted';
      else this.notify(t('error.read', { name: tab.name, error: api.errorMessage(e) }));
      return;
    }
    if (!manual && tab.dirty) {
      this.clearTimer(tab);
      tab.conflict = 'modified';
      return;
    }
    tab.eol = data.eol;
    tab.bom = data.bom;
    tab.mixedEol = data.mixedEol;
    // il blocco aperto si chiude prima (un blocco vuoto toglie le sue righe), poi si confronta
    if (tab.cm.doc.toString() !== data.content) this.blockHooks?.reload(tab);
    const old = tab.cm.doc.toString();
    if (old !== data.content) {
      this.applyChange(tab, {
        changes: diffChange(old, data.content),
        annotations: Transaction.addToHistory.of(manual)
      });
    }
    tab.savedDoc = tab.cm.doc;
    tab.dirty = false;
    tab.conflict = null;
    this.clearTimer(tab);
  }

  async keepMine(tab: Tab) {
    await this.save(tab, { force: true });
  }

  dismissDeleted(tab: Tab) {
    if (tab.conflict === 'deleted') tab.conflict = null;
  }

  // ---- chiusura ----

  /** Vero se la scheda si può chiudere (eventualmente dopo conferma). */
  private async prepareClose(tab: Tab): Promise<boolean> {
    if (tab.path && !tab.conflict && tab.dirty) await this.save(tab, { auto: true });
    if (!tab.dirty) return true;
    return askConfirm({
      message: t('confirm.closeTab', { name: tab.name }),
      title: t('confirm.title'),
      kind: 'warning',
      okLabel: t('confirm.discard'),
      cancelLabel: t('confirm.cancel')
    });
  }

  async closeTab(tab: Tab) {
    this.blockHooks?.close(tab);
    if (!(await this.prepareClose(tab))) return;
    await this.removeTab(tab);
  }

  /** Toglie la scheda senza chiedere nulla (la conferma è già stata fatta, o non serve). */
  private async removeTab(tab: Tab) {
    this.clearTimer(tab);
    const i = this.tabs.findIndex((x) => x.id === tab.id);
    if (i < 0) return;
    if (tab.path) await api.unwatchFile(tab.path).catch(() => {});
    this.tabs.splice(i, 1);
    if (this.activeId === tab.id) {
      this.activeId = this.tabs[Math.min(i, this.tabs.length - 1)]?.id ?? null;
    }
  }

  async closeActive() {
    const tab = this.active;
    if (tab) await this.closeTab(tab);
  }

  /** Per la chiusura della finestra: salva quel che si può, poi chiede conferma per il resto. */
  async confirmQuit(): Promise<boolean> {
    this.blockHooks?.close(null);
    await Promise.all(
      this.tabs
        .filter((x) => x.path && !x.conflict && x.dirty)
        .map((x) => this.save(x, { auto: true }))
    );
    const n = this.tabs.filter((x) => x.dirty).length;
    if (n === 0) return true;
    return askConfirm({
      message: tn('confirm.closeWindow', n),
      title: t('confirm.title'),
      kind: 'warning',
      okLabel: t('confirm.discard'),
      cancelLabel: t('confirm.cancel')
    });
  }
}

export const store = new TabsStore();
