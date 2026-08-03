#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  DEFAULT_RUNTIME_MANIFEST,
  buildDynamicBoundaryCoverage,
  readDynamicBoundaryLocks
} from "./dynamic-boundary-coverage.mjs";

const CONDITIONAL_ABSENT_LOCKS = new Set(["projectPanelRows"]);

function usage() {
  return `Usage:
  dynamic-boundary-artifact-summary.mjs [--artifact-dir <dir>] [--runtime-manifest <path>]
    [--out <path>] [--fixture true|false] [--format text|json]

Summarizes read-only dynamic boundary coverage artifacts. It never connects to
CDP, launches Codex, applies a theme, restores, clicks, drags, deletes, or
changes state.`;
}

function parseArgs(argv) {
  const options = {
    artifactDir: "",
    runtimeManifest: DEFAULT_RUNTIME_MANIFEST,
    out: "",
    fixture: "false",
    format: "text"
  };
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
    options[key.slice(2).replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase())] = value;
    index += 1;
  }
  return options;
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readJsonIfExists(filePath, warnings) {
  if (!filePath || !fs.existsSync(filePath)) {
    warnings.push(`missing artifact: ${filePath || "<empty>"}`);
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    warnings.push(`invalid JSON artifact: ${filePath}: ${error.message}`);
    return null;
  }
}

function emptyCoverage(lockConfig) {
  return buildDynamicBoundaryCoverage([], lockConfig);
}

function fixtureCoverage(lockConfig) {
  return buildDynamicBoundaryCoverage([
    { index: 0, kind: "source-preview", label: "sample source preview", dragRisk: "high-memory-image-resize", safe: false, dynamic: true },
    { index: 1, kind: "top-toolbar", label: "使用者附件", safe: false, dynamic: true },
    { index: 2, kind: "sidebar", label: "專案", risk: "sidebar-state", safe: false, dynamic: true },
    { index: 3, kind: "right-panel", label: "來源 截圖", safe: false, dynamic: true },
    { index: 4, kind: "popover", label: "設定 登出", risk: "destructive-or-session", safe: false, dynamic: true },
    { index: 5, kind: "composer", label: "什麼都能做", safe: true, dynamic: false },
    { index: 6, kind: "black-shell", label: "official near-black workspace shell", blackShell: "true", safe: false, dynamic: true }
  ], lockConfig);
}

function normalizeCoverage(value, lockConfig) {
  if (!isObject(value)) {
    return emptyCoverage(lockConfig);
  }
  if (Array.isArray(value.surfaces) && typeof value.totalLocks === "number") {
    return value;
  }
  if (isObject(value.dynamicBoundaryLocks)) {
    return normalizeCoverage(value.dynamicBoundaryLocks, lockConfig);
  }
  return emptyCoverage(lockConfig);
}

function coverageFromInventory(inventory, lockConfig) {
  if (!isObject(inventory)) {
    return {
      targets: [],
      combined: emptyCoverage(lockConfig)
    };
  }
  const targets = Array.isArray(inventory.targets) ? inventory.targets.map((target) => ({
    id: String(target.id || ""),
    title: String(target.title || ""),
    url: String(target.url || ""),
    coverage: normalizeCoverage(target.summary && target.summary.dynamicBoundaryLocks, lockConfig)
  })) : [];
  const fields = targets.flatMap((target) => target.coverage.surfaces.flatMap((surface) => surface.examples.map((example) => ({
    ...example,
    dynamic: surface.dynamic > 0,
    safe: surface.safeCandidates > 0 && surface.riskyCandidates === 0
  }))));
  return {
    targets,
    combined: buildDynamicBoundaryCoverage(fields, lockConfig)
  };
}

function mergeExamples(entries, limit = 10) {
  const examples = [];
  const seen = new Set();
  for (const entry of entries) {
    for (const example of entry.examples || []) {
      const key = `${example.index}|${example.kind}|${example.label}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      examples.push(example);
      if (examples.length >= limit) {
        return examples;
      }
    }
  }
  return examples;
}

function summarizeLock(surface, inventorySurface, clickableSurface) {
  const inventoryDetected = inventorySurface ? Number(inventorySurface.detected || 0) : 0;
  const clickableDetected = clickableSurface ? Number(clickableSurface.detected || 0) : 0;
  const riskyCandidates = Number((inventorySurface && inventorySurface.riskyCandidates) || 0)
    + Number((clickableSurface && clickableSurface.riskyCandidates) || 0);
  const safeCandidates = Number((inventorySurface && inventorySurface.safeCandidates) || 0)
    + Number((clickableSurface && clickableSurface.safeCandidates) || 0);
  const highMemoryExamples = mergeExamples([inventorySurface || {}, clickableSurface || {}])
    .filter((example) => example.dragRisk === "high-memory-image-resize");
  const missing = inventoryDetected + clickableDetected === 0;
  const absentAllowed = missing && CONDITIONAL_ABSENT_LOCKS.has(surface.id);
  return {
    id: surface.id,
    owner: surface.owner,
    lockKey: surface.lockKey,
    riskTags: surface.riskTags,
    detected: inventoryDetected + clickableDetected,
    inventoryDetected,
    clickableDetected,
    dynamicDetected: Number((inventorySurface && inventorySurface.dynamic) || 0)
      + Number((clickableSurface && clickableSurface.dynamic) || 0),
    safeCandidates,
    riskyCandidates,
    highMemoryImageResizeExamples: highMemoryExamples,
    missing,
    absentAllowed,
    absenceReason: absentAllowed ? "conditional native surface not present in the current route/window state" : "",
    examples: mergeExamples([inventorySurface || {}, clickableSurface || {}])
  };
}

export function buildArtifactSummary({
  artifactDir = "",
  runtimeManifest = DEFAULT_RUNTIME_MANIFEST,
  fixture = false
} = {}) {
  const warnings = [];
  const lockConfig = readDynamicBoundaryLocks(runtimeManifest);
  let options = null;
  let smokeCoverage = fixtureCoverage(lockConfig);
  let inventoryCoverage = {
    targets: [],
    combined: fixture ? fixtureCoverage(lockConfig) : emptyCoverage(lockConfig)
  };
  let clickableCoverage = fixture ? fixtureCoverage(lockConfig) : emptyCoverage(lockConfig);

  if (!fixture) {
    if (!artifactDir) {
      throw new Error("--artifact-dir is required unless --fixture true is used");
    }
    const resolvedDir = path.resolve(artifactDir);
    options = readJsonIfExists(path.join(resolvedDir, "00-options.json"), warnings);
    const smoke = readJsonIfExists(path.join(resolvedDir, "01-dynamic-boundary-coverage-smoke.json"), warnings);
    smokeCoverage = normalizeCoverage(smoke && smoke.dynamicBoundaryLocks, lockConfig);
    const inventory = readJsonIfExists(path.join(resolvedDir, "04-interface-field-inventory.json"), warnings);
    inventoryCoverage = coverageFromInventory(inventory, lockConfig);
    const clickable = readJsonIfExists(path.join(resolvedDir, "05-clickable-dry-run", "clickable-surface-audit.json"), warnings);
    clickableCoverage = normalizeCoverage(clickable && clickable.dynamicBoundaryLocks, lockConfig);
  } else {
    options = {
      mode: "fixture",
      mutates: false,
      launches: false,
      applies: false,
      clicks: false,
      drags: false
    };
  }

  const inventoryById = new Map(inventoryCoverage.combined.surfaces.map((surface) => [surface.id, surface]));
  const clickableById = new Map(clickableCoverage.surfaces.map((surface) => [surface.id, surface]));
  const locks = lockConfig.surfaces.map((surface) => summarizeLock(surface, inventoryById.get(surface.id), clickableById.get(surface.id)));
  const missingLocks = locks.filter((lock) => lock.missing && !lock.absentAllowed).map((lock) => lock.id);
  const absentLocks = locks.filter((lock) => lock.missing && lock.absentAllowed).map((lock) => lock.id);
  const highMemoryImageResizeLocks = locks
    .filter((lock) => lock.highMemoryImageResizeExamples.length > 0 || lock.riskTags.includes("high-memory-image-resize"))
    .map((lock) => lock.id);
  const summary = {
    ok: missingLocks.length === 0 && warnings.length === 0,
    mode: "read-only-dynamic-boundary-artifact-summary",
    artifactDir: artifactDir ? path.resolve(artifactDir) : "",
    runtimeManifest: lockConfig.manifestPath,
    mutates: false,
    launches: false,
    applies: false,
    clicks: false,
    drags: false,
    options,
    totals: {
      locks: locks.length,
      detectedLocks: locks.filter((lock) => !lock.missing).length,
      acceptedLocks: locks.filter((lock) => !lock.missing || lock.absentAllowed).length,
      missingLocks: missingLocks.length,
      absentLocks: absentLocks.length,
      inventoryTargets: inventoryCoverage.targets.length,
      riskyCandidates: locks.reduce((sum, lock) => sum + lock.riskyCandidates, 0),
      safeCandidates: locks.reduce((sum, lock) => sum + lock.safeCandidates, 0)
    },
    missingLocks,
    absentLocks,
    highMemoryImageResizeLocks,
    locks,
    smokeCoverage,
    inventoryTargets: inventoryCoverage.targets.map((target) => ({
      id: target.id,
      title: target.title,
      url: target.url,
      detectedLocks: target.coverage.detectedLocks,
      totalLocks: target.coverage.totalLocks,
      missingLocks: target.coverage.missingLocks
    })),
    clickableCoverage,
    warnings
  };
  return summary;
}

function printText(summary) {
  console.log("[codex-interface-theme] dynamic boundary artifact summary");
  console.log(`ok=${summary.ok}`);
  console.log(`mode=${summary.mode}`);
  console.log(`locks=${summary.totals.detectedLocks}/${summary.totals.locks}`);
  console.log(`acceptedLocks=${summary.totals.acceptedLocks}/${summary.totals.locks}`);
  console.log(`missing=${summary.missingLocks.join(",") || "none"}`);
  console.log(`absent=${summary.absentLocks.join(",") || "none"}`);
  console.log(`inventoryTargets=${summary.totals.inventoryTargets}`);
  console.log(`riskyCandidates=${summary.totals.riskyCandidates}`);
  console.log(`highMemoryImageResizeLocks=${summary.highMemoryImageResizeLocks.join(",") || "none"}`);
  for (const lock of summary.locks) {
    console.log(`- ${lock.id} detected=${lock.detected} inventory=${lock.inventoryDetected} clickable=${lock.clickableDetected} risky=${lock.riskyCandidates} missing=${lock.missing} absentAllowed=${lock.absentAllowed}`);
  }
  for (const warning of summary.warnings) {
    console.log(`warning=${warning}`);
  }
}

function main() {
  const options = parseArgs(process.argv);
  if (options.help) {
    console.log(usage());
    return;
  }
  if (!["true", "false"].includes(String(options.fixture))) {
    throw new Error("--fixture must be true or false");
  }
  const summary = buildArtifactSummary({
    artifactDir: options.artifactDir,
    runtimeManifest: options.runtimeManifest,
    fixture: options.fixture === "true"
  });
  if (options.out) {
    const outPath = path.resolve(options.out);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(summary, null, 2) + "\n", "utf8");
  }
  if (options.format === "json") {
    console.log(JSON.stringify(summary, null, 2));
  } else if (options.format === "text") {
    printText(summary);
  } else {
    throw new Error(`unknown format: ${options.format}`);
  }
  if (!summary.ok) {
    process.exit(1);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  try {
    main();
  } catch (error) {
    console.error(`[codex-interface-theme][dynamic-boundary-artifact-summary] ${error.message}`);
    process.exitCode = 1;
  }
}
