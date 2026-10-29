/**
 * Shot coordinates to SVG. The court viewBox is in tenths of a foot on the NBA
 * court and 500 units across FIBA's 15 m, with the hoop at (HOOP_X, HOOP_Y);
 * every shot feed the site ships (the homepage sample, a game's shots) is in
 * centimetres from the hoop, x across and y out from the baseline.
 */

export const UNITS_PER_CM = { nba: 1 / 3.048, fiba: 500 / 1500 } as const;
export const HOOP_X = 250;
export const HOOP_Y = 52.5;
const R = 1.6;

/** One path of dots, one per shot whose outcome is `which` ("1" made, "0"
    missed) in the `made` string. A shot with an unknown location (null in
    either column) has nowhere to draw and is skipped. `r` is the dot radius
    in viewBox units: the default suits a season's thousands of shots, a
    single game's hundred wants larger dots. */
export function dotsPath(
  xs: readonly (number | null)[],
  ys: readonly (number | null)[],
  made: string,
  which: "0" | "1",
  court: keyof typeof UNITS_PER_CM,
  r: number = R,
): string {
  const u = UNITS_PER_CM[court];
  let d = "";
  for (let i = 0; i < made.length; i++) {
    const sx = xs[i];
    const sy = ys[i];
    if (made[i] !== which || sx == null || sy == null) continue;
    const x = HOOP_X + sx * u - r;
    const y = HOOP_Y + sy * u;
    d += `M${x.toFixed(1)} ${y.toFixed(1)}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;
  }
  return d;
}
