import { Link, useParams, Navigate } from "react-router-dom";
import glossaryJson from "../content/glossary.json";
import type { Glossary as G, GlossaryTerm } from "../content/types";
import { useTitle } from "../lib/useTitle";
import { SITE_LINE } from "../lib/site";

const glossary = glossaryJson as G;
const bySlug = new Map(glossary.terms.map((t) => [t.slug, t]));

const SCOPE_LABEL: Record<GlossaryTerm["scope"], string> = {
  player: "Player",
  team: "Team",
  lineup: "Lineup",
  official: "Official",
};

function Range({ term }: { term: GlossaryTerm }) {
  const r = term.rangeOf;
  if (!r) return null;
  if (r.note)
    return <p className="mt-2 text-sm leading-relaxed text-ink-soft">{r.note}</p>;
  return (
    <table className="mt-3 w-full text-sm">
      <caption className="sr-only">
        {term.name}: the range across every value the site publishes
      </caption>
      <thead>
        <tr className="border-b border-line text-left">
          {["Lowest", "10th", "Median", "90th", "Highest"].map((h) => (
            <th key={h} scope="col" className="py-1.5 pr-4 font-display text-[11px] font-medium uppercase tracking-wider text-ink-faint">
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        <tr>
          {[r.min, r.p10, r.median, r.p90, r.max].map((v, i) => (
            <td key={i} className="py-2 pr-4 font-mono tnum">
              {v ?? "—"}
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  );
}

/** The index: every measured quantity the site publishes, grouped by what it
    describes. */
export default function Glossary() {
  useTitle("Glossary of basketball shot-value metrics");
  const groups: GlossaryTerm["scope"][] = ["player", "team", "lineup", "official"];
  return (
    <article className="mx-auto max-w-3xl px-5 py-12 sm:px-8 sm:py-16">
      <h1 className="font-display text-3xl font-bold tracking-tight text-ink sm:text-5xl">
        Glossary
      </h1>
      <p className="mt-4 text-base leading-relaxed text-ink-soft sm:text-lg">
        Every quantity this site measures, what it is, how to read it, and what it
        does not tell you. {SITE_LINE}
      </p>
      {groups.map((scope) => {
        const terms = glossary.terms.filter((t) => t.scope === scope);
        if (!terms.length) return null;
        return (
          <section key={scope}>
            <h2 className="mt-12 font-display text-xl font-semibold tracking-tight text-ink sm:text-2xl">
              {SCOPE_LABEL[scope]}
            </h2>
            <ul className="mt-4">
              {terms.map((t) => (
                <li key={t.slug} className="border-b border-line-soft py-3">
                  <Link
                    to={`/glossary/${t.slug}`}
                    className="font-display text-[15px] font-semibold text-ink underline underline-offset-2 hover:text-ink-soft"
                  >
                    {t.name}
                    {t.abbr ? <span className="text-ink-faint"> ({t.abbr})</span> : null}
                  </Link>
                  <p className="mt-1 text-sm leading-relaxed text-ink-soft">
                    {t.definition.split(". ")[0]}.
                  </p>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </article>
  );
}

/** One term. The copy is entirely from the content file; the range is computed
    from every value the site publishes, not estimated. */
export function GlossaryTermPage() {
  const { slug } = useParams();
  const term = slug ? bySlug.get(slug) : undefined;
  useTitle(term ? `${term.name}, explained` : "Glossary");
  if (!term) return <Navigate to="/glossary" replace />;
  return (
    <article className="mx-auto max-w-2xl px-5 py-12 sm:px-8 sm:py-16">
      <p className="font-mono text-xs uppercase tracking-wider text-ink-faint">
        <Link to="/glossary" className="underline underline-offset-2 hover:text-ink">
          Glossary
        </Link>{" "}
        · {SCOPE_LABEL[term.scope]}
      </p>
      <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">
        {term.name}
      </h1>
      <p className="mt-1 font-mono text-sm text-ink-faint">
        {term.abbr ? `${term.abbr} · ` : ""}
        {term.unit}
      </p>

      <h2 className="mt-10 font-display text-lg font-semibold text-ink">
        What is {term.name.toLowerCase()}?
      </h2>
      <p className="mt-2 text-[15px] leading-relaxed sm:text-base">{term.definition}</p>

      {term.formula && (
        <>
          <h2 className="mt-8 font-display text-lg font-semibold text-ink">Formula</h2>
          <p className="mt-2 rounded border border-line bg-wash p-3 font-mono text-xs leading-relaxed">
            {term.formula}
          </p>
          {term.formulaNote && (
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">{term.formulaNote}</p>
          )}
        </>
      )}

      {term.rangeOf && (
        <>
          <h2 className="mt-8 font-display text-lg font-semibold text-ink">
            Normal range
          </h2>
          <Range term={term} />
          {term.rangeOf.n ? (
            <p className="mt-2 text-xs text-ink-faint">
              Across {term.rangeOf.n.toLocaleString("en-US")} published values.
            </p>
          ) : null}
        </>
      )}

      <h2 className="mt-8 font-display text-lg font-semibold text-ink">How to read it</h2>
      <p className="mt-2 text-[15px] leading-relaxed sm:text-base">{term.howToRead}</p>

      <h2 className="mt-8 font-display text-lg font-semibold text-ink">
        What it does not measure
      </h2>
      <p className="mt-2 text-[15px] leading-relaxed sm:text-base">{term.misses}</p>

      {term.related.length > 0 && (
        <>
          <h2 className="mt-8 font-display text-lg font-semibold text-ink">Related</h2>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {term.related.map((r) => {
              const t = bySlug.get(r);
              return t ? (
                <li key={r}>
                  <Link
                    to={`/glossary/${r}`}
                    className="text-[15px] underline underline-offset-2 hover:text-ink-soft"
                  >
                    {t.name}
                  </Link>
                </li>
              ) : null;
            })}
          </ul>
        </>
      )}

      <p className="mt-12 border-t border-line pt-6 text-sm text-ink-soft">
        How the model behind these numbers works:{" "}
        <Link to="/methodology" className="underline underline-offset-2 hover:text-ink">
          methodology
        </Link>
        . Where they come from:{" "}
        <Link to="/data" className="underline underline-offset-2 hover:text-ink">
          the data
        </Link>
        .
      </p>
    </article>
  );
}
