export type EqBandKind = "lowshelf" | "peaking" | "highshelf";

export type EqBand = {
  id: string;
  label: string;
  kind: EqBandKind;
  frequency: number;
  Q: number;
  /** Gain in dB, typically -12..+12 */
  gainDb: number;
};

export const DEFAULT_EQ_BANDS: EqBand[] = [
  { id: "low", label: "LOW", kind: "lowshelf", frequency: 80, Q: 0.7, gainDb: 0 },
  { id: "lm", label: "L-MID", kind: "peaking", frequency: 250, Q: 1, gainDb: 0 },
  { id: "mid", label: "MID", kind: "peaking", frequency: 1000, Q: 1, gainDb: 0 },
  { id: "hm", label: "H-MID", kind: "peaking", frequency: 4000, Q: 1, gainDb: 0 },
  { id: "high", label: "HIGH", kind: "highshelf", frequency: 10000, Q: 0.7, gainDb: 0 },
];

export function cloneDefaultEq(): EqBand[] {
  return DEFAULT_EQ_BANDS.map((b) => ({ ...b }));
}

export function dbToLinear(db: number) {
  return Math.pow(10, db / 20);
}

/** Build a smooth SVG path for the combined EQ magnitude response. */
export function eqResponsePath(
  bands: EqBand[],
  width: number,
  height: number,
  minDb = -12,
  maxDb = 12,
): string {
  const points: string[] = [];
  const samples = 64;
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    // log frequency 20Hz..20kHz
    const freq = 20 * Math.pow(1000, t);
    const magDb = eqDbAt(bands, freq);
    const x = t * width;
    const norm = (magDb - minDb) / (maxDb - minDb);
    const y = height - Math.min(1, Math.max(0, norm)) * height;
    points.push(`${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return points.join(" ");
}

export function eqDbAt(bands: EqBand[], freq: number) {
  let magDb = 0;
  for (const band of bands) magDb += approxBandDb(band, freq);
  return magDb;
}

function approxBandDb(band: EqBand, freq: number): number {
  const f0 = band.frequency;
  const g = band.gainDb;
  if (band.kind === "lowshelf") {
    const x = freq / f0;
    const w = 1 / (1 + Math.pow(x, 2));
    return g * w;
  }
  if (band.kind === "highshelf") {
    const x = f0 / Math.max(freq, 1);
    const w = 1 / (1 + Math.pow(x, 2));
    return g * w;
  }
  // peaking — bell around f0
  const oct = Math.log2(Math.max(freq, 1) / f0);
  const w = Math.exp(-0.5 * Math.pow(oct * band.Q * 2.2, 2));
  return g * w;
}
