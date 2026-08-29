/**
 * @fileoverview 腾讯地图坐标适配与浏览器 SDK 加载工具。
 * @description 将景区显示坐标转换为 GCJ02，并以单例 Promise 方式加载腾讯地图 JavaScript SDK。
 */

import type { CoordinateBounds, GuideCoordinate } from '@/types/map-guide'
import { transformCoordinate } from './coordinate'
import { fromScenicDisplayCoordinate } from './scenic-projection'

/**
 * @typedef TencentLatLng
 * @description 腾讯地图经纬度对象的最小兼容接口。
 * @property {() => number} [getLat] 读取纬度的方法。
 * @property {() => number} [getLng] 读取经度的方法。
 */
export interface TencentLatLng {
  getLat?(): number
  getLng?(): number
}

/**
 * @typedef TencentMapInstance
 * @description 页面实际使用的腾讯地图实例能力。
 * @property {(center: TencentLatLng) => void} setCenter 更新地图中心点。
 * @property {(zoom: number) => void} setZoom 更新地图缩放级别。
 * @property {() => void} [destroy] 销毁地图实例及其浏览器资源。
 */
export interface TencentMapInstance {
  setCenter(center: TencentLatLng): void
  setZoom(zoom: number): void
  destroy?(): void
}

/**
 * @typedef TencentMapApi
 * @description 腾讯地图浏览器 SDK 暴露的构造器集合。
 * @property {Function} LatLng 经纬度对象构造器。
 * @property {Function} Map 地图实例构造器。
 */
export interface TencentMapApi {
  LatLng: new (latitude: number, longitude: number) => TencentLatLng
  Map: new (
    container: HTMLElement,
    options: {
      center: TencentLatLng
      zoom: number
      minZoom?: number
      maxZoom?: number
      pitch?: number
      rotation?: number
      showControl?: boolean
    }
  ) => TencentMapInstance
}

declare global {
  /**
   * @typedef Window
   * @description 扩展浏览器全局对象以声明腾讯地图 SDK 加载后注入的 `TMap`。
   * @property {TencentMapApi} [TMap] 腾讯地图浏览器 SDK API。
   */
  interface Window {
    TMap?: TencentMapApi
  }
}

let sdkPromise: Promise<TencentMapApi> | undefined

/**
 * @description 将任意已知坐标系的景区坐标转换为腾讯地图要求的 GCJ02 坐标。
 * @param {GuideCoordinate} coordinate 待转换的景区坐标。
 * @returns {GuideCoordinate} GCJ02 坐标。
 * @throws {Error} 当输入坐标系为 `UNKNOWN` 时抛出。
 * @example
 * toTencentMapCoordinate(wgs84Point)
 */
export function toTencentMapCoordinate(coordinate: GuideCoordinate): GuideCoordinate {
  return transformCoordinate(coordinate, 'GCJ02')
}

/**
 * @description 先撤销手绘图显示旋转，再将源坐标转换为腾讯地图使用的 GCJ02 坐标。
 * @param {GuideCoordinate} displayCoordinate 手绘图上已旋转的显示坐标。
 * @param {CoordinateBounds} artworkBounds 手绘图原始地理边界。
 * @param {number} rotationDegrees 手绘图显示旋转角度。
 * @returns {GuideCoordinate} 可直接传给腾讯地图的 GCJ02 坐标。
 * @throws {Error} 当坐标或边界使用 `UNKNOWN` 坐标系时抛出。
 * @example
 * scenicDisplayToTencentMapCoordinate(displayPoint, artworkBounds, 12)
 */
export function scenicDisplayToTencentMapCoordinate(
  displayCoordinate: GuideCoordinate,
  artworkBounds: CoordinateBounds,
  rotationDegrees: number
): GuideCoordinate {
  const sourceCoordinate = fromScenicDisplayCoordinate(
    displayCoordinate,
    artworkBounds,
    rotationDegrees
  )
  return toTencentMapCoordinate(sourceCoordinate)
}

/**
 * @description 动态插入腾讯地图 SDK 脚本，并复用同一次加载 Promise，避免并发重复请求。
 * @param {string} apiKey 腾讯位置服务 JavaScript API 密钥。
 * @param {number} [timeoutMs=12000] SDK 加载超时时间，单位为毫秒。
 * @returns {Promise<TencentMapApi>} SDK 回调注入 `window.TMap` 后兑现的 Promise。
 * @throws {Error} 当密钥为空、脚本加载失败、超时或回调后缺少预期 API 时拒绝 Promise。
 * @example
 * const TMap = await loadTencentMapSdk(import.meta.env.VITE_TENCENT_MAP_KEY)
 */
export function loadTencentMapSdk(apiKey: string, timeoutMs = 12000): Promise<TencentMapApi> {
  const normalizedKey = apiKey.trim()
  if (!normalizedKey) return Promise.reject(new Error('Tencent map key is missing'))
  if (window.TMap) return Promise.resolve(window.TMap)
  if (sdkPromise) return sdkPromise

  sdkPromise = new Promise<TencentMapApi>((resolve, reject) => {
    const callbackName = `__scenicTencentMapReady_${Date.now()}_${Math.random()
      .toString(36)
      .slice(2)}`
    const callbackHost = window as unknown as Record<string, unknown>
    const script = document.createElement('script')
    let settled = false

    const cleanup = (removeScript: boolean) => {
      window.clearTimeout(timeout)
      delete callbackHost[callbackName]
      script.onerror = null
      if (removeScript) script.remove()
    }
    const fail = (message: string) => {
      if (settled) return
      settled = true
      cleanup(true)
      sdkPromise = undefined
      reject(new Error(message))
    }
    const timeout = window.setTimeout(() => fail('Tencent map SDK loading timed out'), timeoutMs)

    callbackHost[callbackName] = () => {
      if (settled) return
      if (!window.TMap) {
        fail('Tencent map SDK loaded without the expected API')
        return
      }
      settled = true
      cleanup(false)
      resolve(window.TMap)
    }
    script.id = 'scenic-tencent-map-sdk'
    script.async = true
    script.defer = true
    script.charset = 'utf-8'
    script.src = `https://map.qq.com/api/gljs?v=1.exp&key=${encodeURIComponent(
      normalizedKey
    )}&callback=${callbackName}`
    script.onerror = () => fail('Tencent map SDK failed to load')
    document.head.appendChild(script)
  })

  return sdkPromise
}
