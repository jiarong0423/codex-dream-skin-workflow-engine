#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
source "$SCRIPT_DIR/common.sh"

show_help() {
  cat <<'EOF'
Usage: install.sh [--no-engine-copy]

Installs the managed Codex Interface Theme engine to:
  ~/.codex/codex-interface-theme

This installer does not modify the official Codex app, app.asar, auth.json,
API keys, or model provider settings.
EOF
}

NO_ENGINE_COPY=0
while [ "$#" -gt 0 ]; do
  case "$1" in
    --no-engine-copy)
      NO_ENGINE_COPY=1
      shift
      ;;
    -h|--help)
      show_help
      exit 0
      ;;
    *)
      cit_die "unknown install option: $1"
      ;;
  esac
done

cit_require_command plutil
cit_require_command rsync
cit_assert_source_layout
APP_PATH="$(cit_detect_app_or_die)"
NODE_PATH="$(cit_node_for_app "$APP_PATH")"
cit_ensure_state_dirs

if [ "$NO_ENGINE_COPY" = "0" ]; then
  mkdir -p "$CIT_ENGINE_DIR"
  if [ "$CIT_ROOT_DIR" != "$CIT_ENGINE_DIR" ]; then
    rsync -a --delete \
      --exclude '.git' \
      --exclude '.DS_Store' \
      "$CIT_ROOT_DIR/" \
      "$CIT_ENGINE_DIR/"
  fi
  chmod +x "$CIT_ENGINE_DIR/scripts/"*.sh
  chmod +x "$CIT_ENGINE_DIR/scripts/"*.mjs
  chmod +x "$CIT_ENGINE_DIR/tests/"*.sh
else
  cit_warn "skipped engine copy; using source tree directly"
fi

ENGINE_ROOT="$CIT_ENGINE_DIR"
if [ "$NO_ENGINE_COPY" = "1" ]; then
  ENGINE_ROOT="$CIT_ROOT_DIR"
fi

"$NODE_PATH" "$ENGINE_ROOT/scripts/theme-store.mjs" init \
  --state-dir "$CIT_STATE_DIR" \
  --assets-dir "$ENGINE_ROOT/assets" >/dev/null

cit_log "installed managed engine"
cit_print_paths
cit_log "official app: $APP_PATH"
cit_log "bundled node: $NODE_PATH"
