import { invoke } from '@tauri-apps/api/core';

export interface FileData {
  content: string;
  eol: '\n' | '\r\n';
  bom: boolean;
  mixedEol: boolean;
}

export interface FileError {
  kind: 'conflict' | 'notfound' | 'io';
  message: string;
}

export const readTextFile = (path: string) => invoke<FileData>('read_text_file', { path });

export const writeTextFile = (
  path: string,
  content: string,
  eol: string,
  bom: boolean,
  force: boolean
) => invoke<void>('write_text_file', { path, content, eol, bom, force });

export const watchFile = (path: string) => invoke<void>('watch_file', { path });
export const unwatchFile = (path: string) => invoke<void>('unwatch_file', { path });
export const takeLaunchFiles = () => invoke<string[]>('take_launch_files');

export function errorKind(e: unknown): FileError['kind'] {
  return typeof e === 'object' && e !== null && 'kind' in e ? (e as FileError).kind : 'io';
}

export function errorMessage(e: unknown): string {
  if (typeof e === 'object' && e !== null && 'message' in e) return String((e as FileError).message);
  return String(e);
}

/** Salva un'immagine incollata accanto al documento; restituisce `immagini/<nome>`. */
export const savePastedImage = (mdPath: string, bytes: Uint8Array, ext: string) =>
  invoke<string>('save_pasted_image', bytes, {
    headers: { 'x-md-path': encodeURIComponent(mdPath), 'x-ext': ext }
  });

/** Copia un'immagine scelta dall'utente accanto al documento; restituisce `immagini/<nome>`. */
export const importImage = (mdPath: string, srcPath: string) =>
  invoke<string>('import_image', { mdPath, srcPath });
