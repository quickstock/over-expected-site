import { useMemo } from "react";
import type { CSSProperties } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useData, useLeague } from "../data";
import { leagueDef } from "../leagues";
import { int, signed } from "../lib/format";
import { useTitle } from "../lib/useTitle";
import SegmentedControl from "../components/SegmentedControl";
import SortHeader, { cycleSort } from "../components/SortHeader";

type SortKey = "diff" | "games" | "per100";

const SORT_LABEL: Record<SortKey, string> = {
  diff: "vs league",
  games: "Games",
  per100: "FTA/100",
};

/**
 * Neutral bar centered on the season league rate: right = more drawn
 * free throws than the league saw in their games, left = fewer. Deliberately
 * NOT the warm/cool FTAOE encoding (those are player values, not officials).
 */
function RefBar({ diff, className = "w-24" }: { diff: number; className?: string }) {
  const SCALE = 4; // per-100 either side saturates the strip
  const t = Math.min(Math.abs(diff), SCALE) / SCALE;
  const fill: CSSProperties = {
    width: `${(t * 50).toFixed(2)}%`,
    background: "var(--color-ink-soft)",
  };
  if (diff >= 0) fill.left = "50%";
  else fill.right = "50%";
  return (
    <span className={`relative block h-1.5 ${className}`} aria-hidden="true">
      <span className="absolute inset-y-0 left-1/2 w-px bg-line" />
      <span className="absolute top-0 h-full rounded-full" style={fill} />
    </span>
  );
}

export default function Referees() {
  const data = useData();
  const { league } = useLeague();
  const refMinGames = leagueDef(league).refMinGames;
  const [params, setParams] = useSearchParams();
  useTitle("Referees · Over Expected");

  const seasons = data.meta.seasons;
  const season = seasons.includes(params.get("season") ?? "")
    ? (params.get("season") as string)
    : data.meta.defaultSeason;
  // Explicit sort = the user clicked a column; null = the page's own order
  // (diff desc), which renders with no direction indicator.
  const explicit = ["diff", "games", "per100"].includes(params.get("sort") ?? "")
    ? (params.get("sort") as SortKey)
    : null;
  const sort = explicit ?? "diff";
  const dir = params.get("dir") === "asc" ? "asc" : "desc";

  const update = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) next.set(k, v);
    setParams(next, { replace: false });
  };
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

  const lg = data.meta.leagueRateBySeason[season];
  const rows = useMemo(() => {
    const mul = dir === "asc" ? 1 : -1;
    return [...(data.referees[season] ?? [])].sort(
      (a, b) => mul * (a[sort] - b[sort]),
    );
  }, [data.referees, season, sort, dir]);

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
            onChange={(s) => update({ season: s })}
          />
          <span className="ml-auto font-mono tnum text-xs text-ink-faint">
            {int(rows.length)} officials
          </span>
        </div>
        {/* mobile sort */}
        <div className="mx-auto flex max-w-4xl items-center gap-4 px-5 pb-3 sm:hidden">
          {(["diff", "games", "per100"] as SortKey[]).map((k) => (
            <SortHeader key={k} k={k} label={SORT_LABEL[k]} sort={explicit} dir={dir} onSort={onSort} />
          ))}
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-5 pb-8 pt-8 sm:px-8 sm:pt-12">
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
          Referees
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
          Drawn free throws per 100 possessions in the games each
          official worked, {season}, against the season league rate of{" "}
          <span className="font-mono tnum">{lg.toFixed(1)}</span>. Minimum 20
          games. Tap a name for how the whistle moves by quarter and by game
          script.
        </p>

        {/* desktop header */}
        <div className="mt-8 hidden grid-cols-[2.75rem_minmax(0,1fr)_5rem_9rem_5.5rem] items-end gap-x-4 border-b border-line pb-2 sm:grid">
          <span />
          <span className="font-display text-[11px] font-medium uppercase tracking-wider text-ink-faint">
            Official
          </span>
          <SortHeader k="games" label={SORT_LABEL.games} sort={explicit} dir={dir} onSort={onSort} className="text-right" />
          <span className="text-right font-display text-[11px] font-medium uppercase tracking-wider text-ink-faint">
            vs league rate
          </span>
          <SortHeader k="diff" label={SORT_LABEL.diff} sort={explicit} dir={dir} onSort={onSort} className="text-right" />
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
                  <div className="hidden grid-cols-[2.75rem_minmax(0,1fr)_5rem_9rem_5.5rem] items-center gap-x-4 py-3 sm:grid">
                    <span className="text-right font-mono tnum text-sm text-ink-faint">
                      {i + 1}
                    </span>
                    <span className="min-w-0 truncate font-display text-[15px] font-semibold text-ink">
                      {r.name}
                    </span>
                    <span className="text-right font-mono tnum text-sm text-ink-soft">
                      {int(r.games)}
                    </span>
                    <span className="flex items-center justify-end gap-3">
                      <span className="font-mono tnum text-xs text-ink-faint">
                        {r.per100.toFixed(1)}
                      </span>
                      <RefBar diff={r.diff} />
                    </span>
                    <span className="text-right font-mono tnum text-sm text-ink">
                      {signed(r.diff, 1)}
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
                        {signed(r.diff, 1)}
                      </span>
                    </span>
                    <span className="flex items-center gap-2.5 pl-9">
                      <span className="min-w-0 flex-1 truncate text-xs text-ink-soft">
                        {int(r.games)} games · {r.per100.toFixed(1)} per 100
                      </span>
                      <RefBar diff={r.diff} className="w-16" />
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ol>
        )}

        <p className="mt-6 max-w-2xl text-xs leading-relaxed text-ink-faint">
          Descriptive, league-level only. Crew tendency is one of the context
          features the expected-FTA model already adjusts for, and assignments
          are not random (workloads and slates differ). This site deliberately
          does not publish player-by-official splits.{" "}
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
