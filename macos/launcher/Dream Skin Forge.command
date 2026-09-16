#!/usr/bin/env bash
set -euo pipefail

ENGINE_DIR="${CIT_ENGINE_DIR:-$HOME/.codex/dream-skin-forge}"
if [ -d "$ENGINE_DIR" ]; then
  ENGINE_DIR="$(cd -P "$ENGINE_DIR" >/dev/null 2>&1 && pwd)"
fi
INJECTOR_PATH="$ENGINE_DIR/scripts/injector.mjs"
PORT="${CIT_DEFAULT_PORT:-9341}"

printf '[Dream Skin Forge] launcher command started\n'
printf '[Dream Skin Forge] engine=%s\n' "$ENGINE_DIR"
printf '[Dream Skin Forge] port=%s\n' "$PORT"

if [ ! -x "$ENGINE_DIR/scripts/start.sh" ]; then
  printf '[Dream Skin Forge][error] missing theme engine: %s\n' "$ENGINE_DIR" >&2
  printf '[Dream Skin Forge][error] run macos/scripts/install.sh from the repository root first\n' >&2
  exit 1
fi

if ! nc -z 127.0.0.1 "$PORT" >/dev/null 2>&1; then
  stale_pids="$(ps -ww -o pid= -o command= -ax 2>/dev/null | awk -v port="$PORT" -v injector="$INJECTOR_PATH" '
    index($0, injector) && /--daemon/ {
      for (field_index = 1; field_index <= NF; field_index += 1) {
        if ($field_index == "--port" && $(field_index + 1) == port) {
          print $1
        }
      }
    }
  ' || true)"
  if [ -n "$stale_pids" ]; then
    while IFS= read -r stale_pid; do
      [ -n "$stale_pid" ] || continue
      printf '[Dream Skin Forge] stopping stale injector daemon pid=%s\n' "$stale_pid"
      kill "$stale_pid" >/dev/null 2>&1 || true
    done <<< "$stale_pids"
  fi
fi

if nc -z 127.0.0.1 "$PORT" >/dev/null 2>&1; then
  printf '[Dream Skin Forge] existing debug port found; applying theme once\n'
  exec "$ENGINE_DIR/scripts/start.sh" --no-launch --once --port "$PORT" --wait-ms 30000
fi

printf '[Dream Skin Forge] starting Codex through themed launcher path\n'
exec "$ENGINE_DIR/scripts/start.sh" --once --port "$PORT" --wait-ms 60000
