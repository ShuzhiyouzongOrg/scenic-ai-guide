/**
 * @fileoverview Live2D 角色资源与展示参数类型。
 * @description 定义 Vue 集成层需要的最小模型字段、内置模型清单和地图头像取景参数。
 */

/**
 * @typedef {object} ResourceModel
 * @description 描述可由 Live2D 集成层加载的角色资源，模型名必须与入口文件名一致。
 * @property {string} resource_id 资源唯一标识。
 * @property {string} name 模型名，用于拼接同名的 `.model3.json` 文件。
 * @property {string} link 模型入口文件的可访问地址。
 * @property {Live2dViewTransform} [viewTransform] 当前容器使用的模型取景参数。
 */
export interface ResourceModel {
  /**
   * @description 资源唯一标识。
   * @type {string}
   */
  resource_id: string
  /**
   * @description 模型名，需与 `${name}.model3.json` 文件名一致。
   * @type {string}
   */
  name: string
  /**
   * @description 模型入口文件的可访问 URL。
   * @type {string}
   */
  link: string
  /**
   * @description 当前容器的模型取景参数，在 Cubism 投影阶段应用以保持原生清晰度。
   * @type {Live2dViewTransform|undefined}
   */
  viewTransform?: Live2dViewTransform
}

/**
 * @typedef {object} Live2dViewTransform
 * @description 描述模型在当前容器中的缩放与平移取景参数。
 * @property {number} scale 模型缩放倍数。
 * @property {number} offsetX 水平方向偏移量。
 * @property {number} offsetY 垂直方向偏移量。
 */
export interface Live2dViewTransform {
  scale: number
  offsetX: number
  offsetY: number
}

/**
 * @typedef {'stage'|'portrait'} Live2dPresentation
 * @description 表示 Live2D 模型使用舞台全身或地图头像展示方式。
 */
export type Live2dPresentation = 'stage' | 'portrait'

/**
 * @description 列出随应用发布且经过资源完整性验证的 Live2D 模型名称。
 * @type {readonly ['Haru','Hiyori','Kei','Hibiki']}
 * @example
 * const defaultModel = BUNDLED_LIVE2D_MODELS[0]
 */
export const BUNDLED_LIVE2D_MODELS = ['Haru', 'Hiyori', 'Kei', 'Hibiki'] as const

/**
 * @typedef {'Haru'|'Hiyori'|'Kei'|'Hibiki'} BundledLive2dModel
 * @description 表示应用内置 Live2D 模型名称的联合类型。
 */
export type BundledLive2dModel = (typeof BUNDLED_LIVE2D_MODELS)[number]

/**
 * @description 定义各内置模型在地图圆形数字人容器中的模型空间取景参数。
 * @type {Record<BundledLive2dModel, Live2dViewTransform>}
 * @example
 * const profile = LIVE2D_PORTRAIT_PROFILES.Haru
 */
export const LIVE2D_PORTRAIT_PROFILES: Record<BundledLive2dModel, Live2dViewTransform> = {
  Haru: { scale: 2.35, offsetX: 0, offsetY: -0.34 },
  Hiyori: { scale: 2.5, offsetX: 0, offsetY: -0.38 },
  Kei: { scale: 1.08, offsetX: 0, offsetY: 0 },
  Hibiki: { scale: 2.45, offsetX: 0, offsetY: -0.36 }
}

/**
 * @description 判断模型标识是否属于应用内置 Live2D 模型清单。
 * @param {string} modelId 待检查的模型标识。
 * @returns {boolean} 属于内置模型时返回 `true`，并收窄 TypeScript 类型。
 * @example
 * if (isBundledLive2dModel(modelId)) useBundledModel(modelId)
 */
export function isBundledLive2dModel(modelId: string): modelId is BundledLive2dModel {
  return BUNDLED_LIVE2D_MODELS.some((candidate) => candidate === modelId)
}
