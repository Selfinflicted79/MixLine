import { useRef, useState } from "react";
import { GripVertical, Pause, Play, Plus, SkipBack, SkipForward, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PlayerTrack } from "@/lib/audio-engine";
import { cn } from "cn";

const REORDER_MIME = "application/x-mixline-playlist";

type MediaPlayerProps = {
  tracks: PlayerTrack[];
  index: number;
  playing: boolean;
  onAdd: (files: File[]) => void;
  onRemove: (id: string) => void;
  onReorder: (id: string, toIndex: number) => void;
  onPlay: (index?: number) => void;
  onPause: () => void;
  onNext: () => void;
  onPrev: () => void;
};

function takeAudioFiles(list: FileList | File[] | null | undefined) {
  return Array.from(list ?? []).filter((file) => {
    if (file.type.startsWith("audio/")) return true;
    return /\.(mp3|wav|flac|ogg|m4a|aac|aiff|wma)$/i.test(file.name);
  });
}

export function MediaPlayer({
  tracks,
  index,
  playing,
  onAdd,
  onRemove,
  onReorder,
  onPlay,
  onPause,
  onNext,
  onPrev,
}: MediaPlayerProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const current = tracks[index];

  function addFromPicker(list: FileList | null) {
    // Copy first — clearing the input empties a live FileList.
    const files = takeAudioFiles(list);
    if (fileRef.current) fileRef.current.value = "";
    if (files.length) onAdd(files);
  }

  function dropTargetIndex(trackIndex: number, clientY: number, el: HTMLElement) {
    const rect = el.getBoundingClientRect();
    const before = clientY < rect.top + rect.height / 2;
    return before ? trackIndex : trackIndex + 1;
  }

  return (
    <div
      className={cn(
        "flex h-full min-h-0 w-full flex-col gap-2 rounded-sm border bg-[linear-gradient(180deg,#1c2030,#12151f)] p-2.5",
        dragOver
          ? "border-[color:var(--neon-magenta)] shadow-[0_0_18px_rgba(255,79,216,0.25)]"
          : "border-black/50",
      )}
      onDragEnter={(event) => {
        if (event.dataTransfer.types.includes(REORDER_MIME)) return;
        event.preventDefault();
        setDragOver(true);
      }}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes(REORDER_MIME)) return;
        event.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node)) return;
        setDragOver(false);
      }}
      onDrop={(event) => {
        if (event.dataTransfer.getData(REORDER_MIME)) return;
        event.preventDefault();
        setDragOver(false);
        const files = takeAudioFiles(event.dataTransfer.files);
        if (files.length) onAdd(files);
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-bold tracking-[0.16em] text-[color:var(--neon-magenta)] uppercase">
            Player
          </p>
          <p className="truncate font-[family-name:var(--font-display)] text-sm text-[color:var(--console-ink)]">
            {current?.name ?? "Add songs to the playlist"}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 border-white/15 bg-[color:var(--chip)] px-2 text-[color:var(--console-ink)]"
          onClick={() => fileRef.current?.click()}
        >
          <Plus className="size-3.5" />
          Add
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="audio/*,.mp3,.wav,.flac,.ogg,.m4a,.aac"
          multiple
          className="hidden"
          onChange={(event) => addFromPicker(event.target.files)}
        />
      </div>

      <div className="flex items-center justify-center gap-2">
        <button
          type="button"
          className="rounded-sm border border-white/10 bg-black/25 p-2 text-[color:var(--console-ink)] hover:bg-white/5"
          onClick={onPrev}
          disabled={!tracks.length}
        >
          <SkipBack className="size-4" />
        </button>
        <button
          type="button"
          className="rounded-sm border border-[color:var(--neon-magenta)]/40 bg-[linear-gradient(135deg,#ff4fd8,#9b6bff)] p-2.5 text-[#120814]"
          onClick={() => (playing ? onPause() : onPlay())}
          disabled={!tracks.length}
        >
          {playing ? <Pause className="size-5" /> : <Play className="size-5" />}
        </button>
        <button
          type="button"
          className="rounded-sm border border-white/10 bg-black/25 p-2 text-[color:var(--console-ink)] hover:bg-white/5"
          onClick={onNext}
          disabled={!tracks.length}
        >
          <SkipForward className="size-4" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto rounded-sm border border-black/40 bg-black/25">
        {tracks.length === 0 ? (
          <p className="p-3 text-center text-[11px] text-[color:var(--console-muted)]">
            {dragOver
              ? "Drop songs here"
              : "Add or drop audio files — drag to reorder. MIX = stream send, MON = your headset (use this instead of capturing Media Player)."}
          </p>
        ) : (
          <ul className="divide-y divide-white/5">
            {tracks.map((track, trackIndex) => (
              <li
                key={track.id}
                draggable
                className={cn(
                  "flex items-center gap-0.5 px-1 py-1",
                  dragId === track.id && "opacity-45",
                  dropIndex === trackIndex && "border-t border-[color:var(--neon-magenta)]",
                  dropIndex === tracks.length &&
                    trackIndex === tracks.length - 1 &&
                    "border-b border-[color:var(--neon-magenta)]",
                )}
                onDragStart={(event) => {
                  event.dataTransfer.setData(REORDER_MIME, track.id);
                  event.dataTransfer.effectAllowed = "move";
                  setDragId(track.id);
                  setDropIndex(trackIndex);
                }}
                onDragEnd={() => {
                  setDragId(null);
                  setDropIndex(null);
                }}
                onDragOver={(event) => {
                  if (!event.dataTransfer.types.includes(REORDER_MIME)) return;
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                  setDropIndex(dropTargetIndex(trackIndex, event.clientY, event.currentTarget));
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const id = event.dataTransfer.getData(REORDER_MIME) || dragId;
                  const target =
                    dropIndex ?? dropTargetIndex(trackIndex, event.clientY, event.currentTarget);
                  setDragId(null);
                  setDropIndex(null);
                  if (!id) return;
                  const from = tracks.findIndex((item) => item.id === id);
                  if (from < 0) return;
                  let to = target;
                  if (from < to) to -= 1;
                  if (to === from) return;
                  onReorder(id, to);
                }}
              >
                <span
                  className="cursor-grab touch-none px-0.5 text-[color:var(--console-muted)] active:cursor-grabbing"
                  title="Drag to reorder"
                  aria-hidden
                >
                  <GripVertical className="size-3.5" />
                </span>
                <button
                  type="button"
                  className={cn(
                    "min-w-0 flex-1 truncate px-1 py-1 text-left text-[11px]",
                    trackIndex === index
                      ? "font-semibold text-[color:var(--neon-magenta)]"
                      : "text-[color:var(--console-ink)] hover:bg-white/5",
                  )}
                  onClick={() => onPlay(trackIndex)}
                  onDoubleClick={() => onPlay(trackIndex)}
                >
                  {trackIndex + 1}. {track.name}
                </button>
                <button
                  type="button"
                  className="rounded p-1 text-[color:var(--console-muted)] hover:text-[color:var(--meter-red)]"
                  onClick={() => onRemove(track.id)}
                  aria-label={`Remove ${track.name}`}
                >
                  <Trash2 className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
