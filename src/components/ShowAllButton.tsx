/**
 * Expand/collapse control for ranked lists that open on their top 10.
 * Full-width so it reads as the continuation of the table it extends.
 */
export default function ShowAllButton({
  expanded,
  total,
  noun,
  onToggle,
}: {
  expanded: boolean;
  total: number;
  noun: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      className="group mt-3 flex w-full items-center justify-center gap-2 rounded-md border border-line py-2 font-display text-[13px] font-medium text-ink-soft transition-[color,background-color] duration-150 hover:bg-wash hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
    >
      <span className="inline-flex items-center gap-2 transition-transform duration-150 group-active:scale-[0.96]">
        {expanded ? "Show top 10" : `Show all ${total} ${noun}`}
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          aria-hidden="true"
          className={`transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
        >
          <path
            d="M1.5 3.5 L5 7 L8.5 3.5"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </button>
  );
}
