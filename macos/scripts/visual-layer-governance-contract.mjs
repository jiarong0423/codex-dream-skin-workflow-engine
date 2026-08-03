#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

function usage() {
  return `Usage:
  visual-layer-governance-contract.mjs [--root <path>] [--schema <path>]
    [--runtime-manifest <path>] [--governance-doc <path>]
    [--format text|json]

Builds a read-only closeout contract for visual layer governance. It reads
local files only. It does not launch Codex, connect to CDP, click, drag, apply,
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

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function falseSideEffects() {
  return {
    executes: false,
    mutates: false,
    launches: false,
    connectsToCdp: false,
    clicks: false,
    drags: false,
    appliesTheme: false,
    restores: false
  };
}

function state(ok, partial) {
  if (ok) {
    return "O";
  }
  return partial ? "partial" : "X";
}

function pushCheck(checks, id, ok, partial, evidence, nextAction) {
  checks.push({
    id,
    state: state(ok, partial),
    evidence,
    nextAction: ok ? "" : nextAction
  });
}

function collectRuntimeLocks(runtimeManifest) {
  return asArray(runtimeManifest.dynamicBoundaryLocks?.surfaces).map((surface) => ({
    id: String(surface.id || ""),
    owner: String(surface.owner || ""),
    lockKey: String(surface.lockKey || ""),
    allowedActions: asArray(surface.allowedActions),
    forbiddenActions: asArray(surface.forbiddenActions),
    riskTags: asArray(surface.riskTags)
  }));
}

function hasText(text, pattern) {
  return pattern.test(String(text || ""));
}

function buildReport(options) {
  const scriptDir = path.dirname(new URL(import.meta.url).pathname);
  const rootDir = path.resolve(options.root || path.join(scriptDir, ".."));
  const schemaPath = path.resolve(options.schema || path.join(rootDir, "assets", "visual-layer-governance-schema.json"));
  const runtimeManifestPath = path.resolve(options["runtime-manifest"] || path.join(rootDir, "assets", "runtime-modules.json"));
  const governanceDocPath = path.resolve(options["governance-doc"] || path.join(rootDir, "..", "docs", "VISUAL_MODIFICATION_GOVERNANCE.md"));
  const schema = readJson(schemaPath);
  const runtimeManifest = readJson(runtimeManifestPath);
  const governanceDoc = readText(governanceDocPath);
  const checks = [];
  const errors = [];
  const warnings = [];
  const runtimeLocks = collectRuntimeLocks(runtimeManifest);
  const runtimeLockIds = new Set(runtimeLocks.map((lock) => lock.id).filter(Boolean));
  const requiredLocks = asArray(schema.requiredRuntimeLocks);
  const missingLocks = requiredLocks.filter((id) => !runtimeLockIds.has(id));
  const runtimeInvariants = asArray(runtimeManifest.dynamicBoundaryLocks?.invariants).join("\n");
  const boundaryForbidden = asArray(runtimeManifest.boundaryPolicy?.forbidden).join("\n");

  pushCheck(
    checks,
    "schema.readOnlyDefaults",
    schema.defaults?.connectsToCdp === false &&
      schema.defaults?.appliesTheme === false &&
      schema.defaults?.restores === false &&
      schema.defaults?.clicks === false &&
      schema.defaults?.drags === false &&
      schema.defaults?.launches === false &&
      schema.defaults?.mutates === false,
    false,
    "schema defaults deny CDP, apply, restore, click, drag, launch, and mutation",
    "reset schema defaults to read-only false side effects"
  );

  pushCheck(
    checks,
    "schema.stateContract",
    ["candidate", "locked", "quarantined", "released"].every((value) => asArray(schema.stateContract).includes(value)),
    false,
    `states=${asArray(schema.stateContract).join(",")}`,
    "add candidate, locked, quarantined, and released to stateContract"
  );

  pushCheck(
    checks,
    "schema.simpleInjection",
    asArray(schema.invariants).some((item) => /simple one-shot CDP apply/i.test(String(item))) &&
      asArray(schema.governedSurfaces).some((surface) => surface && surface.id === "simpleOneShotInjection"),
    false,
    "schema declares simple one-shot injection as the final runtime path",
    "declare simpleOneShotInjection and one-shot apply plus verify plus restore invariant"
  );

  pushCheck(
    checks,
    "runtime.dynamicBoundaryLocks",
    missingLocks.length === 0,
    missingLocks.length > 0 && missingLocks.length < requiredLocks.length,
    `required=${requiredLocks.join(",")} missing=${missingLocks.join(",") || "none"}`,
    "add missing runtime locks before live visual changes"
  );

  const locksWithoutCoordinateDeny = runtimeLocks.filter((lock) => !lock.forbiddenActions.includes("fixed-coordinate-identity"));
  pushCheck(
    checks,
    "runtime.fixedCoordinateDenied",
    locksWithoutCoordinateDeny.length === 0 &&
      /fixed coordinates are never identity/i.test(runtimeInvariants) &&
      /fixed-coordinate identity/i.test(boundaryForbidden),
    locksWithoutCoordinateDeny.length === 0,
    `locksWithoutCoordinateDeny=${locksWithoutCoordinateDeny.map((lock) => lock.id).join(",") || "none"}`,
    "ensure every dynamic lock and runtime invariant forbids fixed coordinate identity"
  );

  pushCheck(
    checks,
    "doc.knownBlackLedger",
    hasText(governanceDoc, /known_black_range_total - retained_or_protected_range_total = modification_detection_candidates/) &&
      hasText(governanceDoc, /Known Black Range Gap Ledger/i),
    false,
    "governance document contains the subtraction ledger",
    "document the known black range ledger before adding visual candidates"
  );

  pushCheck(
    checks,
    "doc.layerFirstRightPanel",
    hasText(governanceDoc, /layer-first classification/i) &&
      hasText(governanceDoc, /rightTopSwitches/i) &&
      hasText(governanceDoc, /right-panel template drift/i),
    false,
    "governance document defines layer-first right panel review",
    "add right panel template drift and layer-first classification rules"
  );

  pushCheck(
    checks,
    "doc.closeoutRule",
    hasText(governanceDoc, /Closeout Rule/i) &&
      hasText(governanceDoc, /restore or cleanup proof/i),
    false,
    "governance document requires closeout and restore or cleanup proof",
    "record closeout and cleanup proof requirements"
  );

  for (const check of checks) {
    if (check.state === "X") {
      errors.push(`${check.id}: ${check.nextAction}`);
    } else if (check.state === "partial") {
      warnings.push(`${check.id}: ${check.nextAction}`);
    }
  }

  return {
    ok: errors.length === 0,
    mode: "read-only-visual-layer-governance-contract",
    sideEffects: falseSideEffects(),
    rootDir,
    sources: {
      schema: schemaPath,
      runtimeManifest: runtimeManifestPath,
      governanceDoc: governanceDocPath
    },
    stateContract: asArray(schema.stateContract),
    evidenceStates: asArray(schema.evidenceStates),
    identityPriority: asArray(schema.identityPriority),
    closeoutGates: asArray(schema.closeoutGates),
    runtimeLocks,
    governedSurfaces: asArray(schema.governedSurfaces).map((surface) => ({
      id: String(surface.id || ""),
      owner: String(surface.owner || ""),
      allowedActions: asArray(surface.allowedActions),
      forbiddenActions: asArray(surface.forbiddenActions)
    })),
    checks,
    errors,
    warnings
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
    console.log("[codex-interface-theme] visual layer governance contract");
    console.log(`ok=${report.ok}`);
    console.log(`mode=${report.mode}`);
    for (const [key, value] of Object.entries(report.sideEffects)) {
      console.log(`${key}=${value}`);
    }
    console.log(`states=${report.stateContract.join(",")}`);
    console.log(`governedSurfaces=${report.governedSurfaces.map((surface) => surface.id).join(",")}`);
    console.log("checks:");
    for (const check of report.checks) {
      console.log(`- ${check.state} ${check.id}: ${check.evidence}`);
    }
    for (const warning of report.warnings) {
      console.log(`warning=${warning}`);
    }
    for (const error of report.errors) {
      console.log(`error=${error}`);
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
  console.error(`[codex-interface-theme][visual-layer-governance-contract] ${error.message}`);
  process.exit(1);
}
