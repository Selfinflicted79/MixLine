/// <reference types="vite/client" />

export type DesktopSource = {
  id: string;
  name: string;
  display_id: string;
};

export type HotkeyBinding = {
  cueId: string;
  accelerator: string;
};

export type AudioAppInfo = {
  pid: number;
  name: string;
  exe: string;
  hint: string;
  state: "active" | "inactive";
};

export type MixlineDesktopApi = {
  isElectron: true;
  getDesktopSources: () => Promise<DesktopSource[]>;
  getMicAccessStatus: () => Promise<string>;
  requestMicAccess: () => Promise<boolean>;
  loadSetup: () => Promise<unknown | null>;
  saveSetup: (setup: unknown) => Promise<boolean>;
  saveCueFile: (fileId: string, bytes: Uint8Array) => Promise<boolean>;
  loadCueFile: (fileId: string) => Promise<ArrayBuffer | null>;
  deleteCueFile: (fileId: string) => Promise<boolean>;
  registerHotkeys: (
    bindings: HotkeyBinding[],
  ) => Promise<{ ok: boolean; failed: string[] }>;
  openSoundSettings: () => Promise<boolean>;
  openWidgetUrl: (url: string, browser?: "edge" | "chrome") => Promise<{ ok: boolean }>;
  listAudioApps: () => Promise<AudioAppInfo[]>;
  startAppCapture: (pid: number) => Promise<{ id: string }>;
  stopAppCapture: (id: string) => Promise<boolean>;
  onAppPcm: (handler: (id: string, bytes: Uint8Array) => void) => () => void;
  onAppCaptureEnded: (
    handler: (info: { id: string; code: number | null; error: string }) => void,
  ) => () => void;
  getWindowMode: () => Promise<"full" | "compact">;
  setWindowMode: (
    mode: "full" | "compact",
  ) => Promise<{ ok: boolean; mode: "full" | "compact" }>;
  onWindowMode: (handler: (mode: "full" | "compact") => void) => () => void;
  onHotkey: (handler: (cueId: string) => void) => () => void;
  onMediaKey: (
    handler: (action: "play-pause" | "next" | "prev" | "mute") => void,
  ) => () => void;
};

declare global {
  interface Window {
    mixlineDesktop?: MixlineDesktopApi;
  }
}

export {};
