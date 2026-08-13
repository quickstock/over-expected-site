/**
 * One court, two shot diets. Each zone leans toward the player who takes a
 * larger share of HIS OWN attempts there: warm = player one, cool = player
 * two, near-white = they use the zone about equally. Shares, not raw counts,
 * so a high-volume season doesn't paint the whole court its color.
 *
 * This is the compare page's replacement for two side-by-side courts, which
 * rendered small and made the reader do the subtraction. The subtraction is
 * the point, so the chart does it: the label in each zone is the gap in
 * percentage points, tagged with the leaning player's initial.
 *
 * The diverging palette here encodes "which player", not over/under
 * expectation. That is a deliberate reuse, and the legend above the court
 * says which pole is whom every time.
 */
import { useMemo, useRef } from "react";
import type { ZoneAgg } from "../../types";
import { divergingText, divergingTint, scaleMax } from "../../lib/color";
import { int, lastName } from "../../lib/format";
import { useRevealed } from "../../lib/useRevealed";
import { GEOMETRY, type CourtKind } from "./CourtZones";

/** Share gap (in percentage points) at which the color saturates. */
const SAT_PP = 8;

function shareByZone(zones: ZoneAgg[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const z of zones) m.set(z.zone, (m.get(z.zone) ?? 0) + z.share);
  return m;
}

export default function CourtDuel({
  court = "fiba",
  aName,
  bName,
  aZones,
  bZones,
  className = "",
}: {
  court?: CourtKind;
  aName: string;
  bName: string;
  aZones: ZoneAgg[];
  bZones: ZoneAgg[];
  className?: string;
}) {
  const { zones: ZONES, labels: LABELS, markings } = GEOMETRY[court];
  const wrapRef = useRef<HTMLDivElement>(null);
  const revealed = useRevealed(wrapRef);

  const aLast = lastName(aName);
  const bLast = lastName(bName);
  const aTotal = aZones.reduce((s, z) => s + z.n, 0);
  const bTotal = bZones.reduce((s, z) => s + z.n, 0);

  // Positive = player one takes a larger share of his shots there.
  const deltas = useMemo(() => {
    const a = shareByZone(aZones);
    const b = shareByZone(bZones);
    const m = new Map<string, number>();
    for (const z of ZONES)
      m.set(z.key, ((a.get(z.key) ?? 0) - (b.get(z.key) ?? 0)) * 100);
    return m;
  }, [aZones, bZones, ZONES]);

  if (aTotal === 0 || bTotal === 0) {
    return (
      <div
        className={`rounded border border-line-soft bg-wash px-4 py-8 text-center text-sm text-ink-faint ${className}`}
      >
        Not enough located attempts to draw the shared court.
      </div>
    );
  }

  // Map a share gap onto the diverging scale, saturating at SAT_PP points.
  const scaled = (deltaPp: number) => (deltaPp / SAT_PP) * scaleMax();

  const biggest = [...deltas.entries()].sort(
    (x, y) => Math.abs(y[1]) - Math.abs(x[1]),
  )[0];

  return (
    <div ref={wrapRef} className={className}>
      {/* the legend IS the encoding, so it leads */}
      <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-ink-soft">
        <span className="flex items-center gap-1.5">
          <span
            className="h-3 w-3 rounded-sm"
            style={{ background: divergingTint(scaleMax(), 0.45) }}
          />
          <span className="font-display font-medium text-ink">{aLast}</span>
          leans there
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="h-3 w-3 rounded-sm"
            style={{ background: divergingTint(-scaleMax(), 0.45) }}
          />
          <span className="font-display font-medium text-ink">{bLast}</span>
          leans there
        </span>
      </div>

      <svg
        viewBox="0 0 500 434"
        className="w-full"
        role="img"
        aria-label={`Shot-diet comparison by court zone. Largest gap: ${biggest[0]}, ${Math.abs(biggest[1]).toFixed(1)} percentage points toward ${biggest[1] >= 0 ? aName : bName}.`}
        style={{
          opacity: revealed ? 1 : 0,
          transform: revealed ? "scale(1)" : "scale(0.98)",
          transformOrigin: "center",
          transition:
            "opacity 600ms ease, transform 600ms var(--ease-out-strong)",
        }}
      >
        {ZONES.map((z) => {
          const d = deltas.get(z.key) ?? 0;
          return (
            <path
              key={z.key}
              d={z.d}
              fill={divergingTint(scaled(d), 0.45)}
              fillRule={z.evenodd ? "evenodd" : "nonzero"}
            >
              <title>
                {`${z.key}: ${
                  Math.abs(d) < 1
                    ? "about even"
                    : `${d >= 0 ? aLast : bLast} +${Math.abs(d).toFixed(1)} pp of his own attempts`
                }`}
              </title>
            </path>
          );
        })}

        {markings}

        {ZONES.map((z) => {
          const d = deltas.get(z.key) ?? 0;
          const l = LABELS[z.key];
          const even = Math.abs(d) < 1;
          const transform = l.rotate
            ? `rotate(${l.x < 250 ? -90 : 90} ${l.x} ${l.y})`
            : undefined;
          return (
            <g key={`label-${z.key}`} transform={transform} pointerEvents="none">
              <text
                x={l.x}
                y={l.y}
                textAnchor="middle"
                fontSize={l.rotate ? 13.5 : 19}
                fontWeight={650}
                className="font-mono tnum"
                fill={even ? "var(--color-ink-faint)" : divergingText(scaled(d))}
              >
                {even
                  ? "even"
                  : `${(d >= 0 ? aLast : bLast).slice(0, 1)} +${Math.abs(d).toFixed(Math.abs(d) >= 9.5 ? 0 : 1)}pp`}
              </text>
              {l.caption && (
                <text
                  x={l.x}
                  y={l.y + 17}
                  textAnchor="middle"
                  fontSize={11.5}
                  className="font-serif"
                  fill="var(--color-ink-soft)"
                >
                  {l.caption}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      <p className="mt-2 text-xs leading-relaxed text-ink-faint">
        Shares of each player's own attempts, so volume doesn't tip the court:{" "}
        {aLast} {int(aTotal)}, {bLast} {int(bTotal)} charged attempts. Fouled
        misses are not charged shots and have no location, so they cannot
        appear here.
      </p>
    </div>
  );
}
