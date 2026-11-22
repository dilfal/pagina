<script lang="ts">
  import { store, type ViewMode } from '../tabs.svelte';
  import { t } from '../i18n/index.svelte';

  // Stesse regole grafiche delle icone della barra di formattazione (16 px, tratto 1.4)
  const svg = (body: string) =>
    `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

  const modes: { mode: ViewMode; label: 'menu.viewEdit' | 'menu.viewSplit' | 'menu.viewPreview'; icon: string; n: number }[] = [
    { mode: 'edit', label: 'menu.viewEdit', icon: svg('<path d="M10.5 2.5l3 3L5.5 13.5l-3.5.5.5-3.5z"/><path d="M9 4l3 3"/>'), n: 1 },
    { mode: 'split', label: 'menu.viewSplit', icon: svg('<rect x="2" y="3" width="12" height="10" rx="1.2"/><path d="M8 3v10"/>'), n: 2 },
    { mode: 'preview', label: 'menu.viewPreview', icon: svg('<path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z"/><circle cx="8" cy="8" r="2"/>'), n: 3 }
  ];

  let tabsEl: HTMLDivElement | undefined = $state();

  // Senza barra di scorrimento le schede si fanno scorrere con la rotella...
  function onWheel(e: WheelEvent) {
    if (!tabsEl || e.deltaX !== 0 || tabsEl.scrollWidth <= tabsEl.clientWidth) return;
    tabsEl.scrollLeft += e.deltaY;
    e.preventDefault();
  }
  // ...e la scheda attiva resta sempre visibile
  $effect(() => {
    const id = store.activeId;
    if (!tabsEl || !id) return;
    const el = Array.from(tabsEl.querySelectorAll<HTMLElement>('.tab')).find((x) => x.dataset.id === id);
    el?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });

  function onAux(e: MouseEvent, id: string) {
    if (e.button === 1) {
      e.preventDefault();
      const tab = store.tabs.find((x) => x.id === id);
      if (tab) void store.closeTab(tab);
    }
  }
</script>

<div class="bar" role="tablist">
  <div class="tabs" bind:this={tabsEl} onwheel={onWheel}>
    {#each store.tabs as tab (tab.id)}
      <div
        class="tab"
        class:active={tab.id === store.activeId}
        role="tab"
        data-id={tab.id}
        tabindex="0"
        aria-selected={tab.id === store.activeId}
        onclick={() => store.activate(tab.id)}
        onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && store.activate(tab.id)}
        onauxclick={(e) => onAux(e, tab.id)}
        title={tab.path ?? tab.name}
      >
        <span class="name">{tab.name}</span>
        {#if tab.dirty}
          <span class="dot" title={t('tabs.unsaved')} aria-label={t('tabs.unsaved')}>●</span>
        {/if}
        <button
          class="close"
          title={t('tabs.close')}
          aria-label={t('tabs.close')}
          onclick={(e) => {
            e.stopPropagation();
            void store.closeTab(tab);
          }}>×</button
        >
      </div>
    {/each}
    <button class="icon-btn add" title={t('tabs.new')} aria-label={t('tabs.new')} onclick={() => store.newTab()}>+</button>
  </div>
  {#if store.active}
    <div class="modes">
      {#each modes as m (m.mode)}
        <button
          class="icon-btn"
          class:on={store.active.mode === m.mode}
          title={`${t(m.label)} (Ctrl+${m.n})`}
          aria-label={t(m.label)}
          onclick={() => store.setMode(m.mode)}>{@html m.icon}</button
        >
      {/each}
    </div>
  {/if}
</div>

<style>
  .bar {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 8px;
    background: var(--tab-bg);
    border-bottom: 1px solid var(--border);
    padding: 6px 8px 0;
    min-height: 40px;
  }
  .tabs {
    display: flex;
    align-items: flex-end;
    gap: 2px;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: none;
    min-width: 0;
    /* la scheda attiva copre di 1px il bordo della barra: il margine negativo sta nel padding, dentro l'area di scorrimento */
    margin-bottom: -1px;
    padding-bottom: 1px;
  }
  .tab {
    display: flex;
    align-items: center;
    gap: 6px;
    max-width: 220px;
    padding: 6px 6px 6px 12px;
    border: 1px solid transparent;
    border-bottom: none;
    border-radius: 8px 8px 0 0;
    color: var(--muted);
    cursor: pointer;
    user-select: none;
    white-space: nowrap;
  }
  .tab:hover {
    background: var(--btn-hover);
    color: var(--fg);
  }
  .tab.active {
    background: var(--tab-active-bg);
    border-color: var(--border);
    color: var(--fg);
    margin-bottom: -1px;
    padding-bottom: 7px;
  }
  .name {
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .dot {
    color: var(--dirty);
    font-size: 11px;
  }
  .close {
    width: 20px;
    height: 20px;
    line-height: 18px;
    padding: 0;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: var(--muted);
    cursor: pointer;
    font-size: 16px;
  }
  .close:hover {
    background: var(--btn-hover);
    color: var(--fg);
  }
  .add {
    margin-bottom: 4px;
    font-size: 18px;
  }
  .modes {
    display: flex;
    gap: 2px;
    margin-bottom: 4px;
    flex: none;
  }
</style>
