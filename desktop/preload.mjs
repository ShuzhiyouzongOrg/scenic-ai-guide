import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("shuzhiyouzongDesktop", Object.freeze({
  getAppInfo: () => ipcRenderer.invoke("desktop:get-app-info"),
  openExternal: (url) => ipcRenderer.invoke("desktop:open-external", url)
}));
