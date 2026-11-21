<script lang="ts">
  import { store, type Tab } from '../tabs.svelte';
  import { t } from '../i18n/index.svelte';

  let { tab }: { tab: Tab } = $props();
</script>

{#if tab.conflict === 'modified'}
  <div class="banner" role="alert">
    <span>{t('banner.conflict')}</span>
    <span class="actions">
      <button class="btn" onclick={() => store.keepMine(tab)}>{t('banner.keepMine')}</button>
      <button class="btn" onclick={() => store.reload(tab, true)}>{t('banner.reload')}</button>
    </span>
  </div>
{:else if tab.conflict === 'deleted'}
  <div class="banner" role="alert">
    <span>{t('banner.deleted')}</span>
    <span class="actions">
      <button class="btn" onclick={() => store.save(tab, { force: true })}>{t('banner.saveAgain')}</button>
      <button class="btn" onclick={() => store.dismissDeleted(tab)}>{t('banner.dismiss')}</button>
    </span>
  </div>
{/if}

<style>
  .banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 8px 12px;
    background: var(--warn-bg);
    border-bottom: 1px solid var(--warn-border);
  }
  .actions {
    display: flex;
    gap: 8px;
    flex: none;
  }
</style>
