/**
 * The diverging FTAOE encoding. Warm = draws more free throws than the
 * league baseline, cool = fewer, neutral at zero. This is the only place
 * vivid color comes from; it is never decoration.
 *
 * The poles and scale come from the active league's theme. DataProvider
 * calls setLeagueTheme() during render, before any consumer renders, so
 * every chart in the tree reads the right poles for the league on screen.
 */
import { DEFAULT_LEAGUE, LEAGUE_DEFS, type League } from "../leagues";

let theme = LEAGUE_DEFS[DEFAULT_LEAGUE];

export function setLeagueTheme(lg: League) {
  theme = LEAGUE_DEFS[lg];
}

const NEUTRAL_L = 0.72;

/** FTAOE per 100 at which the scale saturates (league-dependent: drawn-FT
    spreads in the European builds run wider than the NBA's
    shooting-foul-only stat). */
export function scaleMax(): number {
  return theme.scaleMax;
}

function clamp01(t: number) {
  return Math.max(0, Math.min(1, t));
}

/** Strong solid for text, strokes, and chips. */
export function divergingColor(per100: number): string {
  const t = clamp01(Math.abs(per100) / theme.scaleMax);
  const pole = per100 >= 0 ? theme.warm : theme.cool;
  const l = NEUTRAL_L + (pole.l - NEUTRAL_L) * t;
  const c = 0.008 + (pole.c - 0.008) * t;
  return `oklch(${l.toFixed(3)} ${c.toFixed(3)} ${pole.h})`;
}

/** Light tint for row washes and area fills. */
export function divergingTint(per100: number, maxAlpha = 0.16): string {
  const t = clamp01(Math.abs(per100) / theme.scaleMax);
  const pole = per100 >= 0 ? theme.warm : theme.cool;
  return `oklch(${pole.l} ${pole.c} ${pole.h} / ${(t * maxAlpha).toFixed(3)})`;
}

/** Dark enough for body-size text on paper (WCAG AA). */
export function divergingText(per100: number): string {
  const pole = per100 >= 0 ? theme.warm : theme.cool;
  const l = per100 >= 0 ? Math.min(pole.l, 0.52) : 0.46;
  return `oklch(${l} ${pole.c} ${pole.h})`;
}

export const warmText = () => divergingText(theme.scaleMax);
export const coolText = () => divergingText(-theme.scaleMax);
