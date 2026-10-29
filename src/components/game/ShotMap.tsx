/**
 * One team's shots in one game, on the league's half court: made in the
 * league's warm pole, missed in its cool one, the encoding the homepage hero
 * uses, with larger dots because a game has a hundred shots, not thousands.
 *
 * The court is drawn from the first render (it needs no data), so the box
 * has its height before the shots land. Shots with no location (the ACB's
 * unknown depths, a few NBA feed gaps) cannot be placed: they are counted in
 * the caption and still count in every total on the page.
 */
import { useMemo } from "react";
import type { GameDetail } from "../../types";
import { dotsPath } from "../../lib/shots";
import { GEOMETRY } from "../charts/CourtZones";

const DOT_R = 5;

/** One side's shots, as the columns dotsPath reads. */
export function sideShots(d: GameDetail, side: 0 | 1) {
  const x: (number | null)[] = [];
  const y: (number | null)[] = [];
  let m = "";
  for (let i = 0; i < d.s.p.length; i++) {
    if (d.p[d.s.p[i]][2] !== side) continue;
    x.push(d.s.x[i]);
    y.push(d.s.y[i]);
    m += d.s.m[i];
  }
  return { x, y, m };
}

function Dot({ made }: { made: boolean }) {
  return (
    <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true" className="inline-block">
      <circle
        cx="4"
        cy="4"
        r="3.6"
        fill={made ? "var(--color-warm)" : "var(--color-cool)"}
        fillOpacity={made ? 0.42 : 0.26}
      />
    </svg>
  );
}

export default function ShotMap({
  court,
  team,
  shots,
}: {
  court: "nba" | "fiba";
  team: string;
  /** Null while the game's week chunk loads. */
  shots: ReturnType<typeof sideShots> | null;
}) {
  const drawn = useMemo(() => {
    if (!shots) return null;
    let made = 0;
    let unlocated = 0;
    for (let i = 0; i < shots.m.length; i++) {
      if (shots.m[i] === "1") made++;
      if (shots.x[i] == null || shots.y[i] == null) unlocated++;
    }
    return {
      made,
      missed: shots.m.length - made,
      unlocated,
      madePath: dotsPath(shots.x, shots.y, shots.m, "1", court, DOT_R),
      missedPath: dotsPath(shots.x, shots.y, shots.m, "0", court, DOT_R),
    };
  }, [shots, court]);

  return (
    <figure className="min-w-0">
      <figcaption className="font-display text-[15px] font-semibold text-ink">{team}</figcaption>
      <svg
        viewBox="-2 -2 504 424"
        className="mt-2 block h-auto w-full"
        style={{ aspectRatio: "504 / 424" }}
        role="img"
        aria-label={
          drawn
            ? `${team} shots: ${drawn.made} made, ${drawn.missed} missed, by where they were taken.`
            : `${team} shots, loading.`
        }
      >
        <g opacity={0.55}>{GEOMETRY[court].markings}</g>
        {drawn && (
          <>
            <path d={drawn.missedPath} fill="var(--color-cool)" fillOpacity={0.26} />
            <path d={drawn.madePath} fill="var(--color-warm)" fillOpacity={0.42} />
          </>
        )}
      </svg>
      <p className="mt-2 flex min-h-5 flex-wrap items-center gap-x-3 font-mono text-xs tnum text-ink-faint">
        {drawn && (
          <>
            <span className="inline-flex items-center gap-1.5">
              <Dot made /> {drawn.made} made
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Dot made={false} /> {drawn.missed} missed
            </span>
            {drawn.unlocated > 0 && <span>{drawn.unlocated} without a location, not drawn</span>}
          </>
        )}
      </p>
    </figure>
  );
}
