/**
 * Live2D 角色资源描述。
 *
 * 从原 awesome-digital-human-live2d 项目（Next.js）移植而来，原先依赖
 * `@/lib/protocol` 里的一大堆后端协议类型。移植到本项目（Vue）时只保留
 * Live2D 渲染真正需要的最小字段，避免拖入无关依赖。
 *
 * changeCharacter() 会用 `link` 推导模型所在目录，用 `name` 拼出
 * `${name}.model3.json`，因此 `name` 必须与模型目录/文件名一致（如 "Haru"）。
 */
export interface ResourceModel {
  /** 资源 id，仅用于标识 */
  resource_id: string
  /** 模型名，需与 `${name}.model3.json` 一致（如 "Haru"） */
  name: string
  /** 模型入口文件的可访问 URL，如 /live2d/characters/Haru/Haru.model3.json */
  link: string
  /** 当前容器的模型取景参数，在 Cubism 投影阶段应用以保持原生清晰度。 */
  viewTransform?: Live2dViewTransform
}

export interface Live2dViewTransform {
  scale: number
  offsetX: number
  offsetY: number
}

export type Live2dPresentation = 'stage' | 'portrait'

export const BUNDLED_LIVE2D_MODELS = ['Haru', 'Hiyori', 'Kei', 'Hibiki'] as const

export type BundledLive2dModel = (typeof BUNDLED_LIVE2D_MODELS)[number]

/** Model-space framing for the map's circular avatar. */
export const LIVE2D_PORTRAIT_PROFILES: Record<BundledLive2dModel, Live2dViewTransform> = {
  Haru: { scale: 2.35, offsetX: 0, offsetY: -0.34 },
  Hiyori: { scale: 2.5, offsetX: 0, offsetY: -0.38 },
  Kei: { scale: 1.08, offsetX: 0, offsetY: 0 },
  Hibiki: { scale: 2.45, offsetX: 0, offsetY: -0.36 }
}

export function isBundledLive2dModel(modelId: string): modelId is BundledLive2dModel {
  return BUNDLED_LIVE2D_MODELS.some((candidate) => candidate === modelId)
}
