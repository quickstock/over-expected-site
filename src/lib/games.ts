import type { League } from "../leagues";
import type { GameDetail } from "../types";

/** Seconds in one period. Regulation is four quarters, 12 minutes in the NBA
    and 10 everywhere else (FIBA leagues and the WNBA); every overtime is 5. */
export function periodSeconds(lg: League, period: number): number {
  if (period < 1) throw new Error(`period ${period} does not exist`);
  if (period > 4) return 300;
  return lg === "NBA" ? 720 : 600;
}

/** Seconds of game time played when `secLeft` remain in `period` (the clock
    counts down in the feeds). Overtimes continue from regulation's end. */
export function elapsed(lg: League, period: number, secLeft: number): number {
  let t = 0;
  for (let p = 1; p < period; p++) t += periodSeconds(lg, p);
  return t + periodSeconds(lg, period) - secLeft;
}

/** The game's scoring race: home-minus-away margin after every shot and free
    throw, over elapsed game seconds. `actual` is points scored (a made shot at
    its value, a made free throw at 1) and `expected` what the same attempts
    were worth (xFG x value per shot, the shooter's FT% per free throw). Starts
    at 0-0 at t = 0. Events share a second often; a shot sorts before the free
    throws it drew. */
export function raceSeries(
  lg: League,
  d: GameDetail,
): { t: number[]; actual: number[]; expected: number[] } {
  const events: { t: number; actual: number; expected: number }[] = [];
  const sideSign = (playerIdx: number) => (d.p[playerIdx][2] === 0 ? 1 : -1);

  const { s, f } = d;
  for (let i = 0; i < s.m.length; i++) {
    const sign = sideSign(s.p[i]);
    const value = Number(s.v[i]);
    events.push({
      t: elapsed(lg, s.q[i], s.c[i]),
      actual: s.m[i] === "1" ? sign * value : 0,
      expected: (sign * s.e[i] * value) / 1000,
    });
  }
  for (let i = 0; i < f.m.length; i++) {
    const sign = sideSign(f.p[i]);
    events.push({
      t: elapsed(lg, f.q[i], f.c[i]),
      actual: f.m[i] === "1" ? sign : 0,
      expected: (sign * f.e[i]) / 1000,
    });
  }
  events.sort((a, b) => a.t - b.t);

  const t = [0];
  const actual = [0];
  const expected = [0];
  for (const e of events) {
    t.push(e.t);
    actual.push(actual[actual.length - 1] + e.actual);
    expected.push(expected[expected.length - 1] + e.expected);
  }
  return { t, actual, expected };
}
