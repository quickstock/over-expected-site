/**
 * Layer 3 — decision expected-value on the end-game 2-vs-3 choice.
 *
 * The margin panel leads, not the team table, because the finding is about the
 * decision and not about ranking 30 teams: optimality swings from 8% to nearly
 * 100% across the trailing margin while choice barely moves off 55%. The team
 * table renders overlap tiers rather than ranks, for the same reason the
 * lineups board does — ~45 decisions per team is not a 1-to-30 ordering.
 *
 * All hooks run before any conditional return. Calling one after an early
 * return changes the hook count once the fetch resolves, which is React error
 * #310 and blanks the route.
 */
import { useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { useCoaching, useLeague } from "../../data";
import { ACTIVE_LEAGUES, leagueDef, type League } from "../../leagues";
import { divergingText } from "../../lib/color";
import { int } from "../../lib/format";
import { useTitle } from "../../lib/useTitle";

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

function Unavailable({ label }: { label: string }) {
  return (
    <div className="mx-auto max-w-xl px-5 py-28 text-center sm:px-8">
      <p className="font-display text-2xl font-semibold text-ink">
        Decision EV isn't built for {label} yet.
      </p>
      <p className="mt-3 text-sm leading-relaxed text-ink-soft">
        Scoring an end-game decision needs play-by-play with a running clock,
        a win-probability model fitted on that league, and each team's own
        conversion rates. The NBA pipeline has all three; the European feeds
        are a later build.
      </p>
      <Link
        to="/coaching/NBA"
        className="mt-8 inline-block rounded-md bg-ink px-5 py-2.5 font-display text-sm font-medium text-paper transition-opacity duration-150 hover:opacity-85"
      >
        See the NBA decisions
      </Link>
    </div>
  );
}

/** Two bars per margin: how often the three was right, how often it was taken.
    The gap between them is the whole point, so they share one axis. */
function MarginPanel({
  rows,
}: {
  rows: { margin: number; n: number; optimalThreeShare: number; choseThreeShare: number }[];
}) {
  return (
    <div className="mt-8 rounded-md border border-line-soft bg-wash px-4 py-5 sm:px-6">
      <p className="font-display text-sm font-semibold text-ink">
        Teams take the three about as often no matter whether it's the right call.
      </p>
      <p className="mt-1.5 text-xs leading-relaxed text-ink-soft">
        Trailing by one, a two wins the game outright and the three is almost
        never the higher-EV choice. Trailing by three, only the three can tie.
        Optimality swings across that range; behaviour barely does.
      </p>
      <div className="mt-5 flex flex-col gap-4">
        {rows.map((m) => (
          <div key={m.margin}>
            <div className="flex items-baseline justify-between">
              <span className="font-display text-[11px] font-medium uppercase tracking-wider text-ink-faint">
                Trailing by {m.margin}
              </span>
              <span className="font-mono tnum text-[10px] text-ink-faint">
                {int(m.n)} decisions
              </span>
            </div>
            <div className="mt-1.5 flex flex-col gap-1">
              {(
                [
                  ["Three is optimal", m.optimalThreeShare, "cool"],
                  ["Three was chosen", m.choseThreeShare, "warm"],
                ] as [string, number, string][]
              ).map(([label, v, tone]) => (
                <div key={label} className="flex items-center gap-2.5">
                  <span className="w-32 shrink-0 text-[11px] text-ink-soft sm:w-36">
                    {label}
                  </span>
                  <span className="relative block h-2.5 flex-1 rounded-full bg-paper">
                    <span
                      className="absolute inset-y-0 left-0 rounded-full"
                      style={{
                        width: `${(v * 100).toFixed(1)}%`,
                        background:
                          tone === "cool"
                            ? "var(--color-cool)"
                            : "var(--color-warm)",
                      }}
                    />
                  </span>
                  <span className="w-12 shrink-0 text-right font-mono tnum text-xs text-ink">
                    {pct(v)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function CoachingBoard() {
  const { lg } = useParams();
  const league = (lg && ACTIVE_LEAGUES.includes(lg as League)
    ? lg
    : ACTIVE_LEAGUES[0]) as League;
  const def = leagueDef(league);
  const { league: active, setLeague } = useLeague();
  useEffect(() => {
    if (league !== active) setLeague(league);
  }, [league, active, setLeague]);
  useTitle("Decision EV · Over Expected");

  const state = useCoaching(league);

  if (!def.layers?.coaching) return <Unavailable label={def.label} />;
  if (state.status === "loading")
    return (
      <div className="mx-auto max-w-4xl px-6 py-24">
        <div className="h-64 animate-pulse rounded bg-wash" />
      </div>
    );
  if (state.status === "error")
    return (
      <p className="mx-auto max-w-xl px-6 py-32 text-center text-ink-soft">
        The decision data failed to load.
      </p>
    );

  const { meta, margins, teams } = state.data;
  const worst = Math.max(...teams.map((t) => t.etm));

  return (
    <div className="mx-auto max-w-4xl px-5 pt-8 pb-16 sm:px-8 sm:pt-12">
      <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
        Decision EV
      </h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
        The end-game shot-selection decision, scored on expectations at the
        moment of the choice. A team trailing inside{" "}
        <span className="font-mono tnum">{meta.window.maxSeconds}</span> seconds
        of the fourth either shoots a three or a two; which is better depends on
        that team's own conversion rates and on what each branch does to its win
        probability. <strong className="font-semibold text-ink">Never</strong> on
        whether the shot went in — the outcome is not an input, and a test
        re-scores every decision with the result flipped to prove it.
      </p>

      <MarginPanel rows={margins} />

      <div className="mt-10">
        <h2 className="font-display text-xl font-semibold text-ink">
          By team
        </h2>
        <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-soft">
          Win probability given up per decision, seasons pooled — the median
          team-season has about eight of these, so per-season figures would be
          noise. Teams are grouped into{" "}
          <span className="font-mono tnum">{meta.spread.tiers}</span>{" "}
          {meta.spread.tiers === 1 ? "tier" : "tiers"} by whether their
          intervals overlap. Inside a tier there is no ordering to read.
        </p>

        <div className="mt-6 hidden grid-cols-[3rem_minmax(0,1fr)_5rem_11rem] items-end gap-x-4 border-b border-line pb-2 sm:grid">
          <span className="font-display text-[11px] font-medium uppercase tracking-wider text-ink-faint">
            Tier
          </span>
          <span className="font-display text-[11px] font-medium uppercase tracking-wider text-ink-faint">
            Team
          </span>
          <span className="text-right font-display text-[11px] font-medium uppercase tracking-wider text-ink-faint">
            Decisions
          </span>
          <span className="text-right font-display text-[11px] font-medium uppercase tracking-wider text-ink-faint">
            WP given up
          </span>
        </div>

        <ol>
          {teams.map((t, i) => (
            <li key={t.teamId} className="cv-row border-b border-line-soft">
              <div className="hidden grid-cols-[3rem_minmax(0,1fr)_5rem_11rem] items-center gap-x-4 py-3 sm:grid">
                {/* tier printed once per band, as on the lineups board */}
                <span className="font-mono tnum text-sm text-ink-faint">
                  {i === 0 || teams[i - 1].tier !== t.tier ? `T${t.tier}` : ""}
                </span>
                <span className="font-display text-[15px] font-semibold text-ink">
                  {t.team}
                </span>
                <span className="text-right font-mono tnum text-sm text-ink-soft">
                  {t.decisions}
                </span>
                <span className="flex items-center justify-end gap-3">
                  <span
                    className="relative block h-1.5 w-20"
                    aria-hidden="true"
                  >
                    <span
                      className="absolute left-0 top-0 h-full rounded-full"
                      style={{
                        width: `${((t.etm / worst) * 100).toFixed(1)}%`,
                        background: divergingText(-t.etm),
                      }}
                    />
                  </span>
                  <span className="w-20 text-right">
                    <span className="block font-mono tnum text-lg text-ink">
                      {t.etm.toFixed(2)}
                    </span>
                    <span className="block font-mono tnum text-[10px] text-ink-faint">
                      {t.ci[0].toFixed(2)} to {t.ci[1].toFixed(2)}
                    </span>
                  </span>
                </span>
              </div>
              <div className="flex items-baseline gap-2.5 py-3 sm:hidden">
                <span className="w-7 font-mono tnum text-xs text-ink-faint">
                  {i === 0 || teams[i - 1].tier !== t.tier ? `T${t.tier}` : ""}
                </span>
                <span className="flex-1 font-display text-[15px] font-semibold text-ink">
                  {t.team}
                </span>
                <span className="font-mono tnum text-lg text-ink">
                  {t.etm.toFixed(2)}
                </span>
              </div>
            </li>
          ))}
        </ol>

        <p className="mt-5 text-xs leading-relaxed text-ink-faint">
          Units are percentage points of win probability lost per decision, so{" "}
          <span className="font-mono tnum">
            {meta.spread.bestEtm.toFixed(2)}
          </span>{" "}
          ({meta.spread.bestTeam}) to{" "}
          <span className="font-mono tnum">
            {meta.spread.worstEtm.toFixed(2)}
          </span>{" "}
          ({meta.spread.worstTeam}) across the league. Every team's interval
          excludes zero, but that is true by construction rather than a finding:
          the measure cannot go below zero, so "worse than always-optimal"
          describes all 30.{" "}
          <Link
            to="/methodology/coaching"
            className="underline underline-offset-2 hover:text-ink"
          >
            How this is computed, and what it ignores
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
