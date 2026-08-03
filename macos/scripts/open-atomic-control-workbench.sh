#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
source "$SCRIPT_DIR/common.sh"

show_help() {
  cat <<'EOF'
Usage: open-atomic-control-workbench.sh [--open true|false] [--plan true|false]
                                        [--out-dir <absolute-path>] [--format text|json]

Prints the Atomic Control Workbench path and an offline atomic command plan.
By default this script does not open a GUI, does not connect to CDP, does not
launch Codex, does not apply a theme, does not click, and does not drag.

Use --open true only from an explicit user launcher action.
EOF
}

OPEN_WORKBENCH="false"
PRINT_PLAN="true"
OUT_DIR="/tmp/codex-interface-theme-atomic-control-evidence"
FORMAT="text"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --open)
      [ "$#" -ge 2 ] || cit_die "--open requires a value"
      OPEN_WORKBENCH="$2"
      shift 2
      ;;
    --plan)
      [ "$#" -ge 2 ] || cit_die "--plan requires a value"
      PRINT_PLAN="$2"
      shift 2
      ;;
    --out-dir)
      [ "$#" -ge 2 ] || cit_die "--out-dir requires a value"
      OUT_DIR="$2"
      shift 2
      ;;
    --format)
      [ "$#" -ge 2 ] || cit_die "--format requires a value"
      FORMAT="$2"
      shift 2
      ;;
    -h|--help)
      show_help
      exit 0
      ;;
    *)
      cit_die "unknown atomic workbench option: $1"
      ;;
  esac
done

case "$OPEN_WORKBENCH" in
  true|false) ;;
  *) cit_die "--open must be true or false" ;;
esac
case "$PRINT_PLAN" in
  true|false) ;;
  *) cit_die "--plan must be true or false" ;;
esac
case "$FORMAT" in
  text|json) ;;
  *) cit_die "--format must be text or json" ;;
esac
case "$OUT_DIR" in
  /*) ;;
  *) cit_die "--out-dir must be absolute: $OUT_DIR" ;;
esac

WORKBENCH_PATH="$CIT_ROOT_DIR/previews/atomic-control-workbench.html"
PLANNER_PATH="$CIT_ROOT_DIR/scripts/atomic-control-plan.mjs"

[ -f "$WORKBENCH_PATH" ] || cit_die "missing atomic control workbench: $WORKBENCH_PATH"
[ -f "$PLANNER_PATH" ] || cit_die "missing atomic control planner: $PLANNER_PATH"

printf '[codex-interface-theme] atomic control workbench\n'
printf 'workbench=%s\n' "$WORKBENCH_PATH"
printf 'mode=offline-control-carrier\n'
printf 'sideEffects=none-unless-open-true\n'

if [ "$PRINT_PLAN" = "true" ]; then
  APP_PATH="$(cit_detect_app_or_die)"
  NODE_PATH="$(cit_node_for_app "$APP_PATH")"
  "$NODE_PATH" "$PLANNER_PATH" \
    --format "$FORMAT" \
    --out-dir "$OUT_DIR"
fi

if [ "$OPEN_WORKBENCH" = "true" ]; then
  cit_require_command open
  open "$WORKBENCH_PATH"
fi
