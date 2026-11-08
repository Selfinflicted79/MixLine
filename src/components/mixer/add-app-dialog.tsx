import { useMemo, useState } from "react";
import { AppWindow, Cable, Music2, RefreshCw, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AudioDevice } from "@/lib/audio-engine";
import type { AudioAppInfo } from "@/vite-env";

function isMicDevice(label: string) {
  return /microphone|headset|mic\b|webcam|camera/i.test(label);
}

function isVirtualCable(label: string) {
  return /cable|voicemeeter|vb-audio|virtual|vaux|vaio/i.test(label);
}

function isCableCapture(label: string) {
  return /cable\s*output|vb-audio.*output|voicemeeter\s*(output|out|aux|vaio|insert)/i.test(label);
}

function isCablePlayback(label: string) {
  return /cable\s*input|vb-audio.*input|voicemeeter\s*(input|in)/i.test(label);
}

type AddAppDialogProps = {
  apps: AudioAppInfo[];
  appsError: string | null;
  inputDevices: AudioDevice[];
  onClose: () => void;
  onRefresh: () => void;
  onPickApp: (app: AudioAppInfo) => void;
  onPickLocalMusic: () => void;
  onConfirmCable: (name: string, deviceId: string) => void;
  onOpenWindowsSoundSettings?: () => void;
};

export function AddAppDialog({
  apps,
  appsError,
  inputDevices,
  onClose,
  onRefresh,
  onPickApp,
  onPickLocalMusic,
  onConfirmCable,
  onOpenWindowsSoundSettings,
}: AddAppDialogProps) {
  const [query, setQuery] = useState("");
  const [showCable, setShowCable] = useState(false);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return apps;
    return apps.filter((app) =>
      `${app.name} ${app.hint} ${app.exe}`.toLowerCase().includes(q),
    );
  }, [apps, query]);

  const cables = useMemo(
    () =>
      inputDevices.filter((device) => {
        if (isMicDevice(device.label) || !isVirtualCable(device.label)) return false;
        if (isCablePlayback(device.label) && !isCableCapture(device.label)) return false;
        return true;
      }),
    [inputDevices],
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[color:var(--console-ink)]/45 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Add application"
        className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-xl border border-[color:var(--console-edge)] bg-[color:var(--console-face)] shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-[color:var(--console-edge)] px-4 py-3">
          <div>
            <h3 className="font-[family-name:var(--font-rack)] text-lg tracking-[0.08em] text-[color:var(--console-ink)] uppercase">
              App sound
            </h3>
            <p className="mt-1 text-sm text-[color:var(--console-muted)]">
              Pick one program. MixLine taps only that app — the game and Discord stay on their own
              sliders. MIX sends it to the output you selected, usually VB-Cable, so friends can hear it.
            </p>
          </div>
          <button
            type="button"
            className="rounded-md p-1 text-[color:var(--console-muted)] hover:bg-[color:var(--chip)]"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
          <div className="flex gap-2">
            <label className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute top-2 left-2 size-3.5 text-[color:var(--console-muted)]" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="YouTube, Chrome, Cursor, Discord…"
                className="h-8 w-full rounded-md border border-[color:var(--console-edge)] bg-[color:var(--chip)] pr-2 pl-7 text-sm text-[color:var(--console-ink)] outline-none"
              />
            </label>
            <Button
              type="button"
              variant="outline"
              className="h-8 border-[color:var(--console-edge)] bg-[color:var(--chip)] px-2 text-[color:var(--console-ink)]"
              onClick={onRefresh}
              title="Refresh app list"
            >
              <RefreshCw className="size-3.5" />
            </Button>
          </div>

          {appsError ? (
            <p className="rounded-md border border-[color:var(--meter-red)]/40 bg-[color:var(--meter-red)]/10 px-3 py-2 text-sm text-[color:var(--console-ink)]">
              {appsError}
            </p>
          ) : null}

          {visible.length === 0 ? (
            <p className="px-1 py-3 text-sm text-[color:var(--console-muted)]">
              Nothing matches. Start the video or the AI voice, then hit refresh. YouTube Music shows up
              as its Chrome window.
            </p>
          ) : (
            <div className="space-y-1">
              {visible.map((app) => (
                <button
                  key={`${app.exe}-${app.pid}`}
                  type="button"
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left hover:bg-[color:var(--chip)]"
                  onClick={() => onPickApp(app)}
                >
                  <AppWindow className="size-4 shrink-0 text-[color:var(--neon-cyan)]" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-[color:var(--console-ink)]">
                      {app.name}
                    </span>
                    <span className="block truncate text-[11px] text-[color:var(--console-muted)]">
                      {app.hint ? `${app.hint} · ` : ""}
                      {app.exe}
                      {app.state === "active" ? " · playing" : ""}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}

          <p className="text-xs text-[color:var(--console-muted)]">
            Tip: put YouTube Music in a different browser than other Chrome tabs if you want separate
            faders.
          </p>

          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-md border border-white/10 px-3 py-2 text-left text-sm text-[color:var(--console-ink)] hover:bg-[color:var(--chip)]"
            onClick={() => {
              onClose();
              onPickLocalMusic();
            }}
          >
            <Music2 className="size-4 text-[color:var(--neon-cyan)]" />
            Local audio file
          </button>

          <button
            type="button"
            className="text-xs text-[color:var(--console-muted)] underline"
            onClick={() => setShowCable((v) => !v)}
          >
            {showCable ? "Hide virtual cable" : "Use a virtual cable instead"}
          </button>

          {showCable ? (
            <div className="space-y-2 rounded-md border border-[color:var(--neon-cyan)]/30 bg-[color:var(--neon-cyan)]/5 p-2">
              <p className="text-xs text-[color:var(--console-ink)]">
                Point the app at Cable A Input in Windows, then pick Cable A Output here.
                {onOpenWindowsSoundSettings ? (
                  <>
                    {" "}
                    <button type="button" className="underline" onClick={onOpenWindowsSoundSettings}>
                      Open volume mixer
                    </button>
                  </>
                ) : null}
              </p>
              {cables.length === 0 ? (
                <p className="text-xs text-[color:var(--console-muted)]">No cable capture device found.</p>
              ) : (
                cables.map((device) => (
                  <button
                    key={device.deviceId}
                    type="button"
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-[color:var(--console-ink)] hover:bg-[color:var(--chip)]"
                    onClick={() => onConfirmCable("Cable", device.deviceId)}
                  >
                    <Cable className="size-3.5 shrink-0" />
                    <span className="truncate">{device.label}</span>
                  </button>
                ))
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
