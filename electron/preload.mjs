import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  isElectron: true,
  openMainWindow: () => ipcRenderer.invoke("open-main-window"),
  copyToClipboard: (text) => ipcRenderer.invoke("copy-to-clipboard", text),
});
