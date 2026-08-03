#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
REPORT="$(node "$ROOT/macos/scripts/target-mode-worktree-audit.mjs" --format json)"

node -e '
const report = JSON.parse(process.argv[1]);
const expectedControls = ["mutates", "deletes", "restores", "launches", "connectsToCdp", "appliesTheme", "clicks", "drags"];
if (report.ok !== true || report.mode !== "target-mode-worktree-audit") {
  throw new Error("target mode audit did not report a valid read-only result");
}
if (report.requiresExplicitPathApproval !== true) {
  throw new Error("target mode audit must require exact path approval");
}
for (const name of expectedControls) {
  if (report.controls[name] !== false) {
    throw new Error(`target mode audit must keep ${name}=false`);
  }
}
for (const key of ["trackedChanges", "untrackedSource", "auditEvidence", "recoveryQuarantine", "metadataCandidates", "emptyAuditDirectories", "unknownUntracked"]) {
  if (!report.inventory[key]) {
    throw new Error(`target mode audit missing inventory group: ${key}`);
  }
}
if (report.inventory.metadataCandidates.items.some((item) => String(item.path || "").startsWith(".target-mode-quarantine/"))) {
  throw new Error("target mode audit must not reclassify quarantined metadata as cleanup candidates");
}
if (report.cleanupPlan.execution !== "not-requested" || report.cleanupPlan.approvedPaths.length !== 0) {
  throw new Error("target mode audit must not prepare an executable cleanup plan");
}
const states = Object.fromEntries(report.states.map((state) => [state.id, state.status]));
if (states.T0 !== "O" || states.T1 !== "O" || states.T2 !== "O" || states.T3 !== "△" || states.T4 !== "△" || states.T5 !== "△") {
  throw new Error("target mode audit state machine does not match the O/△/X contract");
}
' "$REPORT"

printf '[codex-interface-theme] target mode worktree audit passed\n'
