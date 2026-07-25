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


def build_core(code: str, src_dir: Path, core_name: str, is_int_ids: bool):
    src = src_dir / core_name
    if not src.exists():
        raise FileNotFoundError(f"{code}: missing core export {src}")
    data = json.loads(src.read_text())
    meta = data.setdefault("meta", {})
    meta["league"] = code
    if is_int_ids:
        stringify_nba_ids(data)
        meta.setdefault("leagueFt", NBA_LEAGUE_FT)
    out = PUBLIC / f"data-{code}.json"
    out.write_text(json.dumps(data, separators=(",", ":")))
    seasons = meta.get("seasons", [])
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
    print(f"done: {total_rows} leaderboard rows across leagues -> {PUBLIC}"
          f" (+{layers} layer files)")


if __name__ == "__main__":
    sys.exit(main())
