/**
 * A game's scoring race: the actual margin and the margin the shots were
 * worth, home minus away, across game time with every overtime. Two lines on
 * one axis; which is which is carried by line style (solid for the score,
 * dashed for what the shots were worth) and a label at each line's end,
 * never by colour.
 *
 * The box is a fixed height from the first render, the SVG drawn into it once
 * the width is measured and the game's detail has landed, so nothing below it
 * moves.
 */
import { useMemo } from "react";
import type { League } from "../../leagues";
import type { GameDetail } from "../../types";
import { elapsed, raceSeries } from "../../lib/games";
import { useMeasure } from "../../lib/useMeasure";

export const RACE_HEIGHT = 260;

/** "ORL +12", "CHI +4.8", or "level". */
function lead(margin: number, home: string, away: string, decimals: number): string {
  const v = Math.abs(margin);
  if (v.toFixed(decimals) === (0).toFixed(decimals)) return "level";
  return `${margin > 0 ? home : away} +${v.toFixed(decimals)}`;
}

/** The score moves in jumps, so it is drawn as steps. What the shots were
    worth moves by fractions at every attempt, and steps of a tenth of a point
    under a dash pattern read as noise, so it is drawn point to point. */
function path(
  t: number[],
  v: number[],
  x: (t: number) => number,
  y: (v: number) => number,
  end: number,
  stepped: boolean,
) {
  let d = `M${x(0).toFixed(1)} ${y(v[0]).toFixed(1)}`;
  for (let i = 1; i < t.length; i++) {
    d += stepped
      ? `H${x(t[i]).toFixed(1)}V${y(v[i]).toFixed(1)}`
      : `L${x(t[i]).toFixed(1)} ${y(v[i]).toFixed(1)}`;
  }
  return `${d}H${x(end).toFixed(1)}`;
}

export default function ScoreRace({
  lg,
  detail,
  home,
  away,
  svgRef,
}: {
  lg: League;
  /** Null while the game's week chunk loads: the box holds its height. */
  detail: GameDetail | null;
  home: string;
  away: string;
  svgRef?: React.Ref<SVGSVGElement>;
}) {
  const [wrapRef, width] = useMeasure<HTMLDivElement>();
  const race = useMemo(() => (detail ? raceSeries(lg, detail) : null), [lg, detail]);
  // The last period anyone scored or shot in; regulation is always played out.
  const periods = useMemo(
    () => (detail ? Math.max(4, ...detail.s.q, ...detail.f.q) : 4),
    [detail],
  );

  const H = RACE_HEIGHT;
  const narrow = width < 480;
  const pad = { top: 12, right: narrow ? 84 : 120, bottom: 24, left: 26 };
  const innerW = Math.max(40, width - pad.left - pad.right);
  const innerH = H - pad.top - pad.bottom;

  let chart: React.ReactNode = null;
  if (race && width > 0) {
    const { t, actual, expected } = race;
    const end = elapsed(lg, periods, 0);
    // Both sides keep room for their "ahead" label even if one never led.
    const vals = [...actual, ...expected];
    const hiV = Math.max(6, ...vals);
    const loV = Math.min(-6, ...vals);
    const vpad = (hiV - loV) * 0.06;
    const hi = hiV + vpad;
    const lo = loV - vpad;
    const x = (s: number) => pad.left + (s / end) * innerW;
    const y = (v: number) => pad.top + ((hi - v) / (hi - lo)) * innerH;

    const gridStep = hi - lo <= 26 ? 5 : hi - lo <= 56 ? 10 : 20;
    const ticks: number[] = [];
    for (let v = Math.ceil(lo / gridStep) * gridStep; v <= hi; v += gridStep) ticks.push(v);

    // Period ends, and where each label sits. Overtimes share one label
    // ("OT", "3OT"): five minutes is too narrow on a phone to name each.
    const bounds = Array.from({ length: periods - 1 }, (_, i) => elapsed(lg, i + 1, 0));
    const labels = [1, 2, 3, 4].map((p) => ({
      text: `Q${p}`,
      at: (elapsed(lg, p, 0) + (p === 1 ? 0 : elapsed(lg, p - 1, 0))) / 2,
    }));
    if (periods > 4) {
      const ots = periods - 4;
      labels.push({ text: ots === 1 ? "OT" : `${ots}OT`, at: (elapsed(lg, 4, 0) + end) / 2 });
    }

    const aEnd = actual[actual.length - 1];
    const xEnd = expected[expected.length - 1];
    // Labels claim the space right of the line ends; when the ends land close,
    // the lower label is pushed clear of the upper one.
    const clampY = (v: number) => Math.min(Math.max(v, pad.top + 6), H - pad.bottom - 16);
    let aY = clampY(y(aEnd));
    let xY = clampY(y(xEnd));
    if (Math.abs(aY - xY) < 28) {
      if (xY >= aY) xY = aY + 28;
      else xY = aY - 28;
      if (xY > H - pad.bottom - 16) {
        xY = H - pad.bottom - 16;
        aY = xY - 28;
      }
      if (xY < pad.top + 6) {
        xY = pad.top + 6;
        aY = xY + 28;
      }
    }

    chart = (
      <svg
        ref={svgRef}
        width={width}
        height={H}
        role="img"
        aria-label={`Margin through the game, ${home} minus ${away}. The score ends ${lead(aEnd, home, away, 0)}; what the shots were worth ends ${lead(xEnd, home, away, 1)}.`}
        className="block"
      >
        {/* margin grid */}
        {ticks.map((v) => (
          <g key={v}>
            <line
              x1={pad.left}
              x2={pad.left + innerW}
              y1={y(v)}
              y2={y(v)}
              stroke={v === 0 ? "var(--color-line)" : "var(--color-line-soft)"}
              strokeWidth={v === 0 ? 1.2 : 1}
            />
            <text
              x={pad.left - 6}
              y={y(v) + 3.5}
              textAnchor="end"
              fontSize={10}
              className="font-mono tnum"
              fill="var(--color-ink-faint)"
            >
              {Math.abs(v)}
            </text>
          </g>
        ))}
        <text x={pad.left + 4} y={y(hi) + 11} fontSize={10} className="font-mono" fill="var(--color-ink-faint)">
          {home} ahead
        </text>
        <text x={pad.left + 4} y={y(lo) - 5} fontSize={10} className="font-mono" fill="var(--color-ink-faint)">
          {away} ahead
        </text>

        {/* periods */}
        {bounds.map((b) => (
          <line
            key={b}
            x1={x(b)}
            x2={x(b)}
            y1={pad.top}
            y2={pad.top + innerH}
            stroke="var(--color-line-soft)"
          />
        ))}
        {labels.map((l) => (
          <text
            key={l.text}
            x={x(l.at)}
            y={H - 7}
            textAnchor="middle"
            fontSize={10}
            className="font-mono"
            fill="var(--color-ink-faint)"
          >
            {l.text}
          </text>
        ))}

        {/* the two races */}
        <path
          d={path(t, expected, x, y, end, false)}
          fill="none"
          stroke="var(--color-ink-soft)"
          strokeWidth={1.6}
          strokeDasharray="5 4"
          strokeLinejoin="round"
        />
        <path
          d={path(t, actual, x, y, end, true)}
          fill="none"
          stroke="var(--color-ink)"
          strokeWidth={2}
          strokeLinejoin="round"
        />

        {/* who is who, at each line's own end */}
        {(
          [
            { v: aEnd, ly: aY, name: "Score", value: lead(aEnd, home, away, 0), dash: false },
            { v: xEnd, ly: xY, name: "Shots' worth", value: lead(xEnd, home, away, 1), dash: true },
          ] as const
        ).map(({ v, ly, name, value, dash }) => (
          <g key={name}>
            <circle cx={x(end)} cy={y(v)} r={2.6} fill={dash ? "var(--color-ink-soft)" : "var(--color-ink)"} />
            {Math.abs(ly - y(v)) > 4 && (
              <line x1={x(end)} x2={x(end) + 7} y1={y(v)} y2={ly} stroke="var(--color-line)" />
            )}
            <text
              x={x(end) + 9}
              y={ly + 3.5}
              fontSize={narrow ? 10.5 : 11.5}
              fontWeight={600}
              className="font-display"
              fill="var(--color-ink)"
            >
              {name}
            </text>
            <text
              x={x(end) + 9}
              y={ly + 16.5}
              fontSize={10.5}
              className="font-mono tnum"
              fill="var(--color-ink-soft)"
            >
              {value}
            </text>
          </g>
        ))}
      </svg>
    );
  }

  return (
    <div ref={wrapRef} className="relative" style={{ height: H }}>
      {chart ?? (
        <div className="h-full w-full animate-pulse rounded bg-wash" aria-hidden="true" />
      )}
    </div>
  );
}
