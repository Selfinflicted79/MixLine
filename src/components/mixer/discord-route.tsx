import { Button } from "@/components/ui/button";
import type { MixerSnapshot } from "@/lib/audio-engine";
import { cn } from "cn";

type DiscordRouteProps = {
  snap: MixerSnapshot;
  onRefresh: () => void;
  onSelectSend: (deviceId: string) => void;
  onSelectPhones: (deviceId: string) => void;
  onToggleMonitorMix: () => void;
  onMonitorVolume: (v: number) => void;
};

/** Compact top-of-rack I/O strip: Mix send, phones/interface, monitor. */
export function DiscordRoute({
  snap,
  onRefresh,
  onSelectSend,
  onSelectPhones,
  onToggleMonitorMix,
  onMonitorVolume,
}: DiscordRouteProps) {
  const cableLike = snap.outputDevices.filter((d) =>
    /cable|voicemeeter|vb-audio|virtual/i.test(d.label),
  );

  return (
    <section className="rack-panel relative shrink-0 rounded-sm px-[var(--rack-pad)] py-2">
      <div className="pointer-events-none absolute top-1.5 left-3 flex gap-2">
        <span className="rack-screw" />
        <span className="rack-screw" />
      </div>
      <div className="pointer-events-none absolute top-1.5 right-3 flex gap-2">
        <span className="rack-screw" />
        <span className="rack-screw" />
      </div>

      <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
        <div className="min-w-[7rem] shrink-0">
          <p className="font-[family-name:var(--font-rack)] text-[length:var(--rack-title)] tracking-[0.14em] text-[color:var(--console-ink)] uppercase">
            Route
          </p>
          <p className="mt-0.5 text-[10px] text-[color:var(--console-muted)]">
            Active rack Mix send · phones for MON
          </p>
        </div>

        <label className="min-w-[12rem] flex-1 text-[9px] font-bold tracking-[0.14em] text-[color:var(--console-muted)] uppercase">
          Mix send · {snap.channelRackName}
          <select
            className="mt-1 h-8 w-full truncate rounded-sm border border-[color:var(--console-edge)] bg-[color:var(--chip)] px-2 text-[11px] font-semibold normal-case tracking-normal text-[color:var(--console-ink)] outline-none"
            value={snap.discordDeviceId}
            onChange={(e) => onSelectSend(e.target.value)}
            title={`Where “${snap.channelRackName}” mix plays — cable, headphones, TV, monitors, VR…`}
          >
            <option value="">Default system output</option>
            {snap.outputDevices.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label}
                {cableLike.some((c) => c.deviceId === d.deviceId) ? " ★" : ""}
              </option>
            ))}
          </select>
        </label>

        <label className="min-w-[12rem] flex-1 text-[9px] font-bold tracking-[0.14em] text-[color:var(--console-muted)] uppercase">
          Phones / interface
          <select
            className="mt-1 h-8 w-full truncate rounded-sm border border-[color:var(--console-edge)] bg-[color:var(--chip)] px-2 text-[11px] font-semibold normal-case tracking-normal text-[color:var(--console-ink)] outline-none"
            value={snap.phonesDeviceId}
            onChange={(e) => onSelectPhones(e.target.value)}
            title="Headphones, speakers, or audio interface"
          >
            <option value="">Default system output</option>
            {snap.outputDevices.map((d) => (
              <option key={`phones-${d.deviceId}`} value={d.deviceId}>
                {d.label}
              </option>
            ))}
          </select>
        </label>

        <div className="flex flex-wrap items-end gap-2">
          <Button
            type="button"
            variant="outline"
            className={cn(
              "btn-lit h-8 px-2.5 text-[10px]",
              snap.monitorMix
                ? "bg-[color:var(--accent-amber)] text-[#1a1a1a]"
                : "bg-[color:var(--chip)] text-[color:var(--console-ink)]",
            )}
            onClick={onToggleMonitorMix}
            title="Hear the full Mix bus in phones"
          >
            {snap.monitorMix ? "Mon mix ON" : "Mon mix OFF"}
          </Button>
          <label className="flex h-8 items-center gap-1.5 rounded-sm border border-white/10 bg-black/20 px-2 text-[10px] text-[color:var(--console-muted)]">
            Level
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={snap.monitorVolume}
              onChange={(e) => onMonitorVolume(Number(e.target.value))}
              className="w-24 accent-[color:var(--fader-fill)]"
            />
          </label>
          <Button
            type="button"
            variant="outline"
            className="btn-lit h-8 bg-[color:var(--chip)] px-2.5 text-[10px] text-[color:var(--console-ink)]"
            onClick={onRefresh}
            title="Rescan outputs and reconnect OBS / YouTube / missing sources"
          >
            Refresh
          </Button>
        </div>
      </div>
    </section>
  );
}
