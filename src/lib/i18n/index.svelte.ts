import it from './it.json';
import en from './en.json';

export type Lang = 'it' | 'en';
export type LangPref = 'system' | Lang;
export type Key = keyof typeof it;

const dicts: Record<Lang, Record<string, string>> = { it, en };

export function systemLang(): Lang {
  const l = typeof navigator !== 'undefined' ? navigator.language : 'en';
  return l.toLowerCase().startsWith('it') ? 'it' : 'en';
}

class I18n {
  pref = $state<LangPref>('system');
  get lang(): Lang {
    return this.pref === 'system' ? systemLang() : this.pref;
  }
}

export const i18n = new I18n();

export function t(key: Key, params?: Record<string, string | number>): string {
  let s = dicts[i18n.lang][key] ?? key;
  if (params) for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

type PluralBase<K> = K extends `${infer P}.one` ? P : never;
export type PluralKey = PluralBase<Key>;

/** Forma singolare (`<chiave>.one`, per n = 1) o plurale (`<chiave>.other`); {n} è sempre disponibile nel testo. */
export function tn(key: PluralKey, n: number, params?: Record<string, string | number>): string {
  return t(`${key}.${n === 1 ? 'one' : 'other'}` as Key, { n, ...params });
}
