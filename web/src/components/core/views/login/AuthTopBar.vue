<!-- 授权页右上角组件 -->
<template>
  <div
    class="absolute w-full flex-cb top-4.5 z-10 flex-c !justify-end max-[1180px]:!justify-between"
  >
    <div class="flex-cc !hidden max-[1180px]:!flex ml-2 max-sm:ml-6">
      <ArtLogo class="icon" size="46" />
      <h1 class="text-xl ont-mediumf ml-2">{{ AppConfig.systemInfo.name }}</h1>
    </div>

    <div class="flex-cc gap-1.5 mr-2 max-sm:mr-5">
      <div
        class="color-picker-expandable relative flex-c max-sm:!hidden"
        :class="{ 'is-open': colorPickerOpen }"
      >
        <div
          id="auth-theme-colors"
          class="color-dots absolute right-0 rounded-full flex-c gap-2 rounded-5 px-2.5 py-2 pr-9 pl-2.5 opacity-0"
          role="radiogroup"
          :aria-label="$t('setting.color.title')"
        >
          <div
            v-for="(color, index) in mainColors"
            :key="color"
            class="color-dot relative size-5 c-p flex-cc rounded-full opacity-0"
            :class="{ active: color === systemThemeColor }"
            :style="{ background: color, '--index': index }"
            role="radio"
            tabindex="0"
            :aria-label="$t('setting.color.title') + ' ' + (index + 1)"
            :aria-checked="color === systemThemeColor"
            @click="changeThemeColor(color)"
            @keydown.enter.prevent="changeThemeColor(color)"
            @keydown.space.prevent="changeThemeColor(color)"
          >
            <AuthIcon v-if="color === systemThemeColor" icon="ri:check-fill" class="text-white" />
          </div>
        </div>
        <div
          class="btn palette-btn relative z-[2] h-8 w-8 c-p flex-cc tad-300"
          role="button"
          tabindex="0"
          :aria-label="$t('setting.color.title')"
          aria-controls="auth-theme-colors"
          :aria-expanded="colorPickerOpen"
          @keydown.enter.prevent="colorPickerOpen = !colorPickerOpen"
          @keydown.space.prevent="colorPickerOpen = !colorPickerOpen"
          @keydown.esc="colorPickerOpen = false"
        >
          <AuthIcon
            icon="ri:palette-line"
            class="text-xl text-g-800 transition-colors duration-300"
          />
        </div>
      </div>
      <ElDropdown
        v-if="shouldShowLanguage"
        @command="changeLanguage"
        popper-class="langDropDownStyle"
      >
        <div
          class="btn language-btn h-8 w-8 c-p flex-cc tad-300"
          role="button"
          tabindex="0"
          :aria-label="$t('setting.basics.list.language')"
        >
          <AuthIcon
            icon="ri:translate-2"
            class="text-[19px] text-g-800 transition-colors duration-300"
          />
        </div>
        <template #dropdown>
          <ElDropdownMenu>
            <div v-for="lang in languageOptions" :key="lang.value" class="lang-btn-item">
              <ElDropdownItem
                :command="lang.value"
                :class="{ 'is-selected': locale === lang.value }"
              >
                <span class="menu-txt">{{ lang.label }}</span>
                <AuthIcon icon="ri:check-fill" class="text-base" v-if="locale === lang.value" />
              </ElDropdownItem>
            </div>
          </ElDropdownMenu>
        </template>
      </ElDropdown>
      <div
        v-if="shouldShowThemeToggle"
        class="btn theme-btn h-8 w-8 c-p flex-cc tad-300"
        role="button"
        tabindex="0"
        :aria-label="$t('topBar.guide.theme')"
        @click="themeAnimation"
        @keydown.enter.prevent="themeAnimation"
        @keydown.space.prevent="themeAnimation"
      >
        <AuthIcon
          :icon="isDark ? 'ri:sun-fill' : 'ri:moon-line'"
          class="text-xl text-g-800 transition-colors duration-300"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { useI18n } from 'vue-i18n'
  import { useSettingStore } from '@/store/modules/setting'
  import { useUserStore } from '@/store/modules/user'
  import { useHeaderBar } from '@/hooks/core/useHeaderBar'
  import { themeAnimation } from '@/utils/ui/animation'
  import { languageOptions } from '@/locales'
  import { LanguageEnum } from '@/enums/appEnum'
  import AppConfig from '@/config'

  defineOptions({ name: 'AuthTopBar' })

  const settingStore = useSettingStore()
  const userStore = useUserStore()
  const { isDark, systemThemeColor } = storeToRefs(settingStore)
  const { shouldShowThemeToggle, shouldShowLanguage } = useHeaderBar()
  const { locale } = useI18n()

  const mainColors = AppConfig.systemMainColor
  const color = systemThemeColor // css v-bind 使用
  const colorPickerOpen = ref(false)

  const changeLanguage = (lang: LanguageEnum) => {
    if (locale.value === lang) return
    locale.value = lang
    userStore.setLanguage(lang)
    document.documentElement.lang = lang
  }

  const changeThemeColor = (color: string) => {
    if (systemThemeColor.value === color) return
    settingStore.setElementTheme(color)
    settingStore.reload()
    colorPickerOpen.value = false
  }
</script>

<style scoped>
  .color-dots {
    pointer-events: none;
    backdrop-filter: blur(10px);
    box-shadow: 0 2px 12px var(--art-gray-300);
    transition:
      opacity 0.3s ease,
      transform 0.3s ease;
    transform: translateX(10px);
  }

  .color-dot {
    box-shadow: 0 2px 4px rgb(0 0 0 / 15%);
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    transition-delay: calc(var(--index) * 0.05s);
    transform: translateX(20px) scale(0.8);
  }

  .color-dot:hover {
    box-shadow: 0 4px 8px rgb(0 0 0 / 20%);
    transform: translateX(0) scale(1.1);
  }

  .color-picker-expandable:hover .color-dots,
  .color-picker-expandable.is-open .color-dots {
    pointer-events: auto;
    opacity: 1;
    transform: translateX(0);
  }

  .color-picker-expandable:hover .color-dot,
  .color-picker-expandable.is-open .color-dot {
    opacity: 1;
    transform: translateX(0) scale(1);
  }

  .dark .color-dots {
    background-color: var(--art-gray-200);
    box-shadow: none;
  }

  .color-picker-expandable:hover .palette-btn :deep(.auth-icon) {
    color: v-bind(color);
  }
</style>
