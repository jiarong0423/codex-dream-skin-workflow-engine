#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
DEFAULT_PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../../.." >/dev/null 2>&1 && pwd)"
PROJECT_ROOT="$DEFAULT_PROJECT_ROOT"
MODE="runtime"

show_help() {
  printf '%s\n' 'Usage: workflow-gate.sh [--runtime|--submission] [--project-root <path>]'
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --runtime)
      MODE="runtime"
      shift
      ;;
    --submission)
      MODE="submission"
      shift
      ;;
    --project-root)
      [ "$#" -ge 2 ] || { printf '%s\n' '[dream-skin-workflow] --project-root requires a value' >&2; exit 1; }
      PROJECT_ROOT="$2"
      shift 2
      ;;
    -h|--help)
      show_help
      exit 0
      ;;
    *)
      printf '[dream-skin-workflow] unknown option: %s\n' "$1" >&2
      show_help >&2
      exit 1
      ;;
  esac
done

PROJECT_ROOT="$(cd "$PROJECT_ROOT" >/dev/null 2>&1 && pwd)"
cd "$PROJECT_ROOT"

required_files=(
  "README.md"
  "docs/PROJECT_LOG.md"
  "competition-manifest.json"
  "macos/assets/theme.json"
  "macos/assets/runtime-modules.json"
  "macos/assets/theme.css"
  "macos/assets/renderer-inject.js"
  "macos/scripts/injector.mjs"
  "macos/scripts/install.sh"
  "macos/scripts/verify.sh"
  "macos/scripts/restore.sh"
  "macos/tests/run-tests.sh"
  ".agents/skills/codex-dream-skin-workflow/SKILL.md"
  ".agents/skills/codex-dream-skin-workflow/competition-manifest.json"
)

for required_file in "${required_files[@]}"; do
  if [ ! -f "$required_file" ]; then
    printf '[dream-skin-workflow] missing required file: %s\n' "$required_file" >&2
    exit 1
  fi
done

printf '%s\n' '[dream-skin-workflow] running runtime tests'
bash macos/tests/run-tests.sh

printf '%s\n' '[dream-skin-workflow] running module matrix'
node macos/scripts/module-matrix.mjs \
  --state-dir "$HOME/Library/Application Support/CodexInterfaceTheme" \
  --assets-dir macos/assets \
  --format text

if [ "$MODE" = "submission" ]; then
  printf '%s\n' '[dream-skin-workflow] checking strict submission readiness'
  node "$SCRIPT_DIR/check-submission.mjs" "competition-manifest.json"
fi

printf '[dream-skin-workflow] %s gate passed\n' "$MODE"
