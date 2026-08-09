/**
 * The defence lens of the player card: this player's own defensive numbers,
 * on the same shape as the three offensive lenses.
 *
 * Everything here is adjusted plus-minus, because that is the only defensive
 * measure this project will put under a player's name. The shot-level player
 * defence metric was built and rejected on evidence (0.348 split-half, with a
 * leaderboard of non-defenders at the top): every shot faced gets split across
 * the five defenders on the floor, which measures the team while wearing a
 * player's name. D-RAPM instead asks what changes when he is on the floor and
 * holds teammates and opponents fixed, so it is his.
 *
 * There is no game-by-game defensive series in the export, so this lens has no
 * gap arc and no form strip. It says so rather than padding the page.
 */
import { Link } from "react-router-dom";
import type { LeaderboardRow, RapmRow } from "../../types";
import { divergingText } from "../../lib/color";
import { int, ordinal, signed } from "../../lib/format";
import PercentileSliders from "./PercentileSliders";
import CareerStrip from "./CareerStrip";

/** Share of the pool at or below `v`, or null when the pool is empty. */
function pctOf(pool: number[], v: number): number | null {
  if (pool.length === 0) return null;
  return (pool.filter((x) => x <= v).length / pool.length) * 100;
}

function Stat({
  value,
  label,
  sub,
  delay,
}: {
  value: React.ReactNode;
  label: string;
  sub?: string;
  delay: number;
}) {
  return (
    <div
      className="flex translate-y-0 flex-col gap-1.5 px-1 py-4 opacity-100 transition-[opacity,transform] duration-500 starting:translate-y-2 starting:opacity-0 sm:py-1"
      style={{ transitionDelay: `${delay}ms` }}
    >
      <span className="font-display text-[11px] font-medium uppercase tracking-wider text-ink-faint">
        {label}
      </span>
      <span className="font-mono tnum text-3xl text-ink sm:text-4xl">
        {value}
      </span>
      {sub && <span className="text-xs text-ink-soft">{sub}</span>}
    </div>
  );
}

export default function DefenseLens({
  season,
  playerId,
  seasonRows,
  pooledRows,
  floor,
  bySeason,
  onSelectSeason,
}: {
  season: string;
  playerId: string;
  /** Every player's RAPM row for this season. */
  seasonRows: RapmRow[];
  /** Every player's all-seasons pooled RAPM row. */
  pooledRows: RapmRow[];
  /** Possession floor the lineup layer requires. */
  floor: number;
  /** This player's dP by season, for the career strip. */
  bySeason: LeaderboardRow[];
  onSelectSeason: (s: string) => void;
}) {
  const row = seasonRows.find((r) => r.id === playerId);
  const pooled = pooledRows.find((r) => r.id === playerId);

  const qualified = (rows: RapmRow[]) =>
    rows.filter((r) => r.possOff + r.possDef >= floor);
  const seasonPool = qualified(seasonRows).map((r) => r.dP);
  const pooledPool = qualified(pooledRows).map((r) => r.dP);

  if (!row)
    return (
      <p className="mt-10 rounded border border-line-soft bg-wash px-4 py-10 text-center text-sm leading-relaxed text-ink-faint">
        No adjusted plus-minus for this player in {season}. The lineup layer
        needs the possession-level rotation data, and it only covers seasons
        this player appeared in.
      </p>
    );

  const poss = row.possOff + row.possDef;
  const thin = poss < floor;
  // How far the box-score prior moved the plain ridge estimate. Worth showing:
  // where these two disagree, the number is being carried by the prior rather
  // than by his own possessions.
  const priorShift = row.dP - row.d;
  const pct = thin ? null : pctOf(seasonPool, row.dP);
  const pooledPct =
    pooled && pooled.possOff + pooled.possDef >= floor
      ? pctOf(pooledPool, pooled.dP)
      : null;

  return (
    <>
      {/* stat band */}
      <section className="mt-10 grid grid-cols-2 divide-line border-y border-line py-2 max-sm:[&>*:nth-child(odd)]:border-r max-sm:[&>*:nth-child(-n+2)]:border-b sm:grid-cols-4 sm:divide-x sm:py-5">
        <Stat
          delay={0}
          value={
            <span
              className="text-4xl sm:text-5xl"
              style={{ color: divergingText(row.dP) }}
            >
              {signed(row.dP, 1)}
            </span>
          }
          label="Defensive RAPM / 100"
          sub={`± ${row.seD.toFixed(1)} · points prevented`}
        />
        <Stat
          delay={60}
          value={
            pct !== null ? (
              <>
                {ordinal(Math.floor(pct))}
                <span className="text-xl text-ink-faint"> %ile</span>
              </>
            ) : (
              "–"
            )
          }
          label="Percentile"
          sub={`among qualified, ${season}`}
        />
        <Stat
          delay={120}
          value={int(row.possDef)}
          label="Defensive possessions"
          sub={thin ? `below the ${int(floor)} floor` : "what the fit is built on"}
        />
        <Stat
          delay={180}
          value={
            <span style={{ color: divergingText(row.netP) }}>
              {signed(row.netP, 1)}
            </span>
          }
          label="Net RAPM / 100"
          sub="offense + defense"
        />
      </section>

      {thin && (
        <p className="mt-5 rounded border border-line-soft bg-wash px-4 py-4 text-sm leading-relaxed text-ink-faint">
          <span className="font-display font-semibold text-ink">
            Read this one lightly.
          </span>{" "}
          <span className="font-mono tnum">{int(poss)}</span> possessions on the
          floor against the <span className="font-mono tnum">{int(floor)}</span>{" "}
          this layer asks for. Below that the estimate is set more by the
          box-score prior than by what he did, so no percentile is shown for it.
        </p>
      )}

      {/* where he ranks */}
      <section className="mt-6 border-b border-line-soft pb-4">
        <h2 className="font-display text-[11px] font-medium uppercase tracking-wider text-ink-faint">
          Where he ranks
        </h2>
        <PercentileSliders
          className="mt-1"
          rows={[
            {
              label: `Defensive RAPM/100, ${season}`,
              per100: row.dP,
              pct,
            },
            ...(pooled && pooledPct !== null
              ? [
                  {
                    label: "Career, all seasons",
                    per100: pooled.dP,
                    pct: pooledPct,
                    note: `Fit once over all ${int(pooled.possDef)} of his defensive possessions rather than averaged across seasons, and ranked against every player with at least ${int(floor)} career possessions.`,
                  },
                ]
              : []),
          ]}
        />
      </section>

      {/* what the prior is doing */}
      <p className="mt-6 max-w-2xl text-sm leading-relaxed text-ink-soft">
        <span className="font-display font-semibold text-ink">
          Before the prior:
        </span>{" "}
        <span className="font-mono tnum" style={{ color: divergingText(row.d) }}>
          {signed(row.d, 1)}
        </span>{" "}
        on the plain ridge fit, against{" "}
        <span className="font-mono tnum" style={{ color: divergingText(row.dP) }}>
          {signed(row.dP, 1)}
        </span>{" "}
        once a box-score prior is folded in
        {Math.abs(priorShift) >= 0.05 ? (
          <>
            {" "}
            , a shift of{" "}
            <span className="font-mono tnum">{signed(priorShift, 1)}</span>.
            The larger that gap, the more of the number is the prior talking
            rather than his own possessions.
          </>
        ) : (
          <>. The two agree here, so the prior is doing almost nothing.</>
        )}
      </p>

      {/* career */}
      {bySeason.length > 1 && (
        <section className="mt-14">
          <h2 className="font-display text-xl font-semibold tracking-tight text-ink sm:text-2xl">
            Career
          </h2>
          <p className="mt-1.5 text-sm text-ink-soft">
            Defensive RAPM per 100 possessions by season, each fit within its
            own season. Tap a season.
          </p>
          <CareerStrip
            rows={bySeason}
            activeSeason={season}
            onSelect={onSelectSeason}
            className="mt-4 max-w-2xl"
          />
        </section>
      )}

      <p className="mt-10 max-w-2xl text-xs leading-relaxed text-ink-faint">
        Defence is signed so positive is good: points per 100 possessions his
        presence prevents, holding teammates and opponents fixed. The ± is an
        approximate standard error, and where it is large next to the estimate
        the number is a weak signal. There is no game-by-game defensive series
        in this data, so this lens has no form strip. The three team defence
        categories (the shots a defence forces, rim deterrence, conversion
        suppression) are measured per shot faced and split across all five
        defenders, so they live with the{" "}
        <Link
          to="/league?lens=qualityForced"
          className="underline underline-offset-2 transition-colors duration-150 hover:text-ink"
        >
          team
        </Link>{" "}
        rather than here.{" "}
        <Link
          to="/methodology/lineups"
          className="underline underline-offset-2 transition-colors duration-150 hover:text-ink"
        >
          How it is fit
        </Link>
        .
      </p>
    </>
  );
}
