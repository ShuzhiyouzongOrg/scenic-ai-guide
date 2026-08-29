/**
 * @fileoverview Electron 预加载桥接入口。
 * @description 通过上下文隔离桥向渲染进程暴露应用信息、数字人凭据读取和外部链接打开能力。
 */
const { contextBridge, ipcRenderer } = require("electron");

/**
 * @description 暴露给受上下文隔离保护的渲染进程的桌面桥接能力。
 * @typedef {object} ShuzhiyouzongDesktopBridge
 * @property {() => Promise<{name: string, version: string, platform: string, arch: string}>} getAppInfo 获取桌面应用名称、版本、系统与架构。
 * @property {() => Promise<{appId: string, apiKey: string, apiSecret: string}>} getAvatarCredentials 获取本机讯飞数字人运行凭据。
 * @property {(url: string) => Promise<boolean>} openExternal 使用系统默认程序打开协议白名单内的外部链接。
 * @example
 * const info = await window.shuzhiyouzongDesktop.getAppInfo();
 */
contextBridge.exposeInMainWorld("shuzhiyouzongDesktop", Object.freeze({
  getAppInfo: () => ipcRenderer.invoke("desktop:get-app-info"),
  getAvatarCredentials: () => ipcRenderer.invoke("desktop:get-avatar-credentials"),
  openExternal: (url) => ipcRenderer.invoke("desktop:open-external", url)
}));
