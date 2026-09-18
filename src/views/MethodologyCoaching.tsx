import { Link } from "react-router-dom";
import { useCoaching } from "../data";
import { useTitle } from "../lib/useTitle";

const H2 =
  "mt-14 font-display text-xl font-semibold tracking-tight text-ink sm:text-2xl";
const BODY =
  "mt-4 space-y-4 text-[15px] leading-relaxed text-ink-soft sm:text-base";

/**
 * Methodology for Layer 3. Every number and every caveat is read from the live
 * coaching-NBA.json meta, including the approximations list, so this page
 * cannot drift from what the export actually did.
 */
export default function MethodologyCoaching() {
  useTitle("Clutch Decision-making methodology · Over Expected");
  const state = useCoaching("NBA");
  const meta = state.status === "ready" ? state.data.meta : null;
  const margins = state.status === "ready" ? state.data.margins : [];

  return (
    <article className="mx-auto max-w-2xl px-5 py-12 font-serif sm:px-8 sm:py-16">
      <h1 className="font-display text-3xl font-bold tracking-tight text-ink sm:text-5xl">
        Clutch Decision-making
      </h1>
      <p className="mt-4 text-base leading-relaxed text-ink-soft sm:text-lg">
        One decision, scored honestly: down a possession late, do you shoot the
        three or the two? The answer depends on the margin and on your own
        conversion rates. It never depends on whether the shot dropped.
      </p>

      <h2 className={H2}>What is measured</h2>
      <div className={BODY}>
        <p>
          Take every live end-game possession, meaning trailing by{" "}
          {meta ? meta.window.margins.join(", ") : "1 to 3"} inside{" "}
          <span className="font-mono tnum">
            {meta ? meta.window.maxSeconds : 35}
          </span>{" "}
          seconds of the fourth quarter. Both branches get valued with a
          calibrated win-probability model: what your win probability becomes if
          you take the three, and what it becomes if you take the two. Each
          branch uses that team's own conversion rate for that shot type, so a
          good three-point team is not judged against a league-average one.
        </p>
        <p className="font-mono text-sm text-ink">
          ETM = WP(better option) − WP(option chosen)
        </p>
        <p>
          It is zero when the higher-EV option was taken and positive otherwise,
          measured in percentage points of win probability. Lower is better.
          Across{" "}
          <span className="font-mono tnum">
            {meta ? meta.nDecisions.toLocaleString() : "1,364"}
          </span>{" "}
          decisions the league gives up between{" "}
          <span className="font-mono tnum">
            {meta ? meta.spread.bestEtm.toFixed(2) : "0.97"}
          </span>{" "}
          and{" "}
          <span className="font-mono tnum">
            {meta ? meta.spread.worstEtm.toFixed(2) : "3.23"}
          </span>{" "}
          points of win probability per decision.
        </p>
      </div>

      <h2 className={H2}>The outcome is not an input</h2>
      <div className={BODY}>
        <p>
          This is the part that matters most, so it is enforced by tests rather
          than asserted here. The scoring function is never given whether the
          shot went in: it has no parameter an outcome could arrive through, and
          a test walks its syntax tree to confirm it never reads one. A second
          test re-scores every decision in the dataset with the result flipped
          and asserts the answer is byte-identical.
        </p>
        <p>
          A number that rewards a coach for a shot that happened to drop rewards
          luck. Scoring the decision on what it was worth at the moment it was
          made is the only version of this worth publishing.
        </p>
      </div>

      <h2 className={H2}>The finding</h2>
      <div className={BODY}>
        <p>
          Whether the three is the right call swings hugely with the margin. Down
          one, a two wins the game outright, so the three is almost never right.
          Down three, only the three can tie. Behaviour does not follow:
        </p>
        {margins.length > 0 && (
          <div className="overflow-x-auto">
            <table className="mt-2 w-full border-collapse text-left font-display text-sm">
              <thead>
                <tr className="border-b border-line text-[11px] uppercase tracking-wider text-ink-faint">
                  <th className="py-2 pr-4 font-medium">Trailing by</th>
                  <th className="py-2 pr-4 text-right font-medium">
                    Three optimal
                  </th>
                  <th className="py-2 pr-4 text-right font-medium">
                    Three chosen
                  </th>
                  <th className="py-2 text-right font-medium">Decisions</th>
                </tr>
              </thead>
              <tbody className="font-mono tnum text-ink">
                {margins.map((m) => (
                  <tr key={m.margin} className="border-b border-line-soft">
                    <td className="py-2 pr-4">{m.margin}</td>
                    <td className="py-2 pr-4 text-right">
                      {(m.optimalThreeShare * 100).toFixed(1)}%
                    </td>
                    <td className="py-2 pr-4 text-right">
                      {(m.choseThreeShare * 100).toFixed(1)}%
                    </td>
                    <td className="py-2 text-right">{m.n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p>
          The optimality column moves from single digits to nearly 100% while the
          choice column sits near 55% the whole way. That is the finding, and it
          doubles as the check nothing was tuned for: if the model's idea of the
          right call did <em>not</em> flip with the margin, the model would be
          wrong.
        </p>
      </div>

      <h2 className={H2}>Why teams, why pooled, and how to read the ranking</h2>
      <div className={BODY}>
        <p>
          {meta
            ? meta.whyNotTeamSeason
            : "about 8 decisions per team-season, so per-season intervals are useless; pooling gives ~45 per team"}
          . A per-season figure would look more precise and be less true.
        </p>
        <p>
          Even pooled, about 45 decisions per team leaves intervals wide enough
          that neighbouring places in the 1-to-30 ranking are statistical ties,
          which is why the league page draws one team's 95% interval to the
          same scale as the whole spread right above the list. Grouped by
          interval overlap (
          {meta ? meta.tiering.rule : "a team joins the current tier while its interval overlaps the tier opener's"}
          ), the league resolves into just{" "}
          <span className="font-mono tnum">
            {meta ? meta.spread.tiers : 2}
          </span>{" "}
          distinguishable {meta && meta.spread.tiers === 1 ? "band" : "bands"}:
          teams are far more alike here than a ranked list suggests, so read
          the ranking as an ordering, not a set of verdicts.
        </p>
        <p>
          One statistic needs its own warning.{" "}
          {meta
            ? meta.distinguishableFromOptimal.note
            : "ETM cannot go below zero, so every team's interval excludes zero by construction."}
        </p>
      </div>

      <h2 className={H2}>What this is not</h2>
      <div className={BODY}>
        <p>
          {meta
            ? meta.framing
            : "This is decision expected-value, not a coach rating."}{" "}
          No coach identity exists in this pipeline, so the unit is the team.
          Rosters, personnel, and who was actually available to take the shot
          are not modelled.
        </p>
      </div>

      <h2 className={H2}>Approximations, stated</h2>
      <div className={BODY}>
        <ul className="list-disc space-y-2 pl-5">
          {(meta?.approximations ?? []).map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
        {!meta && (
          <p>
            The miss branch hands the ball to the opponent with the clock nearly
            expired; offensive rebounds and intentional fouls are not modelled.
          </p>
        )}
      </div>

      <p className="mt-14 border-t border-line pt-6">
        <Link
          to="/league/NBA/shot-value"
          className="font-display text-sm font-medium text-ink underline underline-offset-4"
        >
          See Clutch Decision-making on the League page →
        </Link>
      </p>
    </article>
  );
}
