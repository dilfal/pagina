// Giro delle schermate per l'analisi del design (non è una prova: salva immagini e misure in prove/design).
// Lancio: E2E_ONLY=design-scuro,design-chiaro pnpm test:e2e   (escluso dalla corsa normale: dev: true in lib.js)
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, TMP, apri, pronto, sleep, setMode, puntoDel, doppioClic, clic, mouseVero, chiediChiusura, dialogo } from './lib.js';

const OUT = path.join(ROOT, 'prove', 'design');

export const RICCO = `# Guida alla scrittura di una relazione

Questo è un paragrafo introduttivo con **grassetto**, *corsivo*, ~~testo barrato~~, \`codice in linea\` e un [link di esempio](https://example.com). Serve a vedere la misura della riga e l'interlinea: una riga troppo lunga stanca l'occhio, una troppo corta spezza il ritmo della lettura.

## Struttura del documento

Il secondo paragrafo comincia subito dopo un titolo di secondo livello, per controllare la distanza tra titolo e testo.

### Elenchi annidati

- Livello uno, voce A
  - Livello due, voce B
    - Livello tre, voce C
    - Livello tre, voce D
  - Livello due, voce E
- Livello uno, voce F

1. Primo passo
2. Secondo passo
   1. Sotto-passo uno
   2. Sotto-passo due
3. Terzo passo

- [x] Attività completata
- [ ] Attività da fare

#### Citazione e codice

> Una buona citazione deve staccarsi dal testo senza gridare.
> Qui c'è la seconda riga della citazione.

\`\`\`ts
// esempio con evidenziazione
function somma(a: number, b: number): number {
  const risultato = a + b;
  return risultato; // restituisce la somma
}
\`\`\`

## Tabella e immagine

| Frutto | Colore | Prezzo |
|--------|--------|--------|
| mela   | rossa  | 2      |
| pera   | verde  | 3      |
| uva    | nera   | 5      |

![Immagine di prova](immagine.png)

---

Un ultimo paragrafo dopo la riga orizzontale, con un secondo [collegamento](https://example.org) e altro testo di chiusura.
`;

const ESTERNO = `# Titolo di prova

Primo paragrafo, lontano dal blocco che si modifica.

Secondo paragrafo da aprire nell'anteprima.

Terzo paragrafo, ancora lontano.
`;

const NOMI_LUNGHI = [
  'Relazione-trimestrale-del-progetto-di-ricerca-2026.md',
  'Appunti-della-riunione-con-il-gruppo-di-lavoro.md',
  'Bozza-del-capitolo-quarto-versione-finale-riveduta.md',
  'note.md'
];

export function ps(script) {
  const r = spawnSync('pwsh', ['-NoProfile', '-STA', '-Command', script], { encoding: 'utf8', timeout: 30000 });
  if (r.status !== 0) throw new Error(`PowerShell: ${r.stderr || r.stdout}`);
  return r.stdout.trim();
}

const metriche = {};
const falliti = [];

async function shotD(tema, nome) {
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, `${tema}-${nome}.png`);
  await browser.saveScreenshot(file);
  return file;
}

async function misure(chiave) {
  metriche[chiave] = await browser.execute(() => {
    const r = (el) => {
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) };
    };
    const cs = (sel, props) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const c = getComputedStyle(el);
      const o = {};
      for (const p of props) o[p] = c[p];
      return o;
    };
    const tipo = ['fontFamily', 'fontSize', 'lineHeight', 'fontWeight', 'color', 'marginTop', 'marginBottom', 'paddingBottom'];
    const tabs = [...document.querySelectorAll('.tabs .tab')].map((t) => ({ ...r(t), testo: t.querySelector('.name')?.textContent, ellissi: t.querySelector('.name').scrollWidth > t.querySelector('.name').clientWidth }));
    const scrollers = [...document.querySelectorAll('*')]
      .filter((e) => { const c = getComputedStyle(e); return (c.overflowY === 'auto' || c.overflowY === 'scroll' || c.overflowX === 'auto') && (e.scrollHeight > e.clientHeight + 1 || e.scrollWidth > e.clientWidth + 1); })
      .map((e) => ({ el: e.tagName + '.' + (e.className?.toString?.() ?? '').split(' ').slice(0, 3).join('.'), sh: e.scrollHeight, ch: e.clientHeight, sw: e.scrollWidth, cw: e.clientWidth }));
    const fb = document.querySelector('.format-bar');
    return {
      win: { iw: innerWidth, ih: innerHeight, dpr: devicePixelRatio },
      app: cs('.markdown-body', ['maxWidth', 'fontFamily', 'fontSize', 'lineHeight', 'paddingLeft', 'paddingRight']),
      body: r(document.querySelector('.markdown-body')),
      preview: r(document.querySelector('.pane.preview')),
      editor: r(document.querySelector('.pane.editor')),
      cmEditor: cs('.pane.editor .cm-scroller', ['fontFamily', 'fontSize', 'lineHeight']),
      cmLine: cs('.pane.editor .cm-line', ['paddingLeft']),
      h1: cs('.markdown-body h1', tipo), h2: cs('.markdown-body h2', tipo), h3: cs('.markdown-body h3', tipo), h4: cs('.markdown-body h4', tipo),
      p: cs('.markdown-body p', tipo),
      pre: cs('.markdown-body pre', ['fontFamily', 'fontSize', 'lineHeight', 'paddingTop', 'backgroundColor']),
      tab: cs('.tab', ['fontSize', 'height', 'maxWidth']),
      tabs,
      formatBar: fb ? { ...r(fb), scrollW: fb.scrollWidth, clientW: fb.clientWidth, btn: r(fb.querySelector('button')) } : null,
      bar: r(document.querySelector('.bar')),
      modes: r(document.querySelector('.modes')),
      docScroll: { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth },
      scrollers
    };
  });
}

export function proveDesign(tema) {
  const NAME = `design-${tema}`;
  const DIR = path.join(TMP, NAME);
  const P = (n) => path.join(DIR, n);
  let rect0;

  /** Passo: non interrompe la corsa se fallisce, annota l'errore. */
  const passo = (nome, fn) =>
    it(nome, async function () {
      try {
        await fn();
      } catch (e) {
        falliti.push(`${nome}: ${String(e?.message ?? e).split('\n')[0]}`);
        console.error('PASSO FALLITO', nome, e?.message);
      }
    });

  const scorriAnteprima = (y) =>
    browser.execute((yy) => {
      let el = document.querySelector('.markdown-body');
      while (el && el !== document.body) {
        const c = getComputedStyle(el);
        if ((c.overflowY === 'auto' || c.overflowY === 'scroll') && el.scrollHeight > el.clientHeight) { el.scrollTop = yy; return true; }
        el = el.parentElement;
      }
      return false;
    }, y);
  const chiudiBlocco = async () => {
    const r = await browser.execute(() => { const b = document.querySelector('.pane.preview').getBoundingClientRect(); return { x: b.right - 12, y: b.bottom - 12 }; });
    await clic(r.x, r.y);
    await sleep(500);
  };

  describe(`Design (${tema})`, () => {
    before(async () => {
      fs.rmSync(DIR, { recursive: true, force: true });
      fs.mkdirSync(DIR, { recursive: true });
      fs.writeFileSync(P('ricco.md'), RICCO, 'utf8');
      fs.writeFileSync(P('esterno.md'), ESTERNO, 'utf8');
      for (const n of NOMI_LUNGHI) fs.writeFileSync(P(n), `# ${n}\n\nTesto di prova della scheda.\n`, 'utf8');
      ps(`Add-Type -AssemblyName System.Drawing; $bmp=New-Object System.Drawing.Bitmap 640,220; $gr=[System.Drawing.Graphics]::FromImage($bmp); $br=New-Object System.Drawing.Drawing2D.LinearGradientBrush((New-Object System.Drawing.Rectangle 0,0,640,220),[System.Drawing.Color]::FromArgb(40,110,200),[System.Drawing.Color]::FromArgb(240,170,60),20); $gr.FillRectangle($br,0,0,640,220); $bmp.Save('${P('immagine.png')}',[System.Drawing.Imaging.ImageFormat]::Png)`);
      await pronto();
      rect0 = await browser.getWindowRect();
    });

    passo('01 avvio senza file', async () => {
      await sleep(500);
      await shotD(tema, '01-avvio-vuoto');
      await misure('avvio');
    });

    passo('02 una scheda, testo e anteprima', async () => {
      await apri(NAME, P('ricco.md'));
      await setMode('split');
      await sleep(900);
      await shotD(tema, '02-una-scheda-split');
      await misure('split');
    });

    passo('03 solo anteprima', async () => {
      await setMode('preview');
      await sleep(500);
      await shotD(tema, '03-solo-anteprima');
      await misure('preview');
    });

    passo('04 solo editor', async () => {
      await setMode('edit');
      await sleep(500);
      await shotD(tema, '04-solo-editor');
      await misure('edit');
      await setMode('split');
    });

    passo('05 anteprima scorsa', async () => {
      await scorriAnteprima(700);
      await sleep(400);
      await shotD(tema, '05-split-scorsa-1');
      await scorriAnteprima(1500);
      await sleep(400);
      await shotD(tema, '06-split-scorsa-2');
      await scorriAnteprima(99999);
      await sleep(400);
      await shotD(tema, '07-split-fondo');
      await scorriAnteprima(0);
    });

    passo('08 barra di formattazione con il mouse sopra', async () => {
      const r = await browser.execute(() => { const b = document.querySelectorAll('.format-bar button')[1].getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
      await browser.action('pointer').move({ x: Math.round(r.x), y: Math.round(r.y) }).perform();
      await sleep(400);
      await shotD(tema, '08-barra-hover');
      const t = await browser.execute(() => { const b = document.querySelectorAll('.tabs .tab')[0].getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
      await browser.action('pointer').move({ x: Math.round(t.x), y: Math.round(t.y) }).perform();
      await sleep(300);
    });

    passo('09 focus da tastiera', async () => {
      await browser.keys('Shift');
      await browser.execute(() => document.querySelector('.format-bar button').focus());
      await browser.keys('Tab');
      await browser.keys('Tab');
      await sleep(300);
      await shotD(tema, '09-focus-barra');
      await browser.execute(() => document.querySelectorAll('.tabs .tab')[0].focus());
      await browser.keys('Shift');
      await sleep(300);
      await shotD(tema, '10-focus-scheda');
      await browser.execute(() => document.querySelector('.modes button').focus());
      await browser.keys('Shift');
      await sleep(300);
      await shotD(tema, '11-focus-modi');
      await browser.execute(() => document.activeElement?.blur());
    });

    passo('12 blocco aperto con doppio clic', async () => {
      const p = await puntoDel('.markdown-body p', 'Questo è un paragrafo introduttivo');
      await doppioClic(p.x, p.y);
      await sleep(500);
      await shotD(tema, '12-blocco-aperto');
      await chiudiBlocco();
      const p2 = await puntoDel('.markdown-body li', 'Livello due, voce B');
      await doppioClic(p2.x, p2.y);
      await sleep(500);
      await shotD(tema, '13-blocco-lista-aperto');
      await chiudiBlocco();
      await browser.execute(() => document.querySelector('.markdown-body pre').scrollIntoView({ block: 'center' }));
      await sleep(400);
      const p3 = await puntoDel('.markdown-body pre', 'risultato');
      await doppioClic(p3.x, p3.y);
      await sleep(500);
      await shotD(tema, '14-blocco-codice-aperto');
      await chiudiBlocco();
    });

    passo('15 tabella in modifica', async () => {
      await scorriAnteprima(1300);
      await sleep(300);
      const p = await puntoDel('.markdown-body td', 'pera');
      await doppioClic(p.x, p.y);
      await sleep(600);
      await shotD(tema, '15-tabella-modifica');
      await chiudiBlocco();
      await scorriAnteprima(0);
    });

    passo('16 testo selezionato', async () => {
      const a = await puntoDel('.markdown-body p', 'paragrafo introduttivo');
      const b = await puntoDel('.markdown-body p', 'una riga troppo lunga');
      await mouseVero('drag', a.x - 40, a.y, b.x, b.y);
      await sleep(400);
      await shotD(tema, '16-selezione-anteprima');
      const e = await puntoDel('.pane.editor .cm-line', 'Questo è un paragrafo');
      await clic(e.x - 60, e.y);
      await browser.keys(['Shift', 'End']);
      await sleep(300);
      await shotD(tema, '17-selezione-editor');
      await browser.keys('ArrowLeft');
    });

    passo('18 molte schede, una non salvata', async () => {
      for (const n of NOMI_LUNGHI) await apri(NAME, P(n));
      await sleep(600);
      await shotD(tema, '18a-molte-schede-solo-anteprima');
      await setMode('split');
      const e = await puntoDel('.pane.editor .cm-line', 'Testo di prova');
      await clic(e.x + 40, e.y);
      await browser.keys(['Control', 'End']);
      await browser.keys(' modificato');
      if (!(await browser.execute(() => document.querySelectorAll('.tab .dot').length))) {
        await shotD(tema, 'debug-18');
        const dbg = await browser.execute(() => ({ tabs: document.querySelectorAll('.tab').length, af: document.activeElement?.className, testo: document.querySelector('.pane.editor .cm-content')?.textContent }));
        throw new Error('nessuna scheda non salvata ' + JSON.stringify(dbg));
      }
      await sleep(500);
      await shotD(tema, '18-molte-schede');
      await misure('molte-schede');
    });

    passo('19 dialogo di conferma', async () => {
      // le schede di file si salvano da sole all'uscita (confirmQuit): il dialogo compare solo per una scheda senza file
      await $('button[aria-label="Nuova scheda"]').click();
      await sleep(500);
      await (await $('.pane.editor .cm-content')).click();
      await browser.keys('Bozza senza nome');
      await sleep(400);
      if (!(await browser.execute(() => document.querySelectorAll('.tab .dot').length))) throw new Error('nessuna scheda non salvata: non chiudo la finestra');
      chiediChiusura();
      await browser.waitUntil(async () => !!(await dialogo()), { timeout: 6000, timeoutMsg: 'nessun dialogo' });
      await sleep(500);
      await shotD(tema, '19-dialogo-uscita');
      metriche.dialogo = await browser.execute(() => {
        const d = document.querySelector('.dialog'); const b = d.getBoundingClientRect(); const cs = getComputedStyle(d);
        return { w: Math.round(b.width), h: Math.round(b.height), radius: cs.borderRadius, shadow: cs.boxShadow, btns: [...d.querySelectorAll('button')].map((x) => ({ t: x.textContent.trim(), bg: getComputedStyle(x).backgroundColor, fg: getComputedStyle(x).color })) };
      });
      await browser.keys('Escape');
      await sleep(400);
    });

    passo('20 finestra stretta', async () => {
      await browser.setWindowSize(800, 600);
      await sleep(900);
      await shotD(tema, '20-stretta-split');
      await misure('stretta-split');
      await setMode('preview');
      await sleep(500);
      await shotD(tema, '21-stretta-anteprima');
      await setMode('split');
    });

    passo('22 finestra strettissima', async () => {
      await browser.setWindowSize(560, 600);
      await sleep(900);
      await shotD(tema, '22-strettissima-split');
      await misure('strettissima');
    });

    passo('23 finestra larga', async () => {
      await browser.setWindowSize(1920, 1080);
      await sleep(1000);
      await shotD(tema, '23-larga-split');
      await misure('larga-split');
      await setMode('preview');
      await sleep(500);
      await shotD(tema, '24-larga-anteprima');
      await setMode('split');
      await browser.setWindowRect(rect0.x, rect0.y, rect0.width, rect0.height);
      await sleep(800);
    });

    passo('25 avviso di file cambiato da fuori', async () => {
      await apri(NAME, P('esterno.md'));
      await setMode('split');
      const p = await puntoDel('.markdown-body p', 'Secondo paragrafo');
      await doppioClic(p.x, p.y);
      await browser.keys(['Control', 'End']);
      await browser.keys(' ZZLOCALE');
      const f = P('esterno.md');
      ps(`$f='${f}'; $t=[IO.File]::ReadAllText($f); [IO.File]::WriteAllText($f, $t.Replace('lontano dal blocco','vicino al blocco'))`);
      await browser.waitUntil(() => browser.execute(() => !!document.querySelector('.banner[role="alert"]')), { timeout: 8000, timeoutMsg: 'nessun avviso' });
      await sleep(500);
      await shotD(tema, '25-avviso-file-cambiato');
    });

    after(() => {
      fs.mkdirSync(OUT, { recursive: true });
      fs.writeFileSync(path.join(OUT, `metriche-${tema}.json`), JSON.stringify({ metriche, falliti }, null, 1));
      if (falliti.length) console.error('Passi falliti:\n' + falliti.join('\n'));
    });
  });
}
