#!/bin/bash
# Build Fairway.app (the Fairway icon, one click to play) and put it on the
# Desktop. Re-run any time; it replaces the old copy. The app opens
# Fairway.command from this checkout in Terminal, so it always plays the
# version you last updated.
#
#   launcher/install-mac.sh            # Fairway.app on the Desktop
#   launcher/install-mac.sh --wifi     # also "Fairway Wi-Fi.app" (friends join on the same network)
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="${FAIRWAY_APP_DIR:-$HOME/Desktop}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# the app icon, from the brand's 512 px icon
ICONSET="$WORK/Fairway.iconset"
mkdir -p "$ICONSET"
SRC="$ROOT/assets/brand/icon-512.png"
for s in 16 32 128 256 512; do
  sips -z $s $s "$SRC" --out "$ICONSET/icon_${s}x${s}.png" >/dev/null
  d=$((s * 2)); [ $d -le 512 ] && sips -z $d $d "$SRC" --out "$ICONSET/icon_${s}x${s}@2x.png" >/dev/null
done
cp "$SRC" "$ICONSET/icon_512x512@2x.png"
iconutil -c icns "$ICONSET" -o "$WORK/Fairway.icns"

build() { # app name, the .command file it opens
  local name="$1" cmd="$ROOT/$2" app="$DEST/$1.app"
  cat > "$WORK/main.applescript" <<EOF
-- $name: start the R10 bridge and open Fairway in the browser.
set cmd to "$cmd"
try
  do shell script "test -e " & quoted form of cmd
on error
  display dialog "Fairway's folder has moved or been deleted." & return & return & "Expected it at: $ROOT" & return & return & "Run launcher/install-mac.sh from the new location to rebuild this app." buttons {"OK"} default button 1 with icon caution
  return
end try
-- opening the .command runs it in Terminal (no extra permission needed)
do shell script "open " & quoted form of cmd
EOF
  rm -rf "$app"
  osacompile -o "$app" "$WORK/main.applescript"
  cp "$WORK/Fairway.icns" "$app/Contents/Resources/applet.icns"
  # recent macOS reads the icon from Assets.car first: drop the stock one
  rm -f "$app/Contents/Resources/Assets.car"
  /usr/libexec/PlistBuddy -c "Delete :CFBundleIconName" "$app/Contents/Info.plist" 2>/dev/null || true
  /usr/libexec/PlistBuddy -c "Set :CFBundleName $name" "$app/Contents/Info.plist" 2>/dev/null || true
  /usr/libexec/PlistBuddy -c "Add :CFBundleIdentifier string com.fairway.launcher.$(echo "$name" | tr -cd 'A-Za-z')" "$app/Contents/Info.plist" 2>/dev/null || true
  codesign --force --deep --sign - "$app" >/dev/null 2>&1 || true
  touch "$app"
  echo "  made $app"
}

chmod +x "$ROOT/launcher/fairway.sh" "$ROOT"/*.command
build "Fairway" "Fairway.command"
if [ "${1:-}" = "--wifi" ]; then build "Fairway Wi-Fi" "Fairway on Wi-Fi.command"; fi
echo "  Double-click Fairway on the Desktop to play."
