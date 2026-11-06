

import { cn } from "cn";

type LevelMeterProps = {
  rms: number;
  peak: number;
  className?: string;
};

/** Map linear amplitude to 0–1 meter fill with gentle perceptual curve. */
function meterAmount(v: number) {
  if (v <= 0) return 0;
  const db = 20 * Math.log10(v);
  const clamped = Math.min(0, Math.max(-60, db));
  return (clamped + 60) / 60;
}

export function LevelMeter({ rms, peak, className }: LevelMeterProps) {
  const fill = meterAmount(rms);
  const peakPos = meterAmount(peak);
  const hot = fill > 0.85;
  const warm = fill > 0.62;

  return (
    <div
      className={cn(
        "relative h-full w-3 overflow-hidden rounded-sm border border-[color:var(--console-edge)] bg-[color:var(--meter-well)]",
        className,
      )}
      aria-hidden
    >
      <div
        className="absolute inset-x-0 bottom-0 transition-[height] duration-75 ease-out"
        style={{
          height: `${fill * 100}%`,
          background: hot
            ? "linear-gradient(to top, var(--meter-green), var(--meter-amber) 55%, var(--meter-red))"
            : warm
              ? "linear-gradient(to top, var(--meter-green), var(--meter-amber))"
              : "var(--meter-green)",
        }}
      />
      <div
        className="absolute inset-x-0 h-0.5 bg-[color:var(--meter-peak)]"
        style={{ bottom: `calc(${peakPos * 100}% - 1px)` }}
      />
      <div className="pointer-events-none absolute inset-0 opacity-30 [background-image:repeating-linear-gradient(to_top,transparent_0_5px,rgba(0,0,0,0.35)_5px_6px)]" />
    </div>
  );
}
