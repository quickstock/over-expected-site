import { useMemo, useRef, type ReactElement } from "react";
import type { ZoneAgg } from "../../types";
import { int } from "../../lib/format";
import { useRevealed } from "../../lib/useRevealed";

/**
 * Where a player's charged field-goal attempts come from, by shot
 * zone. Two geometries, selected by `court`: the NBA half-court
 * (3pt arc r=237.5, corners break at y=142) and the FIBA half-court
 * (15 m wide; 6.75 m arc, 6.60 m corners breaking 2.99 m up, 4.9 m
 * paint, 1.25 m no-charge circle). Fill intensity is neutral ink; the
 * diverging encoding belongs to FTAOE and is never used here.
 *
 * Fouled misses are not charged shots and have no location; they are
 * deliberately absent from this chart.
 */

export type CourtKind = "nba" | "fiba";

type Zone = { key: string; d: string; evenodd?: boolean };
type LabelMap = Record<
  string,
  { x: number; y: number; caption?: string; rotate?: boolean }
>;
export interface Geometry {
  breakY: number;
  zones: Zone[];
  labels: LabelMap;
  /** NBA.com-style fine zones (mid-range and the arc split by side), used by
      the compare page's duel court. Keys are the canonical subzone ids that
      subzoneKey() maps (zone, area) pairs onto. */
  subzones: Zone[];
  subLabels: LabelMap;
  markings: ReactElement;
}

/**
 * Canonical subzone for a (zone, area) pair. Both pipelines ship the NBA
 * area vocabulary (the NBA feed with "(LC)"-style suffixes, the European
 * ones without), so labels are normalized before mapping. The European
 * builds also split the restricted area and paint by side; those collapse
 * into one rim / one paint zone, matching the NBA chart everyone knows.
 * Returns null for backcourt heaves.
 */
export function subzoneKey(zone: string, area: string): string | null {
  const a = area.replace(/\(\w+\)\s*$/, "").trim();
  switch (zone) {
    case "Restricted Area":
      return "ra";
    case "In The Paint (Non-RA)":
      return "paint";
    case "Left Corner 3":
      return "c3L";
    case "Right Corner 3":
      return "c3R";
    case "Mid-Range":
      return (
        {
          "Left Side": "mrL",
          "Left Side Center": "mrLC",
          Center: "mrC",
          "Right Side Center": "mrRC",
          "Right Side": "mrR",
        }[a] ?? "mrC"
      );
    case "Above the Break 3":
      return (
        {
          "Left Side": "ab3L",
          "Left Side Center": "ab3L",
          Center: "ab3C",
          "Right Side Center": "ab3R",
          "Right Side": "ab3R",
        }[a] ?? "ab3C"
      );
    default:
      return null;
  }
}

// NBA: hoop center (250, 52.5), 3pt arc r=237.5 breaking at y=142.
const NBA_BREAK = 142;
const NBA: Geometry = {
  breakY: NBA_BREAK,
  zones: [
    { key: "Restricted Area", d: "M210 0 L210 52.5 A40 40 0 0 0 290 52.5 L290 0 Z" },
    {
      key: "In The Paint (Non-RA)",
      d: "M170 0 H330 V190 H170 Z M210 0 L210 52.5 A40 40 0 0 0 290 52.5 L290 0 Z",
      evenodd: true,
    },
    {
      key: "Mid-Range",
      d: `M30 0 L30 ${NBA_BREAK} A237.5 237.5 0 0 0 470 ${NBA_BREAK} L470 0 Z M170 0 H330 V190 H170 Z`,
      evenodd: true,
    },
    { key: "Left Corner 3", d: `M0 0 L0 ${NBA_BREAK} L30 ${NBA_BREAK} L30 0 Z` },
    { key: "Right Corner 3", d: `M470 0 L470 ${NBA_BREAK} L500 ${NBA_BREAK} L500 0 Z` },
    {
      key: "Above the Break 3",
      d: `M0 ${NBA_BREAK} L0 420 L500 420 L500 ${NBA_BREAK} L470 ${NBA_BREAK} A237.5 237.5 0 0 1 30 ${NBA_BREAK} Z`,
    },
  ],
  labels: {
    "Restricted Area": { x: 250, y: 84, caption: "at the rim" },
    "In The Paint (Non-RA)": { x: 250, y: 158, caption: "paint" },
    "Mid-Range": { x: 250, y: 248, caption: "mid-range" },
    "Left Corner 3": { x: 15, y: 71, rotate: true },
    "Right Corner 3": { x: 485, y: 71, rotate: true },
    "Above the Break 3": { x: 250, y: 342, caption: "above the break 3" },
  },
  // Fine zones, NBA.com-chart style. The dividing diagonals run from the
  // hoop (250, 52.5) through the paint's bottom corners, hitting the arc at
  // (130.6, 257.8) / (369.4, 257.8) and the baseline-side edge at y=420 at
  // x=36.2 / 463.8.
  subzones: [
    { key: "ra", d: "M210 0 L210 52.5 A40 40 0 0 0 290 52.5 L290 0 Z" },
    {
      key: "paint",
      d: "M170 0 H330 V190 H170 Z M210 0 L210 52.5 A40 40 0 0 0 290 52.5 L290 0 Z",
      evenodd: true,
    },
    { key: "mrL", d: `M30 0 L30 ${NBA_BREAK} L170 ${NBA_BREAK} L170 0 Z` },
    { key: "mrR", d: `M330 0 L330 ${NBA_BREAK} L470 ${NBA_BREAK} L470 0 Z` },
    {
      key: "mrLC",
      d: `M30 ${NBA_BREAK} L170 ${NBA_BREAK} L170 190 L130.6 257.8 A237.5 237.5 0 0 1 30 ${NBA_BREAK} Z`,
    },
    {
      key: "mrRC",
      d: `M330 ${NBA_BREAK} L470 ${NBA_BREAK} A237.5 237.5 0 0 1 369.4 257.8 L330 190 Z`,
    },
    { key: "mrC", d: "M170 190 L330 190 L369.4 257.8 A237.5 237.5 0 0 1 130.6 257.8 Z" },
    { key: "c3L", d: `M0 0 L0 ${NBA_BREAK} L30 ${NBA_BREAK} L30 0 Z` },
    { key: "c3R", d: `M470 0 L470 ${NBA_BREAK} L500 ${NBA_BREAK} L500 0 Z` },
    {
      key: "ab3L",
      d: `M0 ${NBA_BREAK} L30 ${NBA_BREAK} A237.5 237.5 0 0 0 130.6 257.8 L36.2 420 L0 420 Z`,
    },
    { key: "ab3C", d: "M130.6 257.8 A237.5 237.5 0 0 0 369.4 257.8 L463.8 420 L36.2 420 Z" },
    {
      key: "ab3R",
      d: `M369.4 257.8 A237.5 237.5 0 0 0 470 ${NBA_BREAK} L500 ${NBA_BREAK} L500 420 L463.8 420 Z`,
    },
  ],
  subLabels: {
    ra: { x: 250, y: 84, caption: "at the rim" },
    paint: { x: 250, y: 158, caption: "paint" },
    mrL: { x: 100, y: 66, caption: "baseline" },
    mrR: { x: 400, y: 66, caption: "baseline" },
    mrLC: { x: 97, y: 200, caption: "mid left" },
    mrRC: { x: 403, y: 200, caption: "mid right" },
    mrC: { x: 250, y: 240, caption: "free-throw" },
    c3L: { x: 15, y: 71, rotate: true },
    c3R: { x: 485, y: 71, rotate: true },
    ab3L: { x: 54, y: 316, caption: "left wing" },
    ab3R: { x: 446, y: 316, caption: "right wing" },
    ab3C: { x: 250, y: 356, caption: "top of the arc" },
  },
  markings: (
    <g fill="none" stroke="var(--color-ink-faint)" strokeWidth={1.6}>
      <rect x={0} y={0} width={500} height={420} />
      <rect x={170} y={0} width={160} height={190} />
      <circle cx={250} cy={190} r={60} />
      <path d={`M30 0 L30 ${NBA_BREAK} A237.5 237.5 0 0 0 470 ${NBA_BREAK} L470 0`} />
      <path d="M210 52.5 A40 40 0 0 0 290 52.5" />
      <line x1={220} x2={280} y1={40} y2={40} strokeWidth={2.4} stroke="var(--color-ink)" />
      <circle cx={250} cy={52.5} r={7.5} stroke="var(--color-ink)" />
    </g>
  ),
};

// FIBA: hoop center (250, 52.5); 3pt arc r=225 (6.75 m) breaking to the
// 6.60 m corner lines at y≈99.7 (2.99 m from baseline).
const FIBA_BREAK = 99.7;
const FIBA: Geometry = {
  breakY: FIBA_BREAK,
  zones: [
    { key: "Restricted Area", d: "M208 0 L208 52.5 A42 42 0 0 0 292 52.5 L292 0 Z" },
    {
      key: "In The Paint (Non-RA)",
      d: "M168 0 H332 V193 H168 Z M208 0 L208 52.5 A42 42 0 0 0 292 52.5 L292 0 Z",
      evenodd: true,
    },
    {
      key: "Mid-Range",
      d: `M30 0 L30 ${FIBA_BREAK} A225 225 0 0 0 470 ${FIBA_BREAK} L470 0 Z M168 0 H332 V193 H168 Z`,
      evenodd: true,
    },
    { key: "Left Corner 3", d: `M0 0 L0 ${FIBA_BREAK} L30 ${FIBA_BREAK} L30 0 Z` },
    { key: "Right Corner 3", d: `M470 0 L470 ${FIBA_BREAK} L500 ${FIBA_BREAK} L500 0 Z` },
    {
      key: "Above the Break 3",
      d: `M0 ${FIBA_BREAK} L0 420 L500 420 L500 ${FIBA_BREAK} L470 ${FIBA_BREAK} A225 225 0 0 1 30 ${FIBA_BREAK} Z`,
    },
  ],
  labels: {
    "Restricted Area": { x: 250, y: 84, caption: "at the rim" },
    "In The Paint (Non-RA)": { x: 250, y: 158, caption: "paint" },
    "Mid-Range": { x: 250, y: 248, caption: "mid-range" },
    "Left Corner 3": { x: 15, y: 55, rotate: true },
    "Right Corner 3": { x: 485, y: 55, rotate: true },
    "Above the Break 3": { x: 250, y: 342, caption: "above the break 3" },
  },
  // Same construction as the NBA subzones with FIBA measurements: diagonals
  // from the hoop through the paint corners (168, 193), hitting the 6.75 m
  // arc at (136.6, 246.8) / (363.4, 246.8) and y=420 at x=35.5 / 464.5.
  subzones: [
    { key: "ra", d: "M208 0 L208 52.5 A42 42 0 0 0 292 52.5 L292 0 Z" },
    {
      key: "paint",
      d: "M168 0 H332 V193 H168 Z M208 0 L208 52.5 A42 42 0 0 0 292 52.5 L292 0 Z",
      evenodd: true,
    },
    { key: "mrL", d: `M30 0 L30 ${FIBA_BREAK} L168 ${FIBA_BREAK} L168 0 Z` },
    { key: "mrR", d: `M332 0 L332 ${FIBA_BREAK} L470 ${FIBA_BREAK} L470 0 Z` },
    {
      key: "mrLC",
      d: `M30 ${FIBA_BREAK} L168 ${FIBA_BREAK} L168 193 L136.6 246.8 A225 225 0 0 1 30 ${FIBA_BREAK} Z`,
    },
    {
      key: "mrRC",
      d: `M332 ${FIBA_BREAK} L470 ${FIBA_BREAK} A225 225 0 0 1 363.4 246.8 L332 193 Z`,
    },
    { key: "mrC", d: "M168 193 L332 193 L363.4 246.8 A225 225 0 0 1 136.6 246.8 Z" },
    { key: "c3L", d: `M0 0 L0 ${FIBA_BREAK} L30 ${FIBA_BREAK} L30 0 Z` },
    { key: "c3R", d: `M470 0 L470 ${FIBA_BREAK} L500 ${FIBA_BREAK} L500 0 Z` },
    {
      key: "ab3L",
      d: `M0 ${FIBA_BREAK} L30 ${FIBA_BREAK} A225 225 0 0 0 136.6 246.8 L35.5 420 L0 420 Z`,
    },
    { key: "ab3C", d: "M136.6 246.8 A225 225 0 0 0 363.4 246.8 L464.5 420 L35.5 420 Z" },
    {
      key: "ab3R",
      d: `M363.4 246.8 A225 225 0 0 0 470 ${FIBA_BREAK} L500 ${FIBA_BREAK} L500 420 L464.5 420 Z`,
    },
  ],
  subLabels: {
    ra: { x: 250, y: 84, caption: "at the rim" },
    paint: { x: 250, y: 158, caption: "paint" },
    mrL: { x: 99, y: 48, caption: "baseline" },
    mrR: { x: 401, y: 48, caption: "baseline" },
    mrLC: { x: 95, y: 180, caption: "mid left" },
    mrRC: { x: 405, y: 180, caption: "mid right" },
    mrC: { x: 250, y: 235, caption: "free-throw" },
    c3L: { x: 15, y: 55, rotate: true },
    c3R: { x: 485, y: 55, rotate: true },
    ab3L: { x: 52, y: 310, caption: "left wing" },
    ab3R: { x: 448, y: 310, caption: "right wing" },
    ab3C: { x: 250, y: 355, caption: "top of the arc" },
  },
  markings: (
    <g fill="none" stroke="var(--color-ink-faint)" strokeWidth={1.6}>
      <rect x={0} y={0} width={500} height={420} />
      <rect x={168} y={0} width={164} height={193} />
      <circle cx={250} cy={193} r={60} />
      <path d={`M30 0 L30 ${FIBA_BREAK} A225 225 0 0 0 470 ${FIBA_BREAK} L470 0`} />
      <path d="M208 52.5 A42 42 0 0 0 292 52.5" />
      <line x1={220} x2={280} y1={40} y2={40} strokeWidth={2.4} stroke="var(--color-ink)" />
      <circle cx={250} cy={52.5} r={7.5} stroke="var(--color-ink)" />
    </g>
  ),
};

export const GEOMETRY: Record<CourtKind, Geometry> = { nba: NBA, fiba: FIBA };

interface Props {
  zones: ZoneAgg[];
  /** Court geometry to draw. Defaults to FIBA. */
  court?: CourtKind;
  /** Replaces the default honesty footnote (total count stays). */
  footnote?: string;
  className?: string;
}

export default function CourtZones({
  zones,
  court = "fiba",
  footnote,
  className = "",
}: Props) {
  const { zones: ZONES, labels: LABELS, markings } = GEOMETRY[court];
  const wrapRef = useRef<HTMLDivElement>(null);
  const revealed = useRevealed(wrapRef);
  const { byZone, total, backcourt } = useMemo(() => {
    const byZone = new Map<string, { n: number; share: number }>();
    for (const z of zones) {
      const cur = byZone.get(z.zone) ?? { n: 0, share: 0 };
      cur.n += z.n;
      cur.share += z.share;
      byZone.set(z.zone, cur);
    }
    const total = zones.reduce((s, z) => s + z.n, 0);
    const backcourt = byZone.get("Backcourt") ?? { n: 0, share: 0 };
    return { byZone, total, backcourt };
  }, [zones]);

  if (total === 0) {
    return (
      <div className={`rounded border border-line-soft bg-wash px-4 py-8 text-center text-sm text-ink-faint ${className}`}>
        No charged attempts recorded for this season.
      </div>
    );
  }

  const maxShare = Math.max(
    ...ZONES.map((z) => byZone.get(z.key)?.share ?? 0),
    0.01,
  );
  const fill = (share: number) =>
    `oklch(0.32 0.01 270 / ${(0.03 + 0.5 * (share / maxShare)).toFixed(3)})`;
  const pctLabel = (share: number) =>
    share >= 0.095 ? `${Math.round(share * 100)}%` : `${(share * 100).toFixed(1)}%`;

  return (
    <div ref={wrapRef} className={className}>
      <svg
        viewBox="0 0 500 434"
        className="w-full"
        role="img"
        aria-label={`Share of ${int(total)} charged field-goal attempts by court zone.`}
        style={{
          opacity: revealed ? 1 : 0,
          transform: revealed ? "scale(1)" : "scale(0.98)",
          transformOrigin: "center",
          transition: "opacity 600ms ease, transform 600ms var(--ease-out-strong)",
        }}
      >
        {/* zone fills */}
        {ZONES.map((z) => {
          const v = byZone.get(z.key) ?? { n: 0, share: 0 };
          return (
            <path
              key={z.key}
              d={z.d}
              fill={fill(v.share)}
              fillRule={z.evenodd ? "evenodd" : "nonzero"}
              style={{ transition: "fill 300ms var(--ease-out-strong)" }}
            >
              <title>
                {`${z.key}: ${pctLabel(v.share)} (${int(v.n)} attempts)`}
              </title>
            </path>
          );
        })}

        {/* court markings */}
        {markings}

        {/* direct labels */}
        {ZONES.map((z) => {
          const v = byZone.get(z.key) ?? { n: 0, share: 0 };
          const l = LABELS[z.key];
          const faint = v.share < 0.005;
          const transform = l.rotate
            ? `rotate(${l.x < 250 ? -90 : 90} ${l.x} ${l.y})`
            : undefined;
          return (
            <g key={`label-${z.key}`} transform={transform} pointerEvents="none">
              <text
                x={l.x}
                y={l.y}
                textAnchor="middle"
                fontSize={l.rotate ? 15 : 21}
                fontWeight={650}
                className="font-mono tnum"
                fill={faint ? "var(--color-ink-faint)" : "var(--color-ink)"}
              >
                {pctLabel(v.share)}
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
      <p className="mt-2 text-xs text-ink-faint">
        {footnote ?? (
          <>
            {int(total)} charged attempts
            {backcourt.share > 0 &&
              ` · ${(backcourt.share * 100).toFixed(1)}% from beyond half court`}
            . Fouled misses are not charged shots and have no location, so
            they cannot appear here.
          </>
        )}
      </p>
    </div>
  );
}
