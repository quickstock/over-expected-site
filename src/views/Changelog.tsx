import { Link } from "react-router-dom";
import changelogJson from "../content/changelog.json";
import type { Changelog as C } from "../content/types";
import { useTitle } from "../lib/useTitle";

const data = changelogJson as C;

/** Dated changes, newest first. Every date is the day the change went live, taken
    from the project's own record; nothing here is backfilled or estimated. */
export default function Changelog() {
  useTitle("Changelog");
  return (
    <article className="mx-auto max-w-2xl px-5 py-12 sm:px-8 sm:py-16">
      <h1 className="font-display text-3xl font-bold tracking-tight text-ink sm:text-5xl">
        Changelog
      </h1>
      <p className="mt-4 text-base leading-relaxed text-ink-soft sm:text-lg">
        What changed and when, newest first. Model and data changes are listed
        alongside interface ones, because a number moving matters more than a page
        moving.
      </p>
      <ol className="mt-10">
        {data.entries.map((e) => (
          <li key={e.date + e.title} className="border-b border-line-soft py-5">
            <time
              dateTime={e.date}
              className="font-mono tnum text-xs uppercase tracking-wider text-ink-faint"
            >
              {e.date}
            </time>
            <h2 className="mt-1 font-display text-[17px] font-semibold text-ink">
              {e.title}
            </h2>
            <p className="mt-1.5 text-[15px] leading-relaxed text-ink-soft">{e.body}</p>
          </li>
        ))}
      </ol>
      <p className="mt-10 text-sm text-ink-soft">
        Data refreshes are also published as a{" "}
        <a href="/feed.json" className="underline underline-offset-2 hover:text-ink">
          JSON feed
        </a>
        . The numbers themselves are on the{" "}
        <Link to="/data" className="underline underline-offset-2 hover:text-ink">
          data page
        </Link>
        .
      </p>
    </article>
  );
}
