/** Light UI rack sounds — synthesized, no asset files. */

let ctx: AudioContext | null = null;

function audio() {
  if (typeof window === "undefined") return null;
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function noiseBuffer(ac: AudioContext, seconds: number) {
  const length = Math.max(1, Math.floor(ac.sampleRate * seconds));
  const buffer = ac.createBuffer(1, length, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

/** Mechanical power-switch tick. */
export function playSwitchClick() {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime;
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer(ac, 0.045);
  const filter = ac.createBiquadFilter();
  filter.type = "bandpass";
  filter.frequency.value = 2200;
  filter.Q.value = 3.2;
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.28, t + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(ac.destination);
  src.start(t);
  src.stop(t + 0.06);
}

/** Short rising boot chirp after the switch. */
export function playPowerUp() {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime;
  const freqs = [180, 320, 540, 880];
  freqs.forEach((freq, index) => {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = index < 2 ? "triangle" : "sine";
    osc.frequency.setValueAtTime(freq, t);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.35, t + 0.22);
    const start = t + index * 0.035;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.09 - index * 0.012, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.28);
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.start(start);
    osc.stop(start + 0.3);
  });
}

function playSeat(opts: {
    startHz: number;
    endHz: number;
    lowpass: number;
    peak: number;
    decay: number;
    tickHz: number;
    tickPeak: number;
  },
) {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime;
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  const filter = ac.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = opts.lowpass;
  osc.type = "sine";
  osc.frequency.setValueAtTime(opts.startHz, t);
  osc.frequency.exponentialRampToValueAtTime(opts.endHz, t + opts.decay * 0.75);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(opts.peak, t + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + opts.decay);
  osc.connect(filter);
  filter.connect(gain);
  gain.connect(ac.destination);
  osc.start(t);
  osc.stop(t + opts.decay + 0.02);

  const tick = ac.createBufferSource();
  tick.buffer = noiseBuffer(ac, 0.03);
  const tickGain = ac.createGain();
  const tickFilter = ac.createBiquadFilter();
  tickFilter.type = "highpass";
  tickFilter.frequency.value = opts.tickHz;
  tickGain.gain.setValueAtTime(0.0001, t);
  tickGain.gain.exponentialRampToValueAtTime(opts.tickPeak, t + 0.003);
  tickGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.028);
  tick.connect(tickFilter);
  tickFilter.connect(tickGain);
  tickGain.connect(ac.destination);
  tick.start(t);
  tick.stop(t + 0.035);
}

/** Soft thud when a line strip seats into the rack. */
export function playChannelSeat(index = 0) {
  playSeat({
    startHz: 95 + (index % 4) * 6,
    endHz: 48,
    lowpass: 420 + (index % 5) * 28,
    peak: 0.14,
    decay: 0.12,
    tickHz: 1800,
    tickPeak: 0.05,
  });
}

/** Same drop, higher and shorter, for the smaller cue strips. */
export function playCueSeat(index = 0) {
  playSeat({
    startHz: 210 + (index % 4) * 14,
    endHz: 128,
    lowpass: 980 + (index % 5) * 40,
    peak: 0.09,
    decay: 0.07,
    tickHz: 2800,
    tickPeak: 0.035,
  });
}

export function playPowerSequence() {
  playSwitchClick();
  window.setTimeout(() => playPowerUp(), 85);
}

function playSeatWave(count: number, play: (index: number) => void) {
  const n = Math.min(12, Math.max(0, count));
  for (let i = 0; i < n; i++) {
    window.setTimeout(() => play(i), 120 + i * 55);
  }
}

export function playChannelSeatWave(count: number) {
  playSeatWave(count, playChannelSeat);
}

export function playCueSeatWave(count: number) {
  playSeatWave(count, playCueSeat);
}
