/**
 * Clutch Decision-making — the decision-EV layer, formerly the /coaching/:lg
 * board, now a section of the League page below the team table.
 *
 * Three parts, in the order the argument runs:
 *  1. The error, by margin: one signed bar per trailing margin, chosen minus
 *     optimal three-share in points. The sign flip across margins IS the
 *     finding (down one they shoot it far too often, down three far too
 *     rarely), so the figure draws the error itself rather than the two
 *     shares it is made of.
 *  2. By team: every team on the ETM axis with one team's median 95% interval
 *     drawn to the same scale beneath it, so the rank column below cannot be
 *     read as more precise than it is.
 *  3. The ranking, 1-30: sorted by win probability given up per decision,
 *     top 10 visible, expandable, sortable.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useCoaching } from "../data";
import type { League } from "../leagues";
import type { CoachingMarginRow, CoachingTeamRow } from "../types";
import { divergingColor, divergingText, scaleMax } from "../lib/color";
import { int } from "../lib/format";
import { useMeasure } from "../lib/useMeasure";
import { useRevealed } from "../lib/useRevealed";
import SortHeader, { cycleSort, type SortDir } from "./SortHeader";
import ShowAllButton from "./ShowAllButton";

const pct1 = (v: number) => `${(v * 100).toFixed(1)}%`;

/**
 * One signed bar per trailing margin: how far the taken three-share sits from
 * the optimal one, in percentage points. Warm = shot it more often than the
 * win probabilities said to, cool = less often.
 */
function MarginError({ rows }: { rows: CoachingMarginRow[] }) {
  const [wrapRef, width] = useMeasure<HTMLDivElement>();
  const revealed = useRevealed(wrapRef, 0.2);

  const narrow = width > 0 && width < 560;
  const padL = narrow ? 64 : 92;
  const padR = 52;
  const padT = 10;
  const padB = 30;
  const rowH = narrow ? 62 : 68;
  const innerW = Math.max(40, width - padL - padR);
  const height = padT + rows.length * rowH + padB;

  const maxAbs = Math.max(
    ...rows.map((m) => Math.abs(m.choseThreeShare - m.optimalThreeShare)),
    0.0001,
  );
  const half = maxAbs * 1.12;
  const x = (err: number) => padL + ((err + half) / (2 * half)) * innerW;
  const cy = (i: number) => padT + i * rowH + rowH / 2;

  return (
    <div ref={wrapRef}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={rows
            .map((m) => {
              const err = Math.round(
                (m.choseThreeShare - m.optimalThreeShare) * 100,
              );
              return `Trailing by ${m.margin}: teams took the three ${Math.abs(err)} points ${
                err >= 0 ? "more" : "less"
              } often than the win probabilities favoured, over ${m.n} decisions.`;
            })
            .join(" ")}
        >
          {/* zero = taking the three exactly as often as it is the better shot */}
          <line
            x1={x(0)}
            x2={x(0)}
            y1={padT}
            y2={height - padB + 2}
            stroke="var(--color-line)"
          />
          <text
            x={x(0)}
            y={height - padB + 18}
            textAnchor="middle"
            fontSize={10}
            className="font-mono"
            fill="var(--color-ink-faint)"
          >
            took it exactly as often as it was right
          </text>

          {rows.map((m, i) => {
            const err = m.choseThreeShare - m.optimalThreeShare;
            const tone = divergingText((err / half) * scaleMax());
            const y = cy(i);
            const x0 = x(0);
            const x1 = x(err);
            // The bar grows out of the zero line toward its value.
            const sweep: React.CSSProperties = {
              clipPath: revealed
                ? "inset(-40% -2% -40% -2%)"
                : err >= 0
                  ? `inset(-40% ${(100 - ((x0 - padL) / innerW) * 100).toFixed(1)}% -40% -2%)`
                  : `inset(-40% -2% -40% ${(((x0 - padL) / innerW) * 100).toFixed(1)}%)`,
              transition: "clip-path 640ms var(--ease-out-strong)",
              transitionDelay: `${i * 90}ms`,
            };

            return (
              <g key={m.margin}>
                <text
                  x={0}
                  y={y - 4}
                  fontSize={narrow ? 11.5 : 12.5}
                  fontWeight={600}
                  className="font-display"
                  fill="var(--color-ink)"
                >
                  {narrow ? `Down ${m.margin}` : `Trailing by ${m.margin}`}
                </text>
                <text
                  x={0}
                  y={y + 11}
                  fontSize={10}
                  className="font-mono tnum"
                  fill="var(--color-ink-faint)"
                >
                  {int(m.n)} decisions
                </text>

                <g style={sweep}>
                  <rect
                    x={Math.min(x0, x1)}
                    y={y - 5}
                    width={Math.max(1.5, Math.abs(x1 - x0))}
                    height={10}
                    rx={2}
                    fill={divergingColor((err / half) * scaleMax())}
                  />
                </g>

                <text
                  x={width - 4}
                  y={y + 4.5}
                  textAnchor="end"
                  fontSize={13}
                  fontWeight={600}
                  className="font-mono tnum"
                  fill={tone}
                >
                  {err >= 0 ? "+" : "−"}
                  {Math.abs(Math.round(err * 100))}
                </text>

                <text
                  x={x1 + (err >= 0 ? -4 : 4)}
                  y={y + 20}
                  textAnchor={err >= 0 ? "end" : "start"}
                  fontSize={9.5}
                  className="font-mono tnum"
                  fill="var(--color-ink-faint)"
                >
                  took {pct1(m.choseThreeShare)} · right {pct1(m.optimalThreeShare)}
                </text>
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}

/**
 * Every team placed on the ETM axis, with one team's median 95% interval
 * drawn to scale beneath it. The comparison between those two widths is the
 * caveat the ranking below has to carry: the league's whole spread is not
 * much wider than the uncertainty on any single team.
 */
function TeamSpread({ rows }: { rows: CoachingTeamRow[] }) {
  const [wrapRef, width] = useMeasure<HTMLDivElement>();

  const narrow = width > 0 && width < 560;
  const padL = 14;
  const padR = 14;
  const labelBand = 46;
  const axisBand = 74;
  const height = labelBand + (narrow ? 52 : 60) + axisBand;
  const innerW = Math.max(40, width - padL - padR);

  const { lo, hi, mid, ciWidth } = useMemo(() => {
    const etms = rows.map((r) => r.etm);
    const min = Math.min(...etms);
    const max = Math.max(...etms);
    const mid = (min + max) / 2;
    const widths = rows.map((r) => r.ci[1] - r.ci[0]).sort((a, b) => a - b);
    const ciWidth = widths[Math.floor(widths.length / 2)];
    // The interval ruler is drawn to the same scale as the dots and is often
    // wider than the league spread, which is the whole point of the figure —
    // so the domain has to hold it, or its caps get clipped off the edge.
    const half = Math.max(max - min, ciWidth) / 2;
    return {
      lo: mid - half * 1.16,
      hi: mid + half * 1.16,
      mid,
      ciWidth,
    };
  }, [rows]);

  const x = (v: number) => padL + ((v - lo) / (hi - lo)) * innerW;
  const swarmY = labelBand + (narrow ? 26 : 30);
  const r = narrow ? 4 : 4.6;
  const axisY = height - axisBand + 8;
  const rulerY = axisY + 40;

  // Simple collision packing: walk left to right and step away from the centre
  // line whenever a dot would touch the one before it.
  const dots = useMemo(() => {
    const gap = 2 * r + 1.2;
    const placed: { row: CoachingTeamRow; px: number; py: number }[] = [];
    for (const row of [...rows].sort((a, b) => a.etm - b.etm)) {
      const px = x(row.etm);
      let off = 0;
      for (let k = 0; k < 8; k++) {
        const cand = k === 0 ? 0 : (k % 2 === 1 ? 1 : -1) * Math.ceil(k / 2) * gap;
        const clash = placed.some(
          (q) => (q.px - px) ** 2 + (q.py - (swarmY + cand)) ** 2 < gap * gap - 0.01,
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
  }, [rows, width]);

  // Guard before the reduces below: an empty array with no initial value
  // throws, and every hook above has already run, so returning here is safe.
  if (dots.length === 0) return null;

  const best = dots.reduce((a, b) => (a.row.etm <= b.row.etm ? a : b));
  const worst = dots.reduce((a, b) => (a.row.etm >= b.row.etm ? a : b));

  return (
    <div ref={wrapRef}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`Win probability given up per decision for ${rows.length} teams, from ${best.row.etm.toFixed(
            2,
          )} (${best.row.team}) to ${worst.row.etm.toFixed(2)} (${worst.row.team}). One team's median 95% interval is ${ciWidth.toFixed(2)} points wide.`}
        >
          <line
            x1={padL}
            x2={padL + innerW}
            y1={axisY}
            y2={axisY}
            stroke="var(--color-line)"
            strokeWidth={1}
          />
          {/* the "better" cue owns the left end of the axis row, so any tick
              that would sit under it is dropped rather than overprinted */}
          {[1, 2, 3].map((t) =>
            t > lo && t < hi && x(t) > padL + 62 ? (
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
                  {t.toFixed(1)}
                </text>
              </g>
            ) : null,
          )}
          <text
            x={padL}
            y={axisY + 18}
            textAnchor="start"
            fontSize={10.5}
            className="font-mono"
            fill="var(--color-ink-faint)"
          >
            ← better
          </text>

          {/* one team's interval, to the same scale as the dots above it */}
          <line
            x1={x(mid - ciWidth / 2)}
            x2={x(mid + ciWidth / 2)}
            y1={rulerY}
            y2={rulerY}
            stroke="var(--color-ink-soft)"
            strokeWidth={2}
            strokeLinecap="round"
          />
          {[-1, 1].map((s) => (
            <line
              key={s}
              x1={x(mid + (s * ciWidth) / 2)}
              x2={x(mid + (s * ciWidth) / 2)}
              y1={rulerY - 4}
              y2={rulerY + 4}
              stroke="var(--color-ink-soft)"
              strokeWidth={1.5}
            />
          ))}
          <text
            x={x(mid)}
            y={rulerY + 17}
            textAnchor="middle"
            fontSize={10.5}
            className="font-mono"
            fill="var(--color-ink-soft)"
          >
            one team's 95% interval, same scale
          </text>

          {dots.map((d) => (
            <circle
              key={d.row.teamId}
              cx={d.px}
              cy={d.py}
              r={r}
              // Warm = gives up more win probability than the league's
              // midpoint, cool = less: red is the error side everywhere.
              fill={divergingColor(((d.row.etm - mid) / (hi - lo)) * 2 * scaleMax())}
              opacity={0.92}
            />
          ))}

          {[best, worst].map((d) => (
            <g key={`label-${d.row.teamId}`}>
              <line
                x1={d.px}
                x2={d.px}
                y1={d.py - r - 3}
                y2={labelBand - 14}
                stroke="var(--color-line)"
              />
              <text
                x={d.px}
                y={16}
                textAnchor={d === best ? "start" : "end"}
                fontSize={12}
                fontWeight={600}
                className="font-display"
                fill="var(--color-ink)"
              >
                {d.row.team}
              </text>
              <text
                x={d.px}
                y={30}
                textAnchor={d === best ? "start" : "end"}
                fontSize={10.5}
                className="font-mono tnum"
                fill="var(--color-ink-soft)"
              >
                {d.row.etm.toFixed(2)}
              </text>
            </g>
          ))}
        </svg>
      )}
    </div>
  );
}

type ClutchSortKey = "decisions" | "etm";

/** The ranking, 1-30: top 10 visible, expandable, sortable. */
function ClutchTable({ rows }: { rows: CoachingTeamRow[] }) {
  const [expanded, setExpanded] = useState(false);
  const [explicit, setExplicit] = useState<ClutchSortKey | null>(null);
  const [dir, setDir] = useState<SortDir>("desc");

  const onSort = (k: ClutchSortKey) => {
    const next = cycleSort(k, explicit, dir);
    setExplicit(next?.sort ?? null);
    setDir(next?.dir ?? "desc");
  };

  const sorted = useMemo(() => {
    // Default order: closest to optimal first (etm ascending).
    if (!explicit) return [...rows].sort((a, b) => a.etm - b.etm);
    const mul = dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => mul * (a[explicit] - b[explicit]));
  }, [rows, explicit, dir]);

  const visible = expanded ? sorted : sorted.slice(0, 10);
  const GRID = "grid-cols-[2.5rem_minmax(0,1fr)_6rem_7rem_8.5rem]";

  return (
    <div className="mt-5">
      <div className={`grid ${GRID} items-end gap-x-4 border-b border-line pb-2`}>
        <span />
        <span className="font-display text-[11px] font-medium uppercase tracking-wider text-ink-faint">
          Team
        </span>
        <SortHeader
          k="decisions"
          label="Decisions"
          sort={explicit}
          dir={dir}
          onSort={onSort}
          className="text-right"
        />
        <SortHeader
          k="etm"
          label="WP given up"
          sort={explicit}
          dir={dir}
          onSort={onSort}
          className="text-right"
        />
        <span className="hidden text-right font-display text-[11px] font-medium uppercase tracking-wider text-ink-faint sm:block">
          95% interval
        </span>
      </div>
      <ol>
        {visible.map((t, i) => (
          <li
            key={t.teamId}
            className={`grid ${GRID} items-center gap-x-4 border-b border-line-soft py-2 ${
              i >= 10 ? "reveal-row" : ""
            }`}
            style={
              i >= 10
                ? ({ "--reveal-delay": `${Math.min((i - 10) * 16, 160)}ms` } as React.CSSProperties)
                : undefined
            }
          >
            <span className="text-right font-mono tnum text-xs text-ink-faint">
              {i + 1}
            </span>
            <span className="font-display text-[14px] font-semibold text-ink">
              {t.team}
            </span>
            <span className="text-right font-mono tnum text-sm text-ink-soft">
              {t.decisions}
            </span>
            <span className="text-right font-mono tnum text-sm text-ink">
              {t.etm.toFixed(2)}
            </span>
            <span className="hidden text-right font-mono tnum text-xs text-ink-faint sm:block">
              {t.ci[0].toFixed(2)} to {t.ci[1].toFixed(2)}
            </span>
          </li>
        ))}
      </ol>
      <ShowAllButton
        expanded={expanded}
        total={sorted.length}
        noun="teams"
        onToggle={() => setExpanded((v) => !v)}
      />
    </div>
  );
}

export default function ClutchDecisions({ league }: { league: League }) {
  const state = useCoaching(league);

  if (state.status === "loading")
    return (
      <section className="mt-16 border-t border-line pt-12" aria-busy="true">
        <div className="h-8 w-72 animate-pulse rounded bg-wash" />
        <div className="mt-6 h-48 animate-pulse rounded bg-wash" />
      </section>
    );
  if (state.status === "error")
    return (
      <section className="mt-16 border-t border-line pt-12">
        <p className="text-sm text-ink-soft">
          The clutch decision data failed to load.
        </p>
      </section>
    );

  const { meta, margins, teams } = state.data;
  const first = margins[0];
  const last = margins[margins.length - 1];
  const swing = first
    ? Math.round((last.optimalThreeShare - first.optimalThreeShare) * 100)
    : 0;
  const drift = first
    ? Math.round(Math.abs(last.choseThreeShare - first.choseThreeShare) * 100)
    : 0;
  const ciWidths = teams.map((t) => t.ci[1] - t.ci[0]).sort((a, b) => a - b);
  const medianCi = ciWidths[Math.floor(ciWidths.length / 2)];
  const spread = meta.spread.worstEtm - meta.spread.bestEtm;
  const byEtm = [...teams].sort((a, b) => a.etm - b.etm);

  return (
    <section className="mt-16 border-t border-line pt-12">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="font-display text-xl font-semibold tracking-tight text-ink sm:text-2xl">
          Clutch Decision-making
        </h2>
        <span className="rounded border border-line px-2 py-0.5 font-display text-[10px] font-medium uppercase tracking-wider text-ink-faint">
          all seasons pooled
        </span>
      </div>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-soft">
        Down one, two, or three inside the last{" "}
        <span className="font-mono tnum">{meta.window.maxSeconds}</span> seconds:
        shoot a three, or shoot a two? Each of the{" "}
        <span className="font-mono tnum">{int(meta.nDecisions)}</span> shots
        taken in that spot is scored against the choice with the better expected
        win probability, using that team's own conversion rates. Whether the
        shot went in is never an input, and a test re-scores every decision with
        the result flipped to prove it.
      </p>

      <h3 className="mt-10 max-w-xl font-display text-lg font-semibold tracking-tight text-ink">
        The error, by margin
      </h3>
      <p className="mt-1.5 max-w-2xl text-sm text-ink-soft">
        How far the taken three-share sits from the optimal one, in points.
        Warm bars: shot it too often. Cool bars: not often enough.
      </p>
      <div className="mt-4">
        <MarginError rows={margins} />
      </div>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-soft">
        Down one, a two wins the game outright, so the three is almost never the
        better shot. Down three, only a three can tie. The right answer moves{" "}
        <span className="font-mono tnum">{swing}</span> points across that
        range; what teams actually do moves{" "}
        <span className="font-mono tnum">{drift}</span>.
      </p>

      <h3 className="mt-12 font-display text-lg font-semibold tracking-tight text-ink">
        By team
      </h3>
      <p className="mt-1.5 max-w-2xl text-sm text-ink-soft">
        Win probability given up per decision. The median team-season holds
        about eight of these, so seasons are pooled.
      </p>
      <div className="mt-4">
        <TeamSpread rows={byEtm} />
      </div>

      <ClutchTable rows={teams} />

      <p className="mt-5 max-w-2xl text-xs leading-relaxed text-ink-faint">
        Read the ranking with the ruler above in mind: the whole league spans{" "}
        <span className="font-mono tnum">{spread.toFixed(2)}</span> points of
        win probability per decision and a single team's 95% interval is{" "}
        <span className="font-mono tnum">{medianCi.toFixed(2)}</span> points
        wide, so neighbouring ranks are ties in everything but the decimal.
        Every figure is percentage points of win probability lost per decision;
        zero would mean always taking the better shot.{" "}
        <Link
          to="/methodology/coaching"
          className="underline underline-offset-2 hover:text-ink"
        >
          How this is computed, and what it ignores
        </Link>
        .
      </p>
    </section>
  );
}
