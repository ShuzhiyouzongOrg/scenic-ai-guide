/**
 * @fileoverview Web 应用 Vite 开发与生产构建配置。
 * @description 配置环境变量、开发代理、路径别名、依赖分包、资源压缩和构建报告。
 */

import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'
import { fileURLToPath } from 'url'
import viteCompression from 'vite-plugin-compression'
import Components from 'unplugin-vue-components/vite'
import AutoImport from 'unplugin-auto-import/vite'
import ElementPlus from 'unplugin-element-plus/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'
import tailwindcss from '@tailwindcss/vite'
import { visualizer } from 'rollup-plugin-visualizer'

/**
 * @description 根据运行模式读取环境变量并生成 Vite 配置。
 * @param {{mode: string}} options Vite 配置上下文。
 * @param {string} options.mode 当前开发或构建模式。
 * @returns {import('vite').UserConfig} 当前模式对应的 Vite 配置。
 * @example
 * vite --mode production
 */
export default ({ mode }: { mode: string }) => {
  const root = process.cwd()
  const env = loadEnv(mode, root)
  const {
    VITE_VERSION,
    VITE_PORT,
    VITE_BASE_URL,
    VITE_API_URL,
    VITE_API_PROXY_URL,
    VITE_BUNDLE_REPORT
  } = env
  const bundleReport = VITE_BUNDLE_REPORT === 'true'

  console.log(`🚀 API_URL = ${VITE_API_URL}`)
  console.log(`🚀 VERSION = ${VITE_VERSION}`)

  return defineConfig({
    envPrefix: ['VITE_', 'XFYUN_', 'DEFAULT_AVATAR_'],
    define: {
      __APP_VERSION__: JSON.stringify(VITE_VERSION)
    },
    base: VITE_BASE_URL,
    server: {
      port: Number(VITE_PORT),
      proxy: {
        '/api': {
          target: VITE_API_PROXY_URL,
          changeOrigin: true
        }
      },
      host: true
    },
    // 路径别名
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
        '@views': resolvePath('src/views'),
        '@imgs': resolvePath('src/assets/images'),
        '@icons': resolvePath('src/assets/icons'),
        '@utils': resolvePath('src/utils'),
        '@stores': resolvePath('src/store'),
        '@styles': resolvePath('src/assets/styles'),
        // Live2D 框架内部用 @framework 引用官方 Cubism SDK Framework 源码
        '@framework': resolvePath('src/lib/live2d/Framework/src'),
        '@motionsyncframework': resolvePath('src/lib/live2d/MotionSync/Framework/src')
      }
    },
    build: {
      target: 'es2015',
      outDir: 'dist',
      sourcemap: mode === 'production' ? 'hidden' : false,
      chunkSizeWarningLimit: 2000,
      minify: 'terser',
      terserOptions: {
        compress: {
          // 生产环境去除 console
          drop_console: true,
          // 生产环境去除 debugger
          drop_debugger: true
        }
      },
      dynamicImportVarsOptions: {
        warnOnError: true,
        exclude: [],
        include: ['src/views/**/*.vue']
      },
      rollupOptions: {
        output: {
          manualChunks(id) {
            const normalizedId = id.replaceAll('\\', '/')
            const dependencyChunks: Array<[RegExp, string]> = [
              [/(?:\/node_modules\/|\/\.pnpm\/)(?:echarts|zrender)(?:@|\/)/u, 'charts'],
              [/(?:\/node_modules\/|\/\.pnpm\/)pdfjs-dist(?:@|\/)/u, 'pdf-preview'],
              [/(?:\/node_modules\/|\/\.pnpm\/)xlsx(?:@|\/)/u, 'spreadsheet'],
              [/(?:\/node_modules\/|\/\.pnpm\/)@wangeditor(?:\+|\/)/u, 'editor'],
              [/(?:\/node_modules\/|\/\.pnpm\/)xgplayer(?:@|\/)/u, 'video']
            ]

            return dependencyChunks.find(([pattern]) => pattern.test(normalizedId))?.[1]
          }
        }
      }
    },
    plugins: [
      vue(),
      tailwindcss(),
      // 自动按需导入 API
      AutoImport({
        imports: ['vue', 'vue-router', 'pinia', '@vueuse/core'],
        dts: 'src/types/import/auto-imports.d.ts',
        resolvers: [ElementPlusResolver()],
        eslintrc: {
          enabled: true,
          filepath: './.auto-import.json',
          globalsPropValue: true
        }
      }),
      // 自动按需导入组件
      Components({
        dts: 'src/types/import/components.d.ts',
        resolvers: [ElementPlusResolver()]
      }),
      // 按需定制主题配置
      ElementPlus({
        useSource: true
      }),
      // 压缩
      viteCompression({
        verbose: false, // 是否在控制台输出压缩结果
        disable: false, // 是否禁用
        algorithm: 'gzip', // 压缩算法
        ext: '.gz', // 压缩后的文件名后缀
        threshold: 10240, // 只有大小大于该值的资源会被处理 10240B = 10KB
        deleteOriginFile: false // 保留原文件，服务器可按 Accept-Encoding 选择压缩版本
      }),
      viteCompression({
        verbose: false,
        disable: false,
        algorithm: 'brotliCompress',
        ext: '.br',
        threshold: 10240,
        deleteOriginFile: false
      }),
      ...(bundleReport
        ? [
            visualizer({
              open: false,
              gzipSize: true,
              brotliSize: true,
              template: 'raw-data',
              filename: 'performance/pagespeed/current/bundle-stats.json'
            })
          ]
        : [])
    ],
    // 依赖预构建：避免运行时重复请求与转换，提升首次加载速度
    optimizeDeps: {
      include: [
        'echarts/core',
        'echarts/charts',
        'echarts/components',
        'echarts/renderers',
        'xlsx',
        'xgplayer',
        'crypto-js',
        'file-saver',
        'vue-img-cutter',
        'element-plus/es',
        'element-plus/es/components/*/style/css',
        'element-plus/es/components/*/style/index'
      ]
    },
    css: {
      preprocessorOptions: {
        // sass variable and mixin
        scss: {
          additionalData: `
            @use "@styles/core/el-light.scss" as *;
            @use "@styles/core/mixin.scss" as *;
          `
        }
      },
      postcss: {
        plugins: [
          {
            postcssPlugin: 'internal:charset-removal',
            AtRule: {
              charset: (atRule) => {
                if (atRule.name === 'charset') {
                  atRule.remove()
                }
              }
            }
          }
        ]
      }
    }
  })
}

/**
 * @description 将相对于 Web 工程根目录的路径解析为绝对路径。
 * @param {string} paths 待解析的工程内相对路径。
 * @returns {string} 解析后的绝对路径。
 */
function resolvePath(paths: string) {
  return path.resolve(__dirname, paths)
}
