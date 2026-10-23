import { useData, useLeague } from "../data";
import { LEAGUE_LABEL, type CalibrationBin } from "../types";
import { int } from "../lib/format";
import { useMeasure } from "../lib/useMeasure";
import { useTitle } from "../lib/useTitle";

/**
 * Calibration of the FTAOE baseline: qualified player-seasons in deciles of
 * expected drawn free throws per possession (shot diet), against actual. Neutral ink only; this chart is not FTAOE,
 * so the diverging encoding stays out of it.
 */
function CalibrationChart({ bins }: { bins: CalibrationBin[] }) {
  const [wrapRef, width] = useMeasure<HTMLDivElement>();
  const size = Math.min(width, 420);
  const pad = { top: 16, right: 16, bottom: 44, left: 44 };

  const values = bins.flatMap((b) => [b.pred, b.actual]);
  const lo = Math.min(...values) - 0.004;
  const hi = Math.max(...values) + 0.004;
  const inner = size - pad.left - pad.top;
  const innerH = size - pad.top - pad.bottom;
  const x = (v: number) =>
    pad.left + ((v - lo) / (hi - lo)) * (size - pad.left - pad.right);
  const y = (v: number) => pad.top + innerH - ((v - lo) / (hi - lo)) * innerH;

  // every 5 per 100 inside the domain
  const ticks: number[] = [];
  for (let t = Math.ceil(lo * 20) / 20; t <= hi; t += 0.05) {
    ticks.push(Math.round(t * 1000) / 1000);
  }

  return (
    <div ref={wrapRef} className="max-w-[420px]">
      {width > 0 && inner > 0 && (
        <svg
          width={size}
          height={size}
          role="img"
          aria-label="Calibration: expected vs actual drawn free throws per 100 possessions, qualified player-seasons in deciles of expected."
        >
          {/* y = x reference */}
          <line
            x1={x(lo)}
            y1={y(lo)}
            x2={x(hi)}
            y2={y(hi)}
            stroke="var(--color-line)"
            strokeWidth={1}
            strokeDasharray="3 4"
          />
          <text
            x={x(hi) - 4}
            y={y(hi) + 12}
            textAnchor="end"
            fontSize={10.5}
            fill="var(--color-ink-faint)"
            className="font-mono"
          >
            perfect calibration
          </text>

          {ticks.map((t) => (
            <g key={t} className="font-mono tnum" fontSize={10.5}>
              <line
                x1={x(t)}
                x2={x(t)}
                y1={pad.top + innerH}
                y2={pad.top + innerH + 4}
                stroke="var(--color-line)"
              />
              <text
                x={x(t)}
                y={pad.top + innerH + 17}
                textAnchor="middle"
                fill="var(--color-ink-faint)"
              >
                {(t * 100).toFixed(0)}
              </text>
              <line
                x1={pad.left - 4}
                x2={pad.left}
                y1={y(t)}
                y2={y(t)}
                stroke="var(--color-line)"
              />
              <text
                x={pad.left - 8}
                y={y(t) + 3.5}
                textAnchor="end"
                fill="var(--color-ink-faint)"
              >
                {(t * 100).toFixed(0)}
              </text>
            </g>
          ))}

          <text
            x={pad.left + (size - pad.left - pad.right) / 2}
            y={size - 6}
            textAnchor="middle"
            fontSize={11}
            fill="var(--color-ink-soft)"
            className="font-mono"
          >
            expected FTA per 100 poss
          </text>
          <text
            x={12}
            y={pad.top + innerH / 2}
            textAnchor="middle"
            fontSize={11}
            fill="var(--color-ink-soft)"
            className="font-mono"
            transform={`rotate(-90 12 ${pad.top + innerH / 2})`}
          >
            actual
          </text>

          {bins.map((b, i) => (
            <circle
              key={i}
              cx={x(b.pred)}
              cy={y(b.actual)}
              r={4}
              fill="var(--color-ink)"
            >
              <title>{`decile ${i + 1}: expected ${(b.pred * 100).toFixed(1)}, actual ${(b.actual * 100).toFixed(1)} per 100 (${int(b.n)} player-seasons)`}</title>
            </circle>
          ))}
        </svg>
      )}
    </div>
  );
}

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mt-14 font-display text-xl font-semibold tracking-tight text-ink sm:text-2xl">
      {children}
    </h2>
  );
}

export default function MethodologyEuro() {
  const data = useData();
  const { league } = useLeague();
  useTitle("Methodology · Over Expected");
  const { meta, calibration } = data;
  const seasons = meta.seasons;

  const calLo = calibration[0];
  const calHi = calibration[calibration.length - 1];
  const spreadPer100 = ((calHi.pred - calLo.pred) * 100).toFixed(1);
  const c = meta.confounds;
  const rates = meta.dietRates ?? {};
  // the provisional season's few games give noisy rates; stop at the default
  const rateSeasons = seasons.filter((s) => rates[s] && s <= meta.defaultSeason);
  const yoyN = meta.reliability.yoyPairs.length
    ? Math.round(
        meta.reliability.yoyPairs.reduce((a, p) => a + p.n, 0) /
          meta.reliability.yoyPairs.length,
      )
    : 0;

  return (
    <article className="mx-auto max-w-2xl px-5 py-12 sm:px-8 sm:py-16">
      <h1 className="font-display text-3xl font-bold tracking-tight text-ink sm:text-5xl">
        Methodology
      </h1>
      <p className="mt-4 text-base leading-relaxed text-ink-soft sm:text-lg">
        FTAOE, free throw attempts over expected, is how many free throws a
        player draws per 100 possessions beyond what his shot locations
        predict. FTAOE = actual FTA minus expected FTA, where expected is what
        a league-average player would have drawn from the same shots; the
        per-100 version divides by the possessions a player finished. Everything on this page is
        computed separately for each league; models are never pooled across
        them. You are reading the{" "}
        {LEAGUE_LABEL[league]} numbers.
      </p>

      <H2>What counts as a drawn free throw</H2>
      <div className="mt-4 space-y-4 text-[15px] leading-relaxed sm:text-base">
        <p>
          Free throws from personal fouls count: and-1s, fouled misses (two
          or three attempts), and bonus free throws once the defense is over
          the team-foul limit. Technical, unsportsmanlike, and bench fouls
          are excluded. Attempts are attributed to the player who finished
          the possession, meaning the one who went to the line.
        </p>
        <p>
          This is one deliberate difference from the NBA version of this
          system, which counted shooting fouls only. FIBA play-by-play types
          each foul by the free throws it awards, not by shooting versus
          penalty, and once a team is in the bonus a two-shot trip is
          genuinely ambiguous between the two. Rather than guess, the stat
          here is the cleaner-defined one: free throws drawn from regular
          play. The FIBA bonus itself is handled on the other side of the
          ledger, as a feature of the expectation model, so a player is not
          credited merely for playing minutes deep in penalty situations.
        </p>
        <p>
          The data is possession-level play-by-play:{" "}
          <span className="font-mono tnum">{int(meta.nPossessions)}</span>{" "}
          possessions across {int(seasons.length)} seasons, {seasons[0]} to{" "}
          {seasons[seasons.length - 1]}, regular season only. Each
          possession's target is the number of drawn free throws it produced
          (almost always 0, occasionally 1, 2 or 3).
        </p>
      </div>

      <H2>Why per possession</H2>
      <div className="mt-4 space-y-4 text-[15px] leading-relaxed sm:text-base">
        <p>
          A fouled miss is not a charged field-goal attempt and has no shot
          location in the play-by-play. Any per-shot rate therefore silently
          drops the exact events this stat is made of, and punishes the
          players who draw the most fouls. Possessions don't have that
          problem: every trip ends somewhere, fouled or not. So the rate is
          per possession, and the leaderboard's unit is FTAOE per 100
          possessions.
        </p>
      </div>

      <H2>The baseline</H2>
      <div className="mt-4 space-y-4 text-[15px] leading-relaxed sm:text-base">
        <p>
          Expected FTA is what a league-average player would have drawn from
          the same shots. Every attempt goes into one of four zones (at the
          rim, the rest of the paint, mid-range, three), each zone carries the
          league's free throws per attempt for that season with the player's
          own attempts left out, and expected FTA is his attempts in each
          zone times that zone's rate. Fouled misses are not charged
          field-goal attempts, so they go back in: a three-shot trip is a
          three-point attempt, a two-shot trip is spread across his two-point
          zones by how often he shoots there and how often and-1s happen
          there. Each season is scaled so league expected equals league
          actual, which keeps FTAOE a within-season comparison.
        </p>
        {rateSeasons.length > 0 && (
          <table className="mt-2 w-full max-w-md border-collapse text-sm">
            <caption className="pb-2 text-left text-xs text-ink-faint">
              League free throws per attempt, by zone
            </caption>
            <thead>
              <tr className="border-b border-line text-left">
                {["Season", "Rim", "Paint", "Mid", "Three"].map((h) => (
                  <th
                    key={h}
                    scope="col"
                    className="py-2 pr-4 font-display text-[11px] font-medium uppercase tracking-wider text-ink-faint"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rateSeasons.map((s) => (
                <tr key={s} className="border-b border-line-soft">
                  <th scope="row" className="py-2 pr-4 text-left font-mono font-normal tnum">
                    {s}
                  </th>
                  {(["rim", "paint", "mid", "three"] as const).map((z) => (
                    <td key={z} className="py-2 pr-4 font-mono tnum">
                      {rates[s][z].toFixed(3)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p>
          One limit is specific to the European feeds and stated plainly. FIBA
          play-by-play records a two-shot trip without saying whether it came
          from a foul on a missed shot or from the team-foul bonus, so bonus
          free throws count as fouled two-point attempts here. That inflates
          the rate at the rim and tilts the expectation slightly against tall
          finishers
          {c?.heightCorr != null && (
            <>
              {" "}(correlation with height{" "}
              <span className="font-mono tnum">{c.heightCorr.toFixed(2)}</span>{" "}
              in this league)
            </>
          )}
          . Splitting the bonus trips out was measured and rejected: the
          bonus half then goes unadjusted, and FTAOE falls back to roughly
          the raw free-throw rate.
        </p>
        <p className="border-l-2 border-line pl-4 text-ink">
          Why the baseline changed. Until October 2026 the expectation came
          from game context (clock, margin, the real FIBA bonus, home court,
          opponent and crew rates). Out-of-fold it reduced Poisson deviance
          by{" "}
          <span className="font-mono tnum">
            {meta.modelLiftPct.toFixed(2)}%
          </span>{" "}
          against the plain league rate, which left FTAOE close to the raw
          free-throw rate. Where a player shoots separates his free throws far
          better
          {c && (
            <>
              : FTAOE now correlates{" "}
              <span className="font-mono tnum">{c.rawRateCorr.toFixed(2)}</span>{" "}
              with the raw rate
            </>
          )}
          . The context model still sits behind the team and referee views.
        </p>
      </div>

      <H2>Calibration</H2>
      <div className="mt-4 space-y-4 text-[15px] leading-relaxed sm:text-base">
        <p>
          Qualified player-seasons binned into deciles by expected free
          throws per 100, expected against actual:
        </p>
        <CalibrationChart bins={calibration} />
        <p>
          Each dot is about{" "}
          <span className="font-mono tnum">{int(calibration[0].n)}</span>{" "}
          player-seasons. From the lowest decile to the highest, expected
          spans{" "}
          <span className="font-mono tnum">{spreadPer100}</span> free throws
          per 100 and actual follows it, so the baseline tells a rim-heavy
          diet from a perimeter one before the gap above it is read. Actual
          runs a little flatter than expected at both ends: the zone rates
          slightly over-separate the extremes, most likely the bonus trips
          described above, which is why this is a ranking of players within
          a league and not a precise count.
        </p>
      </div>

      {meta.translation && (
        <>
          <H2>From {LEAGUE_LABEL[league]} to EuroLeague</H2>
          <div className="mt-4 space-y-4 text-[15px] leading-relaxed sm:text-base">
            <p>
              Shot-making over expected is measured against each league's own
              expected-FG model, so a +3 here and a +3 in EuroLeague are not the
              same thing. EuroLeague clubs also play their domestic leagues, so
              the same player, in the same season, has a number in both:{" "}
              <span className="font-mono tnum">{int(meta.translation.nPairs)}</span>{" "}
              such pairs across five leagues, players matched by name with at
              least{" "}
              <span className="font-mono tnum">{meta.translation.minFga}</span>{" "}
              attempts on each side.
            </p>
            <p>
              The projection on each player page trusts his domestic figure in
              proportion to his attempts, attempts / (attempts +{" "}
              {meta.translation.K}), then adds the league's step to EuroLeague.
              Fitting a free slope instead gave 1.09, so what is trusted carries
              over one for one; the 300 was the best of a grid on the test below.
            </p>
            <table className="mt-2 w-full max-w-sm border-collapse text-sm">
              <caption className="pb-2 text-left text-xs text-ink-faint">
                Step to EuroLeague shot-making, points of FG%
              </caption>
              <tbody>
                {Object.entries(meta.translation.steps)
                  .sort((x, y) => (y[1] ?? 0) - (x[1] ?? 0))
                  .map(([lg, v]) => (
                    <tr key={lg} className="border-b border-line-soft">
                      <th scope="row" className="py-2 pr-4 text-left font-normal">
                        {LEAGUE_LABEL[lg as keyof typeof LEAGUE_LABEL]}
                      </th>
                      <td className="py-2 font-mono tnum">{(v ?? 0).toFixed(1)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
            <p>
              Tested on seasons it never saw, the projection misses by{" "}
              <span className="font-mono tnum">{meta.translation.oosRmse.toFixed(2)}</span>{" "}
              points on average, against{" "}
              <span className="font-mono tnum">{meta.translation.flatRmse.toFixed(2)}</span>{" "}
              for assuming a league-average EuroLeague shooter and{" "}
              <span className="font-mono tnum">{meta.translation.naiveRmse.toFixed(2)}</span>{" "}
              for assuming he shoots the same. On the{" "}
              <span className="font-mono tnum">{meta.translation.moversN}</span>{" "}
              players who moved from a domestic league to EuroLeague the next
              season, it misses by{" "}
              <span className="font-mono tnum">{meta.translation.moversRmse.toFixed(2)}</span>{" "}
              against{" "}
              <span className="font-mono tnum">{meta.translation.moversFlatRmse.toFixed(2)}</span>
              . The pipeline refuses to publish it if it ever stops beating the
              league-average answer.
            </p>
            <p className="border-l-2 border-line pl-4 text-ink">
              Read it as a direction, not a forecast. Eighty percent of players
              land between{" "}
              <span className="font-mono tnum">{meta.translation.rangeLo.toFixed(1)}</span>{" "}
              and{" "}
              <span className="font-mono tnum">+{meta.translation.rangeHi.toFixed(1)}</span>{" "}
              points of their projection, mostly because one EuroLeague season of
              shots is itself noisy. It also only sees players good enough to be
              signed, and it says nothing about role: a domestic star's shots
              change when he comes off the bench.
            </p>
          </div>
        </>
      )}

      <H2>How stable is it</H2>
      <div className="mt-4 space-y-4 text-[15px] leading-relaxed sm:text-base">
        <p>
          Splitting every qualified player-season into odd and even games
          and comparing the two halves puts FTAOE/100's full-season
          reliability at{" "}
          <span className="font-mono tnum">
            {(meta.reliability.fullSeasonR ?? 0).toFixed(2)}
          </span>
          . Season over season it repeats at{" "}
          <span className="font-mono tnum">
            r = {(meta.reliability.yoyMeanR ?? 0).toFixed(2)}
          </span>{" "}
          on average across {meta.reliability.yoyPairs.length} consecutive season pairs (
          {meta.reliability.yoyPairs.map((p, i) => (
            <span key={p.pair} className="font-mono tnum">
              {p.r.toFixed(2)}
              {i < meta.reliability.yoyPairs.length - 1 ? ", " : ""}
            </span>
          ))}
          ), roughly {int(yoyN)} repeat players per pair. Foul-drawing is a
          skill, not noise.
        </p>
        <p>
          Both numbers run below their NBA equivalents (0.91 and 0.85), and
          the reason is sample size, not the method: a European regular
          season is 34–38 rounds against the NBA's 82 games, so a
          player-season here is roughly a third of the possessions. That is
          also why the qualification floor is{" "}
          <span className="font-mono tnum">
            {int(meta.qualifyPossessions)}
          </span>{" "}
          finisher-possessions rather than the NBA build's 300. Treat
          single-season rates accordingly: the ordering at the top of the
          board is real, small gaps between neighbors are not.
        </p>
      </div>

      <H2>No tracking data, no style adjustment</H2>
      <div className="mt-4 space-y-4 text-[15px] leading-relaxed sm:text-base">
        <p>
          The NBA version of this site carries a second baseline built from
          tracking exposures (drives, paint touches, post touches). No
          comparable public tracking data exists for EuroLeague or Liga ACB,
          so that lens does not exist here. What remains is the honest core:
          context-adjusted, leak-free, within-season comparison against the
          league.
        </p>
      </div>

      <H2>Shot value and shot-making</H2>
      <div className="mt-4 space-y-4 text-[15px] leading-relaxed sm:text-base">
        <p>
          FTAOE asks who draws fouls. The leaderboard, every player page, and
          the League board also ask the fuller question: what a shot is
          worth, counting both making it and the fouls it draws. Three
          lenses, same player pool:{" "}
          <strong className="font-semibold">shot value</strong> (combined),{" "}
          <strong className="font-semibold">shot-making</strong> (field goals
          only), and <strong className="font-semibold">foul-drawing</strong>{" "}
          (FTAOE).
        </p>
        <p>
          <strong className="font-semibold">xFG%.</strong> A gradient-boosted
          model gives every field-goal attempt a make probability from shot
          context only: location, distance, angle, zone (cut to FIBA court
          geometry), shot type, period, clock, score margin, and
          possession context (second chance, off a turnover
          {league === "ACB" ? ", dunk" : ""}), never who took it. It is
          trained leak-free by season cross-fit, like the foul model: for
          each season it trains on the other five and predicts that one, so
          a shot's expected make never comes from a model that saw it.
          Summed over a player's attempts, xFG% is the quality of the looks
          he takes; actual FG% minus xFG% is shot-making over expected,
          expressed as field-goal points over expected per 100 possessions.
        </p>
        <p>
          <strong className="font-semibold">Shot value</strong> fuses the
          two. Per shot, expected points are{" "}
          <span className="font-mono text-[13px]">
            xFG% × (2 or 3) + xFTA × {meta.leagueFt.toFixed(2)}
          </span>
          . The headline is points over expected per 100: field goals made
          above the look's difficulty, plus the free throws drawn above
          expectation. Both halves credit conversion: field goals at the
          player's actual rate, and the free throws he draws valued at his
          own season free-throw percentage (the expected attempts valued at
          the league rate, {meta.leagueFt.toFixed(2)} in{" "}
          {LEAGUE_LABEL[league]}). So a foul magnet who shoots 90% from the
          line banks more per trip than one who shoots 60%, and the number
          reflects it.
        </p>
        <p>
          <strong className="font-semibold">Teams</strong> get the same
          lenses on the League board, both ends: what a team creates on
          offense and what it concedes on defense. At team level the
          free-throw side is valued at the league rate rather than a team
          free-throw percentage, which is a weaker, separate thing and is
          left out.
        </p>
      </div>

      <H2>What this number is not</H2>
      <div className="mt-4 space-y-4 text-[15px] leading-relaxed sm:text-base">
        <p>
          FTAOE is descriptive. A high number blends playstyle (rim
          pressure, post touches, late-clock creation), contact-seeking
          skill, and officiating, and this method cannot separate those
          three. In particular, it does not isolate and does not prove
          referee bias, in either direction, for any player. That question
          stays open.
        </p>
        <p>
          The model cannot see who was defending. No public
          possession-level defender data exists for these leagues, and a
          fouled miss has no shot event to attach a defender to. That is a
          real ceiling on how sophisticated a public, leak-free baseline can
          get.
        </p>
        <p>
          On referees: the referee pages measure each official against the
          expected whistle of the games they worked: what those players would
          draw from where they shot, each at their own foul-drawing rate in
          their other games. One season of an official carries little signal,
          so every figure is shrunk toward the league by its measured
          reliability and shown with a 90% range; in leagues with too few
          officials to measure that, the figures are unshrunk and say so. We
          deliberately do not publish
          player-by-referee splits. With three officials per game and a few
          dozen shared games per player-referee pair, those tables are noise
          machines that read as accusations; nothing here supports a claim
          about any referee and any player.
        </p>
        <p>
          Because attempts are attributed to the possession finisher,
          players who draw off-ball fouls are out of scope. Players below{" "}
          <span className="font-mono tnum">
            {int(meta.qualifyPossessions)}
          </span>{" "}
          possessions in a season get no percentile and are excluded from
          the leaderboard by default; per-possession rates are unstable in
          small samples. And {int(seasons.length)} seasons is{" "}
          {int(seasons.length)} seasons: a career view this is not.
        </p>
      </div>

      <H2>Data notes</H2>
      <div className="mt-4 space-y-4 text-[15px] leading-relaxed sm:text-base">
        <p>
          EuroLeague play-by-play and shot charts come from the league's
          public live feeds; Liga ACB data comes from acb.com's public
          match-data API. Shot-zone charts use charged field-goal attempts
          only; fouled misses have no location, so no chart on this site
          claims to show where fouls happen. Zones are cut to FIBA geometry
          (6.75 m arc, 6.60 m corners). Team labels are derived from the
          possession data itself (the teams a player finished possessions
          for, in order of first appearance), which is also how midseason
          moves show up. EuroLeague heights and positions come from the
          league's people feed; ACB exposes no public bio endpoint, so
          position filters are EuroLeague-only. Percentiles are computed
          within each season's qualified pool, within each league.
        </p>
      </div>
    </article>
  );
}
