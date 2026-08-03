#!/usr/bin/env node

import { lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const QUARANTINE_DIR = ".target-mode-quarantine";
const FORMAT_VALUES = new Set(["text", "json"]);
const ITEM_KINDS = new Set(["R1", "R2"]);
const RUN_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{2,79}$/i;

function usage() {
  return [
    "Usage:",
    "  node macos/scripts/target-mode-cleanup.mjs --manifest /absolute/path.json [--execute --confirm-quarantine] [--format text|json]",
    "  node macos/scripts/target-mode-cleanup.mjs --restore-run RUN_ID [--execute --confirm-restore] [--format text|json]",
    "",
    "Default is a dry run. Execution moves only exact approved candidates into a local quarantine.",
    "It never deletes, launches Codex, connects to CDP, injects a theme, clicks, or drags.",
  ].join("\n");
}

function parseArgs(argv) {
  const options = {
    action: "cleanup",
    confirm: false,
    execute: false,
    format: "text",
    manifest: "",
    restoreRun: "",
    testRoot: "",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      process.stdout.write(`${usage()}\n`);
      process.exit(0);
    }
    if (arg === "--manifest") {
      options.manifest = argv[index + 1] ?? "";
      index += 1;
      continue;
    }
    if (arg === "--restore-run") {
      options.action = "restore";
      options.restoreRun = argv[index + 1] ?? "";
      index += 1;
      continue;
    }
    if (arg === "--execute") {
      options.execute = true;
      continue;
    }
    if (arg === "--confirm-quarantine") {
      options.confirm = true;
      continue;
    }
    if (arg === "--confirm-restore") {
      options.confirm = true;
      continue;
    }
    if (arg === "--format") {
      options.format = argv[index + 1] ?? "";
      index += 1;
      continue;
    }
    if (arg === "--test-root") {
      options.testRoot = argv[index + 1] ?? "";
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!FORMAT_VALUES.has(options.format)) {
    throw new Error(`Unsupported format: ${options.format}`);
  }
  if (options.action === "cleanup" && !options.manifest) {
    throw new Error("--manifest is required for cleanup planning or execution");
  }
  if (options.action === "restore" && !options.restoreRun) {
    throw new Error("--restore-run is required for restoration planning or execution");
  }
  if (options.action === "restore" && options.manifest) {
    throw new Error("--manifest cannot be combined with --restore-run");
  }
  if (options.execute && !options.confirm) {
    throw new Error(options.action === "restore"
      ? "--execute requires --confirm-restore"
      : "--execute requires --confirm-quarantine");
  }
  return options;
}

function resolveRoot(testRoot) {
  if (!testRoot) {
    return DEFAULT_ROOT;
  }
  if (process.env.NODE_ENV !== "test") {
    throw new Error("--test-root is only available with NODE_ENV=test");
  }
  const candidate = path.resolve(testRoot);
  const temporaryRoot = path.resolve(tmpdir());
  if (candidate !== temporaryRoot && !candidate.startsWith(`${temporaryRoot}${path.sep}`)) {
    throw new Error("--test-root must be inside the operating system temporary directory");
  }
  return candidate;
}

function toPortablePath(value) {
  return value.split(path.sep).join("/");
}

function isSafeRelativePath(value) {
  if (typeof value !== "string" || !value || path.isAbsolute(value)) {
    return false;
  }
  const normalized = path.posix.normalize(value.replace(/\\/g, "/"));
  return normalized === value && normalized !== "." && !normalized.startsWith("../") && !normalized.includes("/../");
}

function rootPath(root, relative) {
  if (!isSafeRelativePath(relative)) {
    throw new Error(`Unsafe relative path: ${String(relative)}`);
  }
  const absolute = path.resolve(root, relative);
  if (!absolute.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Path escapes target root: ${relative}`);
  }
  return absolute;
}

function safeStat(absolute) {
  try {
    return lstatSync(absolute);
  } catch {
    return null;
  }
}

function walkCandidates(root, directory, result) {
  let children;
  try {
    children = readdirSync(directory, { withFileTypes: true });
  } catch {
    return;
  }
  for (const child of children) {
    if (child.name === ".git" || child.name === QUARANTINE_DIR || child.isSymbolicLink()) {
      continue;
    }
    const absolute = path.join(directory, child.name);
    if (child.isDirectory()) {
      walkCandidates(root, absolute, result);
      continue;
    }
    if (child.isFile() && (child.name === ".DS_Store" || child.name.startsWith("._"))) {
      result.set(toPortablePath(path.relative(root, absolute)), "R1");
    }
  }
}

function findEmptyPreviewDirectories(root, directory, result) {
  let children;
  try {
    children = readdirSync(directory, { withFileTypes: true });
  } catch {
    return;
  }
  for (const child of children) {
    if (child.isDirectory() && !child.isSymbolicLink()) {
      findEmptyPreviewDirectories(root, path.join(directory, child.name), result);
    }
  }
  if (directory !== path.join(root, "macos", "previews") && children.length === 0) {
    result.set(toPortablePath(path.relative(root, directory)), "R2");
  }
}

function candidateMap(root) {
  const candidates = new Map();
  walkCandidates(root, root, candidates);
  findEmptyPreviewDirectories(root, path.join(root, "macos", "previews"), candidates);
  return candidates;
}

function readJson(filePath, label) {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`Unable to read ${label}: ${error.message}`);
  }
}

function requireApprovalTimestamp(value) {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new Error("Cleanup manifest must include a valid approval.approvedAt timestamp");
  }
  return value;
}

function isExactCandidateLocation(relative, kind) {
  if (kind === "R1") {
    const name = path.posix.basename(relative);
    return name === ".DS_Store" || name.startsWith("._");
  }
  return relative.startsWith("macos/previews/");
}

function expectedQuarantineDestination(runId, source) {
  return `${QUARANTINE_DIR}/${runId}/items/${source}`;
}

function validateManifest(root, manifestPath) {
  const manifest = readJson(path.resolve(manifestPath), "cleanup manifest");
  if (manifest.schemaVersion !== 1 || manifest.kind !== "target-mode-cleanup-manifest") {
    throw new Error("Cleanup manifest must use schemaVersion 1 and kind target-mode-cleanup-manifest");
  }
  if (!RUN_ID_PATTERN.test(manifest.id ?? "")) {
    throw new Error("Cleanup manifest id is invalid");
  }
  if (manifest.approval?.mode !== "exact-path-manifest" || manifest.approval?.confirmedBy !== "manual-user") {
    throw new Error("Cleanup manifest must record manual exact-path approval");
  }
  const approvedAt = requireApprovalTimestamp(manifest.approval?.approvedAt);
  if (!Array.isArray(manifest.items) || manifest.items.length === 0) {
    throw new Error("Cleanup manifest must contain at least one exact candidate path");
  }

  const candidates = candidateMap(root);
  const seen = new Set();
  const items = manifest.items.map((item, index) => {
    if (!item || !isSafeRelativePath(item.path) || !ITEM_KINDS.has(item.kind) || !isExactCandidateLocation(item.path, item.kind)) {
      throw new Error(`Manifest item ${index + 1} is invalid`);
    }
    if (seen.has(item.path)) {
      throw new Error(`Manifest repeats candidate path: ${item.path}`);
    }
    seen.add(item.path);
    const actualKind = candidates.get(item.path);
    if (actualKind !== item.kind) {
      throw new Error(`Manifest item is not a current exact ${item.kind} candidate: ${item.path}`);
    }
    const source = rootPath(root, item.path);
    const stat = safeStat(source);
    if (!stat || stat.isSymbolicLink()) {
      throw new Error(`Manifest item is missing or symbolic: ${item.path}`);
    }
    if ((item.kind === "R1" && !stat.isFile()) || (item.kind === "R2" && !stat.isDirectory())) {
      throw new Error(`Manifest item type changed: ${item.path}`);
    }
    return { path: item.path, kind: item.kind, bytes: stat.isFile() ? stat.size : 0 };
  });
  return { id: manifest.id, approvedAt, items, manifestPath: path.resolve(manifestPath) };
}

function atomicWrite(filePath, value) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  renameSync(temporaryPath, filePath);
}

function controls({ mutates, restores = false }) {
  return {
    mutates,
    deletes: false,
    restores,
    launches: false,
    connectsToCdp: false,
    appliesTheme: false,
    clicks: false,
    drags: false,
  };
}

function cleanupPlan(root, options) {
  const approved = validateManifest(root, options.manifest);
  const quarantineRoot = path.join(root, QUARANTINE_DIR, approved.id);
  return {
    action: "quarantine-cleanup",
    approved,
    items: approved.items.map((item) => ({
      ...item,
      source: item.path,
      destination: expectedQuarantineDestination(approved.id, item.path),
    })),
    quarantineRoot,
  };
}

function executeCleanup(root, plan) {
  const journalPath = path.join(plan.quarantineRoot, "journal.json");
  const journal = {
    schemaVersion: 1,
    kind: "target-mode-quarantine-journal",
    id: plan.approved.id,
    root,
    createdAt: new Date().toISOString(),
    status: "in-progress",
    action: "quarantine-cleanup",
    approval: {
      mode: "exact-path-manifest",
      confirmedBy: "manual-user",
      approvedAt: plan.approved.approvedAt,
    },
    items: plan.items.map((item) => ({ ...item, status: "pending" })),
  };
  atomicWrite(journalPath, journal);
  const moved = [];
  try {
    for (const item of journal.items) {
      const source = rootPath(root, item.source);
      const destination = rootPath(root, item.destination);
      mkdirSync(path.dirname(destination), { recursive: true });
      renameSync(source, destination);
      item.status = "quarantined";
      moved.push(item);
      atomicWrite(journalPath, journal);
    }
    journal.status = "quarantined";
    journal.completedAt = new Date().toISOString();
    atomicWrite(journalPath, journal);
    return journal;
  } catch (error) {
    journal.status = "rollback-required";
    journal.error = error.message;
    for (const item of moved.reverse()) {
      try {
        renameSync(rootPath(root, item.destination), rootPath(root, item.source));
        item.status = "rolled-back";
      } catch (rollbackError) {
        item.status = "rollback-failed";
        item.rollbackError = rollbackError.message;
      }
    }
    journal.completedAt = new Date().toISOString();
    atomicWrite(journalPath, journal);
    throw new Error(`Quarantine move failed; rollback journal retained: ${error.message}`);
  }
}

function restorePlan(root, runId) {
  if (!RUN_ID_PATTERN.test(runId)) {
    throw new Error("Restore run id is invalid");
  }
  const journalPath = path.join(root, QUARANTINE_DIR, runId, "journal.json");
  const journal = readJson(journalPath, "quarantine journal");
  if (journal.schemaVersion !== 1 || journal.kind !== "target-mode-quarantine-journal" || journal.id !== runId || journal.root !== root) {
    throw new Error("Quarantine journal does not belong to this target root");
  }
  if (journal.status !== "quarantined" || !Array.isArray(journal.items)) {
    throw new Error("Quarantine journal is not restorable");
  }
  const items = journal.items.map((item, index) => {
    if (!isSafeRelativePath(item.source) || !isSafeRelativePath(item.destination) || !ITEM_KINDS.has(item.kind)) {
      throw new Error(`Quarantine journal item ${index + 1} is invalid`);
    }
    if (!isExactCandidateLocation(item.source, item.kind)) {
      throw new Error(`Quarantine journal item ${index + 1} has an unsupported source location`);
    }
    if (item.destination !== expectedQuarantineDestination(runId, item.source)) {
      throw new Error(`Quarantine journal item ${index + 1} has an unexpected destination`);
    }
    const source = rootPath(root, item.source);
    const destination = rootPath(root, item.destination);
    if (safeStat(source)) {
      throw new Error(`Cannot restore onto an existing path: ${item.source}`);
    }
    const destinationStat = safeStat(destination);
    if (!destinationStat || destinationStat.isSymbolicLink()) {
      throw new Error(`Quarantine item is missing or symbolic: ${item.destination}`);
    }
    return { ...item, source, destination };
  });
  return { journalPath, journal, items };
}

function executeRestore(root, plan) {
  const restored = [];
  try {
    for (const item of plan.items) {
      mkdirSync(path.dirname(item.source), { recursive: true });
      renameSync(item.destination, item.source);
      const source = toPortablePath(path.relative(root, item.source));
      const journalItem = plan.journal.items.find((entry) => entry.source === source);
      if (journalItem) {
        journalItem.status = "restored";
      }
      restored.push(item);
      atomicWrite(plan.journalPath, plan.journal);
    }
    plan.journal.status = "restored";
    plan.journal.restoredAt = new Date().toISOString();
    atomicWrite(plan.journalPath, plan.journal);
    return plan.journal;
  } catch (error) {
    plan.journal.status = "restore-rollback-required";
    plan.journal.restoreError = error.message;
    for (const item of restored.reverse()) {
      try {
        renameSync(item.source, item.destination);
      } catch (rollbackError) {
        plan.journal.restoreRollbackError = rollbackError.message;
      }
    }
    atomicWrite(plan.journalPath, plan.journal);
    throw new Error(`Restore failed; quarantine retained: ${error.message}`);
  }
}

function formatText(report) {
  const lines = [
    `[codex-interface-theme] target mode ${report.action}`,
    `ok=${report.ok}`,
    `execution=${report.execution}`,
    `items=${report.items.length}`,
    "deletes=false",
    `restores=${report.controls.restores}`,
    "launches=false",
    "connectsToCdp=false",
    "appliesTheme=false",
    "clicks=false",
    "drags=false",
  ];
  for (const item of report.items) {
    lines.push(`${item.kind} ${item.source} -> ${item.destination ?? "(no move in dry run)"}`);
  }
  return lines.join("\n");
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const root = resolveRoot(options.testRoot);
  let report;
  if (options.action === "cleanup") {
    const plan = cleanupPlan(root, options);
    const journal = options.execute ? executeCleanup(root, plan) : null;
    report = {
      ok: true,
      mode: "target-mode-cleanup",
      action: plan.action,
      execution: options.execute ? "quarantined" : "dry-run",
      root,
      controls: controls({ mutates: options.execute }),
      requiresExplicitPathApproval: true,
      manifest: plan.approved.manifestPath,
      runId: plan.approved.id,
      items: plan.items,
      journal: journal ? toPortablePath(path.relative(root, path.join(plan.quarantineRoot, "journal.json"))) : null,
    };
  } else {
    const plan = restorePlan(root, options.restoreRun);
    const journal = options.execute ? executeRestore(root, plan) : null;
    report = {
      ok: true,
      mode: "target-mode-cleanup",
      action: "quarantine-restore",
      execution: options.execute ? "restored" : "dry-run",
      root,
      controls: controls({ mutates: options.execute, restores: options.execute }),
      requiresExplicitPathApproval: true,
      runId: options.restoreRun,
      items: plan.items.map((item) => ({ kind: item.kind, source: toPortablePath(path.relative(root, item.source)), destination: toPortablePath(path.relative(root, item.destination)) })),
      journal: journal ? toPortablePath(path.relative(root, plan.journalPath)) : null,
    };
  }
  process.stdout.write(`${options.format === "json" ? JSON.stringify(report, null, 2) : formatText(report)}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`[codex-interface-theme][error] ${error.message}\n`);
  process.exit(1);
}
