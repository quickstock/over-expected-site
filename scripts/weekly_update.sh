#!/bin/bash
# Over Expected weekly update. Pulls every league's new games, rebuilds both
# pipelines (NBA_OE with its four layers, Euro_OE for the other eight leagues),
# assembles the combined site, builds it locally, gates it, and deploys the
# prebuilt output. Run by launchd every Monday
# (~/Library/LaunchAgents/com.ftaoe.weekly.plist).
#
# Failure policy: a network pull never blocks. Pulls are idempotent, so a game
# that failed (rate limit, flaky feed) is retried next week; the error is
# emailed as a warning. Any build, model, validation or gate failure stops the
# run before the deploy and emails; the site keeps serving the last good build.
#
#   site/scripts/weekly_update.sh           normal run
#   site/scripts/weekly_update.sh --force   rebuild even if no new games came in
set -u
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"

SITE="$(cd "$(dirname "$0")/.." && pwd)"
OE="$(dirname "$SITE")"
NBA="$OE/NBA_OE"
EURO="$OE/Euro_OE"
PY="/opt/homebrew/bin/python3.9"
MIN_FREE_GB=5

mkdir -p "$SITE/logs"
exec >> "$SITE/logs/weekly.log" 2>&1
echo ""
echo "=== $(date '+%Y-%m-%d %H:%M:%S') weekly update ==="

# A PID lock rather than a lock directory: a run killed mid-way (crash, power,
# SIGTERM skips the EXIT trap) must not leave a lock that silently skips every
# later week. The PID only counts if it is still this script, since macOS
# reuses PIDs.
LOCK="/tmp/oe_weekly.pid"
if [ -f "$LOCK" ] && ps -p "$(cat "$LOCK")" -o command= 2>/dev/null | grep -q weekly_update.sh; then
  echo "run $(cat "$LOCK") still in progress; exiting"
  exit 0
fi
echo $$ > "$LOCK"
trap 'rm -f "$LOCK"' EXIT
# Hold off idle sleep (and, on AC power, system sleep) for as long as this run
# lives. Nothing can hold off lid-close sleep on battery: a closed lid stalls
# the run, and the next network call fails it before anything is deployed.
caffeinate -i -s -w $$ &

WARNINGS=""

email() {
  curl -s -X POST "https://formsubmit.co/ajax/kevinkrajnc@gmail.com" \
    -H "Content-Type: application/json" \
    -H "Origin: https://overexpected.com" \
    -H "Referer: https://overexpected.com/" \
    -d "{\"_subject\":\"$1\",\"message\":\"$2 Log: $SITE/logs/weekly.log on $(hostname).\"}" \
    > /dev/null || true
}

fail() {
  echo "FAILED: $1"
  email "Over Expected weekly update FAILED" \
    "Step failed: $1 ($(date '+%Y-%m-%d %H:%M')). Nothing was deployed; the site keeps serving the last good build.${WARNINGS:+ Pull warnings:$WARNINGS}"
  exit 1
}

# A build, model, validation or deploy step: failure stops the run.
step() {
  local name="$1"; shift
  echo "--- $name $(date '+%H:%M:%S')"
  "$@" || fail "$name"
}

# A network pull: failure is a warning and the pull is retried next week.
pull() {
  local name="$1"; shift
  echo "--- $name $(date '+%H:%M:%S')"
  if ! "$@"; then
    echo "WARNING: $name had errors; retried next week"
    WARNINGS="$WARNINGS $name;"
  fi
}

games_cached() { find "$NBA/cache/pbp" "$EURO/cache" -type f | wc -l | tr -d ' '; }

FREE_GB="$(df -g "$OE" | awk 'NR==2 {print $4}')"
[ "$FREE_GB" -ge "$MIN_FREE_GB" ] || fail "disk check (${FREE_GB} GB free, need ${MIN_FREE_GB})"

cd "$NBA"
NBA_SEASON="$($PY -c 'from config import SEASONS; print(SEASONS[-1])')" || fail "read NBA season"
cd "$EURO"
EURO_SEASON="$($PY -c 'import config; print(config.SEASONS[-1])')" || fail "read Euro season"
EURO_LEAGUES="$($PY -c 'import config; print(" ".join(config.LEAGUES))')" || fail "read Euro leagues"
echo "current seasons: NBA $NBA_SEASON, Euro $EURO_SEASON ($EURO_LEAGUES)"

# ---------------------------------------------------------------- pulls
BEFORE="$(games_cached)"

cd "$NBA"
# Refreshes the NBA game list and counts completed games not yet pulled. The
# NBA pull refetches every current-season shot chart, so skip it when idle.
NEW_NBA="$($PY scripts/check_new_games.py)" || { NEW_NBA=0; WARNINGS="$WARNINGS NBA check_new_games;"; }
echo "new NBA games: $NEW_NBA"
if [ "$NEW_NBA" != "0" ]; then
  pull "NBA pull" $PY pull.py --season "$NBA_SEASON"
fi

cd "$EURO"
for lg in $EURO_LEAGUES; do
  pull "$lg pull" $PY pull.py --league "$lg" --season "$EURO_SEASON"
done

AFTER="$(games_cached)"
echo "cached game files: $BEFORE -> $AFTER"
if [ "$AFTER" = "$BEFORE" ] && [ "${1:-}" != "--force" ]; then
  echo "no new games anywhere; nothing to rebuild"
  if [ -n "$WARNINGS" ]; then
    email "Over Expected weekly update: pull warnings" \
      "No new games came in, so nothing was rebuilt. Pull errors:$WARNINGS"
  fi
  exit 0
fi

# ---------------------------------------------------------------- NBA base
cd "$NBA"
step "NBA build tables"        $PY build_tables.py
step "NBA game meta"           $PY scripts/pull_game_meta.py
step "NBA tracking exposures"  $PY scripts/pull_tracking_exposures.py
step "NBA possessions"         $PY build_possessions_v3.py
step "NBA possession target"   $PY build_possession_target_v3.py
step "NBA training features"   $PY build_training_possessions_v2.py
step "NBA score margin"        $PY backfill_score_margin.py
step "NBA train xFTA"          $PY train_possession_v4_context.py
step "NBA diet expectation"    $PY build_diet_expected.py
step "NBA FTAOE board"         $PY build_possession_leaderboard_clean.py
step "NBA style baseline"      $PY build_style_adjusted.py
step "NBA player FT%"          $PY build_player_ft.py
step "NBA shot value"          $PY shot_value.py
step "NBA per-shot xFG"        $PY build_shots_xfg.py
step "NBA export"              $PY export_site_data.py
step "NBA EXPORT GATE"         $PY scripts/validate_export.py
step "NBA weekly post"         $PY export_weekly.py
step "NBA shot sample"         $PY export_shots.py

# ---------------------------------------------------------------- NBA layers
# Rotations are optional (build_stints falls back to the pbp sub timeline)
# and the endpoint is throttled, so only the current season, as a pull.
pull "NBA rotations"           $PY pull_rotations.py --season "$NBA_SEASON"
step "NBA box per 100"         $PY pull_box_per100.py
step "NBA stints"              $PY build_stints.py
step "NBA RAPM"                $PY train_rapm.py
step "NBA lineups"             $PY build_lineups.py
step "NBA RAPM export"         $PY export_rapm.py
step "NBA RAPM GATE"           $PY scripts/validate_rapm.py
step "NBA value"               $PY build_value.py
step "NBA value export"        $PY export_value.py
step "NBA win probability"     $PY build_winprob.py
step "NBA decision EV"         $PY build_etm.py
step "NBA decision EV export"  $PY export_etm.py
step "NBA team defence"        $PY build_team_defense.py
step "NBA team defence export" $PY export_defense.py

# ---------------------------------------------------------------- Euro
cd "$EURO"
step "Euro build tables"       $PY build_tables.py
step "Euro possessions"        $PY build_possessions.py
step "Euro diet expectation"   $PY build_diet_expected.py
step "Euro train xFTA"         $PY train_xfta.py
step "Euro shot value"         $PY shot_value.py
step "Euro EL translation"     $PY build_translation.py
step "Euro VALIDATION GATE"    $PY validate.py
step "Euro export"             $PY export_site_data.py
step "Euro weekly post"        $PY export_weekly.py
step "Euro shot sample"        $PY export_shots.py
pull "Euro headshots"          $PY pull_headshots.py

# ---------------------------------------------------------------- site
cd "$SITE"
step "sync data"               $PY scripts/sync_data.py
step "vercel build"            vercel build --prod --yes
step "PREDEPLOY GATE"          $PY scripts/predeploy_gate.py
# The first prebuilt deploy of a session has twice come back a bare "Not
# authorized" (2026-10-22) and the immediate retry succeeded both times.
deploy() {
  vercel deploy --prebuilt --prod --archive=tgz --yes \
    || { sleep 10; vercel deploy --prebuilt --prod --archive=tgz --yes; }
}
step "deploy"                  deploy

# The deploy reported success; confirm the live site serves this build's data.
# Byte comparison, so a failed fetch counts as a mismatch. (It compared md5
# sums until 2026-10-29, but md5 lives in /sbin, off this PATH: both sums came
# out empty, matched, and the check passed without checking anything.)
LIVE=""
for attempt in 1 2 3 4 5; do
  curl -sf https://overexpected.com/data-NBA.json | cmp -s - public/data-NBA.json && { LIVE=1; break; }
  sleep 30
done
if [ -z "$LIVE" ]; then
  echo "FAILED: live data-NBA.json does not match this build"
  email "Over Expected weekly update: deploy not live" \
    "The deploy reported success but overexpected.com/data-NBA.json does not match the new build after 5 checks.${WARNINGS:+ Pull warnings:$WARNINGS}"
  exit 1
fi
echo "live site serves this build"

if [ -n "$WARNINGS" ]; then
  email "Over Expected weekly update: deployed with pull warnings" \
    "Deployed. These pulls had errors and are retried next week:$WARNINGS"
fi
echo "=== done $(date '+%H:%M:%S') ==="
