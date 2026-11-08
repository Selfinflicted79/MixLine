import { useEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { GripVertical, Keyboard, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LevelMeter } from "@/components/mixer/level-meter";
import { VerticalFader } from "@/components/mixer/vertical-fader";
import { RackTitle } from "@/components/mixer/rack-title";
import { formatDb, type CuePad } from "@/lib/audio-engine";
import { eventToAccelerator } from "@/lib/setup-store";
import { cn } from "cn";

type SoundboardProps = {
  cues: CuePad[];
  rackName: string;
  started?: boolean;
  seatWave?: number;
  bankIndex?: number;
  bankCount?: number;
  canAddBank?: boolean;
  onAddBank?: () => void;
  onPrevBank?: () => void;
  onNextBank?: () => void;
  onRenameRack: (name: string) => void;
  anySolo: boolean;
  onPlay: (id: string) => void;
  onKill: (id: string) => void;
  onVolume: (id: string, v: number) => void;
  onMute: (id: string) => void;
  onSolo: (id: string) => void;
  onToMix: (id: string) => void;
  onMonitor: (id: string) => void;
  onAddFile: (file: File) => void;
  onRemove: (id: string) => void;
  onHotkey: (id: string, hotkey: string | null) => void;
  onReorder: (id: string, toIndex: number) => void;
  onPad: (id: string, pad: number | null) => void;
  onLearnPad: (id: string) => void;
  learnCueId: string | null;
  onCancelLearn: () => void;
};

export function Soundboard({
  cues,
  rackName,
  started = false,
  seatWave = 0,
  bankIndex = 0,
  bankCount = 1,
  canAddBank = false,
  onAddBank,
  onPrevBank,
  onNextBank,
  onRenameRack,
  anySolo,
  onPlay,
  onKill,
  onVolume,
  onMute,
  onSolo,
  onToMix,
  onMonitor,
  onAddFile,
  onRemove,
  onHotkey,
  onReorder,
  onPad,
  onLearnPad,
  learnCueId,
  onCancelLearn,
}: SoundboardProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<string | null>(null);
  const dropRef = useRef<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [recordingId, setRecordingId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [fromIndex, setFromIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);

  function indexAt(clientX: number) {
    const row = rowRef.current;
    if (!row) return 0;
    const cards = [...row.querySelectorAll<HTMLElement>("[data-cue-card]")];
    for (let i = 0; i < cards.length; i++) {
      const rect = cards[i]!.getBoundingClientRect();
      if (clientX < rect.left + rect.width / 2) return i;
    }
    return Math.max(0, cards.length - 1);
  }

  function dropLineLeft() {
    if (dropIndex === null || fromIndex === null) return null;
    const row = rowRef.current;
    if (!row) return null;
    const cards = [...row.querySelectorAll<HTMLElement>("[data-cue-card]")];
    const card = cards[dropIndex];
    if (!card) return null;
    const rowRect = row.getBoundingClientRect();
    const rect = card.getBoundingClientRect();
    const gap = Number.parseFloat(getComputedStyle(row).columnGap) || 0;
    const movingRight = dropIndex > fromIndex;
    const edge = movingRight ? rect.right + gap / 2 : rect.left - gap / 2;
    return edge - rowRect.left + row.scrollLeft;
  }

  const lineLeft = dragId ? dropLineLeft() : null;

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

  useEffect(() => {
    if (!menu) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && menuRef.current?.contains(target)) return;
      setMenu(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenu(null);
    };
    window.addEventListener("pointerdown", onPointer, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointer, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  return (
    <section className="rack-panel relative flex shrink-0 flex-col rounded-sm p-[var(--rack-pad)]">
      <div className="pointer-events-none absolute top-2 left-3 flex gap-2">
        <span className="rack-screw" />
        <span className="rack-screw" />
      </div>
      <div className="pointer-events-none absolute top-2 right-3 flex gap-2">
        <span className="rack-screw" />
        <span className="rack-screw" />
      </div>

      <div className="mb-[var(--rack-gap)] flex shrink-0 flex-col gap-2 border-b border-black/40 pb-[var(--rack-gap)] sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <RackTitle
            prefix="Cue Rack"
            name={rackName}
            lit={started}
            bankIndex={bankIndex}
            bankCount={bankCount}
            canAddBank={canAddBank}
            onAddBank={onAddBank}
            onPrevBank={onPrevBank}
            onNextBank={onNextBank}
            onRename={onRenameRack}
          />
          <p className="rack-help mt-1 max-w-4xl text-[length:var(--rack-copy)] text-[color:var(--console-muted)]">
            Up to 12 strips in view — gain, mute, solo, mix, and mon. Tap to fire (stacks). Double-click the
            fader to kill that cue’s plays. Right-click to Learn a MIDI pad. Drag the corner grip to reorder.
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
      {learnCueId ? (
        <div className="mb-3 flex items-center justify-between gap-2 rounded-sm border border-[color:var(--neon-cyan)] bg-[color:var(--neon-cyan)]/15 px-3 py-2 text-sm text-[color:var(--console-ink)]">
          <span>Hit a pad on your controller to link this cue…</span>
          <button
            type="button"
            className="text-[11px] font-bold tracking-wide text-[color:var(--neon-cyan)] uppercase"
            onClick={onCancelLearn}
          >
            Cancel
          </button>
        </div>
      ) : null}

      <div
        ref={rowRef}
        className="relative grid grid-cols-6 gap-[var(--strip-gap)] overflow-x-auto overflow-y-hidden pb-1 xl:grid-cols-12"
      >
        {lineLeft !== null ? (
          <div
            className="pointer-events-none absolute top-1 bottom-1 z-20 w-[3px] -translate-x-1/2 rounded-full bg-[color:var(--neon-cyan)] opacity-80 shadow-[0_0_14px_var(--neon-cyan)]"
            style={{ left: lineLeft }}
          />
        ) : null}
        {cues.map((cue, index) => {
          const dimmed = anySolo && !cue.solo;
          return (
            <section
              key={cue.id}
              data-cue-card
              className={cn(
                "strip-face relative flex min-w-[6.4rem] flex-col gap-1.5 rounded-sm px-1.5 py-2",
                started && seatWave === 0 && "strip-seat-hold",
                seatWave > 0 && "strip-seat",
                dimmed && dragId !== cue.id && "opacity-45",
                dragId === cue.id && "opacity-60",
              )}
              style={{
                boxShadow: "inset 3px 0 0 #e8a23a",
                animationDelay: seatWave > 0 ? `${Math.min(index, 10) * 55}ms` : undefined,
              }}
            >
              <button
                type="button"
                aria-label={`Drag ${cue.name} to a new spot`}
                title="Drag to reorder"
                className="absolute top-1 left-1 z-10 cursor-grab rounded-sm bg-black/45 p-0.5 text-[#f0e6d4] active:cursor-grabbing"
                onPointerDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  e.currentTarget.setPointerCapture(e.pointerId);
                  dragRef.current = cue.id;
                  dropRef.current = index;
                  setDragId(cue.id);
                  setFromIndex(index);
                  setDropIndex(index);
                }}
                onPointerMove={(e) => {
                  if (dragRef.current !== cue.id) return;
                  const next = indexAt(e.clientX);
                  dropRef.current = next;
                  setDropIndex(next);
                }}
                onPointerUp={() => {
                  if (dragRef.current === cue.id && dropRef.current !== null) {
                    onReorder(cue.id, dropRef.current);
                  }
                  dragRef.current = null;
                  dropRef.current = null;
                  setDragId(null);
                  setFromIndex(null);
                  setDropIndex(null);
                }}
              >
                <GripVertical className="size-3.5" />
              </button>
              <div className="flex items-start justify-between gap-1">
                <button
                  type="button"
                  onClick={() => onPlay(cue.id)}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    setMenu({ id: cue.id, x: event.clientX, y: event.clientY });
                  }}
                  className={cn(
                    "min-w-0 flex-1 rounded-sm border border-black/50 bg-gradient-to-b from-[#5a4030] to-[#3a281c] px-2 py-2 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] transition hover:brightness-110 active:translate-y-px",
                    recordingId === cue.id && "ring-2 ring-[color:var(--accent-amber)]",
                  )}
                >
                  <div className="truncate font-[family-name:var(--font-display)] text-[12px] font-semibold tracking-wide text-[#f0e6d4] uppercase">
                    {cue.name}
                  </div>
                  <div className="truncate text-[9px] tracking-wide text-[#c4b59a] uppercase">
                    {cue.midiNote !== null
                      ? `Note ${cue.midiNote}`
                      : cue.pad === null
                        ? "No pad"
                        : `Pad ${cue.pad + 1}`}
                    {cue.hotkey ? ` · ${cue.hotkey}` : ""}
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

              <div className="flex justify-center gap-2">
                <LevelMeter
                  rms={cue.rms}
                  peak={cue.peak}
                  className="h-[8.4rem]"
                />
                <VerticalFader
                  value={cue.volume}
                  onChange={(v) => onVolume(cue.id, v)}
                  onDoubleClick={() => onKill(cue.id)}
                  label={`${cue.name} volume`}
                  className="h-[8.4rem]"
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
      {menu
        ? createPortal(
            <PadMenu
              menuRef={menuRef}
              cues={cues}
              cueId={menu.id}
              x={menu.x}
              y={menu.y}
              onPick={(pad) => {
                onPad(menu.id, pad);
                setMenu(null);
              }}
              onLearn={() => {
                onLearnPad(menu.id);
                setMenu(null);
              }}
            />,
            document.body,
          )
        : null}
    </section>
  );
}

const PAD_ROWS = [
  [13, 14, 15, 16],
  [9, 10, 11, 12],
  [5, 6, 7, 8],
  [1, 2, 3, 4],
];

function PadMenu({
  menuRef,
  cues,
  cueId,
  x,
  y,
  onPick,
  onLearn,
}: {
  menuRef: RefObject<HTMLDivElement | null>;
  cues: CuePad[];
  cueId: string;
  x: number;
  y: number;
  onPick: (pad: number | null) => void;
  onLearn: () => void;
}) {
  const cue = cues.find((item) => item.id === cueId);
  const left = Math.max(8, Math.min(x, window.innerWidth - 228));
  const top = Math.max(8, Math.min(y, window.innerHeight - 280));
  return (
    <div
      ref={menuRef}
      className="fixed z-50 w-[212px] rounded-sm border border-black/60 bg-[#1a1d28] p-2 shadow-[0_12px_40px_rgba(0,0,0,0.55)]"
      style={{ left, top }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <p className="mb-1 truncate text-[10px] font-bold tracking-[0.14em] text-[color:var(--console-muted)] uppercase">
        {cue?.name ?? "Cue"} · pad
      </p>
      <button
        type="button"
        className="mb-1.5 h-7 w-full rounded-sm border border-[color:var(--neon-cyan)]/50 text-[10px] font-bold tracking-wide text-[color:var(--neon-cyan)] uppercase hover:bg-[color:var(--neon-cyan)]/10"
        onClick={onLearn}
      >
        Learn from controller
      </button>
      <button
        type="button"
        className={cn(
          "mb-2 h-7 w-full rounded-sm border text-[10px] font-bold tracking-wide uppercase",
          cue?.pad === null && cue?.midiNote === null
            ? "border-[color:var(--neon-cyan)] text-[color:var(--neon-cyan)]"
            : "border-white/10 text-[color:var(--console-ink)] hover:bg-white/5",
        )}
        onClick={() => onPick(null)}
      >
        None
      </button>
      <div className="grid grid-cols-4 gap-1">
        {PAD_ROWS.flat().map((padNumber) => {
          const index = padNumber - 1;
          const owner = cues.find((item) => item.pad === index);
          const mine = owner?.id === cueId;
          return (
            <button
              key={padNumber}
              type="button"
              title={owner && !mine ? `${owner.name} is on this pad` : `Pad ${padNumber}`}
              className={cn(
                "h-9 rounded-sm border text-[11px] font-bold",
                mine
                  ? "border-[color:var(--neon-cyan)] bg-[color:var(--neon-cyan)]/20 text-[color:var(--neon-cyan)]"
                  : owner
                    ? "border-[color:var(--accent-amber)]/50 text-[color:var(--accent-amber)]"
                    : "border-white/10 text-[color:var(--console-ink)] hover:bg-white/5",
              )}
              onClick={() => onPick(index)}
            >
              {padNumber}
            </button>
          );
        })}
      </div>
      <p className="mt-2 text-[9px] leading-tight text-[color:var(--console-muted)]">
        Grid matches MPD226 (pad 1 bottom left). Learn works on any MIDI pad.
      </p>
    </div>
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
