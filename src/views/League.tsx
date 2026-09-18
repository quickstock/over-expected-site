/**
 * League context — the team layer under every player number, one lens at a
 * time. Six lenses for the NBA (three offensive reads from the base export,
 * three defensive pillars from the team-defence layer), three elsewhere.
 * The table opens on its top 10 and expands to the full league; every column
 * header sorts (default order -> descending -> ascending -> default).
 * Clutch Decision-making (the decision-EV layer) lives at the bottom for
 * leagues that ship it.
 */
import { useMemo, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useData, useDefense, useLeague } from "../data";
import { ACTIVE_LEAGUES, LEAGUE_LABEL, leagueDef, type League } from "../leagues";
import {
  DEFAULT_LEAGUE_LENS,
  datedPart,
  leagueLensKey,
  leagueLensSlug,
  leaguePath,
} from "../routes";
import type { DefenseTeamRow, TeamRow } from "../types";
import { useTitle } from "../lib/useTitle";
import { divergingColor, divergingText } from "../lib/color";
import { int, signed } from "../lib/format";
import { useMeasure } from "../lib/useMeasure";
import { useRevealed } from "../lib/useRevealed";
import SegmentedControl from "../components/SegmentedControl";
import SortHeader, { cycleSort, type SortDir } from "../components/SortHeader";
import ShowAllButton from "../components/ShowAllButton";
import TeamScatter from "../components/charts/TeamScatter";
import ClutchDecisions from "../components/ClutchDecisions";

const WARM = "oklch(0.58 0.17 38)";

/**
 * League drawn-FT rate per 100 by season: the foul environment over time.
 * The line draws in on first view.
 */
function LeagueTrend({
  seasons,
  rates,
  crackdownSeason,
}: {
  seasons: string[];
  rates: Record<string, number>;
  crackdownSeason?: string;
}) {
  const [wrapRef, width] = useMeasure<HTMLDivElement>();
  const revealed = useRevealed(wrapRef);
  const pts = seasons.filter((s) => rates[s] != null).map((s) => ({ s, v: rates[s] }));
  const height = 210;
  const pad = { top: 26, right: 16, bottom: 32, left: 16 };
  const innerW = Math.max(40, width - pad.left - pad.right);
  const innerH = height - pad.top - pad.bottom;
  const vals = pts.map((p) => p.v);
  const lo = Math.min(...vals) - 0.5;
  const hi = Math.max(...vals) + 0.5;
  const x = (i: number) => pad.left + (i / Math.max(1, pts.length - 1)) * innerW;
  const y = (v: number) => pad.top + innerH - ((v - lo) / (hi - lo)) * innerH;
  const path = pts
    .map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)} ${y(p.v).toFixed(1)}`)
    .join("");

  return (
    <div ref={wrapRef} className="relative">
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`League drawn free throws per 100 by season, from ${pts[0].v.toFixed(1)} to ${pts[pts.length - 1].v.toFixed(1)}.`}
        >
          <path
            d={path}
            fill="none"
            stroke="var(--color-ink)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
            pathLength={1}
            style={{
              strokeDasharray: 1,
              strokeDashoffset: revealed ? 0 : 1,
              transition: "stroke-dashoffset 900ms var(--ease-out-strong)",
            }}
          />
          {pts.map((p, i) => {
            const crack = crackdownSeason === p.s;
            return (
              <g
                key={p.s}
                style={{
                  opacity: revealed ? 1 : 0,
                  transition: `opacity 360ms ease ${250 + i * 60}ms`,
                }}
              >
                <circle
                  cx={x(i)}
                  cy={y(p.v)}
                  r={crack ? 5 : 3.5}
                  fill={crack ? WARM : "var(--color-ink)"}
                  stroke="var(--color-paper)"
                  strokeWidth={crack ? 1.75 : 1}
                />
                <text
                  x={x(i)}
                  y={y(p.v) - 12}
                  textAnchor="middle"
                  fontSize={11}
                  fontWeight={crack ? 700 : 400}
                  className="font-mono tnum"
                  fill={crack ? WARM : "var(--color-ink)"}
                >
                  {p.v.toFixed(1)}
                </text>
                <text
                  x={x(i)}
                  y={height - 10}
                  textAnchor="middle"
                  fontSize={10}
                  className="font-mono"
                  fill={crack ? WARM : "var(--color-ink-faint)"}
                >
                  '{p.s.slice(2, 4)}-{p.s.slice(5)}
                </text>
                {crack && (
                  <text
                    x={x(i)}
                    y={height - 22}
                    textAnchor="middle"
                    fontSize={9.5}
                    className="font-display"
                    fill={WARM}
                  >
                    crackdown
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* The lens registry                                                   */

type LensKey =
  | "value"
  | "making"
  | "fouls"
  | "qualityForced"
  | "deterrence"
  | "suppression";

const DEF_KEYS = ["qualityForced", "deterrence", "suppression"] as const;
type DefKey = (typeof DEF_KEYS)[number];

const BASE_LENSES: { key: LensKey; label: string; sub: string; explain: string }[] = [
  {
    key: "value",
    label: "Shot value",
    sub: "xPts/100 vs league",
    explain:
      "How good the looks each offense generates are, before anyone makes or misses them: expected points per 100 possessions of the shots taken, against the season's league mean. Positive means better shots, not better shooting.",
  },
  {
    key: "making",
    label: "Shot-making",
    sub: "FG pts over exp. /100",
    explain:
      "Whether a team converted better or worse than its looks were worth: field-goal points over expected per 100 possessions, against the season's league mean. Shot quality is already priced out, so this is shooting alone.",
  },
  {
    key: "fouls",
    label: "Free throws",
    sub: "drawn & conceded /100",
    explain:
      "Free throws drawn (offense) and conceded (defense) over the league's expectation for the same contexts, per 100 possessions. A player's foul-drawing number partly rides on his team's; check here before crediting him alone.",
  },
];

const DEF_LENSES: { key: DefKey; label: string }[] = [
  { key: "qualityForced", label: "Quality forced" },
  { key: "deterrence", label: "Rim deterrence" },
  { key: "suppression", label: "Conversion suppression" },
];

/** Lens wording for the page title. Lowercase: it sits mid-phrase. */
const LENS_TITLE_WORD: Record<LensKey, string> = {
  value: "shot value",
  making: "shot-making",
  fouls: "free throws",
  qualityForced: "quality forced",
  deterrence: "rim deterrence",
  suppression: "conversion suppression",
};

const reliabilityWord = (sb: number) =>
  sb >= 0.9 ? "solid" : sb >= 0.7 ? "usable" : "noisy";

/* ------------------------------------------------------------------ */
/* Ranked, sortable, top-10-first team tables                          */

/** Diverging bar centred on zero, scaled to the season's widest team. */
function Bar({ value, max, className = "w-20" }: {
  value: number;
  max: number;
  className?: string;
}) {
  const t = Math.min(Math.abs(value), max) / max;
  const fill: React.CSSProperties = {
    background: divergingColor(value),
    width: `${(t * 50).toFixed(2)}%`,
  };
  if (value >= 0) fill.left = "50%";
  else fill.right = "50%";
  return (
    <span className={`relative block h-1.5 ${className}`} aria-hidden="true">
      <span className="absolute inset-y-0 left-1/2 w-px bg-line" />
      <span className="absolute top-0 h-full rounded-full" style={fill} />
    </span>
  );
}

const revealStyle = (i: number) =>
  i >= 10
    ? ({ "--reveal-delay": `${Math.min((i - 10) * 16, 160)}ms` } as React.CSSProperties)
    : undefined;

type SingleKey = "poss" | "metric";

/** Shot value / shot-making: rank, team, poss, one diverging metric. */
function SingleMetricTable({ rows, label, metric }: {
  rows: TeamRow[];
  label: string;
  metric: (t: TeamRow) => number | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const [explicit, setExplicit] = useState<SingleKey | null>(null);
  const [dir, setDir] = useState<SortDir>("desc");
  const onSort = (k: SingleKey) => {
    const next = cycleSort(k, explicit, dir);
    setExplicit(next?.sort ?? null);
    setDir(next?.dir ?? "desc");
  };

  const sorted = useMemo(() => {
    const key = explicit ?? "metric";
    const mul = explicit && dir === "asc" ? 1 : -1;
    const num = (t: TeamRow) => (key === "poss" ? t.poss : metric(t));
    return [...rows].sort((a, b) => {
      const va = num(a);
      const vb = num(b);
      if (va == null) return 1;
      if (vb == null) return -1;
      return mul * (va - vb);
    });
  }, [rows, explicit, dir, metric]);

  const max = Math.max(...rows.map((t) => Math.abs(metric(t) ?? 0)), 0.0001);
  const visible = expanded ? sorted : sorted.slice(0, 10);
  const GRID =
    "grid-cols-[2rem_minmax(0,1fr)_7rem] sm:grid-cols-[2.5rem_minmax(0,1fr)_6rem_9.5rem]";

  return (
    <div className="mt-6">
      <div className={`grid ${GRID} items-end gap-x-4 border-b border-line pb-2`}>
        <span />
        <span className="font-display text-[11px] font-medium uppercase tracking-wider text-ink-faint">
          Team
        </span>
        <SortHeader k="poss" label="Poss" sort={explicit} dir={dir} onSort={onSort} className="hidden text-right sm:block" />
        <SortHeader k="metric" label={label} sort={explicit} dir={dir} onSort={onSort} className="text-right" />
      </div>
      <ol>
        {visible.map((t, i) => {
          const v = metric(t);
          return (
            <li
              key={t.team}
              className={`grid ${GRID} items-center gap-x-4 border-b border-line-soft py-2.5 ${i >= 10 ? "reveal-row" : ""}`}
              style={revealStyle(i)}
            >
              <span className="text-right font-mono tnum text-xs text-ink-faint">
                {i + 1}
              </span>
              <span className="font-display text-[14px] font-semibold text-ink">
                {t.team}
              </span>
              <span className="hidden text-right font-mono tnum text-sm text-ink-soft sm:block">
                {int(t.poss)}
              </span>
              {v == null ? (
                <span className="text-right font-mono text-sm text-ink-faint">–</span>
              ) : (
                <span className="flex items-center justify-end gap-3">
                  <Bar value={v} max={max} className="hidden w-20 sm:block" />
                  <span
                    className="w-14 text-right font-mono tnum text-lg"
                    style={{ color: divergingText(v) }}
                  >
                    {signed(v, 1)}
                  </span>
                </span>
              )}
            </li>
          );
        })}
      </ol>
      <ShowAllButton
        expanded={expanded}
        total={sorted.length}
        noun="teams"
        onToggle={() => setExpanded((v) => !v)}
      />
    </div>
  );
}

type FoulsKey = "drawn" | "conceded";

/** Free throws: rank, team, drawn, conceded — both ends sortable. */
function FoulsTable({ rows }: { rows: TeamRow[] }) {
  const [expanded, setExpanded] = useState(false);
  const [explicit, setExplicit] = useState<FoulsKey | null>(null);
  const [dir, setDir] = useState<SortDir>("desc");
  const onSort = (k: FoulsKey) => {
    const next = cycleSort(k, explicit, dir);
    setExplicit(next?.sort ?? null);
    setDir(next?.dir ?? "desc");
  };

  const sorted = useMemo(() => {
    const key = explicit ?? "drawn";
    const mul = explicit && dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => mul * (a[key] - b[key]));
  }, [rows, explicit, dir]);

  const visible = expanded ? sorted : sorted.slice(0, 10);
  const GRID = "grid-cols-[2rem_minmax(0,1fr)_6rem_6.5rem]";

  return (
    <div className="mt-6">
      <div className={`grid ${GRID} items-end gap-x-4 border-b border-line pb-2`}>
        <span />
        <span className="font-display text-[11px] font-medium uppercase tracking-wider text-ink-faint">
          Team
        </span>
        <SortHeader k="drawn" label="Drawn" sort={explicit} dir={dir} onSort={onSort} className="text-right" />
        <SortHeader k="conceded" label="Conceded" sort={explicit} dir={dir} onSort={onSort} className="text-right" />
      </div>
      <ol>
        {visible.map((t, i) => (
          <li
            key={t.team}
            className={`grid ${GRID} items-center gap-x-4 border-b border-line-soft py-2.5 ${i >= 10 ? "reveal-row" : ""}`}
            style={revealStyle(i)}
          >
            <span className="text-right font-mono tnum text-xs text-ink-faint">
              {i + 1}
            </span>
            <span className="font-display text-[14px] font-semibold text-ink">
              {t.team}
            </span>
            <span
              className="text-right font-mono tnum text-sm"
              style={{ color: divergingText(t.drawn) }}
            >
              {signed(t.drawn, 1)}
            </span>
            <span
              className="text-right font-mono tnum text-sm"
              style={{ color: divergingText(t.conceded) }}
            >
              {signed(t.conceded, 1)}
            </span>
          </li>
        ))}
      </ol>
      <ShowAllButton
        expanded={expanded}
        total={sorted.length}
        noun="teams"
        onToggle={() => setExpanded((v) => !v)}
      />
      <p className="mt-3 text-xs leading-relaxed text-ink-faint">
        Warm = more drawn free throws than expected, cool = fewer; for
        conceded, warm means the defense gives them up.
      </p>
    </div>
  );
}

type DefColKey = "shotsFaced" | "rimRate" | "ptsAllowed100" | "metric";

/** Defence pillars: rank, team, shots faced, rim %, pts/100, active pillar. */
function DefenseTable({ rows, pillar, label }: {
  rows: DefenseTeamRow[];
  pillar: DefKey;
  label: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [explicit, setExplicit] = useState<DefColKey | null>(null);
  const [dir, setDir] = useState<SortDir>("desc");
  const onSort = (k: DefColKey) => {
    const next = cycleSort(k, explicit, dir);
    setExplicit(next?.sort ?? null);
    setDir(next?.dir ?? "desc");
  };

  const sorted = useMemo(() => {
    const key = explicit ?? "metric";
    const mul = explicit && dir === "asc" ? 1 : -1;
    const num = (t: DefenseTeamRow) => (key === "metric" ? t[pillar] : t[key]);
    return [...rows].sort((a, b) => mul * (num(a) - num(b)));
  }, [rows, explicit, dir, pillar]);

  const max = Math.max(...rows.map((r) => Math.abs(r[pillar])), 0.0001);
  const visible = expanded ? sorted : sorted.slice(0, 10);
  const fmt = (v: number) => (pillar === "qualityForced" ? signed(v, 3) : signed(v, 2));
  const GRID =
    "grid-cols-[2rem_minmax(0,1fr)_7rem] sm:grid-cols-[2.5rem_minmax(0,1fr)_7rem_6rem_6rem_9.5rem]";

  return (
    <div className="mt-6">
      <div className={`grid ${GRID} items-end gap-x-4 border-b border-line pb-2`}>
        <span />
        <span className="font-display text-[11px] font-medium uppercase tracking-wider text-ink-faint">
          Team
        </span>
        <SortHeader k="shotsFaced" label="Shots faced" sort={explicit} dir={dir} onSort={onSort} className="hidden text-right sm:block" />
        <SortHeader k="rimRate" label="Rim %" sort={explicit} dir={dir} onSort={onSort} className="hidden text-right sm:block" />
        <SortHeader k="ptsAllowed100" label="Pts/100" sort={explicit} dir={dir} onSort={onSort} className="hidden text-right sm:block" />
        <SortHeader k="metric" label={label} sort={explicit} dir={dir} onSort={onSort} className="text-right" />
      </div>
      <ol>
        {visible.map((t, i) => (
          <li
            key={t.teamId}
            className={`grid ${GRID} items-center gap-x-4 border-b border-line-soft py-2.5 ${i >= 10 ? "reveal-row" : ""}`}
            style={revealStyle(i)}
          >
            <span className="text-right font-mono tnum text-xs text-ink-faint">
              {i + 1}
            </span>
            <span className="font-display text-[14px] font-semibold text-ink">
              {t.team}
            </span>
            <span className="hidden text-right font-mono tnum text-sm text-ink-soft sm:block">
              {int(t.shotsFaced)}
            </span>
            <span className="hidden text-right font-mono tnum text-sm text-ink-soft sm:block">
              {t.rimRate.toFixed(1)}
            </span>
            <span className="hidden text-right font-mono tnum text-sm text-ink-soft sm:block">
              {t.ptsAllowed100.toFixed(1)}
            </span>
            <span className="flex items-center justify-end gap-3">
              <Bar value={t[pillar]} max={max} className="hidden w-16 sm:block" />
              <span
                className="w-16 text-right font-mono tnum text-lg"
                style={{ color: divergingText(t[pillar]) }}
              >
                {fmt(t[pillar])}
              </span>
            </span>
          </li>
        ))}
      </ol>
      <ShowAllButton
        expanded={expanded}
        total={sorted.length}
        noun="teams"
        onToggle={() => setExpanded((v) => !v)}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */

export default function League() {
  const { lg, season: seasonParam, lens: lensParam } = useParams();
  const data = useData();
  const { league } = useLeague();
  const navigate = useNavigate();
  const def = leagueDef(league);
  const seasons = data.meta.seasons;

  const hasDefense = !!def.layers?.defense;
  const hasCoaching = !!def.layers?.coaching;
  const defState = useDefense(hasDefense ? league : null);
  const defMeta = defState.status === "ready" ? defState.data.meta : null;

  // Old exports predate the team shot-value columns; hide those lenses
  // rather than rendering a column of dashes.
  const hasSv = useMemo(
    () =>
      Object.values(data.teams ?? {}).some((rows) =>
        rows.some((t) => t.sv100 != null),
      ),
    [data.teams],
  );

  const lenses: LensKey[] = [
    ...BASE_LENSES.filter((l) => l.key === "fouls" || hasSv).map((l) => l.key),
    ...(hasDefense ? DEF_LENSES.map((l) => l.key) : []),
  ];
  const fallback: LensKey = hasSv ? "value" : "fouls";
  // League, season and lens come from the path. `lenses` stays the authority on
  // which ones this league actually has a page for (the defence pillars need
  // the team-defence layer), so a URL naming one it lacks is redirected rather
  // than silently rendered as another lens.
  const urlLens = leagueLensKey(lensParam);
  const lensValid = !!urlLens && lenses.includes(urlLens as LensKey);
  const lens = (lensValid ? urlLens : fallback) as LensKey;
  const currentSeason = data.meta.defaultSeason;
  const seasonValid = !seasonParam || seasons.includes(seasonParam);
  const season = seasonParam && seasonValid ? seasonParam : currentSeason;
  const leagueValid = !!lg && (ACTIVE_LEAGUES as string[]).includes(lg);

  useTitle(
    `${LEAGUE_LABEL[league]} team ${LENS_TITLE_WORD[lens]} ${season} · Over Expected`,
  );

  const go = (lensKey: LensKey, s: string) =>
    navigate(
      leaguePath(league, leagueLensSlug(lensKey), datedPart(s, currentSeason)),
    );

  // Every hook runs before this point on every path, valid or not: bailing out
  // earlier would change the hook count between renders (React #310).
  if (!leagueValid) {
    return <Navigate to={leaguePath(league, DEFAULT_LEAGUE_LENS)} replace />;
  }
  if (!lensValid || !seasonValid) {
    return (
      <Navigate
        to={leaguePath(
          lg as League,
          leagueLensSlug(lens),
          datedPart(season, currentSeason),
        )}
        replace
      />
    );
  }

  const isDefLens = (DEF_KEYS as readonly string[]).includes(lens);
  const baseRows = data.teams[season] ?? [];
  const defRows = defState.status === "ready" ? defState.data.teams[season] ?? [] : [];
  const activeBase = BASE_LENSES.find((l) => l.key === lens);
  const activePillar = defMeta?.pillars.find((p) => p.key === lens);

  return (
    <div className="mx-auto max-w-3xl px-5 py-12 sm:px-8 sm:py-16">
      <h1 className="font-display text-3xl font-bold tracking-tight text-balance text-ink sm:text-5xl">
        {LEAGUE_LABEL[league]} context
      </h1>
      <p className="mt-3 max-w-prose text-sm leading-relaxed text-ink-soft sm:text-base">
        Is it the player, or the situation around him? The team layer under
        every number on the site: what each team creates, converts, draws, and
        concedes, scored against the season's league expectation.
      </p>

      <SegmentedControl
        ariaLabel="Season"
        className="mt-8"
        options={seasons.map((s) => ({
          value: s,
          label: s,
          shortLabel: `'${s.slice(2, 4)}-${s.slice(5)}`,
        }))}
        value={season}
        onChange={(s) => go(lens, s)}
      />

      {/* the lens picker */}
      <div className="mt-5 flex flex-wrap gap-2" role="group" aria-label="Metric">
        {BASE_LENSES.filter((l) => l.key === "fouls" || hasSv).map((l) => (
          <button
            key={l.key}
            type="button"
            aria-pressed={lens === l.key}
            onClick={() => go(l.key, season)}
            className={`group flex flex-col items-start gap-0.5 rounded-md border px-3 py-2 text-left transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${
              lens === l.key ? "border-ink bg-ink text-paper" : "border-line hover:bg-wash"
            }`}
          >
            <span className="font-display text-[13px] font-medium transition-transform duration-150 group-active:scale-[0.97]">
              {l.label}
            </span>
            <span
              className={`font-mono tnum text-[10px] ${
                lens === l.key ? "text-paper/70" : "text-ink-faint"
              }`}
            >
              {l.sub}
            </span>
          </button>
        ))}
        {hasDefense &&
          DEF_LENSES.map((l) => {
            const sb = defMeta?.pillars.find((p) => p.key === l.key)?.spearmanBrown;
            return (
              <button
                key={l.key}
                type="button"
                aria-pressed={lens === l.key}
                onClick={() => go(l.key, season)}
                className={`group flex flex-col items-start gap-0.5 rounded-md border px-3 py-2 text-left transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${
                  lens === l.key ? "border-ink bg-ink text-paper" : "border-line hover:bg-wash"
                }`}
              >
                <span className="font-display text-[13px] font-medium transition-transform duration-150 group-active:scale-[0.97]">
                  {l.label}
                </span>
                <span
                  className={`font-mono tnum text-[10px] ${
                    lens === l.key ? "text-paper/70" : "text-ink-faint"
                  }`}
                >
                  {sb ? `reliability ${sb.toFixed(2)} · ${reliabilityWord(sb)}` : "defence pillar"}
                </span>
              </button>
            );
          })}
      </div>

      {/* what the active lens measures */}
      {activeBase && (
        <p className="mt-4 max-w-2xl text-xs leading-relaxed text-ink-soft">
          <strong className="font-display font-semibold text-ink">
            {activeBase.label}:
          </strong>{" "}
          {activeBase.explain}
        </p>
      )}
      {isDefLens &&
        (activePillar ? (
          <p className="mt-4 max-w-2xl text-xs leading-relaxed text-ink-soft">
            <strong className="font-display font-semibold text-ink">
              {activePillar.label}:
            </strong>{" "}
            {activePillar.note} Unit: {activePillar.unit}.
          </p>
        ) : (
          <div className="mt-4 h-8 max-w-2xl animate-pulse rounded bg-wash" />
        ))}

      {/* free throws keep their two-ended scatter */}
      {lens === "fouls" && (
        <section className="mt-10">
          <h2 className="font-display text-xl font-semibold tracking-tight text-ink sm:text-2xl">
            Drawn vs conceded, {season}
          </h2>
          <p className="mt-1.5 max-w-prose text-sm text-ink-soft">
            Both ends at once: drawn is the offense, conceded is the defense.
            Top-right both draws a lot and gives a lot up.
          </p>
          <div className="mt-6">
            <TeamScatter
              teams={baseRows}
              off={(t) => t.drawn}
              def={(t) => t.conceded}
              xAxis="draws more →"
              defLabel="Conceded"
            />
          </div>
          <p className="mt-2 max-w-prose text-xs leading-relaxed text-ink-faint">
            Each dot is a team, centered on the league average on both axes.
            Warm dots draw more than they concede, cool dots the reverse.
          </p>
        </section>
      )}

      {/* the ranking */}
      <section className={lens === "fouls" ? "mt-14" : "mt-10"}>
        <h2 className="font-display text-xl font-semibold tracking-tight text-ink sm:text-2xl">
          {lens === "fouls"
            ? "Who draws, who concedes"
            : `${(activeBase ?? { label: activePillar?.label ?? "" }).label}, ${season}`}
        </h2>
        {isDefLens ? (
          defState.status === "loading" ? (
            <div className="mt-6 h-64 animate-pulse rounded bg-wash" aria-busy="true" />
          ) : defState.status === "error" ? (
            <p className="mt-6 text-sm text-ink-soft">
              The defence data failed to load.
            </p>
          ) : defRows.length === 0 ? (
            <p className="py-16 text-center text-sm text-ink-faint">
              No teams for {season}.
            </p>
          ) : (
            <DefenseTable
              rows={defRows}
              pillar={lens as DefKey}
              label={activePillar?.label ?? ""}
            />
          )
        ) : baseRows.length === 0 ? (
          <p className="py-16 text-center text-sm text-ink-faint">
            No teams for {season}.
          </p>
        ) : lens === "fouls" ? (
          <FoulsTable rows={baseRows} />
        ) : (
          <SingleMetricTable
            rows={baseRows}
            label={activeBase!.label}
            metric={(t) => (lens === "value" ? t.sv100 ?? null : t.make100 ?? null)}
          />
        )}
      </section>

      {/* the foul environment over time, where the lens is about fouls */}
      {lens === "fouls" && (
        <section className="mt-16 border-t border-line pt-12">
          <h2 className="font-display text-xl font-semibold tracking-tight text-ink sm:text-2xl">
            The foul environment, over time
          </h2>
          <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-ink-soft">
            League-wide drawn free throws per 100 possessions, season by season.
            The whistle environment moves year to year, which is exactly why
            every expectation here is anchored within its own season before
            players are compared.
          </p>
          <div className="mt-6 max-w-2xl">
            <LeagueTrend
              seasons={seasons}
              rates={data.meta.leagueRateBySeason}
              crackdownSeason={leagueDef(league).crackdownSeason}
            />
          </div>
        </section>
      )}

      {/* the decision-EV layer, below the team ranking */}
      {hasCoaching && <ClutchDecisions league={league} />}
    </div>
  );
}
