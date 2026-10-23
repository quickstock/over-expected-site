/**
 * An official's estimate with its 90% range on a shared scale centred on the
 * league (zero). Neutral ink on purpose: officials never borrow the warm/cool
 * encoding of player values. Without a range (a league with too few officials
 * to measure one), only the point is drawn.
 */
export default function IntervalBar({
  value,
  lo,
  hi,
  domain,
  className = "w-28",
}: {
  value: number;
  lo: number | null;
  hi: number | null;
  /** Half-width of the scale, per 100; shared by every bar in a table. */
  domain: number;
  className?: string;
}) {
  const pct = (v: number) => `${(((Math.max(-domain, Math.min(domain, v)) + domain) / (2 * domain)) * 100).toFixed(2)}%`;
  return (
    <span className={`relative block h-3 ${className}`} aria-hidden="true">
      <span className="absolute inset-y-0 left-1/2 w-px bg-line" />
      {lo !== null && hi !== null && (
        <span
          className="absolute top-1/2 h-0.5 -translate-y-1/2 rounded-full bg-ink-faint"
          style={{ left: pct(lo), width: `calc(${pct(hi)} - ${pct(lo)})` }}
        />
      )}
      <span
        className="absolute top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink"
        style={{ left: pct(value) }}
      />
    </span>
  );
}

/** Half-width covering every row's range (or point), padded, at least 1. */
export function intervalDomain(rows: { value: number; lo: number | null; hi: number | null }[]): number {
  const m = Math.max(1, ...rows.flatMap((r) => [Math.abs(r.value), Math.abs(r.lo ?? 0), Math.abs(r.hi ?? 0)]));
  return m * 1.08;
}
