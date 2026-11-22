// Dialoghi di messaggio e di conferma disegnati nell'app (al posto di quelli nativi del sistema).
// Un solo dialogo alla volta: se ne arrivano due insieme, la seconda richiesta aspetta in coda.
// Il componente Dialog.svelte (montato una volta in +page.svelte) mostra `dialogState.current`.

export type DialogKind = 'warning' | 'info' | 'error';

export interface DialogButton {
  id: string;
  label: string;
  primary?: boolean;
  danger?: boolean;
}

export interface DialogOptions {
  title?: string;
  message: string;
  kind?: DialogKind;
  buttons: DialogButton[];
  /** Id del pulsante scelto con Esc (e che prende il focus se non è distruttivo). */
  cancelId: string;
}

interface Pending {
  opts: DialogOptions;
  resolve: (id: string) => void;
}

class DialogState {
  current = $state<Pending | null>(null);
  queue: Pending[] = [];
}

export const dialogState = new DialogState();

/** Vero se un dialogo è aperto: le scorciatoie dell'app non devono agire. */
export function isDialogOpen(): boolean {
  return dialogState.current !== null;
}

/** Mostra il dialogo e restituisce l'id del pulsante scelto. */
export function showDialog(opts: DialogOptions): Promise<string> {
  return new Promise<string>((resolve) => {
    const p: Pending = { opts, resolve };
    if (dialogState.current) dialogState.queue.push(p);
    else dialogState.current = p;
  });
}

/** Chiude il dialogo corrente con l'id dato e passa al successivo in coda. */
export function resolveDialog(id: string) {
  const cur = dialogState.current;
  if (!cur) return;
  dialogState.current = dialogState.queue.shift() ?? null;
  cur.resolve(id);
}

/** Esc: sceglie il pulsante di annullamento. */
export function cancelDialog() {
  const cur = dialogState.current;
  if (cur) resolveDialog(cur.opts.cancelId);
}

/** Smontaggio del componente: risolve col rispettivo cancelId il dialogo aperto e quelli in coda. */
export function cancelAllDialogs() {
  const all = [dialogState.current, ...dialogState.queue].filter((p): p is Pending => p !== null);
  dialogState.current = null;
  dialogState.queue = [];
  for (const p of all) p.resolve(p.opts.cancelId);
}

/** Conferma sì/no: vero se l'utente sceglie il pulsante di conferma (distruttivo), falso con Annulla o Esc. */
export async function askConfirm(o: {
  title?: string;
  message: string;
  okLabel: string;
  cancelLabel: string;
  kind?: DialogKind;
}): Promise<boolean> {
  const id = await showDialog({
    title: o.title,
    message: o.message,
    kind: o.kind ?? 'warning',
    buttons: [
      { id: 'ok', label: o.okLabel, danger: true },
      { id: 'cancel', label: o.cancelLabel }
    ],
    cancelId: 'cancel'
  });
  return id === 'ok';
}

/** Messaggio informativo con un solo pulsante. */
export async function showMessage(o: {
  title?: string;
  message: string;
  okLabel: string;
  kind?: DialogKind;
}): Promise<void> {
  await showDialog({
    title: o.title,
    message: o.message,
    kind: o.kind ?? 'info',
    buttons: [{ id: 'ok', label: o.okLabel, primary: true }],
    cancelId: 'ok'
  });
}
