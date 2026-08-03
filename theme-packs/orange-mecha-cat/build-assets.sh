#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"

test -f "$ROOT_DIR/pack.json"
test -f "$ROOT_DIR/runtime/backgrounds/cyberpunk-contrast-city.webp"
test -f "$ROOT_DIR/runtime/characters/mecha-cat-hero-900.png"
test -f "$ROOT_DIR/runtime/characters/orange-hacker-cat-mascot-128.png"
test -f "$ROOT_DIR/runtime/animations/table-flip-sprite.webp"
test -f "$ROOT_DIR/runtime/icons/trigger.svg"

printf '[orange-mecha-cat] runtime assets already prepared\n'
