import { Link } from "react-router-dom";
import { useWeeklyIndex } from "../data";
import { LEAGUE_LABEL } from "../types";
import { weeklyPath } from "../routes";
import { divergingText } from "../lib/color";
import { firstLast, signed } from "../lib/format";
import { matchup, weekRange } from "../lib/weekly";
import Headshot from "./Headshot";
import type { WeeklyIndex } from "../types";

type Game = WeeklyIndex["weeks"][number]["best"];

function GameLine({ kind, g }: { kind: string; g: Game }) {
  return (
    <div className="flex items-center gap-3">
      <Headshot league={g.lg} id={g.id} name={g.name} className="h-11 w-11" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-mono text-[10px] uppercase tracking-wider text-ink-faint">
          {kind} · {LEAGUE_LABEL[g.lg]}
        </p>
        <p className="truncate font-display text-[15px] font-semibold text-ink group-hover:underline group-hover:underline-offset-4">
          {firstLast(g.name)}
        </p>
        <p className="font-mono tnum text-[11px] leading-snug text-ink-soft">
          {g.fgm}/{g.fga} FG, {g.pts} pts on shots worth {g.xpts.toFixed(1)} · {matchup(g)}
        </p>
      </div>
      <span
        className="shrink-0 font-mono tnum text-2xl font-semibold"
        style={{ color: divergingText(g.oe) }}
      >
        {signed(g.oe)}
      </span>
    </div>
  );
}

/** Homepage lead: the latest week's hottest and coldest shooting game across
    every league, linking to the full post. The index loads after the page, so
    the slot keeps its height while it does: content appearing above the fold
    later would shift everything below it (CLS). */
export default function WeeklyTeaser() {
  const index = useWeeklyIndex();
  const latest = index.data?.weeks[0];
  const slot = "mt-8 block min-h-[15.75rem] sm:min-h-[8.5rem]";
  if (!latest) return <div className={slot} aria-hidden="true" />;
  return (
    <Link
      to={weeklyPath()}
      className={`group ${slot} rounded-md border border-line px-4 py-4 transition-colors duration-150 hover:border-ink-faint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink sm:px-5`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="font-display text-sm font-semibold text-ink">
          This week in shooting{" "}
          <span className="font-mono tnum text-xs font-normal text-ink-faint">
            {weekRange(latest.week)}
          </span>
        </p>
        <span className="font-display text-xs font-medium text-ink-soft group-hover:text-ink">
          Every league's top 3 →
        </span>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
        <GameLine kind="Hottest" g={latest.best} />
        <GameLine kind="Coldest" g={latest.worst} />
      </div>
    </Link>
  );
}
