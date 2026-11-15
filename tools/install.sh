#!/bin/bash
# Builds LittingtonVizualizer and puts it in /Applications, replacing any earlier copy.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "Building the audio helper…"
(cd native/audio-tap && swift build -c release 2>&1 | tail -1)

echo "Packaging the app…"
npx electron-builder --mac --dir >/dev/null

APP="dist/mac-arm64/LittingtonVizualizer.app"
DEST="/Applications/LittingtonVizualizer.app"
osascript -e 'tell application "LittingtonVizualizer" to quit' >/dev/null 2>&1 || true
sleep 1
rm -rf "$DEST"
ditto "$APP" "$DEST"
echo "Installed: $DEST"
