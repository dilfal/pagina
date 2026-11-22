// Prove dei dialoghi (sezione 8), per il tema scuro (tutte) e chiaro (solo colori e schermate).
import { prova, manuale, ok, eq, sleep, shot, pronto, dialogo, chiediChiusura, processiPagina, contaFinestre, cursore, testoDi, menu, setMode, clic } from './lib.js';
import { contrasto } from './sel.js';

async function nuovaSchedaConTesto(testo) {
  await $('button[aria-label="Nuova scheda"]').click();
  await sleep(500);
  const el = await $('.pane.editor .cm-content');
  await el.click();
  await browser.keys(testo);
  await sleep(300);
}
async function attendiDialogo(timeout = 6000) {
  await browser.waitUntil(async () => !!(await dialogo()), { timeout, timeoutMsg: 'il dialogo non è comparso' });
  await sleep(300);
}
const nDialoghi = () => browser.execute(() => document.querySelectorAll('.dialog').length);

async function coloriDialogo() {
  return browser.execute(() => {
    const d = document.querySelector('.dialog');
    const cs = getComputedStyle(d);
    const tok = (n) => {
      const p = document.createElement('span');
      p.style.color = `var(${n})`;
      document.body.appendChild(p);
      const c = getComputedStyle(p).color;
      p.remove();
      return c;
    };
    const btn = [...d.querySelectorAll('button')].map((b) => ({ t: b.textContent.trim(), bg: getComputedStyle(b).backgroundColor, fg: getComputedStyle(b).color }));
    return { bg: cs.backgroundColor, fg: cs.color, panel: tok('--panel-bg'), fgTok: tok('--fg'), border: cs.borderColor, btn, backdrop: getComputedStyle(d.parentElement).backgroundColor };
  });
}

export function proveDialoghi(chiaro) {
  const tema = chiaro ? 'chiaro' : 'scuro';
  describe(`8. Dialoghi (${tema})`, () => {
    before(async () => {
      await pronto();
      await nuovaSchedaConTesto('x');
    });

    prova('8.1', 'Chiudi l\'app con una scheda non salvata: dialogo con lo stile dell\'app, non una finestra di Windows', async () => {
      if (chiaro) return 'vedi la sessione con il tema scuro';
      eq(await $$('.tab .dot').length, 1, 'scheda con il pallino «non salvata»');
      global.__fin = contaFinestre();
      const c0 = await cursore('.pane.editor');
      ok(c0, 'cursore nell\'editor prima del dialogo');
      global.__cursore = c0;
      chiediChiusura();
      await attendiDialogo();
      const d = await dialogo();
      ok(d, 'dialogo nella pagina');
      eq(await browser.execute(() => document.querySelector('.dialog')?.getAttribute('role')), 'alertdialog', 'ruolo del dialogo');
      eq(contaFinestre(), global.__fin, 'finestre di primo livello con il dialogo aperto (nessuna finestra di sistema in più)');
      await shot('8-dialogo-uscita-scuro');
    });

    prova('8.2', 'Il testo dice «C\'è 1 scheda con modifiche non salvate. Uscire senza salvare?»', async () => {
      if (chiaro) return 'vedi la sessione con il tema scuro';
      const d = await dialogo();
      eq(d.testo, "C'è 1 scheda con modifiche non salvate. Uscire senza salvare?", 'testo del dialogo');
      return `titolo «${d.titolo}», pulsanti ${JSON.stringify(d.pulsanti)}`;
    });

    prova('8.4', 'I colori vanno bene sia con il tema chiaro sia con il tema scuro', async () => {
      if (chiaro) {
        chiediChiusura();
        await attendiDialogo();
        await shot('8-dialogo-uscita-chiaro');
      }
      const c = await coloriDialogo();
      const cr = contrasto(c.fg, c.bg);
      eq(c.bg, c.panel, 'sfondo del dialogo = --panel-bg');
      ok(cr >= 4.5, `contrasto del testo ${cr.toFixed(1)}`);
      const bad = c.btn.filter((b) => contrasto(b.fg, b.bg) < 3);
      ok(bad.length === 0, `pulsanti con poco contrasto: ${JSON.stringify(bad)}`);
      return `tema ${tema}: sfondo ${c.bg}, testo ${c.fg}, contrasto ${cr.toFixed(1)}; pulsanti ${JSON.stringify(c.btn)}. Giudizio estetico: guarda le schermate.`;
    });

    if (chiaro) {
      prova('8.15', 'Informazioni su Pagina (tema chiaro)', async () => {
        await browser.keys('Escape');
        await sleep(400);
        menu('Aiuto', 'Informazioni su Pagina');
        await attendiDialogo();
        await shot('8-dialogo-informazioni-chiaro');
        const d = await dialogo();
        ok(/Pagina \d+\.\d+\.\d+/.test(d.testo), `testo: ${d.testo}`);
        eq(JSON.stringify(d.pulsanti), '["OK"]', 'pulsanti');
        await browser.keys('Escape');
      });
      return;
    }

    prova('8.5', 'All\'apertura il focus è sul pulsante «Annulla»', async () => {
      const d = await dialogo();
      eq(d.focus, 'Annulla', 'elemento col focus');
    });

    prova('8.7', 'Tab passa da un pulsante all\'altro e non esce dal dialogo', async () => {
      const visti = [];
      for (let i = 0; i < 5; i++) {
        await browser.keys('Tab');
        const d = await dialogo();
        visti.push(d.focus);
        ok(d.focusDentro, `il focus è uscito dal dialogo dopo Tab ${i + 1}: ${d.focus}`);
      }
      ok(new Set(visti).size >= 2, `il focus non cambia pulsante: ${visti.join(', ')}`);
      await browser.keys(['Shift', 'Tab']);
      ok((await dialogo()).focusDentro, 'il focus esce con Maiusc+Tab');
      return `ordine del focus con Tab: ${visti.join(' > ')}`;
    });

    prova('8.8', 'Mentre il dialogo è aperto, le scorciatoie (Ctrl+S, Ctrl+B) non fanno nulla', async () => {
      const prima = await testoDi('.pane.editor');
      await browser.keys(['Control', 'b']);
      await browser.keys(['Control', 's']);
      await sleep(400);
      menu('File', 'Salva'); // la stessa azione dell'acceleratore Ctrl+S, che WebDriver non può far arrivare al menu nativo
      await sleep(800);
      eq(await testoDi('.pane.editor'), prima, 'testo dell\'editor');
      eq(contaFinestre(), global.__fin, 'finestre di primo livello (una finestra «Salva con nome» sarebbe una in più)');
      ok(await dialogo(), 'il dialogo è ancora aperto');
      return 'Ctrl+B e Ctrl+S con WebDriver (arrivano alla pagina), «File > Salva» dal menu nativo (azione di Ctrl+S)';
    });

    prova('8.9', 'Un secondo clic sulla X mentre il dialogo è aperto non ne apre un altro', async () => {
      chiediChiusura();
      await sleep(1200);
      eq(await nDialoghi(), 1, 'dialoghi aperti');
      eq(processiPagina() >= 1, true, 'l\'app è ancora aperta');
    });

    prova('8.10', 'Un clic sullo sfondo scuro dietro il dialogo non lo chiude', async () => {
      await clic(8, 8);
      await sleep(400);
      eq(await nDialoghi(), 1, 'dialoghi aperti dopo il clic sullo sfondo');
    });

    prova('8.6', 'Esc chiude il dialogo e l\'app resta aperta', async () => {
      await browser.keys('Escape');
      await sleep(500);
      eq(await nDialoghi(), 0, 'dialoghi aperti dopo Esc');
      eq(processiPagina() >= 1, true, 'app aperta');
    });

    prova('8.16', 'Finito il dialogo, il cursore torna dove era prima', async () => {
      const c = await cursore('.pane.editor');
      ok(c, 'nessun cursore nell\'editor dopo la chiusura del dialogo');
      eq(c.pos, global.__cursore.pos, 'posizione del cursore');
      const inEditor = await browser.execute(() => !!document.activeElement?.closest('.pane.editor'));
      ok(inEditor, 'il focus non è tornato nell\'editor');
    });

    prova('8.3', 'Con due schede non salvate il testo dice «Ci sono 2 schede…»', async () => {
      await nuovaSchedaConTesto('y');
      chiediChiusura();
      await attendiDialogo();
      const d = await dialogo();
      eq(d.testo, 'Ci sono 2 schede con modifiche non salvate. Uscire senza salvare?', 'testo del dialogo');
      await browser.keys('Escape');
      await sleep(400);
    });

    prova('8.12', 'Chiudi una scheda con modifiche non salvate (file senza nome): appare il dialogo di conferma', async () => {
      await $('.tab.active .close').click();
      await attendiDialogo();
      const d = await dialogo();
      ok(/Senza titolo \d+/.test(d.testo) && d.testo.includes('Chiudere senza salvare?'), `testo: ${d.testo}`);
      eq(contaFinestre(), global.__fin, 'nessuna finestra di sistema in più');
      await shot('8-dialogo-chiudi-scheda-scuro');
      await browser.keys('Escape');
      await sleep(400);
    });

    manuale('8.13', 'La conferma di «Salva con nome» su un file esistente è la finestra di sistema per la scelta del file: da provare a mano');
    manuale('8.14', 'Richiede di scegliere un file nella finestra «Salva con nome» di Windows: da provare a mano');

    prova('8.15', 'Aiuto, «Informazioni su Pagina»: dialogo con la versione e il pulsante OK', async () => {
      menu('Aiuto', 'Informazioni su Pagina');
      await attendiDialogo();
      const d = await dialogo();
      ok(/Pagina \d+\.\d+\.\d+/.test(d.testo), `testo: ${d.testo}`);
      eq(JSON.stringify(d.pulsanti), '["OK"]', 'pulsanti');
      await shot('8-dialogo-informazioni-scuro');
      await $('.dialog button').click();
      await sleep(400);
      eq(await nDialoghi(), 0, 'dialoghi aperti dopo OK');
      return d.testo;
    });

    prova('8.11', '«Chiudi senza salvare» chiude davvero l\'app', async () => {
      chiediChiusura();
      await attendiDialogo();
      await $('.dialog .btn.danger').click();
      let finito = false;
      for (let i = 0; i < 30 && !finito; i++) {
        await sleep(300);
        finito = processiPagina() === 0;
      }
      ok(finito, 'pagina.exe è ancora in esecuzione 9 secondi dopo il clic');
    });
  });
}
