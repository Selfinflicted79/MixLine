import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import {
  AppWindow,
  Headphones,
  Mic,
  Monitor,
  Plus,
  Radio,
  Save,
  Upload,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { AddAppDialog } from "@/components/mixer/add-app-dialog";
import { ChannelStrip } from "@/components/mixer/channel-strip";
import { DiscordRoute } from "@/components/mixer/discord-route";
import { BusStrip } from "@/components/mixer/bus-strip";
import { Soundboard } from "@/components/mixer/soundboard";
import {
  audioEngine,
  type MixerSnapshot,
} from "@/lib/audio-engine";
import { cloneDefaultEq } from "@/lib/eq-bands";
import {
  persistCueFile,
  restoreSetup,
  saveCurrentSetup,
  syncHotkeys,
} from "@/lib/setup-store";
import type { DesktopSource } from "@/vite-env";
import { cn } from "cn";

const emptySnap: MixerSnapshot = {
  channels: [],
  masterVolume: 0.85,
  masterMuted: false,
  masterPeak: 0,
  masterRms: 0,
  masterEq: cloneDefaultEq(),
  cueMasterVolume: 0.9,
  cueMasterMuted: false,
  cueMasterPeak: 0,
  cueMasterRms: 0,
  cueEq: cloneDefaultEq(),
  running: false,
  anySolo: false,
  monitorMix: false,
  monitorVolume: 0.55,
  discordDeviceId: "",
  outputDevices: [],
  inputDevices: [],
  cues: [],
};

export function MixerBoard() {
  const [snap, setSnap] = useState<MixerSnapshot>(emptySnap);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [appWindows, setAppWindows] = useState<DesktopSource[]>([]);
  const [micPickerOpen, setMicPickerOpen] = useState(false);
  const [isElectron, setIsElectron] = useState(false);
  const [eqChannelId, setEqChannelId] = useState<string | null>(null);
  const [eqBus, setEqBus] = useState<"master" | "cue" | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const [, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const lastSavedJson = useRef("");
  const bootedRef = useRef(false);

  useEffect(() => {
    setIsElectron(!!window.mixlineDesktop);
  }, []);

  useEffect(() => {
    const unsubscribe = audioEngine.subscribe(setSnap);
    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    return () => audioEngine.dispose();
  }, []);

  useEffect(() => {
    if (!window.mixlineDesktop) return;
    return window.mixlineDesktop.onHotkey((cueId) => {
      void audioEngine.playCue(cueId);
    });
  }, []);

  // Autosave when the durable setup actually changes (not every meter tick).
  useEffect(() => {
    if (!started) return;
    const timer = window.setInterval(() => {
      const json = JSON.stringify(audioEngine.exportSetup());
      if (json === lastSavedJson.current) return;
      lastSavedJson.current = json;
      void (async () => {
        try {
          setSaveState("saving");
          await saveCurrentSetup();
          setSaveState("saved");
        } catch {
          setSaveState("error");
        }
      })();
    }, 1200);
    return () => window.clearInterval(timer);
  }, [started]);

  async function bootIfNeeded() {
    await audioEngine.start();
    setStarted(true);
  }

  async function bootAndRestore() {
    setError(null);
    setBusy("boot");
    try {
      await bootIfNeeded();
      if (!bootedRef.current) {
        bootedRef.current = true;
        const result = await restoreSetup();
        if (result.note) setError(result.note);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start audio.");
    } finally {
      setBusy(null);
    }
  }

  async function runAction(label: string, action: () => Promise<unknown>) {
    setError(null);
    setBusy(label);
    try {
      await bootIfNeeded();
      await action();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Something went wrong with audio capture.";
      setError(message);
    } finally {
      setBusy(null);
    }
  }

  async function openAppPicker() {
    setError(null);
    setBusy("app");
    try {
      await bootIfNeeded();
      try {
        const probe = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        probe.getTracks().forEach((t) => t.stop());
      } catch {
        /* may already have permission */
      }
      await audioEngine.refreshDevices();

      if (window.mixlineDesktop) {
        const list = await window.mixlineDesktop.getDesktopSources();
        setAppWindows(list.filter((s) => s.id.startsWith("window:")));
      } else {
        setAppWindows([]);
      }
      setPickerOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not list open apps.");
    } finally {
      setBusy(null);
    }
  }

  async function openMicPicker() {
    setError(null);
    setBusy("mic");
    try {
      await bootIfNeeded();
      const probe = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      probe.getTracks().forEach((t) => t.stop());
      await audioEngine.refreshDevices();
      setMicPickerOpen(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not access microphones.");
    } finally {
      setBusy(null);
    }
  }

  async function handleAddCueFile(file: File) {
    await runAction("addcue", async () => {
      const id = await audioEngine.addCueFromFile(file);
      const cue = audioEngine.snapshot().cues.find((c) => c.id === id);
      if (cue?.fileId) await persistCueFile(cue.fileId, file);
    });
  }

  async function handleHotkey(id: string, hotkey: string | null) {
    audioEngine.setCueHotkey(id, hotkey);
    const failed = await syncHotkeys();
    if (failed.length) {
      setError(`Could not bind hotkey(s): ${failed.join(", ")}. Try another key.`);
    }
  }

  return (
    <div className="relative min-h-full overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(214,196,150,0.45),transparent_55%),radial-gradient(ellipse_at_bottom_right,rgba(140,160,90,0.22),transparent_45%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.18] [background-image:url('data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22120%22 height=%22120%22 viewBox=%220 0 120 120%22%3E%3Cfilter id=%22n%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.85%22 numOctaves=%222%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22120%22 height=%22120%22 filter=%22url(%23n)%22 opacity=%220.55%22/%3E%3C/svg%3E')]" />

      <main className="relative mx-auto flex w-full max-w-[1400px] flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-xl">
            <p className="font-[family-name:var(--font-display)] text-5xl leading-none tracking-[0.04em] text-[color:var(--console-ink)] uppercase sm:text-6xl">
              MixLine
            </p>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-[color:var(--console-muted)] sm:text-base">
              Old-school rack energy for stream cues and Discord send — per-strip mix/mon, EQ, hotkeys, and saved setups.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isElectron ? (
              <div className="inline-flex items-center gap-2 rounded-md border border-[color:var(--console-edge)] bg-[color:var(--chip)] px-3 py-2 text-xs font-semibold tracking-wide text-[color:var(--console-ink)] uppercase">
                Desktop app
              </div>
            ) : null}
            <div className="inline-flex items-center gap-2 rounded-md border border-[color:var(--console-edge)] bg-[color:var(--chip)] px-3 py-2 text-xs text-[color:var(--console-muted)]">
              <Save className="size-3.5" />
              {saveState === "saving"
                ? "Saving…"
                : saveState === "saved"
                  ? "Setup saved"
                  : saveState === "error"
                    ? "Save failed"
                    : "Autosave ready"}
            </div>
            {!started ? (
              <Button
                type="button"
                size="lg"
                className="h-11 rounded-md bg-[color:var(--console-ink)] px-5 text-[color:var(--console-face)] hover:bg-[color:var(--console-ink)]/90"
                onClick={() => void bootAndRestore()}
              >
                <Headphones className="size-4" />
                Power on board
              </Button>
            ) : (
              <div className="inline-flex items-center gap-2 rounded-md border border-[color:var(--console-edge)] bg-[color:var(--chip)] px-3 py-2 text-xs font-semibold tracking-wide text-[color:var(--console-ink)] uppercase">
                <span className="size-2 animate-pulse rounded-full bg-[color:var(--meter-green)]" />
                Board live
              </div>
            )}
          </div>
        </header>

        <DiscordRoute
          snap={snap}
          onRefresh={() => void runAction("refresh", () => audioEngine.refreshOutputDevices())}
          onSelectDevice={(id) =>
            void runAction("sink", () => audioEngine.setDiscordOutputDevice(id))
          }
          onToggleMonitorMix={() => audioEngine.setMonitorMix(!snap.monitorMix)}
          onMonitorVolume={(v) => startTransition(() => audioEngine.setMonitorVolume(v))}
        />

        <Soundboard
          cues={snap.cues}
          anySolo={snap.anySolo}
          onPlay={(id) => void runAction("cue", () => audioEngine.playCue(id))}
          onVolume={(id, v) => startTransition(() => audioEngine.setCueVolume(id, v))}
          onMute={(id) => {
            const cue = snap.cues.find((c) => c.id === id);
            if (cue) audioEngine.setCueMuted(id, !cue.muted);
          }}
          onSolo={(id) => {
            const cue = snap.cues.find((c) => c.id === id);
            if (cue) audioEngine.setCueSolo(id, !cue.solo);
          }}
          onToMix={(id) => {
            const cue = snap.cues.find((c) => c.id === id);
            if (cue) audioEngine.setCueToMix(id, !cue.toMix);
          }}
          onMonitor={(id) => {
            const cue = snap.cues.find((c) => c.id === id);
            if (cue) audioEngine.setCueMonitor(id, !cue.monitor);
          }}
          onAddFile={(file) => void handleAddCueFile(file)}
          onRemove={(id) => {
            const cue = snap.cues.find((c) => c.id === id);
            audioEngine.removeCue(id);
            if (cue?.fileId && window.mixlineDesktop) {
              void window.mixlineDesktop.deleteCueFile(cue.fileId);
            }
            void syncHotkeys();
          }}
          onHotkey={(id, hotkey) => void handleHotkey(id, hotkey)}
        />

        <section className="rack-panel relative rounded-sm p-3 sm:p-4">
          <div className="pointer-events-none absolute top-3 left-5 flex gap-2">
            <span className="rack-screw" />
            <span className="rack-screw" />
          </div>
          <div className="pointer-events-none absolute top-3 right-5 flex gap-2">
            <span className="rack-screw" />
            <span className="rack-screw" />
          </div>
          <div className="mb-4 flex flex-col gap-3 border-b border-black/40 pb-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="font-[family-name:var(--font-display)] text-2xl tracking-[0.06em] text-[color:var(--console-ink)] uppercase">
                Channel rack
              </h2>
              <p className="text-sm text-[color:var(--console-muted)]">
                <span className="font-semibold text-[color:var(--console-ink)]">MON</span> = headphones only.{" "}
                <span className="font-semibold text-[color:var(--console-ink)]">MIX</span> = Discord send.{" "}
                <span className="font-semibold text-[color:var(--console-ink)]">EQ</span> opens the band view — click the strip name to return.
                Cue Send is the master fader for every sound cue before it hits Mix.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <SourceButton
                icon={Mic}
                label="Mic"
                busy={busy === "mic"}
                onClick={() => void openMicPicker()}
              />
              <SourceButton
                icon={AppWindow}
                label="Application"
                busy={busy === "app"}
                onClick={() => void openAppPicker()}
              />
              <SourceButton
                icon={Monitor}
                label="System sounds"
                busy={busy === "desktop"}
                onClick={() =>
                  void runAction("desktop", () => audioEngine.addDesktop("System sounds"))
                }
              />
              <SourceButton
                icon={Upload}
                label="Audio file"
                busy={busy === "file"}
                onClick={() => fileRef.current?.click()}
              />
              <SourceButton
                icon={Radio}
                label="Demo tone"
                busy={busy === "tone"}
                onClick={() =>
                  void runAction("tone", () => audioEngine.addTone("Demo Tone"))
                }
              />
              <input
                ref={fileRef}
                type="file"
                accept="audio/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (!file) return;
                  void runAction("file", () => audioEngine.addFile(file));
                }}
              />
            </div>
          </div>

          {error ? (
            <div
              role="alert"
              className="mb-4 rounded-md border border-[color:var(--meter-red)]/40 bg-[color:var(--meter-red)]/10 px-3 py-2 text-sm text-[color:var(--console-ink)]"
            >
              {error}
            </div>
          ) : null}

          <div className="flex gap-3 overflow-x-auto pb-2">
            {snap.channels.length === 0 ? (
              <EmptyRack onAddMic={() => void openMicPicker()} />
            ) : (
              snap.channels.map((channel) => (
                <ChannelStrip
                  key={channel.id}
                  channel={channel}
                  anySolo={snap.anySolo}
                  eqMode={eqChannelId === channel.id}
                  inputDevices={snap.inputDevices}
                  onVolume={(v) =>
                    startTransition(() => audioEngine.setVolume(channel.id, v))
                  }
                  onMute={() => audioEngine.setMuted(channel.id, !channel.muted)}
                  onSolo={() => audioEngine.setSolo(channel.id, !channel.solo)}
                  onToMix={() => audioEngine.setToMix(channel.id, !channel.toMix)}
                  onMonitor={() =>
                    audioEngine.setChannelMonitor(channel.id, !channel.monitor)
                  }
                  onRename={(name) => audioEngine.renameChannel(channel.id, name)}
                  onRemove={() => {
                    if (eqChannelId === channel.id) setEqChannelId(null);
                    audioEngine.removeChannel(channel.id);
                  }}
                  onMicDevice={
                    channel.kind === "mic"
                      ? (deviceId) =>
                          void runAction("micdev", () =>
                            audioEngine.setMicDevice(channel.id, deviceId),
                          )
                      : channel.kind === "app"
                        ? (deviceId) =>
                            void runAction("appdev", () =>
                              audioEngine.setAppDevice(channel.id, deviceId),
                            )
                        : undefined
                  }
                  onEnterEq={() => {
                    setEqBus(null);
                    setEqChannelId(channel.id);
                  }}
                  onExitEq={() => setEqChannelId(null)}
                  onEqGain={(bandId, gainDb) =>
                    startTransition(() => audioEngine.setEqGain(channel.id, bandId, gainDb))
                  }
                  onResetEq={() => audioEngine.resetEq(channel.id)}
                />
              ))
            )}

            <div className="mx-1 hidden h-52 w-px shrink-0 self-center bg-black/50 sm:block" />

            <BusStrip
              title="Cue"
              subtitle="Cue send"
              accent="orange"
              volume={snap.cueMasterVolume}
              muted={snap.cueMasterMuted}
              peak={snap.cueMasterPeak}
              rms={snap.cueMasterRms}
              eq={snap.cueEq}
              eqMode={eqBus === "cue"}
              onVolume={(v) => startTransition(() => audioEngine.setCueMasterVolume(v))}
              onMute={() => audioEngine.setCueMasterMuted(!snap.cueMasterMuted)}
              onEnterEq={() => {
                setEqChannelId(null);
                setEqBus("cue");
              }}
              onExitEq={() => setEqBus(null)}
              onEqGain={(bandId, gainDb) =>
                startTransition(() => audioEngine.setBusEqGain("cue", bandId, gainDb))
              }
              onResetEq={() => audioEngine.resetBusEq("cue")}
            />

            <BusStrip
              title="Mix"
              subtitle="Main mix"
              accent="green"
              volume={snap.masterVolume}
              muted={snap.masterMuted}
              peak={snap.masterPeak}
              rms={snap.masterRms}
              eq={snap.masterEq}
              eqMode={eqBus === "master"}
              onVolume={(v) => startTransition(() => audioEngine.setMasterVolume(v))}
              onMute={() => audioEngine.setMasterMuted(!snap.masterMuted)}
              onEnterEq={() => {
                setEqChannelId(null);
                setEqBus("master");
              }}
              onExitEq={() => setEqBus(null)}
              onEqGain={(bandId, gainDb) =>
                startTransition(() => audioEngine.setBusEqGain("master", bandId, gainDb))
              }
              onResetEq={() => audioEngine.resetBusEq("master")}
            />
          </div>
        </section>
      </main>

      {pickerOpen ? (
        <AddAppDialog
          windows={appWindows}
          inputDevices={snap.inputDevices}
          onClose={() => setPickerOpen(false)}
          onOpenWindowsSoundSettings={
            window.mixlineDesktop
              ? () => void window.mixlineDesktop?.openSoundSettings()
              : undefined
          }
          onConfirm={(appName, deviceId) => {
            setPickerOpen(false);
            void runAction("app", () => audioEngine.addAppDevice(deviceId, appName));
          }}
        />
      ) : null}

      {micPickerOpen ? (
        <DeviceDialog
          title="Choose microphone"
          subtitle="Pick your real mic — not CABLE Output (that one is for Discord)."
          onClose={() => setMicPickerOpen(false)}
        >
          {snap.inputDevices.length === 0 ? (
            <p className="px-3 py-6 text-sm text-[color:var(--console-muted)]">
              No microphones found. Check Windows privacy settings for mic access.
            </p>
          ) : (
            snap.inputDevices.map((device) => {
              const isCable = /cable|voicemeeter|vb-audio|virtual/i.test(device.label);
              return (
                <button
                  key={device.deviceId}
                  type="button"
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-left text-sm hover:bg-[color:var(--chip)]",
                    isCable
                      ? "text-[color:var(--console-muted)]"
                      : "text-[color:var(--console-ink)]",
                  )}
                  onClick={() => {
                    setMicPickerOpen(false);
                    void runAction("mic", () =>
                      audioEngine.addMic(
                        isCable ? "Mic (virtual)" : "Mic",
                        device.deviceId,
                      ),
                    );
                  }}
                >
                  <Mic className="size-4 shrink-0 opacity-70" />
                  <span className="truncate">
                    {device.label}
                    {isCable ? " — usually skip for voice" : ""}
                  </span>
                </button>
              );
            })
          )}
        </DeviceDialog>
      ) : null}
    </div>
  );
}

function DeviceDialog({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[color:var(--console-ink)]/45 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="max-h-[80vh] w-full max-w-lg overflow-hidden rounded-xl border border-[color:var(--console-edge)] bg-[color:var(--console-face)] shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-[color:var(--console-edge)] px-4 py-3">
          <div>
            <h3 className="font-[family-name:var(--font-display)] text-xl text-[color:var(--console-ink)]">
              {title}
            </h3>
            <p className="text-sm text-[color:var(--console-muted)]">{subtitle}</p>
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
        <div className="max-h-[55vh] overflow-y-auto p-2">{children}</div>
      </div>
    </div>
  );
}

function SourceButton({
  icon: Icon,
  label,
  onClick,
  busy,
}: {
  icon: typeof Mic;
  label: string;
  onClick: () => void;
  busy?: boolean;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      disabled={busy}
      onClick={onClick}
      className={cn(
        "h-10 rounded-md border-[color:var(--console-edge)] bg-[color:var(--chip)] text-[color:var(--console-ink)] hover:bg-[color:var(--chip-hover)]",
        busy && "opacity-70",
      )}
    >
      <Icon className="size-4" />
      {busy ? "…" : label}
    </Button>
  );
}

function EmptyRack({ onAddMic }: { onAddMic: () => void }) {
  return (
    <div className="flex min-h-72 min-w-[16rem] flex-1 flex-col items-start justify-center gap-3 rounded-md border border-dashed border-[color:var(--console-edge)] bg-[color:var(--chip)]/60 px-5 py-6">
      <p className="font-[family-name:var(--font-display)] text-xl text-[color:var(--console-ink)]">
        Empty rack
      </p>
      <p className="max-w-sm text-sm text-[color:var(--console-muted)]">
        Add your mic first so voice and stream cues share the same mix Discord will hear.
      </p>
      <Button
        type="button"
        onClick={onAddMic}
        className="rounded-md bg-[color:var(--console-ink)] text-[color:var(--console-face)] hover:bg-[color:var(--console-ink)]/90"
      >
        <Plus className="size-4" />
        Add mic
      </Button>
    </div>
  );
}
