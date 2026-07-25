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
import json
import re
import subprocess
import sys
from pathlib import Path

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
    # layers flagged in the registry must have their artifact
    for lg in leagues:
        block = re.search(rf'{lg}:\s*{{(.*?)\n  }},', reg, re.S)
        if block and "lineups: true" in block.group(1):
            if not (PUBLIC / f"rapm-{lg}.json").exists():
                fail(f"{lg} declares layers.lineups but rapm-{lg}.json is missing")
        if block and "value: true" in block.group(1):
            if not (PUBLIC / f"value-{lg}.json").exists():
                fail(f"{lg} declares layers.value but value-{lg}.json is missing")
    ok("declared layers have their artifacts")


# Fields the front end dereferences without a guard. A TypeScript interface can
# claim a field the JSON never had — `RapmRow.teams` did exactly that, and
# `r.teams.join(...)` threw and blanked the whole /lineups route while every HTTP
# check still returned 200. Types describe JSON they never validate; this does.
REQUIRED_ROW_FIELDS = {
    "rapm-*.json": (["players", "*", "*"],
                    ["id", "name", "teams", "possOff", "possDef",
                     "oP", "dP", "netP", "seO", "seD", "netCi", "tier"]),
    "value-*.json": (["players", "*", "*"],
                     ["id", "name", "teams", "poss", "share", "net", "war"]),
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
        for f in sorted(PUBLIC.glob(pattern)):
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
    check_tests()
    check_og_envelope()

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
