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
  result.modules.composerShell = "css-reset";
  result.modules.composerSurface = "dom-class-only";
  result.modules.conversationSurface = "dom-class-only";
  result.modules.characterRetreat = "dom-geometry-only";
  result.modules.staticAccess = "cache-only";
  result.modules.surfaceRegistry = "shared-low-frequency-owner-lock";
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

function collectRetainedSourceAssets(assetsDir, configuredPaths) {
  const absoluteAssetsDir = path.resolve(assetsDir);
  const result = { paths: [], entries: [], errors: [] };
  for (const configuredPath of configuredPaths || []) {
    const value = String(configuredPath || "").trim();
    if (!value || path.isAbsolute(value)) {
      result.errors.push(`retained source asset must be a relative path: ${value || "<empty>"}`);
      continue;
    }
    let filePath = "";
    try {
      filePath = resolveAsset(absoluteAssetsDir, value, "retainedSourceAssets");
    } catch (error) {
      result.errors.push(String(error && error.message ? error.message : error));
      continue;
    }
    if (!existsFile(filePath)) {
      result.errors.push(`retained source asset missing file: ${value}`);
      continue;
    }
    result.paths.push(filePath);
    result.entries.push({ path: value.split(path.sep).join("/"), bytes: fileSize(filePath) });
  }
  return result;
}

function collectArchiveCandidates(assetsDir, referencedPaths, retainedSourcePaths) {
  const absoluteAssetsDir = path.resolve(assetsDir);
  const referenced = new Set(referencedPaths.map((filePath) => path.resolve(filePath)));
  const retained = new Set(retainedSourcePaths.map((filePath) => path.resolve(filePath)));
  return listFilesRecursive(absoluteAssetsDir)
    .filter((filePath) => /\.(png|jpe?g|gif|webp|svg)$/i.test(filePath))
    .map((filePath) => ({
      path: portableArchivePath(absoluteAssetsDir, filePath),
      absolutePath: path.resolve(filePath),
      bytes: fileSize(filePath),
      referenced: referenced.has(path.resolve(filePath))
    }))
    .filter((entry) => !entry.referenced && !retained.has(entry.absolutePath) && entry.bytes >= 512 * 1024 && !isRetiredArchiveCandidate(entry.path))
    .map(({ absolutePath: _absolutePath, ...entry }) => entry)
    .sort((left, right) => right.bytes - left.bytes)
    .slice(0, 20);
}

function matrixRow(scenario, expected, status, evidence) {
  return { scenario, expected, status, evidence };
}

function validRelativeAssetPath(value) {
  const relativePath = String(value || "");
  return Boolean(relativePath) && !path.isAbsolute(relativePath) && !relativePath.split(/[\\/]+/).includes("..");
}

function collectStyleModules(manifest, assetsDir) {
  const entries = [];
  const errors = [];
  for (const moduleConfig of Array.isArray(manifest.styleModules) ? manifest.styleModules : []) {
    const id = String(moduleConfig && moduleConfig.id || "");
    const relativePath = String(moduleConfig && moduleConfig.path || "");
    if (!id) {
      errors.push("style module id must be non-empty");
      continue;
    }
    if (!validRelativeAssetPath(relativePath)) {
      errors.push(`style module ${id} has invalid path: ${relativePath || "<empty>"}`);
      continue;
    }
    const filePath = path.join(assetsDir, relativePath);
    if (!fs.existsSync(filePath)) {
      errors.push(`style module ${id} is missing: ${relativePath}`);
      continue;
    }
    entries.push({
      id,
      path: relativePath,
      bytes: fileSize(filePath)
    });
  }
  return { entries, errors };
}

function collectStyleEntry(manifest, assetsDir, fieldName = "styleEntry", fallbackPath = "theme.css") {
  const relativePath = String(manifest[fieldName] || fallbackPath).trim();
  const errors = [];
  if (!validRelativeAssetPath(relativePath)) {
    return {
      path: relativePath || "",
      bytes: 0,
      errors: [`${fieldName} has invalid path: ${relativePath || "<empty>"}`]
    };
  }
  const filePath = path.join(assetsDir, relativePath);
  if (!fs.existsSync(filePath)) {
    errors.push(`${fieldName} is missing: ${relativePath}`);
  }
  return {
    path: relativePath,
    bytes: errors.length === 0 ? fileSize(filePath) : 0,
    errors
  };
}

function stripCssComments(css) {
  return String(css || "").replace(/\/\*[\s\S]*?\*\//g, "");
}

function collectSourcePreviewQuarantineCheck(manifest, assetsDir) {
  const styleModules = Array.isArray(manifest.styleModules) ? manifest.styleModules : [];
  const manifestModule = Array.isArray(manifest.modules) ? manifest.modules.find((moduleConfig) => moduleConfig && moduleConfig.id === "sourcePreviewQuarantine") : null;
  const styleModule = styleModules.find((moduleConfig) => moduleConfig && moduleConfig.id === "sourcePreviewQuarantine");
  const errors = [];
  const evidence = [];
  if (!manifestModule) {
    errors.push("sourcePreviewQuarantine runtime module is missing");
  }
  if (!styleModule) {
    errors.push("sourcePreviewQuarantine style module is missing");
    return { ok: false, evidence: "missing style module", errors };
  }
  const modulePath = String(styleModule.path || "");
  const filePath = path.join(assetsDir, modulePath);
  if (!validRelativeAssetPath(modulePath) || !existsFile(filePath)) {
    errors.push(`sourcePreviewQuarantine style module file is invalid: ${modulePath || "<empty>"}`);
    return { ok: false, evidence: `path=${modulePath || "<empty>"}`, errors };
  }
  const css = stripCssComments(fs.readFileSync(filePath, "utf8"));
  const forbiddenDeclarations = [
    /\bbackground\s*:/i,
    /\bbackground-color\s*:/i,
    /\bbackground-image\s*:/i,
    /\bbox-shadow\s*:/i,
    /\bcontain\s*:/i,
    /\bopacity\s*:/i,
    /\bpointer-events\s*:/i
  ];
  const forbidden = forbiddenDeclarations.filter((pattern) => pattern.test(css)).map((pattern) => String(pattern));
  if (forbidden.length > 0) {
    errors.push(`sourcePreviewQuarantine must stay reset-only; forbidden declarations found: ${forbidden.join(", ")}`);
  }
  if (!css.includes('[data-cit-source-preview-block="true"]')) {
    errors.push("sourcePreviewQuarantine must target data-cit-source-preview-block markers");
  } else {
    evidence.push("marker=data-cit-source-preview-block");
  }
  for (const requiredReset of ["backdrop-filter: none", "filter: none", "mix-blend-mode: normal", "transform: none"]) {
    if (!css.includes(requiredReset)) {
      errors.push(`sourcePreviewQuarantine missing reset: ${requiredReset}`);
    }
  }
  if (String(styleModule.boundaryProfile || "") !== "nativeQuarantine") {
    errors.push("sourcePreviewQuarantine style module must use nativeQuarantine profile");
  }
  if (manifestModule && String(manifestModule.loadPolicy || "") !== "styleModules.sourcePreviewQuarantine") {
    errors.push("sourcePreviewQuarantine runtime module must load through styleModules.sourcePreviewQuarantine");
  }
  evidence.push(`bytes=${fileSize(filePath)}`);
  evidence.push(`forbiddenDeclarations=${forbidden.length}`);
  return { ok: errors.length === 0, evidence: evidence.join(" "), errors };
}

function collectComposerShellCheck(manifest, assetsDir) {
  const styleModules = Array.isArray(manifest.styleModules) ? manifest.styleModules : [];
  const manifestModule = Array.isArray(manifest.modules) ? manifest.modules.find((moduleConfig) => moduleConfig && moduleConfig.id === "composerShell") : null;
  const styleModule = styleModules.find((moduleConfig) => moduleConfig && moduleConfig.id === "composerShell");
  const errors = [];
  const evidence = [];
  if (!manifestModule) {
    errors.push("composerShell runtime module is missing");
  }
  if (!styleModule) {
    errors.push("composerShell style module is missing");
    return { ok: false, evidence: "missing style module", errors };
  }
  const modulePath = String(styleModule.path || "");
  const filePath = path.join(assetsDir, modulePath);
  if (!validRelativeAssetPath(modulePath) || !existsFile(filePath)) {
    errors.push(`composerShell style module file is invalid: ${modulePath || "<empty>"}`);
    return { ok: false, evidence: `path=${modulePath || "<empty>"}`, errors };
  }
  const css = stripCssComments(fs.readFileSync(filePath, "utf8"));
  const requiredSelectors = [
    ".sticky.bottom-0",
    ".composer-surface-chrome",
    ".codex-interface-theme-composer-surface",
    ".codex-interface-theme-composer-native-fade"
  ];
  for (const selector of requiredSelectors) {
    if (!css.includes(selector)) {
      errors.push(`composerShell missing scoped selector: ${selector}`);
    }
  }
  const forbiddenSelectors = [
    "aside.app-shell-left-panel",
    "codex-interface-theme-project-panel",
    "thread-scroll-container",
    "codex-interface-theme-chat",
    "data-cit-source-preview-block",
    "body::",
    "main [class*=\"rounded\"]"
  ];
  const forbidden = forbiddenSelectors.filter((selector) => css.includes(selector));
  if (forbidden.length > 0) {
    errors.push(`composerShell must not target unrelated surfaces: ${forbidden.join(", ")}`);
  }
  if (!css.includes("background-image: none")) {
    errors.push("composerShell must remove native composer floor background images");
  }
  if (!css.includes("pointer-events: none") || !css.includes(".codex-interface-theme-composer-native-fade")) {
    errors.push("composerShell must make native fade non-interactive");
  }
  if (String(styleModule.boundaryProfile || "") !== "themeDom") {
    errors.push("composerShell style module must use themeDom profile");
  }
  if (manifestModule && String(manifestModule.loadPolicy || "") !== "styleModules.composerShell") {
    errors.push("composerShell runtime module must load through styleModules.composerShell");
  }
  evidence.push(`bytes=${fileSize(filePath)}`);
  evidence.push(`forbiddenSelectors=${forbidden.length}`);
  return { ok: errors.length === 0, evidence: evidence.join(" "), errors };
}

function collectBlackShellTransparencyCheck(manifest, assetsDir) {
  const styleModules = Array.isArray(manifest.styleModules) ? manifest.styleModules : [];
  const manifestModule = Array.isArray(manifest.modules) ? manifest.modules.find((moduleConfig) => moduleConfig && moduleConfig.id === "blackShellTransparency") : null;
  const styleModule = styleModules.find((moduleConfig) => moduleConfig && moduleConfig.id === "blackShellTransparency");
  const errors = [];
  const evidence = [];
  if (!manifestModule) {
    errors.push("blackShellTransparency runtime module is missing");
  }
  if (!styleModule) {
    errors.push("blackShellTransparency style module is missing");
    return { ok: false, evidence: "missing style module", errors };
  }
  const modulePath = String(styleModule.path || "");
  const filePath = path.join(assetsDir, modulePath);
  if (!validRelativeAssetPath(modulePath) || !existsFile(filePath)) {
    errors.push(`blackShellTransparency style module file is invalid: ${modulePath || "<empty>"}`);
    return { ok: false, evidence: `path=${modulePath || "<empty>"}`, errors };
  }
  const css = stripCssComments(fs.readFileSync(filePath, "utf8"));
  const marker = '[data-cit-black-shell="true"]';
  if (!css.includes(marker)) {
    errors.push("blackShellTransparency must target data-cit-black-shell markers");
  } else {
    evidence.push("marker=data-cit-black-shell");
  }
  const forbiddenDeclarations = [
    /\b(?:min-|max-)?width\s*:/i,
    /\b(?:min-|max-)?height\s*:/i,
    /\bposition\s*:/i,
    /\btransform\s*:/i,
    /\boverflow(?:-[xy])?\s*:/i,
    /\bz-index\s*:/i,
    /\binset\s*:/i,
    /\b(?:top|right|bottom|left)\s*:/i,
    /\bpointer-events\s*:/i,
    /\bopacity\s*:/i
  ];
  const forbidden = forbiddenDeclarations.filter((pattern) => pattern.test(css)).map((pattern) => String(pattern));
  if (forbidden.length > 0) {
    errors.push(`blackShellTransparency must not change layout or event behavior: ${forbidden.join(", ")}`);
  }
  for (const required of ["background-color:", "background-image: none", "backdrop-filter: none"]) {
    if (!css.includes(required)) {
      errors.push(`blackShellTransparency missing alpha-only shell rule: ${required}`);
    }
  }
  for (const requiredCssToken of [
    "cit-black-shell-fill",
    "cit-glass-shell-line",
    "cit-glass-shell-edge",
    "cit-glass-shell-shadow"
  ]) {
    if (!css.includes(requiredCssToken)) {
      errors.push(`blackShellTransparency missing marker material token: ${requiredCssToken}`);
    }
  }
  for (const forbiddenCssSelector of [
    "bg-token-main-surface-primary",
    "bg-token-dropdown-background",
    "aside.app-shell-left-panel",
    "[role=\"dialog\"]",
    "[role=\"menu\"]",
    "[role=\"listbox\"]",
    "[data-radix-popper-content-wrapper]",
    "main:has(",
    "main :is(input"
  ]) {
    if (css.includes(forbiddenCssSelector)) {
      errors.push(`blackShellTransparency must stay marker-only: ${forbiddenCssSelector}`);
    }
  }
  const registryPath = path.join(assetsDir, "surface-registry.js");
  const registry = existsFile(registryPath) ? fs.readFileSync(registryPath, "utf8") : "";
  if (!registry.includes("BLACK_SHELL_EXCLUDE_SELECTOR")) {
    errors.push("surface registry must define black shell primitive exclusions");
  }
  for (const requiredRegistryToken of [
    "BLACK_SHELL_PROTECTED_SELECTOR",
    "BLACK_SHELL_PROTECTED_ANCESTOR_SELECTOR",
    "protectedBlackShellSurface",
    "cleanupOwnBlackShellResidue",
    "runBlackShellPreflight",
    "BLACK_SHELL_SETTLE_DELAY_MS",
    "scheduleBlackShellScan",
    "scanBlackShells",
    "root.dataset.citSurfacePreflight",
    "root.dataset.citProtectedSurfaces"
  ]) {
    if (!registry.includes(requiredRegistryToken)) {
      errors.push(`black shell scanner missing preflight contract token: ${requiredRegistryToken}`);
    }
  }
  const preflightIndex = registry.indexOf("runBlackShellPreflight(reason)");
  const markIndex = registry.indexOf("markBlackShells(reason)");
  if (preflightIndex < 0 || markIndex < 0 || preflightIndex > markIndex) {
    errors.push("black shell scanner must run preflight cleanup and protected exclusions before marking shell layers");
  }
  const interactionHandlerStart = registry.indexOf("function triggerDynamicSurfaceScan");
  const interactionHandlerEnd = registry.indexOf("function installDynamicSurfaceHooks");
  const interactionHandler = registry.slice(interactionHandlerStart, interactionHandlerEnd);
  if (interactionHandler.includes("scanBlackShells") || interactionHandler.includes("markBlackShells")) {
    errors.push("black shell scanner must not run from interaction hooks");
  }
  for (const excludedPrimitive of ["iframe", "canvas", "video", "[contenteditable=\\\"true\\\"]", "[data-cit-source-preview-block=\\\"true\\\"]", "[role=\\\"dialog\\\"]", "[role=\\\"menu\\\"]", "[role=\\\"listbox\\\"]", "[data-radix-popper-content-wrapper]", "[data-cmdk-root]"]) {
    if (!registry.includes(excludedPrimitive)) {
      errors.push(`black shell scanner missing primitive exclusion: ${excludedPrimitive}`);
    }
  }
  if (registry.includes("MutationObserver")) {
    errors.push("black shell scanner must not introduce MutationObserver");
  }
  if (/\.remove\s*\(/.test(registry)) {
    errors.push("surface registry preflight must not delete native DOM nodes");
  }
  if (String(styleModule.boundaryProfile || "") !== "nativeQuarantine") {
    errors.push("blackShellTransparency style module must use nativeQuarantine profile");
  }
  if (manifestModule && String(manifestModule.loadPolicy || "") !== "styleModules.blackShellTransparency") {
    errors.push("blackShellTransparency runtime module must load through styleModules.blackShellTransparency");
  }
  evidence.push(`bytes=${fileSize(filePath)}`);
  evidence.push(`forbiddenDeclarations=${forbidden.length}`);
  return { ok: errors.length === 0, evidence: evidence.join(" "), errors };
}

function buildMatrix(stateDir, assetsDir) {
  const absoluteAssetsDir = path.resolve(assetsDir);
  const defaultThemePath = path.join(absoluteAssetsDir, "theme.json");
  const activeThemePath = path.join(path.resolve(stateDir), "themes", "active.json");
  const manifestPath = path.join(absoluteAssetsDir, "runtime-modules.json");
  const rendererPath = path.join(absoluteAssetsDir, "renderer-inject.js");
  const manifest = readJson(manifestPath);
  const styleEntry = collectStyleEntry(manifest, absoluteAssetsDir, "styleEntry", "theme.css");
  const frameworkStyleEntry = collectStyleEntry(manifest, absoluteAssetsDir, "frameworkStyleEntry", "theme-framework.css");
  const carrierStyleEntry = collectStyleEntry(manifest, absoluteAssetsDir, "carrierStyleEntry", "theme-carrier.css");
  const controlStyleEntry = collectStyleEntry(manifest, absoluteAssetsDir, "controlStyleEntry", "theme-control.css");
  const styleModules = collectStyleModules(manifest, absoluteAssetsDir);
  const defaultTheme = readJson(defaultThemePath);
  const activeTheme = fs.existsSync(activeThemePath) ? readJson(activeThemePath) : defaultTheme;
  const defaultPlan = collectThemePlan(defaultTheme, absoluteAssetsDir, "default-theme");
  const activePlan = collectThemePlan(activeTheme, absoluteAssetsDir, "active-theme");
  const budgets = manifest.budgets || {};
  const styleModuleBytes = styleModules.entries.reduce((sum, entry) => sum + entry.bytes, 0);
  const cssBytes = styleEntry.bytes + styleModuleBytes;
  const frameworkCssBytes = frameworkStyleEntry.bytes + styleModuleBytes;
  const carrierCssBytes = carrierStyleEntry.bytes + styleModuleBytes;
  const controlCssBytes = controlStyleEntry.bytes;
  const rendererBytes = fileSize(rendererPath);
  const controlRendererPath = resolveAsset(absoluteAssetsDir, manifest.controlRendererEntry || "renderer-control.js", "controlRendererEntry");
  const controlRendererErrors = existsFile(controlRendererPath) ? [] : [`controlRendererEntry missing file: ${controlRendererPath}`];
  const controlRendererBytes = controlRendererErrors.length === 0 ? fileSize(controlRendererPath) : 0;
  const controlRendererSource = controlRendererErrors.length === 0 ? fs.readFileSync(controlRendererPath, "utf8") : "";
  const requiredModules = new Set(["background", "iconBadge", "character", "characterRetreat", "staticAccess", "surfaceRegistry", "sourcePreviewBlocks", "sourcePreviewQuarantine", "blackShellTransparency", "collisionScheduler", "tableFlipCat", "buttonGlyphs", "composerShell", "projectPanels", "composerSurface", "conversationSurface", "controlWorkbench"]);
  const declaredModules = new Set((manifest.modules || []).map((moduleConfig) => moduleConfig.id));
  const missingModules = Array.from(requiredModules).filter((id) => !declaredModules.has(id));
  const referencedPaths = [...defaultPlan.assets, ...activePlan.assets].map((asset) => asset.path);
  const retainedSourceAssets = collectRetainedSourceAssets(absoluteAssetsDir, manifest.retainedSourceAssets);
  const archiveCandidates = collectArchiveCandidates(absoluteAssetsDir, referencedPaths, retainedSourceAssets.paths);
  const sourcePreviewQuarantine = collectSourcePreviewQuarantineCheck(manifest, absoluteAssetsDir);
  const composerShell = collectComposerShellCheck(manifest, absoluteAssetsDir);
  const blackShellTransparency = collectBlackShellTransparencyCheck(manifest, absoluteAssetsDir);
  const errors = [...defaultPlan.errors, ...activePlan.errors, ...retainedSourceAssets.errors, ...styleEntry.errors, ...frameworkStyleEntry.errors, ...carrierStyleEntry.errors, ...controlStyleEntry.errors, ...styleModules.errors, ...controlRendererErrors, ...sourcePreviewQuarantine.errors, ...composerShell.errors, ...blackShellTransparency.errors];
  if (missingModules.length > 0) {
    errors.push(`runtime module manifest missing: ${missingModules.join(", ")}`);
  }
  if (cssBytes > Number(budgets.themeCssBytes || 0)) {
    errors.push(`style CSS bundle exceeds budget: ${cssBytes}`);
  }
  if (frameworkCssBytes > Number(budgets.themeCssBytes || 0)) {
    errors.push(`framework CSS bundle exceeds budget: ${frameworkCssBytes}`);
  }
  if (carrierCssBytes > Number(budgets.themeCssBytes || 0)) {
    errors.push(`carrier CSS bundle exceeds budget: ${carrierCssBytes}`);
  }
  if (controlCssBytes > Number(budgets.themeCssBytes || 0)) {
    errors.push(`control CSS bundle exceeds budget: ${controlCssBytes}`);
  }
  if (rendererBytes > Number(budgets.rendererBytes || 0)) {
    errors.push(`renderer-inject.js exceeds budget: ${rendererBytes}`);
  }
  if (controlRendererBytes > Number(budgets.rendererBytes || 0)) {
    errors.push(`renderer-control.js exceeds budget: ${controlRendererBytes}`);
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
      `modules=${declaredModules.size} styleEntry=${styleEntry.path} css=${cssBytes} renderer=${rendererBytes}`
    ),
    matrixRow(
      "active-theme",
      "active theme is normalized before payload planning",
      activePlan.errors.length === 0 && Boolean(activePlan.normalizedTableFlipCat.spritePath) ? "passed" : "blocked",
      `payloadBytes=${activePlan.payloadBytes} spritePath=${activePlan.normalizedTableFlipCat.spritePath}`
    ),
    matrixRow(
      "framework-only",
      "owner-lock and quarantine style entry has no visual asset payload",
      frameworkStyleEntry.errors.length === 0 && frameworkCssBytes <= Number(budgets.themeCssBytes || Infinity) ? "passed" : "blocked",
      `frameworkStyleEntry=${frameworkStyleEntry.path} css=${frameworkCssBytes} visualAssets=0`
    ),
    matrixRow(
      "carrier-only",
      "structural carrier template has no visual, animation, or button asset payload",
      carrierStyleEntry.errors.length === 0 && carrierCssBytes <= Number(budgets.themeCssBytes || Infinity) ? "passed" : "blocked",
      `carrierStyleEntry=${carrierStyleEntry.path} css=${carrierCssBytes} visualAssets=0`
    ),
    matrixRow(
      "control-only",
      "atomic control workbench uses isolated CSS and renderer with no visual payload or surface registry",
      controlStyleEntry.errors.length === 0
        && controlRendererErrors.length === 0
        && controlCssBytes <= Number(budgets.themeCssBytes || Infinity)
        && controlRendererBytes <= Number(budgets.rendererBytes || Infinity)
        && controlRendererSource.includes("codex-interface-theme-control-workbench")
        && controlRendererSource.includes("plan only; no shell execution from renderer")
        && !/fetch\s*\(|WebSocket|child_process/.test(controlRendererSource)
        ? "passed"
        : "blocked",
      `controlStyleEntry=${controlStyleEntry.path} css=${controlCssBytes} renderer=${controlRendererBytes} visualAssets=0 styleModules=0 surfaceRegistry=0`
    ),
    matrixRow(
      "source-preview-quarantine",
      "source preview reset module is marker-owned and cannot repaint thumbnails",
      sourcePreviewQuarantine.ok ? "passed" : "blocked",
      sourcePreviewQuarantine.evidence
    ),
    matrixRow(
      "black-shell-transparency",
      "official near-black shell backgrounds are alpha-only and layout-safe",
      blackShellTransparency.ok ? "passed" : "blocked",
      blackShellTransparency.evidence
    ),
    matrixRow(
      "composer-shell",
      "composer shell reset is native-size and scoped to the bottom composer dock",
      composerShell.ok ? "passed" : "blocked",
      composerShell.evidence
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
      "retained-source-assets",
      "declared design sources exist and remain outside the active runtime payload",
      retainedSourceAssets.errors.length === 0 ? "passed" : "blocked",
      `count=${retainedSourceAssets.entries.length}`
    ),
    matrixRow(
      "archive-candidates",
      "unclassified unused heavy assets are reported only",
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
      currentFrameworkCssBytes: frameworkCssBytes,
      currentCarrierCssBytes: carrierCssBytes,
      currentControlCssBytes: controlCssBytes,
      currentRendererBytes: rendererBytes,
      currentControlRendererBytes: controlRendererBytes,
      activePayloadBytes: activePlan.payloadBytes
    },
    styleEntry,
    frameworkStyleEntry,
    carrierStyleEntry,
    controlStyleEntry,
    styleModules: styleModules.entries,
    rows,
    plans: {
      defaultTheme: defaultPlan,
      activeTheme: activePlan
    },
    retainedSourceAssets: retainedSourceAssets.entries,
    archiveCandidates,
    errors
  };
}

function formatText(report) {
  const lines = [];
  lines.push("[codex-interface-theme] module matrix");
  lines.push(`ok=${report.ok}`);
  lines.push(`policy=${report.policy.principle || ""}`);
  lines.push(`budgets themeCss=${report.budgets.currentThemeCssBytes}/${report.budgets.themeCssBytes} frameworkCss=${report.budgets.currentFrameworkCssBytes}/${report.budgets.themeCssBytes} carrierCss=${report.budgets.currentCarrierCssBytes}/${report.budgets.themeCssBytes} controlCss=${report.budgets.currentControlCssBytes}/${report.budgets.themeCssBytes} renderer=${report.budgets.currentRendererBytes}/${report.budgets.rendererBytes} controlRenderer=${report.budgets.currentControlRendererBytes}/${report.budgets.rendererBytes} payload=${report.budgets.activePayloadBytes}/${report.budgets.runtimePayloadBytes}`);
  lines.push(`style entry=${report.styleEntry.path} bytes=${report.styleEntry.bytes}`);
  lines.push(`framework style entry=${report.frameworkStyleEntry.path} bytes=${report.frameworkStyleEntry.bytes}`);
  lines.push(`carrier style entry=${report.carrierStyleEntry.path} bytes=${report.carrierStyleEntry.bytes}`);
  lines.push(`control style entry=${report.controlStyleEntry.path} bytes=${report.controlStyleEntry.bytes}`);
  lines.push("matrix:");
  for (const row of report.rows) {
    lines.push(`- ${row.status} ${row.scenario}: ${row.evidence}`);
  }
  lines.push("active modules:");
  for (const [moduleId, state] of Object.entries(report.plans.activeTheme.modules)) {
    lines.push(`- ${moduleId}=${state}`);
  }
  lines.push(`retained source assets=${report.retainedSourceAssets.length}`);
  if (report.styleModules.length > 0) {
    lines.push("style modules:");
    for (const moduleConfig of report.styleModules) {
      lines.push(`- ${moduleConfig.id}=${moduleConfig.bytes} ${moduleConfig.path}`);
    }
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
