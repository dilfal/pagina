/** Immagini: incolla dagli appunti e pulsante «Immagine». */
import type { EditorView } from '@codemirror/view';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import * as api from '../fileApi';
import { t } from '../i18n/index.svelte';
import { store, type Tab } from '../tabs.svelte';
import { insertText } from './format';
import { imageMarkdown, imageExtension, isImageFile } from './imageUtils';

export { imageMarkdown, imageExtension, isImageFile };

const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp'];

/** L'estensione per il file incollato: dal nome, altrimenti dal tipo MIME. */
async function toBytes(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}

function report(e: unknown) {
  store.notify(t('image.error', { error: api.errorMessage(e) }));
}

/** Salva le immagini e inserisce i riferimenti nella vista (una per riga). */
export async function handleImagePaste(view: EditorView, files: File[]): Promise<void> {
  const tab = store.active;
  if (!tab?.path) {
    store.notify(t('image.saveFirst'));
    return;
  }
  const refs: string[] = [];
  for (const f of files) {
    const ext = imageExtension(f.name, f.type);
    if (!ext) continue;
    try {
      refs.push(imageMarkdown(await api.savePastedImage(tab.path, await toBytes(f), ext)));
    } catch (e) {
      report(e);
    }
  }
  if (refs.length === 0) return;
  // la scheda può essere cambiata durante il salvataggio: niente inserimenti nella scheda sbagliata
  if (!stillTarget(tab, view)) {
    store.notify(t('image.savedElsewhere'));
    return;
  }
  insertText(view, refs.join('\n'));
  view.focus();
}

/** La scheda è ancora quella attiva e la vista mostra proprio quella scheda. */
function stillTarget(tab: Tab, view: EditorView): boolean {
  return store.active === tab && view.dom.isConnected && (view !== store.view || store.viewTabId === tab.id);
}

/** Pulsante «Immagine»: sceglie un file, lo copia accanto al documento, inserisce il riferimento. */
export async function insertImageFromDialog(view: EditorView): Promise<void> {
  const tab = store.active;
  if (!tab?.path) {
    store.notify(t('image.saveFirst'));
    return;
  }
  const sel = await openDialog({
    multiple: false,
    directory: false,
    filters: [{ name: t('dialog.filterImages'), extensions: IMAGE_EXTS }]
  });
  if (!sel || Array.isArray(sel)) return;
  try {
    const rel = await api.importImage(tab.path, sel);
    if (stillTarget(tab, view)) {
      insertText(view, imageMarkdown(rel));
      view.focus();
    } else {
      store.notify(t('image.savedElsewhere'));
    }
  } catch (e) {
    report(e);
  }
}
