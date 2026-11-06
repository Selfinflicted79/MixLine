import { Button } from "@/components/ui/button";
import type { MixerSnapshot } from "@/lib/audio-engine";
import { cn } from "cn";

type DiscordRouteProps = {
  snap: MixerSnapshot;
  onRefresh: () => void;
  onSelectDevice: (deviceId: string) => void;
  onToggleMonitorMix: () => void;
  onMonitorVolume: (v: number) => void;
};

export function DiscordRoute({
  snap,
  onRefresh,
  onSelectDevice,
  onToggleMonitorMix,
  onMonitorVolume,
}: DiscordRouteProps) {
  const cableLike = snap.outputDevices.filter((d) =>
    /cable|voicemeeter|vb-audio|virtual/i.test(d.label),
  );

  return (
    <section className="rack-panel relative rounded-sm p-4 sm:p-5">
      <div className="pointer-events-none absolute top-3 left-5 flex gap-2">
        <span className="rack-screw" />
        <span className="rack-screw" />
      </div>
      <div className="pointer-events-none absolute top-3 right-5 flex gap-2">
        <span className="rack-screw" />
        <span className="rack-screw" />
      </div>

      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-2xl tracking-[0.06em] text-[color:var(--console-ink)] uppercase">
            Discord send
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-[color:var(--console-muted)]">
            Mix output → <span className="font-semibold text-[color:var(--console-ink)]">CABLE Input</span>.
            Discord mic → <span className="font-semibold text-[color:var(--console-ink)]">CABLE Output</span>.
            Use each strip’s <span className="font-semibold text-[color:var(--console-ink)]">MON</span> to hear that input in your headphones without sending it to Discord.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="btn-lit mt-2 h-9 bg-[color:var(--chip)] text-[color:var(--console-ink)] sm:mt-0"
          onClick={onRefresh}
        >
          Refresh devices
        </Button>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_auto]">
        <label className="block text-sm text-[color:var(--console-ink)]">
          <span className="mb-1.5 block text-[10px] font-bold tracking-[0.14em] text-[color:var(--console-muted)] uppercase">
            Mix → virtual cable
          </span>
          <select
            className="h-10 w-full rounded-sm border border-[color:var(--console-edge)] bg-[color:var(--chip)] px-3 text-sm outline-none focus:ring-2 focus:ring-[color:var(--accent-blue)]"
            value={snap.discordDeviceId}
            onChange={(e) => onSelectDevice(e.target.value)}
          >
            <option value="">Default system output (not for Discord mic)</option>
            {snap.outputDevices.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label}
                {cableLike.some((c) => c.deviceId === d.deviceId) ? " ★" : ""}
              </option>
            ))}
          </select>
        </label>

        <div className="flex flex-col justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            className={cn(
              "btn-lit h-10 text-sm",
              snap.monitorMix
                ? "bg-[color:var(--accent-amber)] text-[#1a1a1a]"
                : "bg-[color:var(--chip)] text-[color:var(--console-ink)]",
            )}
            onClick={onToggleMonitorMix}
          >
            {snap.monitorMix ? "Phones: full mix ON" : "Phones: full mix OFF"}
          </Button>
          <label className="flex items-center gap-2 text-xs text-[color:var(--console-muted)]">
            Phones level
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={snap.monitorVolume}
              onChange={(e) => onMonitorVolume(Number(e.target.value))}
              className="w-28 accent-[color:var(--fader-fill)]"
            />
          </label>
        </div>
      </div>
    </section>
  );
}
