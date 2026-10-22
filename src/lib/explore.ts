/**
 * The chart builder's data model: which numbers can go on an axis, the
 * questions it opens on, and the small statistics it reports (Pearson r, an
 * OLS trend, within-league percentiles).
 *
 * Every number is one the boards already publish. Nothing here is modelled:
 * a point is a qualified player-season from `shotValue`, joined to the FTAOE
 * board for the free-throw counts, so the builder can never show a figure the
 * rest of the site disagrees with.
 */
import type { League } from "../leagues";
import type { SiteData } from "../types";
import presetContent from "../content/explore.json";

export type StatKey =
  | "poe100"
  | "fgPoe100"
  | "makeOE"
  | "ftaoe100"
  | "fgPct"
  | "xfgPct"
  | "xptsShot"
  | "fga"
  | "fta100"
  | "xfta100"
  | "ftPct"
  | "poss";

export interface StatDef {
  key: StatKey;
  label: string;
  /** Appended to the axis title, e.g. "per 100". */
  unit: string;
  /** Over-expected figures: zero is the league baseline, and they can colour. */
  signed: boolean;
  decimals: number;
  /** Which player-page lens a click on this axis should open. */
  lens?: "value" | "making" | "fouls";
  /** Stats sharing a group share a unit, so y = x means something. */
  group?: "fg" | "ft100";
}

export const STATS: StatDef[] = [
  { key: "poe100", label: "Points over expected", unit: "per 100", signed: true, decimals: 1, lens: "value" },
  { key: "fgPoe100", label: "Shot-making, points", unit: "per 100", signed: true, decimals: 1, lens: "making" },
  { key: "makeOE", label: "FG% over expected", unit: "pp", signed: true, decimals: 1, lens: "making" },
  { key: "ftaoe100", label: "Foul-drawing (FTAOE)", unit: "per 100", signed: true, decimals: 1, lens: "fouls" },
  { key: "fgPct", label: "FG%", unit: "", signed: false, decimals: 1, lens: "making", group: "fg" },
  { key: "xfgPct", label: "Shot quality (expected FG%)", unit: "", signed: false, decimals: 1, lens: "making", group: "fg" },
  { key: "xptsShot", label: "Expected points per shot", unit: "", signed: false, decimals: 2, lens: "value" },
  // Season total, not per 100: the site's per-100 rates divide by the
  // possessions a player finished, and FGA per finished possession is how often
  // he ends one with a shot (~0.8-1.1 for everyone), not how much he shoots.
  { key: "fga", label: "Shot volume (FGA)", unit: "season", signed: false, decimals: 0, lens: "value" },
  { key: "fta100", label: "Free throws drawn", unit: "per 100", signed: false, decimals: 1, lens: "fouls", group: "ft100" },
  { key: "xfta100", label: "Free throws his shots predict", unit: "per 100", signed: false, decimals: 1, lens: "fouls", group: "ft100" },
  { key: "ftPct", label: "FT%", unit: "", signed: false, decimals: 1, lens: "fouls" },
  { key: "poss", label: "Possessions finished", unit: "", signed: false, decimals: 0 },
];

export const STAT = Object.fromEntries(STATS.map((s) => [s.key, s])) as Record<StatKey, StatDef>;

export function isStat(k: string | null): k is StatKey {
  return k !== null && k in STAT;
}

/** Only the over-expected figures colour the dots: they have a true zero, so
    the site's diverging encoding means the same thing it means everywhere. */
export const COLOR_KEYS: StatKey[] = STATS.filter((s) => s.signed).map((s) => s.key);

export interface Preset {
  id: string;
  question: string;
  x: StatKey;
  y: StatKey;
  /** How to read the picture. Never a result: the result depends on the
      league and season on screen, and the readout states it live. */
  note: string;
}

/* Copy lives in src/content/explore.json, read by this module and by the
   static generator (which lists the questions in /explore's prerendered
   body), so the wording cannot differ between the two. */
export const PRESETS = presetContent.presets as Preset[];

export const DEFAULT_PRESET = PRESETS[0];

export type LeagueChoice = League | "ALL";

export function explorePath({
  preset,
  league,
}: {
  preset?: Preset;
  league?: LeagueChoice;
}): string {
  const q = new URLSearchParams();
  if (league) q.set("lg", league);
  if (preset) {
    q.set("x", preset.x);
    q.set("y", preset.y);
  }
  const s = q.toString();
  return s ? `/explore?${s}` : "/explore";
}

export interface Point {
  /** `${league}:${id}`: ids are only unique inside a league. */
  key: string;
  lg: League;
  id: string;
  name: string;
  team: string;
  pos: string | null;
  v: Record<StatKey, number>;
}

/** One league-season's qualified players. The free-throw counts come from the
    FTAOE board, which covers every shot-value row (checked across all nine
    leagues); a row it somehow lacks gets NaN there and drops off only the
    charts that plot those two numbers. */
export function buildPoints(d: SiteData, lg: League, season: string): Point[] {
  const rows = d.shotValue?.[season] ?? [];
  const board = new Map(
    d.leaderboard.filter((r) => r.season === season).map((r) => [r.id, r]),
  );
  return rows.map((r) => {
    const b = board.get(r.id);
    return {
      key: `${lg}:${r.id}`,
      lg,
      id: r.id,
      name: r.name,
      team: r.teams[r.teams.length - 1] ?? "",
      pos: r.pos,
      v: {
        poe100: r.poe100,
        fgPoe100: r.fgPoe100,
        makeOE: r.makeOE,
        ftaoe100: r.ftaoe100,
        fgPct: r.fgPct,
        xfgPct: r.xfgPct,
        xptsShot: r.xptsShot,
        fga: r.fga,
        fta100: b ? (b.fta / b.poss) * 100 : NaN,
        xfta100: b ? (b.xfta / b.poss) * 100 : NaN,
        ftPct: r.ftPct * 100,
        poss: r.poss,
      },
    };
  });
}

/** Percentile (0-100) of each value inside its own league, ties averaged.
    This is what makes a nine-league chart honest: an over-expected figure is
    measured against its own league, so only its rank there travels. */
export function leaguePercentiles(points: Point[], key: StatKey): Map<string, number> {
  const out = new Map<string, number>();
  const groups = new Map<League, Point[]>();
  for (const p of points) {
    if (!Number.isFinite(p.v[key])) continue;
    const g = groups.get(p.lg) ?? [];
    g.push(p);
    groups.set(p.lg, g);
  }
  for (const g of groups.values()) {
    const sorted = [...g].sort((a, b) => a.v[key] - b.v[key]);
    const n = sorted.length;
    let i = 0;
    while (i < n) {
      let j = i;
      while (j + 1 < n && sorted[j + 1].v[key] === sorted[i].v[key]) j++;
      const rank = (i + j) / 2;
      for (let k = i; k <= j; k++) out.set(sorted[k].key, n > 1 ? (rank / (n - 1)) * 100 : 50);
      i = j + 1;
    }
  }
  return out;
}

export function pearson(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 3) return NaN;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  return sxy / Math.sqrt(sxx * syy);
}

/** Least-squares line y = a + b x. */
export function ols(xs: number[], ys: number[]): { a: number; b: number } {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
  }
  const b = sxx > 0 ? sxy / sxx : 0;
  return { a: my - b * mx, b };
}

/** "strong, positive": a plain reading of r, so the number is never the only
    thing a reader has to interpret. */
export function readR(r: number): string {
  const a = Math.abs(r);
  if (!Number.isFinite(r)) return "too few players";
  if (a < 0.1) return "no relationship to speak of";
  const size = a < 0.3 ? "weak" : a < 0.5 ? "moderate" : a < 0.7 ? "strong" : "very strong";
  return `${size}, ${r > 0 ? "positive" : "negative"}`;
}

/** Round ticks covering [lo, hi]. */
export function niceTicks(lo: number, hi: number, count: number): number[] {
  const span = hi - lo;
  if (!(span > 0)) return [lo];
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
  const out: number[] = [];
  for (let t = Math.ceil(lo / step) * step; t <= hi + step * 1e-9; t += step) {
    out.push(Math.round(t / step) * step);
  }
  return out;
}

export function fmtStat(def: StatDef, v: number, pct: boolean): string {
  if (pct) return `${Math.round(v)}`;
  const s = v.toFixed(def.decimals);
  if (def.signed) return parseFloat(s) > 0 ? `+${s}` : s.replace("-", "−");
  return def.decimals === 0 ? Math.round(v).toLocaleString("en-US") : s;
}
