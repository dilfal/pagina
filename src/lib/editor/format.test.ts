import { describe, expect, it } from 'vitest';
import { EditorSelection, EditorState, type Transaction } from '@codemirror/state';
import {
  bold,
  bulletList,
  codeBlock,
  heading1,
  heading2,
  horizontalRule,
  inlineCode,
  insertLink,
  insertTable,
  insertText,
  italic,
  normalText,
  numberedList,
  quote,
  strikethrough,
  taskList,
  type Command,
  type Target
} from './format';

function target(state0: EditorState): { t: Target; get: () => EditorState } {
  let state = state0;
  return {
    t: {
      get state() {
        return state;
      },
      dispatch: (tr: Transaction) => {
        state = tr.state;
      }
    },
    get: () => state
  };
}

/**
 * Prova un comando su un testo; `|` nel testo segna il cursore, `[` e `]` una selezione.
 * Restituisce il testo con la selezione risultante marcata, oppure (textOnly) solo il testo.
 */
function run(cmd: Command, input: string, textOnly = false): string {
  let from: number;
  let to: number;
  let text: string;
  if (input.includes('|')) {
    from = to = input.indexOf('|');
    text = input.replace('|', '');
  } else {
    from = input.indexOf('[');
    to = input.indexOf(']') - 1;
    text = input.replace('[', '').replace(']', '');
  }
  const h = target(EditorState.create({ doc: text, selection: EditorSelection.single(from, to) }));
  cmd(h.t);
  const state = h.get();
  const sel = state.selection.main;
  const doc = state.doc.toString();
  if (textOnly) return doc;
  if (sel.empty) return doc.slice(0, sel.head) + '|' + doc.slice(sel.head);
  return doc.slice(0, sel.from) + '[' + doc.slice(sel.from, sel.to) + ']' + doc.slice(sel.to);
}

describe('marcatori in linea', () => {
  it('grassetto con selezione: avvolge e toglie', () => {
    expect(run(bold, 'a [parola] b')).toBe('a **[parola]** b');
    expect(run(bold, 'a **[parola]** b')).toBe('a [parola] b');
  });
  it('toglie anche se la selezione include i marcatori', () => {
    expect(run(bold, '[**parola**]')).toBe('[parola]');
  });
  it('senza selezione agisce sulla parola sotto il cursore', () => {
    expect(run(bold, 'a par|ola b')).toBe('a **par|ola** b');
    expect(run(bold, 'a **par|ola** b')).toBe('a par|ola b');
  });
  it('senza parola inserisce i marcatori col cursore in mezzo, e li toglie', () => {
    expect(run(bold, 'a | b')).toBe('a **|** b');
    expect(run(italic, '|')).toBe('*|*');
    expect(run(bold, '**|**')).toBe('|');
  });
  it('corsivo e grassetto non si confondono', () => {
    expect(run(italic, '**[x]**')).toBe('***[x]***');
    expect(run(bold, '***[x]***')).toBe('*[x]*');
    expect(run(italic, '***[x]***')).toBe('**[x]**');
    expect(run(italic, '*[x]*')).toBe('[x]');
    expect(run(bold, '*[x]*')).toBe('***[x]***');
  });
  it('barrato e codice in linea', () => {
    expect(run(strikethrough, '[no]')).toBe('~~[no]~~');
    expect(run(strikethrough, '~~[no]~~')).toBe('[no]');
    expect(run(inlineCode, 'usa [foo()]')).toBe('usa `[foo()]`');
    expect(run(inlineCode, 'usa `[foo]`')).toBe('usa [foo]');
  });
});

describe('link', () => {
  it('avvolge la selezione e seleziona l’url', () => {
    expect(run(insertLink, 'vai [qui] ora')).toBe('vai [qui]([url]) ora');
  });
  it('senza selezione né parola: [](url) con url selezionato', () => {
    expect(run(insertLink, 'x | y')).toBe('x []([url]) y');
  });
  it('un indirizzo selezionato diventa il bersaglio del link', () => {
    expect(run(insertLink, '[https://esempio.it]')).toBe('[|](https://esempio.it)');
  });
});

describe('titoli, elenchi, citazioni', () => {
  it('titoli per riga, sostituendo quello che c’è', () => {
    expect(run(heading1, 'Titolo|')).toBe('# Titolo|');
    expect(run(heading2, '# Titolo|')).toBe('## Titolo|');
    expect(run(normalText, '### Titolo|')).toBe('Titolo|');
    expect(run(normalText, 'Testo|')).toBe('Testo|');
  });
  it('titolo su più righe', () => {
    expect(run(heading1, '[a\nb]', true)).toBe('# a\n# b');
  });
  it('elenco puntato attiva e disattiva', () => {
    expect(run(bulletList, 'uno|')).toBe('- uno|');
    expect(run(bulletList, '- uno|')).toBe('uno|');
    expect(run(bulletList, '1. uno|')).toBe('- uno|');
  });
  it('elenco numerato su più righe', () => {
    expect(run(numberedList, '[a\nb\nc]', true)).toBe('1. a\n2. b\n3. c');
    expect(run(numberedList, '[1. a\n2. b]', true)).toBe('a\nb');
  });
  it('elenco di attività', () => {
    expect(run(taskList, 'fai|')).toBe('- [ ] fai|');
    expect(run(taskList, '- [ ] fai|')).toBe('fai|');
    expect(run(taskList, '- fai|')).toBe('- [ ] fai|');
    expect(run(bulletList, '- [x] fai|')).toBe('- fai|');
  });
  it('citazione per riga, attiva e disattiva', () => {
    expect(run(quote, '[a\nb]', true)).toBe('> a\n> b');
    expect(run(quote, '[> a\n> b]', true)).toBe('a\nb');
    expect(run(quote, 'a|')).toBe('> a|');
  });
});

describe('blocchi', () => {
  it('blocco di codice: avvolge le righe e le libera', () => {
    expect(run(codeBlock, '[a\nb]')).toBe('```\n[a\nb]\n```');
    expect(run(codeBlock, '```\n[a\nb]\n```', true)).toBe('a\nb');
  });
  it('riga vuota: coppia di recinzioni col cursore in mezzo', () => {
    expect(run(codeBlock, '|')).toBe('```\n|\n```');
  });
  it('tabella 3 colonne, intestazione e due righe', () => {
    const out = run(insertTable, 'prima|');
    expect(out.startsWith('prima\n\n| ')).toBe(true);
    expect(out.split('\n').length).toBe(8);
    expect(out).toContain('| --- | --- | --- |');
  });
  it('linea orizzontale con righe vuote attorno', () => {
    expect(run(horizontalRule, 'testo|')).toBe('testo\n\n---\n\n|');
    expect(run(horizontalRule, 'a\n|\nb')).toBe('a\n\n---\n|\nb');
  });
  it('insertText inserisce al posto della selezione', () => {
    const h = target(EditorState.create({ doc: 'ab', selection: EditorSelection.single(1, 1) }));
    insertText(h.t, '![](immagini/x.png)');
    expect(h.get().doc.toString()).toBe('a![](immagini/x.png)b');
  });
});
