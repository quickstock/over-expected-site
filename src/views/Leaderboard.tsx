import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useData, useLeague } from "../data";
import { ACTIVE_LEAGUES, LEAGUE_LABEL, type League } from "../leagues";
import {
  BOARD_LENSES,
  DEFAULT_BOARD_LENS,
  boardLensKey,
  boardLensSlug,
  boardPath,
  datedPart,
  type BoardLensKey,
} from "../routes";
import { useTitle } from "../lib/useTitle";
import SegmentedControl from "../components/SegmentedControl";
import FoulDrawingBoard from "./boards/FoulDrawingBoard";
import ShotValueBoard from "./boards/ShotValueBoard";

const LENS_LABEL: Record<BoardLensKey, { label: string; shortLabel: string }> = {
  value: { label: "Shot value", shortLabel: "Value" },
  making: { label: "Shot-making", shortLabel: "Making" },
  fouls: { label: "Foul-drawing", shortLabel: "Fouls" },
};
const LENS_TITLE: Record<BoardLensKey, string> = {
  value: "Shot value",
  making: "Shot-making",
  fouls: "Foul-drawing",
};

/**
 * The leaderboard, switchable across three lenses on the same player pool:
 * combined shot value (points over expected), shot-making only (FG points over
 * expected), and foul-drawing only (the original FTAOE board).
 *
 * League, season and lens are path segments, so every combination is its own
 * URL. Sort, direction, position and the possession floor stay query params:
 * they are how one reader looks at this page, not which page it is.
 */
export default function Leaderboard() {
  const { lg, season: seasonParam, lens: lensParam } = useParams();
  const data = useData();
  const { league } = useLeague();
  const navigate = useNavigate();

  const lensKey = boardLensKey(lensParam);
  const seasons = data.meta.seasons;

  // The evergreen (season-less) URL means the current season. The shot-value
  // lenses fall back to the latest season that actually carries shot-value
  // rows, which is what the board itself used to do; the foul-drawing lens
  // reads the leaderboard, which every season has. They agree today.
  const byseason = data.shotValue ?? {};
  const withSv = seasons.filter((s) => (byseason[s]?.length ?? 0) > 0);
  const currentSeason =
    lensKey === "fouls" || withSv.includes(data.meta.defaultSeason)
      ? data.meta.defaultSeason
      : withSv[withSv.length - 1] ?? data.meta.defaultSeason;

  const seasonValid = !seasonParam || seasons.includes(seasonParam);
  const season = seasonParam && seasonValid ? seasonParam : currentSeason;
  const leagueValid = !!lg && (ACTIVE_LEAGUES as string[]).includes(lg);

  useTitle(
    `${LENS_TITLE[lensKey ?? "value"]} · ${LEAGUE_LABEL[league]} ${season} · Over Expected`,
  );

  // Every hook above runs on every path, valid or not: bailing out earlier would
  // change the hook count between renders (the React #310 class of bug).
  if (!leagueValid || !lensKey) {
    return <Navigate to={boardPath(league, DEFAULT_BOARD_LENS)} replace />;
  }
  if (!seasonValid) {
    return <Navigate to={boardPath(lg as League, lensParam!)} replace />;
  }

  const go = (lensSlug: string, s: string) =>
    navigate(boardPath(league, lensSlug, datedPart(s, currentSeason)));

  const lensControl = (
    <SegmentedControl
      ariaLabel="Metric"
      options={BOARD_LENSES.map((l) => ({ value: l.slug, ...LENS_LABEL[l.key] }))}
      value={boardLensSlug(lensKey)}
      onChange={(slug) => go(slug, season)}
    />
  );
  const onSeason = (s: string) => go(boardLensSlug(lensKey), s);

  return lensKey === "fouls" ? (
    <FoulDrawingBoard lensControl={lensControl} season={season} onSeason={onSeason} />
  ) : (
    <ShotValueBoard
      lens={lensKey}
      lensControl={lensControl}
      season={season}
      onSeason={onSeason}
    />
  );
}
