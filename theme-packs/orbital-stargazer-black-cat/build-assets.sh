#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_DIR="$ROOT_DIR/sources"
RUNTIME_DIR="$ROOT_DIR/runtime"
FRAME_DIR="$RUNTIME_DIR/animations/frames"
KEYER="$ROOT_DIR/../tools/chroma_key.py"
TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/orbital-stargazer-black-cat.XXXXXX")"
trap 'rm -rf "$TEMP_DIR"' EXIT

for command_name in python3 magick cwebp; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    printf 'missing required command: %s\n' "$command_name" >&2
    exit 1
  fi
done

if [ ! -f "$KEYER" ]; then
  printf 'missing chroma key helper: %s\n' "$KEYER" >&2
  exit 1
fi

mkdir -p \
  "$RUNTIME_DIR/backgrounds" \
  "$RUNTIME_DIR/characters" \
  "$RUNTIME_DIR/animations" \
  "$FRAME_DIR"

magick "$SOURCE_DIR/background-capsule-left-observatory-right.png" \
  -strip \
  -resize '1920x1080>' \
  -quality 82 \
  "$RUNTIME_DIR/backgrounds/capsule-left-observatory-right.webp"

python3 "$KEYER" \
  "$SOURCE_DIR/hero-astronaut-black-cat-chroma.png" \
  "$TEMP_DIR/hero-astronaut-black-cat.png" \
  --auto-key

magick "$TEMP_DIR/hero-astronaut-black-cat.png" \
  -trim +repage \
  -bordercolor none -border 12 \
  -resize 'x900' \
  -strip \
  "$RUNTIME_DIR/characters/astronaut-black-cat-hero-900.png"

python3 "$KEYER" \
  "$SOURCE_DIR/mascot-black-cat-chroma.png" \
  "$TEMP_DIR/mascot-black-cat.png" \
  --auto-key \
  --aggressive-dominance

magick "$TEMP_DIR/mascot-black-cat.png" \
  -trim +repage \
  -bordercolor none -border 8 \
  -resize 'x320' \
  -strip \
  "$RUNTIME_DIR/characters/black-cat-mascot-320.png"

python3 "$KEYER" \
  "$SOURCE_DIR/animation-roll-sheet-chroma.png" \
  "$TEMP_DIR/animation-roll-sheet.png" \
  --auto-key \
  --aggressive-dominance

python3 "$KEYER" \
  "$SOURCE_DIR/animation-groom-sheet-chroma.png" \
  "$TEMP_DIR/animation-groom-sheet.png" \
  --auto-key \
  --aggressive-dominance

for frame_index in 0 1 2 3 4 5 6 7; do
  local_index=$((frame_index % 4))
  row=$((local_index / 2))
  column=$((local_index % 2))
  x_offset=$((column * 627))
  y_offset=$((row * 627))
  output_index=$((frame_index + 1))
  output_path="$(printf '%s/roll-groom-%02d.png' "$FRAME_DIR" "$output_index")"

  if [ "$frame_index" -lt 4 ]; then
    source_sheet="$TEMP_DIR/animation-roll-sheet.png"
  else
    source_sheet="$TEMP_DIR/animation-groom-sheet.png"
  fi

  magick "$source_sheet" \
    -crop "627x627+${x_offset}+${y_offset}" +repage \
    -trim +repage \
    -resize '236x176' \
    -gravity south \
    -background none \
    -extent 256x192 \
    -strip \
    "$output_path"
done

magick "$FRAME_DIR"/roll-groom-*.png \
  +append \
  "$RUNTIME_DIR/animations/roll-groom-sprite.png"

cwebp -quiet -lossless -z 8 \
  "$RUNTIME_DIR/animations/roll-groom-sprite.png" \
  -o "$RUNTIME_DIR/animations/roll-groom-sprite.webp"

cp "$FRAME_DIR/roll-groom-01.png" \
  "$RUNTIME_DIR/animations/roll-groom-poster.png"

printf 'built orbital-stargazer-black-cat runtime assets\n'
magick identify \
  "$RUNTIME_DIR/backgrounds/capsule-left-observatory-right.webp" \
  "$RUNTIME_DIR/characters/astronaut-black-cat-hero-900.png" \
  "$RUNTIME_DIR/characters/black-cat-mascot-320.png" \
  "$RUNTIME_DIR/animations/roll-groom-sprite.webp"
