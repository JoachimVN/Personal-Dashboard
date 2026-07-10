#!/bin/zsh
# Installs a launchd agent so the dashboard server runs at login (macOS).
# Usage: ./scripts/install-launchd.sh   (re-run after moving the repo)
set -euo pipefail

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LABEL="dev.joavn.personal-dashboard"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$HOME/Library/Logs/personal-dashboard.log"

echo "Building client…"
(cd "$REPO_DIR" && npm run build)

mkdir -p "$HOME/Library/LaunchAgents"
cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string>
    <string>-lc</string>
    <string>cd $REPO_DIR &amp;&amp; exec npm start</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict>
</plist>
PLIST

launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"

echo "✓ Installed and started ($LABEL)."
echo "  Logs:  $LOG"
echo "  Stop:  launchctl unload $PLIST"
echo "  Next:  tailscale serve 4821   # expose to your tailnet with HTTPS"
