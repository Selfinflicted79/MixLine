import { Mic, Monitor, Music2, Radio, Trash2, AppWindow } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EqGraph } from "@/components/mixer/eq-graph";
import { LevelMeter } from "@/components/mixer/level-meter";
import { RotaryKnob } from "@/components/mixer/rotary-knob";
import { VerticalFader } from "@/components/mixer/vertical-fader";
import {
  formatDb,
  type AudioDevice,
  type ChannelSnapshot,
} from "@/lib/audio-engine";
import type { ChannelFx } from "@/lib/fx-graph";
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
  fxMode: boolean;
  inputDevices?: AudioDevice[];
  onVolume: (v: number) => void;
  onBoost: (boostDb: number) => void;
  onMute: () => void;
  onSolo: () => void;
  onToMix: () => void;
  onMonitor: () => void;
  onRename: (name: string) => void;
  onRemove: () => void;
  onMicDevice?: (deviceId: string) => void;
  onNoiseCancel?: (enabled: boolean) => void;
  onNoiseGate?: (amount: number) => void;
  onEnterEq: () => void;
  onExitEq: () => void;
  onEqGain: (bandId: string, gainDb: number) => void;
  onResetEq: () => void;
  onEnterFx: () => void;
  onExitFx: () => void;
  onFx: (patch: Partial<ChannelFx>) => void;
  onResetFx: () => void;
};

export function ChannelStrip({
  channel,
  anySolo,
  eqMode,
  fxMode,
  inputDevices = [],
  onVolume,
  onBoost,
  onMute,
  onSolo,
  onToMix,
  onMonitor,
  onRename,
  onRemove,
  onMicDevice,
  onNoiseCancel,
  onNoiseGate,
  onEnterEq,
  onExitEq,
  onEqGain,
  onResetEq,
  onEnterFx,
  onExitFx,
  onFx,
  onResetFx,
}: ChannelStripProps) {
  const Icon = kindIcon[channel.kind];
  const dimmed = anySolo && !channel.solo && !eqMode && !fxMode;
  const wide =
    channel.kind === "mic" ||
    (channel.kind === "app" && channel.captureMode !== "process") ||
    eqMode ||
    fxMode;
  const accent = kindAccent[channel.kind];

  return (
    <section
      className={cn(
        "strip-face group relative flex h-full min-h-0 shrink-0 flex-col gap-2 rounded-sm px-2 py-3 transition-[opacity,transform] duration-300",
        eqMode ? "w-[22rem]" : fxMode ? "w-[19.5rem]" : wide ? "w-[9.75rem]" : "w-[7.75rem]",
        dimmed && "opacity-45",
        !channel.connected && !eqMode && !fxMode && "opacity-70",
      )}
      style={{ boxShadow: `inset 3px 0 0 ${accent}` }}
    >
      <div className="flex items-start justify-between gap-1">
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-[color:var(--console-ink)]"
          title={eqMode || fxMode ? "Click name to leave this panel" : undefined}
          onClick={() => {
            if (eqMode) onExitEq();
            if (fxMode) onExitFx();
          }}
        >
          <Icon className="size-3.5 shrink-0 opacity-70" style={{ color: accent }} />
          {eqMode || fxMode ? (
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
        {!eqMode && !fxMode ? (
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

      {!eqMode && !fxMode && (channel.kind === "mic" || channel.kind === "app") && onMicDevice ? (
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

      {!eqMode && !fxMode && channel.kind === "mic" && onNoiseCancel && onNoiseGate ? (
        <div className="flex flex-col items-center gap-1">
          <button
            type="button"
            className={cn(
              "btn-lit h-7 w-full text-[10px]",
              channel.noiseCancel
                ? "bg-[color:var(--neon-cyan)]/20 text-[color:var(--neon-cyan)]"
                : "bg-[color:var(--chip)] text-[color:var(--console-ink)]",
            )}
            title="OS noise suppression + echo cancel on this mic"
            onClick={() => onNoiseCancel(!channel.noiseCancel)}
          >
            NC {channel.noiseCancel ? "ON" : "OFF"}
          </button>
          <RotaryKnob
            compact
            label="Gate"
            display={channel.noiseGate < 0.02 ? "OFF" : `${Math.round(channel.noiseGate * 100)}`}
            value={channel.noiseGate}
            accent="cyan"
            onChange={onNoiseGate}
          />
        </div>
      ) : null}

      {!eqMode && !fxMode && channel.captureMode === "process" ? (
        <span className="rounded-sm bg-[color:var(--neon-cyan)]/15 px-1.5 py-1 text-[9px] font-bold tracking-wide text-[color:var(--neon-cyan)] uppercase">
          {channel.needsReconnect ? "App stopped" : "This app only"}
        </span>
      ) : null}

      {!eqMode && !fxMode && channel.captureMode === "system" ? (
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
      ) : fxMode ? (
        <FxPanel fx={channel.fx} accent={kindFaderAccent[channel.kind]} onFx={onFx} onReset={onResetFx} />
      ) : (
        <>
          <div className="flex justify-center">
            <RotaryKnob
              compact
              label="Trim"
              display={channel.boostDb >= 0.5 ? `+${channel.boostDb.toFixed(0)}` : "+0"}
              value={channel.boostDb / 24}
              accent={kindFaderAccent[channel.kind] === "orange" ? "orange" : kindFaderAccent[channel.kind] === "green" ? "green" : "cyan"}
              onChange={(v) => onBoost(v * 24)}
            />
          </div>
          <div className="flex min-h-0 flex-1 justify-center gap-2">
            <LevelMeter
              rms={channel.rms}
              peak={channel.peak}
              className="h-full min-h-0"
            />
            <VerticalFader
              value={channel.volume}
              onChange={onVolume}
              label={`${channel.name} volume`}
              className="h-full min-h-0"
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

          <div className="grid grid-cols-2 gap-1">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="btn-lit h-8 bg-[color:var(--chip)] text-[10px] text-[color:var(--console-ink)]"
              onClick={onEnterEq}
            >
              EQ
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={cn(
                "btn-lit h-8 bg-[color:var(--chip)] text-[10px] text-[color:var(--console-ink)]",
                (channel.fx.reverb > 0.02 ||
                  channel.fx.chorus > 0.02 ||
                  Math.abs(channel.fx.pitch) >= 0.2 ||
                  channel.fx.robot > 0.02 ||
                  channel.fx.autotune > 0.04) &&
                  "border-[color:var(--neon-magenta)] text-[color:var(--neon-magenta)]",
              )}
              onClick={onEnterFx}
            >
              FX
            </Button>
          </div>

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

const VOICE_PRESETS: Array<{ label: string; pitch: number; robot: number; autotune: number; reverb?: number }> = [
  { label: "Clear", pitch: 0, robot: 0, autotune: 0 },
  { label: "Deep", pitch: -5, robot: 0, autotune: 0 },
  { label: "High", pitch: 7, robot: 0, autotune: 0 },
  { label: "Robot", pitch: -2, robot: 0.85, autotune: 0 },
  { label: "Tune", pitch: 0, robot: 0, autotune: 1, reverb: 0.35 },
];

function FxPanel({
  fx,
  accent,
  onFx,
  onReset,
}: {
  fx: ChannelFx;
  accent: "cyan" | "orange" | "green" | "red";
  onFx: (patch: Partial<ChannelFx>) => void;
  onReset: () => void;
}) {
  const pitchLabel = `${fx.pitch > 0.05 ? "+" : ""}${fx.pitch.toFixed(0)}`;
  return (
    <>
      <div className="flex justify-center gap-2">
        <FxFader label="Verb" value={fx.reverb} display={`${Math.round(fx.reverb * 100)}`} accent={accent} onChange={(v) => onFx({ reverb: v })} />
        <FxFader label="Chorus" value={fx.chorus} display={`${Math.round(fx.chorus * 100)}`} accent={accent} onChange={(v) => onFx({ chorus: v })} />
        <FxFader
          label="Pitch"
          value={(fx.pitch + 12) / 24}
          display={pitchLabel}
          accent="orange"
          onChange={(v) => onFx({ pitch: v * 24 - 12 })}
        />
        <FxFader label="Robot" value={fx.robot} display={`${Math.round(fx.robot * 100)}`} accent="red" onChange={(v) => onFx({ robot: v })} />
        <FxFader label="Tune" value={fx.autotune} display={`${Math.round(fx.autotune * 100)}`} accent="green" onChange={(v) => onFx({ autotune: v })} />
      </div>
      <div className="grid grid-cols-5 gap-1">
        {VOICE_PRESETS.map((preset) => {
          const active =
            Math.abs(fx.pitch - preset.pitch) < 0.3 &&
            Math.abs(fx.robot - preset.robot) < 0.05 &&
            Math.abs(fx.autotune - preset.autotune) < 0.08;
          return (
            <button
              key={preset.label}
              type="button"
              className={cn(
                "h-7 rounded-sm text-[9px] font-bold tracking-wide uppercase",
                active
                  ? "bg-[color:var(--neon-magenta)] text-[#140810]"
                  : "bg-[color:var(--chip)] text-[color:var(--console-ink)]",
              )}
              onClick={() =>
                onFx({
                  pitch: preset.pitch,
                  robot: preset.robot,
                  autotune: preset.autotune,
                  ...(preset.reverb !== undefined ? { reverb: preset.reverb } : {}),
                })
              }
            >
              {preset.label}
            </button>
          );
        })}
      </div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="btn-lit h-8 bg-[color:var(--chip)] text-[10px] text-[color:var(--console-ink)]"
        onClick={onReset}
      >
        FX off
      </Button>
    </>
  );
}

function FxFader({
  label,
  value,
  display,
  accent,
  onChange,
}: {
  label: string;
  value: number;
  display: string;
  accent: "cyan" | "orange" | "green" | "red";
  onChange: (value: number) => void;
}) {
  return (
    <div className="flex w-12 flex-col items-center gap-1">
      <span className="text-[9px] font-bold tracking-wide text-[color:var(--console-muted)]">{label}</span>
      <VerticalFader value={value} onChange={onChange} label={label} className="h-36 w-8" accent={accent} />
      <span className="font-mono text-[9px] tabular-nums text-[color:var(--console-muted)]">{display}</span>
    </div>
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
