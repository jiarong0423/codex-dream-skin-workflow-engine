#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
source "$SCRIPT_DIR/common.sh"

show_help() {
  cat <<'EOF'
Usage: atomic-ui-automation-gate.sh [--port <port>] [--out-dir <absolute-path>] [--wait-ms <ms>]
                                    [--load-mode visual|carrier-only|framework-only|control-only]
                                    [--interact true|false] [--allow-stateful-controls true|false]
                                    [--launch-if-missing true|false]
                                    [--auto-allowlist true|false]
                                    [--verify-local-control-clicks true|false]
                                    [--allow-indexes <csv>] [--drag true|false]

Runs an atomic no-launch automation pipeline against an already debug-enabled
Codex renderer:
  1. module matrix;
  2. native scan before apply;
  3. read-only interface field inventory before apply;
  4. one-shot apply with the selected load mode;
  5. verify screenshot and computed state;
  6. native scan and read-only interface field inventory after apply;
  7. clickable audit dry-run inventory;
  8. optional reviewed interactive click pass;
  9. restore and post-restore native scan.

Defaults are no launch, no restart, no click, no drag, and carrier-only mode.
If --launch-if-missing true is provided, the gate may launch Codex only when it
is not already running; it still refuses to restart or attach to a running app
without CDP.
Interactive mode requires --interact true plus either explicit --allow-indexes
or --auto-allowlist true. The derived allowlist is generated from the dry-run
report and refuses delete, remove, archive, sign-out, permission, write, push,
apply-to-service, source-preview, or high-memory preview drag candidates.
EOF
}

PORT="$CIT_DEFAULT_PORT"
WAIT_MS=8000
OUT_DIR=""
LOAD_MODE="carrier-only"
INTERACT="false"
ALLOW_STATEFUL_CONTROLS="false"
LAUNCH_IF_MISSING="false"
AUTO_ALLOWLIST="false"
VERIFY_LOCAL_CONTROL_CLICKS="false"
ALLOW_INDEXES=""
DRAG="false"

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
    --wait-ms)
      [ "$#" -ge 2 ] || cit_die "--wait-ms requires a value"
      WAIT_MS="$2"
      shift 2
      ;;
    --load-mode)
      [ "$#" -ge 2 ] || cit_die "--load-mode requires a value"
      LOAD_MODE="$2"
      shift 2
      ;;
    --interact)
      [ "$#" -ge 2 ] || cit_die "--interact requires a value"
      INTERACT="$2"
      shift 2
      ;;
    --allow-stateful-controls)
      [ "$#" -ge 2 ] || cit_die "--allow-stateful-controls requires a value"
      ALLOW_STATEFUL_CONTROLS="$2"
      shift 2
      ;;
    --launch-if-missing)
      [ "$#" -ge 2 ] || cit_die "--launch-if-missing requires a value"
      LAUNCH_IF_MISSING="$2"
      shift 2
      ;;
    --auto-allowlist)
      [ "$#" -ge 2 ] || cit_die "--auto-allowlist requires a value"
      AUTO_ALLOWLIST="$2"
      shift 2
      ;;
    --verify-local-control-clicks)
      [ "$#" -ge 2 ] || cit_die "--verify-local-control-clicks requires a value"
      VERIFY_LOCAL_CONTROL_CLICKS="$2"
      shift 2
      ;;
    --allow-indexes)
      [ "$#" -ge 2 ] || cit_die "--allow-indexes requires a value"
      ALLOW_INDEXES="$2"
      shift 2
      ;;
    --drag)
      [ "$#" -ge 2 ] || cit_die "--drag requires a value"
      DRAG="$2"
      shift 2
      ;;
    -h|--help)
      show_help
      exit 0
      ;;
    *)
      cit_die "unknown atomic automation option: $1"
      ;;
  esac
done

case "$PORT" in
  ''|*[!0-9]*) cit_die "port must be numeric: $PORT" ;;
esac
case "$WAIT_MS" in
  ''|*[!0-9]*) cit_die "wait-ms must be numeric: $WAIT_MS" ;;
esac
case "$LOAD_MODE" in
  visual|carrier-only|framework-only|control-only) ;;
  *) cit_die "load-mode must be visual, carrier-only, framework-only, or control-only: $LOAD_MODE" ;;
esac
case "$INTERACT" in
  true|false) ;;
  *) cit_die "--interact must be true or false" ;;
esac
case "$ALLOW_STATEFUL_CONTROLS" in
  true|false) ;;
  *) cit_die "--allow-stateful-controls must be true or false" ;;
esac
case "$LAUNCH_IF_MISSING" in
  true|false) ;;
  *) cit_die "--launch-if-missing must be true or false" ;;
esac
case "$AUTO_ALLOWLIST" in
  true|false) ;;
  *) cit_die "--auto-allowlist must be true or false" ;;
esac
case "$VERIFY_LOCAL_CONTROL_CLICKS" in
  true|false) ;;
  *) cit_die "--verify-local-control-clicks must be true or false" ;;
esac
case "$DRAG" in
  true|false) ;;
  *) cit_die "--drag must be true or false" ;;
esac

if [ "$VERIFY_LOCAL_CONTROL_CLICKS" = "true" ] && [ "$LOAD_MODE" != "control-only" ]; then
  cit_die "--verify-local-control-clicks requires --load-mode control-only"
fi

if [ "$INTERACT" = "true" ] && [ -z "$ALLOW_INDEXES" ] && [ "$AUTO_ALLOWLIST" != "true" ]; then
  cit_die "interactive atomic automation requires explicit --allow-indexes or --auto-allowlist true"
fi

if [ -z "$OUT_DIR" ]; then
  OUT_DIR="$CIT_ROOT_DIR/previews/atomic-ui-automation-$(date +%Y%m%d-%H%M%S)"
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
  if [ "$LAUNCH_IF_MISSING" != "true" ]; then
    cit_die "CDP port 127.0.0.1:$PORT is not open; refusing to launch or restart Codex"
  fi
  if cit_is_app_running "$APP_PATH"; then
    cit_die "Codex is already running without CDP on 127.0.0.1:$PORT; refusing to restart"
  fi
  cit_log "CDP port 127.0.0.1:$PORT is closed; launching Codex without applying a theme"
  bash "$SCRIPT_DIR/start.sh" \
    --launch-only \
    --port "$PORT" \
    --wait-ms "$WAIT_MS" >"$OUT_DIR/00-launch-only.json"
fi

MODE_ARGS=()
case "$LOAD_MODE" in
  carrier-only) MODE_ARGS=(--carrier-only) ;;
  framework-only) MODE_ARGS=(--framework-only) ;;
  control-only) MODE_ARGS=(--control-only) ;;
  visual) MODE_ARGS=() ;;
esac

APPLIED=0
restore_if_needed() {
  if [ "$APPLIED" = "1" ]; then
    cit_warn "restoring after interrupted atomic UI automation gate"
    bash "$SCRIPT_DIR/restore.sh" --port "$PORT" >/dev/null 2>&1 || true
  fi
}
trap restore_if_needed EXIT

cit_log "atomic UI automation output: $OUT_DIR"
printf '{"loadMode":"%s","interact":%s,"allowStatefulControls":%s,"launchIfMissing":%s,"autoAllowlist":%s,"verifyLocalControlClicks":%s,"drag":%s}\n' \
  "$LOAD_MODE" "$INTERACT" "$ALLOW_STATEFUL_CONTROLS" "$LAUNCH_IF_MISSING" "$AUTO_ALLOWLIST" "$VERIFY_LOCAL_CONTROL_CLICKS" "$DRAG" >"$OUT_DIR/00-options.json"

"$NODE_PATH" "$SCRIPT_DIR/module-matrix.mjs" \
  --state-dir "$CIT_STATE_DIR" \
  --assets-dir "$CIT_ROOT_DIR/assets" \
  --format json >"$OUT_DIR/01-module-matrix.json"

"$NODE_PATH" "$SCRIPT_DIR/native-module-scan.mjs" \
  --port "$PORT" \
  --format json \
  --out "$OUT_DIR/02-before-native.json" >/dev/null

"$NODE_PATH" "$SCRIPT_DIR/interface-field-inventory.mjs" \
  --port "$PORT" \
  --samples 3 \
  --interval-ms 700 \
  --out "$OUT_DIR/03-before-interface-fields.json" \
  --format text >"$OUT_DIR/03-before-interface-fields.txt"

bash "$SCRIPT_DIR/start.sh" \
  --no-launch \
  --once \
  --port "$PORT" \
  --wait-ms "$WAIT_MS" \
  "${MODE_ARGS[@]}" >"$OUT_DIR/04-apply.json"
APPLIED=1

if ! bash "$SCRIPT_DIR/verify.sh" \
  --port "$PORT" \
  --screenshot "$OUT_DIR/05-after-apply.png" >"$OUT_DIR/05-after-apply-verify.json"; then
  if [ "$LOAD_MODE" != "control-only" ]; then
    cit_die "visual verify failed after apply"
  fi
  "$NODE_PATH" - "$OUT_DIR/05-after-apply-verify.json" <<'JS'
const fs = require("fs");
const report = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const hasControlOnlyMarker = Array.isArray(report.targets)
  && report.targets.some((target) => target && target.ok && target.result && target.result.hasStyle === true && target.result.hasMarker === true);
if (!hasControlOnlyMarker) {
  throw new Error("control-only verify requires style and marker before workbench verification");
}
JS
fi

if [ "$LOAD_MODE" = "control-only" ]; then
  "$NODE_PATH" "$SCRIPT_DIR/control-workbench-live-verify.mjs" \
    --port "$PORT" \
    --out-dir "$OUT_DIR/05-control-workbench" \
    --click-local-controls "$VERIFY_LOCAL_CONTROL_CLICKS" \
    --screenshot true \
    --format text >"$OUT_DIR/05-control-workbench-verify.txt"
fi

"$NODE_PATH" "$SCRIPT_DIR/native-module-scan.mjs" \
  --port "$PORT" \
  --format json \
  --out "$OUT_DIR/06-after-native.json" >/dev/null

"$NODE_PATH" "$SCRIPT_DIR/interface-field-inventory.mjs" \
  --port "$PORT" \
  --samples 3 \
  --interval-ms 700 \
  --out "$OUT_DIR/07-after-interface-fields.json" \
  --format text >"$OUT_DIR/07-after-interface-fields.txt"

"$NODE_PATH" "$SCRIPT_DIR/live-clickable-surface-audit.mjs" \
  --port "$PORT" \
  --out-dir "$OUT_DIR/08-clickable-dry-run" \
  --dry-run true \
  --interact false \
  --allow-stateful-controls "$ALLOW_STATEFUL_CONTROLS" \
  --drag false \
  --format text >"$OUT_DIR/08-clickable-dry-run.txt"

if [ "$INTERACT" = "true" ]; then
  if [ -z "$ALLOW_INDEXES" ] && [ "$AUTO_ALLOWLIST" = "true" ]; then
    "$NODE_PATH" "$SCRIPT_DIR/derive-clickable-allowlist.mjs" \
      --report "$OUT_DIR/08-clickable-dry-run/clickable-surface-audit.json" \
      --out "$OUT_DIR/09-derived-allowlist.json" \
      --include-stateful "$ALLOW_STATEFUL_CONTROLS" \
      --format text >"$OUT_DIR/09-derived-allowlist.txt"
    ALLOW_INDEXES="$("$NODE_PATH" -e 'const fs=require("fs"); const p=process.argv[1]; const j=JSON.parse(fs.readFileSync(p,"utf8")); process.stdout.write(j.indexesCsv || "");' "$OUT_DIR/09-derived-allowlist.json")"
  fi
  if [ -z "$ALLOW_INDEXES" ]; then
    cit_warn "derived clickable allowlist is empty; skipping interactive pass"
  else
  "$NODE_PATH" "$SCRIPT_DIR/live-clickable-surface-audit.mjs" \
    --port "$PORT" \
    --out-dir "$OUT_DIR/10-clickable-reviewed-interact" \
    --dry-run false \
    --interact true \
    --allow-stateful-controls "$ALLOW_STATEFUL_CONTROLS" \
    --allow-indexes "$ALLOW_INDEXES" \
    --drag "$DRAG" \
    --format text >"$OUT_DIR/10-clickable-reviewed-interact.txt"
  fi
fi

bash "$SCRIPT_DIR/restore.sh" --port "$PORT" >"$OUT_DIR/11-restore.json"
APPLIED=0

"$NODE_PATH" "$SCRIPT_DIR/native-module-scan.mjs" \
  --port "$PORT" \
  --format json \
  --out "$OUT_DIR/12-after-restore-native.json" >/dev/null

cit_log "atomic UI automation gate complete"
printf '%s\n' "$OUT_DIR"
