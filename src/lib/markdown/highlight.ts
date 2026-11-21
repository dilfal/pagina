/**
 * Colorazione del codice con Shiki. Shiki e le lingue si caricano al bisogno
 * (import dinamico); i risultati si tengono in una cache, così un nuovo
 * rendering dell'anteprima riusa subito il codice già colorato.
 */
import DOMPurify from 'dompurify';

type Highlighter = {
  loadLanguage: (...langs: string[]) => Promise<void>;
  codeToHtml: (code: string, opts: Record<string, unknown>) => string;
};

export const THEMES = { light: 'github-light', dark: 'github-dark' } as const;

const cache = new Map<string, string>();
const MAX_CACHE = 300;
let highlighterPromise: Promise<{ hl: Highlighter; langs: Record<string, unknown> }> | null = null;

export function normalizeLang(info: string): string {
  return (info.trim().split(/\s+/)[0] ?? '').toLowerCase();
}

const key = (lang: string, code: string) => `${lang}|${code}`;

export function getCachedHighlight(lang: string, code: string): string | undefined {
  return cache.get(key(lang, code));
}

async function getHighlighter() {
  highlighterPromise ??= import('shiki').then(async (m) => {
    const hl = (await m.createHighlighter({
      themes: [THEMES.light, THEMES.dark],
      langs: [],
    })) as unknown as Highlighter;
    return { hl, langs: m.bundledLanguages as Record<string, unknown> };
  });
  return highlighterPromise;
}

/** Restituisce l'HTML colorato (già passato da DOMPurify) o null se la lingua non esiste. */
export async function highlightCode(lang: string, code: string): Promise<string | null> {
  const hit = cache.get(key(lang, code));
  if (hit) return hit;
  if (!lang) return null;
  const { hl, langs } = await getHighlighter();
  if (!(lang in langs)) return null;
  try {
    await hl.loadLanguage(lang);
    const raw = hl.codeToHtml(code, {
      lang,
      themes: THEMES,
      defaultColor: false,
    });
    const html = DOMPurify.sanitize(raw);
    if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value as string);
    cache.set(key(lang, code), html);
    return html;
  } catch {
    return null;
  }
}

/** Colora i blocchi `pre[data-pending]` di un contenitore già in pagina. */
export async function highlightPending(root: HTMLElement, isStale: () => boolean): Promise<void> {
  const pres = Array.from(root.querySelectorAll<HTMLElement>('pre[data-pending]'));
  for (const pre of pres) {
    if (isStale()) return;
    const lang = pre.getAttribute('data-lang') ?? '';
    const code = pre.textContent ?? '';
    const html = await highlightCode(lang, code.replace(/\n$/, ''));
    if (isStale() || !pre.isConnected) return;
    if (!html) {
      pre.removeAttribute('data-pending');
      continue;
    }
    const tpl = document.createElement('template');
    tpl.innerHTML = html;
    const fresh = tpl.content.querySelector('pre');
    if (!fresh) continue;
    for (const a of ['data-source-line', 'data-source-start', 'data-source-end', 'data-lang']) {
      const v = pre.getAttribute(a);
      if (v !== null) fresh.setAttribute(a, v);
    }
    pre.replaceWith(fresh);
  }
}
