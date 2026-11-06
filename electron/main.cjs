const {
  app,
  BrowserWindow,
  ipcMain,
  desktopCapturer,
  session,
  systemPreferences,
  globalShortcut,
  shell,
} = require("electron");
const fs = require("fs");
const path = require("path");

const isDev = !app.isPackaged;
const DEV_URL = process.env.VITE_DEV_SERVER_URL || "http://127.0.0.1:4317";

/** @type {BrowserWindow | null} */
let mainWindow = null;

function setupDir() {
  const dir = path.join(app.getPath("userData"), "mixline");
  const cues = path.join(dir, "cues");
  fs.mkdirSync(cues, { recursive: true });
  return { dir, cues, setupFile: path.join(dir, "setup.json") };
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#b7ae9b",
    title: "MixLine",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (isDev) {
    void mainWindow.loadURL(DEV_URL);
  } else {
    void mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function clearHotkeys() {
  globalShortcut.unregisterAll();
}

function registerHotkeys(bindings) {
  clearHotkeys();
  if (!Array.isArray(bindings)) return { ok: true, failed: [] };
  const failed = [];
  for (const binding of bindings) {
    if (!binding?.accelerator || !binding?.cueId) continue;
    try {
      const ok = globalShortcut.register(binding.accelerator, () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("mixline:hotkey", binding.cueId);
        }
      });
      if (!ok) failed.push(binding.accelerator);
    } catch {
      failed.push(binding.accelerator);
    }
  }
  return { ok: failed.length === 0, failed };
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    if (permission === "media" || permission === "display-capture" || permission === "mediaKeySystem") {
      callback(true);
      return;
    }
    callback(false);
  });

  ipcMain.handle("mixline:get-desktop-sources", async () => {
    const sources = await desktopCapturer.getSources({
      types: ["screen", "window"],
      thumbnailSize: { width: 0, height: 0 },
      fetchWindowIcons: false,
    });
    return sources.map((s) => ({
      id: s.id,
      name: s.name,
      display_id: s.display_id,
    }));
  });

  ipcMain.handle("mixline:mic-access-status", async () => {
    if (process.platform === "darwin") {
      return systemPreferences.getMediaAccessStatus("microphone");
    }
    return "granted";
  });

  ipcMain.handle("mixline:request-mic-access", async () => {
    if (process.platform === "darwin") {
      return systemPreferences.askForMediaAccess("microphone");
    }
    return true;
  });

  ipcMain.handle("mixline:load-setup", async () => {
    const { setupFile } = setupDir();
    if (!fs.existsSync(setupFile)) return null;
    try {
      return JSON.parse(fs.readFileSync(setupFile, "utf8"));
    } catch {
      return null;
    }
  });

  ipcMain.handle("mixline:save-setup", async (_e, setup) => {
    const { setupFile } = setupDir();
    fs.writeFileSync(setupFile, JSON.stringify(setup, null, 2), "utf8");
    return true;
  });

  ipcMain.handle("mixline:save-cue-file", async (_e, fileId, bytes) => {
    const { cues } = setupDir();
    const target = path.join(cues, `${fileId}.bin`);
    fs.writeFileSync(target, Buffer.from(bytes));
    return true;
  });

  ipcMain.handle("mixline:load-cue-file", async (_e, fileId) => {
    const { cues } = setupDir();
    const target = path.join(cues, `${fileId}.bin`);
    if (!fs.existsSync(target)) return null;
    const buf = fs.readFileSync(target);
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  });

  ipcMain.handle("mixline:delete-cue-file", async (_e, fileId) => {
    const { cues } = setupDir();
    const target = path.join(cues, `${fileId}.bin`);
    if (fs.existsSync(target)) fs.unlinkSync(target);
    return true;
  });

  ipcMain.handle("mixline:register-hotkeys", async (_e, bindings) => {
    return registerHotkeys(bindings);
  });

  ipcMain.handle("mixline:open-sound-settings", async () => {
    // Windows per-app output mixer — where you point YouTube Music at a cable.
    if (process.platform === "win32") {
      await shell.openExternal("ms-settings:apps-volume");
      return true;
    }
    return false;
  });

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("will-quit", () => {
  clearHotkeys();
});

app.on("window-all-closed", () => {
  clearHotkeys();
  if (process.platform !== "darwin") app.quit();
});
