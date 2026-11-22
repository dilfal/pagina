<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { EditorView } from '@codemirror/view';
  import {
    createState,
    phrasesComp,
    phrasesExtension,
    setImagePasteHandler,
    setUpdateHandler,
    themeComp,
    themeExtension
  } from '../editor/extensions';
  import { store } from '../tabs.svelte';
  import { settings } from '../settings.svelte';
  import { i18n } from '../i18n/index.svelte';
  import { handleImagePaste } from '../editor/images';

  let host: HTMLDivElement;
  let view: EditorView | undefined;
  let shownId: string | null = null;

  onMount(() => {
    setUpdateHandler((u) => store.handleUpdate(u));
    setImagePasteHandler((v, files) => void handleImagePaste(v, files));
    view = new EditorView({
      parent: host,
      state: createState('', settings.resolvedTheme === 'dark', i18n.lang)
    });
    store.view = view;
    return () => {
      setImagePasteHandler(null);
      view?.destroy();
      store.view = null;
    };
  });

  // Cambio di scheda: ogni scheda ha il suo stato (testo, cursore, cronologia annulla).
  $effect(() => {
    const id = store.activeId;
    untrack(() => {
      if (!view) return;
      const prev = shownId ? store.tabs.find((x) => x.id === shownId) : null;
      if (prev) {
        prev.cm = view.state;
        prev.scrollTop = view.scrollDOM.scrollTop;
      }
      shownId = id;
      store.viewTabId = id;
      const tab = store.tabs.find((x) => x.id === id);
      if (!tab) return;
      view.setState(tab.cm);
      view.dispatch({
        effects: [
          themeComp.reconfigure(themeExtension(settings.resolvedTheme === 'dark')),
          phrasesComp.reconfigure(phrasesExtension(i18n.lang))
        ]
      });
      view.scrollDOM.scrollTop = tab.scrollTop;
      requestAnimationFrame(() => {
        if (view && shownId === id) view.scrollDOM.scrollTop = tab.scrollTop;
      });
      if (tab.mode !== 'preview') view.focus();
    });
  });

  // Tema e lingua dell'editor (i ricami nei menu di ricerca).
  $effect(() => {
    const dark = settings.resolvedTheme === 'dark';
    const lang = i18n.lang;
    untrack(() => {
      view?.dispatch({
        effects: [
          themeComp.reconfigure(themeExtension(dark)),
          phrasesComp.reconfigure(phrasesExtension(lang))
        ]
      });
    });
  });

  // Quando la vista torna visibile, ricalcola le misure e riprende il focus.
  $effect(() => {
    const mode = store.active?.mode;
    if (mode && mode !== 'preview') {
      untrack(() => {
        view?.requestMeasure();
        view?.focus();
      });
    }
  });
</script>

<div class="editor-host" bind:this={host}></div>

<style>
  .editor-host {
    height: 100%;
    min-width: 0;
  }
  .editor-host :global(.cm-editor) {
    height: 100%;
  }
</style>
