import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useData, useLeague } from "../data";
import { LEAGUE_LABEL, leagueDef } from "../leagues";
import type { ShotValueRow } from "../types";
import { int } from "../lib/format";
import { Delta } from "../components/Delta";
import { useTitle } from "../lib/useTitle";
import SegmentedControl from "../components/SegmentedControl";
import Beeswarm from "../components/charts/Beeswarm";
import ExpectedVsActual from "../components/charts/ExpectedVsActual";
import RefStrip from "../components/charts/RefStrip";
import TeamScatter from "../components/charts/TeamScatter";

function seasonShort(s: string) {
  return `'${s.slice(2, 4)}-${s.slice(5)}`;
}

type Lens = "value" | "making" | "fouls";

/** A lens doorway: what it measures + the season's leader, into the board. */
function LensCard({
  lens,
  season,
  label,
  desc,
  row,
  metric,
  count,
}: {
  lens: Lens;
  season: string;
  label: string;
  desc: string;
  row: ShotValueRow | undefined;
  metric: number | undefined;
  count: number;
}) {
  return (
    <Link
      to={`/leaderboard?lens=${lens}&season=${encodeURIComponent(season)}`}
      className="group flex flex-col border-t border-line pt-4 transition-colors duration-150 hover:bg-wash focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
    >
      <span className="font-display text-[11px] font-medium uppercase tracking-wider text-ink-faint">
        {label}
      </span>
      <p className="mt-2 min-h-[3.5rem] text-sm leading-relaxed text-ink-soft">
        {desc}
      </p>
      {row && metric !== undefined && (
        <span className="mt-3 flex items-baseline justify-between gap-2 border-t border-line-soft pt-3">
          <span className="min-w-0 truncate font-display text-[15px] font-semibold text-ink group-hover:underline group-hover:underline-offset-4">
            {row.name}
          </span>
          <Delta per100={metric} className="text-lg" />
        </span>
      )}
      <span className="mt-2 font-mono tnum text-xs text-ink-faint">
        {int(count)} players →
      </span>
    </Link>
  );
}

function SectionHead({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h2 className="font-display text-2xl font-semibold tracking-tight text-ink text-balance sm:text-3xl">
        {title}
      </h2>
      <p className="mt-2 max-w-prose text-sm leading-relaxed text-ink-soft sm:text-base">
        {children}
      </p>
    </div>
  );
}

export default function Landing() {
  const data = useData();
  const { league } = useLeague();
  const def = leagueDef(league);
  useTitle(`Over Expected: ${LEAGUE_LABEL[league]} shot value`);
  const seasons = data.meta.seasons;
  const latest = data.meta.defaultSeason;
  const qualify = data.meta.qualifyPossessions;
  const [season, setSeason] = useState(latest);

  // Shot-value pool for the season (already sorted by points over expected).
  const svPool = useMemo(() => data.shotValue?.[season] ?? [], [data.shotValue, season]);
  const byValue = svPool[0];
  const byMaking = useMemo(
    () => [...svPool].sort((a, b) => b.fgPoe100 - a.fgPoe100)[0],
    [svPool],
  );
  const byFouls = useMemo(
    () => [...svPool].sort((a, b) => b.ftaoe100 - a.ftaoe100)[0],
    [svPool],
  );

  // FTAOE distribution for the beeswarm.
  const swarmPool = useMemo(
    () =>
      data.leaderboard
        .filter((r) => r.season === season && r.poss >= qualify)
        .map((r) => ({ id: r.id, name: r.name, per100: r.per100 })),
    [data.leaderboard, season, qualify],
  );

  /**
   * Spearman correlation between what a player shot and what his looks were
   * worth. Quoted under the chart because the eye can see that the cloud
   * follows the diagonal but cannot put a number on how tightly, and the number
   * is the claim. Computed here rather than exported, since it is two sorts
   * over a list the page already holds.
   */
  const moves = useMemo(() => {
    if (svPool.length < 40) return null;
    const n = svPool.length;
    const rank = (key: (r: ShotValueRow) => number) => {
      const order = [...svPool].sort((a, b) => key(a) - key(b));
      const m = new Map<string, number>();
      order.forEach((r, i) => m.set(r.id, i));
      return svPool.map((r) => m.get(r.id)!);
    };
    const a = rank((r) => r.fgPct);
    const b = rank((r) => r.xfgPct);
    const mean = (n - 1) / 2;
    let num = 0, da = 0, db = 0;
    for (let i = 0; i < n; i++) {
      num += (a[i] - mean) * (b[i] - mean);
      da += (a[i] - mean) ** 2;
      db += (b[i] - mean) ** 2;
    }
    return { rho: num / Math.sqrt(da * db) };
  }, [svPool]);

  const teams = data.teams?.[season] ?? [];
  const refs = data.referees?.[season] ?? [];

  return (
    <div className="mx-auto max-w-4xl px-5 sm:px-8">
      {/* hero: the thesis + three lenses */}
      <section className="pt-14 sm:pt-20">
        <p className="font-mono tnum text-xs text-ink-faint">
          {LEAGUE_LABEL[league]} · {seasons[0]} to{" "}
          {seasons[seasons.length - 1]} · {int(data.meta.nPossessions)}{" "}
          possessions
        </p>
        <h1 className="mt-4 font-display text-5xl font-bold leading-[1.02] tracking-tight text-balance text-ink sm:text-7xl">
          Every shot, over expected.
        </h1>
        <p className="mt-5 max-w-prose text-base leading-relaxed text-ink-soft sm:text-lg">
          What a shot is worth in {def.inLabel}: the make, and the
          {def.sftaOnly ? " fouls" : " free throws"} it draws, measured against
          the league. Three reads on the same number, for every player, team,
          and official.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-3">
          <SegmentedControl
            ariaLabel="Season"
            options={seasons.map((s) => ({
              value: s,
              label: s,
              shortLabel: seasonShort(s),
            }))}
            value={season}
            onChange={setSeason}
          />
          <span className="font-mono tnum text-xs text-ink-faint">
            {int(svPool.length)} qualified players
          </span>
        </div>

        {/* three-lens triptych */}
        <div className="mt-10 grid gap-x-8 gap-y-6 sm:grid-cols-3">
          <LensCard
            lens="value"
            season={season}
            label="Shot value"
            desc="The points a player adds over expected: shots made above their difficulty, plus the free throws he draws."
            row={byValue}
            metric={byValue?.poe100}
            count={svPool.length}
          />
          <LensCard
            lens="making"
            season={season}
            label="Shot-making"
            desc="Converting better, or worse, than the difficulty of the looks taken. Field goals only."
            row={byMaking}
            metric={byMaking?.fgPoe100}
            count={svPool.length}
          />
          <LensCard
            lens="fouls"
            season={season}
            label="Foul-drawing"
            desc="Free throws drawn above the league's rate for the same context. The original FTAOE."
            row={byFouls}
            metric={byFouls?.ftaoe100}
            count={svPool.length}
          />
        </div>

        <div className="mt-10 flex flex-wrap items-center gap-5">
          <Link
            to="/leaderboard"
            className="rounded-md bg-ink px-5 py-2.5 font-display text-sm font-medium text-paper transition-opacity duration-150 hover:opacity-85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            Explore the leaderboard
          </Link>
          <Link
            to="/methodology"
            className="font-display text-sm font-medium text-ink underline underline-offset-4 transition-colors duration-150 hover:text-ink-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            How it's measured →
          </Link>
        </div>
      </section>

      {/* the league, every player */}
      <section className="mt-20 border-t border-line pt-12 sm:mt-28">
        <SectionHead title={`${LEAGUE_LABEL[league]}, every player, ${season}`}>
          Foul-drawing per 100 possessions, one dot per qualified player. The
          shot value, shot-making, and foul-drawing boards all sort this same
          pool a different way.
        </SectionHead>
        <Beeswarm
          className="mt-6"
          players={swarmPool}
          season={season}
          league={league}
        />
        <p className="mt-3 text-xs text-ink-faint">
          {int(swarmPool.length)} players with ≥ {int(qualify)} possessions. Tap
          a dot for the player, or{" "}
          <Link to="/leaderboard" className="underline underline-offset-2 transition-colors duration-150 hover:text-ink">
            open the full board
          </Link>
          .
        </p>
      </section>

      {/* the argument: FG% is mostly the shot menu */}
      {moves && (
        <section className="mt-20 border-t border-line pt-12 sm:mt-28">
          <SectionHead title="What FG% gets wrong">
            Field-goal percentage says what a player shot, not how well he shot
            it. Each dot is a qualified player, placed by what the shots he
            took were worth against what he actually shot.
          </SectionHead>
          <div className="mt-6 grid items-center gap-x-8 gap-y-4 lg:grid-cols-[minmax(0,28rem)_minmax(0,1fr)]">
            <ExpectedVsActual rows={svPool} league={league} season={season} height={460} />
            <p className="max-w-prose text-xs leading-relaxed text-ink-faint lg:self-end lg:pb-14">
            The cloud rides the diagonal: across{" "}
            <span className="font-mono tnum">{int(svPool.length)}</span> players
            the two axes correlate{" "}
            <span className="font-mono tnum">{moves.rho.toFixed(2)}</span>, so
            most of where a player sits on the shooting-percentage ladder is
            decided by the shots he takes. The part that is the player is the
            vertical distance from the line, and it is what this site measures.{" "}
            <Link
              to={`/leaderboard?lens=making&season=${encodeURIComponent(season)}`}
              className="underline underline-offset-2 transition-colors duration-150 hover:text-ink"
            >
              Every player on this lens →
            </Link>
            </p>
          </div>
        </section>
      )}

      {/* teams */}
      <section className="mt-20 border-t border-line pt-12 sm:mt-28">
        <SectionHead title={`Teams: drawn vs conceded, ${season}`}>
          {def.sftaOnly ? "Shooting fouls" : "Free throws"} each team draws
          against what it concedes, per 100 possessions over expected. The
          context a player's number rides on.
        </SectionHead>
        <div className="mt-6">
          <TeamScatter
            teams={teams}
            off={(t) => t.drawn}
            def={(t) => t.conceded}
            xAxis="draws more →"
            defLabel="Conceded"
          />
        </div>
        <p className="mt-2">
          <Link to="/league" className="font-display text-sm font-medium text-ink underline underline-offset-4 transition-colors duration-150 hover:text-ink-soft">
            League context →
          </Link>
        </p>
      </section>

      {/* officials */}
      <section className="mt-20 border-t border-line pt-12 sm:mt-28">
        <SectionHead title={`Officials, measured, ${season}`}>
          Each dot is one official (minimum {def.refMinGames} games): the
          {def.sftaOnly ? " shooting-foul" : " drawn-FT"} rate in games they
          worked, against the season's league rate. Descriptive and
          league-level, never crossed with players.
        </SectionHead>
        <div className="mt-6">
          <RefStrip refs={refs} />
        </div>
        <p className="mt-2">
          <Link to={`/referees?season=${encodeURIComponent(season)}`} className="font-display text-sm font-medium text-ink underline underline-offset-4 transition-colors duration-150 hover:text-ink-soft">
            Every official →
          </Link>
        </p>
      </section>

      {/* how it's measured */}
      <section className="mt-20 border-t border-line pt-12 sm:mt-28">
        <SectionHead title="What this measures, and what it doesn't">
          Leak-free models, anchored season by season: a shot's expected value
          never comes from a model that saw it. The number blends playstyle,
          skill, and officiating. It does not isolate them, and it does not
          prove referee bias.
        </SectionHead>
        <div className="mt-5 flex flex-wrap items-center gap-5">
          <Link
            to="/methodology"
            className="font-display text-sm font-medium text-ink underline underline-offset-4 transition-colors duration-150 hover:text-ink-soft"
          >
            Full methodology →
          </Link>
          <Link
            to="/data"
            className="font-display text-sm font-medium text-ink underline underline-offset-4 transition-colors duration-150 hover:text-ink-soft"
          >
            Get the data →
          </Link>
          {def.hasStory && def.crackdownSeason && (
            <Link
              to="/crackdown"
              className="font-display text-sm font-medium text-ink underline underline-offset-4 transition-colors duration-150 hover:text-ink-soft"
            >
              The {def.crackdownSeason} crackdown →
            </Link>
          )}
        </div>
      </section>
    </div>
  );
}
