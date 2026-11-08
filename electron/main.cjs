const {
  app,
  BrowserWindow,
  ipcMain,
  desktopCapturer,
  session,
  systemPreferences,
  globalShortcut,
  shell,
  screen,
  nativeImage,
} = require("electron");
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const { spawn } = require("child_process");

const isDev = !app.isPackaged;
const DEV_URL = process.env.VITE_DEV_SERVER_URL || "http://127.0.0.1:4317";

// Splash intro can play video audio without a click when Chromium allows it.
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

/** @type {BrowserWindow | null} */
let mainWindow = null;
/** @type {BrowserWindow | null} */
let splashWindow = null;
let splashFinished = false;
let mainReady = false;
/** @type {{ x: number, y: number, width: number, height: number } | null} */
let fullBounds = null;
/** @type {{ x: number, y: number, width: number, height: number } | null} */
let compactBounds = null;
let windowMode = "full";
let fullMaximized = false;
let saveTimer = null;
/** @type {Map<string, import("child_process").ChildProcess>} */
const appCaptures = new Map();

function captureHelperPath() {
  if (app.isPackaged) return path.join(process.resourcesPath, "mixline-capture.exe");
  return path.join(__dirname, "..", "native", "bin", "mixline-capture.exe");
}

function stopAllAppCaptures() {
  for (const proc of appCaptures.values()) {
    try {
      proc.kill();
    } catch {
      /* already gone */
    }
  }
  appCaptures.clear();
}

function setupDir() {
  const dir = path.join(app.getPath("userData"), "mixline");
  const cues = path.join(dir, "cues");
  fs.mkdirSync(cues, { recursive: true });
  return {
    dir,
    cues,
    setupFile: path.join(dir, "setup.json"),
    windowFile: path.join(dir, "window.json"),
  };
}

function readWindowState() {
  const { windowFile } = setupDir();
  try {
    if (!fs.existsSync(windowFile)) return null;
    return JSON.parse(fs.readFileSync(windowFile, "utf8"));
  } catch {
    return null;
  }
}

function writeWindowState(state) {
  const { windowFile } = setupDir();
  fs.writeFileSync(windowFile, JSON.stringify(state, null, 2), "utf8");
}

function boundsOnScreen(bounds) {
  if (!bounds) return false;
  const displays = screen.getAllDisplays();
  return displays.some((d) => {
    const a = d.workArea;
    const cx = bounds.x + bounds.width / 2;
    const cy = bounds.y + bounds.height / 2;
    return cx >= a.x && cx <= a.x + a.width && cy >= a.y && cy <= a.y + a.height;
  });
}

function captureCurrentBounds() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (windowMode === "compact") {
    compactBounds = mainWindow.getBounds();
  } else if (!mainWindow.isMaximized()) {
    fullBounds = mainWindow.getBounds();
    fullMaximized = false;
  } else {
    fullMaximized = true;
  }
}

function scheduleSaveWindowState() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    captureCurrentBounds();
    writeWindowState({
      mode: windowMode,
      fullBounds,
      compactBounds,
      fullMaximized,
    });
  }, 250);
}

function resolveAppIcon() {
  const candidates = [
    path.join(__dirname, "..", "dist", "bph-logo.png"),
    path.join(__dirname, "..", "public", "bph-logo.png"),
  ];
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    const image = nativeImage.createFromPath(candidate);
    if (!image.isEmpty()) return image;
  }
  return undefined;
}

function defaultFullBounds() {
  const { workArea } = screen.getPrimaryDisplay();
  const width = Math.min(1480, Math.max(1100, Math.round(workArea.width * 0.72)));
  const height = Math.min(980, Math.max(760, Math.round(workArea.height * 0.78)));
  return {
    x: workArea.x + Math.round((workArea.width - width) / 2),
    y: workArea.y + Math.round((workArea.height - height) / 2),
    width,
    height,
  };
}

function defaultCompactBounds() {
  const { workArea } = screen.getPrimaryDisplay();
  // Pocket size ≈ one full-rack strip row — corner overlay, not a second board.
  const width = 300;
  const height = 408;
  return {
    x: workArea.x + workArea.width - width - 12,
    y: workArea.y + workArea.height - height - 14,
    width,
    height,
  };
}

function usableCompactBounds(bounds) {
  if (!bounds || !boundsOnScreen(bounds)) return false;
  // Accept corner mini sizes; reject old full / oversized pocket windows.
  return bounds.width >= 260 && bounds.width <= 380 && bounds.height >= 300 && bounds.height <= 480;
}

function withCueRows(bounds) {
  if (!bounds || bounds.height >= 400) return bounds;
  const { workArea } = screen.getPrimaryDisplay();
  const height = 408;
  const y = Math.max(workArea.y, Math.min(bounds.y, workArea.y + workArea.height - height));
  return { ...bounds, height, y };
}

function resolveCompactBounds() {
  const bounds = usableCompactBounds(compactBounds) ? compactBounds : defaultCompactBounds();
  return withCueRows(bounds);
}

function applyCompactLayout(win) {
  win.setAlwaysOnTop(true, "floating");
  win.setMinimumSize(260, 360);
  if (win.isMaximized()) win.unmaximize();
  compactBounds = resolveCompactBounds();
  win.setBounds(compactBounds, true);
}

function applyFullLayout(win) {
  win.setAlwaysOnTop(false);
  win.setMinimumSize(960, 640);
  if (fullMaximized) {
    win.maximize();
    return;
  }
  const bounds =
    fullBounds && boundsOnScreen(fullBounds) ? fullBounds : defaultFullBounds();
  win.setBounds(bounds, true);
}

function attachWindowPersistence(win) {
  const persist = () => scheduleSaveWindowState();
  win.on("move", persist);
  win.on("resize", persist);
  win.on("maximize", () => {
    if (windowMode === "full") {
      fullMaximized = true;
      scheduleSaveWindowState();
    }
  });
  win.on("unmaximize", () => {
    if (windowMode === "full") {
      fullMaximized = false;
      fullBounds = win.getBounds();
      scheduleSaveWindowState();
    }
  });
  win.on("close", () => {
    captureCurrentBounds();
    writeWindowState({
      mode: windowMode,
      fullBounds,
      compactBounds,
      fullMaximized,
    });
  });
}

function splashDir() {
  if (app.isPackaged) return path.join(process.resourcesPath, "splash");
  return path.join(__dirname, "splash");
}

function revealMainWindow() {
  if (!mainReady || !splashFinished) return;
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (windowMode === "compact") {
    applyCompactLayout(mainWindow);
  } else if (fullMaximized) {
    mainWindow.maximize();
  }
  mainWindow.show();
  mainWindow.focus();
  mainWindow.webContents.send("mixline:window-mode", windowMode);
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close();
  }
  splashWindow = null;
}

function createSplashWindow() {
  const icon = resolveAppIcon();
  const dir = splashDir();
  const htmlPath = path.join(dir, "index.html");
  const videoPath = path.join(dir, "DevLoadingScreen.mp4");
  const videoUrl = fs.existsSync(videoPath) ? pathToFileURL(videoPath).href : "";

  splashWindow = new BrowserWindow({
    width: 720,
    height: 405,
    resizable: false,
    maximizable: false,
    minimizable: true,
    fullscreenable: false,
    frame: false,
    transparent: false,
    alwaysOnTop: true,
    skipTaskbar: false,
    backgroundColor: "#07080d",
    show: true,
    title: "MixLine",
    ...(icon ? { icon } : {}),
    webPreferences: {
      preload: path.join(__dirname, "splash-preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: false,
    },
  });

  // Absolute file URL so the portable unpack path always finds the clip.
  void splashWindow.loadFile(htmlPath, {
    query: videoUrl ? { video: videoUrl } : {},
  });
  splashWindow.center();
  splashWindow.on("closed", () => {
    splashWindow = null;
    // If the splash is closed early, still open the rack when ready.
    splashFinished = true;
    revealMainWindow();
  });

  // Failsafe: force-close a stuck splash so it never sits as a black box.
  setTimeout(() => {
    if (splashFinished) return;
    splashFinished = true;
    try {
      if (splashWindow && !splashWindow.isDestroyed()) splashWindow.destroy();
    } catch {
      /* already gone */
    }
    splashWindow = null;
    revealMainWindow();
  }, 14000);
}

function createWindow() {
  const saved = readWindowState();
  if (saved) {
    windowMode = saved.mode === "compact" ? "compact" : "full";
    fullBounds = saved.fullBounds || null;
    compactBounds = saved.compactBounds || null;
    fullMaximized = !!saved.fullMaximized;
  }

  const startBounds =
    windowMode === "compact"
      ? resolveCompactBounds()
      : fullBounds && boundsOnScreen(fullBounds)
        ? fullBounds
        : defaultFullBounds();

  const icon = resolveAppIcon();

  mainWindow = new BrowserWindow({
    ...startBounds,
    minWidth: windowMode === "compact" ? 260 : 960,
    minHeight: windowMode === "compact" ? 360 : 640,
    backgroundColor: "#07080d",
    title: "MixLine — Badly Played Hub",
    autoHideMenuBar: true,
    show: false,
    alwaysOnTop: windowMode === "compact",
    ...(icon ? { icon } : {}),
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

  attachWindowPersistence(mainWindow);

  mainWindow.once("ready-to-show", () => {
    mainReady = true;
    revealMainWindow();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function clearHotkeys() {
  globalShortcut.unregisterAll();
}

function sendMediaKey(action) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("mixline:media-key", action);
  }
}

function registerMediaKeys() {
  const bindings = [
    ["MediaPlayPause", "play-pause"],
    ["MediaNextTrack", "next"],
    ["MediaPreviousTrack", "prev"],
    ["VolumeMute", "mute"],
  ];
  for (const [accelerator, action] of bindings) {
    try {
      globalShortcut.register(accelerator, () => sendMediaKey(action));
    } catch {
      /* another app may already own the key */
    }
  }
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
  registerMediaKeys();
  return { ok: failed.length === 0, failed };
}

app.whenReady().then(() => {
  ipcMain.on("mixline:splash-done", () => {
    splashFinished = true;
    revealMainWindow();
  });

  createSplashWindow();

  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    if (
      permission === "media" ||
      permission === "display-capture" ||
      permission === "mediaKeySystem" ||
      permission === "midi" ||
      permission === "midiSysex"
    ) {
      callback(true);
      return;
    }
    callback(false);
  });
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => {
    if (permission === "midi" || permission === "midiSysex") return true;
    return true;
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
    if (process.platform === "win32") {
      await shell.openExternal("ms-settings:apps-volume");
      return true;
    }
    return false;
  });

  ipcMain.handle("mixline:open-widget-url", async (_e, url, browser) => {
    const raw = typeof url === "string" ? url.trim() : "";
    if (!/^https:\/\//i.test(raw)) return { ok: false };
    const candidates =
      browser === "edge"
        ? [
            "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
            "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
          ]
        : browser === "chrome"
          ? [
              "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
              "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
            ]
          : [];
    const exe = candidates.find((candidate) => fs.existsSync(candidate));
    if (exe) {
      spawn(exe, ["--new-window", raw], { detached: true, stdio: "ignore", windowsHide: false }).unref();
      return { ok: true };
    }
    await shell.openExternal(raw);
    return { ok: true };
  });

  function runCaptureHelper(args, timeoutMs = 8000) {
    const exe = captureHelperPath();
    if (!fs.existsSync(exe)) throw new Error("App capture helper is missing.");
    return new Promise((resolve, reject) => {
      const proc = spawn(exe, args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
      const out = [];
      const err = [];
      const timer = setTimeout(() => {
        proc.kill();
        reject(new Error("Audio helper timed out."));
      }, timeoutMs);
      proc.stdout.on("data", (chunk) => out.push(chunk));
      proc.stderr.on("data", (chunk) => err.push(chunk));
      proc.on("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
      proc.on("exit", (code) => {
        clearTimeout(timer);
        const stdout = Buffer.concat(out).toString("utf8").trim();
        const stderr = Buffer.concat(err).toString("utf8").trim();
        if (code !== 0) {
          reject(new Error(stderr || `Audio helper failed (${code}).`));
          return;
        }
        resolve(stdout);
      });
    });
  }

  function parseHelperJson(stdout) {
    const startObj = stdout.indexOf("{");
    const startArr = stdout.indexOf("[");
    const start =
      startObj < 0 ? startArr : startArr < 0 ? startObj : Math.min(startObj, startArr);
    if (start < 0) throw new Error("Audio helper returned no JSON.");
    return JSON.parse(stdout.slice(start));
  }

  ipcMain.handle("mixline:list-audio-apps", async () => {
    const result = await runCaptureHelper(["--list"]);
    const apps = parseHelperJson(result);
    if (!Array.isArray(apps)) return [];
    // Don't offer MixLine itself — capturing our output into a listen rack echoes.
    return apps.filter((app) => {
      const appExe = String(app?.exe || "");
      const name = String(app?.name || "");
      return !/mixline/i.test(appExe) && !/mixline/i.test(name);
    });
  });

  ipcMain.handle("mixline:get-output-volume", async (_e, deviceLabel) => {
    const label = typeof deviceLabel === "string" ? deviceLabel : "";
    const args = label ? ["--volume-get", label] : ["--volume-get"];
    return parseHelperJson(await runCaptureHelper(args, 4000));
  });

  ipcMain.handle("mixline:set-output-volume", async (_e, volume, deviceLabel) => {
    const level = Math.min(1, Math.max(0, Number(volume) || 0));
    const label = typeof deviceLabel === "string" ? deviceLabel : "";
    const args = label
      ? ["--volume-set", String(level), label]
      : ["--volume-set", String(level)];
    return parseHelperJson(await runCaptureHelper(args, 4000));
  });

  ipcMain.handle("mixline:set-output-muted", async (_e, muted, deviceLabel) => {
    const label = typeof deviceLabel === "string" ? deviceLabel : "";
    const args = label
      ? ["--volume-mute", muted ? "1" : "0", label]
      : ["--volume-mute", muted ? "1" : "0"];
    return parseHelperJson(await runCaptureHelper(args, 4000));
  });

  ipcMain.handle("mixline:get-output-peak", async (_e, deviceLabel) => {
    const label = typeof deviceLabel === "string" ? deviceLabel : "";
    const args = label ? ["--volume-peak", label] : ["--volume-peak"];
    return parseHelperJson(await runCaptureHelper(args, 4000));
  });

  ipcMain.handle("mixline:start-app-capture", async (_e, pid) => {
    const target = Number(pid);
    if (!Number.isInteger(target) || target <= 0) throw new Error("Pick an app first.");
    const exe = captureHelperPath();
    if (!fs.existsSync(exe)) throw new Error("App capture helper is missing.");
    const id = `cap-${target}-${Date.now().toString(36)}`;
    const proc = spawn(exe, ["--capture", String(target)], {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    appCaptures.set(id, proc);
    let pending = Buffer.alloc(0);
    let stderr = "";
    proc.stdout.on("data", (chunk) => {
      pending = pending.length ? Buffer.concat([pending, chunk]) : chunk;
      const usable = pending.length - (pending.length % 4);
      if (!usable || !mainWindow || mainWindow.isDestroyed()) return;
      const frame = Buffer.from(pending.subarray(0, usable));
      pending = pending.subarray(usable);
      mainWindow.webContents.send("mixline:app-pcm", id, frame);
    });
    const ready = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(stderr.trim() || "That app tap timed out."));
      }, 8000);
      const finishOk = () => {
        clearTimeout(timer);
        resolve(true);
      };
      const finishErr = (error) => {
        clearTimeout(timer);
        reject(error);
      };
      proc.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
        if (stderr.includes("ready")) finishOk();
      });
      proc.on("error", (error) => finishErr(error));
      proc.on("exit", (code) => {
        appCaptures.delete(id);
        if (!stderr.includes("ready")) {
          finishErr(new Error(stderr.trim() || `App tap stopped (${code ?? "closed"}).`));
          return;
        }
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("mixline:app-capture-ended", {
            id,
            code,
            error: stderr.replace("ready", "").trim(),
          });
        }
      });
    });
    try {
      await ready;
    } catch (error) {
      try {
        proc.kill();
      } catch {
        /* already gone */
      }
      appCaptures.delete(id);
      throw error;
    }
    return { id };
  });

  ipcMain.handle("mixline:stop-app-capture", async (_e, id) => {
    const proc = appCaptures.get(id);
    if (!proc) return false;
    appCaptures.delete(id);
    try {
      proc.kill();
    } catch {
      /* already gone */
    }
    return true;
  });

  ipcMain.handle("mixline:get-window-mode", async () => windowMode);

  ipcMain.handle("mixline:set-window-mode", async (_e, mode) => {
    if (!mainWindow || mainWindow.isDestroyed()) return { ok: false, mode: windowMode };
    const next = mode === "compact" ? "compact" : "full";
    if (next === windowMode) return { ok: true, mode: windowMode };

    captureCurrentBounds();
    if (next === "compact") {
      applyCompactLayout(mainWindow);
    } else {
      applyFullLayout(mainWindow);
    }
    windowMode = next;
    scheduleSaveWindowState();
    mainWindow.webContents.send("mixline:window-mode", windowMode);
    return { ok: true, mode: windowMode };
  });

  createWindow();
  registerMediaKeys();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("will-quit", () => {
  stopAllAppCaptures();
  clearHotkeys();
});

app.on("window-all-closed", () => {
  clearHotkeys();
  if (process.platform !== "darwin") app.quit();
});
