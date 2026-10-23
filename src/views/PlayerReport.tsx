import { useMemo } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useArchive, useLeagueData, usePlayerChunk, useProfiles } from "../data";
import ArchiveWait from "../components/ArchiveWait";
import { ACTIVE_LEAGUES, LEAGUE_LABEL, type League } from "../leagues";
import Headshot from "../components/Headshot";
import { divergingText } from "../lib/color";
import { int, ordinal, signed } from "../lib/format";
import { rankSimilar } from "../lib/similar";
import { useTitle } from "../lib/useTitle";

const ZONES: [string, string[]][] = [
  ["At the rim", ["Restricted Area"]],
  ["Paint", ["In The Paint (Non-RA)"]],
  ["Mid-range", ["Mid-Range"]],
  ["Corner three", ["Left Corner 3", "Right Corner 3"]],
  ["Above-the-break three", ["Above the Break 3"]],
];

function pctOf(pool: number[], v: number): number {
  return (pool.filter((x) => x <= v).length / pool.length) * 100;
}

function share(rows: { zone: string; n?: number; share: number }[], zones: string[]) {
  const total = rows.filter((r) => ZONES.some(([, z]) => z.includes(r.zone)))
    .reduce((a, r) => a + r.share, 0);
  return rows.filter((r) => zones.includes(r.zone)).reduce((a, r) => a + r.share, 0) / (total || 1);
}

function Cell({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="border-l border-line-soft pl-3">
      <p className="font-display text-[10px] font-medium uppercase tracking-wider text-ink-faint">{label}</p>
      <p className="mt-0.5 font-mono text-xl font-semibold tnum" style={color ? { color } : undefined}>
        {value}
      </p>
      {sub && <p className="text-[11px] text-ink-faint">{sub}</p>}
    </div>
  );
}

function H({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mt-5 border-b border-line pb-1 font-display text-[11px] font-semibold uppercase tracking-wider text-ink">
      {children}
    </h2>
  );
}

/**
 * The one-page scouting report: a player's latest qualified season (or
 * ?season=) laid out for A4 and printed to PDF from the browser. Everything on
 * it is read from the same files as the player page; nothing is computed here
 * that the site does not show elsewhere.
 */
export default function PlayerReport() {
  const { lg, id } = useParams();
  const [params] = useSearchParams();
  const league = (ACTIVE_LEAGUES as string[]).includes(lg ?? "") ? (lg as League) : "NBA";
  const data = useLeagueData(league);
  const archive = useArchive(league, !!id && !!data?.meta.archive?.players.some((p) => p[0] === id));
  const seasons = useMemo(
    () =>
      data?.meta.seasons.filter((s) =>
        data.shotValue[s]?.some((r) => r.id === id),
      ) ?? [],
    [data, id],
  );
  const requested = params.get("season");
  const season =
    requested && seasons.includes(requested) ? requested : seasons[seasons.length - 1] ?? null;
  const chunk = usePlayerChunk(season, league);
  const profiles = useProfiles(true);
  const sv = season ? data?.shotValue[season]?.find((r) => r.id === id) : undefined;
  const fouls = season ? data?.leaderboard.find((r) => r.id === id && r.season === season) : undefined;
  useTitle(sv ? `${sv.name}: scouting report` : "Scouting report");

  if (!data) return <div className="mx-auto max-w-3xl px-5 py-16 text-sm text-ink-faint">Loading…</div>;
  if (archive !== "ready") return <ArchiveWait status={archive} />;
  if (!sv || !season) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-16 text-sm text-ink-soft">
        No qualified season for this player.
      </div>
    );
  }

  const pool = data.shotValue[season];
  const detail = chunk.status === "ready" ? chunk.chunk[sv.id] : undefined;
  const leagueZones = data.leagueZones[season] ?? [];
  const similar = profiles.data ? rankSimilar(profiles.data.rows, league, sv.id) : null;
  const t = data.meta.translation;
  const today = new Date().toISOString().slice(0, 10);
  const pageUrl = `overexpected.com/player/${league}/${sv.id}`;

  return (
    <div className="mx-auto max-w-[210mm] px-5 py-8 print:max-w-none print:p-0">
      <div className="mb-6 flex flex-wrap items-center gap-4 print:hidden">
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-md bg-ink px-4 py-2 font-display text-sm font-medium text-paper transition-opacity duration-150 hover:opacity-85"
        >
          Save as PDF
        </button>
        <Link to={`/player/${league}/${sv.id}`} className="text-sm underline underline-offset-2 hover:text-ink">
          Back to the player page
        </Link>
        <span className="text-xs text-ink-faint">Choose “Save as PDF” in the print dialog.</span>
      </div>

      <article className="rounded border border-line-soft bg-paper p-7 text-[12.5px] leading-snug text-ink print:border-0 print:bg-white print:p-0">
        <header className="flex items-start justify-between gap-6 border-b-2 border-ink pb-3">
          <div className="flex items-center gap-4">
            <Headshot league={league} id={sv.id} name={sv.name} fallback="none" className="h-16 w-16" />
            <div>
              <h1 className="font-display text-2xl font-bold tracking-tight">{sv.name}</h1>
              <p className="text-ink-soft">
                {sv.teams.join(" / ")} · {LEAGUE_LABEL[league]} · {season}
                {sv.pos ? ` · ${sv.pos}` : ""}
              </p>
            </div>
          </div>
          <div className="text-right text-[11px] text-ink-faint">
            <p className="font-display font-semibold text-ink">Scouting report</p>
            <p>Over Expected · {today}</p>
          </div>
        </header>

        <div className="mt-4 grid grid-cols-3 gap-y-3 sm:grid-cols-6">
          <Cell
            label="Points OE / 100"
            value={signed(sv.poe100, 1)}
            sub={`${ordinal(Math.round(pctOf(pool.map((r) => r.poe100), sv.poe100)))} pct`}
            color={divergingText(sv.poe100)}
          />
          <Cell
            label="Shot-making"
            value={signed(sv.makeOE, 1)}
            sub={`${ordinal(Math.round(pctOf(pool.map((r) => r.makeOE), sv.makeOE)))} pct · pp`}
            color={divergingText(sv.makeOE)}
          />
          <Cell
            label="Foul-drawing / 100"
            value={signed(sv.ftaoe100, 1)}
            sub={fouls?.pct != null ? `${ordinal(Math.round(fouls.pct))} pct` : undefined}
            color={divergingText(sv.ftaoe100)}
          />
          <Cell label="FG% / xFG%" value={`${sv.fgPct.toFixed(1)}`} sub={`vs ${sv.xfgPct.toFixed(1)} expected`} />
          <Cell label="FT%" value={(sv.ftPct * 100).toFixed(1)} />
          <Cell label="Volume" value={int(sv.fga)} sub={`FGA · ${int(sv.poss)} poss`} />
        </div>
        <p className="mt-2 text-[11px] text-ink-faint">
          Percentiles among the {pool.length} qualified {LEAGUE_LABEL[league]} players in {season}.
        </p>

        <div className="grid gap-x-8 sm:grid-cols-2">
          <section>
            <H>Shot diet</H>
            {detail ? (
              <table className="mt-1 w-full">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-wider text-ink-faint">
                    <th className="py-1 font-medium">Zone</th>
                    <th className="py-1 text-right font-medium">His share</th>
                    <th className="py-1 text-right font-medium">League</th>
                  </tr>
                </thead>
                <tbody>
                  {ZONES.map(([label, zones]) => {
                    const mine = share(detail.zones, zones);
                    const lg = share(leagueZones, zones);
                    return (
                      <tr key={label} className="border-t border-line-soft">
                        <td className="py-1">{label}</td>
                        <td className="py-1 text-right font-mono tnum">{(mine * 100).toFixed(0)}%</td>
                        <td className="py-1 text-right font-mono tnum text-ink-faint">{(lg * 100).toFixed(0)}%</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <p className="mt-2 text-ink-faint">Loading shot locations…</p>
            )}
            <p className="mt-1 text-[11px] text-ink-faint">
              Expected points per shot from these looks: {sv.xptsShot.toFixed(2)}.
            </p>
          </section>

          <section>
            <H>Same profile, other leagues</H>
            {similar && similar.field.length > 0 ? (
              <ol className="mt-1">
                {similar.field.slice(0, 5).map(({ r }) => (
                  <li key={r[0] + r[1]} className="flex justify-between gap-3 border-t border-line-soft py-1">
                    <span>
                      {r[2]} <span className="text-ink-faint">· {r[4]}</span>
                    </span>
                    <span className="text-ink-faint">{LEAGUE_LABEL[r[0]]}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-2 text-ink-faint">
                {similar ? "No other league to match against." : "Loading profiles…"}
              </p>
            )}
            <p className="mt-1 text-[11px] text-ink-faint">
              Current players with the closest shot diet, volume and league-relative
              shot-making and foul-drawing.
            </p>
          </section>
        </div>

        {t && sv.elProj != null && sv.elLo != null && sv.elHi != null && (
          <section>
            <H>EuroLeague projection</H>
            <p className="mt-1">
              Projected EuroLeague shot-making{" "}
              <span className="font-mono font-semibold tnum" style={{ color: divergingText(sv.elProj) }}>
                {signed(sv.elProj, 1)}
              </span>{" "}
              pp (80% of players land between {signed(sv.elLo, 1)} and {signed(sv.elHi, 1)}).
              {sv.elActual != null &&
                ` He also played EuroLeague in ${season}: ${signed(sv.elActual, 1)} on ${int(sv.elFga ?? 0)} attempts.`}{" "}
              <span className="text-ink-faint">
                Built from {t.nPairs} players who played both; out of sample it misses by{" "}
                {t.oosRmse.toFixed(1)} pp against {t.naiveRmse.toFixed(1)} for assuming he shoots the same.
              </span>
            </p>
          </section>
        )}

        <section>
          <H>By season</H>
          <table className="mt-1 w-full">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-ink-faint">
                <th className="py-1 font-medium">Season</th>
                <th className="py-1 font-medium">Team</th>
                <th className="py-1 text-right font-medium">Poss</th>
                <th className="py-1 text-right font-medium">Points OE/100</th>
                <th className="py-1 text-right font-medium">Shot-making</th>
                <th className="py-1 text-right font-medium">Fouls/100</th>
              </tr>
            </thead>
            <tbody>
              {seasons.map((s) => {
                const r = data.shotValue[s].find((x) => x.id === sv.id)!;
                return (
                  <tr key={s} className={`border-t border-line-soft ${s === season ? "font-semibold" : ""}`}>
                    <td className="py-1 font-mono tnum">{s}</td>
                    <td className="py-1">{r.teams.join(" / ")}</td>
                    <td className="py-1 text-right font-mono tnum">{int(r.poss)}</td>
                    <td className="py-1 text-right font-mono tnum" style={{ color: divergingText(r.poe100) }}>
                      {signed(r.poe100, 1)}
                    </td>
                    <td className="py-1 text-right font-mono tnum" style={{ color: divergingText(r.makeOE) }}>
                      {signed(r.makeOE, 1)}
                    </td>
                    <td className="py-1 text-right font-mono tnum" style={{ color: divergingText(r.ftaoe100) }}>
                      {signed(r.ftaoe100, 1)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        <footer className="mt-5 border-t border-line pt-2 text-[10.5px] leading-relaxed text-ink-faint">
          <p>
            <strong className="font-semibold text-ink-soft">How to read it.</strong> Points over
            expected: what he scored per 100 possessions beyond what his shots were worth.
            Shot-making: FG% minus the FG% his looks were worth, from a leak-free model of
            location and context. Foul-drawing: free throws drawn beyond what his shot
            locations usually draw. All three are measured against his own league and season.
          </p>
          <p className="mt-1">
            Source: overexpected.com, from public play-by-play. Licence CC BY 4.0. Full
            page: {pageUrl}
          </p>
        </footer>
      </article>
    </div>
  );
}
