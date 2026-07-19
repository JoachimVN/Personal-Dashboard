#!/bin/zsh
# Hard-resets the deploy clone to origin/main and restarts the dashboard, but only
# when main actually moved — so the phone picks up a merge to main without anyone
# touching the Mac. Polled by the local.personal-dashboard-update launchd agent.
#
# install-launchd.sh copies this next to the deploy clone and points launchd at the
# copy, not at this file: a run that git-resets the checkout out from under the shell
# executing it can read half of the old script and half of the new one. The copy is
# refreshed by re-running install-launchd.sh.
set -euo pipefail

ROOT="${PD_ROOT:-$HOME/.local/share/personal-dashboard}"
DEPLOY_DIR="$ROOT/repo"
LABEL="local.personal-dashboard"

cd "$DEPLOY_DIR"

git fetch --quiet origin main
local_sha="$(git rev-parse HEAD)"
remote_sha="$(git rev-parse origin/main)"

if [[ "$local_sha" == "$remote_sha" ]]; then
  exit 0
fi

echo "[$(date '+%Y-%m-%d %H:%M:%S')] main ${local_sha:0:7} → ${remote_sha:0:7}, updating"

# The deploy clone is disposable and never hand-edited, so a hard reset is the honest
# way to track main. Credentials and data are symlinks to the shared state dir and are
# gitignored, so they survive this untouched.
git reset --quiet --hard origin/main

# --ignore-scripts: this runs unattended on a timer, so a dependency's postinstall would be
# arbitrary code executing here whenever main moves. Nothing in the tree needs them.
npm ci --ignore-scripts
npm run build

launchctl kickstart -k "gui/$(id -u)/$LABEL"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] dashboard restarted on ${remote_sha:0:7}"

# Refresh the copy launchd runs, so a commit that changes this script reaches the next
# run instead of needing install-launchd.sh by hand. `mv` is an atomic rename: it swaps
# the directory entry while this shell keeps reading the old inode it already opened, so
# replacing the script mid-run is safe in a way that overwriting it in place is not.
if ! cmp -s "$DEPLOY_DIR/scripts/self-update.sh" "$ROOT/self-update.sh"; then
  cp "$DEPLOY_DIR/scripts/self-update.sh" "$ROOT/self-update.sh.new"
  chmod +x "$ROOT/self-update.sh.new"
  mv -f "$ROOT/self-update.sh.new" "$ROOT/self-update.sh"
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] updater refreshed itself"
fi
