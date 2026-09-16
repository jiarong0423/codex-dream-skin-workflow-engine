#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
# shellcheck source=/dev/null
source "$SCRIPT_DIR/common.sh"

show_help() {
  cat <<'EOF'
Usage: chainsaw-duel-one-click-injector.sh [options]

Options:
  --port <port>             CDP port to use or open. Default: 9341.
  --wait-ms <ms>            CDP wait time for one-shot apply. Default: 8000.
  --pack <pack-id>          Private pack id. Default: anime-chainsaw-train-duel.
  --formal true|false       Apply the formal theme first. Default: true.
  --private true|false      Apply the private overlay. Default: true.
  --gate true|false         Run runtime gate before apply. Default: true.
  --open-cdp true|false     Open port through start.sh if absent. Default: true.
  --force-quit              If Codex is running without CDP and graceful quit times out, send TERM.
  --dry-run                 Build and budget-check only; no CDP apply.
  --remove                  Remove private overlay only; does not restore formal theme.
  -h, --help                Show help.

Chainsaw duel one-click injector.

This command writes only ignored private loader manifests, then optionally
opens CDP on 127.0.0.1:9341 through the existing formal start.sh one-shot path.
It never daemonizes, clicks, drags, deletes assets, modifies the official app
bundle, or activates the private pack as a formal animal pack.
EOF
}

PACK_ID="anime-chainsaw-train-duel"
PORT="$CIT_DEFAULT_PORT"
WAIT_MS=8000
APPLY_FORMAL="true"
APPLY_PRIVATE="true"
RUN_GATE="true"
OPEN_CDP="true"
FORCE_QUIT="false"
MODE="apply"

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
    --pack)
      [ "$#" -ge 2 ] || cit_die "--pack requires a value"
      PACK_ID="$2"
      shift 2
      ;;
    --formal)
      [ "$#" -ge 2 ] || cit_die "--formal requires true or false"
      APPLY_FORMAL="$2"
      shift 2
      ;;
    --private)
      [ "$#" -ge 2 ] || cit_die "--private requires true or false"
      APPLY_PRIVATE="$2"
      shift 2
      ;;
    --gate)
      [ "$#" -ge 2 ] || cit_die "--gate requires true or false"
      RUN_GATE="$2"
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
      MODE="dry-run"
      shift
      ;;
    --remove)
      MODE="remove"
      APPLY_FORMAL="false"
      shift
      ;;
    -h|--help)
      show_help
      exit 0
      ;;
    *)
      cit_die "unknown chainsaw-duel-one-click-injector option: $1"
      ;;
  esac
done

case "$PACK_ID" in
  *[!a-z0-9-]*|'') cit_die "--pack must use lowercase letters, numbers, and hyphens: $PACK_ID" ;;
esac
case "$PORT" in
  ''|*[!0-9]*) cit_die "port must be numeric: $PORT" ;;
esac
case "$WAIT_MS" in
  ''|*[!0-9]*) cit_die "wait-ms must be numeric: $WAIT_MS" ;;
esac
case "$APPLY_FORMAL" in
  true|false) ;;
  *) cit_die "--formal must be true or false" ;;
esac
case "$APPLY_PRIVATE" in
  true|false) ;;
  *) cit_die "--private must be true or false" ;;
esac
case "$RUN_GATE" in
  true|false) ;;
  *) cit_die "--gate must be true or false" ;;
esac
case "$OPEN_CDP" in
  true|false) ;;
  *) cit_die "--open-cdp must be true or false" ;;
esac

cit_assert_source_layout
APP_PATH="$(cit_detect_app_or_die)"
NODE_PATH="$(cit_node_for_app "$APP_PATH")"
NODE_DIR="$(cd "$(dirname "$NODE_PATH")" >/dev/null 2>&1 && pwd)"
PROJECT_ROOT="$(cd "$CIT_ROOT_DIR/.." >/dev/null 2>&1 && pwd)"
PRIVATE_ROOT="$PROJECT_ROOT/theme-packs/private-packs"
PRIVATE_PACK_DIR="$PRIVATE_ROOT/$PACK_ID"
PRIVATE_LOADER="$PROJECT_ROOT/theme-packs/scripts/private-pack-loader.mjs"
PRIVATE_INJECTOR="$PROJECT_ROOT/theme-packs/scripts/private-duel-injector.mjs"
WORKFLOW_GATE="$PROJECT_ROOT/.agents/skills/codex-dream-skin-workflow/scripts/workflow-gate.sh"

[ -d "$PRIVATE_PACK_DIR" ] || cit_die "unknown private pack: $PACK_ID"
[ -f "$PRIVATE_LOADER" ] || cit_die "missing private pack loader: $PRIVATE_LOADER"
[ -f "$PRIVATE_INJECTOR" ] || cit_die "missing private duel injector: $PRIVATE_INJECTOR"

cd "$PROJECT_ROOT"

cit_log "chainsaw duel one-click injector pack=$PACK_ID mode=$MODE port=$PORT"
cit_log "building private runtime manifest"
"$NODE_PATH" "$PRIVATE_LOADER" build --pack "$PACK_ID" --format text

cit_log "staging private one-shot apply bridge"
"$NODE_PATH" "$PRIVATE_LOADER" stage-apply --pack "$PACK_ID" --format text

cit_log "checking private injector payload budget"
"$NODE_PATH" "$PRIVATE_INJECTOR" --pack "$PACK_ID" --dry-run --format text

if [ "$RUN_GATE" = "true" ]; then
  [ -f "$WORKFLOW_GATE" ] || cit_die "missing workflow gate: $WORKFLOW_GATE"
  cit_log "running runtime gate"
  PATH="$NODE_DIR:$PATH" bash "$WORKFLOW_GATE" --runtime
fi

if [ "$MODE" = "dry-run" ]; then
  printf '{"ok":true,"pack":"%s","mode":"dry-run","applied":false,"formal":false,"private":false}\n' "$PACK_ID"
  exit 0
fi

if [ "$MODE" = "remove" ]; then
  if ! cit_port_is_open "$PORT"; then
    cit_die "CDP port 127.0.0.1:$PORT is not open; remove mode will not launch Codex."
  fi
  cit_log "removing private overlay once from existing CDP port 127.0.0.1:$PORT"
  "$NODE_PATH" "$PRIVATE_INJECTOR" --pack "$PACK_ID" --port "$PORT" --wait-ms "$WAIT_MS" --remove --format text
  printf '{"ok":true,"pack":"%s","mode":"remove","applied":true,"formal":false,"private":true,"port":%s}\n' "$PACK_ID" "$PORT"
  exit 0
fi

FORMAL_ALREADY_APPLIED="false"
if ! cit_port_is_open "$PORT"; then
  if [ "$OPEN_CDP" != "true" ]; then
    cit_die "CDP port 127.0.0.1:$PORT is not open. Pass --open-cdp true to launch through start.sh."
  fi
  START_ARGS=(--once --port "$PORT" --wait-ms "$WAIT_MS")
  if cit_is_app_running "$APP_PATH"; then
    cit_log "Codex is running without CDP; reopening through formal start.sh restart path"
    START_ARGS=(--restart "${START_ARGS[@]}")
    if [ "$FORCE_QUIT" = "true" ]; then
      START_ARGS=(--force-quit "${START_ARGS[@]}")
    fi
  else
    cit_log "CDP is absent; opening Codex through formal start.sh on 127.0.0.1:$PORT"
  fi
  bash "$CIT_ROOT_DIR/scripts/start.sh" "${START_ARGS[@]}"
  FORMAL_ALREADY_APPLIED="true"
fi

if [ "$APPLY_FORMAL" = "true" ] && [ "$FORMAL_ALREADY_APPLIED" != "true" ]; then
  cit_log "applying formal theme once to existing CDP port 127.0.0.1:$PORT"
  bash "$CIT_ROOT_DIR/scripts/start.sh" --no-launch --once --port "$PORT" --wait-ms "$WAIT_MS"
fi

if [ "$APPLY_PRIVATE" = "true" ]; then
  cit_log "applying private Chainsaw overlay once to existing CDP port 127.0.0.1:$PORT"
  "$NODE_PATH" "$PRIVATE_INJECTOR" --pack "$PACK_ID" --port "$PORT" --wait-ms "$WAIT_MS" --once --format text
fi

printf '{"ok":true,"pack":"%s","mode":"apply","applied":true,"formal":%s,"private":%s,"port":%s}\n' "$PACK_ID" "$APPLY_FORMAL" "$APPLY_PRIVATE" "$PORT"
