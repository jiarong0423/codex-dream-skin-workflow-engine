#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
# shellcheck source=/dev/null
source "$SCRIPT_DIR/common.sh"

show_help() {
  cat <<'EOF'
Usage: revision-loop-one-click.sh [options]

Options:
  --port <port>             CDP port to check, apply, and scan. Default: 9341.
  --wait-ms <ms>            Wait time for apply and scans. Default: 8000.
  --scan-wait-ms <ms>       Per-route scan wait time. Default: 1800.
  --labels <comma-list>     Route labels to scan. Default: 外掛程式,已排程,網站,專案.
  --pack <pack-id>          Private pack id. Default: anime-chainsaw-train-duel.
  --out-dir <absolute-path> Evidence output directory.
  --gate true|false         Run local gates before apply. Default: true.
  --apply true|false        Apply formal/private theme before scan. Default: true.
  --scan true|false         Run queued route black scan. Default: true.
  --open-cdp true|false     Open CDP through start.sh if absent. Default: false.
  --force-quit              Forward force-quit to the injector only when opening CDP.
  --dry-run                 Run gates and CDP check only; no apply and no scan.
  -h, --help                Show help.

Pinned revision loop wrapper.

This script follows docs/PINNED_REVISION_LOOP_STANDARD.md. By default it does
not restart Codex, force quit, daemonize, drag, or click anything beyond the
queued route scanner's fixed allowlisted sidebar labels. It never edits the
official app bundle, app.asar, signatures, login state, API keys, or model
settings.
EOF
}

PORT="$CIT_DEFAULT_PORT"
WAIT_MS=8000
SCAN_WAIT_MS=1800
LABELS="外掛程式,已排程,網站,專案"
PACK_ID="anime-chainsaw-train-duel"
OUT_DIR=""
RUN_GATE="true"
APPLY_THEME="true"
RUN_SCAN="true"
OPEN_CDP="false"
FORCE_QUIT="false"
DRY_RUN="false"

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
    --scan-wait-ms)
      [ "$#" -ge 2 ] || cit_die "--scan-wait-ms requires a value"
      SCAN_WAIT_MS="$2"
      shift 2
      ;;
    --labels)
      [ "$#" -ge 2 ] || cit_die "--labels requires a value"
      LABELS="$2"
      shift 2
      ;;
    --pack)
      [ "$#" -ge 2 ] || cit_die "--pack requires a value"
      PACK_ID="$2"
      shift 2
      ;;
    --out-dir)
      [ "$#" -ge 2 ] || cit_die "--out-dir requires a value"
      OUT_DIR="$2"
      shift 2
      ;;
    --gate)
      [ "$#" -ge 2 ] || cit_die "--gate requires true or false"
      RUN_GATE="$2"
      shift 2
      ;;
    --apply)
      [ "$#" -ge 2 ] || cit_die "--apply requires true or false"
      APPLY_THEME="$2"
      shift 2
      ;;
    --scan)
      [ "$#" -ge 2 ] || cit_die "--scan requires true or false"
      RUN_SCAN="$2"
      shift 2
      ;;
    --open-cdp)
      [ "$#" -ge 2 ] || cit_die "--open-cdp requires true or false"
      OPEN_CDP="$2"
      shift 2
      ;;
    --force-quit)
      FORCE_QUIT="true"
      shift
      ;;
    --dry-run)
      DRY_RUN="true"
      APPLY_THEME="false"
      RUN_SCAN="false"
      shift
      ;;
    -h|--help)
      show_help
      exit 0
      ;;
    *)
      cit_die "unknown revision loop option: $1"
      ;;
  esac
done

case "$PORT" in
  ''|*[!0-9]*) cit_die "port must be numeric: $PORT" ;;
esac
case "$WAIT_MS" in
  ''|*[!0-9]*) cit_die "wait-ms must be numeric: $WAIT_MS" ;;
esac
case "$SCAN_WAIT_MS" in
  ''|*[!0-9]*) cit_die "scan-wait-ms must be numeric: $SCAN_WAIT_MS" ;;
esac
case "$PACK_ID" in
  *[!a-z0-9-]*|'') cit_die "--pack must use lowercase letters, numbers, and hyphens: $PACK_ID" ;;
esac
for bool_value in "$RUN_GATE" "$APPLY_THEME" "$RUN_SCAN" "$OPEN_CDP" "$FORCE_QUIT" "$DRY_RUN"; do
  case "$bool_value" in
    true|false) ;;
    *) cit_die "boolean options must be true or false" ;;
  esac
done
case "$OUT_DIR" in
  ""|/*) ;;
  *) cit_die "--out-dir must be absolute: $OUT_DIR" ;;
esac

cit_assert_source_layout
APP_PATH="$(cit_detect_app_or_die)"
NODE_PATH="$(cit_node_for_app "$APP_PATH")"
NODE_DIR="$(cd "$(dirname "$NODE_PATH")" >/dev/null 2>&1 && pwd)"
PROJECT_ROOT="$(cd "$CIT_ROOT_DIR/.." >/dev/null 2>&1 && pwd)"
WORKFLOW_GATE="$PROJECT_ROOT/.agents/skills/codex-dream-skin-workflow/scripts/workflow-gate.sh"
PINNED_STANDARD="$PROJECT_ROOT/docs/PINNED_REVISION_LOOP_STANDARD.md"
ONE_CLICK="$SCRIPT_DIR/chainsaw-duel-one-click-injector.sh"
QUEUE_SCAN="$SCRIPT_DIR/queued-route-black-scan.sh"
RESTORE_COMMAND="bash macos/scripts/restore.sh --port $PORT"

[ -f "$PINNED_STANDARD" ] || cit_die "missing pinned revision standard: $PINNED_STANDARD"
[ -f "$ONE_CLICK" ] || cit_die "missing one-click injector: $ONE_CLICK"
[ -f "$QUEUE_SCAN" ] || cit_die "missing queued route scanner: $QUEUE_SCAN"

if [ -z "$OUT_DIR" ]; then
  OUT_DIR="$PROJECT_ROOT/macos/previews/revision-loop-$(date +%Y%m%d-%H%M%S)"
fi
mkdir -p "$OUT_DIR"

SUMMARY="$OUT_DIR/REVISION_LOOP_SUMMARY.md"
CDP_TARGETS="$OUT_DIR/00-cdp-targets.json"

write_summary() {
  local status="$1"
  local reason="$2"
  {
    printf '# Pinned Revision Loop Result\n\n'
    printf -- '- status: %s\n' "$status"
    printf -- '- reason: %s\n' "$reason"
    printf -- '- port: %s\n' "$PORT"
    printf -- '- labels: %s\n' "$LABELS"
    printf -- '- pack: %s\n' "$PACK_ID"
    printf -- '- outDir: %s\n' "$OUT_DIR"
    printf -- '- dryRun: %s\n' "$DRY_RUN"
    printf -- '- apply: %s\n' "$APPLY_THEME"
    printf -- '- scan: %s\n' "$RUN_SCAN"
    printf -- '- openCdp: %s\n' "$OPEN_CDP"
    printf -- '- restoreCommand: `%s`\n' "$RESTORE_COMMAND"
  } >"$SUMMARY"
}

cd "$PROJECT_ROOT"

cit_log "revision loop start port=$PORT labels=$LABELS out=$OUT_DIR"
cit_log "pinned standard: $PINNED_STANDARD"

if [ "$RUN_GATE" = "true" ]; then
  cit_log "running local tests"
  if ! bash "$CIT_ROOT_DIR/tests/run-tests.sh" >"$OUT_DIR/01-run-tests.txt" 2>&1; then
    write_summary "STATIC_GATE_FAILED" "macos/tests/run-tests.sh failed"
    cit_warn "local tests failed; wrote $SUMMARY"
    printf 'summary: %s\n' "$SUMMARY"
    printf 'restore: %s\n' "$RESTORE_COMMAND"
    exit 1
  fi

  cit_log "running runtime workflow gate"
  if ! PATH="$NODE_DIR:$PATH" bash "$WORKFLOW_GATE" --runtime >"$OUT_DIR/02-workflow-gate.txt" 2>&1; then
    write_summary "STATIC_GATE_FAILED" "workflow-gate.sh --runtime failed"
    cit_warn "workflow gate failed; wrote $SUMMARY"
    printf 'summary: %s\n' "$SUMMARY"
    printf 'restore: %s\n' "$RESTORE_COMMAND"
    exit 1
  fi

  cit_log "running diff whitespace check"
  if ! git diff --check >"$OUT_DIR/03-git-diff-check.txt" 2>&1; then
    write_summary "STATIC_GATE_FAILED" "git diff --check failed"
    cit_warn "diff check failed; wrote $SUMMARY"
    printf 'summary: %s\n' "$SUMMARY"
    printf 'restore: %s\n' "$RESTORE_COMMAND"
    exit 1
  fi
fi

if curl -fsS "http://127.0.0.1:$PORT/json/list" >"$CDP_TARGETS" 2>"$OUT_DIR/00-cdp-check.err"; then
  cit_log "CDP available at 127.0.0.1:$PORT"
else
  if [ "$OPEN_CDP" != "true" ]; then
    write_summary "VISUAL_GATE_BLOCKED" "CDP 127.0.0.1:$PORT unavailable and --open-cdp is false"
    cit_warn "CDP unavailable; wrote $SUMMARY"
    printf 'restore: %s\n' "$RESTORE_COMMAND"
    exit 2
  fi
  cit_log "CDP unavailable; opening through one-click injector path"
fi

if [ "$DRY_RUN" = "true" ]; then
  write_summary "STATIC_VERIFIED" "dry-run requested; local gates and CDP check completed as configured"
  printf 'summary: %s\n' "$SUMMARY"
  printf 'restore: %s\n' "$RESTORE_COMMAND"
  exit 0
fi

if [ "$APPLY_THEME" = "true" ]; then
  APPLY_ARGS=(
    --port "$PORT"
    --wait-ms "$WAIT_MS"
    --pack "$PACK_ID"
    --open-cdp "$OPEN_CDP"
    --gate false
    --formal true
    --private true
  )
  if [ "$FORCE_QUIT" = "true" ]; then
    APPLY_ARGS+=(--force-quit)
  fi
  cit_log "applying once through Chainsaw injector"
  if ! bash "$ONE_CLICK" "${APPLY_ARGS[@]}" >"$OUT_DIR/04-one-click-apply.txt" 2>&1; then
    write_summary "ROLLBACK_REQUIRED" "one-click apply failed"
    cit_warn "one-click apply failed; wrote $SUMMARY"
    printf 'summary: %s\n' "$SUMMARY"
    printf 'restore: %s\n' "$RESTORE_COMMAND"
    exit 1
  fi
fi

if ! curl -fsS "http://127.0.0.1:$PORT/json/list" >"$OUT_DIR/05-cdp-targets-after-apply.json" 2>"$OUT_DIR/05-cdp-check-after-apply.err"; then
  write_summary "VISUAL_GATE_BLOCKED" "CDP unavailable after apply step"
  cit_warn "CDP unavailable after apply; wrote $SUMMARY"
  printf 'restore: %s\n' "$RESTORE_COMMAND"
  exit 2
fi

if [ "$RUN_SCAN" = "true" ]; then
  SCAN_DIR="$OUT_DIR/06-four-route-black-scan"
  cit_log "running queued four-route black scan"
  if ! bash "$QUEUE_SCAN" \
    --port "$PORT" \
    --labels "$LABELS" \
    --out-dir "$SCAN_DIR" \
    --wait-ms "$SCAN_WAIT_MS" >"$OUT_DIR/06-four-route-black-scan.txt" 2>&1; then
    write_summary "VISUAL_GATE_BLOCKED" "queued route black scan failed"
    cit_warn "queued route scan failed; wrote $SUMMARY"
    printf 'summary: %s\n' "$SUMMARY"
    printf 'restore: %s\n' "$RESTORE_COMMAND"
    exit 2
  fi
  if [ ! -f "$SCAN_DIR/SUMMARY.md" ]; then
    write_summary "VISUAL_GATE_BLOCKED" "queued route scan did not write SUMMARY.md"
    cit_warn "queued route scan did not write SUMMARY.md; wrote $SUMMARY"
    printf 'summary: %s\n' "$SUMMARY"
    printf 'restore: %s\n' "$RESTORE_COMMAND"
    exit 2
  fi
  if grep -Eq 'unmarked=[1-9]|nearBlack=[1-9]' "$SCAN_DIR/SUMMARY.md"; then
    write_summary "ROLLBACK_REQUIRED" "queued route scan still reports near-black or unmarked candidates"
    cit_warn "scan reported candidates; wrote $SUMMARY"
    printf 'scan: %s\n' "$SCAN_DIR/SUMMARY.md"
    printf 'restore: %s\n' "$RESTORE_COMMAND"
    exit 3
  fi
fi

write_summary "DONE_CONFIRMED" "local gates passed, CDP available, apply/scan completed as configured"
printf 'summary: %s\n' "$SUMMARY"
printf 'restore: %s\n' "$RESTORE_COMMAND"
