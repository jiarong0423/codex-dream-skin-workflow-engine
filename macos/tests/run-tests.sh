#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." >/dev/null 2>&1 && pwd)"
PROJECT_ROOT="$(cd "$ROOT_DIR/.." >/dev/null 2>&1 && pwd)"
source "$ROOT_DIR/scripts/common.sh"

APP_PATH="$(cit_detect_app_or_die)"
NODE_PATH="$(cit_node_for_app "$APP_PATH")"
PYTHON_PATH="${PYTHON_PATH:-python3}"

bash -n "$ROOT_DIR/scripts/common.sh"
bash -n "$ROOT_DIR/scripts/install.sh"
bash -n "$ROOT_DIR/scripts/start.sh"
bash -n "$ROOT_DIR/scripts/restore.sh"
bash -n "$ROOT_DIR/scripts/verify.sh"
bash -n "$ROOT_DIR/scripts/customize.sh"
bash -n "$ROOT_DIR/scripts/install-launcher.sh"
bash -n "$ROOT_DIR/scripts/install-chainsaw-launcher.sh"
bash -n "$ROOT_DIR/scripts/chainsaw-duel-one-click-injector.sh"
bash -n "$ROOT_DIR/scripts/revision-loop-one-click.sh"
bash -n "$ROOT_DIR/launcher/Dream Skin Forge.app/Contents/MacOS/dream-skin-forge-launcher"
bash -n "$ROOT_DIR/launcher/Chainsaw Duel Injector.app/Contents/MacOS/chainsaw-duel-injector"
bash -n "$ROOT_DIR/launcher/Dream Skin Forge.command"
bash -n "$ROOT_DIR/launcher/Chainsaw Duel Injector.command"
bash -n "$PROJECT_ROOT/.agents/skills/codex-dream-skin-workflow/scripts/workflow-gate.sh"
plutil -lint "$ROOT_DIR/launcher/Dream Skin Forge.app/Contents/Info.plist" >/dev/null
plutil -lint "$ROOT_DIR/launcher/Chainsaw Duel Injector.app/Contents/Info.plist" >/dev/null

"$PYTHON_PATH" - "$PROJECT_ROOT/.agents/skills/codex-dream-skin-workflow/scripts/workflow-gate.sh" <<'PY'
import pathlib
import sys

gate = pathlib.Path(sys.argv[1]).read_text(encoding="utf-8")
tests_index = gate.find("bash macos/tests/run-tests.sh")
boundary_index = gate.find("node macos/scripts/module-boundary-gate.mjs")
matrix_index = gate.find("node macos/scripts/module-matrix.mjs")
if min(tests_index, boundary_index, matrix_index) < 0 or not (tests_index < boundary_index < matrix_index):
    raise SystemExit("workflow gate must run tests, module-boundary-gate, then module matrix")
boundary_block = gate[boundary_index:matrix_index]
if "if ! node macos/scripts/module-boundary-gate.mjs" not in gate or "exit 1" not in boundary_block:
    raise SystemExit("workflow gate must fail closed when module-boundary-gate fails")
if '--state-dir "$HOME/Library/Application Support/DreamSkinForge"' not in gate:
    raise SystemExit("workflow gate must read the canonical DreamSkinForge state directory")
if "CodexInterfaceTheme" in gate:
    raise SystemExit("workflow gate must not restore the retired CodexInterfaceTheme state path")
PY

grep -Fq 'Post-Revision Layer Scan Rule' "$PROJECT_ROOT/.agents/skills/codex-dream-skin-workflow/SKILL.md" || cit_die "workflow skill must require post-revision layer scans"
grep -Fq 'docs/KNOWN_BLACK_RANGE_LEDGER.json' "$PROJECT_ROOT/.agents/skills/codex-dream-skin-workflow/SKILL.md" || cit_die "workflow skill must route black surfaces through the known black ledger"
grep -Fq 'docs/SURFACE_GAP_MATRIX.json' "$PROJECT_ROOT/.agents/skills/codex-dream-skin-workflow/SKILL.md" || cit_die "workflow skill must route black surfaces through the surface gap matrix"
grep -Fq 'coordinates as evidence only' "$PROJECT_ROOT/.agents/skills/codex-dream-skin-workflow/SKILL.md" || cit_die "workflow skill must forbid coordinate-only layer ownership"
grep -Fq 'unmarkedNearBlackShells' "$PROJECT_ROOT/.agents/skills/codex-dream-skin-workflow/SKILL.md" || cit_die "workflow skill must report unmarked near-black shell status"
grep -Fq 'Multi-layer scan is mandatory' "$PROJECT_ROOT/.agents/skills/codex-dream-skin-workflow/SKILL.md" || cit_die "workflow skill must require multi-layer black scans"
grep -Fq 'Repair means replacement, not overlay' "$PROJECT_ROOT/.agents/skills/codex-dream-skin-workflow/SKILL.md" || cit_die "workflow skill must forbid overlay-based black-layer repairs"
grep -Fq 'docs/PINNED_REVISION_LOOP_STANDARD.md' "$PROJECT_ROOT/.agents/skills/codex-dream-skin-workflow/SKILL.md" || cit_die "workflow skill must point to the pinned revision loop standard"
if [ -f "$PROJECT_ROOT/docs/PROJECT_LOG.md" ]; then
  grep -Fq 'docs/PINNED_REVISION_LOOP_STANDARD.md' "$PROJECT_ROOT/docs/PROJECT_LOG.md" || cit_die "project log must keep the pinned revision standard visible"
fi
grep -Fq 'Successful Architecture' "$PROJECT_ROOT/docs/PINNED_REVISION_LOOP_STANDARD.md" || cit_die "pinned revision loop must include the successful architecture diagram"
grep -Fq 'Decision Matrix' "$PROJECT_ROOT/docs/PINNED_REVISION_LOOP_STANDARD.md" || cit_die "pinned revision loop must include decision rules"
grep -Fq 'Replace the existing owner rule or owner marker' "$PROJECT_ROOT/docs/PINNED_REVISION_LOOP_STANDARD.md" || cit_die "pinned revision loop must require replacement-only repair"
grep -Fq 'queued-route-black-scan.mjs' "$PROJECT_ROOT/docs/PINNED_REVISION_LOOP_STANDARD.md" || cit_die "pinned revision loop must include queued route scanning"
grep -Fq 'chainsaw-duel-one-click-injector.sh' "$PROJECT_ROOT/docs/PINNED_REVISION_LOOP_STANDARD.md" || cit_die "pinned revision loop must include one-shot injection"
grep -Fq 'revision-loop-one-click.sh' "$PROJECT_ROOT/docs/PINNED_REVISION_LOOP_STANDARD.md" || cit_die "pinned revision loop must include the one-command wrapper"
grep -Fq 'restore.sh --port 9341' "$PROJECT_ROOT/docs/PINNED_REVISION_LOOP_STANDARD.md" || cit_die "pinned revision loop must include restore readiness"
grep -Fq 'workflow-gate.sh --runtime' "$PROJECT_ROOT/docs/PINNED_REVISION_LOOP_STANDARD.md" || cit_die "pinned revision loop must include the runtime workflow gate"
grep -Fq 'Click And Load Layout Stability Contract' "$PROJECT_ROOT/docs/PINNED_REVISION_LOOP_STANDARD.md" || cit_die "pinned revision loop must include click/load layout stability rules"
grep -Fq 'stable CSS dimensions before interaction' "$PROJECT_ROOT/docs/PINNED_REVISION_LOOP_STANDARD.md" || cit_die "layout stability contract must require stable dimensions"
grep -Fq 'must not create unbounded polling' "$PROJECT_ROOT/docs/PINNED_REVISION_LOOP_STANDARD.md" || cit_die "layout stability contract must forbid unbounded click/load polling"
grep -Fq 'blackLayers' "$PROJECT_ROOT/macos/scripts/priority-black-layer-scan.mjs" || cit_die "priority black-layer scanner must report exact black layers"
grep -Fq 'stackedBlackLayerCount' "$PROJECT_ROOT/macos/scripts/priority-black-layer-scan.mjs" || cit_die "priority black-layer scanner must count stacked black layers"
grep -Fq 'replace-existing-owner-rule-only' "$PROJECT_ROOT/docs/SURFACE_GAP_MATRIX.json" || cit_die "surface gap matrix must require owner-rule replacement for black-layer repair"

grep -q 'start.sh" --no-launch --once' "$ROOT_DIR/launcher/Dream Skin Forge.app/Contents/MacOS/dream-skin-forge-launcher"
grep -q 'start.sh" --once --port' "$ROOT_DIR/launcher/Dream Skin Forge.app/Contents/MacOS/dream-skin-forge-launcher"
grep -q 'chainsaw-duel-one-click-injector.sh' "$ROOT_DIR/launcher/Chainsaw Duel Injector.app/Contents/MacOS/chainsaw-duel-injector"
grep -q 'DREAM_SKIN_PROJECT_ROOT' "$ROOT_DIR/launcher/Chainsaw Duel Injector.app/Contents/MacOS/chainsaw-duel-injector"
grep -q 'INSTALLED_PROJECT_ROOT=.*chainsaw-project' "$ROOT_DIR/launcher/Chainsaw Duel Injector.app/Contents/MacOS/chainsaw-duel-injector"
grep -q '/bin/bash "$INJECTOR" --port "$PORT" --wait-ms "$WAIT_MS" --gate "$RUN_GATE"' "$ROOT_DIR/launcher/Chainsaw Duel Injector.app/Contents/MacOS/chainsaw-duel-injector"
grep -q -- '--port "$PORT" --wait-ms "$WAIT_MS" --gate "$RUN_GATE"' "$ROOT_DIR/launcher/Chainsaw Duel Injector.app/Contents/MacOS/chainsaw-duel-injector"
grep -q 'desktop app apply failed status=$status' "$ROOT_DIR/launcher/Chainsaw Duel Injector.app/Contents/MacOS/chainsaw-duel-injector"
grep -q 'Log: ${LOG_FILE}' "$ROOT_DIR/launcher/Chainsaw Duel Injector.app/Contents/MacOS/chainsaw-duel-injector"
grep -q 'Chainsaw Duel Injector.command' "$ROOT_DIR/launcher/Chainsaw Duel Injector.app/Contents/MacOS/chainsaw-duel-injector"
grep -q 'INSTALLED_PROJECT_ROOT=.*chainsaw-project' "$ROOT_DIR/launcher/Chainsaw Duel Injector.command"
grep -q '/bin/bash "$INJECTOR" --port "$PORT" --wait-ms "$WAIT_MS" --gate "$RUN_GATE"' "$ROOT_DIR/launcher/Chainsaw Duel Injector.command"
grep -q 'chainsaw-duel-injector-command.log' "$ROOT_DIR/launcher/Chainsaw Duel Injector.command"
grep -q 'SOURCE_COMMAND=.*Chainsaw Duel Injector.command' "$ROOT_DIR/scripts/install-chainsaw-launcher.sh"
grep -q 'RUNTIME_ROOT=.*chainsaw-project' "$ROOT_DIR/scripts/install-chainsaw-launcher.sh"
grep -q 'rsync -a --delete "$PROJECT_ROOT/macos/" "$RUNTIME_ROOT/macos/"' "$ROOT_DIR/scripts/install-chainsaw-launcher.sh"
grep -q 'rsync -a --delete "$PROJECT_ROOT/theme-packs/" "$RUNTIME_ROOT/theme-packs/"' "$ROOT_DIR/scripts/install-chainsaw-launcher.sh"
grep -q 'runtimeProjectRoot=%s' "$ROOT_DIR/scripts/install-chainsaw-launcher.sh"
grep -q 'codesign --force --deep --sign - "$TARGET_APP"' "$ROOT_DIR/scripts/install-chainsaw-launcher.sh"
grep -q 'xattr -dr com.apple.quarantine "$TARGET_APP" "$TARGET_COMMAND" "$RUNTIME_ROOT"' "$ROOT_DIR/scripts/install-chainsaw-launcher.sh"
grep -q 'start.sh" --no-launch --once' "$ROOT_DIR/launcher/Dream Skin Forge.command"
grep -q 'start.sh" --once --port' "$ROOT_DIR/launcher/Dream Skin Forge.command"
"$PYTHON_PATH" - "$PROJECT_ROOT" <<'PY'
import pathlib
import re
import sys

project = pathlib.Path(sys.argv[1])
chainsaw_launchers = [
    project / "macos/launcher/Chainsaw Duel Injector.command",
    project / "macos/launcher/Chainsaw Duel Injector.app/Contents/MacOS/chainsaw-duel-injector",
]
for launcher in chainsaw_launchers:
    text = launcher.read_text(encoding="utf-8")
    for token in [
        'INSTALLED_PROJECT_ROOT="$STATE_DIR/chainsaw-project"',
        'CANONICAL_PROJECT_ROOT="$HOME/Developer/skin"',
        'LEGACY_PROJECT_ROOT="$HOME/Documents/skin"',
        'DREAM_SKIN_PROJECT_ROOT',
        'cd -P',
        'no usable project root found; checked candidates:',
    ]:
        if token not in text:
            raise SystemExit(f"{launcher.name} missing resolver contract: {token}")
    match = re.search(r"resolve_project_root\(\) \{(?P<body>.*?)\n\}", text, re.S)
    if not match:
        raise SystemExit(f"{launcher.name} missing resolve_project_root")
    body = match.group("body")
    ordered = [
        'candidates+=("$DREAM_SKIN_PROJECT_ROOT")',
        '"$source_project_root"' if launcher.suffix == ".command" else '"$bundled_root"',
        '"$INSTALLED_PROJECT_ROOT"',
        '"$CANONICAL_PROJECT_ROOT"',
        '"$LEGACY_PROJECT_ROOT"',
    ]
    positions = [body.find(token) for token in ordered]
    if min(positions) < 0 or positions != sorted(positions):
        raise SystemExit(f"{launcher.name} resolver precedence is not override > source/bundle > installed > canonical > legacy: {positions}")
    source_token = 'source_project_root="$(cd -P "$launcher_dir/../.."' if launcher.suffix == ".command" else 'bundled_root="$(cd -P "$executable_dir/../../../../.."'
    if source_token not in body:
        raise SystemExit(f"{launcher.name} must resolve its physical source/bundle root before installed fallbacks")

dream_launchers = [
    project / "macos/launcher/Dream Skin Forge.command",
    project / "macos/launcher/Dream Skin Forge.app/Contents/MacOS/dream-skin-forge-launcher",
]
for launcher in dream_launchers:
    text = launcher.read_text(encoding="utf-8")
    for token in [
        'ENGINE_DIR="${CIT_ENGINE_DIR:-$HOME/.codex/dream-skin-forge}"',
        'ENGINE_DIR="$(cd -P "$ENGINE_DIR"',
        'INJECTOR_PATH="$ENGINE_DIR/scripts/injector.mjs"',
        '-v injector="$INJECTOR_PATH"',
        'index($0, injector)',
        '/--daemon/',
        '$(field_index + 1) == port',
    ]:
        if token not in text:
            raise SystemExit(f"{launcher.name} missing custom-engine daemon matching contract: {token}")

for readme_name in ["README.md", "README.en.md"]:
    text = (project / readme_name).read_text(encoding="utf-8")
    for token in [
        "~/.codex/dream-skin-forge",
        "~/Library/Application Support/DreamSkinForge",
        "~/Applications/Dream Skin Forge.app",
        "/Applications/ChatGPT.app",
    ]:
        if token not in text:
            raise SystemExit(f"{readme_name} missing current path: {token}")
    for stale in [
        "~/.codex/codex-interface-theme",
        "~/Library/Application Support/CodexInterfaceTheme",
        "~/Applications/Codex Dream Skin.app",
    ]:
        if stale in text:
            raise SystemExit(f"{readme_name} retains stale path: {stale}")
PY
grep -q 'chainsaw duel one-click injector' "$ROOT_DIR/scripts/chainsaw-duel-one-click-injector.sh" || cit_die "Chainsaw duel one-click injector must identify itself"
grep -q 'Pinned revision loop wrapper' "$ROOT_DIR/scripts/revision-loop-one-click.sh" || cit_die "revision loop wrapper must identify itself"
grep -q 'docs/PINNED_REVISION_LOOP_STANDARD.md' "$ROOT_DIR/scripts/revision-loop-one-click.sh" || cit_die "revision loop wrapper must point to the pinned standard"
grep -q 'bash "$CIT_ROOT_DIR/tests/run-tests.sh"' "$ROOT_DIR/scripts/revision-loop-one-click.sh" || cit_die "revision loop wrapper must run local tests"
grep -q 'workflow-gate.sh --runtime' "$ROOT_DIR/scripts/revision-loop-one-click.sh" || cit_die "revision loop wrapper must run the runtime workflow gate"
grep -q 'git diff --check' "$ROOT_DIR/scripts/revision-loop-one-click.sh" || cit_die "revision loop wrapper must run diff whitespace checks"
grep -q 'chainsaw-duel-one-click-injector.sh' "$ROOT_DIR/scripts/revision-loop-one-click.sh" || cit_die "revision loop wrapper must call the one-click injector"
grep -q 'queued-route-black-scan.sh' "$ROOT_DIR/scripts/revision-loop-one-click.sh" || cit_die "revision loop wrapper must call the queued route scanner"
grep -q 'restore.sh --port' "$ROOT_DIR/scripts/revision-loop-one-click.sh" || cit_die "revision loop wrapper must print a restore command"
grep -q 'VISUAL_GATE_BLOCKED' "$ROOT_DIR/scripts/revision-loop-one-click.sh" || cit_die "revision loop wrapper must record CDP blockers"
grep -q 'ROLLBACK_REQUIRED' "$ROOT_DIR/scripts/revision-loop-one-click.sh" || cit_die "revision loop wrapper must record failed apply or scan states"
grep -q 'PRIVATE_LOADER=.*private-pack-loader.mjs' "$ROOT_DIR/scripts/chainsaw-duel-one-click-injector.sh" || cit_die "Chainsaw duel one-click injector must bind the private pack loader"
grep -q 'PRIVATE_INJECTOR=.*private-duel-injector.mjs' "$ROOT_DIR/scripts/chainsaw-duel-one-click-injector.sh" || cit_die "Chainsaw duel one-click injector must bind the private injector"
grep -q 'NODE_DIR=.*dirname "$NODE_PATH"' "$ROOT_DIR/scripts/chainsaw-duel-one-click-injector.sh" || cit_die "Chainsaw duel one-click injector must expose bundled Node directory to shell gates"
grep -q '"$NODE_PATH" "$PRIVATE_LOADER" build' "$ROOT_DIR/scripts/chainsaw-duel-one-click-injector.sh" || cit_die "Chainsaw duel one-click injector must build the selected runtime manifest"
grep -q '"$NODE_PATH" "$PRIVATE_LOADER" stage-apply' "$ROOT_DIR/scripts/chainsaw-duel-one-click-injector.sh" || cit_die "Chainsaw duel one-click injector must stage a one-shot apply bridge"
grep -q '"$NODE_PATH" "$PRIVATE_INJECTOR" --pack' "$ROOT_DIR/scripts/chainsaw-duel-one-click-injector.sh" || cit_die "Chainsaw duel one-click injector must call the private injector by pack id"
grep -q 'PATH="$NODE_DIR:$PATH" bash "$WORKFLOW_GATE" --runtime' "$ROOT_DIR/scripts/chainsaw-duel-one-click-injector.sh" || cit_die "Chainsaw duel one-click injector must run workflow gate with bundled Node on PATH"
grep -q 'START_ARGS=(--once --port "$PORT" --wait-ms "$WAIT_MS")' "$ROOT_DIR/scripts/chainsaw-duel-one-click-injector.sh" || cit_die "Chainsaw duel one-click injector must be able to open CDP through one-shot start.sh"
grep -q 'START_ARGS=(--restart "${START_ARGS\[@\]}")' "$ROOT_DIR/scripts/chainsaw-duel-one-click-injector.sh" || cit_die "Chainsaw duel one-click injector must reopen Codex when it is already running without CDP"
grep -q 'start.sh" --no-launch --once' "$ROOT_DIR/scripts/chainsaw-duel-one-click-injector.sh" || cit_die "Chainsaw duel one-click injector must apply formal theme through one-shot no-launch when CDP already exists"

if grep -R 'for (index =' "$ROOT_DIR/launcher" >/dev/null 2>&1; then
  cit_die "launcher awk loops must not use index as a variable name on macOS awk"
fi

grep -q 'codex-interface-theme-right-hud' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "renderer must install the right HUD element"
grep -q '#codex-interface-theme-right-hud' "$ROOT_DIR/assets/theme.css" || cit_die "theme.css must style the right HUD element"
grep -q '"subtractive module aggregation"' "$ROOT_DIR/assets/runtime-modules.json" || cit_die "runtime module manifest must document subtractive module aggregation"
grep -q 'surfaceRegistrySource' "$ROOT_DIR/scripts/injector.mjs" || cit_die "injector must package the native surface registry source"
grep -q 'surface-registry.js' "$ROOT_DIR/scripts/injector.mjs" || cit_die "injector must read the native surface registry asset"
grep -q 'payload.surfaceRegistrySource' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "renderer must consume the packaged native surface registry source"
grep -q 'function installSurfaceRegistry' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "renderer must install the native surface registry through an owned module"
grep -q 'function tickSurfaceRegistry' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "renderer must maintain the native surface registry through its API"
grep -q 'function cleanupSurfaceRegistry' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "renderer must clean the native surface registry through its API"
grep -q 'id: "surfaceRegistry"' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "renderer runtime modules must register surfaceRegistry"
grep -q 'applyRuntimeDefaults' "$ROOT_DIR/scripts/injector.mjs" || cit_die "injector must normalize active themes through shared runtime defaults"
grep -q 'TABLE_FLIP_CAT_DEFAULTS' "$ROOT_DIR/scripts/theme-store.mjs" || cit_die "theme-store must share table flip cat runtime defaults"
grep -q -- '--cit-table-flip-cat-image' "$ROOT_DIR/assets/theme.css" || cit_die "theme.css must expose the table flip cat image variable"
grep -q 'tableFlipCatSpriteDataUrl' "$ROOT_DIR/scripts/injector.mjs" || cit_die "injector must package the lightweight table flip cat sprite asset"
grep -q 'tableFlipCatDataUrl' "$ROOT_DIR/scripts/injector.mjs" || cit_die "injector must keep the table flip cat GIF fallback asset"
grep -q 'tableFlipCatSpriteDataUrl ? "" : readTableFlipCatDataUrl' "$ROOT_DIR/scripts/injector.mjs" || cit_die "injector must skip GIF payload when the sprite asset is available"
grep -q 'tableFlipCatTriggerIconDataUrl' "$ROOT_DIR/scripts/injector.mjs" || cit_die "injector must package the table flip cat trigger icon asset"
grep -q 'animationPlayback' "$ROOT_DIR/scripts/injector.mjs" || cit_die "injector must isolate table flip playback assets"
grep -q 'TARGET_ASSET_GROUP_PREFIX' "$ROOT_DIR/scripts/injector.mjs" || cit_die "injector must persist content-hash asset groups independently"
grep -q 'assetGroupsPruned' "$ROOT_DIR/scripts/injector.mjs" || cit_die "injector must prune stale persistent asset groups"
grep -q 'animationPlaybackResident' "$ROOT_DIR/scripts/injector.mjs" || cit_die "verify must report whether playback data remains resident"
grep -q 'loadTableFlipCatPlayback' "$ROOT_DIR/scripts/injector.mjs" || cit_die "injector must expose click-time table flip asset lookup"
grep -q 'themePackDataUrls' "$ROOT_DIR/scripts/injector.mjs" || cit_die "injector must package developer theme-pack hot-swap candidates"
for theme_asset_field in background heroCharacter interactionMascot interactionTrigger interactionSprite interactionPoster; do
  grep -q "readThemePackAssetDataUrl(packDir, assets.${theme_asset_field}" "$ROOT_DIR/scripts/injector.mjs" || cit_die "theme-pack ${theme_asset_field} must use a renderer-safe data URL"
done
grep -q 'sourceLabel' "$ROOT_DIR/scripts/injector.mjs" || cit_die "injector must expose a safe relative theme-pack source label"
grep -q 'themePacks: { themePackDataUrls }' "$ROOT_DIR/scripts/injector.mjs" || cit_die "injector must isolate theme-pack candidates in their own payload group"
grep -q 'loadGroup("themePacks", false)' "$ROOT_DIR/scripts/injector.mjs" || cit_die "injector must load theme-pack candidates without retaining them in the window cache"
grep -q 'readTargetThemeState' "$ROOT_DIR/scripts/injector.mjs" || cit_die "injector must inspect current renderer theme state before resending core"
grep -q 'storedThemePacks' "$ROOT_DIR/scripts/injector.mjs" || cit_die "injector must inspect persisted theme-pack payload before trusting its hash"
grep -q 'unsafePack' "$ROOT_DIR/scripts/injector.mjs" || cit_die "injector must invalidate unsafe persisted theme-pack payloads"
grep -q 'skippedCore' "$ROOT_DIR/scripts/injector.mjs" || cit_die "injector must skip core injection when revision and asset hashes are unchanged"
grep -q 'tableFlipCatSpriteDataUrl' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "renderer must consume the lightweight table flip cat sprite payload"
grep -q 'tableFlipCatDataUrl' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "renderer must keep the table flip cat GIF fallback payload"
grep -q 'tableFlipCatTriggerIconDataUrl' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "renderer must consume the table flip cat trigger icon payload"
grep -q 'loadTableFlipCatPlayback' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "renderer must resolve table flip playback only after click"
grep -q 'hotSwapPacks' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "renderer must expose developer theme-pack hot-swap candidates"
grep -q 'activateHotSwapPack' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "renderer must switch active theme packs in place"
grep -q 'installHotSwapSwitcher' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "renderer must install a theme-pack cycle switcher"
grep -q 'codex-interface-theme-pack-bay' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "renderer must install the hot-swap control bay"
grep -q 'codex-interface-theme-pack-cycle-button' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "renderer must install a single theme-pack cycle icon button"
grep -q 'codex-interface-theme-cycle-orb' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "renderer must install the compact theme cycle orb"
grep -q 'positionHotSwapBayInLeftSidebar' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "theme-pack cycle icon must anchor to the left sidebar"
grep -q 'data-cit-hot-swap-retreat' "$ROOT_DIR/assets/theme.css" || cit_die "theme.css must gate the theme-pack cycle icon during narrow retreat"
grep -q 'maintainBodyBackgroundInline' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "renderer must maintain the body background after Codex repaint or route changes"
grep -q 'id: "background"' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "renderer runtime modules must include background maintenance"
grep -q 'codex-interface-theme-pack-switcher' "$ROOT_DIR/assets/theme.css" || cit_die "theme.css must style the hot-swap switcher"
grep -q 'codex-interface-theme-pack-bay' "$ROOT_DIR/assets/theme.css" || cit_die "theme.css must style the hot-swap cycle bay"
grep -q 'codex-interface-theme-pack-cycle-button' "$ROOT_DIR/assets/theme.css" || cit_die "theme.css must style the single hot-swap cycle icon button"
grep -q 'codex-interface-theme-cycle-orb' "$ROOT_DIR/assets/theme.css" || cit_die "theme.css must style the compact theme cycle orb"
if grep -q 'codex-interface-theme-pack-select' "$ROOT_DIR/assets/renderer-inject.js" || grep -q 'codex-interface-theme-pack-select' "$ROOT_DIR/assets/theme.css"; then
  cit_die "theme-pack hot-swap must not reintroduce the old dropdown selector"
fi
if grep -q 'codex-interface-theme-yarn-icon' "$ROOT_DIR/assets/renderer-inject.js" || grep -q 'codex-interface-theme-yarn-icon' "$ROOT_DIR/assets/theme.css"; then
  cit_die "theme-pack hot-swap must not use the oversized yarn icon"
fi
python3 - "$ROOT_DIR/assets/theme.css" <<'PY'
import pathlib
import re
import sys

css = pathlib.Path(sys.argv[1]).read_text(encoding="utf-8")

def block_for(selector):
    pattern = re.escape(selector) + r"\s*\{(?P<body>.*?)\n\}"
    match = re.search(pattern, css, re.S)
    if not match:
        raise SystemExit(f"missing CSS block: {selector}")
    return match.group("body")

bay = block_for('html[data-codex-interface-theme="active"] body > .codex-interface-theme-pack-bay')
button = block_for('html[data-codex-interface-theme="active"] body > .codex-interface-theme-pack-bay .codex-interface-theme-pack-cycle-button')
if "border: 0 !important;" not in bay:
    raise SystemExit("hot-swap bay must not draw an outer border")
if "box-shadow: none !important;" not in bay:
    raise SystemExit("hot-swap bay must not draw an outer glow")
if "left: var(--cit-pack-bay-left" not in bay or "top: var(--cit-pack-bay-top" not in bay:
    raise SystemExit("hot-swap bay must be positioned by runtime left-sidebar geometry")
if "width: 20px !important;" not in bay or "height: 20px !important;" not in bay:
    raise SystemExit("hot-swap bay must stay compact")
if "-webkit-appearance: none !important;" not in button or "appearance: none !important;" not in button:
    raise SystemExit("hot-swap cycle button must suppress native button appearance")
if "border-radius: 999px !important;" not in button:
    raise SystemExit("hot-swap cycle button must render as one circular icon")
if "width: 20px !important;" not in button or "height: 20px !important;" not in button:
    raise SystemExit("hot-swap cycle button must stay compact")
PY
python3 - "$ROOT_DIR/assets/renderer-inject.js" <<'PY'
import pathlib
import re
import sys

renderer = pathlib.Path(sys.argv[1]).read_text(encoding="utf-8")
match = re.search(r"function positionHotSwapBayInLeftSidebar\(bay\) \{(?P<body>.*?)\n  \}\n\n  function cleanupHotSwapSwitcher", renderer, re.S)
if not match:
    raise SystemExit("missing hot-swap placement function")
body = match.group("body")
if "doc.getElementById(BADGE_ID)" not in body:
    raise SystemExit("hot-swap placement must anchor to the left sidebar badge")
if "doc.getElementById(CHARACTER_ID)" in body:
    raise SystemExit("hot-swap placement must not anchor to the large character")
if "sidebar-badge" not in body:
    raise SystemExit("hot-swap placement must expose sidebar-badge placement")
PY
grep -Fq 'document.querySelector("body > .codex-interface-theme-pack-bay")' "$ROOT_DIR/scripts/injector.mjs" || cit_die "verify must inspect body-level hot-swap bay after sidebar anchoring"
grep -q 'animated = doc.createElement("span")' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "renderer must create the table flip animation node on demand"
grep -q 'animated.remove()' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "renderer must release the table flip animation node after playback"
if grep -q 'tableFlipCatPosterDataUrl' "$ROOT_DIR/scripts/injector.mjs" || grep -q 'tableFlipCatPosterDataUrl' "$ROOT_DIR/assets/renderer-inject.js"; then
  cit_die "runtime must not package the unused table flip poster"
fi
grep -q 'TABLE_FLIP_CAT_DEFAULT_DURATION_MS' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "renderer must keep table flip cat animation manually timed"
grep -q 'data-cit-lazy-playback' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "renderer must keep table flip cat animation lazy until click"
grep -q 'data-cit-table-flip-frame' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "renderer must expose table flip cat frame state for playback diagnostics"
if grep -q 'requestAnimationFrame(drawFrame)' "$ROOT_DIR/assets/renderer-inject.js"; then
  cit_die "renderer must not drive table flip sprite frames on the JS main thread"
fi
grep -q 'animation: cit-table-flip-cat-sprite-once' "$ROOT_DIR/assets/theme.css" || cit_die "table flip sprite must use compositor-friendly CSS steps playback"
grep -q 'triggerIcon.onclick = playTableFlipCat' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "table flip cat playback must be bound to the angry icon only"
grep -q 'triggerIcon.setAttribute("role", "button")' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "table flip trigger icon must expose button semantics"
grep -q 'releaseTableFlipPlaybackNode()' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "table flip playback must release temporary playback nodes"
if grep -q 'tableFlipCatPlaybackInterval' "$ROOT_DIR/assets/renderer-inject.js"; then
  cit_die "table flip playback must not use an extra unbounded interval poll"
fi
grep -q 'workspacePickerHoldUntil = Date.now() + 1400' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "workspace picker detection must keep a bounded hold gate"
grep -q 'projectPanelChromePendingUntil = Date.now() + 1240' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "project panel preflight must keep a bounded hold gate"
grep -q 'characterRetreatHoldUntil = now + 480' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "character retreat must keep a bounded hold gate"
grep -q 'positionHotSwapBayInLeftSidebar(bay)' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "hot-swap bay must keep stable sidebar anchoring after clicks"
grep -q 'target.insertBefore(glyph, target.firstChild)' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "button glyphs must be inserted in-place without replacing native buttons"
grep -q 'data-cit-character-retreat' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "renderer must expose character-only retreat state"
grep -q 'hasVisibleRightSidePanel(character)' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "character retreat must use character-aware side panel geometry"
grep -q 'characterCoreRect(character.getBoundingClientRect())' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "character retreat must use the visual core for text and side-panel collision"
grep -q 'function hasLayoutBox' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "character text collision must ignore character opacity while using geometry"
grep -q 'characterRetreatHoldUntil' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "character retreat must hold briefly to avoid flicker during drawer transitions"
grep -q 'MutationObserver' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "character retreat must react to side panel and text layout mutations"
grep -q 'scheduleCharacterRetreatCheck' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "character retreat mutation checks must be throttled"
grep -q 'characterRetreatLastCheckAt + 260' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "character retreat must avoid high-frequency visual flicker"
grep -q 'characterOverlapsComposerSurface' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "character retreat must treat the composer as a protected collision surface"
grep -q 'a.bottom - h' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "composer collision must use the character lower contact zone, not the full transparent asset box"
grep -Fq 'r.width * .24' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "text collision must use the character visual core, not the full transparent asset box"
grep -Fq '[data-cit-character-retreat]:not([data-cit-character-retreat="none"])' "$ROOT_DIR/assets/theme.css" || cit_die "character retreat CSS must hide the character for any active retreat reason"
grep -q 'findRightMajorPanelRect' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "renderer must detect the large right source column"
grep -q 'projectPanelChromeCollidesWithLargeRightColumn' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "renderer must detect project panel collision with a large right column"
grep -q 'triggerProjectPanelChromePreflight' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "renderer must preflight project panel chrome from the top-right trigger"
grep -q 'markProjectPanelChromePreflightPending' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "right panel preflight must preserve existing project panel chrome during pending state"
grep -q 'maxProjectPanelWidth' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "project panel detection must accept the wider official panel shell"
sed -n '/function triggerProjectPanelChromePreflight/,/^  }/p' "$ROOT_DIR/assets/renderer-inject.js" | grep -q 'scheduleDeferredFrame' || cit_die "right panel transient shell must be checked through tracked animation frames"
if grep -q 'suppressProjectPanelChromeForRightMajorPanel("pending")' "$ROOT_DIR/assets/renderer-inject.js"; then
  cit_die "right panel pending preflight must not remove project panel chrome"
fi
grep -q 'installProjectPanelChromeEventHooks' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "renderer must install lightweight project panel event hooks"
grep -q 'hidden-by-major-right-panel' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "project panel chrome must hide when the large right column is open"
grep -q 'cleanupButtonGlyphsForModule("projectPanelRows")' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "right-column auto-hide must restore only project panel row glyphs"
grep -q 'const character = doc.getElementById(CHARACTER_ID)' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "restore must remove the character element"
grep -q 'data-cit-right-major-panel' "$ROOT_DIR/assets/theme.css" || cit_die "theme.css must suppress project panel chrome during large right column mode"
grep -q 'rightMajorPanel' "$ROOT_DIR/scripts/injector.mjs" || cit_die "verify smoke must report large right column detection state"
grep -q 'tableFlipTrigger.click()' "$ROOT_DIR/scripts/injector.mjs" || cit_die "verify smoke must click the table flip trigger icon, not the HUD container"
grep -q 'afterContainerClick' "$ROOT_DIR/scripts/injector.mjs" || cit_die "verify smoke must prove the HUD container does not trigger playback"
grep -q 'cit-table-flip-cat-sprite-once' "$ROOT_DIR/assets/theme.css" || cit_die "theme.css must provide a one-shot table flip cat sprite animation"
grep -q 'data-cit-uses-sprite' "$ROOT_DIR/assets/theme.css" || cit_die "theme.css must gate sprite animation by runtime asset mode"
grep -q '#codex-interface-theme-right-hud\[role="button"\]:focus-visible' "$ROOT_DIR/assets/theme.css" || cit_die "right HUD focus-visible outline must be suppressed"
grep -q '.codex-interface-theme-table-flip-trigger-icon:focus-visible' "$ROOT_DIR/assets/theme.css" || cit_die "table flip trigger icon must have a visible focus target"
grep -q 'Right panel readability guard' "$ROOT_DIR/assets/theme.css" || cit_die "right panel text must stay readable above glass layers"
grep -q -- '-webkit-text-fill-color: currentColor' "$ROOT_DIR/assets/theme.css" || cit_die "right panel text fill must not be transparent"
grep -q 'background-image: none !important' "$ROOT_DIR/assets/theme.css" || cit_die "table flip cat animation layer must not be visible before click"
grep -q 'image/gif' "$ROOT_DIR/scripts/injector.mjs" || cit_die "injector must support GIF image payloads"
grep -q 'image/webp' "$ROOT_DIR/scripts/injector.mjs" || cit_die "injector must support WebP image payloads"
grep -q 'ROUTE_WATCH_INTERVAL_MS = 2500' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "renderer maintenance interval must stay load-reduced"
grep -q 'HEAVY_MAINTENANCE_EVERY_TICKS = 4' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "renderer heavy maintenance must stay throttled"
grep -Fq 'const RUNTIME_MODULES = [' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "renderer must use a distributed runtime module registry"
grep -q 'runRuntimeModulePhase("light")' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "renderer light phase must run through the runtime module registry"
grep -q 'runRuntimeModulePhase("heavy")' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "renderer heavy phase must run through the runtime module registry"
grep -q 'function maintainBadgeMount()' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "badge module must repair an early body mount after the native sidebar appears"
grep -q 'light: maintainBadgeMount' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "badge mount repair must use the existing low-frequency maintenance phase"
grep -q 'stabilize: maintainBadgeMount' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "badge mount repair must run once after the initial paint"
grep -q 'staticAccess' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "renderer must expose static access cache state"
grep -q 'cachedElement' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "renderer must reuse stable DOM entrypoints through cachedElement"
grep -q 'function cachedNodeList' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "renderer must cache stable DOM node lists through cachedNodeList"
grep -q 'staticInteractiveTargets()' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "button modules must reuse static interactive target access"
grep -q 'staticAriaButtonTargets()' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "titlebar module must reuse static aria-button access"
grep -q 'staticProjectPanelChrome()' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "project panel chrome collision must reuse static panel chrome access"
grep -q 'projectPanelRowCandidates' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "project panel rows must reuse cached scoped row candidates"
grep -q 'invalidateStaticAccess("route", true)' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "static access cache must invalidate on route changes"
grep -q 'citPageKind = "codex-menu"' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "Codex menu routes must not be merged back into generic home state"
grep -Fq '.flex.h-full.min-h-0.flex-col.bg-token-main-surface-primary' "$ROOT_DIR/assets/theme.css" || cit_die "Codex menu pages must clean native route shell backgrounds"
grep -Fq 'button.bg-token-foreground.rounded-lg.h-token-button-composer' "$ROOT_DIR/assets/theme.css" || cit_die "Codex menu split create buttons must be styled within the page owner"
grep -Fq 'main button.bg-token-foreground.border-token-border.rounded-full:not(.size-token-button-composer)' "$ROOT_DIR/assets/theme.css" || cit_die "Codex menu auth action buttons must not render as native white pills"
grep -Fq '.sticky.after\:from-token-main-surface-primary::after' "$ROOT_DIR/assets/theme.css" || cit_die "Codex menu route sticky headers must not keep a native black band"
grep -q 'invalidateStaticAccess("mutation")' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "static access cache must invalidate on low-frequency layout mutations"
grep -q 'characterRetreatHoldUntil = now + 480' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "character retreat recovery must use a bounded short hold"
if grep -q 'characterRetreatHoldUntil = now + 1400' "$ROOT_DIR/assets/renderer-inject.js"; then
  cit_die "character retreat checks must not keep extending the old 1400ms hold"
fi
grep -q 'invalidateStaticAccess("right-trigger", true)' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "static access cache must invalidate on right-top trigger preflight"
grep -q 'Composer five-batch rebuild' "$ROOT_DIR/assets/theme.css" || cit_die "theme.css must use the five-batch composer rebuild"
grep -q 'Composer batch 1' "$ROOT_DIR/assets/theme.css" || cit_die "composer rebuild must keep the frame reset batch"
grep -Fq '.sticky.bottom-0:has([class*="ComposerLayoutRoot"])' "$ROOT_DIR/assets/theme-modules/composer-shell.css" || cit_die "composer rebuild must keep the bottom floor light batch in the composer-shell module"
grep -Fq '.codex-interface-theme-composer-surface::after' "$ROOT_DIR/assets/theme-modules/composer-shell.css" || cit_die "composer rebuild must keep the fifth-layer shell removal batch in the composer-shell module"
grep -q 'Composer batch 4' "$ROOT_DIR/assets/theme.css" || cit_die "composer rebuild must keep the inner control safety batch"
grep -q 'Composer batch 5' "$ROOT_DIR/assets/theme.css" || cit_die "composer rebuild must keep the chip separation batch"
grep -q 'Composer batch 6' "$ROOT_DIR/assets/theme.css" || cit_die "composer rebuild must clear native input floors separately"
grep -Fq ':has(:is(.codex-interface-theme-composer-surface,[class*="ComposerLayoutRoot"]))' "$ROOT_DIR/assets/theme.css" || cit_die "composer sticky dock must clear native ComposerLayoutRoot fallback without widening coverage"
grep -q 'codex-interface-theme-composer-native-fade' "$ROOT_DIR/assets/theme.css" || cit_die "composer must remove the native black floor fade sibling"
grep -q 'codex-interface-theme-composer-dock' "$ROOT_DIR/assets/theme.css" || cit_die "composer must clear the native sticky dock outer shell"
grep -q 'codex-interface-theme-composer-native-floor' "$ROOT_DIR/assets/theme.css" || cit_die "composer must mark and clear native floor wrappers"
grep -q 'ComposerLayoutRoot' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "composer detection must support the current native ComposerLayoutRoot shell"
grep -Fq '[class*="ComposerLayoutRoot"]' "$ROOT_DIR/assets/theme.css" || cit_die "composer CSS must support native ComposerLayoutRoot fallback when JS marker is absent"
grep -q "ComposerLayoutRoot" "$ROOT_DIR/scripts/black-shell-layer-audit.mjs" || cit_die "black shell audit must recognize CSS-owned native composer fallback"
grep -Fq "main,[role='main']" "$ROOT_DIR/scripts/black-shell-layer-audit.mjs" || cit_die "black shell audit must protect main workspace shell owner"
grep -Fq "aside.app-shell-left-panel" "$ROOT_DIR/scripts/black-shell-layer-audit.mjs" || cit_die "black shell audit must protect sidebar owner without visual edits"
grep -Fq "codex-interface-theme-composer-dock *" "$ROOT_DIR/scripts/black-shell-layer-audit.mjs" || cit_die "black shell audit must protect composer dock owner"
grep -q "codex-interface-theme-project-panel-frame" "$ROOT_DIR/scripts/black-shell-layer-audit.mjs" || cit_die "black shell audit must protect scoped project panel surfaces"
grep -q 'ProseMirror, \[role=\\"textbox\\"\]' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "composer detection must anchor from the native editable textbox"
grep -Fq '[class*="group/summary-panel-item"]' "$ROOT_DIR/assets/theme.css" || cit_die "right panel row cleanup must catch slash-named native summary rows"
python3 - "$ROOT_DIR/assets/theme.css" <<'PY'
import pathlib
import re
import sys

css = pathlib.Path(sys.argv[1]).read_text(encoding="utf-8")
RULE = re.compile(r"(?P<selectors>[^{}]+)\{(?P<body>[^{}]*)\}", re.S)
FRAME = 'html[data-codex-interface-theme="active"] .codex-interface-theme-project-panel-frame'
PANEL = 'html[data-codex-interface-theme="active"] .codex-interface-theme-project-panel'

def blocks_owning(selector):
    found = []
    for rule in RULE.finditer(css):
        parts = [part.strip().split("\n")[-1].strip() for part in rule.group("selectors").split(",")]
        if selector in parts:
            found.append(rule.group("body"))
    return found

frames = blocks_owning(FRAME)
panels = blocks_owning(PANEL)
if not frames:
    raise SystemExit("theme.css must own the right panel frame")
if not panels:
    raise SystemExit("theme.css must own the right panel surface")
if not any("background: transparent !important;" in block for block in frames):
    raise SystemExit("right panel frame must stay transparent so the panel owns the only glass plate")
plates = [block for block in panels if re.search(r"background:\s*rgba\([^)]*\)\s*!important;", block)]
if len(plates) != 1:
    raise SystemExit(f"right panel must keep a single transparent owner glass plate, found {len(plates)}")
if "background-image: none !important;" not in plates[0]:
    raise SystemExit("right panel glass plate must not carry a second background image layer")
PY
grep -q 'payload.externalWebviewOpen' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "right panel owner must consume external webview state without styling the webview"
! grep -q 'return Boolean(payload.externalWebviewOpen || findRightMajorPanelRect' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "external webview state must not directly suppress the environment/source panel owner"
if sed -n '/function suppressProjectPanelChromeForRightMajorPanel/,/^  }/p' "$ROOT_DIR/assets/renderer-inject.js" | grep -q 'cleanupProjectPanels()'; then
  cit_die "right panel suppression must keep owner classes so hidden/restored states stay controllable"
fi
grep -q 'function withTargetContext' "$ROOT_DIR/scripts/injector.mjs" || cit_die "injector must pass external target context to the app owner"
grep -q 'type === "webview"' "$ROOT_DIR/scripts/injector.mjs" || cit_die "injector must detect external webview targets without injecting into them"
grep -Fq 'url.startsWith("app://-/index.html")' "$ROOT_DIR/scripts/injector.mjs" || cit_die "injector allowlist must stay pinned to Codex app renderer targets"
! grep -q 'url === "about:blank"' "$ROOT_DIR/scripts/injector.mjs" || cit_die "injector must not apply to about:blank targets"
! grep -q 'chatgpt.com' "$ROOT_DIR/scripts/injector.mjs" || cit_die "injector must not apply to browser/web chat targets"
grep -q 'function pruneNonAppThemeResidue' "$ROOT_DIR/scripts/injector.mjs" || cit_die "injector must clean stale theme residue from formerly injectable non-app targets"
grep -q 'function readTargetResidueState' "$ROOT_DIR/scripts/injector.mjs" || cit_die "injector must detect partial stale residue without relying only on the marker"
grep -q 'hasStyle: Boolean(document.getElementById("codex-interface-theme-style"))' "$ROOT_DIR/scripts/injector.mjs" || cit_die "injector residue cleanup must catch style-only theme leftovers"
grep -q 'prunedTargets' "$ROOT_DIR/scripts/injector.mjs" || cit_die "injector apply result must report non-app residue pruning"
grep -Fq 'rect.right < window.innerWidth * .52' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "right panel detection must tolerate the in-app browser taking the true window edge"
grep -Fq '[class*=\"summary-panel-item\"]' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "right panel marker maintenance must use fuzzy native summary row detection"
grep -q 'codex-interface-theme-project-panel-row' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "project panel rows must receive a scoped cleanup marker"
grep -q 'codex-interface-theme-project-panel-row' "$ROOT_DIR/assets/theme.css" || cit_die "project panel row marker must have shell cleanup CSS"
if sed -n '/function cleanupProjectPanels/,/^  }/p' "$ROOT_DIR/assets/renderer-inject.js" | grep -Eq 'composer|chat-bubble|chat-card'; then
  cit_die "project panel cleanup must not clear composer or conversation owners"
fi
grep -q 'from-token-main-surface-primary' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "renderer must identify the native composer floor fade by its scoped token class"
grep -q 'Final cockpit convergence' "$ROOT_DIR/assets/theme.css" || cit_die "theme must keep the final transparent cockpit convergence pass"
grep -Fq '.sticky.bottom-0 .composer-surface-chrome' "$ROOT_DIR/assets/theme.css" || cit_die "native composer must keep glass styling before runtime class attachment"
grep -q ':has(.composer-surface-chrome).*from-token-main-surface-primary' "$ROOT_DIR/assets/theme.css" || cit_die "native composer must remove both footer fades without runtime class maintenance"
grep -Fq '.sticky.bottom-0:has([class*="ComposerLayoutRoot"]) [class*="bg-gradient-to-t"][class*="from-token-main-surface-primary"]' "$ROOT_DIR/assets/theme.css" || cit_die "native ComposerLayoutRoot composer fade must be hidden by a scoped token selector"
if grep -Eq 'nth-(child|of-type)|children\[[0-9]+\]|childNodes\[[0-9]+\]' "$ROOT_DIR/assets/theme.css" "$ROOT_DIR/assets/renderer-inject.js"; then
  cit_die "runtime selectors must not depend on positional child paths"
fi
grep -q '0 0 0 1px rgba(255,255,255,.052)' "$ROOT_DIR/assets/theme.css" || cit_die "conversation and composer glass must keep a visible Apple-style edge"
if grep -q 'light: installComposerFrame' "$ROOT_DIR/assets/renderer-inject.js"; then
  cit_die "composer must not reapply on the 2500ms light maintenance cycle"
fi
grep -q 'background-image: none !important' "$ROOT_DIR/assets/theme.css" || cit_die "composer surface must be able to remove native black shell images"
grep -q '"staticAccess"' "$ROOT_DIR/assets/runtime-modules.json" || cit_die "runtime module manifest must declare staticAccess"
grep -q '"collisionScheduler"' "$ROOT_DIR/assets/runtime-modules.json" || cit_die "runtime module manifest must declare collisionScheduler"
grep -q '"themePacks"' "$ROOT_DIR/assets/runtime-modules.json" || cit_die "runtime module manifest must declare themePacks as a developer extension"
grep -q 'staticAccess' "$ROOT_DIR/scripts/module-matrix.mjs" || cit_die "module matrix must require staticAccess"
grep -q 'collisionScheduler' "$ROOT_DIR/scripts/module-matrix.mjs" || cit_die "module matrix must require collisionScheduler"
grep -q 'theme-packs-extension' "$ROOT_DIR/scripts/module-matrix.mjs" || cit_die "module matrix must verify theme pack hot-swap extension readiness"
grep -q 'staticAccessHits' "$ROOT_DIR/scripts/injector.mjs" || cit_die "verify smoke must report static access cache hits"
grep -q 'maintenanceIntervalMs' "$ROOT_DIR/scripts/injector.mjs" || cit_die "verify smoke must report renderer maintenance interval"
grep -q 'workspacePickerShells' "$ROOT_DIR/scripts/injector.mjs" || cit_die "verify smoke must report workspace picker shell hits"
grep -q 'workspacePickerPlate' "$ROOT_DIR/scripts/injector.mjs" || cit_die "verify smoke must report absence of detached workspace picker backing plates"
grep -q 'installBodyBackgroundInline' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "renderer must use controlled body inline background installation"
grep -q 'removeLegacyBackgroundStyle' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "renderer must remove the retired direct background style rule"
grep -Fq 'linear-gradient(180deg, rgba(38, 82, 101, 0.026), rgba(38, 82, 101, 0.155))' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "body background must use the low-darkness floor overlay"
grep -q 'background-size", "cover, cover, cover"' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "body wallpaper must stay within the three-layer composition budget"
grep -q 'background-attachment", "scroll, scroll, scroll"' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "body wallpaper layers must not use fixed attachment"
grep -q 'GPU composition budget' "$ROOT_DIR/assets/theme.css" || cit_die "theme must declare the low-cost GPU composition convergence pass"
grep -q 'Subtractive effects pass' "$ROOT_DIR/assets/theme.css" || cit_die "theme must remove idle per-icon and character filter stacks"
grep -q 'Official titlebar/sidebar junction' "$ROOT_DIR/assets/theme.css" || cit_die "theme must keep the final left titlebar/sidebar junction fix"
grep -q 'Opaque transient surfaces' "$ROOT_DIR/assets/theme.css" || cit_die "modal and menu surfaces must remain readable without live blur"
grep -q 'Single-owner workspace glass' "$PROJECT_ROOT/macos/assets/theme-modules/workspace-glass.css" || cit_die "workspace picker glass must live in the single-owner module"
grep -q 'workspaceGlassCss' "$PROJECT_ROOT/theme-packs/scripts/private-duel-injector.mjs" || cit_die "private runtime must load workspace glass module"
grep -Fq '[role="listbox"]' "$ROOT_DIR/assets/theme.css" || cit_die "workspace picker fix must cover listbox surfaces"
grep -Fq '[cmdk-root]' "$ROOT_DIR/assets/theme.css" || cit_die "workspace picker fix must cover command palette surfaces"
grep -q 'codex-interface-theme-workspace-picker' "$ROOT_DIR/assets/theme.css" || cit_die "workspace picker fix must cover runtime-marked picker shells"
grep -q 'not(.codex-interface-theme-workspace-picker)' "$ROOT_DIR/assets/theme.css" || cit_die "generic rounded surfaces must not override workspace picker glass"
grep -q 'not(\[class\*="bg-token-dropdown-background"\]):not(\[class\*="max-h-"\])' "$ROOT_DIR/assets/theme.css" || cit_die "generic rounded surfaces must not override native workspace picker shells before runtime marking"
grep -q 'main \[class\*="bg-token-dropdown-background"\]\[class\*="rounded-2xl"\]\[class\*="border"\]\[class\*="max-h-"\]' "$ROOT_DIR/assets/theme.css" || cit_die "workspace picker must have a native-class fallback before runtime marking"
grep -q 'workspacePickers' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "renderer must register the workspace picker transient module"
grep -q 'workspacePickerHoldUntil' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "workspace picker must keep a short anti-flicker hold after transient misses"
! grep -q 'route: installWorkspacePickers' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "workspace picker must not run on route maintenance"
! grep -q 'stabilize: installWorkspacePickers' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "workspace picker must not run on stabilize maintenance"
! grep -q 'codex-interface-theme-workspace-picker-plate' "$ROOT_DIR/assets/theme.css" || cit_die "workspace picker must not use a detached overlay plate"
grep -q '"workspacePickers"' "$ROOT_DIR/assets/runtime-modules.json" || cit_die "runtime module manifest must declare workspacePickers"
grep -q '"gpuComposition"' "$ROOT_DIR/assets/runtime-modules.json" || cit_die "runtime module policy must document the GPU composition budget"

python3 - "$ROOT_DIR" <<'PY'
import pathlib
import sys

root = pathlib.Path(sys.argv[1])
css = (root / "assets" / "theme.css").read_text(encoding="utf-8")

if "transform: translate3d(-22px, 26px, 0) scale(0.92) !important;" in css:
    raise SystemExit("character retreat must not move its own collision geometry")
if "transform: translate3d(0, 0, 0) scale(1) !important;" not in css:
    raise SystemExit("character retreat must preserve natural geometry while hidden")

try:
    right_panel_clean = css.split("/* Layer-clean owner overrides. */", 1)[1].split("/* Opaque transient surfaces", 1)[0]
except IndexError:
    raise SystemExit("missing layer-clean owner override section")

if ".codex-interface-theme-project-panel" not in right_panel_clean:
    raise SystemExit("right panel clean override must target the panel owner")
if "background: transparent !important;" not in right_panel_clean:
    raise SystemExit("right panel inner panel and rows must be transparent by default")
if "box-shadow: none !important;" not in right_panel_clean:
    raise SystemExit("right panel rows must not draw stacked black capsules")
if "Final transient row cleanup" not in css:
    raise SystemExit("transient rows need a final cleanup after fallback dropdown rules")

transient_clean = css.split("/* Final transient row cleanup. */", 1)[1].split("/* Official titlebar/sidebar junction", 1)[0]
if "background: transparent !important;" not in transient_clean:
    raise SystemExit("transient menu rows must be transparent by default")
if "box-shadow: none !important;" not in transient_clean:
    raise SystemExit("transient menu rows must not draw stacked black capsules")
if "background-image:none!important;" not in transient_clean:
    raise SystemExit("transient hover or selected state must not add a second layer")
PY

if grep -q 'radial-gradient(ellipse at 43% 98%' "$ROOT_DIR/assets/renderer-inject.js"; then
  cit_die "renderer must not restore the removed floor radial layers"
fi

if grep -q 'background-attachment", "fixed' "$ROOT_DIR/assets/renderer-inject.js"; then
  cit_die "renderer must not restore fixed body wallpaper layers"
fi

if grep -q '/ cover no-repeat fixed' "$ROOT_DIR/assets/theme.css"; then
  cit_die "theme CSS must not use a fixed body wallpaper layer"
fi

if "$PYTHON_PATH" - "$ROOT_DIR/assets/theme.css" <<'PY'
import pathlib
import sys

css = pathlib.Path(sys.argv[1]).read_text(encoding="utf-8")
subtractive = css.rfind("Subtractive effects pass")
junction = css.rfind("Official titlebar/sidebar junction")
if subtractive < 0 or junction < 0 or junction < subtractive:
    raise SystemExit(1)
junction_css = css[junction:]
required = [
    '--cit-left-shell-width: 294px;',
    'clip-path: inset(0 round 0 var(--cit-glass-radius) var(--cit-glass-radius) 0) !important;',
    'html[data-codex-interface-theme="active"] header.app-header-tint::after',
    'left: var(--cit-left-shell-width) !important;',
    'pointer-events: none !important;',
    'content: none !important;',
    'display: none !important;',
]
if any(item not in junction_css for item in required):
    raise SystemExit(1)
for forbidden in [
    'transparent 0 88px',
    'rgba(3, 7, 9, 0.86) 88px 93px',
    'mask the native header divider',
]:
    if forbidden in junction_css:
        raise SystemExit(1)
if 'border-bottom: 0 !important;' not in junction_css:
    raise SystemExit(1)
raise SystemExit(0)
PY
then
  :
else
  cit_die "left titlebar/sidebar junction fix must survive without a dark eraser band"
fi

if grep -q 'function buildDirectBackgroundCss' "$ROOT_DIR/assets/renderer-inject.js" || grep -q 'function installBackgroundStyle' "$ROOT_DIR/assets/renderer-inject.js"; then
  cit_die "retired direct background style rule writer must stay removed"
fi

if "$PYTHON_PATH" - "$ROOT_DIR/assets/theme.css" <<'PY'
import pathlib
import sys

css = pathlib.Path(sys.argv[1]).read_text(encoding="utf-8")
junction = css.rfind("Official titlebar/sidebar junction")
sidebar_clean = css.rfind("Final sidebar row state cleanup")
if junction < 0 or sidebar_clean < 0 or sidebar_clean < junction:
    raise SystemExit(1)
block = css[sidebar_clean:]
required = [
    "--cit-sidebar-row-state",
    ".sidebar-item):has(:is(a, button, [role=\"button\"], [role=\"link\"]):is(:hover",
    "li:has(> :is(a, button, [role=\"button\"], [role=\"link\"]))",
    "background-color: transparent !important;",
    "background-image: none !important;",
    "box-shadow: none !important;",
    "--cit-sidebar-row-state: transparent;",
    ".sidebar-item[aria-current=\"page\"].bg-token-list-hover-background:not(:hover):not(:focus-visible)",
]
if any(item not in block for item in required):
    raise SystemExit(1)
raise SystemExit(0)
PY
then
  :
else
  cit_die "final sidebar row state cleanup must keep one outer state layer and clear inner controls"
fi

if grep -q 'NEKO\\A CORE' "$ROOT_DIR/assets/theme.css"; then
  cit_die "right HUD text badge must stay replaced by the table flip cat"
fi

if grep -q 'hud.onclick = function playTableFlipCat' "$ROOT_DIR/assets/renderer-inject.js"; then
  cit_die "right HUD container must not trigger table flip playback"
fi

if grep -q 'hud.setAttribute("role", "button")' "$ROOT_DIR/assets/renderer-inject.js"; then
  cit_die "right HUD container must not expose button semantics"
fi

if grep -q 'projectPanelChromeObserver' "$ROOT_DIR/assets/renderer-inject.js"; then
  cit_die "project panel chrome must reuse existing layout mutation handling, not create a second full-page observer"
fi

if grep -Fq '.codex-interface-theme-composer-surface *,' "$ROOT_DIR/assets/theme.css"; then
  cit_die "composer surface must not blank every descendant background"
fi

if grep -q 'sticky.bottom-0.*bg-token-input-background' "$ROOT_DIR/assets/theme.css"; then
  cit_die "bottom chip styling must not target the composer input background"
fi

if grep -q 'Composer final sizing' "$ROOT_DIR/assets/theme.css" || grep -q 'Composer rollback' "$ROOT_DIR/assets/theme.css"; then
  cit_die "dead composer frame sizing branches must stay removed"
fi

if "$PYTHON_PATH" - "$ROOT_DIR/assets/theme.css" <<'PY'
import pathlib
import re
import sys

css = pathlib.Path(sys.argv[1]).read_text(encoding="utf-8")
match = re.search(r"#codex-interface-theme-right-hud\s*\{(?P<body>.*?)\n\}", css, re.S)
if not match:
    raise SystemExit(0)
if "repeating-linear-gradient" in match.group("body"):
    raise SystemExit(1)
raise SystemExit(0)
PY
then
  :
else
  cit_die "right HUD must not use dense repeating grid backgrounds"
fi

"$NODE_PATH" --check "$ROOT_DIR/scripts/injector.mjs"
"$NODE_PATH" --check "$ROOT_DIR/scripts/theme-store.mjs"
"$NODE_PATH" --check "$ROOT_DIR/scripts/theme-runtime-defaults.mjs"
"$NODE_PATH" --check "$ROOT_DIR/scripts/module-matrix.mjs"
"$NODE_PATH" --check "$ROOT_DIR/scripts/module-boundary-gate.mjs"
"$NODE_PATH" --check "$ROOT_DIR/scripts/performance-probe.mjs"
"$NODE_PATH" --check "$ROOT_DIR/assets/renderer-inject.js"

"$NODE_PATH" - "$ROOT_DIR/scripts/injector.mjs" <<'NODE'
const fs = require("node:fs");
const vm = require("node:vm");

const injectorPath = process.argv[2];
const source = fs.readFileSync(injectorPath, "utf8");
const start = source.indexOf("async function commandRemove(");
const end = source.indexOf("\nasync function commandVerify(", start);
if (start < 0 || end < 0) {
  throw new Error("unable to isolate commandRemove from injector.mjs");
}
const commandRemoveSource = source.slice(start, end);

async function runScenario(targets, daemon = { requested: false, paused: true }) {
  const removedStateFiles = [];
  const printed = [];
  const context = {
    requestDaemonPause: async () => daemon.requested,
    waitForDaemonPause: async () => daemon.paused,
    appendLog: () => {},
    listTargets: async () => targets,
    isInjectableTarget: () => true,
    removeFromTarget: async (target) => {
      if (target.failure) {
        throw new Error(target.failure);
      }
      return target.result;
    },
    removeFileIfExists: (filePath) => removedStateFiles.push(filePath),
    console: { log: (value) => printed.push(String(value)) },
    process: { pid: 99999 }
  };
  const commandRemove = vm.runInNewContext(`${commandRemoveSource}\ncommandRemove`, context, { filename: injectorPath });
  let error = null;
  try {
    await commandRemove(9341, { session: "session.json", pause: "pause.json" });
  } catch (caught) {
    error = caught;
  }
  return { error, printed, removedStateFiles };
}

(async () => {
  const allPass = await runScenario([
    { id: "one", title: "one", url: "app://one", result: { ok: true, removed: true } },
    { id: "two", title: "two", url: "app://two", result: { ok: true, removed: true } }
  ]);
  if (allPass.error) {
    throw new Error(`all-pass restore must succeed: ${allPass.error.message}`);
  }
  if (allPass.removedStateFiles.join(",") !== "session.json,pause.json") {
    throw new Error(`all-pass restore must clear session and pause state: ${allPass.removedStateFiles.join(",")}`);
  }
  const allPassReport = JSON.parse(allPass.printed.at(-1) || "{}");
  if (allPassReport.ok !== true || allPassReport.targets?.length !== 2) {
    throw new Error("all-pass restore must report ok=true for every target");
  }

  const daemonPauseUnconfirmed = await runScenario([
    { id: "one", title: "one", url: "app://one", result: { ok: true, removed: true } },
    { id: "two", title: "two", url: "app://two", result: { ok: true, removed: true } }
  ], { requested: true, paused: false });
  if (!daemonPauseUnconfirmed.error) {
    throw new Error("direct restore must fail when a live daemon pause cannot be confirmed");
  }
  if (daemonPauseUnconfirmed.removedStateFiles.length !== 0) {
    throw new Error("unconfirmed daemon pause must preserve session and pause retry state");
  }

  const daemonPauseConfirmed = await runScenario([
    { id: "one", title: "one", url: "app://one", result: { ok: true, removed: true } },
    { id: "two", title: "two", url: "app://two", result: { ok: true, removed: true } }
  ], { requested: true, paused: true });
  if (daemonPauseConfirmed.error) {
    throw new Error(`confirmed daemon pause plus successful restore must succeed: ${daemonPauseConfirmed.error.message}`);
  }
  if (daemonPauseConfirmed.removedStateFiles.join(",") !== "session.json,pause.json") {
    throw new Error("confirmed daemon pause plus successful restore must clear session and pause state");
  }

  const mixed = await runScenario([
    { id: "one", title: "one", url: "app://one", result: { ok: true, removed: true } },
    { id: "two", title: "two", url: "app://two", result: { ok: false, removed: false, error: "residue" } }
  ]);
  if (!mixed.error || !/restore failed for 1 of 2 target\(s\)/.test(mixed.error.message)) {
    throw new Error("mixed restore must throw a nonzero aggregate failure");
  }
  if (mixed.removedStateFiles.length !== 0) {
    throw new Error("mixed restore must preserve session and pause retry state");
  }

  const allFail = await runScenario([
    { id: "one", title: "one", url: "app://one", failure: "cdp failure" },
    { id: "two", title: "two", url: "app://two", result: { ok: false, removed: false, error: "residue" } }
  ]);
  if (!allFail.error || !/restore failed for 2 of 2 target\(s\)/.test(allFail.error.message)) {
    throw new Error("failed restore must throw a nonzero aggregate failure");
  }
  if (allFail.removedStateFiles.length !== 0) {
    throw new Error("failed restore must preserve session and pause retry state");
  }
})().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
NODE

"$NODE_PATH" - "$ROOT_DIR/scripts/injector.mjs" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const injectorPath = process.argv[2];
const source = fs.readFileSync(injectorPath, "utf8");
const packIds = [
  "knife-shield-dog",
  "orbital-stargazer-black-cat",
  "orange-mecha-cat"
];
const payloadSchema = "renderer-safe-theme-packs-data-20260723";

function extractFunction(name) {
  const plainStart = source.indexOf(`function ${name}(`);
  const asyncStart = source.indexOf(`async function ${name}(`);
  const start = asyncStart >= 0 && (plainStart < 0 || asyncStart < plainStart) ? asyncStart : plainStart;
  if (start < 0) throw new Error(`unable to isolate ${name} from injector.mjs`);
  const signatureEnd = source.indexOf(") {", start);
  if (signatureEnd < 0) throw new Error(`unable to find ${name} body`);
  const bodyStart = signatureEnd + 2;
  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`unterminated function ${name}`);
}

function makePack(id) {
  return {
    id,
    payloadSchema,
    backgroundDataUrl: "data:image/png;base64,AA==",
    characterDataUrl: "data:image/png;base64,AA=="
  };
}

function makePayload(packCount = 3) {
  const themePackDataUrls = packIds.slice(0, packCount).map(makePack);
  return {
    revision: "revision-1",
    assetGroups: { themePacks: { themePackDataUrls } },
    assetGroupHashes: { themePacks: "theme-pack-hash" }
  };
}

const applyScenarios = new Map();
class ApplyCdpSession {
  constructor(url) {
    this.scenario = applyScenarios.get(url);
    if (!this.scenario) throw new Error(`missing apply scenario: ${url}`);
  }
  async open() {}
  async send(method, params = {}) {
    if (method === "Runtime.enable" || method === "Page.enable" || method === "Page.addScriptToEvaluateOnNewDocument") return {};
    if (method !== "Runtime.evaluate") throw new Error(`unexpected apply method: ${method}`);
    if (params.expression === "ASSET_EXPRESSION") {
      this.scenario.assetEvaluations += 1;
      return { result: { value: { ok: true } } };
    }
    if (params.expression === "CORE_EXPRESSION") {
      this.scenario.coreEvaluations += 1;
      return this.scenario.coreResponse;
    }
    throw new Error(`unexpected apply expression: ${params.expression}`);
  }
  close() {}
}

const applyContext = {
  Buffer,
  CdpSession: ApplyCdpSession,
  THEME_PACK_IDS: packIds,
  THEME_PACK_PAYLOAD_SCHEMA: payloadSchema,
  readTargetAssetGroupHashes: async (session) => session.scenario.cachedHashes,
  readTargetThemeState: async (session) => session.scenario.themeState,
  buildAssetGroupExpression: () => "ASSET_EXPRESSION",
  buildCoreExpression: () => "CORE_EXPRESSION"
};
const applyToTarget = vm.runInNewContext(
  `${extractFunction("expectedHotSwapPackCount")}\n${extractFunction("applyToTarget")}\napplyToTarget`,
  applyContext,
  { filename: injectorPath }
);

async function runApplyScenario(name, {
  coreResponse = { result: { value: { ok: true } } },
  cachedHashes = { __persistent: "v2", themePacks: "theme-pack-hash" },
  themeState = { active: false },
  packCount = 3
} = {}) {
  const scenario = { coreResponse, cachedHashes, themeState, coreEvaluations: 0, assetEvaluations: 0 };
  const url = `ws://${name}`;
  applyScenarios.set(url, scenario);
  let value = null;
  let error = null;
  try {
    value = await applyToTarget({ webSocketDebuggerUrl: url, url: `app://${name}` }, makePayload(packCount));
  } catch (caught) {
    error = caught;
  }
  return { value, error, scenario };
}

async function requireApplyFailure(label, coreResponse) {
  const result = await runApplyScenario(label.replace(/\s+/g, "-"), { coreResponse });
  if (!result.error) throw new Error(`${label} renderer result must fail closed`);
}

const readHashesContext = {
  TARGET_ASSET_CACHE: "__CODEX_INTERFACE_THEME_ASSET_GROUPS__",
  TARGET_ASSET_INDEX: "codex-interface-theme:asset-groups:v2:index",
  TARGET_ASSET_GROUP_PREFIX: "codex-interface-theme:asset-groups:v2:",
  THEME_PACK_IDS: packIds,
  THEME_PACK_PAYLOAD_SCHEMA: payloadSchema
};
const readTargetAssetGroupHashes = vm.runInNewContext(
  `${extractFunction("readTargetAssetGroupHashes")}\nreadTargetAssetGroupHashes`,
  readHashesContext,
  { filename: injectorPath }
);

async function corruptCacheHashes() {
  const indexKey = "codex-interface-theme:asset-groups:v2:index";
  const groupKey = "codex-interface-theme:asset-groups:v2:themePacks";
  const storage = new Map([
    [indexKey, JSON.stringify({ themePacks: "theme-pack-hash" })],
    [groupKey, JSON.stringify({
      hash: "theme-pack-hash",
      payload: { themePackDataUrls: packIds.slice(0, 2).map(makePack) }
    })]
  ]);
  const browser = {
    window: {
      __CODEX_INTERFACE_THEME_ASSET_GROUPS__: {
        themePacks: { hash: "theme-pack-hash" }
      }
    },
    localStorage: {
      getItem: (key) => storage.get(key) || null
    }
  };
  const session = {
    async send(method, params) {
      if (method !== "Runtime.evaluate") throw new Error(`unexpected cache method: ${method}`);
      return { result: { value: vm.runInNewContext(params.expression, browser) } };
    }
  };
  return readTargetAssetGroupHashes(session);
}

const applyOnceSource = extractFunction("applyOnce");
const mainSource = extractFunction("main");

async function runTopLevelScenario(name, targets) {
  const sessionWrites = [];
  const printed = [];
  const context = {
    DEFAULT_WAIT_MS: 20000,
    ENGINE_ROOT: "/test/engine",
    process: { env: {}, pid: 4242 },
    path,
    parseArgs: () => ({ once: true, port: 9341, "state-dir": "/tmp/test-state" }),
    requireOption: (options, key) => options[key],
    statePaths: () => ({
      stateDir: "/tmp/test-state",
      themesDir: "/tmp/test-state/themes",
      logsDir: "/tmp/test-state/logs",
      runDir: "/tmp/test-state/run",
      activeTheme: "/tmp/test-state/themes/active.json",
      session: "/tmp/test-state/run/session.json",
      pause: "/tmp/test-state/run/pause.json"
    }),
    mkdirp: () => {},
    inferPort: () => 9341,
    waitForCdp: async () => {},
    waitForInjectableTargets: async () => {},
    buildPayload: () => makePayload(),
    listTargets: async () => targets,
    isInjectableTarget: () => true,
    withTargetContext: (payload) => payload,
    applyToTarget: async (target) => {
      if (target.failure) throw new Error(target.failure);
      return target.result;
    },
    pruneNonAppThemeResidue: async () => [],
    writeJsonAtomic: (filePath, value) => sessionWrites.push({ filePath, value }),
    console: {
      log: (value) => printed.push(String(value)),
      error: () => {}
    }
  };
  const main = vm.runInNewContext(`${applyOnceSource}\n${mainSource}\nmain`, context, { filename: injectorPath });
  let error = null;
  try {
    await main();
  } catch (caught) {
    error = caught;
  }
  const topLevelOk = printed.some((entry) => {
    try { return JSON.parse(entry).ok === true; } catch (_) { return false; }
  });
  return { name, error, sessionWrites, printed, topLevelOk };
}

(async () => {
  await requireApplyFailure("literal false", { result: { value: false } });
  await requireApplyFailure("missing result", {});
  await requireApplyFailure("missing value", { result: {} });
  await requireApplyFailure("null value", { result: { value: null } });
  await requireApplyFailure("renderer ok false", { result: { value: { ok: false, error: "renderer rejected" } } });
  await requireApplyFailure("runtime exception", { exceptionDetails: { text: "renderer exception" } });

  const proven = await runApplyScenario("proven-success");
  if (proven.error || proven.value?.ok !== true) {
    throw new Error(`renderer value.ok=true must succeed: ${proven.error?.message || JSON.stringify(proven.value)}`);
  }

  const exactReady = await runApplyScenario("exact-three-ready", {
    themeState: {
      active: true,
      hasMarker: true,
      revision: "revision-1",
      hotSwapPacks: 3,
      hasHotSwapBay: true,
      hasHotSwapCycleButton: true
    }
  });
  if (exactReady.error || exactReady.value?.skippedCore !== true || exactReady.scenario.coreEvaluations !== 0) {
    throw new Error("exact-three cycle-button readiness must allow a core skip");
  }

  const legacySelectOnly = await runApplyScenario("legacy-select-only", {
    themeState: {
      active: true,
      hasMarker: true,
      revision: "revision-1",
      hotSwapPacks: 3,
      hasHotSwapBay: true,
      hasHotSwapCycleButton: false,
      hasHotSwapSelect: true
    }
  });
  if (legacySelectOnly.error || legacySelectOnly.value?.skippedCore === true || legacySelectOnly.scenario.coreEvaluations !== 1) {
    throw new Error("legacy pack-select must not satisfy skip-core readiness");
  }

  const renderedTwo = await runApplyScenario("rendered-two", {
    themeState: {
      active: true,
      hasMarker: true,
      revision: "revision-1",
      hotSwapPacks: 2,
      hasHotSwapBay: true,
      hasHotSwapCycleButton: true
    }
  });
  if (renderedTwo.error || renderedTwo.value?.skippedCore === true || renderedTwo.scenario.coreEvaluations !== 1) {
    throw new Error("renderer state with only two packs must not satisfy skip-core readiness");
  }

  const twoPackPayload = await runApplyScenario("payload-two", { packCount: 2 });
  if (!twoPackPayload.error) {
    throw new Error("injector payload with only two packs must fail closed");
  }

  const corruptedHashes = await corruptCacheHashes();
  if (corruptedHashes.themePacks !== "") {
    throw new Error(`two-pack persistent cache must invalidate the matching index hash: ${JSON.stringify(corruptedHashes)}`);
  }
  const corruptCacheApply = await runApplyScenario("corrupt-cache", {
    cachedHashes: corruptedHashes,
    themeState: { active: false }
  });
  if (corruptCacheApply.error || !corruptCacheApply.value?.assetGroupsTransferred?.includes("themePacks") ||
      corruptCacheApply.scenario.assetEvaluations !== 1) {
    throw new Error("corrupt two-pack cache must resend the canonical three-pack asset group");
  }

  const allSuccess = await runTopLevelScenario("all-success", [
    { id: "one", result: { ok: true } },
    { id: "two", result: { ok: true } }
  ]);
  if (allSuccess.error || !allSuccess.topLevelOk || allSuccess.sessionWrites.length !== 1) {
    throw new Error(`all targets with value.ok=true must report top-level success and write one session: ${JSON.stringify({
      error: allSuccess.error && allSuccess.error.message,
      topLevelOk: allSuccess.topLevelOk,
      sessionWrites: allSuccess.sessionWrites,
      printed: allSuccess.printed
    })}`);
  }

  for (const failed of [
    await runTopLevelScenario("mixed-values", [
      { id: "one", result: { ok: true } },
      { id: "two", result: { ok: false, error: "renderer rejected" } }
    ]),
    await runTopLevelScenario("mixed-exception", [
      { id: "one", result: { ok: true } },
      { id: "two", failure: "renderer exception" }
    ]),
    await runTopLevelScenario("all-failed", [
      { id: "one", result: { ok: false } },
      { id: "two", failure: "renderer exception" }
    ])
  ]) {
    if (!failed.error || failed.topLevelOk || failed.sessionWrites.length !== 0) {
      throw new Error(`${failed.name} must fail without top-level ok=true or a success session write`);
    }
  }

  const themeStateSource = extractFunction("readTargetThemeState");
  if (!themeStateSource.includes(".codex-interface-theme-pack-cycle-button") ||
      themeStateSource.includes(".codex-interface-theme-pack-select")) {
    throw new Error("skip-core readiness must use only the pack-cycle-button selector");
  }
})().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
NODE

"$NODE_PATH" - "$ROOT_DIR/scripts/injector.mjs" <<'NODE'
const fs = require("node:fs");
const vm = require("node:vm");

const injectorPath = process.argv[2];
const source = fs.readFileSync(injectorPath, "utf8");
const removeStart = source.indexOf("async function removeFromTarget(");
const removeEnd = source.indexOf("\n\nasync function readTargetResidueState(", removeStart);
if (removeStart < 0 || removeEnd < 0) {
  throw new Error("unable to isolate removeFromTarget from injector.mjs");
}
const removeFromTargetSource = source.slice(removeStart, removeEnd);
const browserContexts = new Map();

function createStyle(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    removeProperty(name) { values.delete(name); },
    getPropertyValue(name) { return values.get(name) || ""; },
    setProperty(name, value) { values.set(name, String(value)); },
    [Symbol.iterator]: function* iterateStyleNames() { yield* values.keys(); }
  };
}

function createNode({ id = "", classes = [], attributes = {}, style = {}, stickyClass = false } = {}) {
  const classNames = new Set(classes);
  const attrs = new Map(Object.entries(attributes));
  if (id) attrs.set("id", id);
  const node = {
    id,
    removed: false,
    stickyClass,
    style: createStyle(style),
    classList: {
      add(name) { classNames.add(name); },
      remove(name) { if (!node.stickyClass) classNames.delete(name); },
      contains(name) { return classNames.has(name); },
      [Symbol.iterator]: function* iterateClasses() { yield* classNames; }
    },
    get attributes() { return Array.from(attrs.keys()).map((name) => ({ name })); },
    getAttribute(name) { return attrs.has(name) ? attrs.get(name) : null; },
    setAttribute(name, value) {
      attrs.set(name, String(value));
      if (name === "id") node.id = String(value);
    },
    removeAttribute(name) {
      attrs.delete(name);
      if (name === "id") node.id = "";
    },
    hasAttribute(name) { return attrs.has(name); },
    remove() { node.removed = true; }
  };
  return node;
}

function createBrowser({ stickyResidue = false } = {}) {
  const root = createNode({
    attributes: {
      "data-codex-interface-theme": "active",
      "data-cit-transient-shells": "1",
      "data-cit-side-glyph-guard": "native-side-gutter"
    },
    style: { "--cit-accent": "#f60" }
  });
  const body = createNode({
    attributes: { "data-cit-inline-background": "true" },
    style: { "background-image": "url(data:image/png;base64,AA==)" }
  });
  const nativeIcon = createNode({
    attributes: {
      "data-cit-native-icon-hidden": "true",
      "data-cit-native-icon-style": "display:block"
    },
    style: { display: "none" }
  });
  const ownedStyle = createNode({ id: "codex-interface-theme-style" });
  const themedNative = createNode({ classes: ["codex-interface-theme-transient-shell"], stickyClass: stickyResidue });
  const glyph = createNode({ classes: ["cit-button-glyph"] });
  const nodes = [root, body, nativeIcon, ownedStyle, themedNative, glyph];

  function matches(node, selector) {
    if (node.removed) return false;
    if (selector === "*") return true;
    if (selector === "[data-cit-native-icon-hidden]") return node.hasAttribute("data-cit-native-icon-hidden");
    if (selector === '[id^="codex-interface-theme-"]') return node.id.startsWith("codex-interface-theme-");
    if (selector === '.cit-button-glyph') return node.classList.contains("cit-button-glyph");
    if (selector === '.codex-interface-theme-pack-bay') return node.classList.contains("codex-interface-theme-pack-bay");
    if (selector === '.codex-interface-theme-pack-switcher') return node.classList.contains("codex-interface-theme-pack-switcher");
    if (selector === '[class*="codex-interface-theme-"]') {
      return Array.from(node.classList).some((name) => name.includes("codex-interface-theme-"));
    }
    throw new Error(`unsupported test selector: ${selector}`);
  }

  const document = {
    documentElement: root,
    body,
    querySelectorAll(selector) {
      const selectors = selector.split(",").map((part) => part.trim());
      return nodes.filter((node) => selectors.some((part) => matches(node, part)));
    }
  };
  const cleanupCalls = [];
  const window = {
    __CODEX_INTERFACE_THEME_CHARACTER_RETREAT_CLEANUP__: () => cleanupCalls.push("character"),
    __CODEX_INTERFACE_THEME_PROJECT_PANEL_CHROME_CLEANUP__: () => cleanupCalls.push("project"),
    __CODEX_INTERFACE_THEME_SURFACE_REGISTRY__: { cleanup: () => cleanupCalls.push("registry") },
    __CODEX_INTERFACE_THEME_ROUTE_WATCH__: 91,
    __CODEX_INTERFACE_THEME_APPLY__: () => {},
    __CODEX_INTERFACE_THEME_MAINTENANCE_TICK__: () => {},
    clearInterval: (handle) => cleanupCalls.push(`interval:${handle}`)
  };
  return { context: { window, document }, root, body, nativeIcon, cleanupCalls };
}

class CdpSession {
  constructor(url) { this.browser = browserContexts.get(url); }
  async open() {}
  async send(method, params) {
    if (method === "Runtime.enable") return {};
    if (method !== "Runtime.evaluate") throw new Error(`unexpected CDP method: ${method}`);
    try {
      const value = vm.runInNewContext(params.expression, this.browser.context);
      return { result: { value } };
    } catch (error) {
      return { exceptionDetails: { text: error.message } };
    }
  }
  close() {}
}

const removeFromTarget = vm.runInNewContext(`${removeFromTargetSource}\nremoveFromTarget`, { CdpSession }, { filename: injectorPath });

(async () => {
  const cleanBrowser = createBrowser();
  browserContexts.set("ws://clean", cleanBrowser);
  const clean = await removeFromTarget({ webSocketDebuggerUrl: "ws://clean" });
  if (clean.ok !== true || clean.removed !== true || clean.fallback !== true) {
    throw new Error(`fallback must report success only after complete cleanup: ${JSON.stringify(clean)}`);
  }
  if (clean.residue.ids.length || clean.residue.classes || clean.residue.dataAttributes.length ||
      clean.residue.rootAttribute || clean.residue.rootVariables.length || clean.residue.globals.length ||
      clean.residue.bodyInlineBackground) {
    throw new Error(`successful fallback must prove zero residue: ${JSON.stringify(clean.residue)}`);
  }
  if (cleanBrowser.nativeIcon.getAttribute("style") !== "display:block" ||
      cleanBrowser.nativeIcon.hasAttribute("data-cit-native-icon-hidden") ||
      cleanBrowser.nativeIcon.hasAttribute("data-cit-native-icon-style")) {
    throw new Error("fallback must restore the native icon style and remove ownership markers");
  }
  for (const expected of ["character", "project", "registry", "interval:91"]) {
    if (!cleanBrowser.cleanupCalls.includes(expected)) {
      throw new Error(`fallback did not run cleanup boundary: ${expected}`);
    }
  }

  const residueBrowser = createBrowser({ stickyResidue: true });
  browserContexts.set("ws://residue", residueBrowser);
  const residue = await removeFromTarget({ webSocketDebuggerUrl: "ws://residue" });
  if (residue.ok !== false || residue.removed !== false || residue.fallback !== true) {
    throw new Error(`fallback must fail closed when cleanup residue remains: ${JSON.stringify(residue)}`);
  }
  if (!residue.residue || residue.residue.classes < 1) {
    throw new Error("fallback failure must report the remaining residue");
  }
})().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
NODE

"$NODE_PATH" - "$ROOT_DIR/assets/renderer-inject.js" <<'NODE'
const fs = require("node:fs");
const vm = require("node:vm");

const rendererPath = process.argv[2];
const source = fs.readFileSync(rendererPath, "utf8");

if (!source.includes("  const doc = document;")) {
  throw new Error("unable to instrument renderer bootstrap boundary");
}
const bootstrapProbeSource = source.replace(
  "  const doc = document;",
  '  throw new Error("__BOOTSTRAP_PROCEEDED__");'
);
const rendererPackIds = [
  "knife-shield-dog",
  "orbital-stargazer-black-cat",
  "orange-mecha-cat"
];

function rendererPayload(packCount = 3) {
  return {
    revision: "test-revision",
    themePackDataUrls: rendererPackIds.slice(0, packCount).map((id) => ({
      id,
      payloadSchema: "renderer-safe-theme-packs-data-20260723",
      backgroundDataUrl: "data:image/png;base64,AA==",
      characterDataUrl: "data:image/png;base64,AA=="
    }))
  };
}

function probeBootstrap(previousRemove, packCount = 3) {
  const clearedIntervals = [];
  const createdIntervals = [];
  const previousWatcher = { id: "old-route-watch" };
  const probeWindow = {
    __CODEX_INTERFACE_THEME_ROUTE_WATCH__: previousWatcher,
    clearInterval: (handle) => clearedIntervals.push(handle),
    setInterval: (callback, delay) => {
      createdIntervals.push({ callback, delay });
      return { id: "new-route-watch" };
    }
  };
  if (previousRemove !== undefined) {
    probeWindow.__CODEX_INTERFACE_THEME_REMOVE__ = previousRemove;
  }
  let result = null;
  let error = null;
  try {
    result = vm.runInNewContext(
      `${bootstrapProbeSource}(${JSON.stringify(rendererPayload(packCount))})`,
      { window: probeWindow },
      { filename: rendererPath }
    );
  } catch (caught) {
    error = caught;
  }
  return { result, error, probeWindow, previousWatcher, previousRemove, clearedIntervals, createdIntervals };
}

function assertBootstrapStopped(probe, label) {
  if (probe.error) {
    throw new Error(`${label} must return a fail-closed result before bootstrap: ${probe.error.message}`);
  }
  if (!probe.result || probe.result.ok !== false || probe.result.removed !== false) {
    throw new Error(`${label} must return ok=false and removed=false`);
  }
  if (probe.clearedIntervals.length !== 1 || probe.clearedIntervals[0] !== probe.previousWatcher) {
    throw new Error(`${label} must clear the pre-existing route watcher before aborting`);
  }
  if (Object.prototype.hasOwnProperty.call(probe.probeWindow, "__CODEX_INTERFACE_THEME_ROUTE_WATCH__")) {
    throw new Error(`${label} must delete the pre-existing route watcher global before aborting`);
  }
  if (probe.createdIntervals.length !== 0) {
    throw new Error(`${label} must not create a replacement route interval`);
  }
  if (Object.prototype.hasOwnProperty.call(probe.probeWindow, "__CODEX_INTERFACE_THEME_APPLY__")) {
    throw new Error(`${label} must not publish a new apply callback`);
  }
  if (probe.probeWindow.__CODEX_INTERFACE_THEME_REMOVE__ !== probe.previousRemove) {
    throw new Error(`${label} must not replace the previous remove callback`);
  }
}

assertBootstrapStopped(
  probeBootstrap(() => ({ ok: false, removed: false, errors: ["old cleanup incomplete"] })),
  "incomplete previous cleanup"
);
assertBootstrapStopped(
  probeBootstrap(() => { throw new Error("previous cleanup failed"); }),
  "throwing previous cleanup"
);

for (const [label, previousRemove] of [
  ["absent previous cleanup", undefined],
  ["successful previous cleanup", () => ({ ok: true, removed: true })]
]) {
  const probe = probeBootstrap(previousRemove);
  if (!probe.error || probe.error.message !== "__BOOTSTRAP_PROCEEDED__") {
    throw new Error(`${label} must be allowed to proceed into a new renderer bootstrap`);
  }
  if (probe.clearedIntervals.length !== 1 || probe.clearedIntervals[0] !== probe.previousWatcher) {
    throw new Error(`${label} must clear the pre-existing route watcher before proceeding`);
  }
}

const twoPackRenderer = probeBootstrap(undefined, 2);
if (twoPackRenderer.error || !twoPackRenderer.result ||
    twoPackRenderer.result.ok !== false || twoPackRenderer.result.removed !== false) {
  throw new Error("renderer must fail closed before bootstrap when only two public packs are provided");
}
if (twoPackRenderer.createdIntervals.length !== 0 ||
    Object.prototype.hasOwnProperty.call(twoPackRenderer.probeWindow, "__CODEX_INTERFACE_THEME_APPLY__")) {
  throw new Error("invalid two-pack renderer payload must not create runtime state");
}

const removeStart = source.indexOf("function removeTheme()");
const removeEnd = source.indexOf("\n\n  function reapplyTheme(", removeStart);
if (removeStart < 0 || removeEnd < 0) {
  throw new Error("unable to isolate removeTheme from renderer-inject.js");
}
const removeThemeSource = source.slice(removeStart, removeEnd);
const lifecycle = vm.runInNewContext(`(() => {
  const STYLE_ID = "style";
  const BACKGROUND_STYLE_ID = "background-style";
  const BACKDROP_ID = "backdrop";
  const RIGHT_HUD_ID = "right-hud";
  const CHARACTER_ID = "character";
  const MARKER_ID = "marker";
  const BADGE_ID = "badge";
  const ROOT_ATTR = "data-codex-interface-theme";
  const deferredTimeouts = new Set([11]);
  const deferredFrames = new Set([22]);
  let disposed = false;
  let removing = false;
  let routeWatchInterval = 33;
  let tableFlipCatTimer = 44;
  let failCleanup = true;
  const root = {
    dataset: {},
    style: { removeProperty() {} },
    removeAttribute() {}
  };
  const window = {
    clearTimeout() {},
    cancelAnimationFrame() {},
    clearInterval() {},
    __CODEX_INTERFACE_THEME_ROUTE_WATCH__: routeWatchInterval,
    __CODEX_INTERFACE_THEME_MAINTENANCE_TICK__: () => {}
  };
  function cleanupStep(errors, action) {
    try { action(); } catch (error) { errors.push(String(error && error.message || error)); }
  }
  function cancelDeferredWork() {
    deferredTimeouts.forEach(function(handle) { window.clearTimeout(handle); });
    deferredFrames.forEach(function(handle) { window.cancelAnimationFrame(handle); });
    deferredTimeouts.clear();
    deferredFrames.clear();
  }
  function cleanupRuntimeModules() {}
  function removeElementById() {}
  function clearBodyInlineBackground() {}
  function cleanupButtonGlyphs() {
    if (failCleanup) {
      failCleanup = false;
      throw new Error("injected cleanup failure");
    }
  }
  function cleanupProjectPanels() {}
  function clearComposerFrames() {}
  function removeThemeClass() {}
  function removeRootDataset() {}
  function removeRootVariables() {}
  function reapplyTheme() {}
  ${removeThemeSource}
  window.__CODEX_INTERFACE_THEME_REMOVE__ = removeTheme;
  window.__CODEX_INTERFACE_THEME_APPLY__ = reapplyTheme;
  return {
    removeTheme,
    window,
    state: () => ({ disposed, removing })
  };
})()`, {}, { filename: rendererPath });

const firstRemoval = lifecycle.removeTheme();
if (firstRemoval.ok !== false || firstRemoval.removed !== false || !firstRemoval.errors?.includes("injected cleanup failure")) {
  throw new Error("cleanup exception must return an explicit retryable failure");
}
if (lifecycle.state().disposed !== false) {
  throw new Error("cleanup exception must not mark renderer disposed");
}
if (lifecycle.window.__CODEX_INTERFACE_THEME_REMOVE__ !== lifecycle.removeTheme) {
  throw new Error("cleanup exception must preserve the current remove callback for retry");
}
const secondRemoval = lifecycle.removeTheme();
if (secondRemoval.ok !== true || secondRemoval.removed !== true) {
  throw new Error("second cleanup must complete after a retryable cleanup exception");
}
if (lifecycle.state().disposed !== true || lifecycle.state().removing !== false) {
  throw new Error("successful retry must finish the renderer lifecycle");
}
if (Object.prototype.hasOwnProperty.call(lifecycle.window, "__CODEX_INTERFACE_THEME_REMOVE__") ||
    Object.prototype.hasOwnProperty.call(lifecycle.window, "__CODEX_INTERFACE_THEME_APPLY__")) {
  throw new Error("successful retry must clear renderer global callbacks");
}
NODE

"$PYTHON_PATH" - "$ROOT_DIR" <<'PY'
import json
import pathlib
import re
import sys

root = pathlib.Path(sys.argv[1])
injector = (root / "scripts/injector.mjs").read_text(encoding="utf-8")
renderer = (root / "assets/renderer-inject.js").read_text(encoding="utf-8")
manifest = json.loads((root / "assets/runtime-modules.json").read_text(encoding="utf-8"))

if injector.count("surfaceRegistrySource") < 3:
    raise SystemExit("surfaceRegistrySource must participate in read, revision, and core packaging")
payload_start = injector.find("function buildPayload")
payload_end = injector.find("function hasExternalWebviewTarget", payload_start)
payload_block = injector[payload_start:payload_end]
for token in [
    'fs.readFileSync(path.join(ASSETS_DIR, "surface-registry.js"), "utf8")',
    "const revision = sha256Text(JSON.stringify({",
    "surfaceRegistrySource,",
    "core: { css, theme, revision, surfaceRegistrySource }",
]:
    if token not in payload_block:
        raise SystemExit(f"buildPayload must bind surfaceRegistrySource into revision and core: {token}")

required_renderer_tokens = [
    "let disposed = false",
    "const deferredTimeouts = new Set()",
    "const deferredFrames = new Set()",
    "function scheduleDeferredTimeout",
    "function cancelDeferredTimeout",
    "function scheduleDeferredFrame",
    "function cancelDeferredWork",
    "function reapplyTheme",
    "disposed = true",
    "cancelDeferredWork()",
    "window.__CODEX_INTERFACE_THEME_REMOVE__ === removeTheme",
    "window.__CODEX_INTERFACE_THEME_APPLY__ === reapplyTheme",
]
for token in required_renderer_tokens:
    if token not in renderer:
        raise SystemExit(f"renderer lifecycle contract missing: {token}")
if renderer.count("window.setTimeout(") != 1:
    raise SystemExit("all renderer deferred timeouts must route through scheduleDeferredTimeout")
if renderer.count("window.requestAnimationFrame(") != 1:
    raise SystemExit("all renderer deferred frames must route through scheduleDeferredFrame")
if re.search(r"(?<![\w.])setTimeout\(", renderer):
    raise SystemExit("renderer must not create untracked global timeouts")
if re.search(r"(?<![\w.])requestAnimationFrame\(", renderer):
    raise SystemExit("renderer must not create untracked global animation frames")

for module_id in ["surfaceRegistry"]:
    pattern = re.compile(r'\{\s*id:\s*"' + re.escape(module_id) + r'"(?P<body>.*?)(?=\n\s*\},?\n\s*\{\s*id:|\n\s*\}\s*\];)', re.S)
    match = pattern.search(renderer)
    if not match:
        raise SystemExit(f"renderer runtime module missing: {module_id}")
    if "cleanup:" not in match.group("body"):
        raise SystemExit(f"renderer runtime module must clean its residue: {module_id}")

remove_start = renderer.find("function removeTheme()")
remove_end = renderer.find("function reapplyTheme(", remove_start)
if remove_start < 0 or remove_end < 0:
    raise SystemExit("renderer must expose a bounded removeTheme lifecycle")
remove_block = renderer[remove_start:remove_end]
for token in [
    "cleanupStep(cleanupErrors, cancelDeferredWork)",
    "cleanupRuntimeModules(cleanupErrors)",
    "cleanupButtonGlyphs, cleanupProjectPanels, clearComposerFrames",
    '"composer-surface"',
    '"composer-native-fade"',
    '"composer-dock"',
    '"composer-native-floor"',
    '"chat-bubble"',
    '"chat-card"',
    "window.__CODEX_INTERFACE_THEME_REMOVE__ === removeTheme",
    "window.__CODEX_INTERFACE_THEME_APPLY__ === reapplyTheme",
]:
    if token not in remove_block:
        raise SystemExit(f"removeTheme must clean deferred/global/marker residue: {token}")

written_datasets = set(re.findall(r"root\.dataset\.(cit[A-Za-z0-9_]+)\s*=", renderer))
written_datasets.update(
    "cit" + "".join(part[:1].upper() + part[1:] for part in name.split("-")[2:])
    for name in re.findall(r'root\.setAttribute\("(data-cit-[^"]+)"', renderer)
)
cleaned_datasets = set(re.findall(r"delete\s+root\.dataset\.(cit[A-Za-z0-9_]+)", renderer))
for call in re.findall(r"removeRootDataset\(\[(.*?)\]\)", renderer, re.S):
    cleaned_datasets.update(re.findall(r'"(cit[A-Za-z0-9_]+)"', call))
dataset_cleanup_start = renderer.find("function removeRootDataset()")
dataset_cleanup_end = renderer.find("\n\n  function ", dataset_cleanup_start + 1)
dataset_cleanup_block = renderer[dataset_cleanup_start:dataset_cleanup_end]
if (
    dataset_cleanup_start >= 0
    and "Object.keys(root.dataset)" in dataset_cleanup_block
    and 'name.indexOf("cit") === 0' in dataset_cleanup_block
    and "cleanupStep(cleanupErrors, removeRootDataset)" in remove_block
):
    cleaned_datasets.update(written_datasets)
missing_datasets = sorted(written_datasets - cleaned_datasets)
if missing_datasets:
    raise SystemExit(f"renderer root dataset cleanup is not symmetric: {missing_datasets}")
for required_dataset in ["citTransientShells", "citSideGlyphGuard", "citHotSwapBay"]:
    if required_dataset not in written_datasets or required_dataset not in cleaned_datasets:
        raise SystemExit(f"renderer lifecycle must write and clean {required_dataset}")

written_theme_classes = set()
for args in re.findall(r"classList\.add\(([^)]*)\)", renderer):
    written_theme_classes.update(
        class_name
        for class_name in re.findall(r'"([^"]+)"', args)
        if class_name.startswith("codex-interface-theme-") and not class_name.endswith("-")
    )
cleaned_theme_classes = set()
for args in re.findall(r"classList\.remove\(([^)]*)\)", renderer):
    cleaned_theme_classes.update(
        class_name
        for class_name in re.findall(r'"([^"]+)"', args)
        if class_name.startswith("codex-interface-theme-")
    )
cleaned_theme_classes.update(
    "codex-interface-theme-" + token
    for token in re.findall(r'"([a-z][A-Za-z0-9-]+)"', remove_block)
)
for tokens in re.findall(r"\[(.*?)\]\.forEach\(removeThemeClass\)", renderer, re.S):
    cleaned_theme_classes.update(
        "codex-interface-theme-" + token
        for token in re.findall(r'"([a-z][A-Za-z0-9-]+)"', tokens)
    )
missing_theme_classes = sorted(written_theme_classes - cleaned_theme_classes)
if missing_theme_classes:
    raise SystemExit(f"renderer theme class cleanup is not symmetric: {missing_theme_classes}")

surface_module = next((item for item in manifest.get("modules", []) if item.get("id") == "surfaceRegistry"), None)
if not surface_module:
    raise SystemExit("runtime manifest must declare surfaceRegistry")
if surface_module.get("kind") != "dom-boundary-registry":
    raise SystemExit("surfaceRegistry manifest kind must be dom-boundary-registry")
if surface_module.get("boundaryProfile") != "nativeBoundary":
    raise SystemExit("surfaceRegistry manifest must use nativeBoundary")
if surface_module.get("payloadKeys") != ["surfaceRegistrySource"]:
    raise SystemExit("surfaceRegistry manifest must declare only surfaceRegistrySource payload")
event_policy = str(surface_module.get("eventPolicy", ""))
if "MutationObserver" in event_policy and "no MutationObserver" not in event_policy:
    raise SystemExit("surfaceRegistry manifest must forbid a full-page MutationObserver")
if "fixed geometry" in event_policy and "no fixed geometry" not in event_policy:
    raise SystemExit("surfaceRegistry manifest must forbid fixed geometry identity")
PY

"$NODE_PATH" - "$PROJECT_ROOT" "$ROOT_DIR/scripts/injector.mjs" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");
const { fileURLToPath, pathToFileURL } = require("node:url");
const vm = require("node:vm");

const projectRoot = process.argv[2];
const injectorPath = process.argv[3];
const source = fs.readFileSync(injectorPath, "utf8");
const expectedPackIds = [
  "knife-shield-dog",
  "orbital-stargazer-black-cat",
  "orange-mecha-cat"
];
const packSetPath = path.join(projectRoot, "theme-packs", "public-pack-set.json");
const packSet = JSON.parse(fs.readFileSync(packSetPath, "utf8"));
if (packSet.schemaVersion !== 1 || packSet.contract !== "public-hot-swap-pack-set" || packSet.exactCount !== 3) {
  throw new Error("canonical public pack set schema/contract/exactCount is invalid");
}
if (JSON.stringify(packSet.orderedPackIds) !== JSON.stringify(expectedPackIds)) {
  throw new Error(`canonical public pack order is invalid: ${JSON.stringify(packSet.orderedPackIds)}`);
}

function extractFunction(name) {
  const start = source.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`missing injector function: ${name}`);
  const signatureEnd = source.indexOf(") {", start);
  if (signatureEnd < 0) throw new Error(`missing injector function body: ${name}`);
  const bodyStart = signatureEnd + 2;
  let depth = 0;
  let quote = "";
  let escaped = false;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) quote = "";
      continue;
    }
    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`unterminated injector function: ${name}`);
}

const discoverySource = [
  "inferMimeFromPath",
  "resolveThemePackAsset",
  "readThemePackAssetDataUrl",
  "readThemePackDataUrls"
].map(extractFunction).join("\n");
const context = {
  fs,
  path,
  fileURLToPath,
  pathToFileURL,
  THEME_PACKS_DIR: path.join(projectRoot, "theme-packs"),
  THEME_PACK_ID_RE: /^[a-z0-9][a-z0-9-]{1,80}$/,
  THEME_PACK_HOT_SWAP_LIMIT: 3,
  THEME_PACK_PAYLOAD_SCHEMA: "renderer-safe-theme-packs-data-20260723",
  readJson: (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8"))
};
const readThemePackDataUrls = vm.runInNewContext(
  `${discoverySource}\nreadThemePackDataUrls`,
  context,
  { filename: injectorPath }
);
const discovered = readThemePackDataUrls({}, {});
const discoveredIds = discovered.map((pack) => pack.id);
if (JSON.stringify(discoveredIds) !== JSON.stringify(expectedPackIds)) {
  throw new Error(`public runtime must discover exactly the three approved packs: ${JSON.stringify(discoveredIds)}`);
}

for (const packId of expectedPackIds) {
  const packDir = path.join(projectRoot, "theme-packs", packId);
  const manifestPath = path.join(packDir, "pack.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (manifest.schemaVersion !== 1 || manifest.id !== packId || manifest.status !== "asset-ready-unmounted") {
    throw new Error(`${packId} manifest identity/status is invalid`);
  }
  const interaction = manifest.interaction || {};
  if (interaction.activation !== "manual-click-only" || interaction.preload !== false || interaction.idlePlaybackDom !== false) {
    throw new Error(`${packId} interaction contract must remain manual and idle-free`);
  }
  const assetEntries = Object.entries({ ...(manifest.assets || {}), ...(manifest.iconMap || {}) });
  if (assetEntries.length === 0) throw new Error(`${packId} manifest has no assets`);
  for (const [role, relativePath] of assetEntries) {
    const value = String(relativePath || "");
    if (!value || path.isAbsolute(value) || value.includes("\0") || value.split(/[\\/]+/).includes("..")) {
      throw new Error(`${packId} ${role} path is unsafe: ${value}`);
    }
    const absolutePath = path.resolve(packDir, value);
    if (!absolutePath.startsWith(`${path.resolve(packDir)}${path.sep}`)) {
      throw new Error(`${packId} ${role} escapes the pack root`);
    }
    const stat = fs.statSync(absolutePath);
    if (!stat.isFile() || stat.size <= 0) {
      throw new Error(`${packId} ${role} asset is missing or empty: ${absolutePath}`);
    }
  }
}

const publicManifest = JSON.parse(fs.readFileSync(path.join(projectRoot, "submission", "public-package-manifest.json"), "utf8"));
const publicSources = Array.isArray(publicManifest.sourceInclude) ? publicManifest.sourceInclude : [];
const expectedPublicPackPaths = [
  "theme-packs/public-pack-set.json",
  ...expectedPackIds.flatMap((packId) => [
    `theme-packs/${packId}/pack.json`,
    `theme-packs/${packId}/runtime`
  ])
];
for (const requiredPath of expectedPublicPackPaths) {
  if (!publicSources.includes(requiredPath)) {
    throw new Error(`public package manifest is missing canonical pack path: ${requiredPath}`);
  }
}
const declaredPublicPackPaths = publicSources.filter((relativePath) =>
  expectedPackIds.some((packId) => relativePath.startsWith(`theme-packs/${packId}/`))
);
if (JSON.stringify(declaredPublicPackPaths.sort()) !== JSON.stringify(expectedPublicPackPaths.slice(1).sort())) {
  throw new Error(`public package manifest must contain only pack.json and runtime for each public pack: ${JSON.stringify(declaredPublicPackPaths)}`);
}
const forbiddenPublicPackPaths = publicSources.filter((relativePath) =>
  relativePath.startsWith("theme-packs/") && /\/(sources|preview|previews)(?:\/|$)/.test(relativePath)
);
if (forbiddenPublicPackPaths.length) {
  throw new Error(`public package manifest must exclude pack sources/previews: ${JSON.stringify(forbiddenPublicPackPaths)}`);
}
NODE

"$NODE_PATH" "$ROOT_DIR/scripts/theme-store.mjs" init \
  --state-dir "/tmp/codex-interface-theme-test-state" \
  --assets-dir "$ROOT_DIR/assets" >/dev/null

"$NODE_PATH" "$ROOT_DIR/scripts/theme-store.mjs" show \
  --state-dir "/tmp/codex-interface-theme-test-state" \
  --assets-dir "$ROOT_DIR/assets" >/dev/null

"$NODE_PATH" "$ROOT_DIR/scripts/theme-store.mjs" set-image \
  --state-dir "/tmp/codex-interface-theme-test-state" \
  --assets-dir "$ROOT_DIR/assets" \
  --image "$ROOT_DIR/assets/backgrounds/cyberpunk-contrast-city-runtime.webp" >"/tmp/codex-interface-theme-webp-test.json"

grep -q '\.webp"' "/tmp/codex-interface-theme-webp-test.json" || cit_die "theme-store must preserve WebP runtime backgrounds"

"$NODE_PATH" "$ROOT_DIR/scripts/theme-store.mjs" set-image \
  --state-dir "/tmp/codex-interface-theme-test-state" \
  --assets-dir "$ROOT_DIR/assets" \
  --icon-buttons-enabled true \
  --icon-buttons-apply-mode module \
  --icon-buttons-sidebar-navigation-enabled true \
  --icon-buttons-titlebar-navigation-enabled false \
  --icon-buttons-composer-controls-enabled false \
  --icon-buttons-top-utility-actions-enabled false \
  --icon-buttons-message-actions-enabled false \
  --icon-buttons-project-panel-rows-enabled false >"/tmp/codex-interface-theme-button-module-test.json"

"$NODE_PATH" "$ROOT_DIR/scripts/theme-store.mjs" set-image \
  --state-dir "/tmp/codex-interface-theme-test-state" \
  --assets-dir "$ROOT_DIR/assets" \
  --icon-buttons-enabled true \
  --icon-buttons-apply-mode module \
  --icon-buttons-sidebar-navigation-enabled true \
  --icon-buttons-titlebar-navigation-enabled true \
  --icon-buttons-composer-controls-enabled false \
  --icon-buttons-top-utility-actions-enabled false \
  --icon-buttons-message-actions-enabled false \
  --icon-buttons-project-panel-rows-enabled false >"/tmp/codex-interface-theme-titlebar-module-test.json"

"$NODE_PATH" "$ROOT_DIR/scripts/theme-store.mjs" set-image \
  --state-dir "/tmp/codex-interface-theme-test-state" \
  --assets-dir "$ROOT_DIR/assets" \
  --icon-buttons-enabled true \
  --icon-buttons-apply-mode module \
  --icon-buttons-sidebar-navigation-enabled true \
  --icon-buttons-titlebar-navigation-enabled true \
  --icon-buttons-composer-controls-enabled true \
  --icon-buttons-top-utility-actions-enabled false \
  --icon-buttons-message-actions-enabled false \
  --icon-buttons-project-panel-rows-enabled false >"/tmp/codex-interface-theme-composer-module-test.json"

"$NODE_PATH" "$ROOT_DIR/scripts/theme-store.mjs" set-image \
  --state-dir "/tmp/codex-interface-theme-test-state" \
  --assets-dir "$ROOT_DIR/assets" \
  --icon-buttons-enabled true \
  --icon-buttons-apply-mode module \
  --icon-buttons-sidebar-navigation-enabled true \
  --icon-buttons-titlebar-navigation-enabled true \
  --icon-buttons-composer-controls-enabled true \
  --icon-buttons-top-utility-actions-enabled true \
  --icon-buttons-message-actions-enabled false \
  --icon-buttons-project-panel-rows-enabled false >"/tmp/codex-interface-theme-top-utility-module-test.json"

"$NODE_PATH" "$ROOT_DIR/scripts/theme-store.mjs" set-image \
  --state-dir "/tmp/codex-interface-theme-test-state" \
  --assets-dir "$ROOT_DIR/assets" \
  --icon-buttons-enabled true \
  --icon-buttons-apply-mode module \
  --icon-buttons-sidebar-navigation-enabled true \
  --icon-buttons-titlebar-navigation-enabled true \
  --icon-buttons-composer-controls-enabled true \
  --icon-buttons-top-utility-actions-enabled true \
  --icon-buttons-message-actions-enabled true \
  --icon-buttons-project-panel-rows-enabled false >"/tmp/codex-interface-theme-message-module-test.json"

"$NODE_PATH" "$ROOT_DIR/scripts/theme-store.mjs" set-image \
  --state-dir "/tmp/codex-interface-theme-test-state" \
  --assets-dir "$ROOT_DIR/assets" \
  --icon-buttons-enabled true \
  --icon-buttons-apply-mode module \
  --icon-buttons-sidebar-navigation-enabled true \
  --icon-buttons-titlebar-navigation-enabled true \
  --icon-buttons-composer-controls-enabled true \
  --icon-buttons-top-utility-actions-enabled true \
  --icon-buttons-message-actions-enabled true \
  --icon-buttons-project-panel-rows-enabled true \
  --safe-area sides \
  --task-mode ambient >"/tmp/codex-interface-theme-project-panel-rows-module-test.json"

"$NODE_PATH" "$ROOT_DIR/scripts/module-matrix.mjs" \
  --state-dir "/tmp/codex-interface-theme-test-state" \
  --assets-dir "$ROOT_DIR/assets" \
  --format json >"/tmp/codex-interface-theme-module-matrix-test.json"

HOTSWAP_FIXTURE_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/dream-skin-hotswap-fixtures.XXXXXX")"
cleanup_hotswap_fixtures() {
  if [[ -n "${HOTSWAP_FIXTURE_ROOT:-}" && -d "$HOTSWAP_FIXTURE_ROOT" ]]; then
    rm -rf -- "$HOTSWAP_FIXTURE_ROOT"
  fi
}
trap cleanup_hotswap_fixtures EXIT

create_hotswap_matrix_fixture() {
  local fixture_root="$1"
  local mode="$2"
  local pack_id
  mkdir -p "$fixture_root/macos" "$fixture_root/theme-packs"
  ln -s "$ROOT_DIR/assets" "$fixture_root/macos/assets"
  if [[ "$mode" != "missing-pack-set" ]]; then
    cp "$PROJECT_ROOT/theme-packs/public-pack-set.json" "$fixture_root/theme-packs/public-pack-set.json"
  fi
  for pack_id in knife-shield-dog orbital-stargazer-black-cat orange-mecha-cat; do
    mkdir -p "$fixture_root/theme-packs/$pack_id"
    if [[ "$mode" != "missing-manifest" || "$pack_id" != "orbital-stargazer-black-cat" ]]; then
      cp "$PROJECT_ROOT/theme-packs/$pack_id/pack.json" "$fixture_root/theme-packs/$pack_id/pack.json"
    fi
    if [[ "$mode" = "missing-ref" && "$pack_id" = "knife-shield-dog" ]]; then
      cp -R "$PROJECT_ROOT/theme-packs/$pack_id/runtime" "$fixture_root/theme-packs/$pack_id/runtime"
      rm "$fixture_root/theme-packs/$pack_id/runtime/icons/search.svg"
    else
      ln -s "$PROJECT_ROOT/theme-packs/$pack_id/runtime" "$fixture_root/theme-packs/$pack_id/runtime"
    fi
  done
  if [[ "$mode" = "extra-manifest" ]]; then
    mkdir -p "$fixture_root/theme-packs/fourth-public-pack"
    cp "$PROJECT_ROOT/theme-packs/knife-shield-dog/pack.json" "$fixture_root/theme-packs/fourth-public-pack/pack.json"
  fi
}

assert_hotswap_matrix_fixture_fails() {
  local label="$1"
  local fixture_root="$2"
  local expected_error="$3"
  local report_path="$fixture_root/report.json"
  if "$NODE_PATH" "$ROOT_DIR/scripts/module-matrix.mjs" \
    --state-dir "/tmp/codex-interface-theme-test-state" \
    --assets-dir "$fixture_root/macos/assets" \
    --format json >"$report_path"; then
    cit_die "module matrix must fail closed for $label"
  fi
  grep -Fq "$expected_error" "$report_path" || cit_die "module matrix $label failure must report: $expected_error"
}

for fixture_mode in missing-pack-set missing-manifest missing-ref extra-manifest; do
  create_hotswap_matrix_fixture "$HOTSWAP_FIXTURE_ROOT/$fixture_mode" "$fixture_mode"
done
assert_hotswap_matrix_fixture_fails \
  "missing public pack set" \
  "$HOTSWAP_FIXTURE_ROOT/missing-pack-set" \
  "themePacks:public pack set missing"
assert_hotswap_matrix_fixture_fails \
  "missing canonical manifest" \
  "$HOTSWAP_FIXTURE_ROOT/missing-manifest" \
  "themePacks:orbital-stargazer-black-cat manifest is missing"
assert_hotswap_matrix_fixture_fails \
  "missing runtime reference" \
  "$HOTSWAP_FIXTURE_ROOT/missing-ref" \
  "themePacks:knife-shield-dog:iconMap.search missing file"
assert_hotswap_matrix_fixture_fails \
  "extra fourth manifest" \
  "$HOTSWAP_FIXTURE_ROOT/extra-manifest" \
  "themePacks:manifest ids must match the canonical set"

cleanup_hotswap_fixtures
trap - EXIT

"$PYTHON_PATH" - "$ROOT_DIR" <<'PY'
import json
import pathlib
import re
import sys
import xml.etree.ElementTree as ET

root = pathlib.Path(sys.argv[1])
manifest_path = root / "assets" / "icons" / "icon-manifest.json"
manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
button_set = manifest["buttonGlyphs"]["set"]
expected = {
    "search", "newTask", "back", "forward", "stop", "settings", "project", "send",
    "tagTask", "files", "thread", "clean", "run", "package", "spark"
}
missing = sorted(expected - set(button_set))
if missing:
    raise SystemExit(f"missing button glyphs in manifest: {missing}")
for rel_path in button_set.values():
    svg_path = root / "assets" / rel_path
    if not svg_path.is_file():
        raise SystemExit(f"missing svg icon: {svg_path}")
for svg_path in sorted((root / "assets" / "icons" / "buttons").glob("*.svg")):
    parsed = ET.parse(svg_path)
    root_tag = parsed.getroot().tag
    if not root_tag.endswith("svg"):
        raise SystemExit(f"not an SVG document: {svg_path}")

theme = json.loads((root / "assets" / "theme.json").read_text(encoding="utf-8"))
theme_buttons = theme["icons"]["buttons"]["paths"]
missing_theme = sorted(expected - set(theme_buttons))
if missing_theme:
    raise SystemExit(f"missing button glyphs in theme.json: {missing_theme}")
if theme["icons"]["badge"]["enabled"] is not False or theme["icons"]["badge"]["placement"] != "off":
    raise SystemExit("theme.json must keep the sample cat badge disabled")
if theme["icons"]["character"]["enabled"] is not False or theme["icons"]["character"]["placement"] != "off":
    raise SystemExit("theme.json must keep the sample cat character disabled")
table_flip_cat = theme["icons"]["tableFlipCat"]
if table_flip_cat["path"] != "icons/table-flip-cat-left.gif":
    raise SystemExit("theme.json tableFlipCat path must keep the GIF fallback")
if table_flip_cat["spritePath"] != "icons/table-flip-cat-left-sprite.webp":
    raise SystemExit("theme.json tableFlipCat spritePath must use the lightweight WebP sprite")
if table_flip_cat["posterPath"] != "icons/table-flip-cat-left-poster.png":
    raise SystemExit("theme.json tableFlipCat posterPath must use the still poster image")
if table_flip_cat["triggerIconPath"] != "icons/table-flip-trigger-angry.svg":
    raise SystemExit("theme.json tableFlipCat triggerIconPath must use the angry trigger icon")
if table_flip_cat["enabled"] is not False:
    raise SystemExit("theme.json tableFlipCat must be disabled unless explicitly selected")
if table_flip_cat["placement"] != "off":
    raise SystemExit("theme.json tableFlipCat placement must stay off in the default theme")
if table_flip_cat["frameCount"] != 8:
    raise SystemExit("theme.json tableFlipCat frameCount must match the sprite frame count")
if table_flip_cat["durationMs"] != 1430:
    raise SystemExit("theme.json tableFlipCat durationMs must match the source animation duration")
if not (root / "assets" / table_flip_cat["path"]).is_file():
    raise SystemExit("table flip cat GIF asset is missing")
if not (root / "assets" / table_flip_cat["spritePath"]).is_file():
    raise SystemExit("table flip cat sprite asset is missing")
if not (root / "assets" / "icons" / "table-flip-cat-left-poster.png").is_file():
    raise SystemExit("table flip cat poster asset is missing")
if not (root / "assets" / "icons" / "table-flip-trigger-angry.svg").is_file():
    raise SystemExit("table flip cat trigger icon asset is missing")
if theme["icons"]["buttons"]["enabled"] is not False:
    raise SystemExit("theme.json must keep button runtime replacement disabled")
if theme["icons"]["buttons"]["applyMode"] != "opt-in":
    raise SystemExit("theme.json button applyMode must remain opt-in")
if theme["icons"]["buttons"]["modules"]["sidebarNavigation"]["enabled"] is not False:
    raise SystemExit("theme.json sidebarNavigation button module must remain disabled by default")
if theme["icons"]["buttons"]["modules"]["titlebarNavigation"]["enabled"] is not False:
    raise SystemExit("theme.json titlebarNavigation button module must remain disabled by default")
if theme["icons"]["buttons"]["modules"]["composerControls"]["enabled"] is not False:
    raise SystemExit("theme.json composerControls button module must remain disabled by default")
if theme["icons"]["buttons"]["modules"]["topUtilityActions"]["enabled"] is not False:
    raise SystemExit("theme.json topUtilityActions button module must remain disabled by default")
if theme["icons"]["buttons"]["modules"]["messageActions"]["enabled"] is not False:
    raise SystemExit("theme.json messageActions button module must remain disabled by default")
if theme["icons"]["buttons"]["modules"]["projectPanelRows"]["enabled"] is not False:
    raise SystemExit("theme.json projectPanelRows button module must remain disabled by default")

action_map_path = root / "assets" / "icons" / "button-action-map.json"
action_map = json.loads(action_map_path.read_text(encoding="utf-8"))
if action_map["runtimeEnabled"] is not False:
    raise SystemExit("button action map must keep runtimeEnabled=false")
if action_map["currentPreviewModule"] != "sidebarNavigation":
    raise SystemExit("current preview module should be sidebarNavigation")
sidebar = action_map["modules"]["sidebarNavigation"]
if sidebar["status"] != "runtime-wired-off-by-default":
    raise SystemExit("sidebarNavigation should be runtime-wired-off-by-default")
for module_name in ["titlebarNavigation", "composerControls", "topUtilityActions", "messageActions", "projectPanelRows", "projectPanels"]:
    expected_status = "runtime-wired-off-by-default" if module_name == "titlebarNavigation" else "not-started"
    if module_name == "composerControls":
        expected_status = "runtime-wired-off-by-default"
    if module_name == "topUtilityActions":
        expected_status = "runtime-wired-off-by-default"
    if module_name == "messageActions":
        expected_status = "runtime-wired-off-by-default"
    if module_name == "projectPanelRows":
        expected_status = "runtime-wired-off-by-default"
    if module_name == "projectPanels":
        expected_status = "chrome-wired-no-icon-replacement"
    if action_map["modules"][module_name]["status"] != expected_status:
        raise SystemExit(f"{module_name} should be {expected_status}")
for action_name, action in sidebar["actions"].items():
    glyph = action["glyph"]
    if glyph not in button_set:
        raise SystemExit(f"action {action_name} uses unknown glyph {glyph}")
    asset_path = root / "assets" / action["asset"]
    if not asset_path.is_file():
        raise SystemExit(f"action {action_name} references missing asset {asset_path}")
titlebar = action_map["modules"]["titlebarNavigation"]
for action_name, action in titlebar["actions"].items():
    glyph = action["glyph"]
    if glyph not in button_set:
        raise SystemExit(f"titlebar action {action_name} uses unknown glyph {glyph}")
    asset_path = root / "assets" / action["asset"]
    if not asset_path.is_file():
        raise SystemExit(f"titlebar action {action_name} references missing asset {asset_path}")
composer = action_map["modules"]["composerControls"]
for action_name, action in composer["actions"].items():
    glyph = action["glyph"]
    if glyph not in button_set:
        raise SystemExit(f"composer action {action_name} uses unknown glyph {glyph}")
    asset_path = root / "assets" / action["asset"]
    if not asset_path.is_file():
        raise SystemExit(f"composer action {action_name} references missing asset {asset_path}")
top_utility = action_map["modules"]["topUtilityActions"]
for action_name, action in top_utility["actions"].items():
    glyph = action["glyph"]
    if glyph not in button_set:
        raise SystemExit(f"top utility action {action_name} uses unknown glyph {glyph}")
    asset_path = root / "assets" / action["asset"]
    if not asset_path.is_file():
        raise SystemExit(f"top utility action {action_name} references missing asset {asset_path}")
message_actions = action_map["modules"]["messageActions"]
for action_name, action in message_actions["actions"].items():
    glyph = action["glyph"]
    if glyph not in button_set:
        raise SystemExit(f"message action {action_name} uses unknown glyph {glyph}")
    asset_path = root / "assets" / action["asset"]
    if not asset_path.is_file():
        raise SystemExit(f"message action {action_name} references missing asset {asset_path}")
project_panel_rows = action_map["modules"]["projectPanelRows"]
for action_name, action in project_panel_rows["actions"].items():
    glyph = action["glyph"]
    if glyph not in button_set:
        raise SystemExit(f"project panel row action {action_name} uses unknown glyph {glyph}")
    asset_path = root / "assets" / action["asset"]
    if not asset_path.is_file():
        raise SystemExit(f"project panel row action {action_name} references missing asset {asset_path}")

preview_paths = sorted((root / "previews").glob("*.html"))
if not preview_paths:
    raise SystemExit("missing preview HTML files")
for preview_path in preview_paths:
    preview = preview_path.read_text(encoding="utf-8")
    refs = re.findall(r'src="([^"]+)"', preview)
    refs.extend(re.findall(r'url\(["\']?([^"\')]+)["\']?\)', preview))
    for src in refs:
        if src.startswith(("data:", "http://", "https://", "#")):
            continue
        target = (preview_path.parent / src).resolve()
        if root.resolve() not in target.parents and target != root.resolve():
            raise SystemExit(f"preview source escapes project: {preview_path.name}: {src}")
        if not target.is_file():
            raise SystemExit(f"preview references missing source: {preview_path.name}: {src}")

renderer = (root / "assets" / "renderer-inject.js").read_text(encoding="utf-8")
if "backdrop.style.backgroundImage" in renderer:
    raise SystemExit("renderer must not set backdrop.style.backgroundImage; use body/direct style and safe-area layers")
if "installBackgroundStyle" in renderer or "buildDirectBackgroundCss" in renderer:
    raise SystemExit("renderer must not reintroduce the retired direct background style writer")
if "removeLegacyBackgroundStyle();" not in renderer:
    raise SystemExit("renderer must remove retired direct background style nodes during theme install")
if "installBodyBackgroundInline();" not in renderer:
    raise SystemExit("renderer must apply controlled body inline background during theme install")
if "payload.backgroundDataUrl" not in renderer:
    raise SystemExit("renderer must consume backgroundDataUrl for live wallpaper injection")
if "payload.iconBadgeDataUrl));" in renderer and "--cit-character-image" in renderer:
    raise SystemExit("renderer must not source --cit-character-image from the sidebar badge")
if "--cit-character-image" not in renderer:
    raise SystemExit("renderer must expose the transparent character image CSS variable")
if "payload.characterDataUrl" not in renderer:
    raise SystemExit("renderer must consume a dedicated characterDataUrl payload")
if "payload.tableFlipCatDataUrl" not in renderer:
    raise SystemExit("renderer must consume a dedicated tableFlipCatDataUrl payload")
if "payload.tableFlipCatSpriteDataUrl" not in renderer:
    raise SystemExit("renderer must consume a dedicated tableFlipCatSpriteDataUrl payload")

enabled_theme = json.loads(pathlib.Path("/tmp/codex-interface-theme-button-module-test.json").read_text(encoding="utf-8"))
if enabled_theme["icons"]["tableFlipCat"]["path"] != "icons/table-flip-cat-left.gif":
    raise SystemExit("theme-store must preserve tableFlipCat path")
if enabled_theme["icons"]["tableFlipCat"]["spritePath"] != "icons/table-flip-cat-left-sprite.webp":
    raise SystemExit("theme-store must preserve tableFlipCat spritePath")
if enabled_theme["icons"]["tableFlipCat"]["posterPath"] != "icons/table-flip-cat-left-poster.png":
    raise SystemExit("theme-store must preserve tableFlipCat posterPath")
if enabled_theme["icons"]["tableFlipCat"]["triggerIconPath"] != "icons/table-flip-trigger-angry.svg":
    raise SystemExit("theme-store must preserve tableFlipCat triggerIconPath")
if enabled_theme["icons"]["tableFlipCat"]["enabled"] is not False:
    raise SystemExit("theme-store must keep tableFlipCat disabled unless explicitly selected")
if enabled_theme["icons"]["tableFlipCat"]["frameCount"] != 8:
    raise SystemExit("theme-store must preserve tableFlipCat frameCount")
if enabled_theme["icons"]["tableFlipCat"]["durationMs"] != 1430:
    raise SystemExit("theme-store must preserve tableFlipCat durationMs")
enabled_buttons = enabled_theme["icons"]["buttons"]
if enabled_buttons["enabled"] is not True:
    raise SystemExit("button module test should enable icons.buttons")
if enabled_buttons["applyMode"] != "module":
    raise SystemExit("button module test should set applyMode=module")
if enabled_buttons["modules"]["sidebarNavigation"]["enabled"] is not True:
    raise SystemExit("button module test should enable sidebarNavigation")
for module_name in ["titlebarNavigation", "composerControls", "topUtilityActions", "messageActions", "projectPanelRows", "projectPanels"]:
    if enabled_buttons["modules"][module_name]["enabled"] is not False:
        raise SystemExit(f"button module test should keep {module_name} disabled")
for action_name, icon_key in enabled_buttons["modules"]["sidebarNavigation"]["actions"].items():
    if icon_key not in enabled_buttons["paths"]:
        raise SystemExit(f"enabled sidebar action {action_name} points to missing icon key {icon_key}")

titlebar_theme = json.loads(pathlib.Path("/tmp/codex-interface-theme-titlebar-module-test.json").read_text(encoding="utf-8"))
titlebar_buttons = titlebar_theme["icons"]["buttons"]
if titlebar_buttons["modules"]["sidebarNavigation"]["enabled"] is not True:
    raise SystemExit("titlebar module test should keep sidebarNavigation enabled")
if titlebar_buttons["modules"]["titlebarNavigation"]["enabled"] is not True:
    raise SystemExit("titlebar module test should enable titlebarNavigation")
for module_name in ["composerControls", "topUtilityActions", "messageActions", "projectPanelRows", "projectPanels"]:
    if titlebar_buttons["modules"][module_name]["enabled"] is not False:
        raise SystemExit(f"titlebar module test should keep {module_name} disabled")
for action_name, icon_key in titlebar_buttons["modules"]["titlebarNavigation"]["actions"].items():
    if icon_key not in titlebar_buttons["paths"]:
        raise SystemExit(f"enabled titlebar action {action_name} points to missing icon key {icon_key}")

composer_theme = json.loads(pathlib.Path("/tmp/codex-interface-theme-composer-module-test.json").read_text(encoding="utf-8"))
composer_buttons = composer_theme["icons"]["buttons"]
if composer_buttons["modules"]["sidebarNavigation"]["enabled"] is not True:
    raise SystemExit("composer module test should keep sidebarNavigation enabled")
if composer_buttons["modules"]["titlebarNavigation"]["enabled"] is not True:
    raise SystemExit("composer module test should keep titlebarNavigation enabled")
if composer_buttons["modules"]["composerControls"]["enabled"] is not True:
    raise SystemExit("composer module test should enable composerControls")
if composer_buttons["modules"]["projectPanels"]["enabled"] is not False:
    raise SystemExit("composer module test should keep projectPanels icon replacement disabled")
if composer_buttons["modules"]["topUtilityActions"]["enabled"] is not False:
    raise SystemExit("composer module test should keep topUtilityActions disabled")
if composer_buttons["modules"]["messageActions"]["enabled"] is not False:
    raise SystemExit("composer module test should keep messageActions disabled")
if composer_buttons["modules"]["projectPanelRows"]["enabled"] is not False:
    raise SystemExit("composer module test should keep projectPanelRows disabled")
for action_name, icon_key in composer_buttons["modules"]["composerControls"]["actions"].items():
    if icon_key not in composer_buttons["paths"]:
        raise SystemExit(f"enabled composer action {action_name} points to missing icon key {icon_key}")

top_utility_theme = json.loads(pathlib.Path("/tmp/codex-interface-theme-top-utility-module-test.json").read_text(encoding="utf-8"))
top_utility_buttons = top_utility_theme["icons"]["buttons"]
for module_name in ["sidebarNavigation", "titlebarNavigation", "composerControls", "topUtilityActions"]:
    if top_utility_buttons["modules"][module_name]["enabled"] is not True:
        raise SystemExit(f"top utility module test should enable {module_name}")
if top_utility_buttons["modules"]["projectPanels"]["enabled"] is not False:
    raise SystemExit("top utility module test should keep projectPanels icon replacement disabled")
if top_utility_buttons["modules"]["messageActions"]["enabled"] is not False:
    raise SystemExit("top utility module test should keep messageActions disabled")
if top_utility_buttons["modules"]["projectPanelRows"]["enabled"] is not False:
    raise SystemExit("top utility module test should keep projectPanelRows disabled")
for action_name, icon_key in top_utility_buttons["modules"]["topUtilityActions"]["actions"].items():
    if icon_key not in top_utility_buttons["paths"]:
        raise SystemExit(f"enabled top utility action {action_name} points to missing icon key {icon_key}")

message_theme = json.loads(pathlib.Path("/tmp/codex-interface-theme-message-module-test.json").read_text(encoding="utf-8"))
message_buttons = message_theme["icons"]["buttons"]
for module_name in ["sidebarNavigation", "titlebarNavigation", "composerControls", "topUtilityActions", "messageActions"]:
    if message_buttons["modules"][module_name]["enabled"] is not True:
        raise SystemExit(f"message module test should enable {module_name}")
if message_buttons["modules"]["projectPanels"]["enabled"] is not False:
    raise SystemExit("message module test should keep projectPanels icon replacement disabled")
if message_buttons["modules"]["projectPanelRows"]["enabled"] is not False:
    raise SystemExit("message module test should keep projectPanelRows disabled")
for action_name, icon_key in message_buttons["modules"]["messageActions"]["actions"].items():
    if icon_key not in message_buttons["paths"]:
        raise SystemExit(f"enabled message action {action_name} points to missing icon key {icon_key}")

project_panel_rows_theme = json.loads(pathlib.Path("/tmp/codex-interface-theme-project-panel-rows-module-test.json").read_text(encoding="utf-8"))
project_panel_rows_buttons = project_panel_rows_theme["icons"]["buttons"]
if project_panel_rows_theme["art"]["safeArea"] != "sides":
    raise SystemExit("project panel rows module test should keep side background safe area")
if project_panel_rows_theme["art"]["taskMode"] != "ambient":
    raise SystemExit("project panel rows module test should keep ambient side background mode")
for module_name in ["sidebarNavigation", "titlebarNavigation", "composerControls", "topUtilityActions", "messageActions", "projectPanelRows"]:
    if project_panel_rows_buttons["modules"][module_name]["enabled"] is not True:
        raise SystemExit(f"project panel rows module test should enable {module_name}")
if project_panel_rows_buttons["modules"]["projectPanels"]["enabled"] is not False:
    raise SystemExit("project panel rows module test should keep projectPanels icon replacement disabled")
for action_name, icon_key in project_panel_rows_buttons["modules"]["projectPanelRows"]["actions"].items():
    if icon_key not in project_panel_rows_buttons["paths"]:
        raise SystemExit(f"enabled project panel row action {action_name} points to missing icon key {icon_key}")

module_matrix = json.loads(pathlib.Path("/tmp/codex-interface-theme-module-matrix-test.json").read_text(encoding="utf-8"))
if module_matrix["ok"] is not True:
    raise SystemExit(f"module matrix must pass: {module_matrix.get('errors')}")
matrix_rows = {row["scenario"]: row for row in module_matrix["rows"]}
for scenario_name in ["default-theme", "active-theme", "table-flip-enabled", "table-flip-disabled", "button-glyphs-disabled", "asset-budget", "theme-packs-extension", "retained-source-assets", "archive-candidates"]:
    if matrix_rows[scenario_name]["status"] != "passed":
        raise SystemExit(f"module matrix scenario must pass: {scenario_name}")
if module_matrix["plans"]["activeTheme"]["modules"]["tableFlipCat"] != "off":
    raise SystemExit("module matrix must confirm active theme does not load table flip cat by default")
if module_matrix["plans"]["tableFlipEnabled"]["modules"]["tableFlipCatLoad"] != "static-cache-click":
    raise SystemExit("module matrix must confirm explicit table flip enablement uses click-time static-cache loading")
if module_matrix["plans"]["activeTheme"]["modules"].get("themePacks") != "hot-swap-ready":
    raise SystemExit("module matrix must confirm developer theme packs are hot-swap ready")
expected_pack_order = [
    "knife-shield-dog",
    "orbital-stargazer-black-cat",
    "orange-mecha-cat",
]
expected_pack_ids = set(expected_pack_order)
expected_pack_roles = {
    "background",
    "heroCharacter",
    "interactionMascot",
    "interactionPoster",
    "interactionTrigger",
    "interactionSprite",
}
public_pack_plan = module_matrix["plans"].get("publicThemePackSet", {})
if public_pack_plan.get("orderedPackIds") != expected_pack_order:
    raise SystemExit(f"module matrix canonical pack order is wrong: {public_pack_plan.get('orderedPackIds')}")
if public_pack_plan.get("validatedPackIds") != expected_pack_order:
    raise SystemExit(f"module matrix must validate all three canonical packs: {public_pack_plan.get('validatedPackIds')}")
if public_pack_plan.get("runtimeRefCount") != 63 or public_pack_plan.get("expectedRuntimeRefCount") != 63:
    raise SystemExit(f"module matrix must prove all 63/63 public runtime references: {public_pack_plan}")
matrix_pack_roles = {}
for asset in module_matrix["plans"]["activeTheme"]["assets"]:
    if asset.get("module") != "themePacks":
        continue
    pack_id, separator, role = str(asset.get("role", "")).partition(":")
    if not separator:
        raise SystemExit(f"module matrix theme pack role is malformed: {asset.get('role')}")
    matrix_pack_roles.setdefault(pack_id, set()).add(role)
if set(matrix_pack_roles) != expected_pack_ids:
    raise SystemExit(f"module matrix must validate exactly the three approved packs: {sorted(matrix_pack_roles)}")
for pack_id in sorted(expected_pack_ids):
    if matrix_pack_roles[pack_id] != expected_pack_roles:
        raise SystemExit(
            f"module matrix pack assets are incomplete for {pack_id}: {sorted(matrix_pack_roles[pack_id])}"
        )
active_plan = module_matrix["plans"]["activeTheme"]
theme_pack_payload_bytes = sum(
    int(asset.get("bytes", 0))
    for asset in active_plan["assets"]
    if asset.get("module") == "themePacks"
)
all_active_asset_bytes = sum(int(asset.get("bytes", 0)) for asset in active_plan["assets"])
if theme_pack_payload_bytes <= 0:
    raise SystemExit("module matrix must include canonical pack bytes in the active payload")
if active_plan["payloadBytes"] != all_active_asset_bytes or active_plan["payloadBytes"] < theme_pack_payload_bytes:
    raise SystemExit(
        f"module matrix active payload must include pack bytes: active={active_plan['payloadBytes']} "
        f"assets={all_active_asset_bytes} packs={theme_pack_payload_bytes}"
    )
if len(module_matrix["retainedSourceAssets"]) != 10:
    raise SystemExit("module matrix must classify the ten retained source assets")
for archive_candidate in module_matrix["archiveCandidates"]:
    archive_path = archive_candidate["path"]
    retired_background = "-".join(["matrix", "cyberpunk", "orange", "cat"])
    if archive_path.startswith("/") or retired_background in archive_path:
        raise SystemExit(f"module matrix archive candidate must be public-safe: {archive_path}")
PY

printf '[dream-skin-forge] tests passed\n'
