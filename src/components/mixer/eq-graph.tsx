import { eqResponsePath, type EqBand } from "@/lib/eq-bands";

type EqGraphProps = {
  bands: EqBand[];
  className?: string;
};

export function EqGraph({ bands, className }: EqGraphProps) {
  const width = 160;
  const height = 72;
  const path = eqResponsePath(bands, width, height);
  const midY = height / 2;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      role="img"
      aria-label="EQ frequency response"
    >
      <rect width={width} height={height} fill="var(--meter-well)" rx="4" />
      <line
        x1="0"
        x2={width}
        y1={midY}
        y2={midY}
        stroke="var(--console-edge)"
        strokeWidth="1"
        strokeDasharray="3 3"
      />
      <path d={path} fill="none" stroke="var(--meter-green)" strokeWidth="2" />
    </svg>
  );
}
