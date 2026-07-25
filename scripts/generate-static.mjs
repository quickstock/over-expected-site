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
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
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
  NBA: { warm: "#005fc6", cool: "#d0440b" },
  EL: { warm: "#df5200", cool: "#2f5e9e" },
  EUC: { warm: "#a8a300", cool: "#3d4fa0" },
  ACB: { warm: "#bd1f44", cool: "#2f5e9e" },
  BSL: { warm: "#e43322", cool: "#2f5e9e" },
  LBA: { warm: "#008a39", cool: "#7d45a2" },
  PROA: { warm: "#6f41c1", cool: "#007e46" },
  GBL: { warm: "#008da4", cool: "#9b357f" },
  BBL: { warm: "#b58600", cool: "#2f5e9e" },
  ABA: { warm: "#00806e", cool: "#93398e" },
  WNBA: { warm: "#d5461c", cool: "#3d5ea3" },
};
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
const template = readFileSync(join(DIST, "index.html"), "utf8");

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

/** One shared card for the lineups layer. Individual lineups deliberately get
    no card: at ~900 qualified lineups per season that would multiply the
    render count for pages nobody unfurls, and the build already sits near the
    renderer's practical ceiling. */
function lineupsCard() {
  return {
    type: "div",
    props: {
      style: {
        width: 1200, height: 630, display: "flex", flexDirection: "column",
        backgroundColor: PAPER, padding: 72, justifyContent: "space-between",
      },
      children: [
        { type: "div", props: { style: { fontFamily: "JetBrains Mono", fontWeight: 400, fontSize: 26, color: FAINT }, children: `${LINEUP_LEAGUES.map((lg) => LEAGUE_LABEL[lg]).join(" · ")} · lineups & RAPM` } },
        {
          type: "div",
          props: {
            style: { display: "flex", flexDirection: "column", gap: 14 },
            children: [
              { type: "div", props: { style: { fontFamily: "Bricolage Grotesque", fontSize: 104, color: INK, lineHeight: 1.02 }, children: "Every lineup, over expected." } },
              { type: "div", props: { style: { display: "flex", fontFamily: "JetBrains Mono", fontWeight: 400, fontSize: 30, color: SOFT }, children: [
                { type: "span", props: { style: { color: THEME.NBA.cool }, children: signed(-8) } },
                { type: "span", props: { children: " to " } },
                { type: "span", props: { style: { color: THEME.NBA.warm }, children: signed(8) } },
                { type: "span", props: { children: " net points per 100, adjusted" } },
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

function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

let shellCount = 0;

function shell({ title, description, path, image }) {
  shellCount++;
  let html = template;
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`);
  html = html.replace(
    /(<meta\s+name="description"\s+content=")[^"]*(")/,
    `$1${esc(description)}$2`,
  );
  html = html.replace(
    /(<meta property="og:title" content=")[^"]*(")/,
    `$1${esc(title)}$2`,
  );
  html = html.replace(
    /(<meta\s+property="og:description"\s+content=")[^"]*(")/,
    `$1${esc(description)}$2`,
  );
  const extra = [
    `<meta property="og:type" content="website" />`,
    `<meta property="og:url" content="${BASE}${path}" />`,
    `<meta property="og:image" content="${BASE}/og/${image}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:image" content="${BASE}/og/${image}" />`,
    `<link rel="canonical" href="${BASE}${path}" />`,
  ].join("\n    ");
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

let n = 0;
for (const row of latestByPlayer.values()) {
  const img = `p-${row.lg}-${row.id}.png`;
  await renderPng(card(row), join(DIST, "og", img));
  shell({
    title: `${row.name} · Over Expected`,
    description: `${row.name}, ${LEAGUE_LABEL[row.lg]} ${row.season}: ${signed(row.per100)} ${ftNoun(row.lg)} over expected / 100 vs the league-average rate (${ordinal(Math.floor(row.pct))} percentile, ${row.fta} FTA vs ${row.xfta.toFixed(1)} expected).`,
    path: `/player/${row.lg}/${row.id}`,
    image: img,
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

shell({
  title: "Leaderboard · Over Expected",
  description: `Shot value, shot-making, and free throws drawn over expected per 100 possessions: every qualified player in ${LEAGUE_LIST}.`,
  path: "/leaderboard",
  image: "site.png",
});
shell({
  title: "Methodology · Over Expected",
  description: `How Over Expected is measured across ${LEAGUE_LIST}: free throws drawn per possession, against each season's own league rate. Leak-free, anchored, and honest about what it cannot prove.`,
  path: "/methodology",
  image: "site.png",
});
shell({
  title: "Compare · Over Expected",
  description: "Two players, same baseline: FTAOE per 100 and the cumulative gap, side by side.",
  path: "/compare",
  image: "site.png",
});
shell({
  title: "League context · Over Expected",
  description: `Team styles and officiating across ${LEAGUE_LIST}, measured with the FTAOE baseline: who draws, who concedes, and how officials' games differ.`,
  path: "/league",
  image: "site.png",
});
shell({
  title: "Feedback · Over Expected",
  description: "Spotted something off, want a feature, or disagree with the method? Send feedback.",
  path: "/feedback",
  image: "site.png",
});
shell({
  title: "Data · Over Expected",
  description: `Download the dataset: leaderboards, per-game series, shot zones and foul ledgers across ${LEAGUE_LIST}, as static JSON.`,
  path: "/data",
  image: "site.png",
});

// ---- lineups / RAPM layer
if (LINEUP_LEAGUES.length) {
  await renderPng(lineupsCard(), join(DIST, "og", "lineups.png"));
  for (const lg of LINEUP_LEAGUES) {
    shell({
      title: `Lineups & RAPM · ${LEAGUE_LABEL[lg]} · Over Expected`,
      description: `Regularized adjusted plus-minus for every qualified ${LEAGUE_LABEL[lg]} player, split into offense and defense, plus five-man lineups measured against the sum of their parts.`,
      path: `/lineups/${lg}`,
      image: "lineups.png",
    });
  }
  shell({
    title: "Lineups methodology · Over Expected",
    description:
      "How the RAPM fit works: stints, ridge regularization with a cross-validated penalty, a box-score prior instead of shrinkage toward zero, and what the lineup synergy number does and does not predict.",
    path: "/methodology/lineups",
    image: "lineups.png",
  });
}

// ---- calibration: platform-wide, so a shell for every active league
if (existsSync(join(ROOT, "public", "calibration-NBA.json"))) {
  for (const lg of LEAGUES) {
    shell({
      title: `Calibration · ${LEAGUE_LABEL[lg]} · Over Expected`,
      description: `What this model can and cannot measure: how many attempts before shot selection and shot-making mean anything, what accuracy costs as data quality falls to a federation scoresheet, whether the residual is contaminated by shot openness, and what it cannot see.`,
      path: `/calibration/${lg}`,
      image: "site.png",
    });
  }
}

// ---- value layer (shares the lineups card: same underlying impact metric)
if (VALUE_LEAGUES.length) {
  for (const lg of VALUE_LEAGUES) {
    shell({
      title: `Value · ${LEAGUE_LABEL[lg]} · Over Expected`,
      description: `Wins over replacement for every qualified ${LEAGUE_LABEL[lg]} player, built on adjusted plus-minus rather than a box-score estimate of it, plus contract surplus wherever per-player salaries are public.`,
      path: `/value/${lg}`,
      image: "lineups.png",
    });
  }
  shell({
    title: "Value methodology · Over Expected",
    description:
      "How wins over replacement is computed, why adjusted plus-minus replaces Box Plus/Minus in the VORP formula, and why the surplus column is absent rather than estimated when salaries aren't public.",
    path: "/methodology/value",
    image: "lineups.png",
  });
}

// sitemap + robots for the deployed domain
const urls = [
  `${BASE}/`, `${BASE}/leaderboard`, `${BASE}/methodology`,
  `${BASE}/data`, `${BASE}/compare`,
  `${BASE}/league`, `${BASE}/feedback`,
  ...LINEUP_LEAGUES.map((lg) => `${BASE}/lineups/${lg}`),
  ...(LINEUP_LEAGUES.length ? [`${BASE}/methodology/lineups`] : []),
  ...VALUE_LEAGUES.map((lg) => `${BASE}/value/${lg}`),
  ...(VALUE_LEAGUES.length ? [`${BASE}/methodology/value`] : []),
  ...(existsSync(join(ROOT, "public", "calibration-NBA.json"))
    ? LEAGUES.map((lg) => `${BASE}/calibration/${lg}`) : []),
  ...[...latestByPlayer.values()]
    .map((r) => `${BASE}/player/${r.lg}/${r.id}`)
    .sort(),
];
writeFileSync(
  join(DIST, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map((u) => `  <url><loc>${u}</loc></url>`)
    .join("\n")}\n</urlset>\n`,
);
writeFileSync(
  join(DIST, "robots.txt"),
  `User-agent: *\nAllow: /\n\nSitemap: ${BASE}/sitemap.xml\n`,
);

const cards = 1 + n + (LINEUP_LEAGUES.length ? 1 : 0);
console.log(`done: ${cards} OG cards (${n} player + site${LINEUP_LEAGUES.length ? " + lineups" : ""}), ${shellCount} HTML shells, sitemap ${urls.length} urls (base ${BASE})`);
