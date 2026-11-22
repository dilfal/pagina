import { describe, expect, it } from 'vitest';
import { imageExtension, imageMarkdown, isImageFile, pastedImageFiles } from './imageUtils';

const file = (name: string, type: string) => ({ name, type }) as File;

describe('immagini incollate', () => {
  it('il riferimento codifica gli spazi come %20', () => {
    expect(imageMarkdown('immagini/Il mio file-20260101-101010.png')).toBe(
      '![](immagini/Il%20mio%20file-20260101-101010.png)'
    );
    expect(imageMarkdown('immagini/a.png')).toBe('![](immagini/a.png)');
  });
  it('estensione dal tipo MIME o dal nome; altri formati rifiutati', () => {
    expect(imageExtension('image.png', 'image/png')).toBe('png');
    expect(imageExtension('foto.JPG', '')).toBe('jpg');
    expect(imageExtension('foto.jpeg', '')).toBe('jpeg');
    expect(imageExtension('', 'image/jpeg')).toBe('jpg');
    expect(imageExtension('a.webp', '')).toBe('webp');
    expect(imageExtension('a.svg', 'image/svg+xml')).toBeNull();
    expect(imageExtension('a.txt', 'text/plain')).toBeNull();
    expect(isImageFile(file('x.gif', ''))).toBe(true);
  });
  it('con del testo negli appunti l’incolla resta quello di testo', () => {
    const png = file('image.png', 'image/png');
    expect(pastedImageFiles({ files: [png], getData: () => '' })).toEqual([png]);
    expect(pastedImageFiles({ files: [png], getData: () => 'celle di Excel' })).toEqual([]);
    expect(pastedImageFiles({ files: [file('a.txt', 'text/plain')], getData: () => '' })).toEqual([]);
    expect(pastedImageFiles({})).toEqual([]);
  });
});
