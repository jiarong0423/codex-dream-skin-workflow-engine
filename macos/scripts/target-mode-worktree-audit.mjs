#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { lstatSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const PREVIEW_ROOT = path.join(ROOT, "macos", "previews");
const FORMAT_VALUES = new Set(["text", "json"]);

function usage() {
  return [
    "Usage: node macos/scripts/target-mode-worktree-audit.mjs [--format text|json]",
    "",
    "Read-only worktree inventory for target mode.",
    "It never deletes, restores, launches, injects, clicks, or changes UI state.",
  ].join("\n");
}

function parseArgs(argv) {
  let format = "text";

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      process.stdout.write(`${usage()}\n`);
      process.exit(0);
    }
    if (arg === "--format") {
      format = argv[index + 1] ?? "";
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!FORMAT_VALUES.has(format)) {
    throw new Error(`Unsupported format: ${format}`);
  }

  return { format };
}

function runGit(args) {
  return execFileSync("git", args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function nullSeparated(value) {
  return value.split("\0").filter(Boolean);
}

function relativePath(absolutePath) {
  return path.relative(ROOT, absolutePath).split(path.sep).join("/");
}

function fileSize(relative) {
  try {
    const stat = lstatSync(path.join(ROOT, relative));
    return stat.isFile() ? stat.size : 0;
  } catch {
    return 0;
  }
}

function summarizeFiles(paths) {
  return {
    count: paths.length,
    bytes: paths.reduce((total, item) => total + fileSize(item), 0),
    samplePaths: paths.slice(0, 12),
  };
}

function trackedChanges() {
  const records = nullSeparated(runGit(["status", "--porcelain=v1", "-z"]));
  const changes = [];

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    const status = record.slice(0, 2);
    const pathname = record.slice(3);
    if (status === "??" || status === "!!") {
      continue;
    }

    const item = { path: pathname, status };
    if (status.includes("R") || status.includes("C")) {
      item.from = records[index + 1] ?? "";
      index += 1;
    }
    changes.push(item);
  }

  return changes.sort((left, right) => left.path.localeCompare(right.path));
}

function untrackedFiles() {
  return nullSeparated(runGit(["ls-files", "--others", "--exclude-standard", "-z"])).sort();
}

function classifyUntracked(paths) {
  const groups = {
    preserveSource: [],
    retainEvidence: [],
    recoveryQuarantine: [],
    manualReview: [],
  };
  const sourceRoots = [
    "docs/",
    "macos/assets/",
    "macos/launcher/",
    "macos/scripts/",
    "macos/tests/",
    "theme-packs/",
  ];

  for (const pathname of paths) {
    if (pathname.startsWith(".target-mode-quarantine/")) {
      groups.recoveryQuarantine.push(pathname);
    } else if (pathname.startsWith("macos/previews/")) {
      groups.retainEvidence.push(pathname);
    } else if (sourceRoots.some((root) => pathname.startsWith(root))) {
      groups.preserveSource.push(pathname);
    } else {
      groups.manualReview.push(pathname);
    }
  }

  return groups;
}

function walkFinderMetadata(directory, entries) {
  const relative = relativePath(directory);
  if (relative === ".target-mode-quarantine" || relative.startsWith(".target-mode-quarantine/")) {
    return;
  }
  let children;
  try {
    children = readdirSync(directory, { withFileTypes: true });
  } catch {
    return;
  }

  for (const child of children) {
    if (child.name === ".git" || child.isSymbolicLink()) {
      continue;
    }
    const absolutePath = path.join(directory, child.name);
    if (child.isDirectory()) {
      walkFinderMetadata(absolutePath, entries);
      continue;
    }
    if (!child.isFile() || (child.name !== ".DS_Store" && !child.name.startsWith("._"))) {
      continue;
    }

    const stat = lstatSync(absolutePath);
    entries.push({
      path: relativePath(absolutePath),
      kind: child.name === ".DS_Store" ? "finder-metadata" : "apple-double-metadata",
      bytes: stat.size,
      status: "R1",
      decision: "candidate-with-explicit-path-approval",
    });
  }
}

function findEmptyAuditDirectories(directory, entries) {
  let children;
  try {
    children = readdirSync(directory, { withFileTypes: true });
  } catch {
    return;
  }

  for (const child of children) {
    if (!child.isDirectory() || child.isSymbolicLink()) {
      continue;
    }
    findEmptyAuditDirectories(path.join(directory, child.name), entries);
  }

  if (directory === PREVIEW_ROOT || children.length !== 0) {
    return;
  }
  entries.push({
    path: relativePath(directory),
    status: "R2",
    decision: "manual-review-before-archive-or-removal",
  });
}

function formatBytes(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const units = ["KiB", "MiB", "GiB"];
  let value = bytes;
  let unitIndex = -1;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[unitIndex]}`;
}

function buildReport() {
  const tracked = trackedChanges();
  const untracked = classifyUntracked(untrackedFiles());
  const metadataCandidates = [];
  walkFinderMetadata(ROOT, metadataCandidates);
  metadataCandidates.sort((left, right) => left.path.localeCompare(right.path));

  const emptyAuditDirectories = [];
  findEmptyAuditDirectories(PREVIEW_ROOT, emptyAuditDirectories);
  emptyAuditDirectories.sort((left, right) => left.path.localeCompare(right.path));

  return {
    schemaVersion: 1,
    ok: true,
    mode: "target-mode-worktree-audit",
    generatedAt: new Date().toISOString(),
    root: ROOT,
    controls: {
      mutates: false,
      deletes: false,
      restores: false,
      launches: false,
      connectsToCdp: false,
      appliesTheme: false,
      clicks: false,
      drags: false,
    },
    requiresExplicitPathApproval: true,
    states: [
      { id: "T0", status: "O", label: "read-only inventory" },
      { id: "T1", status: "O", label: "ownership classification" },
      { id: "T2", status: "O", label: "exact candidate listing" },
      { id: "T3", status: "△", label: "user-approved cleanup plan" },
      { id: "T4", status: "△", label: "isolated cleanup execution verified only in temporary fixture" },
      { id: "T5", status: "△", label: "post-clean proof verified only in temporary fixture" },
    ],
    inventory: {
      trackedChanges: {
        count: tracked.length,
        bytes: tracked.reduce((total, item) => total + fileSize(item.path), 0),
        items: tracked,
        status: "P0",
        decision: "preserve-until-reviewed",
      },
      untrackedSource: {
        ...summarizeFiles(untracked.preserveSource),
        status: "P0",
        decision: "preserve-as-source-or-test-artifact",
      },
      auditEvidence: {
        ...summarizeFiles(untracked.retainEvidence),
        status: "P1",
        decision: "retain-as-review-evidence",
      },
      recoveryQuarantine: {
        ...summarizeFiles(untracked.recoveryQuarantine),
        status: "P2",
        decision: "retain-until-explicit-restore-or-reviewed-prune",
      },
      metadataCandidates: {
        count: metadataCandidates.length,
        bytes: metadataCandidates.reduce((total, item) => total + item.bytes, 0),
        status: "R1",
        decision: "no-action-without-exact-path-approval",
        items: metadataCandidates,
      },
      emptyAuditDirectories: {
        count: emptyAuditDirectories.length,
        status: "R2",
        decision: "manual-review-before-archive-or-removal",
        items: emptyAuditDirectories,
      },
      unknownUntracked: {
        ...summarizeFiles(untracked.manualReview),
        status: "R3",
        decision: "manual-classification-required",
      },
    },
    cleanupPlan: {
      approvedPaths: [],
      execution: "not-requested",
      rollback: "not-applicable-no-write-performed",
    },
  };
}

function formatText(report) {
  const inventory = report.inventory;
  return [
    "Target mode worktree audit",
    `timestamp: ${report.generatedAt}`,
    "operation: read-only; no delete, restore, launch, CDP, click, drag, or theme apply",
    `P0 tracked changes: ${inventory.trackedChanges.count} (${formatBytes(inventory.trackedChanges.bytes)})`,
    `P0 untracked source/test files: ${inventory.untrackedSource.count} (${formatBytes(inventory.untrackedSource.bytes)})`,
    `P1 retained audit evidence: ${inventory.auditEvidence.count} (${formatBytes(inventory.auditEvidence.bytes)})`,
    `P2 recovery quarantine: ${inventory.recoveryQuarantine.count} (${formatBytes(inventory.recoveryQuarantine.bytes)})`,
    `R1 Finder metadata candidates: ${inventory.metadataCandidates.count} (${formatBytes(inventory.metadataCandidates.bytes)})`,
    `R2 empty audit directories: ${inventory.emptyAuditDirectories.count}`,
    `R3 unknown untracked files: ${inventory.unknownUntracked.count}`,
    "cleanup: not requested; every candidate requires explicit exact-path approval",
  ].join("\n");
}

try {
  const { format } = parseArgs(process.argv.slice(2));
  const report = buildReport();
  process.stdout.write(`${format === "json" ? JSON.stringify(report, null, 2) : formatText(report)}\n`);
} catch (error) {
  process.stderr.write(`[target-mode-worktree-audit] ${error.message}\n`);
  process.exit(1);
}
