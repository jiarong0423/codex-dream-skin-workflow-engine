#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
source "$SCRIPT_DIR/common.sh"

show_help() {
  cat <<'EOF'
Usage: start.sh [options]

Options:
  --port <port>       CDP port. Default: 9341, auto-increments if occupied.
  --restart           Ask Codex to quit before relaunching with CDP.
  --force-quit        If graceful quit times out, send TERM to the Codex main process.
  --no-launch         Do not launch Codex; inject into an already debug-enabled port.
  --launch-only       Launch Codex with CDP and exit without injecting a theme.
  --once              Apply once and exit instead of keeping the daemon alive.
  --framework-only    Apply owner-lock/quarantine framework only; no visual assets.
  --carrier-only      Apply structural carrier modules only; no visual assets.
  --control-only      Apply atomic control workbench only; no visual assets.
  --image <path>      Import an image before launch and make it the active theme.
  --name <name>       Theme name used with --image.
  --wait-ms <ms>      Time to wait for CDP. Default: 20000.
  -h, --help          Show help.
EOF
}

stop_app_for_relaunch() {
  local reason="$1"
  if ! cit_is_app_running "$APP_PATH"; then
    return 0
  fi

  cit_log "$reason"
  cit_quit_app "$APP_PATH" || cit_die "failed to ask Codex to quit"
  if ! cit_wait_for_app_exit "$APP_PATH" 20; then
    if [ "$FORCE_QUIT" = "1" ]; then
      cit_warn "Codex did not exit within 20 seconds; sending TERM to main process"
      cit_force_quit_app "$APP_PATH"
      cit_wait_for_app_exit "$APP_PATH" 10 || cit_die "Codex did not exit after TERM"
    else
      cit_die "Codex did not exit within 20 seconds"
    fi
  fi
}

launch_codex_with_cdp() {
  local owner_status=1

  cit_log "launching Codex via macOS open with CDP bound to 127.0.0.1:$PORT"
  cit_launch_app_with_cdp_open "$APP_PATH" "$PORT"
  if cit_wait_for_cdp_listener_owner "$APP_PATH" "$PORT" 12; then
    cit_log "confirmed CDP listener ownership for Codex on 127.0.0.1:$PORT"
    return 0
  fi
  owner_status="$?"
  if [ "$owner_status" -eq 2 ]; then
    cit_warn "lsof is unavailable; skipping CDP listener ownership check"
    return 0
  fi
  if [ "$owner_status" -eq 3 ]; then
    cit_die "port $PORT is listening outside the Codex process tree; refusing to inject"
  fi

  cit_warn "Codex did not expose a Codex-owned CDP listener after macOS open; trying direct executable fallback"
  stop_app_for_relaunch "stopping Codex before direct executable fallback"

  cit_log "launching Codex bundle executable with CDP bound to 127.0.0.1:$PORT"
  cit_launch_app_with_cdp_direct "$APP_PATH" "$PORT"
  if cit_wait_for_cdp_listener_owner "$APP_PATH" "$PORT" 12; then
    cit_log "confirmed CDP listener ownership for Codex on 127.0.0.1:$PORT"
    return 0
  fi
  owner_status="$?"
  if [ "$owner_status" -eq 2 ]; then
    cit_warn "lsof is unavailable; injector will wait for CDP readiness"
    return 0
  fi
  if [ "$owner_status" -eq 3 ]; then
    cit_die "port $PORT is listening outside the Codex process tree after fallback; refusing to inject"
  fi

  cit_warn "CDP listener is not visible yet; injector will continue waiting"
}

PORT="$CIT_DEFAULT_PORT"
PORT_EXPLICIT=0
RESTART=0
FORCE_QUIT=0
NO_LAUNCH=0
LAUNCH_ONLY=0
ONCE=0
FRAMEWORK_ONLY=0
CARRIER_ONLY=0
CONTROL_ONLY=0
WAIT_MS=20000
IMAGE_PATH=""
THEME_NAME=""

while [ "$#" -gt 0 ]; do
  case "$1" in
    --port)
      [ "$#" -ge 2 ] || cit_die "--port requires a value"
      PORT="$2"
      PORT_EXPLICIT=1
      shift 2
      ;;
    --restart)
      RESTART=1
      shift
      ;;
    --force-quit)
      FORCE_QUIT=1
      shift
      ;;
    --no-launch)
      NO_LAUNCH=1
      shift
      ;;
    --launch-only)
      LAUNCH_ONLY=1
      shift
      ;;
    --once)
      ONCE=1
      shift
      ;;
    --framework-only)
      FRAMEWORK_ONLY=1
      shift
      ;;
    --carrier-only)
      CARRIER_ONLY=1
      shift
      ;;
    --control-only)
      CONTROL_ONLY=1
      shift
      ;;
    --image)
      [ "$#" -ge 2 ] || cit_die "--image requires a value"
      IMAGE_PATH="$2"
      shift 2
      ;;
    --name)
      [ "$#" -ge 2 ] || cit_die "--name requires a value"
      THEME_NAME="$2"
      shift 2
      ;;
    --wait-ms)
      [ "$#" -ge 2 ] || cit_die "--wait-ms requires a value"
      WAIT_MS="$2"
      shift 2
      ;;
    -h|--help)
      show_help
      exit 0
      ;;
    *)
      cit_die "unknown start option: $1"
      ;;
  esac
done

case "$PORT" in
  ''|*[!0-9]*) cit_die "port must be numeric: $PORT" ;;
esac
case "$WAIT_MS" in
  ''|*[!0-9]*) cit_die "wait-ms must be numeric: $WAIT_MS" ;;
esac

cit_require_command plutil
cit_assert_source_layout
APP_PATH="$(cit_detect_app_or_die)"
NODE_PATH="$(cit_node_for_app "$APP_PATH")"
cit_ensure_state_dirs

LOAD_MODE_COUNT=$((FRAMEWORK_ONLY + CARRIER_ONLY + CONTROL_ONLY))
if [ "$LOAD_MODE_COUNT" -gt 1 ]; then
  cit_die "choose only one load mode: --framework-only, --carrier-only, or --control-only"
fi
if [ "$LAUNCH_ONLY" = "1" ] && [ "$NO_LAUNCH" = "1" ]; then
  cit_die "choose only one launch policy: --launch-only or --no-launch"
fi
if [ "$LAUNCH_ONLY" = "1" ] && { [ "$ONCE" = "1" ] || [ "$FRAMEWORK_ONLY" = "1" ] || [ "$CARRIER_ONLY" = "1" ] || [ "$CONTROL_ONLY" = "1" ]; }; then
  cit_die "--launch-only cannot be combined with --once or theme load modes"
fi
if [ "$CONTROL_ONLY" = "1" ] && [ "$ONCE" != "1" ]; then
  cit_die "--control-only is one-shot only; use --once"
fi

"$NODE_PATH" "$CIT_ROOT_DIR/scripts/theme-store.mjs" init \
  --state-dir "$CIT_STATE_DIR" \
  --assets-dir "$CIT_ROOT_DIR/assets" >/dev/null

if [ -n "$IMAGE_PATH" ]; then
  THEME_ARGS=(set-image --state-dir "$CIT_STATE_DIR" --assets-dir "$CIT_ROOT_DIR/assets" --image "$IMAGE_PATH")
  if [ -n "$THEME_NAME" ]; then
    THEME_ARGS+=(--name "$THEME_NAME")
  fi
  "$NODE_PATH" "$CIT_ROOT_DIR/scripts/theme-store.mjs" "${THEME_ARGS[@]}"
fi

if [ "$NO_LAUNCH" = "0" ]; then
  if cit_is_app_running "$APP_PATH"; then
    if [ "$RESTART" = "1" ]; then
      stop_app_for_relaunch "asking Codex to quit before relaunch"
    else
      cit_die "Codex is already running. Close it first or pass --restart."
    fi
  fi

  PORT="$(cit_pick_port "$PORT" "$PORT_EXPLICIT")"
  launch_codex_with_cdp
else
  cit_log "skipping launch; using existing CDP port 127.0.0.1:$PORT"
fi

if [ "$LAUNCH_ONLY" = "1" ]; then
  cit_log "launch-only complete on 127.0.0.1:$PORT"
  printf '{"ok":true,"launchOnly":true,"port":%s}\n' "$PORT"
  exit 0
fi

if [ "$ONCE" = "1" ]; then
  INJECTOR_MODE_ARGS=(--once)
  if [ "$FRAMEWORK_ONLY" = "1" ]; then
    INJECTOR_MODE_ARGS+=(--framework-only)
  fi
  if [ "$CARRIER_ONLY" = "1" ]; then
    INJECTOR_MODE_ARGS+=(--carrier-only)
  fi
  if [ "$CONTROL_ONLY" = "1" ]; then
    INJECTOR_MODE_ARGS+=(--control-only)
  fi
  "$NODE_PATH" "$CIT_ROOT_DIR/scripts/injector.mjs" \
    --port "$PORT" \
    --state-dir "$CIT_STATE_DIR" \
    --wait-ms "$WAIT_MS" \
    "${INJECTOR_MODE_ARGS[@]}"
else
  INJECTOR_MODE_ARGS=(--daemon)
  if [ "$FRAMEWORK_ONLY" = "1" ]; then
    INJECTOR_MODE_ARGS+=(--framework-only)
  fi
  if [ "$CARRIER_ONLY" = "1" ]; then
    INJECTOR_MODE_ARGS+=(--carrier-only)
  fi
  exec "$NODE_PATH" "$CIT_ROOT_DIR/scripts/injector.mjs" \
    --port "$PORT" \
    --state-dir "$CIT_STATE_DIR" \
    --wait-ms "$WAIT_MS" \
    "${INJECTOR_MODE_ARGS[@]}"
fi
