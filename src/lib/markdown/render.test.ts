import { describe, expect, it } from 'vitest';
import { renderBlocks, renderMarkdown } from './render';

function dom(html: string): HTMLElement {
  const d = document.createElement('div');
  d.innerHTML = html;
  return d;
}

const DOC = [
  '# Titolo', // 0
  '', // 1
  'Un paragrafo', // 2
  'su due righe.', // 3
  '', // 4
  '- uno', // 5
  '- due', // 6
  '', // 7
  '| a | b |', // 8
  '|---|---|', // 9
  '| 1 | 2 |', // 10
  '', // 11
  '```ts', // 12
  'const x = 1;', // 13
  '```', // 14
  ''
].join('\n');

describe('data-source-line e intervalli di sorgente', () => {
  it('ogni blocco di primo livello porta data-source-line', () => {
    const root = dom(renderMarkdown(DOC));
    const tops = Array.from(root.children);
    expect(tops.length).toBe(5);
    for (const el of tops) expect(el.hasAttribute('data-source-line')).toBe(true);
    expect(tops.map((e) => e.getAttribute('data-source-line'))).toEqual(['1', '3', '6', '9', '13']);
  });

  it('data-source-start/end sono 0-based con fine esclusa (titolo, paragrafo, lista, tabella, codice)', () => {
    const root = dom(renderMarkdown(DOC));
    const ranges = Array.from(root.children).map((e) => [
      e.tagName.toLowerCase(),
      Number(e.getAttribute('data-source-start')),
      Number(e.getAttribute('data-source-end'))
    ]);
    expect(ranges).toEqual([
      ['h1', 0, 1],
      ['p', 2, 4],
      ['ul', 5, 8], // markdown-it include la riga vuota finale nella mappa della lista
      ['table', 8, 11],
      ['pre', 12, 15]
    ]);
  });

  it('renderBlocks restituisce un blocco per elemento con lo stesso intervallo', () => {
    const blocks = renderBlocks(DOC);
    expect(blocks.map((b) => [b.start, b.end])).toEqual([
      [0, 1],
      [2, 4],
      [5, 8],
      [8, 11],
      [12, 15]
    ]);
    expect(blocks[0].html).toContain('<h1');
    expect(blocks[4].html).toContain('<pre');
  });

  it("i blocchi HTML grezzi ricevono l'attributo sul primo tag", () => {
    const root = dom(renderMarkdown('<div class="x">ciao</div>\n\ntesto'));
    expect(root.children[0].getAttribute('data-source-start')).toBe('0');
  });
});

describe('sanificazione', () => {
  it('rimuove <script> e gli handler on*', () => {
    const html = renderMarkdown('<script>alert(1)</script>\n\n<img src="x.png" onerror="alert(2)">\n\n<a href="#" onclick="x()">a</a>');
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/onerror/i);
    expect(html).not.toMatch(/onclick/i);
    expect(html).not.toContain('alert(');
  });

  it('rimuove <style> e <iframe>', () => {
    const html = renderMarkdown('<style>body{display:none}</style>\n\n<iframe src="x"></iframe>');
    expect(html).not.toMatch(/<style|<iframe/i);
  });
});

describe('liste di attività', () => {
  it('rende caselle abilitate e mappate alla riga del sorgente', () => {
    const root = dom(renderMarkdown('- [ ] da fare\n- [x] fatto\n- [X] fatto 2\n'));
    const boxes = Array.from(root.querySelectorAll<HTMLInputElement>('input[type=checkbox]'));
    expect(boxes.length).toBe(3);
    expect(boxes.map((b) => b.checked)).toEqual([false, true, true]);
    expect(boxes.every((b) => !b.disabled)).toBe(true);
    expect(boxes.map((b) => b.getAttribute('data-task-line'))).toEqual(['0', '1', '2']);
  });
});

describe('note a piè di pagina', () => {
  it('genera riferimento e blocco delle note', () => {
    const html = renderMarkdown('Testo[^1].\n\n[^1]: La nota.\n');
    const root = dom(html);
    expect(root.querySelector('sup.footnote-ref a')).not.toBeNull();
    expect(root.querySelector('section.footnotes')).not.toBeNull();
    expect(html).toContain('La nota.');
  });
});

describe('immagini relative', () => {
  it('risolve rispetto alla cartella del file con la funzione di conversione', () => {
    const html = renderMarkdown('![a](img/foto.png)\n\n<img src="../altro/b.png">', {
      baseDir: 'C:\\doc\\sub',
      convertSrc: (p) => `asset://${p}`
    });
    expect(html).toContain('asset://C:\\doc\\sub\\img\\foto.png');
    expect(html).toContain('asset://C:\\doc\\altro\\b.png');
  });

  it('lascia intatti gli URL remoti', () => {
    const html = renderMarkdown('![a](https://example.com/a.png)', {
      baseDir: '/home/x',
      convertSrc: (p) => `asset://${p}`
    });
    expect(html).toContain('https://example.com/a.png');
  });
});

describe('tabelle e altro GFM', () => {
  it('rende le tabelle e il testo barrato', () => {
    const root = dom(renderMarkdown('| a | b |\n|---|---|\n| 1 | 2 |\n\n~~x~~'));
    expect(root.querySelectorAll('table th').length).toBe(2);
    expect(root.querySelector('s')).not.toBeNull();
  });
});

describe('a capo singolo (breaks)', () => {
  const src = 'prima riga\nseconda riga\n\n```\nuna\ndue\n```\n\n| a |\n|---|\n| x |';
  it('con l\'opzione attiva un a capo singolo produce <br> e il sorgente resta com\'è', () => {
    const html = renderMarkdown(src, { breaks: true });
    expect(html).toContain('prima riga<br>');
    expect(html).toContain('seconda riga');
    expect(src).toBe('prima riga\nseconda riga\n\n```\nuna\ndue\n```\n\n| a |\n|---|\n| x |');
  });
  it('con l\'opzione spenta (e di default) non produce <br>', () => {
    expect(renderMarkdown(src, { breaks: false })).not.toContain('<br');
    expect(renderMarkdown(src)).not.toContain('<br');
  });
  it('i blocchi di codice e le tabelle non cambiano; gli intervalli di righe nemmeno', () => {
    const on = renderBlocks(src, true);
    const off = renderBlocks(src, false);
    expect(on.map((b) => [b.start, b.end])).toEqual(off.map((b) => [b.start, b.end]));
    expect(on[1].html).toBe(off[1].html);
    expect(on[1].html).not.toContain('<br');
    expect(on[2].html).toBe(off[2].html);
  });
  it('si può accendere e spegnere in sequenza (l\'istanza è condivisa)', () => {
    expect(renderMarkdown('a\nb', { breaks: true })).toContain('<br');
    expect(renderMarkdown('a\nb', { breaks: false })).not.toContain('<br');
    expect(renderMarkdown('a\nb', { breaks: true })).toContain('<br');
  });
});
