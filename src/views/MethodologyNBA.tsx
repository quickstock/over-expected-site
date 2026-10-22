import { useData } from "../data";
import type { CalibrationBin } from "../types";
import { int } from "../lib/format";
import { useMeasure } from "../lib/useMeasure";
import { useTitle } from "../lib/useTitle";

/**
 * Calibration of the FTAOE baseline: qualified player-seasons in deciles of
 * expected free throws per possession (shot diet), against actual. Neutral
 * ink only; this chart is not FTAOE, so the diverging encoding stays out.
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
  const x = (v: number) => pad.left + ((v - lo) / (hi - lo)) * (size - pad.left - pad.right);
  const y = (v: number) => pad.top + innerH - ((v - lo) / (hi - lo)) * innerH;

  // every 5 per 100 inside the domain
  const ticks: number[] = [];
  for (let t = Math.ceil(lo * 20) / 20; t <= hi; t += 0.05) ticks.push(t);

  return (
    <div ref={wrapRef} className="max-w-[420px]">
      {width > 0 && inner > 0 && (
        <svg
          width={size}
          height={size}
          role="img"
          aria-label="Calibration: expected vs actual shooting-foul free throws per 100 possessions, qualified player-seasons in deciles of expected. Bins follow the diagonal across a wide range."
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

export default function MethodologyNBA() {
  const data = useData();
  useTitle("Methodology \u00b7 Over Expected");
  const { meta, calibration } = data;
  const seasons = meta.seasons;
  const paddingK = meta.reliability.paddingK ?? 0;
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

  const calLo = calibration[0];
  const calHi = calibration[calibration.length - 1];
  const spreadPer100 = ((calHi.pred - calLo.pred) * 100).toFixed(1);

  return (
    <article className="mx-auto max-w-2xl px-5 py-12 sm:px-8 sm:py-16">
      <h1 className="font-display text-3xl font-bold tracking-tight text-ink sm:text-5xl">
        Methodology
      </h1>
      <p className="mt-4 text-base leading-relaxed text-ink-soft sm:text-lg">
        FTAOE, free throw attempts over expected, is how many shooting-foul
        free throws a player draws per 100 possessions beyond what his shot
        locations predict. FTAOE = actual FTA minus expected FTA, where
        expected is what a league-average player would have drawn from the
        same shots; the per-100 version divides by the possessions a player
        finished.
      </p>

      <H2>What counts as a shooting foul</H2>
      <div className="mt-4 space-y-4 text-[15px] leading-relaxed sm:text-base">
        <p>
          Only free throws from shooting fouls count: and-1s and fouled misses
          (two or three attempts). Free throws from the bonus on non-shooting
          fouls, technicals, and flagrants are excluded, as are off-ball
          fouls. Attempts are attributed to the player who finished the
          possession: the one fouled in the act of shooting.
        </p>
        <p>
          The data is possession-level play-by-play:{" "}
          <span className="font-mono tnum">{int(meta.nPossessions)}</span>{" "}
          possessions across {int(seasons.length)} seasons, {seasons[0]} to{" "}
          {seasons[seasons.length - 1]}. Each possession's target is the
          number of shooting-foul free throws it produced (almost always 0,
          occasionally 2 or 3).
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

      <H2>The baseline: where he shoots</H2>
      <div className="mt-4 space-y-4 text-[15px] leading-relaxed sm:text-base">
        <p>
          Expected FTA is what a league-average player would have drawn from
          the same shots. Every attempt goes into one of four zones: at the
          rim, the rest of the paint, mid-range, or three. Each zone carries
          the league's free throws per attempt for that season, with the
          player's own attempts left out of the league figure so he cannot
          set his own bar. Expected FTA is his attempts in each zone times
          that zone's rate, added up.
        </p>
        <p>
          Fouled misses need one more step. A shot that draws a foul and
          misses is not charged as a field-goal attempt and has no location,
          so leaving those out would understate the rim attempts of exactly
          the players who draw the most fouls. They go back in: a three-shot
          trip is a three-point attempt, and a two-shot trip is spread across
          the player's own two-point zones in proportion to how often he
          shoots there and how often and-1s happen there league-wide. Each
          season is then scaled so the league's expected total equals its
          actual total, which keeps FTAOE a within-season comparison. The
          scaling factor is between 1.000 and 1.003, so the zone rates are
          doing the work, not the scaling.
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
        {rates["2020-21"] && rates["2021-22"] && (
          <p>
            The shape holds every year: about a third of a free throw per
            attempt at the rim, a quarter in the paint, a tenth from
            mid-range, a few hundredths on threes. Read down the three column
            and the 2021-22 enforcement change on non-basketball moves shows
            up where it should: free throws per three-point attempt fell from{" "}
            <span className="font-mono tnum">
              {rates["2020-21"].three.toFixed(3)}
            </span>{" "}
            to{" "}
            <span className="font-mono tnum">
              {rates["2021-22"].three.toFixed(3)}
            </span>{" "}
            while the rim barely moved.
          </p>
        )}
        <p className="border-l-2 border-line pl-4 text-ink">
          Why the baseline changed. Until October 2026 the expectation came
          from game context: clock, score margin, home court, and the
          opponent's and officiating crew's foul rates. Out-of-fold that model
          reduced Poisson deviance by just{" "}
          <span className="font-mono tnum">{meta.modelLiftPct.toFixed(2)}%</span>{" "}
          against the plain league rate
          {c?.contextRawRateCorr != null && c?.contextHeightCorr != null && (
            <>
              , so FTAOE correlated{" "}
              <span className="font-mono tnum">
                {c.contextRawRateCorr.toFixed(3)}
              </span>{" "}
              with raw free throws per 100 and{" "}
              <span className="font-mono tnum">
                {c.contextHeightCorr.toFixed(2)}
              </span>{" "}
              with height
            </>
          )}
          . It was the free-throw rate with a constant subtracted, and partly
          a size measure. Where a player shoots is what separates a
          rim-runner's free throws from a driver's, so that is the baseline
          now. The context model still sits behind the team and referee views,
          where opponent and crew are the point.
        </p>
      </div>

      <H2>What the baseline takes out, and what it leaves</H2>
      <div className="mt-4 space-y-4 text-[15px] leading-relaxed sm:text-base">
        <p>
          Measured on every qualified player-season by the same export that
          builds the board, not asserted:
        </p>
        {c && (
          <>
            <p>
              <strong className="font-medium">
                It is no longer the raw rate.
              </strong>{" "}
              FTAOE per 100 correlates{" "}
              <span className="font-mono tnum">{c.rawRateCorr.toFixed(2)}</span>{" "}
              with plain shooting-foul free throws per 100. A big who draws a
              lot of free throws because he lives at the rim now gets credit
              only for what he draws beyond that.
            </p>
            {c.heightCorr != null && c.rawHeightCorr != null && (
              <p>
                <strong className="font-medium">
                  It is no longer a height measure.
                </strong>{" "}
                Its correlation with the finisher's height is{" "}
                <span className="font-mono tnum">{c.heightCorr.toFixed(2)}</span>
                , against{" "}
                <span className="font-mono tnum">
                  {c.rawHeightCorr.toFixed(2)}
                </span>{" "}
                for the raw rate. Height never went into the model; where a
                player shoots carried it.
              </p>
            )}
            {c.trackingCorr != null && (
              <p>
                <strong className="font-medium">
                  Independent data agrees.
                </strong>{" "}
                A second version built only from NBA tracking counts (drives,
                paint touches and post touches) correlates{" "}
                <span className="font-mono tnum">
                  {c.trackingCorr.toFixed(2)}
                </span>{" "}
                with this one. Two different descriptions of how a player
                attacks reach the same answer.
              </p>
            )}
          </>
        )}
        <p className="border-l-2 border-line pl-4 text-ink">
          What it still blends: contact craft within a zone (a downhill drive
          and a putback are both rim attempts), officiating, and how often a
          player is fouled in the act rather than before it. Read it as free
          throws drawn beyond what his shot locations predict. That is a
          narrower claim than "foul-drawing skill", and it is one the data
          supports.
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
          per 100 and actual follows it. The retired context baseline
          separated possessions by about two. A baseline has to tell a
          rim-heavy diet from a perimeter one before the gap above it means
          anything, and this one does.
        </p>
      </div>

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
          on average across{" "}
          {meta.reliability.yoyPairs.length} consecutive season pairs (
          {meta.reliability.yoyPairs.map((p, i) => (
            <span key={p.pair} className="font-mono tnum">
              {p.r.toFixed(2)}
              {i < meta.reliability.yoyPairs.length - 1 ? ", " : ""}
            </span>
          ))}
          ), about <span className="font-mono tnum">{yoyN}</span> repeat
          players per pair. That is a little below the raw rate's own
          stability, which is expected: shot diet is very stable from year to
          year, and taking it out removes the most stable part. What is left
          still repeats, so drawing fouls beyond your diet is a skill, not
          noise.
        </p>
        <p>
          In padding terms, the stat stabilizes after about{" "}
          <span className="font-mono tnum">{int(paddingK)}</span>{" "}
          possessions (the sample size at which half the variance you see is
          signal). For comparison, three-point percentage is commonly
          estimated to need 240 or more attempts. At the leaderboard's
          {" "}{int(meta.qualifyPossessions)}-possession floor, reliability is
          already about{" "}
          <span className="font-mono tnum">
            {(
              meta.qualifyPossessions /
              (meta.qualifyPossessions + paddingK)
            ).toFixed(2)}
          </span>
          ; at 1,000 possessions it is about{" "}
          <span className="font-mono tnum">
            {(1000 / (1000 + paddingK)).toFixed(2)}
          </span>
          .
        </p>
      </div>

      <H2>Cross-check: tracking data</H2>
      <div className="mt-4 space-y-4 text-[15px] leading-relaxed sm:text-base">
        <p>
          NBA player pages also show a second, labeled number: free throws
          drawn above what a player's attack profile predicts, where the
          profile is drives, paint touches and post touches per 100
          possessions from NBA tracking data. It is fit the same leak-free
          way (train on the other seasons, predict the held-out one, anchor
          to the season), and the player's own free-throw outcomes on those
          plays are never inputs.
        </p>
        <p>
          It answers the same question as FTAOE from different evidence,
          which is why it stays
          {c?.trackingCorr != null && (
            <>
              : the two agree at{" "}
              <span className="font-mono tnum">
                r = {c.trackingCorr.toFixed(2)}
              </span>
            </>
          )}
          . Tracking counts exist only for the NBA, so shot location is the
          baseline every league shares.
        </p>
      </div>

      <H2>Shot value and shot-making</H2>
      <div className="mt-4 space-y-4 text-[15px] leading-relaxed sm:text-base">
        <p>
          FTAOE asks who draws fouls. The leaderboard, every player page, and
          the League board also ask the fuller question: what a shot is worth,
          counting both making it and the fouls it draws. Three lenses, same
          player pool: <strong className="font-semibold">shot value</strong>{" "}
          (combined), <strong className="font-semibold">shot-making</strong>{" "}
          (field goals only), and{" "}
          <strong className="font-semibold">foul-drawing</strong> (FTAOE).
        </p>
        <p>
          <strong className="font-semibold">xFG%.</strong> A gradient-boosted
          model gives every field-goal attempt a make probability from shot
          context only: location, distance, zone, action type, shot type,
          period, clock, and score margin, never who took it. It is trained
          leak-free by season cross-fit, like the foul model: for each season
          it trains on the other five and predicts that one, so a shot's
          expected make never comes from a model that saw it. Summed over a
          player's attempts, xFG% is the quality of the looks he takes; actual
          FG% minus xFG% is shot-making over expected, expressed as field-goal
          points over expected per 100 possessions.
        </p>
        <p>
          <strong className="font-semibold">Shot value</strong> fuses the two.
          Per shot, expected points are{" "}
          <span className="font-mono text-[13px]">
            xFG% × (2 or 3) + expected FTA × 0.77
          </span>
          , with expected FTA from the zone rates above. The headline is
          points over expected per 100: field goals made above the look's
          difficulty, plus the free throws drawn above what those shots
          should draw. Both halves credit conversion: field goals at the
          player's actual rate, and the free throws he draws valued at his own
          season free-throw percentage (the expected attempts valued at the
          league rate, ~0.77). So a foul magnet who shoots 90% from the line
          banks more per trip than one who shoots 60%, and the number reflects
          it; an earlier version valued both at the league rate and quietly
          erased that difference.
        </p>
        <p>
          <strong className="font-semibold">Teams</strong> get the same three
          lenses on the League board, both ends: what a team creates on offense
          and what it concedes on defense. At team level the free-throw side is
          valued at the league rate rather than a team free-throw percentage,
          which is a weaker, separate thing and is left out.
        </p>
      </div>

      <H2>What this number is not</H2>
      <div className="mt-4 space-y-4 text-[15px] leading-relaxed sm:text-base">
        <p>
          FTAOE is descriptive. With shot location taken out, a high number
          still blends contact-seeking skill, the kind of shot within a zone,
          and officiating, and this method cannot separate those three. In
          particular, it does not isolate and does not prove referee bias, in
          either direction, for any player. That question stays open.
        </p>
        <p>
          The model cannot see who was defending. Per-possession defender
          identity and position exist only in the league's internal tracking
          stack; public matchup data is aggregated and cannot be joined to
          possessions, and a fouled miss has no shot event to attach a
          defender to. That is a real ceiling on how sophisticated a public,
          leak-free baseline can get.
        </p>
        <p>
          On referees: league-wide officiating is in the baseline through
          each season's zone rates, but a player's individual crews are not.
          Crew tendencies are shown on the referee pages, measured against
          game context. We deliberately do not publish
          player-by-referee splits. With three officials per game and a few
          dozen shared games per player-referee pair, those tables are noise
          machines that read as accusations; nothing here supports a claim
          about any referee and any player.
        </p>
        <p>
          Because attempts are attributed to the possession finisher, players
          who draw off-ball fouls are out of scope. Players below{" "}
          <span className="font-mono tnum">{int(meta.qualifyPossessions)}</span>{" "}
          possessions in a season get no percentile and are excluded from the
          leaderboard by default; per-possession rates are unstable in small
          samples. And {int(seasons.length)} seasons is{" "}
          {int(seasons.length)} seasons: a career view this is not.
        </p>
      </div>

      <H2>Data notes</H2>
      <div className="mt-4 space-y-4 text-[15px] leading-relaxed sm:text-base">
        <p>
          Shot-zone charts use charged field-goal attempts only; fouled
          misses have no location, so no chart on this site claims to show
          where fouls happen. Team labels are derived from the possession
          data itself (the teams a player finished possessions for, in order
          of first appearance), which is also how midseason trades show up.
          Home/away and officiating crews come from the NBA's public game
          feeds; drives and touch counts come from the NBA's public tracking
          aggregates. Percentiles are computed within each season's
          qualified pool.
        </p>
      </div>
    </article>
  );
}
