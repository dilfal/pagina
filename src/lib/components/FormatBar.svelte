<script lang="ts">
  import { store } from '../tabs.svelte';
  import { t, type Key } from '../i18n/index.svelte';
  import * as f from '../editor/format';
  import { insertImageFromDialog } from '../editor/images';

  type Item =
    | { sep: true }
    | { id: string; key: Key; keys?: string; text?: string; svg?: string; style?: string; run: (v: any) => unknown };

  const svg = (body: string) =>
    `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

  const items: Item[] = [
    { id: 'bold', key: 'format.bold', keys: 'Ctrl+B', text: 'B', style: 'font-weight:700', run: f.bold },
    { id: 'italic', key: 'format.italic', keys: 'Ctrl+I', text: 'I', style: 'font-style:italic', run: f.italic },
    { id: 'strike', key: 'format.strike', keys: 'Ctrl+Maiusc+X', text: 'S', style: 'text-decoration:line-through', run: f.strikethrough },
    { id: 'code', key: 'format.code', keys: 'Ctrl+`', text: '</>', style: 'font-family:var(--mono);font-size:12px', run: f.inlineCode },
    { id: 'link', key: 'format.link', keys: 'Ctrl+K', svg: svg('<path d="M6.8 9.2a2.6 2.6 0 0 0 3.7 0l2-2a2.6 2.6 0 0 0-3.7-3.7l-.7.7"/><path d="M9.2 6.8a2.6 2.6 0 0 0-3.7 0l-2 2a2.6 2.6 0 0 0 3.7 3.7l.7-.7"/>'), run: f.insertLink },
    { sep: true },
    { id: 'h1', key: 'format.h1', text: 'H1', style: 'font-weight:700', run: f.heading1 },
    { id: 'h2', key: 'format.h2', text: 'H2', style: 'font-weight:700', run: f.heading2 },
    { id: 'h3', key: 'format.h3', text: 'H3', style: 'font-weight:700', run: f.heading3 },
    { id: 'normal', key: 'format.normal', text: 'T', run: f.normalText },
    { sep: true },
    { id: 'bullet', key: 'format.bullet', svg: svg('<circle cx="3" cy="4" r="0.9" fill="currentColor"/><circle cx="3" cy="8" r="0.9" fill="currentColor"/><circle cx="3" cy="12" r="0.9" fill="currentColor"/><path d="M6.5 4h7M6.5 8h7M6.5 12h7"/>'), run: f.bulletList },
    { id: 'numbered', key: 'format.numbered', svg: svg('<path d="M2 3.2h1.2V6M2 9.5h2.2L2 12h2.4M6.5 4h7M6.5 8h7M6.5 12h7"/>'), run: f.numberedList },
    { id: 'task', key: 'format.task', svg: svg('<rect x="2" y="2.5" width="4.5" height="4.5" rx="1"/><path d="M3.2 4.8l1 1 1.6-1.8M9 5h5M9 11h5"/><rect x="2" y="9" width="4.5" height="4.5" rx="1"/>'), run: f.taskList },
    { id: 'quote', key: 'format.quote', svg: svg('<path d="M3 2.5v11"/><path d="M6.5 5h7M6.5 8h7M6.5 11h5"/>'), run: f.quote },
    { id: 'codeblock', key: 'format.codeBlock', svg: svg('<path d="M5.5 4.5L2 8l3.5 3.5M10.5 4.5L14 8l-3.5 3.5"/>'), run: f.codeBlock },
    { id: 'table', key: 'format.table', svg: svg('<rect x="2" y="3" width="12" height="10" rx="1"/><path d="M2 6.5h12M2 10h12M6 3v10M10 3v10"/>'), run: f.insertTable },
    { id: 'hr', key: 'format.hr', svg: svg('<path d="M2 8h12"/>'), run: f.horizontalRule },
    { sep: true },
    { id: 'image', key: 'format.image', svg: svg('<rect x="2" y="2.5" width="12" height="11" rx="1.2"/><circle cx="5.7" cy="6" r="1.2"/><path d="M2.5 12l3.8-3.6 2.7 2.4 2-1.8 2.5 2.4"/>'), run: (v: any) => insertImageFromDialog(v) }
  ];

  const enabled = $derived(!!store.active && (store.active.mode !== 'preview' || store.active.blockOpen));

  function exec(run: (v: any) => unknown) {
    const view = store.formatTarget();
    if (!view) return;
    run(view);
    view.focus();
  }
</script>

<!-- data-keep-block: un clic qui non chiude il blocco aperto nell'anteprima -->
<div class="format-bar" role="toolbar" aria-label={t('format.bar')} data-keep-block>
  {#each items as it}
    {#if 'sep' in it}
      <span class="sep" aria-hidden="true"></span>
    {:else}
      <button
        type="button"
        class="icon-btn"
        title={t(it.key) + (it.keys ? ` (${it.keys})` : '')}
        aria-label={t(it.key)}
        disabled={!enabled}
        onmousedown={(e) => e.preventDefault()}
        onclick={() => exec(it.run)}
      >
        {#if it.svg}{@html it.svg}{:else}<span style={it.style}>{it.text}</span>{/if}
      </button>
    {/if}
  {/each}
</div>

<style>
  .format-bar {
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 3px 8px;
    overflow-x: auto;
    background: var(--panel-bg);
    border-bottom: 1px solid var(--border);
    flex: none;
  }
  .format-bar :global(.icon-btn) {
    flex: none;
  }
  .format-bar :global(.icon-btn:disabled) {
    opacity: 0.4;
    cursor: default;
  }
  .format-bar :global(.icon-btn:disabled:hover) {
    background: transparent;
  }
  .sep {
    flex: none;
    width: 1px;
    height: 18px;
    margin: 0 5px;
    background: var(--border);
  }
  /* Finestra stretta: pulsanti e separatori piu' compatti, cosi' la barra entra senza barra di scorrimento */
  @media (max-width: 760px) {
    .format-bar {
      gap: 0;
      padding: 3px 4px;
    }
    .format-bar :global(.icon-btn) {
      min-width: 24px;
      padding: 0 4px;
    }
    .sep {
      margin: 0 3px;
    }
  }
</style>
