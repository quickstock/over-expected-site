/**
 * The defence section of the player card, NBA only.
 *
 * Two questions live here and only one of them is about the player, so the
 * section is built to keep them apart:
 *
 *  1. **D-RAPM is his.** Points per 100 possessions his presence prevents,
 *     holding teammates and opponents fixed. It carries its own standard
 *     error, and below the lineup layer's possession floor it is not printed
 *     at all (that estimate would be the box-score prior talking, not him).
 *  2. **The three categories are his team's.** Quality forced, rim deterrence
 *     and conversion suppression are measured per shot faced and charged to
 *     the five defenders on the floor. Splitting a shot five ways makes it
 *     team defence wearing a player's name — the player version of this metric
 *     was built and rejected at 0.348 split-half — so they render under the
 *     team's name, ranked within the league, never under his.
 *
 * Both files are lazy layer fetches, so this renders progressively and
 * nothing at all for leagues without the layers.
 */
import { Link } from "react-router-dom";
import { useDefense, useRapm } from "../../data";
import { leagueDef, type League } from "../../leagues";
import { divergingText } from "../../lib/color";
import { int, signed } from "../../lib/format";

const reliabilityWord = (sb: number) =>
  sb >= 0.9 ? "solid" : sb >= 0.7 ? "usable" : "noisy";

/** Positive is good on all three pillars, so rank 1 is the best defence. */
function rankOf(values: number[], v: number) {
  return values.filter((x) => x > v).length + 1;
}

export default function PlayerDefense({
  league,
  season,
  playerId,
  teams,
}: {
  league: League;
  season: string;
  playerId: string;
  /** Team abbreviations the player finished possessions for, in order. */
  teams: string[];
}) {
  const def = leagueDef(league);
  const rapmState = useRapm(def.layers?.lineups ? league : null);
  const defState = useDefense(def.layers?.defense ? league : null);

  if (!def.layers?.defense) return null;

  const rapmRow =
    rapmState.status === "ready"
      ? rapmState.data.players[season]?.find((r) => r.id === playerId)
      : undefined;
  const rapmFloor =
    rapmState.status === "ready" ? rapmState.data.meta.qualifyPoss : 0;
  const rapmPoss = rapmRow ? rapmRow.possOff + rapmRow.possDef : 0;
  const showRapm = !!rapmRow && rapmPoss >= rapmFloor;

  const defData = defState.status === "ready" ? defState.data : null;
  const seasonRows = defData?.teams[season] ?? [];
  const pillars = defData?.meta.pillars ?? [];
  // A midseason trade puts two teams on the row; both get their own block.
  const myTeams = teams.filter((t) => seasonRows.some((r) => r.team === t));

  if (defState.status === "loading")
    return (
      <section className="mt-14" aria-busy="true">
        <div className="h-7 w-40 animate-pulse rounded bg-wash" />
        <div className="mt-6 h-40 animate-pulse rounded bg-wash" />
      </section>
    );
  if (!defData || seasonRows.length === 0) return null;

  return (
    <section className="mt-14">
      <h2 className="font-display text-xl font-semibold tracking-tight text-ink sm:text-2xl">
        Defense
      </h2>
      <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-soft">
        Two questions, and only the first is about him. Adjusted plus-minus
        asks what his presence on the floor prevents. The three categories
        below it are measured per shot faced and charged to all five defenders
        at once, so they describe the defence he played in rather than the
        defender he is.
      </p>

      {/* his own number */}
      {rapmState.status === "loading" ? (
        <div className="mt-6 h-24 animate-pulse rounded bg-wash" aria-busy="true" />
      ) : showRapm ? (
        <div className="mt-6 grid grid-cols-2 divide-line border-y border-line py-2 max-sm:[&>*:nth-child(odd)]:border-r sm:divide-x sm:py-5">
          <div className="flex flex-col gap-1.5 px-1 py-4 sm:py-1">
            <span className="font-display text-[11px] font-medium uppercase tracking-wider text-ink-faint">
              Defensive RAPM / 100
            </span>
            <span
              className="font-mono tnum text-3xl sm:text-4xl"
              style={{ color: divergingText(rapmRow!.dP) }}
            >
              {signed(rapmRow!.dP, 1)}
            </span>
            <span className="text-xs text-ink-soft">
              ± {rapmRow!.seD.toFixed(1)} · points prevented, signed so
              positive is good
            </span>
          </div>
          <div className="flex flex-col gap-1.5 px-1 py-4 sm:py-1">
            <span className="font-display text-[11px] font-medium uppercase tracking-wider text-ink-faint">
              Defensive possessions
            </span>
            <span className="font-mono tnum text-3xl text-ink sm:text-4xl">
              {int(rapmRow!.possDef)}
            </span>
            <span className="text-xs text-ink-soft">
              what the estimate above is built on
            </span>
          </div>
        </div>
      ) : rapmState.status === "ready" ? (
        <p className="mt-6 rounded border border-line-soft bg-wash px-4 py-6 text-sm leading-relaxed text-ink-faint">
          No adjusted plus-minus for this season:{" "}
          <span className="font-mono tnum">{int(rapmPoss)}</span> possessions on
          the floor against the{" "}
          <span className="font-mono tnum">{int(rapmFloor)}</span> a lineup
          model needs. Below that the estimate is set by the box-score prior
          rather than by what he did, so it is not shown.
        </p>
      ) : null}

      {/* his team's defence — never his */}
      {myTeams.length > 0 && (
        <div className="mt-8">
          <h3 className="font-display text-[11px] font-medium uppercase tracking-wider text-ink-faint">
            The defence he played in, {season}
          </h3>
          {myTeams.map((team) => {
            const row = seasonRows.find((r) => r.team === team)!;
            return (
              <div key={team} className="mt-4">
                {myTeams.length > 1 && (
                  <p className="font-display text-[13px] font-semibold text-ink">
                    {team}
                  </p>
                )}
                <ul className="mt-1">
                  {pillars.map((p) => {
                    const v = row[p.key];
                    const rank = rankOf(
                      seasonRows.map((r) => r[p.key]),
                      v,
                    );
                    return (
                      <li
                        key={p.key}
                        className="grid grid-cols-[minmax(0,1fr)_5rem_5.5rem] items-baseline gap-x-4 border-b border-line-soft py-2.5"
                      >
                        <span className="min-w-0">
                          <span className="block font-display text-[14px] font-medium text-ink">
                            {myTeams.length > 1 ? "" : `${team} · `}
                            {p.label}
                          </span>
                          <span className="block font-mono tnum text-[10px] text-ink-faint">
                            reliability {p.spearmanBrown.toFixed(2)} ·{" "}
                            {reliabilityWord(p.spearmanBrown)}
                          </span>
                        </span>
                        <span className="text-right font-mono tnum text-xs text-ink-faint">
                          {rank} of {seasonRows.length}
                        </span>
                        <span
                          className="text-right font-mono tnum text-lg"
                          style={{ color: divergingText(v) }}
                        >
                          {p.key === "qualityForced"
                            ? signed(v, 3)
                            : signed(v, 2)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
          <p className="mt-3 max-w-2xl text-xs leading-relaxed text-ink-faint">
            These three are the team's, not his: every shot faced is split
            across the five defenders on the floor, and the player-level
            version of this metric scored{" "}
            <span className="font-mono tnum">
              {defData.meta.playerLevelRejected.spearmanBrown.toFixed(2)}
            </span>{" "}
            on a split-half test and was thrown out rather than shipped. Each
            figure is measured against the same season's league mean, and the
            reliability under each one says how much a single season of it
            carries.
          </p>
        </div>
      )}

      <p className="mt-6">
        <Link
          to="/league?lens=qualityForced"
          className="font-display text-sm font-medium text-ink underline underline-offset-4 transition-colors duration-150 hover:text-ink-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          Every team's defence →
        </Link>
        <Link
          to="/methodology/defense"
          className="ml-6 font-display text-sm font-medium text-ink underline underline-offset-4 transition-colors duration-150 hover:text-ink-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          How it is measured →
        </Link>
      </p>
    </section>
  );
}
