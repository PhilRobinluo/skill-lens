import { contextBridge, ipcRenderer } from "electron";

// 给 HTML 标记 Electron 环境，CSS 可以直接用这个 class
window.addEventListener("DOMContentLoaded", () => {
  document.documentElement.classList.add("electron");
});

contextBridge.exposeInMainWorld("electronAPI", {
  isElectron: true,
  openMainWindow: () => ipcRenderer.invoke("open-main-window"),
  copyToClipboard: (text) => ipcRenderer.invoke("copy-to-clipboard", text),
});
