#!/usr/bin/env bash
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FAILURES=0
VALIDATION_MODE="full"
VALIDATION_TEMP_BASE="${TMPDIR:-/tmp}/codex-dream-skin-pack-state-$$"

if [ "${1:-}" = "--runtime-only" ]; then
  VALIDATION_MODE="runtime-only"
  shift
fi
if [ "$#" -ne 0 ]; then
  printf 'Usage: %s [--runtime-only]\n' "$0" >&2
  exit 2
fi

cleanup_validation_temp() {
  rm -rf "$VALIDATION_TEMP_BASE" "$VALIDATION_TEMP_BASE-plan.json" "$VALIDATION_TEMP_BASE-activate.json"
}

trap cleanup_validation_temp EXIT

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

file_size() {
  if stat -f '%z' "$1" >/dev/null 2>&1; then
    stat -f '%z' "$1"
  else
    stat -c '%s' "$1"
  fi
}

assert_equal() {
  local actual="$1"
  local expected="$2"
  local label="$3"
  if [ "$actual" = "$expected" ]; then
    pass "$label = $expected"
  else
    fail "$label expected $expected, got $actual"
  fi
}

assert_file() {
  local path="$1"
  local label="$2"
  if [ -f "$path" ]; then
    pass "$label"
  else
    fail "$label missing: $path"
  fi
}

assert_budget() {
  local path="$1"
  local budget="$2"
  local label="$3"
  local bytes
  bytes="$(file_size "$path")"
  if [ "$bytes" -le "$budget" ]; then
    pass "$label ${bytes}B <= ${budget}B"
  else
    fail "$label ${bytes}B exceeds ${budget}B"
  fi
}

assert_alpha() {
  local path="$1"
  local label="$2"
  local channels
  channels="$(magick identify -format '%[channels]' "$path")"
  if [[ "$channels" == *a* ]]; then
    pass "$label has alpha"
  else
    fail "$label lacks alpha: $channels"
  fi
}

validate_manifest_paths() {
  local pack_dir="$1"
  local manifest="$pack_dir/pack.json"
  local relative_path
  while IFS= read -r relative_path; do
    if [[ "$relative_path" = /* || "$relative_path" == *'..'* ]]; then
      fail "unsafe manifest path in $manifest: $relative_path"
      continue
    fi
    assert_file "$pack_dir/$relative_path" "manifest asset $relative_path"
  done < <(jq -r '.assets[]?, .iconMap[]?' "$manifest")
}

validate_public_pack_set() {
  local pack_set="$ROOT_DIR/public-pack-set.json"
  local expected_ids='["knife-shield-dog","orbital-stargazer-black-cat","orange-mecha-cat"]'
  local manifest_count
  local total_refs=0
  local pack_id

  assert_file "$pack_set" "canonical public theme pack set"
  if ! jq empty "$pack_set" >/dev/null 2>&1; then
    fail "canonical public theme pack set JSON invalid"
    return
  fi
  assert_equal "$(jq -r '.schemaVersion' "$pack_set")" "1" "public pack set schema"
  assert_equal "$(jq -r '.contract' "$pack_set")" "public-hot-swap-pack-set" "public pack set contract"
  assert_equal "$(jq -r '.exactCount' "$pack_set")" "3" "public pack set exact count"
  assert_equal "$(jq -c '.orderedPackIds' "$pack_set")" "$expected_ids" "public pack set ordered ids"
  assert_equal "$(jq -r '.requiredAssetKeys | length' "$pack_set")" "6" "public pack set asset key count"
  assert_equal "$(jq -r '.requiredIconMapKeys | length' "$pack_set")" "15" "public pack set icon key count"

  manifest_count="$(find "$ROOT_DIR" -mindepth 2 -maxdepth 2 -type f -name pack.json | wc -l | tr -d ' ')"
  assert_equal "$manifest_count" "3" "public pack manifest count"

  while IFS= read -r pack_id; do
    local manifest="$ROOT_DIR/$pack_id/pack.json"
    local expected_asset_keys
    local expected_icon_keys
    local actual_asset_keys
    local actual_icon_keys
    local pack_refs
    assert_file "$manifest" "canonical manifest $pack_id"
    if [ ! -f "$manifest" ] || ! jq empty "$manifest" >/dev/null 2>&1; then
      fail "canonical manifest invalid: $pack_id"
      continue
    fi
    expected_asset_keys="$(jq -c '.requiredAssetKeys | sort' "$pack_set")"
    expected_icon_keys="$(jq -c '.requiredIconMapKeys | sort' "$pack_set")"
    actual_asset_keys="$(jq -c '.assets | keys | sort' "$manifest")"
    actual_icon_keys="$(jq -c '.iconMap | keys | sort' "$manifest")"
    assert_equal "$actual_asset_keys" "$expected_asset_keys" "$pack_id exact asset keys"
    assert_equal "$actual_icon_keys" "$expected_icon_keys" "$pack_id exact icon map keys"
    pack_refs="$(jq -r '[(.assets[]?), (.iconMap[]?)] | length' "$manifest")"
    assert_equal "$pack_refs" "21" "$pack_id runtime reference count"
    total_refs=$((total_refs + pack_refs))
  done < <(jq -r '.orderedPackIds[]' "$pack_set")

  assert_equal "$total_refs" "63" "public pack runtime reference total"
}

validate_icons() {
  local pack_dir="$1"
  local icon_dir="$pack_dir/runtime/icons"
  local icon_count
  icon_count="$(find "$icon_dir" -maxdepth 1 -type f -name '*.svg' | wc -l | tr -d ' ')"
  assert_equal "$icon_count" "16" "$(basename "$pack_dir") SVG icon count"

  local icon
  while IFS= read -r icon; do
    if xmllint --noout "$icon" >/dev/null 2>&1; then
      pass "valid SVG $(basename "$pack_dir")/$(basename "$icon")"
    else
      fail "invalid SVG: $icon"
    fi
  done < <(find "$icon_dir" -maxdepth 1 -type f -name '*.svg' | sort)
}

validate_pack_contract() {
  local pack_dir="$1"
  local pack_id="$2"
  local frame_count="$3"
  local sprite_width="$4"
  local sprite_height="$5"
  local sprite_name="$6"
  local frame_glob="$7"
  local trigger_term="$8"
  local manifest="$pack_dir/pack.json"
  local sprite_path="$pack_dir/runtime/animations/$sprite_name"

  if jq empty "$manifest" >/dev/null 2>&1; then
    pass "$pack_id manifest JSON"
  else
    fail "$pack_id manifest JSON invalid"
    return
  fi

  assert_equal "$(jq -r '.id' "$manifest")" "$pack_id" "$pack_id manifest id"
  assert_equal "$(jq -r '.status' "$manifest")" "asset-ready-unmounted" "$pack_id status"
  assert_equal "$(jq -r '.interaction.activation' "$manifest")" "manual-click-only" "$pack_id activation"
  assert_equal "$(jq -r '.interaction.preload' "$manifest")" "false" "$pack_id preload"
  assert_equal "$(jq -r '.interaction.idlePlaybackDom' "$manifest")" "false" "$pack_id idle playback DOM"
  assert_equal "$(jq -r '.interaction.frameCount' "$manifest")" "$frame_count" "$pack_id frame count contract"

  if jq -e '.payloadGroups.visual | index("interactionSprite") | not' "$manifest" >/dev/null; then
    pass "$pack_id playback sprite excluded from visual preload group"
  else
    fail "$pack_id playback sprite is in visual preload group"
  fi

  if jq -e '.payloadGroups.animationPlayback | index("interactionSprite") != null' "$manifest" >/dev/null; then
    pass "$pack_id playback sprite isolated in animationPlayback"
  else
    fail "$pack_id playback sprite missing from animationPlayback"
  fi

  if jq -r '.interaction.cleanup' "$manifest" | rg -q 'remove playback node'; then
    pass "$pack_id interaction cleanup contract"
  else
    fail "$pack_id interaction cleanup contract missing"
  fi

  if jq -r '.mountContracts.interaction.activation' "$manifest" | rg -qi "$trigger_term"; then
    pass "$pack_id trigger contract contains $trigger_term"
  else
    fail "$pack_id trigger contract does not contain $trigger_term"
  fi

  validate_manifest_paths "$pack_dir"
  validate_icons "$pack_dir"

  local actual_frames
  actual_frames="$(find "$pack_dir/runtime/animations/frames" -maxdepth 1 -type f -name "$frame_glob" | wc -l | tr -d ' ')"
  assert_equal "$actual_frames" "$frame_count" "$pack_id extracted frame count"

  local sprite_dimensions
  sprite_dimensions="$(magick identify -format '%wx%h' "$sprite_path")"
  assert_equal "$sprite_dimensions" "${sprite_width}x${sprite_height}" "$pack_id sprite dimensions"

  assert_alpha "$pack_dir/$(jq -r '.assets.heroCharacter' "$manifest")" "$pack_id hero"
  assert_alpha "$pack_dir/$(jq -r '.assets.interactionMascot' "$manifest")" "$pack_id mascot"
  assert_alpha "$sprite_path" "$pack_id sprite"

  assert_budget \
    "$pack_dir/$(jq -r '.assets.background' "$manifest")" \
    "$(jq -r '.mountContracts.background.budgetBytes' "$manifest")" \
    "$pack_id background"
  assert_budget \
    "$pack_dir/$(jq -r '.assets.heroCharacter' "$manifest")" \
    "$(jq -r '.mountContracts.heroCharacter.budgetBytes' "$manifest")" \
    "$pack_id hero"
  assert_budget \
    "$sprite_path" \
    "$(jq -r '.mountContracts.interaction.budgetBytes' "$manifest")" \
    "$pack_id interaction sprite"

  if [ "$VALIDATION_MODE" = "full" ]; then
    if [ -x "$pack_dir/build-assets.sh" ]; then
      pass "$pack_id build script executable"
    else
      fail "$pack_id build script is not executable"
    fi
  fi
}

validate_expected_sources() {
  local pack_dir="$1"
  shift
  local expected_count="$#"
  local actual_count
  actual_count="$(find "$pack_dir/sources" -maxdepth 1 -type f | wc -l | tr -d ' ')"
  assert_equal "$actual_count" "$expected_count" "$(basename "$pack_dir") source count"

  local source_name
  for source_name in "$@"; do
    assert_file "$pack_dir/sources/$source_name" "$(basename "$pack_dir") source $source_name"
  done
}

validate_hot_swap_preview() {
  local preview="$ROOT_DIR/previews/hot-swap-bay.html"

  assert_file "$preview" "hot swap bay preview"

  if rg -q 'setInterval' "$preview"; then
    fail "hot swap preview must not use interval polling"
  else
    pass "hot swap preview uses no interval polling"
  fi

  if rg -q 'releaseImageElement' "$preview" && rg -q 'removeAttribute' "$preview"; then
    pass "hot swap preview releases inactive image references"
  else
    fail "hot swap preview does not release inactive image references"
  fi

  if rg -q 'releasePlayback' "$preview" && rg -q "backgroundImage = 'none'" "$preview"; then
    pass "hot swap preview releases playback DOM and image reference"
  else
    fail "hot swap preview does not release playback image reference"
  fi

  if rg -q 'data-pack="knife-shield-dog"' "$preview" \
    && rg -q 'data-pack="orbital-stargazer-black-cat"' "$preview" \
    && rg -q 'data-pack="orange-mecha-cat"' "$preview"; then
    pass "hot swap preview exposes all pack selectors"
  else
    fail "hot swap preview pack selectors missing"
  fi

  if rg -q 'visual group hot swapped, frame unchanged' "$preview"; then
    pass "hot swap preview declares fixed-frame contract"
  else
    fail "hot swap preview fixed-frame contract missing"
  fi
}

validate_pack_activation_cli() {
  local script="$ROOT_DIR/scripts/activate-pack.mjs"
  local temp_state="$VALIDATION_TEMP_BASE"
  local project_root
  project_root="$(cd "$ROOT_DIR/.." && pwd)"

  assert_file "$script" "theme pack activation CLI"

  if node --check "$script" >/dev/null 2>&1; then
    pass "theme pack activation CLI syntax"
  else
    fail "theme pack activation CLI syntax"
  fi

  if node "$script" list --format json | jq -e '.packs | map(.id) | index("knife-shield-dog") and index("orbital-stargazer-black-cat") and index("orange-mecha-cat")' >/dev/null; then
    pass "theme pack activation CLI lists all packs"
  else
    fail "theme pack activation CLI list output missing packs"
  fi

  local plan_file="$temp_state-plan.json"
  if node "$script" plan \
    --pack knife-shield-dog \
    --state-dir "$temp_state" \
    --format json >"$plan_file"; then
    pass "theme pack activation CLI dry-run plan"
  else
    fail "theme pack activation CLI dry-run plan"
  fi

  if jq -e '(.writesActiveTheme == false) and (.theme.backgroundImagePath | test("knife-shield-dog"))' "$plan_file" >/dev/null; then
    pass "theme pack dry-run maps dog background without write"
  else
    fail "theme pack dry-run did not map dog background"
  fi

  if [ ! -f "$temp_state/themes/active.json" ]; then
    pass "theme pack dry-run does not write active theme"
  else
    fail "theme pack dry-run wrote active theme"
  fi

  local activate_file="$temp_state-activate.json"
  if node "$script" activate \
    --pack orbital-stargazer-black-cat \
    --state-dir "$temp_state" \
    --format json >"$activate_file"; then
    pass "theme pack activation CLI isolated activate"
  else
    fail "theme pack activation CLI isolated activate"
  fi

  if jq -e '.activated == true and .theme.themePack.id == "orbital-stargazer-black-cat"' "$activate_file" >/dev/null; then
    pass "theme pack activation CLI writes selected pack metadata"
  else
    fail "theme pack activation CLI selected pack metadata"
  fi

  if [ -f "$temp_state/themes/active.json" ]; then
    pass "theme pack activation CLI wrote isolated active theme"
  else
    fail "theme pack activation CLI did not write isolated active theme"
  fi

  if node "$project_root/macos/scripts/module-matrix.mjs" \
    --state-dir "$temp_state" \
    --assets-dir "$project_root/macos/assets" \
    --format json \
    | jq -e '.ok == true and .plans.activeTheme.modules.background == "enabled" and .plans.activeTheme.modules.tableFlipCatLoad == "static-cache-click"' >/dev/null; then
    pass "theme pack activated theme passes module matrix"
  else
    fail "theme pack activated theme failed module matrix"
  fi
}

for command_name in jq magick xmllint rg node; do
  require_command "$command_name"
done

validate_public_pack_set

if [ "$VALIDATION_MODE" = "full" ]; then
  validate_expected_sources \
    "$ROOT_DIR/knife-shield-dog" \
    "animation-forward-slash-sheet-chroma.png" \
    "background-castle-left-city-right.png" \
    "hero-mecha-dog-chroma.png" \
    "mascot-chubby-dog-chroma.png"

  validate_expected_sources \
    "$ROOT_DIR/orbital-stargazer-black-cat" \
    "animation-groom-sheet-chroma.png" \
    "animation-roll-sheet-chroma.png" \
    "background-capsule-left-observatory-right.png" \
    "hero-astronaut-black-cat-chroma.png" \
    "mascot-black-cat-chroma.png"

  validate_expected_sources \
    "$ROOT_DIR/orange-mecha-cat" \
    "background-cyberpunk-contrast-city.png" \
    "hero-mecha-cat-chroma.png" \
    "mascot-orange-hacker-cat-chroma.png" \
    "table-flip-cat-left.webp"
fi

validate_pack_contract \
  "$ROOT_DIR/knife-shield-dog" \
  "knife-shield-dog" \
  "6" \
  "1536" \
  "192" \
  "forward-slash-sprite.webp" \
  "forward-slash-*.png" \
  "shield"

validate_pack_contract \
  "$ROOT_DIR/orbital-stargazer-black-cat" \
  "orbital-stargazer-black-cat" \
  "8" \
  "2048" \
  "192" \
  "roll-groom-sprite.webp" \
  "roll-groom-*.png" \
  "paw"

validate_pack_contract \
  "$ROOT_DIR/orange-mecha-cat" \
  "orange-mecha-cat" \
  "8" \
  "2880" \
  "250" \
  "table-flip-sprite.webp" \
  "table-flip-*.png" \
  "angry"

if [ "$VALIDATION_MODE" = "full" ]; then
  validate_hot_swap_preview
fi
validate_pack_activation_cli

if find "$ROOT_DIR" \
  \( -type d -name '__pycache__' -o -type f \( -name '*.pyc' -o -name '.DS_Store' \) \) \
  -print -quit | rg -q .; then
  fail "theme packs contain generated cache or Finder metadata"
else
  pass "theme packs contain no generated cache or Finder metadata"
fi

if find "$ROOT_DIR" -type l -print -quit | rg -q .; then
  fail "theme packs contain symbolic links"
else
  pass "theme packs contain no symbolic links"
fi

if rg -n \
  --glob '*.json' \
  --glob '*.sh' \
  --glob '*.py' \
  --glob '*.mjs' \
  --glob '*.html' \
  '/(Users|private|var/folders)/' \
  "$ROOT_DIR" >/dev/null; then
  fail "theme pack text files contain local absolute paths"
else
  pass "theme pack text files contain no local absolute paths"
fi

if find "$ROOT_DIR/orbital-stargazer-black-cat" -type f \
  | rg -qi '(forest|cat.?tower|greenhouse|narrow|rejected)'; then
  fail "black-cat pack contains excluded or superseded material"
else
  pass "black-cat pack excludes forest, cat tower, and rejected sheets"
fi

if [ "$FAILURES" -ne 0 ]; then
  printf '\nTheme-pack validation failed: %d issue(s)\n' "$FAILURES" >&2
  exit 1
fi

printf '\nTheme-pack validation passed\n'
