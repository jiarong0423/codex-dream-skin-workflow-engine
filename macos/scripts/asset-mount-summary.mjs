#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

function usage() {
  return `Usage:
  asset-mount-summary.mjs [--root <path>] [--manifest <path>] [--format text|json]

Summarizes the offline atomic-control asset mount manifest. It reads local
project files only. It does not launch Codex, connect to CDP, click, drag,
apply a theme, or mutate the live UI.`;
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

function flattenGroups(manifest) {
  const groups = Array.isArray(manifest.groups) ? manifest.groups : [];
  const items = [];
  for (const group of groups) {
    const groupItems = Array.isArray(group.items) ? group.items : [];
    for (const item of groupItems) {
      items.push({
        groupId: group.id || "",
        groupLabel: group.label || group.id || "",
        mount: group.mount || "",
        policy: group.policy || "",
        ...item
      });
    }
  }
  return { groups, items };
}

function validateSideEffects(manifest, errors) {
  const expectedFalse = ["executes", "mutates", "connectsToCdp", "launches", "clicks", "drags", "appliesTheme"];
  const sideEffects = manifest.sideEffects && typeof manifest.sideEffects === "object" ? manifest.sideEffects : {};
  for (const key of expectedFalse) {
    if (sideEffects[key] !== false) {
      errors.push(`sideEffects.${key} must be false`);
    }
  }
}

function aspectRatio(item) {
  const width = Number(item.width || 0);
  const height = Number(item.height || 0);
  return width > 0 && height > 0 ? width / height : null;
}

function withinTolerance(actual, target, tolerance) {
  return Math.abs(actual - target) <= tolerance;
}

function evaluateFit(item, fitTarget) {
  const failures = [];
  const warnings = [];
  if (!fitTarget || typeof fitTarget !== "object") {
    failures.push("missing fit target");
    return { ok: false, failures, warnings };
  }
  const mediaType = String(item.mediaType || "");
  const ratio = aspectRatio(item);
  if (fitTarget.requiredRuntime === true && item.runtime !== true) {
    failures.push("target requires runtime asset");
  }
  if (Array.isArray(fitTarget.preferredMediaTypes) && !fitTarget.preferredMediaTypes.includes(mediaType)) {
    failures.push(`media type ${mediaType || "<missing>"} not allowed for ${fitTarget.kind || "target"}`);
  }
  if (Number.isFinite(Number(fitTarget.minWidth)) && Number(item.width || 0) < Number(fitTarget.minWidth)) {
    failures.push(`width below minimum ${fitTarget.minWidth}`);
  }
  if (Number.isFinite(Number(fitTarget.maxWidth)) && Number(item.width || 0) > Number(fitTarget.maxWidth)) {
    failures.push(`width above maximum ${fitTarget.maxWidth}`);
  }
  if (Number.isFinite(Number(fitTarget.minHeight)) && Number(item.height || 0) < Number(fitTarget.minHeight)) {
    failures.push(`height below minimum ${fitTarget.minHeight}`);
  }
  if (Number.isFinite(Number(fitTarget.maxBytes)) && Number(item.bytes || 0) > Number(fitTarget.maxBytes)) {
    failures.push(`bytes above maximum ${fitTarget.maxBytes}`);
  }
  if (Number.isFinite(Number(fitTarget.aspectRatio))) {
    if (ratio === null) {
      failures.push("missing pixel dimensions for aspect check");
    } else if (!withinTolerance(ratio, Number(fitTarget.aspectRatio), Number(fitTarget.aspectTolerance || 0))) {
      failures.push(`aspect ratio ${ratio.toFixed(3)} outside target ${fitTarget.aspectRatio}`);
    }
  }
  if (Number.isFinite(Number(fitTarget.aspectMin)) && ratio !== null && ratio < Number(fitTarget.aspectMin)) {
    failures.push(`aspect ratio ${ratio.toFixed(3)} below minimum ${fitTarget.aspectMin}`);
  }
  if (Number.isFinite(Number(fitTarget.aspectMax)) && ratio !== null && ratio > Number(fitTarget.aspectMax)) {
    failures.push(`aspect ratio ${ratio.toFixed(3)} above maximum ${fitTarget.aspectMax}`);
  }
  if (item.preview !== true && item.runtime === true) {
    warnings.push("runtime asset is intentionally not shown as a static preview");
  }
  return {
    ok: failures.length === 0,
    failures,
    warnings,
    aspectRatio: ratio,
    targetKind: fitTarget.kind || "",
    livePrerequisite: fitTarget.livePrerequisite || ""
  };
}

function buildReport(options) {
  const scriptDir = path.dirname(new URL(import.meta.url).pathname);
  const rootDir = path.resolve(options.root || path.join(scriptDir, ".."));
  const assetsDir = path.join(rootDir, "assets");
  const manifestPath = path.resolve(options.manifest || path.join(assetsDir, "atomic-control-assets.json"));
  const manifest = readJson(manifestPath);
  const { groups, items } = flattenGroups(manifest);
  const errors = [];
  const warnings = [];

  validateSideEffects(manifest, errors);
  if (manifest.mode !== "offline-asset-mount-manifest") {
    errors.push("manifest mode must be offline-asset-mount-manifest");
  }
  if (groups.length === 0) {
    errors.push("manifest must declare at least one asset group");
  }
  if (items.length === 0) {
    errors.push("manifest must declare at least one asset item");
  }

  const budgets = manifest.budgets && typeof manifest.budgets === "object" ? manifest.budgets : {};
  const fitTargets = manifest.fitTargets && typeof manifest.fitTargets === "object" ? manifest.fitTargets : {};
  const checkedItems = items.map((item) => {
    const relativePath = String(item.path || "");
    const absolutePath = path.join(assetsDir, relativePath);
    const exists = fs.existsSync(absolutePath);
    const actualBytes = exists ? fs.statSync(absolutePath).size : 0;
    const declaredBytes = Number(item.bytes || 0);
    const runtime = item.runtime === true;
    const preview = item.preview === true;
    const issues = [];
    if (!relativePath || path.isAbsolute(relativePath) || relativePath.includes("..")) {
      issues.push("path must be a relative asset path without parent traversal");
    }
    if (!exists) {
      issues.push("file missing");
    }
    if (exists && declaredBytes !== actualBytes) {
      issues.push(`declared bytes mismatch: declared=${declaredBytes} actual=${actualBytes}`);
    }
    if (runtime && item.groupId === "runtimeBackground" && actualBytes > Number(budgets.maxRuntimeBackgroundBytes || Infinity)) {
      issues.push("runtime background exceeds budget");
    }
    if (runtime && item.groupId === "heroCharacter" && actualBytes > Number(budgets.maxRuntimeCharacterBytes || Infinity)) {
      issues.push("runtime character exceeds budget");
    }
    if (runtime && item.groupId === "buttonGlyphs" && actualBytes > Number(budgets.maxButtonGlyphBytes || Infinity)) {
      issues.push("button glyph exceeds budget");
    }
    const fit = evaluateFit({ ...item, bytes: actualBytes }, fitTargets[item.mount]);
    if (runtime || preview) {
      for (const failure of fit.failures) {
        issues.push(`fit failure: ${failure}`);
      }
    }
    if (preview && actualBytes > Number(budgets.maxPreviewBytes || Infinity) && !String(item.mediaType || "").includes("svg")) {
      warnings.push(`preview asset is large: ${item.id}`);
    }
    for (const warning of fit.warnings) {
      warnings.push(`${item.groupId}/${item.id}: ${warning}`);
    }
    for (const issue of issues) {
      errors.push(`${item.groupId}/${item.id || "<missing-id>"}: ${issue}`);
    }
    return {
      groupId: item.groupId,
      id: item.id || "",
      path: relativePath,
      mediaType: item.mediaType || "",
      runtime,
      preview,
      exists,
      bytes: actualBytes,
      declaredBytes,
      mount: item.mount,
      fit,
      issues
    };
  });

  const runtimeItems = checkedItems.filter((item) => item.runtime);
  const previewItems = checkedItems.filter((item) => item.preview);
  const sourceOnlyItems = checkedItems.filter((item) => !item.runtime);
  const fitItems = checkedItems.filter((item) => item.fit.ok);

  return {
    ok: errors.length === 0,
    mode: "offline-asset-mount-summary",
    mutates: false,
    launches: false,
    connectsToCdp: false,
    clicks: false,
    drags: false,
    appliesTheme: false,
    rootDir,
    manifestPath,
    totals: {
      groups: groups.length,
      items: checkedItems.length,
      runtimeItems: runtimeItems.length,
      previewItems: previewItems.length,
      sourceOnlyItems: sourceOnlyItems.length,
      fitItems: fitItems.length,
      unfitItems: checkedItems.length - fitItems.length,
      runtimeBytes: runtimeItems.reduce((total, item) => total + item.bytes, 0),
      previewBytes: previewItems.reduce((total, item) => total + item.bytes, 0)
    },
    fitTargets,
    groups: groups.map((group) => ({
      id: group.id || "",
      label: group.label || "",
      labelZh: group.labelZh || "",
      mount: group.mount || "",
      policy: group.policy || "",
      itemCount: Array.isArray(group.items) ? group.items.length : 0
    })),
    items: checkedItems,
    warnings,
    errors
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
    console.log("[codex-interface-theme] offline asset mount summary");
    console.log(`ok=${report.ok}`);
    console.log(`mode=${report.mode}`);
    console.log(`mutates=${report.mutates}`);
    console.log(`launches=${report.launches}`);
    console.log(`connectsToCdp=${report.connectsToCdp}`);
    console.log(`clicks=${report.clicks}`);
    console.log(`drags=${report.drags}`);
    console.log(`appliesTheme=${report.appliesTheme}`);
    console.log(`groups=${report.totals.groups}`);
    console.log(`items=${report.totals.items}`);
    console.log(`runtimeItems=${report.totals.runtimeItems}`);
    console.log(`previewItems=${report.totals.previewItems}`);
    console.log(`fitItems=${report.totals.fitItems}`);
    console.log(`unfitItems=${report.totals.unfitItems}`);
    console.log(`runtimeBytes=${report.totals.runtimeBytes}`);
    for (const group of report.groups) {
      console.log(`group=${group.id} mount=${group.mount} items=${group.itemCount}`);
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
  console.error(`[codex-interface-theme][asset-mount-summary] ${error.message}`);
  process.exit(1);
}
