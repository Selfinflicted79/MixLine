import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { RotaryKnob } from "@/components/mixer/rotary-knob";
import { audioEngine } from "@/lib/audio-engine";
import { eqDbAt, type EqBand } from "@/lib/eq-bands";

const RANGES: Record<string, [number, number]> = {
  low: [40, 280],
  lm: [140, 1200],
  mid: [400, 4000],
  hm: [1200, 10000],
  high: [3500, 16000],
};

type LiveEqProps = {
  bands: EqBand[];
  onChange: (bandId: string, patch: { gainDb?: number; frequency?: number }) => void;
  onReset: () => void;
};

export function LiveEq({ bands, onChange, onReset }: LiveEqProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bandsRef = useRef(bands);
  const drag = useRef<string | null>(null);
  bandsRef.current = bands;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let frame = 0;
    const spectrum = new Float32Array(audioEngine.spectrumBinCount);

    const draw = () => {
      frame = requestAnimationFrame(draw);
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const w = Math.max(10, Math.floor(rect.width * dpr));
      const h = Math.max(10, Math.floor(rect.height * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      audioEngine.readMasterSpectrum(spectrum);
      paint(ctx, w, h, bandsRef.current, spectrum);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, []);

  function pointFor(event: ReactPointerEvent<HTMLCanvasElement>, band: EqBand) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    const [minF, maxF] = RANGES[band.id] ?? [40, 16000];
    const freq = 20 * Math.pow(1000, Math.min(1, Math.max(0, x)));
    const gain = 12 - Math.min(1, Math.max(0, y)) * 24;
    onChange(band.id, {
      frequency: Math.min(maxF, Math.max(minF, freq)),
      gainDb: Math.min(12, Math.max(-12, gain)),
    });
  }

  function hitBand(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    let found: EqBand | null = null;
    let best = 18;
    for (const band of bandsRef.current) {
      const px = freqToX(band.frequency, rect.width);
      const py = dbToY(band.gainDb, rect.height);
      const dist = Math.hypot(px - x, py - y);
      if (dist < best) {
        best = dist;
        found = band;
      }
    }
    return found;
  }

  return (
    <section className="flex h-full w-[24rem] shrink-0 flex-col gap-2 rounded-sm border border-black/50 bg-[linear-gradient(180deg,#1c2133,#12141e)] px-2 py-2">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-[family-name:var(--font-rack)] text-sm tracking-[0.16em] text-[color:var(--console-ink)] uppercase">
            Live EQ
          </p>
          <p className="text-[10px] tracking-[0.12em] text-[color:var(--console-muted)] uppercase">
            Main mix
          </p>
        </div>
        <button
          type="button"
          className="rounded-sm bg-[color:var(--chip)] px-2 py-1 text-[10px] font-bold tracking-wide text-[color:var(--console-ink)] uppercase"
          onClick={onReset}
        >
          Flat
        </button>
      </div>
      <canvas
        ref={canvasRef}
        className="min-h-[6rem] w-full flex-1 cursor-pointer rounded-sm bg-[#07090f]"
        onPointerDown={(event) => {
          const band = hitBand(event);
          if (!band) return;
          drag.current = band.id;
          event.currentTarget.setPointerCapture(event.pointerId);
          pointFor(event, band);
        }}
        onPointerMove={(event) => {
          const id = drag.current;
          if (!id) return;
          const band = bandsRef.current.find((item) => item.id === id);
          if (band) pointFor(event, band);
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
      />
      <div className="flex justify-between gap-1 overflow-x-auto">
        {bands.map((band) => (
          <RotaryKnob
            key={band.id}
            compact
            label={band.label}
            display={`${band.gainDb > 0 ? "+" : ""}${band.gainDb.toFixed(0)}`}
            value={(band.gainDb + 12) / 24}
            accent="orange"
            onChange={(v) => onChange(band.id, { gainDb: v * 24 - 12 })}
          />
        ))}
      </div>
    </section>
  );
}

function freqToX(freq: number, width: number) {
  const t = Math.log(Math.max(20, freq) / 20) / Math.log(1000);
  return Math.min(width, Math.max(0, t * width));
}

function dbToY(db: number, height: number) {
  const t = (12 - db) / 24;
  return Math.min(height, Math.max(0, t * height));
}

function paint(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  bands: EqBand[],
  spectrum: Float32Array,
) {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#07090f";
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "rgba(255,255,255,0.06)";
  ctx.lineWidth = 1;
  for (let db = -12; db <= 12; db += 6) {
    const y = dbToY(db, height);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  if (spectrum.length > 8) {
    ctx.beginPath();
    ctx.moveTo(0, height);
    for (let i = 1; i < spectrum.length; i++) {
      const freq = (i / spectrum.length) * 24000;
      if (freq < 20) continue;
      const db = Math.min(0, Math.max(-78, spectrum[i] ?? -100));
      const x = freqToX(freq, width);
      const y = height - ((db + 78) / 78) * height * 0.92;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(width, height);
    ctx.closePath();
    const fill = ctx.createLinearGradient(0, 0, 0, height);
    fill.addColorStop(0, "rgba(77,232,255,0.28)");
    fill.addColorStop(1, "rgba(77,232,255,0.02)");
    ctx.fillStyle = fill;
    ctx.fill();
  }

  ctx.beginPath();
  const steps = 96;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const freq = 20 * Math.pow(1000, t);
    const x = t * width;
    const y = dbToY(eqDbAt(bands, freq), height);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = "#ffd15a";
  ctx.lineWidth = Math.max(2, width / 280);
  ctx.shadowColor = "rgba(255, 209, 90, 0.65)";
  ctx.shadowBlur = 8;
  ctx.stroke();
  ctx.shadowBlur = 0;

  bands.forEach((band, index) => {
    const x = freqToX(band.frequency, width);
    const y = dbToY(band.gainDb, height);
    ctx.beginPath();
    ctx.fillStyle = "#1a1408";
    ctx.strokeStyle = "#ffd15a";
    ctx.lineWidth = 2;
    ctx.arc(x, y, Math.max(7, width / 70), 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#ffd15a";
    ctx.font = `${Math.max(9, width / 55)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(index + 1), x, y);
  });
}
