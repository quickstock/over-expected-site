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
import { Link, useNavigate } from "react-router-dom";
import type { LeaderboardRow, RapmRow } from "../../types";
import type { League } from "../../leagues";
import { divergingText } from "../../lib/color";
import { int, ordinal, signed } from "../../lib/format";
import PercentileSliders from "./PercentileSliders";
import CareerStrip from "./CareerStrip";
import DefenseSpread from "../charts/DefenseSpread";
import ODScatter from "../charts/ODScatter";

const Z = 1.959964;

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
  league,
  season,
  playerId,
  seasonRows,
  pooledRows,
  floor,
  bySeason,
  onSelectSeason,
}: {
  league: League;
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
  const navigate = useNavigate();
  const row = seasonRows.find((r) => r.id === playerId);
  const pooled = pooledRows.find((r) => r.id === playerId);

  const qualified = (rows: RapmRow[]) =>
    rows.filter((r) => r.possOff + r.possDef >= floor);
  const qualifiedSeason = qualified(seasonRows);
  const seasonPool = qualifiedSeason.map((r) => r.dP);
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
  // How much of the field his own 95% interval still covers. Quoted next to
  // the figure so the percentile above cannot be read as a verdict.
  const ci: [number, number] = [row.dP - Z * row.seD, row.dP + Z * row.seD];
  const overlapped = qualifiedSeason.filter(
    (q) => q.id !== row.id && q.dP >= ci[0] && q.dP <= ci[1],
  ).length;
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

      {/* against the league, with his own interval to the same scale */}
      {!thin && qualifiedSeason.length > 20 && (
        <section className="mt-14">
          <h2 className="font-display text-xl font-semibold tracking-tight text-ink sm:text-2xl">
            Against the league
          </h2>
          <p className="mt-1.5 max-w-2xl text-sm text-ink-soft">
            Every qualified defender in {season}, placed by defensive RAPM. His
            95% interval is drawn underneath to the same scale.
          </p>
          <div className="mt-4">
            <DefenseSpread rows={qualifiedSeason} playerId={playerId} />
          </div>
          <p className="mt-2 max-w-2xl text-xs leading-relaxed text-ink-faint">
            The bar is the honest counterweight to the percentile above it.{" "}
            {overlapped === 0 ? (
              <>
                Not one of the{" "}
                <span className="font-mono tnum">
                  {qualifiedSeason.length - 1}
                </span>{" "}
                other qualified defenders falls inside it, which is rare: he
                separates from the entire field at this level of confidence.
              </>
            ) : (
              <>
                <span className="font-mono tnum">{overlapped}</span> of the{" "}
                <span className="font-mono tnum">
                  {qualifiedSeason.length - 1}
                </span>{" "}
                other qualified defenders fall inside it, and he is not
                separated from any of them at this level of confidence. What
                the percentile can support is the direction, not the exact
                place in the order.
              </>
            )}
          </p>
        </section>
      )}

      {/* offense against defense. Gated on the floor like the figure above:
          a player under it is not in the qualified field, so he would be
          missing from his own chart. */}
      {!thin && qualifiedSeason.length > 20 && (
        <section className="mt-14">
          <h2 className="font-display text-xl font-semibold tracking-tight text-ink sm:text-2xl">
            Both ends at once
          </h2>
          <p className="mt-1.5 max-w-2xl text-sm text-ink-soft">
            Offense across, defense up, one dot per qualified player in{" "}
            {season}. Whiskers are a standard error on each axis. Top-right
            helps at both ends; tap another dot for that player.
          </p>
          <div className="mt-4">
            <ODScatter
              rows={qualifiedSeason}
              variant="prior"
              highlightId={playerId}
              height={420}
              onSelect={(pid) =>
                navigate(
                  `/player/${league}/${pid}?season=${encodeURIComponent(season)}&lens=defense`,
                )
              }
            />
          </div>
          <p className="mt-2 max-w-2xl text-xs leading-relaxed text-ink-faint">
            The two axes come from one fit, so a player who is carried by his
            offense sits right and low, and a specialist sits left and high.
          </p>
        </section>
      )}

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
            metricLabel="Defensive RAPM per 100"
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
          to="/league/NBA/quality-forced"
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
