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
