import { useTitle } from "../lib/useTitle";

/** One game's page. Placeholder until the game view lands. */
export default function Game() {
  useTitle("Game · Over Expected");
  return (
    <div className="mx-auto max-w-5xl px-5 py-12 sm:px-8 sm:py-16">
      <h1 className="font-display text-3xl font-bold tracking-tight text-ink sm:text-5xl">
        Game
      </h1>
    </div>
  );
}
