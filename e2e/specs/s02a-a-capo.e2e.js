import { apri, pronto, prova, ok, eq, setMode, menu, menuStato, sleep, shot, readSettings } from '../lib.js';

const brs = () => browser.execute(() => document.querySelector('.markdown-body p')?.querySelectorAll('br').length ?? -1);
const nTab = () => browser.execute(() => document.querySelectorAll('.tabs .tab').length);

describe('2. A capo singolo (sessione 1)', () => {
  before(async () => {
    await pronto();
    await apri('s02a-a-capo');
    await setMode('preview');
  });

  prova('2.1', 'Anteprima: le tre righe del primo paragrafo stanno su righe diverse', async () => {
    eq(await menuStato('Vista', "A capo singolo nell'anteprima"), true, 'voce di menu accesa di partenza');
    eq(await brs(), 2, 'numero di <br> nel primo paragrafo');
    await shot('2-a-capo-acceso');
  });

  prova('2.2', 'Tra i due paragrafi c\'è uno spazio più grande', async () => {
    const m = await browser.execute(() => {
      const ps = [...document.querySelectorAll('.markdown-body > p')];
      if (ps.length !== 2) return { n: ps.length };
      const r = ps.map((p) => p.getBoundingClientRect());
      const lh = parseFloat(getComputedStyle(ps[0]).lineHeight);
      return { n: 2, gap: Math.round(r[1].top - r[0].bottom), lineHeight: lh };
    });
    eq(m.n, 2, 'paragrafi <p>');
    ok(m.gap > 6, `lo spazio tra i paragrafi è solo ${m.gap}px`);
    return `spazio tra i paragrafi ${m.gap}px (altezza di riga ${m.lineHeight}px)`;
  });

  prova('2.3', 'Voce spenta: le righe si uniscono su una riga sola', async () => {
    menu('Vista', "A capo singolo nell'anteprima");
    await sleep(900);
    eq(await menuStato('Vista', "A capo singolo nell'anteprima"), false, 'voce di menu dopo il clic');
    eq(await brs(), 0, '<br> con la voce spenta');
    const righe = await browser.execute(() => Math.round(document.querySelector('.markdown-body p').getBoundingClientRect().height / 26));
    await shot('2-a-capo-spento');
    return `altezza del paragrafo ~${righe} righe di testo`;
  });

  prova('2.4', 'Voce riaccesa: le righe tornano a capo subito, senza riaprire il file', async () => {
    const prima = await nTab();
    menu('Vista', "A capo singolo nell'anteprima");
    await sleep(900);
    eq(await menuStato('Vista', "A capo singolo nell'anteprima"), true, 'voce di menu');
    eq(await brs(), 2, '<br> dopo averla riaccesa');
    eq(await nTab(), prima, 'schede aperte (il file non è stato riaperto)');
  });

  prova('2.5a', 'Preparazione per il riavvio: voce spenta e salvata nelle impostazioni', async () => {
    menu('Vista', "A capo singolo nell'anteprima");
    await sleep(2000);
    eq(await menuStato('Vista', "A capo singolo nell'anteprima"), false, 'voce di menu');
    eq(readSettings().singleBreaks, false, 'singleBreaks in settings.json');
  });
});
