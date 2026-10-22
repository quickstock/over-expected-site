import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useAllData, useLeague } from "../data";
import { ACTIVE_LEAGUES, LEAGUE_DEFS, LEAGUE_LABEL, type League } from "../leagues";
import {
  COLOR_KEYS,
  DEFAULT_PRESET,
  PRESETS,
  STAT,
  STATS,
  buildPoints,
  fmtStat,
  isStat,
  leaguePercentiles,
  ols,
  pearson,
  readR,
  type LeagueChoice,
  type Point,
  type StatKey,
} from "../lib/explore";
import { divergingColor } from "../lib/color";
import { int, searchKey } from "../lib/format";
import { useTitle } from "../lib/useTitle";
import SegmentedControl from "../components/SegmentedControl";
import ExploreScatter, { downloadPng, type Plotted } from "../components/charts/ExploreScatter";

const POSITIONS = ["Guard", "Forward", "Center"] as const;
const MAX_MARKED = 8;

const selectClass =
  "w-full rounded-md border border-line bg-paper px-3 py-2 font-display text-[13px] font-medium text-ink focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-ink";

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block min-w-0 ${className}`}>
      <span className="font-display text-[11px] font-medium uppercase tracking-wider text-ink-faint">
        {label}
      </span>
      <span className="mt-1.5 block">{children}</span>
    </label>
  );
}

function StatSelect({ value, onChange, label }: { value: StatKey; onChange: (k: StatKey) => void; label: string }) {
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value as StatKey)} className={selectClass}>
      <optgroup label="Over expected">
        {STATS.filter((s) => s.signed).map((s) => (
          <option key={s.key} value={s.key}>{s.label}</option>
        ))}
      </optgroup>
      <optgroup label="Rates and volume">
        {STATS.filter((s) => !s.signed).map((s) => (
          <option key={s.key} value={s.key}>{s.label}</option>
        ))}
      </optgroup>
    </select>
  );
}

/**
 * /explore: the chart builder. Any two published numbers on the axes, one
 * league or all nine, one season, filters, colour by an over-expected figure,
 * search to mark players. Everything a reader sets lives in the query string,
 * so the URL is the chart and sharing it shares the view.
 *
 * The league follows the nav: the chart's league picker sets the site league
 * (so the colour poles reskin with it), and switching in the nav updates the
 * chart. "All nine" is the one choice the nav cannot hold, so it lives only in
 * the URL, and it defaults to within-league percentiles: every over-expected
 * figure is measured against its own league, so only its rank there compares.
 */
export default function Explore() {
  useTitle("Explore: plot any two numbers · Over Expected");
  const all = useAllData();
  const { league, setLeague } = useLeague();
  const [params, setParams] = useSearchParams();

  const set = (patch: Record<string, string | null>) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(patch)) {
          if (v === null) next.delete(k);
          else next.set(k, v);
        }
        return next;
      },
      { replace: true },
    );

  // ---- league: URL seeds it, the nav owns it afterwards ------------------
  const lgParam = params.get("lg");
  const urlLeague = lgParam && (ACTIVE_LEAGUES as string[]).includes(lgParam) ? (lgParam as League) : null;
  const choice: LeagueChoice = lgParam === "ALL" ? "ALL" : urlLeague ?? league;
  useEffect(() => {
    if (urlLeague && urlLeague !== league) setLeague(urlLeague);
    // mount only: a shared link decides the league once, then the nav does
  }, []);
  const prevLeague = useRef(league);
  useEffect(() => {
    if (prevLeague.current === league) return;
    prevLeague.current = league;
    if (choice !== "ALL" && choice !== league) set({ lg: league });
  }, [league]);

  const leagues: League[] = choice === "ALL" ? ACTIVE_LEAGUES.filter((lg) => all[lg]) : [choice];
  const base = all[choice === "ALL" ? league : choice];

  // ---- season ------------------------------------------------------------
  const seasons = useMemo(() => {
    const s = new Set<string>();
    for (const lg of leagues) for (const x of all[lg]?.meta.seasons ?? []) s.add(x);
    return [...s].sort();
  }, [all, leagues.join()]);
  const defaultSeason = base?.meta.defaultSeason ?? seasons[seasons.length - 1];
  const season = seasons.includes(params.get("s") ?? "") ? params.get("s")! : defaultSeason;

  // ---- axes, colour, filters -------------------------------------------
  const x: StatKey = isStat(params.get("x")) ? (params.get("x") as StatKey) : DEFAULT_PRESET.x;
  const y: StatKey = isStat(params.get("y")) ? (params.get("y") as StatKey) : DEFAULT_PRESET.y;
  const cParam = params.get("c");
  const c: StatKey | null = cParam && COLOR_KEYS.includes(cParam as StatKey) ? (cParam as StatKey) : null;
  const pct = params.get("scale") ? params.get("scale") === "pct" : choice === "ALL";
  const posParam = params.get("pos");
  const minPoss = Math.max(0, Number(params.get("min")) || 0);
  const marked = useMemo(
    () => new Set((params.get("h") ?? "").split(",").filter(Boolean).slice(0, MAX_MARKED)),
    [params],
  );
  const [selected, setSelected] = useState<string | null>(null);

  const pool = useMemo(
    () => leagues.flatMap((lg) => (all[lg] ? buildPoints(all[lg]!, lg, season) : [])),
    [all, leagues.join(), season],
  );
  // Only three leagues publish positions, so across all nine a position
  // filter would silently drop the other six.
  const hasPos = choice !== "ALL" && pool.some((p) => p.pos);
  const pos = hasPos && POSITIONS.includes(posParam as (typeof POSITIONS)[number]) ? posParam : null;
  const maxPoss = useMemo(() => Math.max(0, ...pool.map((p) => p.v.poss)), [pool]);

  // Percentiles rank against the whole qualified league pool, before the
  // reader's filters, so filtering to guards does not re-rank the guards.
  const pctX = useMemo(() => leaguePercentiles(pool, x), [pool, x]);
  const pctY = useMemo(() => leaguePercentiles(pool, y), [pool, y]);

  const plotted: Plotted[] = useMemo(() => {
    const out: Plotted[] = [];
    for (const p of pool) {
      if (pos && p.pos !== pos) continue;
      if (p.v.poss < minPoss) continue;
      const vx = pct ? pctX.get(p.key) : p.v[x];
      const vy = pct ? pctY.get(p.key) : p.v[y];
      if (vx === undefined || vy === undefined || !Number.isFinite(vx) || !Number.isFinite(vy)) continue;
      out.push({ p, x: vx, y: vy, c: c ? p.v[c] : null });
    }
    return out;
  }, [pool, pos, minPoss, pct, pctX, pctY, x, y, c]);

  const stats = useMemo(() => {
    const xs = plotted.map((d) => d.x);
    const ys = plotted.map((d) => d.y);
    return { r: pearson(xs, ys), trend: plotted.length >= 3 ? ols(xs, ys) : null };
  }, [plotted]);
  const byLeague = useMemo(() => {
    if (choice !== "ALL") return [];
    return leagues
      .map((lg) => {
        const g = plotted.filter((d) => d.p.lg === lg);
        return { lg, n: g.length, r: pearson(g.map((d) => d.x), g.map((d) => d.y)) };
      })
      .filter((g) => g.n >= 20);
  }, [plotted, choice, leagues.join()]);
  const colorMax = useMemo(() => {
    if (!c || plotted.length === 0) return 1;
    const a = plotted.map((d) => Math.abs(d.c ?? 0)).sort((p, q) => p - q);
    return Math.max(0.5, a[Math.floor(a.length * 0.95)]);
  }, [plotted, c]);

  const xDef = STAT[x];
  const yDef = STAT[y];
  const cDef = c ? STAT[c] : null;
  const diagonal = !pct && !!xDef.group && xDef.group === yDef.group;
  const preset = PRESETS.find((p) => p.x === x && p.y === y);
  const showLeague = choice === "ALL";

  // ---- search and marking ----------------------------------------------
  const [query, setQuery] = useState("");
  const results = useMemo(() => {
    const q = searchKey(query.trim());
    if (q.length < 2) return [];
    return pool
      .filter((p) => !marked.has(p.key) && searchKey(p.name).includes(q))
      .sort((a, b) => b.v.poss - a.v.poss)
      .slice(0, 6);
  }, [query, pool, marked]);
  const toggleMark = (key: string) => {
    const next = new Set(marked);
    if (next.has(key)) next.delete(key);
    else if (next.size < MAX_MARKED) next.add(key);
    set({ h: next.size ? [...next].join(",") : null });
  };
  const byKey = useMemo(() => new Map(pool.map((p) => [p.key, p])), [pool]);
  const sel = selected ? plotted.find((d) => d.p.key === selected) : undefined;

  // ---- share -------------------------------------------------------------
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [copied, setCopied] = useState(false);
  const scope = choice === "ALL" ? "all nine leagues" : LEAGUE_LABEL[choice];
  const heading = `${yDef.label} vs ${xDef.label}`;
  const sub = `${scope}, ${season} · ${int(plotted.length)} qualified players${pct ? " · percentile within league" : ""}${
    Number.isFinite(stats.r) ? ` · r = ${stats.r.toFixed(2)}` : ""
  }`;

  const [tableOpen, setTableOpen] = useState(false);
  const tableRows = useMemo(
    () => (tableOpen ? [...plotted].sort((a, b) => b.y - a.y) : []),
    [tableOpen, plotted],
  );

  const playerHref = (p: Point) =>
    `/player/${p.lg}/${p.id}?season=${encodeURIComponent(season)}&lens=${yDef.lens ?? xDef.lens ?? "value"}`;

  if (!base) {
    return (
      <div className="mx-auto max-w-5xl px-5 py-24 sm:px-8" aria-busy="true">
        <div className="h-10 w-72 animate-pulse rounded bg-wash" />
        <div className="mt-6 h-96 animate-pulse rounded bg-wash" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-5 pb-24 sm:px-8">
      <header className="pt-8 sm:pt-10">
        <h1 className="font-display text-4xl font-bold leading-[1.05] tracking-tight text-ink sm:text-[2.75rem]">
          Plot any two numbers
        </h1>
        <p className="mt-2 max-w-prose text-[15px] leading-relaxed text-ink-soft">
          Every dot is a qualified player. Tap one for his numbers, mark players
          by name, and share the link: it carries the whole chart.
        </p>
      </header>

      <section className="mt-5" aria-label="Start from a question">
        <p className="font-display text-[11px] font-medium uppercase tracking-wider text-ink-faint">
          Start from a question
        </p>
        <div className="-mx-5 mt-2 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
          {PRESETS.map((p) => {
            const on = p === preset;
            return (
              <button
                key={p.id}
                type="button"
                aria-pressed={on}
                onClick={() => set({ x: p.x, y: p.y })}
                className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-left font-display text-[13px] font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${
                  on ? "border-ink bg-ink text-paper" : "border-line text-ink-soft hover:border-ink-faint hover:text-ink"
                }`}
              >
                {p.question}
              </button>
            );
          })}
        </div>
      </section>

      <div className="mt-6 flex flex-col gap-6 lg:grid lg:grid-cols-[17rem_minmax(0,1fr)] lg:items-start lg:gap-x-10 lg:gap-y-6">
        <section className="grid grid-cols-2 gap-x-4 gap-y-4 lg:col-start-1 lg:row-start-1 lg:grid-cols-1" aria-label="Chart settings">
          <Field label="Across (x)" className="col-span-2 sm:col-span-1 lg:col-span-1">
            <StatSelect label="Across (x)" value={x} onChange={(k) => set({ x: k })} />
          </Field>
          <Field label="Up (y)" className="col-span-2 sm:col-span-1 lg:col-span-1">
            <span className="flex gap-2">
              <StatSelect label="Up (y)" value={y} onChange={(k) => set({ y: k })} />
              <button
                type="button"
                onClick={() => set({ x: y, y: x })}
                aria-label="Swap the axes"
                title="Swap the axes"
                className="shrink-0 rounded-md border border-line px-2.5 font-mono text-sm text-ink-soft transition-colors duration-150 hover:border-ink-faint hover:text-ink"
              >
                ⇄
              </button>
            </span>
          </Field>
          <Field label="League">
            <select
              value={choice}
              onChange={(e) => {
                const v = e.target.value as LeagueChoice;
                if (v === "ALL") set({ lg: "ALL", scale: null });
                else {
                  set({ lg: v, scale: null, pos: null });
                  setLeague(v);
                }
                setSelected(null);
              }}
              className={selectClass}
            >
              {ACTIVE_LEAGUES.map((lg) => (
                <option key={lg} value={lg}>{LEAGUE_LABEL[lg]}</option>
              ))}
              <option value="ALL">All nine leagues</option>
            </select>
          </Field>
          <Field label="Season">
            <select value={season} onChange={(e) => set({ s: e.target.value })} className={selectClass}>
              {[...seasons].reverse().map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </Field>
        </section>
        <section className="min-w-0 border-t border-line pt-5 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:border-t-0 lg:pt-0" aria-label="Chart">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
            <p className="font-display text-[15px] text-ink">
              {Number.isFinite(stats.r) ? (
                <>
                  <span className="font-mono tnum font-semibold">r = {stats.r.toFixed(2)}</span>
                  <span className="text-ink-soft">: {readR(stats.r)}</span>
                </>
              ) : (
                <span className="text-ink-soft">Too few players to measure a relationship.</span>
              )}
              <span className="ml-2 font-mono tnum text-xs text-ink-faint">n = {int(plotted.length)}</span>
            </p>
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(window.location.href).then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1600);
                  });
                }}
                className="font-display text-sm font-medium text-ink underline decoration-line underline-offset-4 transition-colors duration-150 hover:decoration-ink"
              >
                {copied ? "Link copied" : "Copy link"}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (svgRef.current) downloadPng(svgRef.current, heading, sub, `over-expected-${y}-vs-${x}.png`);
                }}
                className="font-display text-sm font-medium text-ink underline decoration-line underline-offset-4 transition-colors duration-150 hover:decoration-ink"
              >
                Download PNG
              </button>
            </div>
          </div>
          {cDef && (
            <div className="mt-3 flex items-center gap-3 font-mono tnum text-[11px] text-ink-faint">
              <span>{fmtStat(cDef, -colorMax, false)}</span>
              <span
                aria-hidden="true"
                className="h-2 w-40 rounded-full"
                style={{
                  background: `linear-gradient(to right, ${divergingColor(-99)}, ${divergingColor(0)}, ${divergingColor(99)})`,
                }}
              />
              <span>{fmtStat(cDef, colorMax, false)}</span>
              <span className="font-display text-ink-soft">{cDef.label}</span>
            </div>
          )}

          <div className="mt-3">
            {plotted.length === 0 ? (
              <p className="py-24 text-center font-display text-ink-soft">
                No qualified players match. Loosen the filters or pick another season.
              </p>
            ) : (
              <ExploreScatter
                points={plotted}
                xDef={xDef}
                yDef={yDef}
                pct={pct}
                colorDef={cDef}
                colorMax={colorMax}
                marked={marked}
                selected={selected}
                onSelect={setSelected}
                trend={stats.trend}
                diagonal={diagonal}
                showLeague={showLeague}
                svgRef={svgRef}
              />
            )}
          </div>
          <p className="mt-2 font-mono text-[11px] text-ink-faint">
            Solid line: least-squares trend. Dotted: the average on each axis.
            {diagonal && " Dashed: y = x."}
          </p>

          {sel && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-md border border-line px-4 py-3">
              <div className="min-w-0">
                <p className="font-display text-[15px] font-semibold text-ink">{sel.p.name}</p>
                <p className="font-mono tnum text-xs text-ink-soft">
                  {sel.p.team} · {LEAGUE_LABEL[sel.p.lg]} · {xDef.label} {fmtStat(xDef, sel.x, pct)} · {yDef.label}{" "}
                  {fmtStat(yDef, sel.y, pct)}
                  {cDef && sel.c !== null && ` · ${cDef.label} ${fmtStat(cDef, sel.c, false)}`}
                </p>
              </div>
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => toggleMark(sel.p.key)}
                  className="font-display text-sm font-medium text-ink-soft transition-colors duration-150 hover:text-ink"
                >
                  {marked.has(sel.p.key) ? "Unmark" : "Mark"}
                </button>
                <Link
                  to={playerHref(sel.p)}
                  className="rounded-md bg-ink px-4 py-2 font-display text-sm font-medium text-paper transition-opacity duration-150 hover:opacity-85"
                >
                  Open player →
                </Link>
              </div>
            </div>
          )}

        </section>
        <div className="flex flex-col gap-5 lg:col-start-1 lg:row-span-2 lg:row-start-2">
          <section className="flex flex-wrap items-end gap-x-6 gap-y-4 lg:flex-col lg:items-stretch" aria-label="Filters">
            <Field label="Colour by" className="w-full sm:w-56 lg:w-full">
              <select value={c ?? ""} onChange={(e) => set({ c: e.target.value || null })} className={selectClass}>
                <option value="">Nothing</option>
                {COLOR_KEYS.map((k) => (
                  <option key={k} value={k}>{STAT[k].label}</option>
                ))}
              </select>
            </Field>
            <div>
              <p className="font-display text-[11px] font-medium uppercase tracking-wider text-ink-faint">Scale</p>
              <SegmentedControl
                className="mt-1.5"
                ariaLabel="Scale"
                options={[
                  { value: "raw", label: "Raw" },
                  { value: "pct", label: "Percentile in league" },
                ]}
                value={pct ? "pct" : "raw"}
                onChange={(v) => set({ scale: v })}
              />
            </div>
            {hasPos && (
              <div>
                <p className="font-display text-[11px] font-medium uppercase tracking-wider text-ink-faint">Position</p>
                <SegmentedControl
                  className="mt-1.5"
                  ariaLabel="Position"
                  options={[
                    { value: "", label: "All" },
                    { value: "Guard", label: "Guards" },
                    { value: "Forward", label: "Forwards" },
                    { value: "Center", label: "Centers" },
                  ]}
                  value={pos ?? ""}
                  onChange={(v) => set({ pos: v || null })}
                />
              </div>
            )}
            <Field label={`Minimum possessions: ${minPoss > 0 ? int(minPoss) : "league floor"}`} className="w-full sm:w-60 lg:w-full">
              <input
                type="range"
                min={0}
                max={Math.max(100, Math.floor(maxPoss / 50) * 50)}
                step={25}
                value={minPoss}
                onChange={(e) => set({ min: e.target.value === "0" ? null : e.target.value })}
                className="w-full accent-[var(--color-ink)]"
              />
            </Field>
          </section>
          <section aria-label="Mark players">
            <div className="relative max-w-sm">
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && results[0]) {
                    toggleMark(results[0].key);
                    setQuery("");
                  }
                }}
                placeholder={marked.size >= MAX_MARKED ? `Up to ${MAX_MARKED} marked players` : "Mark a player…"}
                disabled={marked.size >= MAX_MARKED}
                aria-label="Mark a player on the chart"
                className="w-full rounded-md border border-line bg-paper px-3 py-2 font-display text-[14px] text-ink placeholder:text-ink-faint focus:border-ink-faint focus:outline-none focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-ink"
              />
              {results.length > 0 && (
                <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border border-line bg-paper shadow-sm">
                  {results.map((p) => (
                    <li key={p.key}>
                      <button
                        type="button"
                        onClick={() => {
                          toggleMark(p.key);
                          setQuery("");
                        }}
                        className="flex w-full items-baseline justify-between gap-3 px-3 py-2 text-left font-display text-[13px] text-ink transition-colors duration-100 hover:bg-wash"
                      >
                        <span className="truncate">{p.name}</span>
                        <span className="shrink-0 font-mono tnum text-xs text-ink-faint">
                          {p.team} · {LEAGUE_DEFS[p.lg].short}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {marked.size > 0 && (
              <ul className="mt-3 flex flex-wrap gap-2">
                {[...marked].map((k) => {
                  const p = byKey.get(k);
                  return (
                    <li key={k}>
                      <button
                        type="button"
                        onClick={() => toggleMark(k)}
                        aria-label={`Unmark ${p?.name ?? k}`}
                        className="flex items-center gap-1.5 rounded-full border border-ink px-2.5 py-1 font-display text-xs font-medium text-ink transition-colors duration-150 hover:bg-wash"
                      >
                        {p ? p.name : "Not in this season"}
                        <span aria-hidden="true" className="text-ink-faint">×</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
        <section className="min-w-0 lg:col-start-2 lg:row-start-3" aria-label="Reading the chart">
          {preset && (
            <p className="mt-5 max-w-prose text-sm leading-relaxed text-ink-soft">
              <span className="font-display font-semibold text-ink">{preset.question}</span>{" "}
              {preset.note}
            </p>
          )}
          {choice === "ALL" && !pct && (
            <p className="mt-4 max-w-prose text-sm leading-relaxed text-ink-soft">
              Raw values across leagues: every over-expected figure is measured
              against its own league and season, so a +3 in one league and a +3 in
              another are not the same achievement. The percentile scale compares
              them fairly.
            </p>
          )}
          {byLeague.length > 1 && (
            <div className="mt-5">
              <p className="font-display text-[11px] font-medium uppercase tracking-wider text-ink-faint">
                The same relationship, league by league
              </p>
              <ul className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3">
                {byLeague.map((g) => (
                  <li key={g.lg} className="flex items-baseline justify-between gap-3 border-b border-line-soft py-1 font-mono tnum text-xs">
                    <span className="font-display text-[13px] text-ink">{LEAGUE_DEFS[g.lg].short}</span>
                    <span className="text-ink-soft">
                      r {Number.isFinite(g.r) ? g.r.toFixed(2) : "–"} <span className="text-ink-faint">n {g.n}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <details className="mt-6" onToggle={(e) => setTableOpen((e.target as HTMLDetailsElement).open)}>
            <summary className="cursor-pointer font-display text-sm font-medium text-ink">
              The numbers behind the dots
            </summary>
            {tableOpen && (
              <div className="mt-3 max-h-[28rem] overflow-auto rounded-md border border-line-soft">
                <table className="w-full text-left text-[13px]">
                  <thead className="sticky top-0 bg-paper">
                    <tr className="border-b border-line font-display text-[11px] uppercase tracking-wider text-ink-faint">
                      <th scope="col" className="px-3 py-2 font-medium">Player</th>
                      <th scope="col" className="px-3 py-2 font-medium">Team</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">{xDef.label}</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">{yDef.label}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tableRows.map((d) => (
                      <tr key={d.p.key} className="border-b border-line-soft">
                        <td className="px-3 py-1.5">
                          <Link to={playerHref(d.p)} className="font-display text-ink hover:underline hover:underline-offset-2">
                            {d.p.name}
                          </Link>
                        </td>
                        <td className="px-3 py-1.5 font-mono text-xs text-ink-soft">
                          {d.p.team}{showLeague ? ` · ${LEAGUE_DEFS[d.p.lg].short}` : ""}
                        </td>
                        <td className="px-3 py-1.5 text-right font-mono tnum text-ink-soft">{fmtStat(xDef, d.x, pct)}</td>
                        <td className="px-3 py-1.5 text-right font-mono tnum text-ink">{fmtStat(yDef, d.y, pct)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </details>

          <p className="mt-6 max-w-prose text-xs leading-relaxed text-ink-faint">
            Qualified players only: at least{" "}
            {choice === "ALL" ? "each league's possession floor" : `${int(base.meta.qualifyPossessions)} possessions`}{" "}
            in the season. Every number is the one the boards publish; how each is
            built is on the{" "}
            <Link to="/methodology" className="underline underline-offset-2 hover:text-ink">methodology page</Link>
            {" "}and in the{" "}
            <Link to="/glossary" className="underline underline-offset-2 hover:text-ink">glossary</Link>.
          </p>
        </section>
      </div>
    </div>
  );
}
