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
  onHotkey: (handler: (cueId: string) => void) => () => void;
};

declare global {
  interface Window {
    mixlineDesktop?: MixlineDesktopApi;
  }
}

export {};
