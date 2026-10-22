import type { League, ProfilesFile } from "../types";

type Row = ProfilesFile["rows"][number];

/** Recruitment comparisons stay within the men's or the women's game. The WNBA
    is the only women's league covered, so its players have no other league. */
const WOMEN: League[] = ["WNBA"];
const sameGame = (a: League, b: League) => WOMEN.includes(a) === WOMEN.includes(b);

/** A player's profile row and every current player in the other leagues, nearest
    first by distance between weighted profile vectors (build_profiles.py). */
export function rankSimilar(
  rows: ProfilesFile["rows"],
  league: League,
  id: string,
): { me: Row; field: { r: Row; d: number }[] } | null {
  const me = rows.find((r) => r[0] === league && r[1] === id);
  if (!me) return null;
  const v = me[6];
  const field = rows
    .filter((r) => r[0] !== league && r[5] === 1 && sameGame(r[0], league))
    .map((r) => ({ r, d: Math.sqrt(r[6].reduce((a, x, i) => a + (x - v[i]) ** 2, 0)) }))
    .sort((a, b) => a.d - b.d);
  return { me, field };
}
