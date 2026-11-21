import MarkdownIt, { type Token } from 'markdown-it';
import footnote from 'markdown-it-footnote';
import taskLists from 'markdown-it-task-lists';
import anchor from 'markdown-it-anchor';
import DOMPurify from 'dompurify';
import { resolveImageSrc } from '../paths';
import { getCachedHighlight, normalizeLang } from './highlight';

export interface RenderOptions {
  /** Cartella del file aperto, per risolvere le immagini relative. */
  baseDir?: string | null;
  /** In Tauri: `convertFileSrc`. */
  convertSrc?: (path: string) => string;
}

export interface RenderedBlock {
  /** Prima riga del blocco nel sorgente (0-based). */
  start: number;
  /** Riga dopo l'ultima del blocco (0-based, esclusa). */
  end: number;
  html: string;
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Attributi di posizione: `data-source-line` è 1-based, start/end 0-based con fine esclusa. */
function sourceAttrs(map: [number, number]): string {
  return `data-source-line="${map[0] + 1}" data-source-start="${map[0]}" data-source-end="${map[1]}"`;
}

type MD = InstanceType<typeof MarkdownIt>;

function createMarkdown(): MD {
  const md = new MarkdownIt({ html: true, linkify: true, typographer: true });
  md.use(footnote);
  md.use(taskLists, { enabled: true });
  md.use(anchor, {
    slugify: (s: string) =>
      encodeURIComponent(String(s).trim().toLowerCase().replace(/\s+/g, '-')),
  });

  // Posizione nel sorgente su ogni blocco di primo livello (e riga di ogni casella).
  md.core.ruler.push('source_ranges', (state) => {
    for (const tok of state.tokens) {
      if (
        tok.level === 0 &&
        tok.map &&
        tok.nesting >= 0 &&
        tok.type !== 'html_block' &&
        tok.type !== 'fence'
      ) {
        tok.attrSet('data-source-line', String(tok.map[0] + 1));
        tok.attrSet('data-source-start', String(tok.map[0]));
        tok.attrSet('data-source-end', String(tok.map[1]));
      }
      if (tok.type === 'inline' && tok.map && tok.children?.length) {
        const first = tok.children[0];
        if (first.type === 'html_inline' && first.content.includes('task-list-item-checkbox')) {
          first.content = first.content.replace(
            '<input ',
            `<input data-task-line="${tok.map[0]}" `
          );
        }
      }
    }
    return true;
  });

  md.renderer.rules.fence = (tokens, idx) => {
    const token = tokens[idx];
    const lang = normalizeLang(token.info);
    const code = token.content;
    const attrs = token.map ? sourceAttrs(token.map as [number, number]) : '';
    const langAttr = lang ? ` data-lang="${esc(lang)}"` : '';
    const cached = lang ? getCachedHighlight(lang, code.replace(/\n$/, '')) : undefined;
    if (cached) {
      return cached.replace(/^<pre /, `<pre ${attrs}${langAttr} `) + '\n';
    }
    const pending = lang ? ' data-pending="1"' : '';
    return `<pre ${attrs}${langAttr}${pending}><code>${esc(code)}</code></pre>\n`;
  };

  md.renderer.rules.html_block = (tokens, idx) => {
    const token = tokens[idx];
    if (!token.map) return token.content;
    return token.content.replace(
      /^(\s*<[a-zA-Z][\w-]*)/,
      `$1 ${sourceAttrs(token.map as [number, number])}`
    );
  };

  return md;
}

let mdInstance: MD | null = null;
const getMd = () => (mdInstance ??= createMarkdown());

/**
 * Rende il documento un blocco di primo livello alla volta: ogni blocco porta
 * il proprio intervallo di righe, così in seguito si potrà sostituire un solo
 * blocco senza ridisegnare il resto.
 */
export function renderBlocks(source: string): RenderedBlock[] {
  const md = getMd();
  const env: Record<string, unknown> = {};
  const tokens = md.parse(source, env);
  const blocks: RenderedBlock[] = [];
  let group: Token[] = [];
  let first: Token | null = null;
  for (const tok of tokens) {
    if (group.length === 0) first = tok;
    group.push(tok);
    if (tok.level === 0 && tok.nesting <= 0) {
      const map = first?.map ?? null;
      blocks.push({
        start: map ? map[0] : -1,
        end: map ? map[1] : -1,
        html: md.renderer.render(group, md.options, env),
      });
      group = [];
      first = null;
    }
  }
  return blocks;
}

/** Sanifica l'HTML finale e risolve i percorsi relativi delle immagini. */
export function sanitize(html: string, opts: RenderOptions = {}): string {
  const frag = DOMPurify.sanitize(html, {
    RETURN_DOM_FRAGMENT: true,
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['style', 'form', 'iframe', 'object', 'embed'],
    ADD_TAGS: ['input'],
    ADD_ATTR: ['checked', 'type', 'data-task-line'],
  }) as DocumentFragment;
  if (opts.convertSrc) {
    const convert = opts.convertSrc;
    frag.querySelectorAll('img[src]').forEach((img) => {
      img.setAttribute(
        'src',
        resolveImageSrc(img.getAttribute('src') ?? '', opts.baseDir, convert)
      );
    });
  }
  const holder = document.createElement('div');
  holder.appendChild(frag);
  return holder.innerHTML;
}

export function renderMarkdown(source: string, opts: RenderOptions = {}): string {
  const html = renderBlocks(source)
    .map((b) => b.html)
    .join('');
  return sanitize(html, opts);
}
