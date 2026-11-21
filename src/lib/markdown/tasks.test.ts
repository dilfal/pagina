import { describe, expect, it } from 'vitest';
import { taskToggleChange, toggleTaskLine } from './tasks';

describe('toggleTaskLine', () => {
  const src = '# T\n\n- [ ] uno\n- [x] due\n- [X] tre\n- altro [ ] non è una casella\n';

  it('cambia solo la riga indicata, il resto resta identico', () => {
    const out = toggleTaskLine(src, 2)!;
    expect(out).toBe('# T\n\n- [x] uno\n- [x] due\n- [X] tre\n- altro [ ] non è una casella\n');
    expect(out.length).toBe(src.length);
  });

  it('[x] e [X] tornano a [ ]', () => {
    expect(toggleTaskLine(src, 3)).toBe(src.replace('- [x] due', '- [ ] due'));
    expect(toggleTaskLine(src, 4)).toBe(src.replace('- [X] tre', '- [ ] tre'));
  });

  it('due commutazioni riportano al testo originale, byte per byte', () => {
    const once = toggleTaskLine(src, 2)!;
    expect(toggleTaskLine(once, 2)).toBe(src);
  });

  it('conserva i fine riga CRLF e misti', () => {
    const crlf = '- [ ] a\r\n- [x] b\r\nfine\r\n';
    const out = toggleTaskLine(crlf, 1)!;
    expect(out).toBe('- [ ] a\r\n- [ ] b\r\nfine\r\n');
    const mixed = 'x\r\n- [ ] a\n- [ ] b\r\n';
    expect(toggleTaskLine(mixed, 2)).toBe('x\r\n- [ ] a\n- [x] b\r\n');
  });

  it('funziona con elenchi numerati, annidati e dentro citazioni', () => {
    expect(toggleTaskLine('1. [ ] a', 0)).toBe('1. [x] a');
    expect(toggleTaskLine('- a\n    * [ ] b', 1)).toBe('- a\n    * [x] b');
    expect(toggleTaskLine('> - [ ] q', 0)).toBe('> - [x] q');
  });

  it('restituisce null per righe che non sono attività o fuori intervallo', () => {
    expect(toggleTaskLine(src, 0)).toBeNull();
    expect(toggleTaskLine(src, 5)).toBeNull();
    expect(toggleTaskLine(src, 99)).toBeNull();
  });

  it('taskToggleChange dà la posizione esatta del carattere', () => {
    const c = taskToggleChange('ab\n- [ ] c', 1)!;
    expect(c).toEqual({ from: 6, to: 7, insert: 'x' });
  });
});
