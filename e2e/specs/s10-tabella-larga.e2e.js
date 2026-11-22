import { apri, pronto, prova, ok, eq, setMode, puntoDel, doppioClic, clic, sleep, shot } from '../lib.js';

// Tabella con molte colonne lunghe: esce dalla colonna di testo (80ch) fino al riquadro meno 32px per lato, centrata rispetto al riquadro.
const NAME = 's10-tabella-larga';

/** Misure (px CSS, viewport) del riquadro anteprima, della colonna di testo e della prima / seconda tabella. */
const misure = () =>
  browser.execute(() => {
    const sc = document.querySelector('.pane.preview .scroller');
    const body = sc.querySelector('.markdown-body');
    const cs = getComputedStyle(body);
    const s = sc.getBoundingClientRect();
    const cleft = body.getBoundingClientRect().left + parseFloat(cs.paddingLeft);
    const col = { left: cleft, width: body.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) };
    const box = (t) => {
      const r = t.getBoundingClientRect();
      const cells = t.querySelectorAll('tr:first-child > *');
      const last = cells[cells.length - 1].getBoundingClientRect();
      return {
        left: r.left, right: r.right, width: r.width,
        scrollW: t.scrollWidth, clientW: t.clientWidth, scrollLeft: t.scrollLeft,
        lastRight: last.right, lastLeft: last.left
      };
    };
    const tables = [...body.querySelectorAll(':scope > table')];
    return {
      pane: { left: s.left, right: s.left + sc.clientWidth, width: sc.clientWidth },
      col,
      wide: box(tables[0]),
      small: box(tables[1]),
      hScroll: sc.scrollWidth > sc.clientWidth
    };
  });

/** L'ultima colonna sta nel riquadro, oppure e' raggiungibile scorrendo la tabella. */
async function ultimaRaggiungibile(m, quale) {
  const t = m[quale];
  if (t.lastRight <= m.pane.right + 0.5 && t.lastLeft >= m.pane.left) return 'visibile';
  ok(t.scrollW > t.clientW, `ultima colonna fuori dal riquadro e tabella non scorrevole: ${JSON.stringify(t)}`);
  await browser.execute(() => {
    const t = document.querySelector('.pane.preview .markdown-body > table');
    t.scrollLeft = t.scrollWidth;
  });
  const dopo = await browser.execute(() => {
    const t = document.querySelector('.pane.preview .markdown-body > table');
    const cells = t.querySelectorAll('tr:first-child > *');
    return { last: cells[cells.length - 1].getBoundingClientRect().right, tr: t.getBoundingClientRect().right };
  });
  ok(dopo.last <= dopo.tr + 0.5, `dopo lo scorrimento l'ultima colonna e' ancora fuori dalla tabella: ${JSON.stringify(dopo)}`);
  return 'raggiungibile con lo scorrimento';
}

function controlla(m) {
  // riquadro cosi' stretto che la colonna lo riempie gia' (meno i 32px per lato): la tabella non ha dove allargarsi, riempie la colonna
  if (m.col.width >= m.pane.width - 64 - 1) {
    ok(Math.abs(m.wide.width - m.col.width) <= 1, `riquadro stretto: la tabella (${m.wide.width}) dovrebbe riempire la colonna (${m.col.width})`);
    ok(!m.hScroll, 'il riquadro anteprima ha una barra orizzontale propria');
    return;
  }
  ok(m.wide.width > m.col.width + 4, `la tabella larga (${m.wide.width}) non e' piu' larga della colonna (${m.col.width})`);
  ok(m.wide.left >= m.pane.left + 32 - 1, `bordo sinistro fuori dal margine di 32px: ${m.wide.left - m.pane.left}`);
  ok(m.wide.right <= m.pane.right - 32 + 1, `bordo destro fuori dal margine di 32px: ${m.pane.right - m.wide.right}`);
  const sx = m.wide.left - m.pane.left;
  const dx = m.pane.right - m.wide.right;
  ok(Math.abs(sx - dx) <= 2, `tabella non centrata nel riquadro: sinistra ${sx}, destra ${dx}`);
  ok(!m.hScroll, 'il riquadro anteprima ha una barra orizzontale propria');
  // la tabella corta resta com'e': allineata a sinistra della colonna, larga quanto il contenuto
  ok(Math.abs(m.small.left - m.col.left) <= 1, `tabella corta non allineata alla colonna: ${m.small.left} vs ${m.col.left}`);
  ok(m.small.width <= m.col.width, 'tabella corta piu\' larga della colonna');
}

describe('10. Tabella larga', () => {
  before(async () => {
    await pronto();
    await apri(NAME);
  });

  prova('W.1', 'Solo anteprima: la tabella larga esce dalla colonna, centrata nel riquadro, ultima colonna raggiungibile', async () => {
    await setMode('preview');
    await sleep(500);
    const m = await misure();
    controlla(m);
    const come = await ultimaRaggiungibile(m, 'wide');
    await shot('10-tabella-larga-anteprima');
    return `colonna ${Math.round(m.col.width)}px, tabella ${Math.round(m.wide.width)}px, riquadro ${m.pane.width}px; ultima colonna ${come}`;
  });

  prova('W.2', 'Vista divisa (riquadro stretto): la tabella segue la larghezza del riquadro', async () => {
    await setMode('split');
    await sleep(600);
    const m = await misure();
    controlla(m);
    const come = await ultimaRaggiungibile(m, 'wide');
    await shot('10-tabella-larga-divisa');
    return `riquadro ${m.pane.width}px, tabella ${Math.round(m.wide.width)}px; ultima colonna ${come}`;
  });

  prova('W.3', 'La barra della tabella e la cella in modifica restano al loro posto sulla tabella larga', async () => {
    await setMode('preview'); // riquadro largo: la tabella e' davvero uscita dalla colonna
    await browser.execute(() => { document.querySelector('.pane.preview .markdown-body > table').scrollLeft = 0; });
    await sleep(200);
    const p = await puntoDel('.pane.preview .markdown-body td', 'contenuto abbastanza lungo uno');
    await doppioClic(p.x, p.y);
    await sleep(500);
    const r = await browser.execute(() => {
      const t = document.querySelector('.pane.preview .markdown-body > table');
      const bar = document.querySelector('.pane.preview .table-bar');
      const cell = document.querySelector('.pane.preview .cell-editing');
      if (!bar || !cell) return null;
      const tb = t.getBoundingClientRect();
      const bb = bar.getBoundingClientRect();
      const cb = cell.getBoundingClientRect();
      return { tl: tb.left, tt: tb.top, tr: tb.right, tbot: tb.bottom, bl: bb.left, bbot: bb.bottom, cl: cb.left, cr: cb.right, ct: cb.top, cbot: cb.bottom };
    });
    ok(r, 'barra o cella in modifica assenti');
    ok(Math.abs(r.bl - r.tl) <= 1, `la barra non e' allineata al bordo sinistro della tabella: ${r.bl} vs ${r.tl}`);
    ok(r.bbot <= r.tt + 1, `la barra non sta sopra la tabella: ${r.bbot} vs ${r.tt}`);
    ok(r.cl >= r.tl - 1 && r.cr <= r.tr + 1 && r.ct >= r.tt - 1 && r.cbot <= r.tbot + 1, `la cella in modifica esce dalla tabella: ${JSON.stringify(r)}`);
    await shot('10-tabella-larga-cella');
    const q = await browser.execute(() => { const b = document.querySelector('.pane.preview').getBoundingClientRect(); return { x: b.left + 12, y: b.bottom - 12 }; });
    await clic(q.x, q.y);
    await sleep(500);
    eq(await browser.execute(() => !!document.querySelector('.table-bar')), false, 'barra dopo il clic fuori');
  });
});
