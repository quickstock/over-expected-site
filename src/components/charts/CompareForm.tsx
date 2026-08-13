/**
 * Two players' form on one axis: trailing-window rate per 100 possessions in
 * the active lens's unit, drawn as two lines against the same zero (the
 * league-average pace).
 *
 * This replaces two stacked cumulative arcs, which only re-drew the season
 * totals the table above already states. What the totals cannot show is
 * WHEN each player was good: streaks, slumps, and who was trending where at
 * the end. Identity is carried by line style and a name at each line's end,
 * not by color; color stays reserved for the diverging over/under encoding
 * used everywhere else.
 */
import { useMemo } from "react";
import type { GameLine } from "../../types";
import { rollingRate } from "../../lib/series";
import { divergingText } from "../../lib/color";
import { lastName, signed } from "../../lib/format";
import { useMeasure } from "../../lib/useMeasure";
import { useRevealed } from "../../lib/useRevealed";

export default function CompareForm({
  aName,
  bName,
  aGames,
  bGames,
  window: win,
  height = 240,
  className = "",
}: {
  aName: string;
  bName: string;
  aGames: GameLine[];
  bGames: GameLine[];
  window: number;
  height?: number;
  className?: string;
}) {
  const [wrapRef, width] = useMeasure<HTMLDivElement>();
  const revealed = useRevealed(wrapRef);
  const reduce =
    typeof window !== "undefined" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches;

  const aPts = useMemo(() => rollingRate(aGames, win), [aGames, win]);
  const bPts = useMemo(() => rollingRate(bGames, win), [bGames, win]);

  const narrow = width > 0 && width < 480;
  const pad = { top: 16, right: narrow ? 104 : 140, bottom: 26, left: 8 };
  const innerW = Math.max(40, width - pad.left - pad.right);
  const innerH = height - pad.top - pad.bottom;

  const maxGames = Math.max(aGames.length, bGames.length, 2);
  // Fit the domain to the data but always keep zero (the league pace) in
  // frame: two players who both run hot should fill the height, not float
  // in the top half of a symmetric range they never visit.
  const vals = [...aPts, ...bPts].map((p) => p.per100);
  const rawLo = Math.min(0, ...vals);
  const rawHi = Math.max(0, ...vals);
  const vPad = Math.max(1, (rawHi - rawLo) * 0.1);
  const lo = rawLo - vPad;
  const hi = rawHi + vPad;
  const x = (g: number) => pad.left + ((g - 1) / (maxGames - 1)) * innerW;
  const y = (v: number) => pad.top + ((hi - v) / (hi - lo)) * innerH;
  const mid = y(0);

  if (aPts.length === 0 || bPts.length === 0) {
    return (
      <div
        className={`rounded border border-line-soft bg-wash px-4 py-8 text-center text-sm text-ink-faint ${className}`}
      >
        Not enough games for a {win}-game window for both players.
      </div>
    );
  }

  const path = (pts: { g: number; per100: number }[]) =>
    pts
      .map((p, i) => `${i ? "L" : "M"}${x(p.g).toFixed(1)} ${y(p.per100).toFixed(1)}`)
      .join("");

  const aEnd = aPts[aPts.length - 1];
  const bEnd = bPts[bPts.length - 1];
  // End labels claim the space to the right of each line's endpoint; when the
  // endpoints land close together, the lower one is pushed down clear of the
  // upper so the names never overprint.
  const aLabelY = y(aEnd.per100);
  let bLabelY = y(bEnd.per100);
  if (Math.abs(aLabelY - bLabelY) < 26) {
    if (bLabelY >= aLabelY) bLabelY = aLabelY + 26;
    else bLabelY = aLabelY - 26;
  }

  const sweep: React.CSSProperties = reduce
    ? {}
    : {
        clipPath: revealed
          ? "inset(-5% -2% -5% -2%)"
          : "inset(-5% 102% -5% -2%)",
        transition: "clip-path 900ms var(--ease-out-strong)",
      };

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`Trailing ${win}-game form for both players. ${aName} ends at ${signed(aEnd.per100, 1)} per 100, ${bName} at ${signed(bEnd.per100, 1)}.`}
        >
          {/* league pace */}
          <line
            x1={pad.left}
            x2={pad.left + innerW}
            y1={mid}
            y2={mid}
            stroke="var(--color-line)"
          />
          <text
            x={pad.left}
            y={mid - 6}
            fontSize={10}
            className="font-mono"
            fill="var(--color-ink-faint)"
          >
            league pace
          </text>

          <g style={sweep}>
            <path
              d={path(aPts)}
              fill="none"
              stroke="var(--color-ink)"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            <path
              d={path(bPts)}
              fill="none"
              stroke="var(--color-ink-soft)"
              strokeWidth={2}
              strokeDasharray="5 4"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </g>

          {/* who is who, at each line's own end */}
          {(
            [
              { pts: aPts, end: aEnd, name: aName, ly: aLabelY, dash: false },
              { pts: bPts, end: bEnd, name: bName, ly: bLabelY, dash: true },
            ] as const
          ).map(({ pts, end, name, ly, dash }) => (
            <g key={name}>
              <circle
                cx={x(end.g)}
                cy={y(end.per100)}
                r={3}
                fill={dash ? "var(--color-ink-soft)" : "var(--color-ink)"}
              />
              {Math.abs(ly - y(end.per100)) > 4 && (
                <line
                  x1={x(end.g)}
                  x2={x(pts[pts.length - 1].g) + 8}
                  y1={y(end.per100)}
                  y2={ly}
                  stroke="var(--color-line)"
                />
              )}
              <text
                x={x(end.g) + 11}
                y={ly + 3.5}
                fontSize={narrow ? 10 : 11.5}
                fontWeight={600}
                className="font-display"
                fill="var(--color-ink)"
              >
                {lastName(name)}
              </text>
              <text
                x={x(end.g) + 11}
                y={ly + 17}
                fontSize={10.5}
                className="font-mono tnum"
                fill={divergingText(end.per100)}
              >
                {signed(end.per100, 1)}
              </text>
            </g>
          ))}

          {/* games axis */}
          <text
            x={pad.left}
            y={height - 8}
            fontSize={10}
            className="font-mono"
            fill="var(--color-ink-faint)"
          >
            game {win}
          </text>
          <text
            x={pad.left + innerW}
            y={height - 8}
            textAnchor="end"
            fontSize={10}
            className="font-mono tnum"
            fill="var(--color-ink-faint)"
          >
            {maxGames}
          </text>
        </svg>
      )}
    </div>
  );
}
