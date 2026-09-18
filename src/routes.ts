/**
 * URL structure — the single source of truth for what a path means.
 *
 * League, season and lens are **path segments**, not query params: they decide
 * which data a page shows, so each combination needs its own URL to be
 * linkable, canonical-able and indexable. Sort key, direction, position filter
 * and possession floor stay query params, because they are how one reader looks
 * at a page rather than which page it is.
 *
 * Season-less ("evergreen") URLs always mean the league's current season and are
 * canonical for it, so links and authority accumulate on one URL instead of
 * resetting every October. Dated URLs are canonical for archive seasons only.
 * The rollover is a function of each league's own `meta.defaultSeason`, so it
 * happens on its own when the data moves on.
 */
import { ACTIVE_LEAGUES, LEAGUE_DEFS, DEFAULT_LEAGUE, type League } from "./leagues";

/* ------------------------------------------------------------------ lenses */

/** Player-leaderboard lenses. `slug` is the URL identity, `key` is what the
    boards already switch on. */
export const BOARD_LENSES = [
  { slug: "shot-value", key: "value" },
  { slug: "shot-making", key: "making" },
  { slug: "foul-drawing", key: "fouls" },
] as const;

export type BoardLensSlug = (typeof BOARD_LENSES)[number]["slug"];
export type BoardLensKey = (typeof BOARD_LENSES)[number]["key"];

/** /league lenses. The free-throw one is `free-throws`, not `foul-drawing`:
    that page shows free throws drawn *and* conceded per team, which is a
    different question from the player board's foul-drawing, so it gets its own
    slug rather than a shared taxonomy that would misdescribe one of them. The
    last three are the team-defence pillars and exist only for leagues shipping
    that layer. */
export const LEAGUE_LENSES = [
  { slug: "shot-value", key: "value" },
  { slug: "shot-making", key: "making" },
  { slug: "free-throws", key: "fouls" },
  { slug: "quality-forced", key: "qualityForced" },
  { slug: "rim-deterrence", key: "deterrence" },
  { slug: "conversion-suppression", key: "suppression" },
] as const;

export type LeagueLensSlug = (typeof LEAGUE_LENSES)[number]["slug"];
export type LeagueLensKey = (typeof LEAGUE_LENSES)[number]["key"];

/** Defence pillars, which need `layers.defense`. */
export const LEAGUE_DEF_KEYS = [
  "qualityForced",
  "deterrence",
  "suppression",
] as const;

export const DEFAULT_BOARD_LENS: BoardLensSlug = "shot-value";
export const DEFAULT_LEAGUE_LENS: LeagueLensSlug = "shot-value";

export function boardLensKey(slug: string | undefined): BoardLensKey | null {
  return BOARD_LENSES.find((l) => l.slug === slug)?.key ?? null;
}
export function boardLensSlug(key: BoardLensKey): BoardLensSlug {
  return BOARD_LENSES.find((l) => l.key === key)!.slug;
}
export function leagueLensKey(slug: string | undefined): LeagueLensKey | null {
  return LEAGUE_LENSES.find((l) => l.slug === slug)?.key ?? null;
}
export function leagueLensSlug(key: LeagueLensKey): LeagueLensSlug {
  return LEAGUE_LENSES.find((l) => l.key === key)!.slug;
}

/** Lens slugs a given league actually has a page for. */
export function leagueLensSlugs(lg: League): LeagueLensSlug[] {
  const hasDefense = !!LEAGUE_DEFS[lg].layers?.defense;
  return LEAGUE_LENSES.filter(
    (l) => hasDefense || !(LEAGUE_DEF_KEYS as readonly string[]).includes(l.key),
  ).map((l) => l.slug);
}

/* ------------------------------------------------------------- path builders */

/** Drop the season when it is the league's current one, so every link to "now"
    points at the evergreen URL that is also its canonical. */
export function datedPart(
  season: string | null | undefined,
  currentSeason: string,
): string | undefined {
  return !season || season === currentSeason ? undefined : season;
}

const seg = (season?: string) => (season ? `/${season}` : "");

export function boardPath(lg: League, lens: string, season?: string): string {
  return `/leaderboard/${lg}${seg(season)}/${lens}`;
}
export function leaguePath(lg: League, lens: string, season?: string): string {
  return `/league/${lg}${seg(season)}/${lens}`;
}
export function refereesPath(lg: League, season?: string): string {
  return `/referees/${lg}${seg(season)}`;
}

/* ------------------------------------------------------- league from the URL */

/** Path prefixes whose next segment is a league code. The active league is a
    function of the URL wherever the URL states one, so a page can never render
    one league's numbers under another league's toggle. */
const LEAGUE_ROUTES = [
  "leaderboard",
  "league",
  "referees",
  "player",
  "calibration",
  "lineups",
  "value",
] as const;

const LEAGUE_IN_PATH = new RegExp(
  `^/(?:${LEAGUE_ROUTES.join("|")})/([A-Za-z]+)(?:/|$)`,
);

export function leagueFromPath(pathname: string): League | null {
  const code = LEAGUE_IN_PATH.exec(pathname)?.[1];
  return code && (ACTIVE_LEAGUES as string[]).includes(code)
    ? (code as League)
    : null;
}

/**
 * Where the league picker goes when the reader switches to `lg`.
 *
 * Switching league keeps the *kind* of page and drops to that league's
 * evergreen URL, because seasons are not shared (BBL starts 2023-24) and a
 * kept season would produce a dead URL. On entity routes there is nothing to
 * keep at all — player and lineup ids do not cross leagues — so those land on
 * the new league's leaderboard, the only guaranteed-live destination.
 *
 * Returns null on routes with no league in the URL (`/`, `/methodology`,
 * `/compare`, `/data`, `/crackdown`, `/feedback`): there is nowhere to
 * navigate, so the picker only records the choice.
 */
export function leagueSwitchTarget(pathname: string, lg: League): string | null {
  const parts = pathname.split("/").filter(Boolean);
  const head = parts[0];
  const def = LEAGUE_DEFS[lg];

  if (head === "leaderboard") {
    const slug = parts[parts.length - 1];
    return boardPath(lg, boardLensKey(slug) ? slug : DEFAULT_BOARD_LENS);
  }
  if (head === "league") {
    const slug = parts[parts.length - 1];
    const valid = leagueLensSlugs(lg).includes(slug as LeagueLensSlug);
    return leaguePath(lg, valid ? slug : DEFAULT_LEAGUE_LENS);
  }
  if (head === "referees") return refereesPath(lg);
  if (head === "calibration") return `/calibration/${lg}`;
  if (head === "lineups") {
    return def.layers?.lineups
      ? `/lineups/${lg}`
      : boardPath(lg, DEFAULT_BOARD_LENS);
  }
  if (head === "value") {
    return def.layers?.value
      ? `/value/${lg}`
      : boardPath(lg, DEFAULT_BOARD_LENS);
  }
  if (head === "player") return boardPath(lg, DEFAULT_BOARD_LENS);
  return null;
}

/** Where the three legacy bare paths land. Production serves a real 301 from
    vercel.json before the router loads; these keep `vite dev` and any in-app
    navigation agreeing with it. */
export const LEGACY_TARGETS = {
  leaderboard: boardPath(DEFAULT_LEAGUE, DEFAULT_BOARD_LENS),
  league: leaguePath(DEFAULT_LEAGUE, DEFAULT_LEAGUE_LENS),
  referees: refereesPath(DEFAULT_LEAGUE),
} as const;
