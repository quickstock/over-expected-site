import { useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { seasonOptions, useData, useGameIndex, useLeague } from "../data";
import { ACTIVE_LEAGUES, LEAGUE_LABEL, type League } from "../leagues";
import type { GameIndexRow } from "../types";
import { datedPart, gamePath, gamesPath } from "../routes";
import { chronological, gameNumbers, winnerSide } from "../lib/games";
import { divergingText } from "../lib/color";
import { signed } from "../lib/format";
import { gameDate } from "../lib/weekly";
import { useTitle } from "../lib/useTitle";
import SegmentedControl from "../components/SegmentedControl";
import ShowAllButton from "../components/ShowAllButton";
import SortHeader, { cycleSort } from "../components/SortHeader";
import { GAME_METHOD_ID } from "../components/GameMethod";

type SortKey = "date" | "margin" | "share";

const SORT_LABEL: Record<SortKey, string> = {
  date: "Date",
  margin: "Exp. margin",
  share: "Winner's shots",
};

/** One game as the list reads it: from the winner's side, because "did the
    better shots win?" is the question the list sorts on. */
interface Row {
  g: GameIndexRow;
  /** The winner's expected score minus the loser's: below zero, the winner
      had the worse shots. */
  margin: number;
  /** How often the winner's shots win, in 100; null when withheld. */
  share: number | null;
}

function toRow(g: GameIndexRow): Row {
  const w = winnerSide(g);
  return {
    g,
    margin: g.x[w] - g.x[1 - w],
    share: g.w === null ? null : w === 0 ? g.w : 100 - g.w,
  };
}

const GRID_SHARE =
  "sm:grid-cols-[6.5rem_minmax(0,1fr)_7.5rem_6rem_7.5rem]";
const GRID_PLAIN = "sm:grid-cols-[6.5rem_minmax(0,1fr)_7.5rem_6rem]";
const HEAD = "font-display text-[11px] font-medium uppercase tracking-wider text-ink-faint";
/** Real and skeleton rows share this height, so the list never jumps. */
const ROW_H = "h-[58px] sm:h-[45px]";
/** Off-screen rows skip rendering (the full list is a season of games), held
    at their real height plus the 1px rule so scrolling into them moves nothing. */
const CV_ROW =
  "[content-visibility:auto] [contain-intrinsic-size:auto_59px] sm:[contain-intrinsic-size:auto_46px]";

function Score({ g }: { g: GameIndexRow }) {
  const w = g.s[0] === g.s[1] ? null : winnerSide(g);
  const side = (s: 0 | 1) => (w === s ? "font-semibold text-ink" : "text-ink-soft");
  return (
    <span className="min-w-0 truncate font-display text-[15px]">
      <span className={side(0)}>{g.hl}</span>{" "}
      <span className="font-mono tnum text-[14px]">
        <span className={side(0)}>{g.s[0]}</span>
        <span className="text-ink-faint">-</span>
        <span className={side(1)}>{g.s[1]}</span>
      </span>{" "}
      <span className={side(1)}>{g.al}</span>
    </span>
  );
}

/** A league-season's games: final score, what each side's shots were worth,
    and (when it passed calibration) how often the winner's shots win. */
export default function Games() {
  const { lg, season: seasonParam } = useParams();
  const data = useData();
  const { league } = useLeague();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [expanded, setExpanded] = useState(false);

  const seasons = seasonOptions(data);
  const currentSeason = data.meta.defaultSeason;
  const seasonValid = !seasonParam || seasons.includes(seasonParam);
  const season = seasonParam && seasonValid ? seasonParam : currentSeason;
  const leagueValid = !!lg && (ACTIVE_LEAGUES as string[]).includes(lg);

  const index = useGameIndex(league, season);
  const ready = index.status === "ready" ? index.data : null;
  const winShare = !!ready?.meta.winShare;

  // Sort and direction are query params, like the referee board: how one
  // reader looks at the list, not which list it is. With no explicit sort
  // the list is newest first.
  const keys: SortKey[] = winShare ? ["date", "margin", "share"] : ["date", "margin"];
  const asked = params.get("sort") as SortKey | null;
  const explicit = asked && keys.includes(asked) ? asked : null;
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

  const numbers = useMemo(() => (ready ? gameNumbers(ready.games) : new Map<string, number>()), [ready]);
  const rows = useMemo(() => {
    if (!ready) return [];
    const all = ready.games.map(toRow);
    const byDate = (a: Row, b: Row) => chronological(a.g, b.g);
    const key = explicit ?? "date";
    const mul = explicit && dir === "asc" ? 1 : -1;
    return all.sort((a, b) => {
      if (key === "date") return mul * byDate(a, b);
      const va = key === "margin" ? a.margin : (a.share ?? -1);
      const vb = key === "margin" ? b.margin : (b.share ?? -1);
      return mul * (va - vb) || -byDate(a, b);
    });
  }, [ready, explicit, dir]);

  useTitle(`${LEAGUE_LABEL[league]} games ${season} · Over Expected`);

  // Every hook runs before this point on every path (React #310).
  if (!leagueValid) return <Navigate to={gamesPath(league)} replace />;
  if (!seasonValid) return <Navigate to={gamesPath(lg as League)} replace />;

  const grid = winShare ? GRID_SHARE : GRID_PLAIN;
  const visible = expanded ? rows : rows.slice(0, 10);
  const when = (g: GameIndexRow) => (g.d ? gameDate(g.d) : `Game ${numbers.get(g.id)}`);

  return (
    <div>
      <div className="sticky top-0 z-10 border-b border-line bg-paper">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-x-5 gap-y-3 px-5 py-3 sm:px-8">
          <SegmentedControl
            ariaLabel="Season"
            options={seasons.map((s) => ({ value: s, label: s, shortLabel: `'${s.slice(2, 4)}-${s.slice(5)}` }))}
            value={season}
            onChange={(s) => navigate(gamesPath(league, datedPart(s, currentSeason)))}
          />
          <span className="ml-auto font-mono tnum text-xs text-ink-faint">
            {ready ? `${ready.games.length.toLocaleString("en-US")} games` : " "}
          </span>
        </div>
        <div className="mx-auto flex max-w-4xl items-center gap-4 px-5 pb-3 sm:hidden">
          {keys.map((k) => (
            <SortHeader key={k} k={k} label={SORT_LABEL[k]} sort={explicit} dir={dir} onSort={onSort} />
          ))}
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-5 pb-8 pt-8 sm:px-8 sm:pt-12">
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Games</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
          Every {LEAGUE_LABEL[league]} game of {season}: the final score, and what each side's
          shots were worth. The expected margin is the winner's figure minus the loser's, so
          below zero the winner had the worse shots.
        </p>

        <div className={`mt-8 hidden ${grid} items-end gap-x-4 border-b border-line pb-2 sm:grid`}>
          <SortHeader k="date" label={SORT_LABEL.date} sort={explicit} dir={dir} onSort={onSort} className="text-left" />
          <span className={HEAD}>Game</span>
          <span className={`${HEAD} text-right`}>Shots' worth</span>
          <SortHeader k="margin" label={SORT_LABEL.margin} sort={explicit} dir={dir} onSort={onSort} className="text-right" />
          {winShare && (
            <SortHeader k="share" label={SORT_LABEL.share} sort={explicit} dir={dir} onSort={onSort} className="text-right" />
          )}
        </div>

        {index.status === "error" ? (
          <p className="py-16 text-center text-sm text-ink-faint">
            No {LEAGUE_LABEL[league]} games are published for {season} yet.
          </p>
        ) : !ready ? (
          <div aria-busy="true" className="mt-6 border-t border-line sm:mt-0 sm:border-t-0">
            {Array.from({ length: 10 }, (_, i) => (
              <div key={i} className={`flex items-center border-b border-line-soft ${ROW_H}`}>
                <div className="h-4 w-full animate-pulse rounded bg-wash" />
              </div>
            ))}
            <div className="mt-3 h-[38px]" />
          </div>
        ) : (
          <>
            <ol className="mt-6 border-t border-line sm:mt-0 sm:border-t-0">
              {visible.map(({ g, margin, share }, i) => (
                <li
                  key={g.id}
                  className={`${CV_ROW} ${i >= 10 ? "reveal-row" : ""}`}
                  style={i >= 10 ? ({ "--reveal-delay": `${Math.min((i - 10) * 16, 160)}ms` } as React.CSSProperties) : undefined}
                >
                  <Link
                    to={gamePath(league, season, g.id)}
                    className="block border-b border-line-soft transition-colors duration-150 hover:bg-wash focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink"
                  >
                    {/* desktop row */}
                    <div className={`hidden ${grid} items-center gap-x-4 ${ROW_H} sm:grid`}>
                      <span className="font-mono tnum text-xs text-ink-faint">{when(g)}</span>
                      <Score g={g} />
                      <span className="text-right font-mono tnum text-sm text-ink-soft">
                        {g.x[0].toFixed(1)}-{g.x[1].toFixed(1)}
                      </span>
                      <span className="text-right font-mono tnum text-sm" style={{ color: divergingText(margin) }}>
                        {signed(margin, 1)}
                      </span>
                      {winShare && (
                        <span className="text-right font-mono tnum text-sm text-ink">
                          {share === null ? "–" : `${share} in 100`}
                        </span>
                      )}
                    </div>
                    {/* mobile row */}
                    <div className={`flex flex-col justify-center gap-1 ${ROW_H} sm:hidden`}>
                      <span className="flex items-baseline gap-3">
                        <Score g={g} />
                        <span className="ml-auto font-mono tnum text-sm" style={{ color: divergingText(margin) }}>
                          {signed(margin, 1)}
                        </span>
                      </span>
                      <span className="truncate font-mono tnum text-xs text-ink-faint">
                        {when(g)} · worth {g.x[0].toFixed(1)}-{g.x[1].toFixed(1)}
                        {winShare && share !== null && ` · winner's shots win ${share} in 100`}
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ol>
            {rows.length > 10 && (
              <ShowAllButton
                expanded={expanded}
                total={rows.length}
                noun="games"
                onToggle={() => setExpanded((v) => !v)}
              />
            )}
          </>
        )}

        <p className="mt-6 max-w-2xl text-xs leading-relaxed text-ink-faint">
          What the shots were worth prices every shot by how often shots like it score and every
          free throw at the shooter's season rate.
          {ready && ready.meta.excluded > 0 && (
            <>
              {" "}
              {ready.meta.excluded} {ready.meta.excluded === 1 ? "game is" : "games are"} left out
              because {ready.meta.excluded === 1 ? "its events do" : "their events do"} not rebuild
              the official final score.
            </>
          )}
          {ready && ready.meta.forfeits > 0 && (
            <>
              {" "}
              {ready.meta.forfeits} {ready.meta.forfeits === 1 ? "forfeit was" : "forfeits were"} never
              played and {ready.meta.forfeits === 1 ? "is" : "are"} not listed.
            </>
          )}{" "}
          <Link to={`/methodology#${GAME_METHOD_ID}`} className="underline underline-offset-2 transition-colors duration-150 hover:text-ink">
            How shots are priced
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
