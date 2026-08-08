import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { ShotValueRow } from "../../types";
import { divergingColor, divergingText } from "../../lib/color";
import { lastName, signed } from "../../lib/format";
import { useMeasure } from "../../lib/useMeasure";
import { useRevealed } from "../../lib/useRevealed";
import type { League } from "../../leagues";

/**
 * What the shots a player took were worth (x) against what he actually shot
 * (y), one dot per qualified player, on a shared percentage scale with the 45°
 * line drawn.
 *
 * The whole argument of the site is the geometry here. Movement *along* the
 * diagonal is the shot menu: a rim-runner sits top-right, a pull-up shooter
 * bottom-left, and neither position says anything about how well either of them
 * shot. The only part that is the player is the vertical distance from the
 * line (shot minus worth), which is small next to the length of the band. So
 * the cloud riding the diagonal is the finding, and the dot colour (that same
 * distance, in the site's diverging encoding) is the residual left over once
 * you account for it.
 *
 * Deliberately not a rank chart. Ranks would compress the thing worth seeing,
 * which is that the band is long and thin.
 */
export default function ExpectedVsActual({
  rows,
  league,
  season,
  height = 400,
}: {
  rows: ShotValueRow[];
  league: League;
  season: string;
  height?: number;
}) {
  const [wrapRef, width] = useMeasure<HTMLDivElement>();
  const revealed = useRevealed(wrapRef, 0.15);
  const [hover, setHover] = useState<string | null>(null);
  const navigate = useNavigate();
  const reduce =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const narrow = width > 0 && width < 560;
  const pad = { top: 18, right: 16, bottom: 42, left: 46 };
  // Both axes carry the same unit, so the plot area has to be square or the
  // y = x line renders at some other angle and the eye reads a slope that is
  // not there. The square is centred in whatever width the section has.
  const side = Math.max(
    40,
    Math.min(width - pad.left - pad.right, height - pad.top - pad.bottom),
  );
  const innerW = side;
  const innerH = side;
  const originX = pad.left;

  // One shared domain for both axes: the diagonal is only meaningful, and only
  // renders at 45°, when a percentage point is the same length on each.
  const { lo, hi } = useMemo(() => {
    const vals = rows.flatMap((r) => [r.fgPct, r.xfgPct]);
    if (vals.length === 0) return { lo: 0, hi: 1 };
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const padding = Math.max(2, (max - min) * 0.06);
    return { lo: min - padding, hi: max + padding };
  }, [rows]);

  const x = (v: number) => originX + ((v - lo) / (hi - lo)) * innerW;
  const y = (v: number) => pad.top + ((hi - v) / (hi - lo)) * innerH;
  const r = narrow ? 2.8 : 3.4;

  // Ticks on a round step, so the reader can measure the band by eye.
  const ticks = useMemo(() => {
    const step = hi - lo > 30 ? 10 : 5;
    const first = Math.ceil(lo / step) * step;
    const out: number[] = [];
    for (let t = first; t < hi; t += step) out.push(t);
    return out;
  }, [lo, hi]);

  // Call out the two extremes of the residual, which are the two ends of the
  // argument: same ladder position, opposite reasons.
  const called = useMemo(() => {
    if (rows.length < 8) return [];
    const byOE = [...rows].sort((a, b) => a.makeOE - b.makeOE);
    return [byOE[0], byOE[byOE.length - 1]];
  }, [rows]);

  const sweep: React.CSSProperties = reduce
    ? {}
    : {
        clipPath: revealed
          ? "inset(-6% -6% -6% -6%)"
          : "inset(-6% 102% -6% -6%)",
        transition: "clip-path 900ms var(--ease-out-strong)",
      };

  if (rows.length === 0) return null;

  return (
    <div ref={wrapRef} className="relative">
      {width > 0 && (
        <svg
          width={originX + innerW + pad.right}
          height={height}
          role="img"
          aria-label={`Expected field-goal percentage (x) against actual (y), one dot per qualified player in ${season}. The cloud follows the 45-degree line, so most of a player's shooting percentage is the difficulty of the shots he takes.`}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={x(t)}
                x2={x(t)}
                y1={pad.top}
                y2={pad.top + innerH}
                stroke="var(--color-line-soft)"
              />
              <line
                x1={originX}
                x2={originX + innerW}
                y1={y(t)}
                y2={y(t)}
                stroke="var(--color-line-soft)"
              />
              <text
                x={x(t)}
                y={height - pad.bottom + 15}
                textAnchor="middle"
                fontSize={10}
                className="font-mono tnum"
                fill="var(--color-ink-faint)"
              >
                {t}
              </text>
              <text
                x={originX - 7}
                y={y(t) + 3.5}
                textAnchor="end"
                fontSize={10}
                className="font-mono tnum"
                fill="var(--color-ink-faint)"
              >
                {t}
              </text>
            </g>
          ))}

          {/* the line where a player shot exactly what his looks were worth */}
          <line
            x1={x(lo)}
            y1={y(lo)}
            x2={x(hi)}
            y2={y(hi)}
            stroke="var(--color-ink-faint)"
            strokeWidth={1.25}
            strokeDasharray="4 3"
          />
          {/* the label sits above the line's top end, the one corner of the
              square no player reaches */}
          <text
            x={x(hi) - 4}
            y={y(hi) - 7}
            textAnchor="end"
            fontSize={10.5}
            className="font-mono"
            fill="var(--color-ink-faint)"
          >
            {narrow ? "shot what the looks were worth" : "shot exactly what the looks were worth"}
          </text>

          <g style={sweep}>
            {rows.map((p) => {
              const on = hover === p.id;
              return (
                <circle
                  key={p.id}
                  cx={x(p.xfgPct)}
                  cy={y(p.fgPct)}
                  r={on ? r + 1.8 : r}
                  fill={divergingColor(p.makeOE)}
                  opacity={0.85}
                  stroke={on ? "var(--color-ink)" : "none"}
                  strokeWidth={1}
                  className="cursor-pointer transition-[r] duration-150"
                  onPointerEnter={() => setHover(p.id)}
                  onPointerLeave={() => setHover(null)}
                  onClick={() =>
                    navigate(
                      `/player/${league}/${p.id}?season=${encodeURIComponent(season)}&lens=making`,
                    )
                  }
                />
              );
            })}
          </g>

          {/* the two extremes, with the drop to the line they beat or missed */}
          {called.map((p) => {
            const px = x(p.xfgPct);
            const py = y(p.fgPct);
            const above = p.makeOE > 0;
            return (
              <g key={`call-${p.id}`} className="pointer-events-none">
                <line
                  x1={px}
                  y1={py}
                  x2={px}
                  y2={y(p.xfgPct)}
                  stroke={divergingText(p.makeOE)}
                  strokeWidth={1.25}
                />
                <text
                  x={px + (above ? -7 : 7)}
                  y={py + (above ? -13 : 17)}
                  textAnchor={above ? "end" : "start"}
                  fontSize={11}
                  fontWeight={600}
                  className="font-display"
                  fill="var(--color-ink)"
                >
                  {lastName(p.name)}
                </text>
                <text
                  x={px + (above ? -7 : 7)}
                  y={py + (above ? -1 : 29)}
                  textAnchor={above ? "end" : "start"}
                  fontSize={10}
                  className="font-mono tnum"
                  fill={divergingText(p.makeOE)}
                >
                  {signed(p.makeOE, 1)}
                </text>
              </g>
            );
          })}

          <text
            x={originX + innerW}
            y={height - 6}
            textAnchor="end"
            fontSize={10.5}
            className="font-mono"
            fill="var(--color-ink-faint)"
          >
            what the looks were worth →
          </text>
          <text
            x={-(pad.top + innerH / 2)}
            y={12}
            transform="rotate(-90)"
            textAnchor="middle"
            fontSize={10.5}
            className="font-mono"
            fill="var(--color-ink-faint)"
          >
            what he shot, FG% ↑
          </text>
        </svg>
      )}

      {hover && (() => {
        const p = rows.find((q) => q.id === hover);
        if (!p) return null;
        const px = x(p.xfgPct);
        const py = y(p.fgPct);
        return (
          <div
            className="pointer-events-none absolute z-10 whitespace-nowrap rounded border border-line bg-paper px-2.5 py-1.5 text-[11px] leading-snug shadow-sm"
            style={{
              left: Math.min(Math.max(px - 70, 0), Math.max(0, width - 170)),
              top: Math.max(0, py - 58),
            }}
          >
            <div className="font-display font-semibold text-ink">{p.name}</div>
            <div className="font-mono tnum text-ink-soft">
              {p.fgPct.toFixed(1)}% shot, {p.xfgPct.toFixed(1)}% expected
            </div>
            <div
              className="font-mono tnum"
              style={{ color: divergingText(p.makeOE) }}
            >
              {signed(p.makeOE, 1)} shot-making
            </div>
          </div>
        );
      })()}
    </div>
  );
}
