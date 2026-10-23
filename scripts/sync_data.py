#!/usr/bin/env python3
"""Assemble the combined site's data files.

Over Expected ships one site across many leagues. Each league exports the
same JSON contract from its own pipeline; this script collects those
exports into site/public under the league-suffixed names the front end
loads (data-{CODE}.json + players-{CODE}-{season}.json).

The only real transform is the NBA export, which predates the multi-league
contract: its player ids are integers and its meta lacks `league` /
`leagueFt`. We stringify every id (the front end keys routes and lookups on
string ids) and stamp the two missing meta fields. The European exports
already conform and are copied verbatim.

Run from anywhere; paths are resolved relative to this file. Re-run after
any league's pipeline refreshes.
"""
import json
import shutil
import sys
from pathlib import Path

from build_profiles import build as build_profiles

HERE = Path(__file__).resolve().parent
SITE = HERE.parent
OE = SITE.parent
PUBLIC = SITE / "public"

# league code -> (source public dir, source core filename, id is int)
_EURO = OE / "Euro_OE" / "site" / "public"
SOURCES = {
    "NBA": (OE / "NBA_OE" / "site" / "public", "data.json", True),
    "EL": (_EURO, "data-EL.json", False),
    "EUC": (_EURO, "data-EUC.json", False),
    "ACB": (_EURO, "data-ACB.json", False),
    "LBA": (_EURO, "data-LBA.json", False),
    "BBL": (_EURO, "data-BBL.json", False),
    "ABA": (_EURO, "data-ABA.json", False),
    "GBL": (_EURO, "data-GBL.json", False),
    "WNBA": (_EURO, "data-WNBA.json", False),
}

# Archive eras, built once and shipped apart from the live seasons: the NBA's
# 1997-98 to 2019-20 (NBA_OE/scripts/build_archive.sh). Every page loads every
# league's live file on boot, so 24 more seasons there would put ~1 MB on each
# first paint. The archive ships as data-{CODE}-archive.json, fetched the first
# time a page asks for one of its seasons, players or officials; the live file
# carries only the index that tells the front end when to ask.
ARCHIVES = {"NBA": (OE / "NBA_OE" / "site" / "public-archive", "data.json", True)}

# NBA's headline stat values drawn FTs at the league FT rate; the NBA
# pipeline hardcoded 0.77 in the front end rather than exporting it.
NBA_LEAGUE_FT = 0.77


def stringify_nba_ids(data: dict) -> dict:
    """In-place: coerce every player/official id to a string so the id is
    comparable to the string route params the front end uses."""
    for row in data.get("leaderboard", []):
        row["id"] = str(row["id"])
    for season_rows in data.get("shotValue", {}).values():
        for row in season_rows:
            row["id"] = str(row["id"])
    for season_rows in data.get("referees", {}).values():
        for row in season_rows:
            row["id"] = str(row["id"])
    # refProfiles keys are already JSON strings; nothing inside carries ids.
    return data


def read_core(code: str, src_dir: Path, core_name: str, is_int_ids: bool) -> dict:
    src = src_dir / core_name
    if not src.exists():
        raise FileNotFoundError(f"{code}: missing core export {src}")
    data = json.loads(src.read_text())
    meta = data.setdefault("meta", {})
    meta["league"] = code
    if is_int_ids:
        stringify_nba_ids(data)
        meta.setdefault("leagueFt", NBA_LEAGUE_FT)
    return data


def archive_index(arch: dict) -> dict:
    """What the live file needs to know about its archive without loading it:
    the seasons (for season pickers), the seasons with officials (the NBA's
    start in 2003-04), every player with a qualified archive season as [id,
    name, latest qualified archive season] (player pages, search: the same
    rows the live era gives pages to), and every official with an archive
    profile (referee pages)."""
    latest = {}
    for r in arch["leaderboard"]:
        if r["pct"] is None:
            continue
        if r["id"] not in latest or r["season"] > latest[r["id"]][2]:
            latest[r["id"]] = [r["id"], r["name"], r["season"]]
    return {
        "seasons": arch["meta"]["seasons"],
        "refSeasons": sorted(s for s, rows in arch["referees"].items() if rows),
        "players": sorted(latest.values()),
        "refs": sorted(arch.get("refProfiles", {})),
    }


def build_core(code: str, src_dir: Path, core_name: str, is_int_ids: bool):
    data = read_core(code, src_dir, core_name, is_int_ids)
    archive = ARCHIVES.get(code)
    if archive and (archive[0] / archive[1]).exists():
        arch = read_core(code, *archive)
        (PUBLIC / f"data-{code}-archive.json").write_text(
            json.dumps(arch, separators=(",", ":")))
        data["meta"]["archive"] = archive_index(arch)
        chunks = copy_players(code, archive[0], arch["meta"]["seasons"], archive[2])
        print(f"{code} archive: data-{code}-archive.json "
              f"({len(arch['leaderboard'])} rows, {len(arch['meta']['seasons'])} seasons)"
              f" + {chunks} player chunks")
    out = PUBLIC / f"data-{code}.json"
    out.write_text(json.dumps(data, separators=(",", ":")))
    seasons = data["meta"].get("seasons", [])
    return seasons, len(data.get("leaderboard", []))


def copy_players(code: str, src_dir: Path, seasons, is_int_ids: bool):
    n = 0
    for s in seasons:
        # NBA: players-{season}.json ; European: players-{CODE}-{season}.json
        src = src_dir / (
            f"players-{s}.json" if is_int_ids else f"players-{code}-{s}.json"
        )
        if not src.exists():
            print(f"  ! {code} {s}: no player chunk ({src.name}), skipped")
            continue
        dst = PUBLIC / f"players-{code}-{s}.json"
        # Player-chunk keys are JSON object keys (already strings) and the
        # SeasonDetail bodies carry no ids, so a byte copy is correct.
        shutil.copyfile(src, dst)
        n += 1
    return n


# Platform-layer artifacts (RAPM etc.): per-league files a layer's pipeline
# emits into its own site/public. Copied verbatim (ids already strings, no
# NBA-int transform) into the combined public/. A layer core file is
# league-specific; the per-season chunks are globbed alongside it.
_NBA_PUBLIC = OE / "NBA_OE" / "site" / "public"
LAYER_SOURCES = [
    # (glob for the core file, source dir, glob for per-season chunks)
    ("rapm-*.json", _NBA_PUBLIC, "lineups-*-*.json"),
    # value has no per-season chunks; the chunk glob matches nothing.
    ("value-*.json", _NBA_PUBLIC, "value-chunks-none-*.json"),
    # coaching (Layer 3) and team defence (Layer 4) are single files too.
    ("coaching-*.json", _NBA_PUBLIC, "coaching-chunks-none-*.json"),
    ("defense-*.json", _NBA_PUBLIC, "defense-chunks-none-*.json"),
    # headshot URL maps, one per league that has a resolvable photo source.
    # European exports only: NBA and WNBA faces come straight off their own CDNs
    # by player id and need no map.
    ("headshots-*.json", _EURO, "headshots-chunks-none-*.json"),
    # calibration is exported straight into site/public by the calibration
    # project, so it needs no copy step; listed here for the record only.
]


def copy_layers() -> int:
    n = 0
    for core_glob, src_dir, chunk_glob in LAYER_SOURCES:
        for core in sorted(src_dir.glob(core_glob)):
            shutil.copyfile(core, PUBLIC / core.name)
            n += 1
        for chunk in sorted(src_dir.glob(chunk_glob)):
            shutil.copyfile(chunk, PUBLIC / chunk.name)
            n += 1
    return n


def build_weekly() -> int:
    """The weekly shooting post. Each pipeline writes weekly-{LG}.json (a
    league's best and worst shooting games per Monday-keyed week); this
    assembles them into weekly-index.json (every week with its cross-league
    hottest and coldest game, small enough for the homepage) and one
    weekly-{week}.json per week with every league's lists."""
    for old in PUBLIC.glob("weekly-*.json"):
        old.unlink()
    by_week: dict = {}
    for src in sorted(_NBA_PUBLIC.glob("weekly-*.json")) + sorted(
            _EURO.glob("weekly-*.json")):
        f = json.loads(src.read_text())
        for week, w in f["weeks"].items():
            by_week.setdefault(week, {})[f["league"]] = w
    index = []
    for week in sorted(by_week, reverse=True):
        leagues = by_week[week]
        tagged = [dict(r, lg=lg) for lg, w in leagues.items()
                  for r in w["over"] + w["under"]]
        index.append({
            "week": week,
            "leagues": sorted(leagues),
            "games": sum(w["games"] for w in leagues.values()),
            "best": max(tagged, key=lambda r: r["oe"]),
            "worst": min(tagged, key=lambda r: r["oe"]),
        })
        (PUBLIC / f"weekly-{week}.json").write_text(json.dumps(
            {"week": week, "leagues": leagues}, separators=(",", ":"),
            ensure_ascii=False))
    (PUBLIC / "weekly-index.json").write_text(json.dumps(
        {"weeks": index}, separators=(",", ":"), ensure_ascii=False))
    return len(index)


def main():
    PUBLIC.mkdir(parents=True, exist_ok=True)
    total_rows = 0
    for code, (src_dir, core_name, is_int_ids) in SOURCES.items():
        if not (src_dir / core_name).exists():
            print(f"! {code}: {core_name} not found, skipped (not built yet)")
            continue
        seasons, rows = build_core(code, src_dir, core_name, is_int_ids)
        chunks = copy_players(code, src_dir, seasons, is_int_ids)
        total_rows += rows
        print(
            f"{code}: data-{code}.json ({rows} rows, {len(seasons)} seasons)"
            f" + {chunks} player chunks"
        )
    layers = copy_layers()
    weeks = build_weekly()
    build_profiles(PUBLIC, [c for c in SOURCES if (PUBLIC / f"data-{c}.json").exists()])
    print(f"done: {total_rows} leaderboard rows across leagues -> {PUBLIC}"
          f" (+{layers} layer files, {weeks} weekly posts)")


if __name__ == "__main__":
    sys.exit(main())
