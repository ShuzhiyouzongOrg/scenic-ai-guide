/**
 * @fileoverview PageSpeed 优化契约测试。
 * @description 验证首屏资源、懒加载、无障碍语义和性能遥测遵守 PageSpeed 优化契约。
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { authIconData } from '../../src/assets/svg/auth-iconify.generated'

const webRoot = resolve(import.meta.dirname, '..', '..')

test('desktop login background is the only globally preloaded application image', () => {
  const sourceHtml = readFileSync(resolve(webRoot, 'index.html'), 'utf8')
  const imagePreloads = [...sourceHtml.matchAll(/<link\b[^>]*rel="preload"[^>]*as="image"[^>]*>/giu)]
    .map((match) => match[0])

  assert.equal(imagePreloads.length, 1)
  assert.match(imagePreloads[0], /href="%BASE_URL%images\/login-bg\.optimized\.webp"/u)
  assert.match(imagePreloads[0], /type="image\/webp"/u)
  assert.match(imagePreloads[0], /media="\(min-width: 1181px\)"/u)
  assert.match(imagePreloads[0], /fetchpriority="high"/u)
  assert.doesNotMatch(sourceHtml, /rel="preload"[^>]+loading-lotus\.webp/giu)
})

test('production HTML resolves the preload against the Vite base URL', () => {
  const builtHtml = readFileSync(resolve(webRoot, 'dist', 'index.html'), 'utf8')
  assert.match(
    builtHtml,
    /<link\b[^>]*rel="preload"[^>]*href="\/images\/login-bg\.optimized\.webp"[^>]*>/u
  )
})

test('login background is only assigned above the existing desktop breakpoint', () => {
  const loginLeftView = readFileSync(
    resolve(webRoot, 'src/components/core/views/login/LoginLeftView.vue'),
    'utf8'
  )

  assert.match(loginLeftView, /matchMedia\('\(min-width: 1181px\)'\)/u)
  assert.match(loginLeftView, /shouldLoadBackground\.value[\s\S]+login-bg\.optimized\.webp/u)
})

test('authorization icons are a generated local whitelist', () => {
  assert.deepEqual(Object.keys(authIconData).sort(), [
    'ri:check-fill',
    'ri:moon-line',
    'ri:palette-line',
    'ri:sun-fill',
    'ri:translate-2',
    'solar:double-alt-arrow-right-linear'
  ])
  assert.ok(Object.values(authIconData).every((icon) => icon.body.length > 0))

  const authTopBar = readFileSync(
    resolve(webRoot, 'src/components/core/views/login/AuthTopBar.vue'),
    'utf8'
  )
  const dragVerify = readFileSync(
    resolve(webRoot, 'src/components/core/forms/art-drag-verify/index.vue'),
    'utf8'
  )
  assert.doesNotMatch(`${authTopBar}\n${dragVerify}`, /<ArtSvgIcon\b/u)
})

test('unused syntax highlighting runtime is excluded from global startup', () => {
  const directives = readFileSync(resolve(webRoot, 'src/directives/index.ts'), 'utf8')
  const applicationSources = readFileSync(resolve(webRoot, 'src/main.ts'), 'utf8')

  assert.doesNotMatch(directives, /setupHighlightDirective|business\/highlight/u)
  assert.doesNotMatch(applicationSources, /highlight\.js/u)
})

test('upgrade history and unused setting state stay outside synchronous startup', () => {
  const application = readFileSync(resolve(webRoot, 'src/App.vue'), 'utf8')
  const userStore = readFileSync(resolve(webRoot, 'src/store/modules/user.ts'), 'utf8')

  assert.doesNotMatch(application, /import\s+\{\s*systemUpgrade\s*\}\s+from/u)
  assert.match(application, /requestIdleCallback/u)
  assert.match(application, /import\('\.\/utils\/sys\/upgrade'\)/u)
  assert.match(application, /\[Upgrade\] Failed to load upgrade check/u)
  assert.doesNotMatch(userStore, /useSettingStore|getSettingState|getWorktabState/u)
  const upgradeManager = readFileSync(resolve(webRoot, 'src/utils/sys/upgrade.ts'), 'utf8')
  assert.match(upgradeManager, /await import\(['"]@\/mock\/upgrade\/changeLog['"]\)/u)
  assert.doesNotMatch(upgradeManager, /^import\s+\{[^}]*projectChangeLog[^}]*\}/mu)
  assert.match(upgradeManager, /storedVersion === String\(StorageConfig\.CURRENT_VERSION\)/u)
})

test('authorization pages expose non-visual accessibility semantics', () => {
  const authTopBar = readFileSync(
    resolve(webRoot, 'src/components/core/views/login/AuthTopBar.vue'),
    'utf8'
  )
  const dragVerify = readFileSync(
    resolve(webRoot, 'src/components/core/forms/art-drag-verify/index.vue'),
    'utf8'
  )
  const authPages = ['login', 'register', 'forget-password'].map((name) =>
    readFileSync(resolve(webRoot, `src/views/auth/${name}/index.vue`), 'utf8')
  )

  assert.ok(authPages.every((page) => /<main\s+class="auth-right-wrap">/u.test(page)))
  assert.ok(authPages.every((page) => /<h2\s+class="title">/u.test(page)))
  assert.match(authTopBar, /aria-label/u)
  assert.match(authTopBar, /role="radiogroup"/u)
  assert.match(authTopBar, /:deep\(\.auth-icon\)/u)
  assert.match(authTopBar, /@keydown\.(?:enter|space)/u)
  assert.match(dragVerify, /role="slider"[\s\S]+aria-valuenow[\s\S]+moveByKeyboard\(10\)/u)
  assert.doesNotMatch(dragVerify, /@keydown\.right\.prevent="passVerify"/u)
})

test('large page-only runtimes use stable functional chunks', () => {
  const viteConfig = readFileSync(resolve(webRoot, 'vite.config.ts'), 'utf8')

  for (const chunk of [
    'charts',
    'pdf-preview',
    'spreadsheet',
    'editor',
    'video'
  ]) {
    assert.match(viteConfig, new RegExp(`['"]${chunk}['"]`, 'u'))
  }
  assert.doesNotMatch(viteConfig, /node_modules[^\n]+split\([^\n]+\)\[0\]/u)
})

test('Web Vitals telemetry is opt-in, anonymous and loaded outside the entry path', () => {
  const application = readFileSync(resolve(webRoot, 'src/App.vue'), 'utf8')
  const telemetry = readFileSync(
    resolve(webRoot, 'src/utils/performance/webVitals.ts'),
    'utf8'
  )
  const productionEnv = readFileSync(resolve(webRoot, '.env.production'), 'utf8')

  assert.match(application, /VITE_WEB_VITALS_ENABLED[\s\S]+import\('\.\/utils\/performance\/webVitals'\)/u)
  assert.match(productionEnv, /VITE_WEB_VITALS_ENABLED\s*=\s*false/u)
  assert.match(telemetry, /onCLS[\s\S]+onFCP[\s\S]+onINP[\s\S]+onLCP[\s\S]+onTTFB/u)
  assert.match(telemetry, /credentials:\s*'omit'/u)
  assert.match(telemetry, /referrerPolicy:\s*'no-referrer'/u)
  assert.doesNotMatch(telemetry, /location\.|navigator\.userAgent|document\.referrer|account|token|query/iu)
})
