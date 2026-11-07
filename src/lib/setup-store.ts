import {
  audioEngine,
  type SavedSetup,
} from "@/lib/audio-engine";

const LOCAL_KEY = "mixline.setup.v1";

function isSavedSetup(value: unknown): value is SavedSetup {
  const v = value as SavedSetup;
  return (
    typeof value === "object" &&
    value !== null &&
    (v.version === 1 || v.version === 2 || v.version === 3 || v.version === 4) &&
    Array.isArray(v.channels) &&
    Array.isArray(v.cues)
  );
}

export async function saveCurrentSetup(): Promise<void> {
  const setup = audioEngine.exportSetup();
  if (window.mixlineDesktop) {
    await window.mixlineDesktop.saveSetup(setup);
    await syncHotkeys(setup);
    return;
  }
  localStorage.setItem(LOCAL_KEY, JSON.stringify(setup));
}

export async function syncHotkeys(setup?: SavedSetup): Promise<string[]> {
  if (!window.mixlineDesktop) return [];
  const data = setup ?? audioEngine.exportSetup();
  const bindings = data.cues
    .filter((c) => c.hotkey)
    .map((c) => ({ cueId: c.id, accelerator: c.hotkey! }));
  const result = await window.mixlineDesktop.registerHotkeys(bindings);
  return result.failed;
}

export async function persistCueFile(fileId: string, file: File): Promise<void> {
  if (!window.mixlineDesktop) return;
  const buf = new Uint8Array(await file.arrayBuffer());
  await window.mixlineDesktop.saveCueFile(fileId, buf);
}

function findInputDeviceId(
  deviceId: string,
  deviceLabel?: string,
): string | undefined {
  const devices = audioEngine.snapshot().inputDevices;
  if (deviceId && devices.some((d) => d.deviceId === deviceId)) return deviceId;
  if (deviceLabel) {
    const byLabel = devices.find(
      (d) => d.label === deviceLabel || d.label.includes(deviceLabel) || deviceLabel.includes(d.label),
    );
    if (byLabel) return byLabel.deviceId;
  }
  return undefined;
}

export async function restoreSetup(): Promise<{ restored: boolean; note?: string }> {
  await audioEngine.start();

  let raw: unknown = null;
  if (window.mixlineDesktop) {
    raw = await window.mixlineDesktop.loadSetup();
  } else {
    const text = localStorage.getItem(LOCAL_KEY);
    raw = text ? JSON.parse(text) : null;
  }
  if (!isSavedSetup(raw)) return { restored: false };

  audioEngine.setMasterVolume(raw.masterVolume);
  audioEngine.setMasterMuted(raw.masterMuted);
  if (typeof raw.cueMasterVolume === "number") {
    audioEngine.setCueMasterVolume(raw.cueMasterVolume);
  }
  if (typeof raw.cueMasterMuted === "boolean") {
    audioEngine.setCueMasterMuted(raw.cueMasterMuted);
  }
  if (raw.masterEq) {
    for (const band of raw.masterEq) {
      audioEngine.setBusEq("master", band.id, {
        gainDb: band.gainDb,
        frequency: band.frequency,
      });
    }
  }
  if (raw.cueEq) {
    for (const band of raw.cueEq) {
      audioEngine.setBusEq("cue", band.id, {
        gainDb: band.gainDb,
        frequency: band.frequency,
      });
    }
  }
  audioEngine.setMonitorMix(raw.monitorMix ?? raw.monitorEnabled ?? false);
  audioEngine.setMonitorVolume(raw.monitorVolume);
  if (raw.discordDeviceId) {
    try {
      await audioEngine.setDiscordOutputDevice(raw.discordDeviceId);
    } catch {
      /* device may be missing */
    }
  }

  for (const cue of raw.cues) {
    const applyCueControls = (id: string) => {
      if (typeof cue.volume === "number") audioEngine.setCueVolume(id, cue.volume);
      if (typeof cue.muted === "boolean") audioEngine.setCueMuted(id, cue.muted);
      if (typeof cue.solo === "boolean") audioEngine.setCueSolo(id, cue.solo);
      if (typeof cue.toMix === "boolean") audioEngine.setCueToMix(id, cue.toMix);
      if (typeof cue.monitor === "boolean") audioEngine.setCueMonitor(id, cue.monitor);
      audioEngine.setCueHotkey(id, cue.hotkey);
      audioEngine.setCuePad(id, typeof cue.pad === "number" ? cue.pad : null);
    };
    if (cue.builtin) {
      applyCueControls(cue.id);
      continue;
    }
    if (cue.fileId && window.mixlineDesktop) {
      const bytes = await window.mixlineDesktop.loadCueFile(cue.fileId);
      if (bytes) {
        await audioEngine.addCueFromArrayBuffer(bytes, {
          id: cue.id,
          name: cue.name,
          fileId: cue.fileId,
          hotkey: cue.hotkey,
          pad: cue.pad,
          volume: cue.volume,
          muted: cue.muted,
          solo: cue.solo,
          toMix: cue.toMix,
          monitor: cue.monitor,
        });
      }
    } else {
      applyCueControls(cue.id);
    }
  }

  const notes: string[] = [];
  await audioEngine.refreshDevices();

  for (const ch of raw.channels) {
    if (ch.kind === "mic") {
      try {
        const id = await audioEngine.addMic(ch.name, ch.deviceId || undefined);
        await audioEngine.applyChannelSettings(id, {
          volume: ch.volume,
          muted: ch.muted,
          solo: ch.solo,
          toMix: ch.toMix,
          monitor: ch.monitor,
          eq: ch.eq,
          fx: ch.fx,
          boostDb: ch.boostDb,
        });
      } catch {
        notes.push("Saved mic couldn’t reopen — pick it again from Mic.");
      }
      continue;
    }

    if (ch.kind === "app" && ch.captureMode === "process") {
      try {
        const apps = window.mixlineDesktop ? await window.mixlineDesktop.listAudioApps() : [];
        const exe = (ch.deviceId || "").replace(/^proc:/, "").split(":")[0];
        const match =
          apps.find((app) => app.exe.toLowerCase() === exe.toLowerCase() && app.name === ch.name) ||
          apps.find((app) => app.exe.toLowerCase() === exe.toLowerCase());
        if (!match) throw new Error("app not open");
        const id = await audioEngine.addAppProcess({
          pid: match.pid,
          name: ch.name,
          exe: match.exe,
        });
        await audioEngine.applyChannelSettings(id, {
          volume: ch.volume,
          muted: ch.muted,
          solo: ch.solo,
          toMix: ch.toMix,
          monitor: ch.monitor,
          eq: ch.eq,
          fx: ch.fx,
          boostDb: ch.boostDb,
        });
      } catch {
        audioEngine.addAppPlaceholder({
          name: ch.name,
          deviceId: ch.deviceId,
          deviceLabel: ch.deviceLabel || ch.name,
          volume: ch.volume,
          muted: ch.muted,
          solo: ch.solo,
          toMix: ch.toMix,
          eq: ch.eq,
          captureMode: "process",
          boostDb: ch.boostDb,
        });
        notes.push(`Open “${ch.name}” and add it again — MixLine taps that app only.`);
      }
      continue;
    }

    if (ch.kind === "app") {
      const matched = findInputDeviceId(ch.deviceId, ch.deviceLabel || ch.name);
      if (matched) {
        try {
          const id = await audioEngine.addAppDevice(matched, ch.name);
          await audioEngine.applyChannelSettings(id, {
            volume: ch.volume,
            muted: ch.muted,
            solo: ch.solo,
            toMix: ch.toMix,
            monitor: ch.monitor,
            eq: ch.eq,
            fx: ch.fx,
            boostDb: ch.boostDb,
          });
        } catch {
          audioEngine.addAppPlaceholder({
            name: ch.name,
            deviceId: ch.deviceId,
            deviceLabel: ch.deviceLabel || ch.name,
            volume: ch.volume,
            muted: ch.muted,
            solo: ch.solo,
            toMix: ch.toMix,
            eq: ch.eq,
            boostDb: ch.boostDb,
          });
          notes.push(`Reconnect “${ch.name}” — pick its audio device on the strip.`);
        }
      } else {
        audioEngine.addAppPlaceholder({
          name: ch.name,
          deviceId: ch.deviceId,
          deviceLabel: ch.deviceLabel || ch.name,
          volume: ch.volume,
          muted: ch.muted,
          solo: ch.solo,
          toMix: ch.toMix,
          eq: ch.eq,
          boostDb: ch.boostDb,
        });
        notes.push(
          `“${ch.name}” is saved but its audio device isn’t connected. Route that app to a virtual cable, then pick the device on the strip.`,
        );
      }
      continue;
    }

    if (ch.kind === "desktop") {
      // System loopback needs a fresh permission each launch — leave a note, don't auto-grab.
      notes.push(
        "System sounds weren’t auto-restored (needs a fresh capture). Add System sounds again only if you want Discord to hear PC/game audio.",
      );
    }
  }

  audioEngine.orderCues(raw.cues.map((cue) => cue.id));

  await syncHotkeys(raw);
  return {
    restored: true,
    note: notes.length ? notes.join(" ") : undefined,
  };
}

/** Convert a KeyboardEvent into an Electron accelerator string. */
export function eventToAccelerator(e: KeyboardEvent): string | null {
  if (["Shift", "Control", "Alt", "Meta"].includes(e.key)) return null;
  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push("CommandOrControl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");

  let key = e.key;
  if (key === " ") key = "Space";
  if (/^Arrow/.test(key)) key = key.replace("Arrow", "");
  if (key.length === 1) key = key.toUpperCase();
  if (/^F\d{1,2}$/i.test(key)) key = key.toUpperCase();

  parts.push(key);
  return parts.join("+");
}
