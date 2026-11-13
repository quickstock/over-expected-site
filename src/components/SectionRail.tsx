import { useEffect, useRef, useState } from "react";

/**
 * How far down the homepage you are. On wide screens: the section names in the
 * left margin beside a hairline that fills as you scroll, the current section
 * in ink, each name a jump to its section. Below that width there is no margin
 * to hold it, so it becomes a 2px bar along the top of the window.
 *
 * The fill follows scroll directly (no easing, nothing to reduce), and is
 * written to the elements' transforms rather than through React state, which
 * only changes when the current section does.
 */
export default function SectionRail({
  sections,
}: {
  sections: { id: string; label: string }[];
}) {
  const fillRef = useRef<HTMLSpanElement>(null);
  const barRef = useRef<HTMLSpanElement>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    let raf = 0;
    const measure = () => {
      raf = 0;
      const line = window.innerHeight * 0.35;
      // a section can be absent (a season too small for one of the charts)
      const present = sections
        .map((s, k) => ({ k, el: document.getElementById(s.id) }))
        .filter((p): p is { k: number; el: HTMLElement } => p.el !== null)
        .map(({ k, el }) => ({ k, top: el.getBoundingClientRect().top }));
      if (present.length === 0) return;
      let at = 0;
      present.forEach((p, i) => {
        if (p.top <= line) at = i;
      });
      const cur = present[at];
      const next = present[at + 1];
      const span = next
        ? next.top - cur.top
        : document.documentElement.scrollHeight - window.scrollY - cur.top;
      const within = Math.min(1, Math.max(0, (line - cur.top) / Math.max(1, span)));
      const fill = (cur.k + (next ? within * (next.k - cur.k) : 0)) / (sections.length - 1);
      if (fillRef.current) fillRef.current.style.transform = `scaleY(${Math.min(1, fill)})`;
      const total = document.documentElement.scrollHeight - window.innerHeight;
      if (barRef.current)
        barRef.current.style.transform = `scaleX(${total > 0 ? window.scrollY / total : 0})`;
      setActive(cur.k);
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [sections]);

  const jump = (e: React.MouseEvent, id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    e.preventDefault();
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  };

  return (
    <>
      <span
        ref={barRef}
        aria-hidden="true"
        className="fixed left-0 top-0 z-50 h-0.5 w-full origin-left bg-ink xl:hidden"
        style={{ transform: "scaleX(0)" }}
      />
      <nav
        aria-label="On this page"
        className="fixed left-6 top-[38%] z-30 hidden -translate-y-1/2 xl:block"
      >
        <ol className="relative flex flex-col gap-3.5 pl-4">
          <span aria-hidden="true" className="absolute bottom-[7px] left-0 top-[7px] w-px bg-line" />
          <span
            ref={fillRef}
            aria-hidden="true"
            className="absolute bottom-[7px] left-0 top-[7px] w-px origin-top bg-ink"
            style={{ transform: "scaleY(0)" }}
          />
          {sections.map((s, k) => (
            <li key={s.id} className="relative">
              <span
                aria-hidden="true"
                className={`absolute -left-[18.5px] top-[5px] h-[5px] w-[5px] rounded-full transition-colors duration-200 ${
                  k <= active ? "bg-ink" : "bg-line"
                }`}
              />
              <a
                href={`#${s.id}`}
                onClick={(e) => jump(e, s.id)}
                aria-current={k === active ? "location" : undefined}
                className={`block whitespace-nowrap font-display text-[11px] font-medium uppercase leading-[15px] tracking-wider transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${
                  k === active ? "text-ink" : "text-ink-faint hover:text-ink-soft"
                }`}
              >
                {s.label}
              </a>
            </li>
          ))}
        </ol>
      </nav>
    </>
  );
}
