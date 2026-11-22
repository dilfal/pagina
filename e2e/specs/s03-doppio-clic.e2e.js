import { apri, pronto, prova, ok, eq, setMode, puntoDel, doppioClic, clic, cursore, testoDi, sorgente, sleep, shot } from '../lib.js';

const NAME = 's03-doppio-clic';
const aperto = () => browser.execute(() => !!document.querySelector('.block-editor .cm-content'));

/** Doppio clic a metà di `snippet` nell'anteprima; restituisce il cursore del blocco e il sorgente del blocco. */
async function apriSu(selettore, snippet, nth = 0) {
  const p = await puntoDel(selettore, snippet, nth);
  await doppioClic(p.x, p.y);
  eq(await aperto(), true, 'il blocco si apre');
  return { cur: await cursore('.block-editor'), src: await testoDi('.block-editor') };
}
/** Il cursore deve stare nel punto cliccato: posizione di `snippet` nel sorgente del blocco, a metà (±1). */
function atteso(src, snippet, nth = 0) {
  let i = -1;
  for (let k = 0; k <= nth; k++) i = src.indexOf(snippet, i + 1);
  return i + Math.floor(snippet.length / 2);
}

describe('3. Doppio clic sui blocchi', () => {
  before(async () => {
    await pronto();
    await apri(NAME);
    await setMode('split');
  });
  beforeEach(async () => {
    if (await aperto()) await browser.keys('Escape');
    await sleep(300);
  });

  prova('3.1', 'Doppio clic in mezzo a una parola del primo paragrafo: il cursore sta dove hai cliccato', async () => {
    const { cur, src } = await apriSu('.markdown-body p', 'paragrafo di prova');
    const a = atteso(src, 'paragrafo di prova');
    ok(cur && Math.abs(cur.pos - a) <= 1, `cursore a ${cur?.pos}, atteso ${a} (±1) in «${src.slice(0, 40)}»`);
    return `cursore ${cur.pos}, atteso ${a}`;
  });

  prova('3.2', 'Doppio clic sulla seconda riga del paragrafo: il cursore sta nella seconda riga, nel punto giusto', async () => {
    const { cur, src } = await apriSu('.markdown-body p', 'in mezzo a una parola');
    const a = atteso(src, 'in mezzo a una parola');
    eq(cur?.line, 1, 'riga del cursore');
    ok(Math.abs(cur.pos - a) <= 1, `cursore a ${cur.pos}, atteso ${a} (±1)`);
    return `riga ${cur.line}, cursore ${cur.pos}, atteso ${a}`;
  });

  prova('3.3', 'Doppio clic su «voce C» nella lista annidata: il cursore sta lì', async () => {
    const { cur, src } = await apriSu('.markdown-body li', 'voce C');
    const a = atteso(src, 'voce C');
    eq(cur?.line, 2, 'riga del cursore (la riga «Livello tre, voce C», terza del blocco)');
    ok(Math.abs(cur.pos - a) <= 1, `cursore a ${cur.pos}, atteso ${a} (±1)`);
    return `riga ${cur.line}, cursore ${cur.pos}, atteso ${a}`;
  });

  prova('3.4', 'Doppio clic sulla seconda riga della citazione: il cursore sta lì', async () => {
    const { cur, src } = await apriSu('.markdown-body blockquote', 'Seconda riga della');
    const a = atteso(src, 'Seconda riga della');
    eq(cur?.line, 1, 'riga del cursore');
    ok(Math.abs(cur.pos - a) <= 1, `cursore a ${cur.pos}, atteso ${a} (±1)`);
    return `riga ${cur.line}, cursore ${cur.pos}, atteso ${a}`;
  });

  prova('3.5', 'Doppio clic sulla lista numerata: il blocco si apre senza problemi', async () => {
    const { src } = await apriSu('.markdown-body ol', 'Secondo passo');
    eq(src, '1. Primo passo\n2. Secondo passo\n3. Terzo passo', 'sorgente del blocco');
  });

  prova('3.6', 'Scrivi in un blocco aperto e premi Esc: il blocco si chiude e le modifiche restano', async () => {
    await apriSu('.markdown-body p', 'paragrafo di prova');
    await browser.keys(['Control', 'End']);
    await browser.keys(' ZZ6');
    await browser.keys('Escape');
    await sleep(500);
    eq(await aperto(), false, 'blocco aperto dopo Esc');
    const s = await sorgente();
    ok(s.includes('Questa è la seconda riga: fai doppio clic in mezzo a una parola di questa riga. ZZ6'), 'il testo scritto è nel sorgente');
    const html = await browser.execute(() => document.querySelector('.markdown-body').innerText);
    ok(html.includes('ZZ6'), "il testo scritto è nell'anteprima");
  });

  prova('3.7', 'Scrivi in un blocco aperto e clicca fuori: il blocco si chiude e le modifiche restano', async () => {
    await apriSu('.markdown-body ol', 'Terzo passo');
    await browser.keys(['Control', 'End']);
    await browser.keys(' ZZ7');
    // clic fuori: su una zona vuota in fondo all'anteprima
    const r = await browser.execute(() => {
      const b = document.querySelector('.pane.preview').getBoundingClientRect();
      return { x: b.left + 40, y: b.bottom - 20 };
    });
    await clic(r.x, r.y);
    await sleep(500);
    eq(await aperto(), false, 'blocco aperto dopo il clic fuori');
    const s = await sorgente();
    ok(s.includes('3. Terzo passo ZZ7'), 'il testo scritto è nel sorgente');
  });

  prova('3.8', 'Il blocco di codice si apre e si chiude senza rovinare le righe', async () => {
    const prima = await sorgente();
    const { src } = await apriSu('.markdown-body pre', 'riga di codice uno');
    eq(src, '```\nriga di codice uno\nriga di codice due\n```', 'sorgente del blocco di codice');
    await browser.keys('Escape');
    await sleep(600);
    eq(await aperto(), false, 'blocco aperto dopo Esc');
    eq(await sorgente(), prima, 'sorgente dopo aver aperto e chiuso il blocco');
    const pre = await browser.execute(() => document.querySelector('.markdown-body pre')?.innerText);
    ok(pre.includes('riga di codice uno') && pre.includes('riga di codice due'), `anteprima del codice: ${JSON.stringify(pre)}`);
    await shot('3-blocco-codice');
  });
});
