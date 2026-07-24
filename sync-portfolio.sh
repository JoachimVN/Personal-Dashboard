#!/bin/bash
# Builds the demo client and syncs it to the Portfolio repo's projects/dashboard/ folder.
# Run from the Personal-Dashboard repo root. Mirrors Dart-Scores' sync-portfolio.sh.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORTFOLIO_DIR="${PORTFOLIO_DIR:-$HOME/GitHub/portfolio}"
DEST="$PORTFOLIO_DIR/projects/dashboard"

echo "Building..."
cd "$SCRIPT_DIR"
npm run build:demo -w client -- --base=/dashboard/

echo "Syncing to Portfolio..."
rm -rf "$DEST"
mkdir -p "$PORTFOLIO_DIR/projects"
cp -r "$SCRIPT_DIR/client/dist" "$DEST"

echo "Committing Portfolio..."
cd "$PORTFOLIO_DIR"
git add projects/dashboard/
git diff --staged --quiet || git commit -m "chore: sync Personal Dashboard"
git push

echo "Done. joavn.dev/dashboard updated."
