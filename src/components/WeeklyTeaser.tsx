import { Link } from "react-router-dom";
import { useWeeklyIndex } from "../data";
import { LEAGUE_LABEL } from "../types";
import { weeklyPath } from "../routes";
import { divergingText } from "../lib/color";
import { firstLast, signed } from "../lib/format";
import { matchup, weekRange } from "../lib/weekly";

/** Homepage pointer to the weekly shooting post: the latest week's hottest
    game in one line. The index loads after the page, so the slot keeps its
    height while it does: content appearing above the fold later would shift
    everything below it (CLS). */
export default function WeeklyTeaser() {
  const index = useWeeklyIndex();
  const latest = index.data?.weeks[0];
  const slot = "mt-10 block min-h-[9.5rem] max-w-2xl sm:min-h-[7.25rem]";
  if (!latest) return <div className={slot} aria-hidden="true" />;
  const b = latest.best;
  return (
    <Link
      to={weeklyPath()}
      className={`group ${slot} rounded border border-line-soft px-5 py-4 transition-colors duration-150 hover:border-line`}
    >
      <p className="font-mono tnum text-[11px] uppercase tracking-wider text-ink-faint">
        This week in shooting · {weekRange(latest.week)}
      </p>
      <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
        <span className="font-display font-semibold text-ink">{firstLast(b.name)}</span>{" "}
        ({matchup(b)}, {LEAGUE_LABEL[b.lg]}) went {b.fgm} of {b.fga} for {b.pts} points
        on shots worth {b.xpts.toFixed(1)}:{" "}
        <span className="font-mono tnum font-semibold" style={{ color: divergingText(b.oe) }}>
          {signed(b.oe)}
        </span>{" "}
        over expected.{" "}
        <span className="text-ink underline underline-offset-2 group-hover:decoration-ink">
          Every league's hottest and coldest
        </span>
      </p>
    </Link>
  );
}
