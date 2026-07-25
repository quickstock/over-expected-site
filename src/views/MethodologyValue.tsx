import { Link } from "react-router-dom";
import { useValue } from "../data";
import { useTitle } from "../lib/useTitle";

const H2 = "mt-14 font-display text-xl font-semibold tracking-tight text-ink sm:text-2xl";
const BODY = "mt-4 space-y-4 text-[15px] leading-relaxed text-ink-soft sm:text-base";

/**
 * Methodology for the Value layer. The formula constants and the per-season
 * salary availability come from the live value-NBA.json meta, so the page
 * cannot claim a surplus the export didn't ship.
 */
export default function MethodologyValue() {
  useTitle("Value methodology · Over Expected");
  const state = useValue("NBA");
  const meta = state.status === "ready" ? state.data.meta : null;

  return (
    <article className="mx-auto max-w-2xl px-5 py-12 font-serif sm:px-8 sm:py-16">
      <h1 className="font-display text-3xl font-bold tracking-tight text-ink sm:text-5xl">
        Value and surplus
      </h1>
      <p className="mt-4 text-base leading-relaxed text-ink-soft sm:text-lg">
        Production first, price second. How many wins above a replacement-level
        player did someone contribute, and — where salaries are public — was the
        contract worth it?
      </p>

      <h2 className={H2}>Wins over replacement</h2>
      <div className={BODY}>
        <p>
          The formula is Basketball-Reference's VORP, unchanged in shape:
          impact minus replacement level, scaled by how much of his team's floor
          time a player actually took, prorated for season length, then
          converted to wins.
        </p>
        <p className="font-mono text-sm text-ink">
          VORP = (impact − {meta ? meta.replacementPer100.toFixed(1) : "−2.0"}) ×
          possession share × (team games ÷ 82)
          <br />
          wins over replacement = VORP × {meta ? meta.winsPerVorp : "2.70"}
        </p>
        <p>
          Replacement level is fixed at{" "}
          {meta ? meta.replacementPer100.toFixed(1) : "−2.0"} points per 100, the
          published convention. Possession share is a player's share of his
          team's possessions on both ends, summed across teams so a midseason
          trade neither double-counts him nor drops him.
        </p>
      </div>

      <h2 className={H2}>Why the impact term isn't BPM</h2>
      <div className={BODY}>
        <p>
          The published version of this metric feeds Box Plus/Minus into the
          formula. This build feeds in its own{" "}
          <Link to="/methodology/lineups" className="text-ink underline underline-offset-4">
            adjusted plus-minus
          </Link>{" "}
          instead, for a reason worth stating plainly: BPM is a box-score{" "}
          <em>estimate</em> of a player's per-100 net impact, while RAPM measures
          that same quantity directly from who was on the floor. Substituting a
          regression for an estimate of the same target is an upgrade, not a
          compromise — and both live on the same per-100 scale, centred so the
          league sits at zero, so the replacement level transfers unchanged.
        </p>
        <p>
          The second reason is smaller but real: BPM would have to be scraped
          from a third-party site, and this pipeline has an enforced build guard
          against exactly that, added after imported season totals once
          corrupted a target. That guard is not worth weakening for convenience.
        </p>
      </div>

      <h2 className={H2}>Surplus, and why it may be missing</h2>
      <div className={BODY}>
        <p>
          Surplus is what a player produced minus what he was paid. Cost per win
          comes from the players who have a salary in a given season — their
          combined pay divided by their combined wins over replacement — and each
          player's dollar value is his wins at that rate. Surplus is value minus
          salary.
        </p>
        <p>
          All of that needs a per-player salary for every player, and this build
          does not have one. NBA salaries are genuinely public — Spotrac and
          Basketball-Reference both publish them — so this is not a claim that
          the data does not exist. What failed was <em>automated</em> collection:
          Spotrac serves an "update your browser" block to scripted clients, and
          working around a deliberate access control is not something this
          project will do. A licensed feed or a manual export would supply the
          same figures perfectly well.
        </p>
        <p>
          So when no salary file is present the export ships production only and
          every dollar field is null — never zero, never estimated — and the
          board says so.{" "}
          {meta && !meta.anySalary ? (
            <strong className="text-ink">
              No season currently has salary data, so no surplus is shown
              anywhere on the site.
            </strong>
          ) : null}{" "}
          Nothing about the modelling changes when salaries arrive; they are a
          data drop-in.
        </p>
        <p>
          For the European leagues this is permanent rather than pending. They
          publish club-level remuneration levels and no per-player figures at
          all, so a surplus column there would be invention. The layer stays
          NBA-only until that changes.
        </p>
      </div>

      <h2 className={H2}>What this cannot tell you</h2>
      <div className={BODY}>
        <p>
          Cost per win is a league-average exchange rate, not a team's real
          budget constraint. It ignores the cap's structure entirely — max-salary
          rules, rookie scale, exceptions, dead money and luxury-tax rates all
          mean a dollar is not equally spendable for every team. A "surplus"
          figure is therefore a comparison, not a verdict on a front office.
        </p>
        <p>
          Wins over replacement inherits every limitation of the impact metric
          under it, including that defence is measured far less precisely than
          offence. And a replacement level fixed by convention is a modelling
          choice: shifting it moves every player's total in the same direction.
        </p>
      </div>

      <p className="mt-14 border-t border-line pt-6">
        <Link
          to="/value/NBA"
          className="font-display text-sm font-medium text-ink underline underline-offset-4"
        >
          See the value board →
        </Link>
      </p>
    </article>
  );
}
