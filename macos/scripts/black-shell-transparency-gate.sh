#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
source "$SCRIPT_DIR/common.sh"

show_help() {
  cat <<'EOF'
Usage: black-shell-transparency-gate.sh [validate|status-if-cdp-open|apply-if-cdp-open] [options]

Modes:
  validate              Run local gates for the black shell transparency module.
  status-if-cdp-open    If CDP is open, read marker counts and native shell layers.
  apply-if-cdp-open     Validate, then apply once only when CDP is already open.

Options:
  --port <port>                 Existing CDP port. Default: 9341.
  --wait-ms <ms>                CDP wait time for one-shot apply. Default: 8000.
  --state-dir <dir>             Override local active-theme state directory.
  --validate true|false         Run validation before apply. Default: true.
  --theme-packs true|false      Include theme-pack validation. Default: true.
  --workflow-gate true|false    Include workflow runtime gate. Default: true.
  --out-dir <absolute-path>     Optional output directory for CDP status JSON.
  -h, --help                    Show help.

This command never launches Codex, restarts Codex, restores, clicks, drags,
deletes files, closes projects, changes permissions, or modifies the official
app bundle. It targets DOM black container shells, not screen pixels or dynamic
resize geometry.
EOF
}

MODE="validate"
PORT="$CIT_DEFAULT_PORT"
WAIT_MS=8000
STATE_DIR="$CIT_STATE_DIR"
VALIDATE_FIRST="true"
RUN_THEME_PACKS="true"
RUN_WORKFLOW_GATE="true"
OUT_DIR=""

if [ "$#" -gt 0 ]; then
  case "$1" in
    validate|status-if-cdp-open|apply-if-cdp-open)
      MODE="$1"
      shift
      ;;
  esac
fi

while [ "$#" -gt 0 ]; do
  case "$1" in
    --port)
      [ "$#" -ge 2 ] || cit_die "--port requires a value"
      PORT="$2"
      shift 2
      ;;
    --wait-ms)
      [ "$#" -ge 2 ] || cit_die "--wait-ms requires a value"
      WAIT_MS="$2"
      shift 2
      ;;
    --state-dir)
      [ "$#" -ge 2 ] || cit_die "--state-dir requires a value"
      STATE_DIR="$2"
      shift 2
      ;;
    --validate)
      [ "$#" -ge 2 ] || cit_die "--validate requires true or false"
      VALIDATE_FIRST="$2"
      shift 2
      ;;
    --theme-packs)
      [ "$#" -ge 2 ] || cit_die "--theme-packs requires true or false"
      RUN_THEME_PACKS="$2"
      shift 2
      ;;
    --workflow-gate)
      [ "$#" -ge 2 ] || cit_die "--workflow-gate requires true or false"
      RUN_WORKFLOW_GATE="$2"
      shift 2
      ;;
    --out-dir)
      [ "$#" -ge 2 ] || cit_die "--out-dir requires a value"
      OUT_DIR="$2"
      shift 2
      ;;
    -h|--help)
      show_help
      exit 0
      ;;
    *)
      cit_die "unknown black shell gate option: $1"
      ;;
  esac
done

case "$PORT" in
  ''|*[!0-9]*) cit_die "port must be numeric: $PORT" ;;
esac
case "$WAIT_MS" in
  ''|*[!0-9]*) cit_die "wait-ms must be numeric: $WAIT_MS" ;;
esac
case "$VALIDATE_FIRST" in
  true|false) ;;
  *) cit_die "--validate must be true or false" ;;
esac
case "$RUN_THEME_PACKS" in
  true|false) ;;
  *) cit_die "--theme-packs must be true or false" ;;
esac
case "$RUN_WORKFLOW_GATE" in
  true|false) ;;
  *) cit_die "--workflow-gate must be true or false" ;;
esac
if [ -n "$OUT_DIR" ]; then
  case "$OUT_DIR" in
    /*) ;;
    *) cit_die "--out-dir must be an absolute path" ;;
  esac
fi

cit_assert_source_layout
APP_PATH="$(cit_detect_app_or_die)"
NODE_PATH="$(cit_node_for_app "$APP_PATH")"
PROJECT_ROOT="$(cd "$CIT_ROOT_DIR/.." >/dev/null 2>&1 && pwd)"

run_validate() {
  cit_log "black-shell-transparency gate: local validation"
  "$NODE_PATH" --check "$CIT_ROOT_DIR/assets/surface-registry.js"
  "$NODE_PATH" --check "$CIT_ROOT_DIR/scripts/native-module-scan.mjs"
  "$NODE_PATH" --check "$CIT_ROOT_DIR/scripts/module-matrix.mjs"
  "$NODE_PATH" --check "$CIT_ROOT_DIR/scripts/module-boundary-gate.mjs"
  "$NODE_PATH" --check "$CIT_ROOT_DIR/scripts/dynamic-boundary-coverage.mjs"
  "$NODE_PATH" --check "$CIT_ROOT_DIR/scripts/dynamic-boundary-artifact-summary.mjs"
  "$NODE_PATH" "$CIT_ROOT_DIR/scripts/dynamic-boundary-coverage.mjs" --format text
  "$NODE_PATH" "$CIT_ROOT_DIR/scripts/module-boundary-gate.mjs" --format text
  "$NODE_PATH" "$CIT_ROOT_DIR/scripts/module-matrix.mjs" \
    --state-dir "$STATE_DIR" \
    --assets-dir "$CIT_ROOT_DIR/assets" \
    --format text
  if [ "$RUN_WORKFLOW_GATE" = "true" ]; then
    bash "$PROJECT_ROOT/.agents/skills/codex-dream-skin-workflow/scripts/workflow-gate.sh" --runtime
  else
    bash "$CIT_ROOT_DIR/tests/run-tests.sh"
  fi
  if [ "$RUN_THEME_PACKS" = "true" ]; then
    bash "$PROJECT_ROOT/theme-packs/validate-packs.sh"
  fi
  if [ -d "$PROJECT_ROOT/.git" ]; then
    git -C "$PROJECT_ROOT" diff --check
  fi
  printf '{"ok":true,"mode":"validate","module":"blackShellTransparency","mutates":false,"launches":false,"clicks":false,"drags":false}\n'
}

run_status_if_cdp_open() {
  if ! cit_port_is_open "$PORT"; then
    cit_warn "CDP port 127.0.0.1:$PORT is not open; skipping live marker status"
    printf '{"ok":true,"mode":"status-if-cdp-open","cdpOpen":false,"scanned":false,"applied":false,"launches":false}\n'
    return 0
  fi
  local scan_args=(--port "$PORT" --format text)
  if [ -n "$OUT_DIR" ]; then
    mkdir -p "$OUT_DIR"
    scan_args+=(--out "$OUT_DIR/black-shell-native-module-scan.json")
  fi
  cit_log "reading black shell marker status from existing CDP port 127.0.0.1:$PORT"
  "$NODE_PATH" "$CIT_ROOT_DIR/scripts/native-module-scan.mjs" "${scan_args[@]}"
  printf '{"ok":true,"mode":"status-if-cdp-open","cdpOpen":true,"scanned":true,"applied":false,"port":%s}\n' "$PORT"
}

run_apply_if_cdp_open() {
  if [ "$VALIDATE_FIRST" = "true" ]; then
    run_validate
  fi
  if ! cit_port_is_open "$PORT"; then
    cit_warn "CDP port 127.0.0.1:$PORT is not open; skipping one-shot apply"
    printf '{"ok":true,"mode":"apply-if-cdp-open","cdpOpen":false,"validated":%s,"applied":false,"launches":false}\n' "$VALIDATE_FIRST"
    return 0
  fi
  cit_log "applying black shell transparency through existing one-shot path on 127.0.0.1:$PORT"
  CIT_STATE_DIR="$STATE_DIR" bash "$CIT_ROOT_DIR/scripts/start.sh" \
    --no-launch \
    --once \
    --port "$PORT" \
    --wait-ms "$WAIT_MS"
  run_status_if_cdp_open
  printf '{"ok":true,"mode":"apply-if-cdp-open","cdpOpen":true,"validated":%s,"applied":true,"port":%s}\n' "$VALIDATE_FIRST" "$PORT"
}

case "$MODE" in
  validate)
    run_validate
    ;;
  status-if-cdp-open)
    run_status_if_cdp_open
    ;;
  apply-if-cdp-open)
    run_apply_if_cdp_open
    ;;
  *)
    cit_die "unknown black shell gate mode: $MODE"
    ;;
esac
