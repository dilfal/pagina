import { CheckMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu } from '@tauri-apps/api/menu';
import type { LangPref, Key } from './i18n/index.svelte';
import type { ThemePref } from './settings.svelte';
import type { ViewMode } from './tabs.svelte';

export interface MenuState {
  tr: (key: Key) => string;
  mode: ViewMode | null;
  theme: ThemePref;
  lang: LangPref;
  actions: {
    newTab: () => void;
    open: () => void;
    save: () => void;
    saveAs: () => void;
    closeTab: () => void;
    quit: () => void;
    setMode: (m: ViewMode) => void;
    nextTab: () => void;
    prevTab: () => void;
    setTheme: (t: ThemePref) => void;
    setLang: (l: LangPref) => void;
    about: () => void;
  };
}

let current: Menu | null = null;
let chain: Promise<unknown> = Promise.resolve();

/** Costruisce i menu nativi (nella lingua corrente) e li installa; le richieste si accodano. */
export function installMenu(state: MenuState): Promise<void> {
  const run = chain.then(() => build(state));
  chain = run.catch((e) => console.warn('menu non costruito', e));
  return run;
}

async function item(text: string, action: () => void, accelerator?: string) {
  return MenuItem.new({ text, accelerator, action });
}

async function check(text: string, checked: boolean, action: () => void, accelerator?: string) {
  return CheckMenuItem.new({ text, checked, accelerator, action });
}

async function build(s: MenuState) {
  const { tr, actions: a } = s;

  const file = await Submenu.new({
    text: tr('menu.file'),
    items: [
      await item(tr('menu.new'), a.newTab, 'CmdOrCtrl+N'),
      await item(tr('menu.open'), a.open, 'CmdOrCtrl+O'),
      await PredefinedMenuItem.new({ item: 'Separator' }),
      await item(tr('menu.save'), a.save, 'CmdOrCtrl+S'),
      await item(tr('menu.saveAs'), a.saveAs, 'CmdOrCtrl+Shift+S'),
      await PredefinedMenuItem.new({ item: 'Separator' }),
      await item(tr('menu.closeTab'), a.closeTab, 'CmdOrCtrl+W'),
      await item(tr('menu.quit'), a.quit)
    ]
  });

  const theme = await Submenu.new({
    text: tr('menu.theme'),
    items: [
      await check(tr('menu.themeSystem'), s.theme === 'system', () => a.setTheme('system')),
      await check(tr('menu.themeLight'), s.theme === 'light', () => a.setTheme('light')),
      await check(tr('menu.themeDark'), s.theme === 'dark', () => a.setTheme('dark'))
    ]
  });

  const view = await Submenu.new({
    text: tr('menu.view'),
    items: [
      await check(tr('menu.viewEdit'), s.mode === 'edit', () => a.setMode('edit'), 'CmdOrCtrl+1'),
      await check(tr('menu.viewSplit'), s.mode === 'split', () => a.setMode('split'), 'CmdOrCtrl+2'),
      await check(tr('menu.viewPreview'), s.mode === 'preview', () => a.setMode('preview'), 'CmdOrCtrl+3'),
      await PredefinedMenuItem.new({ item: 'Separator' }),
      await item(tr('menu.nextTab'), a.nextTab, 'Ctrl+Tab'),
      await item(tr('menu.prevTab'), a.prevTab, 'Ctrl+Shift+Tab'),
      await PredefinedMenuItem.new({ item: 'Separator' }),
      theme
    ]
  });

  const settings = await Submenu.new({
    text: tr('menu.settings'),
    items: [
      await Submenu.new({
        text: tr('menu.language'),
        items: [
          await check(tr('menu.langSystem'), s.lang === 'system', () => a.setLang('system')),
          await check(tr('menu.langIt'), s.lang === 'it', () => a.setLang('it')),
          await check(tr('menu.langEn'), s.lang === 'en', () => a.setLang('en'))
        ]
      })
    ]
  });

  const help = await Submenu.new({
    text: tr('menu.help'),
    items: [await item(tr('menu.about'), a.about)]
  });

  const menu = await Menu.new({ items: [file, view, settings, help] });
  await menu.setAsAppMenu();
  const old = current;
  current = menu;
  if (old) await old.close().catch(() => {});
}
