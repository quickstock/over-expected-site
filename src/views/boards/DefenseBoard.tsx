/**
 * Layer 4 — team defence. Deliberately team-level.
 *
 * The player version of this metric was built and rejected on evidence: 0.348
 * split-half reliability, and a leaderboard with non-defenders at the top,
 * because splitting every shot five ways makes it a team measure wearing a
 * player's name. That rejection is stated on the page, not buried in a
 * methodology link, and the page sends you to D-RAPM for the player question.
 *
 * Pillars render in the order the export ships them, which is by measured
 * reliability, and each one carries its own reliability figure — so the noisy
 * pillar cannot be read as though it were the solid one.
 *
 * All hooks run before any conditional return (React error #310).
 */
import { useEffect } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useDefense, useLeague } from "../../data";
import { ACTIVE_LEAGUES, leagueDef, type League } from "../../leagues";
import type { DefenseTeamRow } from "../../types";
import { divergingText } from "../../lib/color";
import { int, signed } from "../../lib/format";
import { useTitle } from "../../lib/useTitle";
import SegmentedControl from "../../components/SegmentedControl";

type PillarKey = "qualityForced" | "deterrence" | "suppression";

function Unavailable({ label, reason }: { label: string; reason?: string }) {
  return (
    <div className="mx-auto max-w-xl px-5 py-28 text-center sm:px-8">
      <p className="font-display text-2xl font-semibold text-ink">
        Team defence isn't available for {label}.
      </p>
      <p className="mt-3 text-sm leading-relaxed text-ink-soft">
        {reason ??
          `This layer needs shot-level expected points measured against a
           reconstructed five-man defensive lineup. No European league
           publishes the possession-level data it requires, so there is
           nothing to approximate from — this is absent, not pending.`}
      </p>
      <Link
        to="/defense/NBA"
        className="mt-8 inline-block rounded-md bg-ink px-5 py-2.5 font-display text-sm font-medium text-paper transition-opacity duration-150 hover:opacity-85"
      >
        See the NBA team defence
      </Link>
    </div>
  );
}

/** Reliability shown as a labelled figure, not a bare number: 0.98 and 0.72
    mean very different things and the page has to say which is which. */
function ReliabilityChip({ sb }: { sb: number }) {
  const label = sb >= 0.9 ? "solid" : sb >= 0.7 ? "usable" : "noisy";
  return (
    <span className="font-mono tnum text-[10px] text-ink-faint">
      reliability {sb.toFixed(2)} · {label}
    </span>
  );
}

export default function DefenseBoard() {
  const { lg } = useParams();
  const league = (lg && ACTIVE_LEAGUES.includes(lg as League)
    ? lg
    : ACTIVE_LEAGUES[0]) as League;
  const def = leagueDef(league);
  const { league: active, setLeague } = useLeague();
  useEffect(() => {
    if (league !== active) setLeague(league);
  }, [league, active, setLeague]);
  useTitle("Team defence · Over Expected");

  const [params, setParams] = useSearchParams();
  const state = useDefense(league);

  const data = state.status === "ready" ? state.data : null;
  const seasons = data?.meta.seasons ?? [];
  const season = seasons.includes(params.get("season") ?? "")
    ? (params.get("season") as string)
    : seasons[seasons.length - 1] ?? "";
  const sortKey = (
    ["qualityForced", "deterrence", "suppression"].includes(
      params.get("sort") ?? "",
    )
      ? params.get("sort")
      : "qualityForced"
  ) as PillarKey;

  if (!def.layers?.defense)
    return (
      <Unavailable label={def.label} reason={data?.meta.unavailableReason} />
    );
  if (state.status === "loading")
    return (
      <div className="mx-auto max-w-4xl px-6 py-24">
        <div className="h-64 animate-pulse rounded bg-wash" />
      </div>
    );
  if (state.status === "error")
    return (
      <p className="mx-auto max-w-xl px-6 py-32 text-center text-ink-soft">
        The defence data failed to load.
      </p>
    );

  const meta = data!.meta;
  const rows = (data!.teams[season] ?? [])
    .slice()
    .sort((a, b) => b[sortKey] - a[sortKey]);
  const pillar = meta.pillars.find((p) => p.key === sortKey)!;
  const maxAbs = Math.max(...rows.map((r) => Math.abs(r[sortKey])), 0.0001);

  const fmt = (r: DefenseTeamRow, k: PillarKey) =>
    k === "qualityForced" ? signed(r[k], 3) : signed(r[k], 2);

  return (
    <div>
      <div className="sticky top-0 z-10 border-b border-line bg-paper">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-5 gap-y-3 px-5 py-3 sm:px-8">
          <SegmentedControl
            ariaLabel="Season"
            options={seasons.map((s) => ({
              value: s,
              label: s,
              shortLabel: `'${s.slice(2, 4)}`,
            }))}
            value={season}
            onChange={(s) => {
              const next = new URLSearchParams(params);
              next.set("season", s);
              setParams(next, { replace: false });
            }}
          />
          <span className="ml-auto font-mono tnum text-xs text-ink-faint">
            {rows.length} teams
          </span>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-5 pt-8 pb-16 sm:px-8 sm:pt-12">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">
            Team defence
          </h1>
          <span className="rounded border border-line px-2 py-0.5 font-display text-[10px] font-medium uppercase tracking-wider text-ink-faint">
            NBA only
          </span>
        </div>

        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
          Every shot faced, scored against what the model expected that shot to
          be worth, then attributed to the defence that was on the floor for it.
          Two questions, kept separate because they answer different things: how
          bad were the shots you forced, and did opponents then convert below
          what those shots were worth.
        </p>

        <div className="mt-5 rounded border border-line-soft bg-wash px-4 py-4 text-sm leading-relaxed text-ink-soft">
          <strong className="font-display font-semibold text-ink">
            This is a team measure, on purpose.
          </strong>{" "}
          The player version of it was built, tested, and not shipped: splitting
          each shot equally across five defenders makes it team defence wearing
          a player's name, it scored{" "}
          <span className="font-mono tnum">
            {meta.playerLevelRejected.spearmanBrown.toFixed(2)}
          </span>{" "}
          on a split-half test, and its leaderboard put players nobody considers
          good defenders near the top. Five-way credit sharing isn't a confound
          when the unit is the team, which is why this page exists and that one
          doesn't. For the player question, the regression-adjusted answer is
          D-RAPM on the{" "}
          <Link
            to="/lineups/NBA"
            className="underline underline-offset-2 hover:text-ink"
          >
            lineups board
          </Link>
          .
        </div>

        <div className="mt-8 flex flex-wrap gap-2">
          {meta.pillars.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => {
                const next = new URLSearchParams(params);
                next.set("sort", p.key);
                setParams(next, { replace: false });
              }}
              className={`flex flex-col items-start gap-0.5 rounded-md border px-3 py-2 text-left transition-colors duration-150 ${
                sortKey === p.key
                  ? "border-ink bg-ink text-paper"
                  : "border-line hover:bg-wash"
              }`}
            >
              <span className="font-display text-[13px] font-medium">
                {p.label}
              </span>
              <span
                className={
                  sortKey === p.key ? "opacity-70" : undefined
                }
              >
                <ReliabilityChip sb={p.spearmanBrown} />
              </span>
            </button>
          ))}
        </div>

        <p className="mt-4 max-w-2xl text-xs leading-relaxed text-ink-soft">
          <strong className="font-display font-semibold text-ink">
            {pillar.label}:
          </strong>{" "}
          {pillar.note} Unit: {pillar.unit}.
        </p>

        <div className="mt-6 hidden grid-cols-[2.5rem_minmax(0,1fr)_7rem_6rem_6rem_9rem] items-end gap-x-4 border-b border-line pb-2 sm:grid">
          <span />
          <span className="font-display text-[11px] font-medium uppercase tracking-wider text-ink-faint">
            Team
          </span>
          <span className="text-right font-display text-[11px] font-medium uppercase tracking-wider text-ink-faint">
            Shots faced
          </span>
          <span className="text-right font-display text-[11px] font-medium uppercase tracking-wider text-ink-faint">
            Rim %
          </span>
          <span className="text-right font-display text-[11px] font-medium uppercase tracking-wider text-ink-faint">
            Pts/100
          </span>
          <span className="text-right font-display text-[11px] font-medium uppercase tracking-wider text-ink-faint">
            {pillar.label}
          </span>
        </div>

        {rows.length === 0 ? (
          <p className="py-16 text-center text-sm text-ink-faint">
            No teams for {season}.
          </p>
        ) : (
          <ol>
            {rows.map((r, i) => (
              <li key={r.teamId} className="cv-row border-b border-line-soft">
                <div className="hidden grid-cols-[2.5rem_minmax(0,1fr)_7rem_6rem_6rem_9rem] items-center gap-x-4 py-3 sm:grid">
                  <span className="text-right font-mono tnum text-sm text-ink-faint">
                    {i + 1}
                  </span>
                  <span className="font-display text-[15px] font-semibold text-ink">
                    {r.team}
                  </span>
                  <span className="text-right font-mono tnum text-sm text-ink-soft">
                    {int(r.shotsFaced)}
                  </span>
                  <span className="text-right font-mono tnum text-sm text-ink-soft">
                    {r.rimRate.toFixed(1)}
                  </span>
                  <span className="text-right font-mono tnum text-sm text-ink-soft">
                    {r.ptsAllowed100.toFixed(1)}
                  </span>
                  <span className="flex items-center justify-end gap-3">
                    <span
                      className="relative block h-1.5 w-16"
                      aria-hidden="true"
                    >
                      <span className="absolute inset-y-0 left-1/2 w-px bg-line" />
                      <span
                        className="absolute top-0 h-full rounded-full"
                        style={{
                          width: `${((Math.abs(r[sortKey]) / maxAbs) * 50).toFixed(1)}%`,
                          background: divergingText(r[sortKey]),
                          left: r[sortKey] >= 0 ? "50%" : undefined,
                          right: r[sortKey] < 0 ? "50%" : undefined,
                        }}
                      />
                    </span>
                    <span
                      className="w-16 text-right font-mono tnum text-lg"
                      style={{ color: divergingText(r[sortKey]) }}
                    >
                      {fmt(r, sortKey)}
                    </span>
                  </span>
                </div>
                <div className="flex items-baseline gap-2.5 py-3 sm:hidden">
                  <span className="w-6 text-right font-mono tnum text-xs text-ink-faint">
                    {i + 1}
                  </span>
                  <span className="flex-1 font-display text-[15px] font-semibold text-ink">
                    {r.team}
                  </span>
                  <span
                    className="font-mono tnum text-lg"
                    style={{ color: divergingText(r[sortKey]) }}
                  >
                    {fmt(r, sortKey)}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        )}

        <p className="mt-5 text-xs leading-relaxed text-ink-faint">
          Quality forced and rim rate are measured against the same season's
          league mean, so pace and rule changes don't leak into a team's figure.
          Turnovers forced and defensive rebounding are not included, and no
          public data separates forcing a miss from preventing the attempt.{" "}
          <Link
            to="/methodology/defense"
            className="underline underline-offset-2 hover:text-ink"
          >
            Full method and limits
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
