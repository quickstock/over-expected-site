/**
 * A player's face, where a face exists to show.
 *
 * NBA and WNBA headshots are hotlinked from the leagues' own public CDNs
 * (cdn.nba.com / cdn.wnba.com), never stored or re-served: the id in our
 * data IS the id in their URL scheme, retired players resolve to real
 * photos, and unknown ids resolve to the league's own gray silhouette. No
 * European league publishes a URL-addressable headshot per player id, so
 * those leagues render the fallback: the letter chip (compare page) or
 * nothing at all (player header), depending on where the face would sit.
 */
import { useState } from "react";
import type { League } from "../leagues";
import { lastName } from "../lib/format";

export function headshotUrl(league: League, id: string): string | null {
  if (league === "NBA")
    return `https://cdn.nba.com/headshots/nba/latest/260x190/${id}.png`;
  if (league === "WNBA")
    return `https://cdn.wnba.com/headshots/wnba/latest/260x190/${id}.png`;
  return null;
}

export default function Headshot({
  league,
  id,
  name,
  fallback = "chip",
  className = "h-9 w-9",
}: {
  league: League;
  id: string;
  name: string;
  /** What to render when there is no photo source: the letter chip, or
      nothing (for placements that read fine without a face). */
  fallback?: "chip" | "none";
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const url = headshotUrl(league, id);

  if (!url || failed) {
    if (fallback === "none") return null;
    return (
      <span
        aria-hidden="true"
        className={`grid shrink-0 place-items-center rounded-full bg-ink font-mono text-[10px] font-bold text-paper ${className}`}
      >
        {lastName(name).slice(0, 1)}
      </span>
    );
  }

  return (
    <span
      className={`block shrink-0 overflow-hidden rounded-full border border-line bg-wash ${className}`}
    >
      <img
        src={url}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
        className="h-full w-full object-cover object-top"
      />
    </span>
  );
}
