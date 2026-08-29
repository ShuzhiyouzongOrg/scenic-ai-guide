/**
 * @fileoverview 桌面端桥接类型声明。
 * @description 扩展 Window 并声明 Electron 预加载层提供的应用信息、数字人凭证和外链能力。
 */
export {}

declare global {
  interface Window {
    shuzhiyouzongDesktop?: {
      getAppInfo: () => Promise<{ name: string; version: string; platform: string; arch: string }>
      getAvatarCredentials: () => Promise<{
        appId: string
        apiKey: string
        apiSecret: string
      }>
      openExternal: (url: string) => Promise<boolean>
    }
  }
}
