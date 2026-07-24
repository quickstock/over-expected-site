import { useData, useLeague } from "../data";
import { LEAGUE_LABEL, type CalibrationBin } from "../types";
import { int } from "../lib/format";
import { useMeasure } from "../lib/useMeasure";
import { useTitle } from "../lib/useTitle";

/**
 * Calibration of the possession model: predicted vs actual drawn-FT
 * rate per decile bin. Neutral ink only; this chart is not FTAOE,
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

  // per-100 tick values inside the domain, at whole per-100 steps
  const ticks: number[] = [];
  for (let t = Math.ceil(lo * 50) / 50; t <= hi; t += 0.02) {
    ticks.push(Math.round(t * 1000) / 1000);
  }

  return (
    <div ref={wrapRef} className="max-w-[420px]">
      {width > 0 && inner > 0 && (
        <svg
          width={size}
          height={size}
          role="img"
          aria-label="Calibration: predicted vs actual drawn free throw rate per decile bin. Bins sit close to the diagonal."
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
            predicted FTA per 100 poss
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
              <title>{`decile ${i + 1}: predicted ${(b.pred * 100).toFixed(1)}, actual ${(b.actual * 100).toFixed(1)} per 100 (${int(b.n)} possessions)`}</title>
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
        player draws per 100 possessions, compared with the league-average
        rate. FTAOE = actual FTA − expected FTA; the per-100 version divides
        by the possessions a player finished. Everything on this page is
        computed separately for EuroLeague and Liga ACB — models are never
        pooled across leagues. You are reading the{" "}
        {LEAGUE_LABEL[league]} numbers.
      </p>

      <H2>What counts as a drawn free throw</H2>
      <div className="mt-4 space-y-4 text-[15px] leading-relaxed sm:text-base">
        <p>
          Free throws from personal fouls count: and-1s, fouled misses (two
          or three attempts), and bonus free throws once the defense is over
          the team-foul limit. Technical, unsportsmanlike, and bench fouls
          are excluded. Attempts are attributed to the player who finished
          the possession — the one who went to the line.
        </p>
        <p>
          This is one deliberate difference from the NBA version of this
          system, which counted shooting fouls only. FIBA play-by-play types
          each foul by the free throws it awards, not by shooting versus
          penalty, and once a team is in the bonus a two-shot trip is
          genuinely ambiguous between the two. Rather than guess, the stat
          here is the cleaner-defined one: free throws drawn from regular
          play. The FIBA bonus itself is handled on the other side of the
          ledger — it is a feature of the expectation model, so a player is
          not credited merely for playing minutes deep in penalty situations.
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
          Expected FTA is the league-average drawn-FT rate times the
          possessions a player finished, season by season:{" "}
          {seasons.map((sn, i) => (
            <span key={sn}>
              <span className="font-mono tnum">
                {meta.leagueRateBySeason[sn].toFixed(1)}
              </span>{" "}
              in {sn}
              {i < seasons.length - 1 ? ", " : "."}
            </span>
          ))}
        </p>
        <p>
          On top of that rate we fit a context model: a Poisson GLM (log
          link, no interactions) on seven features that are all external to
          the player. Four describe game state (period, seconds remaining in
          the period, score margin at the start of the possession, and the
          real FIBA team-foul bonus — derived from the foul stream, not a
          late-game proxy) and three describe the situation: whether the
          offense is at home, the opponent's drawn-FT rate, and the assigned
          officiating crew's rate. The opponent and crew rates are
          season-specific and leave-one-game-out, so a game's own outcomes
          never enter its own features. Validation is season cross-fitting
          (train on five seasons, predict the held-out sixth), so every
          prediction is out-of-fold.
        </p>
        <p>
          Expected is then anchored to each season's own league rate: the
          held-out season's predictions are scaled so their mean equals that
          season's actual rate. Whistle environments drift year to year;
          anchoring keeps FTAOE a within-season comparison, which is what it
          claims to be.
        </p>
        <p className="border-l-2 border-line pl-4 text-ink">
          Out-of-fold, the full context model reduces Poisson deviance by{" "}
          <span className="font-mono tnum">
            {meta.modelLiftPct.toFixed(2)}%
          </span>{" "}
          against each season's own league-average rate — most of it from
          the bonus state, which mechanically produces free throws. Context
          matters more here than in the NBA (where the same model bought
          0.2%), but the expectation is still, in practice, mostly "versus
          league average", and the site presents it that way.
        </p>
        <table className="mt-2 w-full max-w-sm border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left">
              <th className="py-2 pr-4 font-display text-[11px] font-medium uppercase tracking-wider text-ink-faint">
                Held-out season
              </th>
              <th className="py-2 font-display text-[11px] font-medium uppercase tracking-wider text-ink-faint">
                Deviance reduction
              </th>
            </tr>
          </thead>
          <tbody>
            {meta.foldLifts.map((f) => (
              <tr key={f.season} className="border-b border-line-soft">
                <td className="py-2 pr-4 font-mono tnum">{f.season}</td>
                <td className="py-2 font-mono tnum">
                  {f.liftPct.toFixed(2)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <H2>Calibration</H2>
      <div className="mt-4 space-y-4 text-[15px] leading-relaxed sm:text-base">
        <p>
          Possessions binned into deciles by predicted rate, predicted vs
          actual:
        </p>
        <CalibrationChart bins={calibration} />
        <p>
          Each dot is roughly{" "}
          <span className="font-mono tnum">{int(calibration[0].n)}</span>{" "}
          possessions. The bins sit near the diagonal — the model isn't
          systematically over- or under-calling fouls — and from the lowest
          to the highest decile it separates possessions by about{" "}
          <span className="font-mono tnum">{spreadPer100}</span> free throws
          per 100, most of that the bonus state doing its work.
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
          on average across {seasons.length - 1} consecutive season pairs (
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
          On referees: the officiating crew's overall foul tendency is
          adjusted for as context above. We deliberately do not publish
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
