import { Link } from "react-router-dom";
import { useWeeklyIndex } from "../data";
import { LEAGUE_LABEL } from "../types";
import { gamePath, weeklyPath } from "../routes";
import { firstLast } from "../lib/format";
import { matchup, weekRange } from "../lib/weekly";
import Headshot from "./Headshot";
import { CountDelta } from "./CountDelta";
import type { WeeklyIndex } from "../types";

type Game = WeeklyIndex["weeks"][number]["best"];

/** One game of the card. With a game page it is its own link, lifted above the
    card's stretched link (z-10), so the two anchors never nest. */
function GameLine({ kind, g }: { kind: string; g: Game }) {
  const body = (
    <>
      <Headshot league={g.lg} id={g.id} name={g.name} className="h-11 w-11" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-mono text-[10px] uppercase tracking-wider text-ink-faint">
          {kind} · {LEAGUE_LABEL[g.lg]}
        </p>
        <p className="truncate font-display text-[15px] font-semibold text-ink group-hover/game:underline group-hover/game:underline-offset-4">
          {firstLast(g.name)}
        </p>
        <p className="font-mono tnum text-[11px] leading-snug text-ink-soft">
          {g.fgm}/{g.fga} FG, {g.pts} pts on shots worth {g.xpts.toFixed(1)} · {matchup(g)}
        </p>
      </div>
      <CountDelta value={g.oe} className="shrink-0 text-2xl font-semibold" />
    </>
  );
  const row = "flex items-center gap-3";
  if (!g.gid || !g.season) return <div className={row}>{body}</div>;
  return (
    <Link
      to={gamePath(g.lg, g.season, g.gid)}
      className={`group/game relative z-10 ${row} rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink`}
    >
      {body}
    </Link>
  );
}

/** Homepage lead: the latest week's hottest and coldest shooting game across
    every league, linking to the full post (the title is a stretched link over
    the whole card) and each game to its own page. The index loads after the page, so
    the slot keeps its height while it does: content appearing above the fold
    later would shift everything below it (CLS). */
export default function WeeklyTeaser() {
  const index = useWeeklyIndex();
  const latest = index.data?.weeks[0];
  const slot = "mt-8 block min-h-[15.75rem] sm:min-h-[8.5rem]";
  if (!latest) return <div className={slot} aria-hidden="true" />;
  return (
    <div
      className={`group relative ${slot} rounded-md border border-line bg-paper px-4 py-4 transition-colors duration-150 hover:border-ink-faint sm:px-5`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="font-display text-sm font-semibold text-ink">
          <Link
            to={weeklyPath()}
            className="after:absolute after:inset-0 after:rounded-md focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-ink"
          >
            This week in shooting{" "}
            <span className="font-mono tnum text-xs font-normal text-ink-faint">
              {weekRange(latest.week)}
            </span>
          </Link>
        </p>
        <span className="font-display text-xs font-medium text-ink-soft group-hover:text-ink">
          Every league's top 3 →
        </span>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
        <GameLine kind="Hottest" g={latest.best} />
        <GameLine kind="Coldest" g={latest.worst} />
      </div>
    </div>
  );
}
