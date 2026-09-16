#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
source "$SCRIPT_DIR/common.sh"

show_help() {
  cat <<'EOF'
Usage: queued-route-black-scan.sh [--port <port>] [--out-dir <absolute-path>]
                                  [--labels <comma-list>] [--wait-ms <ms>]

Runs a queued route black-layer scan against an already debug-enabled Codex
renderer. It may click only fixed allowlisted sidebar navigation labels:
current, 專案, Pull Request, 網站, 已排程, 外掛程式.

Safety contract:
  launches=false applies=false restores=false drags=false
  clicks=true, sidebar-navigation-only
EOF
}

ARGS=()
while [ "$#" -gt 0 ]; do
  case "$1" in
    --port|--out-dir|--labels|--wait-ms)
      [ "$#" -ge 2 ] || cit_die "$1 requires a value"
      ARGS+=("$1" "$2")
      shift 2
      ;;
    -h|--help)
      show_help
      exit 0
      ;;
    *)
      cit_die "unknown queued route black scan option: $1"
      ;;
  esac
done

cit_assert_source_layout
APP_PATH="$(cit_detect_app_or_die)"
NODE_PATH="$(cit_node_for_app "$APP_PATH")"

"$NODE_PATH" "$SCRIPT_DIR/queued-route-black-scan.mjs" "${ARGS[@]}"
