import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { inArchive, seasonOptions, useArchive, useData, useLeague } from "../data";
import {
  DEFAULT_BOARD_LENS,
  DEFAULT_LEAGUE_LENS,
  boardLensSlug,
  boardPath,
  datedPart,
  leaguePath,
  refereesPath,
} from "../routes";
import { LEAGUE_LABEL, leagueDef , type League } from "../leagues";
import type { ShotValueRow } from "../types";
import { int, signed } from "../lib/format";
import { CountDelta } from "../components/CountDelta";
import RankList, { type RankItem } from "../components/RankList";
import SectionRail from "../components/SectionRail";
import { divergingText } from "../lib/color";
import { useTitle } from "../lib/useTitle";
import SegmentedControl from "../components/SegmentedControl";
import Beeswarm from "../components/charts/Beeswarm";
import ExpectedVsActual from "../components/charts/ExpectedVsActual";
import RefStrip from "../components/charts/RefStrip";
import TeamScatter from "../components/charts/TeamScatter";
import WeeklyTeaser from "../components/WeeklyTeaser";
import ShotCloud from "../components/ShotCloud";
import Headshot from "../components/Headshot";
import { PRESETS, explorePath } from "../lib/explore";

function seasonShort(s: string) {
  return `'${s.slice(2, 4)}-${s.slice(5)}`;
}

type Lens = "value" | "making" | "fouls";

/** The homepage's sections, in order, for the side rail. */
const RAIL = [
  { id: "oe-top", label: "This week" },
  { id: "oe-lenses", label: "Lenses" },
  { id: "oe-players", label: "Every player" },
  { id: "oe-fg", label: "What FG% gets wrong" },
  { id: "oe-teams", label: "Teams" },
  { id: "oe-officials", label: "Officials" },
  { id: "oe-method", label: "Method" },
];

/**
 * A lens doorway as a square tile: what it measures, the season's leader with
 * his number counting up, and the next four, into the board. The whole tile is
 * one link, so the ranked rows are plain text.
 */
function LensCard({
  lens,
  league,
  season,
  current,
  label,
  desc,
  rows,
  metric,
  count,
}: {
  lens: Lens;
  league: League;
  season: string;
  /** The league's current season: linking to it uses the evergreen URL. */
  current: string;
  label: string;
  desc: string;
  /** The lens's top five, best first. */
  rows: ShotValueRow[];
  metric: (r: ShotValueRow) => number;
  count: number;
}) {
  const [leader, ...next] = rows;
  return (
    <Link
      to={boardPath(league, boardLensSlug(lens), season === current ? undefined : season)}
      className="group flex flex-col rounded-md border border-line bg-paper px-4 py-4 transition-colors duration-150 hover:border-ink-faint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink md:min-h-[17rem]"
    >
      <span className="font-display text-[11px] font-medium uppercase tracking-wider text-ink-faint">
        {label}
      </span>
      <p className="mt-1 text-[13px] leading-snug text-ink-soft">{desc}</p>
      {leader && (
        <span className="mt-4 flex items-center gap-3">
          <Headshot league={league} id={leader.id} name={leader.name} fallback="none" className="h-10 w-10" />
          <span className="min-w-0 flex-1 font-display text-[15px] font-semibold leading-snug text-ink group-hover:underline group-hover:underline-offset-4">
            {leader.name}
          </span>
          <CountDelta value={metric(leader)} className="text-2xl" />
        </span>
      )}
      {next.length > 0 && (
        <ol className="mt-3 border-t border-line-soft pt-2">
          {next.map((r, i) => (
            <li key={r.id} className="flex items-baseline gap-2 py-0.5 text-[13px]">
              <span className="w-3 font-mono tnum text-[11px] text-ink-faint">{i + 2}</span>
              <span className="min-w-0 flex-1 truncate font-display text-ink-soft">{r.name}</span>
              <span className="font-mono tnum" style={{ color: divergingText(metric(r)) }}>
                {signed(metric(r), 1)}
              </span>
            </li>
          ))}
        </ol>
      )}
      <span className="mt-auto pt-2 font-mono tnum text-xs text-ink-faint">
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
  const seasons = seasonOptions(data);
  const latest = data.meta.defaultSeason;
  const qualify = data.meta.qualifyPossessions;
  const [picked, setSeason] = useState(latest);
  // The pick survives a league switch, and not every league has every season
  // (the NBA archive reaches 1997-98, BBL starts 2023-24).
  const season = seasons.includes(picked) ? picked : latest;
  // Picking an archive season loads the archive; the sections fill in when it
  // lands.
  useArchive(league, inArchive(data, season));

  // Shot-value pool for the season (already sorted by points over expected).
  const svPool = useMemo(() => data.shotValue?.[season] ?? [], [data.shotValue, season]);
  const topValue = useMemo(() => svPool.slice(0, 5), [svPool]);
  const topMaking = useMemo(
    () => [...svPool].sort((a, b) => b.fgPoe100 - a.fgPoe100).slice(0, 5),
    [svPool],
  );
  const topFouls = useMemo(
    () => [...svPool].sort((a, b) => b.ftaoe100 - a.ftaoe100).slice(0, 5),
    [svPool],
  );

  // The three charts below each carry a ranked list beside them; hovering a
  // name lights its mark and hovering a mark lights its name.
  const [fgHover, setFgHover] = useState<string | null>(null);
  const [teamHover, setTeamHover] = useState<string | null>(null);
  const [refHover, setRefHover] = useState<string | null>(null);
  const fgRanks = useMemo(() => {
    const byOE = [...svPool].sort((a, b) => b.makeOE - a.makeOE);
    const item = (r: ShotValueRow): RankItem => ({
      id: r.id,
      label: r.name,
      value: r.makeOE,
      to: `/player/${league}/${r.id}?season=${encodeURIComponent(season)}&lens=making`,
    });
    return { top: byOE.slice(0, 5).map(item), bottom: byOE.slice(-5).reverse().map(item) };
  }, [svPool, league, season]);

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
  const teamRanks = useMemo(() => {
    const byNet = [...teams].sort((a, b) => b.drawn - b.conceded - (a.drawn - a.conceded));
    const item = (t: (typeof teams)[number]): RankItem => ({
      id: t.team,
      label: t.team,
      value: t.drawn - t.conceded,
    });
    return { top: byNet.slice(0, 5).map(item), bottom: byNet.slice(-5).reverse().map(item) };
  }, [teams]);
  const refRanks = useMemo(() => {
    const val = (r: (typeof refs)[number]) => r.est ?? r.diff;
    const byVal = [...refs].sort((a, b) => val(b) - val(a));
    const item = (r: (typeof refs)[number]): RankItem => ({
      id: r.id,
      label: r.name,
      value: val(r),
      to: `/referee/${r.id}`,
    });
    return { top: byVal.slice(0, 5).map(item), bottom: byVal.slice(-5).reverse().map(item) };
  }, [refs]);

  return (
    // The hero's court runs past the content column; clipped here, not at
    // the column, so it reaches the window edge without a sideways scroll.
    <div className="overflow-x-clip">
    <div className="mx-auto max-w-4xl px-5 sm:px-8">
      <SectionRail sections={RAIL} />
      {/* hero: the thesis, this week's games, three lenses */}
      <section id="oe-top" className="relative isolate scroll-mt-8 pt-10 sm:pt-16">
        <ShotCloud
          league={league}
          season={season}
          className="pointer-events-none absolute -right-36 -top-4 -z-10 w-[22rem] opacity-70 sm:-right-28 sm:top-0 sm:w-[40rem] sm:opacity-100"
        />
        <p className="font-mono tnum text-xs text-ink-faint">
          {LEAGUE_LABEL[league]} · {seasons[0]} to{" "}
          {seasons[seasons.length - 1]} · {int(data.meta.nPossessions)}{" "}
          possessions
        </p>
        <h1 className="mt-3 font-display text-[2.75rem] font-bold leading-[1.02] tracking-tight text-balance text-ink sm:text-7xl">
          Every shot, over expected.
        </h1>
        <p className="mt-4 max-w-prose text-base leading-relaxed text-ink-soft sm:text-lg">
          What a shot is worth in {def.inLabel}: the make, and the
          {def.sftaOnly ? " fouls" : " free throws"} it draws, measured against
          the league. Three reads on the same number, for every player, team,
          and official.
        </p>

        <WeeklyTeaser />

        <div className="mt-10 flex flex-wrap items-center gap-x-4 gap-y-3">
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

        {/* three-lens triptych, one square tile per lens */}
        <div id="oe-lenses" className="mt-6 grid scroll-mt-8 gap-4 md:grid-cols-3">
          <LensCard
            lens="value"
            league={league}
            season={season}
            current={data.meta.defaultSeason}
            label="Shot value"
            desc="Points over expected: makes, plus the free throws drawn."
            rows={topValue}
            metric={(r) => r.poe100}
            count={svPool.length}
          />
          <LensCard
            lens="making"
            league={league}
            season={season}
            current={data.meta.defaultSeason}
            label="Shot-making"
            desc="Field goals made above or below the difficulty of the looks."
            rows={topMaking}
            metric={(r) => r.fgPoe100}
            count={svPool.length}
          />
          <LensCard
            lens="fouls"
            league={league}
            season={season}
            current={data.meta.defaultSeason}
            label="Foul-drawing"
            desc="Free throws drawn beyond what his shot locations predict."
            rows={topFouls}
            metric={(r) => r.ftaoe100}
            count={svPool.length}
          />
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3">
          <Link
            to={boardPath(league, DEFAULT_BOARD_LENS)}
            className="rounded-md bg-ink px-5 py-2.5 font-display text-sm font-medium text-paper transition-opacity duration-150 hover:opacity-85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            Open the leaderboard
          </Link>
          <Link
            to="/methodology"
            className="font-display text-sm font-medium text-ink underline underline-offset-4 transition-colors duration-150 hover:text-ink-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            How it's measured →
          </Link>
        </div>

        {/* doorway into the chart builder: three questions it answers */}
        <div className="mt-10 rounded-md bg-wash px-4 py-4 sm:px-5">
          <p className="font-display text-sm font-semibold text-ink">
            Explore: plot any two numbers
          </p>
          <p className="mt-1 text-sm text-ink-soft">
            Every qualified player in nine leagues, on the axes you pick.
          </p>
          <ul className="mt-3 flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:gap-x-5">
            {PRESETS.slice(0, 3).map((p) => (
              <li key={p.id}>
                <Link
                  to={explorePath({ preset: p, league })}
                  className="font-display text-sm font-medium text-ink underline decoration-line underline-offset-4 transition-colors duration-150 hover:decoration-ink"
                >
                  {p.question} →
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* the league, every player */}
      <section id="oe-players" className="mt-16 scroll-mt-8 border-t border-line pt-10 sm:mt-28 sm:pt-12">
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
          <Link to={boardPath(league, DEFAULT_BOARD_LENS)} className="underline underline-offset-2 transition-colors duration-150 hover:text-ink">
            open the full board
          </Link>
          .
        </p>
      </section>

      {/* the argument: FG% is mostly the shot menu */}
      {moves && (
        <section id="oe-fg" className="mt-16 scroll-mt-8 border-t border-line pt-10 sm:mt-28 sm:pt-12">
          <SectionHead title="What FG% gets wrong">
            Field-goal percentage says what a player shot, not how well he shot
            it. Each dot is a qualified player, placed by what the shots he
            took were worth against what he actually shot.
          </SectionHead>
          <div className="mt-6 grid gap-x-10 gap-y-6 lg:grid-cols-[minmax(0,28rem)_minmax(0,1fr)]">
            <ExpectedVsActual
              rows={svPool}
              league={league}
              season={season}
              height={460}
              hover={fgHover}
              onHover={setFgHover}
            />
            <div className="flex flex-col gap-6 lg:pt-4">
            <RankList
              topTitle="Furthest above the line"
              bottomTitle="Furthest below the line"
              unit="FG% minus what the looks were worth"
              top={fgRanks.top}
              bottom={fgRanks.bottom}
              hover={fgHover}
              onHover={setFgHover}
            />
            <p className="max-w-prose text-xs leading-relaxed text-ink-faint">
            The cloud rides the diagonal: across{" "}
            <span className="font-mono tnum">{int(svPool.length)}</span> players
            the two axes correlate{" "}
            <span className="font-mono tnum">{moves.rho.toFixed(2)}</span>, so
            most of where a player sits on the shooting-percentage ladder is
            decided by the shots he takes. The part that is the player is the
            vertical distance from the line, and it is what this site measures.{" "}
            <Link
              to={boardPath(league, "shot-making", datedPart(season, data.meta.defaultSeason))}
              className="underline underline-offset-2 transition-colors duration-150 hover:text-ink"
            >
              Every player on this lens →
            </Link>
            </p>
            </div>
          </div>
        </section>
      )}

      {/* teams */}
      <section id="oe-teams" className="mt-16 scroll-mt-8 border-t border-line pt-10 sm:mt-28 sm:pt-12">
        <SectionHead title={`Teams: drawn vs conceded, ${season}`}>
          {def.sftaOnly ? "Shooting fouls" : "Free throws"} each team draws
          against what it concedes, per 100 possessions over expected. The
          context a player's number rides on.
        </SectionHead>
        <div className="mt-6 grid gap-x-10 gap-y-6 lg:grid-cols-[minmax(0,1fr)_13rem]">
          <TeamScatter
            teams={teams}
            off={(t) => t.drawn}
            def={(t) => t.conceded}
            xAxis="draws more →"
            defLabel="Conceded"
            highlight={teamHover}
            onHover={setTeamHover}
          />
          <RankList
            topTitle="Best net"
            bottomTitle="Worst net"
            unit="drawn minus conceded, per 100"
            top={teamRanks.top}
            bottom={teamRanks.bottom}
            hover={teamHover}
            onHover={setTeamHover}
          />
        </div>
        <p className="mt-2">
          <Link to={leaguePath(league, DEFAULT_LEAGUE_LENS)} className="font-display text-sm font-medium text-ink underline underline-offset-4 transition-colors duration-150 hover:text-ink-soft">
            League context →
          </Link>
        </p>
      </section>

      {/* officials */}
      <section id="oe-officials" className="mt-16 scroll-mt-8 border-t border-line pt-10 sm:mt-28 sm:pt-12">
        <SectionHead title={`Officials, measured, ${season}`}>
          Each dot is one official (minimum {def.refMinGames} games): free
          throws in the games they worked over what those players would draw
          from where they shot, pulled toward the league by how much of one
          season is noise. Descriptive and league-level, never crossed with
          players.
        </SectionHead>
        <div className="mt-6 grid items-center gap-x-10 gap-y-6 lg:grid-cols-[minmax(0,1fr)_13rem]">
          <RefStrip refs={refs} height={220} hover={refHover} onHover={setRefHover} />
          <RankList
            topTitle="Most free throws"
            bottomTitle="Fewest free throws"
            unit="in their games, over the expected whistle, per 100"
            neutral
            top={refRanks.top}
            bottom={refRanks.bottom}
            hover={refHover}
            onHover={setRefHover}
          />
        </div>
        <p className="mt-2">
          <Link to={refereesPath(league, datedPart(season, data.meta.defaultSeason))} className="font-display text-sm font-medium text-ink underline underline-offset-4 transition-colors duration-150 hover:text-ink-soft">
            Every official →
          </Link>
        </p>
      </section>

      {/* how it's measured */}
      <section id="oe-method" className="mt-16 scroll-mt-8 border-t border-line pt-10 sm:mt-28 sm:pt-12">
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
    </div>
  );
}
