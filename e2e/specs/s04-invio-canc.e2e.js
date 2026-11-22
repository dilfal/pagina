import { apri, pronto, prova, ok, eq, setMode, puntoDel, doppioClic, cursore, testoDi, sorgente, sleep, ripristina, shot } from '../lib.js';

const NAME = 's04-invio-canc';
const aperto = () => browser.execute(() => !!document.querySelector('.block-editor .cm-content'));
const nBlocchi = () => browser.execute(() => document.querySelector('.markdown-body').children.length);

async function apriSu(selettore, snippet) {
  const p = await puntoDel(selettore, snippet);
  await doppioClic(p.x, p.y);
  eq(await aperto(), true, 'il blocco si apre');
}
let originale;

describe('4. Invio, Canc, Backspace', () => {
  before(async () => {
    await pronto();
    await apri(NAME);
    await setMode('split');
    originale = await sorgente();
  });
  beforeEach(async () => {
    await ripristina(NAME);
    await setMode('split');
  });

  prova('4.1', 'Paragrafo, in fondo, Invio: nasce un nuovo blocco sotto', async () => {
    const n0 = await nBlocchi();
    await apriSu('.markdown-body p', 'Un paragrafo corto');
    await browser.keys(['Control', 'End']);
    await browser.keys('Enter');
    await sleep(500);
    eq(await aperto(), true, 'un blocco resta aperto');
    eq(await testoDi('.block-editor'), '', 'il nuovo blocco è vuoto');
    eq(await nBlocchi(), n0 + 1, "numero di blocchi nell'anteprima");
    const sotto = await browser.execute(() => document.querySelector('.markdown-body > p + .block-editor') !== null);
    ok(sotto, 'il blocco vuoto segue il paragrafo');
    await shot('4-nuovo-blocco');
  });

  prova('4.2', 'Lista, in fondo a «Voce tre», Invio: compare una nuova voce con il pallino', async () => {
    await apriSu('.markdown-body ul', 'Voce tre');
    await browser.keys(['Control', 'End']);
    await browser.keys('Enter');
    await sleep(300);
    eq(await testoDi('.block-editor'), '- Voce uno\n- Voce due\n- Voce tre\n- ', 'testo del blocco');
  });

  prova('4.3', 'Lista numerata, Invio a fine «Secondo»: compare il numero 3', async () => {
    await apriSu('.markdown-body ol', 'Secondo');
    await browser.keys(['Control', 'End']);
    eq(await testoDi('.block-editor'), '1. Primo\n2. Secondo', 'sorgente del blocco numerato');
    await browser.keys('Enter');
    await sleep(300);
    eq(await testoDi('.block-editor'), '1. Primo\n2. Secondo\n3. ', 'testo del blocco');
  });

  prova('4.4', 'Citazione, Invio a fine riga: la nuova riga comincia con >', async () => {
    await apriSu('.markdown-body blockquote', 'Una citazione corta');
    await browser.keys(['Control', 'End']);
    await browser.keys('Enter');
    await sleep(300);
    eq(await testoDi('.block-editor'), '> Una citazione corta.\n> ', 'testo del blocco');
  });

  prova('4.5', 'Su una voce di lista vuota premi Invio ancora: la voce vuota sparisce e si esce dalla lista', async () => {
    await apriSu('.markdown-body ul', 'Voce tre');
    await browser.keys(['Control', 'End']);
    await browser.keys('Enter');
    await sleep(300);
    await browser.keys('Enter');
    await sleep(500);
    const s = await sorgente();
    ok(!/^- $/m.test(s), 'una voce vuota «- » è rimasta nel sorgente');
    ok(s.includes('- Voce tre\n'), 'la lista è intatta');
    eq(await aperto(), true, 'si è usciti dalla lista in un nuovo blocco aperto');
    eq(await testoDi('.block-editor'), '', 'il nuovo blocco dopo la lista è vuoto');
  });

  prova('4.6', 'In un blocco vuoto premi Canc: il blocco viene eliminato', async () => {
    await apriSu('.markdown-body p', 'Un paragrafo corto');
    await browser.keys(['Control', 'End']);
    await browser.keys('Enter');
    await sleep(500);
    eq(await testoDi('.block-editor'), '', 'blocco vuoto');
    await browser.keys('Delete');
    await sleep(600);
    eq(await sorgente(), originale, 'sorgente dopo Canc nel blocco vuoto');
  });

  prova('4.7', 'In un blocco vuoto premi Backspace: il blocco viene eliminato', async () => {
    await apriSu('.markdown-body p', 'Un paragrafo corto');
    await browser.keys(['Control', 'End']);
    await browser.keys('Enter');
    await sleep(500);
    eq(await testoDi('.block-editor'), '', 'blocco vuoto');
    await browser.keys('Backspace');
    await sleep(600);
    eq(await sorgente(), originale, 'sorgente dopo Backspace nel blocco vuoto');
    const c = await cursore('.block-editor');
    return `dopo Backspace si riapre il blocco precedente, cursore: ${JSON.stringify(c)}`;
  });

  prova('4.8', "Lascia un blocco vuoto e cambia scheda: tornando, il blocco vuoto non c'è più", async () => {
    await apriSu('.markdown-body p', 'Un paragrafo corto');
    await browser.keys(['Control', 'End']);
    await browser.keys('Enter');
    await sleep(500);
    eq(await testoDi('.block-editor'), '', 'blocco vuoto');
    await $('button[aria-label="Nuova scheda"]').click();
    await sleep(600);
    await $('.tabs .tab').click(); // la prima scheda (il file)
    await sleep(800);
    eq(await browser.execute(() => !!document.querySelector('.block-editor')), false, 'blocco aperto dopo il ritorno alla scheda');
    eq(await sorgente(), originale, 'sorgente dopo il ritorno alla scheda');
  });
});
