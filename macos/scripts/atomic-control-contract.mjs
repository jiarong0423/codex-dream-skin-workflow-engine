#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { validatePlan } from "./atomic-control-plan.mjs";

function usage() {
  return `Usage:
  atomic-control-contract.mjs [--root <path>] [--schema <path>]
    [--runtime-manifest <path>] [--asset-manifest <path>]
    [--format text|json]

Builds one offline contract for the atomic control workbench from the runtime
manifest, command schema, dynamic boundary locks, and asset mount manifest.
It reads local files only. It does not launch Codex, connect to CDP, click,
drag, apply, restore, or mutate live UI.`;
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

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function boolRecordFalse(keys) {
  return Object.fromEntries(keys.map((key) => [key, false]));
}

function assetItems(assetManifest) {
  const groups = asArray(assetManifest.groups);
  const items = [];
  for (const group of groups) {
    for (const item of asArray(group.items)) {
      items.push({
        groupId: group.id || "",
        mount: group.mount || "",
        policy: group.policy || "",
        ...item
      });
    }
  }
  return items;
}

function buildAssetSlots(assetManifest) {
  const fitTargets = assetManifest.fitTargets && typeof assetManifest.fitTargets === "object"
    ? assetManifest.fitTargets
    : {};
  return asArray(assetManifest.groups).map((group) => {
    const items = asArray(group.items);
    const runtimeItems = items.filter((item) => item.runtime === true);
    const previewItems = items.filter((item) => item.preview === true);
    return {
      id: group.id || "",
      label: group.label || group.id || "",
      labelZh: group.labelZh || "",
      mount: group.mount || "",
      targetKind: fitTargets[group.mount]?.kind || "",
      runtimeItems: runtimeItems.map((item) => item.id).filter(Boolean),
      previewItems: previewItems.map((item) => item.id).filter(Boolean),
      itemCount: items.length,
      policy: group.policy || "",
      livePrerequisite: fitTargets[group.mount]?.livePrerequisite || ""
    };
  });
}

function buildLoadModes(schema, runtimeManifest) {
  const manifestModes = runtimeManifest.loadModes && typeof runtimeManifest.loadModes === "object"
    ? runtimeManifest.loadModes
    : {};
  return asArray(schema.loadModes).map((mode) => {
    const manifestMode = manifestModes[mode.id] || {};
    return {
      id: mode.id || "",
      label: mode.label || mode.id || "",
      description: mode.description || "",
      existsInRuntimeManifest: Boolean(manifestModes[mode.id]),
      visualAssets: manifestMode.visualAssets === true,
      oneShotOnly: manifestMode.oneShotOnly === true || mode.id === "control-only",
      styleEntry: manifestMode.styleEntry || "",
      rendererEntry: manifestMode.rendererEntry || ""
    };
  });
}

function buildPlanKinds(schema, runtimeManifest) {
  return asArray(schema.planKinds).map((planKind) => {
    const options = { "plan-kind": planKind.id };
    const plan = validatePlan(schema, runtimeManifest, options);
    return {
      id: planKind.id || "",
      label: planKind.label || planKind.id || "",
      description: planKind.description || "",
      commandText: plan.commandText,
      executes: plan.executes,
      mutates: plan.mutates,
      connectsToCdp: plan.connectsToCdp,
      warnings: plan.warnings
    };
  });
}

function buildReport(options) {
  const scriptDir = path.dirname(new URL(import.meta.url).pathname);
  const rootDir = path.resolve(options.root || path.join(scriptDir, ".."));
  const schemaPath = path.resolve(options.schema || path.join(rootDir, "assets", "atomic-control-schema.json"));
  const runtimeManifestPath = path.resolve(options["runtime-manifest"] || path.join(rootDir, "assets", "runtime-modules.json"));
  const assetManifestPath = path.resolve(options["asset-manifest"] || path.join(rootDir, "assets", "atomic-control-assets.json"));
  const schema = readJson(schemaPath);
  const runtimeManifest = readJson(runtimeManifestPath);
  const assetManifest = readJson(assetManifestPath);
  const errors = [];
  const warnings = [];

  const loadModes = buildLoadModes(schema, runtimeManifest);
  const planKinds = buildPlanKinds(schema, runtimeManifest);
  const assetSlots = buildAssetSlots(assetManifest);
  const assets = assetItems(assetManifest);
  const dynamicLocks = asArray(runtimeManifest.dynamicBoundaryLocks?.surfaces).map((surface) => ({
    id: surface.id || "",
    owner: surface.owner || "",
    lockKey: surface.lockKey || "",
    riskTags: asArray(surface.riskTags),
    forbiddenActions: asArray(surface.forbiddenActions),
    allowedActions: asArray(surface.allowedActions)
  }));

  if (schema.defaults?.loadMode !== "carrier-only") {
    errors.push("schema default load mode must stay carrier-only");
  }
  if (schema.defaults?.planKind !== "atomic-gate") {
    errors.push("schema default plan kind must stay atomic-gate");
  }
  for (const mode of loadModes) {
    if (!mode.id) {
      errors.push("load mode missing id");
    }
    if (!mode.existsInRuntimeManifest) {
      errors.push(`load mode missing from runtime manifest: ${mode.id}`);
    }
  }
  if (!loadModes.some((mode) => mode.id === "control-only" && mode.oneShotOnly && !mode.visualAssets)) {
    errors.push("control-only load mode must be one-shot and assetless");
  }
  if (!loadModes.some((mode) => mode.id === "carrier-only" && !mode.visualAssets)) {
    errors.push("carrier-only load mode must be assetless");
  }
  if (!planKinds.some((planKind) => planKind.id === "dynamic-coverage")) {
    errors.push("dynamic-coverage plan kind missing");
  }
  for (const planKind of planKinds) {
    if (planKind.executes || planKind.mutates || planKind.connectsToCdp) {
      errors.push(`plan kind must remain offline in contract: ${planKind.id}`);
    }
  }
  if (assetManifest.mode !== "offline-asset-mount-manifest") {
    errors.push("asset manifest must be offline-asset-mount-manifest");
  }
  if (assetManifest.sideEffects) {
    for (const [key, value] of Object.entries(assetManifest.sideEffects)) {
      if (value !== false) {
        errors.push(`asset manifest side effect must be false: ${key}`);
      }
    }
  }
  for (const slot of assetSlots) {
    if (!slot.id || !slot.mount || !slot.targetKind) {
      errors.push(`asset slot is incomplete: ${slot.id || "<missing-id>"}`);
    }
    if (slot.runtimeItems.length === 0) {
      warnings.push(`asset slot has no runtime item: ${slot.id}`);
    }
  }
  for (const item of assets.filter((asset) => asset.runtime === true)) {
    if (!item.mount || !assetManifest.fitTargets?.[item.mount]) {
      errors.push(`runtime asset missing fit target: ${item.groupId}/${item.id}`);
    }
  }
  if (dynamicLocks.length < 6) {
    errors.push("dynamic boundary lock contract must include at least six native surfaces");
  }
  if (!dynamicLocks.some((lock) => lock.id === "sourcePreviewBlocks" && lock.riskTags.includes("high-memory-image-resize"))) {
    errors.push("source preview lock must preserve high-memory-image-resize risk");
  }

  return {
    ok: errors.length === 0,
    mode: "offline-atomic-control-contract",
    sideEffects: boolRecordFalse(["executes", "mutates", "launches", "connectsToCdp", "clicks", "drags", "appliesTheme", "restores"]),
    rootDir,
    sources: {
      schema: schemaPath,
      runtimeManifest: runtimeManifestPath,
      assetManifest: assetManifestPath
    },
    defaults: {
      planKind: schema.defaults?.planKind || "",
      loadMode: schema.defaults?.loadMode || "",
      outDir: schema.defaults?.outDir || ""
    },
    loadModes,
    planKinds,
    toggles: asArray(schema.toggles).map((toggle) => ({
      id: toggle.id || "",
      flag: toggle.flag || "",
      default: toggle.default === true,
      risk: toggle.risk || ""
    })),
    hardDenyLabels: asArray(schema.hardDenyLabels),
    assetSlots,
    dynamicLocks,
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
    console.log("[codex-interface-theme] offline atomic control contract");
    console.log(`ok=${report.ok}`);
    console.log(`mode=${report.mode}`);
    for (const [key, value] of Object.entries(report.sideEffects)) {
      console.log(`${key}=${value}`);
    }
    console.log(`defaultPlanKind=${report.defaults.planKind}`);
    console.log(`defaultLoadMode=${report.defaults.loadMode}`);
    console.log(`loadModes=${report.loadModes.map((mode) => mode.id).join(",")}`);
    console.log(`planKinds=${report.planKinds.map((planKind) => planKind.id).join(",")}`);
    console.log(`assetSlots=${report.assetSlots.map((slot) => slot.id).join(",")}`);
    console.log(`dynamicLocks=${report.dynamicLocks.map((lock) => lock.id).join(",")}`);
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
  console.error(`[codex-interface-theme][atomic-control-contract] ${error.message}`);
  process.exit(1);
}
