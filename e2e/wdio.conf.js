// Suite E2E sull'app vera (pagina.exe) con tauri-driver + msedgedriver + WebdriverIO.
// Lancio: pnpm test:e2e   (dalla cartella del progetto)
// Prerequisiti: tauri-driver (cargo install tauri-driver --locked), msedgedriver della stessa versione di WebView2
// in %USERPROFILE%\.local\msedgedriver\msedgedriver.exe (o in MSEDGEDRIVER), build debug in src-tauri\target\debug\pagina.exe.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SETTINGS, TMP, RESULTS, SHOTS, specFiles, writeFixture, writeSettings } from './lib.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const EXE = path.resolve(here, '..', 'src-tauri', 'target', 'debug', 'pagina.exe');
const NATIVE = process.env.MSEDGEDRIVER ?? path.join(os.homedir(), '.local', 'msedgedriver', 'msedgedriver.exe');
const TAURI_DRIVER = path.join(os.homedir(), '.cargo', 'bin', 'tauri-driver.exe');
const BACKUP = path.join(TMP, 'settings.backup.json');

let driver;

function isRunning(image) {
  const r = spawnSync('tasklist', ['/FI', `IMAGENAME eq ${image}`, '/FO', 'CSV', '/NH'], { encoding: 'utf8' });
  return (r.stdout ?? '').toLowerCase().includes(`"${image.toLowerCase()}"`);
}

// Chiude solo ciò che ha avviato la suite: l'albero di processi del suo tauri-driver (msedgedriver, pagina.exe).
// All'avvio nessun pagina.exe era aperto (onPrepare si ferma altrimenti), quindi quelli presenti a fine corsa sono delle prove.
function killOurs() {
  if (driver?.pid) spawnSync('taskkill', ['/F', '/T', '/PID', String(driver.pid)], { stdio: 'ignore' });
  spawnSync('taskkill', ['/F', '/T', '/IM', 'pagina.exe'], { stdio: 'ignore' });
}

// Rimette le impostazioni originali dell'utente se esiste un backup (anche di una corsa interrotta).
function restoreSettings() {
  if (!fs.existsSync(BACKUP)) return;
  try {
    const b = fs.readFileSync(BACKUP, 'utf8');
    if (b === '__NONE__') fs.rmSync(SETTINGS, { force: true });
    else fs.writeFileSync(SETTINGS, b);
    fs.rmSync(BACKUP, { force: true });
  } catch (e) {
    console.error('Ripristino delle impostazioni non riuscito:', e);
  }
}

let cleaned = false;
function cleanupOnce() {
  if (cleaned) return;
  cleaned = true;
  try {
    driver?.kill();
  } catch {}
  killOurs();
  restoreSettings();
}
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.once(sig, () => {
    cleanupOnce();
    process.exit(1);
  });
}
process.once('uncaughtException', (e) => {
  console.error(e);
  cleanupOnce();
  process.exit(1);
});

const attivi = specFiles.filter((s) => (process.env.E2E_ONLY ? process.env.E2E_ONLY.split(',').includes(s.name) : !s.dev));
// Il giro delle schermate del design (spec `dev`) non e' una prova: se la corsa non comprende nessuna spec normale
// non si toccano ne' e2e/out/results.jsonl ne' prove/esito_automatico.md.
const corsaNormale = attivi.some((s) => !s.dev);

export const config = {
  runner: 'local',
  hostname: '127.0.0.1',
  port: 4444,
  path: '/',
  specs: attivi.map((s) => `./specs/${s.name}.e2e.js`),
  maxInstances: 1,
  // un'app nuova per ogni file di specifica, ognuna con il suo file di prova passato da riga di comando
  // una sola capability: wdio apre una sessione (cioè un'app nuova) per ogni file di specifica
  capabilities: [{ maxInstances: 1, 'wdio:enforceWebDriverClassic': true, 'tauri:options': { application: EXE, args: [] } }],
  framework: 'mocha',
  reporters: ['spec'],
  mochaOpts: { ui: 'bdd', timeout: 120000 },
  logLevel: 'warn',
  strictSelectors: false,
  connectionRetryCount: 2,
  waitforTimeout: 8000,

  onPrepare() {
    if (isRunning('pagina.exe')) {
      console.error('Chiudi Pagina prima di lanciare i test e2e');
      process.exit(1);
    }
    cleaned = false;
    fs.mkdirSync(TMP, { recursive: true });
    fs.mkdirSync(SHOTS, { recursive: true });
    if (corsaNormale) fs.rmSync(RESULTS, { force: true });
    // se una corsa interrotta ha lasciato un backup, prima lo si rimette sull'originale; poi si fa il nuovo backup
    restoreSettings();
    fs.writeFileSync(BACKUP, fs.existsSync(SETTINGS) ? fs.readFileSync(SETTINGS) : '__NONE__');
    driver = spawn(TAURI_DRIVER, ['--native-driver', NATIVE], { stdio: ['ignore', 'inherit', 'inherit'] });
    return new Promise((r) => setTimeout(r, 1500));
  },

  beforeSession(_c, _caps, specs) {
    const name = path.basename(specs[0]).replace('.e2e.js', '');
    fs.mkdirSync(path.join(TMP, name), { recursive: true });
    // ogni sessione parte da impostazioni note (tema scuro, italiano) e da una copia fresca dei file di prova
    const s = specFiles.find((x) => x.name === name);
    writeSettings(s?.settings === undefined ? {} : s.settings);
    writeFixture(name);
  },

  onComplete() {
    try {
      driver?.kill();
    } catch {}
    killOurs();
    // esito scritto in prove/esito_automatico.md (solo se la corsa comprende le spec normali)
    if (corsaNormale) spawnSync(process.execPath, [path.join(here, 'genera_esito.mjs')], { stdio: 'inherit' });
    cleaned = true;
    restoreSettings();
  }
};
