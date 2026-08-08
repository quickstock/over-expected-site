import { useEffect, useMemo } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useLeague, useLineupChunk, useRapm } from "../data";
import { ACTIVE_LEAGUES, leagueDef, type League } from "../leagues";
import type { LineupRow } from "../types";
import { divergingColor, divergingText } from "../lib/color";
import { int, signed } from "../lib/format";
import { useTitle } from "../lib/useTitle";

function Stat({ value, label, color }: { value: string; label: string; color?: string }) {
  return (
    <div className="flex flex-col gap-1.5 px-1 py-4 sm:py-1">
      <span className="font-display text-[11px] font-medium uppercase tracking-wider text-ink-faint">{label}</span>
      <span className="font-mono tnum text-3xl sm:text-4xl" style={color ? { color } : undefined}>{value}</span>
    </div>
  );
}

/** Per-game net rating bar (width ∝ possessions, diverging fill). */
function GameStrip({ games }: { games: [string, number, number, number, number][] }) {
  const bars = useMemo(
    () =>
      games.map(([gid, po, pd, pf, pa]) => {
        const net = 100 * (pf / Math.max(po, 1) - pa / Math.max(pd, 1));
        return { gid, poss: po + pd, net };
      }),
    [games],
  );
  const maxPoss = Math.max(1, ...bars.map((b) => b.poss));
  return (
    <div className="mt-4 flex items-end gap-[3px]" style={{ height: 120 }} aria-hidden="true">
      {bars.map((b, i) => {
        const h = 8 + (Math.min(Math.abs(b.net), 40) / 40) * 52;
        return (
          <span key={`${b.gid}-${i}`} className="flex flex-1 flex-col justify-center" style={{ minWidth: 2 }}>
            <span
              className="w-full rounded-sm"
              style={{
                height: b.net >= 0 ? h : 2,
                background: b.net >= 0 ? divergingColor(b.net) : "transparent",
                opacity: 0.35 + 0.65 * (b.poss / maxPoss),
              }}
            />
            <span className="my-[1px] block w-full" style={{ borderTop: "1px solid var(--color-line)" }} />
            <span
              className="w-full rounded-sm"
              style={{
                height: b.net < 0 ? Math.min(Math.abs(b.net), 40) / 40 * 52 + 8 : 2,
                background: b.net < 0 ? divergingColor(b.net) : "transparent",
                opacity: 0.35 + 0.65 * (b.poss / maxPoss),
              }}
            />
          </span>
        );
      })}
    </div>
  );
}

function NotFound({ lg }: { lg: League }) {
  return (
    <div className="mx-auto max-w-xl px-5 py-28 text-center sm:px-8">
      <p className="font-display text-2xl font-semibold text-ink">Lineup not found.</p>
      <p className="mt-3 text-sm leading-relaxed text-ink-soft">
        This five isn't in the board index for the chosen season (only lineups
        clearing the possession floor are exported).
      </p>
      <Link to={`/lineups/${lg}`} className="mt-8 inline-block rounded-md bg-ink px-5 py-2.5 font-display text-sm font-medium text-paper hover:opacity-85">
        Back to lineups
      </Link>
    </div>
  );
}

export default function LineupDetail() {
  const { lg, lineupId } = useParams();
  const league = (lg && ACTIVE_LEAGUES.includes(lg as League) ? lg : ACTIVE_LEAGUES[0]) as League;
  const def = leagueDef(league);
  const { league: active, setLeague } = useLeague();
  useEffect(() => {
    if (league !== active) setLeague(league);
  }, [league, active, setLeague]);

  const [params] = useSearchParams();
  const state = useRapm(league);

  const seasons = state.status === "ready" ? state.data.meta.seasons : [];
  // the season where this lineup appears (prefer the query param)
  const season = useMemo(() => {
    if (state.status !== "ready" || !lineupId) return null;
    const q = params.get("season");
    if (q && (state.data.lineups[q] ?? []).some((l) => l.lineupId === lineupId)) return q;
    for (const s of [...seasons].reverse()) {
      if ((state.data.lineups[s] ?? []).some((l) => l.lineupId === lineupId)) return s;
    }
    return null;
  }, [state, lineupId, params, seasons]);

  const row: LineupRow | undefined =
    state.status === "ready" && season
      ? (state.data.lineups[season] ?? []).find((l) => l.lineupId === lineupId)
      : undefined;

  useTitle(row ? `${row.players.join(", ")} · Over Expected` : "Lineup · Over Expected");
  const chunk = useLineupChunk(league, season);

  if (state.status === "loading")
    return <div className="mx-auto max-w-4xl px-6 py-24"><div className="h-56 animate-pulse rounded bg-wash" /></div>;
  if (state.status === "error" || !def.layers?.lineups) return <NotFound lg={league} />;
  if (!row || !season) return <NotFound lg={league} />;

  const games = chunk.status === "ready" ? chunk.chunk[row.lineupId]?.games ?? [] : [];

  return (
    <div className="mx-auto max-w-4xl px-5 py-10 sm:px-8 sm:py-14">
      <Link to={`/lineups/${league}?season=${encodeURIComponent(season)}&tab=lineups`}
        className="font-display text-sm text-ink-soft hover:text-ink">← Lineups</Link>

      <h1 className="mt-4 font-display text-2xl font-bold tracking-tight sm:text-3xl">
        {row.players.map((p, i) => (
          <span key={row.playerIds[i]}>
            <Link to={`/player/${league}/${row.playerIds[i]}`} className="hover:underline decoration-warm decoration-2 underline-offset-4">{p}</Link>
            {i < row.players.length - 1 ? <span className="text-ink-faint">, </span> : null}
          </span>
        ))}
      </h1>
      <p className="mt-2 text-sm text-ink-soft">{row.team} · {season} · {int(row.poss)} possessions</p>

      <section className="mt-8 grid grid-cols-2 divide-line border-y border-line py-2 sm:grid-cols-4 sm:divide-x sm:py-5">
        <Stat value={signed(row.net100, 1)} label="Net / 100" color={divergingText(row.net100)} />
        <Stat value={signed(row.exp100, 1)} label="Expected / 100" />
        <Stat value={signed(row.synergy100, 1)} label="Synergy / 100" color={divergingText(row.synergy100)} />
        <Stat value={row.sqSynergy === null ? "–" : signed(row.sqSynergy, 2)} label="Shot-quality synergy" />
      </section>

      <p className="mt-6 max-w-2xl text-sm leading-relaxed text-ink-soft">
        <span className="font-medium text-ink">Synergy</span> is what this five does
        beyond the sum of its members' individual RAPM ({signed(row.net100, 1)} actual
        vs {signed(row.exp100, 1)} expected). <span className="font-medium text-ink">Shot-quality
        synergy</span> is whether they generate better looks together than apart:
        positive means the lineup's average expected points per shot beats its
        members' individual averages. Single-lineup samples are noisy and don't
        persist out of sample; read this as description.{" "}
        <Link to="/methodology/lineups" className="underline decoration-warm decoration-2 underline-offset-2">Method →</Link>
      </p>

      {games.length > 0 && (
        <section className="mt-10">
          <h2 className="font-display text-[11px] font-medium uppercase tracking-wider text-ink-faint">
            Per-game net rating ({games.length} games · bar height ∝ margin, opacity ∝ possessions)
          </h2>
          <GameStrip games={games} />
        </section>
      )}
    </div>
  );
}
