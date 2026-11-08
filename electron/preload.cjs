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
  openWidgetUrl: (url, browser) => ipcRenderer.invoke("mixline:open-widget-url", url, browser),
  listAudioApps: () => ipcRenderer.invoke("mixline:list-audio-apps"),
  getOutputVolume: (deviceLabel) => ipcRenderer.invoke("mixline:get-output-volume", deviceLabel),
  setOutputVolume: (volume, deviceLabel) =>
    ipcRenderer.invoke("mixline:set-output-volume", volume, deviceLabel),
  setOutputMuted: (muted, deviceLabel) =>
    ipcRenderer.invoke("mixline:set-output-muted", muted, deviceLabel),
  getOutputPeak: (deviceLabel) => ipcRenderer.invoke("mixline:get-output-peak", deviceLabel),
  startAppCapture: (pid) => ipcRenderer.invoke("mixline:start-app-capture", pid),
  stopAppCapture: (id) => ipcRenderer.invoke("mixline:stop-app-capture", id),
  onAppPcm: (handler) => {
    const listener = (_event, id, payload) => {
      const bytes = payload instanceof Uint8Array ? payload : new Uint8Array(payload);
      handler(id, bytes);
    };
    ipcRenderer.on("mixline:app-pcm", listener);
    return () => ipcRenderer.removeListener("mixline:app-pcm", listener);
  },
  onAppCaptureEnded: (handler) => {
    const listener = (_event, info) => handler(info);
    ipcRenderer.on("mixline:app-capture-ended", listener);
    return () => ipcRenderer.removeListener("mixline:app-capture-ended", listener);
  },
  getWindowMode: () => ipcRenderer.invoke("mixline:get-window-mode"),
  setWindowMode: (mode) => ipcRenderer.invoke("mixline:set-window-mode", mode),
  onWindowMode: (handler) => {
    const listener = (_event, mode) => handler(mode);
    ipcRenderer.on("mixline:window-mode", listener);
    return () => ipcRenderer.removeListener("mixline:window-mode", listener);
  },
  onHotkey: (handler) => {
    const listener = (_event, cueId) => handler(cueId);
    ipcRenderer.on("mixline:hotkey", listener);
    return () => ipcRenderer.removeListener("mixline:hotkey", listener);
  },
  onMediaKey: (handler) => {
    const listener = (_event, action) => handler(action);
    ipcRenderer.on("mixline:media-key", listener);
    return () => ipcRenderer.removeListener("mixline:media-key", listener);
  },
});
