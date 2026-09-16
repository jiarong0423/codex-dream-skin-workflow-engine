#!/usr/bin/env bash
set -euo pipefail

STATE_DIR="$HOME/Library/Application Support/DreamSkinForge"
INSTALLED_PROJECT_ROOT="$STATE_DIR/chainsaw-project"
FALLBACK_PROJECT_ROOT="$HOME/Documents/skin"
PORT="${CIT_PRIVATE_DUEL_PORT:-9341}"
WAIT_MS="${CIT_PRIVATE_DUEL_WAIT_MS:-8000}"
RUN_GATE="${CIT_PRIVATE_DUEL_GATE:-true}"
LOG_DIR="$STATE_DIR/logs"
LOG_FILE="$LOG_DIR/chainsaw-duel-injector-command.log"

resolve_project_root() {
  if [ -n "${DREAM_SKIN_PROJECT_ROOT:-}" ]; then
    printf '%s\n' "$DREAM_SKIN_PROJECT_ROOT"
    return 0
  fi

  if [ -x "$INSTALLED_PROJECT_ROOT/macos/scripts/chainsaw-duel-one-click-injector.sh" ]; then
    printf '%s\n' "$INSTALLED_PROJECT_ROOT"
    return 0
  fi

  printf '%s\n' "$FALLBACK_PROJECT_ROOT"
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

PROJECT_ROOT="$(resolve_project_root)"
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
