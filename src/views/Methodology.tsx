import { Link } from "react-router-dom";
import { useLeague } from "../data";
import { LEAGUE_DEFS } from "../leagues";
import MethodologyNBA from "./MethodologyNBA";
import MethodologyEuro from "./MethodologyEuro";

/** The layers that have their own methodology page, gated by the registry so
    this list cannot offer a league a page whose data it doesn't ship. */
const LAYER_METHODS = [
  {
    key: "lineups",
    to: "/methodology/lineups",
    label: "Lineups & RAPM",
    blurb:
      "Adjusted plus-minus from who was on the floor, and why lineup synergy is described rather than forecast.",
  },
  {
    key: "value",
    to: "/methodology/value",
    label: "Value",
    blurb:
      "Wins over replacement on the published VORP shape, with adjusted plus-minus in place of a box-score estimate.",
  },
  {
    key: "defense",
    to: "/methodology/defense",
    label: "Team defence",
    blurb:
      "Why this one is team-level, what the rejected player version got wrong, and the measured reliability of each pillar.",
  },
  {
    key: "coaching",
    to: "/methodology/coaching",
    label: "Decision EV",
    blurb:
      "Scoring the end-game two-versus-three choice on expectation, with the outcome provably not an input.",
  },
] as const;

/**
 * The methodology text differs by build: the NBA measures shooting-foul
 * free throws with a style-adjusted baseline and a padding-K reliability
 * model; the European builds measure all drawn free throws, bonus
 * included, with no tracking data. Dispatch on the active league.
 *
 * The base text covers the three lenses every league shares. Each analytical
 * layer has its own methodology page, listed after it — otherwise a reader who
 * lands here would reasonably conclude the three lenses are all there is.
 */
export default function Methodology() {
  const { league } = useLeague();
  const layers = LEAGUE_DEFS[league].layers;
  const available = LAYER_METHODS.filter((m) => layers?.[m.key]);

  return (
    <>
      {league === "NBA" ? <MethodologyNBA /> : <MethodologyEuro />}
      {available.length > 0 && (
        <section className="mx-auto max-w-2xl px-5 pb-16 sm:px-8">
          <h2 className="border-t border-line pt-10 font-display text-xl font-semibold tracking-tight text-ink sm:text-2xl">
            The analytical layers
          </h2>
          <p className="mt-3 font-serif text-[15px] leading-relaxed text-ink-soft">
            Everything above describes the three lenses that run for every
            league. These layers sit on top of them, each with its own method,
            its own data requirements, and its own honest ceiling.
          </p>
          <ul className="mt-6 space-y-4">
            {available.map((m) => (
              <li key={m.to}>
                <Link
                  to={m.to}
                  className="block rounded-md border border-line-soft px-4 py-3.5 transition-colors duration-150 hover:bg-wash"
                >
                  <span className="font-display text-[15px] font-semibold text-ink">
                    {m.label}
                  </span>
                  <span className="mt-1 block font-serif text-sm leading-relaxed text-ink-soft">
                    {m.blurb}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
