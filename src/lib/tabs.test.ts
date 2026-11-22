import { beforeEach, describe, expect, it, vi } from 'vitest';

// Tauri non c'è nei test: dialoghi, store e comandi Rust sono sostituiti da finti.
vi.mock('@tauri-apps/plugin-dialog', () => ({ open: vi.fn(), save: vi.fn() }));
vi.mock('./dialog.svelte', () => ({ askConfirm: vi.fn() }));
vi.mock('@tauri-apps/plugin-store', () => ({ load: vi.fn() }));
vi.mock('./fileApi', () => ({
  readTextFile: vi.fn(),
  writeTextFile: vi.fn(),
  watchFile: vi.fn(async () => {}),
  unwatchFile: vi.fn(async () => {}),
  errorKind: (e: unknown) => (e as { kind?: string })?.kind ?? 'io',
  errorMessage: (e: unknown) => String((e as { message?: string })?.message ?? e)
}));

import { save as saveDialog } from '@tauri-apps/plugin-dialog';
import { askConfirm as ask } from './dialog.svelte';
import * as api from './fileApi';
import { Tab, store } from './tabs.svelte';

const readMock = vi.mocked(api.readTextFile);
const writeMock = vi.mocked(api.writeTextFile);
const unwatchMock = vi.mocked(api.unwatchFile);

const file = (content = 'x') => ({ content, eol: '\n' as const, bom: false, mixedEol: false });

function addTab(path: string, dirty = false): Tab {
  const tab = new Tab('testo');
  tab.path = path;
  tab.dirty = dirty;
  store.tabs.push(tab);
  return tab;
}

beforeEach(() => {
  store.tabs.splice(0, store.tabs.length);
  store.activeId = null;
  vi.clearAllMocks();
  writeMock.mockResolvedValue(undefined);
});

describe('openPaths: deduplica', () => {
  it('due chiamate ravvicinate sullo stesso file aprono una sola scheda', async () => {
    readMock.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(file()), 20))
    );
    const a = store.openPaths(['C:\\doc\\a.md']);
    const b = store.openPaths(['c:/doc/A.md']); // stesso file, scritto in un altro modo
    await Promise.all([a, b]);
    expect(readMock).toHaveBeenCalledTimes(1);
    expect(store.tabs.length).toBe(1);
  });

  it('percorsi ripetuti nella stessa chiamata e file già aperti non duplicano', async () => {
    readMock.mockResolvedValue(file());
    await store.openPaths(['/d/a.md', '/d/a.md', '/d/b.md']);
    expect(store.tabs.map((t) => t.path)).toEqual(['/d/a.md', '/d/b.md']);
    await store.openPaths(['/d/b.md']);
    expect(store.tabs.length).toBe(2);
    expect(readMock).toHaveBeenCalledTimes(2);
  });

  it('un errore di lettura libera il percorso: si può riprovare', async () => {
    readMock.mockRejectedValueOnce({ kind: 'io', message: 'boom' });
    await store.openPaths(['/d/a.md']);
    expect(store.tabs.length).toBe(0);
    readMock.mockResolvedValue(file());
    await store.openPaths(['/d/a.md']);
    expect(store.tabs.length).toBe(1);
  });
});

describe('salvataggio con conflitto aperto', () => {
  it('Ctrl+S manuale e salvataggio automatico non scrivono; «Tieni la mia versione» sì', async () => {
    const tab = addTab('/d/a.md', true);
    tab.conflict = 'modified';
    expect(await store.save(tab)).toBe(false);
    expect(await store.save(tab, { auto: true })).toBe(false);
    expect(writeMock).not.toHaveBeenCalled();
    expect(tab.conflict).toBe('modified');

    expect(await store.save(tab, { force: true })).toBe(true);
    expect(writeMock).toHaveBeenCalledTimes(1);
    expect(writeMock.mock.calls[0][4]).toBe(true); // force
    expect(tab.conflict).toBeNull();
  });

  it('se Rust segnala un conflitto la scheda passa in conflitto e non scrive altro', async () => {
    const tab = addTab('/d/a.md', true);
    writeMock.mockRejectedValueOnce({ kind: 'conflict', message: 'x' });
    expect(await store.save(tab)).toBe(false);
    expect(tab.conflict).toBe('modified');
  });
});

describe('Salva con nome su un file già aperto in un\'altra scheda', () => {
  it('se l\'altra scheda è pulita la chiude dopo la scrittura', async () => {
    const mine = addTab('/d/mia.md');
    const other = addTab('/d/altra.md', false);
    vi.mocked(saveDialog).mockResolvedValue('/d/altra.md');
    expect(await store.save(mine, { as: true })).toBe(true);
    expect(writeMock).toHaveBeenCalledTimes(1);
    expect(store.tabs.map((t) => t.id)).toEqual([mine.id]);
    expect(mine.path).toBe('/d/altra.md');
    expect(unwatchMock).toHaveBeenCalledWith(other.path); // l'ultimo riferimento lo toglie Rust
  });

  it('se ha modifiche chiede conferma: no = annulla, sì = scrive e la scarta', async () => {
    const mine = addTab('/d/mia.md');
    const other = addTab('/d/altra.md', true);
    vi.mocked(saveDialog).mockResolvedValue('/d/altra.md');

    vi.mocked(ask).mockResolvedValueOnce(false);
    expect(await store.save(mine, { as: true })).toBe(false);
    expect(writeMock).not.toHaveBeenCalled();
    expect(store.tabs.length).toBe(2);

    vi.mocked(ask).mockResolvedValueOnce(true);
    expect(await store.save(mine, { as: true })).toBe(true);
    expect(writeMock).toHaveBeenCalledTimes(1);
    expect(store.tabs.includes(other)).toBe(false);
    expect(store.tabs.length).toBe(1);
  });
});
