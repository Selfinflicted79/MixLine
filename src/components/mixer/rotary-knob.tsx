import { useEffect, useRef } from "react";
import { cn } from "cn";

type RotaryKnobProps = {
  value: number;
  onChange: (value: number) => void;
  label: string;
  display: string;
  accent?: "cyan" | "orange" | "green" | "magenta";
  className?: string;
  compact?: boolean;
};

const arc = {
  cyan: "#4de8ff",
  orange: "#ffb020",
  green: "#5fd36a",
  magenta: "#ff4fd8",
};

/** Rack knob. Drag up/down, or scroll for a small step. */
export function RotaryKnob({
  value,
  onChange,
  label,
  display,
  accent = "cyan",
  className,
  compact = false,
}: RotaryKnobProps) {
  const drag = useRef<{ y: number; value: number } | null>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const latest = useRef(onChange);
  const valueRef = useRef(value);
  latest.current = onChange;
  valueRef.current = value;

  useEffect(() => {
    const el = knobRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      const step = Math.max(-0.03, Math.min(0.03, -dy / 5000));
      if (step === 0) return;
      const next = Math.min(1, Math.max(0, valueRef.current + step));
      valueRef.current = next;
      latest.current(next);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);
  const angle = -135 + Math.min(1, Math.max(0, value)) * 270;
  const color = arc[accent];

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const current = drag.current;
      if (!current) return;
      const next = current.value + (current.y - e.clientY) / 110;
      latest.current(Math.min(1, Math.max(0, next)));
    };
    const up = () => {
      drag.current = null;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, []);

  return (
    <div className={cn("flex flex-col items-center", compact ? "w-11 gap-0.5" : "w-12 gap-1", className)}>
      <div
        role="slider"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(value * 100)}
        tabIndex={0}
        ref={knobRef}
        className={cn(
          "relative grid cursor-ns-resize place-items-center rounded-full touch-none",
          compact ? "size-7" : "size-9",
        )}
        style={{
          background:
            "radial-gradient(circle at 35% 30%, #3a4258 0%, #1a1e2b 46%, #0c0e16 78%)",
          boxShadow: `inset 0 1px 0 rgba(255,255,255,0.22), inset 0 -2px 3px rgba(0,0,0,0.65), 0 0 0 1px rgba(0,0,0,0.8), 0 0 10px ${color}33`,
        }}
        onPointerDown={(e) => {
          e.preventDefault();
          drag.current = { y: e.clientY, value };
        }}
        onKeyDown={(e) => {
          if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
          e.preventDefault();
          const dir = e.key === "ArrowUp" ? 1 : -1;
          latest.current(Math.min(1, Math.max(0, valueRef.current + dir * 0.02)));
        }}
      >
        <span
          className="absolute size-1 rounded-full"
          style={{
            background: color,
            boxShadow: `0 0 6px ${color}`,
            transform: `rotate(${angle}deg) translateY(${compact ? "-9px" : "-11px"})`,
          }}
        />
        <span className="size-2 rounded-full bg-[#07080d] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.15)]" />
      </div>
      <span className="text-[8px] font-bold tracking-[0.12em] text-[color:var(--console-muted)] uppercase">
        {label}
      </span>
      <span className="font-mono text-[9px] text-[color:var(--console-ink)]">{display}</span>
    </div>
  );
}
