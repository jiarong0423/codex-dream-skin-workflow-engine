#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." >/dev/null 2>&1 && pwd)"
source "$ROOT_DIR/scripts/common.sh"

APP_PATH="$(cit_detect_app_or_die)"
NODE_PATH="$(cit_node_for_app "$APP_PATH")"
PYTHON_PATH="${PYTHON_PATH:-python3}"

CLICKABLE_AUDIT="$ROOT_DIR/scripts/live-clickable-surface-audit.mjs"
DERIVE_ALLOWLIST="$ROOT_DIR/scripts/derive-clickable-allowlist.mjs"
SAFE_LIVE_GATE="$ROOT_DIR/scripts/safe-live-visual-gate.sh"
ATOMIC_UI_GATE="$ROOT_DIR/scripts/atomic-ui-automation-gate.sh"
INTERFACE_INVENTORY="$ROOT_DIR/scripts/interface-field-inventory.mjs"
SURFACE_REGISTRY="$ROOT_DIR/assets/surface-registry.js"
RUNTIME_MANIFEST="$ROOT_DIR/assets/runtime-modules.json"

bash -n "$SAFE_LIVE_GATE"
bash -n "$ATOMIC_UI_GATE"
"$NODE_PATH" --check "$CLICKABLE_AUDIT"
"$NODE_PATH" --check "$DERIVE_ALLOWLIST"
"$NODE_PATH" --check "$INTERFACE_INVENTORY"
"$NODE_PATH" --check "$SURFACE_REGISTRY"

grep -q 'drag-skipped' "$CLICKABLE_AUDIT" || cit_die "clickable audit must record skipped high-memory drag candidates"
grep -q 'byDragRisk' "$INTERFACE_INVENTORY" || cit_die "interface inventory must report drag risk buckets"
grep -q 'high-memory-image-resize' "$SURFACE_REGISTRY" || cit_die "surface registry must mark high-memory preview drag risk"
grep -q '"sourcePreviewBlocks"' "$RUNTIME_MANIFEST" || cit_die "runtime manifest must declare source preview block ownership"
grep -q '"sourcePreviewQuarantine"' "$RUNTIME_MANIFEST" || cit_die "runtime manifest must declare source preview quarantine ownership"
grep -q 'does not drag' "$RUNTIME_MANIFEST" || cit_die "runtime manifest must document no-drag source preview policy"

grep -q -- '--no-launch' "$SAFE_LIVE_GATE" || cit_die "safe live visual gate must never launch Codex by default"
grep -q -- '--once' "$SAFE_LIVE_GATE" || cit_die "safe live visual gate must use one-shot apply"
grep -q 'restore_if_needed' "$SAFE_LIVE_GATE" || cit_die "safe live visual gate must restore on interrupted apply"
grep -q 'CDP port 127.0.0.1:.*refusing to launch or restart Codex' "$SAFE_LIVE_GATE" || cit_die "safe live visual gate must fail closed when CDP is unavailable"
if grep -q -- '--simulate-table-flip\|live-clickable-surface-audit' "$SAFE_LIVE_GATE"; then
  cit_die "safe live visual gate must not simulate clicks or run clickable audit"
fi
grep -q -- '--no-launch' "$ATOMIC_UI_GATE" || cit_die "atomic UI gate must never launch Codex"
grep -q -- '--once' "$ATOMIC_UI_GATE" || cit_die "atomic UI gate must use one-shot apply"
grep -q -- '--carrier-only' "$ATOMIC_UI_GATE" || cit_die "atomic UI gate must support carrier-only mode"
grep -q -- '--launch-if-missing' "$ATOMIC_UI_GATE" || cit_die "atomic UI gate must expose explicit launch-if-missing mode"
grep -q -- '--launch-only' "$ATOMIC_UI_GATE" || cit_die "atomic UI gate must launch CDP without applying a theme first"
grep -q 'Codex is already running without CDP' "$ATOMIC_UI_GATE" || cit_die "atomic UI gate must refuse to restart a running non-CDP app"
grep -q 'refusing to restart' "$ATOMIC_UI_GATE" || cit_die "atomic UI gate must explicitly refuse restart during launch-if-missing"
grep -q 'interface-field-inventory.mjs' "$ATOMIC_UI_GATE" || cit_die "atomic UI gate must run interface inventory"
grep -q 'live-clickable-surface-audit.mjs' "$ATOMIC_UI_GATE" || cit_die "atomic UI gate must run clickable inventory"
grep -q -- '--dry-run true' "$ATOMIC_UI_GATE" || cit_die "atomic UI gate must always run a dry-run clickable inventory"
grep -q 'interactive atomic automation requires explicit --allow-indexes or --auto-allowlist true' "$ATOMIC_UI_GATE" || cit_die "atomic UI gate must require reviewed or derived allow indexes for interaction"
grep -q -- '--auto-allowlist true' "$ATOMIC_UI_GATE" || cit_die "atomic UI gate must support derived automatic allowlists"
grep -q 'derive-clickable-allowlist.mjs' "$ATOMIC_UI_GATE" || cit_die "atomic UI gate must derive reviewed allowlists from dry-run reports"
grep -q 'CDP port 127.0.0.1:.*refusing to launch or restart Codex' "$ATOMIC_UI_GATE" || cit_die "atomic UI gate must fail closed when CDP is unavailable"
grep -q 'restore_if_needed' "$ATOMIC_UI_GATE" || cit_die "atomic UI gate must restore on interrupted apply"
grep -q 'control-only verify requires style and marker before workbench verification' "$ATOMIC_UI_GATE" || cit_die "atomic UI gate must route control-only verify through the workbench verifier"

grep -q 'HARD_DENY_RISK' "$DERIVE_ALLOWLIST" || cit_die "allowlist derivation must use hard risk denial"
grep -q 'HARD_DENY_LABEL' "$DERIVE_ALLOWLIST" || cit_die "allowlist derivation must use hard label denial"
grep -q 'high-memory-image-resize' "$DERIVE_ALLOWLIST" || cit_die "allowlist derivation must refuse high-memory resize candidates"
grep -q 'source-preview' "$DERIVE_ALLOWLIST" || cit_die "allowlist derivation must refuse source preview candidates"

"$PYTHON_PATH" - "$CLICKABLE_AUDIT" <<'PY'
import pathlib
import re
import sys

script = pathlib.Path(sys.argv[1]).read_text(encoding="utf-8")

required_literals = [
    ('dryRun: "true"', "clickable audit must default to dry-run mode"),
    ('interact: "false"', "clickable audit must default to non-interactive mode"),
    ('allowStatefulControls: "false"', "clickable audit must default stateful UI controls to report-only"),
    ("interactive clickable audit requires --interact true --dry-run false", "interactive audit must require explicit interact and dry-run opt-out"),
    ("interactive clickable audit requires explicit --allow-indexes from a reviewed dry-run report", "interactive audit must require a reviewed candidate index allowlist"),
    ("parseAllowedIndexes(options.allowIndexes)", "interactive audit must parse explicit candidate indexes"),
    ("const mayDispatchInput = interact && !dryRun;", "all input dispatch permission must derive from interact and dryRun"),
    ("collectExpression({ allowRoute, allowStatefulControls, markNodes: mayDispatchInput })", "dry-run inventory must not attach temporary DOM markers"),
    ("if (mayDispatchInput) {\n      await pressEscape(session);", "Escape dispatch must be guarded by mayDispatchInput"),
    (".filter((item) => item.safe && (!mayDispatchInput || allowedIndexes.has(item.index)))", "interactive audit must click only reviewed safe candidate indexes"),
]
for literal, message in required_literals:
    if literal not in script:
        raise SystemExit(message)

dry_run_match = re.search(r"if \(dryRun\) \{(?P<body>.*?)\n    \}\n\n    for \(const candidate of safeCandidates\)", script, re.S)
if not dry_run_match:
    raise SystemExit("dry-run branch must remain before the clickable audit loop")
dry_run_body = dry_run_match.group("body")
for forbidden_call in ["pressEscape(", "clickExpression(", "dragAt(", "cleanupAuditMarkers("]:
    if forbidden_call in dry_run_body:
        raise SystemExit(f"dry-run branch must not call {forbidden_call}")

risk_match = re.search(r"function riskOf\(label, node\) \{(?P<body>.*?)\n    \}", script, re.S)
if not risk_match:
    raise SystemExit("clickable audit must keep an explicit riskOf function")
risk_body = risk_match.group("body")
required_risk_terms = [
    "送出", "submit", "send message", "stop generating",
    "新聊天", "new chat", "new task", "new conversation",
    "專案", "project", "工作區", "workspace", "側邊欄", "sidebar", "關閉", "close",
    "送交", "推送", "push", "commit", "merge", "create pull request",
    "建立", "create", "復原", "還原", "undo", "restore", "revert", "套用", "apply",
    "核准", "approve", "authorize", "確認", "confirm", "執行", "run",
    "刪除", "delete", "trash", "移除", "remove", "archive", "封存", "登出", "logout", "sign out",
    "安裝", "install", "權限", "permission", "授權", "grant", "允許", "allow",
    "登入", "login", "sign in", "訂閱", "subscribe", "付款", "pay", "buy", "購買",
]
for term in required_risk_terms:
    if term not in risk_body:
        raise SystemExit(f"clickable audit risk dictionary must include {term}")

required_risk_buckets = [
    "composer-action",
    "new-task-route",
    "workspace-or-sidebar-state",
    "write-action",
    "destructive-or-session",
    "permission-or-external",
]
for bucket in required_risk_buckets:
    if bucket not in risk_body:
        raise SystemExit(f"clickable audit must keep risk bucket {bucket}")

state_risk_match = re.search(r"function stateRiskOf\(kind\) \{(?P<body>.*?)\n    \}", script, re.S)
if not state_risk_match:
    raise SystemExit("clickable audit must keep stateRiskOf for dynamic native surfaces")
state_risk_body = state_risk_match.group("body")
for state_kind in ["source-preview", "navigation", "sidebar", "top-toolbar", "popover", "right-panel"]:
    if state_kind not in state_risk_body:
        raise SystemExit(f"stateful surface kind must remain report-only by default: {state_kind}")

if "safe: !risk &&" not in script:
    raise SystemExit("candidate safety must depend on absence of risk")
if "allowStatefulControls ? \"\" : \"new-task-route\"" not in script:
    raise SystemExit("stateful new-task route controls must require explicit stateful opt-in")
if "allowStatefulControls ? \"\" : \"workspace-or-sidebar-state\"" not in script:
    raise SystemExit("workspace/sidebar controls must require explicit stateful opt-in")
if "allowStatefulControls ? \"\" : kind + \"-state\"" not in script:
    raise SystemExit("dynamic native surfaces must require explicit stateful opt-in")
if "autoDragSafe: draggable && dragRisk !== \"high-memory-image-resize\"" not in script:
    raise SystemExit("high-memory image resize surfaces must not become auto-drag safe")
if "type: \"drag-skipped\"" not in script:
    raise SystemExit("unsafe drag candidates must be recorded instead of dragged")
if "node.dispatchEvent(new PointerEvent" not in script or "node.click();" not in script:
    raise SystemExit("interactive click path must remain explicit and therefore gateable")
if script.count("mayDispatchInput") < 4:
    raise SystemExit("input dispatch gating must stay centralized on mayDispatchInput")
PY

ALLOWLIST_FIXTURE="/tmp/codex-interface-theme-allowlist-fixture.json"
ALLOWLIST_OUTPUT="/tmp/codex-interface-theme-allowlist-output.json"
"$PYTHON_PATH" - "$ALLOWLIST_FIXTURE" <<'PY'
import json
import pathlib
import sys

fixture = {
    "ok": True,
    "dryRun": True,
    "candidates": [
        {"index": 0, "kind": "general", "label": "Open menu", "risk": "", "safe": True, "draggable": False, "dragRisk": "", "autoDragSafe": False},
        {"index": 1, "kind": "sidebar", "label": "專案", "risk": "sidebar-state", "safe": False, "draggable": False, "dragRisk": "", "autoDragSafe": False},
        {"index": 2, "kind": "general", "label": "刪除", "risk": "destructive-or-session", "safe": False, "draggable": False, "dragRisk": "", "autoDragSafe": False},
        {"index": 3, "kind": "general", "label": "建立 Pull Request", "risk": "write-action", "safe": False, "draggable": False, "dragRisk": "", "autoDragSafe": False},
        {"index": 4, "kind": "general", "label": "允許權限", "risk": "permission-or-external", "safe": False, "draggable": False, "dragRisk": "", "autoDragSafe": False},
        {"index": 5, "kind": "source-preview", "label": "source preview sample", "risk": "", "safe": True, "draggable": True, "dragRisk": "high-memory-image-resize", "autoDragSafe": False},
    ],
}
pathlib.Path(sys.argv[1]).write_text(json.dumps(fixture, ensure_ascii=False), encoding="utf-8")
PY
"$NODE_PATH" "$DERIVE_ALLOWLIST" \
  --report "$ALLOWLIST_FIXTURE" \
  --out "$ALLOWLIST_OUTPUT" \
  --include-stateful true \
  --format json >/dev/null
"$PYTHON_PATH" - "$ALLOWLIST_OUTPUT" <<'PY'
import json
import pathlib
import sys

output = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))
if output["indexes"] != [0, 1]:
    raise SystemExit(f"derived allowlist should include only safe and opted-in stateful indexes: {output['indexes']}")
skipped = {entry["index"]: entry["reason"] for entry in output["skipped"]}
for index in [2, 3, 4, 5]:
    if index not in skipped:
        raise SystemExit(f"unsafe fixture index was not skipped: {index}")
PY

printf '[codex-interface-theme] interaction safety rules passed\n'
