const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("mixlineDesktop", {
  isElectron: true,
  getDesktopSources: () => ipcRenderer.invoke("mixline:get-desktop-sources"),
  getMicAccessStatus: () => ipcRenderer.invoke("mixline:mic-access-status"),
  requestMicAccess: () => ipcRenderer.invoke("mixline:request-mic-access"),
  loadSetup: () => ipcRenderer.invoke("mixline:load-setup"),
  saveSetup: (setup) => ipcRenderer.invoke("mixline:save-setup", setup),
  saveCueFile: (fileId, bytes) => ipcRenderer.invoke("mixline:save-cue-file", fileId, bytes),
  loadCueFile: (fileId) => ipcRenderer.invoke("mixline:load-cue-file", fileId),
  deleteCueFile: (fileId) => ipcRenderer.invoke("mixline:delete-cue-file", fileId),
  registerHotkeys: (bindings) => ipcRenderer.invoke("mixline:register-hotkeys", bindings),
  openSoundSettings: () => ipcRenderer.invoke("mixline:open-sound-settings"),
  onHotkey: (handler) => {
    const listener = (_event, cueId) => handler(cueId);
    ipcRenderer.on("mixline:hotkey", listener);
    return () => ipcRenderer.removeListener("mixline:hotkey", listener);
  },
});
