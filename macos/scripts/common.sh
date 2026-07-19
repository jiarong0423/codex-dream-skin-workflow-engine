#!/usr/bin/env bash
set -euo pipefail

CIT_BUNDLE_ID="com.openai.codex"
CIT_DEFAULT_APP_PATH="/Applications/ChatGPT.app"
CIT_DEFAULT_PORT="${CIT_DEFAULT_PORT:-9341}"
CIT_ENGINE_DIR="${CIT_ENGINE_DIR:-$HOME/.codex/codex-interface-theme}"
CIT_STATE_DIR="${CIT_STATE_DIR:-$HOME/Library/Application Support/CodexInterfaceTheme}"
CIT_LOG_DIR="$CIT_STATE_DIR/logs"
CIT_RUN_DIR="$CIT_STATE_DIR/run"
CIT_THEME_DIR="$CIT_STATE_DIR/themes"
CIT_IMAGE_DIR="$CIT_STATE_DIR/images"

_cit_common_source="${BASH_SOURCE[0]}"
while [ -h "$_cit_common_source" ]; do
  _cit_common_dir="$(cd -P "$(dirname "$_cit_common_source")" >/dev/null 2>&1 && pwd)"
  _cit_common_source="$(readlink "$_cit_common_source")"
  case "$_cit_common_source" in
    /*) ;;
    *) _cit_common_source="$_cit_common_dir/$_cit_common_source" ;;
  esac
done
CIT_SCRIPT_DIR="$(cd -P "$(dirname "$_cit_common_source")" >/dev/null 2>&1 && pwd)"
CIT_ROOT_DIR="$(cd "$CIT_SCRIPT_DIR/.." >/dev/null 2>&1 && pwd)"

cit_log() {
  printf '[codex-interface-theme] %s\n' "$*"
}

cit_warn() {
  printf '[codex-interface-theme][warn] %s\n' "$*" >&2
}

cit_die() {
  printf '[codex-interface-theme][error] %s\n' "$*" >&2
  exit 1
}

cit_require_command() {
  command -v "$1" >/dev/null 2>&1 || cit_die "missing required command: $1"
}

cit_bundle_id_for_app() {
  local app_path="$1"
  local info_plist="$app_path/Contents/Info.plist"
  [ -f "$info_plist" ] || return 1
  plutil -extract CFBundleIdentifier raw "$info_plist" 2>/dev/null || return 1
}

cit_executable_for_app() {
  local app_path="$1"
  local info_plist="$app_path/Contents/Info.plist"
  [ -f "$info_plist" ] || return 1
  plutil -extract CFBundleExecutable raw "$info_plist" 2>/dev/null || return 1
}

cit_executable_path_for_app() {
  local app_path="$1"
  local executable_name
  executable_name="$(cit_executable_for_app "$app_path" 2>/dev/null || true)"
  [ -n "$executable_name" ] || return 1
  printf '%s\n' "$app_path/Contents/MacOS/$executable_name"
}

cit_find_app() {
  local candidate
  if [ -n "${CIT_APP_PATH:-}" ] && [ -d "$CIT_APP_PATH" ]; then
    printf '%s\n' "$CIT_APP_PATH"
    return 0
  fi

  if [ -d "$CIT_DEFAULT_APP_PATH" ]; then
    candidate_id="$(cit_bundle_id_for_app "$CIT_DEFAULT_APP_PATH" 2>/dev/null || true)"
    if [ "$candidate_id" = "$CIT_BUNDLE_ID" ]; then
      printf '%s\n' "$CIT_DEFAULT_APP_PATH"
      return 0
    fi
  fi

  if command -v mdfind >/dev/null 2>&1; then
    while IFS= read -r candidate; do
      if [ -d "$candidate" ]; then
        candidate_id="$(cit_bundle_id_for_app "$candidate" 2>/dev/null || true)"
        if [ "$candidate_id" = "$CIT_BUNDLE_ID" ]; then
          printf '%s\n' "$candidate"
          return 0
        fi
      fi
    done < <(mdfind 'kMDItemCFBundleIdentifier == "com.openai.codex"' 2>/dev/null || true)
  fi

  return 1
}

cit_validate_app() {
  local app_path="$1"
  [ -d "$app_path" ] || cit_die "Codex app not found: $app_path"

  local bundle_id
  bundle_id="$(cit_bundle_id_for_app "$app_path" 2>/dev/null || true)"
  [ "$bundle_id" = "$CIT_BUNDLE_ID" ] || cit_die "unexpected bundle id for $app_path: ${bundle_id:-missing}"

  local executable_name
  executable_name="$(cit_executable_for_app "$app_path" 2>/dev/null || true)"
  [ -n "$executable_name" ] || cit_die "cannot read CFBundleExecutable from $app_path"
  [ -x "$app_path/Contents/MacOS/$executable_name" ] || cit_die "bundle executable is not executable: $app_path/Contents/MacOS/$executable_name"
}

cit_node_for_app() {
  local app_path="$1"
  local node_path="$app_path/Contents/Resources/cua_node/bin/node"
  [ -x "$node_path" ] || cit_die "bundled Codex Node not found or not executable: $node_path"
  printf '%s\n' "$node_path"
}

cit_detect_app_or_die() {
  local app_path
  app_path="$(cit_find_app || true)"
  [ -n "$app_path" ] || cit_die "cannot find a macOS app with bundle id $CIT_BUNDLE_ID"
  cit_validate_app "$app_path"
  printf '%s\n' "$app_path"
}

cit_ensure_state_dirs() {
  mkdir -p "$CIT_LOG_DIR" "$CIT_RUN_DIR" "$CIT_THEME_DIR" "$CIT_IMAGE_DIR"
}

cit_assert_source_layout() {
  [ -f "$CIT_ROOT_DIR/assets/theme.css" ] || cit_die "missing asset: $CIT_ROOT_DIR/assets/theme.css"
  [ -f "$CIT_ROOT_DIR/assets/theme.json" ] || cit_die "missing asset: $CIT_ROOT_DIR/assets/theme.json"
  [ -f "$CIT_ROOT_DIR/assets/runtime-modules.json" ] || cit_die "missing asset: $CIT_ROOT_DIR/assets/runtime-modules.json"
  [ -f "$CIT_ROOT_DIR/assets/renderer-inject.js" ] || cit_die "missing asset: $CIT_ROOT_DIR/assets/renderer-inject.js"
  [ -f "$CIT_ROOT_DIR/scripts/injector.mjs" ] || cit_die "missing script: $CIT_ROOT_DIR/scripts/injector.mjs"
  [ -f "$CIT_ROOT_DIR/scripts/theme-store.mjs" ] || cit_die "missing script: $CIT_ROOT_DIR/scripts/theme-store.mjs"
  [ -f "$CIT_ROOT_DIR/scripts/theme-runtime-defaults.mjs" ] || cit_die "missing script: $CIT_ROOT_DIR/scripts/theme-runtime-defaults.mjs"
  [ -f "$CIT_ROOT_DIR/scripts/module-matrix.mjs" ] || cit_die "missing script: $CIT_ROOT_DIR/scripts/module-matrix.mjs"
}

cit_port_is_open() {
  local port="$1"
  nc -z 127.0.0.1 "$port" >/dev/null 2>&1
}

cit_pick_port() {
  local requested_port="$1"
  local explicit="$2"
  local port="$requested_port"
  local limit=$((requested_port + 60))

  if ! cit_port_is_open "$port"; then
    printf '%s\n' "$port"
    return 0
  fi

  if [ "$explicit" = "1" ]; then
    cit_die "requested CDP port is already occupied: $requested_port"
  fi

  while [ "$port" -le "$limit" ]; do
    if ! cit_port_is_open "$port"; then
      printf '%s\n' "$port"
      return 0
    fi
    port=$((port + 1))
  done

  cit_die "cannot find a free CDP port from $requested_port to $limit"
}

cit_is_app_running() {
  local app_path="$1"
  local executable_path
  executable_path="$(cit_executable_path_for_app "$app_path" 2>/dev/null || true)"
  [ -n "$executable_path" ] || return 1
  [ -n "$(cit_app_pids "$app_path")" ]
}

cit_app_pids() {
  local app_path="$1"
  local executable_path
  executable_path="$(cit_executable_path_for_app "$app_path" 2>/dev/null || true)"
  [ -n "$executable_path" ] || return 1
  ps -ww -o pid= -o command= -ax 2>/dev/null | awk -v needle="$executable_path" '
    {
      pid = $1
      sub(/^[[:space:]]*[0-9]+[[:space:]]+/, "", $0)
      if ($0 == needle || index($0, needle " ") == 1) {
        print pid
      }
    }
  '
}

cit_quit_app() {
  local app_path="$1"
  local bundle_id
  bundle_id="$(cit_bundle_id_for_app "$app_path" 2>/dev/null || true)"
  [ -n "$bundle_id" ] || cit_die "cannot read bundle id for quit operation"
  osascript -e "tell application id \"$bundle_id\" to quit" >/dev/null 2>&1 || return 1
}

cit_force_quit_app() {
  local app_path="$1"
  local pids
  pids="$(cit_app_pids "$app_path" || true)"
  [ -n "$pids" ] || return 0
  local pid
  while IFS= read -r pid; do
    [ -n "$pid" ] || continue
    kill -TERM "$pid" 2>/dev/null || true
  done <<< "$pids"
}

cit_pid_matches_any() {
  local pid="$1"
  local candidates="$2"
  local candidate
  while IFS= read -r candidate; do
    [ -n "$candidate" ] || continue
    if [ "$pid" = "$candidate" ]; then
      return 0
    fi
  done <<< "$candidates"
  return 1
}

cit_pid_is_descendant_of_any() {
  local pid="$1"
  local roots="$2"
  local current="$pid"
  local guard=0

  while [ -n "$current" ] && [ "$current" != "0" ] && [ "$guard" -lt 80 ]; do
    if cit_pid_matches_any "$current" "$roots"; then
      return 0
    fi
    current="$(ps -p "$current" -o ppid= 2>/dev/null | awk '{print $1; exit}')"
    guard=$((guard + 1))
  done

  return 1
}

cit_port_listener_pids() {
  local port="$1"
  command -v lsof >/dev/null 2>&1 || return 2
  lsof -nP -iTCP:"$port" -sTCP:LISTEN -Fp 2>/dev/null \
    | awk '/^p[0-9]+$/ { print substr($0, 2) }' \
    | sort -u
}

cit_port_listener_is_app_owned() {
  local port="$1"
  local app_path="$2"
  local listeners
  local roots
  local listener

  if ! listeners="$(cit_port_listener_pids "$port")"; then
    return 2
  fi
  [ -n "$listeners" ] || return 1

  roots="$(cit_app_pids "$app_path" || true)"
  [ -n "$roots" ] || return 1

  while IFS= read -r listener; do
    [ -n "$listener" ] || continue
    if ! cit_pid_is_descendant_of_any "$listener" "$roots"; then
      return 1
    fi
  done <<< "$listeners"

  return 0
}

cit_wait_for_cdp_listener_owner() {
  local app_path="$1"
  local port="$2"
  local timeout_seconds="$3"
  local elapsed=0
  local status=1
  local listeners
  local roots

  while [ "$elapsed" -lt "$timeout_seconds" ]; do
    if cit_port_listener_is_app_owned "$port" "$app_path"; then
      return 0
    fi
    status="$?"
    if [ "$status" -eq 2 ]; then
      return 2
    fi
    if cit_port_is_open "$port"; then
      listeners="$(cit_port_listener_pids "$port" 2>/dev/null || true)"
      roots="$(cit_app_pids "$app_path" || true)"
      if [ -n "$listeners" ] && [ -n "$roots" ]; then
        return 3
      fi
    fi
    sleep 1
    elapsed=$((elapsed + 1))
  done

  return 1
}

cit_wait_for_app_exit() {
  local app_path="$1"
  local timeout_seconds="$2"
  local elapsed=0
  while cit_is_app_running "$app_path"; do
    if [ "$elapsed" -ge "$timeout_seconds" ]; then
      return 1
    fi
    sleep 1
    elapsed=$((elapsed + 1))
  done
  return 0
}

cit_launch_app_with_cdp_open() {
  local app_path="$1"
  local port="$2"
  cit_require_command open
  cit_ensure_state_dirs
  local launch_log="$CIT_LOG_DIR/launch-$(date +%Y%m%d-%H%M%S)-open.log"
  open -na "$app_path" --args \
    --remote-debugging-address=127.0.0.1 \
    --remote-debugging-port="$port" \
    >>"$launch_log" 2>&1
  cit_log "requested macOS open launch log=$launch_log"
}

cit_launch_app_with_cdp_direct() {
  local app_path="$1"
  local port="$2"
  local executable_path
  executable_path="$(cit_executable_path_for_app "$app_path" 2>/dev/null || true)"
  [ -n "$executable_path" ] || cit_die "cannot resolve bundle executable path"
  [ -x "$executable_path" ] || cit_die "bundle executable is not executable: $executable_path"
  cit_ensure_state_dirs
  local launch_log="$CIT_LOG_DIR/launch-$(date +%Y%m%d-%H%M%S).log"
  "$executable_path" \
    --remote-debugging-address=127.0.0.1 \
    --remote-debugging-port="$port" \
    >>"$launch_log" 2>&1 &
  local launch_pid="$!"
  printf '%s\n' "$launch_pid" > "$CIT_RUN_DIR/launch.pid"
  cit_log "launched bundle executable pid=$launch_pid log=$launch_log"
}

cit_print_paths() {
  printf 'source=%s\n' "$CIT_ROOT_DIR"
  printf 'engine=%s\n' "$CIT_ENGINE_DIR"
  printf 'state=%s\n' "$CIT_STATE_DIR"
  printf 'logs=%s\n' "$CIT_LOG_DIR"
}
