import { apri, pronto, prova, ok, eq, setMode, menu, menuStato, sleep, readSettings } from '../lib.js';

describe('2. A capo singolo (dopo il riavvio)', () => {
  before(async () => {
    await pronto();
    await apri('s02b-a-capo-riavvio');
    await setMode('preview');
  });

  prova('2.5', 'Chiudi e riapri Pagina: la voce ricorda l\'ultima scelta', async () => {
    eq(readSettings().singleBreaks, false, 'singleBreaks letto da settings.json all\'avvio');
    eq(await menuStato('Vista', "A capo singolo nell'anteprima"), false, 'voce di menu dopo il riavvio');
    const brs = await browser.execute(() => document.querySelector('.markdown-body p')?.querySelectorAll('br').length ?? -1);
    eq(brs, 0, '<br> nel primo paragrafo dopo il riavvio');
    // rimette la voce com\'era
    menu('Vista', "A capo singolo nell'anteprima");
    await sleep(1500);
  });
});
