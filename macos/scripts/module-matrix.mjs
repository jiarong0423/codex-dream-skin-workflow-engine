#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { applyRuntimeDefaults } from "./theme-runtime-defaults.mjs";

function usage() {
  return `Usage:
  module-matrix.mjs --state-dir <dir> --assets-dir <dir> [--format text|json]`;
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

function requireOption(options, name) {
  const value = options[name];
  if (!value) {
    throw new Error(`missing required option --${name}`);
  }
  return value;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function fileSize(filePath) {
  const stat = fs.statSync(filePath);
  if (!stat.isFile()) {
    throw new Error(`not a file: ${filePath}`);
  }
  return stat.size;
}

function resolveAsset(assetsDir, assetPath, fieldName) {
  const value = String(assetPath || "").trim();
  if (!value) {
    return "";
  }
  if (path.isAbsolute(value)) {
    return value;
  }
  const absolutePath = path.resolve(assetsDir, value);
  const assetRoot = `${path.resolve(assetsDir)}${path.sep}`;
  if (absolutePath !== path.resolve(assetsDir) && !absolutePath.startsWith(assetRoot)) {
    throw new Error(`${fieldName} escapes assets: ${value}`);
  }
  return absolutePath;
}

function existsFile(filePath) {
  return Boolean(filePath) && fs.existsSync(filePath) && fs.statSync(filePath).isFile();
}

function portableArchivePath(assetsDir, filePath) {
  const relativeToCwd = path.relative(process.cwd(), filePath);
  const safeRelative = relativeToCwd && !relativeToCwd.startsWith("..") && !path.isAbsolute(relativeToCwd)
    ? relativeToCwd
    : path.relative(assetsDir, filePath);
  return safeRelative.split(path.sep).join("/");
}

const RETIRED_BACKGROUND_ARCHIVE_BASENAME = ["matrix", "cyberpunk", "orange", "cat"].join("-") + ".png";

function isRetiredArchiveCandidate(archivePath) {
  return archivePath.endsWith(`backgrounds/${RETIRED_BACKGROUND_ARCHIVE_BASENAME}`);
}

function addAsset(result, id, filePath, role) {
  if (!filePath) {
    return;
  }
  if (!existsFile(filePath)) {
    result.errors.push(`${id}:${role} missing file: ${filePath}`);
    return;
  }
  const size = fileSize(filePath);
  result.assets.push({
    module: id,
    role,
    path: filePath,
    bytes: size
  });
  result.payloadBytes += size;
}

function buttonModulesEnabled(buttons) {
  const modules = buttons.modules && typeof buttons.modules === "object" ? buttons.modules : {};
  return Object.values(modules).some((moduleConfig) => moduleConfig && typeof moduleConfig === "object" && moduleConfig.enabled === true);
}

function collectThemePlan(theme, assetsDir, label) {
  const normalized = applyRuntimeDefaults(theme);
  const icons = normalized.icons || {};
  const result = {
    label,
    mode: normalized.mode || "",
    modules: {},
    assets: [],
    payloadBytes: 0,
    warnings: [],
    errors: []
  };

  if (normalized.backgroundImagePath) {
    result.modules.background = "enabled";
    addAsset(result, "background", path.resolve(normalized.backgroundImagePath), "backgroundImagePath");
  } else {
    result.modules.background = "off";
  }

  const badge = icons.badge || {};
  if (badge.enabled === true && String(badge.placement || "") !== "off") {
    result.modules.iconBadge = "enabled";
    addAsset(result, "iconBadge", resolveAsset(assetsDir, badge.path, "icons.badge.path"), "badge");
  } else {
    result.modules.iconBadge = "off";
  }

  const character = icons.character || {};
  if (character.enabled === true && String(character.placement || "") !== "off") {
    result.modules.character = "enabled";
    addAsset(result, "character", resolveAsset(assetsDir, character.path, "icons.character.path"), "character");
  } else {
    result.modules.character = "off";
  }

  const tableFlipCat = icons.tableFlipCat || {};
  if (tableFlipCat.enabled === true && String(tableFlipCat.placement || "") !== "off") {
    result.modules.tableFlipCat = "enabled";
    const spritePath = resolveAsset(assetsDir, tableFlipCat.spritePath, "icons.tableFlipCat.spritePath");
    const triggerPath = resolveAsset(assetsDir, tableFlipCat.triggerIconPath, "icons.tableFlipCat.triggerIconPath");
    const gifPath = resolveAsset(assetsDir, tableFlipCat.path, "icons.tableFlipCat.path");
    if (existsFile(spritePath)) {
      result.modules.tableFlipCatLoad = "static-cache-click";
      addAsset(result, "tableFlipCat", spritePath, "sprite");
      addAsset(result, "tableFlipCat", triggerPath, "triggerIcon");
      if (existsFile(gifPath)) {
        result.warnings.push("tableFlipCat GIF exists but is fallback-only and not counted in payload");
      }
    } else {
      result.modules.tableFlipCatLoad = "gif-fallback-blocked";
      result.errors.push(`tableFlipCat sprite missing; fail closed before GIF fallback: ${spritePath}`);
    }
  } else {
    result.modules.tableFlipCat = "off";
  }

  const buttons = icons.buttons || {};
  if (buttons.enabled === true && String(buttons.applyMode || "") === "module" && buttonModulesEnabled(buttons)) {
    result.modules.buttonGlyphs = "enabled";
    const paths = buttons.paths && typeof buttons.paths === "object" ? buttons.paths : {};
    for (const [key, assetPath] of Object.entries(paths)) {
      addAsset(result, "buttonGlyphs", resolveAsset(assetsDir, assetPath, `icons.buttons.paths.${key}`), key);
    }
  } else {
    result.modules.buttonGlyphs = "off";
  }

  result.modules.projectPanels = "dom-class-only";
  result.modules.composerSurface = "dom-class-only";
  result.modules.conversationSurface = "dom-class-only";
  result.modules.characterRetreat = "dom-geometry-only";
  result.modules.staticAccess = "cache-only";
  result.modules.collisionScheduler = "shared-low-frequency";
  result.normalizedTableFlipCat = {
    path: tableFlipCat.path || "",
    spritePath: tableFlipCat.spritePath || "",
    posterPath: tableFlipCat.posterPath || "",
    triggerIconPath: tableFlipCat.triggerIconPath || "",
    frameCount: tableFlipCat.frameCount || 0,
    durationMs: tableFlipCat.durationMs || 0
  };
  return result;
}

function listFilesRecursive(rootDir) {
  const result = [];
  if (!fs.existsSync(rootDir)) {
    return result;
  }
  const stack = [rootDir];
  while (stack.length > 0) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile()) {
        result.push(fullPath);
      }
    }
  }
  return result.sort();
}

function collectArchiveCandidates(assetsDir, referencedPaths) {
  const absoluteAssetsDir = path.resolve(assetsDir);
  const referenced = new Set(referencedPaths.map((filePath) => path.resolve(filePath)));
  return listFilesRecursive(absoluteAssetsDir)
    .filter((filePath) => /\.(png|jpe?g|gif|webp|svg)$/i.test(filePath))
    .map((filePath) => ({
      path: portableArchivePath(absoluteAssetsDir, filePath),
      bytes: fileSize(filePath),
      referenced: referenced.has(path.resolve(filePath))
    }))
    .filter((entry) => !entry.referenced && entry.bytes >= 512 * 1024 && !isRetiredArchiveCandidate(entry.path))
    .sort((left, right) => right.bytes - left.bytes)
    .slice(0, 20);
}

function matrixRow(scenario, expected, status, evidence) {
  return { scenario, expected, status, evidence };
}

function buildMatrix(stateDir, assetsDir) {
  const absoluteAssetsDir = path.resolve(assetsDir);
  const defaultThemePath = path.join(absoluteAssetsDir, "theme.json");
  const activeThemePath = path.join(path.resolve(stateDir), "themes", "active.json");
  const manifestPath = path.join(absoluteAssetsDir, "runtime-modules.json");
  const cssPath = path.join(absoluteAssetsDir, "theme.css");
  const rendererPath = path.join(absoluteAssetsDir, "renderer-inject.js");
  const manifest = readJson(manifestPath);
  const defaultTheme = readJson(defaultThemePath);
  const activeTheme = fs.existsSync(activeThemePath) ? readJson(activeThemePath) : defaultTheme;
  const defaultPlan = collectThemePlan(defaultTheme, absoluteAssetsDir, "default-theme");
  const activePlan = collectThemePlan(activeTheme, absoluteAssetsDir, "active-theme");
  const budgets = manifest.budgets || {};
  const cssBytes = fileSize(cssPath);
  const rendererBytes = fileSize(rendererPath);
  const requiredModules = new Set(["background", "iconBadge", "character", "characterRetreat", "staticAccess", "collisionScheduler", "tableFlipCat", "buttonGlyphs", "projectPanels", "composerSurface", "conversationSurface"]);
  const declaredModules = new Set((manifest.modules || []).map((moduleConfig) => moduleConfig.id));
  const missingModules = Array.from(requiredModules).filter((id) => !declaredModules.has(id));
  const referencedPaths = [...defaultPlan.assets, ...activePlan.assets].map((asset) => asset.path);
  const archiveCandidates = collectArchiveCandidates(absoluteAssetsDir, referencedPaths);
  const errors = [...defaultPlan.errors, ...activePlan.errors];
  if (missingModules.length > 0) {
    errors.push(`runtime module manifest missing: ${missingModules.join(", ")}`);
  }
  if (cssBytes > Number(budgets.themeCssBytes || 0)) {
    errors.push(`theme.css exceeds budget: ${cssBytes}`);
  }
  if (rendererBytes > Number(budgets.rendererBytes || 0)) {
    errors.push(`renderer-inject.js exceeds budget: ${rendererBytes}`);
  }
  if (activePlan.payloadBytes > Number(budgets.runtimePayloadBytes || 0)) {
    errors.push(`active runtime payload exceeds budget: ${activePlan.payloadBytes}`);
  }

  const disabledTableTheme = applyRuntimeDefaults(activeTheme);
  disabledTableTheme.icons.tableFlipCat.enabled = false;
  const disabledTablePlan = collectThemePlan(disabledTableTheme, absoluteAssetsDir, "table-flip-disabled");
  const disabledButtonsTheme = applyRuntimeDefaults(activeTheme);
  disabledButtonsTheme.icons.buttons.enabled = false;
  const disabledButtonsPlan = collectThemePlan(disabledButtonsTheme, absoluteAssetsDir, "button-glyphs-disabled");

  const rows = [
    matrixRow(
      "default-theme",
      "manifest and file budgets pass",
      missingModules.length === 0 && defaultPlan.errors.length === 0 && cssBytes <= Number(budgets.themeCssBytes || Infinity) && rendererBytes <= Number(budgets.rendererBytes || Infinity) ? "passed" : "blocked",
      `modules=${declaredModules.size} css=${cssBytes} renderer=${rendererBytes}`
    ),
    matrixRow(
      "active-theme",
      "active theme is normalized before payload planning",
      activePlan.errors.length === 0 && Boolean(activePlan.normalizedTableFlipCat.spritePath) ? "passed" : "blocked",
      `payloadBytes=${activePlan.payloadBytes} spritePath=${activePlan.normalizedTableFlipCat.spritePath}`
    ),
    matrixRow(
      "table-flip-enabled",
      "sprite is read from static cache only after trigger click",
      activePlan.modules.tableFlipCat === "enabled" && activePlan.modules.tableFlipCatLoad === "static-cache-click" ? "passed" : "blocked",
      `load=${activePlan.modules.tableFlipCatLoad || "off"} durationMs=${activePlan.normalizedTableFlipCat.durationMs}`
    ),
    matrixRow(
      "table-flip-disabled",
      "table flip payload assets are absent when disabled",
      disabledTablePlan.assets.some((asset) => asset.module === "tableFlipCat") ? "blocked" : "passed",
      `tableAssets=${disabledTablePlan.assets.filter((asset) => asset.module === "tableFlipCat").length}`
    ),
    matrixRow(
      "button-glyphs-disabled",
      "button SVG payload is absent when disabled",
      disabledButtonsPlan.assets.some((asset) => asset.module === "buttonGlyphs") ? "blocked" : "passed",
      `buttonAssets=${disabledButtonsPlan.assets.filter((asset) => asset.module === "buttonGlyphs").length}`
    ),
    matrixRow(
      "asset-budget",
      "active planned payload stays within runtime budget",
      activePlan.payloadBytes <= Number(budgets.runtimePayloadBytes || Infinity) ? "passed" : "blocked",
      `payloadBytes=${activePlan.payloadBytes} budget=${budgets.runtimePayloadBytes}`
    ),
    matrixRow(
      "archive-candidates",
      "unused heavy assets are reported only",
      archiveCandidates.length > 0 ? "warning" : "passed",
      `count=${archiveCandidates.length}`
    )
  ];

  return {
    ok: errors.length === 0 && rows.every((row) => row.status !== "blocked"),
    policy: manifest.policy || {},
    budgets: {
      themeCssBytes: budgets.themeCssBytes,
      rendererBytes: budgets.rendererBytes,
      runtimePayloadBytes: budgets.runtimePayloadBytes,
      currentThemeCssBytes: cssBytes,
      currentRendererBytes: rendererBytes,
      activePayloadBytes: activePlan.payloadBytes
    },
    rows,
    plans: {
      defaultTheme: defaultPlan,
      activeTheme: activePlan
    },
    archiveCandidates,
    errors
  };
}

function formatText(report) {
  const lines = [];
  lines.push("[codex-interface-theme] module matrix");
  lines.push(`ok=${report.ok}`);
  lines.push(`policy=${report.policy.principle || ""}`);
  lines.push(`budgets themeCss=${report.budgets.currentThemeCssBytes}/${report.budgets.themeCssBytes} renderer=${report.budgets.currentRendererBytes}/${report.budgets.rendererBytes} payload=${report.budgets.activePayloadBytes}/${report.budgets.runtimePayloadBytes}`);
  lines.push("matrix:");
  for (const row of report.rows) {
    lines.push(`- ${row.status} ${row.scenario}: ${row.evidence}`);
  }
  lines.push("active modules:");
  for (const [moduleId, state] of Object.entries(report.plans.activeTheme.modules)) {
    lines.push(`- ${moduleId}=${state}`);
  }
  if (report.archiveCandidates.length > 0) {
    lines.push("archive candidates:");
    for (const candidate of report.archiveCandidates.slice(0, 8)) {
      lines.push(`- ${candidate.bytes} ${candidate.path}`);
    }
  }
  if (report.errors.length > 0) {
    lines.push("errors:");
    for (const error of report.errors) {
      lines.push(`- ${error}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

function main() {
  const options = parseArgs(process.argv);
  if (options.help) {
    console.log(usage());
    return;
  }
  const stateDir = requireOption(options, "state-dir");
  const assetsDir = requireOption(options, "assets-dir");
  const report = buildMatrix(stateDir, assetsDir);
  if (options.format === "json") {
    console.log(JSON.stringify(report, null, 2));
  } else if (options.format === "text") {
    process.stdout.write(formatText(report));
  } else {
    throw new Error(`unsupported format: ${options.format}`);
  }
  if (!report.ok) {
    process.exitCode = 1;
  }
}

try {
  main();
} catch (error) {
  console.error(`[codex-interface-theme][error] ${error.message}`);
  process.exitCode = 1;
}
