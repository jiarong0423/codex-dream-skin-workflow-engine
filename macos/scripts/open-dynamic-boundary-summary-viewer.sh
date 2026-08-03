#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
source "$SCRIPT_DIR/common.sh"

show_help() {
  cat <<'EOF'
Usage: open-dynamic-boundary-summary-viewer.sh [--open true|false]

Prints the Dynamic Boundary Summary Viewer path. By default this script does
not open a GUI, does not connect to CDP, does not launch Codex, does not apply
a theme, does not restore, does not click, and does not drag.

Use --open true only from an explicit user launcher action.
EOF
}

OPEN_VIEWER="false"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --open)
      [ "$#" -ge 2 ] || cit_die "--open requires a value"
      OPEN_VIEWER="$2"
      shift 2
      ;;
    -h|--help)
      show_help
      exit 0
      ;;
    *)
      cit_die "unknown dynamic boundary summary viewer option: $1"
      ;;
  esac
done

case "$OPEN_VIEWER" in
  true|false) ;;
  *) cit_die "--open must be true or false" ;;
esac

VIEWER_PATH="$CIT_ROOT_DIR/previews/dynamic-boundary-summary-viewer.html"
[ -f "$VIEWER_PATH" ] || cit_die "missing dynamic boundary summary viewer: $VIEWER_PATH"

printf '[codex-interface-theme] dynamic boundary summary viewer\n'
printf 'viewer=%s\n' "$VIEWER_PATH"
printf 'mode=offline-summary-viewer\n'
printf 'sideEffects=none-unless-open-true\n'

if [ "$OPEN_VIEWER" = "true" ]; then
  cit_require_command open
  open "$VIEWER_PATH"
fi
