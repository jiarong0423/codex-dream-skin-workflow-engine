#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
source "$SCRIPT_DIR/common.sh"

show_help() {
  cat <<'EOF'
Usage: verify.sh [--port <port>] [--screenshot <absolute-path>] [--simulate-table-flip] [--hide-composer]

Checks whether the active Codex renderer contains the injected theme marker.
If --screenshot is provided, captures a PNG through CDP.
If --simulate-table-flip is provided, clicks the right-bottom cat once and checks it returns to idle.
If --hide-composer is provided with a screenshot, hides the composer only for the capture and restores it immediately.
EOF
}

PORT=""
SCREENSHOT=""
SIMULATE_TABLE_FLIP=0
HIDE_COMPOSER=0

while [ "$#" -gt 0 ]; do
  case "$1" in
    --port)
      [ "$#" -ge 2 ] || cit_die "--port requires a value"
      PORT="$2"
      shift 2
      ;;
    --screenshot)
      [ "$#" -ge 2 ] || cit_die "--screenshot requires a value"
      SCREENSHOT="$2"
      shift 2
      ;;
    --simulate-table-flip)
      SIMULATE_TABLE_FLIP=1
      shift
      ;;
    --hide-composer)
      HIDE_COMPOSER=1
      shift
      ;;
    -h|--help)
      show_help
      exit 0
      ;;
    *)
      cit_die "unknown verify option: $1"
      ;;
  esac
done

cit_assert_source_layout
APP_PATH="$(cit_detect_app_or_die)"
NODE_PATH="$(cit_node_for_app "$APP_PATH")"
cit_ensure_state_dirs

VERIFY_ARGS=(--state-dir "$CIT_STATE_DIR" --verify)
if [ -n "$PORT" ]; then
  VERIFY_ARGS+=(--port "$PORT")
fi
if [ -n "$SCREENSHOT" ]; then
  VERIFY_ARGS+=(--screenshot "$SCREENSHOT")
fi
if [ "$SIMULATE_TABLE_FLIP" = "1" ]; then
  VERIFY_ARGS+=(--simulate-table-flip)
fi
if [ "$HIDE_COMPOSER" = "1" ]; then
  VERIFY_ARGS+=(--hide-composer)
fi

"$NODE_PATH" "$CIT_ROOT_DIR/scripts/injector.mjs" "${VERIFY_ARGS[@]}"
