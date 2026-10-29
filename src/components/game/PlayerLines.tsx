/**
 * Each team's player lines for one game: field-goal attempts, points from the
 * field, what those shots were worth, the difference, and free throws. One
 * table per side, both sorted by the same column (three states, the site's
 * shared header); the default is the export's order, most points first.
 * A name links to the player's page only when he has one.
 */
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { League } from "../../leagues";
import type { GameDetail } from "../../types";
import { divergingText } from "../../lib/color";
import { signed } from "../../lib/format";
import SortHeader, { cycleSort, type SortDir } from "../SortHeader";

type Key = "fga" | "pts" | "xpts" | "oe" | "ft";
type Line = GameDetail["p"][number];

const COLS: { k: Key; label: string }[] = [
  { k: "fga", label: "FGA" },
  { k: "pts", label: "Pts" },
  { k: "xpts", label: "Exp" },
  { k: "oe", label: "Over" },
  { k: "ft", label: "FT" },
];

const value: Record<Key, (l: Line) => number> = {
  fga: (l) => l[3],
  pts: (l) => l[4],
  xpts: (l) => l[5],
  oe: (l) => l[4] - l[5],
  // made first, attempts break the tie
  ft: (l) => l[7] * 1000 + l[6],
};

const NUM = "w-11 sm:w-16 py-2 text-right font-mono tnum text-[13px]";

function Over({ fga, v }: { fga: number; v: number }) {
  if (fga === 0) return <span className="text-ink-faint">–</span>;
  return <span style={{ color: divergingText(v) }}>{signed(v, 1)}</span>;
}

function SideTable({
  lg,
  season,
  team,
  lines,
  hasPage,
  sort,
  dir,
  onSort,
}: {
  lg: League;
  season: string;
  team: string;
  lines: Line[];
  hasPage: (id: string) => boolean;
  sort: Key | null;
  dir: SortDir;
  onSort: (k: Key) => void;
}) {
  const rows = useMemo(() => {
    if (!sort) return lines;
    const mul = dir === "asc" ? 1 : -1;
    return [...lines].sort((a, b) => mul * (value[sort](a) - value[sort](b)));
  }, [lines, sort, dir]);
  const tot = lines.reduce(
    (t, l) => ({ fga: t.fga + l[3], pts: t.pts + l[4], xpts: t.xpts + l[5], fta: t.fta + l[6], ftm: t.ftm + l[7] }),
    { fga: 0, pts: 0, xpts: 0, fta: 0, ftm: 0 },
  );

  return (
    <table className="w-full table-fixed border-collapse">
      <caption className="pb-2 text-left font-display text-[15px] font-semibold text-ink">{team}</caption>
      <thead>
        <tr className="border-b border-line">
          <th scope="col" className="pb-2 text-left font-display text-[11px] font-medium uppercase tracking-wider text-ink-faint">
            Player
          </th>
          {COLS.map((c) => (
            <th key={c.k} scope="col" className="w-11 pb-2 text-right sm:w-16">
              <SortHeader k={c.k} label={c.label} sort={sort} dir={dir} onSort={onSort} />
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((l) => (
          <tr key={l[0]} className="border-b border-line-soft">
            <th scope="row" className="truncate py-2 pr-2 text-left font-display text-[14px] font-medium text-ink">
              {hasPage(l[0]) ? (
                <Link
                  to={`/player/${lg}/${l[0]}?season=${encodeURIComponent(season)}`}
                  className="underline decoration-line underline-offset-2 hover:decoration-ink"
                >
                  {l[1]}
                </Link>
              ) : (
                l[1]
              )}
            </th>
            <td className={`${NUM} text-ink-soft`}>{l[3]}</td>
            <td className={`${NUM} text-ink`}>{l[4]}</td>
            <td className={`${NUM} text-ink-soft`}>{l[3] === 0 ? <span className="text-ink-faint">–</span> : l[5].toFixed(1)}</td>
            <td className={NUM}>
              <Over fga={l[3]} v={l[4] - l[5]} />
            </td>
            <td className={`${NUM} text-ink-soft`}>
              {l[7]}-{l[6]}
            </td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr className="border-t border-line">
          <th scope="row" className="py-2 text-left font-display text-[11px] font-medium uppercase tracking-wider text-ink-faint">
            Team
          </th>
          <td className={`${NUM} text-ink-soft`}>{tot.fga}</td>
          <td className={`${NUM} font-semibold text-ink`}>{tot.pts}</td>
          <td className={`${NUM} text-ink-soft`}>{tot.xpts.toFixed(1)}</td>
          <td className={`${NUM} font-semibold`}>
            <Over fga={tot.fga} v={tot.pts - tot.xpts} />
          </td>
          <td className={`${NUM} text-ink-soft`}>
            {tot.ftm}-{tot.fta}
          </td>
        </tr>
      </tfoot>
    </table>
  );
}

/** Skeleton rows the height of real ones, while the week chunk loads. */
function SideSkeleton({ team }: { team: string }) {
  return (
    <div aria-hidden="true">
      <p className="pb-2 font-display text-[15px] font-semibold text-ink">{team}</p>
      <div className="h-[29px] border-b border-line" />
      {Array.from({ length: 10 }, (_, i) => (
        <div key={i} className="flex h-[37px] items-center border-b border-line-soft">
          <div className="h-3.5 w-full animate-pulse rounded bg-wash" />
        </div>
      ))}
    </div>
  );
}

export default function PlayerLines({
  lg,
  season,
  detail,
  home,
  away,
  hasPage,
}: {
  lg: League;
  season: string;
  /** Null while the game's week chunk loads. */
  detail: GameDetail | null;
  home: string;
  away: string;
  hasPage: (id: string) => boolean;
}) {
  const [sort, setSort] = useState<Key | null>(null);
  const [dir, setDir] = useState<SortDir>("desc");
  const onSort = (k: Key) => {
    const next = cycleSort(k, sort, dir);
    setSort(next?.sort ?? null);
    setDir(next?.dir ?? "desc");
  };
  const sides = useMemo(
    () => (detail ? ([0, 1] as const).map((s) => detail.p.filter((l) => l[2] === s)) : null),
    [detail],
  );
  const teams = [home, away];

  return (
    <div className="grid gap-10">
      {teams.map((team, s) =>
        sides ? (
          <SideTable
            key={team + s}
            lg={lg}
            season={season}
            team={team}
            lines={sides[s]}
            hasPage={hasPage}
            sort={sort}
            dir={dir}
            onSort={onSort}
          />
        ) : (
          <SideSkeleton key={team + s} team={team} />
        ),
      )}
    </div>
  );
}
