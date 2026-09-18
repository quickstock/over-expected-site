/**
 * A player's face, where a face exists to show.
 *
 * Two resolution paths, declared per league in the registry as `headshots`:
 *
 *   "id"  — the NBA and WNBA serve a headshot at a URL built from the very id
 *           we store, so the URL is computed and nothing is fetched or stored.
 *   "map" — every other league keys its photos on a media UUID (EuroLeague,
 *           EuroCup), a hashed media path (Liga ACB), a Genius asset hash (Greek
 *           Basket League), or a 24-character asset key (Lega Basket Serie A).
 *           None of those can be derived from a player id, so
 *           `headshots-{CODE}.json` carries the join and is fetched lazily, only
 *           on the routes that show a face.
 *
 * Nothing is ever stored or re-served: every URL points at the league's own
 * public CDN. Coverage is partial by nature (99% EuroLeague down to 64% Greek
 * Basket League, where a third of the Genius photo hosts no longer resolve), and
 * a miss falls back to the letter chip or to nothing, never to a broken image.
 * The BBL is absent on purpose: its portrait endpoint answers 200 for any id
 * with the same placeholder silhouette.
 */
import { useState } from "react";
import { useHeadshots } from "../data";
import { LEAGUE_DEFS, type League } from "../leagues";
import { lastName } from "../lib/format";

/** The URL for leagues that serve a headshot at an id-derived address. */
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
  const mode = LEAGUE_DEFS[league].headshots;
  // Only "map" leagues fetch anything, and only from the routes that mount a
  // face. The hook runs unconditionally with a null argument otherwise, because
  // a conditional hook would change the hook count between leagues.
  const maps = useHeadshots(mode === "map" ? league : null);
  const url =
    mode === "id"
      ? headshotUrl(league, id)
      : maps.status === "ready"
        ? maps.data.urls[id] ?? null
        : null;

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
      {/* Intrinsic size stated so the box never reflows once the image lands:
          the container sizes it, but without these the browser has no aspect
          ratio to reserve. */}
      <img
        src={url}
        alt=""
        width={200}
        height={200}
        loading="lazy"
        onError={() => setFailed(true)}
        className="h-full w-full object-cover object-top"
      />
    </span>
  );
}
