import { Link } from "react-router-dom";
import { divergingText } from "../lib/color";
import { signed } from "../lib/format";

export interface RankItem {
  id: string;
  label: string;
  value: number;
  /** Where the name leads; rows without one are plain text. */
  to?: string;
}

/**
 * The two ends of a ranking, set beside the chart they come from: the top five
 * and the bottom five by name, in the diverging encoding. Hover is shared with
 * the chart, so a name lights its mark and a mark lights its name.
 */
export default function RankList({
  topTitle,
  bottomTitle,
  unit,
  top,
  bottom,
  hover,
  onHover,
  neutral = false,
}: {
  topTitle: string;
  bottomTitle: string;
  /** One line under the lists naming what the numbers are. */
  unit: string;
  top: RankItem[];
  bottom: RankItem[];
  hover: string | null;
  onHover: (id: string | null) => void;
  /** Values in ink rather than red and blue, for a ranking that is not a
      player's over-expected figure (officials). */
  neutral?: boolean;
}) {
  const block = (title: string, items: RankItem[]) => (
    <div>
      <p className="font-display text-[11px] font-medium uppercase tracking-wider text-ink-faint">
        {title}
      </p>
      <ol className="mt-1.5">
        {items.map((it, i) => {
          const row = `-mx-2 flex items-baseline gap-2.5 rounded px-2 py-1 text-[13px] transition-colors duration-150 ${
            hover === it.id ? "bg-wash" : ""
          }`;
          const body = (
            <>
              <span className="w-3 font-mono tnum text-[11px] text-ink-faint">{i + 1}</span>
              <span className="min-w-0 flex-1 truncate font-display text-ink">{it.label}</span>
              <span
                className="font-mono tnum"
                style={{ color: neutral ? "var(--color-ink-soft)" : divergingText(it.value) }}
              >
                {signed(it.value, 1)}
              </span>
            </>
          );
          const events = {
            onPointerEnter: () => onHover(it.id),
            onPointerLeave: () => onHover(null),
            onFocus: () => onHover(it.id),
            onBlur: () => onHover(null),
          };
          return (
            <li key={it.id}>
              {it.to ? (
                <Link
                  to={it.to}
                  className={`${row} focus-visible:outline-2 focus-visible:outline-ink`}
                  {...events}
                >
                  {body}
                </Link>
              ) : (
                <div className={row} {...events}>
                  {body}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
  return (
    <div className="flex flex-col gap-5">
      {block(topTitle, top)}
      {block(bottomTitle, bottom)}
      <p className="font-mono text-[10.5px] leading-snug text-ink-faint">{unit}</p>
    </div>
  );
}
