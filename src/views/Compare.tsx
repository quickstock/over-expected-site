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
import GapArc from "../components/charts/GapArc";
import CourtZones from "../components/charts/CourtZones";
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

/** The per-player fact line under a duel block. */
function FactPair({ lines }: { lines: [React.ReactNode, React.ReactNode] }) {
  return (
    <div className="mt-4 grid grid-cols-2 gap-x-6 text-sm">
      {lines.map((l, i) => (
        <p key={i} className="font-mono tnum text-ink-soft">
          {l}
        </p>
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

export default function Compare() {
  const data = useData();
  const { league } = useLeague();
  const def = leagueDef(league);
  const hasDefense = !!def.layers?.lineups;
  useTitle("Compare · Over Expected");
  const [params, setParams] = useSearchParams();

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

  const headline = (
    p: LeaderboardRow,
    sv: ShotValueRow | undefined,
    rapm: RapmRow | undefined,
  ): number | null =>
    lens === "value"
      ? sv?.poe100 ?? null
      : lens === "making"
        ? sv?.fgPoe100 ?? null
        : lens === "defense"
          ? rapm?.dP ?? null
          : p.per100;

  const update = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) next.set(k, v);
    setParams(next);
  };

  const aN = a ? lastName(a.name) : "A";
  const bN = b ? lastName(b.name) : "B";

  const arcCopy: Record<Exclude<Lens, "defense">, string> = {
    value:
      "Cumulative points generated vs what an average shot diet would yield, game by game: field goals plus the free throws drawn.",
    making: "Cumulative field-goal points vs what the looks were worth, game by game.",
    fouls: `Cumulative ${def.sftaOnly ? "shooting-foul free throws" : "drawn free throws"} vs the league-average pace, game by game.`,
  };

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
              <FactPair
                lines={[aSv, bSv].map((sv, i) => {
                  const p = i === 0 ? a : b;
                  return sv ? (
                    <>
                      {sv.xptsShot.toFixed(2)}{" "}
                      <span className="text-ink-faint">xPts/shot ·</span>{" "}
                      {int(sv.fga)} <span className="text-ink-faint">FGA ·</span>{" "}
                      {int(p.poss)} <span className="text-ink-faint">poss ·</span>{" "}
                      {p.teams.join("/")}
                    </>
                  ) : (
                    <>no shot-value row for {p.season}</>
                  );
                }) as [React.ReactNode, React.ReactNode]}
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
              <FactPair
                lines={[aSv, bSv].map((sv, i) => {
                  const p = i === 0 ? a : b;
                  return sv ? (
                    <>
                      {sv.fgPct.toFixed(1)}{" "}
                      <span className="text-ink-faint">FG% vs</span>{" "}
                      {sv.xfgPct.toFixed(1)}{" "}
                      <span className="text-ink-faint">expected ·</span>{" "}
                      {int(sv.fga)} <span className="text-ink-faint">FGA ·</span>{" "}
                      {p.teams.join("/")}
                    </>
                  ) : (
                    <>no shot-value row for {p.season}</>
                  );
                }) as [React.ReactNode, React.ReactNode]}
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
              <FactPair
                lines={[a, b].map((p) => (
                  <>
                    {int(p.fta)} <span className="text-ink-faint">FTA vs</span>{" "}
                    {p.xfta.toFixed(1)}{" "}
                    <span className="text-ink-faint">expected ·</span>{" "}
                    {int(p.poss)} <span className="text-ink-faint">poss ·</span>{" "}
                    {p.teams.join("/")}
                  </>
                )) as [React.ReactNode, React.ReactNode]}
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
                <FactPair
                  lines={[aRapm, bRapm].map((r, i) => {
                    const p = i === 0 ? a : b;
                    if (!r) return <>no adjusted plus-minus for {p.season}</>;
                    if (!aboveFloor(r))
                      return (
                        <>
                          {int(r.possOff + r.possDef)}{" "}
                          <span className="text-ink-faint">
                            poss, below the {int(rapmFloor)} floor: shown, not
                            ranked
                          </span>
                        </>
                      );
                    return (
                      <>
                        ± {r.seD.toFixed(1)}{" "}
                        <span className="text-ink-faint">SE ·</span>{" "}
                        {int(r.possDef)}{" "}
                        <span className="text-ink-faint">def poss ·</span>{" "}
                        {p.teams.join("/")}
                      </>
                    );
                  }) as [React.ReactNode, React.ReactNode]}
                />

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

          {/* the season, drawn as a gap — one arc per player, in the lens's unit */}
          {lens !== "defense" && (
            <div className="mt-10 space-y-8">
              <p className="max-w-prose text-sm text-ink-soft">
                {arcCopy[lens]}
              </p>
              {(
                [
                  { row: a, sv: aSv, detail: aDetail, chunk: aChunk },
                  { row: b, sv: bSv, detail: bDetail, chunk: bChunk },
                ] as const
              ).map(({ row, sv, detail, chunk }) => {
                const games = lensGames(detail, sv);
                const metric = headline(row, sv, undefined);
                return (
                  <div key={row.id}>
                    <p className="font-display text-sm font-semibold text-ink">
                      {row.name}{" "}
                      {metric !== null && (
                        <span
                          className="font-mono tnum font-normal"
                          style={{ color: divergingText(metric) }}
                        >
                          {signed(metric, 1)}
                        </span>
                      )}
                      <span className="font-mono text-xs text-ink-faint">
                        {" "}
                        · {row.season}
                      </span>
                    </p>
                    {games ? (
                      <GapArc games={games} height={190} className="mt-2" />
                    ) : chunk.status === "error" ? (
                      <p className="mt-2 rounded border border-line-soft bg-wash px-4 py-6 text-center text-sm text-ink-faint">
                        The per-game series failed to load.
                      </p>
                    ) : (
                      <div className="mt-2 h-[190px] animate-pulse rounded bg-wash" />
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* where it happens, side by side */}
          {lens !== "defense" && (
            <section className="mt-12">
              <h2 className="font-display text-xl font-semibold tracking-tight text-ink sm:text-2xl">
                Where it happens
              </h2>
              <p className="mt-1.5 max-w-prose text-sm text-ink-soft">
                Field-goal attempts by zone: the shot diet behind each player's
                numbers.
              </p>
              <div className="mt-6 grid gap-x-8 gap-y-8 sm:grid-cols-2">
                {(
                  [
                    { row: a, detail: aDetail },
                    { row: b, detail: bDetail },
                  ] as const
                ).map(({ row, detail }) => (
                  <div key={row.id}>
                    <p className="font-display text-sm font-semibold text-ink">
                      {row.name}
                      <span className="font-mono text-xs font-normal text-ink-faint">
                        {" "}
                        · {row.season}
                      </span>
                    </p>
                    {detail ? (
                      <CourtZones
                        court={def.court}
                        zones={detail.zones}
                        className="mt-3"
                      />
                    ) : (
                      <div
                        className="mt-3 aspect-[500/434] animate-pulse rounded bg-wash"
                        aria-busy="true"
                      />
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
