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
interface Geometry {
  breakY: number;
  zones: Zone[];
  labels: LabelMap;
  markings: ReactElement;
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

const GEOMETRY: Record<CourtKind, Geometry> = { nba: NBA, fiba: FIBA };

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
