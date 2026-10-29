/**
 * Folding an archive era into a league's live dataset.
 *
 * The NBA's 1997-98 to 2019-20 ships as data-NBA-archive.json, loaded the
 * first time a page asks for one of its seasons, players or officials (see
 * useArchive in data.tsx). Once merged, the league's SiteData simply has more
 * seasons, so every board, picker and player page works on it unchanged.
 *
 * What stays the live era's: the default season, the qualification floor, and
 * the model and reliability figures the methodology pages describe, because
 * those describe the live model. Calibration likewise. Everything keyed by
 * season, player or official is unioned.
 */
import type { SiteData } from "../types";

export function mergeArchive(live: SiteData, arch: SiteData): SiteData {
  const seasons = [...new Set([...arch.meta.seasons, ...live.meta.seasons])].sort();
  const refProfiles = { ...arch.refProfiles };
  for (const [id, p] of Object.entries(live.refProfiles)) {
    const a = refProfiles[id];
    refProfiles[id] = a
      ? {
          name: p.name,
          seasons: [...new Set([...a.seasons, ...p.seasons])].sort(),
          detail: { ...a.detail, ...p.detail },
          careers: [...a.careers, ...p.careers],
        }
      : p;
  }
  return {
    ...live,
    meta: {
      ...live.meta,
      archive: { ...live.meta.archive!, loaded: true },
      seasons,
      leagueRateBySeason: { ...arch.meta.leagueRateBySeason, ...live.meta.leagueRateBySeason },
      dietRates: { ...arch.meta.dietRates, ...live.meta.dietRates },
      // the live era's referee reliabilities, with both eras' league rates
      referees: live.meta.referees && {
        ...live.meta.referees,
        league: { ...arch.meta.referees?.league, ...live.meta.referees.league },
      },
    },
    leaderboard: [...arch.leaderboard, ...live.leaderboard],
    distributions: { ...arch.distributions, ...live.distributions },
    leagueZones: { ...arch.leagueZones, ...live.leagueZones },
    referees: { ...arch.referees, ...live.referees },
    refProfiles,
    shotValue: { ...arch.shotValue, ...live.shotValue },
    teams: { ...arch.teams, ...live.teams },
  };
}
