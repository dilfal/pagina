// Costanti, file di prova e funzioni di appoggio comuni alle specifiche E2E.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '..');
export const TMP = path.join(os.tmpdir(), 'pagina-e2e');
export const SETTINGS = path.join(process.env.APPDATA ?? '', 'it.df.pagina', 'settings.json');
export const SHOTS = path.join(ROOT, 'prove', 'schermate');
export const RESULTS = path.join(here, 'out', 'results.jsonl');
export const EXE = path.join(ROOT, 'src-tauri', 'target', 'debug', 'pagina.exe');
export const MENU_PS1 = path.join(here, 'menu.ps1');

// ---------------------------------------------------------------- materiale delle prove (dalla lista)

const MAT = {
  s01: `Questo è un paragrafo di prova con **grassetto**, *corsivo*, \`codice\` e un [link di esempio](https://example.com).
Seconda riga dello stesso paragrafo, da selezionare con il mouse.
Prova

Prova

| Nome | Colore | Numero |
|------|--------|--------|
| mela | rossa  | 1      |
| pera | verde  | 2      |
| uva  | nera   | 3      |
`,
  s02: `Questa è la prima riga.
Questa è la seconda riga, scritta andando a capo una volta sola.
Questa è la terza riga.

Questo è un altro paragrafo, separato dal primo da una riga vuota.
Anche qui c'è una seconda riga.
`,
  s03: `Primo paragrafo di prova.
Questa è la seconda riga: fai doppio clic in mezzo a una parola di questa riga.

- Livello uno, voce A
  - Livello due, voce B
    - Livello tre, voce C
    - Livello tre, voce D
  - Livello due, voce E
- Livello uno, voce F

1. Primo passo
2. Secondo passo
3. Terzo passo

> Prima riga della citazione.
> Seconda riga della citazione.

\`\`\`
riga di codice uno
riga di codice due
\`\`\`
`,
  s04: `Un paragrafo corto da usare per la prova dell'Invio.

- Voce uno
- Voce due
- Voce tre

> Una citazione corta.

1. Primo
2. Secondo
`,
  s05: `Tabella normale:

| Frutto | Colore | Prezzo |
|--------|--------|--------|
| mela   | rossa  | 2      |
| pera   | verde  | 3      |
| uva    | nera   | 5      |

Tabella irregolare (una riga ha più celle dell'intestazione, deve aprirsi come sorgente):

| A | B |
|---|---|
| 1 | 2 | 3 |
| 4 | 5 |
`,
  s06: `testo da formattare
altra riga da formattare
una parola sola: parola
`,
  s07: `Qui sotto puoi incollare le immagini di prova:

Fine.
`,
  s09: `# Titolo di prova

Primo paragrafo, lontano dal blocco che si modifica.

Secondo paragrafo da aprire nell'anteprima.

Terzo paragrafo, ancora lontano.
`
};

const DARK = { theme: 'dark', lang: 'it', formatBar: true, singleBreaks: true };

/** Ogni voce è una sessione dell'app: nome della specifica, file passato da riga di comando, impostazioni di partenza. */
export const specFiles = [
  { name: 's01a-selezione-scuro', file: 'selezione.md', content: MAT.s01, settings: DARK },
  { name: 's01b-selezione-chiaro', file: 'selezione-chiaro.md', content: MAT.s01, settings: { ...DARK, theme: 'light' } },
  { name: 's02a-a-capo', file: 'a-capo.md', content: MAT.s02, settings: DARK },
  { name: 's02b-a-capo-riavvio', file: 'a-capo.md', content: MAT.s02, settings: null },
  { name: 's03-doppio-clic', file: 'blocchi.md', content: MAT.s03, settings: DARK },
  { name: 's04-invio-canc', file: 'invio.md', content: MAT.s04, settings: DARK },
  { name: 's05-tabelle', file: 'tabelle.md', content: MAT.s05, settings: DARK },
  { name: 's06-formattazione', file: 'formattazione.md', content: MAT.s06, settings: DARK },
  { name: 's07-immagini', file: 'immagini.md', content: MAT.s07, settings: DARK },
  { name: 's08-dialoghi', noFile: true, settings: DARK },
  { name: 's08b-dialoghi-chiaro', noFile: true, settings: { ...DARK, theme: 'light' } },
  { name: 's09-file-esterno', file: 'esterno.md', content: MAT.s09, settings: DARK },
  // giro delle schermate per l'analisi del design: solo con E2E_ONLY=design-scuro,design-chiaro
  { name: 'design-scuro', noFile: true, dev: true, settings: DARK },
  { name: 'design-chiaro', noFile: true, dev: true, settings: { ...DARK, theme: 'light' } }
];

export function fixtureFor(name) {
  const s = specFiles.find((x) => x.name === name);
  return path.join(TMP, name, s.file);
}

export function writeFixture(name) {
  const s = specFiles.find((x) => x.name === name);
  if (!s || s.noFile) return;
  const dir = path.join(TMP, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(fixtureFor(name), s.content, 'utf8');
}

export function writeSettings(obj) {
  if (obj === null) return; // si tengono quelle lasciate dalla sessione precedente
  fs.mkdirSync(path.dirname(SETTINGS), { recursive: true });
  fs.writeFileSync(SETTINGS, JSON.stringify(obj, null, 2));
}

export function readSettings() {
  try {
    return JSON.parse(fs.readFileSync(SETTINGS, 'utf8'));
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------- esiti

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function record(id, status, detail = '') {
  fs.mkdirSync(path.dirname(RESULTS), { recursive: true });
  fs.appendFileSync(RESULTS, JSON.stringify({ id, status, detail, at: new Date().toISOString() }) + '\n');
}

/** Definisce una prova mocha che registra SUPERATA / FALLITA con il motivo; `fn` lancia un errore se qualcosa non va. */
export function prova(id, text, fn) {
  it(`${id} ${text}`, async function () {
    try {
      const note = await fn();
      record(id, 'SUPERATA', typeof note === 'string' ? note : '');
    } catch (e) {
      record(id, 'FALLITA', String(e?.message ?? e).split('\n')[0].slice(0, 400));
      throw e;
    }
  });
}

export function manuale(id, motivo) {
  record(id, 'MANUALE', motivo);
}

export function ok(cond, msg) {
  if (!cond) throw new Error(msg);
}
export function eq(actual, expected, what) {
  if (actual !== expected) throw new Error(`${what}: atteso ${JSON.stringify(expected)}, trovato ${JSON.stringify(actual)}`);
}

// ---------------------------------------------------------------- funzioni sull'app (usano le globali di wdio)

export async function pronto() {
  await $('.app').waitForExist({ timeout: 20000 });
  await sleep(600);
}

/** Apre il file di prova della sessione come farebbe Esplora risorse: un secondo avvio che passa il percorso al primo (single-instance).
 *  (tauri-driver rovina gli argomenti di riga di comando, per questo non si usa `args` nelle capability.) */
export async function apri(name, perc) {
  const file = perc ?? fixtureFor(name);
  spawnSync(EXE, [file], { timeout: 20000 });
  await $('.tabs .tab').waitForExist({ timeout: 15000 });
  await sleep(700);
}

export async function shot(name) {
  fs.mkdirSync(SHOTS, { recursive: true });
  const file = path.join(SHOTS, `${name}.png`);
  await browser.saveScreenshot(file);
  return `prove/schermate/${name}.png`;
}

export async function setMode(mode) {
  const label = { edit: 'Solo testo', split: 'Testo e anteprima', preview: 'Solo anteprima' }[mode];
  await $(`.modes button[aria-label="${label}"]`).click();
  await sleep(400);
}

/** Testo del sorgente dell'editor principale (righe di CodeMirror unite da \n). */
export async function sorgente() {
  return browser.execute(() => {
    const c = document.querySelector('.pane.editor .cm-content');
    if (!c) return null;
    return [...c.querySelectorAll('.cm-line')].map((l) => l.textContent).join('\n');
  });
}

/** Il documento intero come lo vede l'app, anche con l'editor nascosto (display:none non toglie il testo). */
export async function documento() {
  return sorgente();
}

export async function htmlAnteprima() {
  return browser.execute(() => document.querySelector('.markdown-body')?.innerHTML ?? null);
}

export async function dialogo() {
  return browser.execute(() => {
    const d = document.querySelector('.dialog');
    if (!d) return null;
    return {
      titolo: d.querySelector('h2')?.textContent ?? null,
      testo: d.querySelector('p')?.textContent ?? null,
      pulsanti: [...d.querySelectorAll('button')].map((b) => b.textContent.trim()),
      focus: document.activeElement?.textContent?.trim() ?? null,
      focusDentro: d.contains(document.activeElement)
    };
  });
}

/** Voce di menu nativo via UI Automation: menu('Vista', "A capo singolo nell'anteprima"). */
export function menu(...voci) {
  const r = spawnSync('pwsh', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', MENU_PS1, ...voci], {
    encoding: 'utf8',
    timeout: 30000
  });
  const out = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim();
  if (r.status !== 0) throw new Error(`menu ${voci.join(' > ')} non riuscito: ${out.split('\n').pop()}`);
  return out;
}

/** Chiede la chiusura della finestra (WM_CLOSE) come farebbe il clic sulla X. */
export function chiediChiusura() {
  const r = spawnSync(
    'pwsh',
    ['-NoProfile', '-Command', '(Get-Process pagina -ErrorAction Stop | Where-Object MainWindowHandle -ne 0 | Select -First 1).CloseMainWindow()'],
    { encoding: 'utf8', timeout: 15000 }
  );
  return `${r.stdout}${r.stderr}`.trim();
}

export function processiPagina() {
  const r = spawnSync('pwsh', ['-NoProfile', '-Command', '(Get-Process pagina -ErrorAction SilentlyContinue | Measure-Object).Count'], {
    encoding: 'utf8'
  });
  return Number(r.stdout.trim() || '0');
}

// ---------------------------------------------------------------- interazioni con il mouse e il cursore

/** Coordinate (viewport) del centro di un carattere di `snippet` (quello a metà) dentro l'elemento che lo contiene. */
export async function puntoDel(selector, snippet, nth = 0) {
  const r = await browser.execute(
    (sel, snip, n) => {
      const els = [...document.querySelectorAll(sel)];
      let seen = 0;
      for (const el of els) {
        const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let node;
        while ((node = w.nextNode())) {
          const i = node.textContent.indexOf(snip);
          if (i < 0) continue;
          if (seen++ < n) continue;
          const mid = i + Math.floor(snip.length / 2);
          const range = document.createRange();
          range.setStart(node, mid);
          range.setEnd(node, mid + 1);
          const b = range.getBoundingClientRect();
          return { x: Math.round(b.left + b.width / 2), y: Math.round(b.top + b.height / 2), mid };
        }
      }
      return null;
    },
    selector,
    snippet,
    nth
  );
  if (!r) throw new Error(`testo «${snippet}» non trovato in ${selector}`);
  return r;
}

export async function doppioClic(x, y) {
  await browser.action('pointer').move({ x, y }).down().up().pause(60).down().up().perform();
  await sleep(500);
}
export async function clic(x, y) {
  await browser.action('pointer').move({ x, y }).down().up().perform();
  await sleep(250);
}
export async function trascina(x1, y1, x2, y2) {
  await browser
    .action('pointer')
    .move({ x: x1, y: y1 })
    .down()
    .pause(80)
    .move({ x: x1 + Math.sign(x2 - x1) * 6, y: y1 + Math.sign(y2 - y1) * 2, duration: 100 })
    .move({ x: x2, y: y2, duration: 300 })
    .pause(80)
    .up()
    .perform();
  await sleep(250);
}

/** Posizione del cursore (offset nel testo del blocco e riga/colonna) nel CodeMirror che sta sotto `root` (`.block-editor`, `.pane.editor`). */
export async function cursore(root) {
  return browser.execute((rootSel) => {
    const content = document.querySelector(`${rootSel} .cm-content`);
    const sel = getSelection();
    if (!content || !sel.anchorNode || !content.contains(sel.anchorNode)) return null;
    const lines = [...content.querySelectorAll('.cm-line')];
    let before = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.contains(sel.anchorNode)) {
        const r = document.createRange();
        r.selectNodeContents(line);
        r.setEnd(sel.anchorNode, sel.anchorOffset);
        const col = r.toString().length;
        return { pos: before + col, line: i, col, text: line.textContent };
      }
      before += line.textContent.length + 1;
    }
    return null;
  }, root);
}

export async function testoDi(root) {
  return browser.execute((rootSel) => {
    const c = document.querySelector(`${rootSel} .cm-content`);
    return c ? [...c.querySelectorAll('.cm-line')].map((l) => l.textContent).join('\n') : null;
  }, root);
}

export function menuStato(...voci) {
  const r = spawnSync('pwsh', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', MENU_PS1, '-Stato', ...voci], {
    encoding: 'utf8',
    timeout: 30000
  });
  const m = /checked=(True|False)/.exec(r.stdout ?? '');
  if (!m) throw new Error(`stato di ${voci.join(' > ')} non letto: ${r.stdout}${r.stderr}`);
  return m[1] === 'True';
}

/** Colori della selezione: ::selection dell'elemento e sfondo dei livelli di selezione di CodeMirror. */
export async function coloriSelezione(selector) {
  return browser.execute((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const cs = getComputedStyle(el, '::selection');
    const out = {
      selectionBg: cs.backgroundColor,
      selectionFg: cs.color,
      token: getComputedStyle(document.documentElement).getPropertyValue('--selection').trim(),
      cmLayers: [...document.querySelectorAll('.cm-selectionBackground')].map((n) => getComputedStyle(n).backgroundColor),
      hasFocusClass: !!document.querySelector('.cm-editor.cm-focused')
    };
    // il token CSS (#rrggbb) in rgb() per il confronto
    const probe = document.createElement('span');
    probe.style.color = out.token;
    document.body.appendChild(probe);
    out.tokenRgb = getComputedStyle(probe).color;
    probe.remove();
    return out;
  }, selector);
}

/** Colori RGB dei pixel di uno screenshot (coordinate in px CSS: si moltiplicano per devicePixelRatio). */
export async function pixel(file, punti) {
  const dpr = await browser.execute(() => window.devicePixelRatio);
  const list = punti.map(([x, y]) => `${Math.round(x * dpr)},${Math.round(y * dpr)}`).join(';');
  const script = `Add-Type -AssemblyName System.Drawing; $b=[System.Drawing.Bitmap]::new('${file}'); ` +
    `foreach($p in '${list}'.Split(';')){ $xy=$p.Split(','); $c=$b.GetPixel([int]$xy[0],[int]$xy[1]); "rgb($($c.R), $($c.G), $($c.B))" }; $b.Dispose()`;
  const r = spawnSync('pwsh', ['-NoProfile', '-Command', script], { encoding: 'utf8', timeout: 30000 });
  return r.stdout.trim().split(String.fromCharCode(10)).map((l) => l.trim());
}
export const shotPath = (name) => path.join(SHOTS, `${name}.png`);

/** Mouse vero (drag | click | dbl) in coordinate CSS del viewport: serve dove i comandi di WebDriver non selezionano il testo. */
export async function mouseVero(az, x1, y1, x2 = 0, y2 = 0) {
  const o = await browser.execute(() => ({ sx: window.screenX, sy: window.screenY, dpr: window.devicePixelRatio, oh: window.outerHeight, ih: window.innerHeight, ow: window.outerWidth, iw: window.innerWidth }));
  // il viewport comincia dopo la barra del titolo e la barra dei menu: si ricava dalla differenza tra finestra esterna e interna
  const toScreen = (x, y) => [Math.round((o.sx + x) * o.dpr), Math.round((o.sy + (o.oh - o.ih) + y) * o.dpr)];
  const [a, b] = toScreen(x1, y1);
  const [c, d] = toScreen(x2, y2);
  spawnSync('pwsh', ['-NoProfile', '-File', path.join(here, 'mouse.ps1'), az, String(a), String(b), String(c), String(d)], { timeout: 30000 });
  await sleep(350);
  return o;
}

/** Chiude le schede (non sporche), riscrive il file di prova della sessione e lo riapre: stato di partenza pulito. */
export async function ripristina(name) {
  for (let i = 0; i < 6; i++) {
    const c = await $('.tab .close');
    if (!(await c.isExisting())) break;
    await c.click();
    await sleep(300);
  }
  writeFixture(name);
  await apri(name);
}

/** Numero di finestre di primo livello di pagina.exe (la principale + eventuali finestre di sistema, come «Salva con nome»). */
export function contaFinestre() {
  const ps =
    "Add-Type -AssemblyName UIAutomationClient; $id=(Get-Process pagina -ErrorAction SilentlyContinue | Select -First 1).Id; " +
    "if(-not $id){0}else{ $c=New-Object Windows.Automation.PropertyCondition([Windows.Automation.AutomationElement]::ProcessIdProperty,$id); " +
    "([Windows.Automation.AutomationElement]::RootElement.FindAll('Children',$c)).Count }";
  const r = spawnSync('pwsh', ['-NoProfile', '-Command', ps], { encoding: 'utf8', timeout: 20000 });
  return Number(r.stdout.trim());
}

/** Prime righe consecutive che cominciano per «|» (la prima tabella del sorgente). */
export function righeTabella(src, nth = 0) {
  const lines = src.split('\n');
  const gruppi = [];
  let cur = [];
  for (const l of lines) {
    if (l.startsWith('|')) cur.push(l);
    else if (cur.length) { gruppi.push(cur); cur = []; }
  }
  if (cur.length) gruppi.push(cur);
  return gruppi[nth] ?? [];
}
