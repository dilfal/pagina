// Controlli sui colori della selezione, riusati dalla sessione scura (1.1-1.5) e da quella chiara (1.6).
// Oltre ai colori calcolati (getComputedStyle) si legge il pixel dello screenshot dentro la selezione: così si vede
// se un livello sovrapposto (per esempio la riga attiva) la copre davvero.
import { sleep, mouseVero, setMode, shot, shotPath, pixel, puntoDel, doppioClic, clic, trascina, coloriSelezione } from './lib.js';

const rgbOf = (s) => {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(s ?? '');
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [0, 0, 0];
};
const lum = (rgb) => {
  const [r, g, b] = rgbOf(rgb).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const contrasto = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const distanza = (a, b) => {
  const [p, q] = [rgbOf(a), rgbOf(b)];
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
};
const isBlue = (rgb) => {
  const [r, g, b] = rgbOf(rgb);
  return b > r + 20 && b >= g;
};

/** Primo rettangolo di selezione visibile: dei livelli di CodeMirror (editor, blocco) o della selezione nativa. */
async function rettSelezione(radice) {
  return browser.execute((root) => {
    let rects = [...document.querySelectorAll(`${root} .cm-selectionBackground`)].map((n) => n.getBoundingClientRect());
    if (!rects.length) {
      const s = getSelection();
      if (s && s.rangeCount && !s.isCollapsed) rects = [...s.getRangeAt(0).getClientRects()];
    }
    rects = rects.filter((r) => r.width > 4 && r.height > 4);
    if (!rects.length) return null;
    const r = rects[0];
    return { x: r.left + 2, y: r.top + 2, w: r.width, h: r.height };
  }, radice);
}

async function misura(prefisso, nome, radice, tokenRgb) {
  const img = await shot(`${prefisso}-${nome}`);
  const r = await rettSelezione(radice);
  const [px] = r ? await pixel(shotPath(`${prefisso}-${nome}`), [[r.x, r.y]]) : [null];
  return { img, px, visibile: !!px && distanza(px, tokenRgb) < 14 };
}

/** Ogni controllo restituisce { nome, ok, dettaglio, img }. */
export async function controlliSelezione(prefisso) {
  const res = [];
  await setMode('split');

  // 1) editor con focus: si trascina il mouse su una parte di riga (la riga attiva ha uno sfondo suo)
  {
    const a = await puntoDel('.pane.editor .cm-line', 'Seconda riga');
    const b = await puntoDel('.pane.editor .cm-line', 'stesso para');
    await trascina(a.x, a.y, b.x, b.y);
    await sleep(300);
    const c = await coloriSelezione('.pane.editor .cm-content');
    const m = await misura(prefisso, 'editor-con-focus', '.pane.editor', c.tokenRgb);
    const ok = c.cmLayers.length > 0 && c.cmLayers.every((x) => x === c.tokenRgb) && c.hasFocusClass && m.visibile;
    res.push({ nome: 'selezione editor con focus', ok, img: m.img, dettaglio: JSON.stringify({ layerCss: c.cmLayers[0], atteso: c.tokenRgb, pixelNellaSelezione: m.px, blu: isBlue(m.px ?? ''), visibile: m.visibile }) });
  }
  // 2) editor senza focus (clic nell'anteprima, poi si guarda la selezione dell'editor)
  {
    const p = await puntoDel('.markdown-body td', 'uva');
    await clic(p.x, p.y);
    await sleep(300);
    const c = await coloriSelezione('.pane.editor .cm-content');
    const m = await misura(prefisso, 'editor-senza-focus', '.pane.editor', c.tokenRgb);
    const ok = !c.hasFocusClass && c.cmLayers.length > 0 && c.cmLayers.every((x) => x === c.tokenRgb) && m.visibile;
    res.push({ nome: 'selezione editor senza focus', ok, img: m.img, dettaglio: JSON.stringify({ layerCss: c.cmLayers[0], atteso: c.tokenRgb, pixelNellaSelezione: m.px, focusClass: c.hasFocusClass, visibile: m.visibile }) });
  }
  // 3) anteprima: trascinamento sul testo del paragrafo
  {
    const a = await puntoDel('.markdown-body p', 'Questo');
    const b = await puntoDel('.markdown-body p', 'prova con');
    await mouseVero('drag', a.x, a.y, b.x + 40, b.y);
    await sleep(300);
    const sel = await browser.execute(() => getSelection()?.toString() ?? '');
    const c = await coloriSelezione('.markdown-body p');
    const m = await misura(prefisso, 'anteprima', '.markdown-body', c.tokenRgb);
    const cr = contrasto(c.selectionFg, c.selectionBg);
    const ok = sel.length > 3 && c.selectionBg === c.tokenRgb && cr >= 3 && m.visibile;
    res.push({ nome: "selezione nell'anteprima", ok, img: m.img, dettaglio: JSON.stringify({ selezionato: sel.slice(0, 30), bg: c.selectionBg, fg: c.selectionFg, atteso: c.tokenRgb, contrasto: Number(cr.toFixed(1)), pixelNellaSelezione: m.px, visibile: m.visibile }) });
  }
  // 4) blocco aperto: doppio clic sul paragrafo, selezione di una parte della riga
  {
    await clic(900, 700);
    const p = await puntoDel('.markdown-body p', 'Questo');
    await doppioClic(p.x, p.y);
    const aperto = await browser.execute(() => !!document.querySelector('.block-editor .cm-content'));
    const a = await puntoDel('.block-editor .cm-line', 'Seconda riga');
    const b = await puntoDel('.block-editor .cm-line', 'stesso para');
    await trascina(a.x, a.y, b.x, b.y);
    await sleep(300);
    const c = await coloriSelezione('.block-editor .cm-content');
    const m = await misura(prefisso, 'blocco-aperto', '.block-editor', c.tokenRgb);
    const ok = aperto && c.cmLayers.length > 0 && c.cmLayers.every((x) => x === c.tokenRgb) && m.visibile;
    res.push({ nome: 'selezione dentro il blocco aperto', ok, img: m.img, dettaglio: JSON.stringify({ aperto, layerCss: c.cmLayers[0], atteso: c.tokenRgb, pixelNellaSelezione: m.px, visibile: m.visibile }) });
    await browser.keys('Escape');
    await sleep(400);
  }
  // 5) cella della tabella
  {
    const p = await puntoDel('.markdown-body td', 'mela');
    await doppioClic(p.x, p.y);
    await browser.keys(['Control', 'a']);
    await sleep(300);
    const editing = await browser.execute(() => !!document.querySelector('.cell-editing'));
    const c = await coloriSelezione('.cell-editing');
    const sel = await browser.execute(() => getSelection()?.toString() ?? '');
    const m = await misura(prefisso, 'cella', '.cell-editing', c.tokenRgb);
    const cr = c ? contrasto(c.selectionFg, c.selectionBg) : 0;
    const ok = editing && sel.length > 0 && c.selectionBg === c.tokenRgb && cr >= 3 && m.visibile;
    res.push({ nome: 'selezione nella cella', ok, img: m.img, dettaglio: JSON.stringify({ editing, selezionato: sel, bg: c?.selectionBg, fg: c?.selectionFg, atteso: c?.tokenRgb, contrasto: Number(cr.toFixed(1)), pixelNellaSelezione: m.px, visibile: m.visibile }) });
    await browser.keys('Escape');
  }
  return res;
}
