import { useEffect, useMemo, useTransition } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useLeague, useRapm } from "../../data";
import { ACTIVE_LEAGUES, leagueDef, type League } from "../../leagues";
import type { RapmRow, LineupRow } from "../../types";
import { divergingColor, divergingText } from "../../lib/color";
import { int, signed } from "../../lib/format";
import { useTitle } from "../../lib/useTitle";
import SegmentedControl from "../../components/SegmentedControl";
import ODScatter from "../../components/charts/ODScatter";

type Tab = "players" | "lineups";
type PlayerSort = "netP" | "oP" | "dP" | "possOff";
const NET_SCALE = 8; // per-100 saturation for the RAPM bars

const PLAYER_SORT_LABEL: Record<PlayerSort, string> = {
  netP: "Net",
  oP: "Offense",
  dP: "Defense",
  possOff: "Poss",
};

/** Centered diverging bar on a fixed ±NET_SCALE axis. */
function NetBar({ v }: { v: number }) {
  const t = Math.min(Math.abs(v), NET_SCALE) / NET_SCALE;
  const style: React.CSSProperties = {
    background: divergingColor(v),
    width: `${(t * 50).toFixed(1)}%`,
  };
  if (v >= 0) style.left = "50%";
  else style.right = "50%";
  return (
    <span className="relative block h-1.5 w-20" aria-hidden="true">
      <span className="absolute inset-y-0 left-1/2 w-px bg-line" />
      <span className="absolute top-0 h-full rounded-full" style={style} />
    </span>
  );
}

function Unavailable({ label }: { label: string }) {
  return (
    <div className="mx-auto max-w-xl px-5 py-28 text-center sm:px-8">
      <h1 className="font-display text-2xl font-semibold text-ink">
        Lineups aren't built for {label} yet.
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-ink-soft">
        Working out who helped needs to know which five were on the floor for
        every possession. The NBA feed says so. The other leagues log
        substitutions without recording who came in and who went out, so their
        lineups are a later build.
      </p>
      <Link
        to="/lineups/NBA"
        className="mt-8 inline-block rounded-md bg-ink px-5 py-2.5 font-display text-sm font-medium text-paper transition-opacity duration-150 hover:opacity-85"
      >
        See the NBA lineups
      </Link>
    </div>
  );
}

function PlayersTab({
  rows,
  variant,
  minPoss,
  sort,
  dir,
  onSort,
  lg,
}: {
  rows: RapmRow[];
  variant: "prior" | "plain";
  minPoss: number;
  sort: PlayerSort;
  dir: "asc" | "desc";
  onSort: (k: PlayerSort) => void;
  lg: League;
}) {
  const o = (r: RapmRow) => (variant === "prior" ? r.oP : r.o);
  const d = (r: RapmRow) => (variant === "prior" ? r.dP : r.d);
  const net = (r: RapmRow) => (variant === "prior" ? r.netP : r.net);

  const filtered = useMemo(() => {
    const mul = dir === "asc" ? 1 : -1;
    const val = (r: RapmRow) =>
      sort === "netP" ? net(r) : sort === "oP" ? o(r) : sort === "dP" ? d(r) : r.possOff;
    return rows
      .filter((r) => r.possOff + r.possDef >= minPoss)
      .sort((a, b) => mul * (val(a) - val(b)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, variant, minPoss, sort, dir]);

  return (
    <ol className="mx-auto max-w-5xl px-5 pb-10 sm:px-8">
      <div className="mt-6 hidden grid-cols-[2.5rem_minmax(0,1fr)_5rem_5rem_11rem] items-end gap-x-4 border-b border-line pb-2 sm:grid">
        <span />
        <span className="font-display text-[11px] font-medium uppercase tracking-wider text-ink-faint">Player</span>
        {(["oP", "dP"] as PlayerSort[]).map((k) => (
          <button key={k} type="button" onClick={() => onSort(k)}
            className={`text-right font-display text-[11px] font-medium uppercase tracking-wider ${sort === k ? "text-ink" : "text-ink-faint hover:text-ink-soft"}`}>
            {PLAYER_SORT_LABEL[k]}
          </button>
        ))}
        <button type="button" onClick={() => onSort("netP")}
          className={`text-right font-display text-[11px] font-medium uppercase tracking-wider ${sort === "netP" ? "text-ink" : "text-ink-faint hover:text-ink-soft"}`}>
          Net / 100
        </button>
      </div>
      {filtered.map((r, i) => (
        <li key={r.id} className="cv-row">
          <Link to={`/player/${lg}/${r.id}`}
            className="group block border-b border-line-soft transition-colors duration-150 hover:bg-wash">
            <div className="hidden grid-cols-[2.5rem_minmax(0,1fr)_5rem_5rem_11rem] items-center gap-x-4 py-3 sm:grid">
              {/* tier, not rank: printed once where a band starts, blank inside
                  it, because a number on every row reads as an ordering the
                  intervals do not support */}
              <span className="text-right font-mono tnum text-sm text-ink-faint">
                {i === 0 || filtered[i - 1].tier !== r.tier ? `T${r.tier}` : ""}
              </span>
              <span className="min-w-0">
                <span className="block truncate font-display text-[15px] font-semibold text-ink">{r.name}</span>
                <span className="block truncate text-xs text-ink-soft">
                  {r.teams.join(" · ")} · {int(r.possOff + r.possDef)} poss
                </span>
              </span>
              <span className="text-right font-mono tnum text-sm" style={{ color: divergingText(o(r)) }}>{signed(o(r), 1)}</span>
              <span className="text-right font-mono tnum text-sm" style={{ color: divergingText(d(r)) }}>{signed(d(r), 1)}</span>
              <span className="flex items-center justify-end gap-3">
                <NetBar v={net(r)} />
                <span className="w-20 text-right">
                  <span className="block font-mono tnum text-lg" style={{ color: divergingText(net(r)) }}>{signed(net(r), 1)}</span>
                  <span className="block font-mono tnum text-[10px] text-ink-faint">
                    {signed(r.netCi[0], 1)} to {signed(r.netCi[1], 1)}
                  </span>
                </span>
              </span>
            </div>
            <div className="flex items-center gap-2.5 py-3 sm:hidden">
              <span className="w-6 text-right font-mono tnum text-xs text-ink-faint">
                {i === 0 || filtered[i - 1].tier !== r.tier ? `T${r.tier}` : ""}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-display text-[15px] font-semibold text-ink">{r.name}</span>
                <span className="block truncate text-xs text-ink-soft">
                  {r.teams.join(" · ")} · O {signed(o(r), 1)} · D {signed(d(r), 1)}
                </span>
              </span>
              <span className="w-14 text-right font-mono tnum text-lg" style={{ color: divergingText(net(r)) }}>{signed(net(r), 1)}</span>
            </div>
          </Link>
        </li>
      ))}
    </ol>
  );
}

function LineupsTab({ rows, lg, season }: { rows: LineupRow[]; lg: League; season: string }) {
  const sorted = useMemo(
    () => [...rows].sort((a, b) => b.synergy100 - a.synergy100),
    [rows],
  );
  return (
    <div className="mx-auto max-w-5xl px-5 pb-10 sm:px-8">
      <ol className="mt-6">
        {sorted.map((r) => (
          <li key={r.lineupId} className="cv-row">
            <Link to={`/lineups/${lg}/${r.lineupId}?season=${encodeURIComponent(season)}`}
              className="group block border-b border-line-soft py-3 transition-colors duration-150 hover:bg-wash">
              <div className="flex items-center gap-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-display text-[15px] font-semibold text-ink">
                    {r.players.join(", ")}
                  </span>
                  <span className="block truncate text-xs text-ink-soft">
                    {r.team} · {int(r.poss)} poss · net {signed(r.net100, 1)} · expected {signed(r.exp100, 1)}
                    {r.sqSynergy !== null ? ` · shot-quality synergy ${signed(r.sqSynergy, 2)}` : ""}
                  </span>
                </span>
                <span className="flex items-center gap-3">
                  <NetBar v={r.synergy100} />
                  <span className="w-14 text-right font-mono tnum text-lg" style={{ color: divergingText(r.synergy100) }}>
                    {signed(r.synergy100, 1)}
                  </span>
                </span>
              </div>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}

export default function LineupsBoard() {
  const { lg } = useParams();
  const league = (lg && ACTIVE_LEAGUES.includes(lg as League)
    ? lg
    : ACTIVE_LEAGUES[0]) as League;
  const def = leagueDef(league);
  const { league: active, setLeague } = useLeague();
  useEffect(() => {
    if (league !== active) setLeague(league);
  }, [league, active, setLeague]);
  useTitle("Lineups · Over Expected");

  const [params, setParams] = useSearchParams();
  const [, startTransition] = useTransition();
  const state = useRapm(league);

  if (!def.layers?.lineups) return <Unavailable label={def.label} />;
  if (state.status === "loading")
    return <div className="mx-auto max-w-5xl px-6 py-24"><div className="h-64 animate-pulse rounded bg-wash" /></div>;
  if (state.status === "error")
    return <p className="mx-auto max-w-xl px-6 py-32 text-center text-ink-soft">The lineup data failed to load.</p>;

  const { data } = state;
  const seasons = data.meta.seasons;
  const tab = (params.get("tab") === "lineups" ? "lineups" : "players") as Tab;
  const season = seasons.includes(params.get("season") ?? "")
    ? (params.get("season") as string)
    : seasons[seasons.length - 1];
  const variant = params.get("variant") === "plain" ? "plain" : "prior";
  const sort = (["netP", "oP", "dP", "possOff"].includes(params.get("sort") ?? "")
    ? params.get("sort")
    : "netP") as PlayerSort;
  const dir = params.get("dir") === "asc" ? "asc" : "desc";
  const minPoss = Math.max(0, Math.min(data.meta.boardMax,
    Number(params.get("min") ?? data.meta.qualifyPoss) || 0));

  const update = (patch: Record<string, string>) =>
    startTransition(() => {
      const next = new URLSearchParams(params);
      for (const [k, v] of Object.entries(patch)) next.set(k, v);
      setParams(next, { replace: false });
    });
  const onSort = (k: PlayerSort) =>
    update(k === sort ? { dir: dir === "desc" ? "asc" : "desc" } : { sort: k, dir: "desc" });

  const players = data.players[season] ?? [];
  const oos = data.meta.synergyOOS;

  return (
    <div>
      <div className="sticky top-0 z-10 border-b border-line bg-paper">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-5 gap-y-3 px-5 py-3 sm:px-8">
          <SegmentedControl ariaLabel="View"
            options={[{ value: "players", label: "Players" }, { value: "lineups", label: "Lineups" }]}
            value={tab} onChange={(t) => update({ tab: t })} />
          <SegmentedControl ariaLabel="Season"
            options={seasons.map((s) => ({ value: s, label: s, shortLabel: `'${s.slice(2, 4)}` }))}
            value={season} onChange={(s) => update({ season: s })} />
          {tab === "players" && (
            <>
              <SegmentedControl ariaLabel="Variant"
                options={[{ value: "prior", label: "Prior-informed" }, { value: "plain", label: "Plain ridge" }]}
                value={variant} onChange={(v) => update({ variant: v })} />
              <label className="flex items-center gap-2.5">
                <span className="font-display text-[11px] font-medium uppercase tracking-wider text-ink-faint">Floor</span>
                <input type="range" min={0} max={data.meta.boardMax} step={data.meta.boardStep}
                  value={minPoss} onChange={(e) => update({ min: e.target.value })}
                  className="w-28 accent-ink sm:w-36" aria-label="Minimum possessions" />
                <span className="font-mono tnum w-20 text-xs text-ink-soft">≥ {int(minPoss)}</span>
              </label>
            </>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-5 pt-8 sm:px-8 sm:pt-12">
        <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Lineups &amp; RAPM</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
          Plus-minus with the teammate problem taken out. Raw plus-minus credits
          a player for whoever he happens to share the floor with. This solves
          the whole league at once, so what is left is how much better his team
          scored and how much less it conceded per 100 possessions with him out
          there. <span className="font-medium">Prior-informed</span> pulls
          thin-minutes players toward what their box score suggests;{" "}
          <span className="font-medium">plain ridge</span> pulls them toward zero.
          Whiskers on the scatter are ±1 standard error.{" "}
          <Link to="/methodology/lineups" className="underline decoration-warm decoration-2 underline-offset-2">How this is built →</Link>
        </p>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-soft">
          <span className="font-medium text-ink">Players are grouped in tiers, not
          ranked.</span> The range under each number is what the estimate is
          consistent with. Where two players' ranges overlap, the data cannot say
          who is better, so numbering them 1 to 200 would claim something it does
          not know. The tier label marks where a band starts.
        </p>
      </div>

      {tab === "players" ? (
        <>
          <div className="mx-auto mt-8 max-w-5xl px-5 sm:px-8">
            <ODScatter rows={players.filter((r) => r.possOff + r.possDef >= minPoss)} variant={variant} />
          </div>
          <PlayersTab rows={players} variant={variant} minPoss={minPoss}
            sort={sort} dir={dir} onSort={onSort} lg={league} />
        </>
      ) : (
        <>
          <div className="mx-auto mt-6 max-w-5xl px-5 sm:px-8">
            <p className="rounded-md bg-wash px-4 py-3 text-xs leading-relaxed text-ink-soft">
              {oos.r === null
                ? `Too few lineups repeat across halves of a season to test whether this holds up (n=${oos.n}).`
                : Math.abs(oos.r) < 0.1
                  ? `Synergy does not carry forward: a lineup's first-half figure predicts its second half at r=${oos.r.toFixed(2)} (n=${oos.n}), which is nothing. Read the numbers below as what happened, not as what happens next.`
                  : `A lineup's first-half synergy predicts its second half at r=${oos.r.toFixed(2)} (n=${oos.n}).`}{" "}
              <Link to="/methodology/lineups" className="underline decoration-warm decoration-2 underline-offset-2">Method →</Link>
            </p>
          </div>
          <LineupsTab rows={data.lineups[season] ?? []} lg={league} season={season} />
        </>
      )}
    </div>
  );
}
