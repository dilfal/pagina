import { load, type Store } from '@tauri-apps/plugin-store';
import { i18n, type LangPref } from './i18n/index.svelte';

export type ThemePref = 'system' | 'light' | 'dark';

class Settings {
  theme = $state<ThemePref>('system');
  /** Il tema del sistema, aggiornato in tempo reale. */
  systemDark = $state(false);
  splitRatio = $state(0.5);
  showFormatBar = $state(true);
  /** Un a capo singolo nel sorgente va a capo anche nell'anteprima. */
  singleBreaks = $state(true);
  private store: Store | null = null;

  get resolvedTheme(): 'light' | 'dark' {
    return this.theme === 'system' ? (this.systemDark ? 'dark' : 'light') : this.theme;
  }

  async init() {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    this.systemDark = mq.matches;
    mq.addEventListener('change', (e) => (this.systemDark = e.matches));
    try {
      this.store = await load('settings.json', { defaults: {}, autoSave: true });
      const th = await this.store.get<ThemePref>('theme');
      const lg = await this.store.get<LangPref>('lang');
      const sp = await this.store.get<number>('splitRatio');
      const fb = await this.store.get<boolean>('formatBar');
      const sb = await this.store.get<boolean>('singleBreaks');
      if (th === 'light' || th === 'dark' || th === 'system') this.theme = th;
      if (lg === 'it' || lg === 'en' || lg === 'system') i18n.pref = lg;
      if (typeof fb === 'boolean') this.showFormatBar = fb;
      if (typeof sb === 'boolean') this.singleBreaks = sb;
      if (typeof sp === 'number' && sp > 0.15 && sp < 0.85) this.splitRatio = sp;
    } catch (e) {
      console.warn('settings non disponibili', e);
    }
  }

  async setTheme(v: ThemePref) {
    this.theme = v;
    await this.persist('theme', v);
  }

  async setLang(v: LangPref) {
    i18n.pref = v;
    await this.persist('lang', v);
  }

  async setSplit(v: number) {
    this.splitRatio = v;
    await this.persist('splitRatio', v);
  }

  async setFormatBar(v: boolean) {
    this.showFormatBar = v;
    await this.persist('formatBar', v);
  }

  async setSingleBreaks(v: boolean) {
    this.singleBreaks = v;
    await this.persist('singleBreaks', v);
  }

  private async persist(key: string, value: unknown) {
    try {
      await this.store?.set(key, value);
    } catch (e) {
      console.warn('impossibile salvare le impostazioni', e);
    }
  }
}

export const settings = new Settings();
