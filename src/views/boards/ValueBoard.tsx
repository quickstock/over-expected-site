/**
 * Layer 2 — value. Production (wins over replacement) always; contract surplus
 * only where per-player salaries were available at export.
 *
 * The dollar half is genuinely absent for now, and the board says so instead of
 * rendering an empty money column. That is the same posture the European
 * leagues will need permanently: they publish club remuneration totals, never
 * per-player salaries.
 */
import { useMemo, useTransition } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useLeague, useValue } from "../../data";
import { ACTIVE_LEAGUES, leagueDef, type League } from "../../leagues";
import type { ValueRow } from "../../types";
import { divergingColor, divergingText, scaleMax } from "../../lib/color";
import { int, signed } from "../../lib/format";
import { useTitle } from "../../lib/useTitle";
import SegmentedControl from "../../components/SegmentedControl";
import { useEffect } from "react";

type Sort = "war" | "net" | "poss" | "surplus";

const SORT_LABEL: Record<Sort, string> = {
  war: "Wins over repl.",
  net: "Net / 100",
  poss: "Poss",
  surplus: "Surplus",
};

const usd = (v: number) => {
  const m = v / 1e6;
  return `${v < 0 ? "−" : ""}$${Math.abs(m).toFixed(1)}M`;
};

/** Bar scaled to the largest WAR on screen, so the column reads comparably. */
function WarBar({ v, max }: { v: number; max: number }) {
  const t = max > 0 ? Math.max(0, v) / max : 0;
  return (
    <span className="relative block h-1.5 w-20" aria-hidden="true">
      <span
        className="absolute left-0 top-0 h-full rounded-full"
        style={{ width: `${(t * 100).toFixed(1)}%`, background: divergingColor(scaleMax()) }}
      />
    </span>
  );
}

function Unavailable({ label }: { label: string }) {
  return (
    <div className="mx-auto max-w-xl px-5 py-28 text-center sm:px-8">
      <h1 className="font-display text-2xl font-semibold text-ink">
        Value isn't built for {label} yet.
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-ink-soft">
        This layer needs the lineup model underneath it, which runs for the NBA
        today, and per-player salaries, which only the NBA publishes at all.
      </p>
      <Link
        to="/leaderboard"
        className="mt-8 inline-block rounded-md bg-ink px-5 py-2.5 font-display text-sm font-medium text-paper"
      >
        Back to the leaderboard
      </Link>
    </div>
  );
}

export default function ValueBoard() {
  const { lg } = useParams();
  const league = (lg && ACTIVE_LEAGUES.includes(lg as League)
    ? lg
    : ACTIVE_LEAGUES[0]) as League;
  const def = leagueDef(league);
  const { league: active, setLeague } = useLeague();
  useEffect(() => {
    if (league !== active) setLeague(league);
  }, [league, active, setLeague]);
  useTitle("Value · Over Expected");

  const [params, setParams] = useSearchParams();
  const [, startTransition] = useTransition();
  const state = useValue(league);

  // All hooks must run on every render, so `rows` is computed here — before the
  // early returns below — and made null-safe. Calling useMemo after a conditional
  // return changes the hook count once the data resolves, which is React error
  // #310 ("rendered more hooks than during the previous render") and blanks the
  // whole route.
  const data = state.status === "ready" ? state.data : null;
  const seasonsSafe = data?.meta.seasons ?? [];
  const seasonSafe = seasonsSafe.includes(params.get("season") ?? "")
    ? (params.get("season") as string)
    : seasonsSafe[seasonsSafe.length - 1] ?? "";
  const sortSafe = (["war", "net", "poss", "surplus"].includes(params.get("sort") ?? "")
    ? params.get("sort")
    : "war") as Sort;
  const dirSafe = params.get("dir") === "asc" ? "asc" : "desc";
  const minPossSafe = data
    ? Math.max(0, Math.min(data!.meta.boardMax,
        Number(params.get("min") ?? data.meta.qualifyPoss) || 0))
    : 0;

  const rows = useMemo(() => {
    if (!data) return [] as ValueRow[];
    const mul = dirSafe === "asc" ? 1 : -1;
    const key = (r: ValueRow) =>
      sortSafe === "surplus" ? (r.surplus ?? 0)
      : sortSafe === "net" ? r.net
      : sortSafe === "poss" ? r.poss
      : r.war;
    return (data.players[seasonSafe] ?? [])
      .filter((r) => r.poss >= minPossSafe)
      .slice()
      .sort((a, b) => mul * (key(a) - key(b)));
  }, [data, seasonSafe, minPossSafe, sortSafe, dirSafe]);

  if (!def.layers?.value) return <Unavailable label={def.label} />;
  if (state.status === "loading")
    return (
      <div className="mx-auto max-w-5xl px-6 py-24">
        <div className="h-64 animate-pulse rounded bg-wash" />
      </div>
    );
  if (state.status === "error")
    return (
      <p className="mx-auto max-w-xl px-6 py-32 text-center text-ink-soft">
        The value data failed to load.
      </p>
    );

  const seasons = data!.meta.seasons;
  const season = seasonSafe;
  const hasSalary = data!.meta.salaryAvailable[season] ?? false;
  const sort = sortSafe;
  const dir = dirSafe;
  const minPoss = minPossSafe;

  const update = (patch: Record<string, string>) =>
    startTransition(() => {
      const next = new URLSearchParams(params);
      for (const [k, v] of Object.entries(patch)) next.set(k, v);
      setParams(next, { replace: false });
    });
  const onSort = (k: Sort) =>
    update(k === sort ? { dir: dir === "desc" ? "asc" : "desc" } : { sort: k, dir: "desc" });


  const maxWar = rows.reduce((m, r) => Math.max(m, r.war), 0);
  const cols = hasSalary
    ? "grid-cols-[2.5rem_minmax(0,1fr)_5.5rem_5rem_7rem_7rem]"
    : "grid-cols-[2.5rem_minmax(0,1fr)_6rem_6rem_9rem]";

  return (
    <div>
      <div className="sticky top-0 z-10 border-b border-line bg-paper">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-5 gap-y-3 px-5 py-3 sm:px-8">
          <SegmentedControl
            ariaLabel="Season"
            options={seasons.map((s) => ({ value: s, label: s, shortLabel: `'${s.slice(2, 4)}` }))}
            value={season}
            onChange={(s) => update({ season: s })}
          />
          <label className="flex items-center gap-2.5">
            <span className="font-display text-[11px] font-medium uppercase tracking-wider text-ink-faint">
              Floor
            </span>
            <input
              type="range"
              min={0}
              max={data!.meta.boardMax}
              step={data!.meta.boardStep}
              value={minPoss}
              onChange={(e) => update({ min: e.target.value })}
              className="w-28 accent-ink sm:w-36"
              aria-label="Minimum possessions"
            />
            <span className="font-mono tnum w-20 text-xs text-ink-soft">≥ {int(minPoss)}</span>
          </label>
          <span className="ml-auto font-mono tnum text-xs text-ink-faint">
            {int(rows.length)} players
          </span>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-5 pt-8 sm:px-8 sm:pt-12">
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Value</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
          Impact turned into wins, on the same replacement-level scale the public
          metrics use: how far a player sits above a replacement-level player,
          times how much of his team's floor time he took, times the season.
        </p>
        <p className="mt-2.5 max-w-2xl font-mono text-xs leading-relaxed text-ink-soft">
          (impact − {data!.meta.replacementPer100.toFixed(1)}) × possession share
          × season length × {data!.meta.winsPerVorp} = wins over replacement
        </p>
        <p className="mt-2.5 max-w-2xl text-sm leading-relaxed text-ink-soft">
          The impact term is this site's own adjusted plus-minus instead of a
          box-score estimate of it.
        </p>

        {!hasSalary && (
          <p className="mt-5 rounded border border-line-soft bg-wash px-4 py-4 text-sm leading-relaxed text-ink-soft">
            <strong className="font-display font-semibold text-ink">
              Surplus is not shown for {season}.
            </strong>{" "}
            Pricing production against pay needs a salary for every player, and
            no free licensed source publishes one. So the board shows production
            and stops there rather than printing an invented dollar column. The
            pipeline picks salaries up the moment a file exists, with no
            modelling change.
          </p>
        )}

        <div
          className={`mt-8 hidden ${cols} items-end gap-x-4 border-b border-line pb-2 sm:grid`}
        >
          <span />
          <span className="font-display text-[11px] font-medium uppercase tracking-wider text-ink-faint">
            Player
          </span>
          {(["poss", "net"] as Sort[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => onSort(k)}
              className={`text-right font-display text-[11px] font-medium uppercase tracking-wider ${
                sort === k ? "text-ink" : "text-ink-faint hover:text-ink-soft"
              }`}
            >
              {SORT_LABEL[k]}
            </button>
          ))}
          {hasSalary && (
            <button
              type="button"
              onClick={() => onSort("surplus")}
              className={`text-right font-display text-[11px] font-medium uppercase tracking-wider ${
                sort === "surplus" ? "text-ink" : "text-ink-faint hover:text-ink-soft"
              }`}
            >
              {SORT_LABEL.surplus}
            </button>
          )}
          <button
            type="button"
            onClick={() => onSort("war")}
            className={`text-right font-display text-[11px] font-medium uppercase tracking-wider ${
              sort === "war" ? "text-ink" : "text-ink-faint hover:text-ink-soft"
            }`}
          >
            {SORT_LABEL.war}
          </button>
        </div>

        {rows.length === 0 ? (
          <p className="py-16 text-center text-sm text-ink-faint">
            No players match. Lower the possession floor.
          </p>
        ) : (
          <ol className="pb-10">
            {rows.map((r, i) => (
              <li key={r.id} className="cv-row">
                <Link
                  to={`/player/${league}/${r.id}?season=${encodeURIComponent(season)}`}
                  className="group block border-b border-line-soft transition-colors duration-150 hover:bg-wash"
                >
                  <div className={`hidden ${cols} items-center gap-x-4 py-3 sm:grid`}>
                    <span className="text-right font-mono tnum text-sm text-ink-faint">
                      {i + 1}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-display text-[15px] font-semibold text-ink">
                        {r.name}
                      </span>
                      <span className="block truncate text-xs text-ink-soft">
                        {r.teams.join(" · ")} · {(r.share * 100).toFixed(0)}% of team possessions
                      </span>
                    </span>
                    <span className="text-right font-mono tnum text-sm text-ink-soft">
                      {int(r.poss)}
                    </span>
                    <span
                      className="text-right font-mono tnum text-sm"
                      style={{ color: divergingText(r.net) }}
                    >
                      {signed(r.net, 1)}
                    </span>
                    {hasSalary && (
                      <span
                        className="text-right font-mono tnum text-sm"
                        style={{ color: r.surplus === null ? undefined : divergingText(r.surplus / 1e6) }}
                      >
                        {r.surplus === null ? "–" : usd(r.surplus)}
                      </span>
                    )}
                    <span className="flex items-center justify-end gap-3">
                      <WarBar v={r.war} max={maxWar} />
                      <span className="w-12 text-right font-mono tnum text-lg text-ink">
                        {r.war.toFixed(1)}
                      </span>
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2.5 py-3 sm:hidden">
                    <span className="w-6 text-right font-mono tnum text-xs text-ink-faint">
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-display text-[15px] font-semibold text-ink">
                      {r.name}
                    </span>
                    <span className="font-mono tnum text-lg text-ink">{r.war.toFixed(1)}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
