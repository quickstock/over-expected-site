import { useEffect, useRef, useState } from "react";
import { useData, useGameIndex, useLeague } from "../data";
import { LEAGUE_LABEL } from "../leagues";

/** The id the game pages' method links point at (/methodology#games). */
export const GAME_METHOD_ID = "games";

// Measured 2026-10-29 (docs/superpowers/plans/2026-10-29-game-pages.md, task 2b):
// the slope of the actual margin on the expected margin over every 2020-21 to
// 2026-27 game. Constants on purpose: no export carries them.
const MARGIN_SLOPE_NBA = 0.44;
const MARGIN_SLOPE_EL = 0.43;
/** The calibration bar the win share had to clear, set before it was measured
    (ECE_MAX in both pipelines' export_games.py). */
const ECE_BAR = 0.05;

/**
 * How the game pages are scored, for both methodology texts: what the shots
 * were worth, why the gap to the score is not a luck number, why no win share
 * is shown, and what the pages leave out. The calibration figure is the active
 * league's, read from its current season's games index (the file its games
 * list loads), fetched only once the section nears the viewport.
 */
export default function GameMethod() {
  const { league } = useLeague();
  const data = useData();
  const ref = useRef<HTMLElement>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    if (!ref.current || near) return;
    const io = new IntersectionObserver(
      (es) => es.some((e) => e.isIntersecting) && setNear(true),
      { rootMargin: "600px" },
    );
    io.observe(ref.current);
    return () => io.disconnect();
  }, [near]);
  const index = useGameIndex(league, near ? data.meta.defaultSeason : null);
  const label = LEAGUE_LABEL[league];

  return (
    <section ref={ref} id={GAME_METHOD_ID} className="scroll-mt-6">
      <h2 className="mt-14 font-display text-xl font-semibold tracking-tight text-ink sm:text-2xl">
        Game pages: what the shots were worth
      </h2>
      <div className="mt-4 space-y-4 text-[15px] leading-relaxed sm:text-base">
        <p>
          Every game has a page with its final score and what each side's
          shots were worth. Every field goal is priced by how often shots like
          it go in, with the same model as the shot-making lens, at two or
          three points. Every free throw is priced at the shooter's free-throw
          rate that season, pulled toward the league's rate so that a player
          with a handful of attempts is not priced at 0% or 100%. Fouls drawn
          count as they happened: a trip to the line enters as the free throws
          actually taken, not as an expected number of trips. Add it up for
          each side and that is what its shots were worth.
        </p>
        <p className="border-l-2 border-line pl-4 text-ink">
          The gap between the score and the shots' worth is not a luck number.
          Across the NBA's 2020-21 to 2026-27 games, the actual margin moves{" "}
          <span className="font-mono tnum">{MARGIN_SLOPE_NBA.toFixed(2)}</span>{" "}
          points for every point by which one side's shots were worth more (
          <span className="font-mono tnum">{MARGIN_SLOPE_EL.toFixed(2)}</span>{" "}
          in EuroLeague). If the shots' worth were the score with the luck taken
          out, the two would move about one for one. Two things hold it down.
          Misses create putbacks: an offensive rebound brings another attempt
          and adds its expected points, so a side that shoots badly piles up
          expected points from its own misses. And a team that falls behind
          takes more shots and draws more free throws, so the trailing side's
          total grows with the deficit. Read the two numbers side by side, as
          what happened and what the attempts were worth, not as a corrected
          score.
        </p>
        <p>
          There is no "these shots win N in 100" figure. It was built: replay
          each game's shots and free throws ten thousand times and count how
          often each side comes out ahead. It did not pass its calibration test
          {index.status === "error" ? (
            ", so it is not shown."
          ) : (
            <>
              : in {label} games its calibration error is{" "}
              {/* Same width while the index loads, so nothing reflows. */}
              <span className={`font-mono tnum ${index.status === "ready" ? "" : "invisible"}`}>
                {index.status === "ready" ? index.data.meta.ece.toFixed(3) : "0.000"}
              </span>
              , against a bar of{" "}
              <span className="font-mono tnum">{ECE_BAR.toFixed(2)}</span> set
              before it was measured, so it is not shown.
            </>
          )}
        </p>
        <p>
          A few things the game pages state rather than hide. The Greek Basket
          League's game dates are estimated, not published, so its games show
          no date and are numbered in season order. A game whose play-by-play
          does not add up to the official final score is left out, and each
          league's games list counts them, along with forfeits, which were
          never played. Shots the feed recorded without a court location count
          in every total but cannot be drawn on the shot map.
        </p>
      </div>
    </section>
  );
}
