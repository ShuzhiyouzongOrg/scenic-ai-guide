const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("shuzhiyouzongDesktop", Object.freeze({
  getAppInfo: () => ipcRenderer.invoke("desktop:get-app-info"),
  getAvatarCredentials: () => ipcRenderer.invoke("desktop:get-avatar-credentials"),
  openExternal: (url) => ipcRenderer.invoke("desktop:open-external", url)
}));
