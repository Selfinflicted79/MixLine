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
  bankId: string;
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
  /** Mic: OS noise suppression / echo cancel on the capture device. */
  noiseCancel: boolean;
  /** Mic: 0 = off, 1 = tight gate against room / TV bleed. */
  noiseGate: number;
};

export type AudioDevice = {
  deviceId: string;
  label: string;
};

export type OutputDevice = AudioDevice;

export type RackBank = {
  id: string;
  name: string;
  /** Line banks only — where this rack’s mix plays (cable, headphones, TV, etc.). */
  mixDeviceId?: string;
  /** Bank master — Stream send level, or PC/headset level for listen racks. */
  volume?: number;
  muted?: boolean;
};

export const MAX_RACK_BANKS = 3;

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
  bankId: string;
  /** Logical pad slot 0–15 (MPD-style grid). Null until assigned. */
  pad: number | null;
  /** Exact MIDI note that fires this cue (any controller). Null until learned or set. */
  midiNote: number | null;
  peak: number;
  rms: number;
};

export type PlayerTrack = {
  id: string;
  name: string;
  fileId?: string;
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
  playerVolume: number;
  playerMuted: boolean;
  playerToMix: boolean;
  playerMonitor: boolean;
  playerPeak: number;
  playerRms: number;
  playerPlaying: boolean;
  playerIndex: number;
  playerTracks: PlayerTrack[];
  channelRackName: string;
  cueRackName: string;
  cueBanks: RackBank[];
  lineBanks: RackBank[];
  activeCueBankId: string;
  activeLineBankId: string;
  running: boolean;
  anySolo: boolean;
  /** Listen to the Discord mix in headphones. */
  monitorMix: boolean;
  monitorVolume: number;
  discordDeviceId: string;
  /** Local PC / phones / TV listen destination. */
  phonesDeviceId: string;
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
  bankId: string;
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
  noiseCancel: boolean;
  noiseGate: number;
  noiseGateGain: GainNode | null;
  noiseSense: AnalyserNode | null;
  noiseSenseData: Float32Array | null;
  fileElement: HTMLAudioElement | null;
  toneOsc: OscillatorNode | null;
  toneGain: GainNode | null;
  peak: number;
  rms: number;
  timeData: Float32Array;
};

type LineBankOutput = {
  bus: GainNode;
  gain: GainNode;
  analyser: AnalyserNode;
  dest: MediaStreamAudioDestinationNode;
  audio: HTMLAudioElement;
  timeData: Float32Array;
  peak: number;
  rms: number;
};

type CueNodes = {
  id: string;
  name: string;
  builtin?: boolean;
  buffer: AudioBuffer;
  hotkey: string | null;
  fileId?: string;
  /** Logical pad slot 0–15 (MPD-style grid), or null. */
  pad: number | null;
  /** Exact MIDI note for any controller. Null until learned. */
  midiNote: number | null;
  volume: number;
  muted: boolean;
  solo: boolean;
  toMix: boolean;
  monitor: boolean;
  bankId: string;
  inputGain: GainNode | null;
  analyser: AnalyserNode | null;
  gate: GainNode | null;
  monGate: GainNode | null;
  peak: number;
  rms: number;
  timeData: Float32Array | null;
};

export type SavedSetup = {
  version: 1 | 2 | 3 | 4 | 5 | 6;
  masterVolume: number;
  masterMuted: boolean;
  masterEq?: EqBand[];
  cueMasterVolume?: number;
  cueMasterMuted?: boolean;
  cueEq?: EqBand[];
  playerVolume?: number;
  playerMuted?: boolean;
  playerToMix?: boolean;
  playerMonitor?: boolean;
  playerIndex?: number;
  playerTracks?: Array<{ id: string; name: string; fileId?: string }>;
  channelRackName?: string;
  cueRackName?: string;
  cueBanks?: RackBank[];
  lineBanks?: RackBank[];
  activeCueBankId?: string;
  activeLineBankId?: string;
  monitorEnabled?: boolean;
  monitorMix?: boolean;
  monitorVolume: number;
  cueVolume?: number;
  discordDeviceId: string;
  phonesDeviceId?: string;
  channels: Array<{
    kind: ChannelKind;
    name: string;
    volume: number;
    muted: boolean;
    solo: boolean;
    toMix: boolean;
    monitor?: boolean;
    bankId?: string;
    deviceId: string;
    deviceLabel?: string;
    captureMode?: CaptureMode;
    eq: EqBand[];
    fx?: ChannelFx;
    boostDb?: number;
    noiseCancel?: boolean;
    noiseGate?: number;
  }>;
  cues: Array<{
    id: string;
    name: string;
    builtin?: boolean;
    hotkey: string | null;
    fileId?: string;
    pad?: number | null;
    midiNote?: number | null;
    volume?: number;
    muted?: boolean;
    solo?: boolean;
    toMix?: boolean;
    monitor?: boolean;
    bankId?: string;
  }>;
};

function defaultCueBanks(): RackBank[] {
  return [{ id: "cue-bank-main", name: "Main" }];
}

function defaultLineBanks(): RackBank[] {
  return [
    {
      id: "line-bank-stream",
      name: "Stream",
      mixDeviceId: "",
      volume: 0.85,
      muted: false,
    },
  ];
}

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
  private phonesDestination: MediaStreamAudioDestinationNode | null = null;
  private phonesAudio: HTMLAudioElement | null = null;
  private playerGain: GainNode | null = null;
  private playerAnalyser: AnalyserNode | null = null;
  private playerMixGate: GainNode | null = null;
  private playerMonGate: GainNode | null = null;
  private playerTimeData: Float32Array | null = null;
  private playerSource: AudioBufferSourceNode | null = null;
  private channels = new Map<string, ChannelNodes>();
  private cues = new Map<string, CueNodes>();
  /** Live one-shots per cue — overlapping plays stack until stopCue. */
  private cueVoices = new Map<string, Set<AudioBufferSourceNode>>();
  private lineBankOutputs = new Map<string, LineBankOutput>();
  private playerTracks: Array<PlayerTrack & { buffer: AudioBuffer }> = [];
  private masterVolume = 0.85;
  private masterMuted = false;
  private cueMasterVolume = 0.9;
  private cueMasterMuted = false;
  private playerVolume = 0.85;
  private playerMuted = false;
  private playerToMix = true;
  private playerMonitor = false;
  private playerPlaying = false;
  private playerIndex = 0;
  private cueBanks: RackBank[] = defaultCueBanks();
  private lineBanks: RackBank[] = defaultLineBanks();
  private activeCueBankId = this.cueBanks[0]!.id;
  private activeLineBankId = this.lineBanks[0]!.id;
  private channelRackName = this.lineBanks[0]!.name;
  private cueRackName = this.cueBanks[0]!.name;
  private monitorMix = false;
  private monitorVolume = 0.55;
  private discordDeviceId = "";
  private phonesDeviceId = "";
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
  private playerPeak = 0;
  private playerRms = 0;
  private raf = 0;
  private listeners = new Set<(snap: MixerSnapshot) => void>();
  private peakHoldDecay = 0.96;
  private pcmUnsub: (() => void) | null = null;
  private endedUnsub: (() => void) | null = null;
  private impulse: AudioBuffer | null = null;
  private pendingPcm = new Map<string, Uint8Array[]>();
  /** Windows endpoint meter for PC / listen Mix (HyperX tray slider levels). */
  private systemPeak = 0;
  private systemRms = 0;
  private systemPeakInflight = false;
  private systemPeakClock = 0;
  private systemVolumeTimer: ReturnType<typeof setTimeout> | null = null;
  private systemMuteTimer: ReturnType<typeof setTimeout> | null = null;
  /** Ignore OS→UI volume echo while we are writing Windows volume from MixLine. */
  private systemVolumeIgnoreUntil = 0;
  private systemVolumeInflight = false;
  private systemVolumeClock = 0;

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
      channels: [...this.channels.values()]
        .filter((c) => c.bankId === this.activeLineBankId)
        .map((c) => ({
        id: c.id,
        name: c.name,
        kind: c.kind,
        volume: c.volume,
        muted: c.muted,
        solo: c.solo,
        toMix: c.toMix,
        monitor: c.monitor,
        bankId: c.bankId,
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
        noiseCancel: c.noiseCancel,
        noiseGate: c.noiseGate,
      })),
      masterVolume: this.getActiveLineBank()?.volume ?? this.masterVolume,
      masterMuted: this.getActiveLineBank()?.muted ?? this.masterMuted,
      masterPeak: this.activeMasterPeak(),
      masterRms: this.activeMasterRms(),
      masterEq: this.masterEqBands.map((b) => ({ ...b })),
      cueMasterVolume: this.cueMasterVolume,
      cueMasterMuted: this.cueMasterMuted,
      cueMasterPeak: this.cueMasterPeak,
      cueMasterRms: this.cueMasterRms,
      cueEq: this.cueEqBands.map((b) => ({ ...b })),
      playerVolume: this.playerVolume,
      playerMuted: this.playerMuted,
      playerToMix: this.playerToMix,
      playerMonitor: this.playerMonitor,
      playerPeak: this.playerPeak,
      playerRms: this.playerRms,
      playerPlaying: this.playerPlaying,
      playerIndex: this.playerIndex,
      playerTracks: this.playerTracks.map((track) => ({
        id: track.id,
        name: track.name,
        fileId: track.fileId,
      })),
      channelRackName: this.channelRackName,
      cueRackName: this.cueRackName,
      cueBanks: this.cueBanks.map((b) => ({ ...b })),
      lineBanks: this.lineBanks.map((b) => ({ ...b })),
      activeCueBankId: this.activeCueBankId,
      activeLineBankId: this.activeLineBankId,
      running: !!this.ctx && this.ctx.state === "running",
      anySolo,
      monitorMix: this.monitorMix,
      monitorVolume: this.monitorVolume,
      discordDeviceId:
        this.lineBanks.find((b) => b.id === this.activeLineBankId)?.mixDeviceId ??
        this.discordDeviceId,
      phonesDeviceId: this.phonesDeviceId,
      outputDevices: this.outputDevices,
      inputDevices: this.inputDevices,
      cues: [...this.cues.values()]
        .filter((c) => c.bankId === this.activeCueBankId)
        .map((c) => ({
        id: c.id,
        name: c.name,
        builtin: c.builtin,
        hotkey: c.hotkey,
        fileId: c.fileId,
        pad: c.pad,
        midiNote: c.midiNote,
        volume: c.volume,
        muted: c.muted,
        solo: c.solo,
        toMix: c.toMix,
        monitor: c.monitor,
        bankId: c.bankId,
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
      this.phonesDestination = this.ctx.createMediaStreamDestination();
      this.playerGain = this.ctx.createGain();
      this.playerGain.gain.value = this.playerMuted ? 0 : this.playerVolume;
      this.playerAnalyser = this.ctx.createAnalyser();
      this.playerAnalyser.fftSize = 2048;
      this.playerAnalyser.smoothingTimeConstant = 0.35;
      this.playerTimeData = new Float32Array(this.playerAnalyser.fftSize);
      this.playerMixGate = this.ctx.createGain();
      this.playerMixGate.gain.value = this.playerToMix ? 1 : 0;
      this.playerMonGate = this.ctx.createGain();
      this.playerMonGate.gain.value = this.playerMonitor ? 1 : 0;
      this.playerGain.connect(this.playerAnalyser);
      this.playerAnalyser.connect(this.playerMixGate);
      this.playerAnalyser.connect(this.playerMonGate);
      this.playerMixGate.connect(this.mixBus);
      this.playerMonGate.connect(this.monitorBus);

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
      this.monitorGain.connect(this.phonesDestination);

      this.discordAudio = new Audio();
      this.discordAudio.autoplay = true;
      this.discordAudio.srcObject = this.mixDestination.stream;
      void this.discordAudio.play().catch(() => {
        /* autoplay may wait for gesture; start() is already user-driven */
      });

      this.phonesAudio = new Audio();
      this.phonesAudio.autoplay = true;
      this.phonesAudio.srcObject = this.phonesDestination.stream;
      void this.phonesAudio.play().catch(() => {
        /* gesture / power-on */
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
      midiNote: opts?.midiNote ?? null,
      volume: opts?.volume ?? 0.85,
      muted: opts?.muted ?? false,
      solo: opts?.solo ?? false,
      toMix: opts?.toMix ?? true,
      monitor: opts?.monitor ?? false,
      bankId: opts?.bankId ?? this.activeCueBankId,
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

  private async applySink(audio: HTMLAudioElement | null, deviceId: string) {
    if (!audio || !("setSinkId" in audio)) return;
    try {
      await (
        audio as HTMLAudioElement & {
          setSinkId: (id: string) => Promise<void>;
        }
      ).setSinkId(deviceId || "");
    } catch (err) {
      throw new Error(
        err instanceof Error
          ? err.message
          : "Could not route audio to that output device.",
      );
    }
  }

  async setDiscordOutputDevice(deviceId: string) {
    await this.ensureRunning();
    const bank = this.lineBanks.find((b) => b.id === this.activeLineBankId);
    if (bank) bank.mixDeviceId = deviceId;
    if (this.activeLineBankId === this.primaryLineBankId()) {
      this.discordDeviceId = deviceId;
      await this.applySink(this.discordAudio, deviceId);
    } else {
      const out = this.ensureLineBankOutput(this.activeLineBankId);
      await this.applySink(out.audio, deviceId);
    }
    this.emit();
  }

  async setPhonesOutputDevice(deviceId: string) {
    await this.ensureRunning();
    this.phonesDeviceId = deviceId;
    await this.applySink(this.phonesAudio, deviceId);
    this.emit();
  }

  setChannelRackName(name: string) {
    const next = name.trim() || "Stream";
    this.channelRackName = next;
    const bank = this.lineBanks.find((b) => b.id === this.activeLineBankId);
    if (bank) bank.name = next;
    this.emit();
  }

  setCueRackName(name: string) {
    const next = name.trim() || "Main";
    this.cueRackName = next;
    const bank = this.cueBanks.find((b) => b.id === this.activeCueBankId);
    if (bank) bank.name = next;
    this.emit();
  }

  addCueBank() {
    if (this.cueBanks.length >= MAX_RACK_BANKS) return false;
    const n = this.cueBanks.length + 1;
    const bank = { id: uid("cue-bank"), name: `Bank ${n}` };
    this.cueBanks.push(bank);
    this.activeCueBankId = bank.id;
    this.cueRackName = bank.name;
    this.emit();
    return true;
  }

  addLineBank() {
    if (this.lineBanks.length >= MAX_RACK_BANKS) return false;
    const n = this.lineBanks.length + 1;
    const bank: RackBank = {
      id: uid("line-bank"),
      name: n === 2 ? "PC" : `Bank ${n}`,
      mixDeviceId: "",
      volume: 0.85,
      muted: false,
    };
    this.lineBanks.push(bank);
    this.activeLineBankId = bank.id;
    this.channelRackName = bank.name;
    if (this.ctx && this.mixBus) this.ensureLineBankOutput(bank.id);
    this.emit();
    void this.syncListenMixFromWindows();
    return true;
  }

  cycleCueBank(dir: -1 | 1) {
    if (this.cueBanks.length < 2) return;
    const index = this.cueBanks.findIndex((b) => b.id === this.activeCueBankId);
    const next = this.cueBanks[(index + dir + this.cueBanks.length) % this.cueBanks.length];
    if (!next) return;
    this.activeCueBankId = next.id;
    this.cueRackName = next.name;
    this.emit();
  }

  cycleLineBank(dir: -1 | 1) {
    if (this.lineBanks.length < 2) return;
    const index = this.lineBanks.findIndex((b) => b.id === this.activeLineBankId);
    const next = this.lineBanks[(index + dir + this.lineBanks.length) % this.lineBanks.length];
    if (!next) return;
    this.activeLineBankId = next.id;
    this.channelRackName = next.name;
    this.emit();
    if (next.id !== this.primaryLineBankId()) {
      void this.syncListenMixFromWindows();
    }
  }

  /** Label Windows uses for the listen Mix send (or default device). */
  listenOutputLabel() {
    const bank = this.getActiveLineBank();
    const id = bank?.mixDeviceId || this.phonesDeviceId || "";
    if (!id) return "";
    return this.outputDevices.find((d) => d.deviceId === id)?.label ?? "";
  }

  async syncListenMixFromWindows() {
    if (!window.mixlineDesktop?.getOutputVolume) return;
    if (this.isPrimaryLineBank()) return;
    try {
      const state = await window.mixlineDesktop.getOutputVolume(this.listenOutputLabel());
      const bank = this.getActiveLineBank();
      if (!bank || bank.id === this.primaryLineBankId()) return;
      let changed = false;
      if (typeof state.volume === "number") {
        const next = Math.min(1, Math.max(0, state.volume));
        if (Math.abs(next - (bank.volume ?? 0)) > 0.008) {
          bank.volume = next;
          changed = true;
        }
      }
      if (typeof state.muted === "boolean" && state.muted !== bank.muted) {
        bank.muted = state.muted;
        changed = true;
      }
      if (changed) this.emit();
    } catch {
      /* helper missing / device gone */
    }
  }

  private primaryLineBankId() {
    return this.lineBanks[0]?.id ?? this.activeLineBankId;
  }

  private getLineBank(bankId: string) {
    return this.lineBanks.find((b) => b.id === bankId);
  }

  private getActiveLineBank() {
    return this.getLineBank(this.activeLineBankId) ?? this.lineBanks[0];
  }

  isPrimaryLineBank(bankId = this.activeLineBankId) {
    return bankId === this.primaryLineBankId();
  }

  private busForLineBank(bankId: string): GainNode {
    if (!this.mixBus) throw new Error("Engine not ready");
    if (bankId === this.primaryLineBankId()) return this.mixBus;
    return this.ensureLineBankOutput(bankId).bus;
  }

  private ensureLineBankOutput(bankId: string): LineBankOutput {
    if (!this.ctx) throw new Error("Engine not ready");
    const existing = this.lineBankOutputs.get(bankId);
    if (existing) return existing;
    const bank = this.getLineBank(bankId);
    const bus = this.ctx.createGain();
    bus.gain.value = 1;
    const gain = this.ctx.createGain();
    gain.gain.value = bank?.muted ? 0 : (bank?.volume ?? 0.85);
    const analyser = this.ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.35;
    const dest = this.ctx.createMediaStreamDestination();
    bus.connect(gain);
    gain.connect(analyser);
    analyser.connect(dest);
    const audio = new Audio();
    audio.autoplay = true;
    audio.srcObject = dest.stream;
    void audio.play().catch(() => {
      /* gesture / power-on */
    });
    if (bank?.mixDeviceId) {
      void this.applySink(audio, bank.mixDeviceId).catch(() => {
        /* device may be gone */
      });
    }
    const out: LineBankOutput = {
      bus,
      gain,
      analyser,
      dest,
      audio,
      timeData: new Float32Array(analyser.fftSize),
      peak: 0,
      rms: 0,
    };
    this.lineBankOutputs.set(bankId, out);
    return out;
  }

  private wireChannelMix(ch: ChannelNodes) {
    try {
      ch.gate.disconnect();
    } catch {
      /* first wire */
    }
    if (!this.monitorBus) return;
    try {
      ch.gate.connect(this.busForLineBank(ch.bankId));
    } catch {
      /* bank missing */
    }
  }

  setCueBankId(id: string, bankId: string) {
    const cue = this.cues.get(id);
    if (!cue || !this.cueBanks.some((b) => b.id === bankId)) return;
    cue.bankId = bankId;
    this.emit();
  }

  setChannelBankId(id: string, bankId: string) {
    const ch = this.channels.get(id);
    if (!ch || !this.lineBanks.some((b) => b.id === bankId)) return;
    ch.bankId = bankId;
    this.wireChannelMix(ch);
    this.emit();
  }

  applyRackBanks(setup: {
    cueBanks?: RackBank[];
    lineBanks?: RackBank[];
    activeCueBankId?: string;
    activeLineBankId?: string;
  }) {
    if (setup.cueBanks?.length) {
      this.cueBanks = setup.cueBanks.slice(0, MAX_RACK_BANKS).map((b) => ({ ...b }));
    }
    if (setup.lineBanks?.length) {
      this.lineBanks = setup.lineBanks.slice(0, MAX_RACK_BANKS).map((b, index) => ({
        id: b.id,
        name: b.name,
        mixDeviceId: b.mixDeviceId ?? "",
        volume:
          typeof b.volume === "number"
            ? b.volume
            : index === 0
              ? this.masterVolume
              : 0.85,
        muted: typeof b.muted === "boolean" ? b.muted : index === 0 ? this.masterMuted : false,
      }));
      const primary = this.lineBanks[0];
      if (primary) {
        this.masterVolume = primary.volume ?? 0.85;
        this.masterMuted = Boolean(primary.muted);
      }
    }
    if (
      setup.activeCueBankId &&
      this.cueBanks.some((b) => b.id === setup.activeCueBankId)
    ) {
      this.activeCueBankId = setup.activeCueBankId;
    } else {
      this.activeCueBankId = this.cueBanks[0]!.id;
    }
    if (
      setup.activeLineBankId &&
      this.lineBanks.some((b) => b.id === setup.activeLineBankId)
    ) {
      this.activeLineBankId = setup.activeLineBankId;
    } else {
      this.activeLineBankId = this.lineBanks[0]!.id;
    }
    this.cueRackName =
      this.cueBanks.find((b) => b.id === this.activeCueBankId)?.name ?? "Main";
    this.channelRackName =
      this.lineBanks.find((b) => b.id === this.activeLineBankId)?.name ?? "Stream";
    const primary = this.lineBanks[0];
    if (primary) {
      if (!primary.mixDeviceId && this.discordDeviceId) {
        primary.mixDeviceId = this.discordDeviceId;
      }
      this.discordDeviceId = primary.mixDeviceId ?? "";
    }
    if (this.ctx && this.mixBus) {
      for (const bank of this.lineBanks) {
        if (bank.id === this.primaryLineBankId()) continue;
        this.ensureLineBankOutput(bank.id);
      }
      for (const ch of this.channels.values()) this.wireChannelMix(ch);
      void this.applyLineBankSinks();
    }
    this.emit();
  }

  async applyLineBankSinks() {
    if (!this.ctx) return;
    for (const bank of this.lineBanks) {
      const deviceId = bank.mixDeviceId ?? "";
      try {
        if (bank.id === this.primaryLineBankId()) {
          this.discordDeviceId = deviceId;
          await this.applySink(this.discordAudio, deviceId);
        } else {
          const out = this.ensureLineBankOutput(bank.id);
          await this.applySink(out.audio, deviceId);
        }
      } catch {
        /* device missing */
      }
    }
  }

  async addPlayerTrack(file: File, fileId?: string) {
    await this.ensureRunning();
    if (!this.ctx) throw new Error("Engine not ready");
    const raw = await file.arrayBuffer();
    // decodeAudioData detaches the buffer — always pass a copy.
    const copy = raw.slice(0);
    let buffer: AudioBuffer;
    try {
      buffer = await this.ctx.decodeAudioData(copy);
    } catch {
      throw new Error(`Could not decode “${file.name}”. Try MP3, WAV, FLAC, or M4A.`);
    }
    const id = uid("play");
    this.playerTracks.push({
      id,
      name: file.name.replace(/\.[^.]+$/, "") || "Track",
      fileId: fileId ?? id,
      buffer,
    });
    if (this.playerTracks.length === 1) this.playerIndex = 0;
    this.emit();
    return id;
  }

  async addPlayerTrackFromArrayBuffer(
    arrayBuf: ArrayBuffer,
    meta: { id?: string; name: string; fileId?: string },
  ) {
    await this.ensureRunning();
    if (!this.ctx) throw new Error("Engine not ready");
    const buffer = await this.ctx.decodeAudioData(arrayBuf.slice(0));
    const id = meta.id ?? uid("play");
    if (this.playerTracks.some((track) => track.id === id)) return id;
    this.playerTracks.push({
      id,
      name: meta.name || "Track",
      fileId: meta.fileId ?? id,
      buffer,
    });
    if (this.playerTracks.length === 1) this.playerIndex = 0;
    this.emit();
    return id;
  }

  removePlayerTrack(id: string) {
    const index = this.playerTracks.findIndex((track) => track.id === id);
    if (index < 0) return;
    const wasCurrent = index === this.playerIndex;
    this.playerTracks.splice(index, 1);
    if (wasCurrent) this.stopPlayerSource();
    this.playerIndex = Math.min(this.playerIndex, Math.max(0, this.playerTracks.length - 1));
    this.emit();
  }

  movePlayerTrack(id: string, toIndex: number) {
    const from = this.playerTracks.findIndex((track) => track.id === id);
    if (from < 0) return;
    const currentId = this.playerTracks[this.playerIndex]?.id;
    const [item] = this.playerTracks.splice(from, 1);
    if (!item) return;
    const index = Math.min(this.playerTracks.length, Math.max(0, Math.round(toIndex)));
    this.playerTracks.splice(index, 0, item);
    if (currentId) {
      const next = this.playerTracks.findIndex((track) => track.id === currentId);
      this.playerIndex = next >= 0 ? next : 0;
    }
    this.emit();
  }

  setPlayerVolume(volume: number) {
    this.playerVolume = Math.min(1, Math.max(0, volume));
    if (this.playerGain) {
      this.playerGain.gain.setTargetAtTime(
        this.playerMuted ? 0 : this.playerVolume,
        this.ctx?.currentTime ?? 0,
        0.01,
      );
    }
    this.emit();
  }

  setPlayerMuted(muted: boolean) {
    this.playerMuted = muted;
    if (this.playerGain) {
      this.playerGain.gain.setTargetAtTime(
        muted ? 0 : this.playerVolume,
        this.ctx?.currentTime ?? 0,
        0.01,
      );
    }
    this.applyRouting();
    this.emit();
  }

  setPlayerToMix(toMix: boolean) {
    this.playerToMix = toMix;
    this.applyRouting();
    this.emit();
  }

  setPlayerMonitor(monitor: boolean) {
    this.playerMonitor = monitor;
    this.applyRouting();
    this.emit();
  }

  togglePlayerMute() {
    this.setPlayerMuted(!this.playerMuted);
  }

  private stopPlayerSource() {
    if (this.playerSource) {
      try {
        this.playerSource.onended = null;
        this.playerSource.stop();
        this.playerSource.disconnect();
      } catch {
        /* already stopped */
      }
      this.playerSource = null;
    }
    this.playerPlaying = false;
  }

  playPlayer(index?: number) {
    if (!this.ctx || !this.playerGain) return;
    if (typeof index === "number") {
      this.playerIndex = Math.min(this.playerTracks.length - 1, Math.max(0, index));
    }
    const track = this.playerTracks[this.playerIndex];
    if (!track) return;
    this.stopPlayerSource();
    const source = this.ctx.createBufferSource();
    source.buffer = track.buffer;
    source.connect(this.playerGain);
    source.onended = () => {
      if (this.playerSource !== source) return;
      this.playerSource = null;
      if (this.playerIndex < this.playerTracks.length - 1) {
        this.playerIndex += 1;
        this.playPlayer();
        return;
      }
      this.playerPlaying = false;
      this.emit();
    };
    source.start();
    this.playerSource = source;
    this.playerPlaying = true;
    this.emit();
  }

  pausePlayer() {
    this.stopPlayerSource();
    this.emit();
  }

  togglePlayer() {
    if (this.playerPlaying) this.pausePlayer();
    else this.playPlayer();
  }

  setPlayerIndex(index: number) {
    if (!this.playerTracks.length) {
      this.playerIndex = 0;
      this.emit();
      return;
    }
    this.playerIndex = Math.min(
      this.playerTracks.length - 1,
      Math.max(0, Math.round(index)),
    );
    this.emit();
  }

  nextPlayerTrack() {
    if (!this.playerTracks.length) return;
    this.playerIndex = (this.playerIndex + 1) % this.playerTracks.length;
    if (this.playerPlaying) this.playPlayer();
    else this.emit();
  }

  prevPlayerTrack() {
    if (!this.playerTracks.length) return;
    this.playerIndex =
      (this.playerIndex - 1 + this.playerTracks.length) % this.playerTracks.length;
    if (this.playerPlaying) this.playPlayer();
    else this.emit();
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
    let voices = this.cueVoices.get(id);
    if (!voices) {
      voices = new Set();
      this.cueVoices.set(id, voices);
    }
    voices.add(src);
    src.onended = () => {
      voices!.delete(src);
      try {
        src.disconnect();
      } catch {
        /* already disconnected */
      }
    };
    src.start();
  }

  /** Stop every overlapping play of this cue only (not the whole rack). */
  stopCue(id: string) {
    const voices = this.cueVoices.get(id);
    if (!voices?.size) return;
    for (const src of voices) {
      try {
        src.onended = null;
        src.stop();
        src.disconnect();
      } catch {
        /* already stopped */
      }
    }
    voices.clear();
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
      bankId?: string;
      fileId?: string;
      hotkey?: string | null;
      pad?: number | null;
      midiNote?: number | null;
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
        midiNote: meta.midiNote ?? null,
        volume: meta.volume,
        muted: meta.muted,
        solo: meta.solo,
        toMix: meta.toMix,
        monitor: meta.monitor,
        bankId: meta.bankId ?? this.activeCueBankId,
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

  /** Assign a logical pad slot (0–15). Null clears pad + learned note. */
  setCuePad(id: string, pad: number | null) {
    const cue = this.cues.get(id);
    if (!cue) return;
    if (pad === null) {
      cue.pad = null;
      cue.midiNote = null;
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

  /** Bind the exact MIDI note from any controller. Clears other cues on that note. */
  setCueMidiNote(id: string, note: number | null) {
    const cue = this.cues.get(id);
    if (!cue) return;
    if (note === null) {
      cue.midiNote = null;
      this.emit();
      return;
    }
    const next = Math.min(127, Math.max(0, Math.round(note)));
    for (const other of this.cues.values()) {
      if (other.id !== id && other.midiNote === next) other.midiNote = null;
    }
    cue.midiNote = next;
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
    this.stopCue(id);
    this.cueVoices.delete(id);
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
      version: 6,
      masterVolume: this.masterVolume,
      masterMuted: this.masterMuted,
      masterEq: this.masterEqBands.map((b) => ({ ...b })),
      cueMasterVolume: this.cueMasterVolume,
      cueMasterMuted: this.cueMasterMuted,
      cueEq: this.cueEqBands.map((b) => ({ ...b })),
      playerVolume: this.playerVolume,
      playerMuted: this.playerMuted,
      playerToMix: this.playerToMix,
      playerMonitor: this.playerMonitor,
      playerIndex: this.playerIndex,
      playerTracks: this.playerTracks.map((track) => ({
        id: track.id,
        name: track.name,
        fileId: track.fileId,
      })),
      channelRackName: this.channelRackName,
      cueRackName: this.cueRackName,
      cueBanks: this.cueBanks.map((b) => ({ ...b })),
      lineBanks: this.lineBanks.map((b) => ({ ...b })),
      activeCueBankId: this.activeCueBankId,
      activeLineBankId: this.activeLineBankId,
      monitorMix: this.monitorMix,
      monitorVolume: this.monitorVolume,
      discordDeviceId: this.discordDeviceId,
      phonesDeviceId: this.phonesDeviceId,
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
          bankId: c.bankId,
          deviceId: c.deviceId,
          deviceLabel: c.deviceLabel,
          captureMode: c.captureMode,
          eq: c.eqBands.map((b) => ({ ...b })),
          fx: { ...c.fx },
          boostDb: c.boostDb,
          noiseCancel: c.noiseCancel,
          noiseGate: c.noiseGate,
        })),
      cues: [...this.cues.values()].map((c) => ({
        id: c.id,
        name: c.name,
        builtin: c.builtin,
        hotkey: c.hotkey,
        fileId: c.fileId,
        pad: c.pad,
        midiNote: c.midiNote,
        volume: c.volume,
        muted: c.muted,
        solo: c.solo,
        toMix: c.toMix,
        monitor: c.monitor,
        bankId: c.bankId,
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
      noiseCancel?: boolean;
      noiseGate?: number;
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
    if (typeof settings.noiseGate === "number") {
      ch.noiseGate = Math.min(1, Math.max(0, settings.noiseGate));
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
    if (typeof settings.noiseCancel === "boolean" && ch.kind === "mic") {
      await this.setMicNoiseCancel(channelId, settings.noiseCancel);
    }
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
    this.pollWindowsOutputPeak();
    this.pollWindowsOutputVolume();
    const t = this.ctx?.currentTime ?? 0;
    for (const ch of this.channels.values()) {
      if (ch.noiseGateGain && ch.noiseSense && ch.noiseSenseData) {
        if (ch.noiseGate <= 0.01 || !ch.connected) {
          ch.noiseGateGain.gain.setTargetAtTime(1, t, 0.02);
        } else {
          ch.noiseSense.getFloatTimeDomainData(
            ch.noiseSenseData as Float32Array<ArrayBuffer>,
          );
          let sum = 0;
          for (let i = 0; i < ch.noiseSenseData.length; i++) {
            const s = ch.noiseSenseData[i]!;
            sum += s * s;
          }
          const rms = Math.sqrt(sum / ch.noiseSenseData.length);
          // Higher gate = higher threshold (more of the room stays out).
          const threshold = 0.004 + ch.noiseGate * 0.045;
          const open = rms >= threshold ? 1 : 0;
          ch.noiseGateGain.gain.setTargetAtTime(open, t, open ? 0.012 : 0.06);
        }
      }
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
    if (this.playerAnalyser && this.playerTimeData) {
      const prev = { peak: this.playerPeak, rms: this.playerRms };
      this.readMeter(this.playerAnalyser, this.playerTimeData, prev);
      this.playerPeak = prev.peak;
      this.playerRms = prev.rms;
    } else {
      this.playerPeak *= this.peakHoldDecay;
      this.playerRms *= 0.85;
    }
    for (const out of this.lineBankOutputs.values()) {
      this.readMeter(out.analyser, out.timeData, out);
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

    let noiseGateGain: GainNode | null = null;
    let noiseSense: AnalyserNode | null = null;
    let noiseSenseData: Float32Array | null = null;
    if (kind === "mic") {
      noiseGateGain = this.ctx.createGain();
      noiseGateGain.gain.value = 1;
      noiseSense = this.ctx.createAnalyser();
      noiseSense.fftSize = 2048;
      noiseSense.smoothingTimeConstant = 0.5;
      noiseSenseData = new Float32Array(noiseSense.fftSize);
      boostGain.disconnect();
      boostGain.connect(noiseSense);
      boostGain.connect(noiseGateGain);
      noiseGateGain.connect(inputGain);
    }

    if (eqIn && eqOut) {
      inputGain.connect(eqIn);
      eqOut.connect(fxGraph.input);
    } else {
      inputGain.connect(fxGraph.input);
    }
    fxGraph.output.connect(analyser);
    analyser.connect(gate);
    analyser.connect(monGate);
    monGate.connect(this.monitorBus);

    // Only mic/app (isolated) default onto the main mix. System loopback stays off.
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
      bankId: this.activeLineBankId,
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
      noiseCancel: kind === "mic",
      noiseGate: kind === "mic" ? 0.4 : 0,
      noiseGateGain,
      noiseSense,
      noiseSenseData,
      fileElement: null,
      toneOsc: null,
      toneGain: null,
      peak: 0,
      rms: 0,
      timeData: new Float32Array(analyser.fftSize),
    };
    this.channels.set(channel.id, channel);
    this.wireChannelMix(channel);
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
    if (this.playerMixGate && this.playerMonGate) {
      const playMix = this.playerToMix && !this.playerMuted;
      const playMon = this.playerMonitor && !this.playerMuted;
      this.playerMixGate.gain.setTargetAtTime(playMix ? 1 : 0, t, 0.015);
      this.playerMonGate.gain.setTargetAtTime(playMon ? 1 : 0, t, 0.015);
    }
    const primary = this.lineBanks[0];
    if (this.masterGain) {
      const vol = primary?.volume ?? this.masterVolume;
      const muted = primary?.muted ?? this.masterMuted;
      this.masterGain.gain.setTargetAtTime(muted ? 0 : vol, t, 0.015);
    }
    for (const bank of this.lineBanks) {
      if (bank.id === this.primaryLineBankId()) continue;
      const out = this.lineBankOutputs.get(bank.id);
      if (!out) continue;
      // Listen Mix owns Windows device volume — keep MixLine bank path at unity.
      out.gain.gain.setTargetAtTime(1, t, 0.015);
    }
    if (this.monitorGain) {
      // MON path stays unity on listen racks; PC Mix moves the OS headset slider instead.
      this.monitorGain.gain.setTargetAtTime(this.monitorVolume, t, 0.015);
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
    const cue = this.cues.get(id);
    if (!cue) return;
    const all = [...this.cues.entries()];
    const bankEntries = all.filter(([, c]) => c.bankId === cue.bankId);
    const from = bankEntries.findIndex(([cueId]) => cueId === id);
    if (from < 0) return;
    const [item] = bankEntries.splice(from, 1);
    if (!item) return;
    const index = Math.min(bankEntries.length, Math.max(0, Math.round(toIndex)));
    bankEntries.splice(index, 0, item);
    let bi = 0;
    const next = new Map<string, CueNodes>();
    for (const [cueId, node] of all) {
      if (node.bankId === cue.bankId) {
        const replacement = bankEntries[bi++];
        if (replacement) next.set(replacement[0], replacement[1]);
      } else {
        next.set(cueId, node);
      }
    }
    this.cues = next;
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

  private async openMicStream(deviceId?: string, noiseCancel = true) {
    if (window.mixlineDesktop) {
      await window.mixlineDesktop.requestMicAccess();
    }
    const audio: MediaTrackConstraints = {
      echoCancellation: noiseCancel,
      noiseSuppression: noiseCancel,
      autoGainControl: false,
    };
    if (deviceId) audio.deviceId = { exact: deviceId };
    return navigator.mediaDevices.getUserMedia({ audio, video: false });
  }

  async addMic(name = "Mic", deviceId?: string) {
    await this.ensureRunning();
    // First grab any mic so labels populate, then reopen the chosen device if needed.
    let stream = await this.openMicStream(deviceId || undefined, true);
    await this.refreshDevices();
    const chosen = deviceId || this.preferredMicDeviceId();
    if (chosen && !deviceId) {
      const trackDevice = stream.getAudioTracks()[0]?.getSettings().deviceId;
      if (trackDevice && trackDevice !== chosen) {
        stream.getTracks().forEach((t) => t.stop());
        stream = await this.openMicStream(chosen, true);
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
    const stream = await this.openMicStream(deviceId || undefined, channel.noiseCancel);
    channel.deviceId =
      deviceId || stream.getAudioTracks()[0]?.getSettings().deviceId || "";
    channel.deviceLabel =
      this.inputDevices.find((d) => d.deviceId === channel.deviceId)?.label ||
      channel.deviceLabel;
    channel.needsReconnect = false;
    this.attachStream(channel, stream);
    await this.refreshDevices();
  }

  async setMicNoiseCancel(channelId: string, enabled: boolean) {
    const channel = this.channels.get(channelId);
    if (!channel || channel.kind !== "mic") return;
    channel.noiseCancel = enabled;
    if (!channel.deviceId && !channel.connected) {
      this.emit();
      return;
    }
    try {
      const stream = await this.openMicStream(channel.deviceId || undefined, enabled);
      this.attachStream(channel, stream);
      await this.refreshDevices();
    } catch {
      /* keep prior stream if reopen fails */
    }
    this.emit();
  }

  setMicNoiseGate(channelId: string, amount: number) {
    const channel = this.channels.get(channelId);
    if (!channel || channel.kind !== "mic") return;
    channel.noiseGate = Math.min(1, Math.max(0, amount));
    this.emit();
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

  setToMix(id: string, toMix: boolean): string | null {
    const ch = this.channels.get(id);
    if (!ch) return null;
    ch.toMix = toMix;
    this.applyRouting();
    this.emit();
    if (!toMix) return null;
    if (ch.captureMode === "system") {
      return "System capture on a listen rack echoes if Mix send is your headphones. Prefer App strips (Chrome, game, Steam), and use MixLine Player with MON for music in your ears.";
    }
    return null;
  }

  setMasterVolume(volume: number) {
    const next = Math.min(1, Math.max(0, volume));
    const bank = this.getActiveLineBank();
    if (bank) bank.volume = next;
    if (!bank || bank.id === this.primaryLineBankId()) {
      // Stream rack Mix = Discord/OBS send level only.
      this.masterVolume = next;
    } else {
      // PC / listen rack Mix = Windows headset/speakers volume (tray slider).
      const label = this.listenOutputLabel();
      if (window.mixlineDesktop?.setOutputVolume) {
        this.systemVolumeIgnoreUntil = performance.now() + 450;
        if (this.systemVolumeTimer) clearTimeout(this.systemVolumeTimer);
        this.systemVolumeTimer = setTimeout(() => {
          this.systemVolumeTimer = null;
          this.systemVolumeIgnoreUntil = performance.now() + 350;
          void window.mixlineDesktop
            ?.setOutputVolume(next, label)
            .catch(() => {
              /* keep UI value even if OS set fails */
            });
        }, 40);
      }
    }
    this.applyRouting();
    this.emit();
  }

  setMasterMuted(muted: boolean) {
    const bank = this.getActiveLineBank();
    if (bank) bank.muted = muted;
    if (!bank || bank.id === this.primaryLineBankId()) {
      this.masterMuted = muted;
    } else if (window.mixlineDesktop?.setOutputMuted) {
      const label = this.listenOutputLabel();
      this.systemVolumeIgnoreUntil = performance.now() + 450;
      if (this.systemMuteTimer) clearTimeout(this.systemMuteTimer);
      this.systemMuteTimer = setTimeout(() => {
        this.systemMuteTimer = null;
        this.systemVolumeIgnoreUntil = performance.now() + 350;
        void window.mixlineDesktop?.setOutputMuted(muted, label).catch(() => {
          /* ignore */
        });
      }, 40);
    }
    this.applyRouting();
    this.emit();
  }

  private activeMasterPeak() {
    if (this.isPrimaryLineBank()) return this.masterPeak;
    return Math.max(
      this.systemPeak,
      this.lineBankOutputs.get(this.activeLineBankId)?.peak ?? 0,
      this.playerPeak * (this.playerMonitor ? 1 : 0),
    );
  }

  private activeMasterRms() {
    if (this.isPrimaryLineBank()) return this.masterRms;
    return Math.max(
      this.systemRms,
      this.lineBankOutputs.get(this.activeLineBankId)?.rms ?? 0,
      this.playerRms * (this.playerMonitor ? 1 : 0),
    );
  }

  private pollWindowsOutputPeak() {
    if (this.isPrimaryLineBank()) return;
    if (!window.mixlineDesktop?.getOutputPeak) return;
    if (this.systemPeakInflight) return;
    this.systemPeakClock += 1;
    if (this.systemPeakClock % 2 !== 0) return;
    this.systemPeakInflight = true;
    void window.mixlineDesktop
      .getOutputPeak(this.listenOutputLabel())
      .then((result) => {
        const peak = Math.min(1, Math.max(0, Number(result.peak) || 0));
        this.systemPeak = Math.max(peak, this.systemPeak * this.peakHoldDecay);
        this.systemRms = this.systemRms * 0.7 + peak * 0.3;
      })
      .catch(() => {
        this.systemPeak *= this.peakHoldDecay;
        this.systemRms *= 0.85;
      })
      .finally(() => {
        this.systemPeakInflight = false;
      });
  }

  /** Keep PC Mix fader locked to Windows tray/headset/keyboard volume. Stream Mix untouched. */
  private pollWindowsOutputVolume() {
    if (this.isPrimaryLineBank()) return;
    if (!window.mixlineDesktop?.getOutputVolume) return;
    if (this.systemVolumeTimer) return;
    if (performance.now() < this.systemVolumeIgnoreUntil) return;
    if (this.systemVolumeInflight) return;
    this.systemVolumeClock += 1;
    if (this.systemVolumeClock % 4 !== 0) return;
    this.systemVolumeInflight = true;
    void window.mixlineDesktop
      .getOutputVolume(this.listenOutputLabel())
      .then((state) => {
        if (this.isPrimaryLineBank()) return;
        if (this.systemVolumeTimer) return;
        if (performance.now() < this.systemVolumeIgnoreUntil) return;
        const bank = this.getActiveLineBank();
        if (!bank || bank.id === this.primaryLineBankId()) return;
        let changed = false;
        if (typeof state.volume === "number") {
          const next = Math.min(1, Math.max(0, state.volume));
          if (Math.abs(next - (bank.volume ?? 0)) > 0.008) {
            bank.volume = next;
            changed = true;
          }
        }
        if (typeof state.muted === "boolean" && state.muted !== bank.muted) {
          bank.muted = state.muted;
          changed = true;
        }
        if (changed) this.emit();
      })
      .catch(() => {
        /* helper missing / device gone */
      })
      .finally(() => {
        this.systemVolumeInflight = false;
      });
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
    this.stopPlayerSource();
    this.playerTracks = [];
    if (this.discordAudio) {
      this.discordAudio.pause();
      this.discordAudio.srcObject = null;
      this.discordAudio = null;
    }
    if (this.phonesAudio) {
      this.phonesAudio.pause();
      this.phonesAudio.srcObject = null;
      this.phonesAudio = null;
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
    this.phonesDestination = null;
    this.playerGain = null;
    this.playerAnalyser = null;
    this.playerMixGate = null;
    this.playerMonGate = null;
    this.playerTimeData = null;
    for (const out of this.lineBankOutputs.values()) {
      try {
        out.bus.disconnect();
        out.audio.pause();
        out.audio.srcObject = null;
      } catch {
        /* noop */
      }
    }
    this.lineBankOutputs.clear();
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
