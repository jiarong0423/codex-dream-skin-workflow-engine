#!/usr/bin/env bash
set -euo pipefail

ENGINE_DIR="${CIT_ENGINE_DIR:-$HOME/.codex/codex-interface-theme}"

printf '[Dynamic Boundary Summary Viewer] engine=%s\n' "$ENGINE_DIR"

if [ ! -x "$ENGINE_DIR/scripts/open-dynamic-boundary-summary-viewer.sh" ]; then
  printf '[Dynamic Boundary Summary Viewer][error] missing viewer helper: %s\n' "$ENGINE_DIR/scripts/open-dynamic-boundary-summary-viewer.sh" >&2
  printf '[Dynamic Boundary Summary Viewer][error] run macos/scripts/install.sh and macos/scripts/install-launcher.sh from the repository root first\n' >&2
  exit 1
fi

exec "$ENGINE_DIR/scripts/open-dynamic-boundary-summary-viewer.sh" \
  --open true
