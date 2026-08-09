/**
 * Every qualified defender in the season placed on the defensive-RAPM axis,
 * with this player pulled out of the field and his own 95% interval drawn to
 * the same scale beneath it.
 *
 * The interval is the point of the figure, not decoration. A percentile alone
 * reads as a verdict; drawn against the league's own spread, the width of that
 * bar shows how many players he is genuinely separated from. Anyone reading
 * "96th percentile" should be able to see, in the same glance, how much of the
 * field that interval still covers.
 */
import { useMemo } from "react";
import type { RapmRow } from "../../types";
import { divergingColor } from "../../lib/color";
import { lastName, signed } from "../../lib/format";
import { useMeasure } from "../../lib/useMeasure";
import { useRevealed } from "../../lib/useRevealed";

const Z = 1.959964;

export default function DefenseSpread({
  rows,
  playerId,
}: {
  /** Qualified players for the season, already filtered to the floor. */
  rows: RapmRow[];
  playerId: string;
}) {
  const [wrapRef, width] = useMeasure<HTMLDivElement>();
  const revealed = useRevealed(wrapRef, 0.2);
  const reduce =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const me = rows.find((r) => r.id === playerId);
  const narrow = width > 0 && width < 560;
  const padL = 14;
  const padR = 14;
  const labelBand = 46;
  const innerW = Math.max(40, width - padL - padR);
  const r = narrow ? 2.6 : 3.1;

  const ci: [number, number] | null = me
    ? [me.dP - Z * me.seD, me.dP + Z * me.seD]
    : null;

  // Domain has to hold both the field and his interval, or a wide interval
  // gets its caps clipped off the edge and reads narrower than it is.
  const { lo, hi } = useMemo(() => {
    const vals = rows.map((x) => x.dP);
    if (vals.length === 0) return { lo: -1, hi: 1 };
    let min = Math.min(...vals);
    let max = Math.max(...vals);
    if (ci) {
      min = Math.min(min, ci[0]);
      max = Math.max(max, ci[1]);
    }
    const pad = Math.max(0.4, (max - min) * 0.06);
    return { lo: min - pad, hi: max + pad };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, ci?.[0], ci?.[1]]);

  const x = (v: number) => padL + ((v - lo) / (hi - lo)) * innerW;
  const swarmY = labelBand + (narrow ? 40 : 46);

  // Collision packing: walk left to right, step away from the centre line
  // whenever a dot would touch the one placed before it.
  const dots = useMemo(() => {
    if (!width) return [] as { row: RapmRow; px: number; py: number }[];
    const gap = 2 * r + 0.7;
    const placed: { row: RapmRow; px: number; py: number }[] = [];
    for (const row of [...rows].sort((a, b) => a.dP - b.dP)) {
      const px = x(row.dP);
      let off = 0;
      for (let k = 0; k < 40; k++) {
        const cand =
          k === 0 ? 0 : (k % 2 === 1 ? 1 : -1) * Math.ceil(k / 2) * gap;
        const clash = placed.some(
          (q) =>
            (q.px - px) ** 2 + (q.py - (swarmY + cand)) ** 2 < gap * gap - 0.01,
        );
        if (!clash) {
          off = cand;
          break;
        }
      }
      placed.push({ row, px, py: swarmY + off });
    }
    return placed;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, width, lo, hi]);

  // The swarm's depth is data-dependent (a dense mode stacks far deeper than
  // the tails), so the axis and the ruler are placed below whatever it
  // actually occupies rather than at a guessed offset that a busy season
  // would collide with.
  const swarmBottom = dots.length
    ? Math.max(...dots.map((d) => d.py)) + r
    : swarmY;
  const axisY = Math.max(swarmBottom + 18, swarmY + 34);
  const rulerY = axisY + 44;
  const height = rulerY + 30;

  if (rows.length === 0 || !me || !ci) return null;

  // How much of the field his interval still covers: the honest counterweight
  // to a percentile, quoted in the caption below the chart.
  const overlapped = rows.filter(
    (q) => q.id !== me.id && q.dP >= ci[0] && q.dP <= ci[1],
  ).length;

  const ticks = (() => {
    const step = hi - lo > 8 ? 2 : 1;
    const first = Math.ceil(lo / step) * step;
    const out: number[] = [];
    for (let t = first; t < hi; t += step) out.push(t);
    return out;
  })();

  const sweep: React.CSSProperties = reduce
    ? {}
    : {
        clipPath: revealed
          ? "inset(-8% -3% -8% -3%)"
          : "inset(-8% 102% -8% -3%)",
        transition: "clip-path 900ms var(--ease-out-strong)",
      };

  return (
    <div ref={wrapRef} className="relative">
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`Defensive RAPM for ${rows.length} qualified players. ${
            me.name
          } is at ${signed(me.dP, 1)} per 100, with a 95% interval from ${signed(
            ci[0],
            1,
          )} to ${signed(ci[1], 1)} that still covers ${overlapped} other players.`}
        >
          {/* the field */}
          <g style={sweep}>
            {dots.map((d) => (
              <circle
                key={d.row.id}
                cx={d.px}
                cy={d.py}
                r={r}
                fill={divergingColor(d.row.dP)}
                opacity={d.row.id === me.id ? 0 : 0.42}
              />
            ))}
          </g>

          {/* axis */}
          <line
            x1={padL}
            x2={padL + innerW}
            y1={axisY}
            y2={axisY}
            stroke="var(--color-line)"
          />
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={x(t)}
                x2={x(t)}
                y1={axisY - 4}
                y2={axisY + 4}
                stroke="var(--color-line)"
              />
              <text
                x={x(t)}
                y={axisY + 18}
                textAnchor="middle"
                fontSize={10.5}
                className="font-mono tnum"
                fill="var(--color-ink-faint)"
              >
                {signed(t, 0)}
              </text>
            </g>
          ))}
          <text
            x={padL + innerW}
            y={axisY - 8}
            textAnchor="end"
            fontSize={10.5}
            className="font-mono"
            fill="var(--color-ink-faint)"
          >
            better defence →
          </text>

          {/* him */}
          <line
            x1={x(me.dP)}
            x2={x(me.dP)}
            y1={labelBand - 10}
            y2={swarmY - r - 3}
            stroke="var(--color-line)"
          />
          <circle
            cx={x(me.dP)}
            cy={swarmY}
            r={r + 2.6}
            fill={divergingColor(me.dP)}
            stroke="var(--color-ink)"
            strokeWidth={1.75}
          />
          {/* anchored away from whichever edge the name would run off */}
          {(() => {
            const hx = x(me.dP);
            const anchor =
              hx > padL + innerW - 70
                ? "end"
                : hx < padL + 70
                  ? "start"
                  : "middle";
            const tx = anchor === "end" ? hx + 6 : anchor === "start" ? hx - 6 : hx;
            return (
              <>
                <text
                  x={tx}
                  y={18}
                  textAnchor={anchor}
                  fontSize={12.5}
                  fontWeight={600}
                  className="font-display"
                  fill="var(--color-ink)"
                >
                  {lastName(me.name)}
                </text>
                <text
                  x={tx}
                  y={33}
                  textAnchor={anchor}
                  fontSize={11}
                  className="font-mono tnum"
                  fill="var(--color-ink-soft)"
                >
                  {signed(me.dP, 1)}
                </text>
              </>
            );
          })()}

          {/* his interval, to the same scale as the field above */}
          <line
            x1={x(ci[0])}
            x2={x(ci[1])}
            y1={rulerY}
            y2={rulerY}
            stroke="var(--color-ink-soft)"
            strokeWidth={2}
            strokeLinecap="round"
          />
          {[ci[0], ci[1]].map((v) => (
            <line
              key={v}
              x1={x(v)}
              x2={x(v)}
              y1={rulerY - 5}
              y2={rulerY + 5}
              stroke="var(--color-ink-soft)"
              strokeWidth={1.5}
            />
          ))}
          <circle cx={x(me.dP)} cy={rulerY} r={3} fill="var(--color-ink-soft)" />
          {(() => {
            // Centred under the bar, but pulled inside whichever edge it
            // would otherwise run past.
            const cx = (x(ci[0]) + x(ci[1])) / 2;
            const anchor =
              cx > padL + innerW - 90
                ? "end"
                : cx < padL + 90
                  ? "start"
                  : "middle";
            return (
              <text
                x={anchor === "end" ? padL + innerW : anchor === "start" ? padL : cx}
                y={rulerY + 19}
                textAnchor={anchor}
                fontSize={10.5}
                className="font-mono"
                fill="var(--color-ink-soft)"
              >
                his 95% interval, same scale
              </text>
            );
          })()}
        </svg>
      )}
    </div>
  );
}
