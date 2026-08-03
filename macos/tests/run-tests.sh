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
bash -n "$ROOT_DIR/scripts/safe-live-visual-gate.sh"
bash -n "$ROOT_DIR/scripts/atomic-ui-automation-gate.sh"
bash -n "$ROOT_DIR/scripts/dynamic-boundary-readonly-gate.sh"
bash -n "$ROOT_DIR/scripts/mount-theme-pack.sh"
bash -n "$ROOT_DIR/scripts/black-shell-transparency-gate.sh"
bash -n "$ROOT_DIR/scripts/black-shell-layer-audit.sh"
bash -n "$ROOT_DIR/scripts/black-shell-screenshot-audit.sh"
bash -n "$ROOT_DIR/scripts/open-atomic-control-workbench.sh"
bash -n "$ROOT_DIR/scripts/open-dynamic-boundary-summary-viewer.sh"
bash -n "$ROOT_DIR/tests/interaction-safety-rules.sh"
bash -n "$ROOT_DIR/tests/local-asset-standard-rules.sh"
bash -n "$ROOT_DIR/tests/target-mode-worktree-audit-rules.sh"
node --check "$ROOT_DIR/scripts/target-mode-cleanup.mjs"
bash -n "$ROOT_DIR/scripts/customize.sh"
bash -n "$ROOT_DIR/scripts/install-launcher.sh"
bash -n "$ROOT_DIR/launcher/Codex Dream Skin.app/Contents/MacOS/codex-dream-skin-launcher"
bash -n "$ROOT_DIR/launcher/Codex Dream Skin.command"
bash -n "$ROOT_DIR/launcher/Atomic Control Workbench.command"
bash -n "$ROOT_DIR/launcher/Dynamic Boundary Summary Viewer.command"
plutil -lint "$ROOT_DIR/launcher/Codex Dream Skin.app/Contents/Info.plist" >/dev/null

grep -q 'start.sh" --no-launch --once' "$ROOT_DIR/launcher/Codex Dream Skin.app/Contents/MacOS/codex-dream-skin-launcher"
grep -q 'start.sh" --once --port' "$ROOT_DIR/launcher/Codex Dream Skin.app/Contents/MacOS/codex-dream-skin-launcher"
grep -q 'start.sh" --no-launch --once' "$ROOT_DIR/launcher/Codex Dream Skin.command"
grep -q 'start.sh" --once --port' "$ROOT_DIR/launcher/Codex Dream Skin.command"
grep -q 'Atomic Control Workbench.command' "$ROOT_DIR/scripts/install-launcher.sh" || cit_die "install-launcher must install the atomic control command"
grep -q 'atomicControl=' "$ROOT_DIR/scripts/install-launcher.sh" || cit_die "install-launcher must print the atomic control command path"
grep -q 'Dynamic Boundary Summary Viewer.command' "$ROOT_DIR/scripts/install-launcher.sh" || cit_die "install-launcher must install the dynamic boundary summary viewer command"
grep -q 'dynamicBoundarySummaryViewer=' "$ROOT_DIR/scripts/install-launcher.sh" || cit_die "install-launcher must print the dynamic boundary summary viewer command path"
grep -q 'open-atomic-control-workbench.sh' "$ROOT_DIR/launcher/Atomic Control Workbench.command" || cit_die "atomic control launcher must call the workbench helper"
grep -q -- '--open true' "$ROOT_DIR/launcher/Atomic Control Workbench.command" || cit_die "atomic control launcher must be an explicit open action"
grep -q -- '--plan true' "$ROOT_DIR/launcher/Atomic Control Workbench.command" || cit_die "atomic control launcher must print the offline plan"
if grep -q 'start.sh\|restore.sh\|atomic-ui-automation-gate.sh' "$ROOT_DIR/launcher/Atomic Control Workbench.command"; then
  cit_die "atomic control launcher must not apply, restore, or run atomic automation directly"
fi
grep -q 'open-dynamic-boundary-summary-viewer.sh' "$ROOT_DIR/launcher/Dynamic Boundary Summary Viewer.command" || cit_die "summary viewer launcher must call the viewer helper"
grep -q -- '--open true' "$ROOT_DIR/launcher/Dynamic Boundary Summary Viewer.command" || cit_die "summary viewer launcher must be an explicit open action"
if grep -q 'start.sh\|restore.sh\|atomic-ui-automation-gate.sh\|dynamic-boundary-readonly-gate.sh' "$ROOT_DIR/launcher/Dynamic Boundary Summary Viewer.command"; then
  cit_die "summary viewer launcher must not apply, restore, or run live dynamic gates"
fi
grep -q 'OPEN_WORKBENCH="false"' "$ROOT_DIR/scripts/open-atomic-control-workbench.sh" || cit_die "atomic control helper must default to not opening a GUI"
grep -q 'PRINT_PLAN="true"' "$ROOT_DIR/scripts/open-atomic-control-workbench.sh" || cit_die "atomic control helper must default to printing a plan"
grep -q 'sideEffects=none-unless-open-true' "$ROOT_DIR/scripts/open-atomic-control-workbench.sh" || cit_die "atomic control helper must report its side-effect boundary"
grep -q 'atomic-control-plan.mjs' "$ROOT_DIR/scripts/open-atomic-control-workbench.sh" || cit_die "atomic control helper must use the offline planner"
if grep -q 'start.sh\|restore.sh\|atomic-ui-automation-gate.sh' "$ROOT_DIR/scripts/open-atomic-control-workbench.sh"; then
  cit_die "atomic control helper must not apply, restore, or run atomic automation directly"
fi
grep -q 'OPEN_VIEWER="false"' "$ROOT_DIR/scripts/open-dynamic-boundary-summary-viewer.sh" || cit_die "summary viewer helper must default to not opening a GUI"
grep -q 'sideEffects=none-unless-open-true' "$ROOT_DIR/scripts/open-dynamic-boundary-summary-viewer.sh" || cit_die "summary viewer helper must report its side-effect boundary"
grep -q 'dynamic-boundary-summary-viewer.html' "$ROOT_DIR/scripts/open-dynamic-boundary-summary-viewer.sh" || cit_die "summary viewer helper must point at the offline viewer"
if grep -q 'start.sh\|restore.sh\|atomic-ui-automation-gate.sh\|dynamic-boundary-readonly-gate.sh\|fetch(\|WebSocket' "$ROOT_DIR/scripts/open-dynamic-boundary-summary-viewer.sh"; then
  cit_die "summary viewer helper must not include live scan, apply, restore, or network paths"
fi
grep -q -- '--launch-only' "$ROOT_DIR/scripts/start.sh" || cit_die "start.sh must support CDP launch without theme injection"
grep -q 'launch-only complete' "$ROOT_DIR/scripts/start.sh" || cit_die "start.sh launch-only must exit before injection"
grep -q -- '--launch-only cannot be combined with --once or theme load modes' "$ROOT_DIR/scripts/start.sh" || cit_die "start.sh launch-only must reject theme modes"
grep -q -- '--no-launch' "$ROOT_DIR/scripts/safe-live-visual-gate.sh" || cit_die "safe live visual gate must never launch Codex"
grep -q -- '--once' "$ROOT_DIR/scripts/safe-live-visual-gate.sh" || cit_die "safe live visual gate must use one-shot apply"
grep -q 'restore_if_needed' "$ROOT_DIR/scripts/safe-live-visual-gate.sh" || cit_die "safe live visual gate must restore on interrupted apply"
grep -q 'CDP port 127.0.0.1:.*refusing to launch or restart Codex' "$ROOT_DIR/scripts/safe-live-visual-gate.sh" || cit_die "safe live visual gate must fail closed when CDP is unavailable"
if grep -q -- '--simulate-table-flip\|live-clickable-surface-audit' "$ROOT_DIR/scripts/safe-live-visual-gate.sh"; then
  cit_die "safe live visual gate must not simulate clicks or run clickable audit"
fi
grep -q -- '--no-launch' "$ROOT_DIR/scripts/atomic-ui-automation-gate.sh" || cit_die "atomic UI gate must never launch Codex"
grep -q -- '--once' "$ROOT_DIR/scripts/atomic-ui-automation-gate.sh" || cit_die "atomic UI gate must use one-shot apply"
grep -q -- '--carrier-only' "$ROOT_DIR/scripts/atomic-ui-automation-gate.sh" || cit_die "atomic UI gate must support carrier-only apply"
grep -q -- 'control-only) MODE_ARGS=(--control-only)' "$ROOT_DIR/scripts/atomic-ui-automation-gate.sh" || cit_die "atomic UI gate must support control-only apply"
grep -q 'control-workbench-live-verify.mjs' "$ROOT_DIR/scripts/atomic-ui-automation-gate.sh" || cit_die "atomic UI gate must run the control workbench verifier for control-only"
grep -q -- '--verify-local-control-clicks' "$ROOT_DIR/scripts/atomic-ui-automation-gate.sh" || cit_die "atomic UI gate must expose explicit local control click verification"
grep -q 'VERIFY_LOCAL_CONTROL_CLICKS="false"' "$ROOT_DIR/scripts/atomic-ui-automation-gate.sh" || cit_die "atomic UI gate must default local control click verification off"
grep -q -- '--click-local-controls "$VERIFY_LOCAL_CONTROL_CLICKS"' "$ROOT_DIR/scripts/atomic-ui-automation-gate.sh" || cit_die "atomic UI gate must pass local control click verification explicitly"
grep -q -- '--verify-local-control-clicks requires --load-mode control-only' "$ROOT_DIR/scripts/atomic-ui-automation-gate.sh" || cit_die "atomic UI gate must scope local control clicks to control-only"
grep -q -- '--launch-if-missing' "$ROOT_DIR/scripts/atomic-ui-automation-gate.sh" || cit_die "atomic UI gate must expose explicit launch-if-missing mode"
grep -q -- '--launch-only' "$ROOT_DIR/scripts/atomic-ui-automation-gate.sh" || cit_die "atomic UI gate must use launch-only before pre-apply inventory"
grep -q 'Codex is already running without CDP' "$ROOT_DIR/scripts/atomic-ui-automation-gate.sh" || cit_die "atomic UI gate must refuse to restart running Codex"
grep -q 'interface-field-inventory.mjs' "$ROOT_DIR/scripts/atomic-ui-automation-gate.sh" || cit_die "atomic UI gate must run interface inventory"
grep -q 'live-clickable-surface-audit.mjs' "$ROOT_DIR/scripts/atomic-ui-automation-gate.sh" || cit_die "atomic UI gate must run clickable inventory"
grep -q -- '--dry-run true' "$ROOT_DIR/scripts/atomic-ui-automation-gate.sh" || cit_die "atomic UI gate must always run dry-run clickable inventory"
grep -q 'interactive atomic automation requires explicit --allow-indexes or --auto-allowlist true' "$ROOT_DIR/scripts/atomic-ui-automation-gate.sh" || cit_die "atomic UI gate must require reviewed or derived allow indexes"
grep -q 'derive-clickable-allowlist.mjs' "$ROOT_DIR/scripts/atomic-ui-automation-gate.sh" || cit_die "atomic UI gate must derive automatic allowlists from dry-run reports"
grep -q 'CDP port 127.0.0.1:.*refusing to launch or restart Codex' "$ROOT_DIR/scripts/atomic-ui-automation-gate.sh" || cit_die "atomic UI gate must fail closed without CDP"
grep -q 'restore_if_needed' "$ROOT_DIR/scripts/atomic-ui-automation-gate.sh" || cit_die "atomic UI gate must restore on interrupted apply"
grep -q 'control-only verify requires style and marker before workbench verification' "$ROOT_DIR/scripts/atomic-ui-automation-gate.sh" || cit_die "atomic UI gate must route control-only verify through the workbench verifier"
grep -q 'read-only gate refuses to launch or restart Codex' "$ROOT_DIR/scripts/dynamic-boundary-readonly-gate.sh" || cit_die "dynamic readonly gate must fail closed without CDP"
grep -q 'mode":"read-only-dynamic-boundary-coverage' "$ROOT_DIR/scripts/dynamic-boundary-readonly-gate.sh" || cit_die "dynamic readonly gate must declare read-only coverage mode"
grep -q '"clicks":false' "$ROOT_DIR/scripts/dynamic-boundary-readonly-gate.sh" || cit_die "dynamic readonly gate must declare clicks false"
grep -q 'dynamic-boundary-artifact-summary.mjs' "$ROOT_DIR/scripts/dynamic-boundary-readonly-gate.sh" || cit_die "dynamic readonly gate must use the shared artifact summarizer"
if grep -q 'node:fs\|readJson(file)\|clickableDynamicBoundaryLocks' "$ROOT_DIR/scripts/dynamic-boundary-readonly-gate.sh"; then
  cit_die "dynamic readonly gate must not keep inline artifact summary logic"
fi
if grep -q 'start.sh\|restore.sh\|--once\|--launch-only\|--interact true\|--dry-run false' "$ROOT_DIR/scripts/dynamic-boundary-readonly-gate.sh"; then
  cit_die "dynamic readonly gate must not launch, apply, restore, or run interactive audit"
fi
grep -q 'activate-pack.mjs' "$ROOT_DIR/scripts/mount-theme-pack.sh" || cit_die "mount helper must activate a selected theme pack"
grep -q 'local-asset-standard.mjs' "$ROOT_DIR/scripts/mount-theme-pack.sh" || cit_die "mount helper must run strict local asset standard"
grep -q 'validate-packs.sh' "$ROOT_DIR/scripts/mount-theme-pack.sh" || cit_die "mount helper must run theme pack validation"
grep -q -- '--no-launch' "$ROOT_DIR/scripts/mount-theme-pack.sh" || cit_die "mount helper must apply only to an existing CDP renderer"
grep -q -- '--once' "$ROOT_DIR/scripts/mount-theme-pack.sh" || cit_die "mount helper must use one-shot apply"
grep -q 'CDP port 127.0.0.1:.*is not open' "$ROOT_DIR/scripts/mount-theme-pack.sh" || cit_die "mount helper must fail closed when CDP is unavailable"
if grep -q -- '--restart\|--force-quit\|restore.sh\|osascript\|kill -TERM' "$ROOT_DIR/scripts/mount-theme-pack.sh"; then
  cit_die "mount helper must not restart, restore, force quit, or launch Codex"
fi
grep -q 'black-shell-transparency gate' "$ROOT_DIR/scripts/black-shell-transparency-gate.sh" || cit_die "black shell gate must print its scoped identity"
grep -q 'apply-if-cdp-open' "$ROOT_DIR/scripts/black-shell-transparency-gate.sh" || cit_die "black shell gate must expose apply-if-cdp-open mode"
grep -q 'status-if-cdp-open' "$ROOT_DIR/scripts/black-shell-transparency-gate.sh" || cit_die "black shell gate must expose status-if-cdp-open mode"
grep -q 'cit_port_is_open "$PORT"' "$ROOT_DIR/scripts/black-shell-transparency-gate.sh" || cit_die "black shell gate must check existing CDP before live paths"
grep -q 'native-module-scan.mjs' "$ROOT_DIR/scripts/black-shell-transparency-gate.sh" || cit_die "black shell gate must report marker status through native module scan"
grep -q -- '--no-launch' "$ROOT_DIR/scripts/black-shell-transparency-gate.sh" || cit_die "black shell gate must never launch Codex"
grep -q -- '--once' "$ROOT_DIR/scripts/black-shell-transparency-gate.sh" || cit_die "black shell gate must use one-shot apply"
grep -q '"module":"blackShellTransparency"' "$ROOT_DIR/scripts/black-shell-transparency-gate.sh" || cit_die "black shell gate must identify the target module"
if grep -q -- '--restart\|--force-quit\|restore.sh\|osascript\|kill -TERM\|--simulate-table-flip\|--interact true\|--dry-run false\|clickExpression\|dragAt' "$ROOT_DIR/scripts/black-shell-transparency-gate.sh"; then
  cit_die "black shell gate must not restart, restore, force quit, click, drag, or run interactive audit"
fi
grep -q 'read-only black shell layer audit' "$ROOT_DIR/scripts/black-shell-layer-audit.sh" || cit_die "black shell layer audit must print its read-only identity"
grep -q 'black-shell-layer-audit.mjs' "$ROOT_DIR/scripts/black-shell-layer-audit.sh" || cit_die "black shell layer audit wrapper must call the DOM layer auditor"
grep -q 'cit_port_is_open "$PORT"' "$ROOT_DIR/scripts/black-shell-layer-audit.sh" || cit_die "black shell layer audit must check existing CDP before reading DOM"
grep -q 'Runtime.evaluate' "$ROOT_DIR/scripts/black-shell-layer-audit.mjs" || cit_die "black shell layer audit must read DOM through Runtime.evaluate"
grep -q 'elementsFromPoint' "$ROOT_DIR/scripts/black-shell-layer-audit.mjs" || cit_die "black shell layer audit must capture painted point stacks"
grep -q 'unmarkedNearBlackShells' "$ROOT_DIR/scripts/black-shell-layer-audit.mjs" || cit_die "black shell layer audit must report unmarked black shell candidates"
grep -q 'pseudoOrGradientCandidates' "$ROOT_DIR/scripts/black-shell-layer-audit.mjs" || cit_die "black shell layer audit must report pseudo-element or gradient candidates"
grep -q 'data-cit-black-shell' "$ROOT_DIR/scripts/black-shell-layer-audit.mjs" || cit_die "black shell layer audit must read black shell markers"
grep -q 'clicks: false' "$ROOT_DIR/scripts/black-shell-layer-audit.mjs" || cit_die "black shell layer audit must declare clicks false"
grep -q 'drags: false' "$ROOT_DIR/scripts/black-shell-layer-audit.mjs" || cit_die "black shell layer audit must declare drags false"
if grep -q -- 'start.sh\|restore.sh\|--once\|--launch-only\|--no-launch\|osascript\|kill -TERM\|Input.dispatch\|clickExpression\|dragAt\|button.click\|input.click' "$ROOT_DIR/scripts/black-shell-layer-audit.sh" "$ROOT_DIR/scripts/black-shell-layer-audit.mjs"; then
  cit_die "black shell layer audit must not launch, apply, restore, click, or drag"
fi
if grep -Eq '\.click\s*\(|\.remove\s*\(|setAttribute\s*\(|appendChild\s*\(|insertAdjacentHTML|localStorage\.setItem|sessionStorage\.setItem' "$ROOT_DIR/scripts/black-shell-layer-audit.mjs"; then
  cit_die "black shell layer audit must not mutate live DOM or browser storage"
fi
grep -q 'read-only black shell screenshot audit' "$ROOT_DIR/scripts/black-shell-screenshot-audit.sh" || cit_die "black shell screenshot audit must print its read-only identity"
grep -q 'black-shell-screenshot-audit.mjs' "$ROOT_DIR/scripts/black-shell-screenshot-audit.sh" || cit_die "black shell screenshot audit wrapper must call the pixel auditor"
grep -q 'liveDom=false' "$ROOT_DIR/scripts/black-shell-screenshot-audit.sh" || cit_die "black shell screenshot audit wrapper must declare no live DOM access"
grep -q 'read-only-black-shell-screenshot-audit' "$ROOT_DIR/scripts/black-shell-screenshot-audit.mjs" || cit_die "black shell screenshot audit must declare its mode"
grep -q 'connectedComponents' "$ROOT_DIR/scripts/black-shell-screenshot-audit.mjs" || cit_die "black shell screenshot audit must detect dark shell components"
grep -q 'smooth-dark-rectangle' "$ROOT_DIR/scripts/black-shell-screenshot-audit.mjs" || cit_die "black shell screenshot audit must detect smooth darkened rectangles"
grep -q 'edgeContrast' "$ROOT_DIR/scripts/black-shell-screenshot-audit.mjs" || cit_die "black shell screenshot audit must report edge contrast"
grep -q 'row/chip/input shell' "$ROOT_DIR/scripts/black-shell-screenshot-audit.mjs" || cit_die "black shell screenshot audit must classify small row shells"
grep -q 'large panel/backdrop shell' "$ROOT_DIR/scripts/black-shell-screenshot-audit.mjs" || cit_die "black shell screenshot audit must classify large panels"
if grep -q -- 'Runtime.evaluate\|WebSocket\|start.sh\|restore.sh\|--once\|--launch-only\|--no-launch\|osascript\|kill -TERM\|Input.dispatch\|clickExpression\|dragAt' "$ROOT_DIR/scripts/black-shell-screenshot-audit.sh" "$ROOT_DIR/scripts/black-shell-screenshot-audit.mjs"; then
  cit_die "black shell screenshot audit must not read live DOM, launch, apply, restore, click, or drag"
fi

bash "$ROOT_DIR/tests/interaction-safety-rules.sh"
bash "$ROOT_DIR/tests/local-asset-standard-rules.sh"
bash "$ROOT_DIR/tests/target-mode-worktree-audit-rules.sh"
node "$ROOT_DIR/tests/target-mode-cleanup-rules.mjs"

if grep -R 'for (index =' "$ROOT_DIR/launcher" >/dev/null 2>&1; then
  cit_die "launcher awk loops must not use index as a variable name on macOS awk"
fi

grep -q 'codex-interface-theme-right-hud' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "renderer must install the right HUD element"
grep -q '#codex-interface-theme-right-hud' "$ROOT_DIR/assets/theme.css" || cit_die "theme.css must style the right HUD element"
grep -q '#codex-interface-theme-right-hud' "$ROOT_DIR/assets/theme-kernel.css" || cit_die "theme-kernel.css must style the right HUD element"
grep -q '#codex-interface-theme-right-hud' "$ROOT_DIR/assets/theme-framework.css" || cit_die "theme-framework.css must explicitly hide theme-owned visual nodes"
grep -q '#codex-interface-theme-right-hud' "$ROOT_DIR/assets/theme-carrier.css" || cit_die "theme-carrier.css must explicitly hide theme-owned visual nodes"
grep -q '"styleEntry": "theme-kernel.css"' "$ROOT_DIR/assets/runtime-modules.json" || cit_die "runtime module manifest must point the live CSS entry at the clean kernel"
grep -q '"frameworkStyleEntry": "theme-framework.css"' "$ROOT_DIR/assets/runtime-modules.json" || cit_die "runtime module manifest must declare the framework-only CSS entry"
grep -q '"carrierStyleEntry": "theme-carrier.css"' "$ROOT_DIR/assets/runtime-modules.json" || cit_die "runtime module manifest must declare the carrier CSS entry"
grep -q '"controlStyleEntry": "theme-control.css"' "$ROOT_DIR/assets/runtime-modules.json" || cit_die "runtime module manifest must declare the control CSS entry"
grep -q '"controlRendererEntry": "renderer-control.js"' "$ROOT_DIR/assets/runtime-modules.json" || cit_die "runtime module manifest must declare the control renderer entry"
grep -q '"carrier-only"' "$ROOT_DIR/assets/runtime-modules.json" || cit_die "runtime module manifest must declare carrier-only load mode"
grep -q '"control-only"' "$ROOT_DIR/assets/runtime-modules.json" || cit_die "runtime module manifest must declare control-only load mode"
grep -q '"controlWorkbench"' "$ROOT_DIR/assets/runtime-modules.json" || cit_die "runtime module manifest must declare control workbench module"
grep -q -- '--framework-only' "$ROOT_DIR/scripts/start.sh" || cit_die "start.sh must expose the framework-only apply mode"
grep -q -- '--carrier-only' "$ROOT_DIR/scripts/start.sh" || cit_die "start.sh must expose the carrier-only apply mode"
grep -q -- '--control-only' "$ROOT_DIR/scripts/start.sh" || cit_die "start.sh must expose the control-only apply mode"
grep -q -- '--control-only is one-shot only; use --once' "$ROOT_DIR/scripts/start.sh" || cit_die "start.sh must prevent control-only daemon mode"
grep -q -- '--framework-only' "$ROOT_DIR/scripts/injector.mjs" || cit_die "injector must expose the framework-only apply mode"
grep -q -- '--carrier-only' "$ROOT_DIR/scripts/injector.mjs" || cit_die "injector must expose the carrier-only apply mode"
grep -q -- '--control-only' "$ROOT_DIR/scripts/injector.mjs" || cit_die "injector must expose the control-only apply mode"
grep -q -- '--control-only is one-shot only; use --once' "$ROOT_DIR/scripts/injector.mjs" || cit_die "injector must prevent control-only daemon mode"
grep -q 'manifest.styleEntry' "$ROOT_DIR/scripts/injector.mjs" || cit_die "injector must load the live CSS entry from the runtime manifest"
grep -q 'manifest.frameworkStyleEntry' "$ROOT_DIR/scripts/injector.mjs" || cit_die "injector must load the framework CSS entry from the runtime manifest"
grep -q 'manifest.carrierStyleEntry' "$ROOT_DIR/scripts/injector.mjs" || cit_die "injector must load the carrier CSS entry from the runtime manifest"
grep -q 'manifest.controlStyleEntry' "$ROOT_DIR/scripts/injector.mjs" || cit_die "injector must load the control CSS entry from the runtime manifest"
grep -q 'manifest.controlRendererEntry' "$ROOT_DIR/scripts/injector.mjs" || cit_die "injector must load the control renderer entry from the runtime manifest"
grep -q 'codex-interface-theme-control-workbench' "$ROOT_DIR/scripts/injector.mjs" || cit_die "injector restore fallback must remove the control workbench"
grep -q 'assetless ? {}' "$ROOT_DIR/scripts/injector.mjs" || cit_die "framework/carrier payloads must prune visual, animation, and button asset groups"
grep -q 'collectStyleEntry' "$ROOT_DIR/scripts/module-matrix.mjs" || cit_die "module matrix must budget the manifest style entry separately"
grep -q 'framework-only' "$ROOT_DIR/scripts/module-matrix.mjs" || cit_die "module matrix must include a framework-only row"
grep -q 'carrier-only' "$ROOT_DIR/scripts/module-matrix.mjs" || cit_die "module matrix must include a carrier-only row"
grep -q 'control-only' "$ROOT_DIR/scripts/module-matrix.mjs" || cit_die "module matrix must include a control-only row"
grep -q 'currentControlCssBytes' "$ROOT_DIR/scripts/module-matrix.mjs" || cit_die "module matrix must budget the control CSS entry separately"
grep -q 'currentControlRendererBytes' "$ROOT_DIR/scripts/module-matrix.mjs" || cit_die "module matrix must budget the control renderer separately"
grep -q 'codex-interface-theme-control-workbench' "$ROOT_DIR/assets/renderer-control.js" || cit_die "control renderer must install the scoped workbench"
grep -q 'plan only; no shell execution from renderer' "$ROOT_DIR/assets/renderer-control.js" || cit_die "control renderer must declare copy-only execution boundary"
grep -q '#codex-interface-theme-control-workbench' "$ROOT_DIR/assets/theme-control.css" || cit_die "control CSS must be scoped to the control workbench"
grep -q '"verifyLocalControlClicks"' "$ROOT_DIR/assets/atomic-control-schema.json" || cit_die "atomic control schema must expose local control click verification"
grep -q '"planKind": "atomic-gate"' "$ROOT_DIR/assets/atomic-control-schema.json" || cit_die "atomic control schema must default to the atomic gate plan"
grep -q '"dynamic-coverage"' "$ROOT_DIR/assets/atomic-control-schema.json" || cit_die "atomic control schema must expose the dynamic coverage plan kind"
grep -q 'verifyLocalControlClicks' "$ROOT_DIR/previews/atomic-control-workbench.html" || cit_die "preview workbench must expose local control click verification"
grep -q 'data-plan-kind="dynamic-coverage"' "$ROOT_DIR/previews/atomic-control-workbench.html" || cit_die "preview workbench must expose dynamic coverage plan kind"
grep -q 'dynamic-boundary-readonly-gate.sh' "$ROOT_DIR/previews/atomic-control-workbench.html" || cit_die "preview workbench must generate the dynamic readonly gate command"
grep -q 'verifyLocalControlClicks' "$ROOT_DIR/assets/renderer-control.js" || cit_die "renderer workbench must expose local control click verification"
grep -q '"dynamic-coverage"' "$ROOT_DIR/assets/renderer-control.js" || cit_die "renderer workbench must expose dynamic coverage plan kind"
grep -q 'dynamic-boundary-readonly-gate.sh' "$ROOT_DIR/assets/renderer-control.js" || cit_die "renderer workbench must generate the dynamic readonly gate command"
grep -q '"offline-asset-mount-manifest"' "$ROOT_DIR/assets/atomic-control-assets.json" || cit_die "atomic control assets must declare the offline mount manifest mode"
grep -q '"fitTargets"' "$ROOT_DIR/assets/atomic-control-assets.json" || cit_die "atomic control assets must declare fit targets"
grep -q '"body-background-preview"' "$ROOT_DIR/assets/atomic-control-assets.json" || cit_die "atomic control assets must declare the background fit target"
grep -q '"sidebar-hero-preview"' "$ROOT_DIR/assets/atomic-control-assets.json" || cit_die "atomic control assets must declare the hero character fit target"
grep -q '"semantic-button-preview"' "$ROOT_DIR/assets/atomic-control-assets.json" || cit_die "atomic control assets must declare the semantic button fit target"
grep -q 'ASSET_GROUPS' "$ROOT_DIR/previews/atomic-control-workbench.html" || cit_die "preview workbench must expose offline asset groups"
grep -q 'id="assetGrid"' "$ROOT_DIR/previews/atomic-control-workbench.html" || cit_die "preview workbench must render the offline asset grid"
grep -q 'ASSET_STATUS' "$ROOT_DIR/assets/renderer-control.js" || cit_die "renderer workbench must expose text-only asset status"
grep -q 'control-only 不載入圖片素材\|control-only does not load image assets' "$ROOT_DIR/assets/renderer-control.js" || cit_die "renderer workbench must not load image assets in control-only"
grep -q 'asset-mount-summary.mjs' "$ROOT_DIR/scripts/live-proof-checklist.mjs" || cit_die "live proof checklist must include the asset mount summary gate"
grep -q 'id="languageToggle"' "$ROOT_DIR/previews/atomic-control-workbench.html" || cit_die "preview workbench must expose a language toggle"
grep -q '"zh-Hant"' "$ROOT_DIR/previews/atomic-control-workbench.html" || cit_die "preview workbench must include Traditional Chinese UI strings"
grep -q 'en: {' "$ROOT_DIR/previews/atomic-control-workbench.html" || cit_die "preview workbench must include English UI strings"
grep -q '"zh-Hant"' "$ROOT_DIR/assets/renderer-control.js" || cit_die "renderer workbench must include Traditional Chinese UI strings"
grep -q 'en: {' "$ROOT_DIR/assets/renderer-control.js" || cit_die "renderer workbench must include English UI strings"
grep -q 'panel.dataset.locale' "$ROOT_DIR/assets/renderer-control.js" || cit_die "renderer workbench must expose current locale state"
grep -q '"subtractive module aggregation"' "$ROOT_DIR/assets/runtime-modules.json" || cit_die "runtime module manifest must document subtractive module aggregation"
grep -q '"boundaryPolicy"' "$ROOT_DIR/assets/runtime-modules.json" || cit_die "runtime module manifest must declare boundary ownership policy"
grep -q '"boundaryProfiles"' "$ROOT_DIR/assets/runtime-modules.json" || cit_die "runtime module manifest must declare boundary profiles"
grep -q '"dynamicBoundaryLocks"' "$ROOT_DIR/assets/runtime-modules.json" || cit_die "runtime module manifest must declare dynamic boundary locks"
grep -q '"rightTopChips"' "$ROOT_DIR/assets/runtime-modules.json" || cit_die "dynamic boundary locks must include right top chips"
grep -q '"leftSidebarRows"' "$ROOT_DIR/assets/runtime-modules.json" || cit_die "dynamic boundary locks must include left sidebar rows"
grep -q '"accountPopover"' "$ROOT_DIR/assets/runtime-modules.json" || cit_die "dynamic boundary locks must include account popovers"
grep -q '"high-memory-image-resize"' "$ROOT_DIR/assets/runtime-modules.json" || cit_die "dynamic boundary locks must retain high-memory preview drag risk"
grep -q '"fixed-coordinate-identity"' "$ROOT_DIR/assets/runtime-modules.json" || cit_die "dynamic boundary locks must forbid fixed-coordinate identity"
grep -q 'surface preflight cleans only namespaced theme markers before black shell paint' "$ROOT_DIR/assets/runtime-modules.json" || cit_die "dynamic boundary locks must document namespaced preflight cleanup"
grep -q 'protected native primitives are excluded before black shell candidate selection' "$ROOT_DIR/assets/runtime-modules.json" || cit_die "dynamic boundary locks must document protected-surface exclusion before black shell paint"
grep -q 'preflight cleanup then protected-surface exclusion before alpha-only shell background replacement' "$ROOT_DIR/assets/runtime-modules.json" || cit_die "black shell module must document preflight-before-alpha architecture"
grep -q '"boundaryProfile": "nativeBoundary"' "$ROOT_DIR/assets/runtime-modules.json" || cit_die "surface registry must declare the native boundary profile"
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
grep -q 'doc.querySelectorAll(".codex-interface-theme-table-flip-cat-animated")' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "renderer must remove detached table flip playback nodes before reinstall"
grep -q 'expectedAssetGroupHashes' "$ROOT_DIR/scripts/injector.mjs" || cit_die "injector must reject stale hot-swap playback asset groups"
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
grep -q 'position: fixed !important' "$ROOT_DIR/assets/theme-kernel.css" || cit_die "table flip HUD kernel must force fixed positioning"
grep -q 'max-width: 198px !important' "$ROOT_DIR/assets/theme-kernel.css" || cit_die "table flip HUD kernel must cap playback width"
grep -q 'contain: layout paint style !important' "$ROOT_DIR/assets/theme-kernel.css" || cit_die "table flip HUD kernel must isolate layout and paint"
grep -q 'object-fit: contain !important' "$ROOT_DIR/assets/theme-kernel.css" || cit_die "table flip HUD kernel must constrain playback imagery"
grep -q 'triggerIcon.onclick = playTableFlipCat' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "table flip cat playback must be bound to the angry icon only"
grep -q 'triggerIcon.setAttribute("role", "button")' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "table flip trigger icon must expose button semantics"
grep -q 'data-cit-character-retreat' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "renderer must expose character-only retreat state"
grep -q 'hasVisibleRightSidePanel(character)' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "character retreat must use character-aware side panel geometry"
grep -q 'intrudesIntoWorkspace' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "character retreat must ignore non-intrusive fixed right panels"
grep -q 'function hasLayoutBox' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "character text collision must ignore character opacity while using geometry"
grep -q 'characterRetreatHoldUntil' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "character retreat must hold briefly to avoid flicker during drawer transitions"
grep -q 'characterRetreatClearSamples' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "character retreat must require consecutive clear samples before release"
grep -q 'thread-scroll-container article' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "character retreat must scan readable text owners before broad containers"
if grep -q 'doc.querySelectorAll(".thread-scroll-container, main, \\[role=\\"main\\"\\], article")' "$ROOT_DIR/assets/renderer-inject.js"; then
  cit_die "character retreat must not use full main width as the primary collision owner"
fi
if grep -q 'translate3d(-22px, 26px, 0) scale(0.92)' "$ROOT_DIR/assets/theme-kernel.css" "$ROOT_DIR/assets/theme.css"; then
  cit_die "character retreat must preserve the natural rect; opacity-only retreat cannot translate or scale"
fi
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
grep -q 'function maintainBadgeMount()' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "badge module must repair an early body mount after the native sidebar appears"
grep -q 'light: maintainBadgeMount' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "badge mount repair must use the existing low-frequency maintenance phase"
grep -q 'stabilize: maintainBadgeMount' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "badge mount repair must run once after the initial paint"
grep -q 'staticAccess' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "renderer must expose static access cache state"
grep -q 'cachedElement' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "renderer must reuse stable DOM entrypoints through cachedElement"
grep -q 'function cachedNodeList' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "renderer must cache stable DOM node lists through cachedNodeList"
grep -q 'surface-registry.js' "$ROOT_DIR/scripts/injector.mjs" || cit_die "injector must load the native surface owner-lock module"
grep -q 'installSurfaceRegistry({ revision: core.revision })' "$ROOT_DIR/scripts/injector.mjs" || cit_die "injector must install the native surface owner-lock module"
grep -q 'isFrameworkOnlyRuntime ? RUNTIME_MODULES.slice(-1)' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "framework-only renderer mode must skip visual runtime modules"
grep -q 'isCarrierRuntime ? RUNTIME_MODULES.filter' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "carrier-only renderer mode must use a structural module allowlist"
grep -q 'backdrop|rightHud|badge|character|buttonGlyphs' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "carrier-only renderer mode must exclude visual and button modules"
grep -q 'RESTORE_SENTINEL_KEY' "$ROOT_DIR/scripts/injector.mjs" || cit_die "injector must persist restore state across renderer reloads"
grep -q 'buildRestoreGuardExpression' "$ROOT_DIR/scripts/injector.mjs" || cit_die "injector must install a final restore guard after old new-document scripts"
grep -q 'localStorage.setItem' "$ROOT_DIR/scripts/injector.mjs" || cit_die "restore sentinel must survive renderer context replacement"
grep -q 'data-cit-surface-lock' "$ROOT_DIR/assets/surface-registry.js" || cit_die "surface registry must expose namespaced owner-lock markers"
grep -q 'WeakMap' "$ROOT_DIR/assets/surface-registry.js" || cit_die "surface registry must avoid retaining detached native nodes"
grep -q 'INTERVAL_MS = 2500' "$ROOT_DIR/assets/surface-registry.js" || cit_die "surface registry must stay low frequency"
grep -q 'DYNAMIC_SCAN_DELAYS = \[80, 260, 720\]' "$ROOT_DIR/assets/surface-registry.js" || cit_die "surface registry must include bounded dynamic settle scans"
grep -q 'bypassInterval' "$ROOT_DIR/assets/surface-registry.js" || cit_die "surface registry route/event scans must bypass the steady-state interval"
grep -q 'triggerDynamicSurfaceScan' "$ROOT_DIR/assets/surface-registry.js" || cit_die "surface registry must react to dynamic native module triggers without polling faster"
grep -q 'sourcePreviewBlocks' "$ROOT_DIR/assets/surface-registry.js" || cit_die "surface registry must classify dynamic source preview blocks before generic popovers"
grep -q 'high-memory-image-resize' "$ROOT_DIR/assets/surface-registry.js" || cit_die "surface registry must mark high-memory preview drag risk"
grep -q 'data-cit-source-preview-block' "$ROOT_DIR/assets/theme-modules/source-preview-quarantine.css" || cit_die "source preview quarantine CSS module must target registry markers"
grep -q 'styleModules' "$ROOT_DIR/scripts/injector.mjs" || cit_die "injector must load decomposed style modules from the runtime manifest"
grep -q 'styleModules' "$ROOT_DIR/scripts/module-matrix.mjs" || cit_die "module matrix must budget decomposed style modules"
grep -q 'collectSourcePreviewQuarantineCheck' "$ROOT_DIR/scripts/module-matrix.mjs" || cit_die "module matrix must gate source preview quarantine as reset-only"
grep -q 'collectComposerShellCheck' "$ROOT_DIR/scripts/module-matrix.mjs" || cit_die "module matrix must gate composer shell as a scoped reset module"
grep -q '"composerShell"' "$ROOT_DIR/assets/runtime-modules.json" || cit_die "runtime module manifest must declare composerShell"
grep -q 'theme-modules/composer-shell.css' "$ROOT_DIR/assets/runtime-modules.json" || cit_die "runtime module manifest must load composer shell as a style module"
grep -q '.codex-interface-theme-composer-native-fade' "$ROOT_DIR/assets/theme-modules/composer-shell.css" || cit_die "composer shell module must remove the native composer fade"
grep -q '.sticky.bottom-0' "$ROOT_DIR/assets/theme-modules/composer-shell.css" || cit_die "composer shell module must scope to the native sticky bottom dock"
if grep -q 'aside.app-shell-left-panel\|codex-interface-theme-project-panel\|thread-scroll-container\|data-cit-source-preview-block' "$ROOT_DIR/assets/theme-modules/composer-shell.css"; then
  cit_die "composer shell module must not target sidebar, right panel, chat, or source preview surfaces"
fi
grep -q '"sourcePreviewBlocks"' "$ROOT_DIR/assets/runtime-modules.json" || cit_die "runtime module manifest must declare sourcePreviewBlocks"
grep -q '"sourcePreviewQuarantine"' "$ROOT_DIR/assets/runtime-modules.json" || cit_die "runtime module manifest must declare sourcePreviewQuarantine"
grep -q '"blackShellTransparency"' "$ROOT_DIR/assets/runtime-modules.json" || cit_die "runtime module manifest must declare blackShellTransparency"
grep -q 'theme-modules/black-shell-transparency.css' "$ROOT_DIR/assets/runtime-modules.json" || cit_die "runtime module manifest must load black shell transparency as a style module"
grep -q 'data-cit-black-shell' "$ROOT_DIR/assets/surface-registry.js" || cit_die "surface registry must mark official black shell layers"
grep -q 'blackShellTransparency' "$ROOT_DIR/scripts/native-module-scan.mjs" || cit_die "native module scan must report black shell transparency markers"
grep -q 'data-cit-black-shell' "$ROOT_DIR/scripts/native-module-scan.mjs" || cit_die "native module scan must read black shell marker surfaces"
grep -q 'BLACK_SHELL_EXCLUDE_SELECTOR' "$ROOT_DIR/assets/surface-registry.js" || cit_die "black shell scanner must keep primitive exclusions"
grep -q 'BLACK_SHELL_PROTECTED_SELECTOR' "$ROOT_DIR/assets/surface-registry.js" || cit_die "black shell scanner must declare protected native primitive exclusions"
grep -q 'protectedBlackShellSurface' "$ROOT_DIR/assets/surface-registry.js" || cit_die "black shell scanner must classify protected surfaces before shell candidates"
grep -q 'cleanupOwnBlackShellResidue' "$ROOT_DIR/assets/surface-registry.js" || cit_die "black shell scanner must clean its own black-shell markers before repaint"
grep -q 'runBlackShellPreflight' "$ROOT_DIR/assets/surface-registry.js" || cit_die "black shell scanner must expose a preflight phase"
grep -q 'BLACK_SHELL_SETTLE_DELAY_MS = 360' "$ROOT_DIR/assets/surface-registry.js" || cit_die "black shell scanner must use a bounded route-stabilization delay"
grep -q 'scheduleBlackShellScan' "$ROOT_DIR/assets/surface-registry.js" || cit_die "black shell scanner must expose isolated scheduling"
grep -q 'scanBlackShells' "$ROOT_DIR/assets/surface-registry.js" || cit_die "black shell scanner must expose an explicit scan entrypoint"
grep -q 'citSurfacePreflight' "$ROOT_DIR/assets/surface-registry.js" || cit_die "surface preflight must expose runtime marker state"
grep -q 'citProtectedSurfaces' "$ROOT_DIR/assets/surface-registry.js" || cit_die "surface preflight must report protected native primitive count"
grep -q '\[data-cit-black-shell="true"\]' "$ROOT_DIR/assets/theme-modules/black-shell-transparency.css" || cit_die "black shell CSS module must target registry markers"
grep -q 'background-color: var(--cit-black-shell-fill)' "$ROOT_DIR/assets/theme-modules/black-shell-transparency.css" || cit_die "black shell CSS module must only replace approved shell fill alpha"
grep -q 'background-image: none !important' "$ROOT_DIR/assets/theme-modules/black-shell-transparency.css" || cit_die "black shell CSS module must clear only approved shell background images"
grep -q 'cit-black-shell-fill-soft' "$ROOT_DIR/assets/theme-modules/black-shell-transparency.css" || cit_die "black shell CSS module must expose soft approved-shell material"
grep -q 'cit-glass-shell-edge' "$ROOT_DIR/assets/theme-modules/black-shell-transparency.css" || cit_die "black shell CSS module must use non-layout glass edge material"
for forbidden_selector in 'bg-token-main-surface-primary' 'bg-token-dropdown-background' 'aside.app-shell-left-panel' '[role="dialog"]' '[role="menu"]' '[role="listbox"]' '[data-radix-popper-content-wrapper]' 'input[placeholder*=' ':has('; do
  if grep -Fq "$forbidden_selector" "$ROOT_DIR/assets/theme-modules/black-shell-transparency.css"; then
    cit_die "black shell CSS module must not directly own protected native surface selector: $forbidden_selector"
  fi
done
if grep -Eq 'rgba\(3, 8, 11, 0\.965\)|brightness\(0\.52\)' "$ROOT_DIR/assets/theme.css"; then
  cit_die "transient menu legacy material must not regress to near-black picker plates"
fi
if grep -q -- '--cit-composer-shell-fill: rgba(5, 14, 18, 0.16)' "$ROOT_DIR/assets/theme-modules/composer-shell.css"; then
  cit_die "composer shell material must not regress to the too-transparent 0.16 fill"
fi
if grep -Eq '\b(position|transform|overflow|z-index|inset|top|right|bottom|left|opacity|pointer-events|min-width|max-width|width|min-height|max-height|height)\s*:' "$ROOT_DIR/assets/theme-modules/black-shell-transparency.css"; then
  cit_die "black shell CSS module must not change layout, stacking, visibility, or event behavior"
fi
grep -q 'text.length > 1800' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "workspace picker classifier must reject long transcript-like surfaces"
grep -q 'hasWorkspacePickerCluster' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "workspace picker classifier must require picker-specific text clusters"
grep -q 'regression gate' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "workspace picker classifier must reject debug transcript text"
if grep -q 'MutationObserver' "$ROOT_DIR/assets/surface-registry.js"; then
  cit_die "black shell scanner must not add a MutationObserver"
fi
if grep -Eq '\.remove\s*\(' "$ROOT_DIR/assets/surface-registry.js"; then
  cit_die "surface preflight must not delete native DOM nodes"
fi
for primitive in 'iframe' 'canvas' 'video' '\[contenteditable=\\"true\\"\]' '\[data-cit-source-preview-block=\\"true\\"\]'; do
  grep -q "$primitive" "$ROOT_DIR/assets/surface-registry.js" || cit_die "black shell scanner missing primitive exclusion: $primitive"
done
"$NODE_PATH" - "$ROOT_DIR/assets/surface-registry.js" <<'JS'
const fs = require("fs");
const source = fs.readFileSync(process.argv[2], "utf8");
const preflightIndex = source.indexOf("runBlackShellPreflight(reason)");
const markIndex = source.indexOf("markBlackShells(reason)");
if (preflightIndex < 0 || markIndex < 0 || preflightIndex > markIndex) {
  throw new Error("surface preflight must run before black shell marking");
}
if (!source.includes("cleanup-then-exclude")) {
  throw new Error("surface preflight must declare cleanup-then-exclude mode");
}
if (!source.includes("node.removeAttribute(BLACK_SHELL_ATTR)") || !source.includes("node.removeAttribute(BLACK_SHELL_REASON_ATTR)")) {
  throw new Error("surface preflight must clean only namespaced black shell attributes");
}
for (const forbidden of ["dispatchEvent", "Input.dispatch", "dragAt", "clickExpression"]) {
  if (source.includes(forbidden)) {
    throw new Error(`surface preflight must not contain live interaction path: ${forbidden}`);
  }
}
const interactionStart = source.indexOf("function triggerDynamicSurfaceScan");
const interactionEnd = source.indexOf("function installDynamicSurfaceHooks");
const interactionHandler = source.slice(interactionStart, interactionEnd);
if (interactionHandler.includes("scanBlackShells") || interactionHandler.includes("markBlackShells")) {
  throw new Error("black shell scanner must not run from interaction hooks");
}
const blackSchedulerStart = source.indexOf("function scheduleBlackShellScan");
const blackSchedulerEnd = source.indexOf("function scheduleDynamicSurfaceScans");
const blackScheduler = source.slice(blackSchedulerStart, blackSchedulerEnd);
for (const forbidden of ["pointerdown", "click", "keydown", "focusin", "resize"]) {
  if (blackScheduler.includes(forbidden)) {
    throw new Error(`black shell scheduler must not bind interaction hook: ${forbidden}`);
  }
}
JS
grep -q 'drag-skipped' "$ROOT_DIR/scripts/live-clickable-surface-audit.mjs" || cit_die "clickable audit must skip high-memory source preview drag"
grep -q 'byDragRisk' "$ROOT_DIR/scripts/interface-field-inventory.mjs" || cit_die "interface field inventory must report drag risk buckets"
grep -q 'dynamicBoundaryLocks' "$ROOT_DIR/scripts/interface-field-inventory.mjs" || cit_die "interface field inventory must report dynamic boundary lock coverage"
grep -q 'dynamicBoundaryLocks' "$ROOT_DIR/scripts/live-clickable-surface-audit.mjs" || cit_die "clickable audit must report dynamic boundary lock coverage"
grep -q 'missingLocks' "$ROOT_DIR/scripts/interface-field-inventory.mjs" || cit_die "interface field inventory must report missing dynamic locks"
grep -q 'missingLocks' "$ROOT_DIR/scripts/live-clickable-surface-audit.mjs" || cit_die "clickable audit must report missing dynamic locks"
grep -q 'dynamic-boundary-coverage.mjs' "$ROOT_DIR/scripts/interface-field-inventory.mjs" || cit_die "interface inventory must use the shared dynamic boundary coverage module"
grep -q 'dynamic-boundary-coverage.mjs' "$ROOT_DIR/scripts/live-clickable-surface-audit.mjs" || cit_die "clickable audit must use the shared dynamic boundary coverage module"
node --check "$ROOT_DIR/scripts/dynamic-boundary-coverage.mjs"
node "$ROOT_DIR/scripts/dynamic-boundary-coverage.mjs" --format text
node --check "$ROOT_DIR/scripts/dynamic-boundary-artifact-summary.mjs"
node "$ROOT_DIR/scripts/dynamic-boundary-artifact-summary.mjs" --fixture true --format text
node --check "$ROOT_DIR/scripts/black-shell-layer-audit.mjs"
node --check "$ROOT_DIR/scripts/black-shell-screenshot-audit.mjs"
node --check "$ROOT_DIR/scripts/asset-mount-summary.mjs"
node "$ROOT_DIR/scripts/asset-mount-summary.mjs" --format text
node --check "$ROOT_DIR/scripts/local-asset-standard.mjs"
node "$ROOT_DIR/scripts/local-asset-standard.mjs" --format text
node --check "$ROOT_DIR/scripts/live-proof-checklist.mjs"
node "$ROOT_DIR/scripts/live-proof-checklist.mjs" --format text
node --check "$ROOT_DIR/scripts/atomic-control-contract.mjs"
node "$ROOT_DIR/scripts/atomic-control-contract.mjs" --format text
node --check "$ROOT_DIR/scripts/dynamic-boundary-summary-viewer-smoke.mjs"
node "$ROOT_DIR/scripts/dynamic-boundary-summary-viewer-smoke.mjs" --format text
grep -q 'read-only-dynamic-boundary-artifact-summary' "$ROOT_DIR/scripts/dynamic-boundary-artifact-summary.mjs" || cit_die "artifact summarizer must declare the read-only summary mode"
grep -q 'mutates: false' "$ROOT_DIR/scripts/dynamic-boundary-artifact-summary.mjs" || cit_die "artifact summarizer must declare mutates false"
grep -q 'clicks: false' "$ROOT_DIR/scripts/dynamic-boundary-artifact-summary.mjs" || cit_die "artifact summarizer must declare clicks false"
grep -q 'highMemoryImageResizeLocks' "$ROOT_DIR/scripts/dynamic-boundary-artifact-summary.mjs" || cit_die "artifact summarizer must report high-memory resize lock mapping"
grep -q 'inventoryTargets' "$ROOT_DIR/scripts/dynamic-boundary-artifact-summary.mjs" || cit_die "artifact summarizer must report inventory target coverage"
grep -q 'data-viewer-mode="offline-summary-viewer"' "$ROOT_DIR/previews/dynamic-boundary-summary-viewer.html" || cit_die "summary viewer must declare offline summary mode"
grep -q 'FIXTURE_SUMMARY' "$ROOT_DIR/previews/dynamic-boundary-summary-viewer.html" || cit_die "summary viewer must include a fixture summary"
grep -q 'id="summaryFile"' "$ROOT_DIR/previews/dynamic-boundary-summary-viewer.html" || cit_die "summary viewer must load local summary JSON files"
grep -q 'id="loadFixture"' "$ROOT_DIR/previews/dynamic-boundary-summary-viewer.html" || cit_die "summary viewer must expose a fixture button"
grep -q 'id="renderJson"' "$ROOT_DIR/previews/dynamic-boundary-summary-viewer.html" || cit_die "summary viewer must render pasted JSON"
grep -q 'highMemoryImageResizeLocks' "$ROOT_DIR/previews/dynamic-boundary-summary-viewer.html" || cit_die "summary viewer must expose high-memory resize locks"
if grep -q 'fetch(\|WebSocket\|Runtime.evaluate\|Input.dispatch\|start.sh\|restore.sh\|atomic-ui-automation-gate.sh\|dynamic-boundary-readonly-gate.sh' "$ROOT_DIR/previews/dynamic-boundary-summary-viewer.html"; then
  cit_die "summary viewer must stay file-only and must not include live scan or apply paths"
fi
grep -q 'route/event short settle follow-up' "$ROOT_DIR/assets/runtime-modules.json" || cit_die "surface registry event policy must document dynamic settle follow-up"
grep -q 'no MutationObserver' "$ROOT_DIR/assets/runtime-modules.json" || cit_die "surface registry must not add a second full-page observer"
grep -q 'RESTORE_SENTINEL_KEY' "$ROOT_DIR/scripts/injector.mjs" || cit_die "injector must own the restore sentinel key"
grep -q 'sessionStorage.setItem' "$ROOT_DIR/scripts/injector.mjs" || cit_die "restore must persist the sentinel before cleanup"
grep -q 'sessionStorage.removeItem' "$ROOT_DIR/scripts/injector.mjs" || cit_die "apply must clear the restore sentinel"
grep -q 'staticInteractiveTargets()' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "button modules must reuse static interactive target access"
grep -q 'staticAriaButtonTargets()' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "titlebar module must reuse static aria-button access"
grep -q 'staticProjectPanelChrome()' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "project panel chrome collision must reuse static panel chrome access"
grep -q 'projectPanelRowCandidates' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "project panel rows must reuse cached scoped row candidates"
grep -q 'invalidateStaticAccess("route", true)' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "static access cache must invalidate on route changes"
grep -q 'window.setTimeout(runRuntimeModulePhase,350,"route")' "$ROOT_DIR/assets/renderer-inject.js" || cit_die "route module phase must wait for the native DOM to settle"
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
grep -q '"surfaceRegistry"' "$ROOT_DIR/assets/runtime-modules.json" || cit_die "runtime module manifest must declare surfaceRegistry"
grep -q '"collisionScheduler"' "$ROOT_DIR/assets/runtime-modules.json" || cit_die "runtime module manifest must declare collisionScheduler"
grep -q 'staticAccess' "$ROOT_DIR/scripts/module-matrix.mjs" || cit_die "module matrix must require staticAccess"
grep -q 'surfaceRegistry' "$ROOT_DIR/scripts/module-matrix.mjs" || cit_die "module matrix must require surfaceRegistry"
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
grep -q 'Route-level black shells' "$ROOT_DIR/assets/theme.css" || cit_die "theme must declare route-level black shell material"
grep -Fq -- '--cit-route-card-fill' "$ROOT_DIR/assets/theme.css" || cit_die "theme must expose route card fill token"
grep -Fq -- '--cit-picker-shell-fill' "$ROOT_DIR/assets/theme.css" || cit_die "theme must expose picker shell fill token"
grep -Fq -- '--cit-picker-shell-line' "$ROOT_DIR/assets/theme.css" || cit_die "theme must expose picker shell line token"
grep -Fq 'not(.codex-interface-theme-project-panel)' "$ROOT_DIR/assets/theme.css" || cit_die "generic rounded surfaces must not override project panel rows"
grep -Fq 'not([data-cit-source-preview-block="true"])' "$ROOT_DIR/assets/theme.css" || cit_die "generic rounded surfaces must not override source preview blocks"
grep -Fq ':not(:has([data-cit-source-preview-block="true"]))' "$ROOT_DIR/assets/theme.css" || cit_die "generic rounded surfaces must not override source preview block parents"
grep -Fq 'var(--cit-route-card-fill)' "$ROOT_DIR/assets/theme.css" || cit_die "route-level black shells must use route-card material token"
grep -Fq 'background-color: var(--cit-picker-shell-fill)' "$ROOT_DIR/assets/theme.css" || cit_die "picker shells must use the tokenized opaque glass fill"
grep -Fq -- '--cit-black-shell-fill' "$ROOT_DIR/assets/theme-modules/black-shell-transparency.css" || cit_die "black shell module must expose the marker material token"
grep -Fq '[data-cit-black-shell="true"]' "$ROOT_DIR/assets/theme-modules/black-shell-transparency.css" || cit_die "black shell module must target only approved marker surfaces"
! grep -Fq 'aside.app-shell-left-panel' "$ROOT_DIR/assets/theme-modules/black-shell-transparency.css" || cit_die "black shell module must not directly own sidebar surfaces"
! grep -Fq '[role="dialog"]' "$ROOT_DIR/assets/theme-modules/black-shell-transparency.css" || cit_die "black shell module must not directly own native dialogs"
! grep -Fq '[role="menu"]' "$ROOT_DIR/assets/theme-modules/black-shell-transparency.css" || cit_die "black shell module must not directly own native menus"
! grep -Fq '[data-radix-popper-content-wrapper]' "$ROOT_DIR/assets/theme-modules/black-shell-transparency.css" || cit_die "black shell module must not directly own native popovers"
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

if "$PYTHON_PATH" - "$ROOT_DIR/assets/theme.css" <<'PY'
import pathlib
import re
import sys

css = pathlib.Path(sys.argv[1]).read_text(encoding="utf-8")
if "Theme art stack: keep the right-bottom manual trigger above native washes" not in css:
    raise SystemExit(1)
right_hud_z = []
for match in re.finditer(r"(?P<selectors>[^{}]*#codex-interface-theme-right-hud[^{}]*)\{(?P<body>[^{}]*)\}", css, re.S):
    body = match.group("body")
    for value in re.findall(r"z-index\s*:\s*(\d+)", body):
        right_hud_z.append(int(value))
workspace_picker_z = []
for match in re.finditer(r"(?P<selectors>[^{}]*codex-interface-theme-workspace-picker[^{}]*)\{(?P<body>[^{}]*)\}", css, re.S):
    body = match.group("body")
    for value in re.findall(r"z-index\s*:\s*(\d+)", body):
        workspace_picker_z.append(int(value))
if not right_hud_z or max(right_hud_z) < 2147483100:
    raise SystemExit(1)
if workspace_picker_z and max(right_hud_z) <= max(workspace_picker_z):
    raise SystemExit(1)
for match in re.finditer(r"(?P<selectors>[^{}]*)\{(?P<body>[^{}]*)\}", css, re.S):
    selector = "\n".join(
        line for line in match.group("selectors").splitlines()
        if line.strip() and not line.lstrip().startswith(("/", "*"))
    )
    if re.search(r"(black-shell|right-panel|project-panel|workspace-picker|source-preview|composer)", selector, re.I) and "z-index: 2147483100" in match.group("body"):
        raise SystemExit(1)
raise SystemExit(0)
PY
then
  :
else
  cit_die "right HUD theme art stack must stay above workspace picker without promoting native black-shell surfaces"
fi

if "$PYTHON_PATH" - "$ROOT_DIR/assets/theme.css" <<'PY'
import pathlib
import re
import sys

css = pathlib.Path(sys.argv[1]).read_text(encoding="utf-8")
if "Project panel rows: row shells own material; native row controls stay readable." not in css:
    raise SystemExit(1)
if "--cit-project-row-fill" not in css or "--cit-project-row-line" not in css:
    raise SystemExit(1)
if ".codex-interface-theme-project-panel-content :is([role=\"list\"] button, [role=\"listitem\"] button, button.group\\/summary-panel-item, .group\\/summary-panel-item)" not in css:
    raise SystemExit(1)
if ".codex-interface-theme-project-panel-content :is([role=\"list\"] button, [role=\"listitem\"] button, button.group\\/summary-panel-item, .group\\/summary-panel-item) :is(button, [role=\"button\"], a, svg, [class*=\"icon\" i], [data-testid*=\"more\" i])" not in css:
    raise SystemExit(1)
for match in re.finditer(r"(?P<selectors>[^{}]*)\{(?P<body>[^{}]*)\}", css, re.S):
    selector = "\n".join(
        line for line in match.group("selectors").splitlines()
        if line.strip() and not line.lstrip().startswith(("/", "*"))
    )
    body = match.group("body")
    if "--cit-project-row-fill" in body and ".codex-interface-theme-project-panel-content" not in selector and "[data-cit-button-module=\"projectPanelRows\"]" not in selector:
        raise SystemExit(1)
raise SystemExit(0)
PY
then
  :
else
  cit_die "project panel row material must stay scoped to project panel rows and nested controls"
fi

if "$PYTHON_PATH" - "$ROOT_DIR/assets/theme.css" "$ROOT_DIR/assets/theme-modules/black-shell-transparency.css" <<'PY'
import pathlib
import re
import sys

theme_css = pathlib.Path(sys.argv[1]).read_text(encoding="utf-8")
module_css = pathlib.Path(sys.argv[2]).read_text(encoding="utf-8")
if "Project list row shell: route-scoped row cards stay glass while plus/actions stay opaque." not in theme_css:
    raise SystemExit(1)
for token in (
    "--cit-project-list-row-fill",
    "--cit-project-list-row-line",
    "--cit-project-list-action-fill",
):
    if token not in theme_css:
        raise SystemExit(1)
for route_selector in (
    'main:has(input[placeholder*="搜尋專案"])',
    'main:has(input[placeholder*="Search projects"])',
):
    if route_selector not in theme_css:
        raise SystemExit(1)
for exclusion in (
    ':not(.codex-interface-theme-project-panel)',
    ':not([data-cit-source-preview-block="true"])',
):
    if exclusion not in theme_css:
        raise SystemExit(1)
for match in re.finditer(r"(?P<selectors>[^{}]*)\{(?P<body>[^{}]*)\}", theme_css, re.S):
    selector = "\n".join(
        line for line in match.group("selectors").splitlines()
        if line.strip() and not line.lstrip().startswith(("/", "*"))
    )
    body = match.group("body")
    if "var(--cit-project-list-row-fill)" in body and (
        'main:has(input[placeholder*="搜尋專案"])' not in selector
        and 'main:has(input[placeholder*="Search projects"])' not in selector
    ):
        raise SystemExit(1)
    if "var(--cit-project-list-action-fill)" in body and (
        'main:has(input[placeholder*="搜尋專案"])' not in selector
        and 'main:has(input[placeholder*="Search projects"])' not in selector
    ):
        raise SystemExit(1)
if "main:has(" in module_css:
    raise SystemExit(1)
for match in re.finditer(r"(?P<selectors>[^{}]*)\{(?P<body>[^{}]*)\}", module_css, re.S):
    body = match.group("body")
    if (
        "var(--cit-project-list-row-fill)" in body
        or "var(--cit-project-list-action-fill)" in body
    ):
        raise SystemExit(1)
raise SystemExit(0)
PY
then
  :
else
  cit_die "project list row shell must stay route-scoped and keep plus/action buttons opaque"
fi

"$NODE_PATH" --check "$ROOT_DIR/scripts/injector.mjs"
"$NODE_PATH" --check "$ROOT_DIR/scripts/theme-store.mjs"
"$NODE_PATH" --check "$ROOT_DIR/scripts/theme-runtime-defaults.mjs"
"$NODE_PATH" --check "$ROOT_DIR/scripts/module-matrix.mjs"
"$NODE_PATH" --check "$ROOT_DIR/scripts/performance-probe.mjs"
"$NODE_PATH" --check "$ROOT_DIR/scripts/module-boundary-gate.mjs"
"$NODE_PATH" --check "$ROOT_DIR/scripts/atomic-control-contract.mjs"
"$NODE_PATH" --check "$ROOT_DIR/scripts/dynamic-boundary-artifact-summary.mjs"
"$NODE_PATH" --check "$ROOT_DIR/scripts/dynamic-boundary-summary-viewer-smoke.mjs"
"$NODE_PATH" --check "$ROOT_DIR/scripts/live-clickable-surface-audit.mjs"
"$NODE_PATH" --check "$ROOT_DIR/scripts/derive-clickable-allowlist.mjs"
"$NODE_PATH" --check "$ROOT_DIR/scripts/black-shell-layer-audit.mjs"
"$NODE_PATH" --check "$ROOT_DIR/scripts/black-shell-screenshot-audit.mjs"
"$NODE_PATH" --check "$ROOT_DIR/scripts/surface-gap-matrix.mjs"
"$NODE_PATH" --check "$ROOT_DIR/scripts/atomic-control-plan.mjs"
"$NODE_PATH" --check "$ROOT_DIR/scripts/atomic-control-workbench-smoke.mjs"
"$NODE_PATH" --check "$ROOT_DIR/scripts/control-workbench-live-verify.mjs"
"$NODE_PATH" --check "$ROOT_DIR/assets/renderer-inject.js"
"$NODE_PATH" --check "$ROOT_DIR/assets/renderer-control.js"
"$NODE_PATH" --check "$ROOT_DIR/assets/surface-registry.js"

"$NODE_PATH" "$ROOT_DIR/scripts/surface-gap-matrix.mjs"

ATOMIC_CONTROL_CONTRACT_JSON="/tmp/codex-interface-theme-atomic-control-contract.json"
"$NODE_PATH" "$ROOT_DIR/scripts/atomic-control-contract.mjs" --format json >"$ATOMIC_CONTROL_CONTRACT_JSON"
"$NODE_PATH" - "$ATOMIC_CONTROL_CONTRACT_JSON" <<'JS'
const fs = require("fs");
const contract = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
if (!contract.ok || contract.mode !== "offline-atomic-control-contract") {
  throw new Error("atomic control contract must pass in offline contract mode");
}
for (const key of ["executes", "mutates", "launches", "connectsToCdp", "clicks", "drags", "appliesTheme", "restores"]) {
  if (contract.sideEffects[key] !== false) {
    throw new Error(`atomic control contract side effect must be false: ${key}`);
  }
}
for (const mode of ["carrier-only", "framework-only", "control-only", "visual"]) {
  if (!contract.loadModes.some((item) => item.id === mode && item.existsInRuntimeManifest)) {
    throw new Error(`atomic control contract missing runtime-backed load mode: ${mode}`);
  }
}
const controlOnly = contract.loadModes.find((item) => item.id === "control-only");
if (!controlOnly || !controlOnly.oneShotOnly || controlOnly.visualAssets) {
  throw new Error("control-only must stay one-shot and assetless in the atomic control contract");
}
for (const planKind of ["atomic-gate", "dynamic-coverage"]) {
  if (!contract.planKinds.some((item) => item.id === planKind && item.executes === false && item.mutates === false)) {
    throw new Error(`atomic control contract missing offline plan kind: ${planKind}`);
  }
}
for (const slot of ["runtimeBackground", "sidebarBadge", "heroCharacter", "tableFlipCat", "buttonGlyphs"]) {
  if (!contract.assetSlots.some((item) => item.id === slot && item.runtimeItems.length > 0 && item.targetKind)) {
    throw new Error(`atomic control contract missing fitted asset slot: ${slot}`);
  }
}
for (const lock of ["sourcePreviewBlocks", "rightTopChips", "leftSidebarRows", "projectPanelRows", "accountPopover", "composerSurface", "blackShellTransparency"]) {
  if (!contract.dynamicLocks.some((item) => item.id === lock && item.owner === "native")) {
    throw new Error(`atomic control contract missing native dynamic lock: ${lock}`);
  }
}
const sourcePreview = contract.dynamicLocks.find((item) => item.id === "sourcePreviewBlocks");
if (!sourcePreview.riskTags.includes("high-memory-image-resize")) {
  throw new Error("source preview lock must retain high-memory-image-resize risk");
}
JS

"$NODE_PATH" - "$ROOT_DIR/assets/atomic-control-schema.json" "$ROOT_DIR/previews/atomic-control-workbench.html" <<'JS'
const fs = require("fs");
const schema = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const html = fs.readFileSync(process.argv[3], "utf8");
if (schema.defaults.loadMode !== "carrier-only") {
  throw new Error("atomic control schema must default to carrier-only");
}
if (schema.defaults.planKind !== "atomic-gate") {
  throw new Error("atomic control schema must default to atomic-gate");
}
for (const planKind of ["atomic-gate", "dynamic-coverage"]) {
  if (!schema.planKinds.some((item) => item.id === planKind)) {
    throw new Error(`atomic control schema must expose plan kind: ${planKind}`);
  }
  if (!html.includes(`data-plan-kind="${planKind}"`)) {
    throw new Error(`atomic control workbench must expose plan kind: ${planKind}`);
  }
}
for (const invariant of ["no delete", "no launch by default", "no restart by default", "no click by default", "no drag by default"]) {
  if (!schema.invariants.includes(invariant)) {
    throw new Error(`atomic control schema must declare invariant: ${invariant}`);
  }
}
for (const mode of ["carrier-only", "framework-only", "visual"]) {
  if (!html.includes(`data-mode="${mode}"`)) {
    throw new Error(`atomic control workbench must expose load mode: ${mode}`);
  }
}
if (!schema.loadModes.some((item) => item.id === "control-only")) {
  throw new Error("atomic control schema must expose load mode: control-only");
}
if (!html.includes('data-mode="control-only"')) {
  throw new Error("atomic control workbench must expose load mode: control-only");
}
for (const marker of ["offline-command-plan", "executes: false", "mutates: false", "connectsToCdp: false"]) {
  if (!html.includes(marker)) {
    throw new Error(`atomic control workbench must expose non-mutating marker: ${marker}`);
  }
}
for (const forbidden of ["osascript", "open -a", "git push", "fetch(", "WebSocket"]) {
  if (html.includes(forbidden)) {
    throw new Error(`atomic control workbench must not include live side-effect path: ${forbidden}`);
  }
}
if (/(^|[\s;&|])rm(\s|$)/.test(html)) {
  throw new Error("atomic control workbench must not include an rm command path");
}
JS

ATOMIC_PLAN_JSON="/tmp/codex-interface-theme-atomic-control-plan.json"
"$NODE_PATH" "$ROOT_DIR/scripts/atomic-control-plan.mjs" \
  --format json \
  --out-dir /tmp/codex-interface-theme-atomic-control-test >"$ATOMIC_PLAN_JSON"
"$NODE_PATH" - "$ATOMIC_PLAN_JSON" <<'JS'
const fs = require("fs");
const plan = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
if (!plan.ok || plan.executes !== false || plan.mutates !== false || plan.connectsToCdp !== false) {
  throw new Error("atomic control planner must be an offline non-mutating plan");
}
if (plan.options.planKind !== "atomic-gate") {
  throw new Error("atomic control planner must default to atomic-gate");
}
if (plan.options.loadMode !== "carrier-only") {
  throw new Error("atomic control planner must default to carrier-only");
}
for (const expected of ["--launch-if-missing false", "--interact false", "--allow-stateful-controls false", "--auto-allowlist false", "--drag false"]) {
  if (!plan.commandText.includes(expected)) {
    throw new Error(`atomic control default command missing: ${expected}`);
  }
}
if (!plan.commandText.includes("--verify-local-control-clicks false")) {
  throw new Error("atomic control default command missing: --verify-local-control-clicks false");
}
JS

if "$NODE_PATH" "$ROOT_DIR/scripts/atomic-control-plan.mjs" \
  --out-dir /tmp/codex-interface-theme-atomic-control-test \
  --interact true >/tmp/codex-interface-theme-atomic-control-invalid.txt 2>&1; then
  cit_die "atomic control planner must reject interactive mode without allow indexes or auto allowlist"
fi
grep -q 'interactive plan requires --allow-indexes or --auto-allowlist true' /tmp/codex-interface-theme-atomic-control-invalid.txt || cit_die "atomic control planner must explain the missing allowlist"

DYNAMIC_COVERAGE_PLAN_JSON="/tmp/codex-interface-theme-dynamic-coverage-plan.json"
"$NODE_PATH" "$ROOT_DIR/scripts/atomic-control-plan.mjs" \
  --format json \
  --out-dir /tmp/codex-interface-theme-dynamic-coverage-test \
  --plan-kind dynamic-coverage >"$DYNAMIC_COVERAGE_PLAN_JSON"
"$NODE_PATH" - "$DYNAMIC_COVERAGE_PLAN_JSON" <<'JS'
const fs = require("fs");
const plan = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
if (!plan.ok || plan.executes !== false || plan.mutates !== false || plan.connectsToCdp !== false) {
  throw new Error("dynamic coverage plan must remain offline and non-mutating");
}
if (plan.options.planKind !== "dynamic-coverage") {
  throw new Error("dynamic coverage plan must preserve the selected plan kind");
}
if (!plan.commandText.includes("macos/scripts/dynamic-boundary-readonly-gate.sh")) {
  throw new Error("dynamic coverage plan must call the read-only dynamic boundary gate");
}
if (plan.commandText.includes("atomic-ui-automation-gate.sh")) {
  throw new Error("dynamic coverage plan must not call the atomic apply gate");
}
for (const expected of ["--samples 3", "--interval-ms 700", "--allow-stateful-controls false"]) {
  if (!plan.commandText.includes(expected)) {
    throw new Error(`dynamic coverage default command missing: ${expected}`);
  }
}
if (!plan.warnings.some((warning) => warning.includes("read-only inventory only"))) {
  throw new Error("dynamic coverage plan must explain its read-only inventory boundary");
}
JS

if "$NODE_PATH" "$ROOT_DIR/scripts/atomic-control-plan.mjs" \
  --out-dir /tmp/codex-interface-theme-dynamic-coverage-test \
  --plan-kind dynamic-coverage \
  --interact true \
  --auto-allowlist true >/tmp/codex-interface-theme-dynamic-coverage-invalid.txt 2>&1; then
  cit_die "dynamic coverage planner must reject interaction"
fi
grep -q 'dynamic coverage plan is read-only' /tmp/codex-interface-theme-dynamic-coverage-invalid.txt || cit_die "dynamic coverage planner must explain read-only interaction rejection"

if "$NODE_PATH" "$ROOT_DIR/scripts/atomic-control-plan.mjs" \
  --out-dir /tmp/codex-interface-theme-dynamic-coverage-test \
  --plan-kind dynamic-coverage \
  --launch-if-missing true >/tmp/codex-interface-theme-dynamic-coverage-launch-invalid.txt 2>&1; then
  cit_die "dynamic coverage planner must reject launch-if-missing"
fi
grep -q 'dynamic coverage plan refuses launch-if-missing' /tmp/codex-interface-theme-dynamic-coverage-launch-invalid.txt || cit_die "dynamic coverage planner must explain launch rejection"

CONTROL_ONLY_PLAN_JSON="/tmp/codex-interface-theme-control-only-plan.json"
"$NODE_PATH" "$ROOT_DIR/scripts/atomic-control-plan.mjs" \
  --format json \
  --out-dir /tmp/codex-interface-theme-atomic-control-test \
  --load-mode control-only >"$CONTROL_ONLY_PLAN_JSON"
"$NODE_PATH" - "$CONTROL_ONLY_PLAN_JSON" <<'JS'
const fs = require("fs");
const plan = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
if (!plan.ok || plan.executes !== false || plan.mutates !== false || plan.connectsToCdp !== false) {
  throw new Error("control-only atomic plan must remain offline and non-mutating");
}
if (plan.options.loadMode !== "control-only") {
  throw new Error("control-only atomic plan must preserve the selected load mode");
}
if (!plan.commandText.includes("--load-mode control-only")) {
  throw new Error("control-only atomic plan command must include the control-only load mode");
}
if (!plan.commandText.includes("--verify-local-control-clicks false")) {
  throw new Error("control-only atomic plan command must keep local control clicks off by default");
}
if (!plan.warnings.some((warning) => warning.includes("control-only applies only"))) {
  throw new Error("control-only atomic plan must explain its one-shot control boundary");
}
JS

CONTROL_ONLY_LOCAL_CLICK_PLAN_JSON="/tmp/codex-interface-theme-control-only-local-click-plan.json"
"$NODE_PATH" "$ROOT_DIR/scripts/atomic-control-plan.mjs" \
  --format json \
  --out-dir /tmp/codex-interface-theme-atomic-control-test \
  --load-mode control-only \
  --verify-local-control-clicks true >"$CONTROL_ONLY_LOCAL_CLICK_PLAN_JSON"
"$NODE_PATH" - "$CONTROL_ONLY_LOCAL_CLICK_PLAN_JSON" <<'JS'
const fs = require("fs");
const plan = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
if (!plan.ok || plan.options.verifyLocalControlClicks !== true) {
  throw new Error("control-only local click plan must preserve explicit local click verification");
}
if (!plan.commandText.includes("--verify-local-control-clicks true")) {
  throw new Error("control-only local click plan command must include explicit local click verification");
}
if (!plan.warnings.some((warning) => warning.includes("local control click verification is scoped"))) {
  throw new Error("control-only local click plan must explain scoped local clicks");
}
JS

if "$NODE_PATH" "$ROOT_DIR/scripts/atomic-control-plan.mjs" \
  --out-dir /tmp/codex-interface-theme-atomic-control-test \
  --verify-local-control-clicks true >/tmp/codex-interface-theme-control-local-click-invalid.txt 2>&1; then
  cit_die "atomic control planner must reject local control clicks outside control-only mode"
fi
grep -q 'local control click verification requires --load-mode control-only' /tmp/codex-interface-theme-control-local-click-invalid.txt || cit_die "atomic control planner must explain local control click mode scope"

"$NODE_PATH" "$ROOT_DIR/scripts/module-boundary-gate.mjs" --manifest "$ROOT_DIR/assets/runtime-modules.json" --format text
"$NODE_PATH" "$ROOT_DIR/scripts/atomic-control-workbench-smoke.mjs" --format text
"$NODE_PATH" "$ROOT_DIR/scripts/dynamic-boundary-summary-viewer-smoke.mjs" --format text

SUMMARY_VIEWER_PLAN="/tmp/codex-interface-theme-dynamic-summary-viewer-plan.txt"
bash "$ROOT_DIR/scripts/open-dynamic-boundary-summary-viewer.sh" --open false >"$SUMMARY_VIEWER_PLAN"
grep -q 'dynamic boundary summary viewer' "$SUMMARY_VIEWER_PLAN" || cit_die "summary viewer helper must print its identity"
grep -q 'mode=offline-summary-viewer' "$SUMMARY_VIEWER_PLAN" || cit_die "summary viewer helper must print offline viewer mode"
grep -q 'sideEffects=none-unless-open-true' "$SUMMARY_VIEWER_PLAN" || cit_die "summary viewer helper must print its side-effect boundary"
grep -q 'dynamic-boundary-summary-viewer.html' "$SUMMARY_VIEWER_PLAN" || cit_die "summary viewer helper must print the viewer path"
grep -q 'clickLocalControls: "false"' "$ROOT_DIR/scripts/control-workbench-live-verify.mjs" || cit_die "control live verifier must default local clicks off"
grep -q 'button.click()' "$ROOT_DIR/scripts/control-workbench-live-verify.mjs" || cit_die "control live verifier must support explicit local mode button clicks"
grep -q 'input.click()' "$ROOT_DIR/scripts/control-workbench-live-verify.mjs" || cit_die "control live verifier must support explicit local toggle clicks"
grep -q 'closest("#" +' "$ROOT_DIR/scripts/control-workbench-live-verify.mjs" || cit_die "control live verifier clicks must be scoped to the control workbench"
grep -q 'control-workbench-live-verify.json' "$ROOT_DIR/scripts/control-workbench-live-verify.mjs" || cit_die "control live verifier must write durable JSON evidence"
grep -q 'CONTROL_ID = "codex-interface-theme-control-workbench"' "$ROOT_DIR/scripts/control-workbench-live-verify.mjs" || cit_die "control live verifier must document its scoped live boundary"

grep -Fq '[data-cit-clickable-audit-id]' "$ROOT_DIR/scripts/live-clickable-surface-audit.mjs" || cit_die "clickable audit must select temporary DOM markers for cleanup"
grep -q 'removeAttribute("data-cit-clickable-audit-id")' "$ROOT_DIR/scripts/live-clickable-surface-audit.mjs" || cit_die "clickable audit must remove its temporary DOM markers"
grep -Fq 'Boolean(node.closest("[data-cit-source-preview-block=' "$ROOT_DIR/scripts/live-clickable-surface-audit.mjs" || cit_die "clickable audit must serialize draggable as a boolean, not a DOM node"

"$PYTHON_PATH" - "$ROOT_DIR/scripts/live-clickable-surface-audit.mjs" <<'PY'
import pathlib
import re
import sys

script = pathlib.Path(sys.argv[1]).read_text(encoding="utf-8")
if 'dryRun: "true"' not in script:
    raise SystemExit("clickable audit must default to dry-run mode")
if 'interact: "false"' not in script:
    raise SystemExit("clickable audit must default to non-interactive mode")
if 'allowStatefulControls: "false"' not in script:
    raise SystemExit("clickable audit must default stateful UI controls to report-only")
if 'interactive clickable audit requires --interact true --dry-run false' not in script:
    raise SystemExit("interactive audit must require an explicit double opt-in")
if 'interactive clickable audit requires explicit --allow-indexes from a reviewed dry-run report' not in script:
    raise SystemExit("interactive audit must require a reviewed candidate index allowlist")
if 'parseAllowedIndexes(options.allowIndexes)' not in script:
    raise SystemExit("interactive audit must parse explicit candidate indexes")
if "const mayDispatchInput = interact && !dryRun;" not in script:
    raise SystemExit("clickable audit must derive all input dispatch permission from interact and dryRun")
if "collectExpression({ allowRoute, allowStatefulControls, markNodes: mayDispatchInput })" not in script:
    raise SystemExit("dry-run inventory must not attach temporary DOM markers")
if "if (mayDispatchInput) {\n      await pressEscape(session);" not in script:
    raise SystemExit("Escape dispatch must be guarded by mayDispatchInput")
match = re.search(r"if \(dryRun\) \{(?P<body>.*?)\n    \}\n\n    for \(const candidate of safeCandidates\)", script, re.S)
if not match:
    raise SystemExit("dry-run branch must remain before the clickable audit loop")
dry_run_body = match.group("body")
for forbidden in ["pressEscape(", "clickExpression(", "dragAt(", "cleanupAuditMarkers("]:
    if forbidden in dry_run_body:
        raise SystemExit(f"dry-run branch must not call {forbidden}")
for required in ["專案", "project", "工作區", "workspace", "側邊欄", "sidebar", "關閉", "close", "權限", "permission", "授權", "authorize", "移除", "remove", "archive", "封存", "刪除", "delete"]:
    if required not in script:
        raise SystemExit(f"clickable audit risk dictionary must include {required}")
if "workspace-or-sidebar-state" not in script:
    raise SystemExit("project, workspace, sidebar, and close actions must stay in a non-click risk bucket")
if "permission-or-external" not in script:
    raise SystemExit("permission and external account actions must stay in a non-click risk bucket")
if "stateRiskOf(kind)" not in script:
    raise SystemExit("clickable audit must classify dynamic top/sidebar/popover/right-panel surfaces as stateful")
if "allowStatefulControls ? \"\" : \"new-task-route\"" not in script:
    raise SystemExit("stateful new-task route controls must require explicit stateful opt-in")
if "allowStatefulControls ? \"\" : \"workspace-or-sidebar-state\"" not in script:
    raise SystemExit("workspace/sidebar controls must require explicit stateful opt-in")
if "allowStatefulControls ? \"\" : kind + \"-state\"" not in script:
    raise SystemExit("dynamic native surfaces must require explicit stateful opt-in")
if "safe: !risk &&" not in script:
    raise SystemExit("route-changing candidates must not become safe via allowRoute")
if ".filter((item) => item.safe && (!mayDispatchInput || allowedIndexes.has(item.index)))" not in script:
    raise SystemExit("interactive audit must only click reviewed safe candidate indexes")
PY

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
control_renderer = (root / "assets" / "renderer-control.js").read_text(encoding="utf-8")
for forbidden in ["fetch(", "WebSocket", "eval(", "Function(", "child_process"]:
    if forbidden in control_renderer:
        raise SystemExit(f"control renderer must not include live side-effect path: {forbidden}")
for marker in [
    "codex-interface-theme-control-workbench",
    "navigator.clipboard.writeText",
    "plan only; no shell execution from renderer",
    "data-codex-interface-theme",
    "control-only",
    "carrier-only\", \"framework-only\", \"control-only\", \"visual",
    "verifyLocalControlClicks",
]:
    if marker not in control_renderer:
        raise SystemExit(f"control renderer missing safety marker: {marker}")
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
for scenario_name in ["default-theme", "active-theme", "framework-only", "carrier-only", "control-only", "source-preview-quarantine", "composer-shell", "table-flip-enabled", "table-flip-disabled", "button-glyphs-disabled", "asset-budget", "retained-source-assets", "archive-candidates"]:
    if matrix_rows[scenario_name]["status"] != "passed":
        raise SystemExit(f"module matrix scenario must pass: {scenario_name}")
if module_matrix["plans"]["activeTheme"]["modules"]["tableFlipCatLoad"] != "static-cache-click":
    raise SystemExit("module matrix must confirm click-time static-cache table flip loading")
if module_matrix["plans"]["activeTheme"]["payloadBytes"] <= 0:
    raise SystemExit("module matrix must report a positive active payload size")
if len(module_matrix["retainedSourceAssets"]) != 10:
    raise SystemExit("module matrix must classify the ten retained source assets")
for archive_candidate in module_matrix["archiveCandidates"]:
    archive_path = archive_candidate["path"]
    retired_background = "-".join(["matrix", "cyberpunk", "orange", "cat"])
    if archive_path.startswith("/") or retired_background in archive_path:
        raise SystemExit(f"module matrix archive candidate must be public-safe: {archive_path}")
PY

printf '[codex-interface-theme] tests passed\n'
