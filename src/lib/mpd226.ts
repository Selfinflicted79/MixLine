/**
 * MIDI controller → MixLine.
 * Any USB / virtual MIDI input can be selected. MPD226 factory maps are still
 * recognized for pads, faders, and knobs. BPH Share (Stream Controller) is an
 * optional localhost feed when another BPH app owns the hardware port.
 */

export type MidiDeviceOption = {
  id: string;
  name: string;
};

export type MpdStatus = {
  connected: boolean;
  /** Live source label: device name, "BPH Share", or null. */
  name: string | null;
  preferred: string;
  devices: MidiDeviceOption[];
  shareAvailable: boolean;
  /** Physical fader count learned from the controller (4–8). */
  faderCount: number;
};

const SHARE_URL = "ws://127.0.0.1:18726/";
const DEVICE_KEY = "mixline.midi.device";
/** Prefer BPH Share when Stream Controller is on. Else first matching hardware. */
export const MIDI_AUTO = "auto";
export const MIDI_SHARE = "bph-share";

type Controls = "livelite" | "generic" | "reason" | "bitwig" | "protools" | "cubase";

const LIVELITE_NOTES = [60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79, 81, 83, 84, 86];
const DRUM_NOTES = [37, 36, 42, 82, 40, 38, 46, 44, 48, 47, 45, 43, 49, 55, 51, 53];
const STUDIO_NOTES = [47, 48, 49, 50, 43, 44, 45, 46, 39, 40, 41, 42, 35, 36, 37, 38];

/** Up to 8 sliders for bigger surfaces; MPD226 uses the first 4. */
export const MAX_MIDI_FADERS = 8;
export const MIN_MIDI_FADERS = 4;

const GENERIC_FADERS = [
  [20, 21, 22, 23, 24, 25, 26, 27],
  [61, 62, 63, 70, 71, 72, 73, 74],
  [92, 93, 94, 95, 96, 97, 98, 99],
];
const GENERIC_KNOBS = [
  [3, 9, 14, 15],
  [52, 53, 54, 55],
  [83, 85, 86, 87],
];
const GENERIC_SWITCHES = [28, 29, 30, 31, 32, 33, 34, 35];

export type MpdControl =
  | { kind: "none" }
  | { kind: "volume"; id: string }
  | { kind: "trim"; id: string }
  | { kind: "cue" }
  | { kind: "play" }
  | { kind: "mix" }
  | { kind: "eq"; bandId: string }
  | { kind: "phones" };

const ASSIGN_KEY = "mixline.mpd.assign";
const EQ_BANDS = [
  { id: "low", label: "EQ Low" },
  { id: "lm", label: "EQ L-Mid" },
  { id: "mid", label: "EQ Mid" },
  { id: "hm", label: "EQ H-Mid" },
  { id: "high", label: "EQ High" },
] as const;

export type MpdAssign = {
  /**
   * Customizable slider targets (stable refs). Length up to MAX_MIDI_FADERS-1;
   * the last physical slider is always Mix for the active rack.
   */
  faders: string[];
  knobs: [string, string, string, string];
  /** Last known physical slider count (4–8). */
  faderCount: number;
};

type NamedChannel = {
  id: string;
  name: string;
  kind: string;
  deviceId?: string;
};

/** Survives relaunch — channel ids are regenerated, names/deviceIds are not. */
export function volumeRef(channel: NamedChannel) {
  return `volref:${channel.kind}|${channel.name}|${channel.deviceId ?? ""}`;
}

export function trimRef(channel: NamedChannel) {
  return `trimref:${channel.kind}|${channel.name}|${channel.deviceId ?? ""}`;
}

function resolveNamedChannel(raw: string, channels: NamedChannel[]) {
  if (raw.startsWith("vol:") || raw.startsWith("trim:")) {
    const id = raw.slice(raw.indexOf(":") + 1);
    return channels.find((channel) => channel.id === id) ?? null;
  }
  if (!raw.startsWith("volref:") && !raw.startsWith("trimref:")) return null;
  const tag = raw.slice(raw.indexOf(":") + 1);
  const [kind, name, ...deviceParts] = tag.split("|");
  const deviceId = deviceParts.join("|");
  return (
    channels.find(
      (channel) =>
        channel.kind === kind &&
        channel.name === name &&
        (channel.deviceId ?? "") === deviceId,
    ) ||
    channels.find(
      (channel) => channel.name === name && (!deviceId || (channel.deviceId ?? "") === deviceId),
    ) ||
    channels.find((channel) => channel.name.toLowerCase() === (name || "").toLowerCase()) ||
    null
  );
}

export function encodeControl(control: MpdControl, channels: NamedChannel[] = []) {
  if (control.kind === "none") return "";
  if (control.kind === "volume") {
    const channel = channels.find((item) => item.id === control.id);
    return channel ? volumeRef(channel) : `vol:${control.id}`;
  }
  if (control.kind === "trim") {
    const channel = channels.find((item) => item.id === control.id);
    return channel ? trimRef(channel) : `trim:${control.id}`;
  }
  if (control.kind === "eq") return `eq:${control.bandId}`;
  return control.kind;
}

export function decodeControl(raw: string): MpdControl | null {
  if (!raw || raw === "none") return { kind: "none" };
  if (raw === "cue" || raw === "play" || raw === "mix" || raw === "phones") {
    return { kind: raw };
  }
  if (raw.startsWith("eq:")) return { kind: "eq", bandId: raw.slice(3) };
  if (raw.startsWith("vol:") || raw.startsWith("volref:")) return { kind: "volume", id: raw };
  if (raw.startsWith("trim:") || raw.startsWith("trimref:")) return { kind: "trim", id: raw };
  return null;
}

function clampFaderCount(value: number | undefined) {
  if (!Number.isFinite(value)) return MIN_MIDI_FADERS;
  return Math.min(MAX_MIDI_FADERS, Math.max(MIN_MIDI_FADERS, Math.round(value!)));
}

function padFaders(faders: string[] | undefined, playDefault = true): string[] {
  const slots = MAX_MIDI_FADERS - 1;
  const next = Array.from({ length: slots }, (_, i) => faders?.[i] ?? "");
  if (playDefault && next.every((slot) => !slot) && !faders?.length) {
    next[2] = "play";
  } else if (playDefault && (faders?.length ?? 0) < 3 && !next[2]) {
    // Keep historical default: slider 3 = Play when unset.
    if (!(faders && faders.length >= 3)) next[2] = next[2] || "play";
  }
  return next;
}

/** Drop duplicate slider targets so two physical faders can't fight (e.g. Play twice). */
export function uniquifyFaders(faders: string[]): string[] {
  const next = padFaders(faders, false);
  const used = new Set<string>();
  for (let i = 0; i < next.length; i++) {
    const raw = next[i] ?? "";
    if (!raw || used.has(raw)) {
      next[i] = "";
      continue;
    }
    used.add(raw);
  }
  return next;
}

export function loadMpdAssign(): MpdAssign {
  try {
    const parsed = JSON.parse(localStorage.getItem(ASSIGN_KEY) ?? "") as Partial<MpdAssign>;
    const faders = parsed.faders;
    const knobs = parsed.knobs;
    const loaded = padFaders(
      Array.isArray(faders) ? faders : [faders?.[0] ?? "", faders?.[1] ?? "", faders?.[2] ?? "play"],
      true,
    );
    // Historical default: empty board → slider 3 Play.
    if (!loaded[2] && !(Array.isArray(faders) && faders[2] === "")) loaded[2] = loaded[2] || "play";
    return {
      faders: uniquifyFaders(loaded),
      knobs: [knobs?.[0] ?? "", knobs?.[1] ?? "", knobs?.[2] ?? "", knobs?.[3] ?? ""],
      faderCount: clampFaderCount(parsed.faderCount),
    };
  } catch {
    return { faders: padFaders(["", "", "play"]), knobs: ["", "", "", ""], faderCount: MIN_MIDI_FADERS };
  }
}

export function saveMpdAssign(assign: MpdAssign) {
  localStorage.setItem(
    ASSIGN_KEY,
    JSON.stringify({
      ...assign,
      faders: uniquifyFaders(assign.faders),
      faderCount: clampFaderCount(assign.faderCount),
    }),
  );
}

export function loadMidiDevice(): string {
  try {
    const raw = localStorage.getItem(DEVICE_KEY);
    if (raw === MIDI_SHARE || raw === MIDI_AUTO) return raw;
    if (raw && raw.length > 0) return raw;
  } catch {
    /* ignore */
  }
  return MIDI_AUTO;
}

export function saveMidiDevice(id: string) {
  localStorage.setItem(DEVICE_KEY, id);
}

function liveInputs(channels: NamedChannel[]) {
  return channels.filter((channel) => channel.kind !== "desktop");
}

export function assignableFaderCount(faderCount: number) {
  return Math.max(1, clampFaderCount(faderCount) - 1);
}

/** Customizable slots follow the saved pick. The last physical slider is always Mix. */
export function faderControl(index: number, assign: MpdAssign, channels: NamedChannel[]): MpdControl {
  const count = clampFaderCount(assign.faderCount);
  if (index >= count - 1) return { kind: "mix" };
  if (index < 0 || index >= assignableFaderCount(count)) return { kind: "none" };
  const raw = assign.faders[index] ?? "";
  if (!raw) return { kind: "none" };
  for (let i = 0; i < index; i++) {
    if ((assign.faders[i] ?? "") === raw) return { kind: "none" };
  }
  if (raw === "cue" || raw === "play" || raw === "mix" || raw === "phones") {
    return { kind: raw };
  }
  if (raw.startsWith("vol:") || raw.startsWith("volref:")) {
    const channel = resolveNamedChannel(raw, channels);
    return channel ? { kind: "volume", id: channel.id } : { kind: "none" };
  }
  return { kind: "none" };
}

const KNOB_FALLBACK: MpdControl[] = [
  { kind: "eq", bandId: "low" },
  { kind: "eq", bandId: "lm" },
  { kind: "eq", bandId: "mid" },
  { kind: "eq", bandId: "hm" },
];

export function knobControl(index: number, assign: MpdAssign, channels: NamedChannel[]): MpdControl {
  const raw = assign.knobs[index] ?? "";
  if (raw === "cue" || raw === "play" || raw === "mix" || raw === "phones") {
    return { kind: raw };
  }
  if (raw.startsWith("eq:")) return { kind: "eq", bandId: raw.slice(3) };
  if (raw.startsWith("vol:") || raw.startsWith("volref:")) {
    const channel = resolveNamedChannel(raw, channels);
    if (channel) return { kind: "volume", id: channel.id };
  } else if (raw.startsWith("trim:") || raw.startsWith("trimref:")) {
    const channel = resolveNamedChannel(raw, channels);
    if (channel) return { kind: "trim", id: channel.id };
  } else if (raw) {
    return { kind: "none" };
  }
  const inputs = liveInputs(channels);
  const channel = inputs[index];
  if (channel) return { kind: "trim", id: channel.id };
  return KNOB_FALLBACK[index] ?? { kind: "phones" };
}

export function faderChoices(channels: NamedChannel[]) {
  return [
    { value: "", label: "None" },
    ...channels.map((channel) => ({ value: volumeRef(channel), label: channel.name })),
    { value: "play", label: "Play" },
    { value: "cue", label: "Cue" },
    { value: "mix", label: "Mix" },
    { value: "phones", label: "Phones" },
  ];
}

export function knobChoices(channels: NamedChannel[]) {
  return [
    ...channels.flatMap((channel) => [
      { value: volumeRef(channel), label: `${channel.name} level` },
      { value: trimRef(channel), label: `${channel.name} trim` },
    ]),
    { value: "play", label: "Play" },
    { value: "cue", label: "Cue" },
    { value: "mix", label: "Mix" },
    { value: "phones", label: "Phones" },
    ...EQ_BANDS.map((band) => ({ value: `eq:${band.id}`, label: band.label })),
  ];
}

export function controlLabel(control: MpdControl, channels: NamedChannel[]) {
  if (control.kind === "none") return "None";
  if (control.kind === "cue") return "Cue";
  if (control.kind === "play") return "Play";
  if (control.kind === "mix") return "Mix";
  if (control.kind === "phones") return "Phones";
  if (control.kind === "eq") return EQ_BANDS.find((band) => band.id === control.bandId)?.label ?? "EQ";
  const channel = channels.find((item) => item.id === control.id);
  const name = channel?.name ?? "Missing strip";
  return control.kind === "trim" ? `${name} trim` : name;
}

export function faderSelectValue(index: number, assign: MpdAssign, channels: NamedChannel[]) {
  const raw = assign.faders[index] ?? "";
  if (!raw) return "";
  if (raw === "cue" || raw === "play" || raw === "mix" || raw === "phones") return raw;
  if (raw.startsWith("volref:") || raw.startsWith("vol:")) {
    const channel = resolveNamedChannel(raw, channels);
    return channel ? volumeRef(channel) : "";
  }
  return raw;
}

/** Map a note to pad slots 0–15 for known MPD226 factory layouts. */
export function mapNoteToPad(note: number) {
  if (note >= 36 && note <= 51) return note - 36;
  const live = LIVELITE_NOTES.indexOf(note);
  if (live >= 0) return live;
  const drum = DRUM_NOTES.indexOf(note);
  if (drum >= 0) return drum;
  const studio = STUDIO_NOTES.indexOf(note);
  if (studio >= 0) return studio;
  if (note >= 52 && note <= 99) return (note - 36) % 16;
  return null;
}

type MpdHandlers = {
  preferred: string;
  onStatus: (status: MpdStatus) => void;
  onNote: (note: number) => void;
  onFader: (index: number, value: number) => void;
  onKnob: (index: number, value: number) => void;
  onSwitch: (index: number) => void;
};

function isMpdName(name: string | null | undefined) {
  return /mpd\s*-?\s*226/i.test(name ?? "");
}

function shortName(name: string) {
  return name.length > 22 ? `${name.slice(0, 20)}…` : name;
}

export function startMpd226(handlers: MpdHandlers & { initialFaderCount?: number }) {
  let stopped = false;
  let preferred = handlers.preferred || MIDI_AUTO;
  let access: MIDIAccess | null = null;
  let shareSocket: WebSocket | null = null;
  let shareLive = false;
  let shareSeen = false;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let controls: Controls = "livelite";
  let liveliteFaders = false;
  let genericFaders = false;
  let maxFaderSeen = Math.max(
    MIN_MIDI_FADERS - 1,
    clampFaderCount(handlers.initialFaderCount) - 1,
  );
  const switchHigh = Array.from({ length: MAX_MIDI_FADERS }, () => false);
  const bound = new Set<MIDIInput>();

  function deviceList(): MidiDeviceOption[] {
    if (!access) return [];
    return [...access.inputs.values()]
      .filter((input) => input.state !== "disconnected")
      .map((input) => ({ id: input.id, name: input.name || input.id }));
  }

  function pickHardware(): MIDIInput | null {
    if (!access) return null;
    const inputs = [...access.inputs.values()].filter((input) => input.state !== "disconnected");
    if (!inputs.length) return null;
    if (preferred !== MIDI_AUTO && preferred !== MIDI_SHARE) {
      return inputs.find((input) => input.id === preferred) ?? null;
    }
    return inputs.find((input) => isMpdName(input.name)) ?? inputs[0] ?? null;
  }

  function usingShare() {
    if (preferred === MIDI_SHARE) return shareLive;
    if (preferred === MIDI_AUTO) return shareLive;
    return false;
  }

  function publish() {
    const devices = deviceList();
    const hardware = pickHardware();
    const share = usingShare();
    const connected = share || (!!hardware && preferred !== MIDI_SHARE);
    let name: string | null = null;
    if (share) name = "BPH Share";
    else if (hardware && preferred !== MIDI_SHARE) name = hardware.name || hardware.id;
    handlers.onStatus({
      connected,
      name,
      preferred,
      devices,
      shareAvailable: shareSeen || shareLive,
      faderCount: Math.min(MAX_MIDI_FADERS, Math.max(MIN_MIDI_FADERS, maxFaderSeen + 1)),
    });
  }

  function emitFader(index: number, value: number) {
    if (index < 0 || index >= MAX_MIDI_FADERS) return;
    if (index > maxFaderSeen) {
      maxFaderSeen = index;
      publish();
    }
    handlers.onFader(index, value);
  }

  function feedShare(text: string) {
    let packet: { type?: string; bytes?: number[] };
    try {
      packet = JSON.parse(text) as { type?: string; bytes?: number[] };
    } catch {
      return;
    }
    if (packet.type === "hello") {
      shareLive = true;
      shareSeen = true;
      publish();
      return;
    }
    if (packet.type !== "midi" || !Array.isArray(packet.bytes) || packet.bytes.length < 2) return;
    shareLive = true;
    shareSeen = true;
    if (preferred === MIDI_SHARE || preferred === MIDI_AUTO) {
      onMessage(Uint8Array.from(packet.bytes));
    }
    publish();
  }

  function onCc(cc: number, channel: number, raw: number) {
    if (cc === 12 || cc === 13) liveliteFaders = true;
    if (
      cc === 20 || cc === 21 || cc === 61 || cc === 62 || cc === 63 ||
      cc === 70 || cc === 92 || cc === 93 || cc === 94 || cc === 95
    ) {
      genericFaders = true;
    }

    if (genericFaders && !liveliteFaders) controls = "generic";
    else if (liveliteFaders && !genericFaders) controls = "livelite";
    else if (!genericFaders && !liveliteFaders) {
      if (cc === 9 || cc === 83 || (cc === 3 && controls !== "reason")) controls = "generic";
      if ((cc === 24 || cc === 25) && controls !== "generic") controls = "livelite";
      if (cc === 2 || cc === 4 || cc === 5) controls = "reason";
      if (cc === 40 || cc === 41 || cc === 50 || cc === 51) controls = "bitwig";
      if (cc === 33 || cc === 34 || cc === 17 || cc === 18) controls = "protools";
      if ((cc === 7 || cc === 10) && channel >= 1 && channel <= 8 && controls !== "generic") {
        controls = "cubase";
      }
    }

    const value = raw / 127;
    const sw = GENERIC_SWITCHES.indexOf(cc);
    if (sw >= 0) {
      const high = raw >= 64;
      if (high && !switchHigh[sw]) handlers.onSwitch(sw);
      switchHigh[sw] = high;
      return;
    }
    if (controls === "cubase") {
      if (cc === 7 && channel >= 1 && channel <= 8) emitFader(channel - 1, value);
      if (cc === 10 && channel >= 1 && channel <= 8) handlers.onKnob(channel - 1, value);
      return;
    }
    if (controls === "livelite") {
      const fader = [12, 13, 14, 15, 16, 17, 18, 19].indexOf(cc);
      if (fader >= 0) emitFader(fader, value);
      const knob = [22, 23, 24, 25].indexOf(cc);
      if (knob >= 0) handlers.onKnob(knob, value);
      return;
    }
    if (controls === "reason") {
      const fader = [12, 13, 14, 15, 16, 17, 18, 19].indexOf(cc);
      if (fader >= 0) emitFader(fader, value);
      const knob = [2, 3, 4, 5].indexOf(cc);
      if (knob >= 0) handlers.onKnob(knob, value);
      return;
    }
    if (controls === "bitwig") {
      const fader = [40, 41, 42, 43, 44, 45, 46, 47].indexOf(cc);
      if (fader >= 0) emitFader(fader, value);
      const knob = [50, 51, 52, 53].indexOf(cc);
      if (knob >= 0) handlers.onKnob(knob, value);
      return;
    }
    if (controls === "protools") {
      const fader = [33, 34, 35, 36, 37, 38, 39, 40].indexOf(cc);
      if (fader >= 0) emitFader(fader, value);
      const knob = [17, 18, 19, 20].indexOf(cc);
      if (knob >= 0) handlers.onKnob(knob, value);
      return;
    }

    for (const row of GENERIC_FADERS) {
      const index = row.indexOf(cc);
      if (index >= 0) emitFader(index, value);
    }
    for (const row of GENERIC_KNOBS) {
      const index = row.indexOf(cc);
      if (index >= 0) handlers.onKnob(index, value);
    }
  }

  function onMessage(data: Uint8Array | null) {
    if (!data || data.length < 2) return;
    const status = data[0] ?? 0;
    const kind = status & 0xf0;
    const channel = (status & 0x0f) + 1;
    if (kind === 0x90) {
      const velocity = data[2] ?? 0;
      if (velocity === 0) return;
      handlers.onNote(data[1] ?? 0);
      return;
    }
    if (kind === 0xb0) onCc(data[1] ?? 0, channel, data[2] ?? 0);
  }

  function clearHardware() {
    for (const input of bound) input.onmidimessage = null;
    bound.clear();
  }

  function bind() {
    if (!access) return;
    clearHardware();
    if (preferred === MIDI_SHARE) {
      publish();
      return;
    }
    if (preferred === MIDI_AUTO && shareLive) {
      publish();
      return;
    }
    const hardware = pickHardware();
    if (hardware) {
      bound.add(hardware);
      hardware.onmidimessage = (event) => {
        if (preferred === MIDI_AUTO && shareLive) return;
        onMessage(event.data ?? null);
      };
    }
    publish();
  }

  const nav = navigator as Navigator & {
    requestMIDIAccess?: (options?: { sysex?: boolean }) => Promise<MIDIAccess>;
  };

  function openHardwareAccess() {
    if (stopped || access || !nav.requestMIDIAccess) {
      if (!nav.requestMIDIAccess) publish();
      return;
    }
    void nav.requestMIDIAccess({ sysex: false }).then(
      (midi) => {
        if (stopped) return;
        access = midi;
        midi.onstatechange = () => bind();
        bind();
      },
      () => {
        if (!stopped) publish();
      },
    );
  }

  function scheduleShareRetry() {
    if (stopped || retryTimer !== null) return;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      connectShare();
    }, 1000);
  }

  function connectShare() {
    if (stopped) return;
    let ws: WebSocket;
    try {
      ws = new WebSocket(SHARE_URL);
    } catch {
      openHardwareAccess();
      scheduleShareRetry();
      return;
    }
    shareSocket = ws;
    ws.onopen = () => {
      shareLive = true;
      shareSeen = true;
      bind();
      openHardwareAccess();
    };
    ws.onmessage = (event) => {
      if (typeof event.data === "string") feedShare(event.data);
      else if (event.data instanceof Blob) void event.data.text().then(feedShare);
    };
    ws.onerror = () => {
      try {
        ws.close();
      } catch {
        /* close handler retries */
      }
    };
    ws.onclose = () => {
      if (shareSocket === ws) shareSocket = null;
      shareLive = false;
      bind();
      openHardwareAccess();
      scheduleShareRetry();
    };
  }

  connectShare();
  // List devices even when Share is preferred.
  openHardwareAccess();
  publish();

  return {
    stop() {
      stopped = true;
      if (retryTimer !== null) clearTimeout(retryTimer);
      if (shareSocket) {
        shareSocket.onclose = null;
        shareSocket.close();
        shareSocket = null;
      }
      if (access) access.onstatechange = null;
      clearHardware();
    },
    setPreferred(id: string) {
      preferred = id || MIDI_AUTO;
      saveMidiDevice(preferred);
      bind();
      publish();
    },
    refresh() {
      bind();
      publish();
    },
    chipLabel() {
      if (usingShare()) return "BPH Share";
      const hardware = pickHardware();
      if (hardware && preferred !== MIDI_SHARE) return shortName(hardware.name || "MIDI");
      return "MIDI off";
    },
  };
}

export type MidiControllerSession = ReturnType<typeof startMpd226>;
