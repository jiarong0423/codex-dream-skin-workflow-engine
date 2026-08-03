#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname);
const ROOT_DIR = path.resolve(SCRIPT_DIR, "..");
export const DEFAULT_RUNTIME_MANIFEST = path.join(ROOT_DIR, "assets", "runtime-modules.json");

function usage() {
  return `Usage:
  dynamic-boundary-coverage.mjs [--runtime-manifest <path>] [--fixture fields|candidates] [--format text|json]

Runs an offline coverage smoke against synthetic native UI records. It never
connects to CDP, clicks, drags, launches, restores, deletes, or changes state.`;
}

function parseArgs(argv) {
  const options = { runtimeManifest: DEFAULT_RUNTIME_MANIFEST, fixture: "fields", format: "text" };
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

function norm(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

export function readDynamicBoundaryLocks(manifestPath = DEFAULT_RUNTIME_MANIFEST) {
  const resolvedPath = path.resolve(manifestPath || DEFAULT_RUNTIME_MANIFEST);
  const manifest = JSON.parse(fs.readFileSync(resolvedPath, "utf8"));
  const locks = manifest.dynamicBoundaryLocks && Array.isArray(manifest.dynamicBoundaryLocks.surfaces)
    ? manifest.dynamicBoundaryLocks.surfaces
    : [];
  return {
    manifestPath: resolvedPath,
    surfaces: locks.map((surface) => ({
      id: String(surface.id || ""),
      owner: String(surface.owner || ""),
      lockKey: String(surface.lockKey || ""),
      riskTags: Array.isArray(surface.riskTags) ? surface.riskTags : []
    })).filter((surface) => surface.id)
  };
}

export function dynamicLockIdForItem(item) {
  const label = norm(item && item.label).toLowerCase();
  const kind = norm(item && item.kind);
  const dragRisk = norm(item && item.dragRisk);
  if (kind === "source-preview" || dragRisk === "high-memory-image-resize" || item && item.sourcePreview === "true") {
    return "sourcePreviewBlocks";
  }
  if (kind === "top-toolbar") {
    return "rightTopChips";
  }
  if (kind === "sidebar" || kind === "navigation") {
    if (/新聊天|new chat|專案|project|pull request|網站|website|已排程|scheduled|外掛|connector|extension/.test(label)) {
      return "leftSidebarRows";
    }
  }
  if (kind === "right-panel") {
    return "projectPanelRows";
  }
  if (kind === "popover") {
    return "accountPopover";
  }
  if (kind === "composer") {
    return "composerSurface";
  }
  if (kind === "black-shell" || item && item.blackShell === "true") {
    return "blackShellTransparency";
  }
  return "";
}

export function buildDynamicBoundaryCoverage(items, lockConfig) {
  const byId = new Map(lockConfig.surfaces.map((surface) => [surface.id, {
    id: surface.id,
    owner: surface.owner,
    lockKey: surface.lockKey,
    riskTags: surface.riskTags,
    detected: 0,
    dynamic: 0,
    safeCandidates: 0,
    riskyCandidates: 0,
    examples: []
  }]));
  const unmatched = [];
  for (const item of items) {
    const lockId = dynamicLockIdForItem(item);
    if (!lockId || !byId.has(lockId)) {
      unmatched.push({
        index: item.index,
        kind: item.kind || "",
        risk: item.risk || "",
        dragRisk: item.dragRisk || "",
        label: item.label || ""
      });
      continue;
    }
    const entry = byId.get(lockId);
    entry.detected += 1;
    if (item.dynamic) {
      entry.dynamic += 1;
    }
    if (item.safe === true) {
      entry.safeCandidates += 1;
    } else if (item.safe === false) {
      entry.riskyCandidates += 1;
    }
    if (entry.examples.length < 8) {
      entry.examples.push({
        index: item.index,
        kind: item.kind || "",
        risk: item.risk || "",
        dragRisk: item.dragRisk || "",
        label: item.label || ""
      });
    }
  }
  const surfaces = Array.from(byId.values());
  return {
    manifestPath: lockConfig.manifestPath,
    totalLocks: surfaces.length,
    detectedLocks: surfaces.filter((surface) => surface.detected > 0).length,
    missingLocks: surfaces.filter((surface) => surface.detected === 0).map((surface) => surface.id),
    surfaces,
    unmatched: unmatched.slice(0, 80)
  };
}

function fixtureItems() {
  return [
    { index: 0, kind: "source-preview", label: "sample source preview", dragRisk: "high-memory-image-resize", safe: false, dynamic: true },
    { index: 1, kind: "top-toolbar", label: "使用者附件", safe: false },
    { index: 2, kind: "sidebar", label: "專案", risk: "sidebar-state", safe: false },
    { index: 3, kind: "right-panel", label: "搜尋專案", safe: false },
    { index: 4, kind: "popover", label: "設定 登出", risk: "destructive-or-session", safe: false },
    { index: 5, kind: "composer", label: "什麼都能做", safe: true },
    { index: 6, kind: "black-shell", label: "official near-black workspace shell", blackShell: "true", safe: false, dynamic: true },
    { index: 7, kind: "general", label: "read-only text", safe: true }
  ];
}

function main() {
  const options = parseArgs(process.argv);
  if (options.help) {
    console.log(usage());
    return;
  }
  if (!["fields", "candidates"].includes(options.fixture)) {
    throw new Error(`unsupported --fixture: ${options.fixture}`);
  }
  const lockConfig = readDynamicBoundaryLocks(options.runtimeManifest);
  const report = {
    ok: true,
    mode: "dynamic-boundary-coverage-smoke",
    fixture: options.fixture,
    dynamicBoundaryLocks: buildDynamicBoundaryCoverage(fixtureItems(), lockConfig)
  };
  if (report.dynamicBoundaryLocks.missingLocks.length > 0) {
    report.ok = false;
  }
  if (options.format === "json") {
    console.log(JSON.stringify(report, null, 2));
  } else if (options.format === "text") {
    console.log("[codex-interface-theme] dynamic boundary coverage smoke");
    console.log(`ok=${report.ok}`);
    console.log(`locks=${report.dynamicBoundaryLocks.detectedLocks}/${report.dynamicBoundaryLocks.totalLocks}`);
    console.log(`missing=${report.dynamicBoundaryLocks.missingLocks.join(",") || "none"}`);
  } else {
    throw new Error(`unknown format: ${options.format}`);
  }
  if (!report.ok) {
    process.exit(1);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  try {
    main();
  } catch (error) {
    console.error(`[codex-interface-theme][dynamic-boundary-coverage] ${error.message}`);
    process.exitCode = 1;
  }
}
