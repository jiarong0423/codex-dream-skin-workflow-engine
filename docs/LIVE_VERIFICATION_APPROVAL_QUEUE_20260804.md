# Live Verification Approval Queue 2026-08-04

This queue is the approval boundary before Codex Dream Skin moves from
`STATIC_GATE` to `APPLY_ONCE` and `VISUAL_GATE`.

## Plain Summary

目前靜態 gate 已經過了。剩下不是「能不能跑」，而是「你要放行哪個 live 範圍」：

- A 段：只讀 live 掃描，連 CDP 但不 apply、不 click、不 drag。
- B 段：簡易 one-shot 注入，會把主題套到目前 Codex renderer。
- C 段：restore/verify，確認可回復且沒有殘留。
- D 段：control-only local click proof，只在控制工作台內做明確範圍的 local click 驗證。

沒有你的明確放行前，B/C/D 不執行。

## Approval Matrix

| Step | Command | Live CDP | Applies Theme | Clicks/Drags | Decision |
| --- | --- | ---: | ---: | ---: | --- |
| A1 read-only dynamic scan | `bash macos/scripts/dynamic-boundary-readonly-gate.sh --port 9341 --out-dir /tmp/codex-interface-theme-dynamic-boundary-evidence --samples 3 --interval-ms 700 --allow-stateful-controls false` | yes | no | no | pending approval |
| A2 summary viewer local file | `bash macos/scripts/open-dynamic-boundary-summary-viewer.sh --open true` | no | no | no | pending local-file review |
| B1 one-shot visual apply | `bash macos/scripts/start.sh --no-launch --once --port 9341 --wait-ms 8000` | yes | yes | no | pending approval |
| C1 verify residue/restore state | `bash macos/scripts/verify.sh --port 9341` | yes | no | no | pending approval |
| C2 restore if needed | `bash macos/scripts/restore.sh --port 9341` | yes | restore only | no | pending approval |
| D1 control-only proof | `bash macos/scripts/atomic-ui-automation-gate.sh --port 9341 --out-dir /tmp/codex-interface-theme-control-only-evidence --wait-ms 8000 --load-mode control-only --launch-if-missing false --interact false --allow-stateful-controls false --auto-allowlist false --verify-local-control-clicks true --drag false` | yes | control-only | scoped local clicks only | pending approval |

## Acceptance Evidence

| Requirement | Evidence Needed |
| --- | --- |
| left sidebar rows have no duplicate capsule stack | screenshot or DOM/style evidence after B1 |
| account/menu rows use one shell plus faint state only | screenshot or DOM/style evidence after B1 |
| workspace/attachment picker remains owner-scoped | A1 inventory plus screenshot after B1 |
| right panel is not detected by fixed coordinates | A1 dynamic-boundary report confirms owner/source classification |
| browser/source/preview blocks are protected | A1 report contains source-preview lock and no repaint action |
| character retreat does not flicker from self-clearing rect | visual observation or screenshot sequence after B1 |
| hot-swap control stays low-interference | screenshot after B1 |
| restore has no residue | C1/C2 verify output |

## Stop Rules

Stop immediately if any live proof shows:

- a protected preview, browser, iframe, canvas, video, drag, resize, source, or
  permission surface received visual repaint;
- a right-panel surface is classified by fixed coordinates instead of owner,
  role, state, text-safe label, structural parent, layer stack, or protected
  media signal;
- character retreat toggles repeatedly from its own hidden geometry;
- restore cannot remove theme-owned nodes or namespaced markers;
- any live step clicks or drags outside its explicitly scoped control-only
  local workbench boundary.

## Current Static Proof

- `bash .agents/skills/codex-dream-skin-workflow/scripts/workflow-gate.sh --runtime`: passed.
- `bash macos/tests/run-tests.sh`: passed.
- `node macos/scripts/module-matrix.mjs --state-dir /tmp/codex-interface-theme-test-state --assets-dir macos/assets --format text`: passed.
- `node macos/scripts/visual-layer-governance-contract.mjs --format text`: passed.
- `git diff --check`: passed.

## Current Decision

Hold at `STATIC_GATE`.

## 2026-08-04 Full Q5 Attempt

User selected: `Full Q5`.

Execution stopped before live scan because no CDP renderer was available:

- A1 read-only dynamic scan:
  - command: `bash macos/scripts/dynamic-boundary-readonly-gate.sh --port
    9341 --out-dir /tmp/codex-interface-theme-dynamic-boundary-evidence
    --samples 3 --interval-ms 700 --allow-stateful-controls false`
  - result: blocked.
  - evidence: `CDP port 127.0.0.1:9341 is not open; read-only gate refuses to
    launch or restart Codex`.
- CDP launch-only attempt:
  - command: `bash macos/scripts/start.sh --launch-only --port 9341 --wait-ms
    20000`
  - result: blocked.
  - evidence: `Codex is already running. Close it first or pass --restart.`

Current decision after this attempt:

- Do not restart Codex automatically.
- Full Q5 now requires one of:
  - user manually closes Codex, then rerun launch-only plus Full Q5;
  - explicit approval to restart Codex with CDP, then rerun Full Q5.

Next allowed movement requires explicit approval for one of:

- A only: read-only live scan.
- A plus B plus C: live scan, one-shot apply, verify/restore.
- Full Q5: A, B, C, and D.

## 2026-08-04 Full Q5 Live Result

User selected: `Full Q5`, then manually reopened Codex with CDP available.

Result:

- A1 read-only dynamic scan: passed after scanner correction.
  - evidence: `/tmp/codex-interface-theme-dynamic-boundary-evidence-final2/06-summary.txt`.
  - summary: `ok=true`, `locks=6/7`, `acceptedLocks=7/7`,
    `missing=none`, `absent=projectPanelRows`.
  - interpretation: `projectPanelRows` is conditionally absent because the
    visible route/window state did not expose a project/right panel row.
  - black shell proof: `blackShellTransparency detected=7 inventory=7`.
- B1 one-shot visual apply: passed.
  - command: `bash macos/scripts/start.sh --no-launch --once --port 9341
    --wait-ms 8000`.
  - result: `ok=true`, revision `21ca150b8b38fa68`, two renderer targets
    accepted.
- C1/C2 verify and restore: passed.
  - apply verify screenshot:
    `/tmp/codex-interface-theme-full-q5-after-apply.png`.
  - after restore: both targets reported `active=false`, `hasStyle=false`,
    `hasMarker=false`, `hasBackdrop=false`, `hasRightHud=false`,
    `hasCharacter=false`.
  - final restore-state screenshot:
    `/tmp/codex-interface-theme-full-q5-final-state.png`.
- D1 control-only local proof: passed after verifier correction.
  - evidence:
    `/tmp/codex-interface-theme-control-only-evidence-rerun2/05-control-workbench-verify.txt`.
  - summary: `ok=true`, `scanned=2`, both Codex targets passed.
  - restore evidence:
    `/tmp/codex-interface-theme-control-only-evidence-rerun2/11-restore.json`.

Corrections made during Full Q5:

- `live-clickable-surface-audit.mjs`: dry-run screenshot timeout now writes a
  warning and still emits JSON evidence.
- `atomic-ui-automation-gate.sh`: control-only apply now routes verification
  through control workbench evidence instead of failing on visual-theme checks.
- `renderer-control.js`: safety status text contains the exact machine-readable
  phrase `plan only; no shell execution from renderer`.
- `control-workbench-live-verify.mjs`: avatar overlay screenshot timeout is
  warning-only; primary target remains strict.
- `interface-field-inventory.mjs`: read-only inventory now samples visible
  near-black native shell layers as `black-shell`.
- `dynamic-boundary-artifact-summary.mjs`: conditionally absent
  `projectPanelRows` no longer blocks a route where that panel is not present;
  `blackShellTransparency` remains a blocking required live lock.

Current decision:

- Full Q5 live proof is complete for the currently visible Codex state.
- Package/stage/commit/cleanup are still not approved.
- Large-character collision and opened-right-panel project row visual proof
  remain next-route checks, not blockers for the current Full Q5 state.

## 2026-08-04 Right Panel And Collision Proof

User approved running the remaining checks.

Result:

- Opened right panel state is now live-proven.
  - apply revision: `266bfc66a1e80ff6`.
  - verify screenshot:
    `/tmp/codex-interface-theme-after-collision-fix-rerun.png`.
  - verify summary: `projectPanels=2`, `buttonProjectPanelRows=13`,
    `rightMajorPanel=false`.
  - dynamic evidence:
    `/tmp/codex-interface-theme-right-panel-collision-evidence-rerun/06-summary.txt`.
  - dynamic summary: `ok=true`, `locks=7/7`, `acceptedLocks=7/7`,
    `missing=none`, `absent=none`, `projectPanelRows detected=15`.
- Character collision retreat is now source-fixed and live-checked.
  - `theme-kernel.css` and `theme.css` retreat are opacity-only; no
    translate/scale self-clearing rect.
  - `renderer-inject.js` scans readable text owner nodes instead of broad main
    width and requires consecutive clear samples before releasing retreat.
  - primary Codex verify: `characterRetreat=none`, `characterOpacity=1`.
  - avatar overlay verify: `characterRetreat=narrow`, `characterOpacity=0`.
- Scanner dry-run serialization was corrected.
  - direct cause: `draggable` could contain a DOM element from
    `node.closest(...)`, causing JSON stringify to fail with
    `Object reference chain is too long`.
  - fix: `draggable` is now serialized as a boolean.
- Restore after live proof passed.
  - restore result: both targets `removed=true`, `fallback=true`.
  - after-restore verify screenshot:
    `/tmp/codex-interface-theme-after-collision-fix-restore.png`.
  - after-restore state: `active=false`, `hasStyle=false`,
    `hasMarker=false`, `hasBackdrop=false`, `hasRightHud=false`,
    `hasCharacter=false`.
