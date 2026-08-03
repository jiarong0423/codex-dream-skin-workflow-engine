#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
source "$SCRIPT_DIR/common.sh"

show_help() {
  cat <<'EOF'
Usage: dynamic-boundary-readonly-gate.sh [--port <port>] [--out-dir <absolute-path>]
                                         [--samples <n>] [--interval-ms <ms>]
                                         [--allow-stateful-controls true|false]

Runs a read-only dynamic native boundary coverage pass against an already
debug-enabled Codex renderer. It never launches Codex, never applies a theme,
never restores, never clicks, never drags, never mutates permission/project
state, and never deletes files.
EOF
}

PORT="$CIT_DEFAULT_PORT"
OUT_DIR=""
SAMPLES=3
INTERVAL_MS=700
ALLOW_STATEFUL_CONTROLS="false"

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
    --samples)
      [ "$#" -ge 2 ] || cit_die "--samples requires a value"
      SAMPLES="$2"
      shift 2
      ;;
    --interval-ms)
      [ "$#" -ge 2 ] || cit_die "--interval-ms requires a value"
      INTERVAL_MS="$2"
      shift 2
      ;;
    --allow-stateful-controls)
      [ "$#" -ge 2 ] || cit_die "--allow-stateful-controls requires a value"
      ALLOW_STATEFUL_CONTROLS="$2"
      shift 2
      ;;
    -h|--help)
      show_help
      exit 0
      ;;
    *)
      cit_die "unknown dynamic boundary readonly option: $1"
      ;;
  esac
done

case "$PORT" in
  ''|*[!0-9]*) cit_die "port must be numeric: $PORT" ;;
esac
case "$SAMPLES" in
  ''|*[!0-9]*) cit_die "samples must be numeric: $SAMPLES" ;;
esac
case "$INTERVAL_MS" in
  ''|*[!0-9]*) cit_die "interval-ms must be numeric: $INTERVAL_MS" ;;
esac
case "$ALLOW_STATEFUL_CONTROLS" in
  true|false) ;;
  *) cit_die "--allow-stateful-controls must be true or false" ;;
esac

if [ -z "$OUT_DIR" ]; then
  OUT_DIR="$CIT_ROOT_DIR/previews/dynamic-boundary-readonly-$(date +%Y%m%d-%H%M%S)"
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
  cit_die "CDP port 127.0.0.1:$PORT is not open; read-only gate refuses to launch or restart Codex"
fi

cit_log "dynamic boundary readonly output: $OUT_DIR"
printf '{"mode":"read-only-dynamic-boundary-coverage","port":%s,"samples":%s,"intervalMs":%s,"allowStatefulControls":%s,"mutates":false,"launches":false,"applies":false,"clicks":false,"drags":false}\n' \
  "$PORT" "$SAMPLES" "$INTERVAL_MS" "$ALLOW_STATEFUL_CONTROLS" >"$OUT_DIR/00-options.json"

"$NODE_PATH" "$SCRIPT_DIR/dynamic-boundary-coverage.mjs" \
  --format json >"$OUT_DIR/01-dynamic-boundary-coverage-smoke.json"

"$NODE_PATH" "$SCRIPT_DIR/module-boundary-gate.mjs" \
  --format json >"$OUT_DIR/02-module-boundary-gate.json"

"$NODE_PATH" "$SCRIPT_DIR/native-module-scan.mjs" \
  --port "$PORT" \
  --format json \
  --out "$OUT_DIR/03-native-module-scan.json" >/dev/null

"$NODE_PATH" "$SCRIPT_DIR/interface-field-inventory.mjs" \
  --port "$PORT" \
  --samples "$SAMPLES" \
  --interval-ms "$INTERVAL_MS" \
  --out "$OUT_DIR/04-interface-field-inventory.json" \
  --format text >"$OUT_DIR/04-interface-field-inventory.txt"

"$NODE_PATH" "$SCRIPT_DIR/live-clickable-surface-audit.mjs" \
  --port "$PORT" \
  --out-dir "$OUT_DIR/05-clickable-dry-run" \
  --dry-run true \
  --interact false \
  --allow-stateful-controls "$ALLOW_STATEFUL_CONTROLS" \
  --drag false \
  --format text >"$OUT_DIR/05-clickable-dry-run.txt"

"$NODE_PATH" "$SCRIPT_DIR/dynamic-boundary-artifact-summary.mjs" \
  --artifact-dir "$OUT_DIR" \
  --out "$OUT_DIR/06-summary.json" \
  --format text >"$OUT_DIR/06-summary.txt"

cit_log "dynamic boundary readonly gate complete"
printf '%s\n' "$OUT_DIR"
