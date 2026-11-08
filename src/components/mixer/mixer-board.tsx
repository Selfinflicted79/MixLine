import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import {
  AppWindow,
  Headphones,
  Mic,
  Minimize2,
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
import { LiveEq } from "@/components/mixer/live-eq";
import { MediaPlayer } from "@/components/mixer/media-player";
import { MiniRack } from "@/components/mixer/mini-rack";
import { RackTitle } from "@/components/mixer/rack-title";
import { Soundboard } from "@/components/mixer/soundboard";
import { checkMixLineUpdate } from "@/lib/update-check";
import {
  audioEngine,
  type MixerSnapshot,
} from "@/lib/audio-engine";
import { cloneDefaultEq } from "@/lib/eq-bands";
import { FirstRunWizard } from "@/components/mixer/first-run-wizard";
import { MpdAssignPanel } from "@/components/mixer/mpd-assign";
import {
  faderControl,
  knobControl,
  loadMidiDevice,
  loadMpdAssign,
  mapNoteToPad,
  saveMidiDevice,
  saveMpdAssign,
  startMpd226,
  type MidiControllerSession,
  type MpdAssign,
  type MpdControl,
  type MpdStatus,
} from "@/lib/mpd226";
import {
  persistCueFile,
  restoreSetup,
  saveCurrentSetup,
  syncHotkeys,
} from "@/lib/setup-store";
import { hasFinishedWizard } from "@/lib/wizard";
import type { AudioAppInfo } from "@/vite-env";
import { cn } from "cn";
import bphLogo from "@/assets/bph-logo.png";

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
  playerVolume: 0.85,
  playerMuted: false,
  playerToMix: true,
  playerMonitor: false,
  playerPeak: 0,
  playerRms: 0,
  playerPlaying: false,
  playerIndex: 0,
  playerTracks: [],
  channelRackName: "Stream",
  cueRackName: "Main",
  cueBanks: [{ id: "cue-bank-main", name: "Main" }],
  lineBanks: [{ id: "line-bank-stream", name: "Stream" }],
  activeCueBankId: "cue-bank-main",
  activeLineBankId: "line-bank-stream",
  running: false,
  anySolo: false,
  monitorMix: false,
  monitorVolume: 0.55,
  discordDeviceId: "",
  phonesDeviceId: "",
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
  const [audioApps, setAudioApps] = useState<AudioAppInfo[]>([]);
  const [appsError, setAppsError] = useState<string | null>(null);
  const [micPickerOpen, setMicPickerOpen] = useState(false);
  const [isElectron, setIsElectron] = useState(false);
  const [eqChannelId, setEqChannelId] = useState<string | null>(null);
  const [fxChannelId, setFxChannelId] = useState<string | null>(null);
  const [eqBus, setEqBus] = useState<"master" | "cue" | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const [compact, setCompact] = useState(false);
  const [mpd, setMpd] = useState<MpdStatus>({
    connected: false,
    name: null,
    preferred: loadMidiDevice(),
    devices: [],
    shareAvailable: false,
  });
  const [mpdAssign, setMpdAssign] = useState<MpdAssign>(() => loadMpdAssign());
  const [mpdMapOpen, setMpdMapOpen] = useState(false);
  const [sidePanel, setSidePanel] = useState<"eq" | "player">("eq");
  const [updateNote, setUpdateNote] = useState<string | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardForceTour, setWizardForceTour] = useState(false);
  const [, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const lastSavedJson = useRef("");
  const bootedRef = useRef(false);
  const midiSessionRef = useRef<MidiControllerSession | null>(null);
  const learnCueRef = useRef<string | null>(null);
  const [learnCueId, setLearnCueId] = useState<string | null>(null);

  useEffect(() => {
    if (hasFinishedWizard()) return;
    const timer = window.setTimeout(() => {
      setWizardForceTour(false);
      setWizardOpen(true);
    }, 700);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    setIsElectron(!!window.mixlineDesktop);
  }, []);

  useEffect(() => {
    if (!window.mixlineDesktop) return;
    void window.mixlineDesktop.getWindowMode().then((mode) => setCompact(mode === "compact"));
    return window.mixlineDesktop.onWindowMode((mode) => setCompact(mode === "compact"));
  }, []);

  async function setWindowMode(mode: "full" | "compact") {
    setCompact(mode === "compact");
    if (!window.mixlineDesktop) return;
    try {
      const result = await window.mixlineDesktop.setWindowMode(mode);
      setCompact(result.mode === "compact");
    } catch {
      /* browser preview — local UI mode only */
    }
  }

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

  useEffect(() => {
    if (!window.mixlineDesktop?.onMediaKey) return;
    return window.mixlineDesktop.onMediaKey((action) => {
      if (action === "play-pause") audioEngine.togglePlayer();
      else if (action === "next") audioEngine.nextPlayerTrack();
      else if (action === "prev") audioEngine.prevPlayerTrack();
      else if (action === "mute") audioEngine.togglePlayerMute();
    });
  }, []);

  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    const track = snap.playerTracks[snap.playerIndex];
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track?.name ?? "MixLine Player",
      artist: "MixLine",
      album: "Playlist",
    });
    navigator.mediaSession.playbackState = snap.playerPlaying ? "playing" : "paused";
    navigator.mediaSession.setActionHandler("play", () => audioEngine.playPlayer());
    navigator.mediaSession.setActionHandler("pause", () => audioEngine.pausePlayer());
    navigator.mediaSession.setActionHandler("previoustrack", () =>
      audioEngine.prevPlayerTrack(),
    );
    navigator.mediaSession.setActionHandler("nexttrack", () => audioEngine.nextPlayerTrack());
    navigator.mediaSession.setActionHandler("stop", () => audioEngine.pausePlayer());
    return () => {
      navigator.mediaSession.setActionHandler("play", null);
      navigator.mediaSession.setActionHandler("pause", null);
      navigator.mediaSession.setActionHandler("previoustrack", null);
      navigator.mediaSession.setActionHandler("nexttrack", null);
      navigator.mediaSession.setActionHandler("stop", null);
    };
  }, [snap.playerIndex, snap.playerPlaying, snap.playerTracks]);

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

  /** Same source (Cue/Play) shares one key across racks; Mix is per-rack. */
  function mpdSourceKey(control: MpdControl, lineBankId: string) {
    if (control.kind === "none") return "none";
    if (control.kind === "mix") return `mix:${lineBankId}`;
    if (control.kind === "volume") return `vol:${control.id}`;
    if (control.kind === "trim") return `trim:${control.id}`;
    if (control.kind === "eq") return `eq:${control.bandId}`;
    return control.kind;
  }

  function mpdSoftwareValue(control: MpdControl, state: MixerSnapshot) {
    if (control.kind === "volume") {
      return state.channels.find((item) => item.id === control.id)?.volume ?? 0;
    }
    if (control.kind === "trim") {
      const boost = state.channels.find((item) => item.id === control.id)?.boostDb ?? 0;
      return Math.min(1, Math.max(0, boost / 24));
    }
    if (control.kind === "cue") return state.cueMasterVolume;
    if (control.kind === "play") return state.playerVolume;
    if (control.kind === "mix") return state.masterVolume;
    if (control.kind === "eq") {
      const band = state.masterEq.find((item) => item.id === control.bandId);
      return Math.min(1, Math.max(0, ((band?.gainDb ?? 0) + 12) / 24));
    }
    if (control.kind === "phones") return state.monitorVolume;
    return 0;
  }

  type MidiPickup = { armed: boolean; lastMidi: number | null; lastApplied: number | null };
  const midiPickupRef = useRef(new Map<string, MidiPickup>());
  const snapRef = useRef(snap);
  snapRef.current = snap;

  useEffect(() => {
    // New Mix source when the line rack changes — wait for the physical fader to catch up.
    for (const [key, state] of midiPickupRef.current) {
      if (key.startsWith("mix:")) state.armed = false;
    }
  }, [snap.activeLineBankId]);

  function takeMidiPickup(control: MpdControl, midiValue: number) {
    if (control.kind === "none") return false;
    const state = snapRef.current;
    const key = mpdSourceKey(control, state.activeLineBankId);
    let pickup = midiPickupRef.current.get(key);
    if (!pickup) {
      pickup = { armed: false, lastMidi: null, lastApplied: null };
      midiPickupRef.current.set(key, pickup);
    }
    const target = mpdSoftwareValue(control, state);

    // Software moved without this fader (rack switch, Windows tray/headset) → re-arm pickup.
    if (
      pickup.armed &&
      pickup.lastApplied != null &&
      Math.abs(target - pickup.lastApplied) > 0.04 &&
      Math.abs(midiValue - pickup.lastApplied) < 0.025
    ) {
      pickup.armed = false;
    }

    if (!pickup.armed) {
      const near = Math.abs(midiValue - target) <= 0.035;
      const crossed =
        pickup.lastMidi != null && (pickup.lastMidi - target) * (midiValue - target) <= 0;
      pickup.lastMidi = midiValue;
      if (!near && !crossed) return false;
      pickup.armed = true;
    } else {
      pickup.lastMidi = midiValue;
    }
    pickup.lastApplied = midiValue;
    return true;
  }

  function applyMpd(control: MpdControl, value: number) {
    if (control.kind === "none") return;
    if (!takeMidiPickup(control, value)) return;
    if (!bootedRef.current) void bootAndRestore();
    if (control.kind === "volume") audioEngine.setVolume(control.id, value);
    else if (control.kind === "trim") audioEngine.setBoost(control.id, value * 24);
    else if (control.kind === "cue") audioEngine.setCueMasterVolume(value);
    else if (control.kind === "play") audioEngine.setPlayerVolume(value);
    else if (control.kind === "mix") audioEngine.setMasterVolume(value);
    else if (control.kind === "eq") {
      audioEngine.setBusEq("master", control.bandId, { gainDb: value * 24 - 12 });
    } else audioEngine.setMonitorVolume(value);
  }

  function muteMpd(control: MpdControl) {
    if (control.kind === "none" || control.kind === "trim" || control.kind === "eq" || control.kind === "phones") {
      return;
    }
    if (control.kind === "volume") {
      const channel = snap.channels.find((item) => item.id === control.id);
      if (channel) audioEngine.setMuted(channel.id, !channel.muted);
      return;
    }
    if (control.kind === "cue") audioEngine.setCueMasterMuted(!snap.cueMasterMuted);
    if (control.kind === "play") audioEngine.setPlayerMuted(!snap.playerMuted);
    if (control.kind === "mix") audioEngine.setMasterMuted(!snap.masterMuted);
  }

  const midiRef = useRef({
    note: (_note: number) => {},
    fader: (_index: number, _value: number) => {},
    knob: (_index: number, _value: number) => {},
    sw: (_index: number) => {},
  });
  midiRef.current = {
    note: (note) => {
      if (learnCueRef.current) {
        const id = learnCueRef.current;
        learnCueRef.current = null;
        setLearnCueId(null);
        audioEngine.setCueMidiNote(id, note);
        const pad = mapNoteToPad(note);
        if (pad !== null) audioEngine.setCuePad(id, pad);
        return;
      }
      const learned = snap.cues.find((item) => item.midiNote === note);
      if (learned) {
        if (!bootedRef.current) void bootAndRestore();
        void audioEngine.playCue(learned.id);
        return;
      }
      const index = mapNoteToPad(note);
      if (index === null) return;
      const cue = snap.cues.find((item) => item.pad === index);
      if (!cue) return;
      if (!bootedRef.current) void bootAndRestore();
      void audioEngine.playCue(cue.id);
    },
    fader: (index, value) => applyMpd(faderControl(index, mpdAssign, snap.channels), value),
    knob: (index, value) => applyMpd(knobControl(index, mpdAssign, snap.channels), value),
    sw: (index) => muteMpd(faderControl(index, mpdAssign, snap.channels)),
  };

  useEffect(() => {
    const session = startMpd226({
      preferred: loadMidiDevice(),
      onStatus: setMpd,
      onNote: (note) => midiRef.current.note(note),
      onFader: (index, value) => midiRef.current.fader(index, value),
      onKnob: (index, value) => midiRef.current.knob(index, value),
      onSwitch: (index) => midiRef.current.sw(index),
    });
    midiSessionRef.current = session;
    return () => {
      midiSessionRef.current = null;
      session.stop();
    };
  }, []);

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

  async function refreshAudioApps() {
    if (!window.mixlineDesktop?.listAudioApps) {
      setAppsError("Per-app capture only works in the MixLine desktop app.");
      setAudioApps([]);
      return;
    }
    await audioEngine.refreshDevices();
    const list = await window.mixlineDesktop.listAudioApps();
    setAudioApps(list);
    setAppsError(null);
  }

  async function openAppPicker() {
    setError(null);
    setBusy("app");
    try {
      await bootIfNeeded();
      await refreshAudioApps();
      setPickerOpen(true);
    } catch (err) {
      setAppsError(err instanceof Error ? err.message : "Could not list open apps.");
      setPickerOpen(true);
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

  async function handleAddMusicFile(file: File) {
    await runAction("music", async () => {
      await audioEngine.addFile(file, file.name.replace(/\.[^.]+$/, "") || "Music");
    });
  }

  function pickLocalMusic() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "audio/*";
    input.onchange = () => {
      const file = input.files?.[0];
      if (file) void handleAddMusicFile(file);
    };
    input.click();
  }

  async function handleHotkey(id: string, hotkey: string | null) {
    audioEngine.setCueHotkey(id, hotkey);
    const failed = await syncHotkeys();
    if (failed.length) {
      setError(`Could not bind hotkey(s): ${failed.join(", ")}. Try another key.`);
    }
  }

  if (compact) {
    return (
      <MiniRack
        snap={snap}
        started={started}
        busy={busy}
        onExpand={() => void setWindowMode("full")}
        onPower={() => void bootAndRestore()}
        onPlayCue={(id) => void runAction("cue", () => audioEngine.playCue(id))}
        onChannelVolume={(id, v) => startTransition(() => audioEngine.setVolume(id, v))}
        onMasterVolume={(v) => startTransition(() => audioEngine.setMasterVolume(v))}
        onCueMasterVolume={(v) => startTransition(() => audioEngine.setCueMasterVolume(v))}
        onToggleMasterMute={() => audioEngine.setMasterMuted(!snap.masterMuted)}
        onToggleCueMasterMute={() => audioEngine.setCueMasterMuted(!snap.cueMasterMuted)}
        onSelectDiscord={(id) =>
          void runAction("sink", () => audioEngine.setDiscordOutputDevice(id))
        }
        mpdShared={mpd.connected}
        midiLabel={mpd.name === "BPH Share" ? "BPH Share" : mpd.connected ? "MIDI" : null}
      />
    );
  }

  return (
    <div className="rack-shell relative h-dvh overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_18%_0%,rgba(77,232,255,0.18),transparent_42%),radial-gradient(ellipse_at_85%_8%,rgba(255,79,216,0.16),transparent_40%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.12] [background-image:url('data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22120%22 height=%22120%22 viewBox=%220 0 120 120%22%3E%3Cfilter id=%22n%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.85%22 numOctaves=%222%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22120%22 height=%22120%22 filter=%22url(%23n)%22 opacity=%220.55%22/%3E%3C/svg%3E')]" />

      <main className="relative mx-auto flex h-full w-full max-w-[1800px] flex-col gap-[var(--rack-gap)] px-[var(--rack-x)] py-[var(--rack-y)]">
        <header className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            {started ? (
              <div
                className="logo-screen logo-screen--on shrink-0"
                aria-label="Badly Played Hub display"
              >
                <div className="logo-screen__glass">
                  <img
                    src={bphLogo}
                    alt="Badly Played Hub"
                    className="bph-logo"
                    width={160}
                    height={160}
                  />
                  <span className="logo-screen__standby">Standby</span>
                </div>
                <span className="logo-screen__led" aria-hidden />
              </div>
            ) : (
              <button
                type="button"
                className="logo-screen shrink-0"
                aria-label="Power on Badly Played Hub display"
                onClick={() => void bootAndRestore()}
              >
                <div className="logo-screen__glass">
                  <img
                    src={bphLogo}
                    alt=""
                    className="bph-logo"
                    width={160}
                    height={160}
                  />
                  <span className="logo-screen__standby">Standby</span>
                </div>
                <span className="logo-screen__led" aria-hidden />
              </button>
            )}
            <div className="min-w-0">
              <p
                className={cn(
                  "brand-eyebrow text-[length:var(--brand-eyebrow)] font-semibold tracking-[0.28em] uppercase",
                  started && "brand-eyebrow--on",
                )}
              >
                Badly Played Hub
              </p>
              <p
                className={cn(
                  "brand-wordmark mt-0.5 text-[length:var(--brand-title)] leading-none",
                  started && "brand-wordmark--on",
                )}
              >
                MixLine
              </p>
              <p className="rack-help mt-1.5 max-w-2xl text-[length:var(--rack-copy)] leading-snug text-[color:var(--console-muted)]">
                {started
                  ? "Neon rack for stream cues and Discord send — mix/mon, EQ, hotkeys, saved setups."
                  : "Hit Power on board — or tap the dark screen — and the logo boots with the rack."}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            {isElectron ? (
              <Button
                type="button"
                variant="outline"
                className="h-9 rounded-md border-[color:var(--neon-cyan)]/30 bg-[color:var(--chip)] text-[color:var(--console-ink)] hover:bg-[color:var(--chip-hover)]"
                onClick={() => void setWindowMode("compact")}
                title="Mini mixer in the corner"
              >
                <Minimize2 className="size-4" />
                Mini mixer
              </Button>
            ) : null}
            <div className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-[color:var(--chip)] px-3 py-2 text-xs text-[color:var(--console-muted)]">
              <Save className="size-3.5" />
              {saveState === "saving"
                ? "Saving…"
                : saveState === "saved"
                  ? "Setup saved"
                  : saveState === "error"
                    ? "Save failed"
                    : "Autosave ready"}
            </div>
            <Button
              type="button"
              variant="outline"
              className="h-9 rounded-md border-white/10 bg-[color:var(--chip)] text-[color:var(--console-ink)]"
              onClick={() => {
                setWizardForceTour(true);
                setWizardOpen(true);
              }}
              title="Replay the MixLine wizard"
            >
              Wizard
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-9 rounded-md border-white/10 bg-[color:var(--chip)] text-[color:var(--console-ink)]"
              onClick={() =>
                void (async () => {
                  try {
                    const result = await checkMixLineUpdate("0.2.35");
                    if (!result.available) {
                      setUpdateNote("You're on the latest MixLine.");
                      return;
                    }
                    setUpdateNote(`Update ${result.tag} is ready.`);
                    if (result.page) {
                      window.open(result.page, "_blank", "noopener,noreferrer");
                    }
                  } catch {
                    setUpdateNote("Could not check for updates.");
                  }
                })()
              }
            >
              Updates
            </Button>
            {updateNote ? (
              <span className="max-w-[12rem] truncate text-[10px] text-[color:var(--console-muted)]">
                {updateNote}
              </span>
            ) : null}
            {!started ? (
              <Button
                type="button"
                size="lg"
                className="h-9 rounded-md border border-[color:var(--neon-magenta)]/40 bg-[linear-gradient(105deg,var(--neon-cyan),var(--neon-magenta))] px-4 font-semibold text-[#07080d] shadow-[0_0_24px_rgba(255,79,216,0.25)] hover:opacity-95"
                onClick={() => void bootAndRestore()}
              >
                <Headphones className="size-4" />
                Power on board
              </Button>
            ) : (
              <div className="inline-flex items-center gap-2 rounded-md border border-[color:var(--meter-green)]/35 bg-[color:var(--chip)] px-3 py-2 text-xs font-semibold tracking-wide text-[color:var(--console-ink)] uppercase">
                <span className="size-2 animate-pulse rounded-full bg-[color:var(--meter-green)] shadow-[0_0_8px_var(--meter-green)]" />
                Board live
              </div>
            )}
          </div>
        </header>

        <DiscordRoute
          snap={snap}
          onRefresh={() => void runAction("refresh", () => audioEngine.refreshOutputDevices())}
          onSelectSend={(id) =>
            void runAction("sink", () => audioEngine.setDiscordOutputDevice(id))
          }
          onSelectPhones={(id) =>
            void runAction("phones", () => audioEngine.setPhonesOutputDevice(id))
          }
          onToggleMonitorMix={() => audioEngine.setMonitorMix(!snap.monitorMix)}
          onMonitorVolume={(v) => startTransition(() => audioEngine.setMonitorVolume(v))}
        />

        <Soundboard
          cues={snap.cues}
          rackName={snap.cueRackName}
          started={started}
          bankIndex={Math.max(
            0,
            snap.cueBanks.findIndex((b) => b.id === snap.activeCueBankId),
          )}
          bankCount={snap.cueBanks.length}
          canAddBank={snap.cueBanks.length < 3}
          onAddBank={() => audioEngine.addCueBank()}
          onPrevBank={() => audioEngine.cycleCueBank(-1)}
          onNextBank={() => audioEngine.cycleCueBank(1)}
          onRenameRack={(name) => audioEngine.setCueRackName(name)}
          anySolo={snap.anySolo}
          onPlay={(id) => void runAction("cue", () => audioEngine.playCue(id))}
          onKill={(id) => audioEngine.stopCue(id)}
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
          onReorder={(id, toIndex) => audioEngine.moveCue(id, toIndex)}
          onPad={(id, pad) => {
            audioEngine.setCueMidiNote(id, null);
            audioEngine.setCuePad(id, pad);
          }}
          onLearnPad={(id) => {
            learnCueRef.current = id;
            setLearnCueId(id);
          }}
          learnCueId={learnCueId}
          onCancelLearn={() => {
            learnCueRef.current = null;
            setLearnCueId(null);
          }}
        />

        <section className="rack-panel relative flex min-h-0 flex-1 flex-col rounded-sm p-[var(--rack-pad)]">
          <div className="pointer-events-none absolute top-2 left-3 flex gap-2">
            <span className="rack-screw" />
            <span className="rack-screw" />
          </div>
          <div className="pointer-events-none absolute top-2 right-3 flex gap-2">
            <span className="rack-screw" />
            <span className="rack-screw" />
          </div>
          <div className="mb-[var(--rack-gap)] flex shrink-0 flex-col gap-2 border-b border-black/40 pb-[var(--rack-gap)] lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <RackTitle
                prefix="Line Rack"
                name={snap.channelRackName}
                lit={started}
                bankIndex={Math.max(
                  0,
                  snap.lineBanks.findIndex((b) => b.id === snap.activeLineBankId),
                )}
                bankCount={snap.lineBanks.length}
                canAddBank={snap.lineBanks.length < 3}
                onAddBank={() => audioEngine.addLineBank()}
                onPrevBank={() => audioEngine.cycleLineBank(-1)}
                onNextBank={() => audioEngine.cycleLineBank(1)}
                onRename={(name) => audioEngine.setChannelRackName(name)}
              />
            </div>

            <div className="relative flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-sm border px-2 py-1 text-[10px] font-bold tracking-[0.14em] uppercase",
                  mpd.connected
                    ? "border-[color:var(--meter-green)]/40 text-[color:var(--meter-green)]"
                    : "border-white/10 text-[color:var(--console-muted)]",
                  mpdMapOpen && "bg-white/5",
                )}
                title={
                  mpd.name === "BPH Share"
                    ? "Stream Controller is sharing the controller with MixLine."
                    : mpd.name
                      ? `Linked to ${mpd.name}. Open to pick another controller or map sliders.`
                      : "Scan and pick a MIDI controller. Map the free sliders and knobs."
                }
                onClick={() => setMpdMapOpen((open) => !open)}
              >
                <span
                  className={cn(
                    "size-1.5 rounded-full",
                    mpd.connected ? "bg-[color:var(--meter-green)] shadow-[0_0_6px_var(--meter-green)]" : "bg-white/25",
                  )}
                />
                {mpd.connected
                  ? mpd.name === "BPH Share"
                    ? "BPH Share"
                    : (mpd.name ?? "MIDI").length > 18
                      ? `${(mpd.name ?? "MIDI").slice(0, 16)}…`
                      : (mpd.name ?? "MIDI")
                  : "MIDI off"}
              </button>
              {mpdMapOpen ? (
                <MpdAssignPanel
                  channels={snap.channels}
                  assign={mpdAssign}
                  midi={mpd}
                  onChange={(next) => {
                    setMpdAssign(next);
                    saveMpdAssign(next);
                  }}
                  onDevice={(id) => {
                    saveMidiDevice(id);
                    midiSessionRef.current?.setPreferred(id);
                  }}
                  onRefresh={() => midiSessionRef.current?.refresh()}
                />
              ) : null}
              <SourceButton
                icon={Mic}
                label="Mic"
                busy={busy === "mic"}
                onClick={() => void openMicPicker()}
              />
              <SourceButton
                icon={AppWindow}
                label="App"
                busy={busy === "app" || busy === "music"}
                onClick={() => void openAppPicker()}
              />
              <SourceButton
                icon={Monitor}
                label="System"
                busy={busy === "desktop"}
                onClick={() =>
                  void runAction("desktop", () => audioEngine.addDesktop("System sounds"))
                }
              />
              <SourceButton
                icon={Upload}
                label="File"
                busy={busy === "file"}
                onClick={() => fileRef.current?.click()}
              />
              <SourceButton
                icon={Radio}
                label="Tone"
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
              className="mb-2 shrink-0 rounded-md border border-[color:var(--meter-red)]/40 bg-[color:var(--meter-red)]/10 px-3 py-2 text-sm text-[color:var(--console-ink)]"
            >
              {error}
            </div>
          ) : null}

          <div className="flex min-h-0 flex-1 gap-[var(--strip-gap)] overflow-hidden pb-1">
            <div className="flex min-w-0 shrink gap-[var(--strip-gap)] overflow-x-auto overflow-y-hidden">
            {snap.channels.length === 0 ? (
              <EmptyRack
                listenRack={snap.activeLineBankId !== snap.lineBanks[0]?.id}
                onAddMic={() => void openMicPicker()}
              />
            ) : (
              snap.channels.map((channel) => (
                <ChannelStrip
                  key={channel.id}
                  channel={channel}
                  anySolo={snap.anySolo}
                  eqMode={eqChannelId === channel.id}
                  fxMode={fxChannelId === channel.id}
                  inputDevices={snap.inputDevices}
                  onVolume={(v) =>
                    startTransition(() => audioEngine.setVolume(channel.id, v))
                  }
                  onBoost={(db) =>
                    startTransition(() => audioEngine.setBoost(channel.id, db))
                  }
                  onMute={() => audioEngine.setMuted(channel.id, !channel.muted)}
                  onSolo={() => audioEngine.setSolo(channel.id, !channel.solo)}
                  onToMix={() => {
                    const warning = audioEngine.setToMix(channel.id, !channel.toMix);
                    if (warning) setError(warning);
                  }}
                  onMonitor={() =>
                    audioEngine.setChannelMonitor(channel.id, !channel.monitor)
                  }
                  onRename={(name) => audioEngine.renameChannel(channel.id, name)}
                  onRemove={() => {
                    if (eqChannelId === channel.id) setEqChannelId(null);
                    if (fxChannelId === channel.id) setFxChannelId(null);
                    audioEngine.removeChannel(channel.id);
                  }}
                  onMicDevice={
                    channel.kind === "mic"
                      ? (deviceId) =>
                          void runAction("micdev", () =>
                            audioEngine.setMicDevice(channel.id, deviceId),
                          )
                      : channel.kind === "app" && channel.captureMode === "device"
                        ? (deviceId) =>
                            void runAction("appdev", () =>
                              audioEngine.setAppDevice(channel.id, deviceId),
                            )
                        : undefined
                  }
                  onNoiseCancel={
                    channel.kind === "mic"
                      ? (enabled) =>
                          void runAction("nc", () =>
                            audioEngine.setMicNoiseCancel(channel.id, enabled),
                          )
                      : undefined
                  }
                  onNoiseGate={
                    channel.kind === "mic"
                      ? (amount) =>
                          startTransition(() => audioEngine.setMicNoiseGate(channel.id, amount))
                      : undefined
                  }
                  onEnterEq={() => {
                    setEqBus(null);
                    setFxChannelId(null);
                    setEqChannelId(channel.id);
                  }}
                  onExitEq={() => setEqChannelId(null)}
                  onEqGain={(bandId, gainDb) =>
                    startTransition(() => audioEngine.setEqGain(channel.id, bandId, gainDb))
                  }
                  onResetEq={() => audioEngine.resetEq(channel.id)}
                  onEnterFx={() => {
                    setEqBus(null);
                    setEqChannelId(null);
                    setFxChannelId(channel.id);
                  }}
                  onExitFx={() => setFxChannelId(null)}
                  onFx={(patch) =>
                    startTransition(() => audioEngine.setChannelFx(channel.id, patch))
                  }
                  onResetFx={() => audioEngine.resetChannelFx(channel.id)}
                />
              ))
            )}

            <div className="mx-1 hidden h-[var(--fader-h,13rem)] w-px shrink-0 self-center bg-black/50 sm:block" />

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
              title="Play"
              subtitle="MIX stream · MON ears"
              accent="magenta"
              volume={snap.playerVolume}
              muted={snap.playerMuted}
              peak={snap.playerPeak}
              rms={snap.playerRms}
              eq={snap.masterEq}
              eqMode={false}
              showEq={false}
              showMix
              toMix={snap.playerToMix}
              onToMix={() => audioEngine.setPlayerToMix(!snap.playerToMix)}
              showMonitor
              monitor={snap.playerMonitor}
              onMonitor={() => audioEngine.setPlayerMonitor(!snap.playerMonitor)}
              onVolume={(v) => startTransition(() => audioEngine.setPlayerVolume(v))}
              onMute={() => audioEngine.setPlayerMuted(!snap.playerMuted)}
              onEnterEq={() => undefined}
              onExitEq={() => undefined}
              onEqGain={() => undefined}
              onResetEq={() => undefined}
            />
            </div>

            <div className="min-w-4 flex-1" />

            <BusStrip
              title="Mix"
              subtitle={
                snap.activeLineBankId === snap.lineBanks[0]?.id
                  ? `${snap.channelRackName} send`
                  : `${snap.channelRackName} · Windows vol`
              }
              accent="green"
              volume={snap.masterVolume}
              muted={snap.masterMuted}
              peak={snap.masterPeak}
              rms={snap.masterRms}
              eq={snap.masterEq}
              eqMode={false}
              showEq={false}
              onVolume={(v) => startTransition(() => audioEngine.setMasterVolume(v))}
              onMute={() => audioEngine.setMasterMuted(!snap.masterMuted)}
              onEnterEq={() => undefined}
              onExitEq={() => undefined}
              onEqGain={() => undefined}
              onResetEq={() => audioEngine.resetBusEq("master")}
            />

            <div className="flex h-full w-[24rem] shrink-0 flex-col gap-1.5">
              <div className="flex shrink-0 gap-1">
                <button
                  type="button"
                  className={cn(
                    "h-7 flex-1 rounded-sm border text-[10px] font-bold tracking-[0.14em] uppercase",
                    sidePanel === "eq"
                      ? "border-[color:var(--neon-cyan)]/50 bg-[color:var(--neon-cyan)]/15 text-[color:var(--neon-cyan)]"
                      : "border-white/10 text-[color:var(--console-muted)] hover:bg-white/5",
                  )}
                  onClick={() => setSidePanel("eq")}
                >
                  Live EQ
                </button>
                <button
                  type="button"
                  className={cn(
                    "h-7 flex-1 rounded-sm border text-[10px] font-bold tracking-[0.14em] uppercase",
                    sidePanel === "player"
                      ? "border-[color:var(--neon-magenta)]/50 bg-[color:var(--neon-magenta)]/15 text-[color:var(--neon-magenta)]"
                      : "border-white/10 text-[color:var(--console-muted)] hover:bg-white/5",
                  )}
                  onClick={() => setSidePanel("player")}
                >
                  Player
                </button>
              </div>
              <div className="min-h-0 flex-1">
                {sidePanel === "eq" ? (
                  <LiveEq
                    bands={snap.masterEq}
                    trackLabel={
                      snap.playerTracks[snap.playerIndex]
                        ? `${snap.playerPlaying ? "▶" : "❚❚"} ${snap.playerTracks[snap.playerIndex]!.name}`
                        : "No track"
                    }
                    trackLive={snap.playerPlaying}
                    onChange={(bandId, patch) =>
                      startTransition(() => audioEngine.setBusEq("master", bandId, patch))
                    }
                    onReset={() => audioEngine.resetBusEq("master")}
                  />
                ) : (
                  <MediaPlayer
                    tracks={snap.playerTracks}
                    index={snap.playerIndex}
                    playing={snap.playerPlaying}
                    onAdd={(files) =>
                      void runAction("player", async () => {
                        let added = 0;
                        const failed: string[] = [];
                        for (const file of files) {
                          try {
                            const id = await audioEngine.addPlayerTrack(file);
                            added += 1;
                            try {
                              await persistCueFile(id, file);
                            } catch {
                              /* keep the track in-session even if disk save fails */
                            }
                          } catch {
                            failed.push(file.name);
                          }
                        }
                        if (!added && failed.length) {
                          throw new Error(
                            `Could not decode: ${failed.slice(0, 3).join(", ")}`,
                          );
                        }
                        if (failed.length) {
                          setError(
                            `Added ${added}, skipped ${failed.length} file(s).`,
                          );
                        }
                      })
                    }
                    onRemove={(id) => {
                      const track = snap.playerTracks.find((t) => t.id === id);
                      audioEngine.removePlayerTrack(id);
                      const fileId = track?.fileId ?? id;
                      if (window.mixlineDesktop) {
                        void window.mixlineDesktop.deleteCueFile(fileId);
                      }
                    }}
                    onReorder={(id, toIndex) => audioEngine.movePlayerTrack(id, toIndex)}
                    onPlay={(index) => audioEngine.playPlayer(index)}
                    onPause={() => audioEngine.pausePlayer()}
                    onNext={() => audioEngine.nextPlayerTrack()}
                    onPrev={() => audioEngine.prevPlayerTrack()}
                  />
                )}
              </div>
            </div>
          </div>
        </section>
      </main>

      {pickerOpen ? (
        <AddAppDialog
          apps={audioApps}
          appsError={appsError}
          inputDevices={snap.inputDevices}
          onClose={() => setPickerOpen(false)}
          onRefresh={() => void refreshAudioApps().catch((err) => {
            setAppsError(err instanceof Error ? err.message : "Could not list open apps.");
          })}
          onOpenWindowsSoundSettings={
            window.mixlineDesktop
              ? () => void window.mixlineDesktop?.openSoundSettings()
              : undefined
          }
          onPickLocalMusic={pickLocalMusic}
          onPickApp={(app) => {
            setPickerOpen(false);
            void runAction("app", () =>
              audioEngine.addAppProcess({ pid: app.pid, name: app.name, exe: app.exe }),
            );
          }}
          onConfirmCable={(appName, deviceId) => {
            setPickerOpen(false);
            void runAction("app", () => audioEngine.addAppDevice(deviceId, appName));
          }}
        />
      ) : null}

      {micPickerOpen ? (
        <DeviceDialog
          title="Choose microphone"
          subtitle="Real mic only. Music apps are under Music — they never show up as mics."
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

      <FirstRunWizard
        open={wizardOpen}
        forceTour={wizardForceTour}
        onClose={() => {
          setWizardOpen(false);
          setWizardForceTour(false);
        }}
      />
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
            <h3 className="font-[family-name:var(--font-rack)] text-lg tracking-[0.08em] text-[color:var(--console-ink)] uppercase">
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
        "h-8 rounded-md border-[color:var(--console-edge)] bg-[color:var(--chip)] px-2.5 text-xs text-[color:var(--console-ink)] hover:bg-[color:var(--chip-hover)]",
        busy && "opacity-70",
      )}
    >
      <Icon className="size-3.5" />
      {busy ? "…" : label}
    </Button>
  );
}

function EmptyRack({
  onAddMic,
  listenRack = false,
}: {
  onAddMic: () => void;
  listenRack?: boolean;
}) {
  return (
    <div className="flex min-h-72 min-w-[16rem] flex-1 flex-col items-start justify-center gap-3 rounded-md border border-dashed border-[color:var(--console-edge)] bg-[color:var(--chip)]/60 px-5 py-6">
      <p className="font-[family-name:var(--font-rack)] text-lg tracking-[0.1em] text-[color:var(--console-ink)] uppercase">
        Empty rack
      </p>
      <p className="max-w-sm text-sm text-[color:var(--console-muted)]">
        {listenRack
          ? "PC / listen rack: set Mix send to your headset. The green Mix fader moves Windows volume for that device (the tray slider). Meter follows real output. Use Player MON for MixLine music; System capture will echo."
          : "Add a mic, app, or file for this rack. Route Mix send to wherever this bank should play — cable, headphones, TV, monitors, VR, and so on."}
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
