#!/usr/bin/env bash
set -euo pipefail

STATE_DIR="$HOME/Library/Application Support/DreamSkinForge"
INSTALLED_PROJECT_ROOT="$STATE_DIR/chainsaw-project"
CANONICAL_PROJECT_ROOT="$HOME/Developer/skin"
LEGACY_PROJECT_ROOT="$HOME/Documents/skin"
PORT="${CIT_PRIVATE_DUEL_PORT:-9341}"
WAIT_MS="${CIT_PRIVATE_DUEL_WAIT_MS:-8000}"
RUN_GATE="${CIT_PRIVATE_DUEL_GATE:-true}"
LOG_DIR="$STATE_DIR/logs"
LOG_FILE="$LOG_DIR/chainsaw-duel-injector-command.log"

resolve_project_root() {
  local launcher_source="${BASH_SOURCE[0]}"
  local launcher_dir
  local source_project_root
  local candidate
  local resolved_candidate
  local -a candidates=()

  while [ -h "$launcher_source" ]; do
    launcher_dir="$(cd -P "$(dirname "$launcher_source")" >/dev/null 2>&1 && pwd)"
    launcher_source="$(readlink "$launcher_source")"
    case "$launcher_source" in
      /*) ;;
      *) launcher_source="$launcher_dir/$launcher_source" ;;
    esac
  done

  launcher_dir="$(cd -P "$(dirname "$launcher_source")" >/dev/null 2>&1 && pwd)"
  source_project_root="$(cd -P "$launcher_dir/../.." >/dev/null 2>&1 && pwd || true)"

  if [ -n "${DREAM_SKIN_PROJECT_ROOT:-}" ]; then
    candidates+=("$DREAM_SKIN_PROJECT_ROOT")
  fi
  candidates+=(
    "$source_project_root"
    "$INSTALLED_PROJECT_ROOT"
    "$CANONICAL_PROJECT_ROOT"
    "$LEGACY_PROJECT_ROOT"
  )

  for candidate in "${candidates[@]}"; do
    [ -n "$candidate" ] || continue
    if [ -r "$candidate/macos/scripts/chainsaw-duel-one-click-injector.sh" ]; then
      resolved_candidate="$(cd -P "$candidate" >/dev/null 2>&1 && pwd)"
      printf '%s\n' "$resolved_candidate"
      return 0
    fi
  done

  printf '[Chainsaw Duel Injector][error] no usable project root found; checked candidates:\n' >&2
  printf '  %s\n' "${candidates[@]}" >&2
  return 1
}

mkdir -p "$LOG_DIR"

timestamp() {
  date '+%Y-%m-%d %H:%M:%S'
}

log() {
  printf '[%s] %s\n' "$(timestamp)" "$*" | tee -a "$LOG_FILE"
}

finish_window() {
  local status="$1"
  if [ "$status" -ne 0 ]; then
    printf '\n[Chainsaw Duel Injector] 注入失敗，狀態碼=%s\n' "$status"
    printf '[Chainsaw Duel Injector] log: %s\n' "$LOG_FILE"
    printf '[Chainsaw Duel Injector] 如果這是權限問題，請到 系統設定 > 隱私權與安全性 允許 Terminal 存取桌面與文件。\n\n'
    printf '按 Enter 關閉視窗...'
    IFS= read -r _
  fi
}

trap 'status=$?; finish_window "$status"; exit "$status"' EXIT

if ! PROJECT_ROOT="$(resolve_project_root)"; then
  log "unable to resolve project root"
  exit 1
fi
INJECTOR="$PROJECT_ROOT/macos/scripts/chainsaw-duel-one-click-injector.sh"

log "command launcher started"
log "project_root=$PROJECT_ROOT port=$PORT wait_ms=$WAIT_MS gate=$RUN_GATE"

if [ ! -f "$INJECTOR" ]; then
  log "missing injector: $INJECTOR"
  exit 1
fi

if [ ! -r "$INJECTOR" ]; then
  log "injector is not readable: $INJECTOR"
  exit 1
fi

log "running one-click injector through /bin/bash"
/bin/bash "$INJECTOR" --port "$PORT" --wait-ms "$WAIT_MS" --gate "$RUN_GATE" 2>&1 | tee -a "$LOG_FILE"
PIPE_STATUS=("${PIPESTATUS[@]}")
INJECT_STATUS="${PIPE_STATUS[0]}"

if [ "$INJECT_STATUS" -ne 0 ]; then
  log "one-click injector failed status=$INJECT_STATUS"
  exit "$INJECT_STATUS"
fi

log "Chainsaw Duel applied"
