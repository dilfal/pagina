import { describe, expect, it } from 'vitest';
import { basename, dirname, resolveImageSrc } from './paths';

const conv = (p: string) => `conv(${p})`;

describe('resolveImageSrc', () => {
  it('Windows: risolve ./ e ../ con i separatori della cartella', () => {
    expect(resolveImageSrc('a.png', 'C:\\x\\y', conv)).toBe('conv(C:\\x\\y\\a.png)');
    expect(resolveImageSrc('./img/a.png', 'C:\\x\\y', conv)).toBe('conv(C:\\x\\y\\img\\a.png)');
    expect(resolveImageSrc('../a.png', 'C:\\x\\y', conv)).toBe('conv(C:\\x\\a.png)');
  });
  it('POSIX e percentuali', () => {
    expect(resolveImageSrc('im%20g/a.png', '/home/u/doc', conv)).toBe('conv(/home/u/doc/im g/a.png)');
  });
  it('URL assoluti restano uguali', () => {
    for (const u of ['https://a/b.png', 'http://a/b.png', 'data:image/png;base64,AAA', 'blob:x']) {
      expect(resolveImageSrc(u, '/d', conv)).toBe(u);
    }
  });
  it('percorsi assoluti vanno alla conversione', () => {
    expect(resolveImageSrc('C:\\a\\b.png', '/d', conv)).toBe('conv(C:\\a\\b.png)');
  });
  it('senza cartella base lascia il percorso relativo', () => {
    expect(resolveImageSrc('a.png', null, conv)).toBe('a.png');
  });
});

describe('basename / dirname', () => {
  it('funzionano con entrambi i separatori', () => {
    expect(basename('C:\\a\\b.md')).toBe('b.md');
    expect(basename('/a/b.md')).toBe('b.md');
    expect(dirname('C:\\a\\b.md')).toBe('C:\\a');
    expect(dirname('/a/b.md')).toBe('/a');
  });
});
