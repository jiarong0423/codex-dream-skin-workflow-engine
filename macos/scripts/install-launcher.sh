#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
source "$SCRIPT_DIR/common.sh"

show_help() {
  cat <<'EOF'
Usage: install-launcher.sh

Installs the Codex Dream Skin launcher app to:
  ~/Applications/Codex Dream Skin.app
  ~/Applications/Codex Dream Skin.command

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

SOURCE_APP="$CIT_ROOT_DIR/launcher/Codex Dream Skin.app"
SOURCE_COMMAND="$CIT_ROOT_DIR/launcher/Codex Dream Skin.command"
TARGET_DIR="$HOME/Applications"
TARGET_APP="$TARGET_DIR/Codex Dream Skin.app"
TARGET_COMMAND="$TARGET_DIR/Codex Dream Skin.command"

[ -d "$SOURCE_APP" ] || cit_die "missing launcher app: $SOURCE_APP"
[ -f "$SOURCE_APP/Contents/Info.plist" ] || cit_die "missing launcher Info.plist"
[ -f "$SOURCE_APP/Contents/MacOS/codex-dream-skin-launcher" ] || cit_die "missing launcher executable"
[ -f "$SOURCE_COMMAND" ] || cit_die "missing launcher command: $SOURCE_COMMAND"

mkdir -p "$TARGET_DIR"
rsync -a --delete "$SOURCE_APP/" "$TARGET_APP/"
rsync -a "$SOURCE_COMMAND" "$TARGET_COMMAND"
chmod +x "$TARGET_APP/Contents/MacOS/codex-dream-skin-launcher"
chmod +x "$TARGET_COMMAND"

cit_log "installed launcher"
printf 'launcher=%s\n' "$TARGET_APP"
printf 'command=%s\n' "$TARGET_COMMAND"
printf 'log=%s\n' "$CIT_LOG_DIR/launcher.log"
