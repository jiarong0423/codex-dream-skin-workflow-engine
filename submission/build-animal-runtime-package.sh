#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." >/dev/null 2>&1 && pwd)"
PACKAGE_NAME="dream-skin-forge-animal-runtime-min"
STAGE_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/dream-skin-animal-runtime-package.XXXXXX")"
PACKAGE_ROOT="$STAGE_ROOT/$PACKAGE_NAME"
EXPORT_DIR="$SCRIPT_DIR/exports"
TAR_PATH="$EXPORT_DIR/$PACKAGE_NAME.tar.gz"

cleanup_stage() {
  rm -rf "$STAGE_ROOT"
}

trap cleanup_stage EXIT

copy_path() {
  local relative_path="$1"
  local source_path="$ROOT_DIR/$relative_path"
  local target_path="$PACKAGE_ROOT/$relative_path"
  if [ ! -e "$source_path" ]; then
    printf 'error: missing package path: %s\n' "$relative_path" >&2
    exit 1
  fi
  mkdir -p "$(dirname "$target_path")"
  cp -pR "$source_path" "$target_path"
}

copy_as() {
  local source_relative="$1"
  local target_relative="$2"
  local source_path="$ROOT_DIR/$source_relative"
  local target_path="$PACKAGE_ROOT/$target_relative"
  if [ ! -e "$source_path" ]; then
    printf 'error: missing package path: %s\n' "$source_relative" >&2
    exit 1
  fi
  mkdir -p "$(dirname "$target_path")"
  cp -pR "$source_path" "$target_path"
}

rm -rf "$STAGE_ROOT"
mkdir -p "$PACKAGE_ROOT" "$EXPORT_DIR"

copy_path "LICENSE"
copy_path "NOTICE.md"
copy_path "CREDITS.md"
copy_as "submission/animal-runtime-min/README.md" "README.md"
copy_as "submission/animal-runtime-min/docs" "docs"
copy_as "submission/animal-runtime-min/scripts" "scripts"

copy_path "macos/assets/theme.css"
copy_path "macos/assets/theme.json"
copy_path "macos/assets/runtime-modules.json"
copy_path "macos/assets/renderer-inject.js"
copy_path "macos/assets/icons/buttons"
copy_path "macos/assets/icons/cyber-mecha-cat-male-helmet-900.png"
copy_path "macos/assets/icons/orange-hacker-cat-128.png"
copy_path "macos/assets/icons/table-flip-cat-left-poster.png"
copy_path "macos/assets/icons/table-flip-cat-left.gif"
copy_path "macos/assets/icons/table-flip-cat-left.webp"
copy_path "macos/assets/icons/table-flip-cat-left-sprite.webp"
copy_path "macos/assets/icons/table-flip-trigger-angry.svg"
copy_path "macos/assets/backgrounds/cyber-ruins-pale.png"
copy_path "macos/assets/backgrounds/cyberpunk-contrast-city.png"
copy_path "macos/assets/icons/cyber-mecha-cat-male-helmet-chroma.png"
copy_path "macos/assets/icons/cyber-mecha-cat-male-helmet-cutout.png"
copy_path "macos/assets/icons/cyber-robot-orange-cat-768.png"
copy_path "macos/assets/icons/cyber-robot-orange-cat-chroma.png"
copy_path "macos/assets/icons/cyber-robot-orange-cat-cutout.png"
copy_path "macos/assets/icons/orange-hacker-cat-chroma.png"
copy_path "macos/assets/icons/orange-hacker-cat-cutout.png"

copy_path "macos/scripts/common.sh"
copy_path "macos/scripts/install.sh"
copy_path "macos/scripts/start.sh"
copy_path "macos/scripts/verify.sh"
copy_path "macos/scripts/restore.sh"
copy_path "macos/scripts/install-launcher.sh"
copy_path "macos/scripts/injector.mjs"
copy_path "macos/scripts/theme-store.mjs"
copy_path "macos/scripts/theme-runtime-defaults.mjs"
copy_path "macos/scripts/module-matrix.mjs"

copy_path "macos/launcher/Dream Skin Forge.command"
copy_path "macos/launcher/Dream Skin Forge.app"

copy_path "theme-packs/scripts/activate-pack.mjs"
copy_path "theme-packs/previews/hot-swap-bay.html"
for pack_id in knife-shield-dog orange-mecha-cat orbital-stargazer-black-cat; do
  copy_path "theme-packs/$pack_id/pack.json"
  copy_path "theme-packs/$pack_id/runtime"
done

find "$PACKAGE_ROOT" \( -name '.DS_Store' -o -name '._*' \) -delete

if find "$PACKAGE_ROOT" \( -path '*/.git/*' -o -path '*/theme-packs/private-packs/*' -o -path '*/.target-mode-quarantine/*' \) | grep -q .; then
  printf 'error: forbidden private or local path entered package\n' >&2
  exit 1
fi

if find "$PACKAGE_ROOT" -print | grep -E 'chainsaw|anime' >/dev/null; then
  printf 'error: private chainsaw/anime path entered package\n' >&2
  exit 1
fi

LOCAL_HOME_PATTERN="/""Users/"
CREDENTIAL_PATTERN='(sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16})'
if grep -R -n -I -E "(${LOCAL_HOME_PATTERN}|${CREDENTIAL_PATTERN})" "$PACKAGE_ROOT" >/dev/null 2>&1; then
  printf 'error: local absolute path or credential-like token entered package\n' >&2
  exit 1
fi

chmod +x "$PACKAGE_ROOT/scripts/package-smoke.sh"
find "$PACKAGE_ROOT/macos/scripts" -maxdepth 1 \( -name '*.sh' -o -name '*.mjs' \) -type f -exec chmod +x {} \;
find "$PACKAGE_ROOT/theme-packs/scripts" -maxdepth 1 -name '*.mjs' -type f -exec chmod +x {} \;
find "$PACKAGE_ROOT/macos/launcher" -name '*.command' -type f -exec chmod +x {} \;
find "$PACKAGE_ROOT/macos/launcher" -path '*/Contents/MacOS/*' -type f -exec chmod +x {} \;

(
  cd "$PACKAGE_ROOT"
  find . -type f ! -name 'PACKAGE_CONTENTS.sha256' | LC_ALL=C sort | while IFS= read -r file; do
    shasum -a 256 "$file"
  done > PACKAGE_CONTENTS.sha256
)

bash "$PACKAGE_ROOT/scripts/package-smoke.sh"

rm -f "$TAR_PATH" "$TAR_PATH.sha256"
(
  cd "$STAGE_ROOT"
  COPYFILE_DISABLE=1 tar --no-xattrs -czf "$TAR_PATH" "$PACKAGE_NAME"
)
(
  cd "$EXPORT_DIR"
  shasum -a 256 "$PACKAGE_NAME.tar.gz" > "$PACKAGE_NAME.tar.gz.sha256"
)

printf 'package: %s\n' "$TAR_PATH"
printf 'sha256: %s\n' "$TAR_PATH.sha256"
printf 'files: %s\n' "$(find "$PACKAGE_ROOT" -type f | wc -l | tr -d '[:space:]')"
printf 'bytes: %s\n' "$(wc -c < "$TAR_PATH" | tr -d '[:space:]')"
