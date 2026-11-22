import { apri, pronto, prova, ok, eq, setMode, puntoDel, doppioClic, clic, testoDi, sorgente, sleep, ripristina, menu, menuStato, shot } from '../lib.js';

const NAME = 's06-formattazione';
const riga = async (n) => (await sorgente()).split('\n')[n];
const btn = (label) => $(`.format-bar button[aria-label="${label}"]`);

/** Seleziona la seconda «parola» (quella in «una parola sola») con un doppio clic nell'editor. */
async function selezionaParola() {
  const p = await puntoDel('.pane.editor .cm-line', 'parola');
  await doppioClic(p.x, p.y);
  const sel = await browser.execute(() => getSelection().toString());
  eq(sel, 'parola', 'parola selezionata');
}

describe('6. Barra di formattazione e scorciatoie', () => {
  before(async () => {
    await pronto();
    await apri(NAME);
    await setMode('edit');
  });
  beforeEach(async () => {
    await ripristina(NAME);
    await setMode('edit');
  });

  prova('6.1', 'Ctrl+B: grassetto; ripremi: torna normale', async () => {
    await selezionaParola();
    await browser.keys(['Control', 'b']);
    eq(await riga(2), 'una **parola** sola: parola', 'dopo Ctrl+B');
    await browser.keys(['Control', 'b']);
    eq(await riga(2), 'una parola sola: parola', 'dopo il secondo Ctrl+B');
  });

  prova('6.2', 'Ctrl+I: corsivo; ripremi: torna normale', async () => {
    await selezionaParola();
    await browser.keys(['Control', 'i']);
    eq(await riga(2), 'una *parola* sola: parola', 'dopo Ctrl+I');
    await browser.keys(['Control', 'i']);
    eq(await riga(2), 'una parola sola: parola', 'dopo il secondo Ctrl+I');
  });

  prova('6.3', 'Ctrl+K: diventa un link e puoi scrivere l\'indirizzo', async () => {
    await selezionaParola();
    await browser.keys(['Control', 'k']);
    const r = await riga(2);
    ok(/una \[parola\]\(.*\) sola: parola/.test(r), `riga dopo Ctrl+K: ${r}`);
    const sel = await browser.execute(() => getSelection().toString());
    await browser.keys('https://x.it');
    const r2 = await riga(2);
    ok(r2.includes('(https://x.it)') || r2.includes('https://x.it'), `dopo aver scritto l'indirizzo: ${r2}`);
    return `dopo Ctrl+K: «${r}» (selezione: «${sel}»); dopo aver scritto: «${r2}»`;
  });

  prova('6.4', 'Ctrl+`: codice', async () => {
    await selezionaParola();
    await browser.keys(['Control', '`']);
    eq(await riga(2), 'una `parola` sola: parola', 'dopo Ctrl+`');
  });

  prova('6.5', 'Ctrl+Maiusc+X: barrato', async () => {
    await selezionaParola();
    await browser.keys(['Control', 'Shift', 'x']);
    eq(await riga(2), 'una ~~parola~~ sola: parola', 'dopo Ctrl+Maiusc+X');
  });

  prova('6.6', 'I pulsanti della barra fanno le stesse cose delle scorciatoie', async () => {
    const casi = [
      ['Grassetto', 'una **parola** sola: parola'],
      ['Corsivo', 'una *parola* sola: parola'],
      ['Barrato', 'una ~~parola~~ sola: parola'],
      ['Codice in linea', 'una `parola` sola: parola']
    ];
    const out = [];
    for (const [label, atteso] of casi) {
      await ripristina(NAME);
      await setMode('edit');
      await selezionaParola();
      await btn(label).click();
      await sleep(250);
      const r = await riga(2);
      if (r !== atteso) out.push(`${label}: atteso «${atteso}», trovato «${r}»`);
    }
    // link
    await ripristina(NAME);
    await setMode('edit');
    await selezionaParola();
    await btn('Link').click();
    await sleep(250);
    const rl = await riga(2);
    if (!/una \[parola\]\(.*\) sola: parola/.test(rl)) out.push(`Link: trovato «${rl}»`);
    ok(out.length === 0, out.join(' | '));
  });

  prova('6.7', 'I pulsanti per titoli, elenchi, citazione e blocco di codice funzionano', async () => {
    const casi = [
      ['Titolo 1', (s) => s.split('\n')[0] === '# testo da formattare'],
      ['Titolo 2', (s) => s.split('\n')[0] === '## testo da formattare'],
      ['Titolo 3', (s) => s.split('\n')[0] === '### testo da formattare'],
      ['Elenco puntato', (s) => s.split('\n')[0] === '- testo da formattare'],
      ['Elenco numerato', (s) => s.split('\n')[0] === '1. testo da formattare'],
      ['Elenco di attività', (s) => s.split('\n')[0] === '- [ ] testo da formattare'],
      ['Citazione', (s) => s.split('\n')[0] === '> testo da formattare'],
      ['Blocco di codice', (s) => s.includes('```')]
    ];
    const out = [];
    for (const [label, controllo] of casi) {
      await ripristina(NAME);
      await setMode('edit');
      const p = await puntoDel('.pane.editor .cm-line', 'testo da');
      await clic(p.x, p.y);
      await btn(label).click();
      await sleep(250);
      const s = await sorgente();
      if (!controllo(s)) out.push(`${label}: sorgente ${JSON.stringify(s.slice(0, 60))}`);
    }
    ok(out.length === 0, out.join(' | '));
  });

  prova('6.8', 'Vista, «Barra di formattazione»: la barra si nasconde', async () => {
    eq(await browser.execute(() => !!document.querySelector('.format-bar')), true, 'barra presente di partenza');
    menu('Vista', 'Barra di formattazione');
    await sleep(700);
    eq(await browser.execute(() => !!document.querySelector('.format-bar')), false, 'barra dopo il clic sulla voce');
    eq(menuStato('Vista', 'Barra di formattazione'), false, 'voce di menu');
  });

  prova('6.9', 'Vista, «Barra di formattazione» ancora: la barra torna', async () => {
    menu('Vista', 'Barra di formattazione');
    await sleep(700);
    eq(await browser.execute(() => !!document.querySelector('.format-bar')), true, 'barra dopo il secondo clic');
    eq(menuStato('Vista', 'Barra di formattazione'), true, 'voce di menu');
  });

  prova('6.10', 'La barra funziona anche dentro un blocco aperto dell\'anteprima', async () => {
    await setMode('split');
    const p = await puntoDel('.markdown-body p', 'testo da formattare');
    await doppioClic(p.x, p.y);
    ok(await browser.execute(() => !!document.querySelector('.block-editor .cm-content')), 'blocco aperto');
    // parola «altra» nel blocco
    const q = await puntoDel('.block-editor .cm-line', 'altra');
    await doppioClic(q.x, q.y);
    const sel = await browser.execute(() => getSelection().toString());
    await btn('Grassetto').click();
    await sleep(400);
    const blocco = await testoDi('.block-editor');
    const doc = await sorgente();
    ok(blocco.includes('**') && doc.includes('**'), `blocco: ${JSON.stringify(blocco)} (selezione «${sel}»); documento: ${JSON.stringify(doc)}`);
    await shot('6-barra-in-blocco');
  });
});
