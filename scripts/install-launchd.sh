#!/bin/zsh
# Installs the dashboard as a launchd agent on macOS (runs at login, restarts on crash),
# plus an optional agent that keeps it up to date with origin/main.
#
# Usage: ./scripts/install-launchd.sh                    # run at login
#        PD_AUTO_UPDATE=1 ./scripts/install-launchd.sh   # …and track origin/main
#
# Auto-update is opt-in: it installs a second agent that polls your origin/main, hard-
# resets the deploy clone to it and restarts the server. Useful when you push from
# another machine and want the dashboard to follow; not something to switch on by
# surprise.
#
# Production runs from its own deploy clone rather than this working copy, so a
# half-finished checkout — a dirty tree, a WIP branch, a failed build — can't take down
# the dashboard your phone is looking at. Re-run this script after moving the repo, or
# to pick up changes to the scripts themselves.
set -euo pipefail

SRC_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ROOT="${PD_ROOT:-$HOME/.local/share/personal-dashboard}"
DEPLOY_DIR="$ROOT/repo"
STATE_DIR="$ROOT/state"

SERVER_LABEL="local.personal-dashboard"
UPDATE_LABEL="local.personal-dashboard-update"
SERVER_PLIST="$HOME/Library/LaunchAgents/$SERVER_LABEL.plist"
UPDATE_PLIST="$HOME/Library/LaunchAgents/$UPDATE_LABEL.plist"
LOG="$HOME/Library/Logs/personal-dashboard.log"
UPDATE_LOG="$HOME/Library/Logs/personal-dashboard-update.log"
UPDATE_INTERVAL="${PD_UPDATE_INTERVAL:-300}"

REMOTE="$(git -C "$SRC_DIR" remote get-url origin)"

# --- shared state ------------------------------------------------------------------
# .env, config.json, .tokens/ and .data/ are credentials and fetched data: gitignored,
# and the only thing here that can't be regenerated. They live in one directory that
# both checkouts symlink to, rather than being copied into each. Two independent copies
# would refresh the same OAuth grant from two places, and Spotify/Hue rotate refresh
# tokens on use — the second copy to refresh would get an invalidated token.
#
# Migration below only ever moves or links. It never deletes: if a file somehow exists
# in both places it is left alone for you to reconcile by hand.
echo "State → $STATE_DIR"
mkdir -p "$STATE_DIR"

for item in .env config.json .tokens .data; do
  src="$SRC_DIR/server/$item"
  dst="$STATE_DIR/$item"

  if [[ -L "$src" ]]; then
    continue                                   # already linked by an earlier run
  elif [[ -e "$src" && ! -e "$dst" ]]; then
    mv "$src" "$dst"                           # first run: adopt the working copy's state
    ln -s "$dst" "$src"
    echo "  moved server/$item → state, linked back"
  elif [[ -e "$dst" && ! -e "$src" ]]; then
    ln -s "$dst" "$src"
  elif [[ -e "$src" && -e "$dst" ]]; then
    echo "  ⚠️  server/$item exists in BOTH the working copy and $STATE_DIR — left as-is."
    echo "     Delete whichever is stale, then re-run."
  fi
done

# The server writes into these, so they must exist and be shared even on a fresh install
# where there was nothing to migrate. (After the loop: creating them earlier would look
# like a collision and block the migration above.)
mkdir -p "$STATE_DIR/.tokens" "$STATE_DIR/.data"
for item in .tokens .data; do
  src="$SRC_DIR/server/$item"
  if [[ ! -e "$src" && ! -L "$src" ]]; then
    ln -s "$STATE_DIR/$item" "$src"
  fi
done

# --- deploy clone ------------------------------------------------------------------
if [[ -d "$DEPLOY_DIR/.git" ]]; then
  echo "Updating deploy clone…"
  git -C "$DEPLOY_DIR" fetch --quiet origin main
  git -C "$DEPLOY_DIR" reset --quiet --hard origin/main
else
  echo "Cloning $REMOTE → $DEPLOY_DIR"
  git clone --quiet --branch main "$REMOTE" "$DEPLOY_DIR"
fi

for item in .env config.json .tokens .data; do
  if [[ -e "$STATE_DIR/$item" ]]; then
    ln -sfn "$STATE_DIR/$item" "$DEPLOY_DIR/server/$item"
  fi
done

echo "Installing dependencies and building…"
# --ignore-scripts: the auto-update agent reruns this unattended whenever main moves, so a
# dependency's postinstall would be arbitrary code executing on this machine on a timer.
# Nothing here needs lifecycle scripts — esbuild ships its binary as an optional dep.
(cd "$DEPLOY_DIR" && npm ci --silent --ignore-scripts && npm run build --silent)

# launchd runs a copy of the updater, not the one inside the deploy clone: the updater
# hard-resets that checkout, and a shell can't safely re-read a script that changed
# underneath it mid-run.
cp "$DEPLOY_DIR/scripts/self-update.sh" "$ROOT/self-update.sh"
chmod +x "$ROOT/self-update.sh"

# --- agents ------------------------------------------------------------------------
mkdir -p "$HOME/Library/LaunchAgents"

cat > "$SERVER_PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$SERVER_LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string>
    <string>-lc</string>
    <string>cd $DEPLOY_DIR &amp;&amp; exec npm start</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict>
</plist>
PLIST

launchctl unload "$SERVER_PLIST" 2>/dev/null || true
launchctl load "$SERVER_PLIST"
echo "✓ Dashboard agent installed ($SERVER_LABEL)"

if [[ -n "${PD_AUTO_UPDATE:-}" ]]; then
  cat > "$UPDATE_PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$UPDATE_LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string>
    <string>-lc</string>
    <string>exec $ROOT/self-update.sh</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>StartInterval</key><integer>$UPDATE_INTERVAL</integer>
  <key>StandardOutPath</key><string>$UPDATE_LOG</string>
  <key>StandardErrorPath</key><string>$UPDATE_LOG</string>
</dict>
</plist>
PLIST

  launchctl unload "$UPDATE_PLIST" 2>/dev/null || true
  launchctl load "$UPDATE_PLIST"
  echo "✓ Auto-update agent installed ($UPDATE_LABEL), every ${UPDATE_INTERVAL}s"
fi

echo
echo "  Dashboard:  http://localhost:4821"
echo "  Logs:       $LOG"
echo "  Update log: $UPDATE_LOG"
echo "  Stop:       launchctl unload $SERVER_PLIST $UPDATE_PLIST"
echo "  Phone:      tailscale serve 4821   # optional — HTTPS on your tailnet"
