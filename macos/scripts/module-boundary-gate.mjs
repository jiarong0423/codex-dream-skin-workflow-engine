#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SCRIPT_DIR = path.dirname(SCRIPT_PATH);
const ROOT_DIR = path.resolve(SCRIPT_DIR, "..");
const DEFAULT_MANIFEST = path.join(ROOT_DIR, "assets", "runtime-modules.json");
const REQUIRED_DYNAMIC_LOCKS = new Map([
  ["sourcePreviewBlocks", {
    forbiddenActions: ["drag", "resize", "fixed-coordinate-identity"],
    riskTags: ["high-memory-image-resize"]
  }],
  ["rightTopChips", {
    forbiddenActions: ["black-shell-fill", "duplicate-plate", "fixed-coordinate-identity"],
    riskTags: ["dynamic-chip-stack"]
  }],
  ["leftSidebarRows", {
    forbiddenActions: ["multi-select-paint", "duplicate-active-border", "fixed-coordinate-identity"],
    riskTags: ["native-selection-state"]
  }],
  ["projectPanelRows", {
    forbiddenActions: ["hide-action-icons", "duplicate-active-border", "fixed-coordinate-identity"],
    riskTags: ["dynamic-panel-width"]
  }],
  ["accountPopover", {
    forbiddenActions: ["click", "state-mutation", "permission-mutation", "logout", "fixed-coordinate-identity"],
    riskTags: ["account-state", "permission-state"]
  }],
  ["composerSurface", {
    forbiddenActions: ["full-width-overlay", "input-intercept", "fixed-coordinate-identity"],
    riskTags: ["text-input"]
  }],
  ["blackShellTransparency", {
    forbiddenActions: ["resize", "reposition", "transform", "overflow-change", "z-index-change", "fixed-coordinate-identity"],
    riskTags: ["official-black-shell", "dynamic-native-container"]
  }]
]);

function parseArgs(argv) {
  const options = { manifest: DEFAULT_MANIFEST, format: "text" };
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

function usage() {
  return "Usage: module-boundary-gate.mjs [--manifest <path>] [--format text|json]";
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function arrayOfStrings(value) {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string" && entry.length > 0);
}

function includesAll(actual, expected) {
  return expected.every((entry) => actual.includes(entry));
}

function validateDynamicBoundaryLocks(locks, errors, warnings) {
  if (!isObject(locks)) {
    errors.push("dynamicBoundaryLocks must be an object");
    return;
  }
  if (typeof locks.strategy !== "string" || locks.strategy.length === 0) {
    errors.push("dynamicBoundaryLocks.strategy must be a non-empty string");
  }
  if (!arrayOfStrings(locks.lockStateContract)) {
    errors.push("dynamicBoundaryLocks.lockStateContract must be a string array");
  }
  if (!arrayOfStrings(locks.invariants)) {
    errors.push("dynamicBoundaryLocks.invariants must be a string array");
  }
  if (!Array.isArray(locks.surfaces) || locks.surfaces.length === 0) {
    errors.push("dynamicBoundaryLocks.surfaces must be a non-empty array");
    return;
  }

  const surfacesById = new Map();
  for (const surface of locks.surfaces) {
    if (!isObject(surface)) {
      errors.push("dynamicBoundaryLocks surface entry must be an object");
      continue;
    }
    const surfaceId = String(surface.id || "");
    if (!surfaceId) {
      errors.push("dynamicBoundaryLocks surface id must be non-empty");
      continue;
    }
    if (surfacesById.has(surfaceId)) {
      errors.push(`duplicate dynamic boundary lock id: ${surfaceId}`);
    }
    surfacesById.set(surfaceId, surface);

    if (surface.owner !== "native") {
      errors.push(`dynamic boundary lock ${surfaceId} must be native-owned`);
    }
    if (typeof surface.lockKey !== "string" || !surface.lockKey.startsWith("data-cit-")) {
      errors.push(`dynamic boundary lock ${surfaceId} must use a namespaced data-cit-* lockKey`);
    }
    for (const key of ["sourceSignals", "allowedActions", "forbiddenActions", "riskTags"]) {
      if (!arrayOfStrings(surface[key])) {
        errors.push(`dynamic boundary lock ${surfaceId}.${key} must be a string array`);
      }
    }
    const forbiddenActions = Array.isArray(surface.forbiddenActions) ? surface.forbiddenActions : [];
    const allowedActions = Array.isArray(surface.allowedActions) ? surface.allowedActions : [];
    if (!forbiddenActions.includes("fixed-coordinate-identity")) {
      errors.push(`dynamic boundary lock ${surfaceId} must forbid fixed-coordinate-identity`);
    }
    if (allowedActions.some((action) => /paint|recolor|overlay|drag|resize|click/i.test(action))) {
      errors.push(`dynamic boundary lock ${surfaceId} allowedActions must stay non-mutating`);
    }
  }

  for (const [surfaceId, requirement] of REQUIRED_DYNAMIC_LOCKS.entries()) {
    const surface = surfacesById.get(surfaceId);
    if (!surface) {
      errors.push(`missing required dynamic boundary lock: ${surfaceId}`);
      continue;
    }
    const forbiddenActions = Array.isArray(surface.forbiddenActions) ? surface.forbiddenActions : [];
    const riskTags = Array.isArray(surface.riskTags) ? surface.riskTags : [];
    if (!includesAll(forbiddenActions, requirement.forbiddenActions)) {
      errors.push(`dynamic boundary lock ${surfaceId} missing forbidden actions: ${requirement.forbiddenActions.filter((entry) => !forbiddenActions.includes(entry)).join(",")}`);
    }
    if (!includesAll(riskTags, requirement.riskTags)) {
      errors.push(`dynamic boundary lock ${surfaceId} missing risk tags: ${requirement.riskTags.filter((entry) => !riskTags.includes(entry)).join(",")}`);
    }
  }

  const invariantText = Array.isArray(locks.invariants) ? locks.invariants.join(" ") : "";
  if (!/fixed coordinates are never identity/i.test(invariantText)) {
    warnings.push("dynamicBoundaryLocks should explicitly say fixed coordinates are never identity");
  }
}

function validateManifest(manifest) {
  const errors = [];
  const warnings = [];
  const boundaryPolicy = manifest.boundaryPolicy;
  const dynamicBoundaryLocks = manifest.dynamicBoundaryLocks;
  const profiles = manifest.boundaryProfiles;
  const modules = manifest.modules;
  const styleModules = manifest.styleModules;
  const styleEntry = String(manifest.styleEntry || "theme.css");
  const frameworkStyleEntry = String(manifest.frameworkStyleEntry || "theme-framework.css");

  if (!isObject(boundaryPolicy)) {
    errors.push("boundaryPolicy must be an object");
  } else {
    for (const key of ["identity", "geometryRole", "ownerRule", "lifecycleRule"]) {
      if (typeof boundaryPolicy[key] !== "string" || boundaryPolicy[key].length === 0) {
        errors.push(`boundaryPolicy.${key} must be a non-empty string`);
      }
    }
    if (!arrayOfStrings(boundaryPolicy.forbidden)) {
      errors.push("boundaryPolicy.forbidden must be a string array");
    }
  }
  validateDynamicBoundaryLocks(dynamicBoundaryLocks, errors, warnings);

  if (!isObject(profiles) || Object.keys(profiles).length === 0) {
    errors.push("boundaryProfiles must be a non-empty object");
  }

  const profileIds = new Set(Object.keys(profiles || {}));
  for (const [profileId, profile] of Object.entries(profiles || {})) {
    if (!isObject(profile)) {
      errors.push(`boundaryProfiles.${profileId} must be an object`);
      continue;
    }
    for (const key of ["identity", "geometry", "paint"]) {
      if (typeof profile[key] !== "string" || profile[key].length === 0) {
        errors.push(`boundaryProfiles.${profileId}.${key} must be a non-empty string`);
      }
    }
    if (!arrayOfStrings(profile.lifecycle)) {
      errors.push(`boundaryProfiles.${profileId}.lifecycle must be a string array`);
    }
  }

  if (!Array.isArray(modules) || modules.length === 0) {
    errors.push("modules must be a non-empty array");
  }
  if (!styleEntry || styleEntry.startsWith("/") || styleEntry.split(/[\\/]+/).includes("..")) {
    errors.push(`styleEntry has invalid path: ${styleEntry || "<empty>"}`);
  }
  if (!frameworkStyleEntry || frameworkStyleEntry.startsWith("/") || frameworkStyleEntry.split(/[\\/]+/).includes("..")) {
    errors.push(`frameworkStyleEntry has invalid path: ${frameworkStyleEntry || "<empty>"}`);
  }
  const moduleIds = new Set();
  for (const moduleConfig of modules || []) {
    if (!isObject(moduleConfig)) {
      errors.push("module entry must be an object");
      continue;
    }
    const moduleId = String(moduleConfig.id || "");
    if (!moduleId) {
      errors.push("module id must be non-empty");
      continue;
    }
    if (moduleIds.has(moduleId)) {
      errors.push(`duplicate module id: ${moduleId}`);
    }
    moduleIds.add(moduleId);
    const profileId = String(moduleConfig.boundaryProfile || "");
    if (!profileIds.has(profileId)) {
      errors.push(`module ${moduleId} references missing boundary profile: ${profileId || "<empty>"}`);
    }
  }

  const surfaceRegistry = (modules || []).find((moduleConfig) => moduleConfig && moduleConfig.id === "surfaceRegistry");
  if (!surfaceRegistry || surfaceRegistry.boundaryProfile !== "nativeBoundary") {
    errors.push("surfaceRegistry must use the nativeBoundary profile");
  }
  if (surfaceRegistry) {
    const eventPolicy = String(surfaceRegistry.eventPolicy || "");
    if (/MutationObserver/i.test(eventPolicy) && !/no MutationObserver/i.test(eventPolicy)) {
      errors.push("surfaceRegistry eventPolicy must not add a full-page MutationObserver");
    }
    if (/fixed geometry/i.test(eventPolicy) && !/no fixed geometry/i.test(eventPolicy)) {
      errors.push("surfaceRegistry eventPolicy must not use fixed geometry as identity");
    }
  }

  const nativeProfile = profiles && profiles.nativeBoundary;
  if (nativeProfile && (/fixed/i.test(String(nativeProfile.identity)) || String(nativeProfile.paint) !== "none")) {
    warnings.push("nativeBoundary profile should remain identity-only and paint-free");
  }

  for (const moduleConfig of Array.isArray(styleModules) ? styleModules : []) {
    const moduleId = String(moduleConfig && moduleConfig.id || "");
    const profileId = String(moduleConfig && moduleConfig.boundaryProfile || "");
    const modulePath = String(moduleConfig && moduleConfig.path || "");
    if (!moduleId) {
      errors.push("style module id must be non-empty");
    }
    if (!profileIds.has(profileId)) {
      errors.push(`style module ${moduleId || "<empty>"} references missing boundary profile: ${profileId || "<empty>"}`);
    }
    if (!modulePath || modulePath.startsWith("/") || modulePath.split(/[\\/]+/).includes("..")) {
      errors.push(`style module ${moduleId || "<empty>"} has invalid path: ${modulePath || "<empty>"}`);
    }
  }

  return {
    ok: errors.length === 0,
    manifest: path.resolve(String(manifest.__path || DEFAULT_MANIFEST)),
    moduleCount: modules ? modules.length : 0,
    styleModuleCount: Array.isArray(styleModules) ? styleModules.length : 0,
    profileCount: profiles ? Object.keys(profiles).length : 0,
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
  const manifestPath = path.resolve(String(options.manifest));
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const result = validateManifest({ ...manifest, __path: manifestPath });
  if (options.format === "json") {
    console.log(JSON.stringify(result, null, 2));
  } else if (options.format === "text") {
    console.log(`[codex-interface-theme] module boundary gate ${result.ok ? "passed" : "failed"}`);
    console.log(`modules=${result.moduleCount} styleModules=${result.styleModuleCount} profiles=${result.profileCount}`);
    for (const warning of result.warnings) {
      console.log(`warning=${warning}`);
    }
    for (const error of result.errors) {
      console.log(`error=${error}`);
    }
  } else {
    throw new Error(`unsupported format: ${options.format}`);
  }
  if (!result.ok) {
    process.exitCode = 1;
  }
}

try {
  main();
} catch (error) {
  console.error(`[codex-interface-theme][module-boundary-gate] ${error.message}`);
  process.exitCode = 1;
}
