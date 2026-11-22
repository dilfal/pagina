import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { apri, pronto, prova, manuale, ok, eq, setMode, puntoDel, doppioClic, clic, testoDi, sorgente, sleep, shot, TMP } from '../lib.js';

const NAME = 's07-immagini';
const DIR = path.join(TMP, NAME);
const IMG = path.join(DIR, 'immagini');
const EXT = path.join(DIR, 'esterna.png');
const files = () => (fs.existsSync(IMG) ? fs.readdirSync(IMG).sort() : []);

function ps(script) {
  const r = spawnSync('pwsh', ['-NoProfile', '-STA', '-Command', script], { encoding: 'utf8', timeout: 30000 });
  if (r.status !== 0) throw new Error(`PowerShell: ${r.stderr || r.stdout}`);
  return r.stdout.trim();
}
/** PNG di prova (colore dato) creato con System.Drawing. */
function creaPng(file, r, g, b) {
  ps(`Add-Type -AssemblyName System.Drawing; $bmp=New-Object System.Drawing.Bitmap 80,50; $gr=[System.Drawing.Graphics]::FromImage($bmp); $gr.Clear([System.Drawing.Color]::FromArgb(${r},${g},${b})); $bmp.Save('${file}',[System.Drawing.Imaging.ImageFormat]::Png); $gr.Dispose(); $bmp.Dispose()`);
}
/** Mette un'immagine (bitmap) negli appunti con System.Windows.Forms.Clipboard. */
function appuntiImmagine(r, g, b) {
  ps(`Add-Type -AssemblyName System.Windows.Forms,System.Drawing; $bmp=New-Object System.Drawing.Bitmap 80,50; $gr=[System.Drawing.Graphics]::FromImage($bmp); $gr.Clear([System.Drawing.Color]::FromArgb(${r},${g},${b})); [System.Windows.Forms.Clipboard]::SetDataObject($bmp,$true)`);
}
function appuntiFile(file) {
  ps(`Add-Type -AssemblyName System.Windows.Forms; $c=New-Object System.Collections.Specialized.StringCollection; [void]$c.Add('${file}'); [System.Windows.Forms.Clipboard]::SetFileDropList($c)`);
}
const linkImmagini = async () => ((await sorgente()).match(/!\[[^\]]*\]\([^)]*\)/g) ?? []);
async function clicEditor() {
  const p = await puntoDel('.pane.editor .cm-line', 'Fine.');
  await clic(p.x + 20, p.y);
}

describe('7. Immagini', () => {
  before(async () => {
    await pronto();
    await apri(NAME);
    await setMode('split');
    creaPng(EXT, 20, 160, 60);
  });

  prova('7.1', 'Incolla un\'immagine negli appunti (Ctrl+V nell\'editor): compare un link a un\'immagine nel testo', async () => {
    appuntiImmagine(200, 30, 30);
    await clicEditor();
    await browser.keys(['Control', 'v']);
    await sleep(1500);
    const l = await linkImmagini();
    eq(l.length, 1, 'link a immagine nel testo');
    ok(/\(immagini\/[^)]+\.png\)/.test(l[0]), `forma del link: ${l[0]}`);
    return `PNG negli appunti (simula lo screenshot di Win+Maiusc+S, che da solo è da provare a mano). Link: ${l[0]}`;
  });

  prova('7.2', 'Il file dell\'immagine è nella cartella immagini', async () => {
    const f = files();
    eq(f.length, 1, `file in ${IMG}`);
    const size = fs.statSync(path.join(IMG, f[0])).size;
    ok(size > 100, `il file è troppo piccolo: ${size} byte`);
    return `${f[0]} (${size} byte)`;
  });

  prova('7.3', 'L\'immagine si vede nell\'anteprima', async () => {
    await sleep(600);
    const r = await browser.execute(() => {
      const i = document.querySelector('.markdown-body img');
      return i ? { src: i.getAttribute('src'), ok: i.complete && i.naturalWidth > 0, w: i.naturalWidth } : null;
    });
    ok(r, 'nessun <img> nell\'anteprima');
    ok(r.ok, `immagine non caricata: ${JSON.stringify(r)}`);
    await shot('7-immagine-anteprima');
    return `larghezza naturale ${r.w}px`;
  });

  prova('7.4', 'Copia un file immagine (Ctrl+C in Esplora risorse) e incollalo: link e file copiato', async () => {
    const n0 = files().length;
    const l0 = (await linkImmagini()).length;
    appuntiFile(EXT);
    await clicEditor();
    await browser.keys(['Control', 'v']);
    await sleep(1500);
    const l1 = (await linkImmagini()).length;
    eq(files().length, n0 + 1, 'file nella cartella immagini');
    eq(l1, l0 + 1, 'link nel testo');
    return 'file negli appunti come lista di file (CF_HDROP, come la copia da Esplora risorse), con Clipboard.SetFileDropList';
  });

  manuale('7.5', 'Il pulsante «Immagine» apre la finestra di scelta file di Windows: da provare a mano');

  prova('7.6', 'Incolla la stessa immagine due volte: non si sovrascrive nulla, ci sono due file', async () => {
    const n0 = files().length;
    appuntiImmagine(30, 30, 200);
    await clicEditor();
    await browser.keys(['Control', 'v']);
    await sleep(1500);
    await browser.keys(['Control', 'v']);
    await sleep(1500);
    const f = files();
    eq(f.length, n0 + 2, 'file nella cartella immagini');
    eq(new Set(f).size, f.length, 'nomi dei file diversi');
    const dim = f.map((x) => fs.statSync(path.join(IMG, x)).size);
    ok(dim.every((x) => x > 100), `dimensioni sospette: ${dim.join(',')}`);
    return `file: ${f.join(', ')}`;
  });

  prova('7.7', 'Incolla un\'immagine dentro un blocco aperto dell\'anteprima: funziona', async () => {
    const n0 = files().length;
    const p = await puntoDel('.markdown-body p', 'Qui sotto');
    await doppioClic(p.x, p.y);
    ok(await browser.execute(() => !!document.querySelector('.block-editor .cm-content')), 'blocco aperto');
    appuntiImmagine(220, 200, 20);
    await browser.keys(['Control', 'End']);
    await browser.keys(['Control', 'v']);
    await sleep(1800);
    const blocco = await testoDi('.block-editor');
    ok(/!\[[^\]]*\]\(immagini\//.test(blocco), `testo del blocco: ${JSON.stringify(blocco)}`);
    eq(files().length, n0 + 1, 'file nella cartella immagini');
    await shot('7-incolla-in-blocco');
  });
});
