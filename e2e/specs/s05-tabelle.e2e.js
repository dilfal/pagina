import { apri, pronto, prova, ok, eq, setMode, puntoDel, doppioClic, clic, testoDi, sorgente, sleep, ripristina, righeTabella, shot } from '../lib.js';

const NAME = 's05-tabelle';
const editing = () => browser.execute(() => document.querySelector('.cell-editing')?.textContent ?? null);
const barra = () => browser.execute(() => !!document.querySelector('.table-bar'));
const bottone = (i) => $$('.table-bar button')[i];
async function cella(snippet, nth = 0) {
  const p = await puntoDel('.markdown-body td, .markdown-body th', snippet, nth);
  await doppioClic(p.x, p.y);
}
async function tab1() {
  return righeTabella(await sorgente(), 0);
}
const nCol = (riga) => riga.split('|').length - 2;

describe('5. Tabelle', () => {
  before(async () => {
    await pronto();
    await apri(NAME);
    await setMode('split');
  });

  prova('5.1', 'Doppio clic su una cella della tabella normale: la cella diventa modificabile', async () => {
    await cella('mela');
    eq(await editing(), 'mela', 'testo della cella in modifica');
    eq(await browser.execute(() => document.querySelector('.cell-editing')?.getAttribute('contenteditable')), 'plaintext-only', 'contenteditable');
    eq(await barra(), true, 'barra della tabella');
    await shot('5-cella-modifica');
  });

  prova('5.2', 'Scrivi nella cella e clicca fuori: il testo resta', async () => {
    await browser.keys(['Control', 'End']);
    await browser.keys('XY');
    await sleep(300);
    const r = await browser.execute(() => { const b = document.querySelector('.pane.preview').getBoundingClientRect(); return { x: b.left + 40, y: b.bottom - 20 }; });
    await clic(r.x, r.y);
    await sleep(600);
    eq(await barra(), false, 'barra della tabella dopo il clic fuori');
    const t = await tab1();
    ok(t[2].includes('melaXY'), `riga della tabella: ${t[2]}`);
    const dom = await browser.execute(() => document.querySelector('.markdown-body td')?.textContent);
    eq(dom, 'melaXY', 'cella nell\'anteprima');
  });

  prova('5.3', 'Tab passa alla cella dopo, Maiusc+Tab a quella prima', async () => {
    await cella('rossa');
    eq(await editing(), 'rossa', 'cella aperta');
    await browser.keys('Tab');
    await sleep(500);
    eq(await editing(), '2', 'dopo Tab (cella a destra)');
    await browser.keys(['Shift', 'Tab']);
    await sleep(500);
    eq(await editing(), 'rossa', 'dopo Maiusc+Tab');
  });

  prova('5.4', 'Invio passa alla riga sotto (o fa quello che ti sembra più naturale)', async () => {
    eq(await editing(), 'rossa', 'cella di partenza');
    await browser.keys('Enter');
    await sleep(500);
    const e = await editing();
    return `Invio da «rossa» porta nella cella «${e}» (la riga sotto, stessa colonna: ${e === 'verde' ? 'sì' : 'no'})`;
  });

  prova('5.5', 'Il pulsante + aggiunge una riga', async () => {
    const n0 = (await tab1()).length;
    await bottone(0).click();
    await sleep(600);
    eq((await tab1()).length, n0 + 1, 'righe della tabella nel sorgente');
    eq(await barra(), true, 'la barra resta (la cella nuova è in modifica)');
  });

  prova('5.6', 'Il pulsante − toglie una riga', async () => {
    const n0 = (await tab1()).length;
    await bottone(2).click();
    await sleep(600);
    eq((await tab1()).length, n0 - 1, 'righe della tabella nel sorgente');
  });

  prova('5.7', 'Si può aggiungere una colonna', async () => {
    const c0 = nCol((await tab1())[0]);
    await bottone(1).click();
    await sleep(600);
    eq(nCol((await tab1())[0]), c0 + 1, 'colonne nel sorgente');
  });

  prova('5.8', 'Si può togliere una colonna', async () => {
    const c0 = nCol((await tab1())[0]);
    await bottone(3).click();
    await sleep(600);
    eq(nCol((await tab1())[0]), c0 - 1, 'colonne nel sorgente');
  });

  prova('5.11', 'Dopo ogni modifica la tabella nel testo resta ordinata (righe allineate)', async () => {
    const t = await tab1();
    const larghezze = new Set(t.map((r) => r.length));
    ok(larghezze.size === 1, `righe di larghezza diversa: ${[...larghezze].join(', ')}\n${t.join('\n')}`);
    return t.join(' / ');
  });

  prova('5.9', 'Il pulsante «Sorgente» apre la tabella come testo', async () => {
    await bottone(4).click();
    await sleep(700);
    const t = await testoDi('.block-editor');
    ok(t && t.startsWith('|') && t.includes('Frutto'), `blocco aperto: ${JSON.stringify(t)}`);
    eq(await barra(), false, 'barra della tabella');
    await browser.keys('Escape');
    await sleep(500);
  });

  prova('5.10', 'La tabella irregolare si apre come sorgente, non come celle', async () => {
    const p = await puntoDel('.markdown-body table:nth-of-type(2) th, .markdown-body table + p + table th', 'A');
    await doppioClic(p.x, p.y);
    const t = await testoDi('.block-editor');
    ok(t && t.includes('| A | B |') && t.includes('| 1 | 2 | 3 |'), `blocco aperto: ${JSON.stringify(t)}`);
    eq(await editing(), null, 'nessuna cella in modifica');
    eq(await barra(), false, 'barra della tabella');
    await shot('5-tabella-irregolare-sorgente');
  });
});
