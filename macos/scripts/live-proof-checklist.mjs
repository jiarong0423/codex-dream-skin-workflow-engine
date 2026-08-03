#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

function usage() {
  return `Usage:
  live-proof-checklist.mjs [--root <path>] [--evidence-dir <path>] [--format text|json]

Builds the remaining proof checklist for the atomic control and dynamic boundary
workflow. This script is offline only. It reads local files and optional
evidence files, but does not launch Codex, connect to CDP, click, drag, apply,
restore, or mutate live UI.`;
}

function parseArgs(argv) {
  const options = { format: "text" };
  for (let index = 2; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === "--help" || key === "-h") {
      options.help = true;
      continue;
    }
    if (!key.startsWith("--")) {
      throw new Error(`unexpected argument: ${key}`);
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`missing value for ${key}`);
    }
    options[key.slice(2)] = value;
    index += 1;
  }
  return options;
}

function exists(filePath) {
  return fs.existsSync(filePath);
}

function readJsonIfExists(filePath) {
  if (!exists(filePath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function fileRecord(rootDir, relativePath) {
  const absolutePath = path.join(rootDir, relativePath);
  return {
    relativePath,
    absolutePath,
    exists: exists(absolutePath)
  };
}

function proofStatus(requiredFiles) {
  return requiredFiles.every((item) => item.exists) ? "evidence-present" : "pending-live-approval";
}

function buildReport(options) {
  const scriptDir = path.dirname(new URL(import.meta.url).pathname);
  const rootDir = path.resolve(options.root || path.join(scriptDir, ".."));
  const evidenceDir = options["evidence-dir"] ? path.resolve(options["evidence-dir"]) : "";
  const staticFiles = [
    "scripts/dynamic-boundary-readonly-gate.sh",
    "scripts/dynamic-boundary-artifact-summary.mjs",
    "previews/dynamic-boundary-summary-viewer.html",
    "scripts/open-dynamic-boundary-summary-viewer.sh",
    "scripts/atomic-control-plan.mjs",
    "scripts/control-workbench-live-verify.mjs",
    "scripts/atomic-ui-automation-gate.sh",
    "scripts/asset-mount-summary.mjs",
    "assets/runtime-modules.json",
    "assets/atomic-control-schema.json",
    "assets/atomic-control-assets.json",
    "previews/atomic-control-workbench.html"
  ].map((relativePath) => fileRecord(rootDir, relativePath));

  const dynamicSummary = evidenceDir ? readJsonIfExists(path.join(evidenceDir, "06-summary.json")) : null;
  const dynamicInventory = evidenceDir ? readJsonIfExists(path.join(evidenceDir, "04-interface-field-inventory.json")) : null;
  const clickableAudit = evidenceDir ? readJsonIfExists(path.join(evidenceDir, "05-clickable-dry-run", "clickable-surface-audit.json")) : null;
  const controlVerify = evidenceDir ? readJsonIfExists(path.join(evidenceDir, "control-workbench-live-verify.json")) : null;

  const dynamicEvidenceFiles = evidenceDir
    ? [
      fileRecord(evidenceDir, "06-summary.json"),
      fileRecord(evidenceDir, "04-interface-field-inventory.json"),
      fileRecord(evidenceDir, path.join("05-clickable-dry-run", "clickable-surface-audit.json"))
    ]
    : [];
  const controlEvidenceFiles = evidenceDir
    ? [fileRecord(evidenceDir, "control-workbench-live-verify.json")]
    : [];

  const requiredProofs = [
    {
      id: "readOnlyDynamicScan",
      label: "Read-only dynamic boundary scan",
      status: evidenceDir ? proofStatus(dynamicEvidenceFiles) : "pending-live-approval",
      command: "bash macos/scripts/dynamic-boundary-readonly-gate.sh --port 9341 --out-dir /tmp/codex-interface-theme-dynamic-boundary-evidence --samples 3 --interval-ms 700 --allow-stateful-controls false",
      requiresApproval: true,
      mutates: false,
      launches: false,
      clicks: false,
      drags: false,
      expectedEvidence: dynamicEvidenceFiles.map((item) => item.relativePath),
      checks: {
        summaryMode: dynamicSummary && dynamicSummary.mode ? dynamicSummary.mode : "",
        missingLocks: dynamicSummary && Array.isArray(dynamicSummary.missingLocks) ? dynamicSummary.missingLocks.length : null,
        inventoryPresent: Boolean(dynamicInventory),
        clickableDryRunPresent: Boolean(clickableAudit)
      }
    },
    {
      id: "summaryViewerReview",
      label: "Offline dynamic boundary summary viewer review",
      status: dynamicSummary ? "evidence-present" : "pending-local-file-review",
      command: "bash macos/scripts/open-dynamic-boundary-summary-viewer.sh --open true",
      requiresApproval: true,
      mutates: false,
      launches: false,
      clicks: false,
      drags: false,
      expectedEvidence: ["manual confirmation that 06-summary.json loads in the offline viewer"],
      checks: {
        viewerFile: exists(path.join(rootDir, "previews", "dynamic-boundary-summary-viewer.html")),
        usesLocalFileOnly: true
      }
    },
    {
      id: "controlOnlyLiveClickableProof",
      label: "Control-only local clickable proof",
      status: evidenceDir ? proofStatus(controlEvidenceFiles) : "pending-live-approval",
      command: "bash macos/scripts/atomic-ui-automation-gate.sh --port 9341 --out-dir /tmp/codex-interface-theme-control-only-evidence --wait-ms 8000 --load-mode control-only --launch-if-missing false --interact false --allow-stateful-controls false --auto-allowlist false --verify-local-control-clicks true --drag false",
      requiresApproval: true,
      mutates: true,
      launches: false,
      clicks: true,
      drags: false,
      expectedEvidence: controlEvidenceFiles.map((item) => item.relativePath),
      checks: {
        controlVerifyPresent: Boolean(controlVerify),
        clickScope: "theme-owned control workbench only"
      }
    },
    {
      id: "restoreOrNoResidue",
      label: "Restore or no-residue verification",
      status: "pending-live-approval",
      command: "bash macos/scripts/verify.sh --port 9341",
      requiresApproval: true,
      mutates: false,
      launches: false,
      clicks: false,
      drags: false,
      expectedEvidence: ["verification output confirms no unwanted visual residue after the approved pass"],
      checks: {
        restoreScriptPresent: exists(path.join(rootDir, "scripts", "restore.sh")),
        verifyScriptPresent: exists(path.join(rootDir, "scripts", "verify.sh"))
      }
    }
  ];

  const missingStaticFiles = staticFiles.filter((item) => !item.exists);
  const evidencePassed = requiredProofs.every((proof) => proof.status === "evidence-present");

  return {
    ok: missingStaticFiles.length === 0,
    mode: "offline-live-proof-checklist",
    completionReady: missingStaticFiles.length === 0 && evidencePassed,
    mutates: false,
    launches: false,
    applies: false,
    clicks: false,
    drags: false,
    connectsToCdp: false,
    rootDir,
    evidenceDir,
    staticFiles,
    missingStaticFiles,
    requiredProofs,
    blockedBy: requiredProofs
      .filter((proof) => proof.status !== "evidence-present")
      .map((proof) => ({
        id: proof.id,
        status: proof.status,
        reason: proof.requiresApproval ? "requires explicit live or GUI approval" : "missing evidence"
      })),
    nextCommand: requiredProofs.find((proof) => proof.status !== "evidence-present")?.command || ""
  };
}

function main() {
  const options = parseArgs(process.argv);
  if (options.help) {
    console.log(usage());
    return;
  }
  const report = buildReport(options);
  if (options.format === "json") {
    console.log(JSON.stringify(report, null, 2));
  } else if (options.format === "text") {
    console.log("[codex-interface-theme] offline live proof checklist");
    console.log(`ok=${report.ok}`);
    console.log(`mode=${report.mode}`);
    console.log(`completionReady=${report.completionReady}`);
    console.log(`mutates=${report.mutates}`);
    console.log(`launches=${report.launches}`);
    console.log(`applies=${report.applies}`);
    console.log(`clicks=${report.clicks}`);
    console.log(`drags=${report.drags}`);
    console.log(`connectsToCdp=${report.connectsToCdp}`);
    console.log(`staticFiles=${report.staticFiles.length}`);
    console.log(`missingStaticFiles=${report.missingStaticFiles.length}`);
    for (const proof of report.requiredProofs) {
      console.log(`proof=${proof.id} status=${proof.status} command=${proof.command}`);
    }
    if (report.nextCommand) {
      console.log(`nextCommand=${report.nextCommand}`);
    }
  } else {
    throw new Error(`unknown format: ${options.format}`);
  }
  if (!report.ok) {
    process.exit(1);
  }
}

try {
  main();
} catch (error) {
  console.error(`[codex-interface-theme][live-proof-checklist] ${error.message}`);
  process.exit(1);
}
