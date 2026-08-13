/**
 * Head-to-head: two players, same season, same baseline, on the same four
 * lenses as the player card. Shot value, shot-making and foul-drawing ship
 * for every league; defence appears where the lineup layer exists (NBA),
 * because adjusted plus-minus is the only defensive measure this site puts
 * under a player's name.
 *
 * Percentile dots are always computed within each player's own season pool,
 * so the page stays honest when the two never share a qualified season: the
 * dots then say "where each stood in his own year", and the copy says so.
 */
import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useData, useLeague, usePlayerChunk, useRapm } from "../data";
import { leagueDef } from "../leagues";
import type {
  GameLine,
  LeaderboardRow,
  RapmRow,
  SeasonDetail,
  ShotValueRow,
} from "../types";
import { useTitle } from "../lib/useTitle";
import { divergingColor, divergingText } from "../lib/color";
import { int, lastName, ordinal, searchKey, signed } from "../lib/format";
import SegmentedControl from "../components/SegmentedControl";
import CompareForm from "../components/charts/CompareForm";
import CourtDuel from "../components/charts/CourtDuel";
import DefenseSpread from "../components/charts/DefenseSpread";

type Lens = "value" | "making" | "fouls" | "defense";

const Z = 1.959964;

function pctOf(pool: number[], v: number): number | null {
  if (pool.length === 0) return null;
  return (pool.filter((x) => x <= v).length / pool.length) * 100;
}

function PlayerPicker({
  label,
  exclude,
  onPick,
}: {
  label: string;
  exclude: string | null;
  onPick: (id: string) => void;
}) {
  const data = useData();
  const [query, setQuery] = useState("");

  const players = useMemo(() => {
    const byId = new Map<string, LeaderboardRow>();
    for (const season of data.meta.seasons) {
      for (const r of data.leaderboard) {
        if (r.season === season && r.pct !== null) byId.set(r.id, r);
      }
    }
    return [...byId.values()];
  }, [data]);

  const results = useMemo(() => {
    const q = searchKey(query.trim());
    if (q.length < 2) return [];
    return players
      .filter((r) => r.id !== exclude && searchKey(r.name).includes(q))
      .sort((a, b) => b.poss - a.poss)
      .slice(0, 5);
  }, [query, players, exclude]);

  return (
    <div className="relative">
      <p className="font-display text-[11px] font-medium uppercase tracking-wider text-ink-faint">
        {label}
      </p>
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Find a player…"
        aria-label={label}
        className="mt-2 w-full rounded-md border border-line bg-paper px-3 py-2 font-display text-[14px] text-ink placeholder:text-ink-faint focus:border-ink-faint focus:outline-none focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-ink"
      />
      {results.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border border-line bg-paper shadow-sm">
          {results.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => {
                  onPick(r.id);
                  setQuery("");
                }}
                className="flex w-full items-baseline justify-between px-3 py-2 text-left font-display text-[13px] text-ink transition-colors duration-100 hover:bg-wash"
              >
                <span>{r.name}</span>
                <span className="font-mono tnum text-xs text-ink-faint">
                  {r.season}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** One metric, two players on a shared percentile track. */
function DuelRow({
  label,
  a,
  b,
  aPct,
  bPct,
  aVal,
  bVal,
  digits = 1,
}: {
  label: string;
  a: string;
  b: string;
  aPct: number | null;
  bPct: number | null;
  aVal: number | null;
  bVal: number | null;
  digits?: number;
}) {
  if (aPct === null && bPct === null) return null;
  return (
    <div className="grid grid-cols-[4rem_minmax(0,1fr)_4rem] items-center gap-x-3 py-3.5 sm:grid-cols-[5rem_minmax(0,1fr)_5rem]">
      <span
        className="font-mono tnum text-right text-sm"
        style={{ color: aVal !== null ? divergingText(aVal) : undefined }}
      >
        {aVal !== null ? signed(aVal, digits) : "–"}
      </span>
      <div>
        <p className="mb-1.5 text-center font-display text-[11px] font-medium uppercase tracking-wider text-ink-faint">
          {label}
        </p>
        <div className="relative h-2 rounded-full bg-wash">
          <span className="absolute left-1/2 top-1/2 h-3.5 w-px -translate-y-1/2 bg-line" />
          {aPct !== null && aVal !== null && (
            <span
              className="absolute top-1/2 grid h-6 w-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full ring-2 ring-paper transition-[left] duration-700 starting:left-1/2"
              style={{
                left: `${Math.min(100, Math.max(0, aPct))}%`,
                background: divergingColor(aVal),
                transitionTimingFunction: "var(--ease-out-strong)",
              }}
              title={`${a}: ${ordinal(Math.floor(aPct))} %ile`}
            >
              <span className="font-mono text-[10px] font-bold leading-none text-paper">
                {a.slice(0, 1)}
              </span>
            </span>
          )}
          {bPct !== null && bVal !== null && (
            <span
              className="absolute top-1/2 grid h-6 w-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full ring-2 ring-paper transition-[left] duration-700 starting:left-1/2"
              style={{
                left: `${Math.min(100, Math.max(0, bPct))}%`,
                background: divergingColor(bVal),
                transitionTimingFunction: "var(--ease-out-strong)",
                marginTop:
                  aPct !== null && Math.abs(aPct - bPct) < 7 ? 13 : 0,
              }}
              title={`${b}: ${ordinal(Math.floor(bPct))} %ile`}
            >
              <span className="font-mono text-[10px] font-bold leading-none text-paper">
                {b.slice(0, 1)}
              </span>
            </span>
          )}
        </div>
      </div>
      <span
        className="font-mono tnum text-sm"
        style={{ color: bVal !== null ? divergingText(bVal) : undefined }}
      >
        {bVal !== null ? signed(bVal, digits) : "–"}
      </span>
    </div>
  );
}

/** One stat, both values. `win: "higher"` marks the larger value with a
    chip, Sofascore-style; rows without it are context, not a contest. */
interface StatRow {
  label: string;
  a: number | string | null;
  b: number | string | null;
  fmt?: (v: number) => string;
  win?: "higher";
  /** Diverging text color on the numbers (signed over/under metrics). */
  color?: boolean;
}

function StatCell({
  row,
  side,
}: {
  row: StatRow;
  side: "a" | "b";
}) {
  const v = row[side];
  const other = row[side === "a" ? "b" : "a"];
  if (v === null || v === undefined)
    return <span className="font-mono text-sm text-ink-faint">–</span>;
  if (typeof v === "string")
    return <span className="font-mono tnum text-sm text-ink-soft">{v}</span>;
  const text = (row.fmt ?? ((x: number) => signed(x, 1)))(v);
  const wins =
    row.win === "higher" && typeof other === "number" && v > other;
  return (
    <span
      className={`font-mono tnum text-sm ${wins ? "rounded bg-wash px-1.5 py-0.5 font-semibold" : ""}`}
      style={{ color: row.color ? divergingText(v) : undefined }}
    >
      {text}
    </span>
  );
}

/** The head-to-head numbers, one stat per row, values facing each other. */
function StatDuelTable({
  rows,
  aName,
  bName,
}: {
  rows: StatRow[];
  aName: string;
  bName: string;
}) {
  return (
    <div className="mt-6">
      <div className="grid grid-cols-[1fr_minmax(7.5rem,auto)_1fr] items-baseline gap-x-3 border-b border-line pb-2">
        <span className="min-w-0 truncate text-center font-display text-[13px] font-semibold text-ink">
          {aName}
        </span>
        <span />
        <span className="min-w-0 truncate text-center font-display text-[13px] font-semibold text-ink">
          {bName}
        </span>
      </div>
      {rows.map((row) => (
        <div
          key={row.label}
          className="grid grid-cols-[1fr_minmax(7.5rem,auto)_1fr] items-center gap-x-3 border-b border-line-soft py-2.5"
        >
          <span className="text-center">
            <StatCell row={row} side="a" />
          </span>
          <span className="mx-auto max-w-[10rem] text-center font-display text-[11px] font-medium uppercase leading-tight tracking-wider text-ink-faint">
            {row.label}
          </span>
          <span className="text-center">
            <StatCell row={row} side="b" />
          </span>
        </div>
      ))}
    </div>
  );
}

const LENS_LABEL: Record<Lens, string> = {
  value: "Shot value",
  making: "Shot-making",
  fouls: "Foul-drawing",
  defense: "Defense",
};

const FORM_WINDOWS = ["5", "10", "15", "20"];

/** The unit each lens's form line is measured in. */
const FORM_UNIT: Record<Exclude<Lens, "defense">, string> = {
  value: "points over expected",
  making: "FG points over expected",
  fouls: "FTAOE",
};

export default function Compare() {
  const data = useData();
  const { league } = useLeague();
  const def = leagueDef(league);
  const hasDefense = !!def.layers?.lineups;
  useTitle("Compare · Over Expected");
  const [params, setParams] = useSearchParams();
  const [formWindow, setFormWindow] = useState("10");

  const aId = params.get("a") || null;
  const bId = params.get("b") || null;

  const lensParam = params.get("lens");
  const lens: Lens =
    lensParam &&
    ["value", "making", "fouls", "defense"].includes(lensParam) &&
    (lensParam !== "defense" || hasDefense)
      ? (lensParam as Lens)
      : "fouls";

  const rowsFor = (id: string | null) =>
    id === null
      ? []
      : data.meta.seasons
          .map((s) =>
            data.leaderboard.find(
              (r) => r.id === id && r.season === s && r.pct !== null,
            ),
          )
          .filter((r): r is LeaderboardRow => r !== undefined);

  const aRows = useMemo(() => rowsFor(aId), [aId, data]); // eslint-disable-line react-hooks/exhaustive-deps
  const bRows = useMemo(() => rowsFor(bId), [bId, data]); // eslint-disable-line react-hooks/exhaustive-deps

  const shared = aRows
    .map((r) => r.season)
    .filter((s) => bRows.some((r) => r.season === s));
  const requested = params.get("season");
  const season =
    requested && shared.includes(requested)
      ? requested
      : shared[shared.length - 1] ?? null;

  const a = season ? aRows.find((r) => r.season === season) ?? null : aRows[aRows.length - 1] ?? null;
  const b = season ? bRows.find((r) => r.season === season) ?? null : bRows[bRows.length - 1] ?? null;
  const sameSeason = !!(a && b && a.season === b.season);

  const aChunk = usePlayerChunk(a?.season ?? null, league);
  const bChunk = usePlayerChunk(b?.season ?? null, league);
  // Layer files stay lazy: rapm-{LG}.json is fetched only once the defence
  // lens is actually open, not on every Compare visit.
  const rapmState = useRapm(hasDefense && lens === "defense" ? league : null);

  const detailFor = (
    p: LeaderboardRow | null,
    chunk: typeof aChunk,
  ): SeasonDetail | undefined =>
    p && chunk.status === "ready" ? chunk.chunk[String(p.id)] : undefined;
  const aDetail = detailFor(a, aChunk);
  const bDetail = detailFor(b, bChunk);

  // Shot-value rows and pools, each within the player's own season.
  const svFor = (p: LeaderboardRow | null): ShotValueRow | undefined =>
    p ? data.shotValue?.[p.season]?.find((r) => r.id === p.id) : undefined;
  const svPoolFor = (p: LeaderboardRow | null): ShotValueRow[] =>
    p ? data.shotValue?.[p.season] ?? [] : [];
  const aSv = svFor(a);
  const bSv = svFor(b);
  const aPool = svPoolFor(a);
  const bPool = svPoolFor(b);

  // RAPM rows and qualified season pools (defence lens, NBA only).
  const rapmFor = (p: LeaderboardRow | null): RapmRow | undefined =>
    p && rapmState.status === "ready"
      ? rapmState.data.players[p.season]?.find((r) => r.id === p.id)
      : undefined;
  const rapmFloor = rapmState.status === "ready" ? rapmState.data.meta.qualifyPoss : 0;
  const rapmQualified = (p: LeaderboardRow | null): RapmRow[] =>
    p && rapmState.status === "ready"
      ? (rapmState.data.players[p.season] ?? []).filter(
          (r) => r.possOff + r.possDef >= rapmFloor,
        )
      : [];
  const aRapm = rapmFor(a);
  const bRapm = rapmFor(b);
  const aboveFloor = (r: RapmRow | undefined) =>
    !!r && r.possOff + r.possDef >= rapmFloor;

  /** Per-game series reframed for the active lens, as on the player card. */
  const lensGames = (
    detail: SeasonDetail | undefined,
    sv: ShotValueRow | undefined,
  ): GameLine[] | undefined => {
    const gs = detail?.games;
    if (!gs) return undefined;
    if (lens === "making") return gs.map((g) => [g[3] ?? 0, g[4] ?? 0, g[2]]);
    if (lens === "value") {
      const leagueFt = data.meta.leagueFt;
      const ft = sv?.ftPct ?? leagueFt;
      return gs.map((g) => [
        (g[3] ?? 0) + g[0] * ft,
        (g[4] ?? 0) + g[1] * leagueFt,
        g[2],
      ]);
    }
    return gs;
  };
  const aGamesL = lensGames(aDetail, aSv);
  const bGamesL = lensGames(bDetail, bSv);

  const update = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) next.set(k, v);
    setParams(next);
  };

  const aN = a ? lastName(a.name) : "A";
  const bN = b ? lastName(b.name) : "B";

  return (
    <div className="mx-auto max-w-3xl px-5 py-12 sm:px-8 sm:py-16">
      <h1 className="font-display text-3xl font-bold tracking-tight text-ink sm:text-5xl">
        Compare
      </h1>
      <p className="mt-3 max-w-prose text-sm leading-relaxed text-ink-soft sm:text-base">
        Two players, same season, same baseline, on every lens the player card
        carries.
      </p>

      <div className="mt-8 grid gap-6 sm:grid-cols-2">
        {a ? (
          <div className="flex items-center justify-between gap-3 border-b border-line pb-3">
            <span className="flex min-w-0 items-center gap-2.5">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-ink font-mono text-[10px] font-bold text-paper">
                {aN.slice(0, 1)}
              </span>
              <Link
                to={`/player/${league}/${a.id}?season=${encodeURIComponent(a.season)}`}
                className="min-w-0 truncate font-display text-xl font-semibold text-ink underline-offset-4 hover:underline"
              >
                {a.name}
              </Link>
            </span>
            <button
              type="button"
              onClick={() => update({ a: "" })}
              className="font-display text-xs text-ink-faint hover:text-ink"
            >
              change
            </button>
          </div>
        ) : (
          <PlayerPicker
            label="Player one"
            exclude={bId}
            onPick={(id) => update({ a: String(id) })}
          />
        )}
        {b ? (
          <div className="flex items-center justify-between gap-3 border-b border-line pb-3">
            <span className="flex min-w-0 items-center gap-2.5">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-ink font-mono text-[10px] font-bold text-paper">
                {bN.slice(0, 1)}
              </span>
              <Link
                to={`/player/${league}/${b.id}?season=${encodeURIComponent(b.season)}`}
                className="min-w-0 truncate font-display text-xl font-semibold text-ink underline-offset-4 hover:underline"
              >
                {b.name}
              </Link>
            </span>
            <button
              type="button"
              onClick={() => update({ b: "" })}
              className="font-display text-xs text-ink-faint hover:text-ink"
            >
              change
            </button>
          </div>
        ) : (
          <PlayerPicker
            label="Player two"
            exclude={aId}
            onPick={(id) => update({ b: String(id) })}
          />
        )}
      </div>

      {a && b && (
        <>
          {shared.length > 0 ? (
            <SegmentedControl
              ariaLabel="Season"
              className="mt-8"
              options={shared.map((s) => ({
                value: s,
                label: s,
                shortLabel: `'${s.slice(2, 4)}-${s.slice(5)}`,
              }))}
              value={season ?? shared[shared.length - 1]}
              onChange={(s) => update({ season: s })}
            />
          ) : (
            <p className="mt-8 text-sm text-ink-soft">
              No season where both qualified; showing each player's latest
              qualified season ({a.season} vs {b.season}), each ranked within
              his own year.
            </p>
          )}

          <div className="mt-5">
            <SegmentedControl
              ariaLabel="Metric"
              options={(
                ["value", "making", "fouls", ...(hasDefense ? (["defense"] as const) : [])] as Lens[]
              ).map((l) => ({ value: l, label: LENS_LABEL[l] }))}
              value={lens}
              onChange={(l) => update({ lens: l })}
            />
          </div>

          {/* the duel block for the active lens */}
          {lens === "value" && (
            <>
              <div className="mt-6 border-y border-line py-2">
                <DuelRow
                  label="Points over expected / 100"
                  a={aN}
                  b={bN}
                  aPct={aSv ? pctOf(aPool.map((r) => r.poe100), aSv.poe100) : null}
                  bPct={bSv ? pctOf(bPool.map((r) => r.poe100), bSv.poe100) : null}
                  aVal={aSv?.poe100 ?? null}
                  bVal={bSv?.poe100 ?? null}
                />
                <DuelRow
                  label="Shot-making, FG pts / 100"
                  a={aN}
                  b={bN}
                  aPct={aSv ? pctOf(aPool.map((r) => r.fgPoe100), aSv.fgPoe100) : null}
                  bPct={bSv ? pctOf(bPool.map((r) => r.fgPoe100), bSv.fgPoe100) : null}
                  aVal={aSv?.fgPoe100 ?? null}
                  bVal={bSv?.fgPoe100 ?? null}
                />
                <DuelRow
                  label="Foul-drawing / 100"
                  a={aN}
                  b={bN}
                  aPct={aSv ? pctOf(aPool.map((r) => r.ftaoe100), aSv.ftaoe100) : null}
                  bPct={bSv ? pctOf(bPool.map((r) => r.ftaoe100), bSv.ftaoe100) : null}
                  aVal={aSv?.ftaoe100 ?? null}
                  bVal={bSv?.ftaoe100 ?? null}
                />
              </div>
              <StatDuelTable
                aName={a.name}
                bName={b.name}
                rows={[
                  { label: "Points over expected / 100", a: aSv?.poe100 ?? null, b: bSv?.poe100 ?? null, win: "higher", color: true },
                  { label: "Shot-making, FG pts / 100", a: aSv?.fgPoe100 ?? null, b: bSv?.fgPoe100 ?? null, win: "higher", color: true },
                  { label: "Foul-drawing / 100", a: aSv?.ftaoe100 ?? null, b: bSv?.ftaoe100 ?? null, win: "higher", color: true },
                  { label: "Expected points per shot", a: aSv?.xptsShot ?? null, b: bSv?.xptsShot ?? null, fmt: (v) => v.toFixed(2), win: "higher" },
                  { label: "FG%", a: aSv?.fgPct ?? null, b: bSv?.fgPct ?? null, fmt: (v) => v.toFixed(1) },
                  { label: "Expected FG%", a: aSv?.xfgPct ?? null, b: bSv?.xfgPct ?? null, fmt: (v) => v.toFixed(1) },
                  { label: "FG attempts", a: aSv?.fga ?? null, b: bSv?.fga ?? null, fmt: int },
                  { label: "Possessions", a: a.poss, b: b.poss, fmt: int },
                  { label: "Team", a: a.teams.join("/"), b: b.teams.join("/") },
                ]}
              />
            </>
          )}

          {lens === "making" && (
            <>
              <div className="mt-6 border-y border-line py-2">
                <DuelRow
                  label="FG points over expected / 100"
                  a={aN}
                  b={bN}
                  aPct={aSv ? pctOf(aPool.map((r) => r.fgPoe100), aSv.fgPoe100) : null}
                  bPct={bSv ? pctOf(bPool.map((r) => r.fgPoe100), bSv.fgPoe100) : null}
                  aVal={aSv?.fgPoe100 ?? null}
                  bVal={bSv?.fgPoe100 ?? null}
                />
                <DuelRow
                  label="Make over expected, pp"
                  a={aN}
                  b={bN}
                  aPct={aSv ? pctOf(aPool.map((r) => r.makeOE), aSv.makeOE) : null}
                  bPct={bSv ? pctOf(bPool.map((r) => r.makeOE), bSv.makeOE) : null}
                  aVal={aSv?.makeOE ?? null}
                  bVal={bSv?.makeOE ?? null}
                />
              </div>
              <StatDuelTable
                aName={a.name}
                bName={b.name}
                rows={[
                  { label: "FG points over expected / 100", a: aSv?.fgPoe100 ?? null, b: bSv?.fgPoe100 ?? null, win: "higher", color: true },
                  { label: "Make over expected, pp", a: aSv?.makeOE ?? null, b: bSv?.makeOE ?? null, win: "higher", color: true },
                  { label: "FG%", a: aSv?.fgPct ?? null, b: bSv?.fgPct ?? null, fmt: (v) => v.toFixed(1) },
                  { label: "Expected FG%", a: aSv?.xfgPct ?? null, b: bSv?.xfgPct ?? null, fmt: (v) => v.toFixed(1) },
                  { label: "FG attempts", a: aSv?.fga ?? null, b: bSv?.fga ?? null, fmt: int },
                  { label: "Possessions", a: a.poss, b: b.poss, fmt: int },
                  { label: "Team", a: a.teams.join("/"), b: b.teams.join("/") },
                ]}
              />
            </>
          )}

          {lens === "fouls" && (
            <>
              <div className="mt-6 border-y border-line py-2">
                <DuelRow
                  label="FTAOE per 100"
                  a={aN}
                  b={bN}
                  aPct={a.pct}
                  bPct={b.pct}
                  aVal={a.per100}
                  bVal={b.per100}
                />
                <DuelRow
                  label="Style-adjusted"
                  a={aN}
                  b={bN}
                  aPct={a.spct}
                  bPct={b.spct}
                  aVal={a.sper100}
                  bVal={b.sper100}
                />
              </div>
              <StatDuelTable
                aName={a.name}
                bName={b.name}
                rows={[
                  { label: "FTAOE / 100", a: a.per100, b: b.per100, win: "higher", color: true },
                  { label: "Style-adjusted / 100", a: a.sper100, b: b.sper100, win: "higher", color: true },
                  { label: "Extra FTA vs league", a: a.ftaoe, b: b.ftaoe, win: "higher", color: true },
                  { label: "FTA drawn", a: a.fta, b: b.fta, fmt: int },
                  { label: "Expected FTA", a: a.xfta, b: b.xfta, fmt: (v) => v.toFixed(1) },
                  { label: "Possessions", a: a.poss, b: b.poss, fmt: int },
                  { label: "Team", a: a.teams.join("/"), b: b.teams.join("/") },
                ]}
              />
            </>
          )}

          {lens === "defense" &&
            (rapmState.status === "loading" ? (
              <div className="mt-6 h-40 animate-pulse rounded bg-wash" aria-busy="true" />
            ) : rapmState.status === "error" ? (
              <p className="mt-6 rounded border border-line-soft bg-wash px-4 py-8 text-center text-sm text-ink-faint">
                The defensive data failed to load. Refresh to retry.
              </p>
            ) : (
              <>
                <div className="mt-6 border-y border-line py-2">
                  <DuelRow
                    label="Defensive RAPM / 100"
                    a={aN}
                    b={bN}
                    aPct={
                      aRapm && aboveFloor(aRapm)
                        ? pctOf(rapmQualified(a).map((r) => r.dP), aRapm.dP)
                        : null
                    }
                    bPct={
                      bRapm && aboveFloor(bRapm)
                        ? pctOf(rapmQualified(b).map((r) => r.dP), bRapm.dP)
                        : null
                    }
                    aVal={aRapm?.dP ?? null}
                    bVal={bRapm?.dP ?? null}
                  />
                  <DuelRow
                    label="Net RAPM / 100"
                    a={aN}
                    b={bN}
                    aPct={
                      aRapm && aboveFloor(aRapm)
                        ? pctOf(rapmQualified(a).map((r) => r.netP), aRapm.netP)
                        : null
                    }
                    bPct={
                      bRapm && aboveFloor(bRapm)
                        ? pctOf(rapmQualified(b).map((r) => r.netP), bRapm.netP)
                        : null
                    }
                    aVal={aRapm?.netP ?? null}
                    bVal={bRapm?.netP ?? null}
                  />
                </div>
                <StatDuelTable
                  aName={a.name}
                  bName={b.name}
                  rows={[
                    { label: "Defensive RAPM / 100", a: aRapm?.dP ?? null, b: bRapm?.dP ?? null, win: "higher", color: true },
                    { label: "Standard error", a: aRapm?.seD ?? null, b: bRapm?.seD ?? null, fmt: (v) => `± ${v.toFixed(1)}` },
                    { label: "Offensive RAPM / 100", a: aRapm?.oP ?? null, b: bRapm?.oP ?? null, win: "higher", color: true },
                    { label: "Net RAPM / 100", a: aRapm?.netP ?? null, b: bRapm?.netP ?? null, win: "higher", color: true },
                    { label: "Defensive possessions", a: aRapm?.possDef ?? null, b: bRapm?.possDef ?? null, fmt: int },
                    { label: "Team", a: a.teams.join("/"), b: b.teams.join("/") },
                  ]}
                />
                {(!aboveFloor(aRapm) || !aboveFloor(bRapm)) && (
                  <p className="mt-3 text-xs leading-relaxed text-ink-faint">
                    {[
                      { r: aRapm, p: a },
                      { r: bRapm, p: b },
                    ]
                      .filter(({ r }) => r && !aboveFloor(r))
                      .map(({ r, p }) =>
                        `${lastName(p.name)} is below the layer's ${int(rapmFloor)}-possession floor (${int(r!.possOff + r!.possDef)} poss): his numbers are shown, not ranked.`,
                      )
                      .join(" ")}
                  </p>
                )}

                {sameSeason && aboveFloor(aRapm) && aboveFloor(bRapm) ? (
                  <section className="mt-10">
                    <h2 className="font-display text-xl font-semibold tracking-tight text-ink sm:text-2xl">
                      Against the league, together
                    </h2>
                    <p className="mt-1.5 max-w-prose text-sm text-ink-soft">
                      Every qualified defender in {season}, both players lifted
                      out, each 95% interval drawn to the same scale.
                    </p>
                    <div className="mt-4">
                      <DefenseSpread
                        rows={rapmQualified(a)}
                        playerId={a.id}
                        playerBId={b.id}
                      />
                    </div>
                    {aRapm && bRapm && (
                      <p className="mt-2 max-w-prose text-xs leading-relaxed text-ink-faint">
                        {(() => {
                          const lo = Math.max(aRapm.dP - Z * aRapm.seD, bRapm.dP - Z * bRapm.seD);
                          const hi = Math.min(aRapm.dP + Z * aRapm.seD, bRapm.dP + Z * bRapm.seD);
                          return hi >= lo
                            ? "The two intervals overlap: a season of lineup data cannot separate these two defenders at 95% confidence, whatever the point estimates suggest."
                            : "The two intervals do not overlap: even at 95% confidence the season separates these two defenders.";
                        })()}
                      </p>
                    )}
                  </section>
                ) : (
                  <p className="mt-6 text-xs leading-relaxed text-ink-faint">
                    {sameSeason
                      ? `The against-the-league figure needs both players above the layer's ${int(rapmFloor)}-possession floor.`
                      : "The against-the-league figure needs a shared season; these two are ranked within different years."}
                  </p>
                )}
              </>
            ))}

          {/* form, both players on one axis — the totals live in the table
              above; what they cannot show is WHEN each player was good */}
          {lens !== "defense" && (
            <section className="mt-12">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <h2 className="font-display text-xl font-semibold tracking-tight text-ink sm:text-2xl">
                    Form, on one axis
                  </h2>
                  <p className="mt-1.5 max-w-prose text-sm text-ink-soft">
                    Trailing {formWindow}-game {FORM_UNIT[lens]} per 100
                    possessions, both players against the same league pace:
                    streaks, slumps, and who was trending where.
                    {!sameSeason && " Each line runs over its own season."}
                  </p>
                </div>
                <SegmentedControl
                  ariaLabel="Window size in games"
                  options={FORM_WINDOWS.map((w) => ({ value: w, label: `${w} gm` }))}
                  value={formWindow}
                  onChange={setFormWindow}
                />
              </div>
              {aGamesL && bGamesL ? (
                <CompareForm
                  aName={a.name}
                  bName={b.name}
                  aGames={aGamesL}
                  bGames={bGamesL}
                  window={Number(formWindow)}
                  className="mt-6"
                />
              ) : aChunk.status === "error" || bChunk.status === "error" ? (
                <p className="mt-6 rounded border border-line-soft bg-wash px-4 py-6 text-center text-sm text-ink-faint">
                  The per-game series failed to load.
                </p>
              ) : (
                <div className="mt-6 h-[240px] animate-pulse rounded bg-wash" aria-busy="true" />
              )}
            </section>
          )}

          {/* where it happens: one court, the shot diets subtracted */}
          {lens !== "defense" && (
            <section className="mt-12">
              <h2 className="font-display text-xl font-semibold tracking-tight text-ink sm:text-2xl">
                Where it happens
              </h2>
              <p className="mt-1.5 max-w-prose text-sm text-ink-soft">
                The two shot diets, subtracted: each zone leans toward the
                player who takes a larger share of his own attempts there, and
                zones they use equally stay pale.
              </p>
              {aDetail && bDetail ? (
                <CourtDuel
                  court={def.court}
                  aName={a.name}
                  bName={b.name}
                  aZones={aDetail.zones}
                  bZones={bDetail.zones}
                  className="mt-6 max-w-[560px]"
                />
              ) : (
                <div
                  className="mt-6 aspect-[500/434] max-w-[560px] animate-pulse rounded bg-wash"
                  aria-busy="true"
                />
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
