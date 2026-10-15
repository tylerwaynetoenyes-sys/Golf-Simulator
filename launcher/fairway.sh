#!/bin/bash
# Fairway launcher: find a Python that can run the R10 bridge (3.10 or newer),
# make sure its environment is set up, then start the bridge and open the game.
# Called by the double-click launchers (Fairway.command, Fairway.app); safe to
# run by hand:  launcher/fairway.sh [--lan] [--mock] [--update]
#
# It never relies on `python` being on the PATH: a double-clicked app on macOS
# gets a bare PATH without Homebrew, and Apple's /usr/bin/python3 is 3.9, which
# is too old for the bridge.

set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BRIDGE="$ROOT/bridge"
VENV="${FAIRWAY_VENV:-$BRIDGE/venv}"
PORT="${FAIRWAY_PORT:-8765}"
URL="http://localhost:$PORT/"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH:/usr/sbin:/sbin"

GOLD=$'\033[38;2;230;201;131m'; DIM=$'\033[2m'; BOLD=$'\033[1m'; RED=$'\033[31m'; OFF=$'\033[0m'
say()  { printf '%s\n' "  $*"; }
fail() { printf '\n  %s%s%s\n\n' "$RED" "$*" "$OFF"; read -r -p "  Press Return to close." _; exit 1; }

banner() {
  clear 2>/dev/null
  printf '\n%s' "$GOLD"
  printf '  F A I R W A Y\n'
  printf '  %sA GOLF GAME%s\n\n' "$DIM" "$OFF"
}

# A Python that is 3.10 or newer, from the most to the least likely place.
find_python() {
  local c
  for c in /opt/homebrew/bin/python3.12 /opt/homebrew/opt/python@3.12/bin/python3.12 /opt/homebrew/bin/python3 \
           /usr/local/bin/python3.12 /usr/local/bin/python3 \
           "$(command -v python3.13 2>/dev/null)" "$(command -v python3.12 2>/dev/null)" \
           "$(command -v python3.11 2>/dev/null)" "$(command -v python3.10 2>/dev/null)" "$(command -v python3 2>/dev/null)"; do
    [ -n "$c" ] && [ -x "$c" ] || continue
    if "$c" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)' 2>/dev/null; then
      echo "$c"; return 0
    fi
  done
  return 1
}

venv_ok() {
  [ -x "$VENV/bin/python" ] && "$VENV/bin/python" -c 'import sys, bleak, websockets; sys.exit(0 if sys.version_info >= (3, 10) else 1)' 2>/dev/null
}

ensure_env() {
  venv_ok && return 0
  say "Setting up the bridge (first run, or after a Python update)…"
  local py; py="$(find_python)" || fail "Python 3.10 or newer is needed. Install it with:  brew install python@3.12"
  say "${DIM}using $("$py" --version 2>&1) at $py${OFF}"
  rm -rf "$VENV"
  "$py" -m venv "$VENV" || fail "Could not create the Python environment in bridge/venv."
  "$VENV/bin/python" -m pip install --quiet --upgrade pip >/dev/null 2>&1
  "$VENV/bin/python" -m pip install --quiet -r "$BRIDGE/requirements.txt" \
    || fail "Could not install the bridge's packages (bleak, websockets). Check the internet connection and try again."
  venv_ok || fail "The bridge environment is still not working. Run: launcher/fairway.sh --repair"
  say "Bridge ready."
}

update() {
  say "Updating from GitHub…"
  if ! git -C "$ROOT" diff --quiet || ! git -C "$ROOT" diff --cached --quiet; then
    say "${DIM}Local changes found; keeping them aside while updating (git stash).${OFF}"
    git -C "$ROOT" stash push -q -m "fairway-launcher $(date +%F_%T)" || fail "Could not set local changes aside."
  fi
  git -C "$ROOT" pull --ff-only || fail "Update failed. Check the internet connection, or ask for help with: git status"
  "$VENV/bin/python" -m pip install --quiet -r "$BRIDGE/requirements.txt" 2>/dev/null || true
  say "Up to date: $(git -C "$ROOT" log -1 --format='%h %s')"
}

# Is a Fairway bridge already answering on the port?
running() { curl -s --max-time 1 "$URL" 2>/dev/null | grep -q "<title>Fairway"; }
port_taken() { lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; }

LAN=0; MOCK=0; UPD=0; REPAIR=0
for a in "$@"; do
  case "$a" in
    --lan) LAN=1 ;; --mock) MOCK=1 ;; --update) UPD=1 ;; --repair) REPAIR=1 ;;
  esac
done

banner
[ "$REPAIR" = 1 ] && rm -rf "$VENV"
ensure_env
[ "$UPD" = 1 ] && update

if running && [ "$LAN" = 0 ]; then
  say "Fairway is already running. Opening the game."
  [ -n "${FAIRWAY_NO_OPEN:-}" ] || open "$URL"
  sleep 1; exit 0
fi
if port_taken; then
  if running; then
    say "Fairway is already running on this computer only. Stopping it to restart for Wi-Fi play…"
    pkill -f "r10bridge.*--port $PORT" 2>/dev/null; sleep 1
  else
    fail "Port $PORT is used by another program. Close it, or run: FAIRWAY_PORT=8766 launcher/fairway.sh"
  fi
fi

ARGS=(--port "$PORT")
[ -n "${FAIRWAY_NO_OPEN:-}" ] || ARGS+=(--open)
[ "$LAN" = 1 ] && ARGS+=(--lan)
[ "$MOCK" = 1 ] && ARGS+=(--mock --mock-shots 12)

if [ "$LAN" = 1 ]; then
  say "${BOLD}Friends on the same Wi-Fi can play at:${OFF}"
  for ip in $(ipconfig getifaddr en0 2>/dev/null) $(ipconfig getifaddr en1 2>/dev/null); do
    say "  ${GOLD}http://$ip:$PORT/${OFF}"
  done
  say "${DIM}(macOS may ask to allow incoming connections for Python: choose Allow.)${OFF}"
  echo
fi
say "Starting the R10 bridge. The game opens in your browser."
say "${DIM}Keep this window open while you play. Close it (or press Control-C) to stop.${OFF}"
echo
cd "$BRIDGE" && exec "$VENV/bin/python" -m r10bridge "${ARGS[@]}"
