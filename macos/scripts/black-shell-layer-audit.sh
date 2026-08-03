#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
source "$SCRIPT_DIR/common.sh"

show_help() {
  cat <<'EOF'
Usage: black-shell-layer-audit.sh [--port <port>] [--out-dir <absolute-path>]
                                  [--watch true|false] [--samples <n>]
                                  [--interval-ms <ms>]

Runs a read-only black shell DOM layer audit against an already debug-enabled
Codex renderer. The operator opens each page or popover manually; this command
only reads DOM/computed-style layers through CDP Runtime.evaluate.

Safety contract:
  launches=false applies=false restores=false clicks=false drags=false
  It never starts Codex, injects a theme, restores, clicks, drags, resizes,
  deletes files, closes projects, or changes account/permission state.
EOF
}

PORT="$CIT_DEFAULT_PORT"
OUT_DIR=""
WATCH="false"
SAMPLES=1
INTERVAL_MS=2500

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
    --watch)
      [ "$#" -ge 2 ] || cit_die "--watch requires true or false"
      WATCH="$2"
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
    -h|--help)
      show_help
      exit 0
      ;;
    *)
      cit_die "unknown black shell layer audit option: $1"
      ;;
  esac
done

case "$PORT" in
  ''|*[!0-9]*) cit_die "port must be numeric: $PORT" ;;
esac
case "$WATCH" in
  true|false) ;;
  *) cit_die "--watch must be true or false" ;;
esac
case "$SAMPLES" in
  ''|*[!0-9]*) cit_die "samples must be numeric: $SAMPLES" ;;
esac
case "$INTERVAL_MS" in
  ''|*[!0-9]*) cit_die "interval-ms must be numeric: $INTERVAL_MS" ;;
esac

if [ -z "$OUT_DIR" ]; then
  OUT_DIR="$CIT_ROOT_DIR/previews/black-shell-layer-audit-$(date +%Y%m%d-%H%M%S)"
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
  cit_die "CDP port 127.0.0.1:$PORT is not open; read-only black shell layer audit refuses to launch or restart Codex"
fi

cit_log "read-only black shell layer audit output: $OUT_DIR"
printf '{"mode":"read-only-black-shell-layer-audit","port":%s,"watch":%s,"samples":%s,"intervalMs":%s,"mutates":false,"launches":false,"applies":false,"restores":false,"clicks":false,"drags":false}\n' \
  "$PORT" "$WATCH" "$SAMPLES" "$INTERVAL_MS" >"$OUT_DIR/00-options.json"

args=(--port "$PORT" --samples "$SAMPLES" --interval-ms "$INTERVAL_MS" --format text --out "$OUT_DIR/01-black-shell-layer-audit.json")
if [ "$WATCH" = "true" ]; then
  args+=(--watch)
fi

"$NODE_PATH" "$SCRIPT_DIR/black-shell-layer-audit.mjs" "${args[@]}" >"$OUT_DIR/01-black-shell-layer-audit.txt"

cit_log "black shell layer audit complete"
printf '%s\n' "$OUT_DIR"
