<script lang="ts">
  import { onDestroy, onMount, untrack } from 'svelte';
  import { convertFileSrc } from '@tauri-apps/api/core';
  import { openUrl } from '@tauri-apps/plugin-opener';
  import { renderMarkdown } from '../markdown/render';
  import { highlightPending } from '../markdown/highlight';
  import { store, type Tab } from '../tabs.svelte';
  import { BlockController } from '../editor/blockEditor';
  import { settings } from '../settings.svelte';
  import { i18n } from '../i18n/index.svelte';

  let { tab }: { tab: Tab } = $props();

  let scroller: HTMLDivElement;
  let container: HTMLDivElement;
  let renderedId: string | null = null;
  let token = 0;
  let renderedRev = -1;
  let renderedBreaks: boolean | null = null;

  const ctrl = new BlockController({
    get container() {
      return container;
    },
    getTab: () => tab,
    render: () => render(false, true),
    isFresh: () =>
      renderedRev === tab.rev && renderedId === tab.id && renderedBreaks === settings.singleBreaks,
    closed: () => render(false, true)
  });

  onMount(() => {
    store.blockHooks = {
      change: (t, changes) => ctrl.onDocChange(t, changes),
      reload: (t) => ctrl.onReload(t),
      close: (t) => {
        if (ctrl.isOpen && (!t || ctrl.tab === t)) ctrl.closeAll({ removeEmpty: true });
      }
    };
  });
  onDestroy(() => {
    store.blockHooks = null;
    ctrl.closeAll({ silent: true, removeEmpty: ctrl.tab ? store.tabs.includes(ctrl.tab) : false });
  });

  // Tema e lingua del blocco aperto.
  $effect(() => {
    const dark = settings.resolvedTheme === 'dark';
    const lang = i18n.lang;
    untrack(() => ctrl.reconfigure(dark, lang));
  });

  function render(restoreSaved: boolean, force = false) {
    // un blocco aperto non si distrugge: l'anteprima si ridisegna alla sua chiusura
    if (ctrl.isOpen && !force) return;
    renderedRev = tab.rev;
    renderedBreaks = settings.singleBreaks;
    const html = renderMarkdown(tab.cm.doc.toString(), {
      baseDir: tab.dir,
      convertSrc: convertFileSrc,
      breaks: settings.singleBreaks
    });
    const keep = restoreSaved ? tab.previewScroll : scroller.scrollTop;
    container.innerHTML = html;
    scroller.scrollTop = keep;
    const mine = ++token;
    void highlightPending(container, () => mine !== token);
  }

  // Aggiornamento con debounce di ~150 ms; subito quando cambia scheda.
  $effect(() => {
    const id = tab.id;
    void tab.rev;
    void tab.path;
    void settings.singleBreaks;
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (renderedId !== id) {
      renderedId = id;
      untrack(() => {
        // cambio scheda: il contenuto del blocco è già nel documento della scheda che si lascia
        const prev = ctrl.tab;
        ctrl.closeAll({ silent: true, removeEmpty: prev ? store.tabs.includes(prev) : false });
        render(true);
      });
    } else {
      timer = setTimeout(() => untrack(() => render(false)), 150);
    }
    return () => clearTimeout(timer);
  });

  function scrollToAnchor(raw: string) {
    let id = raw;
    try {
      id = decodeURIComponent(raw);
    } catch {
      /* resta com'è */
    }
    const el = Array.from(container.querySelectorAll<HTMLElement>('[id]')).find(
      (e) => e.id === id || e.id === raw
    );
    el?.scrollIntoView({ block: 'start' });
  }

  /** L'elemento di primo livello dell'anteprima che contiene `el`. */
  function topLevel(el: HTMLElement): HTMLElement | null {
    let cur: HTMLElement | null = el;
    while (cur && cur.parentElement !== container) cur = cur.parentElement;
    return cur && cur.hasAttribute('data-source-start') ? cur : null;
  }

  function onDblClick(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (ctrl.isOpen || !container.contains(target) || target.closest('input')) return;
    const top = topLevel(target);
    if (!top) return;
    const point = { x: e.clientX, y: e.clientY };
    const cell = target.closest<HTMLElement>('td, th');
    if (cell && top.tagName === 'TABLE' && top.contains(cell)) ctrl.openCell(top, cell, point);
    else ctrl.openBlock(top, point);
  }

  function onClick(e: MouseEvent) {
    const target = e.target as HTMLElement;
    if (target.closest('.block-editor, .table-bar, .cell-editing')) return;
    const box = target.closest<HTMLInputElement>('input.task-list-item-checkbox');
    if (box) {
      const line = Number(box.dataset.taskLine);
      // se la riga non è più una voce di attività, la casella torna com'era
      if (Number.isNaN(line) || !store.toggleTask(tab, line)) box.checked = !box.checked;
      return;
    }
    const a = target.closest('a');
    if (!a) return;
    e.preventDefault();
    const href = a.getAttribute('href') ?? '';
    if (href.startsWith('#')) {
      scrollToAnchor(href.slice(1));
    } else if (/^(https?:|mailto:)/i.test(href)) {
      openUrl(href).catch((err) => console.warn('apertura link non riuscita', err));
    }
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div
  class="scroller"
  bind:this={scroller}
  onscroll={() => (tab.previewScroll = scroller.scrollTop)}
  onclick={onClick}
  ondblclick={onDblClick}
>
  <div class="markdown-body" bind:this={container}></div>
</div>

<style>
  .scroller {
    height: 100%;
    overflow: auto;
    background: var(--preview-bg);
  }
</style>
