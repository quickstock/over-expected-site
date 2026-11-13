import type { TeamRow } from "../../types";
import { divergingColor } from "../../lib/color";
import { useMeasure } from "../../lib/useMeasure";
import { useRevealed } from "../../lib/useRevealed";

/**
 * Offense (x) vs defense (y) for one metric, each centered on the league
 * average. Top-right = above the league on both ends; dot color is the net
 * (offense minus defense), warm = nets out positive. On first view the teams
 * slide out from the league average; they ease between positions/colors when
 * the lens or season changes.
 */
export default function TeamScatter({
  teams,
  off,
  def,
  xAxis,
  defLabel,
  height = 380,
  highlight = null,
  onHover,
}: {
  teams: TeamRow[];
  off: (t: TeamRow) => number | undefined;
  def: (t: TeamRow) => number | undefined;
  xAxis: string;
  defLabel: string;
  height?: number;
  /** A team to light up, and a hover callback, when a list sits beside it. */
  highlight?: string | null;
  onHover?: (team: string | null) => void;
}) {
  const [wrapRef, width] = useMeasure<HTMLDivElement>();
  const revealed = useRevealed(wrapRef);

  const pts = teams
    .map((t) => ({ team: t.team, x: off(t), y: def(t) }))
    .filter((p): p is { team: string; x: number; y: number } =>
      p.x !== undefined && p.y !== undefined);

  const pad = { top: 22, right: 18, bottom: 34, left: 18 };
  const innerW = Math.max(40, width - pad.left - pad.right);
  const innerH = height - pad.top - pad.bottom;
  const maxX = Math.max(0.5, ...pts.map((p) => Math.abs(p.x))) * 1.12;
  const maxY = Math.max(0.5, ...pts.map((p) => Math.abs(p.y))) * 1.12;
  const x = (v: number) => pad.left + ((v + maxX) / (2 * maxX)) * innerW;
  // y inverted so "concedes more" is up.
  const y = (v: number) => pad.top + ((maxY - v) / (2 * maxY)) * innerH;

  // Until the chart scrolls into view every team waits, unseen, on the
  // league-average crossing; on reveal they slide out to where they stand,
  // the teams nearest average first.
  const reach = Math.hypot(innerW, innerH) / 2;

  return (
    <div ref={wrapRef} className="relative">
      {width > 0 && (
        <svg width={width} height={height} role="img"
          aria-label={`Team offense versus defense, ${pts.length} teams, both centered on the league average.`}>
          <line x1={x(0)} x2={x(0)} y1={pad.top} y2={pad.top + innerH} stroke="var(--color-line)" />
          <line x1={pad.left} x2={pad.left + innerW} y1={y(0)} y2={y(0)} stroke="var(--color-line)" />
          <text x={pad.left + innerW} y={y(0) - 6} textAnchor="end" fontSize={10.5}
            className="font-mono" fill="var(--color-ink-faint)">
            {xAxis}
          </text>
          <text x={x(0) + 6} y={pad.top + 4} textAnchor="start" fontSize={10.5}
            className="font-mono" fill="var(--color-ink-faint)">
            ↑ {defLabel.toLowerCase()} more
          </text>
          <g>
            {pts.map((p) => {
              const net = p.x - p.y;
              const px = x(p.x);
              const py = y(p.y);
              const delay = (Math.hypot(px - x(0), py - y(0)) / reach) * 280;
              return (
                <g
                  key={p.team}
                  style={{
                    transform: revealed
                      ? `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px)`
                      : `translate(${x(0).toFixed(1)}px, ${y(0).toFixed(1)}px)`,
                    opacity: revealed ? 1 : 0,
                    transition: `transform 720ms var(--ease-out-strong) ${delay.toFixed(0)}ms, opacity 300ms ease ${delay.toFixed(0)}ms`,
                  }}
                >
                  <circle cx={0} cy={0} r={highlight === p.team ? 6.5 : 4.5} opacity={0.9}
                    stroke={highlight === p.team ? "var(--color-ink)" : "none"} strokeWidth={1.25}
                    onPointerEnter={onHover && (() => onHover(p.team))}
                    onPointerLeave={onHover && (() => onHover(null))}
                    style={{ fill: divergingColor(net), transition: "fill 360ms ease, r 150ms ease" }} />
                  <text x={0} y={-8} textAnchor="middle" fontSize={9.5}
                    fontWeight={highlight === p.team ? 600 : 400}
                    className="font-mono" fill={highlight === p.team ? "var(--color-ink)" : "var(--color-ink-soft)"}>
                    {p.team}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      )}
    </div>
  );
}
