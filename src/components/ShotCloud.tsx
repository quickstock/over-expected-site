import { useMemo } from "react";
import { useShotSample } from "../data";
import { leagueDef, type League } from "../leagues";
import { dotsPath } from "../lib/shots";
import { GEOMETRY } from "./charts/CourtZones";

/**
 * The homepage hero's backdrop: a season's sampled shots where they were
 * taken, made in the league's warm pole and missed in its cool one, over
 * faint court lines. A made shot beat its own expectation and a miss fell
 * short of it, so the poles mean here what they mean in every chart.
 *
 * One SVG, two paths (every miss in one, every make in the other), filled
 * from the theme variables so a league switch reskins it with the rest of
 * the page. Absolutely positioned by the caller and aria-hidden: it never
 * moves layout and never reaches a screen reader. It fades in when its
 * sample lands, which is after the page has painted.
 */

// Faded out toward the title (left) and toward the content below.
const MASK =
  "linear-gradient(to right, transparent, #000 45%), linear-gradient(to bottom, #000 40%, transparent 88%)";

export default function ShotCloud({
  league,
  season,
  className = "",
}: {
  league: League;
  season: string;
  className?: string;
}) {
  const court = leagueDef(league).court;
  const sample = useShotSample(league, season);
  const paths = useMemo(() => {
    if (!sample.data) return null;
    const { x, y, m } = sample.data;
    return { missed: dotsPath(x, y, m, "0", court), made: dotsPath(x, y, m, "1", court) };
  }, [sample.data, court]);

  return (
    <svg
      viewBox="0 0 500 470"
      aria-hidden="true"
      className={`motion-safe:transition-opacity motion-safe:duration-700 ${className}`}
      style={{
        opacity: paths ? 1 : 0,
        maskImage: MASK,
        WebkitMaskImage: MASK,
        maskComposite: "intersect",
        WebkitMaskComposite: "source-in",
      }}
    >
      <g opacity={0.3}>{GEOMETRY[court].markings}</g>
      {paths && (
        <>
          <path d={paths.missed} fill="var(--color-cool)" fillOpacity={0.26} />
          <path d={paths.made} fill="var(--color-warm)" fillOpacity={0.42} />
        </>
      )}
    </svg>
  );
}
