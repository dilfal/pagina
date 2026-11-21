<script lang="ts">
  import { store, type ViewMode } from '../tabs.svelte';
  import { t } from '../i18n/index.svelte';

  const modes: { mode: ViewMode; label: 'menu.viewEdit' | 'menu.viewSplit' | 'menu.viewPreview'; glyph: string; n: number }[] = [
    { mode: 'edit', label: 'menu.viewEdit', glyph: '✎', n: 1 },
    { mode: 'split', label: 'menu.viewSplit', glyph: '◫', n: 2 },
    { mode: 'preview', label: 'menu.viewPreview', glyph: '◉', n: 3 }
  ];

  function onAux(e: MouseEvent, id: string) {
    if (e.button === 1) {
      e.preventDefault();
      const tab = store.tabs.find((x) => x.id === id);
      if (tab) void store.closeTab(tab);
    }
  }
</script>

<div class="bar" role="tablist">
  <div class="tabs">
    {#each store.tabs as tab (tab.id)}
      <div
        class="tab"
        class:active={tab.id === store.activeId}
        role="tab"
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
          onclick={() => store.setMode(m.mode)}>{m.glyph}</button
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
    min-width: 0;
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
    color: var(--accent);
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
