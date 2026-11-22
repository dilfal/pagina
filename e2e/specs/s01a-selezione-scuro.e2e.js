import { apri, pronto, prova, ok, record } from '../lib.js';
import { controlliSelezione } from '../sel.js';

describe('1. Tema scuro e selezione (scuro)', () => {
  let res;
  before(async () => {
    await pronto();
    await apri('s01a-selezione-scuro');
    const tema = await browser.execute(() => document.documentElement.dataset.theme);
    if (tema !== 'dark') throw new Error('il tema non è scuro: ' + tema);
    res = await controlliSelezione('1-scuro');
  });
  for (const [i, desc] of [
    [1, 'Editor: selezione col mouse/tastiera visibile, blu e leggibile'],
    [2, 'Editor senza focus: la selezione si vede ancora'],
    [3, 'Anteprima: la selezione si vede (blu)'],
    [4, 'Blocco aperto: la selezione si vede'],
    [5, 'Cella della tabella: la selezione si vede']
  ]) {
    prova(`1.${i}`, desc, async () => {
      const r = res[i - 1];
      ok(r.ok, `${r.nome}: ${r.dettaglio}`);
      return `${r.dettaglio} — ${r.img}`;
    });
  }
});
