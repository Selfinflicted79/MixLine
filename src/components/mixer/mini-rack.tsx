import { Expand, Headphones } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LevelMeter } from "@/components/mixer/level-meter";
import { VerticalFader } from "@/components/mixer/vertical-fader";
import { formatDb, type MixerSnapshot } from "@/lib/audio-engine";
import { cn } from "cn";
import bphLogo from "@/assets/bph-logo.png";

type MiniRackProps = {
  snap: MixerSnapshot;
  started: boolean;
  busy: string | null;
  onExpand: () => void;
  onPower: () => void;
  onPlayCue: (id: string) => void;
  onChannelVolume: (id: string, v: number) => void;
  onMasterVolume: (v: number) => void;
  onCueMasterVolume: (v: number) => void;
  onToggleMasterMute: () => void;
  onToggleCueMasterMute: () => void;
  onSelectDiscord: (id: string) => void;
  mpdShared?: boolean;
  midiLabel?: string | null;
};

/** Pocket mixer: same Mic / Music / Cue / Mix rack, tiny faders — corner size. */
export function MiniRack({
  snap,
  started,
  busy,
  onExpand,
  onPower,
  onPlayCue,
  onChannelVolume,
  onMasterVolume,
  onCueMasterVolume,
  onToggleMasterMute,
  onToggleCueMasterMute,
  onSelectDiscord,
  mpdShared = false,
  midiLabel = null,
}: MiniRackProps) {
  const mic = snap.channels.find((c) => c.kind === "mic");
  const music = snap.channels.find((c) => c.kind === "app" || c.kind === "file");
  const cues = snap.cues.slice(0, 8);

  return (
    <div className="mini-rack relative flex h-dvh flex-col gap-1 overflow-hidden p-1.5">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_20%_0%,rgba(77,232,255,0.14),transparent_50%),radial-gradient(ellipse_at_90%_10%,rgba(255,79,216,0.1),transparent_45%)]" />

      <header className="relative flex shrink-0 items-center gap-1.5">
        <div className={cn("logo-screen logo-screen--compact", started && "logo-screen--on")}>
          <div className="logo-screen__glass">
            <img src={bphLogo} alt="" className="bph-logo" width={44} height={44} />
          </div>
          <span className="logo-screen__led" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[0.5rem] font-semibold tracking-[0.18em] text-[color:var(--neon-cyan)] uppercase">
            BPH
          </p>
          <p className="brand-wordmark brand-wordmark--on text-base leading-none">MixLine</p>
        </div>
        {mpdShared && midiLabel ? (
          <span
            className="shrink-0 text-[0.45rem] font-bold tracking-[0.12em] text-[color:var(--meter-green)] uppercase"
            title={midiLabel}
          >
            {midiLabel === "BPH Share" ? "BPH" : "MIDI"}
          </span>
        ) : null}
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 border-white/15 bg-[color:var(--chip)] px-1.5 text-[color:var(--console-ink)]"
          onClick={onExpand}
          title="Full rack"
        >
          <Expand className="size-3.5" />
        </Button>
      </header>

      {!started ? (
        <Button
          type="button"
          className="relative h-7 shrink-0 border border-[color:var(--neon-magenta)]/40 bg-[linear-gradient(105deg,var(--neon-cyan),var(--neon-magenta))] text-[0.7rem] font-semibold text-[#07080d]"
          disabled={busy === "boot"}
          onClick={onPower}
        >
          <Headphones className="size-3" />
          Power
        </Button>
      ) : (
        <select
          className="relative h-6 w-full shrink-0 truncate rounded-sm border border-[color:var(--console-edge)] bg-[color:var(--chip)] px-1 text-[0.6rem] text-[color:var(--console-ink)]"
          value={snap.discordDeviceId}
          onChange={(e) => onSelectDiscord(e.target.value)}
          title="Discord send"
        >
          <option value="">Discord send…</option>
          {snap.outputDevices.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label}
            </option>
          ))}
        </select>
      )}

      {cues.length > 0 ? (
        <div className="relative grid shrink-0 grid-cols-4 gap-0.5">
          {cues.map((cue, index) => (
            <button
              key={cue.id}
              type="button"
              disabled={!started || cue.muted}
              className="truncate rounded-sm border border-black/40 bg-[linear-gradient(180deg,#5a4030,#3a281c)] px-0.5 py-1 text-[0.5rem] font-bold text-[#f0e6d4] uppercase disabled:opacity-40"
              onClick={() => onPlayCue(cue.id)}
              title={`${index + 1}. ${cue.name}`}
            >
              {cue.name.slice(0, 8)}
            </button>
          ))}
        </div>
      ) : null}

      <section className="relative flex min-h-0 flex-1 gap-0.5 overflow-hidden rounded-sm border border-black/50 bg-[linear-gradient(180deg,#22263a,#161925)] p-1">
        {mic ? (
          <MiniStrip
            title="Mic"
            accent="#3d9bcc"
            faderAccent="cyan"
            volume={mic.volume}
            peak={mic.peak}
            rms={mic.rms}
            muted={mic.muted}
            started={started}
            onVolume={(v) => onChannelVolume(mic.id, v)}
          />
        ) : (
          <EmptyMini title="Mic" accent="#3d9bcc" />
        )}
        {music ? (
          <MiniStrip
            title={(music.name || "App").slice(0, 8)}
            accent="#ff4fd8"
            faderAccent="cyan"
            volume={music.volume}
            peak={music.peak}
            rms={music.rms}
            muted={music.muted}
            started={started}
            onVolume={(v) => onChannelVolume(music.id, v)}
          />
        ) : (
          <EmptyMini title="Music" accent="#ff4fd8" />
        )}
        <MiniStrip
          title="Cue"
          accent="#e8a23a"
          faderAccent="orange"
          volume={snap.cueMasterVolume}
          peak={snap.cueMasterPeak}
          rms={snap.cueMasterRms}
          muted={snap.cueMasterMuted}
          started={started}
          onVolume={onCueMasterVolume}
          onMute={onToggleCueMasterMute}
        />
        <MiniStrip
          title="Mix"
          accent="#5fd36a"
          faderAccent="green"
          volume={snap.masterVolume}
          peak={snap.masterPeak}
          rms={snap.masterRms}
          muted={snap.masterMuted}
          started={started}
          onVolume={onMasterVolume}
          onMute={onToggleMasterMute}
        />
      </section>
    </div>
  );
}

function MiniStrip({
  title,
  accent,
  faderAccent,
  volume,
  peak,
  rms,
  muted,
  started,
  onVolume,
  onMute,
}: {
  title: string;
  accent: string;
  faderAccent: "cyan" | "orange" | "green";
  volume: number;
  peak: number;
  rms: number;
  muted: boolean;
  started: boolean;
  onVolume: (v: number) => void;
  onMute?: () => void;
}) {
  return (
    <div
      className={cn(
        "strip-face flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-sm px-0.5 py-1",
        muted && "opacity-45",
      )}
      style={{ boxShadow: `inset 2px 0 0 ${accent}` }}
    >
      <div className="flex w-full items-center justify-between gap-0.5 px-0.5">
        <span
          className="truncate font-[family-name:var(--font-rack)] text-[0.52rem] tracking-[0.08em] uppercase"
          style={{ color: accent }}
        >
          {title}
        </span>
        {onMute ? (
          <button
            type="button"
            className={cn(
              "rounded px-0.5 text-[0.45rem] font-bold uppercase",
              muted ? "bg-[color:var(--meter-red)] text-white" : "text-[color:var(--console-muted)]",
            )}
            disabled={!started}
            onClick={onMute}
          >
            M
          </button>
        ) : null}
      </div>
      <div className="flex min-h-0 flex-1 justify-center gap-0.5">
        <LevelMeter rms={rms} peak={peak} className="h-full min-h-[4.5rem] w-[0.55rem]" />
        <VerticalFader
          value={volume}
          onChange={onVolume}
          label={`${title} volume`}
          className="h-full min-h-[4.5rem] w-8"
          accent={faderAccent}
          dense
          disabled={!started}
        />
      </div>
      <span className="font-[family-name:var(--font-meter)] text-[0.5rem] text-[color:var(--console-muted)]">
        {formatDb(volume)}
      </span>
    </div>
  );
}

function EmptyMini({ title, accent }: { title: string; accent: string }) {
  return (
    <div
      className="strip-face flex min-w-0 flex-1 flex-col items-center justify-center rounded-sm px-0.5 py-1 opacity-50"
      style={{ boxShadow: `inset 2px 0 0 ${accent}` }}
    >
      <span
        className="font-[family-name:var(--font-rack)] text-[0.52rem] tracking-[0.08em] uppercase"
        style={{ color: accent }}
      >
        {title}
      </span>
      <span className="mt-0.5 text-center text-[0.48rem] text-[color:var(--console-muted)]">
        —
      </span>
    </div>
  );
}
