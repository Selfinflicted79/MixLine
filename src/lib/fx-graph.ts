export type ChannelFx = {
  /** 0..1 wet reverb */
  reverb: number;
  /** 0..1 chorus mix */
  chorus: number;
  /** Semitones, -12..12. 0 is the unchanged voice. */
  pitch: number;
  /** 0..1 ring-mod robot */
  robot: number;
  /** 0..1 hard auto-tune. High values snap to the nearest note. */
  autotune: number;
};

export function defaultFx(): ChannelFx {
  return { reverb: 0, chorus: 0, pitch: 0, robot: 0, autotune: 0 };
}

export function clampFx(fx: Partial<ChannelFx> | undefined): ChannelFx {
  const base = defaultFx();
  if (!fx) return base;
  return {
    reverb: clamp01(fx.reverb ?? base.reverb),
    chorus: clamp01(fx.chorus ?? base.chorus),
    pitch: Math.min(12, Math.max(-12, fx.pitch ?? base.pitch)),
    robot: clamp01(fx.robot ?? base.robot),
    autotune: clamp01(fx.autotune ?? base.autotune),
  };
}

function clamp01(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

const PITCH_SIZE = 8192;
const PITCH_MIN = 480;
const PITCH_MAX = 2400;

const DETECT_LEN = 768;

type PitchState = {
  semitones: number;
  manual: number;
  autotune: number;
  correction: number;
  bufL: Float32Array;
  bufR: Float32Array;
  write: number;
  delayA: number;
  delayB: number;
  detect: Float32Array;
  detectWrite: number;
  filled: number;
};

function createPitchState(): PitchState {
  return {
    semitones: 0,
    manual: 0,
    autotune: 0,
    correction: 0,
    bufL: new Float32Array(PITCH_SIZE),
    bufR: new Float32Array(PITCH_SIZE),
    write: 0,
    delayA: 900,
    delayB: 1800,
    detect: new Float32Array(DETECT_LEN),
    detectWrite: 0,
    filled: 0,
  };
}

function detectNote(state: PitchState, input: Float32Array, sampleRate: number) {
  const decimate = 6;
  const rate = sampleRate / decimate;
  for (let i = 0; i < input.length; i += decimate) {
    state.detect[state.detectWrite] = input[i] ?? 0;
    state.detectWrite++;
    if (state.detectWrite >= DETECT_LEN) state.detectWrite = 0;
    if (state.filled < DETECT_LEN) state.filled++;
  }
  if (state.autotune < 0.02) {
    state.correction = 0;
    state.semitones = state.manual;
    return;
  }
  if (state.filled < DETECT_LEN) {
    state.semitones = state.manual;
    return;
  }

  const at = (index: number) => state.detect[(state.detectWrite + index) % DETECT_LEN];
  let energy = 0;
  for (let i = 0; i < DETECT_LEN; i += 4) energy += at(i) * at(i);
  if (energy / (DETECT_LEN / 4) < 0.0006) {
    state.correction *= 0.8;
    state.semitones = state.manual + state.correction * state.autotune;
    return;
  }

  const minLag = Math.max(8, Math.floor(rate / 520));
  const maxLag = Math.min(DETECT_LEN - 8, Math.floor(rate / 75));
  let bestLag = -1;
  let best = 0;
  const score = (lag: number) => {
    let corr = 0;
    let e1 = 0;
    let e2 = 0;
    for (let i = 0; i < DETECT_LEN - lag; i += 2) {
      const a = at(i);
      const b = at(i + lag);
      corr += a * b;
      e1 += a * a;
      e2 += b * b;
    }
    return corr / Math.sqrt(e1 * e2 + 1e-12);
  };
  for (let lag = minLag; lag <= maxLag; lag++) {
    const norm = score(lag);
    if (norm > best) {
      best = norm;
      bestLag = lag;
    }
  }
  if (bestLag < 0 || best < 0.58) {
    state.correction *= 0.85;
    state.semitones = state.manual + state.correction * state.autotune;
    return;
  }
  const lower = bestLag * 2;
  if (lower <= maxLag && score(lower) > best * 0.82) bestLag = lower;

  const hz = rate / bestLag;
  const midi = 69 + 12 * Math.log2(hz / 440);
  const delta = Math.max(-2, Math.min(2, Math.round(midi) - midi));
  if (state.autotune > 0.82) state.correction = delta;
  else state.correction += (delta - state.correction) * (0.3 + state.autotune * 0.6);
  state.semitones = state.manual + state.correction * state.autotune;
}

function readFrac(buf: Float32Array, write: number, delay: number) {
  let pos = write - delay;
  pos %= PITCH_SIZE;
  if (pos < 0) pos += PITCH_SIZE;
  const i = Math.floor(pos);
  const frac = pos - i;
  const j = (i + 1) % PITCH_SIZE;
  return buf[i] * (1 - frac) + buf[j] * frac;
}

function wrapDelay(delay: number) {
  if (delay < PITCH_MIN) return PITCH_MAX;
  if (delay > PITCH_MAX) return PITCH_MIN;
  return delay;
}

function delayWindow(delay: number) {
  const mid = (PITCH_MIN + PITCH_MAX) / 2;
  const half = (PITCH_MAX - PITCH_MIN) / 2;
  const x = 1 - Math.abs(delay - mid) / half;
  return x < 0 ? 0 : x;
}

export function makeImpulse(ctx: AudioContext) {
  const duration = 1.7;
  const length = Math.floor(ctx.sampleRate * duration);
  const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < length; i++) {
      const t = i / length;
      const env = Math.pow(1 - t, 3);
      const tap = i % Math.floor(ctx.sampleRate * (0.029 + channel * 0.007)) < 3 ? 0.35 : 0;
      data[i] = ((Math.random() * 2 - 1) * 0.55 + tap) * env;
    }
  }
  return buffer;
}

export type FxGraph = {
  input: GainNode;
  output: GainNode;
  apply: (fx: ChannelFx) => void;
  dispose: () => void;
};

export function createFxGraph(ctx: AudioContext, impulse: AudioBuffer): FxGraph {
  const input = ctx.createGain();
  const output = ctx.createGain();
  const pitchBypass = ctx.createGain();
  const pitchWet = ctx.createGain();
  const voice = ctx.createGain();
  const robotBypass = ctx.createGain();
  const robotWet = ctx.createGain();
  const robotGain = ctx.createGain();
  const voiced = ctx.createGain();
  const reverbGain = ctx.createGain();
  const chorusGain = ctx.createGain();

  pitchBypass.gain.value = 1;
  pitchWet.gain.value = 0;
  robotBypass.gain.value = 1;
  robotWet.gain.value = 0;
  robotGain.gain.value = 0;
  reverbGain.gain.value = 0;
  chorusGain.gain.value = 0;

  const pitch = ctx.createScriptProcessor(1024, 2, 2);
  const pitchState = createPitchState();
  pitch.onaudioprocess = (event) => {
    const inL = event.inputBuffer.getChannelData(0);
    const inR = event.inputBuffer.getChannelData(1);
    const outL = event.outputBuffer.getChannelData(0);
    const outR = event.outputBuffer.getChannelData(1);
    detectNote(pitchState, inL, ctx.sampleRate);
    const ratio = Math.pow(2, pitchState.semitones / 12);
    const step = 1 - ratio;
    for (let i = 0; i < inL.length; i++) {
      pitchState.bufL[pitchState.write] = inL[i];
      pitchState.bufR[pitchState.write] = inR[i] || inL[i];
      pitchState.delayA = wrapDelay(pitchState.delayA + step);
      pitchState.delayB = wrapDelay(pitchState.delayB + step);
      const winA = delayWindow(pitchState.delayA);
      const winB = delayWindow(pitchState.delayB);
      const mix = winA + winB || 1;
      outL[i] =
        (readFrac(pitchState.bufL, pitchState.write, pitchState.delayA) * winA +
          readFrac(pitchState.bufL, pitchState.write, pitchState.delayB) * winB) /
        mix;
      outR[i] =
        (readFrac(pitchState.bufR, pitchState.write, pitchState.delayA) * winA +
          readFrac(pitchState.bufR, pitchState.write, pitchState.delayB) * winB) /
        mix;
      pitchState.write++;
      if (pitchState.write >= PITCH_SIZE) pitchState.write = 0;
    }
  };

  const robotOsc = ctx.createOscillator();
  robotOsc.type = "sine";
  robotOsc.frequency.value = 48;
  robotOsc.connect(robotGain.gain);
  robotOsc.start();

  const tone = ctx.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.value = 6500;
  const reverb = ctx.createConvolver();
  reverb.buffer = impulse;

  const chorusDelay = ctx.createDelay(0.08);
  chorusDelay.delayTime.value = 0.014;
  const chorusLfo = ctx.createOscillator();
  chorusLfo.type = "sine";
  chorusLfo.frequency.value = 0.85;
  const chorusDepth = ctx.createGain();
  chorusDepth.gain.value = 0.004;
  chorusLfo.connect(chorusDepth);
  chorusDepth.connect(chorusDelay.delayTime);
  chorusLfo.start();

  input.connect(pitchBypass);
  input.connect(pitch);
  pitch.connect(pitchWet);
  pitchBypass.connect(voice);
  pitchWet.connect(voice);

  voice.connect(robotBypass);
  voice.connect(robotGain);
  robotBypass.connect(voiced);
  robotGain.connect(robotWet);
  robotWet.connect(voiced);
  voiced.connect(output);

  voiced.connect(tone);
  tone.connect(reverb);
  reverb.connect(reverbGain);
  reverbGain.connect(output);

  voiced.connect(chorusDelay);
  chorusDelay.connect(chorusGain);
  chorusGain.connect(output);

  return {
    input,
    output,
    apply(fx) {
      const next = clampFx(fx);
      const t = ctx.currentTime;
      pitchState.manual = next.pitch;
      pitchState.autotune = next.autotune;
      if (next.autotune < 0.02) {
        pitchState.correction = 0;
        pitchState.semitones = next.pitch;
      }
      const pitched = next.autotune >= 0.04 || Math.abs(next.pitch) >= 0.2;
      pitchBypass.gain.setTargetAtTime(pitched ? 0 : 1, t, 0.015);
      pitchWet.gain.setTargetAtTime(pitched ? 1 : 0, t, 0.015);
      const robot = next.robot;
      robotBypass.gain.setTargetAtTime(1 - robot * 0.92, t, 0.02);
      robotWet.gain.setTargetAtTime(robot, t, 0.02);
      robotOsc.frequency.setTargetAtTime(36 + robot * 28, t, 0.03);
      reverbGain.gain.setTargetAtTime(next.reverb * 0.8, t, 0.03);
      chorusGain.gain.setTargetAtTime(next.chorus * 0.65, t, 0.03);
    },
    dispose() {
      pitch.onaudioprocess = null;
      try {
        robotOsc.stop();
        chorusLfo.stop();
      } catch {
        /* already stopped */
      }
      input.disconnect();
      output.disconnect();
      pitch.disconnect();
      pitchBypass.disconnect();
      pitchWet.disconnect();
      voice.disconnect();
      voiced.disconnect();
      robotBypass.disconnect();
      robotGain.disconnect();
      robotWet.disconnect();
      robotOsc.disconnect();
      tone.disconnect();
      reverb.disconnect();
      reverbGain.disconnect();
      chorusDelay.disconnect();
      chorusGain.disconnect();
      chorusLfo.disconnect();
      chorusDepth.disconnect();
    },
  };
}
