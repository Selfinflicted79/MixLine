import { Mic, Monitor, Music2, Radio, Trash2, AppWindow } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EqGraph } from "@/components/mixer/eq-graph";
import { LevelMeter } from "@/components/mixer/level-meter";
import { VerticalFader } from "@/components/mixer/vertical-fader";
import {
  formatDb,
  type AudioDevice,
  type ChannelSnapshot,
} from "@/lib/audio-engine";
import { cn } from "cn";

const kindIcon = {
  mic: Mic,
  desktop: Monitor,
  app: AppWindow,
  file: Music2,
  tone: Radio,
} as const;

const kindAccent: Record<ChannelSnapshot["kind"], string> = {
  mic: "#3d9bcc",
  app: "#6ec4e0",
  desktop: "#e8a23a",
  file: "#5fd36a",
  tone: "#c48ad4",
};

const kindFaderAccent: Record<
  ChannelSnapshot["kind"],
  "cyan" | "orange" | "green" | "red"
> = {
  mic: "cyan",
  app: "cyan",
  desktop: "orange",
  file: "green",
  tone: "cyan",
};

type ChannelStripProps = {
  channel: ChannelSnapshot;
  anySolo: boolean;
  eqMode: boolean;
  inputDevices?: AudioDevice[];
  onVolume: (v: number) => void;
  onMute: () => void;
  onSolo: () => void;
  onToMix: () => void;
  onMonitor: () => void;
  onRename: (name: string) => void;
  onRemove: () => void;
  onMicDevice?: (deviceId: string) => void;
  onEnterEq: () => void;
  onExitEq: () => void;
  onEqGain: (bandId: string, gainDb: number) => void;
  onResetEq: () => void;
};

export function ChannelStrip({
  channel,
  anySolo,
  eqMode,
  inputDevices = [],
  onVolume,
  onMute,
  onSolo,
  onToMix,
  onMonitor,
  onRename,
  onRemove,
  onMicDevice,
  onEnterEq,
  onExitEq,
  onEqGain,
  onResetEq,
}: ChannelStripProps) {
  const Icon = kindIcon[channel.kind];
  const dimmed = anySolo && !channel.solo && !eqMode;
  const wide = channel.kind === "mic" || channel.kind === "app" || eqMode;
  const accent = kindAccent[channel.kind];

  return (
    <section
      className={cn(
        "strip-face group relative flex shrink-0 flex-col gap-2 rounded-sm px-2 py-3 transition-[opacity,transform] duration-300",
        eqMode ? "w-[22rem]" : wide ? "w-[9.75rem]" : "w-[7.75rem]",
        dimmed && "opacity-45",
        !channel.connected && !eqMode && "opacity-70",
      )}
      style={{ boxShadow: `inset 3px 0 0 ${accent}` }}
    >
      <div className="flex items-start justify-between gap-1">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-[color:var(--console-ink)]"
          title={eqMode ? "Click name to leave EQ" : undefined}
          onClick={() => {
            if (eqMode) onExitEq();
          }}
        >
          <Icon className="size-3.5 shrink-0 opacity-70" style={{ color: accent }} />
          {eqMode ? (
            <span className="truncate font-[family-name:var(--font-display)] text-[11px] font-semibold tracking-wide uppercase underline decoration-[color:var(--accent-blue)] underline-offset-2">
              {channel.name} · back
            </span>
          ) : (
            <input
              className="w-full truncate bg-transparent font-[family-name:var(--font-display)] text-[11px] font-semibold tracking-wide uppercase outline-none placeholder:text-[color:var(--console-muted)]"
              value={channel.name}
              aria-label="Channel name"
              onChange={(e) => onRename(e.target.value)}
              onClick={(e) => e.stopPropagation()}
            />
          )}
        </button>
        {!eqMode ? (
          <button
            type="button"
            onClick={onRemove}
            className="rounded p-0.5 text-[color:var(--console-muted)] opacity-0 transition group-hover:opacity-100 hover:text-[color:var(--meter-red)]"
            aria-label={`Remove ${channel.name}`}
          >
            <Trash2 className="size-3.5" />
          </button>
        ) : null}
      </div>

      {!eqMode && (channel.kind === "mic" || channel.kind === "app") && onMicDevice ? (
        <label className="block">
          <select
            className={cn(
              "h-7 w-full truncate rounded-sm border bg-[color:var(--chip)] px-1 text-[10px] text-[color:var(--console-ink)] outline-none",
              channel.needsReconnect
                ? "border-[color:var(--meter-red)]"
                : "border-[color:var(--console-edge)]",
            )}
            value={channel.deviceId}
            onChange={(e) => onMicDevice(e.target.value)}
          >
            <option value="">
              {channel.needsReconnect
                ? "Reconnect…"
                : channel.kind === "mic"
                  ? "Default mic"
                  : "Choose device…"}
            </option>
            {inputDevices.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {!eqMode && channel.captureMode === "system" ? (
        <span className="rounded-sm bg-[color:var(--accent-amber)]/30 px-1.5 py-1 text-[9px] font-bold tracking-wide text-[color:var(--accent-amber)] uppercase">
          All PC audio
        </span>
      ) : null}

      {eqMode ? (
        <>
          <div className="flex justify-center gap-2 overflow-x-auto pb-1">
            {channel.eq.map((band) => (
              <div key={band.id} className="flex w-12 flex-col items-center gap-1">
                <span className="text-[9px] font-bold tracking-wide text-[color:var(--console-muted)]">
                  {band.label}
                </span>
                <VerticalFader
                  value={(band.gainDb + 12) / 24}
                  onChange={(v) => onEqGain(band.id, v * 24 - 12)}
                  label={`${band.label} gain`}
                  className="h-44 w-8"
                  accent={kindFaderAccent[channel.kind]}
                />
                <span className="font-mono text-[9px] tabular-nums text-[color:var(--console-muted)]">
                  {band.gainDb > 0 ? "+" : ""}
                  {band.gainDb.toFixed(0)}
                </span>
              </div>
            ))}
          </div>
          <EqGraph bands={channel.eq} className="h-20 w-full" />
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
          <div className="flex justify-center gap-3">
            <LevelMeter rms={channel.rms} peak={channel.peak} className="h-48" />
            <VerticalFader
              value={channel.volume}
              onChange={onVolume}
              label={`${channel.name} volume`}
              className="h-48"
              accent={kindFaderAccent[channel.kind]}
            />
          </div>

          <div className="text-center font-mono text-[10px] tabular-nums text-[color:var(--console-muted)]">
            {formatDb(channel.rms)} dB
          </div>

          <div className="grid grid-cols-2 gap-1">
            <LitButton active={channel.muted} danger={channel.muted} onClick={onMute}>
              Mute
            </LitButton>
            <LitButton active={channel.solo} warn={channel.solo} onClick={onSolo}>
              Solo
            </LitButton>
            <LitButton active={channel.toMix} cool={channel.toMix} onClick={onToMix}>
              Mix
            </LitButton>
            <LitButton active={channel.monitor} cool={channel.monitor} onClick={onMonitor}>
              Mon
            </LitButton>
          </div>

          <Button
            type="button"
            size="sm"
            variant="outline"
            className="btn-lit h-8 w-full bg-[color:var(--chip)] text-[10px] text-[color:var(--console-ink)]"
            onClick={onEnterEq}
          >
            EQ
          </Button>

          <div
            className={cn(
              "mx-auto size-2 rounded-full",
              channel.connected
                ? "bg-[color:var(--meter-green)] shadow-[0_0_8px_var(--meter-green)]"
                : "bg-[color:var(--console-muted)]",
            )}
          />
        </>
      )}
    </section>
  );
}

function LitButton({
  children,
  active,
  danger,
  warn,
  cool,
  onClick,
}: {
  children: string;
  active?: boolean;
  danger?: boolean;
  warn?: boolean;
  cool?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "btn-lit h-8 text-[10px]",
        active && danger && "bg-[color:var(--meter-red)] text-white",
        active && warn && "bg-[color:var(--accent-amber)] text-[#1a1a1a]",
        active && cool && "bg-[color:var(--accent-blue)] text-[#0b1218]",
        !active && "bg-[color:var(--chip)] text-[color:var(--console-ink)] hover:bg-[color:var(--chip-hover)]",
      )}
    >
      {children}
    </button>
  );
}
