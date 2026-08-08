/**
 * Shared sortable column header with three states, cycled by click:
 * default (the view's own order, no indicator) -> descending -> ascending ->
 * back to default. The triangle renders only while an explicit sort is
 * active; its slot is reserved so columns never shift when it appears.
 */

export type SortDir = "asc" | "desc";

/**
 * The state after clicking column `k`. `sort` is the explicitly chosen key,
 * or null while the view is in its default order. Returns null to mean
 * "clear back to default".
 */
export function cycleSort<K extends string>(
  k: K,
  sort: K | null,
  dir: SortDir,
): { sort: K; dir: SortDir } | null {
  if (sort !== k) return { sort: k, dir: "desc" };
  if (dir === "desc") return { sort: k, dir: "asc" };
  return null;
}

function Triangle({ dir, visible }: { dir: SortDir; visible: boolean }) {
  return (
    <svg
      width="7"
      height="5"
      viewBox="0 0 7 5"
      aria-hidden="true"
      className="transition-opacity duration-150"
      style={{ opacity: visible ? 1 : 0 }}
    >
      <path
        d={dir === "asc" ? "M3.5 0.4 L6.6 4.6 L0.4 4.6 Z" : "M0.4 0.4 L6.6 0.4 L3.5 4.6 Z"}
        fill="currentColor"
      />
    </svg>
  );
}

export default function SortHeader<K extends string>({
  k,
  label,
  sort,
  dir,
  onSort,
  className = "",
}: {
  k: K;
  label: string;
  /** The explicit sort key, or null when the view is in its default order. */
  sort: K | null;
  dir: SortDir;
  onSort: (k: K) => void;
  className?: string;
}) {
  const active = sort === k;
  return (
    <button
      type="button"
      onClick={() => onSort(k)}
      aria-pressed={active}
      aria-label={
        active
          ? `${label}, sorted ${dir === "desc" ? "descending" : "ascending"}`
          : `Sort by ${label}`
      }
      className={`font-display text-[11px] font-medium uppercase tracking-wider transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${
        active ? "text-ink" : "text-ink-faint hover:text-ink-soft"
      } ${className}`}
    >
      {label}
      <span className="ml-1 inline-flex w-2 justify-start align-baseline">
        <Triangle dir={dir} visible={active} />
      </span>
    </button>
  );
}
