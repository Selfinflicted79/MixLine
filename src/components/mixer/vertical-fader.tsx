import { useEffect, useRef, useState } from "react";
import { cn } from "cn";

type VerticalFaderProps = {
  value: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  label?: string;
  className?: string;
  /** Accent glow on the cap — PreSonus orange / X32 cyan vibes */
  accent?: "cyan" | "orange" | "green" | "red";
};

const accents = {
  cyan: {
    fill: "linear-gradient(to top, #0f4a66, #2f9fc9 50%, #7ad4f5)",
    glow: "0 0 12px rgba(61, 183, 230, 0.85)",
    capBody: "linear-gradient(180deg, #6fd0f2 0%, #2b94bf 38%, #1a6f96 62%, #0f4a66 100%)",
    ridge: "rgba(200, 240, 255, 0.55)",
  },
  orange: {
    fill: "linear-gradient(to top, #6a3408, #d88828 50%, #ffc878)",
    glow: "0 0 12px rgba(232, 154, 58, 0.85)",
    capBody: "linear-gradient(180deg, #ffc070 0%, #e09030 38%, #b86818 62%, #6a3408 100%)",
    ridge: "rgba(255, 230, 190, 0.6)",
  },
  green: {
    fill: "linear-gradient(to top, #145028, #3fbf5c 50%, #9ef0b0)",
    glow: "0 0 12px rgba(79, 211, 106, 0.8)",
    capBody: "linear-gradient(180deg, #7ae894 0%, #3fbf5c 38%, #268a40 62%, #145028 100%)",
    ridge: "rgba(200, 255, 210, 0.55)",
  },
  red: {
    fill: "linear-gradient(to top, #5a1410, #d04030 50%, #ff9a90)",
    glow: "0 0 12px rgba(226, 75, 59, 0.8)",
    capBody: "linear-gradient(180deg, #ff8a7c 0%, #d04030 38%, #9a2418 62%, #5a1410 100%)",
    ridge: "rgba(255, 210, 200, 0.55)",
  },
};

export function VerticalFader({
  value,
  onChange,
  disabled,
  label = "Volume",
  className,
  accent = "cyan",
}: VerticalFaderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const [active, setActive] = useState(false);
  const theme = accents[accent];

  useEffect(() => {
    const onMove = (clientY: number) => {
      const el = trackRef.current;
      if (!el || disabled) return;
      const rect = el.getBoundingClientRect();
      const ratio = 1 - (clientY - rect.top) / rect.height;
      onChange(Math.min(1, Math.max(0, ratio)));
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!dragging.current) return;
      onMove(e.clientY);
    };
    const onPointerUp = () => {
      dragging.current = false;
      setActive(false);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [disabled, onChange]);

  const pct = value * 100;

  return (
    <div className={cn("flex h-52 w-12 flex-col items-center gap-1", className)}>
      <div className="relative h-full w-full">
        {/* X32-style dB scale */}
        <div className="pointer-events-none absolute inset-y-1 left-0 flex w-3 flex-col justify-between text-[7px] leading-none font-bold text-white/35">
          <span>10</span>
          <span>5</span>
          <span>0</span>
          <span>5</span>
          <span>10</span>
          <span>20</span>
          <span>30</span>
          <span>∞</span>
        </div>

        <div
          ref={trackRef}
          role="slider"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(pct)}
          tabIndex={disabled ? -1 : 0}
          className={cn(
            "absolute top-0 right-1 bottom-0 left-3.5 cursor-ns-resize touch-none rounded-[2px] border border-black outline-none",
            "bg-[linear-gradient(90deg,#050607_0%,#181a1e_40%,#0a0b0d_100%)]",
            "shadow-[inset_1px_0_0_rgba(255,255,255,0.07),inset_-1px_0_0_rgba(0,0,0,0.75),inset_0_0_6px_rgba(0,0,0,0.55)]",
            disabled && "cursor-not-allowed opacity-50",
            active && "ring-2 ring-white/25",
          )}
          onPointerDown={(e) => {
            if (disabled) return;
            e.preventDefault();
            dragging.current = true;
            setActive(true);
            const rect = trackRef.current!.getBoundingClientRect();
            const ratio = 1 - (e.clientY - rect.top) / rect.height;
            onChange(Math.min(1, Math.max(0, ratio)));
          }}
          onKeyDown={(e) => {
            if (disabled) return;
            const step = e.shiftKey ? 0.1 : 0.02;
            if (e.key === "ArrowUp" || e.key === "ArrowRight") {
              e.preventDefault();
              onChange(Math.min(1, value + step));
            } else if (e.key === "ArrowDown" || e.key === "ArrowLeft") {
              e.preventDefault();
              onChange(Math.max(0, value - step));
            } else if (e.key === "Home") {
              e.preventDefault();
              onChange(1);
            } else if (e.key === "End") {
              e.preventDefault();
              onChange(0);
            }
          }}
        >
          {/* Tick marks across the slot */}
          <div className="pointer-events-none absolute inset-y-1 left-0 w-full">
            {Array.from({ length: 11 }, (_, i) => (
              <div
                key={i}
                className="absolute right-0 h-px"
                style={{
                  top: `${i * 10}%`,
                  width: i === 0 || i === 5 || i === 10 ? "100%" : "60%",
                  background:
                    i === 5
                      ? "rgba(255, 210, 120, 0.55)"
                      : "rgba(255, 255, 255, 0.22)",
                }}
              />
            ))}
          </div>

          {/* Travel fill under the cap */}
          <div
            className="absolute inset-x-[2px] bottom-[2px] rounded-[1px] opacity-95"
            style={{ height: `calc(${pct}% - 3px)`, background: theme.fill }}
          />

          {/* PreSonus × X32 lit fader cap */}
          <div
            className="absolute left-1/2 z-10 flex h-9 w-10 -translate-x-1/2 flex-col items-center justify-center rounded-[3px] border border-black/90"
            style={{
              bottom: `calc(${pct}% - 16px)`,
              background: theme.capBody,
              boxShadow: `${theme.glow}, inset 0 1px 0 rgba(255,255,255,0.45), inset 0 -2px 0 rgba(0,0,0,0.35), 0 2px 3px rgba(0,0,0,0.55)`,
            }}
          >
            {/* Finger ridges */}
            {[0, 1, 2, 3].map((n) => (
              <div
                key={n}
                className="my-[1.5px] h-[1.5px] w-7 rounded-full"
                style={{
                  background: `linear-gradient(90deg, transparent, ${theme.ridge}, transparent)`,
                  opacity: 0.9,
                }}
              />
            ))}
            {/* Center spine like an X32 fader */}
            <div className="absolute inset-y-1.5 left-1/2 w-[2px] -translate-x-1/2 rounded-full bg-black/45" />
          </div>
        </div>
      </div>
    </div>
  );
}
