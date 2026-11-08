import {
  controlLabel,
  encodeControl,
  faderChoices,
  faderControl,
  knobChoices,
  knobControl,
  MIDI_AUTO,
  MIDI_SHARE,
  type MpdAssign,
  type MpdStatus,
} from "@/lib/mpd226";
import type { ChannelSnapshot } from "@/lib/audio-engine";

type MpdAssignPanelProps = {
  channels: ChannelSnapshot[];
  assign: MpdAssign;
  midi: MpdStatus;
  onChange: (assign: MpdAssign) => void;
  onDevice: (id: string) => void;
  onRefresh: () => void;
};

export function MpdAssignPanel({
  channels,
  assign,
  midi,
  onChange,
  onDevice,
  onRefresh,
}: MpdAssignPanelProps) {
  const named = channels.map((channel) => ({
    id: channel.id,
    name: channel.name,
    kind: channel.kind,
  }));
  const sliders = faderChoices(named);
  const knobs = knobChoices(named);
  const deviceValue =
    midi.preferred === MIDI_SHARE || midi.preferred === MIDI_AUTO
      ? midi.preferred
      : midi.devices.some((device) => device.id === midi.preferred)
        ? midi.preferred
        : MIDI_AUTO;

  function setFader(index: 0 | 1, value: string) {
    const next: MpdAssign["faders"] = [...assign.faders];
    next[index] = value;
    onChange({ ...assign, faders: next });
  }

  function setKnob(index: 0 | 1 | 2 | 3, value: string) {
    const next: MpdAssign["knobs"] = [...assign.knobs];
    next[index] = value;
    onChange({ ...assign, knobs: next });
  }

  return (
    <div className="absolute top-full right-0 z-30 mt-1 w-72 rounded-sm border border-black/60 bg-[#141824] p-2.5 shadow-[0_16px_40px_rgba(0,0,0,0.55)]">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-bold tracking-[0.14em] text-[color:var(--console-muted)] uppercase">
          Controller
        </p>
        <button
          type="button"
          className="text-[9px] font-bold tracking-[0.12em] text-[color:var(--neon-cyan)] uppercase hover:underline"
          onClick={onRefresh}
        >
          Rescan
        </button>
      </div>
      <select
        className="mt-1.5 h-8 w-full truncate rounded-sm border border-[color:var(--console-edge)] bg-[color:var(--chip)] px-1.5 text-[11px] text-[color:var(--console-ink)] outline-none"
        value={deviceValue}
        onChange={(event) => onDevice(event.target.value)}
      >
        <option value={MIDI_AUTO}>Auto (Share or first pad)</option>
        <option value={MIDI_SHARE}>BPH Share (Stream Controller)</option>
        {midi.devices.map((device) => (
          <option key={device.id} value={device.id}>
            {device.name}
          </option>
        ))}
      </select>
      <p className="mt-1 text-[9px] leading-snug text-[color:var(--console-muted)]">
        Pick any MIDI pad. MPD226 maps still work. Use Learn on a cue for other controllers.
      </p>

      <p className="mt-3 text-[10px] font-bold tracking-[0.14em] text-[color:var(--console-muted)] uppercase">
        Sliders
      </p>
      <div className="mt-1.5 grid grid-cols-[1.4rem_1fr] items-center gap-1.5">
        <PickRow
          n={1}
          value={encodeControl(faderControl(0, assign, named))}
          options={sliders}
          onChange={(value) => setFader(0, value)}
        />
        <PickRow
          n={2}
          value={encodeControl(faderControl(1, assign, named))}
          options={sliders}
          onChange={(value) => setFader(1, value)}
        />
        <LockedRow n={3} label="Cue" />
        <LockedRow n={4} label="Mix" />
      </div>
      <p className="mt-3 text-[10px] font-bold tracking-[0.14em] text-[color:var(--console-muted)] uppercase">
        Knobs
      </p>
      <div className="mt-1.5 grid grid-cols-[1.4rem_1fr] items-center gap-1.5">
        {([0, 1, 2, 3] as const).map((index) => (
          <PickRow
            key={index}
            n={index + 1}
            value={encodeControl(knobControl(index, assign, named))}
            options={knobs}
            onChange={(value) => setKnob(index, value)}
          />
        ))}
      </div>
      <p className="mt-2 text-[9px] leading-snug text-[color:var(--console-muted)]">
        Buttons under the sliders mute that slider’s strip.{" "}
        {controlLabel(knobControl(0, assign, named), named)} is knob 1.
      </p>
    </div>
  );
}

function PickRow({
  n,
  value,
  options,
  onChange,
}: {
  n: number;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <>
      <span className="font-mono text-[10px] text-[color:var(--console-ink)]">{n}</span>
      <select
        className="h-7 w-full truncate rounded-sm border border-[color:var(--console-edge)] bg-[color:var(--chip)] px-1.5 text-[11px] text-[color:var(--console-ink)] outline-none"
        value={options.some((option) => option.value === value) ? value : ""}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.length === 0 ? <option value="">Add a strip first</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </>
  );
}

function LockedRow({ n, label }: { n: number; label: string }) {
  return (
    <>
      <span className="font-mono text-[10px] text-[color:var(--console-ink)]">{n}</span>
      <div className="flex h-7 items-center rounded-sm border border-white/10 bg-black/25 px-1.5 text-[11px] text-[color:var(--console-ink)]">
        {label}
      </div>
    </>
  );
}
