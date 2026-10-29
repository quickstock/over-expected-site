import { useTitle } from "../lib/useTitle";

/** A league-season's game list. Placeholder until the games hub lands. */
export default function Games() {
  useTitle("Games · Over Expected");
  return (
    <div className="mx-auto max-w-5xl px-5 py-12 sm:px-8 sm:py-16">
      <h1 className="font-display text-3xl font-bold tracking-tight text-ink sm:text-5xl">
        Games
      </h1>
    </div>
  );
}
