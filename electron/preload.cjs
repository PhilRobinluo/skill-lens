/* eslint-disable @typescript-eslint/no-require-imports */

const { contextBridge, ipcRenderer } = require("electron");

window.addEventListener("DOMContentLoaded", () => {
  document.documentElement.classList.add("electron");
});

contextBridge.exposeInMainWorld("electronAPI", {
  isElectron: true,
  openMainWindow: () => ipcRenderer.invoke("open-main-window"),
  copyToClipboard: (text) => ipcRenderer.invoke("copy-to-clipboard", text),
  setTrayExpanded: (expanded) => ipcRenderer.invoke("set-tray-expanded", expanded),
});
