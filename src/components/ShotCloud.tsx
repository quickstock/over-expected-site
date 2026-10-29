import { useMemo } from "react";
import { useShotSample } from "../data";
import { leagueDef, type League } from "../leagues";
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

// Court geometry is in viewBox units: tenths of a foot on the NBA court,
// and 500 units across FIBA's 15 m. The sample is in centimetres.
const UNITS_PER_CM = { nba: 1 / 3.048, fiba: 500 / 1500 } as const;
const HOOP_X = 250;
const HOOP_Y = 52.5;
const R = 1.6;

// Faded out toward the title (left) and toward the content below.
const MASK =
  "linear-gradient(to right, transparent, #000 45%), linear-gradient(to bottom, #000 40%, transparent 88%)";

function dots(s: { x: number[]; y: number[]; m: string }, made: string, u: number): string {
  let d = "";
  for (let i = 0; i < s.m.length; i++) {
    if (s.m[i] !== made) continue;
    const x = HOOP_X + s.x[i] * u - R;
    const y = HOOP_Y + s.y[i] * u;
    d += `M${x.toFixed(1)} ${y.toFixed(1)}a${R} ${R} 0 1 0 ${2 * R} 0a${R} ${R} 0 1 0 ${-2 * R} 0`;
  }
  return d;
}

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
    const u = UNITS_PER_CM[court];
    return { missed: dots(sample.data, "0", u), made: dots(sample.data, "1", u) };
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
