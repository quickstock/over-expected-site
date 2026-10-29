import { useMemo, useState } from "react";
import { divergingColor, scaleMax } from "../../lib/color";
import { lastName } from "../../lib/format";
import { useMeasure } from "../../lib/useMeasure";
import { fmtStat, niceTicks, type Point, type StatDef } from "../../lib/explore";
import { LEAGUE_DEFS } from "../../leagues";

export interface Plotted {
  p: Point;
  x: number;
  y: number;
  /** Colour value (raw, signed), or null when the chart is uncoloured. */
  c: number | null;
}

type Box = { x0: number; y0: number; x1: number; y1: number };

const overlaps = (a: Box, b: Box) =>
  a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;

/**
 * The chart builder's plot: any two published numbers, one dot per qualified
 * player. Hand-built like every chart on the site, so it shares their
 * typography and the diverging encoding.
 *
 * What it adds over the fixed scatters: a least-squares trend, the average on
 * each axis, y = x when both axes carry the same unit, and labels placed
 * greedily (marked players first, then the players farthest from the centre)
 * so the extremes name themselves without a hover. Hit-testing is
 * nearest-point within a radius rather than per-circle, because a 7px dot is
 * not a touch target.
 */
export default function ExploreScatter({
  points,
  xDef,
  yDef,
  pct,
  colorDef,
  colorMax,
  marked,
  selected,
  onSelect,
  trend,
  diagonal,
  showLeague,
  svgRef,
}: {
  points: Plotted[];
  xDef: StatDef;
  yDef: StatDef;
  pct: boolean;
  colorDef: StatDef | null;
  colorMax: number;
  marked: Set<string>;
  selected: string | null;
  onSelect: (key: string | null) => void;
  trend: { a: number; b: number } | null;
  diagonal: boolean;
  showLeague: boolean;
  svgRef: React.RefObject<SVGSVGElement | null>;
}) {
  const [wrapRef, width] = useMeasure<HTMLDivElement>();
  const [hover, setHover] = useState<string | null>(null);

  const narrow = width > 0 && width < 560;
  const height = Math.round(Math.min(600, Math.max(300, width * (narrow ? 1.02 : 0.64))));
  const pad = { top: 30, right: narrow ? 12 : 20, bottom: 42, left: narrow ? 40 : 50 };
  const innerW = Math.max(40, width - pad.left - pad.right);
  const innerH = Math.max(40, height - pad.top - pad.bottom);

  const [xd, yd] = useMemo(() => {
    // a little room past 0 and 100 so the extreme players are not drawn on
    // the frame
    if (pct) return [[-3, 103], [-3, 103]] as const;
    const span = (vals: number[]): [number, number] => {
      if (vals.length === 0) return [0, 1];
      let lo = Math.min(...vals);
      let hi = Math.max(...vals);
      const pad = (hi - lo || 1) * 0.05;
      lo -= pad;
      hi += pad;
      return [lo, hi];
    };
    const xs = points.map((d) => d.x);
    const ys = points.map((d) => d.y);
    // Same unit on both axes: one domain, so y = x is the line it claims to be.
    if (diagonal) {
      const both = span([...xs, ...ys]);
      return [both, both] as const;
    }
    return [span(xs), span(ys)] as const;
  }, [points, pct, diagonal]);

  const sx = (v: number) => pad.left + ((v - xd[0]) / (xd[1] - xd[0])) * innerW;
  const sy = (v: number) => pad.top + ((yd[1] - v) / (yd[1] - yd[0])) * innerH;
  const dense = points.length > 600;
  const r = dense ? 2.6 : narrow ? 3.2 : 3.8;

  const xTicks = useMemo(
    () => (pct ? [0, 25, 50, 75, 100] : niceTicks(xd[0], xd[1], narrow ? 4 : 6)),
    [xd, pct, narrow],
  );
  const yTicks = useMemo(
    () => (pct ? [0, 25, 50, 75, 100] : niceTicks(yd[0], yd[1], narrow ? 4 : 5)),
    [yd, pct, narrow],
  );
  const tickFmt = (ticks: number[], v: number) => {
    const step = ticks.length > 1 ? Math.abs(ticks[1] - ticks[0]) : 1;
    const d = step >= 1 ? 0 : step >= 0.1 ? 1 : 2;
    return v.toFixed(d).replace("-", "−");
  };

  const mean = useMemo(() => {
    if (points.length === 0) return null;
    const n = points.length;
    return {
      x: points.reduce((a, d) => a + d.x, 0) / n,
      y: points.reduce((a, d) => a + d.y, 0) / n,
    };
  }, [points]);

  // Draw order: quiet dots first, saturated ones on top, marked last.
  const ordered = useMemo(
    () =>
      [...points].sort((a, b) => {
        const ma = marked.has(a.p.key) || a.p.key === selected ? 1 : 0;
        const mb = marked.has(b.p.key) || b.p.key === selected ? 1 : 0;
        if (ma !== mb) return ma - mb;
        return Math.abs(a.c ?? 0) - Math.abs(b.c ?? 0);
      }),
    [points, marked, selected],
  );

  const fill = (d: Plotted) =>
    d.c === null
      ? "var(--color-ink)"
      : divergingColor((d.c / colorMax) * scaleMax());

  // Labels: marked players always, then the most extreme in standardised
  // distance from the centre, each placed where it collides with nothing.
  const labels = useMemo(() => {
    if (width === 0 || points.length === 0) return [];
    const n = points.length;
    const mx = points.reduce((a, d) => a + d.x, 0) / n;
    const my = points.reduce((a, d) => a + d.y, 0) / n;
    const vx = Math.sqrt(points.reduce((a, d) => a + (d.x - mx) ** 2, 0) / n) || 1;
    const vy = Math.sqrt(points.reduce((a, d) => a + (d.y - my) ** 2, 0) / n) || 1;
    const auto = [...points]
      .filter((d) => !marked.has(d.p.key))
      .sort(
        (a, b) =>
          ((b.x - mx) / vx) ** 2 + ((b.y - my) / vy) ** 2 -
          (((a.x - mx) / vx) ** 2 + ((a.y - my) / vy) ** 2),
      )
      .slice(0, narrow ? 4 : 8);
    const forced = points.filter((d) => marked.has(d.p.key));
    const placed: Box[] = [];
    const out: { key: string; x: number; y: number; anchor: "start" | "end" | "middle"; text: string; strong: boolean }[] = [];
    const bounds: Box = { x0: pad.left, y0: pad.top, x1: pad.left + innerW, y1: pad.top + innerH };
    const inside = (b: Box) =>
      b.x0 >= bounds.x0 - 2 && b.x1 <= bounds.x1 + 2 && b.y0 >= bounds.y0 - 2 && b.y1 <= bounds.y1;
    for (const [d, strong] of [
      ...forced.map((d) => [d, true] as const),
      ...auto.map((d) => [d, false] as const),
    ]) {
      const px = sx(d.x);
      const py = sy(d.y);
      const text = lastName(d.p.name) + (showLeague ? ` (${LEAGUE_DEFS[d.p.lg].short})` : "");
      const w = text.length * (strong ? 6.6 : 6.1) + 2;
      const cands = [
        { x: px + 7, y: py + 4, anchor: "start" as const, box: { x0: px + 6, y0: py - 8, x1: px + 7 + w, y1: py + 6 } },
        { x: px - 7, y: py + 4, anchor: "end" as const, box: { x0: px - 7 - w, y0: py - 8, x1: px - 6, y1: py + 6 } },
        { x: px, y: py - 9, anchor: "middle" as const, box: { x0: px - w / 2, y0: py - 21, x1: px + w / 2, y1: py - 7 } },
        { x: px, y: py + 18, anchor: "middle" as const, box: { x0: px - w / 2, y0: py + 6, x1: px + w / 2, y1: py + 20 } },
      ];
      const ok = cands.find((c) => inside(c.box) && !placed.some((b) => overlaps(b, c.box)));
      const pick = ok ?? (strong ? cands.find((c) => inside(c.box)) ?? cands[0] : null);
      if (!pick) continue;
      placed.push(pick.box);
      out.push({ key: d.p.key, x: pick.x, y: pick.y, anchor: pick.anchor, text, strong });
    }
    return out;
    // sx/sy are pure functions of width, height and the domains
  }, [points, marked, width, height, xd, yd, narrow, showLeague]);

  // Screen positions for nearest-point hit-testing.
  const screen = useMemo(
    () => points.map((d) => ({ key: d.p.key, x: sx(d.x), y: sy(d.y) })),
    [points, width, height, xd, yd],
  );
  const nearest = (e: React.PointerEvent<SVGRectElement> | React.MouseEvent<SVGRectElement>, radius: number) => {
    const box = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
    const mx = e.clientX - box.left;
    const my = e.clientY - box.top;
    let best: string | null = null;
    let bestD = radius * radius;
    for (const s of screen) {
      const d = (s.x - mx) ** 2 + (s.y - my) ** 2;
      if (d < bestD) {
        bestD = d;
        best = s.key;
      }
    }
    return best;
  };

  const tip = hover ?? null;
  const tipPoint = tip ? points.find((d) => d.p.key === tip) : undefined;

  // The trend, clipped to the plot by evaluating it at the domain edges and
  // letting the clip path trim whatever leaves the y range.
  const trendLine = trend && {
    x1: sx(xd[0]),
    y1: sy(trend.a + trend.b * xd[0]),
    x2: sx(xd[1]),
    y2: sy(trend.a + trend.b * xd[1]),
  };
  const unit = (d: StatDef) => (pct ? " (percentile)" : d.unit ? ` (${d.unit})` : "");

  return (
    <div ref={wrapRef} className="relative select-none">
      {width > 0 && (
        <svg
          ref={svgRef}
          width={width}
          height={height}
          role="img"
          aria-label={`${yDef.label} against ${xDef.label}, one dot per qualified player, ${points.length} players.`}
          className="block touch-manipulation"
        >
          <defs>
            <clipPath id="explore-plot">
              <rect x={pad.left} y={pad.top} width={innerW} height={innerH} />
            </clipPath>
          </defs>

          {xTicks.map((t) => (
            <g key={`x${t}`}>
              <line x1={sx(t)} x2={sx(t)} y1={pad.top} y2={pad.top + innerH} stroke="var(--color-line-soft)" />
              <text x={sx(t)} y={pad.top + innerH + 15} textAnchor="middle" fontSize={10} className="font-mono tnum" fill="var(--color-ink-faint)">
                {tickFmt(xTicks, t)}
              </text>
            </g>
          ))}
          {yTicks.map((t) => (
            <g key={`y${t}`}>
              <line x1={pad.left} x2={pad.left + innerW} y1={sy(t)} y2={sy(t)} stroke="var(--color-line-soft)" />
              <text x={pad.left - 7} y={sy(t) + 3.5} textAnchor="end" fontSize={10} className="font-mono tnum" fill="var(--color-ink-faint)">
                {tickFmt(yTicks, t)}
              </text>
            </g>
          ))}

          <g clipPath="url(#explore-plot)">
            {/* zero: the league baseline on an over-expected axis */}
            {!pct && xDef.signed && xd[0] < 0 && xd[1] > 0 && (
              <line x1={sx(0)} x2={sx(0)} y1={pad.top} y2={pad.top + innerH} stroke="var(--color-ink-faint)" strokeWidth={1} />
            )}
            {!pct && yDef.signed && yd[0] < 0 && yd[1] > 0 && (
              <line x1={pad.left} x2={pad.left + innerW} y1={sy(0)} y2={sy(0)} stroke="var(--color-ink-faint)" strokeWidth={1} />
            )}
            {mean && (
              <>
                <line x1={sx(mean.x)} x2={sx(mean.x)} y1={pad.top} y2={pad.top + innerH} stroke="var(--color-line)" strokeDasharray="2 3" />
                <line x1={pad.left} x2={pad.left + innerW} y1={sy(mean.y)} y2={sy(mean.y)} stroke="var(--color-line)" strokeDasharray="2 3" />
              </>
            )}
            {diagonal && (
              <line x1={sx(xd[0])} y1={sy(xd[0])} x2={sx(xd[1])} y2={sy(xd[1])} stroke="var(--color-ink-faint)" strokeWidth={1.25} strokeDasharray="5 4" />
            )}

            {ordered.map((d) => {
              const on = marked.has(d.p.key) || d.p.key === selected;
              const hot = hover === d.p.key;
              return (
                <circle
                  key={d.p.key}
                  cx={sx(d.x)}
                  cy={sy(d.y)}
                  r={on ? r + 1.6 : hot ? r + 1.2 : r}
                  fill={fill(d)}
                  fillOpacity={d.c === null ? (on ? 1 : 0.42) : on ? 1 : 0.88}
                  stroke={on || hot ? "var(--color-ink)" : "var(--color-paper)"}
                  strokeWidth={on ? 1.6 : hot ? 1.2 : 0.7}
                />
              );
            })}

            {trendLine && (
              <line {...trendLine} stroke="var(--color-ink)" strokeWidth={1.5} strokeOpacity={0.7} />
            )}
          </g>

          {diagonal && (
            <text x={sx(xd[1]) - 4} y={sy(xd[1]) + 14} textAnchor="end" fontSize={10} className="font-mono" fill="var(--color-ink-faint)">
              y = x
            </text>
          )}
          {mean && (
            <text
              x={pad.left + innerW - 2}
              y={sy(mean.y) - 4}
              textAnchor="end"
              fontSize={9.5}
              className="font-mono"
              fill="var(--color-ink-faint)"
            >
              avg
            </text>
          )}

          {labels.map((l) => (
            <text
              key={`l-${l.key}`}
              x={l.x}
              y={l.y}
              textAnchor={l.anchor}
              fontSize={l.strong ? 11.5 : 10.5}
              fontWeight={l.strong ? 650 : 500}
              className="pointer-events-none font-display"
              fill={l.strong ? "var(--color-ink)" : "var(--color-ink-soft)"}
              stroke="var(--color-paper)"
              strokeWidth={3}
              paintOrder="stroke"
              strokeLinejoin="round"
            >
              {l.text}
            </text>
          ))}

          {/* axis titles: y reads horizontally above the plot, which survives a
              phone width where a rotated title would not */}
          <text x={pad.left} y={pad.top - 12} fontSize={11} className="font-display" fontWeight={600} fill="var(--color-ink)">
            ↑ {yDef.label}
            <tspan fontWeight={400} fill="var(--color-ink-faint)">{unit(yDef)}</tspan>
          </text>
          <text x={pad.left + innerW} y={height - 6} textAnchor="end" fontSize={11} className="font-display" fontWeight={600} fill="var(--color-ink)">
            {xDef.label}
            <tspan fontWeight={400} fill="var(--color-ink-faint)">{unit(xDef)}</tspan> →
          </text>

          <rect
            x={pad.left}
            y={pad.top}
            width={innerW}
            height={innerH}
            fill="transparent"
            className="cursor-crosshair"
            onPointerMove={(e) => {
              if (e.pointerType === "mouse") setHover(nearest(e, 18));
            }}
            onPointerLeave={() => setHover(null)}
            onClick={(e) => onSelect(nearest(e, 24))}
          />
        </svg>
      )}

      {tipPoint && (
        <div
          className="pointer-events-none absolute z-10 whitespace-nowrap rounded border border-line bg-paper px-2.5 py-1.5 text-[11px] leading-snug shadow-sm"
          style={{
            left: Math.min(Math.max(sx(tipPoint.x) + 12, 0), Math.max(0, width - 200)),
            top: Math.max(0, sy(tipPoint.y) - 64),
          }}
        >
          <div className="font-display text-[12px] font-semibold text-ink">{tipPoint.p.name}</div>
          <div className="font-mono text-ink-faint">
            {tipPoint.p.team} · {LEAGUE_DEFS[tipPoint.p.lg].short}
          </div>
          <div className="font-mono tnum text-ink-soft">
            {xDef.label}: {fmtStat(xDef, tipPoint.x, pct)}
          </div>
          <div className="font-mono tnum text-ink-soft">
            {yDef.label}: {fmtStat(yDef, tipPoint.y, pct)}
          </div>
          {colorDef && tipPoint.c !== null && (
            <div className="font-mono tnum text-ink-soft">
              {colorDef.label}: {fmtStat(colorDef, tipPoint.c, false)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The chart as a PNG, for posting. Paint is inlined from computed styles
 * (the SVG uses CSS variables and utility classes, which an <img> cannot
 * see), a heading and the site's address are added, and it renders at 2x.
 * Webfonts are not embedded, so the image falls back to system faces.
 */
export async function downloadPng(
  svg: SVGSVGElement,
  heading: string,
  sub: string,
  filename: string,
) {
  const w = svg.width.baseVal.value;
  const h = svg.height.baseVal.value;
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const src = [svg, ...svg.querySelectorAll("*")];
  const dst = [clone, ...clone.querySelectorAll("*")];
  const props = ["fill", "fill-opacity", "stroke", "stroke-width", "stroke-opacity", "stroke-dasharray", "font-family", "font-size", "font-weight", "paint-order"];
  src.forEach((el, i) => {
    const cs = getComputedStyle(el);
    const d = dst[i] as SVGElement;
    for (const p of props) d.style.setProperty(p, cs.getPropertyValue(p));
  });
  // the hit-testing overlay would paint as a flat box
  clone.querySelector("rect.cursor-crosshair")?.remove();

  // The paper is painted on <html>; <body> is transparent, and a transparent
  // card renders black-on-black wherever it is posted in dark mode.
  const paper = getComputedStyle(document.documentElement).backgroundColor;
  const ink = getComputedStyle(document.documentElement).getPropertyValue("--color-ink").trim() || "#111";
  const faint = getComputedStyle(document.documentElement).getPropertyValue("--color-ink-faint").trim() || "#777";
  const top = 64;
  const bottom = 30;
  const margin = 24;
  const W = w + margin * 2;
  const H = h + top + bottom;
  const ns = "http://www.w3.org/2000/svg";
  const out = document.createElementNS(ns, "svg");
  out.setAttribute("xmlns", ns);
  out.setAttribute("width", String(W));
  out.setAttribute("height", String(H));
  const bg = document.createElementNS(ns, "rect");
  bg.setAttribute("width", "100%");
  bg.setAttribute("height", "100%");
  bg.setAttribute("fill", paper);
  out.appendChild(bg);
  const text = (s: string, x: number, y: number, size: number, weight: number, color: string, anchor = "start") => {
    const t = document.createElementNS(ns, "text");
    t.setAttribute("x", String(x));
    t.setAttribute("y", String(y));
    t.setAttribute("font-size", String(size));
    t.setAttribute("font-weight", String(weight));
    t.setAttribute("font-family", "system-ui, -apple-system, Segoe UI, sans-serif");
    t.setAttribute("fill", color);
    t.setAttribute("text-anchor", anchor);
    t.textContent = s;
    out.appendChild(t);
  };
  text(heading, margin, 30, 18, 700, ink);
  text(sub, margin, 50, 12, 400, faint);
  clone.setAttribute("x", String(margin));
  clone.setAttribute("y", String(top));
  out.appendChild(clone);
  text("overexpected.com", W - margin, H - 10, 11, 600, faint, "end");

  const xml = new XMLSerializer().serializeToString(out);
  const url = URL.createObjectURL(new Blob([xml], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const img = new Image();
    img.decoding = "async";
    img.src = url;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = W * 2;
    canvas.height = H * 2;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(2, 2);
    ctx.drawImage(img, 0, 0);
    const blob = await new Promise<Blob>((res, rej) =>
      canvas.toBlob((b) => (b ? res(b) : rej(new Error("toBlob failed"))), "image/png"),
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  } finally {
    URL.revokeObjectURL(url);
  }
}
