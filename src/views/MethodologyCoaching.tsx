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
  useTitle("Decision EV methodology · Over Expected");
  const state = useCoaching("NBA");
  const meta = state.status === "ready" ? state.data.meta : null;
  const margins = state.status === "ready" ? state.data.margins : [];

  return (
    <article className="mx-auto max-w-2xl px-5 py-12 font-serif sm:px-8 sm:py-16">
      <h1 className="font-display text-3xl font-bold tracking-tight text-ink sm:text-5xl">
        Decision expected-value
      </h1>
      <p className="mt-4 text-base leading-relaxed text-ink-soft sm:text-lg">
        One decision, scored honestly: down a possession late, do you shoot the
        three or the two? The answer depends on the margin and on your own
        conversion rates — never on whether the shot dropped.
      </p>

      <h2 className={H2}>What is measured</h2>
      <div className={BODY}>
        <p>
          For every live end-game possession — trailing by{" "}
          {meta ? meta.window.margins.join(", ") : "1–3"} inside{" "}
          <span className="font-mono tnum">
            {meta ? meta.window.maxSeconds : 35}
          </span>{" "}
          seconds of the fourth quarter — both branches are valued with a
          calibrated win-probability model: what happens to your win probability
          if you take the three, and if you take the two. Each branch uses that
          team's own conversion rate for that shot type, so a good three-point
          team is not judged against a league-average one.
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
          A metric that rewards a coach for a shot that happened to drop is a
          metric that rewards luck. Rating decisions on their expected value at
          the moment they were made is the only version of this that means
          anything.
        </p>
      </div>

      <h2 className={H2}>The finding</h2>
      <div className={BODY}>
        <p>
          Whether the three is the right call swings enormously with the margin.
          Trailing by one, a two wins the game outright, so the three is almost
          never right. Trailing by three, only the three can tie. Behaviour does
          not follow:
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
          That the optimality column moves from single digits to nearly 100%
          while the choice column sits near 55% throughout is the result. It is
          also the sanity check nothing was tuned for: if the model's notion of
          optimality did <em>not</em> flip with the margin, it would be wrong.
        </p>
      </div>

      <h2 className={H2}>Why teams, why pooled, why tiers</h2>
      <div className={BODY}>
        <p>
          {meta
            ? meta.whyNotTeamSeason
            : "about 8 decisions per team-season, so per-season intervals are useless; pooling gives ~45 per team"}
          . Reporting a per-season figure anyway would look more precise and be
          less true.
        </p>
        <p>
          Even pooled, ~45 decisions per team gives intervals wide enough that a
          1-to-30 ranking would assert precision the data lacks. So teams are
          grouped into overlap tiers:{" "}
          {meta ? meta.tiering.rule : "a team joins the current tier while its interval overlaps the tier opener's"}
          . The league resolves into just{" "}
          <span className="font-mono tnum">
            {meta ? meta.spread.tiers : 2}
          </span>{" "}
          {meta && meta.spread.tiers === 1 ? "tier" : "tiers"}, which is itself
          the honest summary: teams are much more alike here than a ranked list
          would suggest.
        </p>
        <p>
          One statistic on the board needs its own warning.{" "}
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
          to="/coaching/NBA"
          className="font-display text-sm font-medium text-ink underline underline-offset-4"
        >
          See the decision board →
        </Link>
      </p>
    </article>
  );
}
