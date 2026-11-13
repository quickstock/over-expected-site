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
 * sample lands, which is after the page has painted, and the shots arrive
 * ring by ring from the rim out (instant under reduced motion).
 */

// Outer edges of the arrival rings, in cm from the hoop: the rim, the paint,
// short and long mid-range, the arc, and everything deeper.
const RINGS_CM = [120, 240, 400, 560, 700, Infinity];

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
  // One made/missed path pair per ring of distance from the hoop, so the
  // shots can arrive rim first and spread out to the arc.
  const rings = useMemo(() => {
    if (!sample.data) return null;
    const { x, y, m } = sample.data;
    const ring = x.map((sx, i) => {
      const sy = y[i];
      return sx == null || sy == null ? -1 : RINGS_CM.findIndex((edge) => Math.hypot(sx, sy) < edge);
    });
    return RINGS_CM.map((_, k) => {
      const inRing = Array.from(m, (c, i) => (ring[i] === k ? c : "x")).join("");
      return { missed: dotsPath(x, y, inRing, "0", court), made: dotsPath(x, y, inRing, "1", court) };
    });
  }, [sample.data, court]);

  return (
    <svg
      viewBox="0 0 500 470"
      aria-hidden="true"
      className={`motion-safe:transition-opacity motion-safe:duration-700 ${className}`}
      style={{
        opacity: rings ? 1 : 0,
        maskImage: MASK,
        WebkitMaskImage: MASK,
        maskComposite: "intersect",
        WebkitMaskComposite: "source-in",
      }}
    >
      <g opacity={0.3}>{GEOMETRY[court].markings}</g>
      {rings && (
        // keyed by league-season, so a new season's sample replays the arrival
        <g key={`${league}-${season}`}>
          {rings.map((p, k) => (
            <g key={k} className="shot-ring" style={{ animationDelay: `${120 + k * 110}ms` }}>
              <path d={p.missed} fill="var(--color-cool)" fillOpacity={0.26} />
              <path d={p.made} fill="var(--color-warm)" fillOpacity={0.42} />
            </g>
          ))}
        </g>
      )}
    </svg>
  );
}
