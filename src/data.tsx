import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  LineupChunk,
  PlayerSeasonChunk,
  RapmData,
  CalibrationData,
  SiteData,
  ValueData,
} from "./types";
import {
  ACTIVE_LEAGUES,
  DEFAULT_LEAGUE,
  type League,
} from "./leagues";
import { setLeagueTheme } from "./lib/color";

export const LEAGUES: League[] = ACTIVE_LEAGUES;

interface DataStore {
  all: Partial<Record<League, SiteData>>;
  league: League;
  setLeague: (lg: League) => void;
}

const DataContext = createContext<DataStore | null>(null);

const LS_KEY = "oe-league";

function initialLeague(): League {
  const saved = localStorage.getItem(LS_KEY) as League | null;
  return saved && ACTIVE_LEAGUES.includes(saved) ? saved : DEFAULT_LEAGUE;
}

export function DataProvider({ children }: { children: ReactNode }) {
  const [all, setAll] = useState<Partial<Record<League, SiteData>> | null>(
    null,
  );
  const [error, setError] = useState(false);
  const [league, setLeagueState] = useState<League>(initialLeague);

  const setLeague = (lg: League) => {
    setLeagueState(lg);
    localStorage.setItem(LS_KEY, lg);
  };

  useEffect(() => {
    Promise.all(
      ACTIVE_LEAGUES.map((lg) =>
        fetch(`${import.meta.env.BASE_URL}data-${lg}.json`).then((r) => {
          if (!r.ok) throw new Error(`${r.status}`);
          return r.json() as Promise<SiteData>;
        }),
      ),
    )
      .then((sets) => {
        const map: Partial<Record<League, SiteData>> = {};
        ACTIVE_LEAGUES.forEach((lg, i) => (map[lg] = sets[i]));
        setAll(map);
      })
      .catch(() => setError(true));
  }, []);

  // Set the diverging-color poles for the active league before any chart
  // consumer renders this pass.
  setLeagueTheme(league);

  const store = useMemo(
    () => (all ? { all, league, setLeague } : null),
    [all, league],
  );

  if (error) {
    return (
      <div className="mx-auto max-w-xl px-6 py-32 text-center font-display">
        <p className="text-2xl font-semibold">The data failed to load.</p>
        <p className="mt-3 text-ink-soft">
          Refresh the page. If it keeps happening, the data export is missing.
        </p>
      </div>
    );
  }

  if (!store) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-24" aria-busy="true">
        <div className="h-10 w-72 animate-pulse rounded bg-wash" />
        <div className="mt-6 h-64 animate-pulse rounded bg-wash" />
        <div className="mt-6 h-40 animate-pulse rounded bg-wash" />
      </div>
    );
  }

  return <DataContext.Provider value={store}>{children}</DataContext.Provider>;
}

function useStore(): DataStore {
  const store = useContext(DataContext);
  if (!store) throw new Error("useData outside DataProvider");
  return store;
}

/** The active league's dataset — existing views read this untouched. */
export function useData(): SiteData {
  const { all, league } = useStore();
  return all[league]!;
}

/** A specific league's dataset (player pages, cross-league compare). */
export function useLeagueData(lg: League): SiteData | undefined {
  return useStore().all[lg];
}

/** Active league code + setter (the Nav toggle). */
export function useLeague(): {
  league: League;
  setLeague: (lg: League) => void;
} {
  const { league, setLeague } = useStore();
  return { league, setLeague };
}

/** Every loaded league's dataset (search, cross-league lookup). */
export function useAllData(): Partial<Record<League, SiteData>> {
  return useStore().all;
}

/* ------------------------------------------------------------------ */
/* Per-league, per-season player detail, fetched on demand and cached  */
/* for the session. One file per league-season keeps the load small.   */
/* ------------------------------------------------------------------ */

const chunkCache = new Map<string, PlayerSeasonChunk>();
const chunkPromises = new Map<string, Promise<PlayerSeasonChunk>>();

function fetchChunk(key: string): Promise<PlayerSeasonChunk> {
  const cached = chunkPromises.get(key);
  if (cached) return cached;
  const p = fetch(`${import.meta.env.BASE_URL}players-${key}.json`)
    .then((r) => {
      if (!r.ok) throw new Error(`${r.status}`);
      return r.json() as Promise<PlayerSeasonChunk>;
    })
    .then((chunk) => {
      chunkCache.set(key, chunk);
      return chunk;
    })
    .catch((e) => {
      chunkPromises.delete(key); // allow retry on next mount
      throw e;
    });
  chunkPromises.set(key, p);
  return p;
}

export type ChunkState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; chunk: PlayerSeasonChunk };

export function usePlayerChunk(
  season: string | null,
  league: League,
): ChunkState {
  const key = season ? `${league}-${season}` : null;
  const [, bump] = useState(0);

  useEffect(() => {
    if (!key || chunkCache.has(key)) return;
    let alive = true;
    fetchChunk(key)
      .catch(() => undefined)
      .finally(() => {
        if (alive) bump((n) => n + 1);
      });
    return () => {
      alive = false;
    };
  }, [key]);

  if (!key) return { status: "loading" };
  const chunk = chunkCache.get(key);
  if (chunk) return { status: "ready", chunk };
  if (chunkPromises.has(key)) return { status: "loading" };
  return { status: "error" };
}

/* ------------------------------------------------------------------ */
/* Platform-layer JSON, fetched on route entry (never at boot), same   */
/* session-cache pattern as player chunks. One file per league.        */
/* ------------------------------------------------------------------ */

const layerCache = new Map<string, unknown>();
const layerPromises = new Map<string, Promise<unknown>>();

function fetchLayer<T>(file: string): Promise<T> {
  const cached = layerPromises.get(file) as Promise<T> | undefined;
  if (cached) return cached;
  const p = fetch(`${import.meta.env.BASE_URL}${file}`)
    .then((r) => {
      if (!r.ok) throw new Error(`${r.status}`);
      return r.json() as Promise<T>;
    })
    .then((data) => {
      layerCache.set(file, data);
      return data;
    })
    .catch((e) => {
      layerPromises.delete(file); // allow retry on next mount
      throw e;
    });
  layerPromises.set(file, p);
  return p;
}

function useLayerFile<T>(file: string | null): {
  status: "loading" | "error" | "ready";
  data?: T;
} {
  const [, bump] = useState(0);
  useEffect(() => {
    if (!file || layerCache.has(file)) return;
    let alive = true;
    fetchLayer<T>(file)
      .catch(() => undefined)
      .finally(() => {
        if (alive) bump((n) => n + 1);
      });
    return () => {
      alive = false;
    };
  }, [file]);

  if (!file) return { status: "loading" };
  const data = layerCache.get(file) as T | undefined;
  if (data) return { status: "ready", data };
  if (layerPromises.has(file)) return { status: "loading" };
  return { status: "error" };
}

export type RapmState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; data: RapmData };

/** The active/explicit league's RAPM dataset (rapm-{LG}.json). */
export function useRapm(league: League): RapmState {
  const r = useLayerFile<RapmData>(`rapm-${league}.json`);
  if (r.status === "ready") return { status: "ready", data: r.data! };
  return { status: r.status };
}

export type CalibrationState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; data: CalibrationData };

/** The calibration deliverables. One artifact, NBA-derived, shown on every
    league's route because the limits it states are platform-wide. */
export function useCalibration(): CalibrationState {
  const r = useLayerFile<CalibrationData>("calibration-NBA.json");
  if (r.status === "ready") return { status: "ready", data: r.data! };
  return { status: r.status };
}

export type ValueState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; data: ValueData };

/** The league's value/surplus dataset (value-{LG}.json). */
export function useValue(league: League): ValueState {
  const r = useLayerFile<ValueData>(`value-${league}.json`);
  if (r.status === "ready") return { status: "ready", data: r.data! };
  return { status: r.status };
}

export type LineupChunkState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; chunk: LineupChunk };

/** One league-season's per-lineup game logs (lineups-{LG}-{season}.json). */
export function useLineupChunk(
  league: League,
  season: string | null,
): LineupChunkState {
  const file = season ? `lineups-${league}-${season}.json` : null;
  const r = useLayerFile<LineupChunk>(file);
  if (r.status === "ready") return { status: "ready", chunk: r.data! };
  return { status: r.status };
}
