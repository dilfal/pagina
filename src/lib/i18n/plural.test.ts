import { afterEach, describe, expect, it } from 'vitest';
import { i18n, tn } from './index.svelte';

afterEach(() => {
  i18n.pref = 'system';
});

describe('plurali', () => {
  it('italiano: 1 scheda al singolare, il resto al plurale', () => {
    i18n.pref = 'it';
    expect(tn('confirm.closeWindow', 1)).toBe("C'è 1 scheda con modifiche non salvate. Uscire senza salvare?");
    expect(tn('confirm.closeWindow', 2)).toBe('Ci sono 2 schede con modifiche non salvate. Uscire senza salvare?');
    expect(tn('confirm.closeWindow', 0)).toContain('Ci sono 0 schede');
  });

  it('inglese: 1 tab al singolare, il resto al plurale', () => {
    i18n.pref = 'en';
    expect(tn('confirm.closeWindow', 1)).toBe('1 tab has unsaved changes. Quit without saving?');
    expect(tn('confirm.closeWindow', 3)).toBe('3 tabs have unsaved changes. Quit without saving?');
  });
});
