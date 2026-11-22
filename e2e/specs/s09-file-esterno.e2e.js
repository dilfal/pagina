import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { apri, pronto, prova, ok, eq, setMode, puntoDel, doppioClic, testoDi, sorgente, sleep, shot, ripristina, menu, fixtureFor } from '../lib.js';

const NAME = 's09-file-esterno';
const FILE = fixtureFor(NAME);
const aperto = () => browser.execute(() => !!document.querySelector('.block-editor .cm-content'));
const banner = () => browser.execute(() => document.querySelector('.banner[role="alert"]')?.innerText ?? null);

/** Modifica il file da PowerShell, come farebbe un altro programma (il Blocco note scrive allo stesso modo). */
function modificaEsterna(da, a) {
  const cmd = `$f='${FILE}'; $t=[IO.File]::ReadAllText($f); [IO.File]::WriteAllText($f, $t.Replace('${da}','${a}'))`;
  const r = spawnSync('pwsh', ['-NoProfile', '-Command', cmd], { encoding: 'utf8', timeout: 20000 });
  if (r.status !== 0) throw new Error(`PowerShell: ${r.stderr}`);
}
async function apriBloccoEScrivi(snippet, testo) {
  const p = await puntoDel('.markdown-body p', snippet);
  await doppioClic(p.x, p.y);
  ok(await aperto(), 'blocco aperto');
  await browser.keys(['Control', 'End']);
  await browser.keys(testo);
}
async function attendiBanner(timeout = 6000) {
  await browser.waitUntil(async () => !!(await banner()), { timeout, timeoutMsg: "l'avviso di file cambiato non è comparso" });
}

describe('9. File cambiato da fuori', () => {
  before(async () => {
    await pronto();
    await apri(NAME);
    await setMode('split');
  });

  prova('9.1', 'Apri un blocco nell\'anteprima e scrivi qualcosa, senza chiuderlo', async () => {
    await apriBloccoEScrivi('Secondo paragrafo', ' ZZLOCALE');
    ok((await testoDi('.block-editor')).includes('ZZLOCALE'), 'testo scritto nel blocco');
    ok((await sorgente()).includes('ZZLOCALE'), 'testo scritto anche nel documento');
  });

  prova('9.2', 'Cambia una parola del file da fuori (PowerShell) e salva', async () => {
    modificaEsterna('lontano dal blocco', 'vicino al blocco');
    ok(fs.readFileSync(FILE, 'utf8').includes('vicino al blocco'), 'il file su disco è cambiato');
    return 'la modifica esterna è fatta con [IO.File]::WriteAllText da PowerShell, non con il Blocco note vero';
  });

  prova('9.3', 'Torna in Pagina: appare l\'avviso che il file è cambiato sul disco', async () => {
    await attendiBanner();
    const b = await banner();
    ok(/modificato sul disco/.test(b), `avviso: ${b}`);
    await shot('9-avviso-file-cambiato');
    return b.replace(/\s+/g, ' ');
  });

  prova('9.4', 'Il testo che stavi scrivendo nel blocco non è andato perso', async () => {
    ok((await sorgente()).includes('ZZLOCALE'), 'ZZLOCALE non è più nel documento');
    const aperto2 = await aperto();
    return `documento intatto; blocco ancora aperto: ${aperto2}`;
  });

  prova('9.5', '«Ricarica dal disco» porta la versione del Blocco note', async () => {
    await $('button=Ricarica dal disco').click();
    await sleep(900);
    const s = await sorgente();
    ok(s.includes('vicino al blocco'), 'la modifica esterna non è nel documento');
    ok(!s.includes('ZZLOCALE'), 'il testo locale è rimasto dopo il ricarico');
    eq(await banner(), null, 'avviso dopo il ricarico');
  });

  prova('9.6', '«Tieni la mia versione» mantiene la tua e al salvataggio sovrascrive quella esterna', async () => {
    await apriBloccoEScrivi('Secondo paragrafo', ' ZZTIENI');
    modificaEsterna('Terzo paragrafo, ancora lontano', 'Terzo paragrafo, MODIFICATO FUORI');
    await attendiBanner();
    await $('button=Tieni la mia versione').click();
    await sleep(600);
    eq(await banner(), null, 'avviso dopo «Tieni la mia versione»');
    ok((await sorgente()).includes('ZZTIENI'), 'la versione locale è nel documento');
    menu('File', 'Salva');
    await sleep(1800);
    const disco = fs.readFileSync(FILE, 'utf8');
    ok(disco.includes('ZZTIENI'), 'il file su disco non contiene la versione locale');
    ok(!disco.includes('MODIFICATO FUORI'), 'il file su disco ha ancora la modifica esterna: non è stato sovrascritto');
  });

  prova('9.7', 'Modifica esterna in una parte lontana dal blocco aperto: tutto resta a posto', async () => {
    await ripristina(NAME);
    await setMode('split');
    const p = await puntoDel('.markdown-body p', 'Secondo paragrafo');
    await doppioClic(p.x, p.y);
    ok(await aperto(), 'blocco aperto (senza scrivere)');
    modificaEsterna('Primo paragrafo, lontano dal blocco', 'Primo paragrafo, CAMBIATO LONTANO');
    await sleep(2500);
    const b = await banner();
    const s = await sorgente();
    const stato = `avviso: ${b ? 'sì (' + b.replace(/\s+/g, ' ') + ')' : 'no'}; blocco ancora aperto: ${await aperto()}`;
    ok(s.includes('CAMBIATO LONTANO'), `la modifica esterna non è nel documento. ${stato}`);
    ok(s.includes('Secondo paragrafo da aprire nell\'anteprima.'), 'il paragrafo aperto è intatto');
    return stato;
  });
});
