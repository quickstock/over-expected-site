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
 *
 * With `playerBId` set (the compare page) a second player is lifted out the
 * same way: two label rows, a letter chip in each hero dot, and two interval
 * rulers stacked on one scale, so whether the bars overlap each other is
 * readable at a glance.
 */
import { useMemo } from "react";
import type { RapmRow } from "../../types";
import { divergingColor } from "../../lib/color";
import { lastName, signed } from "../../lib/format";
import { useMeasure } from "../../lib/useMeasure";
import { useRevealed } from "../../lib/useRevealed";

const Z = 1.959964;

const ciOf = (p: RapmRow): [number, number] => [
  p.dP - Z * p.seD,
  p.dP + Z * p.seD,
];

export default function DefenseSpread({
  rows,
  playerId,
  playerBId,
}: {
  /** Qualified players for the season, already filtered to the floor. */
  rows: RapmRow[];
  playerId: string;
  /** Second player to lift out of the field (head-to-head mode). */
  playerBId?: string;
}) {
  const [wrapRef, width] = useMeasure<HTMLDivElement>();
  const revealed = useRevealed(wrapRef, 0.2);
  const reduce =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const me = rows.find((r) => r.id === playerId);
  const meB = playerBId ? rows.find((r) => r.id === playerBId) : undefined;
  const dual = !!meB;
  const narrow = width > 0 && width < 560;
  const padL = 14;
  const padR = 14;
  // Two lifted players need two label rows above the swarm.
  const labelBand = dual ? 82 : 46;
  const innerW = Math.max(40, width - padL - padR);
  const r = narrow ? 2.6 : 3.1;

  const ci: [number, number] | null = me ? ciOf(me) : null;
  const ciB: [number, number] | null = meB ? ciOf(meB) : null;

  // Domain has to hold the field and every drawn interval, or a wide interval
  // gets its caps clipped off the edge and reads narrower than it is.
  const { lo, hi } = useMemo(() => {
    const vals = rows.map((x) => x.dP);
    if (vals.length === 0) return { lo: -1, hi: 1 };
    let min = Math.min(...vals);
    let max = Math.max(...vals);
    for (const c of [ci, ciB]) {
      if (c) {
        min = Math.min(min, c[0]);
        max = Math.max(max, c[1]);
      }
    }
    const pad = Math.max(0.4, (max - min) * 0.06);
    return { lo: min - pad, hi: max + pad };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, ci?.[0], ci?.[1], ciB?.[0], ciB?.[1]]);

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
  const rulerYB = rulerY + 26;
  const height = (dual ? rulerYB : rulerY) + 30;

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
          aria-label={
            dual
              ? `Defensive RAPM for ${rows.length} qualified players. ${me.name} is at ${signed(me.dP, 1)} per 100 and ${meB!.name} at ${signed(meB!.dP, 1)}, each with a 95% interval drawn to the same scale.`
              : `Defensive RAPM for ${rows.length} qualified players. ${me.name} is at ${signed(me.dP, 1)} per 100, with a 95% interval from ${signed(ci[0], 1)} to ${signed(ci[1], 1)} that still covers ${overlapped} other players.`
          }
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
                opacity={d.row.id === me.id || d.row.id === meB?.id ? 0 : 0.42}
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

          {/* the lifted players: one label row each, connector down to the dot */}
          {(dual
            ? [
                { p: me, c: ci, nameY: 16, valY: 30, rowBottom: 36, ry: rulerY },
                { p: meB!, c: ciB!, nameY: 50, valY: 64, rowBottom: 70, ry: rulerYB },
              ]
            : [{ p: me, c: ci, nameY: 18, valY: 33, rowBottom: labelBand - 10, ry: rulerY }]
          ).map(({ p, c, nameY, valY, rowBottom, ry }) => {
            const hx = x(p.dP);
            // anchored away from whichever edge the name would run off
            const anchor =
              hx > padL + innerW - 70
                ? "end"
                : hx < padL + 70
                  ? "start"
                  : "middle";
            const tx = anchor === "end" ? hx + 6 : anchor === "start" ? hx - 6 : hx;
            // bar label sits at the left cap unless that would clip
            const barAnchor = x(c[0]) < padL + 84 ? "start" : "end";
            const barX = barAnchor === "end" ? x(c[0]) - 8 : x(c[1]) + 8;
            return (
              <g key={p.id}>
                <line
                  x1={hx}
                  x2={hx}
                  y1={rowBottom}
                  y2={swarmY - r - 3}
                  stroke="var(--color-line)"
                />
                <circle
                  cx={hx}
                  cy={swarmY}
                  r={r + (dual ? 3.4 : 2.6)}
                  fill={divergingColor(p.dP)}
                  stroke="var(--color-ink)"
                  strokeWidth={1.75}
                />
                {dual && (
                  <text
                    x={hx}
                    y={swarmY}
                    dy={2.6}
                    textAnchor="middle"
                    fontSize={8}
                    fontWeight={700}
                    className="font-mono"
                    fill="var(--color-paper)"
                  >
                    {lastName(p.name).slice(0, 1)}
                  </text>
                )}
                <text
                  x={tx}
                  y={nameY}
                  textAnchor={anchor}
                  fontSize={12.5}
                  fontWeight={600}
                  className="font-display"
                  fill="var(--color-ink)"
                >
                  {lastName(p.name)}
                </text>
                <text
                  x={tx}
                  y={valY}
                  textAnchor={anchor}
                  fontSize={11}
                  className="font-mono tnum"
                  fill="var(--color-ink-soft)"
                >
                  {signed(p.dP, 1)}
                </text>

                {/* the interval, to the same scale as the field above */}
                <line
                  x1={x(c[0])}
                  x2={x(c[1])}
                  y1={ry}
                  y2={ry}
                  stroke="var(--color-ink-soft)"
                  strokeWidth={2}
                  strokeLinecap="round"
                />
                {[c[0], c[1]].map((v) => (
                  <line
                    key={v}
                    x1={x(v)}
                    x2={x(v)}
                    y1={ry - 5}
                    y2={ry + 5}
                    stroke="var(--color-ink-soft)"
                    strokeWidth={1.5}
                  />
                ))}
                <circle cx={hx} cy={ry} r={3} fill="var(--color-ink-soft)" />
                {dual && (
                  <text
                    x={barX}
                    y={ry + 3.5}
                    textAnchor={barAnchor}
                    fontSize={10}
                    className="font-mono"
                    fill="var(--color-ink-soft)"
                  >
                    {lastName(p.name)}
                  </text>
                )}
              </g>
            );
          })}

          {/* one caption for the ruler block */}
          {(() => {
            if (dual)
              return (
                <text
                  x={padL + innerW / 2}
                  y={rulerYB + 19}
                  textAnchor="middle"
                  fontSize={10.5}
                  className="font-mono"
                  fill="var(--color-ink-soft)"
                >
                  95% intervals, same scale
                </text>
              );
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
