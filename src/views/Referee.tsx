import { Link, useParams, useSearchParams } from "react-router-dom";
import { useArchive, useData, useLeague } from "../data";
import { datedPart, refereesPath } from "../routes";
import { leagueDef, type League } from "../leagues";
import { useTitle } from "../lib/useTitle";
import ArchiveWait from "../components/ArchiveWait";
import IntervalBar, { intervalDomain } from "../components/IntervalBar";
import { int, signed } from "../lib/format";
import SegmentedControl from "../components/SegmentedControl";
import type { WhistleEstimate } from "../types";

const SCRIPT_LABEL: Record<string, { label: string; sub: string }> = {
  close: { label: "Close", sub: "decided by ≤ 5" },
  mid: { label: "Middling", sub: "6 to 12" },
  blowout: { label: "Blowout", sub: "13 or more" },
};

function NotFound({ minGames, league }: { minGames: number; league: League }) {
  return (
    <div className="mx-auto max-w-xl px-5 py-28 text-center sm:px-8">
      <p className="font-display text-2xl font-semibold text-ink">
        No profile for this official.
      </p>
      <p className="mt-3 text-sm leading-relaxed text-ink-soft">
        Profiles require at least {minGames} games in a season.
      </p>
      <Link
        to={refereesPath(league)}
        className="mt-8 inline-block rounded-md bg-ink px-5 py-2.5 font-display text-sm font-medium text-paper transition-opacity duration-150 hover:opacity-85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        All referees
      </Link>
    </div>
  );
}

function Stat({
  value,
  label,
  sub,
  delay,
}: {
  value: React.ReactNode;
  label: string;
  sub?: string;
  delay: number;
}) {
  return (
    <div
      className="flex translate-y-0 flex-col gap-1.5 px-1 py-4 opacity-100 transition-[opacity,transform] duration-500 starting:translate-y-2 starting:opacity-0 sm:py-1"
      style={{ transitionDelay: `${delay}ms` }}
    >
      <span className="font-display text-[11px] font-medium uppercase tracking-wider text-ink-faint">
        {label}
      </span>
      <span className="font-mono tnum text-3xl text-ink sm:text-4xl">
        {value}
      </span>
      {sub && <span className="text-xs text-ink-soft">{sub}</span>}
    </div>
  );
}

/** The shrunk estimate where the league can measure its noise, else raw. */
const value = (w: WhistleEstimate) => w.est ?? w.diff;
const range = (w: WhistleEstimate) =>
  w.lo !== null && w.hi !== null ? `90% range ${signed(w.lo, 1)} to ${signed(w.hi, 1)}` : "unshrunk";

/**
 * One row per slice (a quarter, or a game script), on a shared per-100 scale:
 * the league's rate in that slice (the tick), what this official's overall
 * level predicts there (the open circle: the league's rate plus that level),
 * and the official's own rate with its 90% range (the dot and line). Officials' leans by
 * slice do not repeat from one half of their games to the other, so the open
 * circle is the estimate and the dot is what this season happened to show.
 */
function SplitChart({
  rows,
  level,
}: {
  rows: { label: string; sub: string; per100: number; lg: number; lo: number; hi: number }[];
  level: number;
}) {
  const vals = rows.flatMap((r) => [r.lo, r.hi, r.lg, r.lg + level]);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const pad = (max - min) * 0.06 || 1;
  const lo = min - pad;
  const span = max + pad - lo;
  const pct = (v: number) => `${(((v - lo) / span) * 100).toFixed(2)}%`;
  return (
    <div className="mt-5">
      {rows.map((r) => (
        <div
          key={r.label}
          className="grid grid-cols-[4.75rem_minmax(0,1fr)_5.5rem] items-center gap-3 border-b border-line-soft py-3 last:border-b-0 sm:grid-cols-[6rem_minmax(0,1fr)_6.5rem]"
        >
          <span className="min-w-0">
            <span className="block font-display text-sm font-semibold text-ink">{r.label}</span>
            <span className="block truncate text-[11px] text-ink-faint">{r.sub}</span>
          </span>
          <span className="relative block h-4" aria-hidden="true">
            <span className="absolute inset-y-0 w-px bg-line" style={{ left: pct(r.lg) }} />
            <span
              className="absolute top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-ink-faint"
              style={{ left: pct(r.lo), width: `calc(${pct(r.hi)} - ${pct(r.lo)})` }}
            />
            <span
              className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[1.5px] border-ink-soft bg-paper"
              style={{ left: pct(r.lg + level) }}
            />
            <span
              className="absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink"
              style={{ left: pct(r.per100) }}
            />
          </span>
          <span className="text-right">
            <span className="block font-mono tnum text-sm text-ink">{r.per100.toFixed(1)}</span>
            <span className="block font-mono tnum text-[11px] text-ink-faint">
              league {r.lg.toFixed(1)}
            </span>
          </span>
        </div>
      ))}
      <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-ink-faint">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2 w-2 rounded-full bg-ink" /> this official's rate, with its 90% range
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full border-[1.5px] border-ink-soft bg-paper" />{" "}
          the league's rate plus this official's level
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-px bg-line" /> the league
        </span>
      </p>
    </div>
  );
}

export default function Referee() {
  const data = useData();
  const { league } = useLeague();
  const { id } = useParams();
  const [params, setParams] = useSearchParams();

  const prof = id ? data.refProfiles[id] : undefined;
  // An official with archive seasons needs the archive for a whole career.
  const archive = useArchive(league, !!id && !!data.meta.archive?.refs.includes(id));

  const seasons = prof?.seasons ?? [];
  const requested = params.get("season");
  const season =
    requested && seasons.includes(requested)
      ? requested
      : seasons[seasons.length - 1] ?? null;
  const detail = prof && season ? prof.detail[season] : undefined;

  useTitle(prof ? `${prof.name} · Over Expected` : "Over Expected");

  if (archive !== "ready") return <ArchiveWait status={archive} />;
  if (!prof || !season || !detail)
    return <NotFound minGames={leagueDef(league).refMinGames} league={league} />;

  const setSeason = (s: string) => {
    const next = new URLSearchParams(params);
    next.set("season", s);
    setParams(next);
  };

  const rel = data.meta.referees?.reliability;
  const surname = prof.name.split(" ").slice(-1)[0];
  const level = value(detail);
  const careers = prof.careers ?? [];
  const careerDomain = intervalDomain(
    [detail, ...careers].map((w) => ({ value: value(w), lo: w.lo, hi: w.hi })),
  );

  const quarterRows = detail.quarters
    .filter((q) => q.q !== "OT")
    .map((q) => ({ label: q.q, sub: `${int(q.poss)} poss`, ...q }));
  const scriptRows = detail.script.map((s) => ({
    label: SCRIPT_LABEL[s.b]?.label ?? s.b,
    sub: `${int(s.games)} games · ${SCRIPT_LABEL[s.b]?.sub ?? ""}`,
    ...s,
  }));
  const quietest = quarterRows.reduce((a, b) => (b.lg < a.lg ? b : a), quarterRows[0]);
  const inside = (rows: { lo: number; hi: number; lg: number }[]) =>
    rows.filter((r) => r.lo <= r.lg + level && r.lg + level <= r.hi).length;
  const splitFinding = (
    rows: { lo: number; hi: number; lg: number }[],
    what: string,
    reliability: number | null | undefined,
  ) => (
    <>
      {reliability != null && (
        <>
          Officials' leans by {what} do not repeat: across this league, an
          official's lean in half of their games predicts the other half with a
          reliability of{" "}
          <span className="font-mono tnum">{reliability.toFixed(2)}</span>.{" "}
        </>
      )}
      So the best estimate for each {what === "quarter" ? "quarter" : "kind of game"} is
      the league's own rate plus this official's overall level, the open
      circle. In {inside(rows)} of {rows.length} the official's range takes it in.
    </>
  );

  return (
    <div className="mx-auto max-w-4xl px-5 py-10 sm:px-8 sm:py-14">
      <Link
        to={refereesPath(league, datedPart(season, data.meta.defaultSeason))}
        className="font-display text-sm text-ink-soft transition-colors duration-150 hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        ← Referees
      </Link>

      <header className="mt-6">
        <p className="font-display text-[11px] font-medium uppercase tracking-wider text-ink-faint">
          Official
        </p>
        <h1 className="mt-1 font-display text-4xl font-bold tracking-tight text-ink sm:text-6xl">
          {prof.name}
        </h1>
        <p className="mt-3 text-sm text-ink-soft">
          {int(detail.games)} games in {season}
          {careers.map((c) => ` · ${int(c.games)} from ${c.from} to ${c.to}`).join("")}
        </p>
        {seasons.length > 1 ? (
          <SegmentedControl
            ariaLabel="Season"
            className="mt-5"
            options={seasons.map((s) => ({
              value: s,
              label: s,
              shortLabel: `'${s.slice(2, 4)}-${s.slice(5)}`,
            }))}
            value={season}
            onChange={setSeason}
          />
        ) : (
          <p className="mt-5 font-display text-[13px] font-medium text-ink-soft">{season}</p>
        )}
      </header>

      {/* stat band */}
      <section className="mt-10 grid grid-cols-2 divide-line border-y border-line py-2 max-sm:[&>*:nth-child(odd)]:border-r max-sm:[&>*:nth-child(-n+2)]:border-b sm:grid-cols-4 sm:divide-x sm:py-5">
        <Stat delay={0} value={int(detail.games)} label="Games worked" />
        <Stat
          delay={60}
          value={detail.per100.toFixed(1)}
          label="FTA per 100 poss"
          sub={`league: ${detail.lg.toFixed(1)}`}
        />
        <Stat
          delay={120}
          value={signed(value(detail), 1)}
          label="Over expected"
          sub={range(detail)}
        />
        <Stat
          delay={180}
          value={careers.length ? signed(value(careers[careers.length - 1]), 1) : "–"}
          label="Career"
          sub={
            careers.length
              ? `${careers[careers.length - 1].from} to ${careers[careers.length - 1].to}`
              : "two seasons needed"
          }
        />
      </section>

      <p className="mt-6 max-w-prose text-sm leading-relaxed text-ink-soft">
        In the games {surname} worked in {season}, players drew{" "}
        <span className="font-mono tnum">{detail.per100.toFixed(1)}</span> free
        throws per 100 possessions against a league rate of{" "}
        <span className="font-mono tnum">{detail.lg.toFixed(1)}</span>. Given who
        played and where they shot, these games came in{" "}
        <span className="font-mono tnum">{signed(detail.diff, 1)}</span> over
        their expected whistle.
        {detail.est !== null && rel?.season != null && (
          <>
            {" "}One season of an official is only{" "}
            <span className="font-mono tnum">{rel.season.toFixed(2)}</span>{" "}
            reliable, so the best estimate is{" "}
            <span className="font-mono tnum">{signed(detail.est, 1)}</span> ({range(detail)}).
          </>
        )}
      </p>

      {/* career first: the number with the most signal */}
      {careers.length > 0 && (
        <section className="mt-14">
          <h2 className="font-display text-xl font-semibold tracking-tight text-ink sm:text-2xl">
            Across the career
          </h2>
          <p className="mt-1.5 max-w-prose text-sm text-ink-soft">
            Pooled over every game worked.
            {rel?.career != null && (
              <>
                {" "}A career is{" "}
                <span className="font-mono tnum">{rel.career.toFixed(2)}</span>{" "}
                reliable against{" "}
                <span className="font-mono tnum">{rel.season?.toFixed(2)}</span>{" "}
                for one season: this is the figure to read.
              </>
            )}
          </p>
          <div className="mt-5">
            {[...careers, { ...detail, label: season }].map((c, i) => {
              const isSeason = i === careers.length;
              const label = isSeason ? `${season} only` : `${(c as (typeof careers)[number]).from} to ${(c as (typeof careers)[number]).to}`;
              return (
                <div
                  key={label}
                  className="grid grid-cols-[7rem_minmax(0,1fr)_7rem] items-center gap-3 border-b border-line-soft py-3 last:border-b-0 sm:grid-cols-[9rem_minmax(0,1fr)_9rem]"
                >
                  <span className="min-w-0">
                    <span className={`block font-display text-sm font-semibold ${isSeason ? "text-ink-soft" : "text-ink"}`}>
                      {label}
                    </span>
                    <span className="block text-[11px] text-ink-faint">{int(c.games)} games</span>
                  </span>
                  <IntervalBar value={value(c)} lo={c.lo} hi={c.hi} domain={careerDomain} className="w-full" />
                  <span className="text-right">
                    <span className="block font-mono tnum text-sm text-ink">{signed(value(c), 1)}</span>
                    <span className="block font-mono tnum text-[11px] text-ink-faint">
                      {c.lo !== null && c.hi !== null ? `${signed(c.lo, 1)} to ${signed(c.hi, 1)}` : "unshrunk"}
                    </span>
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* by quarter */}
      <section className="mt-14">
        <h2 className="font-display text-xl font-semibold tracking-tight text-ink sm:text-2xl">
          How the whistle moves by quarter
        </h2>
        <p className="mt-1.5 max-w-prose text-sm text-ink-soft">
          The league's own whistle moves: {quietest.label} is its quietest
          quarter, at <span className="font-mono tnum">{quietest.lg.toFixed(1)}</span>{" "}
          per 100. {splitFinding(quarterRows, "quarter", rel?.quarters)}
        </p>
        <SplitChart rows={quarterRows} level={level} />
      </section>

      {/* by game script */}
      <section className="mt-14">
        <h2 className="font-display text-xl font-semibold tracking-tight text-ink sm:text-2xl">
          Close games vs blowouts
        </h2>
        <p className="mt-1.5 max-w-prose text-sm text-ink-soft">
          The same split by how the game finished. {splitFinding(scriptRows, "game script", rel?.script)}
        </p>
        <SplitChart rows={scriptRows} level={level} />
      </section>

      <p className="mt-14 max-w-prose border-t border-line pt-6 text-xs leading-relaxed text-ink-faint">
        Descriptive, league-level only. The expected whistle comes from where the
        players in these games shot and how often each of them draws fouls in
        their other games; player numbers are not adjusted for individual crews, and
        this site deliberately does not publish player-by-official splits.{" "}
        <Link
          to="/methodology"
          className="underline underline-offset-2 transition-colors duration-150 hover:text-ink"
        >
          Methodology
        </Link>
        .
      </p>

      <p className="mt-8">
        <Link
          to={refereesPath(league, datedPart(season, data.meta.defaultSeason))}
          className="font-display text-sm font-medium text-ink underline underline-offset-4 transition-colors duration-150 hover:text-ink-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          See every official →
        </Link>
      </p>
    </div>
  );
}
