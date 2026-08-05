#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
source "$SCRIPT_DIR/common.sh"

show_help() {
  cat <<'EOF'
Usage: safe-live-visual-gate.sh [--port <port>] [--out-dir <absolute-path>] [--wait-ms <ms>]

Runs the no-click live visual gate against an already debug-enabled Codex renderer:
  1. verify CDP is already open;
  2. scan native state;
  3. apply once with --no-launch --once --visual;
  4. capture a screenshot and verify computed state without simulated clicks;
  5. restore;
  6. scan post-restore state.

This script never launches, restarts, clicks, drags, asks for permissions, or
runs an interactive surface audit.
EOF
}

PORT="$CIT_DEFAULT_PORT"
WAIT_MS=8000
OUT_DIR=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    --port)
      [ "$#" -ge 2 ] || cit_die "--port requires a value"
      PORT="$2"
      shift 2
      ;;
    --out-dir)
      [ "$#" -ge 2 ] || cit_die "--out-dir requires a value"
      OUT_DIR="$2"
      shift 2
      ;;
    --wait-ms)
      [ "$#" -ge 2 ] || cit_die "--wait-ms requires a value"
      WAIT_MS="$2"
      shift 2
      ;;
    -h|--help)
      show_help
      exit 0
      ;;
    *)
      cit_die "unknown safe-live-visual-gate option: $1"
      ;;
  esac
done

case "$PORT" in
  ''|*[!0-9]*) cit_die "port must be numeric: $PORT" ;;
esac
case "$WAIT_MS" in
  ''|*[!0-9]*) cit_die "wait-ms must be numeric: $WAIT_MS" ;;
esac

if [ -z "$OUT_DIR" ]; then
  OUT_DIR="$CIT_ROOT_DIR/previews/safe-live-visual-gate-$(date +%Y%m%d-%H%M%S)"
fi
case "$OUT_DIR" in
  /*) ;;
  *) cit_die "--out-dir must be absolute: $OUT_DIR" ;;
esac

cit_assert_source_layout
APP_PATH="$(cit_detect_app_or_die)"
NODE_PATH="$(cit_node_for_app "$APP_PATH")"
mkdir -p "$OUT_DIR"

if ! cit_port_is_open "$PORT"; then
  cit_die "CDP port 127.0.0.1:$PORT is not open; refusing to launch or restart Codex"
fi

APPLIED=0
restore_if_needed() {
  if [ "$APPLIED" = "1" ]; then
    cit_warn "restoring after interrupted safe live visual gate"
    bash "$SCRIPT_DIR/restore.sh" --port "$PORT" >/dev/null 2>&1 || true
  fi
}
trap restore_if_needed EXIT

cit_log "safe live visual gate output: $OUT_DIR"

"$NODE_PATH" "$SCRIPT_DIR/native-module-scan.mjs" \
  --port "$PORT" \
  --format json \
  --out "$OUT_DIR/01-before-native.json" >/dev/null

bash "$SCRIPT_DIR/start.sh" \
  --no-launch \
  --once \
  --visual \
  --port "$PORT" \
  --wait-ms "$WAIT_MS"
APPLIED=1

bash "$SCRIPT_DIR/verify.sh" \
  --port "$PORT" \
  --screenshot "$OUT_DIR/02-after-apply.png" >"$OUT_DIR/02-after-apply-verify.json"

"$NODE_PATH" "$SCRIPT_DIR/native-module-scan.mjs" \
  --port "$PORT" \
  --format json \
  --out "$OUT_DIR/03-after-apply-native.json" >/dev/null

bash "$SCRIPT_DIR/restore.sh" --port "$PORT" >"$OUT_DIR/04-restore.json"
APPLIED=0

"$NODE_PATH" "$SCRIPT_DIR/native-module-scan.mjs" \
  --port "$PORT" \
  --format json \
  --out "$OUT_DIR/05-after-restore-native.json" >/dev/null

cit_log "safe live visual gate complete"
printf '%s\n' "$OUT_DIR"
