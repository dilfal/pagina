import { beforeEach, describe, expect, it } from 'vitest';
import {
  askConfirm,
  cancelAllDialogs,
  cancelDialog,
  dialogState,
  isDialogOpen,
  resolveDialog,
  showDialog,
  showMessage
} from './dialog.svelte';

const two = {
  message: 'm',
  buttons: [
    { id: 'ok', label: 'Sì', danger: true },
    { id: 'cancel', label: 'No' }
  ],
  cancelId: 'cancel'
};

beforeEach(() => {
  while (isDialogOpen()) cancelDialog();
});

describe('dialogo', () => {
  it('si risolve con l\'id del pulsante scelto', async () => {
    const p = showDialog(two);
    expect(isDialogOpen()).toBe(true);
    resolveDialog('ok');
    expect(await p).toBe('ok');
    expect(isDialogOpen()).toBe(false);
  });

  it('Esc risolve con cancelId', async () => {
    const p = showDialog(two);
    cancelDialog();
    expect(await p).toBe('cancel');
    expect(isDialogOpen()).toBe(false);
  });

  it('la seconda richiesta aspetta in coda e compare dopo la prima', async () => {
    const a = showDialog({ ...two, message: 'a' });
    const b = showDialog({ ...two, message: 'b' });
    expect(dialogState.current?.opts.message).toBe('a');
    resolveDialog('ok');
    expect(await a).toBe('ok');
    expect(dialogState.current?.opts.message).toBe('b');
    resolveDialog('cancel');
    expect(await b).toBe('cancel');
    expect(isDialogOpen()).toBe(false);
  });

  it('askConfirm: vero solo con la conferma, falso con Annulla o Esc', async () => {
    const o = { message: 'm', okLabel: 'Sì', cancelLabel: 'No' };
    let p = askConfirm(o);
    resolveDialog('ok');
    expect(await p).toBe(true);
    p = askConfirm(o);
    resolveDialog('cancel');
    expect(await p).toBe(false);
    p = askConfirm(o);
    cancelDialog();
    expect(await p).toBe(false);
  });

  it('showMessage ha un solo pulsante e si chiude con Esc', async () => {
    const p = showMessage({ message: 'x', okLabel: 'OK' });
    expect(dialogState.current?.opts.buttons.length).toBe(1);
    cancelDialog();
    await p;
    expect(isDialogOpen()).toBe(false);
  });

  it('resolveDialog senza dialogo aperto non fa nulla', () => {
    expect(() => resolveDialog('ok')).not.toThrow();
  });

  it('cancelAllDialogs risolve col rispettivo cancelId il dialogo aperto e quelli in coda', async () => {
    const a = showDialog(two);
    const b = showDialog({ ...two, cancelId: 'ok' });
    const c = showMessage({ message: 'x', okLabel: 'OK' });
    cancelAllDialogs();
    expect(await a).toBe('cancel');
    expect(await b).toBe('ok');
    await c;
    expect(isDialogOpen()).toBe(false);
    expect(dialogState.queue.length).toBe(0);
  });
});
