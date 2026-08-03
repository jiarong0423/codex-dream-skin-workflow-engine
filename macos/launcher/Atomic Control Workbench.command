#!/usr/bin/env bash
set -euo pipefail

ENGINE_DIR="${CIT_ENGINE_DIR:-$HOME/.codex/codex-interface-theme}"
OUT_DIR="${CIT_ATOMIC_CONTROL_OUT_DIR:-/tmp/codex-interface-theme-atomic-control-evidence}"

printf '[Atomic Control Workbench] engine=%s\n' "$ENGINE_DIR"
printf '[Atomic Control Workbench] evidence=%s\n' "$OUT_DIR"

if [ ! -x "$ENGINE_DIR/scripts/open-atomic-control-workbench.sh" ]; then
  printf '[Atomic Control Workbench][error] missing workbench helper: %s\n' "$ENGINE_DIR/scripts/open-atomic-control-workbench.sh" >&2
  printf '[Atomic Control Workbench][error] run macos/scripts/install.sh and macos/scripts/install-launcher.sh from the repository root first\n' >&2
  exit 1
fi

exec "$ENGINE_DIR/scripts/open-atomic-control-workbench.sh" \
  --open true \
  --plan true \
  --out-dir "$OUT_DIR" \
  --format text
