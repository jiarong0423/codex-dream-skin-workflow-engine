#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
source "$SCRIPT_DIR/common.sh"

show_help() {
  cat <<'EOF'
Usage: install-launcher.sh

Installs the Dream Skin Forge launcher app to:
  ~/Applications/Dream Skin Forge.app
  ~/Applications/Dream Skin Forge.command

The launcher does not modify the official Codex app. It starts Codex with the
managed theme engine when Codex is not already running. If Codex is already
running without CDP, it shows a notice and leaves the current window untouched.
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    -h|--help)
      show_help
      exit 0
      ;;
    *)
      cit_die "unknown install-launcher option: $1"
      ;;
  esac
done

cit_require_command rsync
cit_assert_source_layout

SOURCE_APP="$CIT_ROOT_DIR/launcher/Dream Skin Forge.app"
SOURCE_COMMAND="$CIT_ROOT_DIR/launcher/Dream Skin Forge.command"
TARGET_DIR="$HOME/Applications"
TARGET_APP="$TARGET_DIR/Dream Skin Forge.app"
TARGET_COMMAND="$TARGET_DIR/Dream Skin Forge.command"

[ -d "$SOURCE_APP" ] || cit_die "missing launcher app: $SOURCE_APP"
[ -f "$SOURCE_APP/Contents/Info.plist" ] || cit_die "missing launcher Info.plist"
[ -f "$SOURCE_APP/Contents/MacOS/dream-skin-forge-launcher" ] || cit_die "missing launcher executable"
[ -f "$SOURCE_COMMAND" ] || cit_die "missing launcher command: $SOURCE_COMMAND"

mkdir -p "$TARGET_DIR"
rsync -a --delete "$SOURCE_APP/" "$TARGET_APP/"
rsync -a "$SOURCE_COMMAND" "$TARGET_COMMAND"
chmod +x "$TARGET_APP/Contents/MacOS/dream-skin-forge-launcher"
chmod +x "$TARGET_COMMAND"

cit_log "installed launcher"
printf 'launcher=%s\n' "$TARGET_APP"
printf 'command=%s\n' "$TARGET_COMMAND"
printf 'log=%s\n' "$CIT_LOG_DIR/launcher.log"
