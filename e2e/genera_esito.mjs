// Genera prove/esito_automatico.md dagli esiti della suite (e2e/out/results.jsonl) e dalla lista prove/prova_tappa2.md
// (la lista si legge soltanto: non si modifica mai). Lo lancia wdio a fine corsa; si può lanciare anche a mano: node e2e/genera_esito.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const lista = fs.readFileSync(path.join(root, 'prove', 'prova_tappa2.md'), 'utf8').split(/\r?\n/);
const righe = fs.existsSync(path.join(here, 'out', 'results.jsonl'))
  ? fs.readFileSync(path.join(here, 'out', 'results.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
  : [];

// ---- lista: sezioni e prove numerate
const sezioni = [];
let cur = null;
let dentroProve = false;
for (const l of lista) {
  const h = /^## (\d+)\.\s+(.*)$/.exec(l);
  if (h) {
    cur = { n: Number(h[1]), titolo: h[2], prove: [] };
    sezioni.push(cur);
    dentroProve = false;
    continue;
  }
  if (!cur) continue;
  if (/^Prove:\s*$/.test(l) || /^## /.test(l)) dentroProve = true;
  const m = /^- \[[ x]\] (.*)$/.exec(l);
  if (m && (dentroProve || cur.n === 10)) cur.prove.push(m[1]);
}

// ---- esiti per id (se la stessa prova gira in più sessioni, vale il caso peggiore)
const perId = new Map();
for (const r of righe) {
  if (!perId.has(r.id)) perId.set(r.id, []);
  perId.get(r.id).push(r);
}
function esito(id) {
  const rs = perId.get(id);
  if (!rs) return null;
  const dett = [...new Set(rs.map((r) => r.detail).filter((d) => d && !d.startsWith('vedi la sessione')))].join(' || ');
  if (rs.some((r) => r.status === 'FALLITA')) return { stato: 'FALLITA', dett };
  if (rs.some((r) => r.status === 'SUPERATA')) return { stato: 'SUPERATA', dett };
  return { stato: 'DA PROVARE A MANO', dett };
}

const out = [];
let sup = 0, fal = 0, man = 0;
const fallite = [];
for (const s of sezioni) {
  out.push(`## ${s.n}. ${s.titolo}`, '');
  s.prove.forEach((testo, i) => {
    const id = `${s.n}.${i + 1}`;
    let e = esito(id);
    if (s.n === 10) e = { stato: 'DA PROVARE A MANO', dett: 'spazio libero per le tue note: non è una prova automatizzabile' };
    if (!e) e = { stato: 'DA PROVARE A MANO', dett: 'non coperta dalla suite automatica' };
    if (e.stato === 'SUPERATA') sup++;
    else if (e.stato === 'FALLITA') { fal++; fallite.push({ id, testo, dett: e.dett }); }
    else man++;
    const t = testo.replace(/`/g, '`');
    out.push(`- **${id}** ${t}`, `  - ${e.stato}${e.dett ? ': ' + e.dett : ''}`);
  });
  out.push('');
}

// ---- altre verifiche di appoggio (id non presenti nella lista)
const noti = new Set(sezioni.flatMap((s) => s.prove.map((_, i) => `${s.n}.${i + 1}`)));
const extra = [...perId.keys()].filter((k) => !noti.has(k));
if (extra.length) {
  out.push('## Verifiche di appoggio', '');
  for (const k of extra) {
    const e = esito(k);
    out.push(`- ${k}: ${e.stato}${e.dett ? ': ' + e.dett : ''}`);
  }
  out.push('');
}

// ---- schermate
const shotsDir = path.join(root, 'prove', 'schermate');
const shots = fs.existsSync(shotsDir) ? fs.readdirSync(shotsDir).filter((f) => f.endsWith('.png')).sort() : [];
out.push('## Schermate', '');
for (const f of shots) out.push(`- [${f}](schermate/${f})`);
out.push('');

// ---- versioni
const run = (cmd, args) => (spawnSync(cmd, args, { encoding: 'utf8' }).stdout ?? '').trim().split(/\r?\n/)[0];
const wv = (spawnSync('reg', ['query', 'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\EdgeUpdate\\Clients\\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}', '/v', 'pv'], { encoding: 'utf8' }).stdout ?? '').match(/(\d+\.\d+\.\d+\.\d+)/)?.[1] ?? '?';
const md = run(path.join(os.homedir(), '.local', 'msedgedriver', 'msedgedriver.exe'), ['--version']);
const td = ((spawnSync('cargo', ['install', '--list'], { encoding: 'utf8' }).stdout ?? '').match(/tauri-driver v[\d.]+/) ?? ['tauri-driver'])[0];

const data = new Date().toLocaleString('it-IT', { dateStyle: 'long', timeStyle: 'short' });
const testa = [
  '# Esito delle prove automatiche della tappa 2',
  '',
  `Data: ${data}`,
  '',
  `Totale: ${sup} SUPERATE, ${fal} FALLITE, ${man} DA PROVARE A MANO (su ${sup + fal + man} prove della lista).`,
  '',
  'Per rilanciare (dalla cartella del progetto, con la build debug già fatta in `src-tauri\\target\\debug\\pagina.exe`):',
  '',
  '```',
  'pnpm test:e2e',
  '```',
  '',
  'Una sola sessione: `$env:E2E_ONLY="s05-tabelle"; pnpm test:e2e` (i nomi sono in `e2e/lib.js`, voce `specFiles`).',
  'La suite apre l\'app vera sullo schermo, lavora su copie dei file in `%TEMP%\\pagina-e2e\\`, salva e a fine corsa ripristina le impostazioni dell\'app (`%APPDATA%\\it.df.pagina\\settings.json`) e chiude `pagina.exe`, `tauri-driver` e `msedgedriver`.',
  `Versioni: WebView2 ${wv}; ${md}; ${td}.`,
  '',
  'Come funziona: tauri-driver + msedgedriver + WebdriverIO (cartella `e2e/`). Dove WebDriver non arriva si usano gli strumenti di Windows: le voci del menu nativo via Win32 (`e2e/menu.ps1`), il mouse vero per la selezione col trascinamento nell\'anteprima (`e2e/mouse.ps1`), gli appunti con .NET, la chiusura della finestra con `CloseMainWindow`.',
  'Limiti: i file si aprono con un secondo avvio di `pagina.exe` (tauri-driver rovina gli argomenti di riga di comando); la modifica esterna di un file è fatta da PowerShell, non con il Blocco note vero; la selezione col mouse nell\'editor è fatta con i comandi di WebDriver, quella nell\'anteprima col mouse vero.',
  ''
];

const problemi = [];
if (fallite.length) {
  problemi.push('## Problemi trovati (non corretti)', '');
  for (const f of fallite) problemi.push(`- **${f.id}** ${f.testo}`, `  - ${f.dett}`);
  problemi.push('');
  if (fallite.some((f) => /^1\.[124]$/.test(f.id))) {
    problemi.push(
      '### Sulla selezione nell\'editor e nei blocchi (1.1, 1.2, 1.4)',
      '',
      'Il colore della selezione è giusto (`--selection`, letto con getComputedStyle sul livello `.cm-selectionBackground`), ma nello screenshot il pixel dentro la selezione ha il colore di `--active-line`: la riga attiva, che ha lo sfondo opaco, copre il livello della selezione (disegnato sotto il testo). Succede quando la selezione sta sulla riga del cursore, cioè quasi sempre con il mouse. In `src/lib/editor/extensions.ts` la regola è `.cm-activeLine { backgroundColor: var(--active-line) }`; con uno sfondo trasparente o con trasparenza (per esempio un colore con alfa) la selezione si vedrebbe. Non corretto, come da mandato.',
      ''
    );
  }
}

fs.writeFileSync(path.join(root, 'prove', 'esito_automatico.md'), [...testa, ...problemi, ...out].join('\n'), 'utf8');
console.log(`esito_automatico.md: ${sup} superate, ${fal} fallite, ${man} da provare a mano`);
