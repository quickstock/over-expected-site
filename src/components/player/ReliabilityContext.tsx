/**
 * Per-player reliability context: does THIS player's sample support the numbers
 * above it?
 *
 * The calibration work established that selection and shot-making become trustworthy
 * at wildly different attempt counts — selection almost immediately, making only after
 * several hundred attempts, and in four leagues not within observable data at all.
 * That finding is useless on a methodology page nobody opens, so it belongs here,
 * beside the figures it qualifies.
 *
 * Reliability is interpolated from the league's own measured curve rather than a
 * global rule of thumb, because the thresholds are a property of each population's
 * talent dispersion, not constants.
 */
import { Link } from "react-router-dom";
import { useCalibration } from "../../data";
import type { League } from "../../leagues";

/** Linear interpolation into the measured curve at this attempt count. */
function reliabilityAt(
  sweep: number[],
  values: (number | null)[],
  n: number,
): { value: number; extrapolated: boolean } | null {
  const pts = sweep
    .map((s, i) => ({ n: s, v: values[i] }))
    .filter((p): p is { n: number; v: number } => p.v !== null);
  if (!pts.length) return null;
  if (n <= pts[0].n) return { value: pts[0].v, extrapolated: true };
  const last = pts[pts.length - 1];
  if (n >= last.n) return { value: last.v, extrapolated: n > last.n };
  for (let i = 1; i < pts.length; i++) {
    if (n <= pts[i].n) {
      const a = pts[i - 1];
      const b = pts[i];
      const f = (n - a.n) / (b.n - a.n);
      return { value: a.v + f * (b.v - a.v), extrapolated: false };
    }
  }
  return { value: last.v, extrapolated: true };
}

function Bar({ v }: { v: number }) {
  const pct = Math.max(0, Math.min(1, v)) * 100;
  // 0.7 is the conventional "usable" line; 0.5 is "weak but not noise"
  const color =
    v >= 0.7 ? "var(--color-warm)" : v >= 0.5 ? "#909097" : "var(--color-cool)";
  return (
    <span className="relative mt-1 block h-1.5 w-full max-w-48 bg-wash" aria-hidden="true">
      <span
        className="absolute inset-y-0 left-0 rounded-full"
        style={{ width: `${pct}%`, background: color }}
      />
      <span className="absolute inset-y-0 left-[70%] w-px bg-line" />
    </span>
  );
}

export default function ReliabilityContext({
  league,
  attempts,
}: {
  league: League;
  attempts: number;
}) {
  const state = useCalibration();
  if (state.status !== "ready") return null;

  const curve = state.data.curve;
  const lg = curve.byLeague[league];
  if (!lg) return null;

  const sel = reliabilityAt(curve.sweep, lg.selection.reliability, attempts);
  const mak = reliabilityAt(curve.sweep, lg.making.reliability, attempts);
  if (!sel || !mak) return null;

  const verdict =
    mak.value >= 0.7
      ? "Both numbers are on solid ground at this sample size."
      : mak.value >= 0.5
        ? "Selection is solid here. Shot-making is suggestive but not yet reliable."
        : "Selection is solid here. Shot-making is mostly noise at this sample size, so read it as a hint rather than a measurement.";

  return (
    <section className="mt-14">
      <h2 className="font-display text-xl font-semibold tracking-tight text-ink sm:text-2xl">
        Does this sample support these numbers?
      </h2>
      <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-ink-soft">
        {verdict}
      </p>

      <div className="mt-6 grid gap-6 border-y border-line py-5 sm:grid-cols-3">
        <div>
          <span className="font-display text-[11px] font-medium uppercase tracking-wider text-ink-faint">
            Attempts
          </span>
          <span className="mt-1 block font-mono tnum text-3xl text-ink">
            {attempts.toLocaleString()}
          </span>
        </div>
        {(
          [
            ["Shot selection", sel],
            ["Shot-making", mak],
          ] as const
        ).map(([label, r]) => (
          <div key={label}>
            <span className="font-display text-[11px] font-medium uppercase tracking-wider text-ink-faint">
              {label} reliability
            </span>
            <span className="mt-1 block font-mono tnum text-3xl text-ink">
              {r.value.toFixed(2)}
              {r.extrapolated && (
                <span className="ml-1 align-super text-xs text-ink-faint">*</span>
              )}
            </span>
            <Bar v={r.value} />
          </div>
        ))}
      </div>

      <p className="mt-4 max-w-2xl text-xs leading-relaxed text-ink-faint">
        Interpolated from {league}'s own measured reliability curve. Thresholds are a
        property of each league's talent dispersion, not universal constants. The tick
        marks 0.70, the conventional line for a usable measurement.
        {(sel.extrapolated || mak.extrapolated) &&
          " * extrapolated beyond the measured sweep for this attempt count."}{" "}
        These are <em>reliability</em> figures: whether the number repeats. Whether it
        predicts future development is untested and untestable with available data.{" "}
        <Link
          to={`/calibration/${league}`}
          className="text-ink underline underline-offset-4"
        >
          The full calibration →
        </Link>
      </p>
    </section>
  );
}
