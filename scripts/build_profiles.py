"""Shot profiles for cross-league similarity -> public/profiles.json.

A player's profile is how he plays, built from the JSON every league already
ships, so any two players in any two leagues can be compared:

  diet    share of his field-goal attempts at the rim, in the paint, from
          mid-range, from the corners and above the break
  volume  attempts per 100 possessions he finished
  skill   shot-making and foul-drawing as percentiles within his own
          league-season (the raw figures are measured against different
          leagues, so only the rank travels), and his free-throw percentage

Each feature is standardised over every qualified player-season and weighted
(diet 1.2, volume 1.5, shot-making and foul-drawing 0.8, FT% 1.0); similarity is
distance in that space, computed in the browser.

The test, rerun on every build: a player who played EuroLeague and a domestic
league in the same season is the same player twice, so his EuroLeague season
should rank near the top of his domestic season's matches. Measured 2026-10-22:
median rank 7 of ~147 EuroLeague candidates, top 5 for 46% of players, top 10%
for 69% (chance: 10%). The weights were the best of five settings on it.

Ships one row per player: his latest qualified season, which is the season his
player page opens on.
"""
import json
import re
import unicodedata
from pathlib import Path

import numpy as np
import pandas as pd

GROUP = {"Restricted Area": "rim", "In The Paint (Non-RA)": "paint",
         "Mid-Range": "mid", "Left Corner 3": "c3", "Right Corner 3": "c3",
         "Above the Break 3": "ab3"}
DIET = ["rim", "paint", "mid", "c3", "ab3"]
FEATURES = DIET + ["fga100", "make_p", "foul_p", "ft"]
WEIGHTS = [1.2] * 5 + [1.5, 0.8, 0.8, 1.0]
DOMESTIC = ["ACB", "LBA", "BBL", "ABA", "GBL"]


def _key(name):
    n = unicodedata.normalize("NFKD", str(name)).encode("ascii", "ignore")
    return " ".join(sorted(re.sub(r"[^a-z ]", " ", n.decode().lower()).split()))


def _profiles(public: Path, leagues) -> pd.DataFrame:
    rows = []
    for lg in leagues:
        d = json.loads((public / f"data-{lg}.json").read_text())
        for season, svs in d["shotValue"].items():
            f = public / f"players-{lg}-{season}.json"
            if not f.exists():
                continue
            chunk = json.loads(f.read_text())
            for r in svs:
                z = [x for x in chunk.get(r["id"], {}).get("zones", [])
                     if x["zone"] in GROUP]
                tot = sum(x["n"] for x in z)
                if not tot or not r["poss"]:
                    continue
                sh = dict.fromkeys(DIET, 0.0)
                for x in z:
                    sh[GROUP[x["zone"]]] += x["n"] / tot
                rows.append({"lg": lg, "season": season, "id": r["id"],
                             "name": r["name"], "team": " / ".join(r["teams"]),
                             "fga100": r["fga"] / r["poss"] * 100,
                             "make": r["makeOE"], "foul": r["ftaoe100"],
                             "ft": r["ftPct"], **sh})
    df = pd.DataFrame(rows)
    g = df.groupby(["lg", "season"])
    df["make_p"] = g["make"].rank(pct=True)
    df["foul_p"] = g["foul"].rank(pct=True)
    return df


def _test(df: pd.DataFrame, Z: pd.DataFrame) -> dict:
    """Rank each same-season EuroLeague/domestic player's EuroLeague season
    among that season's EuroLeague candidates, by distance from his domestic
    season. Names shared by two players in one league-season are dropped."""
    df = df.assign(key=df.name.map(_key))
    amb = df.groupby(["lg", "season", "key"]).id.transform("nunique") > 1
    ranks, sizes = [], []
    for (lg, season), dom in df[~amb & df.lg.isin(DOMESTIC)].groupby(["lg", "season"]):
        el = df[~amb & (df.lg == "EL") & (df.season == season)]
        if el.empty:
            continue
        el_by_key = dict(zip(el.key, el.index))
        for i, key in zip(dom.index, dom.key):
            j = el_by_key.get(key)
            if j is None:
                continue
            dist = np.sqrt(((Z.loc[el.index] - Z.loc[i]) ** 2).sum(axis=1))
            ranks.append(int((dist < dist.loc[j]).sum()) + 1)
            sizes.append(len(el))
    r, n = np.array(ranks), np.array(sizes)
    return {"pairs": int(len(r)), "medianRank": int(np.median(r)),
            "medianField": int(np.median(n)),
            "top5": round(float(np.mean(r <= 5)), 3),
            "top10pct": round(float(np.mean(r / n <= 0.10)), 3)}


def build(public: Path, leagues) -> int:
    df = _profiles(public, leagues)
    Z = (df[FEATURES] - df[FEATURES].mean()) / df[FEATURES].std() * WEIGHTS
    test = _test(df, Z)

    # one row per player: his latest qualified season
    latest = df.sort_values("season").groupby(["lg", "id"]).tail(1)
    default = {lg: json.loads((public / f"data-{lg}.json").read_text())
               ["meta"]["defaultSeason"] for lg in leagues}
    rows = []
    for i, r in latest.iterrows():
        seasons = sorted(df[df.lg == r.lg].season.unique())
        recent = seasons[max(0, seasons.index(default[r.lg]) - 1):]
        rows.append([
            r.lg, r.id, r["name"], r.season, r.team,  # r.name is the index
            1 if r.season in recent else 0,
            [round(float(v), 2) for v in Z.loc[i]],
            [round(r.rim, 3), round(r.mid, 3), round(r.c3 + r.ab3, 3),
             round(r.make_p, 3), round(r.foul_p, 3), round(r.fga100, 1)],
        ])
    (public / "profiles.json").write_text(json.dumps({
        "features": FEATURES, "weights": WEIGHTS, "test": test,
        "rows": rows}, separators=(",", ":"), ensure_ascii=False))
    print(f"profiles.json: {len(rows)} players; same-player test: median rank "
          f"{test['medianRank']} of ~{test['medianField']}, top 5 "
          f"{test['top5']:.0%}, top 10% {test['top10pct']:.0%} "
          f"({test['pairs']} pairs)")
    return len(rows)
