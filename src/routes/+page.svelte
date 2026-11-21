<script lang="ts">
  import { onMount } from 'svelte';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { getCurrentWebview } from '@tauri-apps/api/webview';
  import { getVersion } from '@tauri-apps/api/app';
  import { listen, type UnlistenFn } from '@tauri-apps/api/event';
  import { message } from '@tauri-apps/plugin-dialog';
  import Editor from '$lib/components/Editor.svelte';
  import Preview from '$lib/components/Preview.svelte';
  import TabBar from '$lib/components/TabBar.svelte';
  import Banner from '$lib/components/Banner.svelte';
  import Welcome from '$lib/components/Welcome.svelte';
  import { store } from '$lib/tabs.svelte';
  import { settings } from '$lib/settings.svelte';
  import { i18n, t } from '$lib/i18n/index.svelte';
  import { installMenu } from '$lib/menu';
  import { takeLaunchFiles } from '$lib/fileApi';
  import { basename } from '$lib/paths';

  const TEXT_EXT = /\.(md|markdown|mdown|mkd|txt)$/i;

  let ready = $state(false);
  let dropping = $state(false);
  let panes: HTMLDivElement | undefined = $state();
  let resizing = false;

  const active = $derived(store.active);
  const mode = $derived(active?.mode ?? null);

  // Tema applicato a tutta l'interfaccia (CSS), all'editor e a Shiki (variabili CSS).
  $effect(() => {
    document.documentElement.dataset.theme = settings.resolvedTheme;
  });
  $effect(() => {
    document.documentElement.lang = i18n.lang;
  });

  // Titolo della finestra
  $effect(() => {
    const name = active ? `${active.dirty ? '● ' : ''}${active.name} — ` : '';
    void getCurrentWindow().setTitle(`${name}${t('app.name')}`);
  });

  // Menu nativi: si ricostruiscono al cambio di lingua, tema, vista.
  $effect(() => {
    if (!ready) return;
    const lang = i18n.lang; // dipendenza: la lingua cambia i testi
    void lang;
    void installMenu({
      tr: (k) => t(k),
      mode,
      theme: settings.theme,
      lang: i18n.pref,
      actions: {
        newTab: () => store.newTab(),
        open: () => void store.openWithDialog(),
        save: () => void store.saveActive(false),
        saveAs: () => void store.saveActive(true),
        closeTab: () => void store.closeActive(),
        quit: () => void getCurrentWindow().close(),
        setMode: (m) => store.setMode(m),
        nextTab: () => store.cycle(1),
        prevTab: () => store.cycle(-1),
        setTheme: (v) => void settings.setTheme(v),
        setLang: (v) => void settings.setLang(v),
        about: async () => {
          const version = await getVersion().catch(() => '0.1.0');
          await message(t('about.message', { version }), { title: t('menu.about'), kind: 'info' });
        }
      }
    });
  });

  onMount(() => {
    const unlisten: UnlistenFn[] = [];
    let disposed = false;
    const keep = (p: Promise<UnlistenFn>) =>
      p.then((u) => (disposed ? u() : unlisten.push(u)));

    (async () => {
      await settings.init();
      ready = true;
      keep(listen<string[]>('open-files', (e) => void store.openPaths(e.payload)));
      keep(
        listen<{ path: string; status: string }>('file-changed', (e) =>
          void store.onFileChanged(e.payload.path, e.payload.status)
        )
      );
      keep(
        getCurrentWebview().onDragDropEvent((e) => {
          const p = e.payload;
          if (p.type === 'enter' || p.type === 'over') dropping = true;
          else if (p.type === 'leave') dropping = false;
          else if (p.type === 'drop') {
            dropping = false;
            const files = p.paths.filter((x) => TEXT_EXT.test(x));
            if (files.length) void store.openPaths(files);
          }
        })
      );
      keep(
        getCurrentWindow().onCloseRequested(async (e) => {
          e.preventDefault();
          if (await store.confirmQuit()) await getCurrentWindow().destroy();
        })
      );
      // File passati da riga di comando al primo avvio (o doppio clic): solo anteprima.
      const files = await takeLaunchFiles();
      if (files.length) await store.openPaths(files);
    })();

    return () => {
      disposed = true;
      unlisten.forEach((u) => u());
    };
  });

  // Divisore trascinabile tra testo e anteprima
  function startResize(e: PointerEvent) {
    resizing = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function doResize(e: PointerEvent) {
    if (!resizing || !panes) return;
    const r = panes.getBoundingClientRect();
    const ratio = Math.min(0.8, Math.max(0.2, (e.clientX - r.left) / r.width));
    settings.splitRatio = ratio;
  }
  function endResize(e: PointerEvent) {
    if (!resizing) return;
    resizing = false;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    void settings.setSplit(settings.splitRatio);
  }
</script>

<div class="app">
  <TabBar />
  {#if active}
    <Banner tab={active} />
  {/if}

  <div class="workspace" bind:this={panes}>
    {#if !active}
      <Welcome />
    {/if}

    <div
      class="pane editor"
      class:hidden={!active || mode === 'preview'}
      style:flex={mode === 'split' ? `0 0 ${settings.splitRatio * 100}%` : '1 1 0'}
    >
      <Editor />
    </div>

    {#if active && mode === 'split'}
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <div
        class="divider"
        role="separator"
        aria-orientation="vertical"
        onpointerdown={startResize}
        onpointermove={doResize}
        onpointerup={endResize}
        onpointercancel={endResize}
      ></div>
    {/if}

    {#if active && mode !== 'edit'}
      <div class="pane preview">
        <Preview tab={active} />
      </div>
    {/if}

    {#if dropping}
      <div class="drop">{t('drop.hint')}</div>
    {/if}
  </div>

  {#if store.notice}
    <div class="notice" role="status">{store.notice}</div>
  {/if}
</div>

<svelte:head>
  <title>{active ? basename(active.path ?? active.name) : 'Pagina'}</title>
</svelte:head>

<style>
  .app {
    display: flex;
    flex-direction: column;
    height: 100vh;
  }
  .workspace {
    position: relative;
    flex: 1;
    display: flex;
    min-height: 0;
  }
  .pane {
    min-width: 0;
    min-height: 0;
  }
  .pane.preview {
    flex: 1 1 0;
  }
  .hidden {
    display: none;
  }
  .divider {
    flex: none;
    width: 6px;
    margin: 0 -3px;
    z-index: 2;
    cursor: col-resize;
    background: transparent;
    border-left: 1px solid var(--border);
    touch-action: none;
  }
  .divider:hover {
    border-left-color: var(--accent);
    background: color-mix(in srgb, var(--accent) 25%, transparent);
  }
  .drop {
    position: absolute;
    inset: 12px;
    z-index: 10;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 2px dashed var(--accent);
    border-radius: 12px;
    background: color-mix(in srgb, var(--bg) 85%, transparent);
    font-size: 18px;
    pointer-events: none;
  }
  .notice {
    position: fixed;
    left: 50%;
    bottom: 16px;
    transform: translateX(-50%);
    max-width: 80vw;
    padding: 8px 14px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--err-bg);
    box-shadow: 0 4px 14px rgb(0 0 0 / 25%);
    z-index: 20;
  }
</style>
