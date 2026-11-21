<script lang="ts">
  import { store } from '../tabs.svelte';
  import { t } from '../i18n/index.svelte';
</script>

<div class="welcome">
  <h1>{t('welcome.title')}</h1>
  <p>{t('welcome.subtitle')}</p>
  <div class="row">
    <button class="btn primary" onclick={() => store.newTab()}>{t('welcome.new')}</button>
    <button class="btn" onclick={() => store.openWithDialog()}>{t('welcome.open')}</button>
  </div>
</div>

<style>
  .welcome {
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 6px;
    color: var(--muted);
  }
  h1 {
    margin: 0;
    font-size: 40px;
    font-weight: 600;
    color: var(--fg);
  }
  p {
    margin: 0 0 14px;
  }
  .row {
    display: flex;
    gap: 10px;
  }
</style>
