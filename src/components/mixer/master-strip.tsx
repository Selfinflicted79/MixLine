import { LevelMeter } from "@/components/mixer/level-meter";
import { VerticalFader } from "@/components/mixer/vertical-fader";
import { formatDb } from "@/lib/audio-engine";
import { cn } from "cn";

type MasterStripProps = {
  volume: number;
  muted: boolean;
  peak: number;
  rms: number;
  onVolume: (v: number) => void;
  onMute: () => void;
};

export function MasterStrip({
  volume,
  muted,
  peak,
  rms,
  onVolume,
  onMute,
}: MasterStripProps) {
  return (
    <section
      className="strip-face flex w-[8.75rem] shrink-0 flex-col gap-3 rounded-sm px-3 py-3"
      style={{ boxShadow: "inset 3px 0 0 #5fd36a" }}
    >
      <div className="text-center">
        <p className="font-[family-name:var(--font-display)] text-lg leading-none tracking-[0.12em] text-[color:var(--console-ink)] uppercase">
          Mix
        </p>
        <p className="mt-1 text-[10px] font-bold tracking-[0.18em] text-[color:var(--console-muted)] uppercase">
          Master bus
        </p>
      </div>

      <div className="flex justify-center gap-3">
        <LevelMeter rms={rms} peak={peak} className="h-48 w-3.5" />
        <VerticalFader
          value={volume}
          onChange={onVolume}
          label="Master volume"
          className="h-48"
        />
      </div>

      <div className="text-center font-mono text-[10px] tabular-nums text-[color:var(--console-muted)]">
        {formatDb(rms)} dB
      </div>

      <button
        type="button"
        className={cn(
          "btn-lit h-9 text-[10px]",
          muted
            ? "bg-[color:var(--meter-red)] text-white"
            : "bg-[color:var(--chip)] text-[color:var(--console-ink)] hover:bg-[color:var(--chip-hover)]",
        )}
        onClick={onMute}
      >
        {muted ? "Unmute" : "Mute mix"}
      </button>
    </section>
  );
}
