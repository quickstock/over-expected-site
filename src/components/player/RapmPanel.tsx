/**
 * The lineup-impact section of the unified player card: this player-season's
 * offensive and defensive RAPM, with the shrinkage-aware standard errors that
 * say how much to trust them, and a way through to the lineups layer.
 *
 * Lazy: rapm-{LG}.json is a layer file fetched on demand, so this renders
 * nothing until it lands and nothing at all for leagues without the layer.
 *
 * The layer's possession floor is its own and much higher than the base
 * board's (a player can have a page here and still be far too thin to fit a
 * lineup model on). Below it we say so instead of printing a number: those
 * estimates are dominated by the box-score prior rather than by this
 * player's own possessions.
 */
import { Link } from "react-router-dom";
import { useRapm } from "../../data";
import { leagueDef, type League } from "../../leagues";
import { divergingText } from "../../lib/color";
import { int, signed } from "../../lib/format";

/** Prior-informed variant, matching the board's default display. */
function Figure({
  label,
  value,
  se,
  sub,
}: {
  label: string;
  value: number;
  se?: number;
  sub?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5 px-1 py-4 sm:py-1">
      <span className="font-display text-[11px] font-medium uppercase tracking-wider text-ink-faint">
        {label}
      </span>
      <span
        className="font-mono tnum text-3xl sm:text-4xl"
        style={{ color: divergingText(value) }}
      >
        {signed(value, 1)}
      </span>
      <span className="text-xs text-ink-soft">
        {se !== undefined ? `± ${se.toFixed(1)}` : sub}
      </span>
    </div>
  );
}

export default function RapmPanel({
  league,
  season,
  playerId,
}: {
  league: League;
  season: string;
  playerId: string;
}) {
  const def = leagueDef(league);
  const state = useRapm(league);

  if (!def.layers?.lineups) return null;
  if (state.status !== "ready") return null;

  const row = state.data.players[season]?.find((r) => r.id === playerId);
  if (!row) return null;

  const floor = state.data.meta.qualifyPoss;
  const poss = row.possOff + row.possDef;

  return (
    <section className="mt-14">
      <h2 className="font-display text-xl font-semibold tracking-tight text-ink sm:text-2xl">
        Lineup impact
      </h2>
      <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-soft">
        Regularized adjusted plus-minus: points per 100 possessions this player
        adds on offense and prevents on defense, holding teammates and opponents
        fixed. Ridge-regularized and informed by a box-score prior, so a small
        sample is pulled toward what the box score expects rather than toward
        zero. Defense is signed so positive is good.
      </p>

      {poss < floor ? (
        <p className="mt-6 rounded border border-line-soft bg-wash px-4 py-8 text-center text-sm leading-relaxed text-ink-faint">
          {int(poss)} possessions on the floor, below the {int(floor)} this
          layer requires. A lineup model needs far more than a shot-value one
          does: with a sample this thin the estimate is set by the box-score
          prior rather than by what happened, so it is not shown.
        </p>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-2 divide-line border-y border-line py-2 max-sm:[&>*:nth-child(odd)]:border-r max-sm:[&>*:nth-child(-n+2)]:border-b sm:grid-cols-4 sm:divide-x sm:py-5">
            <Figure label="Offense / 100" value={row.oP} se={row.seO} />
            <Figure label="Defense / 100" value={row.dP} se={row.seD} />
            <Figure label="Net / 100" value={row.netP} sub="offense + defense" />
            <div className="flex flex-col gap-1.5 px-1 py-4 sm:py-1">
              <span className="font-display text-[11px] font-medium uppercase tracking-wider text-ink-faint">
                Possessions
              </span>
              <span className="font-mono tnum text-3xl text-ink sm:text-4xl">
                {int(poss)}
              </span>
              <span className="text-xs text-ink-soft">
                {int(row.possOff)} off · {int(row.possDef)} def
              </span>
            </div>
          </div>

          <p className="mt-4 text-xs leading-relaxed text-ink-faint">
            The ± figures are approximate standard errors. Where they are large
            relative to the estimate, the number is a weak signal. RAPM
            separates players only as far as the lineup data allows.
          </p>
        </>
      )}

      <p className="mt-6">
        <Link
          to={`/lineups/${league}?season=${encodeURIComponent(season)}`}
          className="font-display text-sm font-medium text-ink underline underline-offset-4 transition-colors duration-150 hover:text-ink-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          Lineups and RAPM board →
        </Link>
        <Link
          to="/methodology/lineups"
          className="ml-6 font-display text-sm font-medium text-ink underline underline-offset-4 transition-colors duration-150 hover:text-ink-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          How it is fit →
        </Link>
      </p>
    </section>
  );
}
