/**
 * The league registry — the single source of truth for every league the
 * site covers. Adding a league = adding a def here (plus its
 * data-{CODE}.json / players-{CODE}-{season}.json exports in public/).
 * Everything else — themes, routes, copy, court geometry, thresholds —
 * derives from these fields.
 */

export type League =
  | "NBA"
  | "EL"
  | "EUC"
  | "ACB"
  | "BSL"
  | "LBA"
  | "PROA"
  | "GBL"
  | "BBL"
  | "ABA"
  | "WNBA";

interface Oklch {
  l: number;
  c: number;
  h: number;
}

export interface LeagueDef {
  code: League;
  /** Full display name ("EuroLeague"). */
  label: string;
  /** Name inside prose: "a shot in {inLabel}" ("the NBA", "EuroLeague"). */
  inLabel: string;
  /** Toggle chip / compact contexts. */
  short: string;
  /** Diverging encoding poles. Warm = above league rate, cool = below.
      Warm is always the warmer hue of the pair: positive reads red-family,
      negative blue-family, in every league. */
  warm: Oklch;
  cool: Oklch;
  /** The league's own identity color — the logo, the active nav underline,
      the league-picker dot. Independent of the warm/cool diverging poles
      (which encode positive/negative, not brand): NBA's brand is blue even
      though positive NBA stats read warm/red like everywhere else. */
  brand: Oklch;
  /** FTAOE per-100 at which the color scale saturates. */
  scaleMax: number;
  /** Court geometry for the shot-zone chart. */
  court: "nba" | "fiba";
  /** True when the stat counts shooting-foul FTs only (NBA); false when
      all personal-foul FTs, bonus included (European builds). */
  sftaOnly: boolean;
  /** Career-percentile pool: minimum career possessions. */
  careerMinPoss: number;
  /** Leaderboard min-possessions slider: max and step. */
  boardMax: number;
  boardStep: number;
  /** Referee profiles require this many games in a season. */
  refMinGames: number;
  /** Season to annotate as the officiating crackdown (NBA only). */
  crackdownSeason?: string;
  /** Has the /crackdown story route. */
  hasStory?: boolean;
  /** Data-credit line on the open-data page. */
  sourceCredit: string;
  /** How a player's face resolves, if at all.
      "id"  — the league's CDN serves it at a URL built from the id we store
              (NBA, WNBA), so nothing is stored on our side.
      "map" — the URL is a media UUID, hash or asset key that cannot be derived
              from a player id, so `headshots-{CODE}.json` carries the join.
      absent — no source found. The BBL's portrait endpoint answers 200 for any
              id with the same placeholder SVG, so there is nothing to map. */
  headshots?: "id" | "map";
  /** Platform analytical layers this league ships beyond the base OE
      lenses; absent = base only. Gates nav items, routes, and player-page
      sections per league. */
  layers?: {
    /** Lineups / RAPM board + player-page RAPM section. */
    lineups?: boolean;
    /** Value board: wins over replacement, and contract surplus where
        per-player salaries are available (NBA only; the European leagues
        publish none). */
    value?: boolean;
    /** Coaching board: decision expected-value on the end-game 2-vs-3
        choice. Needs play-by-play with a clock, so NBA only for now. */
    coaching?: boolean;
    /** Team-defence board. Privileged and NBA-only: it needs shot-level
        expected points against a reconstructed five-man defensive lineup,
        which no European league publishes. Deliberately team-level — the
        player version failed validation and is not shipped. */
    defense?: boolean;
  };
}

const EURO_DEFAULTS = {
  scaleMax: 18,
  court: "fiba" as const,
  sftaOnly: false,
  careerMinPoss: 400,
  boardMax: 700,
  boardStep: 25,
  refMinGames: 15,
};

const COOL_BLUE: Oklch = { l: 0.52, c: 0.115, h: 252 };

export const LEAGUE_DEFS: Record<League, LeagueDef> = {
  NBA: {
    code: "NBA",
    label: "NBA",
    inLabel: "the NBA",
    short: "NBA",
    warm: { l: 0.58, c: 0.185, h: 38 },
    cool: { l: 0.5, c: 0.18, h: 256 },
    brand: { l: 0.5, c: 0.18, h: 256 },
    scaleMax: 12,
    court: "nba",
    sftaOnly: true,
    careerMinPoss: 1000,
    boardMax: 2000,
    boardStep: 50,
    refMinGames: 20,
    crackdownSeason: "2021-22",
    hasStory: true,
    sourceCredit:
      "Underlying play-by-play and tracking aggregates are NBA.com data.",
    headshots: "id",
    layers: { lineups: true, value: true, coaching: true, defense: true },
  },
  EL: {
    code: "EL",
    label: "EuroLeague",
    inLabel: "EuroLeague",
    short: "EL",
    warm: { l: 0.62, c: 0.195, h: 45 },
    cool: COOL_BLUE,
    brand: { l: 0.62, c: 0.195, h: 45 },
    ...EURO_DEFAULTS,
    sourceCredit: "Underlying play-by-play is EuroLeague public data.",
    headshots: "map",
  },
  EUC: {
    code: "EUC",
    label: "EuroCup",
    inLabel: "EuroCup",
    short: "EuroCup",
    warm: { l: 0.6, c: 0.16, h: 95 },
    cool: { l: 0.52, c: 0.14, h: 265 },
    brand: { l: 0.6, c: 0.16, h: 95 },
    ...EURO_DEFAULTS,
    sourceCredit: "Underlying play-by-play is EuroCup public data.",
    headshots: "map",
  },
  ACB: {
    code: "ACB",
    label: "Liga ACB",
    inLabel: "Liga ACB",
    short: "ACB",
    warm: { l: 0.52, c: 0.19, h: 15 },
    cool: COOL_BLUE,
    brand: { l: 0.52, c: 0.19, h: 15 },
    ...EURO_DEFAULTS,
    sourceCredit: "Underlying play-by-play is Liga ACB public data.",
    headshots: "map",
  },
  BSL: {
    code: "BSL",
    label: "Basketbol Süper Ligi",
    inLabel: "the Turkish BSL",
    short: "BSL",
    warm: { l: 0.6, c: 0.215, h: 30 },
    cool: COOL_BLUE,
    brand: { l: 0.6, c: 0.215, h: 30 },
    ...EURO_DEFAULTS,
    sourceCredit:
      "Underlying play-by-play is Basketbol Süper Ligi public data.",
  },
  LBA: {
    code: "LBA",
    label: "Lega Basket Serie A",
    inLabel: "the Italian LBA",
    short: "LBA",
    warm: { l: 0.5, c: 0.15, h: 310 },
    cool: { l: 0.55, c: 0.16, h: 150 },
    brand: { l: 0.55, c: 0.16, h: 150 },
    ...EURO_DEFAULTS,
    sourceCredit:
      "Underlying play-by-play is Lega Basket Serie A public data.",
    headshots: "map",
  },
  PROA: {
    code: "PROA",
    label: "Betclic Élite",
    inLabel: "the French Pro A",
    short: "Pro A",
    warm: { l: 0.5, c: 0.19, h: 295 },
    cool: { l: 0.52, c: 0.13, h: 155 },
    brand: { l: 0.5, c: 0.19, h: 295 },
    ...EURO_DEFAULTS,
    sourceCredit: "Underlying play-by-play is LNB Betclic Élite public data.",
  },
  GBL: {
    code: "GBL",
    label: "Greek Basket League",
    inLabel: "the Greek Basket League",
    short: "GBL",
    warm: { l: 0.5, c: 0.16, h: 340 },
    cool: { l: 0.58, c: 0.13, h: 210 },
    brand: { l: 0.58, c: 0.13, h: 210 },
    ...EURO_DEFAULTS,
    sourceCredit:
      "Underlying play-by-play is Greek Basket League public data.",
    headshots: "map",
  },
  BBL: {
    code: "BBL",
    label: "Basketball Bundesliga",
    inLabel: "the German BBL",
    short: "BBL",
    warm: { l: 0.68, c: 0.14, h: 85 },
    cool: COOL_BLUE,
    brand: { l: 0.68, c: 0.14, h: 85 },
    ...EURO_DEFAULTS,
    sourceCredit:
      "Underlying play-by-play is Basketball Bundesliga public data.",
  },
  ABA: {
    code: "ABA",
    label: "ABA Liga",
    inLabel: "the ABA Liga",
    short: "ABA",
    warm: { l: 0.5, c: 0.16, h: 330 },
    cool: { l: 0.53, c: 0.11, h: 180 },
    brand: { l: 0.53, c: 0.11, h: 180 },
    ...EURO_DEFAULTS,
    sourceCredit: "Underlying play-by-play is ABA Liga public data.",
    headshots: "map",
  },
  WNBA: {
    code: "WNBA",
    label: "WNBA",
    inLabel: "the WNBA",
    short: "WNBA",
    warm: { l: 0.55, c: 0.2, h: 25 },
    cool: { l: 0.5, c: 0.15, h: 250 },
    brand: { l: 0.55, c: 0.2, h: 25 },
    scaleMax: 18,
    court: "nba",
    sftaOnly: false,
    careerMinPoss: 300,
    boardMax: 500,
    boardStep: 25,
    refMinGames: 10,
    sourceCredit:
      "Underlying play-by-play is official stats.nba.com (WNBA) data.",
    headshots: "id",
  },
};

/**
 * Leagues that are live on the site — the toggle order and the data
 * files loaded on boot. A league moves here once its
 * data-{CODE}.json export exists in public/.
 */
export const ACTIVE_LEAGUES: League[] = [
  "NBA", "EL", "EUC", "ACB", "LBA", "BBL", "GBL", "ABA", "WNBA",
];

export const DEFAULT_LEAGUE: League = "NBA";

export function leagueDef(lg: League): LeagueDef {
  return LEAGUE_DEFS[lg];
}

export const LEAGUE_LABEL: Record<League, string> = Object.fromEntries(
  Object.values(LEAGUE_DEFS).map((d) => [d.code, d.label]),
) as Record<League, string>;

/** The wording for what the stat counts, per league build. */
export function ftNoun(lg: League): string {
  return LEAGUE_DEFS[lg].sftaOnly
    ? "shooting-foul free throws"
    : "drawn free throws";
}

export function oklchCss({ l, c, h }: Oklch): string {
  return `oklch(${l} ${c} ${h})`;
}
