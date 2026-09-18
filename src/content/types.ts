/**
 * Shapes for the copy that lives as data rather than in JSX, so the wording can
 * be edited without touching a component. `scripts/generate-static.mjs` reads the
 * same JSON files for the prerendered blocks, which is why they are .json and not
 * .ts: the generator is plain .mjs and cannot import TypeScript.
 */
export interface MetricRange {
  min?: number;
  p10?: number;
  median?: number;
  p90?: number;
  max?: number;
  n?: number;
  note?: string;
}

export interface GlossaryTerm {
  slug: string;
  name: string;
  abbr: string | null;
  unit: string;
  scope: "player" | "team" | "lineup" | "official";
  definition: string;
  formula: string | null;
  /** How the formula was checked against the shipped exports, where it was. */
  formulaNote?: string;
  /** Percentiles computed from every shipped row, not estimated. */
  rangeOf: MetricRange | null;
  howToRead: string;
  misses: string;
  related: string[];
}

export interface Glossary {
  generated: string;
  terms: GlossaryTerm[];
}

export interface ComparisonRow extends Array<string> {}

export interface Comparison {
  slug: string;
  title: string;
  question: string;
  lead: string;
  /** Glossary slug for our side of the comparison. */
  ours: string;
  oursAlt?: string;
  theirs: {
    name: string;
    abbr: string;
    formula: string | null;
    what: string;
  } | null;
  /** First row is the header when `theirs` is null and the table is a matrix. */
  rows: string[][];
  tableNote?: string;
  use: string;
  neither: string;
}

export interface Comparisons {
  generated: string;
  comparisons: Comparison[];
}

export interface ChangelogEntry {
  date: string;
  title: string;
  body: string;
}

export interface Changelog {
  generated: string;
  entries: ChangelogEntry[];
}

export interface About {
  generated: string;
  whatItIs: string;
  why: string;
  who: string;
  whoTodo: string;
  howItsBuilt: string;
  limits: string[];
  contact: string;
  licence: string;
}
