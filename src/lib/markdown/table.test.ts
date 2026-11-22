import { describe, expect, it } from 'vitest';
import {
  deleteColumn,
  deleteRow,
  emptyTable,
  getCell,
  insertColumn,
  insertRow,
  parseTable,
  serializeTable,
  setCell,
  splitRow,
  escapeCell
} from './table';

const SRC = [
  '| Nome | Qta | Prezzo |',
  '| :--- | :---: | ---: |',
  '| Mela | 3 | 1,20 |',
  '| Pera | 12 | 0,95 |'
];

describe('tabelle: lettura', () => {
  it('splitRow rispetta \\| e i bordi', () => {
    expect(splitRow('| a | b |')).toEqual(['a', 'b']);
    expect(splitRow('a | b')).toEqual(['a', 'b']);
    expect(splitRow('| a \\| x | b |')).toEqual(['a | x', 'b']);
    expect(splitRow('| a | b \\|')).toEqual(['a', 'b |']);
    expect(splitRow('|  |  |')).toEqual(['', '']);
  });
  it('allineamenti e celle', () => {
    const m = parseTable(SRC)!;
    expect(m.header).toEqual(['Nome', 'Qta', 'Prezzo']);
    expect(m.align).toEqual(['left', 'center', 'right']);
    expect(m.rows).toEqual([
      ['Mela', '3', '1,20'],
      ['Pera', '12', '0,95']
    ]);
  });
  it('non è una tabella', () => {
    expect(parseTable(['solo una riga'])).toBeNull();
    expect(parseTable(['| a | b |', '| x | y |'])).toBeNull();
    expect(parseTable(['| a | b |', '|---|'])).toBeNull();
  });
  it('righe corte si completano; righe con celle in più → null (resta il sorgente)', () => {
    const m = parseTable(['a | b', '--|--', '1'])!;
    expect(m.rows).toEqual([['1', '']]);
    expect(parseTable(['a | b', '--|--', '1 | 2 | 3'])).toBeNull();
  });
});

describe('tabelle: scrittura e andata e ritorno', () => {
  it('colonne allineate con spazi, allineamenti conservati', () => {
    expect(serializeTable(parseTable(SRC)!)).toEqual([
      '| Nome | Qta | Prezzo |',
      '| :--- | :-: | -----: |',
      '| Mela |  3  |   1,20 |',
      '| Pera | 12  |   0,95 |'
    ]);
  });
  it('serializzare e rileggere dà lo stesso modello', () => {
    const m = parseTable(SRC)!;
    const again = parseTable(serializeTable(m))!;
    expect(again).toEqual(m);
    expect(serializeTable(again)).toEqual(serializeTable(m));
  });
  it('il | nella cella si scrive \\| e torna indietro', () => {
    const m = setCell(parseTable(SRC)!, 1, 0, 'a|b');
    const lines = serializeTable(m);
    expect(lines[2]).toContain('a\\|b');
    expect(parseTable(lines)!.rows[0][0]).toBe('a|b');
  });
  it('escape del |: dispari già escapato, pari (anche zero) si aggiunge un backslash', () => {
    expect(escapeCell('a|b')).toBe('a\\|b');
    expect(escapeCell('a\\|b')).toBe('a\\|b');
    expect(escapeCell('a\\\\|b')).toBe('a\\\\\\|b');
    expect(escapeCell('`a|b`')).toBe('`a\\|b`');
  });
  it('andata e ritorno con a\\|b, a\\\\|b e codice con |', () => {
    for (const text of ['a|b', 'a\\|b', 'a\\\\|b', '`a|b`']) {
      const m = setCell(parseTable(SRC)!, 1, 0, text);
      const once = serializeTable(m);
      const back = parseTable(once)!;
      expect(back.rows.length).toBe(2);
      expect(serializeTable(back)).toEqual(once);
    }
    // il testo con barre pari torna identico
    const m = setCell(parseTable(SRC)!, 1, 0, 'a\\\\|b');
    expect(parseTable(serializeTable(m))!.rows[0][0]).toBe('a\\\\|b');
  });
  it('a capo nelle celle diventano spazi, spazi ai bordi tolti', () => {
    const m = setCell(emptyTable(2, 1), 1, 1, '  x\ny ');
    expect(parseTable(serializeTable(m))!.rows[0][1]).toBe('x y');
  });
  it('colonne larghe almeno 3', () => {
    const lines = serializeTable(emptyTable(3, 2));
    expect(lines[0]).toBe('|     |     |     |');
    expect(lines[1]).toBe('| --- | --- | --- |');
    expect(lines.length).toBe(4);
  });
});

describe('tabelle: operazioni', () => {
  const m = parseTable(SRC)!;
  it('aggiunge e toglie righe', () => {
    const a = insertRow(m, 2);
    expect(a.rows.length).toBe(3);
    expect(a.rows[1]).toEqual(['', '', '']);
    expect(insertRow(m, 1).rows[0]).toEqual(['', '', '']);
    expect(deleteRow(a, 2).rows).toEqual(m.rows);
    expect(deleteRow(m, 0)).toBe(m);
  });
  it('aggiunge e toglie colonne, con gli allineamenti', () => {
    const a = insertColumn(m, 1);
    expect(a.header).toEqual(['Nome', '', 'Qta', 'Prezzo']);
    expect(a.align).toEqual(['left', null, 'center', 'right']);
    expect(a.rows[0]).toEqual(['Mela', '', '3', '1,20']);
    expect(deleteColumn(a, 1)).toEqual(m);
    const one = parseTable(['| a |', '| - |', '| 1 |'])!;
    expect(deleteColumn(one, 0)).toBe(one);
  });
  it('getCell e setCell', () => {
    expect(getCell(m, 0, 1)).toBe('Qta');
    expect(getCell(m, 2, 2)).toBe('0,95');
    expect(getCell(setCell(m, 0, 0, 'X'), 0, 0)).toBe('X');
  });
});
