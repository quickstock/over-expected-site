export type { League } from "./leagues";
export { LEAGUE_LABEL } from "./leagues";
import type { League } from "./leagues";

export interface LeaderboardRow {
  /** League-native id: EuroLeague person code ("P004194") or ACB license id. */
  id: string;
  name: string;
  season: string;
  pos: string | null;
  /** Teams the player finished possessions for, in first-appearance order. */
  teams: string[];
  poss: number;
  fta: number;
  xfta: number;
  ftaoe: number;
  per100: number;
  pct: number | null;
  /** Style-adjusted FTAOE per 100 (vs attack-profile baseline); null when
      tracking exposures are unavailable or below the qualify threshold. */
  sper100: number | null;
  spct: number | null;
}

/** One player-season in the shot-value suite (xFG% + xFTA -> points). */
export interface ShotValueRow {
  id: string;
  name: string;
  pos: string | null;
  teams: string[];
  fga: number;
  poss: number;
  /** Actual FG% (percent). */
  fgPct: number;
  /** Expected FG% from the calibrated, shooter-agnostic xFG% model. */
  xfgPct: number;
  /** Shot-making over expected: FG% - xFG%, percentage points. */
  makeOE: number;
  /** Shot-selection value: mean expected points per shot of the looks taken. */
  xptsShot: number;
  /** Shot-making in points: FG points over expected per 100 possessions. */
  fgPoe100: number;
  /** Season free-throw make rate, for valuing drawn FTs in the gap chart. */
  ftPct: number;
  /** Foul-drawing: FTAOE per 100 possessions (the live FTAOE board's unit). */
  ftaoe100: number;
  /** Combined points over expected per 100 possessions (the headline). */
  poe100: number;
  /** Domestic leagues only: projected EuroLeague shot-making (pp) and the
      range 80% of players land in (build_translation.py). */
  elProj?: number;
  elLo?: number;
  elHi?: number;
  /** When he also played EuroLeague that season: his actual shot-making there. */
  elActual?: number;
  elFga?: number;
}

export interface ZoneAgg {
  zone: string;
  area: string;
  n: number;
  share: number;
}

/**
 * Per game, in schedule order:
 * [actual drawn FTA, expected FTA, possessions, actual FG points,
 *  expected FG points, game id]. The FG points power the shot-value /
 * shot-making gap and form charts; absent in exports made before the suite
 * existed. The id links the line to its game page.
 */
export type GameLine = [number, number, number, number?, number?, string?];

/**
 * Shooting fouls itemized. FT counts by trip type; the identity
 * and1 + sf2 + sf3 === season actual FTA holds exactly by construction.
 */
export interface FoulBreakdown {
  /** FTs from and-1s (one per trip). */
  and1: number;
  /** FTs from fouled 2-pt misses (two per trip). */
  sf2: number;
  /** FTs from fouled 3-pt misses (three per trip). */
  sf3: number;
  /** And-1s with an officially located made shot (≤ and1). */
  located: number;
  /** Zones of located and-1 shots; shares sum to 1 over `located`. */
  zones: ZoneAgg[];
}

export interface SeasonDetail {
  games: GameLine[];
  zones: ZoneAgg[];
  /** Absent in exports made before the foul itemization existed. */
  fouls?: FoulBreakdown;
}

/** players-{season}.json: playerId -> detail. */
export type PlayerSeasonChunk = Record<string, SeasonDetail>;

export interface CalibrationBin {
  pred: number;
  actual: number;
  n: number;
}

/** Shooting-foul FTA per 100 possessions in one slice, against that slice's
    own league baseline. `per100` is the official, `lg` the league. */
export interface WhistleSplit {
  poss: number;
  /** Shooting-foul FTA per 100 possessions for this official in the slice. */
  per100: number;
  /** League per-100 baseline for the same slice (season + quarter/script). */
  lg: number;
  /** 90% interval on per100, from game-to-game noise in his games. */
  lo: number;
  hi: number;
}

/** An official against the expected whistle of the games he worked (what
    their players would draw from where they shot), per 100 possessions.
    `diff` is the raw figure; `est` is shrunk toward the league by the measured
    reliability, with its 90% interval. `est`/`lo`/`hi` are null where a league
    has too few officials to measure that (EuroCup, GBL). referees.py. */
export interface WhistleEstimate {
  diff: number;
  est: number | null;
  lo: number | null;
  hi: number | null;
}

/** One era's career for an official (the live seasons, or the archive's). */
export interface RefCareer extends WhistleEstimate {
  from: string;
  to: string;
  seasons: number;
  games: number;
}

export interface RefSeasonDetail extends WhistleEstimate {
  games: number;
  poss: number;
  fta: number;
  per100: number;
  lg: number;
  /** By quarter; "Q1".."Q4" plus "OT" when worked. */
  quarters: (WhistleSplit & { q: string })[];
  /** By final game script: "close" (<=5), "mid" (6-12), "blowout" (13+). */
  script: (WhistleSplit & { b: string; games: number })[];
}

export interface RefProfile {
  name: string;
  /** Seasons worked with >= 20 games, ascending. */
  seasons: string[];
  detail: Record<string, RefSeasonDetail>;
  /** Officials with two or more qualified seasons in an era. */
  careers: RefCareer[];
}

export interface SiteData {
  meta: {
    /** "EL" (EuroLeague) or "ACB" (Liga ACB). */
    league: League;
    seasons: string[];
    /** Latest season with >= 50 qualified players; the UI's default. */
    defaultSeason: string;
    qualifyPossessions: number;
    nPossessions: number;
    leagueRatePer100: number;
    leagueRateBySeason: Record<string, number>;
    modelLiftPct: number;
    foldLifts: { season: string; liftPct: number }[];
    /** League FT% (all free throws), used to value expected drawn FTs. */
    leagueFt: number;
    reliability: {
      fullSeasonR: number | null;
      yoyMeanR: number | null;
      yoyPairs: { pair: string; r: number; n: number }[];
      /** NBA export only: shrinkage constant shown in the methodology. */
      paddingK?: number;
    };
    /**
     * What the shot-diet baseline does and does not take out, measured by the
     * export on the qualified rows it ships. Height exists for the NBA,
     * EuroLeague and EuroCup only; tracking and the retired context baseline's
     * figures are NBA only.
     */
    confounds?: {
      /** FTAOE/100 vs the unadjusted free-throw rate per 100. */
      rawRateCorr: number;
      /** FTAOE/100 vs finisher height. */
      heightCorr: number | null;
      /** The raw rate vs height, for contrast. */
      rawHeightCorr: number | null;
      /** NBA: FTAOE/100 vs the tracking-based style-adjusted version. */
      trackingCorr?: number;
      /** NBA: the retired context baseline's raw-rate and height r. */
      contextRawRateCorr?: number;
      contextHeightCorr?: number;
    };
    /** Domestic leagues: how the EuroLeague projection is built and how well
        it predicted out of sample (build_translation.py). */
    translation?: {
      K: number;
      minFga: number;
      nPairs: number;
      nLeaguePairs: number;
      step: number;
      steps: Partial<Record<League, number>>;
      oosRmse: number;
      flatRmse: number;
      naiveRmse: number;
      rangeLo: number;
      rangeHi: number;
      moversN: number;
      moversRmse: number;
      moversFlatRmse: number;
    };
    /** A league with an archive era (the NBA's 1997-98 to 2019-20) lists what
        data-{CODE}-archive.json holds, so a page knows when to load it:
        its seasons, the seasons with officials, every player with a qualified
        archive season as [id, name, latest such season], and every official
        with an archive profile. `loaded` is set once it has been merged in
        (lib/archive.ts). */
    archive?: {
      seasons: string[];
      refSeasons: string[];
      players: [string, string, string][];
      refs: string[];
      loaded?: true;
    };
    /** The referee views' measured reliability (odd vs even games for a
        season and for the quarter/script leans, odd vs even seasons for a
        career) and true spread (SD per 100), from referees.py. Null where a
        league has too few officials to measure it. */
    referees?: {
      qualifyGames: number;
      reliability: {
        season: number | null;
        career: number | null;
        quarters: number | null;
        script: number | null;
      };
      /** Drawn free throws per 100 over every possession, by season: the pool
          each official's raw rate is measured on. */
      league: Record<string, number>;
      spread: { season: number | null; career: number | null };
    };
    /** League free throws per attempt by zone, per season: the baseline. */
    dietRates?: Record<string, { rim: number; paint: number; mid: number; three: number }>;
  };
  leaderboard: LeaderboardRow[];
  distributions: Record<string, number[]>;
  leagueZones: Record<string, { zone: string; area: string; share: number }[]>;
  calibration: CalibrationBin[];
  /** Per season: qualified officials, sorted by est (diff where est is null). */
  referees: Record<
    string,
    ({ id: string; name: string; games: number; per100: number } & WhistleEstimate)[]
  >;
  /** Per-official profile, keyed by official id (string). */
  refProfiles: Record<string, RefProfile>;
  /** Per season: qualified player-seasons in the shot-value suite. */
  shotValue: Record<string, ShotValueRow[]>;
  /** Per season: 30 teams, FTAOE/100 drawn (offense) and conceded (defense). */
  teams: Record<string, TeamRow[]>;
}

/** One team-season: shooting fouls drawn (offense) and conceded (defense),
    plus the team-level shot-value suite. */
export interface TeamRow {
  team: string;
  poss: number;
  /** FTAOE/100 the offense draws. */
  drawn: number;
  /** FTAOE/100 the defense concedes. */
  conceded: number;
  /** Shot value: expected points of the looks generated per 100 possessions,
      vs the season's possession-weighted league mean. Null only when the
      export predates the field or the team-season is missing upstream. */
  sv100?: number | null;
  /** Shot-making: FG points over expected per 100 possessions, vs the
      season's league mean. */
  make100?: number | null;
}

/* ---------------------------------------------------------------- */
/* Platform layer 1: Lineups / RAPM (rapm-{LG}.json + lineup chunks)  */
/* ---------------------------------------------------------------- */

/** One player-season of regularized adjusted plus-minus. `net = o + d`;
    D is signed positive = good defense (points prevented / 100). The `*P`
    fields are the box-prior-informed variant (the default display); the
    bare fields are plain ridge. `se*` are shrinkage-aware approximate SEs. */
export interface RapmRow {
  id: string;
  name: string;
  teams: string[];
  possOff: number;
  possDef: number;
  o: number;
  d: number;
  net: number;
  oP: number;
  dP: number;
  netP: number;
  seO: number;
  seD: number;
  /** SE of net, combining both sides assuming independence (approximate). */
  seNet: number;
  /** Approximate 95% interval on netP — NOT a posterior credible interval.
      See meta.intervals for exactly what it is and is not. */
  netCi: [number, number];
  /** Tier assigned from interval overlap, computed in the export so a UI
      change cannot turn tiers back into ranks. 1 is best. Players sharing a
      tier are not distinguishable at 95%. */
  tier: number;
}

/** One 5-man lineup-season. `net100` actual; `exp100` = sum of members'
    prior-informed O+D RAPM; `synergy100 = net100 - exp100`. `sqSynergy` =
    on-court xPts/shot minus members' mean individual xPts/shot (shot-quality
    synergy from the OE primitive); null when shot coverage is too thin. */
export interface LineupRow {
  lineupId: string;
  playerIds: string[];
  players: string[];
  team: string;
  poss: number;
  net100: number;
  exp100: number;
  synergy100: number;
  sqSynergy: number | null;
}

/** One player-season of production and (where salaries exist) contract value.
    `net` is prior-informed RAPM per 100 — this layer substitutes it for BPM,
    which would have to come from a source the pipeline forbids. `war` is wins
    over replacement. The three dollar fields are null whenever no salary file
    was present at export: never zero, never invented. */
export interface ValueRow {
  id: string;
  name: string;
  teams: string[];
  poss: number;
  /** Share of his teams' possessions, summed across a midseason trade. */
  share: number;
  net: number;
  vorp: number;
  war: number;
  salary: number | null;
  value: number | null;
  surplus: number | null;
}

export interface ValueData {
  meta: {
    layer: "value";
    league: League;
    version: number;
    generated: string;
    seasons: string[];
    qualifyPoss: number;
    boardMax: number;
    boardStep: number;
    /** Replacement level in points per 100 (-2.0, the BPM convention). */
    replacementPer100: number;
    winsPerVorp: number;
    /** Which impact metric stands in for BPM. */
    impactMetric: string;
    teamGames: Record<string, number>;
    /** Per season: was a salary file present at export time? */
    salaryAvailable: Record<string, boolean>;
    anySalary: boolean;
    costPerWin: Record<string, number>;
  };
  /** Per season, sorted by war desc. */
  players: Record<string, ValueRow[]>;
}

/** A season's homepage shot sample (shots-{LG}-{season}.json): parallel
    arrays, centimetres from the hoop (x across, y out from the baseline),
    and one "1"/"0" per shot for made/missed. */
export interface ShotSample {
  x: number[];
  y: number[];
  m: string;
}

export interface RapmData {
  meta: {
    layer: "lineups";
    league: League;
    version: number;
    generated: string;
    seasons: string[];
    qualifyPoss: number;
    boardMax: number;
    boardStep: number;
    lambda: Record<string, number>;
    cv: {
      season: string;
      lam: number;
      rmseRapm: number;
      rmsePriorSum: number | null;
      rmseHca: number;
    }[];
    collinear: {
      season: string;
      a: string;
      aName: string;
      b: string;
      bName: string;
      r: number;
      sharedPoss: number;
    }[];
    boxPriorR2: Record<string, { o: number | null; d: number | null }>;
    /** What the intervals are, and the approximations behind them. */
    intervals: {
      level: number;
      z: number;
      kind: string;
      note: string;
    };
    /** The tier rule, carried in the data rather than the UI. */
    tiering: { rule: string; why: string };
    /** Out-of-sample: half-season synergy vs next-half realized. r is null
        when too few paired lineups; the board renders whatever this says. */
    synergyOOS: { r: number | null; n: number; method: string };
    lineupFloorPoss: number;
    skippedGames: number;
    totalGames: number;
    gamesKept: number;
  };
  /** Per season, sorted by netP desc. */
  players: Record<string, RapmRow[]>;
  /** All-seasons pooled fit (season = "pooled"), for the career view. */
  pooled: RapmRow[];
  /** Per season, the board's lineup index (top by |synergy|). */
  lineups: Record<string, LineupRow[]>;
}

/** lineups-{LG}-{season}.json: lineupId -> per-game log.
    Each game: [gameId, possOff, possDef, ptsFor, ptsAgainst]. */
export type LineupChunk = Record<
  string,
  { games: [string, number, number, number, number][] }
>;

/* ---------------------------------------------------------------- */
/* Calibration layer (calibration-{LG}.json) — the credibility page.  */
/* Caveats travel WITH the numbers so the UI cannot drop one.         */
/* ---------------------------------------------------------------- */

export interface CalibrationComponent {
  reliability: (number | null)[];
  impliedR1?: (number | null)[];
  "attemptsFor0.5": number | null;
  "attemptsFor0.7": number | null;
}

export interface CalibrationData {
  meta: {
    layer: "calibration";
    league: League;
    version: number;
    generated: string;
    shotsAnalysed: number;
    leaguesInReliability: string[];
    commands: Record<string, string>;
  };
  number: {
    headline: string;
    rawCorrelation: number;
    rawCorrelationCI: [number, number];
    controlledBeta: number;
    controlledBetaCI: [number, number];
    controlledP: number;
    partialR2: number;
    n: number;
    players: number;
    opennessIndexSd: number;
    minimumDetectableEffect: number;
    caveat: string;
    clustering: string;
  };
  curve: {
    sweep: number[];
    byLeague: Record<string, {
      selection: CalibrationComponent;
      making: CalibrationComponent;
      ceilingRung: number | null;
      makingAtCeiling: number | null;
      selectionAtCeiling: number | null;
      note: string | null;
    }>;
    fixedPopulation: Record<string, {
      selection: CalibrationComponent;
      making: CalibrationComponent;
    }>;
    caveats: string[];
  };
  degradation: {
    rungs: {
      key: string; feed: string; nFeatures: number;
      logLoss: number; logLossVsFull: number; ece: number; auc: number;
      scale: string;
    }[];
    subsampleSize: number;
    endpointGap: { subsample: number; full: number };
    headline: string;
    caveats: string[];
  };
  limits: {
    noTracking: string;
    assistProxyDead: string;
    survivingProxies: string[];
    cornerEffectAlreadyPriced: string;
    pooledBaselineFault: string;
    predictiveValidity: string;
    noYouthData: string;
  };
}

/* ------------------------------------------------------------------ */
/* Layer 3 — coaching / decision expected-value (ETM)                  */

export interface CoachingTeamRow {
  team: string;
  teamId: string;
  decisions: number;
  /** Percentage points of win probability lost per decision. Lower is better;
      0 would mean always taking the higher-EV option. */
  etm: number;
  se: number;
  ci: [number, number];
  /** Overlap tier, 1 = closest to optimal. Teams in one tier are not
      distinguishable from each other, so the board must not rank within it. */
  tier: number;
}

export interface CoachingMarginRow {
  margin: number;
  n: number;
  /** Share of decisions where the three was the higher-EV option. */
  optimalThreeShare: number;
  /** Share where the team actually took the three. */
  choseThreeShare: number;
}

export interface CoachingData {
  meta: {
    layer: "coaching";
    league: League;
    version: number;
    generated: string;
    unit: string;
    lowerIsBetter: boolean;
    window: { period: number; maxSeconds: number; margins: number[] };
    shotSeconds: number;
    minDecisions: number;
    nDecisions: number;
    nTeams: number;
    aggregationLevel: string;
    whyNotTeamSeason: string;
    hindsightGuard: string;
    framing: string;
    approximations: string[];
    spread: {
      bestTeam: string;
      bestEtm: number;
      worstTeam: string;
      worstEtm: number;
      tiers: number;
    };
    distinguishableFromOptimal: { share: number; note: string };
    tiering: { rule: string; why: string };
  };
  margins: CoachingMarginRow[];
  teams: CoachingTeamRow[];
}

/* ------------------------------------------------------------------ */
/* Layer 4 — team defence (privileged, NBA only)                       */

export interface DefenseTeamRow {
  team: string;
  teamId: string;
  defPoss: number;
  shotsFaced: number;
  /** Expected points per shot faced vs league mean, signed so positive =
      forced worse shots. The most reliable pillar (SB 0.98). */
  qualityForced: number;
  qualityConceded: number;
  /** Rim attempts faced vs league, in percentage points, positive = fewer. */
  deterrence: number;
  rimRate: number;
  /** Points below expectation per 100 def. possessions. Noisiest (SB 0.72). */
  suppression: number;
  ptsAllowed100: number;
}

export interface DefensePillar {
  key: "qualityForced" | "deterrence" | "suppression";
  label: string;
  unit: string;
  spearmanBrown: number;
  note: string;
}

export interface DefenseData {
  meta: {
    layer: "defense";
    league: League;
    version: number;
    generated: string;
    privileged: true;
    leaguesUnavailable: string[];
    unavailableReason: string;
    aggregationLevel: string;
    seasons: string[];
    nTeamSeasons: number;
    /** Ordered by measured reliability; the board renders in this order. */
    pillars: DefensePillar[];
    reliability: Record<string, { halfR: number; spearmanBrown: number }> & {
      nTeamSeasons: number;
      minShotsPerHalf: number;
    };
    playerLevelRejected: { spearmanBrown: number; why: string };
    notModelled: string[];
    leagueCentred: string;
  };
  teams: Record<string, DefenseTeamRow[]>;
}

/** headshots-{LG}.json — the player-id -> photo-URL join for leagues whose CDN
    does not expose a URL derivable from the id. */
export interface HeadshotMap {
  meta: {
    league: string;
    source: string;
    generated: string;
    players: number;
    matched: number;
    coverage: number;
  };
  urls: Record<string, string>;
}

/** One player-game in the weekly shooting post (weekly-{week}.json). */
export interface WeeklyRow {
  id: string;
  name: string;
  team: string;
  opp: string;
  home: boolean;
  date: string;
  fgm: number;
  fga: number;
  /** Points scored from the field. */
  pts: number;
  /** What those shots were worth (xFG). */
  xpts: number;
  /** pts - xpts: field-goal points over expected. */
  oe: number;
  /** The game's id and season: with the league, the key of its game page. */
  gid?: string;
  season?: string;
}

/** A week's lists for one league: top 3 each way and games played. */
export interface WeeklyLeague {
  games: number;
  over: WeeklyRow[];
  under: WeeklyRow[];
}

/** weekly-{week}.json: every league's lists for one Monday-keyed week. */
export interface WeeklyWeek {
  week: string;
  leagues: Partial<Record<League, WeeklyLeague>>;
}

/** weekly-index.json: every published week, newest first, with its
    cross-league hottest and coldest game. */
export interface WeeklyIndex {
  weeks: {
    week: string;
    leagues: League[];
    games: number;
    best: WeeklyRow & { lg: League };
    worst: WeeklyRow & { lg: League };
  }[];
}

/** profiles.json: one row per player (his latest qualified season), for the
    cross-league similarity section. Row layout:
    [league, id, name, season, team, recent (0/1), vector, display], where
    display = [rim share, mid share, three share, shot-making pct (0-1),
    foul-drawing pct (0-1), FGA per 100 finished possessions]. */
export interface ProfilesFile {
  features: string[];
  weights: number[];
  test: { pairs: number; medianRank: number; medianField: number; top5: number; top10pct: number };
  rows: [League, string, string, string, string, 0 | 1, number[], number[]][];
}

/** One game in a season's index (games-{LG}-{season}.json). Home first in
    every pair. */
export interface GameIndexRow {
  id: string;
  /** ISO date. Null for the GBL, whose dates are interpolated, not published. */
  d: string | null;
  /** Monday-keyed week: which gameweek-{LG}-{week}.json holds this game's detail. */
  wk: string;
  /** Team ids and the labels the play-by-play used that game. */
  h: string;
  a: string;
  hl: string;
  al: string;
  /** Final score. */
  s: [number, number];
  /** Points the game's shots and free throws were worth. */
  x: [number, number];
  /** Home side's win share, whole percent. Null when `meta.winShare` is false. */
  w: number | null;
}

/** games-{LG}-{season}.json: every published game of one league-season. */
export interface GameIndex {
  meta: {
    league: League;
    season: string;
    /** False when the win share failed calibration and is withheld (`w` null). */
    winShare: boolean;
    /** Pooled expected calibration error of the win share. */
    ece: number;
    /** Games left out because their events did not rebuild the official final. */
    excluded: number;
    /** Games never played (awarded forfeits), skipped and not counted as excluded. */
    forfeits: number;
    games: number;
  };
  games: GameIndexRow[];
}

/** One game's detail inside a week chunk. Shots and free throws are columns:
    entry i of each array is one event, and `p` indexes into the game's `p`
    list, whose side (0 home, 1 away) is the event's side. */
export interface GameDetail {
  /** Players: [id, name, side, FGA, FG points, expected FG points, FTA, FTM]. */
  p: [string, string, 0 | 1, number, number, number, number, number][];
  s: {
    p: number[];
    /** Period: 1-4, then 5+ for overtimes. */
    q: number[];
    /** Seconds left in the period. */
    c: number[];
    /** Centimetres from the hoop (x across, y out from the baseline); null when unlocated. */
    x: (number | null)[];
    y: (number | null)[];
    /** One "1"/"0" per shot: made or missed. */
    m: string;
    /** One "2"/"3" per shot: its value. */
    v: string;
    /** xFG, in thousandths. */
    e: number[];
  };
  f: {
    p: number[];
    q: number[];
    c: number[];
    /** One "1"/"0" per free throw: made or missed. */
    m: string;
    /** The shooter's shrunk season FT%, in thousandths. */
    e: number[];
  };
  /** Officials: [id, name]. */
  r: [string, string][];
}

/** gameweek-{LG}-{week}.json: the week's games, keyed by game id. */
export interface GameWeek {
  games: Record<string, GameDetail>;
}
