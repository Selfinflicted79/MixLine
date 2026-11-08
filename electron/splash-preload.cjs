const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("splash", {
  done: () => ipcRenderer.send("mixline:splash-done"),
});
