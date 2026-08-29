/**
 * @fileoverview 讯飞云数字人凭证解析工具。
 * @description 校验编译期或桌面运行时提供的账号字段，并按优先级解析可用的完整凭证。
 */

/**
 * @typedef AvatarCredentials
 * @description 启动讯飞云数字人所需的完整账号凭证。
 * @property {string} appId 讯飞开放平台应用标识。
 * @property {string} apiKey 讯飞开放平台 API Key。
 * @property {string} apiSecret 讯飞开放平台 API Secret。
 */
export interface AvatarCredentials {
  appId: string
  apiKey: string
  apiSecret: string
}

/**
 * @typedef AvatarCredentialLoader
 * @description 从桌面主进程安全读取数字人凭证的异步加载函数。
 * @returns {Promise<Partial<AvatarCredentials> | null | undefined>} 可用字段集合；没有配置时返回空值。
 */
export type AvatarCredentialLoader = () => Promise<Partial<AvatarCredentials> | null | undefined>

function normalizeCredentials(values: Partial<AvatarCredentials> | null | undefined): AvatarCredentials {
  return {
    appId: String(values?.appId || '').trim(),
    apiKey: String(values?.apiKey || '').trim(),
    apiSecret: String(values?.apiSecret || '').trim()
  }
}

/**
 * @description 判断输入是否同时包含去除首尾空白后的 appId、apiKey 与 apiSecret。
 * @param {Partial<AvatarCredentials> | null | undefined} values 待校验的部分凭证或空值。
 * @returns {boolean} 三项凭证均为非空字符串时返回 `true`。
 * @example
 * hasAvatarCredentials({ appId: 'APP_ID', apiKey: 'API_KEY', apiSecret: 'API_SECRET' })
 */
export function hasAvatarCredentials(values: Partial<AvatarCredentials> | null | undefined) {
  const normalized = normalizeCredentials(values)
  return Boolean(normalized.appId && normalized.apiKey && normalized.apiSecret)
}

/**
 * @description 优先采用编译期凭证；其不完整时再调用桌面凭证加载器，并返回规范化后的完整凭证。
 * @param {Partial<AvatarCredentials>} compiled 编译到前端运行时的数字人凭证字段。
 * @param {AvatarCredentialLoader} [loadDesktopCredentials] 可选的桌面端安全凭证加载函数。
 * @returns {Promise<AvatarCredentials | null>} 可用的完整凭证；两种来源均无效或加载失败时返回 `null`。
 * @example
 * const credentials = await resolveAvatarCredentials(import.meta.env, window.desktopAPI?.getAvatarCredentials)
 */
export async function resolveAvatarCredentials(
  compiled: Partial<AvatarCredentials>,
  loadDesktopCredentials?: AvatarCredentialLoader
): Promise<AvatarCredentials | null> {
  const bundled = normalizeCredentials(compiled)
  if (hasAvatarCredentials(bundled)) return bundled
  if (!loadDesktopCredentials) return null

  try {
    const desktop = normalizeCredentials(await loadDesktopCredentials())
    return hasAvatarCredentials(desktop) ? desktop : null
  } catch {
    return null
  }
}
