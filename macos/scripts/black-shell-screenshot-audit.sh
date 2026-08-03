#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
source "$SCRIPT_DIR/common.sh"

show_help() {
  cat <<'EOF'
Usage: black-shell-screenshot-audit.sh [--out-dir <absolute-path>] <image-path> [image-path ...]
                                       [--step <px>] [--min-area <px>]
                                       [--black-threshold <0-255>]
                                       [--gray-threshold <0-255>]
                                       [--chroma-threshold <0-255>]

Runs a read-only screenshot pixel audit for large black/gray shell candidates.
This is an offline visual detector: it does not connect to CDP and does not
read or mutate live DOM.

Safety contract:
  liveDom=false launches=false applies=false restores=false clicks=false drags=false
  It never starts Codex, injects a theme, restores, clicks, drags, resizes,
  deletes source files, closes projects, or changes account/permission state.
EOF
}

OUT_DIR=""
FORMAT="text"
STEP=6
MIN_AREA=2200
MAX_CANDIDATES=48
BLACK_THRESHOLD=62
GRAY_THRESHOLD=128
CHROMA_THRESHOLD=52
IMAGES=()

while [ "$#" -gt 0 ]; do
  case "$1" in
    --out-dir)
      [ "$#" -ge 2 ] || cit_die "--out-dir requires a value"
      OUT_DIR="$2"
      shift 2
      ;;
    --format)
      [ "$#" -ge 2 ] || cit_die "--format requires text or json"
      FORMAT="$2"
      shift 2
      ;;
    --step)
      [ "$#" -ge 2 ] || cit_die "--step requires a value"
      STEP="$2"
      shift 2
      ;;
    --min-area)
      [ "$#" -ge 2 ] || cit_die "--min-area requires a value"
      MIN_AREA="$2"
      shift 2
      ;;
    --max-candidates)
      [ "$#" -ge 2 ] || cit_die "--max-candidates requires a value"
      MAX_CANDIDATES="$2"
      shift 2
      ;;
    --black-threshold)
      [ "$#" -ge 2 ] || cit_die "--black-threshold requires a value"
      BLACK_THRESHOLD="$2"
      shift 2
      ;;
    --gray-threshold)
      [ "$#" -ge 2 ] || cit_die "--gray-threshold requires a value"
      GRAY_THRESHOLD="$2"
      shift 2
      ;;
    --chroma-threshold)
      [ "$#" -ge 2 ] || cit_die "--chroma-threshold requires a value"
      CHROMA_THRESHOLD="$2"
      shift 2
      ;;
    -h|--help)
      show_help
      exit 0
      ;;
    --*)
      cit_die "unknown black shell screenshot audit option: $1"
      ;;
    *)
      IMAGES+=("$1")
      shift
      ;;
  esac
done

case "$FORMAT" in
  text|json) ;;
  *) cit_die "--format must be text or json" ;;
esac
case "$STEP" in
  ''|*[!0-9]*) cit_die "step must be numeric: $STEP" ;;
esac
case "$MIN_AREA" in
  ''|*[!0-9]*) cit_die "min-area must be numeric: $MIN_AREA" ;;
esac
case "$MAX_CANDIDATES" in
  ''|*[!0-9]*) cit_die "max-candidates must be numeric: $MAX_CANDIDATES" ;;
esac
case "$BLACK_THRESHOLD" in
  ''|*[!0-9]*) cit_die "black-threshold must be numeric: $BLACK_THRESHOLD" ;;
esac
case "$GRAY_THRESHOLD" in
  ''|*[!0-9]*) cit_die "gray-threshold must be numeric: $GRAY_THRESHOLD" ;;
esac
case "$CHROMA_THRESHOLD" in
  ''|*[!0-9]*) cit_die "chroma-threshold must be numeric: $CHROMA_THRESHOLD" ;;
esac
if [ "${#IMAGES[@]}" -eq 0 ]; then
  cit_die "provide at least one screenshot path"
fi
if [ -z "$OUT_DIR" ]; then
  OUT_DIR="$CIT_ROOT_DIR/previews/black-shell-screenshot-audit-$(date +%Y%m%d-%H%M%S)"
fi
case "$OUT_DIR" in
  /*) ;;
  *) cit_die "--out-dir must be absolute: $OUT_DIR" ;;
esac

APP_PATH="$(cit_detect_app_or_die)"
NODE_PATH="$(cit_node_for_app "$APP_PATH")"
mkdir -p "$OUT_DIR"

cit_log "read-only black shell screenshot audit output: $OUT_DIR"
args=(--out-dir "$OUT_DIR" --format "$FORMAT" --step "$STEP" --min-area "$MIN_AREA" --max-candidates "$MAX_CANDIDATES" --black-threshold "$BLACK_THRESHOLD" --gray-threshold "$GRAY_THRESHOLD" --chroma-threshold "$CHROMA_THRESHOLD")
for image in "${IMAGES[@]}"; do
  args+=(--image "$image")
done

"$NODE_PATH" "$SCRIPT_DIR/black-shell-screenshot-audit.mjs" "${args[@]}" >"$OUT_DIR/black-shell-screenshot-audit.txt"
if [ "$FORMAT" = "text" ]; then
  cat "$OUT_DIR/black-shell-screenshot-audit.txt"
fi

cit_log "black shell screenshot audit complete"
printf '%s\n' "$OUT_DIR"
