import { cloneDefaultEq, dbToLinear, type EqBand } from "@/lib/eq-bands";
import {
  clampFx,
  createFxGraph,
  defaultFx,
  makeImpulse,
  type ChannelFx,
  type FxGraph,
} from "@/lib/fx-graph";

export type ChannelKind = "mic" | "desktop" | "app" | "file" | "tone";

/** How this strip gets audio. `process` = one app (OBS-style). `device` = one input. `system` = all PC audio. */
export type CaptureMode = "device" | "system" | "process" | "none";

export type ChannelSnapshot = {
  id: string;
  name: string;
  kind: ChannelKind;
  volume: number;
  muted: boolean;
  solo: boolean;
  toMix: boolean;
  monitor: boolean;
  connected: boolean;
  peak: number;
  rms: number;
  deviceId: string;
  deviceLabel: string;
  captureMode: CaptureMode;
  needsReconnect: boolean;
  eq: EqBand[];
  fx: ChannelFx;
  /** Input trim in dB, 0..24. Raises a quiet source before the fader. */
  boostDb: number;
};

export type AudioDevice = {
  deviceId: string;
  label: string;
};

export type OutputDevice = AudioDevice;

export type CuePad = {
  id: string;
  name: string;
  builtin?: boolean;
  hotkey: string | null;
  /** Relative cue file id for custom pads (persisted under userData). */
  fileId?: string;
  volume: number;
  muted: boolean;
  solo: boolean;
  toMix: boolean;
  monitor: boolean;
  /** MPD226 pad 0–15. Null until the cue is assigned. */
  pad: number | null;
  peak: number;
  rms: number;
};

export type MixerSnapshot = {
  channels: ChannelSnapshot[];
  masterVolume: number;
  masterMuted: boolean;
  masterPeak: number;
  masterRms: number;
  masterEq: EqBand[];
  cueMasterVolume: number;
  cueMasterMuted: boolean;
  cueMasterPeak: number;
  cueMasterRms: number;
  cueEq: EqBand[];
  running: boolean;
  anySolo: boolean;
  /** Listen to the Discord mix in headphones. */
  monitorMix: boolean;
  monitorVolume: number;
  discordDeviceId: string;
  outputDevices: OutputDevice[];
  inputDevices: AudioDevice[];
  cues: CuePad[];
};

type ChannelNodes = {
  id: string;
  name: string;
  kind: ChannelKind;
  volume: number;
  muted: boolean;
  solo: boolean;
  toMix: boolean;
  monitor: boolean;
  connected: boolean;
  deviceId: string;
  deviceLabel: string;
  captureMode: CaptureMode;
  needsReconnect: boolean;
  stream: MediaStream | null;
  source: AudioNode | null;
  captureId: string | null;
  pump: ScriptProcessorNode | null;
  pcmRing: PcmRing | null;
  pcmKeepAlive: ConstantSourceNode | null;
  inputGain: GainNode;
  boostGain: GainNode;
  boostDb: number;
  eqBands: EqBand[];
  eqFilters: BiquadFilterNode[];
  fx: ChannelFx;
  fxGraph: FxGraph;
  analyser: AnalyserNode;
  gate: GainNode;
  monGate: GainNode;
  fileElement: HTMLAudioElement | null;
  toneOsc: OscillatorNode | null;
  toneGain: GainNode | null;
  peak: number;
  rms: number;
  timeData: Float32Array;
};

type CueNodes = {
  id: string;
  name: string;
  builtin?: boolean;
  buffer: AudioBuffer;
  hotkey: string | null;
  fileId?: string;
  /** MPD226 pad 0–15, or null when this cue is not on a pad. */
  pad: number | null;
  volume: number;
  muted: boolean;
  solo: boolean;
  toMix: boolean;
  monitor: boolean;
  inputGain: GainNode | null;
  analyser: AnalyserNode | null;
  gate: GainNode | null;
  monGate: GainNode | null;
  peak: number;
  rms: number;
  timeData: Float32Array | null;
};

export type SavedSetup = {
  version: 1 | 2 | 3 | 4;
  masterVolume: number;
  masterMuted: boolean;
  masterEq?: EqBand[];
  cueMasterVolume?: number;
  cueMasterMuted?: boolean;
  cueEq?: EqBand[];
  monitorEnabled?: boolean;
  monitorMix?: boolean;
  monitorVolume: number;
  cueVolume?: number;
  discordDeviceId: string;
  channels: Array<{
    kind: ChannelKind;
    name: string;
    volume: number;
    muted: boolean;
    solo: boolean;
    toMix: boolean;
    monitor?: boolean;
    deviceId: string;
    deviceLabel?: string;
    captureMode?: CaptureMode;
    eq: EqBand[];
    fx?: ChannelFx;
    boostDb?: number;
  }>;
  cues: Array<{
    id: string;
    name: string;
    builtin?: boolean;
    hotkey: string | null;
    fileId?: string;
    pad?: number | null;
    volume?: number;
    muted?: boolean;
    solo?: boolean;
    toMix?: boolean;
    monitor?: boolean;
  }>;
};

function uid(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Stereo ring the app tap writes on the main thread and the mixer reads each buffer. */
class PcmRing {
  private left: Float32Array;
  private right: Float32Array;
  private read = 0;
  private write = 0;
  private readonly size: number;

  constructor(seconds = 1) {
    this.size = Math.floor(48000 * seconds);
    this.left = new Float32Array(this.size);
    this.right = new Float32Array(this.size);
  }

  push(left: number, right: number) {
    this.left[this.write] = left;
    this.right[this.write] = right;
    this.write++;
    if (this.write === this.size) this.write = 0;
    if (this.write === this.read) {
      this.read++;
      if (this.read === this.size) this.read = 0;
    }
  }

  pull(left: Float32Array, right: Float32Array) {
    for (let i = 0; i < left.length; i++) {
      if (this.read === this.write) {
        left[i] = 0;
        right[i] = 0;
        continue;
      }
      left[i] = this.left[this.read];
      right[i] = this.right[this.read];
      this.read++;
      if (this.read === this.size) this.read = 0;
    }
  }
}

function dbFromLinear(v: number) {
  if (v <= 0.00001) return -60;
  return Math.max(-60, 20 * Math.log10(v));
}

export function formatDb(linear: number) {
  const db = dbFromLinear(linear);
  if (db <= -59.5) return "-∞";
  return `${db.toFixed(0)}`;
}

/** Built-in “you failed” style buzzer for stream cues. */
function makeFailedBuffer(ctx: AudioContext): AudioBuffer {
  const duration = 0.85;
  const sampleRate = ctx.sampleRate;
  const length = Math.floor(sampleRate * duration);
  const buffer = ctx.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    const freq = 420 - t * 280;
    const env = Math.exp(-3.2 * t) * (t < 0.02 ? t / 0.02 : 1);
    const buzz = Math.sin(2 * Math.PI * freq * t) + 0.35 * Math.sin(2 * Math.PI * freq * 2 * t);
    data[i] = buzz * env * 0.55;
  }
  return buffer;
}

function makeSuccessBuffer(ctx: AudioContext): AudioBuffer {
  const duration = 0.45;
  const sampleRate = ctx.sampleRate;
  const length = Math.floor(sampleRate * duration);
  const buffer = ctx.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);
  const notes = [523.25, 659.25, 783.99];
  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    const note = notes[Math.min(notes.length - 1, Math.floor(t / 0.12))] ?? 523;
    const env = Math.exp(-4 * (t % 0.12)) * (t < duration - 0.02 ? 1 : (duration - t) / 0.02);
    data[i] = Math.sin(2 * Math.PI * note * t) * env * 0.4;
  }
  return buffer;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private mixBus: GainNode | null = null;
  private cueBus: GainNode | null = null;
  private cueMasterGain: GainNode | null = null;
  private cueMasterAnalyser: AnalyserNode | null = null;
  private cueEqBands: EqBand[] = cloneDefaultEq();
  private cueEqFilters: BiquadFilterNode[] = [];
  private masterGain: GainNode | null = null;
  private masterAnalyser: AnalyserNode | null = null;
  private masterEqBands: EqBand[] = cloneDefaultEq();
  private masterEqFilters: BiquadFilterNode[] = [];
  private monitorBus: GainNode | null = null;
  private monitorGain: GainNode | null = null;
  private mixToMonitor: GainNode | null = null;
  private discordGain: GainNode | null = null;
  private mixDestination: MediaStreamAudioDestinationNode | null = null;
  private discordAudio: HTMLAudioElement | null = null;
  private channels = new Map<string, ChannelNodes>();
  private cues = new Map<string, CueNodes>();
  private masterVolume = 0.85;
  private masterMuted = false;
  private cueMasterVolume = 0.9;
  private cueMasterMuted = false;
  private monitorMix = false;
  private monitorVolume = 0.55;
  private discordDeviceId = "";
  private outputDevices: OutputDevice[] = [];
  private inputDevices: AudioDevice[] = [];
  private masterPeak = 0;
  private masterRms = 0;
  private masterTimeData: Float32Array | null = null;
  private spectrumAnalyser: AnalyserNode | null = null;
  private spectrumData: Float32Array | null = null;
  private cueMasterPeak = 0;
  private cueMasterRms = 0;
  private cueMasterTimeData: Float32Array | null = null;
  private raf = 0;
  private listeners = new Set<(snap: MixerSnapshot) => void>();
  private peakHoldDecay = 0.96;
  private pcmUnsub: (() => void) | null = null;
  private endedUnsub: (() => void) | null = null;
  private impulse: AudioBuffer | null = null;
  private pendingPcm = new Map<string, Uint8Array[]>();

  subscribe(fn: (snap: MixerSnapshot) => void) {
    this.listeners.add(fn);
    fn(this.snapshot());
    return () => {
      this.listeners.delete(fn);
    };
  }

  private emit() {
    const snap = this.snapshot();
    for (const listener of this.listeners) listener(snap);
  }

  snapshot(): MixerSnapshot {
    const anySolo =
      [...this.channels.values()].some((c) => c.solo) ||
      [...this.cues.values()].some((c) => c.solo);
    return {
      channels: [...this.channels.values()].map((c) => ({
        id: c.id,
        name: c.name,
        kind: c.kind,
        volume: c.volume,
        muted: c.muted,
        solo: c.solo,
        toMix: c.toMix,
        monitor: c.monitor,
        connected: c.connected,
        peak: c.peak,
        rms: c.rms,
        deviceId: c.deviceId,
        deviceLabel: c.deviceLabel,
        captureMode: c.captureMode,
        needsReconnect: c.needsReconnect,
        eq: c.eqBands.map((b) => ({ ...b })),
        fx: { ...c.fx },
        boostDb: c.boostDb,
      })),
      masterVolume: this.masterVolume,
      masterMuted: this.masterMuted,
      masterPeak: this.masterPeak,
      masterRms: this.masterRms,
      masterEq: this.masterEqBands.map((b) => ({ ...b })),
      cueMasterVolume: this.cueMasterVolume,
      cueMasterMuted: this.cueMasterMuted,
      cueMasterPeak: this.cueMasterPeak,
      cueMasterRms: this.cueMasterRms,
      cueEq: this.cueEqBands.map((b) => ({ ...b })),
      running: !!this.ctx && this.ctx.state === "running",
      anySolo,
      monitorMix: this.monitorMix,
      monitorVolume: this.monitorVolume,
      discordDeviceId: this.discordDeviceId,
      outputDevices: this.outputDevices,
      inputDevices: this.inputDevices,
      cues: [...this.cues.values()].map((c) => ({
        id: c.id,
        name: c.name,
        builtin: c.builtin,
        hotkey: c.hotkey,
        fileId: c.fileId,
        pad: c.pad,
        volume: c.volume,
        muted: c.muted,
        solo: c.solo,
        toMix: c.toMix,
        monitor: c.monitor,
        peak: c.peak,
        rms: c.rms,
      })),
    };
  }

  getMixStream(): MediaStream | null {
    return this.mixDestination?.stream ?? null;
  }

  async start() {
    if (!this.ctx) {
      this.ctx = new AudioContext({ sampleRate: 48000 });
      this.mixBus = this.ctx.createGain();
      this.mixBus.gain.value = 1;
      this.cueBus = this.ctx.createGain();
      this.cueBus.gain.value = 1;
      this.cueMasterGain = this.ctx.createGain();
      this.cueMasterGain.gain.value = this.cueMasterMuted ? 0 : this.cueMasterVolume;
      this.cueMasterAnalyser = this.ctx.createAnalyser();
      this.cueMasterAnalyser.fftSize = 2048;
      this.cueMasterAnalyser.smoothingTimeConstant = 0.35;
      this.cueMasterTimeData = new Float32Array(this.cueMasterAnalyser.fftSize);
      this.cueEqBands = cloneDefaultEq();
      this.cueEqFilters = this.createEqChain(this.cueEqBands).filters;

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.masterMuted ? 0 : this.masterVolume;
      this.masterAnalyser = this.ctx.createAnalyser();
      this.masterAnalyser.fftSize = 2048;
      this.masterAnalyser.smoothingTimeConstant = 0.35;
      this.masterTimeData = new Float32Array(this.masterAnalyser.fftSize);
      const spectrum = this.ctx.createAnalyser();
      spectrum.fftSize = 2048;
      spectrum.smoothingTimeConstant = 0.82;
      this.spectrumAnalyser = spectrum;
      this.spectrumData = new Float32Array(spectrum.frequencyBinCount);
      this.masterEqBands = cloneDefaultEq();
      this.masterEqFilters = this.createEqChain(this.masterEqBands).filters;

      this.monitorBus = this.ctx.createGain();
      this.monitorBus.gain.value = 1;
      this.monitorGain = this.ctx.createGain();
      this.monitorGain.gain.value = this.monitorVolume;
      this.mixToMonitor = this.ctx.createGain();
      this.mixToMonitor.gain.value = this.monitorMix ? 1 : 0;
      this.discordGain = this.ctx.createGain();
      this.discordGain.gain.value = 1;
      this.mixDestination = this.ctx.createMediaStreamDestination();

      // Cue rack → cue EQ → cue master send → main mix bus
      const cueEqIn = this.cueEqFilters[0];
      const cueEqOut = this.cueEqFilters[this.cueEqFilters.length - 1];
      if (cueEqIn && cueEqOut) {
        this.cueBus.connect(cueEqIn);
        cueEqOut.connect(this.cueMasterGain);
      } else {
        this.cueBus.connect(this.cueMasterGain);
      }
      this.cueMasterGain.connect(this.cueMasterAnalyser);
      this.cueMasterAnalyser.connect(this.mixBus);

      // Channel sums + cue send → master EQ → master fader → Discord
      const masterEqIn = this.masterEqFilters[0];
      const masterEqOut = this.masterEqFilters[this.masterEqFilters.length - 1];
      if (masterEqIn && masterEqOut) {
        this.mixBus.connect(masterEqIn);
        masterEqOut.connect(spectrum);
      } else {
        this.mixBus.connect(spectrum);
      }
      spectrum.connect(this.masterGain);
      this.masterGain.connect(this.masterAnalyser);
      this.masterAnalyser.connect(this.discordGain);
      this.discordGain.connect(this.mixDestination);
      this.masterGain.connect(this.mixToMonitor);
      this.mixToMonitor.connect(this.monitorBus);
      this.monitorBus.connect(this.monitorGain);
      this.monitorGain.connect(this.ctx.destination);

      this.discordAudio = new Audio();
      this.discordAudio.autoplay = true;
      this.discordAudio.srcObject = this.mixDestination.stream;
      void this.discordAudio.play().catch(() => {
        /* autoplay may wait for gesture; start() is already user-driven */
      });

      this.seedBuiltinCues();
    }
    if (this.ctx.state === "suspended") await this.ctx.resume();
    await this.refreshOutputDevices();
    this.startMeterLoop();
    this.emit();
  }

  async ensureRunning() {
    await this.start();
  }

  private wireCueGraph(cue: CueNodes) {
    if (!this.ctx || !this.cueBus || !this.monitorBus) return;
    if (cue.inputGain) return;
    const inputGain = this.ctx.createGain();
    const analyser = this.ctx.createAnalyser();
    const gate = this.ctx.createGain();
    const monGate = this.ctx.createGain();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.35;
    inputGain.gain.value = cue.volume;
    gate.gain.value = 0;
    monGate.gain.value = 0;
    inputGain.connect(analyser);
    analyser.connect(gate);
    analyser.connect(monGate);
    gate.connect(this.cueBus);
    monGate.connect(this.monitorBus);
    cue.inputGain = inputGain;
    cue.analyser = analyser;
    cue.gate = gate;
    cue.monGate = monGate;
    cue.timeData = new Float32Array(analyser.fftSize);
  }

  private makeCueNodes(
    id: string,
    name: string,
    buffer: AudioBuffer,
    opts?: Partial<CueNodes>,
  ): CueNodes {
    const cue: CueNodes = {
      id,
      name,
      builtin: opts?.builtin,
      buffer,
      hotkey: opts?.hotkey ?? null,
      fileId: opts?.fileId,
      pad: opts?.pad ?? null,
      volume: opts?.volume ?? 0.85,
      muted: opts?.muted ?? false,
      solo: opts?.solo ?? false,
      toMix: opts?.toMix ?? true,
      monitor: opts?.monitor ?? false,
      inputGain: null,
      analyser: null,
      gate: null,
      monGate: null,
      peak: 0,
      rms: 0,
      timeData: null,
    };
    this.wireCueGraph(cue);
    return cue;
  }

  private seedBuiltinCues() {
    if (!this.ctx) return;
    if (!this.cues.has("cue-you-failed")) {
      this.cues.set(
        "cue-you-failed",
        this.makeCueNodes("cue-you-failed", "You Failed", makeFailedBuffer(this.ctx), {
          builtin: true,
        }),
      );
    }
    if (!this.cues.has("cue-nice")) {
      this.cues.set(
        "cue-nice",
        this.makeCueNodes("cue-nice", "Nice", makeSuccessBuffer(this.ctx), {
          builtin: true,
        }),
      );
    }
    this.applyRouting();
  }

  async refreshOutputDevices() {
    await this.refreshDevices();
  }

  async refreshDevices() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      this.outputDevices = devices
        .filter((d) => d.kind === "audiooutput")
        .map((d) => ({
          deviceId: d.deviceId,
          label: d.label || `Output ${d.deviceId.slice(0, 6)}`,
        }));
      this.inputDevices = devices
        .filter((d) => d.kind === "audioinput")
        .map((d) => ({
          deviceId: d.deviceId,
          label: d.label || `Mic ${d.deviceId.slice(0, 6)}`,
        }));
    } catch {
      this.outputDevices = [];
      this.inputDevices = [];
    }
    this.emit();
  }

  /** Prefer a real mic, not the virtual cable Discord is listening on. */
  preferredMicDeviceId(): string {
    const real = this.inputDevices.find(
      (d) => !/cable|voicemeeter|vb-audio|virtual/i.test(d.label),
    );
    return real?.deviceId ?? this.inputDevices[0]?.deviceId ?? "";
  }

  async setDiscordOutputDevice(deviceId: string) {
    await this.ensureRunning();
    this.discordDeviceId = deviceId;
    if (this.discordAudio && "setSinkId" in this.discordAudio) {
      try {
        await (
          this.discordAudio as HTMLAudioElement & {
            setSinkId: (id: string) => Promise<void>;
          }
        ).setSinkId(deviceId || "");
      } catch (err) {
        throw new Error(
          err instanceof Error
            ? err.message
            : "Could not route mix to that output device.",
        );
      }
    }
    this.emit();
  }

  setMonitorMix(enabled: boolean) {
    this.monitorMix = enabled;
    if (this.mixToMonitor) {
      this.mixToMonitor.gain.setTargetAtTime(
        enabled ? 1 : 0,
        this.ctx?.currentTime ?? 0,
        0.02,
      );
    }
    this.emit();
  }

  /** @deprecated use setMonitorMix */
  setMonitorEnabled(enabled: boolean) {
    this.setMonitorMix(enabled);
  }

  setMonitorVolume(volume: number) {
    this.monitorVolume = Math.min(1, Math.max(0, volume));
    if (this.monitorGain) {
      this.monitorGain.gain.setTargetAtTime(
        this.monitorVolume,
        this.ctx?.currentTime ?? 0,
        0.02,
      );
    }
    this.emit();
  }

  async playCue(id: string) {
    await this.ensureRunning();
    if (!this.ctx) return;
    const cue = this.cues.get(id);
    if (!cue) return;
    this.wireCueGraph(cue);
    if (!cue.inputGain) return;
    const src = this.ctx.createBufferSource();
    src.buffer = cue.buffer;
    src.connect(cue.inputGain);
    src.start();
  }

  async addCueFromFile(file: File, name?: string, fileId?: string) {
    await this.ensureRunning();
    if (!this.ctx) throw new Error("Engine not ready");
    const arrayBuf = await file.arrayBuffer();
    const buffer = await this.ctx.decodeAudioData(arrayBuf.slice(0));
    const id = uid("cue");
    const savedId = fileId ?? id;
    this.cues.set(
      id,
      this.makeCueNodes(id, name ?? file.name.replace(/\.[^.]+$/, ""), buffer, {
        fileId: savedId,
      }),
    );
    this.applyRouting();
    this.emit();
    return id;
  }

  async addCueFromArrayBuffer(
    arrayBuf: ArrayBuffer,
    meta: {
      id?: string;
      name: string;
      fileId?: string;
      hotkey?: string | null;
      pad?: number | null;
      volume?: number;
      muted?: boolean;
      solo?: boolean;
      toMix?: boolean;
      monitor?: boolean;
    },
  ) {
    await this.ensureRunning();
    if (!this.ctx) throw new Error("Engine not ready");
    const buffer = await this.ctx.decodeAudioData(arrayBuf.slice(0));
    const id = meta.id ?? uid("cue");
    this.cues.set(
      id,
      this.makeCueNodes(id, meta.name, buffer, {
        fileId: meta.fileId,
        hotkey: meta.hotkey ?? null,
        pad: meta.pad ?? null,
        volume: meta.volume,
        muted: meta.muted,
        solo: meta.solo,
        toMix: meta.toMix,
        monitor: meta.monitor,
      }),
    );
    this.applyRouting();
    this.emit();
    return id;
  }

  setCueHotkey(id: string, hotkey: string | null) {
    const cue = this.cues.get(id);
    if (!cue) return;
    cue.hotkey = hotkey;
    this.emit();
  }

  /** Assign an MPD226 pad (0–15). Null clears it. One pad plays one cue. */
  setCuePad(id: string, pad: number | null) {
    const cue = this.cues.get(id);
    if (!cue) return;
    if (pad === null) {
      cue.pad = null;
      this.emit();
      return;
    }
    const next = Math.min(15, Math.max(0, Math.round(pad)));
    for (const other of this.cues.values()) {
      if (other.id !== id && other.pad === next) other.pad = null;
    }
    cue.pad = next;
    this.emit();
  }

  setCueVolume(id: string, volume: number) {
    const cue = this.cues.get(id);
    if (!cue) return;
    cue.volume = Math.min(1, Math.max(0, volume));
    cue.inputGain?.gain.setTargetAtTime(cue.volume, this.ctx?.currentTime ?? 0, 0.01);
    this.emit();
  }

  setCueMuted(id: string, muted: boolean) {
    const cue = this.cues.get(id);
    if (!cue) return;
    cue.muted = muted;
    this.applyRouting();
    this.emit();
  }

  setCueSolo(id: string, solo: boolean) {
    const cue = this.cues.get(id);
    if (!cue) return;
    cue.solo = solo;
    this.applyRouting();
    this.emit();
  }

  setCueToMix(id: string, toMix: boolean) {
    const cue = this.cues.get(id);
    if (!cue) return;
    cue.toMix = toMix;
    this.applyRouting();
    this.emit();
  }

  setCueMonitor(id: string, monitor: boolean) {
    const cue = this.cues.get(id);
    if (!cue) return;
    cue.monitor = monitor;
    this.applyRouting();
    this.emit();
  }

  setChannelMonitor(id: string, monitor: boolean) {
    const ch = this.channels.get(id);
    if (!ch) return;
    ch.monitor = monitor;
    this.applyRouting();
    this.emit();
  }

  removeCue(id: string) {
    const cue = this.cues.get(id);
    if (!cue || cue.builtin) return;
    try {
      cue.inputGain?.disconnect();
      cue.analyser?.disconnect();
      cue.gate?.disconnect();
      cue.monGate?.disconnect();
    } catch {
      /* noop */
    }
    this.cues.delete(id);
    this.applyRouting();
    this.emit();
  }

  exportSetup(): SavedSetup {
    return {
      version: 4,
      masterVolume: this.masterVolume,
      masterMuted: this.masterMuted,
      masterEq: this.masterEqBands.map((b) => ({ ...b })),
      cueMasterVolume: this.cueMasterVolume,
      cueMasterMuted: this.cueMasterMuted,
      cueEq: this.cueEqBands.map((b) => ({ ...b })),
      monitorMix: this.monitorMix,
      monitorVolume: this.monitorVolume,
      discordDeviceId: this.discordDeviceId,
      channels: [...this.channels.values()]
        .filter(
          (c) =>
            c.kind === "mic" ||
            c.kind === "app" ||
            c.kind === "desktop" ||
            c.kind === "tone" ||
            c.kind === "file",
        )
        .map((c) => ({
          kind: c.kind,
          name: c.name,
          volume: c.volume,
          muted: c.muted,
          solo: c.solo,
          toMix: c.toMix,
          monitor: c.monitor,
          deviceId: c.deviceId,
          deviceLabel: c.deviceLabel,
          captureMode: c.captureMode,
          eq: c.eqBands.map((b) => ({ ...b })),
          fx: { ...c.fx },
          boostDb: c.boostDb,
        })),
      cues: [...this.cues.values()].map((c) => ({
        id: c.id,
        name: c.name,
        builtin: c.builtin,
        hotkey: c.hotkey,
        fileId: c.fileId,
        pad: c.pad,
        volume: c.volume,
        muted: c.muted,
        solo: c.solo,
        toMix: c.toMix,
        monitor: c.monitor,
      })),
    };
  }

  async applyChannelSettings(
    channelId: string,
    settings: {
      volume: number;
      muted: boolean;
      solo: boolean;
      toMix: boolean;
      monitor?: boolean;
      eq?: EqBand[];
      fx?: ChannelFx;
      boostDb?: number;
    },
  ) {
    const ch = this.channels.get(channelId);
    if (!ch) return;
    ch.volume = settings.volume;
    ch.inputGain.gain.value = settings.volume;
    ch.muted = settings.muted;
    ch.solo = settings.solo;
    ch.toMix = settings.toMix;
    if (typeof settings.monitor === "boolean") ch.monitor = settings.monitor;
    if (typeof settings.boostDb === "number") {
      ch.boostDb = Math.min(24, Math.max(0, settings.boostDb));
      ch.boostGain.gain.value = dbToLinear(ch.boostDb);
    }
    if (settings.eq) {
      ch.eqBands = settings.eq.map((b) => ({ ...b }));
      this.applyFilterParams(ch);
    }
    if (settings.fx) {
      ch.fx = clampFx(settings.fx);
      ch.fxGraph.apply(ch.fx);
    }
    this.applyRouting();
    this.emit();
  }

  setChannelFx(channelId: string, patch: Partial<ChannelFx>) {
    const ch = this.channels.get(channelId);
    if (!ch) return;
    ch.fx = clampFx({ ...ch.fx, ...patch });
    ch.fxGraph.apply(ch.fx);
    this.emit();
  }

  resetChannelFx(channelId: string) {
    this.setChannelFx(channelId, defaultFx());
  }

  private startMeterLoop() {
    cancelAnimationFrame(this.raf);
    const tick = () => {
      this.updateMeters();
      this.emit();
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  private readMeter(
    analyser: AnalyserNode,
    timeData: Float32Array,
    prev: { peak: number; rms: number },
  ) {
    analyser.getFloatTimeDomainData(timeData as Float32Array<ArrayBuffer>);
    let sum = 0;
    let peak = 0;
    for (let i = 0; i < timeData.length; i++) {
      const v = Math.abs(timeData[i] ?? 0);
      sum += v * v;
      if (v > peak) peak = v;
    }
    prev.rms = Math.sqrt(sum / timeData.length);
    prev.peak = Math.max(peak, prev.peak * this.peakHoldDecay);
  }

  private updateMeters() {
    for (const ch of this.channels.values()) {
      if (!ch.connected) {
        ch.peak *= this.peakHoldDecay;
        ch.rms *= 0.85;
        continue;
      }
      this.readMeter(ch.analyser, ch.timeData, ch);
    }
    for (const cue of this.cues.values()) {
      if (!cue.analyser || !cue.timeData) {
        cue.peak *= this.peakHoldDecay;
        cue.rms *= 0.85;
        continue;
      }
      this.readMeter(cue.analyser, cue.timeData, cue);
    }

    if (this.masterAnalyser && this.masterTimeData) {
      const prev = { peak: this.masterPeak, rms: this.masterRms };
      this.readMeter(this.masterAnalyser, this.masterTimeData, prev);
      this.masterPeak = prev.peak;
      this.masterRms = prev.rms;
    }
    if (this.cueMasterAnalyser && this.cueMasterTimeData) {
      const prev = { peak: this.cueMasterPeak, rms: this.cueMasterRms };
      this.readMeter(this.cueMasterAnalyser, this.cueMasterTimeData, prev);
      this.cueMasterPeak = prev.peak;
      this.cueMasterRms = prev.rms;
    }
  }

  private createEqChain(bands: EqBand[]): {
    bands: EqBand[];
    filters: BiquadFilterNode[];
  } {
    if (!this.ctx) return { bands: [], filters: [] };
    const filters: BiquadFilterNode[] = [];
    const cloned = bands.map((b) => ({ ...b }));
    for (const band of cloned) {
      const filter = this.ctx.createBiquadFilter();
      filter.type = band.kind;
      filter.frequency.value = band.frequency;
      filter.Q.value = band.Q;
      filter.gain.value = band.gainDb;
      filters.push(filter);
    }
    for (let i = 0; i < filters.length - 1; i++) {
      filters[i]!.connect(filters[i + 1]!);
    }
    return { bands: cloned, filters };
  }

  private applyFilterParams(channel: ChannelNodes) {
    channel.eqFilters.forEach((filter, i) => {
      const band = channel.eqBands[i];
      if (!band) return;
      filter.type = band.kind;
      filter.frequency.setTargetAtTime(band.frequency, this.ctx?.currentTime ?? 0, 0.01);
      filter.Q.setTargetAtTime(band.Q, this.ctx?.currentTime ?? 0, 0.01);
      filter.gain.setTargetAtTime(band.gainDb, this.ctx?.currentTime ?? 0, 0.01);
    });
  }

  setEqGain(channelId: string, bandId: string, gainDb: number) {
    const ch = this.channels.get(channelId);
    if (!ch) return;
    const band = ch.eqBands.find((b) => b.id === bandId);
    if (!band) return;
    band.gainDb = Math.min(12, Math.max(-12, gainDb));
    this.applyFilterParams(ch);
    this.emit();
  }

  resetEq(channelId: string) {
    const ch = this.channels.get(channelId);
    if (!ch) return;
    ch.eqBands = cloneDefaultEq();
    this.applyFilterParams(ch);
    this.emit();
  }

  private createChannelShell(
    kind: ChannelKind,
    name: string,
    opts?: {
      eqBands?: EqBand[];
      toMix?: boolean;
      captureMode?: CaptureMode;
      deviceId?: string;
      deviceLabel?: string;
      needsReconnect?: boolean;
    },
  ): ChannelNodes | null {
    if (!this.ctx || !this.mixBus) return null;
    if (!this.monitorBus) return null;
    const boostGain = this.ctx.createGain();
    const inputGain = this.ctx.createGain();
    const analyser = this.ctx.createAnalyser();
    const gate = this.ctx.createGain();
    const monGate = this.ctx.createGain();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.35;
    boostGain.gain.value = 1;
    boostGain.connect(inputGain);
    inputGain.gain.value = 0.75;
    gate.gain.value = 1;
    monGate.gain.value = 0;

    const { bands, filters } = this.createEqChain(opts?.eqBands ?? cloneDefaultEq());
    const eqIn = filters[0];
    const eqOut = filters[filters.length - 1];
    if (!this.impulse) this.impulse = makeImpulse(this.ctx);
    const fxGraph = createFxGraph(this.ctx, this.impulse);
    const fx = defaultFx();
    fxGraph.apply(fx);
    if (eqIn && eqOut) {
      inputGain.connect(eqIn);
      eqOut.connect(fxGraph.input);
    } else {
      inputGain.connect(fxGraph.input);
    }
    fxGraph.output.connect(analyser);
    analyser.connect(gate);
    analyser.connect(monGate);
    gate.connect(this.mixBus);
    monGate.connect(this.monitorBus);

    // Only mic/app (isolated) default onto the Discord mix. System loopback stays off.
    const defaultToMix =
      opts?.toMix ?? (kind === "mic" || kind === "app" || kind === "tone" || kind === "file");

    const channel: ChannelNodes = {
      id: uid(kind),
      name,
      kind,
      volume: 0.75,
      muted: false,
      solo: false,
      toMix: defaultToMix,
      monitor: false,
      connected: false,
      deviceId: opts?.deviceId ?? "",
      deviceLabel: opts?.deviceLabel ?? "",
      captureMode: opts?.captureMode ?? (kind === "mic" || kind === "app" ? "device" : kind === "desktop" ? "system" : "none"),
      needsReconnect: opts?.needsReconnect ?? false,
      stream: null,
      source: null,
      captureId: null,
      pump: null,
      pcmRing: null,
      pcmKeepAlive: null,
      inputGain,
      boostGain,
      boostDb: 0,
      eqBands: bands,
      eqFilters: filters,
      fx,
      fxGraph,
      analyser,
      gate,
      monGate,
      fileElement: null,
      toneOsc: null,
      toneGain: null,
      peak: 0,
      rms: 0,
      timeData: new Float32Array(analyser.fftSize),
    };
    this.channels.set(channel.id, channel);
    this.applyRouting();
    return channel;
  }

  private applyRouting() {
    const anySolo =
      [...this.channels.values()].some((c) => c.solo) ||
      [...this.cues.values()].some((c) => c.solo);
    const t = this.ctx?.currentTime ?? 0;
    for (const ch of this.channels.values()) {
      const toMix =
        ch.toMix && !ch.muted && (!anySolo || ch.solo) && ch.connected;
      const toMon = ch.monitor && !ch.muted && ch.connected;
      ch.gate.gain.setTargetAtTime(toMix ? 1 : 0, t, 0.015);
      ch.monGate.gain.setTargetAtTime(toMon ? 1 : 0, t, 0.015);
    }
    for (const cue of this.cues.values()) {
      if (!cue.gate || !cue.monGate) continue;
      const toMix = cue.toMix && !cue.muted && (!anySolo || cue.solo);
      const toMon = cue.monitor && !cue.muted;
      cue.gate.gain.setTargetAtTime(toMix ? 1 : 0, t, 0.015);
      cue.monGate.gain.setTargetAtTime(toMon ? 1 : 0, t, 0.015);
    }
    if (this.masterGain) {
      this.masterGain.gain.setTargetAtTime(
        this.masterMuted ? 0 : this.masterVolume,
        t,
        0.015,
      );
    }
    if (this.mixToMonitor) {
      this.mixToMonitor.gain.setTargetAtTime(this.monitorMix ? 1 : 0, t, 0.015);
    }
    if (this.cueMasterGain) {
      this.cueMasterGain.gain.setTargetAtTime(
        this.cueMasterMuted ? 0 : this.cueMasterVolume,
        t,
        0.015,
      );
    }
  }

  setCueMasterVolume(volume: number) {
    this.cueMasterVolume = Math.min(1, Math.max(0, volume));
    this.applyRouting();
    this.emit();
  }

  setCueMasterMuted(muted: boolean) {
    this.cueMasterMuted = muted;
    this.applyRouting();
    this.emit();
  }

  setBusEqGain(bus: "master" | "cue", bandId: string, gainDb: number) {
    this.setBusEq(bus, bandId, { gainDb });
  }

  setBusEq(
    bus: "master" | "cue",
    bandId: string,
    patch: { gainDb?: number; frequency?: number },
  ) {
    const bands = bus === "master" ? this.masterEqBands : this.cueEqBands;
    const filters = bus === "master" ? this.masterEqFilters : this.cueEqFilters;
    const band = bands.find((b) => b.id === bandId);
    if (!band) return;
    if (typeof patch.gainDb === "number") {
      band.gainDb = Math.min(12, Math.max(-12, patch.gainDb));
    }
    if (typeof patch.frequency === "number") {
      band.frequency = Math.min(16000, Math.max(40, patch.frequency));
    }
    const idx = bands.findIndex((b) => b.id === bandId);
    const filter = filters[idx];
    const now = this.ctx?.currentTime ?? 0;
    if (filter) {
      filter.gain.setTargetAtTime(band.gainDb, now, 0.01);
      filter.frequency.setTargetAtTime(band.frequency, now, 0.01);
    }
    this.emit();
  }

  resetBusEq(bus: "master" | "cue") {
    const next = cloneDefaultEq();
    const filters = bus === "master" ? this.masterEqFilters : this.cueEqFilters;
    if (bus === "master") this.masterEqBands = next;
    else this.cueEqBands = next;
    const now = this.ctx?.currentTime ?? 0;
    next.forEach((band, i) => {
      const filter = filters[i];
      if (!filter) return;
      filter.gain.setTargetAtTime(band.gainDb, now, 0.01);
      filter.frequency.setTargetAtTime(band.frequency, now, 0.01);
    });
    this.emit();
  }

  /** Pre-fader trim. 0 dB is unity; +24 dB lifts a quiet player into Discord. */
  setBoost(id: string, boostDb: number) {
    const ch = this.channels.get(id);
    if (!ch) return;
    ch.boostDb = Math.min(24, Math.max(0, boostDb));
    ch.boostGain.gain.setTargetAtTime(
      dbToLinear(ch.boostDb),
      this.ctx?.currentTime ?? 0,
      0.015,
    );
    this.emit();
  }

  get spectrumBinCount() {
    return this.spectrumAnalyser?.frequencyBinCount ?? 1024;
  }

  /** Live spectrum after the master EQ, before the Mix fader. */
  readMasterSpectrum(target: Float32Array) {
    const analyser = this.spectrumAnalyser;
    const data = this.spectrumData;
    if (!analyser || !data) {
      target.fill(-100);
      return;
    }
    analyser.getFloatFrequencyData(data as Float32Array<ArrayBuffer>);
    if (target.length === data.length) {
      target.set(data);
      return;
    }
    const step = data.length / Math.max(1, target.length);
    for (let i = 0; i < target.length; i++) {
      const start = Math.floor(i * step);
      const end = Math.min(data.length, Math.max(start + 1, Math.floor((i + 1) * step)));
      let peak = -140;
      for (let j = start; j < end; j++) {
        const value = data[j] ?? -140;
        if (value > peak) peak = value;
      }
      target[i] = peak;
    }
  }

  moveCue(id: string, toIndex: number) {
    const entries = [...this.cues.entries()];
    const from = entries.findIndex(([cueId]) => cueId === id);
    if (from < 0) return;
    const [item] = entries.splice(from, 1);
    if (!item) return;
    const index = Math.min(entries.length, Math.max(0, Math.round(toIndex)));
    entries.splice(index, 0, item);
    this.cues = new Map(entries);
    this.emit();
  }

  orderCues(ids: string[]) {
    const next = new Map<string, CueNodes>();
    for (const id of ids) {
      const cue = this.cues.get(id);
      if (cue) next.set(id, cue);
    }
    for (const [id, cue] of this.cues) {
      if (!next.has(id)) next.set(id, cue);
    }
    this.cues = next;
    this.emit();
  }

  private attachStream(channel: ChannelNodes, stream: MediaStream) {
    if (!this.ctx) return;
    this.detachSource(channel);
    channel.stream = stream;
    const source = this.ctx.createMediaStreamSource(stream);
    source.connect(channel.boostGain);
    channel.source = source;
    channel.connected = stream.getAudioTracks().some((t) => t.readyState === "live");
    stream.getAudioTracks().forEach((track) => {
      track.addEventListener("ended", () => {
        channel.connected = false;
        this.applyRouting();
        this.emit();
      });
    });
    this.applyRouting();
    this.emit();
  }

  private detachSource(channel: ChannelNodes) {
    try {
      channel.source?.disconnect();
    } catch {
      /* already disconnected */
    }
    channel.source = null;
    if (channel.pump) {
      channel.pump.onaudioprocess = null;
      try {
        channel.pump.disconnect();
      } catch {
        /* already disconnected */
      }
      channel.pump = null;
    }
    if (channel.pcmKeepAlive) {
      try {
        channel.pcmKeepAlive.stop();
        channel.pcmKeepAlive.disconnect();
      } catch {
        /* already stopped */
      }
      channel.pcmKeepAlive = null;
    }
    channel.pcmRing = null;
    if (channel.captureId && window.mixlineDesktop) {
      const id = channel.captureId;
      channel.captureId = null;
      this.pendingPcm.delete(id);
      void window.mixlineDesktop.stopAppCapture(id);
    }
    if (channel.stream) {
      channel.stream.getTracks().forEach((t) => t.stop());
      channel.stream = null;
    }
    if (channel.fileElement) {
      channel.fileElement.pause();
      channel.fileElement.src = "";
      channel.fileElement = null;
    }
    if (channel.toneOsc) {
      try {
        channel.toneOsc.stop();
        channel.toneOsc.disconnect();
      } catch {
        /* already stopped */
      }
      channel.toneOsc = null;
    }
    if (channel.toneGain) {
      try {
        channel.toneGain.disconnect();
      } catch {
        /* already disconnected */
      }
      channel.toneGain = null;
    }
    channel.connected = false;
  }

  private async openMicStream(deviceId?: string) {
    if (window.mixlineDesktop) {
      await window.mixlineDesktop.requestMicAccess();
    }
    const audio: MediaTrackConstraints = {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    };
    if (deviceId) audio.deviceId = { exact: deviceId };
    return navigator.mediaDevices.getUserMedia({ audio, video: false });
  }

  async addMic(name = "Mic", deviceId?: string) {
    await this.ensureRunning();
    // First grab any mic so labels populate, then reopen the chosen device if needed.
    let stream = await this.openMicStream(deviceId || undefined);
    await this.refreshDevices();
    const chosen = deviceId || this.preferredMicDeviceId();
    if (chosen && !deviceId) {
      const trackDevice = stream.getAudioTracks()[0]?.getSettings().deviceId;
      if (trackDevice && trackDevice !== chosen) {
        stream.getTracks().forEach((t) => t.stop());
        stream = await this.openMicStream(chosen);
      }
    }
    const channel = this.createChannelShell("mic", name, {
      captureMode: "device",
      toMix: true,
    });
    if (!channel) throw new Error("Engine not ready");
    channel.deviceId =
      chosen || stream.getAudioTracks()[0]?.getSettings().deviceId || "";
    channel.deviceLabel =
      this.inputDevices.find((d) => d.deviceId === channel.deviceId)?.label ||
      "Microphone";
    this.attachStream(channel, stream);
    await this.refreshDevices();
    return channel.id;
  }

  async setMicDevice(channelId: string, deviceId: string) {
    const channel = this.channels.get(channelId);
    if (!channel || channel.kind !== "mic") {
      throw new Error("Not a mic channel.");
    }
    await this.ensureRunning();
    const stream = await this.openMicStream(deviceId || undefined);
    channel.deviceId =
      deviceId || stream.getAudioTracks()[0]?.getSettings().deviceId || "";
    channel.deviceLabel =
      this.inputDevices.find((d) => d.deviceId === channel.deviceId)?.label ||
      channel.deviceLabel;
    channel.needsReconnect = false;
    this.attachStream(channel, stream);
    await this.refreshDevices();
  }

  private ensurePcmListener() {
    if (!window.mixlineDesktop || this.pcmUnsub) return;
    this.pcmUnsub = window.mixlineDesktop.onAppPcm((id, bytes) => this.onAppPcm(id, bytes));
    this.endedUnsub = window.mixlineDesktop.onAppCaptureEnded((info) => {
      for (const ch of this.channels.values()) {
        if (ch.captureId !== info.id) continue;
        ch.connected = false;
        ch.needsReconnect = true;
        this.applyRouting();
        this.emit();
      }
    });
  }

  private onAppPcm(id: string, bytes: Uint8Array) {
    const channel = [...this.channels.values()].find((ch) => ch.captureId === id);
    if (!channel?.pcmRing) {
      const queued = this.pendingPcm.get(id) ?? [];
      queued.push(bytes);
      if (queued.length > 24) queued.shift();
      this.pendingPcm.set(id, queued);
      return;
    }
    this.writePcm(channel, bytes);
  }

  private writePcm(channel: ChannelNodes, bytes: Uint8Array) {
    const ring = channel.pcmRing;
    if (!ring || bytes.byteLength < 4) return;
    const usable = bytes.byteLength - (bytes.byteLength % 4);
    const view = new DataView(bytes.buffer, bytes.byteOffset, usable);
    const frames = usable / 4;
    for (let i = 0; i < frames; i++) {
      ring.push(view.getInt16(i * 4, true) / 32768, view.getInt16(i * 4 + 2, true) / 32768);
    }
  }

  /**
   * OBS-style app tap: only this process (and its children). Game and other apps stay out.
   * MIX still sends the strip to the selected output (VB-Cable).
   */
  async addAppProcess(app: { pid: number; name: string; exe: string }) {
    await this.ensureRunning();
    if (!this.ctx) throw new Error("Engine not ready");
    if (!window.mixlineDesktop?.startAppCapture) {
      throw new Error("Per-app capture only works in the MixLine desktop app.");
    }
    this.ensurePcmListener();
    const { id: captureId } = await window.mixlineDesktop.startAppCapture(app.pid);
    const channel = this.createChannelShell("app", app.name, {
      captureMode: "process",
      toMix: true,
      deviceId: `proc:${app.exe}`,
      deviceLabel: app.name,
    });
    if (!channel) {
      await window.mixlineDesktop.stopAppCapture(captureId);
      throw new Error("Engine not ready");
    }
    const ring = new PcmRing();
    const pump = this.ctx.createScriptProcessor(2048, 1, 2);
    pump.onaudioprocess = (event) => {
      ring.pull(event.outputBuffer.getChannelData(0), event.outputBuffer.getChannelData(1));
    };
    const keepAlive = this.ctx.createConstantSource();
    keepAlive.offset.value = 0;
    keepAlive.connect(pump);
    keepAlive.start();
    pump.connect(channel.boostGain);
    channel.source = pump;
    channel.pump = pump;
    channel.pcmRing = ring;
    channel.pcmKeepAlive = keepAlive;
    channel.captureId = captureId;
    channel.connected = true;
    const queued = this.pendingPcm.get(captureId);
    if (queued) {
      for (const chunk of queued) this.writePcm(channel, chunk);
      this.pendingPcm.delete(captureId);
    }
    this.applyRouting();
    this.emit();
    return channel.id;
  }

  /**
   * Fallback: one input device (a second virtual cable). Prefer addAppProcess.
   */
  async addAppDevice(deviceId: string, name?: string) {
    await this.ensureRunning();
    await this.refreshDevices();
    const device = this.inputDevices.find((d) => d.deviceId === deviceId);
    if (!device && deviceId) {
      throw new Error("That audio device isn’t available right now.");
    }
    const label = device?.label || name || "App";
    const stream = await this.openMicStream(deviceId);
    const channel = this.createChannelShell("app", name || simplifyDeviceName(label), {
      captureMode: "device",
      toMix: true,
      deviceId,
      deviceLabel: label,
    });
    if (!channel) throw new Error("Engine not ready");
    this.attachStream(channel, stream);
    await this.refreshDevices();
    return channel.id;
  }

  async setAppDevice(channelId: string, deviceId: string) {
    const channel = this.channels.get(channelId);
    if (!channel || channel.kind !== "app") {
      throw new Error("Not an application channel.");
    }
    await this.ensureRunning();
    await this.refreshDevices();
    const stream = await this.openMicStream(deviceId);
    channel.deviceId = deviceId;
    channel.deviceLabel =
      this.inputDevices.find((d) => d.deviceId === deviceId)?.label || channel.deviceLabel;
    channel.captureMode = "device";
    channel.needsReconnect = false;
    channel.connected = true;
    this.attachStream(channel, stream);
    await this.refreshDevices();
  }

  /** Placeholder strip restored from save until the user reconnects the device. */
  addAppPlaceholder(saved: {
    name: string;
    deviceId: string;
    deviceLabel?: string;
    volume: number;
    muted: boolean;
    solo: boolean;
    toMix: boolean;
    eq?: EqBand[];
    captureMode?: CaptureMode;
    boostDb?: number;
  }) {
    const channel = this.createChannelShell("app", saved.name, {
      captureMode: saved.captureMode ?? "device",
      toMix: saved.toMix,
      deviceId: saved.deviceId,
      deviceLabel: saved.deviceLabel || saved.name,
      needsReconnect: true,
      eqBands: saved.eq,
    });
    if (!channel) throw new Error("Engine not ready");
    channel.volume = saved.volume;
    channel.inputGain.gain.value = saved.volume;
    if (typeof saved.boostDb === "number") {
      channel.boostDb = Math.min(24, Math.max(0, saved.boostDb));
      channel.boostGain.gain.value = dbToLinear(channel.boostDb);
    }
    channel.muted = saved.muted;
    channel.solo = saved.solo;
    channel.connected = false;
    this.applyRouting();
    this.emit();
    return channel.id;
  }

  /**
   * Full Windows system loopback (game + music + anything on the default device).
   * Defaults TO MIX off so Discord doesn’t hear your game unless you punch it in.
   */
  async addDesktop(name = "System sounds") {
    await this.ensureRunning();
    if (window.mixlineDesktop) {
      const sources = await window.mixlineDesktop.getDesktopSources();
      const screen =
        sources.find((s) => s.id.startsWith("screen:")) ?? sources[0];
      if (!screen) throw new Error("No desktop sources found.");
      const constraints = {
        audio: {
          mandatory: {
            chromeMediaSource: "desktop",
            chromeMediaSourceId: screen.id,
          },
        },
        video: {
          mandatory: {
            chromeMediaSource: "desktop",
            chromeMediaSourceId: screen.id,
          },
        },
      } as unknown as MediaStreamConstraints;
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      stream.getVideoTracks().forEach((t) => t.stop());
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) {
        stream.getTracks().forEach((t) => t.stop());
        throw new Error("No system audio available to capture.");
      }
      const channel = this.createChannelShell("desktop", name, {
        captureMode: "system",
        toMix: false,
      });
      if (!channel) throw new Error("Engine not ready");
      this.attachStream(channel, new MediaStream(audioTracks));
      return channel.id;
    }

    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: true,
    });
    stream.getVideoTracks().forEach((t) => t.stop());
    const audioTracks = stream.getAudioTracks();
    if (audioTracks.length === 0) {
      stream.getTracks().forEach((t) => t.stop());
      throw new Error("No audio in that share.");
    }
    const channel = this.createChannelShell("desktop", name, {
      captureMode: "system",
      toMix: false,
    });
    if (!channel) throw new Error("Engine not ready");
    this.attachStream(channel, new MediaStream(audioTracks));
    return channel.id;
  }

  /** @deprecated Window capture on Windows is system loopback — use addAppDevice. */
  async addApp(_name = "App", _sourceId?: string) {
    throw new Error(
      "Application strips now use an isolated audio device. Pick the virtual cable (or device) that only that app plays into.",
    );
  }

  async addFile(file: File, name?: string) {
    await this.ensureRunning();
    if (!this.ctx) throw new Error("Engine not ready");
    const channel = this.createChannelShell(
      "file",
      name ?? file.name.replace(/\.[^.]+$/, ""),
      { captureMode: "none", toMix: true },
    );
    if (!channel) throw new Error("Engine not ready");

    const el = new Audio();
    el.src = URL.createObjectURL(file);
    el.loop = true;
    el.crossOrigin = "anonymous";
    await el.play();
    const source = this.ctx.createMediaElementSource(el);
    source.connect(channel.boostGain);
    channel.source = source;
    channel.fileElement = el;
    channel.connected = true;
    this.applyRouting();
    this.emit();
    return channel.id;
  }

  async addTone(name = "Demo Tone") {
    await this.ensureRunning();
    if (!this.ctx) throw new Error("Engine not ready");
    const channel = this.createChannelShell("tone", name, {
      captureMode: "none",
      toMix: true,
    });
    if (!channel) throw new Error("Engine not ready");

    const osc = this.ctx.createOscillator();
    const toneGain = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 220 + this.channels.size * 55;
    toneGain.gain.value = 0.2;
    osc.connect(toneGain);
    toneGain.connect(channel.boostGain);
    osc.start();
    channel.toneOsc = osc;
    channel.toneGain = toneGain;
    channel.source = toneGain;
    channel.connected = true;
    this.applyRouting();
    this.emit();
    return channel.id;
  }

  renameChannel(id: string, name: string) {
    const ch = this.channels.get(id);
    if (!ch) return;
    ch.name = name.trim() || ch.name;
    this.emit();
  }

  setVolume(id: string, volume: number) {
    const ch = this.channels.get(id);
    if (!ch) return;
    ch.volume = Math.min(1, Math.max(0, volume));
    ch.inputGain.gain.setTargetAtTime(ch.volume, this.ctx?.currentTime ?? 0, 0.01);
    this.emit();
  }

  setMuted(id: string, muted: boolean) {
    const ch = this.channels.get(id);
    if (!ch) return;
    ch.muted = muted;
    this.applyRouting();
    this.emit();
  }

  setSolo(id: string, solo: boolean) {
    const ch = this.channels.get(id);
    if (!ch) return;
    ch.solo = solo;
    this.applyRouting();
    this.emit();
  }

  setToMix(id: string, toMix: boolean) {
    const ch = this.channels.get(id);
    if (!ch) return;
    ch.toMix = toMix;
    this.applyRouting();
    this.emit();
  }

  setMasterVolume(volume: number) {
    this.masterVolume = Math.min(1, Math.max(0, volume));
    this.applyRouting();
    this.emit();
  }

  setMasterMuted(muted: boolean) {
    this.masterMuted = muted;
    this.applyRouting();
    this.emit();
  }

  removeChannel(id: string) {
    const ch = this.channels.get(id);
    if (!ch) return;
    this.detachSource(ch);
    try {
      ch.boostGain.disconnect();
      ch.inputGain.disconnect();
      ch.eqFilters.forEach((f) => f.disconnect());
      ch.fxGraph.dispose();
      ch.analyser.disconnect();
      ch.gate.disconnect();
      ch.monGate.disconnect();
    } catch {
      /* noop */
    }
    this.channels.delete(id);
    this.applyRouting();
    this.emit();
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.pcmUnsub?.();
    this.endedUnsub?.();
    this.pcmUnsub = null;
    this.endedUnsub = null;
    for (const id of [...this.channels.keys()]) this.removeChannel(id);
    for (const id of [...this.cues.keys()]) {
      if (!this.cues.get(id)?.builtin) this.removeCue(id);
    }
    this.cues.clear();
    if (this.discordAudio) {
      this.discordAudio.pause();
      this.discordAudio.srcObject = null;
      this.discordAudio = null;
    }
    void this.ctx?.close();
    this.ctx = null;
    this.mixBus = null;
    this.cueBus = null;
    this.cueMasterGain = null;
    this.cueMasterAnalyser = null;
    this.cueEqFilters = [];
    this.masterGain = null;
    this.masterAnalyser = null;
    this.masterEqFilters = [];
    this.monitorBus = null;
    this.monitorGain = null;
    this.mixToMonitor = null;
    this.discordGain = null;
    this.mixDestination = null;
    this.emit();
  }
}

export const audioEngine = new AudioEngine();

function simplifyDeviceName(label: string) {
  const cleaned = label
    .replace(/\s*\([0-9a-fA-F.:\-]+\)\s*$/, "")
    .replace(/^Default\s*-\s*/i, "")
    .trim();
  return cleaned || "App";
}
