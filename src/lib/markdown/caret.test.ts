import { describe, expect, it } from 'vitest';
import { caretOffset, locateCaret, plainChars } from './caret';

const at = (src: string, before: string) => locateCaret(src, before);

describe('cursore dal punto cliccato', () => {
  it('paragrafo semplice', () => {
    expect(at('Ciao mondo', 'Ciao ')).toBe(4);
    expect(at('Ciao mondo', 'Ciao mon')).toBe(8);
  });
  it('titolo: il # non conta', () => {
    expect(at('## Il titolo', 'Il ti')).toBe(8);
    expect(at('## Il titolo', '')).toBe(3);
  });
  it('grassetto, corsivo e codice in linea', () => {
    const src = 'uno **due** tre `a*b` fine';
    expect(at(src, 'uno du')).toBe(8);
    expect(at(src, 'uno due tre a*')).toBe(src.indexOf('a*') + 1);
    expect(at(src, 'uno due tre a*b fi')).toBe(src.indexOf('fi') + 2);
  });
  it('i link: conta il testo, non l’URL', () => {
    const src = 'vai a [il sito](https://esempio.it/a-b) ora';
    expect(at(src, 'vai a il sito')).toBe(src.indexOf('sito') + 4);
    expect(at(src, 'vai a il sito or')).toBe(src.indexOf('or') + 2);
  });
  it('le immagini non hanno testo', () => {
    const src = 'a ![alt](immagini/x%20y.png) b';
    expect(at(src, 'a b')).toBe(src.length);
  });
  it('liste: marcatori e numeri ignorati, anche le attività', () => {
    const src = '- uno\n- due\n- tre';
    expect(at(src, 'uno\ndue\ntr')).toBe(src.length - 1);
    expect(at('3. terzo', 'ter')).toBe(6);
    expect(at('- [x] fatto', 'fat')).toBe(9);
    expect(at('  - annidato', 'ann')).toBe(7);
  });
  it('citazioni', () => {
    expect(at('> citato\n> ancora', 'citato\nanc')).toBe(14);
  });
  it('trattini e simboli ignorati su entrambi i lati', () => {
    expect(at('well-known fact', 'wellkn')).toBe(7);
    expect(at('well-known fact', 'well-kn')).toBe(7);
  });
  it('virgolette tipografiche', () => {
    expect(at('dice "ciao" e basta', 'dice “ciao” e')).toBe(13);
  });
  it('blocco di codice: solo il codice, non la recinzione', () => {
    const src = '```js\nconst x = 1;\nfoo();\n```';
    expect(at(src, 'const x')).toBe(src.indexOf('x ') + 1);
    expect(at(src, 'const x = 1;\nfoo')).toBe(src.indexOf('foo') + 3);
  });
  it('escape: il carattere dopo la barra conta', () => {
    expect(at('a \\* b', 'a')).toBe(1);
    expect(at('a \\_x b', 'ax')).toBe(5);
  });
  it('nessuna corrispondenza → null', () => {
    expect(at('Ciao mondo', 'Altro')).toBeNull();
    expect(at('breve', 'molto più lungo del sorgente')).toBeNull();
  });
  it('plainChars salta il resto', () => {
    expect(
      plainChars('**a** [b](u)')
        .map((p) => p.ch)
        .join('')
    ).toBe('ab');
  });
});

describe('caretOffset: ripiego', () => {
  it('senza corrispondenza usa l’inizio della riga stimata', () => {
    const src = 'prima\nseconda\nterza';
    expect(caretOffset(src, '??\n??')).toBe(6);
    expect(caretOffset(src, 'xx\nyy\nzz')).toBe(src.indexOf('terza'));
  });
  it('senza informazioni sul clic: inizio del blocco', () => {
    expect(caretOffset('abc', null)).toBe(0);
  });
  it('con corrispondenza usa quella', () => {
    expect(caretOffset('abc def', 'abc d')).toBe(5);
  });
});
