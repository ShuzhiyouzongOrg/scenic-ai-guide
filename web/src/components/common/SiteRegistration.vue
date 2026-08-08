<template>
  <footer class="site-registration" :aria-label="$t('app.siteRegistrationAria')">
    <span>数智游踪</span>
    <span aria-hidden="true">·</span>
    <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer">
      闽ICP备2025107095号-3
    </a>
  </footer>
</template>

<style scoped lang="scss">
  .site-registration {
    position: fixed;
    bottom: max(4px, env(safe-area-inset-bottom));
    left: 50%;
    z-index: 3200;
    display: flex;
    gap: 6px;
    align-items: center;
    min-height: 24px;
    padding: 3px 10px;
    font-size: 11px;
    line-height: 1;
    color: rgb(42 57 48 / 72%);
    pointer-events: none;
    background: rgb(255 255 255 / 78%);
    border: 1px solid rgb(47 91 65 / 12%);
    border-radius: 999px;
    box-shadow: 0 2px 8px rgb(26 47 35 / 8%);
    backdrop-filter: blur(6px);
    transform: translateX(-50%);

    a {
      color: inherit;
      pointer-events: auto;
      transition: color 160ms ease-out;
    }

    a:hover {
      color: #285d3f;
    }
  }

  @media (width <= 480px) {
    .site-registration {
      gap: 4px;
      max-width: calc(100vw - 16px);
      padding-inline: 8px;
      overflow: hidden;
      font-size: 10px;
      white-space: nowrap;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .site-registration a {
      transition: none;
    }
  }
</style>
