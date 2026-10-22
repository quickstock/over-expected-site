import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useProfiles } from "../../data";
import { ACTIVE_LEAGUES, LEAGUE_LABEL, type League } from "../../leagues";
import { ordinal } from "../../lib/format";
import { rankSimilar } from "../../lib/similar";

const SHOWN = 6;

const pct = (v: number) => `${Math.round(v * 100)}%`;

/**
 * Players in other leagues with the same shot profile: where they shoot from,
 * how much they shoot, and how they convert and draw fouls relative to their
 * own league (build_profiles.py). Candidates are players whose latest
 * qualified season is current or one back, so the list is people a club could
 * still sign. The profile file loads only once this section nears the
 * viewport.
 */
export default function SimilarElsewhere({ league, id }: { league: League; id: string }) {
  const ref = useRef<HTMLElement>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    if (!ref.current || near) return;
    const io = new IntersectionObserver(
      (es) => es.some((e) => e.isIntersecting) && setNear(true),
      { rootMargin: "600px" },
    );
    io.observe(ref.current);
    return () => io.disconnect();
  }, [near]);
  const profiles = useProfiles(near);
  const [only, setOnly] = useState<League | null>(null);

  const ranked = useMemo(
    () => (profiles.data ? rankSimilar(profiles.data.rows, league, id) : null),
    [profiles.data, league, id],
  );

  const leagues = ACTIVE_LEAGUES.filter(
    (lg) => lg !== league && ranked?.field.some((f) => f.r[0] === lg),
  );
  const shown = (ranked?.field ?? [])
    .map((f, i) => ({ ...f, rank: i + 1 }))
    .filter((f) => !only || f.r[0] === only)
    .slice(0, SHOWN);
  const total = ranked?.field.length ?? 0;
  const test = profiles.data?.test;

  return (
    <section ref={ref} className="mt-16 max-w-3xl">
      <h2 className="font-display text-xl font-semibold tracking-tight text-ink">
        Same profile, other leagues
      </h2>
      {ranked && (
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          Matched on where he shoots from, how much he shoots, and how he
          converts and draws fouls against his own league, from his{" "}
          {ranked.me[3]} season: {pct(ranked.me[7][0])} of his shots at the rim,{" "}
          {pct(ranked.me[7][2])} from three, shot-making in the{" "}
          {ordinal(Math.round(ranked.me[7][3] * 100))} percentile of his league.
        </p>
      )}

      {ranked && leagues.length > 1 && (
        <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="League">
          {[null, ...leagues].map((lg) => (
            <button
              key={lg ?? "all"}
              type="button"
              onClick={() => setOnly(lg)}
              aria-pressed={only === lg}
              className={`rounded-full border px-3 py-1 font-display text-xs font-medium transition-colors duration-150 ${
                only === lg
                  ? "border-ink bg-ink text-paper"
                  : "border-line text-ink-soft hover:border-ink hover:text-ink"
              }`}
            >
              {lg ? LEAGUE_LABEL[lg] : "All leagues"}
            </button>
          ))}
        </div>
      )}

      {!ranked ? (
        <div className="mt-4 h-48 animate-pulse rounded bg-wash" aria-busy="true" />
      ) : total === 0 ? (
        <p className="mt-4 text-sm text-ink-faint">
          The WNBA is the only women's league covered here, so there is no other
          league to match against yet.
        </p>
      ) : (
        <table className="mt-4 w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left">
              {["Player", "Rim", "Three", "Making", "Fouls", "Closeness"].map((h, i) => (
                <th
                  key={h}
                  scope="col"
                  className={`py-2 pr-3 font-display text-[11px] font-medium uppercase tracking-wider text-ink-faint ${
                    i > 0 ? "text-right" : ""
                  } ${i > 0 && i < 5 ? "max-sm:hidden" : ""}`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map(({ r, rank }) => (
              <tr key={r[0] + r[1]} className="border-b border-line-soft">
                <td className="py-2.5 pr-3">
                  <Link
                    to={`/player/${r[0]}/${r[1]}`}
                    className="font-medium text-ink underline decoration-line underline-offset-2 hover:decoration-ink"
                  >
                    {r[2]}
                  </Link>
                  <span className="block text-xs text-ink-faint">
                    {LEAGUE_LABEL[r[0]]} · {r[4]} · {r[3]}
                  </span>
                </td>
                <td className="py-2.5 pr-3 text-right font-mono tnum max-sm:hidden">{pct(r[7][0])}</td>
                <td className="py-2.5 pr-3 text-right font-mono tnum max-sm:hidden">{pct(r[7][2])}</td>
                <td className="py-2.5 pr-3 text-right font-mono tnum max-sm:hidden">
                  {ordinal(Math.round(r[7][3] * 100))}
                </td>
                <td className="py-2.5 pr-3 text-right font-mono tnum max-sm:hidden">
                  {ordinal(Math.round(r[7][4] * 100))}
                </td>
                <td className="py-2.5 text-right font-mono text-xs tnum text-ink-soft">
                  top {Math.max(0.1, (rank / total) * 100).toFixed(rank / total < 0.01 ? 1 : 0)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {test && (
        <p className="mt-4 text-xs leading-relaxed text-ink-faint">
          Making and Fouls are percentiles within each player's own league, because
          the raw figures are measured against different leagues. Closeness ranks
          every current player in the other leagues. Does a profile travel? Of{" "}
          {test.pairs} players who played EuroLeague and a domestic league in the
          same season, the profile placed his own EuroLeague season in the top five
          of about {test.medianField} EuroLeague players {pct(test.top5)} of the time,
          and in the top 10% {pct(test.top10pct)} of the time. It describes how a
          player plays, not how good he would be at the next level.
        </p>
      )}
    </section>
  );
}
