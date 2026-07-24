import { useMemo } from "react";
import type { RapmRow } from "../../types";
import { divergingColor } from "../../lib/color";
import { useMeasure } from "../../lib/useMeasure";
import { useRevealed } from "../../lib/useRevealed";

/**
 * Offensive RAPM (x) vs defensive RAPM (y), both in points per 100 over an
 * average player, each centered on zero. Top-right = plus on both ends; dot
 * color is net (o + d), warm = positive. Whiskers show ±1 approximate SE on
 * each axis. Selecting a dot routes to that player.
 */
export default function ODScatter({
  rows,
  variant,
  onSelect,
  height = 460,
}: {
  rows: RapmRow[];
  variant: "prior" | "plain";
  onSelect?: (id: string) => void;
  height?: number;
}) {
  const [wrapRef, width] = useMeasure<HTMLDivElement>();
  const revealed = useRevealed(wrapRef);
  const reduce =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const pts = useMemo(
    () =>
      rows.map((r) => ({
        id: r.id,
        name: r.name,
        x: variant === "prior" ? r.oP : r.o,
        y: variant === "prior" ? r.dP : r.d,
        net: variant === "prior" ? r.netP : r.net,
        seX: r.seO,
        seY: r.seD,
      })),
    [rows, variant],
  );

  const pad = { top: 24, right: 20, bottom: 40, left: 44 };
  const innerW = Math.max(40, width - pad.left - pad.right);
  const innerH = height - pad.top - pad.bottom;
  const maxX = Math.max(2, ...pts.map((p) => Math.abs(p.x))) * 1.12;
  const maxY = Math.max(2, ...pts.map((p) => Math.abs(p.y))) * 1.12;
  const x = (v: number) => pad.left + ((v + maxX) / (2 * maxX)) * innerW;
  const y = (v: number) => pad.top + ((maxY - v) / (2 * maxY)) * innerH;

  const sweep: React.CSSProperties = reduce
    ? {}
    : {
        clipPath: revealed
          ? "inset(-4% -4% -4% -4%)"
          : "inset(-4% 102% -4% -4%)",
        transition: "clip-path 950ms var(--ease-out-strong)",
      };

  // label only the extremes so the field stays legible
  const labeled = useMemo(() => {
    const byNet = [...pts].sort((a, b) => b.net - a.net);
    return new Set([...byNet.slice(0, 6), ...byNet.slice(-4)].map((p) => p.id));
  }, [pts]);

  return (
    <div ref={wrapRef} className="relative">
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`Offensive versus defensive RAPM for ${pts.length} players, both centered on an average player.`}
        >
          <line x1={x(0)} x2={x(0)} y1={pad.top} y2={pad.top + innerH} stroke="var(--color-line)" />
          <line x1={pad.left} x2={pad.left + innerW} y1={y(0)} y2={y(0)} stroke="var(--color-line)" />
          <text x={pad.left + innerW} y={y(0) - 6} textAnchor="end" fontSize={10.5} className="font-mono" fill="var(--color-ink-faint)">
            offense / 100 →
          </text>
          <text x={x(0) + 6} y={pad.top + 2} textAnchor="start" fontSize={10.5} className="font-mono" fill="var(--color-ink-faint)">
            ↑ defense / 100
          </text>
          <g style={sweep}>
            {pts.map((p) => (
              <g
                key={p.id}
                transform={`translate(${x(p.x).toFixed(1)} ${y(p.y).toFixed(1)})`}
                onClick={() => onSelect?.(p.id)}
                style={{ cursor: onSelect ? "pointer" : "default" }}
              >
                <line
                  x1={x(p.x - p.seX) - x(p.x)}
                  x2={x(p.x + p.seX) - x(p.x)}
                  y1={0}
                  y2={0}
                  stroke={divergingColor(p.net)}
                  strokeWidth={1}
                  opacity={0.28}
                />
                <line
                  x1={0}
                  x2={0}
                  y1={y(p.y - p.seY) - y(p.y)}
                  y2={y(p.y + p.seY) - y(p.y)}
                  stroke={divergingColor(p.net)}
                  strokeWidth={1}
                  opacity={0.28}
                />
                <circle cx={0} cy={0} r={4} fill={divergingColor(p.net)} opacity={0.9} />
                {labeled.has(p.id) && (
                  <text x={0} y={-7} textAnchor="middle" fontSize={9.5} className="font-mono" fill="var(--color-ink-soft)">
                    {p.name}
                  </text>
                )}
              </g>
            ))}
          </g>
        </svg>
      )}
    </div>
  );
}
