#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SCRIPT = path.join(ROOT, "macos", "scripts", "target-mode-cleanup.mjs");
const fixture = mkdtempSync(path.join(tmpdir(), "codex-target-mode-cleanup-"));

function run(args, expectSuccess = true) {
  try {
    const output = execFileSync(process.execPath, [SCRIPT, ...args, "--format", "json", "--test-root", fixture], {
      cwd: ROOT,
      encoding: "utf8",
      env: { ...process.env, NODE_ENV: "test" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    if (!expectSuccess) {
      throw new Error("expected command to fail");
    }
    return JSON.parse(output);
  } catch (error) {
    if (!expectSuccess) {
      return error;
    }
    throw error;
  }
}

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

try {
  mkdirSync(path.join(fixture, "macos", "previews", "empty-audit"), { recursive: true });
  writeFileSync(path.join(fixture, ".DS_Store"), "finder metadata fixture", "utf8");
  const manifestPath = path.join(fixture, "approved-manifest.json");
  writeJson(manifestPath, {
    schemaVersion: 1,
    kind: "target-mode-cleanup-manifest",
    id: "fixture-cleanup-001",
    approval: {
      mode: "exact-path-manifest",
      confirmedBy: "manual-user",
      approvedAt: "2026-08-03T00:00:00.000Z",
    },
    items: [
      { path: ".DS_Store", kind: "R1" },
      { path: "macos/previews/empty-audit", kind: "R2" },
    ],
  });

  const dryRun = run(["--manifest", manifestPath]);
  if (dryRun.execution !== "dry-run" || dryRun.controls.mutates !== false || dryRun.controls.deletes !== false || dryRun.controls.restores !== false) {
    throw new Error("dry run must not mutate or delete");
  }
  if (!existsSync(path.join(fixture, ".DS_Store")) || !existsSync(path.join(fixture, "macos", "previews", "empty-audit"))) {
    throw new Error("dry run moved a candidate");
  }

  const cleanup = run(["--manifest", manifestPath, "--execute", "--confirm-quarantine"]);
  const journalPath = path.join(fixture, ".target-mode-quarantine", "fixture-cleanup-001", "journal.json");
  if (cleanup.execution !== "quarantined" || cleanup.controls.mutates !== true || cleanup.controls.restores !== false || !existsSync(journalPath)) {
    throw new Error("confirmed cleanup did not create a quarantine journal");
  }
  if (existsSync(path.join(fixture, ".DS_Store")) || existsSync(path.join(fixture, "macos", "previews", "empty-audit"))) {
    throw new Error("confirmed cleanup did not move exact candidates");
  }
  const journal = JSON.parse(readFileSync(journalPath, "utf8"));
  if (journal.status !== "quarantined" || journal.items.some((item) => item.status !== "quarantined")) {
    throw new Error("quarantine journal did not record exact moved candidates");
  }

  const journalText = readFileSync(journalPath, "utf8");
  const tamperedJournal = JSON.parse(journalText);
  tamperedJournal.items[0].destination = "macos/previews/empty-audit";
  writeJson(journalPath, tamperedJournal);
  run(["--restore-run", "fixture-cleanup-001"], false);
  writeFileSync(journalPath, journalText, "utf8");

  const restoreDryRun = run(["--restore-run", "fixture-cleanup-001"]);
  if (restoreDryRun.execution !== "dry-run" || restoreDryRun.controls.mutates !== false || existsSync(path.join(fixture, ".DS_Store"))) {
    throw new Error("restore dry run must not mutate");
  }

  const restore = run(["--restore-run", "fixture-cleanup-001", "--execute", "--confirm-restore"]);
  if (restore.execution !== "restored" || restore.controls.mutates !== true || restore.controls.restores !== true || !existsSync(path.join(fixture, ".DS_Store")) || !existsSync(path.join(fixture, "macos", "previews", "empty-audit"))) {
    throw new Error("confirmed restore did not return quarantined candidates");
  }
  const restoredJournal = JSON.parse(readFileSync(journalPath, "utf8"));
  if (restoredJournal.status !== "restored") {
    throw new Error("restore journal did not preserve restored state");
  }

  const invalidManifestPath = path.join(fixture, "invalid-manifest.json");
  writeJson(invalidManifestPath, {
    schemaVersion: 1,
    kind: "target-mode-cleanup-manifest",
    id: "invalid-manifest-001",
    approval: {
      mode: "exact-path-manifest",
      confirmedBy: "manual-user",
      approvedAt: "2026-08-03T00:00:00.000Z",
    },
    items: [{ path: "../outside", kind: "R1" }],
  });
  run(["--manifest", invalidManifestPath], false);
  if (!existsSync(path.join(fixture, ".DS_Store"))) {
    throw new Error("invalid manifest affected fixture files");
  }

  const missingTimestampManifestPath = path.join(fixture, "missing-timestamp-manifest.json");
  writeJson(missingTimestampManifestPath, {
    schemaVersion: 1,
    kind: "target-mode-cleanup-manifest",
    id: "missing-timestamp-001",
    approval: { mode: "exact-path-manifest", confirmedBy: "manual-user" },
    items: [{ path: ".DS_Store", kind: "R1" }],
  });
  run(["--manifest", missingTimestampManifestPath], false);

  process.stdout.write("[codex-interface-theme] target mode cleanup rules passed\n");
} finally {
  rmSync(fixture, { recursive: true, force: true });
}
