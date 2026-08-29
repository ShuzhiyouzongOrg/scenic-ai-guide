/// <reference types="vite/client" />
/**
 * @fileoverview 前端环境与第三方模块声明。
 * @description 扩展 Vite 环境变量、第三方模块、二维码组件和应用版本全局常量类型。
 */

/**
 * @interface ImportMetaEnv
 * @description 声明构建工具注入到前端的可选性能监测环境变量。
 * @property {string} [VITE_WEB_VITALS_ENABLED] 是否启用 Web Vitals 采集的字符串开关。
 * @property {string} [VITE_WEB_VITALS_SAMPLE_RATE] Web Vitals 采样率的字符串配置。
 */
interface ImportMetaEnv {
  readonly VITE_WEB_VITALS_ENABLED?: string
  readonly VITE_WEB_VITALS_SAMPLE_RATE?: string
}

/**
 * @interface ImportMeta
 * @description 扩展模块元数据，使业务代码能够以类型安全方式读取 Vite 环境变量。
 * @property {ImportMetaEnv} env 当前构建环境注入的变量集合。
 */
interface ImportMeta {
  readonly env: ImportMetaEnv
}

/**
 * @module nprogress
 * @description 为未附带类型声明的页面进度条依赖提供模块占位声明。
 */
declare module 'nprogress'

/**
 * @module crypto-js
 * @description 为当前项目使用的 CryptoJS 依赖提供模块占位声明。
 */
declare module 'crypto-js'

/**
 * @module vue-img-cutter
 * @description 为 Vue 图片裁剪组件提供模块占位声明。
 */
declare module 'vue-img-cutter'

/**
 * @module file-saver
 * @description 为浏览器文件保存依赖提供模块占位声明。
 */
declare module 'file-saver'

/**
 * @module qrcode.vue
 * @description 声明二维码组件的渲染级别、输出方式、图片设置和组件属性。
 * @example
 * import QrcodeVue from 'qrcode.vue'
 */
declare module 'qrcode.vue' {
  /**
   * @typedef {'L'|'M'|'Q'|'H'} Level
   * @description 表示二维码允许使用的四种纠错等级。
   */
  export type Level = 'L' | 'M' | 'Q' | 'H'

  /**
   * @typedef {'canvas'|'svg'} RenderAs
   * @description 表示二维码组件支持的画布或矢量输出方式。
   */
  export type RenderAs = 'canvas' | 'svg'

  /**
   * @typedef {'linear'|'radial'} GradientType
   * @description 表示二维码渐变色支持的线性或径向模式。
   */
  export type GradientType = 'linear' | 'radial'

  /**
   * @interface ImageSettings
   * @description 描述嵌入二维码中心图片时需要的资源和尺寸参数。
   * @property {string} src 图片资源地址。
   * @property {number} height 图片显示高度，单位为像素。
   * @property {number} width 图片显示宽度，单位为像素。
   * @property {boolean} excavate 是否清除图片下方的二维码模块。
   */
  export interface ImageSettings {
    src: string
    height: number
    width: number
    excavate: boolean
  }

  /**
   * @interface QRCodeProps
   * @description 描述二维码 Vue 组件接收的内容、尺寸、颜色和渲染属性。
   * @property {string} value 待编码为二维码的文本内容。
   * @property {number} [size] 二维码边长，单位为像素。
   * @property {Level} [level] 二维码纠错等级。
   * @property {string} [background] 二维码背景颜色。
   * @property {string} [foreground] 二维码前景颜色。
   * @property {RenderAs} [renderAs] 二维码输出方式。
   */
  export interface QRCodeProps {
    value: string
    size?: number
    level?: Level
    background?: string
    foreground?: string
    renderAs?: RenderAs
  }

  /**
   * @description 提供可在 Vue 模板或渲染函数中使用的二维码组件。
   * @type {any}
   */
  const QrcodeVue: any

  /**
   * @description 将二维码组件作为 `qrcode.vue` 模块的默认导出。
   * @type {any}
   */
  export default QrcodeVue
}

/**
 * @description 保存构建阶段注入的当前应用版本号。
 * @type {string}
 * @example
 * console.info(__APP_VERSION__)
 */
declare const __APP_VERSION__: string
