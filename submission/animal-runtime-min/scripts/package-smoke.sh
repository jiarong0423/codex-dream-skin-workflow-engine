#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." >/dev/null 2>&1 && pwd)"
FAILURES=0

if [ ! -f "$ROOT_DIR/macos/assets/theme.css" ]; then
  SOURCE_ROOT="$(cd "$ROOT_DIR/../.." >/dev/null 2>&1 && pwd)"
  SOURCE_BUILDER="$SOURCE_ROOT/submission/build-animal-runtime-package.sh"
  if [ -f "$SOURCE_ROOT/macos/assets/theme.css" ] && [ -f "$SOURCE_BUILDER" ]; then
    printf 'INFO source skeleton detected; building and smoking the staged package\n'
    exec bash "$SOURCE_BUILDER"
  fi
fi

pass() {
  printf 'PASS %s\n' "$1"
}

fail() {
  printf 'FAIL %s\n' "$1" >&2
  FAILURES=$((FAILURES + 1))
}

require_command() {
  if command -v "$1" >/dev/null 2>&1; then
    pass "command available: $1"
  else
    fail "missing command: $1"
  fi
}

assert_file() {
  local path="$1"
  if [ -f "$ROOT_DIR/$path" ]; then
    pass "file $path"
  else
    fail "missing file $path"
  fi
}

assert_dir() {
  local path="$1"
  if [ -d "$ROOT_DIR/$path" ]; then
    pass "directory $path"
  else
    fail "missing directory $path"
  fi
}

for command_name in bash node jq shasum find; do
  require_command "$command_name"
done

assert_file "README.md"
assert_file "docs/ASSET_REPLACEMENT_GUIDE.md"
assert_file "docs/PACKAGE_CHECKLIST.md"
assert_file "PACKAGE_CONTENTS.sha256"
assert_file "macos/assets/theme.css"
assert_file "macos/assets/theme.json"
assert_file "macos/assets/runtime-modules.json"
assert_file "macos/assets/renderer-inject.js"
assert_file "macos/scripts/common.sh"
assert_file "macos/scripts/install.sh"
assert_file "macos/scripts/start.sh"
assert_file "macos/scripts/verify.sh"
assert_file "macos/scripts/restore.sh"
assert_file "macos/scripts/injector.mjs"
assert_file "macos/scripts/theme-store.mjs"
assert_file "macos/scripts/theme-runtime-defaults.mjs"
assert_file "macos/scripts/module-matrix.mjs"
assert_file "theme-packs/scripts/activate-pack.mjs"
assert_dir "theme-packs/orange-mecha-cat"
assert_dir "theme-packs/orbital-stargazer-black-cat"
assert_dir "theme-packs/knife-shield-dog"

if find "$ROOT_DIR" \( -name '.DS_Store' -o -name '._*' \) | grep -q .; then
  fail "Finder metadata present"
else
  pass "no Finder metadata"
fi

if find "$ROOT_DIR" \( -path '*/.git/*' -o -path '*/theme-packs/private-packs/*' -o -path '*/.target-mode-quarantine/*' \) | grep -q .; then
  fail "forbidden private or local path present"
else
  pass "no forbidden private/local directories"
fi

if find "$ROOT_DIR" -print | grep -E 'chainsaw|anime' >/dev/null; then
  fail "private chainsaw/anime file path present"
else
  pass "no private chainsaw/anime paths"
fi

LOCAL_HOME_PATTERN="/""Users/"
CREDENTIAL_PATTERN='(sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16})'
if grep -R -n -I -E "(${LOCAL_HOME_PATTERN}|${CREDENTIAL_PATTERN})" "$ROOT_DIR" >/dev/null 2>&1; then
  fail "local absolute path or credential-like token present"
else
  pass "no local absolute path or credential-like token"
fi

for script in \
  macos/scripts/common.sh \
  macos/scripts/install.sh \
  macos/scripts/start.sh \
  macos/scripts/verify.sh \
  macos/scripts/restore.sh \
  scripts/package-smoke.sh; do
  if bash -n "$ROOT_DIR/$script"; then
    pass "bash syntax $script"
  else
    fail "bash syntax $script"
  fi
done

for script in \
  macos/scripts/injector.mjs \
  macos/scripts/theme-store.mjs \
  macos/scripts/theme-runtime-defaults.mjs \
  macos/scripts/module-matrix.mjs \
  theme-packs/scripts/activate-pack.mjs; do
  if node --check "$ROOT_DIR/$script" >/dev/null; then
    pass "node syntax $script"
  else
    fail "node syntax $script"
  fi
done

validate_pack() {
  local pack_id="$1"
  local manifest="$ROOT_DIR/theme-packs/$pack_id/pack.json"
  if jq empty "$manifest" >/dev/null; then
    pass "$pack_id manifest JSON"
  else
    fail "$pack_id manifest JSON"
    return
  fi

  local manifest_id
  manifest_id="$(jq -r '.id' "$manifest")"
  if [ "$manifest_id" = "$pack_id" ]; then
    pass "$pack_id id matches directory"
  else
    fail "$pack_id id mismatch: $manifest_id"
  fi

  if jq -e '.schemaVersion == 1 and .status == "asset-ready-unmounted" and .interaction.activation == "manual-click-only" and .interaction.preload == false and .interaction.idlePlaybackDom == false' "$manifest" >/dev/null; then
    pass "$pack_id runtime contract"
  else
    fail "$pack_id runtime contract"
  fi

  while IFS= read -r relative_path; do
    if [ -z "$relative_path" ]; then
      continue
    fi
    case "$relative_path" in
      /*|*..*)
        fail "$pack_id unsafe asset path $relative_path"
        continue
        ;;
    esac
    if [ -f "$ROOT_DIR/theme-packs/$pack_id/$relative_path" ]; then
      pass "$pack_id asset $relative_path"
    else
      fail "$pack_id missing asset $relative_path"
    fi
  done < <(jq -r '.assets[]?, .iconMap[]?' "$manifest")
}

validate_pack "orange-mecha-cat"
validate_pack "orbital-stargazer-black-cat"
validate_pack "knife-shield-dog"

if node "$ROOT_DIR/theme-packs/scripts/activate-pack.mjs" list --root "$ROOT_DIR/theme-packs" --format json \
  | jq -e '.packs | map(.id) | index("orange-mecha-cat") and index("orbital-stargazer-black-cat") and index("knife-shield-dog")' >/dev/null; then
  pass "activation CLI lists packaged packs"
else
  fail "activation CLI packaged list"
fi

SMOKE_STATE="/tmp/dream-skin-animal-package-smoke-$$"
rm -rf "$SMOKE_STATE"

if node "$ROOT_DIR/theme-packs/scripts/activate-pack.mjs" plan \
  --root "$ROOT_DIR/theme-packs" \
  --assets-dir "$ROOT_DIR/macos/assets" \
  --state-dir "$SMOKE_STATE" \
  --pack orange-mecha-cat \
  --format json \
  | jq -e '.writesActiveTheme == false and .theme.themePack.id == "orange-mecha-cat"' >/dev/null; then
  pass "activation CLI dry-run plan"
else
  fail "activation CLI dry-run plan"
fi

if node "$ROOT_DIR/theme-packs/scripts/activate-pack.mjs" activate \
  --root "$ROOT_DIR/theme-packs" \
  --assets-dir "$ROOT_DIR/macos/assets" \
  --state-dir "$SMOKE_STATE" \
  --pack knife-shield-dog \
  --format json \
  | jq -e '.activated == true and .theme.themePack.id == "knife-shield-dog"' >/dev/null; then
  pass "activation CLI isolated activate"
else
  fail "activation CLI isolated activate"
fi

if node "$ROOT_DIR/macos/scripts/module-matrix.mjs" \
  --state-dir "$SMOKE_STATE" \
  --assets-dir "$ROOT_DIR/macos/assets" \
  --format json \
  | jq -e '.ok == true' >/dev/null; then
  pass "module matrix accepts isolated active pack"
else
  fail "module matrix accepts isolated active pack"
fi

rm -rf "$SMOKE_STATE"

if (cd "$ROOT_DIR" && shasum -a 256 -c PACKAGE_CONTENTS.sha256 >/dev/null); then
  pass "PACKAGE_CONTENTS.sha256"
else
  fail "PACKAGE_CONTENTS.sha256"
fi

if [ "$FAILURES" -eq 0 ]; then
  printf 'Package smoke passed\n'
else
  printf 'Package smoke failed: %s\n' "$FAILURES" >&2
  exit 1
fi
