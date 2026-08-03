#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_DIR="$ROOT_DIR/sources"
RUNTIME_DIR="$ROOT_DIR/runtime"
FRAME_DIR="$RUNTIME_DIR/animations/frames"
KEYER="$ROOT_DIR/../tools/chroma_key.py"
TEMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/knife-shield-dog.XXXXXX")"
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

magick "$SOURCE_DIR/background-castle-left-city-right.png" \
  -strip \
  -resize '1920x1080>' \
  -quality 82 \
  "$RUNTIME_DIR/backgrounds/castle-left-city-right.webp"

python3 "$KEYER" \
  "$SOURCE_DIR/hero-mecha-dog-chroma.png" \
  "$TEMP_DIR/hero-mecha-dog.png" \
  --auto-key

magick "$TEMP_DIR/hero-mecha-dog.png" \
  -trim +repage \
  -bordercolor none -border 12 \
  -resize 'x900' \
  -strip \
  "$RUNTIME_DIR/characters/mecha-dog-hero-900.png"

python3 "$KEYER" \
  "$SOURCE_DIR/mascot-chubby-dog-chroma.png" \
  "$TEMP_DIR/mascot-chubby-dog.png" \
  --auto-key

magick "$TEMP_DIR/mascot-chubby-dog.png" \
  -trim +repage \
  -bordercolor none -border 8 \
  -resize 'x320' \
  -strip \
  "$RUNTIME_DIR/characters/chubby-dog-mascot-320.png"

python3 "$KEYER" \
  "$SOURCE_DIR/animation-forward-slash-sheet-chroma.png" \
  "$TEMP_DIR/animation-forward-slash-sheet.png" \
  --auto-key

for frame_index in 0 1 2 3 4 5; do
  row=$((frame_index / 3))
  column=$((frame_index % 3))
  x_offset=$((column * 512))
  y_offset=$((row * 512))
  output_index=$((frame_index + 1))
  output_path="$(printf '%s/forward-slash-%02d.png' "$FRAME_DIR" "$output_index")"

  magick "$TEMP_DIR/animation-forward-slash-sheet.png" \
    -crop "512x512+${x_offset}+${y_offset}" +repage \
    -trim +repage \
    -resize '236x176' \
    -gravity south \
    -background none \
    -extent 256x192 \
    -strip \
    "$output_path"
done

magick "$FRAME_DIR"/forward-slash-*.png \
  +append \
  "$RUNTIME_DIR/animations/forward-slash-sprite.png"

cwebp -quiet -lossless -z 8 \
  "$RUNTIME_DIR/animations/forward-slash-sprite.png" \
  -o "$RUNTIME_DIR/animations/forward-slash-sprite.webp"

cp "$FRAME_DIR/forward-slash-01.png" \
  "$RUNTIME_DIR/animations/forward-slash-poster.png"

printf 'built knife-shield-dog runtime assets\n'
magick identify \
  "$RUNTIME_DIR/backgrounds/castle-left-city-right.webp" \
  "$RUNTIME_DIR/characters/mecha-dog-hero-900.png" \
  "$RUNTIME_DIR/characters/chubby-dog-mascot-320.png" \
  "$RUNTIME_DIR/animations/forward-slash-sprite.webp"
