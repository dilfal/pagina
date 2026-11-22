import { apri, pronto, prova, ok } from '../lib.js';
import { controlliSelezione } from '../sel.js';

describe('1. Tema scuro e selezione (chiaro)', () => {
  let res;
  before(async () => {
    await pronto();
    await apri('s01b-selezione-chiaro');
    const tema = await browser.execute(() => document.documentElement.dataset.theme);
    if (tema !== 'light') throw new Error('il tema non è chiaro: ' + tema);
    res = await controlliSelezione('1-chiaro');
  });
  prova('1.6', 'Tema chiaro: le stesse selezioni si vedono bene', async () => {
    const ko = res.filter((r) => !r.ok);
    ok(ko.length === 0, ko.map((r) => `${r.nome}: ${r.dettaglio}`).join(' | '));
    return res.map((r) => r.img).join(', ');
  });
});
