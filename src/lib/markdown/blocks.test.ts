import { describe, expect, it } from 'vitest';
import { Text } from '@codemirror/state';
import { blockKind, blockRange, deleteLines, enterAction, fenceClosed, removeEmptyBlock, trimBlockEnd } from './blocks';
import { parseBlockRanges } from './render';

const doc = (s: string) => Text.of(s.split('\n'));

describe('blockRange: righe vuote finali tolte', () => {
  it('trimBlockEnd lascia almeno la prima riga', () => {
    const lines = ['- a', '- b', '', ''];
    expect(trimBlockEnd((l) => lines[l].trim() === '', 0, 4)).toBe(2);
    expect(trimBlockEnd(() => true, 0, 2)).toBe(1);
  });

  it('una lista di markdown-it include la riga vuota finale: il range la perde', () => {
    const src = '- uno\n- due\n\nDopo';
    const [list] = parseBlockRanges(src);
    expect(list).toEqual({ start: 0, end: 3 }); // include la riga vuota
    const r = blockRange(doc(src), list.start, list.end)!;
    expect(src.slice(r.from, r.to)).toBe('- uno\n- due');
    expect(r.endLine).toBe(2);
  });

  it('paragrafo e blocco di codice non cambiano; range invalidi danno null', () => {
    const src = 'Ciao\nmondo\n\n```js\nx\n```\n';
    const ranges = parseBlockRanges(src);
    expect(ranges.length).toBe(2);
    const p = blockRange(doc(src), ranges[0].start, ranges[0].end)!;
    expect(src.slice(p.from, p.to)).toBe('Ciao\nmondo');
    const c = blockRange(doc(src), ranges[1].start, ranges[1].end)!;
    expect(src.slice(c.from, c.to)).toBe('```js\nx\n```');
    expect(blockRange(doc(src), 50, 51)).toBeNull();
    expect(blockRange(doc(src), 2, 2)).toBeNull();
    expect(blockRange(doc(src), NaN, 3)).toBeNull();
  });

  it('un blocco oltre la fine del documento viene limitato', () => {
    const src = 'a\n\nb';
    const r = blockRange(doc(src), 2, 99)!;
    expect(src.slice(r.from, r.to)).toBe('b');
  });
});

describe('removeEmptyBlock', () => {
  const apply = (src: string, pos: number) => {
    const r = removeEmptyBlock(doc(src), pos);
    return src.slice(0, r.from) + src.slice(r.to);
  };
  it('toglie il blocco vuoto e una riga vuota di separazione', () => {
    // B, vuota, [nuovo], vuota, C
    expect(apply('B\n\n\n\nC', 3)).toBe('B\n\nC');
  });
  it('in fondo al documento', () => {
    expect(apply('B\n\n', 3)).toBe('B');
  });
  it('line0 punta a ciò che segue', () => {
    const r = removeEmptyBlock(doc('B\n\n\n\nC'), 3);
    expect(r.line0).toBe(1);
  });
  it('deleteLines sulla prima riga e sull’ultima', () => {
    const d = doc('a\nb\nc');
    expect(deleteLines(d, 1, 1)).toEqual({ from: 0, to: 2 });
    expect(deleteLines(d, 3, 3)).toEqual({ from: 3, to: 5 });
    expect(deleteLines(doc('solo'), 1, 1)).toEqual({ from: 0, to: 4 });
  });
});

describe('tipo di blocco e Invio', () => {
  it('blockKind', () => {
    expect(blockKind('# T')).toBe('heading');
    expect(blockKind('```js\nx')).toBe('fence');
    expect(blockKind('- a')).toBe('list');
    expect(blockKind('3. a')).toBe('list');
    expect(blockKind('> q')).toBe('quote');
    expect(blockKind('---')).toBe('other');
    expect(blockKind('| a | b |\n|---|---|')).toBe('table');
    expect(blockKind('Testo')).toBe('other');
  });
  it('fenceClosed', () => {
    expect(fenceClosed('```js\nx\n```')).toBe(true);
    expect(fenceClosed('```js\nx')).toBe(false);
    expect(fenceClosed('~~~\nx\n~~~~')).toBe(true);
    expect(fenceClosed('```\nx\n~~~')).toBe(false);
  });
  it('enterAction: paragrafi, titoli, liste, citazioni, codice', () => {
    expect(enterAction('Testo')).toBe('new-block');
    expect(enterAction('## Titolo')).toBe('new-block');
    expect(enterAction('')).toBe('none');
    expect(enterAction('- a')).toBe('continue');
    expect(enterAction('- a\n- ')).toBe('drop-marker');
    expect(enterAction('1. a\n2.')).toBe('drop-marker');
    expect(enterAction('- [ ] fatto\n- [ ] ')).toBe('drop-marker');
    expect(enterAction('> citazione')).toBe('continue');
    expect(enterAction('> citazione\n> ')).toBe('drop-marker');
    expect(enterAction('```\ncodice')).toBe('newline');
    expect(enterAction('```\ncodice\n```')).toBe('new-block');
  });
});
