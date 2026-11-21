<script lang="ts">
  import { untrack } from 'svelte';
  import { convertFileSrc } from '@tauri-apps/api/core';
  import { openUrl } from '@tauri-apps/plugin-opener';
  import { renderMarkdown } from '../markdown/render';
  import { highlightPending } from '../markdown/highlight';
  import { store, type Tab } from '../tabs.svelte';

  let { tab }: { tab: Tab } = $props();

  let scroller: HTMLDivElement;
  let container: HTMLDivElement;
  let renderedId: string | null = null;
  let token = 0;

  function render(restoreSaved: boolean) {
    const html = renderMarkdown(tab.cm.doc.toString(), {
      baseDir: tab.dir,
      convertSrc: convertFileSrc
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
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (renderedId !== id) {
      renderedId = id;
      untrack(() => render(true));
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

  function onClick(e: MouseEvent) {
    const target = e.target as HTMLElement;
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
