/**
 * /calibration/:lg — the credibility artifact, as a first-class route.
 *
 * Four deliverables on one page: how many attempts before each component means
 * anything, what accuracy costs as data quality falls to federation grade, whether
 * openness contaminates the shot-making residual (it doesn't, measurably), and what
 * the model cannot see.
 *
 * Every caveat here is read from the JSON rather than written into the page, so the
 * page cannot drift from what the pipeline actually found — and cannot quietly drop a
 * qualification the data insists on.
 */
import { Link, useParams } from "react-router-dom";
import { useCalibration, useLeague } from "../data";
import { ACTIVE_LEAGUES, leagueDef, type League } from "../leagues";
import { useTitle } from "../lib/useTitle";
import { divergingText } from "../lib/color";
import { useEffect } from "react";

const H2 =
  "mt-14 font-display text-xl font-semibold tracking-tight text-ink sm:text-2xl";
const BODY =
  "mt-4 space-y-4 text-[15px] leading-relaxed text-ink-soft sm:text-base";

function Caveats({ items, label }: { items: string[]; label: string }) {
  return (
    <div className="mt-5 rounded border border-line-soft bg-wash px-4 py-4">
      <p className="font-display text-[11px] font-medium uppercase tracking-wider text-ink-faint">
        {label}
      </p>
      <ul className="mt-2 space-y-2 text-sm leading-relaxed text-ink-soft">
        {items.map((c, i) => (
          <li key={i} className="flex gap-2">
            <span aria-hidden="true" className="text-ink-faint">
              ·
            </span>
            <span>{c}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Reliability curve: attempts on a log-ish axis, one line per component. */
function Curve({
  sweep,
  selection,
  making,
}: {
  sweep: number[];
  selection: (number | null)[];
  making: (number | null)[];
}) {
  const W = 640;
  const H = 220;
  const PAD = { l: 38, r: 12, t: 10, b: 28 };
  const xs = (i: number) =>
    PAD.l + (i / (sweep.length - 1)) * (W - PAD.l - PAD.r);
  const ys = (v: number) => PAD.t + (1 - v) * (H - PAD.t - PAD.b);
  // built imperatively: .filter(Boolean) does not narrow the null out for TS,
  // so a chained version types as string | null and the <path> rejects it
  const path = (vals: (number | null)[]): string => {
    const pts: string[] = [];
    vals.forEach((v, i) => {
      if (v !== null && Number.isFinite(v)) pts.push(`${xs(i)},${ys(v)}`);
    });
    return pts.length ? `M${pts.join(" L")}` : "";
  };

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="mt-5 w-full"
      role="img"
      aria-label="Reliability against attempt count, for selection and making"
    >
      {[0.5, 0.7].map((t) => (
        <g key={t}>
          <line
            x1={PAD.l}
            x2={W - PAD.r}
            y1={ys(t)}
            y2={ys(t)}
            stroke="currentColor"
            className="text-line"
            strokeDasharray="3 3"
          />
          <text
            x={4}
            y={ys(t) + 4}
            className="fill-ink-faint font-mono"
            fontSize={10}
          >
            {t.toFixed(1)}
          </text>
        </g>
      ))}
      <path d={path(selection)} fill="none" stroke="var(--color-warm)" strokeWidth={2} />
      <path d={path(making)} fill="none" stroke="var(--color-cool)" strokeWidth={2} />
      {sweep.map((n, i) => (
        <text
          key={n}
          x={xs(i)}
          y={H - 8}
          textAnchor="middle"
          className="fill-ink-faint font-mono"
          fontSize={10}
        >
          {n}
        </text>
      ))}
    </svg>
  );
}

export default function Calibration() {
  const { lg } = useParams();
  const league = (lg && ACTIVE_LEAGUES.includes(lg as League)
    ? lg
    : "NBA") as League;
  const { league: active, setLeague } = useLeague();
  useEffect(() => {
    if (league !== active) setLeague(league);
  }, [league, active, setLeague]);
  useTitle("Calibration · Over Expected");
  const state = useCalibration();

  if (state.status === "loading")
    return (
      <div className="mx-auto max-w-2xl px-6 py-24">
        <div className="h-64 animate-pulse rounded bg-wash" />
      </div>
    );
  if (state.status === "error")
    return (
      <p className="mx-auto max-w-xl px-6 py-32 text-center text-ink-soft">
        The calibration data failed to load.
      </p>
    );

  const d = state.data;
  const nba = d.curve.byLeague.NBA;
  const def = leagueDef(league);

  return (
    <article className="mx-auto max-w-2xl px-5 py-12 font-serif sm:px-8 sm:py-16">
      <h1 className="font-display text-3xl font-bold tracking-tight text-ink sm:text-5xl">
        What this model can and cannot measure
      </h1>
      <p className="mt-4 text-base leading-relaxed text-ink-soft sm:text-lg">
        Over Expected runs on play-by-play and shot coordinates — no tracking, no
        defender distance, no touch time. This page states what that buys and what
        it costs, with a number attached to every claim and the objections stated
        before you have to raise them. Measured on{" "}
        <span className="font-mono tnum">
          {(d.meta.shotsAnalysed / 1e6).toFixed(2)}M
        </span>{" "}
        shots across {d.meta.leaguesInReliability.length} competitions.
      </p>

      {/* ---------------- 1. the curve ---------------- */}
      <h2 className={H2}>How many attempts before a number means anything</h2>
      <div className={BODY}>
        <p>
          Two things are separated from the same shots:{" "}
          <strong>selection</strong>, the quality of the looks a player takes, and{" "}
          <strong>making</strong>, whether he converts them beyond expectation. They
          are not equally measurable, and the gap is roughly fourfold at 50
          attempts.
        </p>
      </div>
      <Curve
        sweep={d.curve.sweep}
        selection={nba?.selection.reliability ?? []}
        making={nba?.making.reliability ?? []}
      />
      <p className="mt-2 text-xs text-ink-faint">
        <span style={{ color: "var(--color-warm)" }}>■</span> selection ·{" "}
        <span style={{ color: "var(--color-cool)" }}>■</span> making · NBA,
        attempts on the x-axis, split-half reliability with a Spearman–Brown
        correction, halves matched on canonical zone.
      </p>

      <div className="mt-6 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left">
              <th className="py-2 font-display text-[11px] font-medium uppercase tracking-wider text-ink-faint">
                League
              </th>
              <th className="py-2 text-right font-display text-[11px] font-medium uppercase tracking-wider text-ink-faint">
                Selection @0.7
              </th>
              <th className="py-2 text-right font-display text-[11px] font-medium uppercase tracking-wider text-ink-faint">
                Making @0.7
              </th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(d.curve.byLeague).map(([code, c]) => (
              <tr key={code} className="border-b border-line-soft">
                <td className="py-2 font-display font-semibold text-ink">{code}</td>
                <td className="py-2 text-right font-mono tnum text-ink-soft">
                  {c.selection["attemptsFor0.7"] ?? "≤ floor"}
                </td>
                <td className="py-2 text-right font-mono tnum text-ink-soft">
                  {c.making["attemptsFor0.7"] ??
                    (c.makingAtCeiling
                      ? `${c.makingAtCeiling.toFixed(2)} at ${c.ceilingRung} (ceiling)`
                      : "censored")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Caveats items={d.curve.caveats} label="What bounds this" />

      {/* ---------------- 2. the ladder ---------------- */}
      <h2 className={H2}>What accuracy costs as the data gets cheaper</h2>
      <div className={BODY}>
        <p>{d.degradation.headline}</p>
      </div>
      <div className="mt-5 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left">
              <th className="py-2 font-display text-[11px] font-medium uppercase tracking-wider text-ink-faint">
                Feed
              </th>
              <th className="py-2 text-right font-display text-[11px] font-medium uppercase tracking-wider text-ink-faint">
                Log loss
              </th>
              <th className="py-2 text-right font-display text-[11px] font-medium uppercase tracking-wider text-ink-faint">
                Calibration error
              </th>
            </tr>
          </thead>
          <tbody>
            {d.degradation.rungs.map((r) => (
              <tr key={r.key} className="border-b border-line-soft">
                <td className="py-2 text-ink-soft">
                  {r.feed}
                  <span className="ml-1 font-mono text-xs text-ink-faint">
                    ({r.nFeatures}f)
                  </span>
                </td>
                <td className="py-2 text-right font-mono tnum text-ink-soft">
                  {r.logLoss.toFixed(4)}
                  <span className="ml-1 text-xs text-ink-faint">
                    {r.logLossVsFull > 0 ? `+${r.logLossVsFull.toFixed(4)}` : "—"}
                  </span>
                </td>
                <td className="py-2 text-right font-mono tnum text-ink-soft">
                  {r.ece.toFixed(4)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Caveats items={d.degradation.caveats} label="What bounds this" />

      {/* ---------------- 3. the null ---------------- */}
      <h2 className={H2}>Is the residual just openness?</h2>
      <div className={BODY}>
        <p>
          The obvious objection: the model cannot see how open a shot was, so what
          it calls shot-making might be shot openness. We tested it with NBA
          tracking aggregates — used only while fitting, never at inference — and{" "}
          <strong className="text-ink">could not detect it.</strong>
        </p>
        <p className="font-mono text-sm text-ink">
          correlation r = {d.number.rawCorrelation.toFixed(3)} (95% CI{" "}
          {d.number.rawCorrelationCI[0].toFixed(3)} to{" "}
          {d.number.rawCorrelationCI[1].toFixed(3)}) · partial R²{" "}
          <span style={{ color: divergingText(0) }}>
            {d.number.partialR2.toFixed(5)}
          </span>{" "}
          · p = {d.number.controlledP.toFixed(2)} · n = {d.number.n}
        </p>
        <p>
          Openness explains {(d.number.partialR2 * 100).toFixed(2)}% of the
          residual's variance. The control is the quality of looks taken, included
          because defences guard good shooters — so openness and true skill are
          negatively related in the population, and an uncontrolled correlation
          would <em>understate</em> contamination. Both are null.
        </p>
      </div>
      <Caveats items={[d.number.caveat, d.number.clustering]} label="What bounds this" />

      {/* ---------------- 4. limits ---------------- */}
      <h2 className={H2}>What the model cannot see</h2>
      <div className={BODY}>
        <p>{d.limits.noTracking}.</p>
        <p>
          <strong className="text-ink">The assist proxy cannot be built.</strong>{" "}
          {d.limits.assistProxyDead}. What survives:{" "}
          {d.limits.survivingProxies.join(", ")}.
        </p>
        <p>
          <strong className="text-ink">One openness channel is real, and already
          priced.</strong> {d.limits.cornerEffectAlreadyPriced}.
        </p>
        <p>
          <strong className="text-ink">Predictive validity is untested.</strong>{" "}
          {d.limits.predictiveValidity}. Everything above concerns whether a
          measurement <em>repeats</em>, which is a precondition for predicting
          anything and never a substitute for it.
        </p>
        <p>{d.limits.noYouthData}.</p>
      </div>

      <p className="mt-14 border-t border-line pt-6 text-sm text-ink-soft">
        Reproducible: {Object.entries(d.meta.commands).map(([k, v], i) => (
          <span key={k}>
            {i > 0 && " · "}
            <span className="font-mono text-xs text-ink">{v}</span>
          </span>
        ))}
        . Currently viewing as {def.label};{" "}
        <Link
          to="/methodology"
          className="text-ink underline underline-offset-4"
        >
          platform methodology →
        </Link>
      </p>
    </article>
  );
}
