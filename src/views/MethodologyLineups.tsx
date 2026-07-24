import { Link } from "react-router-dom";
import { useRapm } from "../data";
import { useTitle } from "../lib/useTitle";

const H2 = "mt-14 font-display text-xl font-semibold tracking-tight text-ink sm:text-2xl";
const BODY = "mt-4 space-y-4 text-[15px] leading-relaxed text-ink-soft sm:text-base";

/**
 * Methodology for the Lineups / RAPM layer. Prose is Source Serif via the
 * article wrapper; the CV table, collinearity list, and OOS number are
 * rendered from the live rapm-NBA.json meta so the page never drifts from
 * what shipped. Honest limitations section is mandatory.
 */
export default function MethodologyLineups() {
  useTitle("Lineups methodology · Over Expected");
  const state = useRapm("NBA");
  const meta = state.status === "ready" ? state.data.meta : null;

  return (
    <article className="mx-auto max-w-2xl px-5 py-12 font-serif sm:px-8 sm:py-16">
      <h1 className="font-display text-3xl font-bold tracking-tight text-ink sm:text-5xl">
        Lineups &amp; RAPM
      </h1>
      <p className="mt-4 text-base leading-relaxed text-ink-soft sm:text-lg">
        How much does a player add per 100 possessions once you strip out who
        he shares the floor with and who he plays against? That is regularized
        adjusted plus-minus. Here is exactly how this build computes it, what
        it can say, and what it cannot.
      </p>

      <h2 className={H2}>What it measures</h2>
      <div className={BODY}>
        <p>
          Two numbers per player-season: <strong>offensive RAPM</strong> (points
          per 100 the offense scores above average with him on the floor) and{" "}
          <strong>defensive RAPM</strong> (points per 100 the defense prevents,
          signed so positive is always better). Net is their sum. Every number
          is over an average rotation player, not zero-baseline replacement.
        </p>
      </div>

      <h2 className={H2}>Building the stints</h2>
      <div className={BODY}>
        <p>
          Every possession in the play-by-play is stamped with the ten players
          on the floor at the moment it starts. The NBA's authoritative
          on/off endpoint is rate-limited to the point of being unusable at
          scale, so the ten-man lineups are reconstructed from the
          substitution events in the play-by-play itself — parsed with name
          resolution that survives diacritics, generational suffixes,
          mid-career renames, and same-surname teammates.
        </p>
        <p>
          Each possession is attributed to the five on the floor when it
          began; a substitution in the middle of a free-throw trip leaves the
          possession with the lineup that started it. A possession only counts
          when both teams resolve to exactly five players and the game's
          points reconstruct exactly from the play-by-play score.{" "}
          {meta && (
            <>
              {meta.gamesKept.toLocaleString()} of {meta.totalGames.toLocaleString()}{" "}
              games clear both gates ({(meta.gamesKept / meta.totalGames * 100).toFixed(1)}%);
              the {meta.skippedGames} skipped are missing, not wrong, and the
              rest are corrupt feeds excluded the same way every league in this
              project excludes them.
            </>
          )}
        </p>
      </div>

      <h2 className={H2}>The regression</h2>
      <div className={BODY}>
        <p>
          One row per possession, one column per player's offense and per
          player's defense, plus an intercept and a home-offense term. Points
          per 100 is regressed on that design with a ridge penalty — the
          shrinkage that keeps a player who only ever shared the floor with one
          teammate from absorbing that teammate's value. The penalty strength λ
          is chosen by 10-fold cross-validation over held-out <em>games</em>,
          scoring each fold on how well summed possession predictions
          reconstruct real game margins.
        </p>
        <p>
          RAPM has to beat two baselines on that same out-of-sample test to
          ship: a model with only home-court and the league mean, and the
          box-score prior summed with no per-player fit. It does, every season:
        </p>
        {meta && (
          <div className="overflow-x-auto">
            <table className="mt-2 w-full max-w-md border-collapse text-sm">
              <thead>
                <tr className="border-b border-line text-left font-display text-[11px] uppercase tracking-wider text-ink-faint">
                  <th className="py-1.5 pr-3">Season</th>
                  <th className="py-1.5 pr-3 text-right">λ</th>
                  <th className="py-1.5 pr-3 text-right">RAPM</th>
                  <th className="py-1.5 pr-3 text-right">Prior-sum</th>
                  <th className="py-1.5 text-right">HCA only</th>
                </tr>
              </thead>
              <tbody className="font-mono tnum">
                {meta.cv.map((r) => (
                  <tr key={r.season} className="border-b border-line-soft">
                    <td className="py-1.5 pr-3 font-sans">{r.season}</td>
                    <td className="py-1.5 pr-3 text-right">{r.lam.toFixed(0)}</td>
                    <td className="py-1.5 pr-3 text-right text-ink">{r.rmseRapm.toFixed(2)}</td>
                    <td className="py-1.5 pr-3 text-right">{r.rmsePriorSum?.toFixed(2) ?? "–"}</td>
                    <td className="py-1.5 text-right">{r.rmseHca.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-1 text-xs text-ink-faint">Held-out game-margin RMSE (points). Lower is better.</p>
          </div>
        )}
      </div>

      <h2 className={H2}>The box-score prior</h2>
      <div className={BODY}>
        <p>
          The default display shrinks each player toward a prior built from his
          per-100 box score, rather than toward zero. The map from box stats to
          RAPM is fit leave-one-season-out — the target season's prior comes
          only from the other five seasons — so it never sees the season it
          informs. Box stats predict offense far better than defense
          {meta && (
            <> (out-of-sample R² around{" "}
              {(Object.values(meta.boxPriorR2).reduce((a, b) => a + (b.o ?? 0), 0) / Object.keys(meta.boxPriorR2).length).toFixed(2)}{" "}
              offense,{" "}
              {(Object.values(meta.boxPriorR2).reduce((a, b) => a + (b.d ?? 0), 0) / Object.keys(meta.boxPriorR2).length).toFixed(2)}{" "}
              defense)</>
          )}
          , which is exactly why defense needs the on/off signal most. Toggle to
          plain ridge on the board to see the un-priored estimate.
        </p>
      </div>

      <h2 className={H2}>Error bars and inseparable players</h2>
      <div className={BODY}>
        <p>
          The whiskers on the scatter are ±1 standard error from the ridge
          sandwich — approximate, and wide for low-minute players, which is the
          honest picture: a half-season of possessions cannot pin a player to a
          tenth of a point. Two players who almost always play together are
          nearly impossible to separate; the regression splits them somewhat
          arbitrarily.{" "}
          {meta && meta.collinear.length > 0 ? (
            <>The near-inseparable pairs in this data:{" "}
              {meta.collinear.slice(0, 8).map((c, i) => (
                <span key={`${c.season}-${c.a}-${c.b}`}>
                  {i > 0 ? "; " : ""}{c.aName} &amp; {c.bName} ({c.season})
                </span>
              ))}.
            </>
          ) : (
            <>No pair in this data crosses the near-duplicate threshold.</>
          )}
        </p>
      </div>

      <h2 className={H2}>Lineup synergy</h2>
      <div className={BODY}>
        <p>
          A five-man lineup's synergy is what it does beyond the sum of its
          members' individual RAPM — actual net rating minus expected. The
          novel piece is decomposing it with the site's shot-value model:{" "}
          <strong>shot-quality synergy</strong> asks whether a lineup generates
          better looks together than its players do individually, using the
          same shooter-agnostic expected-points-per-shot that powers the shot
          value board.
        </p>
        <p>
          The honest result: lineup synergy does not persist.{" "}
          {meta && meta.synergyOOS.r !== null ? (
            <>Split each season at its midpoint and first-half synergy
              correlates just r={meta.synergyOOS.r.toFixed(2)} (n={meta.synergyOOS.n})
              with second-half overperformance — essentially zero.</>
          ) : (
            <>Too few lineups repeat across halves to measure persistence.</>
          )}{" "}
          High in-sample synergy is mostly small-sample noise and unsustainable
          shot-making, not a durable chemistry effect. It is a description of
          what happened, not a forecast — and the board says so.
        </p>
      </div>

      <h2 className={H2}>Limitations</h2>
      <div className={BODY}>
        <p>
          RAPM is single-season noisy; even at this sample the error bars are
          real and the tail ranks shuffle year to year. There is no player
          tracking here — no defender distance, no matchup data — so defensive
          RAPM is an on/off inference, not a measurement of what a defender did
          to a specific shot. The tracking-era gold standard for that is the
          expected-possession-value work of Cervone and coauthors (2016), which
          this approximates from public data and does not replace.
        </p>
        <p>
          Defensive <em>synergy</em> in particular is only half-built: the
          shot-quality split covers offense today and waits on the defensive
          layer to attribute opponent shot suppression to a lineup. Everything
          here is descriptive — it blends skill, role, and teammate quality,
          and does not claim to isolate any one of them.
        </p>
      </div>

      <p className="mt-14 text-sm text-ink-faint">
        <Link to="/lineups/NBA" className="underline decoration-warm decoration-2 underline-offset-2">
          Back to the lineups board →
        </Link>
      </p>
    </article>
  );
}
