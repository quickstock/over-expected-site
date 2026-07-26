import { Link } from "react-router-dom";
import { useDefense } from "../data";
import { useTitle } from "../lib/useTitle";

const H2 =
  "mt-14 font-display text-xl font-semibold tracking-tight text-ink sm:text-2xl";
const BODY =
  "mt-4 space-y-4 text-[15px] leading-relaxed text-ink-soft sm:text-base";

/**
 * Methodology for Layer 4. The reliability figures, the rejected player-level
 * result, and the not-modelled list all come from the live defense-NBA.json
 * meta, so the page states what the export measured rather than what it was
 * hoped to measure.
 */
export default function MethodologyDefense() {
  useTitle("Team defence methodology · Over Expected");
  const state = useDefense("NBA");
  const meta = state.status === "ready" ? state.data.meta : null;

  return (
    <article className="mx-auto max-w-2xl px-5 py-12 font-serif sm:px-8 sm:py-16">
      <h1 className="font-display text-3xl font-bold tracking-tight text-ink sm:text-5xl">
        Team defence
      </h1>
      <p className="mt-4 text-base leading-relaxed text-ink-soft sm:text-lg">
        Two separable questions: how bad were the shots a defence forced, and
        did opponents then convert below what those shots were worth. One is
        much more reliably measured than the other, and the board says which.
      </p>

      <h2 className={H2}>The story worth telling first: what didn't ship</h2>
      <div className={BODY}>
        <p>
          This layer was originally built as a{" "}
          <em>player</em> defensive rating. Every shot was attributed to the five
          defenders on the floor for it and scored against expectation. It
          worked, it produced a clean leaderboard, and it was rejected.
        </p>
        <p>
          Two independent signals killed it. Split-half reliability was{" "}
          <span className="font-mono tnum">
            {meta ? meta.playerLevelRejected.spearmanBrown.toFixed(3) : "0.348"}
          </span>{" "}
          — at season sample sizes, mostly noise. And the leaderboard failed the
          laugh test badly, placing players no one considers good defenders among
          the league's best.
        </p>
        <p>
          The cause is structural rather than tunable:{" "}
          {meta
            ? meta.playerLevelRejected.why
            : "attributing every shot equally to five defenders makes it a team metric with shared credit."}
        </p>
        <p>
          Five-way credit sharing stops being a confound when the unit{" "}
          <em>is</em> the team. So the team version ships and the player version
          does not. For the player question, use{" "}
          <Link
            to="/methodology/lineups"
            className="text-ink underline underline-offset-4"
          >
            D-RAPM
          </Link>
          , which solves the teammate problem by regression instead of ignoring
          it.
        </p>
      </div>

      <h2 className={H2}>The two pillars, and their reliability</h2>
      <div className={BODY}>
        <p>
          The same split-half test that rejected the player metric was run on the
          team version, on{" "}
          <span className="font-mono tnum">
            {meta ? meta.reliability.nTeamSeasons : 180}
          </span>{" "}
          team-seasons with at least{" "}
          <span className="font-mono tnum">
            {meta ? meta.reliability.minShotsPerHalf : 500}
          </span>{" "}
          shots faced in each half. Reporting it was the condition for shipping
          at all:
        </p>
        {meta && (
          <div className="overflow-x-auto">
            <table className="mt-2 w-full border-collapse text-left font-display text-sm">
              <thead>
                <tr className="border-b border-line text-[11px] uppercase tracking-wider text-ink-faint">
                  <th className="py-2 pr-4 font-medium">Pillar</th>
                  <th className="py-2 pr-4 text-right font-medium">
                    Reliability
                  </th>
                  <th className="py-2 font-medium">Reads as</th>
                </tr>
              </thead>
              <tbody className="text-ink">
                {meta.pillars.map((p) => (
                  <tr key={p.key} className="border-b border-line-soft">
                    <td className="py-2 pr-4">{p.label}</td>
                    <td className="py-2 pr-4 text-right font-mono tnum">
                      {p.spearmanBrown.toFixed(3)}
                    </td>
                    <td className="py-2 text-ink-soft">
                      {p.spearmanBrown >= 0.9
                        ? "solid"
                        : p.spearmanBrown >= 0.7
                          ? "usable"
                          : "noisy"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p>
          <strong className="font-display font-semibold text-ink">
            Quality forced
          </strong>{" "}
          is expected points per shot faced, measured against the league mean and
          signed so positive means worse shots forced. It is the most reliable of
          the three and the part a defence genuinely controls — it is a
          statement about shot selection imposed, not about luck.
        </p>
        <p>
          <strong className="font-display font-semibold text-ink">
            Rim deterrence
          </strong>{" "}
          is the share of shots faced that came from the restricted area, against
          the league rate, signed so positive means fewer. Nearly as reliable.
        </p>
        <p>
          <strong className="font-display font-semibold text-ink">
            Conversion suppression
          </strong>{" "}
          is points allowed below expectation per 100 defensive possessions. It
          is measurably the noisiest at{" "}
          <span className="font-mono tnum">
            {meta
              ? meta.pillars
                  .find((p) => p.key === "suppression")!
                  .spearmanBrown.toFixed(2)
              : "0.72"}
          </span>
          , which is the empirical version of a well-known claim: opponent
          shot-making is substantially outside a defence's control. A single
          season of it is closer to a hint than a rating, and the board labels it
          that way rather than presenting all three as equivalent.
        </p>
      </div>

      <h2 className={H2}>How a shot is attributed</h2>
      <div className={BODY}>
        <p>
          Each shot is matched to the possession it belongs to using the same
          possession windows the lineups layer uses, which gives the five
          defenders on the floor. The defending team is then derived rather than
          assumed: a game names exactly two teams across its possessions, so the
          defence is whichever one did not have the ball. Any game that does not
          name exactly two is dropped and counted, so a broken assumption
          surfaces as a skip count instead of quietly mislabelling a team.
        </p>
        <p>
          {meta
            ? meta.leagueCentred
            : "Quality conceded and rim rate are expressed against the same season's league mean, so pace and rule changes do not leak into a team's figure."}
        </p>
      </div>

      <h2 className={H2}>What is missing, named not approximated</h2>
      <div className={BODY}>
        <ul className="list-disc space-y-2 pl-5">
          {(meta?.notModelled ?? []).map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
        <p>
          The second of those is the hard ceiling on all public defensive work.
          A rim protector who makes attackers miss and one who makes them stop
          coming look identical in this data, and the per-shot closest-defender
          field that would separate them has not been public since around 2016.
        </p>
      </div>

      <h2 className={H2}>Why NBA only</h2>
      <div className={BODY}>
        <p>
          {meta
            ? meta.unavailableReason
            : "This layer needs shot-level expected points against a reconstructed five-man defensive lineup, which no European league publishes."}{" "}
          The other {meta ? meta.leaguesUnavailable.length : 8} leagues on this
          site show an explicit unavailable panel rather than an empty board,
          because absent and not-yet-processed are different claims.
        </p>
      </div>

      <p className="mt-14 border-t border-line pt-6">
        <Link
          to="/defense/NBA"
          className="font-display text-sm font-medium text-ink underline underline-offset-4"
        >
          See the defence board →
        </Link>
      </p>
    </article>
  );
}
