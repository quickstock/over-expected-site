import { Link } from "react-router-dom";
import aboutJson from "../content/about.json";
import type { About as A } from "../content/types";
import { useTitle } from "../lib/useTitle";

const about = aboutJson as A;

export default function About() {
  useTitle("About Over Expected");
  return (
    <article className="mx-auto max-w-2xl px-5 py-12 sm:px-8 sm:py-16">
      <h1 className="font-display text-3xl font-bold tracking-tight text-ink sm:text-5xl">
        About
      </h1>

      <h2 className="mt-10 font-display text-lg font-semibold text-ink">
        What Over Expected is
      </h2>
      <p className="mt-2 text-[15px] leading-relaxed sm:text-base">{about.whatItIs}</p>

      <h2 className="mt-8 font-display text-lg font-semibold text-ink">Why it exists</h2>
      <p className="mt-2 text-[15px] leading-relaxed sm:text-base">{about.why}</p>

      <h2 className="mt-8 font-display text-lg font-semibold text-ink">Who built it</h2>
      <p className="mt-2 text-[15px] leading-relaxed sm:text-base">{about.who}</p>

      <h2 className="mt-8 font-display text-lg font-semibold text-ink">How it is built</h2>
      <p className="mt-2 text-[15px] leading-relaxed sm:text-base">{about.howItsBuilt}</p>

      <h2 className="mt-8 font-display text-lg font-semibold text-ink">
        What it does not measure
      </h2>
      <ul className="mt-2 space-y-2">
        {about.limits.map((l) => (
          <li key={l} className="text-[15px] leading-relaxed">
            {l}
          </li>
        ))}
      </ul>

      <h2 className="mt-8 font-display text-lg font-semibold text-ink">
        Data, licence and citation
      </h2>
      <p className="mt-2 text-[15px] leading-relaxed sm:text-base">
        {about.licence}{" "}
        <Link to="/data" className="underline underline-offset-2 hover:text-ink">
          Download it here
        </Link>
        .
      </p>

      <h2 className="mt-8 font-display text-lg font-semibold text-ink">Contact</h2>
      <p className="mt-2 text-[15px] leading-relaxed sm:text-base">
        <a
          href={`mailto:${about.contact}`}
          className="underline underline-offset-2 hover:text-ink"
        >
          {about.contact}
        </a>
        . Corrections to the data are the most useful thing you can send.
      </p>
    </article>
  );
}
