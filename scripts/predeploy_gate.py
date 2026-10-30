#!/usr/bin/env python3
"""The pre-deploy gate (v4 §4). Run before any production deploy; non-zero blocks.

Asserts the things that would be embarrassing to discover live:

  1. No NaN, Infinity, null or placeholder value in any JSON a route consumes.
     JSON has no NaN literal, so a Python-emitted NaN lands as the bare token
     `NaN` and silently breaks JSON.parse in the browser — worth checking as text
     rather than trusting the encoder.
  2. Every privileged artifact carries its privileged flag.
  3. Every per-league unavailable flag has something to render.
  4. Layer files referenced by the registry actually exist.
  5. The feature-contract, leakage-audit and hindsight-guard tests are green.
  6. OG-card count and generation time are inside the local-prebuild envelope.

Deliberately dumb and readable: a gate nobody can follow is a gate nobody trusts.
"""
import collections
import hashlib
import json
import re
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlparse

HERE = Path(__file__).resolve().parent
SITE = HERE.parent
PUBLIC = SITE / "public"
OE = SITE.parent
NBA_OE = OE / "NBA_OE"
CALIB = OE.parent / "xpts_calibration"

# satori + resvg wedge on Vercel's Linux image past roughly this many cards, which
# is why deploys are prebuilt locally. Warn well before the cliff.
OG_CARD_CEILING = 4000

BAD_TOKENS = re.compile(r'(?<![\w"])(NaN|Infinity|-Infinity|undefined)(?![\w"])')
PLACEHOLDER = re.compile(r'"(TBD|TODO|FIXME|XXX|PLACEHOLDER)"', re.I)

failures, warnings = [], []


def fail(msg):
    failures.append(msg)
    print(f"  [FAIL] {msg}")


def ok(msg):
    print(f"  [ok]   {msg}")


def warn(msg):
    warnings.append(msg)
    print(f"  [warn] {msg}")


def check_json_values():
    print("1. JSON values")
    files = sorted(PUBLIC.glob("*.json"))
    if not files:
        fail("no JSON in public/ — nothing to deploy")
        return
    for f in files:
        raw = f.read_text()
        for pat, label in ((BAD_TOKENS, "non-finite/undefined token"),
                           (PLACEHOLDER, "placeholder string")):
            m = pat.search(raw)
            if m:
                fail(f"{f.name}: {label} {m.group(0)!r} at byte {m.start()}")
        try:
            json.loads(raw)
        except Exception as e:
            fail(f"{f.name}: not valid JSON ({e})")
    ok(f"{len(files)} JSON files parse, no NaN/Infinity/undefined/placeholders")


def check_privileged_flags():
    print("2. privileged artifacts carry their flag")
    # Layer 4 defence is the privileged one. It is only a gate item if exported.
    d = PUBLIC / "defense-NBA.json"
    if not d.exists():
        ok("no privileged artifact exported (Layer 4 not shipped) — nothing to flag")
        return
    meta = json.loads(d.read_text()).get("meta", {})
    if meta.get("privileged") is not True:
        fail("defense-NBA.json lacks meta.privileged = true")
    elif not meta.get("leaguesUnavailable"):
        fail("defense-NBA.json has no leaguesUnavailable list")
    else:
        ok("defense-NBA.json is flagged privileged with an unavailable list")


def check_unavailable_flags():
    print("3. unavailable flags have something to say")
    v = PUBLIC / "value-NBA.json"
    if v.exists():
        meta = json.loads(v.read_text()).get("meta", {})
        if "salaryAvailable" not in meta:
            fail("value-NBA.json: no salaryAvailable map")
        elif not meta.get("anySalary", False):
            ok("value: salaryAvailable all false, board renders the disclaimer")
        else:
            ok("value: salary present for at least one season")
    else:
        warn("value-NBA.json absent")


def check_registry_layer_files():
    print("4. layer files the registry expects exist")
    reg = (SITE / "src" / "leagues.ts").read_text()
    active = re.search(r"ACTIVE_LEAGUES:\s*League\[\]\s*=\s*\[(.*?)\]", reg, re.S)
    leagues = re.findall(r'"([A-Z]+)"', active.group(1)) if active else []
    missing = [lg for lg in leagues if not (PUBLIC / f"data-{lg}.json").exists()]
    if missing:
        fail(f"ACTIVE_LEAGUES references leagues with no data file: {missing}")
    else:
        ok(f"all {len(leagues)} active leagues have data-*.json")
    # layers flagged in the registry must have their artifact. One row per
    # layer, so adding a layer is a row here rather than another if-block.
    layer_files = {"lineups": "rapm", "value": "value",
                   "coaching": "coaching", "defense": "defense"}
    for lg in leagues:
        block = re.search(rf'{lg}:\s*{{(.*?)\n  }},', reg, re.S)
        if not block:
            continue
        for layer, prefix in layer_files.items():
            if f"{layer}: true" in block.group(1):
                if not (PUBLIC / f"{prefix}-{lg}.json").exists():
                    fail(f"{lg} declares layers.{layer} but "
                         f"{prefix}-{lg}.json is missing")
    ok("declared layers have their artifacts")


# Fields the front end dereferences without a guard. A TypeScript interface can
# claim a field the JSON never had — `RapmRow.teams` did exactly that, and
# `r.teams.join(...)` threw and blanked the whole /lineups route while every HTTP
# check still returned 200. Types describe JSON they never validate; this does.
REQUIRED_ROW_FIELDS = {
    # Base export: the League page's team tables dereference the shot-value
    # columns (sv100/make100 may be null, but the keys must exist) alongside
    # the FT pair.
    "data-*.json": (["teams", "*", "*"],
                    ["team", "poss", "drawn", "conceded",
                     "sv100", "make100"]),
    # Referee views (2026-10-23): the board and strip read the estimate and its
    # range on every row, and the profile merges careers across eras, so a
    # profile without the key throws in the archive merge.
    "data-*.json#referees": (["referees", "*", "*"],
                             ["id", "name", "games", "per100", "diff",
                              "est", "lo", "hi"]),
    "data-*.json#refProfiles": (["refProfiles", "*"],
                                ["name", "seasons", "detail", "careers"]),
    "rapm-*.json": (["players", "*", "*"],
                    ["id", "name", "teams", "possOff", "possDef",
                     "oP", "dP", "netP", "seO", "seD", "netCi", "tier"]),
    "value-*.json": (["players", "*", "*"],
                     ["id", "name", "teams", "poss", "share", "net", "war"]),
    # Layer 3: the board dereferences every one of these per team row, and
    # `ci` is indexed as a pair, so a scalar would throw the same way.
    "coaching-*.json": (["teams", "*"],
                        ["team", "teamId", "decisions", "etm", "ci", "tier"]),
    # Layer 4: sorted and bar-scaled by the three pillar keys, so a missing
    # one yields NaN geometry rather than a visible error.
    "defense-*.json": (["teams", "*", "*"],
                       ["team", "teamId", "defPoss", "shotsFaced",
                        "qualityForced", "deterrence", "suppression",
                        "rimRate", "ptsAllowed100"]),
}


def _sample_rows(obj, path):
    """Walk a path with '*' wildcards, yielding leaf dicts."""
    cur = [obj]
    for step in path:
        nxt = []
        for c in cur:
            if step == "*":
                vals = list(c.values()) if isinstance(c, dict) else list(c)
                nxt.extend(vals[:3])          # a sample is enough
            elif isinstance(c, dict) and step in c:
                nxt.append(c[step])
        cur = nxt
    return [c for c in cur if isinstance(c, dict)]


def check_row_shapes():
    print("7. layer rows carry every field the UI dereferences")
    checked = 0
    for pattern, (path, required) in REQUIRED_ROW_FIELDS.items():
        for f in sorted(PUBLIC.glob(pattern.split("#")[0])):
            data = json.loads(f.read_text())
            rows = _sample_rows(data, path)
            if not rows:
                warn(f"{f.name}: no rows found at {path}")
                continue
            for row in rows:
                missing = [k for k in required if k not in row]
                if missing:
                    fail(f"{f.name}: row is missing {missing} — the UI would "
                         f"throw on these and blank the route")
                    break
            checked += 1
    if checked:
        ok(f"{checked} layer file(s) have all UI-required row fields")


# The app and the static generator each carry the lens-slug tables: src/routes.ts
# builds the links, generate-static.mjs builds the shells and canonicals. A slug
# that drifts between them is a 404 or a canonical pointing at a page that does
# not exist, several hundred URLs at a time, and every HTTP check still returns
# 200 because the SPA rewrite serves the shell. So compare them.
def check_routing_contract():
    print("8. routing contract: slugs, links, redirect targets")
    routes = (SITE / "src" / "routes.ts").read_text()
    gen = (HERE / "generate-static.mjs").read_text()

    def slugs(text, name):
        m = re.search(rf"const {name} = \[(.*?)\n\]", text, re.S)
        return re.findall(r'slug: "([^"]+)"', m.group(1)) if m else []

    for name in ("BOARD_LENSES", "LEAGUE_LENSES"):
        a, b = slugs(routes, name), slugs(gen, name)
        if not a or not b:
            fail(f"{name}: could not read the slug table from both files")
        elif a != b:
            fail(f"{name} slugs differ: routes.ts {a} vs generate-static.mjs {b}")
        else:
            ok(f"{name}: {len(a)} slugs agree across app and generator")

    # Nothing in the app should link at a URL the CDN 301s away from: the reader
    # pays a redirect and the link equity lands on the destination anyway.
    redirects = json.loads((SITE / "vercel.json").read_text()).get("redirects", [])
    sources = [r["source"] for r in redirects]
    bad = []
    for f in sorted((SITE / "src").rglob("*.tsx")):
        text = f.read_text()
        for src_path in sources:
            if f'to="{src_path}"' in text:
                bad.append(f"{f.name} -> {src_path}")
    if bad:
        fail(f"internal links point at redirecting URLs: {bad}")
    else:
        ok(f"no internal link targets any of the {len(sources)} redirect sources")

    # A 301 into a 404 is invisible to an HTTP check of the source URL.
    dist = SITE / "dist"
    if not dist.exists():
        warn("dist absent - run the build before the gate to check redirect targets")
        return
    missing = [
        r["destination"]
        for r in redirects
        if not (dist / r["destination"].strip("/") / "index.html").exists()
    ]
    if missing:
        fail(f"redirect destinations have no shell in dist: {missing}")
    else:
        ok(f"all {len(redirects)} redirect destinations exist in dist")


# The 2026-08-13 facecards were invisible in production for five days because the
# CSP did not name cdn.nba.com and the component's onError fallback made a total
# block look like flaky bot-detection. So this is mechanical now: every host that
# appears in a shipped headshot map must appear in img-src.
def check_headshots():
    print("9. headshots: declared maps exist, every host is in the CSP")
    reg = (SITE / "src" / "leagues.ts").read_text()
    active = re.search(r"ACTIVE_LEAGUES:\s*League\[\]\s*=\s*\[(.*?)\]", reg, re.S)
    leagues = re.findall(r'"([A-Z]+)"', active.group(1)) if active else []
    mapped = []
    for lg in leagues:
        block = re.search(rf'{lg}:\s*{{(.*?)\n  }},', reg, re.S)
        if block and 'headshots: "map"' in block.group(1):
            mapped.append(lg)
    missing = [lg for lg in mapped if not (PUBLIC / f"headshots-{lg}.json").exists()]
    if missing:
        fail(f"leagues declare headshots:\"map\" but have no map file: {missing}")
        return
    ok(f"{len(mapped)} league(s) declare a headshot map and all are present")

    csp = json.loads((SITE / "vercel.json").read_text())["headers"][0]["headers"][0]["value"]
    img_src = re.search(r"img-src[^;]*", csp).group(0)
    hosts, low = set(), []
    for lg in mapped:
        d = json.loads((PUBLIC / f"headshots-{lg}.json").read_text())
        cov = d["meta"]["coverage"]
        if cov < 0.5:
            low.append(f"{lg} {cov:.0%}")
        for u in d["urls"].values():
            hosts.add(urlparse(u).netloc)
    absent = sorted(h for h in hosts if h not in img_src)
    if absent:
        fail(f"headshot hosts missing from CSP img-src: {absent} — the images "
             f"would be blocked and the fallback would hide it")
    else:
        ok(f"all {len(hosts)} headshot hosts are allowed by img-src")
    if low:
        warn(f"headshot coverage under 50%: {low}")


# A sitemap that silently loses a section, or that lists a page carrying
# noindex, is invisible to any HTTP check: every URL still answers 200.
def check_sitemaps():
    print("10. sitemaps, robots and feed")
    dist = SITE / "dist"
    if not dist.exists():
        warn("dist absent - run the build before the gate to check sitemaps")
        return
    index = dist / "sitemap.xml"
    if not index.exists():
        fail("no sitemap.xml")
        return
    idx = index.read_text()
    if "<sitemapindex" not in idx:
        fail("sitemap.xml is not an index")
        return
    parts = re.findall(r"<loc>[^<]*/(sitemap-[^<]+\.xml)</loc>", idx)
    if not parts:
        fail("sitemap index references no section files")
        return
    total, empty = 0, []
    listed = set()
    for name in parts:
        f = dist / name
        if not f.exists():
            fail(f"sitemap index references {name}, which does not exist")
            continue
        locs = re.findall(r"<loc>([^<]+)</loc>", f.read_text())
        if not locs:
            empty.append(name)
        total += len(locs)
        listed.update(locs)
    if empty:
        fail(f"empty sitemap section(s): {empty}")
    shells = sum(1 for _ in dist.rglob("index.html"))
    if total < shells * 0.9:
        fail(f"sitemaps list {total} urls against {shells} shells on disk; "
             f"a section is probably missing")
    else:
        ok(f"{len(parts)} sections, {total} urls, {shells} shells on disk")

    # A noindex page in a sitemap is a contradictory instruction.
    bad = []
    for f in dist.rglob("index.html"):
        h = f.read_text()
        if 'content="noindex' not in h:
            continue
        m = re.search(r'rel="canonical" href="([^"]+)"', h)
        if m and m.group(1) in listed:
            bad.append(m.group(1))
    if bad:
        fail(f"noindex pages listed in a sitemap: {bad[:4]}")
    else:
        ok("no noindex page appears in any sitemap")

    robots = (dist / "robots.txt")
    if not robots.exists() or "Sitemap:" not in robots.read_text():
        fail("robots.txt missing or does not point at the sitemap")
    else:
        ok("robots.txt points at the sitemap index")
    feed = dist / "feed.json"
    if not feed.exists():
        fail("no feed.json")
    else:
        items = json.loads(feed.read_text()).get("items", [])
        if not items:
            fail("feed.json has no items")
        else:
            ok(f"feed.json carries {len(items)} dated update(s)")


# JSON-LD is invisible to every HTTP check and to TypeScript: the values come
# from JSON at runtime. So assert the shapes in the built HTML, where they ship.
DATASET_REQUIRED = ["name", "description", "creator", "temporalCoverage",
                    "variableMeasured", "license", "distribution"]


def check_jsonld():
    print("11. JSON-LD shapes in the built HTML")
    dist = SITE / "dist"
    if not dist.exists():
        warn("dist absent - run the build before the gate to check JSON-LD")
        return
    samples = ["index.html", "data/index.html", "methodology/index.html",
               "leaderboard/NBA/shot-value/index.html",
               "league/NBA/free-throws/index.html", "referees/NBA/index.html",
               "player/NBA/1628983/index.html"]
    seen, bad, datasets = set(), [], 0
    for rel in samples:
        f = dist / rel
        if not f.exists():
            fail(f"expected page missing: {rel}")
            continue
        m = re.search(r'<script type="application/ld\+json">(.*?)</script>',
                      f.read_text(), re.S)
        if not m:
            fail(f"{rel}: no JSON-LD")
            continue
        try:
            graph = json.loads(m.group(1).replace("\\u003c", "<"))["@graph"]
        except Exception as e:
            fail(f"{rel}: JSON-LD does not parse ({e})")
            continue
        for node in graph:
            t = node.get("@type")
            seen.add(t)
            if t == "Dataset":
                datasets += 1
                missing = [k for k in DATASET_REQUIRED if k not in node]
                if missing:
                    bad.append(f"{rel}: Dataset missing {missing}")
                elif node["license"] != "https://creativecommons.org/licenses/by/4.0/":
                    bad.append(f"{rel}: Dataset license is not CC BY 4.0")
                elif not re.fullmatch(r"\d{4}/\d{4}", node["temporalCoverage"]):
                    bad.append(f"{rel}: temporalCoverage {node['temporalCoverage']!r} "
                               f"is not a year interval")
    for req in ("Organization", "WebSite", "Dataset", "DataCatalog",
                "BreadcrumbList", "Person", "FAQPage", "Article",
                "SportsOrganization"):
        if req not in seen:
            fail(f"no {req} found in the sampled pages")
    if bad:
        for b in bad[:5]:
            fail(b)
    else:
        ok(f"{datasets} Dataset node(s) carry every required field, CC BY 4.0, "
           f"real season coverage")
    ok(f"types present: {', '.join(sorted(t for t in seen if t))}")


# One canonical description of the site is the whole point of the constant. Two
# copies exist because generate-static.mjs cannot import a .ts file, so assert
# they are identical rather than trusting a comment to keep them so.
def check_site_line():
    print("12. the canonical site sentence is stated identically")
    ts = (SITE / "src" / "lib" / "site.ts").read_text()
    m = re.search(r'export const SITE_LINE =\s*\n?\s*"([^"]+)"', ts)
    if not m:
        fail("could not read SITE_LINE from src/lib/site.ts")
        return
    from_src = m.group(1)
    gen = (HERE / "generate-static.mjs").read_text()
    labels = re.search(r"const LEAGUE_LABEL = \{(.*?)\n\};", gen, re.S).group(1)
    label = dict(re.findall(r'(\w+):\s*"([^"]+)"', labels))
    order = re.findall(r'"([A-Z]+)"',
                       re.search(r"const LEAGUES = \[([^\]]*)\]", gen).group(1))
    rebuilt = ("Over Expected is a basketball shot-value platform covering "
               + ", ".join(label[lg] for lg in order) + ".")
    if rebuilt != from_src:
        fail(f"SITE_LINE differs:\n      src: {from_src}\n      gen: {rebuilt}")
    else:
        ok("src/lib/site.ts and the generator state the same sentence")
    dist = SITE / "dist"
    if dist.exists():
        f = dist / "leaderboard" / "NBA" / "shot-value" / "index.html"
        if f.exists() and from_src not in f.read_text():
            fail("the sentence is not present in a built page's static block")
        else:
            ok("the sentence appears in the prerendered content")


# Orphan and drift checks on the link graph. A sitemap URL with no shell is a
# 404 that the sitemap advertises; a glossary term with no inbound link is a page
# nothing can reach.
def check_link_graph():
    print("13. link graph: no advertised URL without a page, no orphan term")
    dist = SITE / "dist"
    if not dist.exists():
        warn("dist absent - run the build before the gate to check the link graph")
        return
    listed = []
    for f in dist.glob("sitemap-*.xml"):
        listed += re.findall(r"<loc>[^<]*?overexpected\.com([^<]*)</loc>", f.read_text())
    missing = [u for u in listed
               if not (dist / u.strip("/") / "index.html").exists() and u != "/"]
    if missing:
        fail(f"{len(missing)} sitemap url(s) have no page in dist, e.g. {missing[:3]}")
    else:
        ok(f"all {len(listed)} sitemap urls have a page on disk")

    index = dist / "glossary" / "index.html"
    if not index.exists():
        fail("no /glossary index page")
        return
    terms = json.loads((SITE / "src" / "content" / "glossary.json").read_text())["terms"]
    html = index.read_text()
    orphans = [t["slug"] for t in terms if f"/glossary/{t['slug']}" not in html]
    if orphans:
        fail(f"glossary terms not linked from the index: {orphans[:4]}")
    else:
        ok(f"the index links all {len(terms)} glossary terms")

    # Every section has to be reachable inside the app, not only from a
    # prerendered block, or a human can never navigate to it.
    tsx = "\n".join(f.read_text() for f in (SITE / "src").rglob("*.tsx"))
    orphan_sections = [h for h in ("/glossary", "/metrics", "/changelog", "/about")
                       if f'to="{h}"' not in tsx]
    if orphan_sections:
        fail(f"nothing in the app links to {orphan_sections}; orphaned section(s)")
    else:
        ok("glossary, comparisons, changelog and about are all reachable in-app")

    # Comparisons must each name a glossary term that exists, or the "definitions"
    # link at the foot of the page goes nowhere.
    comps = json.loads((SITE / "src" / "content" / "comparisons.json").read_text())
    slugs = {t["slug"] for t in terms}
    bad_ref = [c["slug"] for c in comps["comparisons"]
               if c["ours"] not in slugs
               or (c.get("oursAlt") and c["oursAlt"] not in slugs)]
    if bad_ref:
        fail(f"comparison pages reference a missing glossary term: {bad_ref}")
    else:
        ok(f"all {len(comps['comparisons'])} comparisons reference real terms")

    # Player pages carry a related block built from nearest neighbours; spot-check
    # that it rendered rather than silently collapsing to an empty string.
    sample = dist / "player" / "NBA" / "1628983" / "index.html"
    if sample.exists() and "Closest to" not in sample.read_text():
        fail("player pages carry no related-players block")
    elif sample.exists():
        ok("player pages carry a data-derived related block")


def check_static_bodies():
    """An indexable page must ship visible content, and its content must not be
    another indexable page's content.

    Both halves of this were live on overexpected.com and returned HTTP 200 the
    whole time. Seventeen sitemap-listed routes were shelled without a static
    block, so their served body was an empty <div id="root">; to any crawl that
    does not execute JavaScript they were one page repeated seventeen times, and
    Google collapsed them onto a canonical of its own choosing (Search Console:
    "Duplicate, Google chose different canonical than user"). Nine of them, the
    per-league /calibration pages, were byte-identical apart from a league name
    in the <title>.

    The exact-duplicate half deliberately allows the dated/evergreen twins: those
    are the same page at two URLs on purpose, and the dated one canonicals to the
    season-less one.
    """
    print("14. static bodies are present and distinct")
    dist = SITE / "dist"
    if not dist.exists():
        warn("dist absent - run the build before the gate to check static bodies")
        return

    pages = {}
    for f in dist.rglob("index.html"):
        h = f.read_text()
        if 'content="noindex' in h:
            continue
        url = "/" + str(f.relative_to(dist).parent).replace(".", "").strip("/")
        i, j = h.find('<div id="oe-static"'), h.find('<div id="root">')
        pages[url] = h[i:j] if 0 <= i < j else ""

    empty = sorted(u for u, b in pages.items() if not b.strip())
    if empty:
        fail(f"{len(empty)} indexable page(s) ship no static body, so they are "
             f"one duplicate cluster to a non-rendering crawler: {empty[:6]}")
    else:
        ok(f"all {len(pages)} indexable pages ship a static body")

    groups = collections.defaultdict(list)
    for url, body in pages.items():
        if body.strip():
            groups[hashlib.md5(body.encode()).hexdigest()].append(url)
    # A cluster is expected when its members differ only by a season segment
    # (/leaderboard/NBA/shot-value and /leaderboard/NBA/2025-26/shot-value) or
    # a week's date (/weekly and /weekly/2026-10-12, the latest week).
    season = re.compile(r"/\d{4}-\d{2}(?:-\d{2})?(?=/|$)")
    bad = [
        sorted(v) for v in groups.values()
        if len(v) > 1 and len({season.sub("", u) for u in v}) > 1
    ]
    if bad:
        fail(f"{len(bad)} set(s) of distinct indexable URLs ship identical "
             f"bodies: {bad[:3]}")
    else:
        twins = sum(len(v) for v in groups.values() if len(v) > 1)
        ok(f"no unintended identical bodies ({twins} dated/evergreen twins)")


def check_tests():
    print("5. never-skip test suites")
    for label, cwd, target in (
            ("NBA_OE (contract, BR guard, hindsight)", NBA_OE, "tests/"),
            ("calibration (privileged/post-shot regression)", CALIB, "tests/")):
        if not (cwd / "tests").exists():
            warn(f"{label}: no tests directory at {cwd}")
            continue
        r = subprocess.run(
            ["/opt/homebrew/bin/python3.9", "-m", "pytest", target, "-q"],
            cwd=cwd, capture_output=True, text=True)
        tail = (r.stdout or r.stderr).strip().splitlines()[-1:] or ["no output"]
        if r.returncode != 0:
            fail(f"{label}: {tail[0]}")
        else:
            ok(f"{label}: {tail[0]}")


def check_archive_index():
    """15. An archive era's index in the live file matches the archive it
    describes. The front end decides from the index alone whether a season,
    player or official needs the archive, so a stale index means a page that
    waits for data that is not there (or never asks for data that is), with
    every URL still returning 200."""
    print("15. archive index matches its archive")
    found = False
    for core in sorted(PUBLIC.glob("data-*.json")):
        if core.stem.endswith("-archive"):
            continue
        idx = json.loads(core.read_text())["meta"].get("archive")
        if not idx:
            continue
        found = True
        code = core.stem[len("data-"):]
        path = PUBLIC / f"data-{code}-archive.json"
        if not path.exists():
            fail(f"{code}: index present but {path.name} missing")
            continue
        arch = json.loads(path.read_text())
        live = json.loads(core.read_text())["meta"]["seasons"]
        problems = []
        if idx["seasons"] != arch["meta"]["seasons"]:
            problems.append("seasons differ")
        if set(idx["seasons"]) & set(live):
            problems.append("an archive season is also a live season")
        if {p[0] for p in idx["players"]} != {r["id"] for r in arch["leaderboard"] if r["pct"] is not None}:
            problems.append("players differ")
        if set(idx["refs"]) != set(arch["refProfiles"]):
            problems.append("officials differ")
        if idx["refSeasons"] != sorted(s for s, rows in arch["referees"].items() if rows):
            problems.append("referee seasons differ")
        missing = [s for s in idx["seasons"] if not (PUBLIC / f"players-{code}-{s}.json").exists()]
        if missing:
            problems.append(f"no player chunk for {missing}")
        if problems:
            fail(f"{code} archive: " + "; ".join(problems))
        else:
            ok(f"{code} archive: {len(idx['seasons'])} seasons, {len(idx['players'])} players, "
               f"{len(idx['refs'])} officials, index and file agree")
    if not found:
        ok("no league ships an archive")


def check_shot_samples():
    """16. Every season a league lists, archive included, has its homepage
    shot sample. The hero draws behind the title from it; a missing file
    leaves that season's hero bare while the page still returns 200."""
    print("16. homepage shot samples")
    for core in sorted(PUBLIC.glob("data-*.json")):
        if core.stem.endswith("-archive"):
            continue
        code = core.stem[len("data-"):]
        meta = json.loads(core.read_text())["meta"]
        seasons = meta["seasons"] + (meta.get("archive") or {}).get("seasons", [])
        missing = [s for s in seasons if not (PUBLIC / f"shots-{code}-{s}.json").exists()]
        if missing:
            fail(f"{code}: no shot sample for {missing}")
            continue
        bad = []
        for s in seasons:
            d = json.loads((PUBLIC / f"shots-{code}-{s}.json").read_text())
            if not (len(d["x"]) == len(d["y"]) == len(d["m"]) > 0):
                bad.append(s)
        if bad:
            fail(f"{code}: x, y and m lengths disagree or are empty in {bad}")
        else:
            ok(f"{code}: {len(seasons)} seasons sampled")


def check_game_pages():
    """17. Every season a league lists, archive included, has its games
    index, every index row's week names a chunk that holds that game, and the
    two pipelines' copies of games.py are identical. A game page opens its
    index first and its week chunk second; a missing season or a row pointing
    at a chunk without it is a page that loads, then finds nothing, with every
    URL still returning 200. games.py holds the expected-score, win-share and
    calibration code both export_games.py scripts import, and a copy that
    drifted would put the NBA's win shares and the other leagues' on
    different definitions."""
    print("17. game pages")
    a, b = NBA_OE / "games.py", OE / "Euro_OE" / "games.py"
    if a.read_bytes() == b.read_bytes():
        ok("NBA_OE/games.py and Euro_OE/games.py are identical")
    else:
        fail("NBA_OE/games.py and Euro_OE/games.py differ")
    chunks: dict = {}

    def chunk_ids(code, wk):
        key = (code, wk)
        if key not in chunks:
            path = PUBLIC / f"gameweek-{code}-{wk}.json"
            chunks[key] = set(json.loads(path.read_text())["games"]) if path.exists() else None
        return chunks[key]

    for core in sorted(PUBLIC.glob("data-*.json")):
        if core.stem.endswith("-archive"):
            continue
        code = core.stem[len("data-"):]
        meta = json.loads(core.read_text())["meta"]
        seasons = meta["seasons"] + (meta.get("archive") or {}).get("seasons", [])
        missing = [s for s in seasons if not (PUBLIC / f"games-{code}-{s}.json").exists()]
        if missing:
            fail(f"{code}: no games index for {missing}")
            continue
        n_games, no_chunk, no_game = 0, set(), []
        for s in seasons:
            for row in json.loads((PUBLIC / f"games-{code}-{s}.json").read_text())["games"]:
                n_games += 1
                ids = chunk_ids(code, row["wk"])
                if ids is None:
                    no_chunk.add(row["wk"])
                elif row["id"] not in ids:
                    no_game.append(f"{s} {row['id']}")
        if no_chunk:
            fail(f"{code}: {len(no_chunk)} week chunk(s) missing, e.g. {sorted(no_chunk)[:3]}")
        if no_game:
            fail(f"{code}: {len(no_game)} indexed game(s) absent from their chunk, e.g. {no_game[:3]}")
        if not (no_chunk or no_game):
            ok(f"{code}: {len(seasons)} seasons, {n_games} games, every one in its week chunk")


def check_og_envelope():
    print("6. OG-card envelope")
    dist_og = SITE / "dist" / "og"
    if not dist_og.exists():
        warn("dist/og absent — run the build before the gate to check this")
        return
    n = len(list(dist_og.glob("*.png")))
    if n > OG_CARD_CEILING:
        fail(f"{n} OG cards exceeds the {OG_CARD_CEILING} local-prebuild ceiling; "
             f"switch to incremental/cached generation")
    else:
        ok(f"{n} OG cards, under the {OG_CARD_CEILING} ceiling")


def main():
    print("=== pre-deploy gate ===")
    check_json_values()
    check_privileged_flags()
    check_unavailable_flags()
    check_registry_layer_files()
    check_row_shapes()
    check_routing_contract()
    check_headshots()
    check_sitemaps()
    check_jsonld()
    check_site_line()
    check_link_graph()
    check_static_bodies()
    check_tests()
    check_og_envelope()
    check_archive_index()
    check_shot_samples()
    check_game_pages()

    print()
    if failures:
        print(f"GATE FAILED: {len(failures)} problem(s)")
        for f in failures:
            print(f"  - {f}")
        return 1
    if warnings:
        print(f"GATE PASSED with {len(warnings)} warning(s)")
        for w in warnings:
            print(f"  - {w}")
    else:
        print("GATE PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
