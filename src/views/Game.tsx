import { useMemo, useRef } from "react";
import { Link, useParams } from "react-router-dom";
import { seasonOptions, useData, useGameIndex, useGameWeek, useLeague } from "../data";
import { ACTIVE_LEAGUES, LEAGUE_LABEL, leagueDef, type League } from "../leagues";
import type { GameIndexRow } from "../types";
import { datedPart, gamesPath } from "../routes";
import { gameNumbers, winnerSide } from "../lib/games";
import { divergingText } from "../lib/color";
import { signed } from "../lib/format";
import { useTitle } from "../lib/useTitle";
import ScoreRace, { RACE_HEIGHT } from "../components/game/ScoreRace";
import ShotMap, { sideShots } from "../components/game/ShotMap";
import PlayerLines from "../components/game/PlayerLines";
import { downloadPng } from "../components/charts/ExploreScatter";

/** Home | label | away: the scoreboard and every row under it share it, so
    each figure sits under its team. */
const DUEL = "grid grid-cols-[1fr_minmax(7.5rem,auto)_1fr] items-center gap-x-3";
const LABEL =
  "mx-auto max-w-[10rem] text-center font-display text-[11px] font-medium uppercase leading-tight tracking-wider text-ink-faint";

/** "Saturday, October 25, 2025" (UTC, so no timezone moves the day). */
function longDate(d: string): string {
  return new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

/** The larger of a pair gets the wash chip, Sofascore-style. */
function Chip({ on, children }: { on: boolean; children: React.ReactNode }) {
  return <span className={on ? "rounded bg-wash px-1.5 py-0.5" : "px-1.5 py-0.5"}>{children}</span>;
}

/** A screen tall, like the skeleton it can replace once the index shows the
    id is not there: a short page would pull the footer up into view. */
function NotFound({ league, season, id, hub }: { league: League; season: string; id: string; hub: string }) {
  return (
    <div className="mx-auto min-h-screen max-w-xl px-5 py-28 text-center sm:px-8">
      <p className="font-display text-2xl font-semibold text-ink">Game not found.</p>
      <p className="mt-3 text-sm leading-relaxed text-ink-soft">
        There is no {LEAGUE_LABEL[league]} game {id} in {season || "that season"} on this site.
        Games whose events do not rebuild the official final score are left out.
      </p>
      <Link
        to={hub}
        className="mt-8 inline-block rounded-md bg-ink px-5 py-2.5 font-display text-sm font-medium text-paper transition-opacity duration-150 hover:opacity-85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        All {LEAGUE_LABEL[league]} games
      </Link>
    </div>
  );
}

/** While the season's index loads. Taller than any screen, so the footer
    stays out of view and nothing visible moves when the page lands. */
function Skeleton() {
  return (
    <div className="mx-auto min-h-[150vh] max-w-4xl px-5 py-10 sm:px-8 sm:py-14" aria-busy="true">
      <div className="h-5 w-48 animate-pulse rounded bg-wash" />
      <div className="mt-8 h-4 w-64 animate-pulse rounded bg-wash" />
      <div className="mt-6 h-28 animate-pulse rounded bg-wash" />
      <div className="mt-4 h-32 animate-pulse rounded bg-wash" />
      <div className="mt-12 animate-pulse rounded bg-wash" style={{ height: RACE_HEIGHT }} />
    </div>
  );
}

/** One sentence of fact: who won, and whose shots were worth more. */
function verdict(g: GameIndexRow): string {
  const win = winnerSide(g);
  const label = [g.hl, g.al];
  const by = Math.abs(g.s[0] - g.s[1]);
  const lead = g.s[0] === g.s[1] ? `${g.hl} and ${g.al} finished level.` : `${label[win]} won by ${by}.`;
  const xBy = Math.abs(g.x[0] - g.x[1]);
  if (xBy < 0.05) return `${lead} The shots on each side were worth the same.`;
  const better = g.x[0] > g.x[1] ? 0 : 1;
  if (g.s[0] !== g.s[1] && better === win) return `${lead} Its shots were worth ${xBy.toFixed(1)} more.`;
  return `${lead} ${label[better]}'s shots were worth ${xBy.toFixed(1)} more.`;
}

/** One game: the final, what its shots were worth, how the margin moved,
    where each side shot from, the player lines and the officials. */
export default function Game() {
  const { lg, season = "", id = "" } = useParams();
  const data = useData();
  const { league } = useLeague();
  const court = leagueDef(league).court;
  const leagueValid = !!lg && (ACTIVE_LEAGUES as string[]).includes(lg);
  const seasonValid = seasonOptions(data).includes(season);

  const index = useGameIndex(league, season);
  const games = index.status === "ready" ? index.data.games : null;
  const row = games?.find((g) => g.id === id);
  const week = useGameWeek(league, leagueValid && seasonValid && row ? row.wk : null);
  const detail = week.status === "ready" ? (week.data.games[id] ?? null) : null;

  // The GBL publishes no dates, so its games are numbered in season order.
  const numbers = useMemo(() => (games && row && !row.d ? gameNumbers(games) : null), [games, row]);
  const shots = useMemo(
    () => (detail ? ([sideShots(detail, 0), sideShots(detail, 1)] as const) : null),
    [detail],
  );
  // A player has a page when he has a qualified season, live or archive.
  const pages = useMemo(() => {
    const s = new Set<string>();
    for (const r of data.leaderboard) if (r.pct !== null) s.add(r.id);
    for (const p of data.meta.archive?.players ?? []) s.add(p[0]);
    return s;
  }, [data]);
  const svgRef = useRef<SVGSVGElement>(null);

  useTitle(row ? `${row.hl} ${row.s[0]}-${row.s[1]} ${row.al}, ${season} · Over Expected` : "Game · Over Expected");

  // Every hook above runs on every path below (React #310).
  const hub = gamesPath(league, seasonValid ? datedPart(season, data.meta.defaultSeason) : undefined);
  if (!leagueValid || !seasonValid) return <NotFound league={league} season={season} id={id} hub={hub} />;
  if (index.status === "loading") return <Skeleton />;
  if (!row || (week.status === "ready" && !detail)) {
    return <NotFound league={league} season={season} id={id} hub={hub} />;
  }

  const [hl, al] = [row.hl, row.al];
  const win = row.s[0] === row.s[1] ? null : winnerSide(row);
  const better = row.x[0] === row.x[1] ? null : row.x[0] > row.x[1] ? 0 : 1;
  const share = index.status === "ready" && index.data.meta.winShare && row.w !== null ? [row.w, 100 - row.w] : null;
  const over = [row.s[0] - row.x[0], row.s[1] - row.x[1]];
  const when = row.d ? longDate(row.d) : `Game ${numbers?.get(row.id)}`;
  const refs = detail?.r ?? [];
  const hasRef = (rid: string) => !!data.refProfiles[rid] || !!data.meta.archive?.refs.includes(rid);

  const download = () => {
    if (!svgRef.current) return;
    downloadPng(
      svgRef.current,
      `${hl} ${row.s[0]}-${row.s[1]} ${al}`,
      `What the shots were worth: ${hl} ${row.x[0].toFixed(1)}, ${al} ${row.x[1].toFixed(1)}`,
      `over-expected-${league}-${row.id}.png`.toLowerCase(),
    );
  };

  return (
    <article className="mx-auto max-w-4xl px-5 py-10 sm:px-8 sm:py-14">
      <Link to={hub} className="text-sm text-ink-soft underline decoration-line underline-offset-2 hover:text-ink hover:decoration-ink">
        ← All {LEAGUE_LABEL[league]} games, {season}
      </Link>

      <header className="mt-8">
        <p className="text-center font-mono tnum text-xs uppercase tracking-wider text-ink-faint">
          {LEAGUE_LABEL[league]} · {season} · {when}
        </p>

        <h1 className={`${DUEL} mt-5`}>
          <span className="text-center">
            <span className="block font-display text-lg font-semibold text-ink sm:text-xl">{hl}</span>
            <span className={`block font-display text-5xl font-bold tnum sm:text-6xl ${win === 1 ? "text-ink-soft" : "text-ink"}`}>
              {row.s[0]}
            </span>
          </span>
          <span className={LABEL}>
            <span className="sr-only">-</span>
            <span aria-hidden="true">Final</span>
          </span>
          <span className="text-center">
            <span className="block font-display text-lg font-semibold text-ink sm:text-xl">{al}</span>
            <span className={`block font-display text-5xl font-bold tnum sm:text-6xl ${win === 0 ? "text-ink-soft" : "text-ink"}`}>
              {row.s[1]}
            </span>
          </span>
        </h1>

        <dl className="mt-4 border-t border-line">
          <div className={`${DUEL} border-b border-line-soft py-3`}>
            <dt className={`order-2 ${LABEL}`}>What the shots were worth</dt>
            <dd className="order-1 text-center font-mono text-2xl tnum text-ink sm:text-3xl">
              <Chip on={better === 0}>{row.x[0].toFixed(1)}</Chip>
            </dd>
            <dd className="order-3 text-center font-mono text-2xl tnum text-ink sm:text-3xl">
              <Chip on={better === 1}>{row.x[1].toFixed(1)}</Chip>
            </dd>
          </div>
          <div className={`${DUEL} border-b border-line-soft py-2.5`}>
            <dt className={`order-2 ${LABEL}`}>Points over expected</dt>
            <dd className="order-1 text-center font-mono text-base tnum" style={{ color: divergingText(over[0]) }}>
              {signed(over[0], 1)}
            </dd>
            <dd className="order-3 text-center font-mono text-base tnum" style={{ color: divergingText(over[1]) }}>
              {signed(over[1], 1)}
            </dd>
          </div>
          {share && (
            <div className={`${DUEL} border-b border-line-soft py-2.5`}>
              <dt className={`order-2 ${LABEL}`}>These shots win</dt>
              <dd className="order-1 text-center font-mono text-base tnum text-ink">
                <Chip on={share[0] > share[1]}>{share[0]} in 100</Chip>
              </dd>
              <dd className="order-3 text-center font-mono text-base tnum text-ink">
                <Chip on={share[1] > share[0]}>{share[1]} in 100</Chip>
              </dd>
            </div>
          )}
        </dl>

        <p className="mt-5 text-center text-base leading-relaxed text-ink-soft">{verdict(row)}</p>
      </header>

      {week.status === "error" ? (
        <p className="mt-12 rounded border border-line-soft bg-wash px-5 py-8 text-center text-sm text-ink-soft">
          This game's shots did not load. Refresh the page to try again.
        </p>
      ) : (
        <>
          <section className="mt-12">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h2 className="font-display text-xl font-semibold tracking-tight text-ink">How the margin moved</h2>
              <button
                type="button"
                onClick={download}
                disabled={!detail}
                className="font-display text-sm font-medium text-ink underline decoration-line underline-offset-4 transition-colors duration-150 hover:decoration-ink disabled:text-ink-faint disabled:no-underline"
              >
                Download card
              </button>
            </div>
            <p className="mt-1 text-sm leading-relaxed text-ink-soft">
              The score and what the shots were worth, {hl} minus {al}, after every shot and free throw.
            </p>
            <div className="mt-4">
              <ScoreRace lg={league} detail={detail} home={hl} away={al} svgRef={svgRef} />
            </div>
          </section>

          <section className="mt-12">
            <h2 className="font-display text-xl font-semibold tracking-tight text-ink">Where they shot</h2>
            <div className="mt-4 grid gap-8 sm:grid-cols-2">
              <ShotMap court={court} team={hl} shots={shots?.[0] ?? null} />
              <ShotMap court={court} team={al} shots={shots?.[1] ?? null} />
            </div>
          </section>

          <section className="mt-12">
            <h2 className="font-display text-xl font-semibold tracking-tight text-ink">Player lines</h2>
            <p className="mt-1 mb-4 text-sm leading-relaxed text-ink-soft">
              Pts are points from the field, Exp what those shots were worth, and Over the
              difference. FT is free throws made and attempted.
            </p>
            <PlayerLines
              lg={league}
              season={season}
              detail={detail}
              home={hl}
              away={al}
              hasPage={(pid) => pages.has(pid)}
            />
          </section>

          {refs.length > 0 && (
            <section className="mt-12">
              <h2 className="font-display text-xl font-semibold tracking-tight text-ink">Officials</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink">
                {refs.map(([rid, name], i) => (
                  <span key={rid}>
                    {i > 0 && ", "}
                    {hasRef(rid) ? (
                      <Link
                        to={`/referee/${rid}?season=${encodeURIComponent(season)}`}
                        className="underline decoration-line underline-offset-2 hover:decoration-ink"
                      >
                        {name}
                      </Link>
                    ) : (
                      name
                    )}
                  </span>
                ))}
              </p>
            </section>
          )}
        </>
      )}

      <p className="mt-12 border-t border-line pt-6 text-xs leading-relaxed text-ink-faint">
        What the shots were worth prices every shot by how often shots like it score and
        every free throw at the shooter's season rate, then adds them up for each side.{" "}
        <Link to="/methodology" className="underline underline-offset-2 hover:text-ink">
          How shots are priced
        </Link>
        .
      </p>
    </article>
  );
}
