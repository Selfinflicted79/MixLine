import { Button } from "@/components/ui/button";
import { EqGraph } from "@/components/mixer/eq-graph";
import { LevelMeter } from "@/components/mixer/level-meter";
import { VerticalFader } from "@/components/mixer/vertical-fader";
import { formatDb } from "@/lib/audio-engine";
import type { EqBand } from "@/lib/eq-bands";
import { cn } from "cn";

type BusStripProps = {
  title: string;
  subtitle: string;
  accent: "cyan" | "orange" | "green";
  volume: number;
  muted: boolean;
  peak: number;
  rms: number;
  eq: EqBand[];
  eqMode: boolean;
  /** Main Mix uses the Live EQ panel instead of this button. */
  showEq?: boolean;
  onVolume: (v: number) => void;
  onMute: () => void;
  onEnterEq: () => void;
  onExitEq: () => void;
  onEqGain: (bandId: string, gainDb: number) => void;
  onResetEq: () => void;
};

export function BusStrip({
  title,
  subtitle,
  accent,
  volume,
  muted,
  peak,
  rms,
  eq,
  eqMode,
  showEq = true,
  onVolume,
  onMute,
  onEnterEq,
  onExitEq,
  onEqGain,
  onResetEq,
}: BusStripProps) {
  const edge =
    accent === "orange" ? "#e8a23a" : accent === "green" ? "#5fd36a" : "#3d9bcc";

  return (
    <section
      className={cn(
        "strip-face flex h-full shrink-0 flex-col gap-2 rounded-sm px-2.5 py-3",
        showEq && eqMode ? "w-[22rem]" : "w-[9rem]",
      )}
      style={{ boxShadow: `inset 3px 0 0 ${edge}` }}
    >
      <button
        type="button"
        className="text-left"
        onClick={() => {
          if (eqMode) onExitEq();
        }}
        title={eqMode ? "Click to leave EQ" : undefined}
      >
        <p className="font-[family-name:var(--font-display)] text-lg leading-none tracking-[0.1em] text-[color:var(--console-ink)] uppercase">
          {eqMode ? `${title} · back` : title}
        </p>
        <p className="mt-1 text-[10px] font-bold tracking-[0.16em] text-[color:var(--console-muted)] uppercase">
          {subtitle}
        </p>
      </button>

      {showEq && eqMode ? (
        <>
          <div className="flex justify-center gap-2 overflow-x-auto pb-1">
            {eq.map((band) => (
              <div key={band.id} className="flex w-12 flex-col items-center gap-1">
                <span className="text-[9px] font-bold tracking-wide text-[color:var(--console-muted)]">
                  {band.label}
                </span>
                <VerticalFader
                  value={(band.gainDb + 12) / 24}
                  onChange={(v) => onEqGain(band.id, v * 24 - 12)}
                  label={`${band.label} gain`}
                  className="h-44 w-8"
                  accent={accent}
                />
                <span className="font-mono text-[9px] tabular-nums text-[color:var(--console-muted)]">
                  {band.gainDb > 0 ? "+" : ""}
                  {band.gainDb.toFixed(0)}
                </span>
              </div>
            ))}
          </div>
          <EqGraph bands={eq} className="h-20 w-full" />
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="btn-lit h-8 bg-[color:var(--chip)] text-[10px] text-[color:var(--console-ink)]"
            onClick={onResetEq}
          >
            Flat EQ
          </Button>
        </>
      ) : (
        <>
          <div className="flex min-h-0 flex-1 justify-center gap-3">
            <LevelMeter rms={rms} peak={peak} className="h-full min-h-0 w-3.5" />
            <VerticalFader
              value={volume}
              onChange={onVolume}
              label={`${title} volume`}
              className="h-full min-h-0"
              accent={accent}
            />
          </div>

          <div className="text-center font-mono text-[10px] tabular-nums text-[color:var(--console-muted)]">
            {formatDb(rms)} dB
          </div>

          <div className={cn("grid gap-1", showEq ? "grid-cols-2" : "grid-cols-1")}>
            <button
              type="button"
              className={cn(
                "btn-lit h-8 text-[10px]",
                muted
                  ? "bg-[color:var(--meter-red)] text-white"
                  : "bg-[color:var(--chip)] text-[color:var(--console-ink)] hover:bg-[color:var(--chip-hover)]",
              )}
              onClick={onMute}
            >
              Mute
            </button>
            {showEq ? (
              <button
                type="button"
                className="btn-lit h-8 bg-[color:var(--chip)] text-[10px] text-[color:var(--console-ink)] hover:bg-[color:var(--chip-hover)]"
                onClick={onEnterEq}
              >
                EQ
              </button>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}
