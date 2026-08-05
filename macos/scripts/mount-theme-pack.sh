#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
source "$SCRIPT_DIR/common.sh"

show_help() {
  cat <<'EOF'
Usage: mount-theme-pack.sh --pack <pack-id> [options]

Options:
  --pack <pack-id>          Theme pack id to activate and mount.
  --port <port>             Existing CDP port. Default: 9341.
  --wait-ms <ms>            CDP wait time for one-shot apply. Default: 8000.
  --apply true|false        Apply to an existing CDP renderer. Default: true.
  --validate true|false     Run local asset and pack validation first. Default: true.
  --state-dir <dir>         Override local active-theme state directory.
  -h, --help                Show help.

This command never launches Codex, restarts Codex, restores, clicks, drags,
deletes assets, or changes permissions. It writes only the local active theme
state through activate-pack.mjs, then optionally applies once to an already
debug-enabled Codex renderer.
EOF
}

PACK_ID=""
PORT="$CIT_DEFAULT_PORT"
WAIT_MS=8000
APPLY_THEME="true"
VALIDATE_ASSETS="true"
STATE_DIR="$CIT_STATE_DIR"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --pack)
      [ "$#" -ge 2 ] || cit_die "--pack requires a value"
      PACK_ID="$2"
      shift 2
      ;;
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
    --apply)
      [ "$#" -ge 2 ] || cit_die "--apply requires true or false"
      APPLY_THEME="$2"
      shift 2
      ;;
    --validate)
      [ "$#" -ge 2 ] || cit_die "--validate requires true or false"
      VALIDATE_ASSETS="$2"
      shift 2
      ;;
    --state-dir)
      [ "$#" -ge 2 ] || cit_die "--state-dir requires a value"
      STATE_DIR="$2"
      shift 2
      ;;
    -h|--help)
      show_help
      exit 0
      ;;
    *)
      cit_die "unknown mount-theme-pack option: $1"
      ;;
  esac
done

[ -n "$PACK_ID" ] || cit_die "missing required option: --pack"
case "$PACK_ID" in
  *[!a-z0-9-]*|'') cit_die "--pack must use lowercase letters, numbers, and hyphens: $PACK_ID" ;;
esac
case "$PORT" in
  ''|*[!0-9]*) cit_die "port must be numeric: $PORT" ;;
esac
case "$WAIT_MS" in
  ''|*[!0-9]*) cit_die "wait-ms must be numeric: $WAIT_MS" ;;
esac
case "$APPLY_THEME" in
  true|false) ;;
  *) cit_die "--apply must be true or false" ;;
esac
case "$VALIDATE_ASSETS" in
  true|false) ;;
  *) cit_die "--validate must be true or false" ;;
esac

cit_assert_source_layout
APP_PATH="$(cit_detect_app_or_die)"
NODE_PATH="$(cit_node_for_app "$APP_PATH")"
PROJECT_ROOT="$(cd "$CIT_ROOT_DIR/.." >/dev/null 2>&1 && pwd)"
PACK_ROOT="$PROJECT_ROOT/theme-packs"
PACK_SCRIPT="$PACK_ROOT/scripts/activate-pack.mjs"

[ -f "$PACK_SCRIPT" ] || cit_die "missing theme pack activation script: $PACK_SCRIPT"
[ -d "$PACK_ROOT/$PACK_ID" ] || cit_die "unknown theme pack: $PACK_ID"

if [ "$VALIDATE_ASSETS" = "true" ]; then
  cit_log "running strict local asset standard"
  "$NODE_PATH" "$CIT_ROOT_DIR/scripts/local-asset-standard.mjs" --strict true --format text

  cit_log "running theme-pack validator"
  bash "$PACK_ROOT/validate-packs.sh"
fi

cit_log "activating theme pack: $PACK_ID"
"$NODE_PATH" "$PACK_SCRIPT" activate \
  --pack "$PACK_ID" \
  --state-dir "$STATE_DIR" \
  --assets-dir "$CIT_ROOT_DIR/assets" \
  --format text

if [ "$APPLY_THEME" = "false" ]; then
  cit_log "apply skipped by --apply false"
  printf '{"ok":true,"pack":"%s","activated":true,"applied":false,"stateDir":"%s"}\n' "$PACK_ID" "$STATE_DIR"
  exit 0
fi

if ! cit_port_is_open "$PORT"; then
  cit_die "CDP port 127.0.0.1:$PORT is not open. Start Codex with CDP first, or run start.sh --launch-only explicitly."
fi

cit_log "applying active theme once to existing CDP port 127.0.0.1:$PORT"
CIT_STATE_DIR="$STATE_DIR" bash "$CIT_ROOT_DIR/scripts/start.sh" \
  --no-launch \
  --once \
  --visual \
  --port "$PORT" \
  --wait-ms "$WAIT_MS"

printf '{"ok":true,"pack":"%s","activated":true,"applied":true,"port":%s,"stateDir":"%s"}\n' "$PACK_ID" "$PORT" "$STATE_DIR"
