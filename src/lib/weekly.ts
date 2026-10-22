import type { WeeklyRow } from "../types";

/** "2026-10-12" -> "Oct 12 – 18, 2026" (UTC, so no timezone shifts a day). */
export function weekRange(week: string): string {
  const start = new Date(`${week}T00:00:00Z`);
  const end = new Date(start.getTime() + 6 * 86_400_000);
  const md = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const sameMonth = start.getUTCMonth() === end.getUTCMonth();
  return `${md(start)} – ${sameMonth ? end.getUTCDate() : md(end)}, ${end.getUTCFullYear()}`;
}

/** "2026-10-18" -> "Sun, Oct 18". */
export function gameDate(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric", timeZone: "UTC",
  });
}

/** "GIR vs COR" at home, "RTK at LEM" away. */
export function matchup(r: WeeklyRow): string {
  return `${r.team} ${r.home ? "vs" : "at"} ${r.opp}`;
}
