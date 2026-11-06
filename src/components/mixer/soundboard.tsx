import { useEffect, useRef, useState } from "react";
import { Keyboard, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LevelMeter } from "@/components/mixer/level-meter";
import { VerticalFader } from "@/components/mixer/vertical-fader";
import { formatDb, type CuePad } from "@/lib/audio-engine";
import { eventToAccelerator } from "@/lib/setup-store";
import { cn } from "cn";

type SoundboardProps = {
  cues: CuePad[];
  anySolo: boolean;
  onPlay: (id: string) => void;
  onVolume: (id: string, v: number) => void;
  onMute: (id: string) => void;
  onSolo: (id: string) => void;
  onToMix: (id: string) => void;
  onMonitor: (id: string) => void;
  onAddFile: (file: File) => void;
  onRemove: (id: string) => void;
  onHotkey: (id: string, hotkey: string | null) => void;
};

export function Soundboard({
  cues,
  anySolo,
  onPlay,
  onVolume,
  onMute,
  onSolo,
  onToMix,
  onMonitor,
  onAddFile,
  onRemove,
  onHotkey,
}: SoundboardProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [recordingId, setRecordingId] = useState<string | null>(null);

  useEffect(() => {
    if (!recordingId) return;
    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        setRecordingId(null);
        return;
      }
      if (e.key === "Backspace" || e.key === "Delete") {
        onHotkey(recordingId, null);
        setRecordingId(null);
        return;
      }
      const accel = eventToAccelerator(e);
      if (!accel) return;
      onHotkey(recordingId, accel);
      setRecordingId(null);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [recordingId, onHotkey]);

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

      <div className="mb-4 flex flex-col gap-3 border-b border-black/40 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-2xl tracking-[0.06em] text-[color:var(--console-ink)] uppercase">
            Cue rack
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-[color:var(--console-muted)]">
            Same strip controls as your inputs — gain, mute, solo, mix, and mon. Tap the big pad to fire;
            keyboard icon sets a hotkey for your Razer mini.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="btn-lit h-9 bg-[color:var(--chip)] text-[color:var(--console-ink)]"
          onClick={() => fileRef.current?.click()}
        >
          <Plus className="size-4" />
          Add sound
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="audio/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) onAddFile(file);
          }}
        />
      </div>

      {recordingId ? (
        <div className="mb-3 rounded-sm border border-[color:var(--accent-amber)] bg-[color:var(--accent-amber)]/20 px-3 py-2 text-sm text-[color:var(--console-ink)]">
          Listening for a hotkey… Esc cancel, Delete clear.
        </div>
      ) : null}

      <div className="flex gap-3 overflow-x-auto pb-2">
        {cues.map((cue) => {
          const dimmed = anySolo && !cue.solo;
          return (
            <section
              key={cue.id}
              className={cn(
                "strip-face relative flex w-[8.5rem] shrink-0 flex-col gap-2 rounded-sm px-2 py-3",
                dimmed && "opacity-45",
              )}
              style={{ boxShadow: "inset 3px 0 0 #e8a23a" }}
            >
              <div className="flex items-start justify-between gap-1">
                <button
                  type="button"
                  onClick={() => onPlay(cue.id)}
                  className={cn(
                    "min-w-0 flex-1 rounded-sm border border-black/50 bg-gradient-to-b from-[#5a4030] to-[#3a281c] px-2 py-2 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] transition hover:brightness-110 active:translate-y-px",
                    recordingId === cue.id && "ring-2 ring-[color:var(--accent-amber)]",
                  )}
                >
                  <div className="truncate font-[family-name:var(--font-display)] text-[12px] font-semibold tracking-wide text-[#f0e6d4] uppercase">
                    {cue.name}
                  </div>
                  <div className="truncate text-[9px] tracking-wide text-[#c4b59a] uppercase">
                    {cue.hotkey ?? (cue.builtin ? "Built-in" : "Custom")} · hit
                  </div>
                </button>
                <div className="flex flex-col gap-0.5">
                  <button
                    type="button"
                    aria-label={`Set hotkey for ${cue.name}`}
                    className="rounded p-0.5 text-[color:var(--console-muted)] hover:text-[color:var(--console-ink)]"
                    onClick={() => setRecordingId(cue.id)}
                  >
                    <Keyboard className="size-3.5" />
                  </button>
                  {!cue.builtin ? (
                    <button
                      type="button"
                      aria-label={`Remove ${cue.name}`}
                      className="rounded p-0.5 text-[color:var(--console-muted)] hover:text-[color:var(--meter-red)]"
                      onClick={() => onRemove(cue.id)}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="flex justify-center gap-3">
                <LevelMeter rms={cue.rms} peak={cue.peak} className="h-40" />
                <VerticalFader
                  value={cue.volume}
                  onChange={(v) => onVolume(cue.id, v)}
                  label={`${cue.name} volume`}
                  className="h-40"
                  accent="orange"
                />
              </div>

              <div className="text-center font-mono text-[10px] tabular-nums text-[color:var(--console-muted)]">
                {formatDb(cue.rms)} dB
              </div>

              <div className="grid grid-cols-2 gap-1">
                <CueBtn active={cue.muted} danger onClick={() => onMute(cue.id)}>
                  Mute
                </CueBtn>
                <CueBtn active={cue.solo} warn onClick={() => onSolo(cue.id)}>
                  Solo
                </CueBtn>
                <CueBtn active={cue.toMix} cool onClick={() => onToMix(cue.id)}>
                  Mix
                </CueBtn>
                <CueBtn active={cue.monitor} cool onClick={() => onMonitor(cue.id)}>
                  Mon
                </CueBtn>
              </div>
            </section>
          );
        })}
      </div>
    </section>
  );
}

function CueBtn({
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
