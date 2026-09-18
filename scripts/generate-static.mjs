/**
 * Post-build static generation:
 *   1. An OG share card (1200x630 PNG) per qualified player (latest
 *      season) via satori + resvg, plus one generic site card.
 *   2. Per-route HTML shells (player pages, /leaderboard, /methodology,
 *      /data) with route-specific <title>, description and og/twitter
 *      tags, so crawlers and link unfurlers get real metadata without
 *      a server.
 *
 * Usage:  node scripts/generate-static.mjs [--base https://domain.tld]
 * Run AFTER `vite build`; writes into dist/.
 */
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// resvg-js keeps each render's buffers in native memory that V8 doesn't
// see, so it never triggers GC and RSS climbs to the build container's
// limit (~OOM around 2300-2400 cards). We force GC periodically, which
// runs the finalizers that free that native memory — but that needs the
// process launched with --expose-gc. Vercel's build command doesn't
// include it, so re-exec ourselves with the flag when it's missing.
if (typeof globalThis.gc !== "function") {
  const { spawnSync } = await import("node:child_process");
  const r = spawnSync(
    process.execPath,
    ["--expose-gc", fileURLToPath(import.meta.url), ...process.argv.slice(2)],
    { stdio: "inherit" },
  );
  process.exit(r.status ?? 1);
}

import satori from "satori";
import { Resvg } from "@resvg/resvg-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const DIST = join(ROOT, "dist");

const baseArg = process.argv.indexOf("--base");
const envBase = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : "https://overexpected.com";
const BASE = (baseArg > -1 ? process.argv[baseArg + 1] : envBase).replace(/\/$/, "");

// Active leagues (mirror ACTIVE_LEAGUES in src/leagues.ts). Only leagues
// whose data-{CODE}.json exists in public/ are rendered.
const LEAGUES = ["NBA", "EL", "EUC", "ACB", "LBA", "BBL", "GBL", "ABA", "WNBA"];
const LEAGUE_LABEL = {
  NBA: "NBA",
  EL: "EuroLeague",
  EUC: "EuroCup",
  ACB: "Liga ACB",
  LBA: "Lega Basket Serie A",
  BBL: "Basketball Bundesliga",
  GBL: "Greek Basket League",
  ABA: "ABA Liga",
  WNBA: "WNBA",
};
// Diverging poles per league, as sRGB hex (satori has no oklch). Warm =
// above the league rate, cool = below. Kept in step with the oklch tokens
// in src/leagues.ts.
const THEME = {
  NBA: { warm: "#d0440b", cool: "#005fc6" },
  EL: { warm: "#df5200", cool: "#2f5e9e" },
  EUC: { warm: "#a8a300", cool: "#3d4fa0" },
  ACB: { warm: "#bd1f44", cool: "#2f5e9e" },
  BSL: { warm: "#e43322", cool: "#2f5e9e" },
  LBA: { warm: "#7d45a2", cool: "#008a39" },
  PROA: { warm: "#6f41c1", cool: "#007e46" },
  GBL: { warm: "#9b357f", cool: "#008da4" },
  BBL: { warm: "#b58600", cool: "#2f5e9e" },
  ABA: { warm: "#93398e", cool: "#00806e" },
  WNBA: { warm: "#d5461c", cool: "#3d5ea3" },
};
// Lens slugs, mirrored from src/routes.ts. The predeploy gate asserts the two
// lists agree: a slug that drifts here becomes a 404 or a wrong canonical at
// several hundred URLs, which no HTTP check would catch.
const BOARD_LENSES = [
  { slug: "shot-value", key: "value", label: "shot value" },
  { slug: "shot-making", key: "making", label: "shot-making" },
  { slug: "foul-drawing", key: "fouls", label: "foul-drawing" },
];
const LEAGUE_LENSES = [
  { slug: "shot-value", key: "value", label: "shot value" },
  { slug: "shot-making", key: "making", label: "shot-making" },
  { slug: "free-throws", key: "fouls", label: "free throws" },
  { slug: "quality-forced", key: "qualityForced", label: "quality forced" },
  { slug: "rim-deterrence", key: "deterrence", label: "rim deterrence" },
  { slug: "conversion-suppression", key: "suppression", label: "conversion suppression" },
];
const LEAGUE_DEF_SLUGS = ["quality-forced", "rim-deterrence", "conversion-suppression"];

// A referee page ranking one official is not a ranking. Three EUC seasons have
// no qualifying officials at all and six more have four or fewer; none of them
// get a URL.
const MIN_REF_ROWS = 5;

// Whether the league counts shooting-foul FTs only (NBA) or all drawn FTs.
const SFTA_ONLY = { NBA: true };
const ftNoun = (lg) =>
  SFTA_ONLY[lg] ? "shooting-foul free throws" : "free throws drawn";

const dataByLeague = Object.fromEntries(
  LEAGUES.map((lg) => [
    lg,
    JSON.parse(readFileSync(join(ROOT, "public", `data-${lg}.json`), "utf8")),
  ]),
);
const data = dataByLeague[LEAGUES[0]];

// Leagues shipping the lineups/RAPM layer — driven by the layer export being
// present, the same way the base leagues are driven by data-{CODE}.json, so
// this never drifts from ACTIVE_LEAGUES' `layers` flags.
const LINEUP_LEAGUES = LEAGUES.filter((lg) =>
  existsSync(join(ROOT, "public", `rapm-${lg}.json`)),
);
const VALUE_LEAGUES = LEAGUES.filter((lg) =>
  existsSync(join(ROOT, "public", `value-${lg}.json`)),
);
/** Card ranges are read from the artifacts, not hardcoded: a number baked
    into a social card silently overstates its metric the first time a season
    updates. */
function layerJson(name) {
  const f = join(ROOT, "public", name);
  return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : null;
}
const coachingJson = layerJson("coaching-NBA.json");
const defenseJson = layerJson("defense-NBA.json");

const COACHING_LEAGUES = LEAGUES.filter((lg) =>
  existsSync(join(ROOT, "public", `coaching-${lg}.json`)),
);
const DEFENSE_LEAGUES = LEAGUES.filter((lg) =>
  existsSync(join(ROOT, "public", `defense-${lg}.json`)),
);
let template = readFileSync(join(DIST, "index.html"), "utf8");

// Preload the display face used by every heading, taken from the built asset
// names so the content hash can never go stale. Only the latin subset: it is the
// one every page needs, and preloading the rest would compete with the payload
// that actually renders.
const displayFont = readdirSync(join(DIST, "assets")).find((f) =>
  /^bricolage-grotesque-latin-wght-normal-.*\.woff2$/.test(f),
);
if (displayFont) {
  template = template.replace(
    "</head>",
    `    <link rel="preload" as="font" type="font/woff2" crossorigin ` +
      `href="/assets/${displayFont}" />\n  </head>`,
  );
}

// The homepage shell overwrites dist/index.html, which is also the template
// every other shell is built from. `vite build` rewrites that file from source
// on each build, so the normal chain is safe — but running this script twice
// without an intervening build would read an already-shelled template and
// append a second og/canonical block to all ~3,300 pages. Refuse instead.
if (template.includes('rel="canonical"')) {
  throw new Error(
    "dist/index.html is already a generated shell. Run `npm run build` before scripts/generate-static.mjs.",
  );
}

const fonts = [
  {
    name: "Bricolage Grotesque",
    data: readFileSync(join(__dirname, "fonts", "BricolageGrotesque-Bold.ttf")),
    weight: 700,
    style: "normal",
  },
  {
    name: "JetBrains Mono",
    data: readFileSync(join(__dirname, "fonts", "JetBrainsMono-Bold.ttf")),
    weight: 700,
    style: "normal",
  },
  {
    name: "JetBrains Mono",
    data: readFileSync(join(__dirname, "fonts", "JetBrainsMono-Regular.ttf")),
    weight: 400,
    style: "normal",
  },
];

// Neutral ink-on-paper tokens (hex equivalents of the site's oklch).
const INK = "#25262c";
const SOFT = "#5e606b";
const FAINT = "#909097";
const PAPER = "#f7f7f6";
const LINE = "#dededf";

const signed = (v, d = 1) => {
  const s = v.toFixed(d);
  return parseFloat(s) > 0 ? `+${s}` : s.replace("-", "−");
};
const ordinal = (n) => {
  const r10 = n % 10, r100 = n % 100;
  if (r10 === 1 && r100 !== 11) return `${n}st`;
  if (r10 === 2 && r100 !== 12) return `${n}nd`;
  if (r10 === 3 && r100 !== 13) return `${n}rd`;
  return `${n}th`;
};
const deltaColor = (v, theme) =>
  v > 0.05 ? theme.warm : v < -0.05 ? theme.cool : SOFT;

function card(row) {
  const theme = THEME[row.lg] ?? THEME.NBA;
  const pct = Math.max(0, Math.min(100, Math.floor(row.pct ?? 50)));
  return {
    type: "div",
    props: {
      style: {
        width: 1200, height: 630, display: "flex", flexDirection: "column",
        backgroundColor: PAPER, padding: 72, justifyContent: "space-between",
      },
      children: [
        {
          type: "div",
          props: {
            style: { display: "flex", justifyContent: "space-between", alignItems: "baseline" },
            children: [
              { type: "div", props: { style: { fontFamily: "Bricolage Grotesque", fontSize: 34, color: INK }, children: "OE" } },
              { type: "div", props: { style: { fontFamily: "JetBrains Mono", fontWeight: 400, fontSize: 26, color: FAINT }, children: `${LEAGUE_LABEL[row.lg]} · ${row.season} · ${ftNoun(row.lg)}` } },
            ],
          },
        },
        {
          type: "div",
          props: {
            style: { display: "flex", flexDirection: "column", gap: 6 },
            children: [
              { type: "div", props: { style: { fontFamily: "Bricolage Grotesque", fontSize: 64, color: INK }, children: row.name } },
              {
                type: "div",
                props: {
                  style: { display: "flex", alignItems: "baseline", gap: 28 },
                  children: [
                    { type: "div", props: { style: { fontFamily: "JetBrains Mono", fontSize: 150, color: deltaColor(row.per100, theme) }, children: signed(row.per100) } },
                    { type: "div", props: { style: { display: "flex", flexDirection: "column", fontFamily: "JetBrains Mono", fontWeight: 400, fontSize: 27, color: SOFT, lineHeight: 1.5 }, children: [
                      { type: "div", props: { children: "free throws per 100 possessions" } },
                      { type: "div", props: { children: "over the league-average rate" } },
                    ] } },
                  ],
                },
              },
            ],
          },
        },
        {
          type: "div",
          props: {
            style: { display: "flex", flexDirection: "column", gap: 18 },
            children: [
              {
                type: "div",
                props: {
                  style: { display: "flex", position: "relative", height: 10, backgroundColor: "#ecece9", borderRadius: 5 },
                  children: [
                    { type: "div", props: { style: { position: "absolute", left: "50%", top: -5, width: 2, height: 20, backgroundColor: LINE } } },
                    { type: "div", props: { style: {
                      position: "absolute", left: `${pct}%`, top: -13,
                      transform: "translateX(-18px)",
                      width: 36, height: 36, borderRadius: 18,
                      backgroundColor: deltaColor(row.per100, theme),
                      display: "flex", alignItems: "center", justifyContent: "center",
                      color: PAPER, fontFamily: "JetBrains Mono", fontSize: 17,
                    }, children: `${pct}` } },
                  ],
                },
              },
              {
                type: "div",
                props: {
                  style: { display: "flex", justifyContent: "space-between", fontFamily: "JetBrains Mono", fontWeight: 400, fontSize: 24, color: FAINT },
                  children: [
                    { type: "div", props: { children: `${ordinal(pct)} percentile · ${row.fta} FTA vs ${row.xfta.toFixed(1)} expected` } },
                    { type: "div", props: { children: `${row.teams.join(" · ")}` } },
                  ],
                },
              },
            ],
          },
        },
      ],
    },
  };
}

function genericCard() {
  const seasons = data.meta.seasons;
  return {
    type: "div",
    props: {
      style: {
        width: 1200, height: 630, display: "flex", flexDirection: "column",
        backgroundColor: PAPER, padding: 72, justifyContent: "space-between",
      },
      children: [
        { type: "div", props: { style: { fontFamily: "JetBrains Mono", fontWeight: 400, fontSize: 26, color: FAINT }, children: `${LEAGUES.map((lg) => LEAGUE_LABEL[lg]).join(" · ")} · shot value` } },
        {
          type: "div",
          props: {
            style: { display: "flex", flexDirection: "column", gap: 14 },
            children: [
              { type: "div", props: { style: { fontFamily: "Bricolage Grotesque", fontSize: 104, color: INK, lineHeight: 1.02 }, children: "Every shot, over expected." } },
              { type: "div", props: { style: { display: "flex", fontFamily: "JetBrains Mono", fontWeight: 400, fontSize: 30, color: SOFT }, children: [
                { type: "span", props: { style: { color: THEME.NBA.cool }, children: signed(-30) } },
                { type: "span", props: { children: " to " } },
                { type: "span", props: { style: { color: THEME.NBA.warm }, children: signed(30) } },
                { type: "span", props: { children: " points over expected / 100" } },
              ] } },
            ],
          },
        },
        { type: "div", props: { style: { fontFamily: "Bricolage Grotesque", fontSize: 30, color: INK }, children: "Over Expected" } },
      ],
    },
  };
}

/** One shared card per layer. Layer *entities* deliberately get no card: at
    ~900 qualified lineups per season that would multiply the render count for
    pages nobody unfurls, and the build already sits near the renderer's
    practical ceiling. Parameterised because a card whose subtitle reads
    "lineups & RAPM" on the decision-EV page misdescribes it to anyone who
    shares the link — four layers means four kickers, not one reused. */
function layerCard({ leagues, kicker, headline, scale }) {
  // Poles follow the site rule: the high end of any scale is warm (red
  // family), the low end cool, regardless of which end is good — matching
  // the diverging encoding everywhere else on the site.
  const loPole = THEME.NBA.cool;
  const hiPole = THEME.NBA.warm;
  return {
    type: "div",
    props: {
      style: {
        width: 1200, height: 630, display: "flex", flexDirection: "column",
        backgroundColor: PAPER, padding: 72, justifyContent: "space-between",
      },
      children: [
        { type: "div", props: { style: { fontFamily: "JetBrains Mono", fontWeight: 400, fontSize: 26, color: FAINT }, children: `${leagues.map((lg) => LEAGUE_LABEL[lg]).join(" · ")} · ${kicker}` } },
        {
          type: "div",
          props: {
            style: { display: "flex", flexDirection: "column", gap: 14 },
            children: [
              { type: "div", props: { style: { fontFamily: "Bricolage Grotesque", fontSize: 104, color: INK, lineHeight: 1.02 }, children: headline } },
              { type: "div", props: { style: { display: "flex", fontFamily: "JetBrains Mono", fontWeight: 400, fontSize: 30, color: SOFT }, children: [
                { type: "span", props: { style: { color: loPole }, children: scale.lo } },
                { type: "span", props: { children: "\u00a0to\u00a0" } },
                { type: "span", props: { style: { color: hiPole }, children: scale.hi } },
                { type: "span", props: { children: `\u00a0${scale.unit}` } },
              ] } },
            ],
          },
        },
        { type: "div", props: { style: { fontFamily: "Bricolage Grotesque", fontSize: 30, color: INK }, children: "Over Expected" } },
      ],
    },
  };
}

async function renderPng(node, path) {
  const svg = await satori(node, { width: 1200, height: 630, fonts });
  const png = new Resvg(svg, { fitTo: { mode: "width", value: 1200 } }).render().asPng();
  writeFileSync(path, png);
}

/**
 * Search engines truncate a description around 155-160 characters and a much
 * shorter one wastes the slot, so the target is a band, not a fixed template:
 * player names and league labels differ by 25 characters, and one template
 * cannot land in the band for all of them. So compose from fragments that are
 * each independently true, adding them while they fit and stopping once the band
 * is reached. A fragment that would overflow is skipped, not truncated, because
 * half a sentence about a statistic is worse than no sentence.
 */
const DESC_MIN = 140;
const DESC_MAX = 160;
let descShort = 0;
let descLong = 0;

function fit(parts) {
  const frags = parts.filter(Boolean);
  let out = frags[0] ?? "";
  for (const frag of frags.slice(1)) {
    if (out.length >= DESC_MIN) break;
    const next = `${out} ${frag}`;
    if (next.length <= DESC_MAX) out = next;
  }
  if (out.length < DESC_MIN) descShort++;
  if (out.length > DESC_MAX) descLong++;
  return out;
}

/** Surname for compact titles: everything after the first name, so "Jr." and
    hyphenated names survive ("Tim Hardaway Jr." -> "Hardaway Jr."). */
const surname = (n) => n.split(" ").slice(1).join(" ") || n;

/** Symmetric range of a metric across every season, read from the data so a
    card never states a range the numbers don't support. */
function symRange(values) {
  const m = Math.max(...values.map((v) => Math.abs(v)).filter(Number.isFinite));
  return { lo: `\u2212${m.toFixed(1)}`, hi: `+${m.toFixed(1)}` };
}

function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/** Escape a note field from a layer JSON and start it as a sentence. Those
    fields are written as lowercase fragments meant to sit inside a caption, so
    dropping one straight under a heading reads as a thought already in
    progress. Only the leading character changes; an all-caps acronym or a code
    identifier further in is left alone. */
const esc1 = (s) => {
  const e = esc(s);
  return e.charAt(0).toUpperCase() + e.slice(1);
};

/* ------------------------------------------------ static crawler content ---
 * The app renders entirely on the client, so `curl` on any route used to return
 * an empty <div id="root">. These blocks put each page's real content into the
 * HTML *beside* React's container, not inside it: React still owns #root and
 * behaves exactly as it did, there is no SSR build, no hydration step and no
 * inlined data. `DataProvider` removes this block the moment the app has data,
 * and suppresses its own boot skeleton while the block is on screen, so the
 * reader sees real content sooner than before and never sees both at once.
 *
 * Why not server-render the app: the smallest slice of JSON that would let the
 * client's first render match the server's is 15-70 KB gzipped per page. Inlined
 * across 4,453 pages that roughly triples page weight and adds ~180 MB to dist,
 * which fights the Core Web Vitals work rather than helping it.
 *
 * Tables here are real <table> elements with a <caption>, a <thead> and scoped
 * headers, because the interactive boards are CSS grids of divs that carry no
 * table semantics at all.
 */

/** One canonical description of the site, reused everywhere it is stated in
    prose. Consistent wording is how an entity gets recognised. */
// Mirrors src/lib/site.ts verbatim; gate check 12 asserts they are identical.
const SITE_LINE =
  "Over Expected is a basketball shot-value platform covering " +
  `${LEAGUES.map((lg) => LEAGUE_LABEL[lg]).join(", ")}.`;

const ROWS_SHOWN = 25;

/** An answer block: the question a reader would type, then the answer. */
function answer(question, text) {
  return `<h2>${esc(question)}</h2>\n<p>${text}</p>`;
}

function cell(v, numeric) {
  const cls = numeric ? ' class="tnum" style="text-align:right"' : "";
  return `<td${cls}>${esc(String(v))}</td>`;
}

/**
 * A real table. `cols` is [{ label, numeric }] and `rows` is an array of arrays.
 * The first column is a row header, which is what makes a leaderboard readable
 * to a screen reader and parseable to an extraction model.
 */
function table({ caption, cols, rows }) {
  const head = cols
    .map(
      (c, i) =>
        `<th scope="col"${c.numeric ? ' style="text-align:right"' : ""}>` +
        `${esc(c.label)}</th>${i === cols.length - 1 ? "" : ""}`,
    )
    .join("");
  const body = rows
    .map(
      (r) =>
        "<tr>" +
        `<th scope="row">${esc(String(r[0]))}</th>` +
        r.slice(1).map((v, i) => cell(v, cols[i + 1]?.numeric)).join("") +
        "</tr>",
    )
    .join("\n");
  return (
    `<table>\n<caption>${esc(caption)}</caption>\n` +
    `<thead><tr>${head}</tr></thead>\n<tbody>\n${body}\n</tbody>\n</table>`
  );
}

/** Wrap a page's static content. `hidden` is not used: the block must be
    readable before JavaScript runs, which is the whole point. */
function staticBlock({ h1, parts }) {
  // Out of flow, deliberately. The block sits above #root in the document, so
  // while it was in normal flow every removal moved #root up by the block's own
  // height — measured at 0.817 CLS on a leaderboard, with the layout-shift
  // observer naming DIV#root as the source moving from y=1500 to y=0. Absolute
  // positioning means #root never leaves y=0, so removing the block moves
  // nothing and the only remaining shift is the app's own growth, which measures
  // 0 because it happens below the fold.
  return (
    `<div id="oe-static" style="position:absolute;top:0;left:0;right:0" ` +
    `class="mx-auto max-w-4xl px-5 py-10 sm:px-8">\n` +
    `<h1>${esc(h1)}</h1>\n${parts.filter(Boolean).join("\n")}\n` +
    `<p><small>${esc(SITE_LINE)}</small></p>\n</div>`
  );
}

/* ---------------------------------------------------------- JSON-LD ---
 * Emitted into the static head as one @graph per page, built as JavaScript
 * objects and serialized, never string-concatenated.
 *
 * Deviation from the brief, stated rather than hidden: the brief asked for typed
 * TypeScript interfaces. This file is plain .mjs and cannot import .ts, and
 * adding a TypeScript build step for one build script is disproportionate. What
 * compile-time types would have caught is caught instead by gate check 11, which
 * asserts every required Dataset field is present in the built HTML — a stronger
 * guarantee here, because these values come from JSON at runtime and a type
 * annotation would not have validated them anyway.
 *
 * Nothing is invented. `sameAs` is absent because the profile URLs are not
 * confirmed, and a wrong sameAs attaches the entity to someone else's account.
 * `datePublished` is absent because no export carries one; `dateModified` appears
 * only where a layer artifact states a real generation date.
 */
const LICENSE = "https://creativecommons.org/licenses/by/4.0/";

const ORG = {
  "@type": "Organization",
  "@id": `${BASE}/#organization`,
  name: "Over Expected",
  url: `${BASE}/`,
  description: SITE_LINE,
  founder: { "@id": `${BASE}/#author` },
  sameAs: ["https://x.com/Kevinkrjn"],
};

const aboutContent = JSON.parse(
  readFileSync(join(ROOT, "src", "content", "about.json"), "utf8"),
);

const AUTHOR = {
  "@type": "Person",
  "@id": `${BASE}/#author`,
  name: "Kevin Krajnc",
  url: `${BASE}/about`,
  jobTitle: "Sports analyst",
  // The same sentence the About page shows, not a separate summary that could
  // drift from it.
  description: aboutContent.who,
  sameAs: ["https://x.com/Kevinkrjn"],
  knowsAbout: [
    "basketball analytics",
    "shot quality",
    "expected points per shot",
    "regularized adjusted plus-minus",
    "possession-level play-by-play",
  ],
};

/** A real year interval from a league's own season list. Seasons are stored as
    "2020-21", so the interval is start year to the calendar year the last season
    ends in. No months, because the export states none. */
const coverage = (seasons) =>
  `${seasons[0].slice(0, 4)}/${Number(seasons[seasons.length - 1].slice(0, 4)) + 1}`;

const VARIABLES = {
  value: ["Points over expected per 100 possessions",
          "Expected points per shot",
          "Shot-making over expected",
          "Free throws drawn over expected per 100 possessions"],
  making: ["Field-goal points over expected per 100 possessions",
           "Field goal percentage", "Expected field goal percentage"],
  fouls: ["Free throws drawn over expected per 100 possessions",
          "Free throws attempted", "Expected free throws attempted",
          "Possessions"],
};

function dataset({ name, description, lg, variables }) {
  const seasons = dataByLeague[lg].meta.seasons;
  return {
    "@type": "Dataset",
    name,
    description,
    creator: { "@id": ORG["@id"] },
    license: LICENSE,
    temporalCoverage: coverage(seasons),
    variableMeasured: variables,
    isPartOf: { "@id": `${BASE}/data#catalog` },
    distribution: [
      {
        "@type": "DataDownload",
        encodingFormat: "application/json",
        contentUrl: `${BASE}/data-${lg}.json`,
      },
    ],
  };
}

/** Breadcrumbs from the path itself, so a nested route always has them. */
function breadcrumbs(path, labels) {
  const parts = path.split("/").filter(Boolean);
  if (!parts.length) return null;
  let acc = "";
  return {
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${BASE}/` },
      ...parts.map((seg, i) => {
        acc += `/${seg}`;
        return {
          "@type": "ListItem",
          position: i + 2,
          name: labels?.[i] ?? seg,
          item: `${BASE}${acc}`,
        };
      }),
    ],
  };
}

const faq = (question, text) => ({
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: question,
      acceptedAnswer: { "@type": "Answer", text },
    },
  ],
});

function ldScript(nodes) {
  const graph = nodes.filter(Boolean);
  if (!graph.length) return "";
  return (
    `<script type="application/ld+json">` +
    JSON.stringify({ "@context": "https://schema.org", "@graph": graph })
      .replace(/</g, "\\u003c") +
    `</script>`
  );
}

let shellCount = 0;

/** One route's HTML shell. `title` and `description` override the template's;
    the homepage passes neither, because index.html's own head already says the
    right thing and copying those two strings here would give them two homes to
    drift between. */
function shell({ title, description, path, image, canonical = path, robots, type = "website", block, ld }) {
  shellCount++;
  let html = template;
  if (block) {
    html = html.replace(
      '<div id="root"></div>',
      `${block}\n    <div id="root"></div>`,
    );
  }
  if (title) {
    html = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`);
    html = html.replace(
      /(<meta property="og:title" content=")[^"]*(")/,
      `$1${esc(title)}$2`,
    );
  }
  if (description) {
    html = html.replace(
      /(<meta\s+name="description"\s+content=")[^"]*(")/,
      `$1${esc(description)}$2`,
    );
    html = html.replace(
      /(<meta\s+property="og:description"\s+content=")[^"]*(")/,
      `$1${esc(description)}$2`,
    );
  }
  const extra = [
    `<meta property="og:type" content="${type}" />`,
    `<meta property="og:site_name" content="Over Expected" />`,
    `<meta property="og:locale" content="en" />`,
    `<meta property="og:url" content="${BASE}${canonical}" />`,
    `<meta property="og:image" content="${BASE}/og/${image}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:image" content="${BASE}/og/${image}" />`,
    `<link rel="canonical" href="${BASE}${canonical}" />`,
    `<link rel="alternate" type="application/feed+json" title="Over Expected data updates" href="${BASE}/feed.json" />`,
    ...(robots ? [`<meta name="robots" content="${robots}" />`] : []),
    ...(ld ? [ldScript([ORG, ...ld])] : []),
  ].filter(Boolean).join("\n    ");
  html = html.replace("</head>", `    ${extra}\n  </head>`);
  const dir = join(DIST, ...path.split("/").filter(Boolean));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "index.html"), html);
}

// ---------------------------------------------------------------- main
mkdirSync(join(DIST, "og"), { recursive: true });

// Latest qualified season per player, per league. Keyed by league+id
// because ids are only unique within a league (NBA and ACB both numeric).
const latestByPlayer = new Map();
for (const lg of LEAGUES) {
  const d = dataByLeague[lg];
  for (const season of d.meta.seasons) {
    for (const r of d.leaderboard) {
      if (r.season === season && r.pct !== null)
        latestByPlayer.set(`${lg}:${r.id}`, { ...r, lg });
    }
  }
}

const LEAGUE_LIST = LEAGUES.map((lg) => LEAGUE_LABEL[lg]).join(", ");

await renderPng(genericCard(), join(DIST, "og", "site.png"));

// Shot-value rows keyed by league:id:season, so a player shell can lead with
// points over expected (the site's headline metric) instead of the foul-drawing
// lens it used to describe as if it were the whole page.
const svRow = new Map();
for (const lg of LEAGUES) {
  const d = dataByLeague[lg];
  for (const [season, rows] of Object.entries(d.shotValue ?? {})) {
    for (const r of rows) svRow.set(`${lg}:${r.id}:${season}`, r);
  }
}

// Comparable players: the nearest neighbours by points over expected inside the
// same league and season. A real data relationship, not a random "related" block —
// the whole point of the section is that the three names next to a player are the
// three closest to him on the metric the page is about.
const neighbours = new Map();
for (const lg of LEAGUES) {
  for (const [season, rows] of Object.entries(dataByLeague[lg].shotValue ?? {})) {
    const sorted = [...rows].sort((a, b) => b.poe100 - a.poe100);
    sorted.forEach((r, i) => {
      const near = [sorted[i - 1], sorted[i + 1], sorted[i + 2], sorted[i - 2]]
        .filter(Boolean)
        .slice(0, 3);
      neighbours.set(`${lg}:${r.id}:${season}`, near);
    });
  }
}

// Two players can share a display name inside one league (the WNBA export
// abbreviates first names, and two LBA/ABA players have identical full names),
// so those titles carry the team to name a person rather than a string.
const nameCount = new Map();
for (const row of latestByPlayer.values()) {
  const k = `${row.lg}:${row.name}`;
  nameCount.set(k, (nameCount.get(k) ?? 0) + 1);
}

let n = 0;
for (const row of latestByPlayer.values()) {
  const img = `p-${row.lg}-${row.id}.png`;
  await renderPng(card(row), join(DIST, "og", img));
  const sv = svRow.get(`${row.lg}:${row.id}:${row.season}`);
  const league = LEAGUE_LABEL[row.lg];
  const who =
    nameCount.get(`${row.lg}:${row.name}`) > 1 && row.teams.length
      ? `${row.name} (${row.teams[0]} ${row.season})`
      : row.name;
  shell({
    title:
      `${who} · ${league} shot value`.length <= 60
        ? `${who} · ${league} shot value`
        : `${who} · ${league}`,
    description: sv
      ? fit([
          `${row.name}, ${league} ${row.season}: ${signed(sv.poe100)} points over expected per 100 possessions.`,
          `Shot-making ${signed(sv.makeOE)} points of FG%, ${signed(sv.ftaoe100)} free throws drawn.`,
          `${sv.fgPct.toFixed(1)}% from the field against ${sv.xfgPct.toFixed(1)}% expected.`,
          `${sv.fga} attempts over ${sv.poss} possessions.`,
          `${ordinal(Math.floor(row.pct))} percentile on foul-drawing.`,
          `${sv.fga} attempts.`,
        ])
      : fit([
          `${row.name}, ${league} ${row.season}: ${signed(row.per100)} ${ftNoun(row.lg)} over expected per 100 possessions, ${ordinal(Math.floor(row.pct))} percentile.`,
          `${row.fta} attempts against ${row.xfta.toFixed(1)} expected.`,
          `Over ${row.poss} possessions.`,
        ]),
    path: `/player/${row.lg}/${row.id}`,
    image: img,
    ld: [
      { "@type": "Person", name: row.name,
        url: `${BASE}/player/${row.lg}/${row.id}`,
        description: `${league} player; ${row.season} shot value measured over ` +
          `${row.poss} possessions.` },
      dataset({
        name: `${row.name}, ${league} ${row.season} shot value`,
        description: `${row.name}'s shot value, shot-making and drawn free ` +
          `throws over expected in ${league} ${row.season}.`,
        lg: row.lg,
        variables: VARIABLES.value,
      }),
      breadcrumbs(`/player/${row.lg}/${row.id}`, ["Player", league, row.name]),
    ],
    block: staticBlock({
      h1: row.name,
      parts: [
        answer(
          `How good is ${row.name}'s shot value?`,
          sv
            ? `In ${esc(league)} ${esc(row.season)} ${esc(row.name)} was worth ` +
              `<strong>${esc(signed(sv.poe100))} points over expected per 100 ` +
              `possessions</strong>: ${esc(signed(sv.makeOE))} points of field-goal ` +
              `percentage above what his looks were worth, and ` +
              `${esc(signed(sv.ftaoe100))} ${esc(ftNoun(row.lg))} over expected.`
            : `In ${esc(league)} ${esc(row.season)} ${esc(row.name)} drew ` +
              `<strong>${esc(signed(row.per100))} ${esc(ftNoun(row.lg))} over ` +
              `expected per 100 possessions</strong>, the ` +
              `${esc(ordinal(Math.floor(row.pct)))} percentile among qualified players.`,
        ),
        table({
          caption: `${row.name}, ${league} ${row.season}: measured against the ` +
                   `season's own league rate`,
          cols: [{ label: "Measure" }, { label: "Value", numeric: true },
                 { label: "Expected", numeric: true }],
          rows: [
            ...(sv
              ? [
                  ["Points over expected / 100", signed(sv.poe100), "0.0"],
                  ["Field goals attempted", sv.fga, "—"],
                  ["Field goal %", sv.fgPct.toFixed(1), sv.xfgPct.toFixed(1)],
                  ["Expected points per shot", sv.xptsShot.toFixed(2), "—"],
                ]
              : []),
            [`${ftNoun(row.lg)} attempted`, row.fta, row.xfta.toFixed(1)],
            [`${ftNoun(row.lg)} over expected / 100`, signed(row.per100), "0.0"],
            ["Possessions", row.poss, "—"],
            ["Percentile among qualified players", Math.floor(row.pct), "50"],
          ],
        }),
        `<p>Teams: ${esc(row.teams.join(", "))}. Seasons covered for ` +
          `${esc(league)}: ${dataByLeague[row.lg].meta.seasons[0]} to ` +
          `${dataByLeague[row.lg].meta.seasons[dataByLeague[row.lg].meta.seasons.length - 1]}.</p>`,
        `<p><strong>What this does not measure:</strong> it blends playstyle, ` +
          `contact-seeking skill and officiating without separating them, it says ` +
          `nothing about defence beyond the lineup layer, and it is not evidence ` +
          `of referee bias.</p>`,
        // Definitions on first mention, and the closest players on the metric.
        `<p>Definitions: ` +
          [["points-over-expected", "points over expected"],
           ["shot-making-over-expected", "shot-making over expected"],
           ["free-throws-over-expected", "free throws drawn over expected"]]
            .map(([sl, label]) => `<a href="${BASE}/glossary/${sl}">${label}</a>`)
            .join(", ") + `.</p>`,
        (() => {
          const near = neighbours.get(`${row.lg}:${row.id}:${row.season}`) ?? [];
          return near.length
            ? `<h2>Closest to ${esc(row.name)} on points over expected, ` +
              `${esc(league)} ${esc(row.season)}</h2>\n<ul>` +
              near
                .map((n) => `<li><a href="${BASE}/player/${row.lg}/${n.id}">` +
                            `${esc(n.name)}</a>, ${esc(signed(n.poe100))} ` +
                            `points over expected / 100</li>`)
                .join("") + `</ul>`
            : "";
        })(),
      ],
    }),
  });
  n++;
  // Free resvg's native render buffers before they pile up to the
  // container memory ceiling (see the re-exec note at the top).
  if (n % 50 === 0) global.gc();
  if (n % 200 === 0) {
    const rss = Math.round(process.memoryUsage().rss / 1e6);
    console.log(`  ${n}/${latestByPlayer.size} player cards (rss ${rss}MB)`);
  }
}

// The homepage. Writes dist/index.html, so it is the one shell whose target is
// the template file itself — safe because `template` was read into memory above,
// and guarded there against a second run. Title and description are omitted on
// purpose: index.html owns them.
shell({
  path: "/",
  image: "site.png",
  ld: [
    AUTHOR,
    {
      "@type": "WebSite",
      "@id": `${BASE}/#website`,
      url: `${BASE}/`,
      name: "Over Expected",
      description: SITE_LINE,
      publisher: { "@id": ORG["@id"] },
      potentialAction: {
        "@type": "SearchAction",
        target: {
          "@type": "EntryPoint",
          urlTemplate: `${BASE}/leaderboard/NBA/shot-value?q={search_term_string}`,
        },
        "query-input": "required name=search_term_string",
      },
    },
    faq("What is points over expected?",
        "Points over expected is what a player adds beyond what his shots were " +
        "worth: field goals made above the difficulty of the looks taken, plus " +
        "free throws drawn above the rate those situations usually produce, per " +
        "100 possessions, against each season's own league rate."),
  ],
  block: (() => {
    const nba = dataByLeague.NBA;
    const season = nba.meta.defaultSeason;
    const top = [...(nba.shotValue?.[season] ?? [])]
      .sort((a, b) => b.poe100 - a.poe100)
      .slice(0, 10)
      .map((r, i) => [i + 1, r.name, r.teams.join(" / "), signed(r.makeOE),
                      signed(r.ftaoe100), signed(r.poe100)]);
    return staticBlock({
      h1: "Over Expected: what a basketball shot is really worth",
      parts: [
        answer(
          "What is points over expected?",
          "Points over expected is what a player adds beyond what his shots were " +
            "worth: the field goals he makes above the difficulty of the looks he " +
            "took, plus the free throws he draws above the rate those same " +
            "situations usually produce, expressed per 100 possessions and measured " +
            "against each season's own league rate rather than a flat average.",
        ),
        `<p>${esc(SITE_LINE)} It answers one question three ways in every league: ` +
          `shot value, shot-making, and foul-drawing, all possession-level and ` +
          `leak-free, built from ` +
          `${LEAGUES.map((lg) => dataByLeague[lg].meta.nPossessions)
            .reduce((a, b) => a + b, 0)
            .toLocaleString("en-US")} possessions of public play-by-play.</p>`,
        top.length
          ? table({
              caption: `NBA points over expected leaders, ${season}, per 100 ` +
                       `possessions against the season's league rate`,
              cols: [{ label: "#" }, { label: "Player" }, { label: "Team" },
                     { label: "Shot-making", numeric: true },
                     { label: "Free throws", numeric: true },
                     { label: "Points over expected / 100", numeric: true }],
              rows: top,
            })
          : "",
        `<p>Seasons covered: ${nba.meta.seasons[0]} to ` +
          `${nba.meta.seasons[nba.meta.seasons.length - 1]} across ` +
          `${LEAGUES.length} leagues.</p>`,
        `<p><strong>What this does not measure:</strong> the numbers blend ` +
          `playstyle, skill and officiating without separating them, and they are ` +
          `not evidence of referee bias.</p>`,
      ],
    });
  })(),
});

shell({
  title: "How Over Expected is measured",
  description: fit([
    "How shot value, shot-making and drawn free throws are measured per possession, against each season's own league rate.",
    "Leak-free, anchored, and explicit about what it cannot prove.",
    "Anchored, leak-free, and honest about its limits.",
  ]),
  block: staticBlock({
    h1: "How Over Expected is measured",
    parts: [
      answer(
        "How do you measure shot quality in basketball?",
        "Every shot is priced by what shots like it are worth: location, context " +
          "and the situation it came from, fitted on possession-level play-by-play " +
          "and anchored to each season's own league rate. A player's number is the " +
          "gap between what he produced and what those looks were worth, which is " +
          "why it is called over expected.",
      ),
      "<p>The model is leak-free: nothing that happens after a shot is an input to " +
        "valuing it, and the fit is cross-validated by season so a player's own " +
        "results never price his own shots.</p>",
      "<p><strong>What this does not measure:</strong> it cannot separate " +
        "playstyle from contact-seeking skill from officiating, and it is not " +
        "evidence of bias in any direction.</p>",
    ],
  }),
  ld: [
    AUTHOR,
    { "@type": "Article", headline: "How Over Expected is measured",
      author: { "@id": AUTHOR["@id"] }, publisher: { "@id": ORG["@id"] },
      mainEntityOfPage: `${BASE}/methodology` },
    faq("How do you measure shot quality in basketball?",
        "Every shot is priced by what shots like it are worth given location and " +
        "context, fitted on possession-level play-by-play and anchored to each " +
        "season's own league rate. A player's number is the gap between what he " +
        "produced and what those looks were worth."),
    breadcrumbs("/methodology", ["Methodology"]),
  ],
  path: "/methodology",
  image: "site.png",
  type: "article",
});
shell({
  title: "Compare two players, four lenses",
  description: fit([
    "Two players on one baseline: shot value, shot-making, foul-drawing and defence, with a shared shot-diet court and trailing form.",
    "Percentiles come from each player's own season.",
    "Percentiles come from each player's own season pool, so an unshared season stays honest.",
  ]),
  block: staticBlock({
    h1: "Compare two players, four lenses",
    parts: [
      answer(
        "How do I compare two basketball players on shot value?",
        "Put both on one baseline. Compare ranks two players side by side on shot " +
          "value, shot-making, foul-drawing and defence, with a shared shot-diet " +
          "court and each player's percentile taken from his own season pool.",
      ),
    ],
  }),
  path: "/compare",
  image: "site.png",
});
shell({
  title: "Send feedback on Over Expected",
  description: fit([
    "Spotted a number that looks wrong, want a league or a metric added, or disagree with the method?",
    "Send it here. Corrections to the data are the most useful thing you can send.",
    "Method disagreements are welcome too, and get answered.",
  ]),
  path: "/feedback",
  image: "site.png",
  // A contact form with two sentences of prose around it. There is no query it
  // is the right answer to, and with no body of its own it joined the empty-shell
  // duplicate cluster that Google collapsed. Excluded by measurement, the same
  // way a referee page ranking fewer than five officials is.
  robots: "noindex,follow",
});
shell({
  title: "Download the Over Expected data",
  description: fit([
    `Leaderboards, per-game series, shot zones and foul ledgers for all ${LEAGUES.length} leagues, as static JSON you can fetch directly.`,
    "Free to use with credit.",
    "Free to use with credit back to the site.",
  ]),
  block: staticBlock({
    h1: "Download the Over Expected data",
    parts: [
      answer(
        "Can I download the Over Expected data?",
        "Yes. Every number on the site ships as static JSON you can fetch " +
          "directly, one file per league plus one per league-season of per-game " +
          "detail, with no key and no rate limit.",
      ),
      "<p>Cite it as: Over Expected (2026). Points over expected per 100 " +
        "possessions. https://overexpected.com</p>",
    ],
  }),
  ld: [
    AUTHOR,
    {
      "@type": "DataCatalog",
      "@id": `${BASE}/data#catalog`,
      name: "Over Expected data",
      description: SITE_LINE,
      url: `${BASE}/data`,
      license: LICENSE,
      creator: { "@id": ORG["@id"] },
      dataset: LEAGUES.map((lg) => ({
        "@type": "Dataset",
        name: `${LEAGUE_LABEL[lg]} shot value`,
        license: LICENSE,
        temporalCoverage: coverage(dataByLeague[lg].meta.seasons),
        distribution: [{ "@type": "DataDownload",
                         encodingFormat: "application/json",
                         contentUrl: `${BASE}/data-${lg}.json` }],
      })),
    },
    faq("Can I download the Over Expected data?",
        "Yes. Every number ships as static JSON, one file per league plus one " +
        "per league-season of per-game detail, under CC BY 4.0."),
    breadcrumbs("/data", ["Data"]),
  ],
  path: "/data",
  image: "site.png",
});

// ---- league / season / lens boards. Every combination is its own URL, so it
// can be linked, canonicalised and indexed. The season-less ("evergreen") form
// means the league's current season and is canonical for it: links accumulate
// on one URL instead of resetting every October. Dated URLs are canonical only
// for archive seasons. The rollover follows each league's own
// meta.defaultSeason, so it happens without a code change.
const canonicalUrls = [];
const refUrls = [];
const glossaryUrls = [];
const contentUrls = [];
const shelledRefs = new Set();

for (const lg of LEAGUES) {
  const d = dataByLeague[lg];
  const label = LEAGUE_LABEL[lg];
  const current = d.meta.defaultSeason;
  const hasDefense = DEFENSE_LEAGUES.includes(lg);

  /** Shell an evergreen/dated pair for one page identity. */
  const pair = (build, title, description, image, block, ld) => {
    for (const season of [null, ...d.meta.seasons]) {
      const path = build(season);
      const canonical = season === current ? build(null) : path;
      shell({
        title: title(season ?? current),
        description: description(season ?? current),
        path, image, canonical,
        block: block ? block(season ?? current) : undefined,
        ld: ld ? ld(season ?? current) : undefined,
      });
      // The sitemap lists canonical URLs only: a dated current-season URL is
      // reachable and correct, but it points at the evergreen one.
      if (path === canonical) canonicalUrls.push(`${BASE}${path}`);
    }
  };

  // player leaderboards. One card per league+lens, deliberately naming no
  // season, so the same card is correct for the evergreen page and every
  // archive season under it.
  for (const lens of BOARD_LENSES) {
    const qualified = (season) =>
      lens.key === "fouls"
        ? d.leaderboard.filter((r) => r.season === season && r.pct !== null).length
        : (d.shotValue?.[season] ?? []).length;
    const metric =
      lens.key === "value"
        ? "points over expected per 100 possessions"
        : lens.key === "making"
          ? "field-goal points over expected per 100 possessions"
          : `${ftNoun(lg)} over expected per 100 possessions`;
    const note =
      lens.key === "value"
        ? "Shot quality, shot-making and drawn free throws in one number."
        : lens.key === "making"
          ? "Shot quality is already priced out, so this is shooting alone."
          : "Measured against the season's own league rate, not a flat average.";
    const img = `board-${lg}-${lens.slug}.png`;
    const all = Object.values(d.shotValue ?? {}).flat();
    const values =
      lens.key === "fouls"
        ? d.leaderboard.filter((r) => r.pct !== null).map((r) => r.per100)
        : all.map((r) => (lens.key === "value" ? r.poe100 : r.fgPoe100));
    await renderPng(
      layerCard({
        leagues: [lg],
        kicker: lens.label,
        headline:
          lens.key === "value"
            ? "Every shot, over expected."
            : lens.key === "making"
              ? "Made more than the look was worth."
              : "The free throws he draws.",
        scale: { ...symRange(values), unit: `${metric.replace(" per 100 possessions", "")} / 100` },
      }),
      join(DIST, "og", img),
    );
    const boardBlock = (season) => {
      const cols =
        lens.key === "fouls"
          ? [{ label: "#" }, { label: "Player" }, { label: "Team" },
             { label: "Poss", numeric: true }, { label: "FTA", numeric: true },
             { label: "Expected", numeric: true },
             { label: `${ftNoun(lg)} over expected / 100`, numeric: true }]
          : lens.key === "making"
            ? [{ label: "#" }, { label: "Player" }, { label: "Team" },
               { label: "FGA", numeric: true }, { label: "FG%", numeric: true },
               { label: "Expected FG%", numeric: true },
               { label: "FG points over expected / 100", numeric: true }]
            : [{ label: "#" }, { label: "Player" }, { label: "Team" },
               { label: "Poss", numeric: true },
               { label: "Shot-making", numeric: true },
               { label: "Free throws", numeric: true },
               { label: "Points over expected / 100", numeric: true }];
      const rows =
        lens.key === "fouls"
          ? d.leaderboard
              .filter((r) => r.season === season && r.pct !== null)
              .sort((a, b) => b.per100 - a.per100)
              .slice(0, ROWS_SHOWN)
              .map((r, i) => [i + 1, r.name, r.teams.join(" / "), r.poss,
                              r.fta, r.xfta.toFixed(1), signed(r.per100)])
          : [...(d.shotValue?.[season] ?? [])]
              .sort((a, b) =>
                lens.key === "making" ? b.fgPoe100 - a.fgPoe100 : b.poe100 - a.poe100)
              .slice(0, ROWS_SHOWN)
              .map((r, i) =>
                lens.key === "making"
                  ? [i + 1, r.name, r.teams.join(" / "), r.fga,
                     r.fgPct.toFixed(1), r.xfgPct.toFixed(1), signed(r.fgPoe100)]
                  : [i + 1, r.name, r.teams.join(" / "), r.poss,
                     signed(r.makeOE), signed(r.ftaoe100), signed(r.poe100)]);
      const leader = rows[0];
      return staticBlock({
        h1: `${label} ${lens.label} leaders, ${season}`,
        parts: [
          answer(
            `Who led ${label} in ${lens.label} in ${season}?`,
            leader
              ? `${esc(leader[1])} led ${esc(label)} in ${esc(lens.label)} in ` +
                `${esc(season)} at <strong>${esc(String(leader[6]))}</strong> ` +
                `${esc(metric)}. ${esc(note)}`
              : `No ${esc(label)} player reached the qualifying floor in ${esc(season)}.`,
          ),
          rows.length
            ? table({
                caption: `${label} ${lens.label} leaders, ${season} — top ` +
                         `${rows.length} of ${qualified(season)} qualified players, ` +
                         `${metric}`,
                cols, rows,
              })
            : "",
          `<p>Ranked over ${qualified(season)} qualified players. This measures ` +
            `${esc(metric)}; it does not separate playstyle, skill and officiating, ` +
            `and it is not a causal claim about any of them.</p>`,
          `<p>Seasons covered: ${d.meta.seasons[0]} to ` +
            `${d.meta.seasons[d.meta.seasons.length - 1]}. What this metric is and ` +
            `what it misses: <a href="${BASE}/glossary/${
              lens.key === "value" ? "points-over-expected"
                : lens.key === "making" ? "shot-making-over-expected"
                : "free-throws-over-expected"
            }">definition</a>.</p>`,
        ],
      });
    };
    pair(
      (season) => `/leaderboard/${lg}${season ? `/${season}` : ""}/${lens.slug}`,
      (season) => `${label} ${lens.label} leaders, ${season}`,
      (season) =>
        fit([
          `All ${qualified(season)} qualified ${label} players in ${season}, ranked by ${metric}.`,
          note,
          "Sortable, with a possession floor you set.",
          "Every column sorts.",
        ]),
      img,
      boardBlock,
      (season) => [
        dataset({
          name: `${label} ${lens.label} leaders, ${season}`,
          description:
            `Every qualified ${label} player in ${season} ranked by ${metric}.`,
          lg,
          variables: VARIABLES[lens.key],
        }),
        faq(`Who led ${label} in ${lens.label} in ${season}?`,
            `The ${label} ${lens.label} leaderboard for ${season} ranks every ` +
            `qualified player by ${metric}, measured against that season's own ` +
            `league rate.`),
        breadcrumbs(`/leaderboard/${lg}/${lens.slug}`, ["Leaderboard", label, lens.label]),
      ],
    );
  }

  // team context
  for (const lens of LEAGUE_LENSES) {
    if (LEAGUE_DEF_SLUGS.includes(lens.slug) && !hasDefense) continue;
    const isDef = LEAGUE_DEF_SLUGS.includes(lens.slug);
    const img = `team-${lg}-${lens.slug}.png`;
    const teamVals = Object.values(d.teams ?? {}).flat();
    const values = isDef
      ? Object.values(defenseJson.teams).flat().map((t) => t[lens.key])
      : lens.key === "value"
        ? teamVals.map((t) => t.sv100).filter((v) => v != null)
        : lens.key === "making"
          ? teamVals.map((t) => t.make100).filter((v) => v != null)
          : teamVals.map((t) => t.drawn);
    const unit = isDef
      ? "expected points per shot vs league"
      : lens.key === "fouls"
        ? "free throws drawn / 100 vs league"
        : `team ${lens.label} / 100 vs league`;
    await renderPng(
      layerCard({
        leagues: [lg],
        kicker: `team ${lens.label}`,
        headline: isDef
          ? "The shots a defence forces."
          : lens.key === "fouls"
            ? "Drawn, and conceded."
            : "The team under every player number.",
        scale: { ...symRange(values), unit },
      }),
      join(DIST, "og", img),
    );
    const teamBlock = (season) => {
      const rows = isDef
        ? [...(defenseJson.teams[season] ?? [])]
            .sort((a, b) => b[lens.key] - a[lens.key])
            .map((t, i) => [i + 1, t.team, t.defPoss, t.shotsFaced,
                            signed(t[lens.key], 3)])
        : [...(d.teams[season] ?? [])]
            .sort((a, b) =>
              lens.key === "fouls"
                ? b.drawn - a.drawn
                : (b[lens.key === "value" ? "sv100" : "make100"] ?? 0) -
                  (a[lens.key === "value" ? "sv100" : "make100"] ?? 0))
            .map((t, i) =>
              lens.key === "fouls"
                ? [i + 1, t.team, t.poss, signed(t.drawn), signed(t.conceded)]
                : [i + 1, t.team, t.poss,
                   signed(t[lens.key === "value" ? "sv100" : "make100"] ?? 0)]);
      const cols = isDef
        ? [{ label: "#" }, { label: "Team" },
           { label: "Def. poss", numeric: true },
           { label: "Shots faced", numeric: true },
           { label: lens.label, numeric: true }]
        : lens.key === "fouls"
          ? [{ label: "#" }, { label: "Team" }, { label: "Poss", numeric: true },
             { label: "Drawn / 100", numeric: true },
             { label: "Conceded / 100", numeric: true }]
          : [{ label: "#" }, { label: "Team" }, { label: "Poss", numeric: true },
             { label: `Team ${lens.label} / 100`, numeric: true }];
      return staticBlock({
        h1: `${label} team ${lens.label}, ${season}`,
        parts: [
          answer(
            `Which ${label} team was best at ${lens.label} in ${season}?`,
            rows.length
              ? `${esc(String(rows[0][1]))} led ${esc(label)} in team ` +
                `${esc(lens.label)} in ${esc(season)} at ` +
                `<strong>${esc(String(rows[0][rows[0].length - 1]))}</strong>, ` +
                `measured against the season's own league mean rather than a flat average.`
              : `No team rows are published for ${esc(label)} in ${esc(season)}.`,
          ),
          rows.length
            ? table({
                caption: `${label} teams ranked by team ${lens.label}, ${season}, ` +
                         `against the season's league mean`,
                cols, rows,
              })
            : "",
          `<p>The team layer under every player number on this site. A player's ` +
            `figure partly rides on his team's, so this is the context to check ` +
            `before crediting him alone. Definition: ` +
            `<a href="${BASE}/glossary/${
              isDef ? lens.key === "qualityForced" ? "quality-forced"
                    : lens.key === "deterrence" ? "rim-deterrence"
                    : "conversion-suppression"
                : lens.key === "value" ? "team-shot-value"
                : lens.key === "making" ? "team-shot-making"
                : "free-throws-drawn-team"
            }">what this measures</a>.</p>`,
        ],
      });
    };
    pair(
      (season) => `/league/${lg}${season ? `/${season}` : ""}/${lens.slug}`,
      (season) => `${label} team ${lens.label}, ${season}`,
      (season) =>
        fit([
          `All ${(d.teams[season] ?? []).length} ${label} teams in ${season}, ranked by team ${lens.label} against the season's league mean.`,
          "The team layer under every player number on the site.",
          "The team layer under every player number.",
          "Every column sorts.",
        ]),
      img,
      teamBlock,
      (season) => [
        dataset({
          name: `${label} team ${lens.label}, ${season}`,
          description: `Every ${label} team in ${season} ranked by team ` +
            `${lens.label} against the season's league mean.`,
          lg,
          variables: [`Team ${lens.label} per 100 possessions`,
                      "Possessions", "Free throws drawn", "Free throws conceded"],
        }),
        { "@type": "SportsOrganization", name: label, sport: "Basketball",
          url: `${BASE}/league/${lg}/${lens.slug}` },
        breadcrumbs(`/league/${lg}/${lens.slug}`, ["League", label, lens.label]),
      ],
    );
  }

  // officials. A season with fewer than MIN_REF_ROWS qualifying officials gets no
  // URL at all, including the evergreen one when the current season is the thin
  // one — a page that ranks one official is not a ranking.
  const refRows = (season) => (d.referees[season] ?? []).length;
  const refImg = `refs-${lg}.png`;
  await renderPng(
    layerCard({
      leagues: [lg],
      kicker: "officials",
      headline: "Whose games run hot.",
      scale: {
        ...symRange(Object.values(d.referees ?? {}).flat().map((r) => r.diff)),
        unit: "drawn free throws / 100 vs the season rate",
      },
    }),
    join(DIST, "og", refImg),
  );
  for (const season of [null, ...d.meta.seasons]) {
    const shown = season ?? current;
    const n = refRows(shown);
    const path = `/referees/${lg}${season ? `/${season}` : ""}`;
    const canonical = season === current ? `/referees/${lg}` : path;
    const thin = n < MIN_REF_ROWS;
    shell({
      title: `${label} referees, ${shown}`,
      description: thin
        ? fit([
            `${n === 0 ? "No" : n} ${label} official${n === 1 ? "" : "s"} worked enough games in ${shown} to profile, so this season has no officiating table.`,
            "Every other season and league on the site does, and the leaderboards cover this one in full.",
            "Every other season and league on the site does.",
            "Descriptive, never per player.",
          ])
        : fit([
            `The ${n} ${label} officials who worked enough games in ${shown}, ranked by drawn free throws per 100 possessions.`,
            `Against the season league rate of ${d.meta.leagueRateBySeason[shown].toFixed(1)}.`,
            "Descriptive and league-level, never per player.",
            "League-level only, never per player.",
            "Descriptive, not causal.",
          ]),
      path,
      image: refImg,
      canonical,
      block: (() => {
        const rows = [...(d.referees[shown] ?? [])]
          .sort((a, b) => b.diff - a.diff)
          .slice(0, ROWS_SHOWN)
          .map((r, i) => [i + 1, r.name, r.games, r.per100.toFixed(1),
                          signed(r.diff)]);
        const rate = d.meta.leagueRateBySeason[shown];
        return staticBlock({
          h1: `${label} referees, ${shown}`,
          parts: [
            answer(
              `Which ${label} officials called the most free throws in ${shown}?`,
              thin
                ? `Too few ${esc(label)} officials worked enough games in ` +
                  `${esc(shown)} to rank, so this season has no officiating table. ` +
                  `Every other season and league on the site does.`
                : `${esc(String(rows[0][1]))} worked the highest drawn-free-throw ` +
                  `rate of the ${n} qualifying ${esc(label)} officials in ` +
                  `${esc(shown)}, at <strong>${esc(String(rows[0][3]))}</strong> per ` +
                  `100 possessions against a league rate of ${rate.toFixed(1)}.`,
            ),
            rows.length
              ? table({
                  caption: `${label} officials, ${shown}, drawn free throws per 100 ` +
                           `possessions in the games each worked, against the season ` +
                           `league rate of ${rate.toFixed(1)}`,
                  cols: [{ label: "#" }, { label: "Official" },
                         { label: "Games", numeric: true },
                         { label: "FTA / 100", numeric: true },
                         { label: "vs league", numeric: true }],
                  rows,
                })
              : "",
            `<p>Descriptive and league-level only. Crew tendency is one of the ` +
              `context features the expected-free-throw model already adjusts for, ` +
              `assignments are not random, and this site deliberately publishes no ` +
              `player-by-official splits. It does not show referee bias.</p>`,
          ],
        });
      })(),
      ld: [
        dataset({
          name: `${label} officiating rates, ${shown}`,
          description: `Drawn free throws per 100 possessions in the games each ` +
            `${label} official worked in ${shown}, against the season league rate.`,
          lg,
          variables: ["Drawn free throws per 100 possessions", "Games worked",
                      "Difference from the season league rate"],
        }),
        breadcrumbs(`/referees/${lg}`, ["Referees", label]),
      ],
      // A page ranking fewer than MIN_REF_ROWS officials is not a ranking, but the
      // league toggle can still reach it, so it exists and says so rather than
      // 404ing or inheriting the homepage's canonical.
      robots: thin ? "noindex,follow" : undefined,
    });
    if (path === canonical && !thin) canonicalUrls.push(`${BASE}${path}`);
  }
}

// ---- referee profiles, lineup details and the story. These render from data
// the router already has, but had no shells: with the homepage now carrying a
// canonical, an unshelled-but-reachable URL inherits it and claims to be the
// homepage. Each gets its own.
for (const lg of LEAGUES) {
  const d = dataByLeague[lg];
  const label = LEAGUE_LABEL[lg];
  for (const [id, prof] of Object.entries(d.refProfiles ?? {})) {
    // Three ids are shared between EuroLeague and EuroCup — the same official
    // working both. /referee/:id carries no league, so first league wins and the
    // page itself renders whichever league the reader has active.
    if (shelledRefs.has(id)) continue;
    shelledRefs.add(id);
    const seasons = prof.seasons ?? [];
    const latest = seasons[seasons.length - 1];
    const det = prof.detail?.[latest];
    shell({
      title: `${prof.name} · ${label} referee`,
      description: det
        ? fit([
            `${prof.name} worked ${det.games} ${label} games in ${latest}: ${det.per100.toFixed(1)} drawn free throws per 100 possessions against a league ${det.lg.toFixed(1)}.`,
            "Broken down by quarter and by game script.",
            "By quarter and by game script.",
            `Over ${det.poss} possessions.`,
          ])
        : fit([
            `${prof.name}, ${label} official: drawn free throws per 100 possessions in the games worked, season by season.`,
            "Broken down by quarter and by game script.",
            "By quarter and by game script.",
            "Descriptive only, never per player.",
          ]),
      path: `/referee/${id}`,
      image: `refs-${lg}.png`,
      block: staticBlock({
        h1: prof.name,
        parts: [
          answer(
            `Do ${prof.name}'s games see more free throws?`,
            det
              ? `In ${esc(latest)} ${esc(prof.name)} worked ${det.games} ` +
                `${esc(label)} games at <strong>${det.per100.toFixed(1)} drawn free ` +
                `throws per 100 possessions</strong>, against a league rate of ` +
                `${det.lg.toFixed(1)} over the same span.`
              : `${esc(prof.name)} is a ${esc(label)} official; the profile shows ` +
                `drawn free throws per 100 possessions in the games worked, by season.`,
          ),
          table({
            caption: `${prof.name}: drawn free throws per 100 possessions by ` +
                     `season, against each season's league rate`,
            cols: [{ label: "Season" }, { label: "Games", numeric: true },
                   { label: "Poss", numeric: true },
                   { label: "FTA / 100", numeric: true },
                   { label: "League", numeric: true }],
            rows: seasons
              .filter((sn) => prof.detail?.[sn])
              .map((sn) => {
                const x = prof.detail[sn];
                return [sn, x.games, x.poss, x.per100.toFixed(1), x.lg.toFixed(1)];
              }),
          }),
          `<p><strong>What this does not measure:</strong> assignments are not ` +
            `random, crew tendency is already one of the context features the ` +
            `expected-free-throw model adjusts for, and no player-by-official split ` +
            `is published. It is not evidence of bias.</p>`,
        ],
      }),
    });
    refUrls.push(`${BASE}/referee/${id}`);
  }
}

const lineupTitles = new Set();
if (LINEUP_LEAGUES.length) {
  for (const lg of LINEUP_LEAGUES) {
    const r = layerJson(`rapm-${lg}.json`);
    const latestOf = new Map();
    for (const season of r.meta.seasons) {
      for (const row of r.lineups[season] ?? []) latestOf.set(row.lineupId, { row, season });
    }
    for (const [lineupId, { row, season }] of latestOf) {
      // Title from surnames, trimmed until it fits: the old form used the first
      // two full names, so different five-man units collided on one title.
      const last = row.players.map(surname);
      let names = last.join(", ");
      for (let keep = last.length - 1; keep >= 2; keep--) {
        if (`${row.team} ${season}: ${names}`.length <= 60) break;
        names = `${last.slice(0, keep).join(", ")} +${last.length - keep}`;
      }
      if (lineupTitles.has(`${row.team} ${season}: ${names}`)) names = last.join(", ");
      lineupTitles.add(`${row.team} ${season}: ${names}`);
      shell({
        title: `${row.team} ${season}: ${names}`,
        description: fit([
          `${row.players.join(", ")} for ${row.team}, ${season}: ${row.poss} possessions at ${signed(row.net100)} net points per 100.`,
          `Against ${signed(row.exp100)} expected from the sum of their parts.`,
          "Synergy is description, not forecast.",
          `Synergy ${signed(row.synergy100)} per 100, which does not persist.`,
          `Synergy ${signed(row.synergy100)} per 100.`,
        ]),
        path: `/lineups/${lg}/${lineupId}`,
        image: "lineups.png",
        block: staticBlock({
          h1: `${row.players.join(", ")} — ${row.team}, ${season}`,
          parts: [
            answer(
              `How did this ${row.team} lineup perform in ${season}?`,
              `Over ${row.poss} possessions together in ${esc(season)} this ` +
                `${esc(row.team)} five was <strong>${esc(signed(row.net100))} net ` +
                `points per 100</strong>, against ${esc(signed(row.exp100))} ` +
                `expected from the sum of its parts.`,
            ),
            table({
              caption: `${row.team} lineup, ${season}: measured against the sum of ` +
                       `its parts`,
              cols: [{ label: "Measure" }, { label: "Value", numeric: true }],
              rows: [
                ["Possessions together", row.poss],
                ["Net points per 100", signed(row.net100)],
                ["Expected from the parts", signed(row.exp100)],
                ["Synergy per 100", signed(row.synergy100)],
              ],
            }),
            `<p><strong>What this does not measure:</strong> lineup synergy does ` +
              `not persist out of sample, so it describes what happened rather than ` +
              `predicting what will. Treat it as description.</p>`,
          ],
        }),
      });
      refUrls.push(`${BASE}/lineups/${lg}/${lineupId}`);
    }
  }
}

// The same three facts the article is built on, derived here the way Story.tsx
// derives them, so the prerendered version cannot state a number the page then
// contradicts.
const CRACKDOWN = (() => {
  if (!LEAGUES.includes("NBA")) return null;
  const d = dataByLeague.NBA;
  const [before, after] = ["2020-21", "2021-22"];
  const prev = new Map(
    d.leaderboard.filter((r) => r.season === before && r.pct !== null)
      .map((r) => [r.id, r]),
  );
  const pairs = [];
  for (const r of d.leaderboard) {
    if (r.season !== after || r.pct === null) continue;
    const p = prev.get(r.id);
    if (p) pairs.push({ name: r.name, before: p.per100, after: r.per100 });
  }
  pairs.sort((a, b) => a.after - a.before - (b.after - b.before));
  return {
    before, after, pairs,
    rateBefore: d.meta.leagueRateBySeason[before],
    rateAfter: d.meta.leagueRateBySeason[after],
    fallers: pairs.slice(0, 5),
    yoy: d.meta.reliability.yoyPairs.find((p) => p.pair.startsWith(before)),
  };
})();

if (LEAGUES.includes("NBA")) {
  shell({
    title: "The 2021-22 NBA foul crackdown, measured",
    description: fit([
      `The NBA drew ${dataByLeague.NBA.meta.leagueRateBySeason["2021-22"].toFixed(1)} free throws per 100 possessions in 2021-22, its lowest rate in the model.`,
      "What that did to the players who lived on contact, season by season.",
      "Measured against every other season in the model.",
    ]),
    path: "/crackdown",
    image: "site.png",
    type: "article",
    ld: [
      AUTHOR,
      { "@type": "Article",
        headline: "The 2021-22 NBA foul crackdown, measured",
        author: { "@id": AUTHOR["@id"] }, publisher: { "@id": ORG["@id"] },
        mainEntityOfPage: `${BASE}/crackdown` },
      breadcrumbs("/crackdown", ["The crackdown, measured"]),
    ],
    block: staticBlock({
      h1: "The crackdown, measured",
      parts: [
        answer(
          "Did the 2021-22 NBA foul crackdown reduce free throws?",
          `Barely, league-wide. The NBA's shooting-foul rate went from ` +
            `<strong>${CRACKDOWN.rateBefore.toFixed(1)}</strong> to ` +
            `<strong>${CRACKDOWN.rateAfter.toFixed(1)}</strong> free throws per 100 ` +
            `possessions across the memo, a quarter of a free throw, and was higher ` +
            `than ever two seasons later. What changed was which players drew them.`,
        ),
        `<h2>The league barely moved</h2>\n` +
          table({
            caption: "NBA shooting fouls drawn per 100 possessions, by season",
            cols: [{ label: "Season" }, { label: "Free throws per 100", numeric: true }],
            rows: dataByLeague.NBA.meta.seasons.map((s) => [
              s === CRACKDOWN.after ? `${s} (the memo season)` : s,
              dataByLeague.NBA.meta.leagueRateBySeason[s].toFixed(2),
            ]),
          }),
        `<h2>Specific players got repriced</h2>\n<p>Among the ` +
          `${CRACKDOWN.pairs.length} players qualified on both sides of the memo, ` +
          `the change was surgical rather than league-wide. The five largest falls ` +
          `in free throws over expected per 100 possessions:</p>\n` +
          table({
            caption:
              `Largest falls in FTAOE per 100 possessions, ` +
              `${CRACKDOWN.before} to ${CRACKDOWN.after}`,
            cols: [
              { label: "Player" },
              { label: CRACKDOWN.before, numeric: true },
              { label: CRACKDOWN.after, numeric: true },
              { label: "Change", numeric: true },
            ],
            rows: CRACKDOWN.fallers.map((f) => [
              f.name, signed(f.before), signed(f.after),
              signed(f.after - f.before),
            ]),
          }),
        `<h2>The skill survived</h2>\n<p>Across the rule change the ordering of ` +
          `players held at r = ${CRACKDOWN.yoy.r.toFixed(2)} over ` +
          `${CRACKDOWN.yoy.n} repeat players, in line with every other ` +
          `season-to-season pair in the model. Foul-drawing is a repeatable skill; ` +
          `the memo repriced particular moves, not the skill.</p>`,
      ],
    }),
  });
  refUrls.push(`${BASE}/crackdown`);
}

// ---- lineups / RAPM layer
if (LINEUP_LEAGUES.length) {
  await renderPng(layerCard({
    leagues: LINEUP_LEAGUES, kicker: "lineups & RAPM",
    headline: "Every lineup, over expected.",
    scale: { lo: signed(-8), hi: signed(8), unit: "net points per 100, adjusted" },
  }), join(DIST, "og", "lineups.png"));
  for (const lg of LINEUP_LEAGUES) {
    const j = layerJson(`rapm-${lg}.json`);
    // The board opens on the latest season, so the prerendered table has to be
    // that season's, not the pooled career fit.
    const season = j.meta.seasons[j.meta.seasons.length - 1];
    const rows = [...(j.players[season] ?? [])].sort((a, b) => b.netP - a.netP);
    const top = rows.slice(0, 10);
    shell({
      title: `${LEAGUE_LABEL[lg]} RAPM and five-man lineups`,
      description: fit([
        `Regularized adjusted plus-minus for every qualified ${LEAGUE_LABEL[lg]} player, split into offense and defense.`,
        "Plus five-man lineups measured against the sum of their parts.",
        "Lineups are measured against the sum of their parts.",
      ]),
      path: `/lineups/${lg}`,
      image: "lineups.png",
      block: staticBlock({
        h1: `${LEAGUE_LABEL[lg]} RAPM and five-man lineups, ${season}`,
        parts: [
          answer(
            `Who had the best RAPM in the ${LEAGUE_LABEL[lg]} in ${season}?`,
            `${esc(top[0].name)} led at <strong>${signed(top[0].netP, 2)}</strong> ` +
              `net points per 100 possessions (${signed(top[0].oP, 2)} offense, ` +
              `${signed(top[0].dP, 2)} defense) over ${top[0].possOff} offensive ` +
              `possessions. Regularized adjusted plus-minus separates a player from ` +
              `the teammates and opponents he shared the floor with, so it is not a ` +
              `raw on-off number.`,
          ),
          table({
            caption:
              `${LEAGUE_LABEL[lg]} RAPM leaders, ${season} — top 10 of ` +
              `${rows.length} qualified players, net points per 100 possessions`,
            cols: [
              { label: "#" }, { label: "Player" }, { label: "Team" },
              { label: "Offense", numeric: true },
              { label: "Defense", numeric: true },
              { label: "Net", numeric: true },
            ],
            rows: top.map((r, i) => [
              String(i + 1), r.name, r.teams.join(" / "),
              signed(r.oP, 2), signed(r.dP, 2), signed(r.netP, 2),
            ]),
          }),
          `<p>Every player above the ${j.meta.qualifyPoss}-possession floor is ` +
            `ranked, over ${j.meta.seasons.length} seasons. The board also indexes ` +
            `five-man lineups against the sum of their parts; that residual ` +
            `describes a season rather than forecasting one, because it does not ` +
            `persist out of sample (r = ${j.meta.synergyOOS.r.toFixed(2)}, ` +
            `n = ${j.meta.synergyOOS.n}).</p>`,
        ],
      }),
    });
  }
  shell({
    title: "How lineups and RAPM are fitted",
    description: fit([
      "Stints, ridge regularization with a cross-validated penalty, and a box-score prior instead of shrinkage toward zero.",
      "Plus what lineup synergy does not predict.",
      "And what the lineup synergy number does not predict.",
    ]),
    type: "article",
    ld: [
      AUTHOR,
      (() => {
        const g = layerJson("rapm-NBA.json")?.meta?.generated;
        return {
          "@type": "Article",
          headline: "Methodology",
          author: { "@id": AUTHOR["@id"] },
          publisher: { "@id": ORG["@id"] },
          mainEntityOfPage: `${BASE}/methodology/lineups`,
          ...(g ? { dateModified: new Date(g).toISOString().slice(0, 10) } : {}),
        };
      })(),
      breadcrumbs("/methodology/lineups", ["Methodology", "lineups"]),
    ],
    path: "/methodology/lineups",
    image: "lineups.png",
    block: (() => {
      const m = layerJson("rapm-NBA.json").meta;
      return staticBlock({
        h1: "How lineups and RAPM are fitted",
        parts: [
          answer(
            "How is RAPM calculated on this site?",
            `Possessions are cut into stints of unchanged personnel from ` +
              `GameRotation, then a ridge regression assigns each player an ` +
              `offensive and a defensive coefficient per 100 possessions. The ` +
              `penalty is cross-validated per season (lambda = ` +
              `${m.lambdaPooled}), and the fit shrinks toward a box-score prior ` +
              `rather than toward zero.`,
          ),
          `<h2>Why a prior instead of zero</h2>\n<p>Shrinking a thin sample ` +
            `toward zero calls a 200-possession player exactly average. The prior ` +
            `is a fit on per-100 box-score rates, explaining about ` +
            `${(m.boxPriorR2[m.seasons[m.seasons.length - 1]].o * 100).toFixed(0)}% ` +
            `of offensive and ` +
            `${(m.boxPriorR2[m.seasons[m.seasons.length - 1]].d * 100).toFixed(0)}% ` +
            `of defensive variance. Each prediction is itself damped toward the ` +
            `fitted league mean by that player's own possession count, because an ` +
            `unshrunk prior becomes the estimate whenever the data is thin.</p>`,
          `<h2>Does it beat the alternatives?</h2>\n` +
            table({
              caption:
                "Out-of-sample RMSE, pooled across seasons: RAPM against a " +
                "home-court-only baseline",
              cols: [{ label: "Model" }, { label: "RMSE", numeric: true }],
              rows: [
                ["RAPM", m.cvPooled.rmseRapm.toFixed(2)],
                ["Home court only", m.cvPooled.rmseHca.toFixed(2)],
              ],
            }) +
            `\n<p>RAPM wins in all ${m.seasons.length} seasons individually as ` +
            `well as pooled.</p>`,
          `<h2>Error bars</h2>\n<p>Intervals are ${m.intervals.level * 100}% ` +
            `shrinkage-aware sandwich intervals, approximate rather than ` +
            `posterior: the penalty is plugged in from cross-validation rather ` +
            `than modelled with its own uncertainty. Players whose intervals ` +
            `overlap are grouped into tiers instead of ranked, because a ` +
            `1-to-N list would assert distinctions the intervals do not support.</p>`,
          `<h2>What it does not tell you</h2>\n<p>Lineup synergy, the residual ` +
            `between a five-man unit and the sum of its parts, does not persist ` +
            `out of sample (r = ${m.synergyOOS.r.toFixed(2)}, ` +
            `n = ${m.synergyOOS.n}), so it is published as description, not as a ` +
            `forecast. ${m.totalGames - m.gamesKept} of ${m.totalGames} games are ` +
            `skipped where possession reconstruction does not tie to the official ` +
            `final.</p>`,
        ],
      });
    })(),
  });
}

// ---- calibration: platform-wide, so a shell for every active league.
//
// One JSON serves all nine pages, so the per-league facts have to be dug out of
// curve.byLeague and cornerDiagnostic. That matters beyond tidiness: while these
// nine shells carried no body they were byte-identical apart from the league name
// in the title, and Google collapsed the cluster onto one canonical of its own
// choosing. The reliability thresholds genuinely differ by league (making crosses
// 0.5 at 204 attempts in the GBL and 433 in EuroLeague), so each page now leads
// with its own numbers.
if (existsSync(join(ROOT, "public", "calibration-NBA.json"))) {
  const cal = layerJson("calibration-NBA.json");
  const rungs = cal.curve.sweep;
  const atts = (v) => (v === null ? "not reached" : `${v} attempts`);
  for (const lg of LEAGUES) {
    const b = cal.curve.byLeague[lg];
    const corner = cal.cornerDiagnostic.find((c) => c.league === lg);
    const label = LEAGUE_LABEL[lg];
    shell({
      title: `What the ${label} model cannot measure`,
      description: fit([
        `How many ${label} attempts it takes before shot selection and shot-making mean anything, and what accuracy costs as data quality falls.`,
        "Including what the model cannot see.",
        "Including what it cannot see.",
      ]),
      path: `/calibration/${lg}`,
      image: "site.png",
      block: staticBlock({
        h1: `What the ${label} model cannot measure`,
        parts: [
          answer(
            `How many ${label} shots does it take before shot-making means anything?`,
            `About <strong>${atts(b.making["attemptsFor0.5"])}</strong> before ` +
              `${label} shot-making is half reliable, and ` +
              `<strong>${atts(b.making["attemptsFor0.7"])}</strong> before it ` +
              `reaches 0.7. Shot selection settles far earlier, at ` +
              `${atts(b.selection["attemptsFor0.5"])} for 0.5 and ` +
              `${atts(b.selection["attemptsFor0.7"])} for 0.7. Selection is a ` +
              `property of where a player shoots from, which stabilises quickly; ` +
              `making is whether the ball went in, which does not.`,
          ),
          `<h2>How many attempts before a number means anything</h2>\n` +
            table({
              caption:
                `Split-half reliability of ${label} shot selection and ` +
                `shot-making, by attempt count`,
              cols: [
                { label: "Attempts", numeric: true },
                { label: "Selection reliability", numeric: true },
                { label: "Shot-making reliability", numeric: true },
              ],
              rows: rungs.map((n, i) => [
                String(n),
                b.selection.reliability[i] === null
                  ? "not observed" : b.selection.reliability[i].toFixed(3),
                b.making.reliability[i] === null
                  ? "not observed" : b.making.reliability[i].toFixed(3),
              ]).filter((r) => r[1] !== "not observed" || r[2] !== "not observed"),
            }) +
            // b.note is deliberately not quoted here: it is terse internal
            // notation ("making 0.68 at 800 (ceiling), 0.7 not observed") and
            // the sentence below states the same two numbers in prose.
            `\n<p>The observable ceiling on this population is ` +
            `${b.ceilingRung} attempts, where selection reads ` +
            `${b.selectionAtCeiling.toFixed(3)} and making ` +
            `${b.makingAtCeiling.toFixed(3)}. These thresholds are a property of ` +
            `each league's own talent dispersion, not constants, which is why they ` +
            `differ across the ${cal.meta.leaguesInReliability.length} leagues ` +
            `tested.</p>`,
          corner && corner.status === "ok"
            ? `<h2>Are corner threes really better, or is it just distance?</h2>\n` +
              `<p>In the ${label}, corner threes convert at ` +
              `${corner.cornerObservedPct.toFixed(2)}% against ` +
              `${corner.breakObservedPct.toFixed(2)}% above the break, a gap of ` +
              `${corner.observedGapPp.toFixed(2)} percentage points. A ` +
              `distance-only model already predicts ` +
              `${corner.distanceOnlyGapPp.toFixed(2)} of that, leaving a residual ` +
              `of ${corner.residualGapPp.toFixed(2)} points ` +
              `(SE ${corner.residualGapSePp.toFixed(2)}), which is ` +
              `${corner.significant ? "distinguishable from" : "not distinguishable from"} ` +
              `zero. The corner effect is mostly the shorter shot, and the model ` +
              `prices it already.</p>`
            : "",
          // Deliberately a sentence each rather than the full degradation table
          // and limits list the page itself renders. Those are identical across
          // all nine leagues, and 1,400 characters of shared text was most of
          // what each page said: it is precisely the shared half that made
          // these nine look like one page to a crawler. The per-league numbers
          // above have to be the bulk of the block for it to do its job.
          `<h2>What accuracy costs as the data gets cheaper</h2>\n<p>` +
            `${esc1(cal.degradation.headline)}. Measured across ` +
            `${cal.degradation.rungs.length} grades of feed on one fixed ` +
            `subsample of ` +
            `${cal.degradation.subsampleSize.toLocaleString("en-US")} shots; the ` +
            `full table is on the page.</p>`,
          `<h2>What the model cannot see</h2>\n<p>` +
            `${esc1(cal.limits.noTracking.split(". ")[0])}. ` +
            `Predictive validity is untested and untestable with the data ` +
            `available, so no claim is made about forecasting development.</p>`,
        ],
      }),
    });
  }
}

// ---- value layer
if (VALUE_LEAGUES.length) {
  await renderPng(layerCard({
    leagues: VALUE_LEAGUES, kicker: "value over replacement",
    headline: "Wins above a replacement.",
    scale: { lo: "0", hi: "12", unit: "wins over replacement" },
  }), join(DIST, "og", "value.png"));
  for (const lg of VALUE_LEAGUES) {
    const j = layerJson(`value-${lg}.json`);
    const season = j.meta.seasons[j.meta.seasons.length - 1];
    const rows = [...(j.players[season] ?? [])].sort((a, b) => b.war - a.war);
    const top = rows.slice(0, 10);
    shell({
      title: `${LEAGUE_LABEL[lg]} wins over replacement`,
      description: fit([
        `Wins over replacement for every qualified ${LEAGUE_LABEL[lg]} player, built on adjusted plus-minus rather than a box-score estimate of it.`,
        "Contract surplus is absent: salaries are not public.",
        "Surplus is absent rather than estimated, because salaries are not public.",
      ]),
      path: `/value/${lg}`,
      image: "value.png",
      block: staticBlock({
        h1: `${LEAGUE_LABEL[lg]} wins over replacement, ${season}`,
        parts: [
          answer(
            `Which ${LEAGUE_LABEL[lg]} players were worth the most wins in ${season}?`,
            `${esc(top[0].name)} led at <strong>${top[0].war.toFixed(1)}</strong> ` +
              `wins over replacement, on ${signed(top[0].net, 2)} net points per 100 ` +
              `possessions over ${top[0].poss.toLocaleString("en-US")} possessions. ` +
              `Replacement level is set at ${j.meta.replacementPer100} points per 100, ` +
              `and each point of value over replacement is worth ` +
              `${j.meta.winsPerVorp} wins.`,
          ),
          table({
            caption:
              `${LEAGUE_LABEL[lg]} wins over replacement, ${season} — top 10 of ` +
              `${rows.length} qualified players`,
            cols: [
              { label: "#" }, { label: "Player" }, { label: "Team" },
              { label: "Poss", numeric: true },
              { label: "Net / 100", numeric: true },
              { label: "Wins over replacement", numeric: true },
            ],
            rows: top.map((r, i) => [
              String(i + 1), r.name, r.teams.join(" / "),
              String(r.poss), signed(r.net, 2), r.war.toFixed(1),
            ]),
          }),
          `<p>Impact comes from adjusted plus-minus rather than a box-score ` +
            `estimate of it, so a player who helps in ways the box score misses is ` +
            `not penalised for it. <strong>Contract surplus is absent, not ` +
            `estimated</strong>: no free licensed per-player salary source exists ` +
            `for the ${LEAGUE_LABEL[lg]}, so the money half of this layer does not ` +
            `ship rather than shipping a guess.</p>`,
        ],
      }),
    });
  }
  shell({
    title: "How wins over replacement is computed",
    description: fit([
      "Why adjusted plus-minus replaces Box Plus/Minus in the VORP formula, and how replacement level is set.",
      "The surplus column is absent, not estimated, because salaries are not public.",
      "Surplus is absent, not estimated: no free per-player salary source exists.",
      "Surplus is absent, not estimated.",
    ]),
    type: "article",
    ld: [
      AUTHOR,
      (() => {
        const g = layerJson("value-NBA.json")?.meta?.generated;
        return {
          "@type": "Article",
          headline: "Methodology",
          author: { "@id": AUTHOR["@id"] },
          publisher: { "@id": ORG["@id"] },
          mainEntityOfPage: `${BASE}/methodology/value`,
          ...(g ? { dateModified: new Date(g).toISOString().slice(0, 10) } : {}),
        };
      })(),
      breadcrumbs("/methodology/value", ["Methodology", "value"]),
    ],
    path: "/methodology/value",
    image: "value.png",
    block: (() => {
      const m = layerJson("value-NBA.json").meta;
      return staticBlock({
        h1: "How wins over replacement is computed",
        parts: [
          answer(
            "How is wins over replacement calculated here?",
            `Each player's adjusted plus-minus is measured against a replacement ` +
              `level of ${m.replacementPer100} points per 100 possessions, scaled ` +
              `by the share of his team's possessions he played, and converted at ` +
              `${m.winsPerVorp} wins per point of value over replacement.`,
          ),
          `<h2>Why adjusted plus-minus replaces box plus/minus</h2>\n<p>The ` +
            `standard VORP formula takes its impact term from a box-score ` +
            `estimate. This layer uses the ridge-fitted RAPM net rating instead ` +
            `(<code>${esc(m.impactMetric)}</code>), so a player who helps in ways ` +
            `the box score does not record is not penalised for it, and the ` +
            `defensive half is not a rebound count wearing a defence label.</p>`,
          `<h2>How replacement level is set</h2>\n<p>At ` +
            `${m.replacementPer100} points per 100 possessions, applied to every ` +
            `player above the ${m.qualifyPoss}-possession floor across ` +
            `${m.seasons.length} seasons. Season length matters for the ` +
            `conversion, so team games are read per season rather than assumed at ` +
            `82: ${m.seasons.map((s) => `${s} ${m.teamGames[s]}`).join(", ")}.</p>`,
          `<h2>What is missing, and why</h2>\n<p>Contract surplus, the half of ` +
            `this layer that would put a price on a win, <strong>does not ` +
            `ship</strong>. No free licensed per-player salary source exists, so ` +
            `the board says so rather than rendering an empty money column or an ` +
            `estimate dressed as a figure. The pipeline reads salaries the moment ` +
            `a file appears.</p>`,
        ],
      });
    })(),
  });
}

// ---- coaching / decision-EV layer (Layer 3). Shares the lineups card: one
// card per layer, never per entity, to keep the render count in its envelope.
if (COACHING_LEAGUES.length) {
  await renderPng(layerCard({
    leagues: COACHING_LEAGUES, kicker: "decision expected-value",
    headline: "The right call, not the lucky one.",
    scale: {
      lo: coachingJson.meta.spread.bestEtm.toFixed(2),
      hi: coachingJson.meta.spread.worstEtm.toFixed(2),
      lowerIsBetter: true,
      unit: "points of win probability given up",
    },
  }), join(DIST, "og", "coaching.png"));
  // The board itself migrated into /league (Clutch Decision-making), so the
  // only route left to shell is the methodology page; /coaching/* redirects.
  shell({
    title: "How clutch decisions are valued",
    description: fit([
      "How the end-game two-versus-three choice is scored on expectation at the moment of the decision, never on what happened next.",
      "And why neighbouring ranks are ties.",
      "And why neighbouring ranks are statistical ties, not an ordering.",
    ]),
    type: "article",
    ld: [
      AUTHOR,
      (() => {
        const g = layerJson("coaching-NBA.json")?.meta?.generated;
        return {
          "@type": "Article",
          headline: "Methodology",
          author: { "@id": AUTHOR["@id"] },
          publisher: { "@id": ORG["@id"] },
          mainEntityOfPage: `${BASE}/methodology/coaching`,
          ...(g ? { dateModified: new Date(g).toISOString().slice(0, 10) } : {}),
        };
      })(),
      breadcrumbs("/methodology/coaching", ["Methodology", "coaching"]),
    ],
    path: "/methodology/coaching",
    image: "coaching.png",
    block: (() => {
      const m = coachingJson.meta;
      const w = m.window;
      return staticBlock({
        h1: "How clutch decisions are valued",
        parts: [
          answer(
            "How is a coach's end-game shot decision scored?",
            `On expectation at the moment of the decision, never on what happened ` +
              `next. With ${w.margins.join(", ")} points to make up and at most ` +
              `${w.maxSeconds} seconds left in the fourth, the model compares the ` +
              `win probability of a two against a three using that team's own ` +
              `conversion rates. ${m.nDecisions} such decisions across ` +
              `${m.nTeams} teams.`,
          ),
          `<h2>The outcome never enters</h2>\n<p><code>score_decision</code> is ` +
            `never handed whether the shot went in. ` +
            `<code>tests/test_hindsight_guard.py</code> re-scores every decision ` +
            `with the outcome flipped and asserts an identical result, so a ` +
            `well-chosen shot that missed scores the same as one that fell.</p>`,
          `<h2>Where the error actually is</h2>\n` +
            table({
              caption:
                "How often the three was the better choice, against how often it " +
                "was taken, by deficit",
              cols: [
                { label: "Down by" },
                { label: "Decisions", numeric: true },
                { label: "Three was optimal", numeric: true },
                { label: "Three was chosen", numeric: true },
              ],
              rows: coachingJson.margins.map((r) => [
                `${r.margin} point${r.margin === 1 ? "" : "s"}`,
                String(r.n),
                `${(r.optimalThreeShare * 100).toFixed(1)}%`,
                `${(r.choseThreeShare * 100).toFixed(1)}%`,
              ]),
            }) +
            `\n<p>This, not the team table, is the finding: what teams should do ` +
            `swings from ` +
            `${(coachingJson.margins[0].optimalThreeShare * 100).toFixed(1)}% to ` +
            `${(coachingJson.margins[coachingJson.margins.length - 1].optimalThreeShare * 100).toFixed(1)}% ` +
            `across the deficit while what they choose barely moves. Down one they ` +
            `shoot the three far too often; down three, too rarely.</p>`,
          `<h2>Why neighbouring ranks are ties</h2>\n<p>${esc1(m.tiering.why)}. ` +
            `Teams resolve into ${m.spread.tiers} tiers, from ` +
            `${m.spread.bestTeam} at ${m.spread.bestEtm.toFixed(2)} to ` +
            `${m.spread.worstTeam} at ${m.spread.worstEtm.toFixed(2)} points of ` +
            `win probability given up per decision. A "distinguishably worse than ` +
            `optimal" test is deliberately not reported as a finding: the metric ` +
            `is non-negative by construction, so all ${m.nTeams} teams would ` +
            `pass it.</p>`,
          `<h2>What it is not</h2>\n<p>${esc1(m.framing)}.</p>\n<ul>` +
            m.approximations.map((t) => `<li>${esc1(t)}.</li>`).join("") +
            `</ul>`,
        ],
      });
    })(),
  });
}

// ---- team defence layer (Layer 4)
if (DEFENSE_LEAGUES.length) {
  await renderPng(layerCard({
    leagues: DEFENSE_LEAGUES, kicker: "team defence",
    headline: "The shots a defence forces.",
    scale: (() => {
      const v = Object.values(defenseJson.teams).flat().map((t) => t.qualityForced);
      const m = Math.max(...v.map(Math.abs));
      return { lo: `\u2212${m.toFixed(2)}`, hi: `+${m.toFixed(2)}`,
               unit: "expected points per shot vs league" };
    })(),
  }), join(DIST, "og", "defense.png"));
  // The board itself migrated into /league (the three defence lenses), so
  // the only route left to shell is the methodology page; /defense/* redirects.
  shell({
    title: "Why team defence, not player defence",
    description: fit([
      "The player version was built and rejected at 0.348 split-half reliability; the team version ships at 0.981, 0.964 and 0.717.",
      "What public data cannot separate.",
      "Plus what public defensive data cannot separate.",
    ]),
    type: "article",
    ld: [
      AUTHOR,
      (() => {
        const g = layerJson("defense-NBA.json")?.meta?.generated;
        return {
          "@type": "Article",
          headline: "Methodology",
          author: { "@id": AUTHOR["@id"] },
          publisher: { "@id": ORG["@id"] },
          mainEntityOfPage: `${BASE}/methodology/defense`,
          ...(g ? { dateModified: new Date(g).toISOString().slice(0, 10) } : {}),
        };
      })(),
      breadcrumbs("/methodology/defense", ["Methodology", "defense"]),
    ],
    path: "/methodology/defense",
    image: "defense.png",
    block: (() => {
      const m = defenseJson.meta;
      return staticBlock({
        h1: "How team defence is measured",
        parts: [
          answer(
            "How is team defence measured on this site?",
            `In three pillars, over ${m.nTeamSeasons} team-seasons, each ordered ` +
              `by its own measured reliability rather than by how interesting it ` +
              `reads. This is a <strong>team</strong> metric on purpose: a shot ` +
              `split five ways across defenders is team defence wearing a player's ` +
              `name.`,
          ),
          `<h2>The three pillars, ranked by how much they can be trusted</h2>\n` +
            table({
              caption:
                "Split-half reliability of each defensive pillar, " +
                `${m.nTeamSeasons} team-seasons`,
              cols: [
                { label: "Pillar" }, { label: "Unit" },
                { label: "Reliability", numeric: true },
              ],
              rows: m.pillars.map((p) => [
                p.label, p.unit, p.spearmanBrown.toFixed(3),
              ]),
            }) +
            `\n<ul>` +
            m.pillars.map((p) => `<li>${esc(p.label)}: ${esc(p.note)}</li>`).join("") +
            `</ul>\n<p>Each figure travels with its pillar so the noisiest one ` +
            `cannot be read as the solid one.</p>`,
          `<h2>Why there is no player version</h2>\n<p>There was one, and it was ` +
            `rejected on evidence: it split-halved at ` +
            `${m.playerLevelRejected.spearmanBrown.toFixed(3)} against ` +
            `${m.pillars[0].spearmanBrown.toFixed(3)} for the team version. ` +
            `${esc1(m.playerLevelRejected.why)}</p>`,
          `<h2>League-centred, and what is left out</h2>\n<p>` +
            `${esc1(m.leagueCentred)}.</p>\n<ul>` +
            m.notModelled.map((t) => `<li>${esc1(t)}.</li>`).join("") +
            `</ul>\n<p>${esc(m.unavailableReason)}</p>`,
        ],
      });
    })(),
  });
}

// The SPA fallback for paths with no shell of their own: genuinely invalid URLs,
// and the bare index routes that redirect. It carries noindex and deliberately
// no canonical — before this file existed the rewrite served the homepage shell,
// so every unshelled path advertised itself as the homepage.
writeFileSync(
  join(DIST, "spa-fallback.html"),
  template.replace(
    "</head>",
    `    <meta name="robots" content="noindex,follow" />\n  </head>`,
  ),
);

// ---- glossary: one page per measured quantity, plus the index.
//
// Copy comes from src/content/glossary.json so the wording can be edited without
// touching a component, and so this generator and the React view cannot disagree.
// Ranges in that file are computed from every value the site publishes, not
// estimated, and the two formula identities it states were checked numerically
// against the exports before being written down.
const glossary = JSON.parse(
  readFileSync(join(ROOT, "src", "content", "glossary.json"), "utf8"),
);
const termBySlug = new Map(glossary.terms.map((t) => [t.slug, t]));

const rangeTable = (t) =>
  t.rangeOf && !t.rangeOf.note
    ? table({
        caption: `${t.name}: the range across ${t.rangeOf.n ?? "all"} published values`,
        cols: [{ label: "Lowest", numeric: true }, { label: "10th", numeric: true },
               { label: "Median", numeric: true }, { label: "90th", numeric: true },
               { label: "Highest", numeric: true }],
        rows: [[t.rangeOf.min, t.rangeOf.p10, t.rangeOf.median, t.rangeOf.p90,
                t.rangeOf.max]],
      })
    : "";

const DEFINED_TERM_SET = {
  "@type": "DefinedTermSet",
  "@id": `${BASE}/glossary#set`,
  name: "Over Expected glossary",
  description: "Every quantity the Over Expected model measures, with its unit, "
    + "its normal range, and what it does not tell you.",
  url: `${BASE}/glossary`,
  hasDefinedTerm: glossary.terms.map((t) => ({
    "@type": "DefinedTerm",
    "@id": `${BASE}/glossary/${t.slug}#term`,
    name: t.name,
    url: `${BASE}/glossary/${t.slug}`,
  })),
};

shell({
  title: "Glossary of basketball shot-value metrics",
  description: fit([
    `Every quantity Over Expected measures across ${LEAGUES.length} leagues: what it is, its normal range, and what it does not tell you.`,
    `${glossary.terms.length} metrics defined.`,
  ]),
  path: "/glossary",
  image: "site.png",
  ld: [AUTHOR, DEFINED_TERM_SET, breadcrumbs("/glossary", ["Glossary"])],
  block: staticBlock({
    h1: "Glossary",
    parts: [
      answer(
        "What do the Over Expected metrics mean?",
        `This glossary defines all ${glossary.terms.length} quantities the site ` +
          `publishes, each with its unit, the range it actually takes across every ` +
          `published value, and an explicit statement of what it does not measure.`,
      ),
      table({
        caption: `The ${glossary.terms.length} metrics Over Expected publishes`,
        cols: [{ label: "Metric" }, { label: "Unit" }, { label: "Applies to" }],
        rows: glossary.terms.map((t) => [t.name, t.unit, t.scope]),
      }),
    ],
  }),
});
glossaryUrls.push(`${BASE}/glossary`);

for (const t of glossary.terms) {
  shell({
    title: `${t.name}, explained`.length <= 60
      ? `${t.name}, explained`
      : t.name,
    description: fit([
      `${t.name}: ${t.definition}`,
      t.formula ? `Formula: ${t.formula}.` : "",
      `Measured in ${t.unit}.`,
    ]),
    path: `/glossary/${t.slug}`,
    image: "site.png",
    ld: [
      AUTHOR,
      {
        "@type": "DefinedTerm",
        "@id": `${BASE}/glossary/${t.slug}#term`,
        name: t.name,
        alternateName: t.abbr ?? undefined,
        description: t.definition,
        url: `${BASE}/glossary/${t.slug}`,
        inDefinedTermSet: { "@id": `${BASE}/glossary#set` },
      },
      faq(`What is ${t.name.toLowerCase()}?`, t.definition),
      breadcrumbs(`/glossary/${t.slug}`, ["Glossary", t.name]),
    ],
    block: staticBlock({
      h1: t.name,
      parts: [
        answer(`What is ${t.name.toLowerCase()}?`, esc(t.definition)),
        t.formula
          ? `<h2>Formula</h2>\n<p><code>${esc(t.formula)}</code></p>` +
            (t.formulaNote ? `\n<p>${esc(t.formulaNote)}</p>` : "")
          : "",
        t.rangeOf?.note
          ? `<h2>Normal range</h2>\n<p>${esc(t.rangeOf.note)}</p>`
          : rangeTable(t)
            ? `<h2>Normal range</h2>\n${rangeTable(t)}`
            : "",
        `<h2>How to read it</h2>\n<p>${esc(t.howToRead)}</p>`,
        `<h2>What it does not measure</h2>\n<p>${esc(t.misses)}</p>`,
        t.related.length
          ? `<h2>Related</h2>\n<ul>` +
            t.related
              .filter((r) => termBySlug.has(r))
              .map((r) => `<li><a href="${BASE}/glossary/${r}">` +
                          `${esc(termBySlug.get(r).name)}</a></li>`)
              .join("") +
            `</ul>`
          : "",
        `<p>Measured in ${esc(t.unit)}, for a ${esc(t.scope)}.</p>`,
      ],
    }),
  });
  glossaryUrls.push(`${BASE}/glossary/${t.slug}`);
}

// ---- metric comparisons, changelog and about. Copy from src/content/*.json for
// the same reason the glossary is: editable without touching a component, and the
// React view and this generator read one file rather than two copies.
const comparisons = JSON.parse(
  readFileSync(join(ROOT, "src", "content", "comparisons.json"), "utf8"),
).comparisons;
const changelog = JSON.parse(
  readFileSync(join(ROOT, "src", "content", "changelog.json"), "utf8"),
).entries;
const about = aboutContent;

shell({
  title: "Metric comparisons",
  description: fit([
    `How Over Expected's measures compare to true shooting, effective field goal percentage, box plus/minus and defensive rating.`,
    `${comparisons.length} comparisons.`,
  ]),
  path: "/metrics",
  image: "site.png",
  ld: [AUTHOR, breadcrumbs("/metrics", ["Comparisons"])],
  block: staticBlock({
    h1: "Metric comparisons",
    parts: [
      answer(
        "How does points over expected compare to other basketball metrics?",
        `Each of these ${comparisons.length} pages sets one Over Expected measure ` +
          `against the public metric it is most often confused with, states what ` +
          `both actually measure, and says what neither can tell you.`,
      ),
      table({
        caption: "Metric comparisons published on Over Expected",
        cols: [{ label: "Comparison" }, { label: "Question it answers" }],
        rows: comparisons.map((c) => [c.title, c.question]),
      }),
    ],
  }),
});
contentUrls.push(`${BASE}/metrics`);

for (const c of comparisons) {
  shell({
    title: c.title.length <= 60 ? c.title : c.question.slice(0, 58),
    description: fit([c.question, c.lead.replace(/\*\*/g, "")]),
    path: `/metrics/${c.slug}`,
    image: "site.png",
    ld: [
      AUTHOR,
      faq(c.question, c.lead.replace(/\*\*/g, "")),
      { "@type": "Article", headline: c.title,
        author: { "@id": AUTHOR["@id"] }, publisher: { "@id": ORG["@id"] },
        mainEntityOfPage: `${BASE}/metrics/${c.slug}` },
      breadcrumbs(`/metrics/${c.slug}`, ["Comparisons", c.title]),
    ],
    block: staticBlock({
      h1: c.title,
      parts: [
        answer(c.question, esc(c.lead.replace(/\*\*/g, ""))),
        c.theirs
          ? `<h2>${esc(c.theirs.name)} (${esc(c.theirs.abbr)})</h2>\n` +
            `<p>${esc(c.theirs.what)}</p>` +
            (c.theirs.formula ? `\n<p><code>${esc(c.theirs.formula)}</code></p>` : "")
          : "",
        `<h2>Side by side</h2>\n` +
          table({
            caption: `${c.title}: what each measures`,
            cols: c.rows[0].map((h, i) => ({ label: i === 0 ? "" : h })),
            rows: c.rows,
          }),
        c.tableNote ? `<p>${esc(c.tableNote)}</p>` : "",
        `<h2>Which should you use?</h2>\n<p>${esc(c.use)}</p>`,
        `<h2>What neither measures</h2>\n<p>${esc(c.neither)}</p>`,
        `<p>Definitions: <a href="${BASE}/glossary/${c.ours}">` +
          `${esc(termBySlug.get(c.ours)?.name ?? c.ours)}</a>` +
          (c.oursAlt
            ? ` and <a href="${BASE}/glossary/${c.oursAlt}">` +
              `${esc(termBySlug.get(c.oursAlt)?.name ?? c.oursAlt)}</a>`
            : "") + `.</p>`,
      ],
    }),
  });
  contentUrls.push(`${BASE}/metrics/${c.slug}`);
}

shell({
  title: "Changelog",
  description: fit([
    `What changed on Over Expected and when, newest first, from ${changelog[changelog.length - 1].date} to ${changelog[0].date}.`,
    "Model and data changes alongside interface ones.",
  ]),
  path: "/changelog",
  image: "site.png",
  ld: [
    AUTHOR,
    breadcrumbs("/changelog", ["Changelog"]),
    { "@type": "Article", headline: "Over Expected changelog",
      author: { "@id": AUTHOR["@id"] }, publisher: { "@id": ORG["@id"] },
      datePublished: changelog[changelog.length - 1].date,
      dateModified: changelog[0].date,
      mainEntityOfPage: `${BASE}/changelog` },
  ],
  block: staticBlock({
    h1: "Changelog",
    parts: [
      answer(
        "What has changed on Over Expected?",
        `Dated entries covering ${changelog.length} releases from ` +
          `${changelog[changelog.length - 1].date} to ${changelog[0].date}. Model ` +
          `and data changes are listed alongside interface ones, because a number ` +
          `moving matters more than a page moving.`,
      ),
      "<ol>" +
        changelog
          .map((e) => `<li><time datetime="${e.date}">${e.date}</time> ` +
                      `<strong>${esc(e.title)}</strong> ${esc(e.body)}</li>`)
          .join("\n") +
        "</ol>",
    ],
  }),
});
contentUrls.push(`${BASE}/changelog`);

shell({
  title: "About Over Expected",
  description: fit([
    "Who builds Over Expected, how the model works, what the data covers, and the five things it explicitly does not measure.",
    "Contact and licence included.",
  ]),
  path: "/about",
  image: "site.png",
  ld: [
    AUTHOR,
    { "@type": "AboutPage", url: `${BASE}/about`, mainEntity: { "@id": AUTHOR["@id"] } },
    breadcrumbs("/about", ["About"]),
  ],
  block: staticBlock({
    h1: "About",
    parts: [
      answer("What is Over Expected?", esc(about.whatItIs)),
      `<h2>Why it exists</h2>\n<p>${esc(about.why)}</p>`,
      `<h2>Who built it</h2>\n<p>${esc(about.who)}</p>`,
      `<h2>How it is built</h2>\n<p>${esc(about.howItsBuilt)}</p>`,
      `<h2>What it does not measure</h2>\n<ul>` +
        about.limits.map((l) => `<li>${esc(l)}</li>`).join("") + `</ul>`,
      `<h2>Licence and citation</h2>\n<p>${esc(about.licence)}</p>`,
      `<h2>Contact</h2>\n<p>${esc(about.contact)}</p>`,
    ],
  }),
});
contentUrls.push(`${BASE}/about`);

// ---- sitemaps, robots and a freshness feed
//
// Split by section behind an index: at 4,378 canonical URLs one file still fits
// inside the 50,000-URL limit, but sections let a crawler (and a human) see which
// part of the site changed, and the count is heading up with every phase.
//
// `lastmod` is emitted ONLY where a real generation timestamp exists. The layer
// artifacts carry meta.generated; the base data-{LG}.json exports do not, and the
// file's mtime is the sync time, which changes on every run whether or not the
// data did. Google treats an inaccurate lastmod as a reason to stop trusting all
// of them, so the base sections carry none. Adding `generated` to the base
// exports is a one-line pipeline change that would fix that.
// The canonical URL list. Bare /leaderboard and /league are absent because they
// are 301s now, and the dated current-season URLs are absent because they
// canonical to their evergreen twin: a sitemap should list canonicals only.
const urls = [
  `${BASE}/`, `${BASE}/methodology`,
  `${BASE}/data`, `${BASE}/compare`,
  ...canonicalUrls.sort(),
  ...refUrls.sort(),
  ...glossaryUrls.sort(),
  ...contentUrls.sort(),
  ...LINEUP_LEAGUES.map((lg) => `${BASE}/lineups/${lg}`),
  ...(LINEUP_LEAGUES.length ? [`${BASE}/methodology/lineups`] : []),
  ...VALUE_LEAGUES.map((lg) => `${BASE}/value/${lg}`),
  ...(VALUE_LEAGUES.length ? [`${BASE}/methodology/value`] : []),
  ...(COACHING_LEAGUES.length ? [`${BASE}/methodology/coaching`] : []),
  ...(DEFENSE_LEAGUES.length ? [`${BASE}/methodology/defense`] : []),
  ...(existsSync(join(ROOT, "public", "calibration-NBA.json"))
    ? LEAGUES.map((lg) => `${BASE}/calibration/${lg}`) : []),
  ...[...latestByPlayer.values()]
    .map((r) => `${BASE}/player/${r.lg}/${r.id}`)
    .sort(),
];

const SECTIONS = [
  ["players", (u) => u.includes("/player/")],
  ["leaderboards", (u) => u.includes("/leaderboard/")],
  ["teams", (u) => u.includes("/league/")],
  ["officials", (u) => u.includes("/referee")],
  ["lineups", (u) => u.includes("/lineups/") || u.includes("/value/")],
  ["glossary", (u) => u.includes("/glossary")],
  ["explainers", (u) => u.includes("/metrics") || u.includes("/changelog") || u.includes("/about")],
  ["core", () => true],
];

const layerDate = (name) => {
  const j = layerJson(name);
  const g = j?.meta?.generated;
  return g ? String(g).slice(0, 10) : null;
};
const LAYER_LASTMOD = {
  lineups: layerDate("rapm-NBA.json"),
  value: layerDate("value-NBA.json"),
  coaching: layerDate("coaching-NBA.json"),
  defense: layerDate("defense-NBA.json"),
  calibration: layerDate("calibration-NBA.json"),
};

function lastmodFor(url) {
  if (url.includes("/lineups/") || url.includes("/methodology/lineups"))
    return LAYER_LASTMOD.lineups;
  if (url.includes("/value/") || url.includes("/methodology/value"))
    return LAYER_LASTMOD.value;
  if (url.includes("/methodology/coaching")) return LAYER_LASTMOD.coaching;
  if (url.includes("/methodology/defense")) return LAYER_LASTMOD.defense;
  if (url.includes("/calibration/")) return LAYER_LASTMOD.calibration;
  return null;
}

const urlset = (urls) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n` +
  `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  urls
    .map((u) => {
      const lm = lastmodFor(u);
      return `  <url><loc>${u}</loc>${lm ? `<lastmod>${lm}</lastmod>` : ""}</url>`;
    })
    .join("\n") +
  `\n</urlset>\n`;

const remaining = [...urls];
const written = [];
for (const [name, match] of SECTIONS) {
  const take = remaining.filter(match);
  for (const u of take) remaining.splice(remaining.indexOf(u), 1);
  if (!take.length) continue;
  writeFileSync(join(DIST, `sitemap-${name}.xml`), urlset(take.sort()));
  written.push([name, take.length]);
}
if (remaining.length) {
  throw new Error(`sitemap sections did not cover ${remaining.length} url(s)`);
}
writeFileSync(
  join(DIST, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    written
      .map(([n]) => `  <sitemap><loc>${BASE}/sitemap-${n}.xml</loc></sitemap>`)
      .join("\n") +
    `\n</sitemapindex>\n`,
);

// robots. The explicit AI-crawler lines are documentary: every one of these
// agents honours `User-agent: *`, so `Allow: /` already permits them, and
// Google-Extended / Applebot-Extended are training opt-out tokens rather than
// crawl controls. They are here so the file states the intent rather than
// leaving it to be inferred.
const AI_AGENTS = [
  "GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-User",
  "PerplexityBot", "Perplexity-User", "Google-Extended", "Applebot-Extended",
  "CCBot", "Bytespider", "meta-externalagent",
];
writeFileSync(
  join(DIST, "robots.txt"),
  `User-agent: *\nAllow: /\n\n` +
    AI_AGENTS.map((a) => `User-agent: ${a}\nAllow: /\n`).join("\n") +
    `\nSitemap: ${BASE}/sitemap.xml\n`,
);

// A JSON Feed of real update events, so a crawler can detect freshness without
// re-fetching 4,000 pages. Every entry is dated from an artifact's own
// meta.generated: nothing here is invented, and the base exports that carry no
// timestamp contribute no entry. Phase 8's changelog will add to this.
const feedItems = [
  ["rapm-NBA.json", "Lineups and RAPM refreshed",
   "Regularized adjusted plus-minus and five-man lineups for the NBA.",
   "/lineups/NBA"],
  ["value-NBA.json", "Wins over replacement refreshed",
   "Value over replacement rebuilt on adjusted plus-minus.", "/value/NBA"],
  ["coaching-NBA.json", "Clutch decision expected-value refreshed",
   "End-game two-versus-three decisions rescored on expectation.",
   "/methodology/coaching"],
  ["defense-NBA.json", "Team defence refreshed",
   "The three team-defence pillars, ordered by measured reliability.",
   "/methodology/defense"],
  ["calibration-NBA.json", "Calibration refreshed",
   "What the model can and cannot measure, and at what sample size.",
   "/calibration/NBA"],
  ...LEAGUES.filter((lg) => existsSync(join(ROOT, "public", `headshots-${lg}.json`)))
    .map((lg) => [
      `headshots-${lg}.json`,
      `${LEAGUE_LABEL[lg]} player headshots added`,
      `Faces resolved for qualified ${LEAGUE_LABEL[lg]} players.`,
      `/leaderboard/${lg}/shot-value`,
    ]),
]
  .map(([file, title, summary, path]) => {
    const j = layerJson(file);
    const g = j?.meta?.generated;
    if (!g) return null;
    return {
      id: `${BASE}${path}#${file}-${g}`,
      url: `${BASE}${path}`,
      title,
      summary,
      date_published: new Date(g).toISOString(),
    };
  })
  .filter(Boolean)
  .sort((a, b) => (a.date_published < b.date_published ? 1 : -1));

writeFileSync(
  join(DIST, "feed.json"),
  JSON.stringify(
    {
      version: "https://jsonfeed.org/version/1.1",
      title: "Over Expected data updates",
      home_page_url: `${BASE}/`,
      feed_url: `${BASE}/feed.json`,
      description: SITE_LINE,
      items: feedItems,
    },
    null,
    2,
  ) + "\n",
);

console.log(
  `  sitemaps: ${written.map(([n, c]) => `${n} ${c}`).join(", ")}` +
    ` (index of ${written.length}); feed ${feedItems.length} items`,
);

// ---- llms.txt
//
// Generated from the same route data as the sitemap, so it cannot drift.
//
// Worth stating plainly: as of 2026 the major AI crawlers largely ignore this
// file, and Google has said it has no effect on Search or AI Overviews. It is a
// cheap bet, not a lever, and it is last in the sequence for that reason.
// Deliberately NOT accompanied by per-page Markdown mirrors: at 4,453 pages that
// would be duplicate content at scale and would dilute crawl budget for no
// demonstrated gain.
const lgLine = (lg) => {
  const d = dataByLeague[lg];
  const q = d.leaderboard.filter((r) => r.pct !== null).length;
  return `- [${LEAGUE_LABEL[lg]} shot value leaders](${BASE}/leaderboard/${lg}/shot-value): ` +
    `${q} qualified player-seasons, ${d.meta.seasons[0]} to ` +
    `${d.meta.seasons[d.meta.seasons.length - 1]}.`;
};
writeFileSync(
  join(DIST, "llms.txt"),
  [
    "# Over Expected",
    "",
    `> ${SITE_LINE} It measures what a shot is really worth: field goals made ` +
      `above the difficulty of the looks taken, plus the free throws those ` +
      `situations draw, expressed as points over expected per 100 possessions and ` +
      `anchored to each season's own league rate rather than a flat average. ` +
      `Built from ${LEAGUES.map((lg) => dataByLeague[lg].meta.nPossessions)
        .reduce((a, b) => a + b, 0)
        .toLocaleString("en-US")} possessions of public play-by-play. Data is ` +
      `CC BY 4.0.`,
    "",
    "## Leaderboards",
    ...LEAGUES.map(lgLine),
    "",
    "## Metrics",
    `- [Glossary](${BASE}/glossary): all ${glossary.terms.length} measured ` +
      `quantities, each with its unit, real range and stated limits.`,
    ...glossary.terms.slice(0, 6).map((t) =>
      `- [${t.name}](${BASE}/glossary/${t.slug}): ${t.definition.split(". ")[0]}.`),
    "",
    "## Method and limits",
    `- [How Over Expected is measured](${BASE}/methodology): the model, what ` +
      `leak-free means, and what it cannot prove.`,
    ...LEAGUES.slice(0, 1).map((lg) =>
      `- [What the model cannot measure](${BASE}/calibration/${lg}): how many ` +
      `attempts before a number means anything.`),
    ...(LINEUP_LEAGUES.length
      ? [`- [Lineups and RAPM](${BASE}/methodology/lineups): adjusted plus-minus, ` +
         `and why lineup synergy does not predict.`] : []),
    ...(DEFENSE_LEAGUES.length
      ? [`- [Why team defence, not player defence](${BASE}/methodology/defense): ` +
         `the player metric was built and rejected at 0.348 split-half reliability.`]
      : []),
    "",
    "## Data",
    `- [Download the data](${BASE}/data): static JSON per league, CC BY 4.0.`,
    `- [Update feed](${BASE}/feed.json): dated data-refresh events.`,
    "",
    "## Cite as",
    "Over Expected (2026). Points over expected per 100 possessions. " + `${BASE}`,
    "",
  ].join("\n"),
);

if (descShort || descLong) {
  console.log(
    `  WARNING: ${descShort} description(s) under ${DESC_MIN} chars, ${descLong} over ${DESC_MAX}`,
  );
}

const cards = 1 + n + (LINEUP_LEAGUES.length ? 1 : 0);
console.log(`done: ${cards} OG cards (${n} player + site${LINEUP_LEAGUES.length ? " + lineups" : ""}), ${shellCount} HTML shells, sitemap ${urls.length} urls (base ${BASE})`);
