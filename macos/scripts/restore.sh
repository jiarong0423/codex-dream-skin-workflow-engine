#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
source "$SCRIPT_DIR/common.sh"

show_help() {
  cat <<'EOF'
Usage: restore.sh [--port <port>] [--quit]

Removes injected theme CSS/DOM from the current Codex renderer.
Use --quit to also ask the official app to quit, which closes the CDP port.
EOF
}

PORT=""
QUIT_APP=0

while [ "$#" -gt 0 ]; do
  case "$1" in
    --port)
      [ "$#" -ge 2 ] || cit_die "--port requires a value"
      PORT="$2"
      shift 2
      ;;
    --quit)
      QUIT_APP=1
      shift
      ;;
    -h|--help)
      show_help
      exit 0
      ;;
    *)
      cit_die "unknown restore option: $1"
      ;;
  esac
done

cit_assert_source_layout
APP_PATH="$(cit_detect_app_or_die)"
NODE_PATH="$(cit_node_for_app "$APP_PATH")"
cit_ensure_state_dirs

RESTORE_ARGS=(--state-dir "$CIT_STATE_DIR" --remove)
if [ -n "$PORT" ]; then
  RESTORE_ARGS+=(--port "$PORT")
fi

"$NODE_PATH" "$CIT_ROOT_DIR/scripts/injector.mjs" "${RESTORE_ARGS[@]}"

if [ "$QUIT_APP" = "1" ]; then
  if cit_is_app_running "$APP_PATH"; then
    cit_log "asking Codex to quit so the CDP port closes"
    cit_quit_app "$APP_PATH" || cit_die "failed to ask Codex to quit"
    cit_wait_for_app_exit "$APP_PATH" 20 || cit_die "Codex did not exit within 20 seconds"
  else
    cit_log "Codex is not running"
  fi
fi
