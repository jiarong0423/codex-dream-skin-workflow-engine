#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
# shellcheck source=/dev/null
source "$SCRIPT_DIR/common.sh"

show_help() {
  cat <<'EOF'
Usage: install-chainsaw-launcher.sh [options]

Options:
  --target-dir <path>       Install directory. Default: ~/Desktop.
  --no-sign                 Skip ad-hoc signing of the .app copy.
  -h, --help                Show help.

Installs the private Chainsaw launcher entries to the target directory:
  Chainsaw Duel Injector.app
  Chainsaw Duel Injector.command

It also installs a runtime copy to:
  ~/Library/Application Support/DreamSkinForge/chainsaw-project

The installer does not modify the official Codex app bundle, does not add the
private pack to formal public theme packs, and does not apply the overlay.
EOF
}

TARGET_DIR="$HOME/Desktop"
SIGN_APP="true"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --target-dir)
      [ "$#" -ge 2 ] || cit_die "--target-dir requires a value"
      TARGET_DIR="$2"
      shift 2
      ;;
    --no-sign)
      SIGN_APP="false"
      shift
      ;;
    -h|--help)
      show_help
      exit 0
      ;;
    *)
      cit_die "unknown install-chainsaw-launcher option: $1"
      ;;
  esac
done

cit_require_command rsync
cit_assert_source_layout

PROJECT_ROOT="$(cd "$CIT_ROOT_DIR/.." >/dev/null 2>&1 && pwd)"
SOURCE_APP="$CIT_ROOT_DIR/launcher/Chainsaw Duel Injector.app"
SOURCE_COMMAND="$CIT_ROOT_DIR/launcher/Chainsaw Duel Injector.command"
TARGET_APP="$TARGET_DIR/Chainsaw Duel Injector.app"
TARGET_COMMAND="$TARGET_DIR/Chainsaw Duel Injector.command"
RUNTIME_ROOT="$CIT_STATE_DIR/chainsaw-project"

[ -d "$SOURCE_APP" ] || cit_die "missing Chainsaw launcher app: $SOURCE_APP"
[ -f "$SOURCE_APP/Contents/Info.plist" ] || cit_die "missing Chainsaw launcher Info.plist"
[ -f "$SOURCE_APP/Contents/MacOS/chainsaw-duel-injector" ] || cit_die "missing Chainsaw launcher executable"
[ -f "$SOURCE_COMMAND" ] || cit_die "missing Chainsaw command launcher: $SOURCE_COMMAND"

mkdir -p "$RUNTIME_ROOT" "$RUNTIME_ROOT/docs"
rsync -a --delete "$PROJECT_ROOT/macos/" "$RUNTIME_ROOT/macos/"
rsync -a --delete "$PROJECT_ROOT/theme-packs/" "$RUNTIME_ROOT/theme-packs/"
rsync -a --delete "$PROJECT_ROOT/.agents/" "$RUNTIME_ROOT/.agents/"
rsync -a "$PROJECT_ROOT/docs/PROJECT_LOG.md" "$RUNTIME_ROOT/docs/PROJECT_LOG.md"
rsync -a "$PROJECT_ROOT/README.md" "$PROJECT_ROOT/competition-manifest.json" "$RUNTIME_ROOT/"

chmod +x "$RUNTIME_ROOT/macos/scripts/chainsaw-duel-one-click-injector.sh"
chmod +x "$RUNTIME_ROOT/.agents/skills/codex-dream-skin-workflow/scripts/workflow-gate.sh"

mkdir -p "$TARGET_DIR"
rsync -a --delete "$SOURCE_APP/" "$TARGET_APP/"
rsync -a "$SOURCE_COMMAND" "$TARGET_COMMAND"

chmod +x "$TARGET_APP/Contents/MacOS/chainsaw-duel-injector"
chmod +x "$TARGET_COMMAND"

if command -v xattr >/dev/null 2>&1; then
  xattr -dr com.apple.quarantine "$TARGET_APP" "$TARGET_COMMAND" "$RUNTIME_ROOT" >/dev/null 2>&1 || true
fi

if [ "$SIGN_APP" = "true" ]; then
  if command -v codesign >/dev/null 2>&1; then
    if codesign --force --deep --sign - "$TARGET_APP" >/dev/null 2>&1; then
      cit_log "ad-hoc signed Chainsaw launcher app"
    else
      cit_warn "ad-hoc signing failed for $TARGET_APP; command fallback remains installed"
    fi
  else
    cit_warn "codesign not found; command fallback remains installed"
  fi
fi

cit_log "installed Chainsaw launchers"
printf 'launcher=%s\n' "$TARGET_APP"
printf 'command=%s\n' "$TARGET_COMMAND"
printf 'sourceProjectRoot=%s\n' "$PROJECT_ROOT"
printf 'runtimeProjectRoot=%s\n' "$RUNTIME_ROOT"
printf 'appLog=%s\n' "$CIT_LOG_DIR/chainsaw-duel-injector.log"
printf 'commandLog=%s\n' "$CIT_LOG_DIR/chainsaw-duel-injector-command.log"
