import { useMemo } from "react";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { inArchive, seasonOptions, useArchive, useData, useLeague } from "../data";
import { ACTIVE_LEAGUES, LEAGUE_LABEL, leagueDef, type League } from "../leagues";
import { datedPart, refereesPath } from "../routes";
import { int, signed } from "../lib/format";
import IntervalBar, { intervalDomain } from "../components/IntervalBar";
import { useTitle } from "../lib/useTitle";
import ArchiveWait from "../components/ArchiveWait";
import SegmentedControl from "../components/SegmentedControl";
import SortHeader, { cycleSort } from "../components/SortHeader";

type SortKey = "est" | "games" | "per100";

const SORT_LABEL: Record<SortKey, string> = {
  est: "Over expected",
  games: "Games",
  per100: "FTA/100",
};

export default function Referees() {
  const { lg, season: seasonParam } = useParams();
  const data = useData();
  const { league } = useLeague();
  const navigate = useNavigate();
  const refMinGames = leagueDef(league).refMinGames;
  // Sort and direction stay query params: they are how one reader looks at this
  // page. League and season are the page's identity, so they are path segments.
  const [params, setParams] = useSearchParams();

  // Archive seasons only where officials exist (the NBA lists none before
  // 2003-04); live seasons all stay, including the thin EuroCup ones.
  const arch = data.meta.archive;
  const seasons = seasonOptions(data).filter(
    (s) => !arch?.seasons.includes(s) || arch.refSeasons.includes(s),
  );
  const currentSeason = data.meta.defaultSeason;
  const seasonValid = !seasonParam || seasons.includes(seasonParam);
  const season = seasonParam && seasonValid ? seasonParam : currentSeason;
  const leagueValid = !!lg && (ACTIVE_LEAGUES as string[]).includes(lg);
  const archive = useArchive(league, inArchive(data, seasonParam));

  useTitle(`${LEAGUE_LABEL[league]} referees ${season} · Over Expected`);
  // Explicit sort = the user clicked a column; null = the page's own order
  // (estimate desc), which renders with no direction indicator.
  const explicit = ["est", "games", "per100"].includes(params.get("sort") ?? "")
    ? (params.get("sort") as SortKey)
    : null;
  const sort = explicit ?? "est";
  const dir = params.get("dir") === "asc" ? "asc" : "desc";

  const onSort = (k: SortKey) => {
    const next = cycleSort(k, explicit, dir);
    const p = new URLSearchParams(params);
    if (next) {
      p.set("sort", next.sort);
      p.set("dir", next.dir);
    } else {
      p.delete("sort");
      p.delete("dir");
    }
    setParams(p, { replace: false });
  };

  const leagueRate = data.meta.referees!.league[season];
  const rel = data.meta.referees?.reliability;
  // The shrunk estimate where the league has enough officials to measure its
  // noise; the raw figure where it has not (EuroCup, GBL).
  const value = (r: { est: number | null; diff: number }) => r.est ?? r.diff;
  const rows = useMemo(() => {
    const mul = dir === "asc" ? 1 : -1;
    const key = (r: (typeof data.referees)[string][number]) =>
      sort === "est" ? value(r) : r[sort];
    return [...(data.referees[season] ?? [])].sort((a, b) => mul * (key(a) - key(b)));
  }, [data.referees, season, sort, dir]);
  const domain = intervalDomain(rows.map((r) => ({ value: value(r), lo: r.lo, hi: r.hi })));

  // Every hook runs before this point on every path (React #310).
  if (!leagueValid) return <Navigate to={refereesPath(league)} replace />;
  if (!seasonValid) return <Navigate to={refereesPath(lg as League)} replace />;
  if (archive !== "ready") return <ArchiveWait status={archive} />;

  return (
    <div>
      {/* controls */}
      <div className="sticky top-0 z-10 border-b border-line bg-paper">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-x-5 gap-y-3 px-5 py-3 sm:px-8">
          <SegmentedControl
            ariaLabel="Season"
            options={seasons.map((s) => ({
              value: s,
              label: s,
              shortLabel: `'${s.slice(2, 4)}-${s.slice(5)}`,
            }))}
            value={season}
            onChange={(s) =>
              navigate(refereesPath(league, datedPart(s, currentSeason)))
            }
          />
          <span className="ml-auto font-mono tnum text-xs text-ink-faint">
            {int(rows.length)} officials
          </span>
        </div>
        {/* mobile sort */}
        <div className="mx-auto flex max-w-4xl items-center gap-4 px-5 pb-3 sm:hidden">
          {(["est", "games", "per100"] as SortKey[]).map((k) => (
            <SortHeader key={k} k={k} label={SORT_LABEL[k]} sort={explicit} dir={dir} onSort={onSort} />
          ))}
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-5 pb-8 pt-8 sm:px-8 sm:pt-12">
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
          Referees
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
          Free throws per 100 possessions in the games each official worked,{" "}
          {season}, over their expected whistle: what those games' players
          would draw from where they shot. Minimum {refMinGames} games; the
          raw rate is in grey, against a league{" "}
          <span className="font-mono tnum">{leagueRate.toFixed(1)}</span>.
        </p>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
          {rel?.season != null ? (
            <>
              One season of an official is{" "}
              <span className="font-mono tnum">{rel.season.toFixed(2)}</span>{" "}
              reliable (their odd games against their even ones), so each figure is
              pulled toward the league by how much of it is noise, and the line
              is its 90% range.
              {rel.career != null && (
                <>
                  {" "}A career is{" "}
                  <span className="font-mono tnum">{rel.career.toFixed(2)}</span>{" "}
                  reliable: tap a name for it.
                </>
              )}
            </>
          ) : (
            <>
              Too few {LEAGUE_LABEL[league]} officials qualify to measure how much
              of this is noise, so these figures are unshrunk: read them as
              loose.
            </>
          )}
        </p>

        {/* desktop header */}
        <div className="mt-8 hidden grid-cols-[2.75rem_minmax(0,1fr)_4rem_4.5rem_9rem_7rem] items-end gap-x-4 border-b border-line pb-2 sm:grid">
          <span />
          <span className="font-display text-[11px] font-medium uppercase tracking-wider text-ink-faint">
            Official
          </span>
          <SortHeader k="games" label={SORT_LABEL.games} sort={explicit} dir={dir} onSort={onSort} className="text-right" />
          <SortHeader k="per100" label={SORT_LABEL.per100} sort={explicit} dir={dir} onSort={onSort} className="text-right" />
          <span className="text-center font-display text-[11px] font-medium uppercase tracking-wider text-ink-faint">
            90% range
          </span>
          <SortHeader k="est" label={SORT_LABEL.est} sort={explicit} dir={dir} onSort={onSort} className="text-right" />
        </div>

        {rows.length === 0 ? (
          <p className="py-16 text-center text-sm text-ink-faint">
            No officials reach {refMinGames} games this season yet.
          </p>
        ) : (
          <ol>
            {rows.map((r, i) => (
              <li key={r.id} className="cv-row">
                <Link
                  to={`/referee/${r.id}?season=${encodeURIComponent(season)}`}
                  className="group block border-b border-line-soft transition-colors duration-150 hover:bg-wash focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink"
                >
                  {/* desktop row */}
                  <div className="hidden grid-cols-[2.75rem_minmax(0,1fr)_4rem_4.5rem_9rem_7rem] items-center gap-x-4 py-3 sm:grid">
                    <span className="text-right font-mono tnum text-sm text-ink-faint">
                      {i + 1}
                    </span>
                    <span className="min-w-0 truncate font-display text-[15px] font-semibold text-ink">
                      {r.name}
                    </span>
                    <span className="text-right font-mono tnum text-sm text-ink-soft">
                      {int(r.games)}
                    </span>
                    <span className="text-right font-mono tnum text-xs text-ink-faint">
                      {r.per100.toFixed(1)}
                    </span>
                    <IntervalBar value={value(r)} lo={r.lo} hi={r.hi} domain={domain} className="w-full" />
                    <span className="text-right font-mono tnum text-sm text-ink">
                      {signed(value(r), 1)}
                    </span>
                  </div>
                  {/* mobile row */}
                  <div className="flex flex-col gap-1.5 py-3 sm:hidden">
                    <span className="flex items-baseline gap-2.5">
                      <span className="w-7 text-right font-mono tnum text-xs text-ink-faint">
                        {i + 1}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-display text-[15px] font-semibold text-ink">
                        {r.name}
                      </span>
                      <span className="font-mono tnum text-sm text-ink">
                        {signed(value(r), 1)}
                      </span>
                    </span>
                    <span className="flex items-center gap-2.5 pl-9">
                      <span className="min-w-0 flex-1 truncate text-xs text-ink-soft">
                        {int(r.games)} games · {r.per100.toFixed(1)} per 100
                      </span>
                      <IntervalBar value={value(r)} lo={r.lo} hi={r.hi} domain={domain} className="w-24" />
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ol>
        )}

        <p className="mt-6 max-w-2xl text-xs leading-relaxed text-ink-faint">
          Descriptive, league-level only. Player numbers are not adjusted for
          individual crews, and this site deliberately does not publish
          player-by-official splits.{" "}
          <Link
            to="/methodology"
            className="underline underline-offset-2 transition-colors duration-150 hover:text-ink"
          >
            Methodology
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
