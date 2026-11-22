<script lang="ts">
  import { onDestroy, tick } from 'svelte';
  import { dialogState, resolveDialog, cancelDialog, cancelAllDialogs } from '../dialog.svelte';

  const opts = $derived(dialogState.current?.opts ?? null);

  let box: HTMLDivElement | undefined = $state();
  let saved: HTMLElement | null = null;

  onDestroy(() => cancelAllDialogs());

  const titleId = 'dlg-title';
  const msgId = 'dlg-msg';

  function buttons(): HTMLButtonElement[] {
    return box ? [...box.querySelectorAll<HTMLButtonElement>('button')] : [];
  }

  // All'apertura il focus va sul pulsante non distruttivo (Annulla); alla chiusura torna dov'era.
  $effect(() => {
    const o = opts;
    if (o) {
      if (!saved) saved = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      void tick().then(() => {
        const cancel = o.buttons.findIndex((b) => b.id === o.cancelId && !b.danger);
        const def = cancel >= 0 ? cancel : Math.max(0, o.buttons.findIndex((b) => !b.danger));
        buttons()[def]?.focus();
      });
    } else if (saved) {
      const el = saved;
      saved = null;
      if (el.isConnected) el.focus();
    }
  });

  // Finché il dialogo è aperto nessun tasto arriva al resto dell'app (editor, scorciatoie).
  function onKeydown(e: KeyboardEvent) {
    if (!opts) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      cancelDialog();
      return;
    }
    if (e.key === 'Tab') {
      e.preventDefault();
      e.stopPropagation();
      const btns = buttons();
      if (!btns.length) return;
      const i = btns.indexOf(document.activeElement as HTMLButtonElement);
      const next = e.shiftKey ? (i <= 0 ? btns.length - 1 : i - 1) : i < 0 || i === btns.length - 1 ? 0 : i + 1;
      btns[next].focus();
      return;
    }
    if (!box?.contains(e.target as Node)) {
      // Il focus è sfuggito: lo si riporta nel dialogo e il tasto si scarta.
      e.preventDefault();
      e.stopPropagation();
      buttons()[0]?.focus();
      return;
    }
    // Enter attiva il pulsante col focus (comportamento nativo); gli altri tasti non escono dal dialogo.
    e.stopPropagation();
  }

  function onFocusin(e: FocusEvent) {
    if (opts && box && !box.contains(e.target as Node)) buttons()[0]?.focus();
  }
</script>

<svelte:window onkeydowncapture={onKeydown} onfocusin={onFocusin} />

{#if opts}
  <!-- Il clic sullo sfondo non chiude: si risponde solo coi pulsanti o con Esc. -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="backdrop" onmousedown={(e) => e.preventDefault()}>
    <div
      class="dialog"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={opts.title ? titleId : undefined}
      aria-describedby={msgId}
      bind:this={box}
    >
      <div class="icon {opts.kind ?? 'info'}" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          {#if opts.kind === 'warning'}
            <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
            <path d="M12 9v4M12 17h.01" />
          {:else if opts.kind === 'error'}
            <circle cx="12" cy="12" r="10" />
            <path d="m15 9-6 6M9 9l6 6" />
          {:else}
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4M12 8h.01" />
          {/if}
        </svg>
      </div>
      <div class="body">
        {#if opts.title}<h2 id={titleId}>{opts.title}</h2>{/if}
        <p id={msgId}>{opts.message}</p>
      </div>
      <div class="actions">
        {#each opts.buttons as b (b.id)}
          <button
            type="button"
            class="btn"
            class:primary={b.primary}
            class:danger={b.danger}
            onclick={() => resolveDialog(b.id)}>{b.label}</button
          >
        {/each}
      </div>
    </div>
  </div>
{/if}

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
    background: color-mix(in srgb, var(--bg) 55%, transparent);
    backdrop-filter: blur(2px);
  }
  .dialog {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 14px 16px;
    width: min(440px, 100%);
    padding: 20px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--panel-bg);
    color: var(--fg);
    box-shadow: 0 12px 36px rgb(0 0 0 / 35%);
  }
  .icon {
    display: flex;
    align-items: flex-start;
    padding-top: 2px;
  }
  .icon.warning {
    color: var(--warn-border);
  }
  .icon.info {
    color: var(--accent);
  }
  .icon.error {
    color: var(--danger);
  }
  h2 {
    margin: 0 0 6px;
    font-size: 15px;
    font-weight: 600;
  }
  p {
    margin: 0;
    line-height: 1.5;
    white-space: pre-line;
    overflow-wrap: anywhere;
  }
  .actions {
    grid-column: 1 / -1;
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 8px;
  }
  .btn:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .btn.danger {
    background: var(--danger);
    border-color: var(--danger);
    color: var(--danger-fg);
  }
  .btn.danger:hover {
    background: color-mix(in srgb, var(--danger) 85%, black);
  }
</style>
