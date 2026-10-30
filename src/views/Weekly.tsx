import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAllData, useWeeklyIndex, useWeeklyWeek } from "../data";
import { ACTIVE_LEAGUES } from "../leagues";
import { LEAGUE_LABEL, type League, type WeeklyRow } from "../types";
import { gamePath, weeklyPath } from "../routes";
import { divergingText } from "../lib/color";
import { firstLast, signed } from "../lib/format";
import { useTitle } from "../lib/useTitle";
import { gameDate, matchup, weekRange } from "../lib/weekly";

const SITE = "overexpected.com";

/** The ready-to-post line for X: who, the shooting line, the gap, the link. */
function postText(r: WeeklyRow & { lg: League }, week: string): string {
  return (
    `Shooting game of the week: ${firstLast(r.name)} (${r.team}, ${LEAGUE_LABEL[r.lg]}) ` +
    `went ${r.fgm} of ${r.fga} for ${r.pts} points from the field on shots worth ` +
    `${r.xpts.toFixed(1)}. That's ${signed(r.oe)} over expected. ` +
    `Every league's hottest and coldest: ${SITE}${weeklyPath(week)}`
  );
}

/** Player name, linked only when the player has a page to land on.
    `sentence` puts "Surname, First" feeds in reading order. */
function PlayerName({ lg, r, sentence = false }: { lg: League; r: WeeklyRow; sentence?: boolean }) {
  const all = useAllData();
  const hasPage = all[lg]?.leaderboard.some((x) => x.id === r.id && x.pct !== null);
  const name = sentence ? firstLast(r.name) : r.name;
  if (!hasPage) return <>{name}</>;
  return (
    <Link
      to={`/player/${lg}/${r.id}`}
      className="underline decoration-line underline-offset-2 hover:decoration-ink"
    >
      {name}
    </Link>
  );
}

/** "MEM vs UTA · Wed, Oct 21", linked to the game's page when the row names
    one. The link is the matchup and date, so it never nests the player's. */
function GameLink({ lg, r, children }: { lg: League; r: WeeklyRow; children: React.ReactNode }) {
  if (!r.gid || !r.season) return <>{children}</>;
  return (
    <Link
      to={gamePath(lg, r.season, r.gid)}
      className="underline decoration-line underline-offset-2 hover:decoration-ink"
    >
      {children}
    </Link>
  );
}

function Headline({ label, r }: { label: string; r: WeeklyRow & { lg: League } }) {
  return (
    <div className="rounded border border-line-soft px-5 py-5">
      <p className="font-display text-[11px] font-medium uppercase tracking-wider text-ink-faint">
        {label}
      </p>
      <p
        className="mt-2 font-display text-5xl font-bold tnum"
        style={{ color: divergingText(r.oe) }}
      >
        {signed(r.oe)}
      </p>
      <p className="mt-1 text-xs text-ink-faint">points over expected from the field</p>
      <p className="mt-4 font-display text-lg font-semibold text-ink">
        <PlayerName lg={r.lg} r={r} sentence />
      </p>
      <p className="mt-1 text-sm text-ink-soft">
        <GameLink lg={r.lg} r={r}>
          {matchup(r)} · {gameDate(r.date)}
        </GameLink>{" "}
        · {LEAGUE_LABEL[r.lg]}
      </p>
      <p className="mt-3 text-sm text-ink-soft">
        <span className="font-mono tnum text-ink">
          {r.fgm} of {r.fga}
        </span>
        , <span className="font-mono tnum text-ink">{r.pts}</span> points on shots
        worth <span className="font-mono tnum text-ink">{r.xpts.toFixed(1)}</span>
      </p>
    </div>
  );
}

function GameTable({ lg, caption, rows }: { lg: League; caption: string; rows: WeeklyRow[] }) {
  return (
    <table className="w-full border-collapse text-sm">
      <caption className="pb-2 text-left font-display text-[11px] font-medium uppercase tracking-wider text-ink-faint">
        {caption}
      </caption>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id + r.date} className="border-t border-line-soft">
            <td className="py-2 pr-3">
              <span className="font-medium text-ink">
                <PlayerName lg={lg} r={r} />
              </span>
              <span className="block text-xs text-ink-faint">
                <GameLink lg={lg} r={r}>
                  {matchup(r)} · {gameDate(r.date)}
                </GameLink>
              </span>
            </td>
            <td className="py-2 pr-3 text-right font-mono text-xs tnum text-ink-soft">
              {r.fgm}/{r.fga}
              <span className="block">
                {r.pts} vs {r.xpts.toFixed(1)}
              </span>
            </td>
            <td
              className="py-2 text-right font-mono tnum font-semibold"
              style={{ color: divergingText(r.oe) }}
            >
              {signed(r.oe)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CopyPost({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() =>
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        })
      }
      className="rounded-md bg-ink px-4 py-2 font-display text-sm font-medium text-paper transition-opacity duration-150 hover:opacity-85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
    >
      {copied ? "Copied" : "Copy post"}
    </button>
  );
}

/** The weekly shooting post: the hottest and coldest shooting games of a
    Monday-to-Sunday week across every league with real game dates, by
    field-goal points over expected. /weekly is the latest week. */
export default function Weekly() {
  const { week: param } = useParams();
  const index = useWeeklyIndex();
  const weeks = index.data?.weeks ?? [];
  const pos = param ? weeks.findIndex((w) => w.week === param) : 0;
  const entry = pos >= 0 ? weeks[pos] : undefined;
  const detail = useWeeklyWeek(entry?.week ?? null);
  useTitle(entry ? `Shooting, week of ${weekRange(entry.week)}` : "This week in shooting");

  if (index.status !== "ready") {
    // Taller than a screen, like Game's skeleton: a short placeholder would
    // leave the footer in view, and it would drop out of view when the post lands.
    return (
      <div className="mx-auto min-h-[150vh] max-w-3xl px-5 py-16 text-sm text-ink-faint">
        Loading…
      </div>
    );
  }
  if (!entry) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-16">
        <p className="text-ink-soft">No post for that week.</p>
        <Link to={weeklyPath()} className="mt-4 inline-block underline underline-offset-2">
          The latest week
        </Link>
      </div>
    );
  }

  const newer = pos > 0 ? weeks[pos - 1] : undefined;
  const older = pos < weeks.length - 1 ? weeks[pos + 1] : undefined;
  const text = postText(entry.best, entry.week);
  const leagues = ACTIVE_LEAGUES.filter((lg) => detail.data?.leagues[lg]);

  return (
    <article className="mx-auto max-w-3xl px-5 py-12 sm:px-8 sm:py-16">
      <p className="font-mono tnum text-xs uppercase tracking-wider text-ink-faint">
        This week in shooting · {weekRange(entry.week)}
      </p>
      <h1 className="mt-3 font-display text-3xl font-bold tracking-tight text-ink sm:text-5xl">
        {firstLast(entry.best.name)} shot {entry.best.fgm} of {entry.best.fga}
      </h1>
      <p className="mt-4 max-w-2xl text-base leading-relaxed text-ink-soft sm:text-lg">
        Every field goal is priced by what shots like it are worth. These are the
        week's hottest and coldest shooting games across{" "}
        {entry.leagues.length} leagues and {entry.games} games: points scored
        from the field against what those shots were worth.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <Headline label="Hottest" r={entry.best} />
        <Headline label="Coldest" r={entry.worst} />
      </div>

      <section className="mt-8 rounded border border-line-soft bg-wash px-5 py-4">
        <p className="font-display text-sm font-semibold text-ink">Post it</p>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">{text}</p>
        <div className="mt-3 flex flex-wrap items-center gap-4">
          <CopyPost text={text} />
          <a
            href={`/og/weekly-${entry.week}.png`}
            className="text-sm underline underline-offset-2 hover:text-ink"
          >
            Card image
          </a>
        </div>
      </section>

      {leagues.map((lg) => {
        const w = detail.data!.leagues[lg]!;
        return (
          <section key={lg} className="mt-12">
            <h2 className="font-display text-xl font-semibold tracking-tight text-ink">
              {LEAGUE_LABEL[lg]}
              <span className="ml-2 font-mono text-xs font-normal tnum text-ink-faint">
                {w.games} games
              </span>
            </h2>
            <div className="mt-4 grid gap-8 sm:grid-cols-2">
              <GameTable lg={lg} caption="Hottest" rows={w.over} />
              <GameTable lg={lg} caption="Coldest" rows={w.under} />
            </div>
          </section>
        );
      })}

      <nav className="mt-14 flex flex-wrap justify-between gap-4 border-t border-line pt-6 text-sm">
        {older ? (
          <Link to={weeklyPath(older.week)} className="underline underline-offset-2 hover:text-ink">
            ← Week of {weekRange(older.week)}
          </Link>
        ) : (
          <span />
        )}
        {newer && (
          <Link
            to={newer === weeks[0] ? weeklyPath() : weeklyPath(newer.week)}
            className="underline underline-offset-2 hover:text-ink"
          >
            Week of {weekRange(newer.week)} →
          </Link>
        )}
      </nav>
      <p className="mt-6 text-xs leading-relaxed text-ink-faint">
        Field-goal points over expected per game, from the same expected-FG model as
        the shot-making lens. Free throws are not counted here. The Greek Basket
        League is left out because its feed carries no game dates.{" "}
        <Link to="/methodology" className="underline underline-offset-2 hover:text-ink">
          How shots are priced
        </Link>
        .
      </p>
    </article>
  );
}
