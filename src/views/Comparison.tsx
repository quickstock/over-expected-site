import { Link, Navigate, useParams } from "react-router-dom";
import comparisonsJson from "../content/comparisons.json";
import glossaryJson from "../content/glossary.json";
import type { Comparisons, Glossary } from "../content/types";
import { useTitle } from "../lib/useTitle";

const data = comparisonsJson as Comparisons;
const glossary = glossaryJson as Glossary;
const bySlug = new Map(data.comparisons.map((c) => [c.slug, c]));
const termName = (slug: string) =>
  glossary.terms.find((t) => t.slug === slug)?.name ?? slug;

/** Index of the metric-versus-metric pages. */
export function ComparisonIndex() {
  useTitle("Metric comparisons");
  return (
    <article className="mx-auto max-w-3xl px-5 py-12 sm:px-8 sm:py-16">
      <h1 className="font-display text-3xl font-bold tracking-tight text-ink sm:text-5xl">
        Metric comparisons
      </h1>
      <p className="mt-4 text-base leading-relaxed text-ink-soft sm:text-lg">
        What this site measures, set against the public metrics it is most often
        confused with. Each page states what both measure, when each is the right
        tool, and what neither can tell you.
      </p>
      <ul className="mt-10">
        {data.comparisons.map((c) => (
          <li key={c.slug} className="border-b border-line-soft py-3">
            <Link
              to={`/metrics/${c.slug}`}
              className="font-display text-[15px] font-semibold text-ink underline underline-offset-2 hover:text-ink-soft"
            >
              {c.title}
            </Link>
            <p className="mt-1 text-sm leading-relaxed text-ink-soft">{c.question}</p>
          </li>
        ))}
      </ul>
    </article>
  );
}

export default function Comparison() {
  const { slug } = useParams();
  const c = slug ? bySlug.get(slug) : undefined;
  useTitle(c ? c.title : "Metric comparisons");
  if (!c) return <Navigate to="/metrics" replace />;
  const matrix = c.theirs === null && c.rows.length > 1 && c.rows[0].length > 3;
  return (
    <article className="mx-auto max-w-2xl px-5 py-12 sm:px-8 sm:py-16">
      <p className="font-mono text-xs uppercase tracking-wider text-ink-faint">
        <Link to="/metrics" className="underline underline-offset-2 hover:text-ink">
          Comparisons
        </Link>
      </p>
      <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
        {c.title}
      </h1>

      <h2 className="mt-10 font-display text-lg font-semibold text-ink">{c.question}</h2>
      <p className="mt-2 text-[15px] leading-relaxed sm:text-base">{c.lead}</p>

      {c.theirs && (
        <>
          <h2 className="mt-8 font-display text-lg font-semibold text-ink">
            {c.theirs.name} ({c.theirs.abbr})
          </h2>
          <p className="mt-2 text-[15px] leading-relaxed sm:text-base">{c.theirs.what}</p>
          {c.theirs.formula && (
            <p className="mt-2 rounded border border-line bg-wash p-3 font-mono text-xs">
              {c.theirs.formula}
            </p>
          )}
        </>
      )}

      <h2 className="mt-8 font-display text-lg font-semibold text-ink">
        Side by side
      </h2>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">{c.title}: what each measures</caption>
          {matrix ? (
            <>
              <thead>
                <tr className="border-b border-line text-left">
                  {c.rows[0].map((h) => (
                    <th key={h} scope="col" className="py-1.5 pr-4 font-display text-[11px] font-medium uppercase tracking-wider text-ink-faint">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {c.rows.slice(1).map((r) => (
                  <tr key={r[0]} className="border-b border-line-soft">
                    <th scope="row" className="py-2 pr-4 text-left font-normal">{r[0]}</th>
                    {r.slice(1).map((v, i) => (
                      <td key={i} className="py-2 pr-4 font-mono tnum">{v}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </>
          ) : (
            <tbody>
              {c.rows.map((r) => (
                <tr key={r[0]} className="border-b border-line-soft align-top">
                  <th scope="row" className="w-1/3 py-2 pr-4 text-left font-display text-[13px] font-medium">
                    {r[0]}
                  </th>
                  {r.slice(1).map((v, i) => (
                    <td key={i} className="py-2 pr-4 leading-relaxed">{v}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          )}
        </table>
      </div>
      {c.tableNote && (
        <p className="mt-2 text-xs leading-relaxed text-ink-faint">{c.tableNote}</p>
      )}

      <h2 className="mt-8 font-display text-lg font-semibold text-ink">
        Which should you use?
      </h2>
      <p className="mt-2 text-[15px] leading-relaxed sm:text-base">{c.use}</p>

      <h2 className="mt-8 font-display text-lg font-semibold text-ink">
        What neither measures
      </h2>
      <p className="mt-2 text-[15px] leading-relaxed sm:text-base">{c.neither}</p>

      <p className="mt-12 border-t border-line pt-6 text-sm text-ink-soft">
        Definitions:{" "}
        <Link to={`/glossary/${c.ours}`} className="underline underline-offset-2 hover:text-ink">
          {termName(c.ours)}
        </Link>
        {c.oursAlt ? (
          <>
            {" "}and{" "}
            <Link to={`/glossary/${c.oursAlt}`} className="underline underline-offset-2 hover:text-ink">
              {termName(c.oursAlt)}
            </Link>
          </>
        ) : null}
        . The model behind them:{" "}
        <Link to="/methodology" className="underline underline-offset-2 hover:text-ink">
          methodology
        </Link>
        .
      </p>
    </article>
  );
}
