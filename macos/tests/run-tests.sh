#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." >/dev/null 2>&1 && pwd)"
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
bash -n "$ROOT_DIR/launcher/Codex Dream Skin.app/Contents/MacOS/codex-dream-skin-launcher"
bash -n "$ROOT_DIR/launcher/Codex Dream Skin.command"
plutil -lint "$ROOT_DIR/launcher/Codex Dream Skin.app/Contents/Info.plist" >/dev/null

grep -q 'start.sh" --no-launch --once' "$ROOT_DIR/launcher/Codex Dream Skin.app/Contents/MacOS/codex-dream-skin-launcher"
grep -q 'start.sh" --once --port' "$ROOT_DIR/launcher/Codex Dream Skin.app/Contents/MacOS/codex-dream-skin-launcher"
grep -q 'start.sh" --no-launch --once' "$ROOT_DIR/launcher/Codex Dream Skin.command"
grep -q 'start.sh" --once --port' "$ROOT_DIR/launcher/Codex Dream Skin.command"

if grep -R 'for (index =' "$ROOT_DIR/launcher" >/dev/null 2>&1; then
  cit_die "launcher awk loops must not use index as a variable name on macOS awk"
fi

grep -q 'codex-interface-theme-right-hud' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "renderer must install the right HUD element"
grep -q '#codex-interface-theme-right-hud' "$ROOT_DIR/assets/theme.css" || cit_die "theme.css must style the right HUD element"
grep -q '"subtractive module aggregation"' "$ROOT_DIR/assets/runtime-modules.json" || cit_die "runtime module manifest must document subtractive module aggregation"
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
grep -q 'tableFlipCatSpriteDataUrl' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "renderer must consume the lightweight table flip cat sprite payload"
grep -q 'tableFlipCatDataUrl' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "renderer must keep the table flip cat GIF fallback payload"
grep -q 'tableFlipCatTriggerIconDataUrl' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "renderer must consume the table flip cat trigger icon payload"
grep -q 'loadTableFlipCatPlayback' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "renderer must resolve table flip playback only after click"
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
grep -q 'data-cit-character-retreat' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "renderer must expose character-only retreat state"
grep -q 'hasVisibleRightSidePanel(character)' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "character retreat must use character-aware side panel geometry"
grep -q 'intrudesIntoWorkspace' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "character retreat must ignore non-intrusive fixed right panels"
grep -q 'function hasLayoutBox' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "character text collision must ignore character opacity while using geometry"
grep -q 'characterRetreatHoldUntil' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "character retreat must hold briefly to avoid flicker during drawer transitions"
grep -q 'MutationObserver' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "character retreat must react to side panel and text layout mutations"
grep -q 'scheduleCharacterRetreatCheck' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "character retreat mutation checks must be throttled"
grep -q 'findRightMajorPanelRect' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "renderer must detect the large right source column"
grep -q 'projectPanelChromeCollidesWithLargeRightColumn' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "renderer must detect project panel collision with a large right column"
grep -q 'triggerProjectPanelChromePreflight' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "renderer must pre-hide project panel chrome from the top-right trigger"
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
grep -q 'staticAccess' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "renderer must expose static access cache state"
grep -q 'cachedElement' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "renderer must reuse stable DOM entrypoints through cachedElement"
grep -q 'function cachedNodeList' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "renderer must cache stable DOM node lists through cachedNodeList"
grep -q 'staticInteractiveTargets()' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "button modules must reuse static interactive target access"
grep -q 'staticAriaButtonTargets()' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "titlebar module must reuse static aria-button access"
grep -q 'staticProjectPanelChrome()' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "project panel chrome collision must reuse static panel chrome access"
grep -q 'projectPanelRowCandidates' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "project panel rows must reuse cached scoped row candidates"
grep -q 'invalidateStaticAccess("route", true)' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "static access cache must invalidate on route changes"
grep -q 'invalidateStaticAccess("mutation")' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "static access cache must invalidate on low-frequency layout mutations"
grep -q 'characterRetreatHoldUntil = now + 480' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "character retreat recovery must use a bounded short hold"
if grep -q 'characterRetreatHoldUntil = now + 1400' "$ROOT_DIR/assets/renderer-inject.js"; then
  cit_die "character retreat checks must not keep extending the old 1400ms hold"
fi
grep -q 'invalidateStaticAccess("right-trigger", true)' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "static access cache must invalidate on right-top trigger preflight"
grep -q 'Composer five-batch rebuild' "$ROOT_DIR/assets/theme.css" || cit_die "theme.css must use the five-batch composer rebuild"
grep -q 'Composer batch 1' "$ROOT_DIR/assets/theme.css" || cit_die "composer rebuild must keep the frame reset batch"
grep -q 'Composer batch 2' "$ROOT_DIR/assets/theme.css" || cit_die "composer rebuild must keep the bottom floor light batch"
grep -q 'Composer batch 3' "$ROOT_DIR/assets/theme.css" || cit_die "composer rebuild must keep the fifth-layer shell removal batch"
grep -q 'Composer batch 4' "$ROOT_DIR/assets/theme.css" || cit_die "composer rebuild must keep the inner control safety batch"
grep -q 'Composer batch 5' "$ROOT_DIR/assets/theme.css" || cit_die "composer rebuild must keep the chip separation batch"
grep -q 'Composer batch 6' "$ROOT_DIR/assets/theme.css" || cit_die "composer rebuild must clear native input floors separately"
grep -q '.sticky.bottom-0:has(.codex-interface-theme-composer-surface)' "$ROOT_DIR/assets/theme.css" || cit_die "composer sticky dock must stay transparent without widening coverage"
grep -q 'codex-interface-theme-composer-native-fade' "$ROOT_DIR/assets/theme.css" || cit_die "composer must remove the native black floor fade sibling"
grep -q 'from-token-main-surface-primary' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "renderer must identify the native composer floor fade by its scoped token class"
grep -q 'Final cockpit convergence' "$ROOT_DIR/assets/theme.css" || cit_die "theme must keep the final transparent cockpit convergence pass"
grep -Fq '.sticky.bottom-0 .composer-surface-chrome' "$ROOT_DIR/assets/theme.css" || cit_die "native composer must keep glass styling before runtime class attachment"
grep -q ':has(.composer-surface-chrome).*from-token-main-surface-primary' "$ROOT_DIR/assets/theme.css" || cit_die "native composer must remove both footer fades without runtime class maintenance"
if grep -q 'light: installComposerFrame' "$ROOT_DIR/assets/renderer-inject.js"; then
  cit_die "composer must not reapply on the 2500ms light maintenance cycle"
fi
grep -q 'background-image: none !important' "$ROOT_DIR/assets/theme.css" || cit_die "composer surface must be able to remove native black shell images"
grep -q '"staticAccess"' "$ROOT_DIR/assets/runtime-modules.json" || cit_die "runtime module manifest must declare staticAccess"
grep -q '"collisionScheduler"' "$ROOT_DIR/assets/runtime-modules.json" || cit_die "runtime module manifest must declare collisionScheduler"
grep -q 'staticAccess' "$ROOT_DIR/scripts/module-matrix.mjs" || cit_die "module matrix must require staticAccess"
grep -q 'collisionScheduler' "$ROOT_DIR/scripts/module-matrix.mjs" || cit_die "module matrix must require collisionScheduler"
grep -q 'staticAccessHits' "$ROOT_DIR/scripts/injector.mjs" || cit_die "verify smoke must report static access cache hits"
grep -q 'maintenanceIntervalMs' "$ROOT_DIR/scripts/injector.mjs" || cit_die "verify smoke must report renderer maintenance interval"
grep -q 'workspacePickerShells' "$ROOT_DIR/scripts/injector.mjs" || cit_die "verify smoke must report workspace picker shell hits"
grep -q 'workspacePickerPlate' "$ROOT_DIR/scripts/injector.mjs" || cit_die "verify smoke must report absence of detached workspace picker backing plates"
grep -q 'installBodyBackgroundInline' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "renderer must use controlled body inline background installation"
grep -q 'removeLegacyBackgroundStyle' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "renderer must remove the retired direct background style rule"
grep -q 'linear-gradient(180deg, rgba(12, 16, 18, 0.026), rgba(4, 6, 8, 0.155))' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "body background must use the low-darkness floor overlay"
grep -q 'background-size", "cover, cover, cover"' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "body wallpaper must stay within the three-layer composition budget"
grep -q 'background-attachment", "scroll, scroll, scroll"' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "body wallpaper layers must not use fixed attachment"
grep -q 'GPU composition budget' "$ROOT_DIR/assets/theme.css" || cit_die "theme must declare the low-cost GPU composition convergence pass"
grep -q 'Subtractive effects pass' "$ROOT_DIR/assets/theme.css" || cit_die "theme must remove idle per-icon and character filter stacks"
grep -q 'Opaque transient surfaces' "$ROOT_DIR/assets/theme.css" || cit_die "modal and menu surfaces must remain readable without live blur"
grep -q 'Opaque workspace pickers' "$ROOT_DIR/assets/theme.css" || cit_die "workspace picker listbox surfaces must isolate text from the conversation"
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

if grep -q 'radial-gradient(ellipse at 43% 98%' "$ROOT_DIR/assets/renderer-inject.js"; then
  cit_die "renderer must not restore the removed floor radial layers"
fi

if grep -q 'background-attachment", "fixed' "$ROOT_DIR/assets/renderer-inject.js"; then
  cit_die "renderer must not restore fixed body wallpaper layers"
fi

if grep -q '/ cover no-repeat fixed' "$ROOT_DIR/assets/theme.css"; then
  cit_die "theme CSS must not use a fixed body wallpaper layer"
fi

if grep -q 'function buildDirectBackgroundCss' "$ROOT_DIR/assets/renderer-inject.js" || grep -q 'function installBackgroundStyle' "$ROOT_DIR/assets/renderer-inject.js"; then
  cit_die "retired direct background style rule writer must stay removed"
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
"$NODE_PATH" --check "$ROOT_DIR/scripts/performance-probe.mjs"
"$NODE_PATH" --check "$ROOT_DIR/assets/renderer-inject.js"

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
if theme["icons"]["badge"]["path"] != "icons/orange-hacker-cat-128.png":
    raise SystemExit("theme.json badge path must use the display-sized transparent orange cat asset")
if theme["icons"]["character"]["path"] != "icons/cyber-mecha-cat-male-helmet-900.png":
    raise SystemExit("theme.json character path must use the selected male helmet mecha cat")
if theme["icons"]["character"]["placement"] != "sidebar-hero":
    raise SystemExit("theme.json character placement must keep the large character in the sidebar")
table_flip_cat = theme["icons"]["tableFlipCat"]
if table_flip_cat["path"] != "icons/table-flip-cat-left.gif":
    raise SystemExit("theme.json tableFlipCat path must keep the GIF fallback")
if table_flip_cat["spritePath"] != "icons/table-flip-cat-left-sprite.webp":
    raise SystemExit("theme.json tableFlipCat spritePath must use the lightweight WebP sprite")
if table_flip_cat["posterPath"] != "icons/table-flip-cat-left-poster.png":
    raise SystemExit("theme.json tableFlipCat posterPath must use the still poster image")
if table_flip_cat["triggerIconPath"] != "icons/table-flip-trigger-angry.svg":
    raise SystemExit("theme.json tableFlipCat triggerIconPath must use the angry trigger icon")
if table_flip_cat["enabled"] is not True:
    raise SystemExit("theme.json tableFlipCat must be enabled")
if table_flip_cat["placement"] != "right-bottom":
    raise SystemExit("theme.json tableFlipCat placement must stay right-bottom")
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
if enabled_theme["icons"]["tableFlipCat"]["enabled"] is not True:
    raise SystemExit("theme-store must keep tableFlipCat enabled")
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
for scenario_name in ["default-theme", "active-theme", "table-flip-enabled", "table-flip-disabled", "button-glyphs-disabled", "asset-budget"]:
    if matrix_rows[scenario_name]["status"] != "passed":
        raise SystemExit(f"module matrix scenario must pass: {scenario_name}")
if module_matrix["plans"]["activeTheme"]["modules"]["tableFlipCatLoad"] != "static-cache-click":
    raise SystemExit("module matrix must confirm click-time static-cache table flip loading")
if module_matrix["plans"]["activeTheme"]["payloadBytes"] <= 0:
    raise SystemExit("module matrix must report a positive active payload size")
for archive_candidate in module_matrix["archiveCandidates"]:
    archive_path = archive_candidate["path"]
    retired_background = "-".join(["matrix", "cyberpunk", "orange", "cat"])
    if archive_path.startswith("/") or retired_background in archive_path:
        raise SystemExit(f"module matrix archive candidate must be public-safe: {archive_path}")
PY

printf '[codex-interface-theme] tests passed\n'
