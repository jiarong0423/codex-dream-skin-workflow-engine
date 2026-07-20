#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
MANIFEST="$SCRIPT_DIR/public-package-manifest.json"
PACKAGE_NAME="codex-dream-skin-workflow-engine-public"
STAGE_ROOT="$SCRIPT_DIR/public-package"
PACKAGE_ROOT="$STAGE_ROOT/$PACKAGE_NAME"
EXPORT_DIR="$SCRIPT_DIR/exports"
ZIP_PATH="$EXPORT_DIR/$PACKAGE_NAME.zip"
MAX_ZIP_BYTES=$((35 * 1024 * 1024))

NODE_BIN="${NODE_BIN:-}"
if [[ -z "$NODE_BIN" ]]; then
  NODE_BIN="$(command -v node || true)"
fi
if [[ -z "$NODE_BIN" && -x "/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node" ]]; then
  NODE_BIN="/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node"
fi
if [[ -z "$NODE_BIN" || ! -x "$NODE_BIN" ]]; then
  printf 'error: Node.js is required to read %s\n' "$MANIFEST" >&2
  exit 1
fi
if ! command -v zip >/dev/null 2>&1; then
  printf 'error: zip command is required\n' >&2
  exit 1
fi
if ! command -v rg >/dev/null 2>&1; then
  printf 'error: rg is required for the public-package privacy scan\n' >&2
  exit 1
fi

rm -rf "$STAGE_ROOT"
mkdir -p "$PACKAGE_ROOT" "$EXPORT_DIR"

copy_required_path() {
  local relative_path="$1"
  local source_path="$ROOT_DIR/$relative_path"
  local destination_path="$PACKAGE_ROOT/$relative_path"
  if [[ ! -e "$source_path" ]]; then
    printf 'error: manifest path is missing: %s\n' "$relative_path" >&2
    exit 1
  fi
  mkdir -p "$(dirname "$destination_path")"
  cp -pR "$source_path" "$destination_path"
}

while IFS= read -r relative_path || [[ -n "$relative_path" ]]; do
  [[ -n "$relative_path" ]] || continue
  copy_required_path "$relative_path"
done < <("$NODE_BIN" -e '
  const fs = require("fs");
  const manifest = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  const paths = [
    "competition-manifest.json",
    "LICENSE",
    "NOTICE.md",
    "CREDITS.md",
    "submission/asset-inventory.json",
    "submission/public-package-manifest.json",
    ...(manifest.publicEntryPoints || []),
    ...(manifest.sourceInclude || [])
  ];
  process.stdout.write([...new Set(paths)].join("\n"));
' "$MANIFEST")

while IFS=$'\t' read -r source_relative destination_relative; do
  [[ -n "$source_relative" && -n "$destination_relative" ]] || continue
  source_path="$ROOT_DIR/$source_relative"
  destination_path="$PACKAGE_ROOT/$destination_relative"
  if [[ ! -e "$source_path" ]]; then
    printf 'warning: optional bundle media is missing: %s\n' "$source_relative" >&2
    continue
  fi
  mkdir -p "$(dirname "$destination_path")"
  cp -pR "$source_path" "$destination_path"
done < <("$NODE_BIN" -e '
  const fs = require("fs");
  const manifest = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  for (const item of manifest.bundleExtras || []) {
    process.stdout.write(`${item.source}\t${item.destination}\n`);
  }
' "$MANIFEST")

find "$PACKAGE_ROOT" \( -name '.DS_Store' -o -name '._*' \) -delete

for forbidden_path in \
  "$PACKAGE_ROOT/.git" \
  "$PACKAGE_ROOT/docs/PROJECT_LOG.local-private.md" \
  "$PACKAGE_ROOT/submission/exports" \
  "$PACKAGE_ROOT/submission/public-package"; do
  if [[ -e "$forbidden_path" ]]; then
    printf 'error: forbidden path entered package: %s\n' "$forbidden_path" >&2
    exit 1
  fi
done

scan_pattern='(/Users/|Desktop/圖檔|截圖[[:space:]]+20|螢幕錄影|sunjiarong@|[A-Za-z0-9._%+-]+@(gmail|hotmail|outlook|yahoo)\.[A-Za-z]{2,}|sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16})'
if rg -n -I --hidden --glob '!**/build-public-package.sh' "$scan_pattern" "$PACKAGE_ROOT"; then
  printf 'error: public-package privacy scan found a forbidden value\n' >&2
  exit 1
fi

(
  cd "$PACKAGE_ROOT"
  find . -type f ! -name 'PACKAGE_CONTENTS.sha256' | LC_ALL=C sort | while IFS= read -r file; do
    shasum -a 256 "$file"
  done > PACKAGE_CONTENTS.sha256
)

rm -f "$ZIP_PATH"
(
  cd "$STAGE_ROOT"
  zip -X -q -r "$ZIP_PATH" "$PACKAGE_NAME"
)

ZIP_BYTES="$(wc -c < "$ZIP_PATH" | tr -d '[:space:]')"
if [[ "$ZIP_BYTES" -gt "$MAX_ZIP_BYTES" ]]; then
  printf 'error: package is %s bytes; Devpost limit is %s bytes\n' "$ZIP_BYTES" "$MAX_ZIP_BYTES" >&2
  exit 1
fi

FILE_COUNT="$(find "$PACKAGE_ROOT" -type f | wc -l | tr -d '[:space:]')"
printf 'package: %s\n' "$ZIP_PATH"
printf 'files: %s\n' "$FILE_COUNT"
printf 'bytes: %s\n' "$ZIP_BYTES"
printf 'sha256: '
shasum -a 256 "$ZIP_PATH" | awk '{print $1}'
