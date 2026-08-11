import type { CoordinateBounds, GuideCoordinate } from '@/types/map-guide'
import { transformCoordinate } from './coordinate'
import { fromScenicDisplayCoordinate } from './scenic-projection'

export interface TencentLatLng {
  getLat?(): number
  getLng?(): number
}

export interface TencentMapInstance {
  setCenter(center: TencentLatLng): void
  setZoom(zoom: number): void
  destroy?(): void
}

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
  interface Window {
    TMap?: TencentMapApi
  }
}

let sdkPromise: Promise<TencentMapApi> | undefined

export function toTencentMapCoordinate(coordinate: GuideCoordinate): GuideCoordinate {
  return transformCoordinate(coordinate, 'GCJ02')
}

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
