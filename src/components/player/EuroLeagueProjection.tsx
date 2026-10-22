import { Link } from "react-router-dom";
import type { ShotValueRow, SiteData } from "../../types";
import { divergingText } from "../../lib/color";
import { int, signed } from "../../lib/format";

type Translation = NonNullable<SiteData["meta"]["translation"]>;

/** Ruler domain, percentage points of FG% over expected. */
const LO = -12;
const HI = 12;
const at = (v: number) => `${((Math.max(LO, Math.min(HI, v)) - LO) / (HI - LO)) * 100}%`;

/**
 * What a domestic-league season says about EuroLeague shot-making: the
 * projection, the range 80% of players land in, and, when he also played
 * EuroLeague that season, what he actually shot there. The range is drawn
 * as wide as it is because one EuroLeague season of shots is itself noisy.
 */
export default function EuroLeagueProjection({
  sv,
  t,
  league,
  season,
}: {
  sv: ShotValueRow;
  t: Translation;
  league: string;
  season: string;
}) {
  if (sv.elProj == null || sv.elLo == null || sv.elHi == null) return null;
  const trust = sv.fga / (sv.fga + t.K);
  return (
    <section className="mt-10 max-w-2xl">
      <h2 className="font-display text-[11px] font-medium uppercase tracking-wider text-ink-faint">
        In EuroLeague
      </h2>
      <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">
        Projected EuroLeague shot-making:{" "}
        <span className="font-mono tnum font-semibold" style={{ color: divergingText(sv.elProj) }}>
          {signed(sv.elProj, 1)}
        </span>{" "}
        points of FG% over expected, with 80% of players landing between{" "}
        <span className="font-mono tnum">{signed(sv.elLo, 1)}</span> and{" "}
        <span className="font-mono tnum">{signed(sv.elHi, 1)}</span>.
      </p>

      <div className="relative mt-6 h-12" aria-hidden="true">
        <div className="absolute inset-x-0 top-5 h-px bg-line" />
        <div className="absolute top-3 h-5 w-px bg-ink-faint" style={{ left: at(0) }} />
        <div
          className="absolute top-[18px] h-1.5 rounded-full bg-line"
          style={{ left: at(sv.elLo), right: `calc(100% - ${at(sv.elHi)})` }}
        />
        <div
          className="absolute top-3 h-5 w-5 -translate-x-1/2 rounded-full border-2 border-paper"
          style={{ left: at(sv.elProj), backgroundColor: divergingText(sv.elProj) }}
        />
        {sv.elActual != null && (
          <div
            className="absolute top-3 h-5 w-5 -translate-x-1/2 rounded-full border-2"
            style={{ left: at(sv.elActual), borderColor: "var(--color-ink)" }}
          />
        )}
        <span className="absolute top-9 -translate-x-1/2 font-mono text-[10px] tnum text-ink-faint" style={{ left: at(0) }}>
          EuroLeague average
        </span>
      </div>
      <p className="mt-1 text-xs text-ink-faint">
        Filled dot: projection. Bar: the range 80% of players land in.
        {sv.elActual != null && " Ring: what he actually shot in EuroLeague."}
      </p>

      {sv.elActual != null && (
        <p className="mt-4 text-[15px] leading-relaxed text-ink-soft">
          He also played EuroLeague in {season}:{" "}
          <span className="font-mono tnum font-semibold" style={{ color: divergingText(sv.elActual) }}>
            {signed(sv.elActual, 1)}
          </span>{" "}
          on <span className="font-mono tnum">{int(sv.elFga ?? 0)}</span> attempts.
        </p>
      )}

      <p className="mt-4 text-xs leading-relaxed text-ink-faint">
        His {league} figure of{" "}
        <span className="font-mono tnum">{signed(sv.makeOE, 1)}</span> is trusted in
        proportion to his {int(sv.fga)} attempts ({Math.round(trust * 100)}%), then moved
        by the {league} step to EuroLeague,{" "}
        <span className="font-mono tnum">{signed(t.step, 1)}</span>, measured on{" "}
        {int(t.nLeaguePairs)} players who played both in the same season. Tested on
        seasons it never saw, it beats assuming he shoots the same (
        <span className="font-mono tnum">{t.oosRmse.toFixed(1)}</span> against{" "}
        <span className="font-mono tnum">{t.naiveRmse.toFixed(1)}</span> points of error)
        and assuming a league-average EuroLeague shooter (
        <span className="font-mono tnum">{t.flatRmse.toFixed(1)}</span>).{" "}
        <Link to="/methodology" className="underline underline-offset-2 hover:text-ink">
          How it is built
        </Link>
        .
      </p>
    </section>
  );
}
