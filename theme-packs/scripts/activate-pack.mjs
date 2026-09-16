#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PACK_ROOT_DEFAULT = path.resolve(SCRIPT_DIR, "..");
const PROJECT_ROOT_DEFAULT = path.resolve(PACK_ROOT_DEFAULT, "..");
const ASSETS_DIR_DEFAULT = path.join(PROJECT_ROOT_DEFAULT, "macos", "assets");
const STATE_DIR_DEFAULT = process.env.CIT_STATE_DIR || path.join(os.homedir(), "Library", "Application Support", "DreamSkinForge");
const PACK_ID_RE = /^[a-z0-9][a-z0-9-]{1,80}$/;

function usage() {
  return [
    "Usage:",
    "  activate-pack.mjs list [--root <theme-packs-dir>] [--format text|json]",
    "  activate-pack.mjs plan --pack <pack-id> [--root <theme-packs-dir>] [--assets-dir <dir>] [--state-dir <dir>] [--format text|json]",
    "  activate-pack.mjs activate --pack <pack-id> [--root <theme-packs-dir>] [--assets-dir <dir>] [--state-dir <dir>] [--format text|json]",
    "  activate-pack.mjs rollback [--state-dir <dir>] [--format text|json]",
    "",
    "Notes:",
    "  plan is read-only.",
    "  activate writes only the local active theme state and creates a backup.",
    "  rollback restores the newest activation backup.",
    "  no Codex process is started or restarted by this script."
  ].join("\n");
}

function parseArgs(argv) {
  const parsed = { command: argv[2] || "", options: {} };
  for (let index = 3; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === "--help" || key === "-h") {
      parsed.options.help = true;
      continue;
    }
    if (!key.startsWith("--")) {
      throw new Error(`unexpected argument: ${key}`);
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`missing value for ${key}`);
    }
    parsed.options[key.slice(2)] = value;
    index += 1;
  }
  return parsed;
}

function optionPath(options, name, fallback) {
  const value = options[name] || fallback;
  return path.resolve(String(value));
}

function formatOption(options) {
  const format = String(options.format || "text").toLowerCase();
  if (!["text", "json"].includes(format)) {
    throw new Error("--format must be text or json");
  }
  return format;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJsonAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const payload = `${JSON.stringify(value, null, 2)}\n`;
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, payload, { encoding: "utf8", mode: 0o600 });
  fs.renameSync(tempPath, filePath);
}

function sha256File(filePath) {
  const buffer = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function assertPlainDirectory(directory, label) {
  const stat = fs.lstatSync(directory);
  if (!stat.isDirectory()) {
    throw new Error(`${label} is not a directory: ${directory}`);
  }
  if (stat.isSymbolicLink()) {
    throw new Error(`${label} must not be a symbolic link: ${directory}`);
  }
}

function assertPlainFile(filePath, label) {
  const stat = fs.lstatSync(filePath);
  if (!stat.isFile()) {
    throw new Error(`${label} is not a file: ${filePath}`);
  }
  if (stat.isSymbolicLink()) {
    throw new Error(`${label} must not be a symbolic link: ${filePath}`);
  }
  return stat.size;
}

function ensureInside(rootDir, candidatePath, label) {
  const root = path.resolve(rootDir);
  const candidate = path.resolve(candidatePath);
  if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`)) {
    throw new Error(`${label} escapes root: ${candidatePath}`);
  }
  return candidate;
}

function resolvePackDir(rootDir, packId) {
  if (!PACK_ID_RE.test(packId)) {
    throw new Error("--pack must be a pack id using lowercase letters, numbers, and hyphens");
  }
  const packDir = ensureInside(rootDir, path.join(rootDir, packId), "pack directory");
  assertPlainDirectory(packDir, "pack directory");
  return packDir;
}

function resolvePackAsset(packDir, relativePath, label) {
  const value = String(relativePath || "").trim();
  if (!value || path.isAbsolute(value) || value.includes("\0") || value.split(/[\\/]+/).includes("..")) {
    throw new Error(`${label} path is unsafe: ${value}`);
  }
  const absolutePath = ensureInside(packDir, path.join(packDir, value), label);
  const bytes = assertPlainFile(absolutePath, label);
  return {
    absolutePath,
    relativePath: value,
    bytes,
    sha256: sha256File(absolutePath)
  };
}

function listPacks(rootDir) {
  assertPlainDirectory(rootDir, "theme pack root");
  const result = [];
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory() || !PACK_ID_RE.test(entry.name)) {
      continue;
    }
    const manifestPath = path.join(rootDir, entry.name, "pack.json");
    if (!fs.existsSync(manifestPath)) {
      continue;
    }
    const manifest = readJson(manifestPath);
    result.push({
      id: String(manifest.id || entry.name),
      displayName: String(manifest.displayName || entry.name),
      status: String(manifest.status || "")
    });
  }
  return result.sort((left, right) => left.id.localeCompare(right.id));
}

function assertPackManifest(manifest, requestedPackId) {
  if (manifest.schemaVersion !== 1) {
    throw new Error("pack schemaVersion must be 1");
  }
  if (manifest.id !== requestedPackId) {
    throw new Error(`pack id mismatch: expected ${requestedPackId}, got ${manifest.id}`);
  }
  if (manifest.status !== "asset-ready-unmounted") {
    throw new Error(`pack status must be asset-ready-unmounted: ${manifest.status}`);
  }
  if (!manifest.assets || typeof manifest.assets !== "object") {
    throw new Error("pack assets are missing");
  }
  if (!manifest.palette || typeof manifest.palette !== "object") {
    throw new Error("pack palette is missing");
  }
  if (!manifest.interaction || typeof manifest.interaction !== "object") {
    throw new Error("pack interaction is missing");
  }
  if (manifest.interaction.activation !== "manual-click-only") {
    throw new Error("pack interaction must be manual-click-only");
  }
  if (manifest.interaction.preload !== false || manifest.interaction.idlePlaybackDom !== false) {
    throw new Error("pack interaction must keep preload=false and idlePlaybackDom=false");
  }
}

function loadPack(rootDir, packId) {
  const packDir = resolvePackDir(rootDir, packId);
  const manifestPath = path.join(packDir, "pack.json");
  const manifest = readJson(manifestPath);
  assertPackManifest(manifest, packId);

  const assets = {
    background: resolvePackAsset(packDir, manifest.assets.background, "background"),
    heroCharacter: resolvePackAsset(packDir, manifest.assets.heroCharacter, "hero character"),
    interactionMascot: resolvePackAsset(packDir, manifest.assets.interactionMascot, "interaction mascot"),
    interactionPoster: resolvePackAsset(packDir, manifest.assets.interactionPoster, "interaction poster"),
    interactionSprite: resolvePackAsset(packDir, manifest.assets.interactionSprite, "interaction sprite"),
    interactionTrigger: resolvePackAsset(packDir, manifest.assets.interactionTrigger, "interaction trigger")
  };

  const icons = {};
  for (const [key, relativePath] of Object.entries(manifest.iconMap || {})) {
    icons[key] = resolvePackAsset(packDir, relativePath, `icon ${key}`);
  }

  return {
    packDir,
    manifestPath,
    manifest,
    assets,
    icons
  };
}

function rgbaFromHex(hex, alpha) {
  const text = String(hex || "").trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(text)) {
    return `rgba(112, 215, 232, ${alpha})`;
  }
  const red = parseInt(text.slice(1, 3), 16);
  const green = parseInt(text.slice(3, 5), 16);
  const blue = parseInt(text.slice(5, 7), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function defaultThemePath(assetsDir) {
  return path.join(assetsDir, "theme.json");
}

function activeThemePath(stateDir) {
  return path.join(stateDir, "themes", "active.json");
}

function backupDirPath(stateDir) {
  return path.join(stateDir, "themes", "backups");
}

function readBaseTheme(stateDir, assetsDir) {
  const activePath = activeThemePath(stateDir);
  if (fs.existsSync(activePath)) {
    return {
      source: "active",
      path: activePath,
      theme: readJson(activePath)
    };
  }
  const fallbackPath = defaultThemePath(assetsDir);
  return {
    source: "default",
    path: fallbackPath,
    theme: readJson(fallbackPath)
  };
}

function normalizePalette(pack) {
  const palette = pack.manifest.palette || {};
  return {
    accent: String(palette.accent || "#70d7e8"),
    secondary: String(palette.secondary || "#eef2dc"),
    highlight: String(palette.alert || palette.warm || "#d87888"),
    warm: String(palette.warm || "#e6b55a"),
    surface: String(palette.surface || "rgba(16, 32, 38, 0.46)"),
    surfaceStrong: String(palette.surfaceStrong || "rgba(12, 24, 30, 0.58)"),
    text: String(palette.text || "#f2f4ea")
  };
}

function mapPackToTheme(baseTheme, pack) {
  const next = cloneJson(baseTheme);
  const palette = normalizePalette(pack);
  const packId = pack.manifest.id;
  const displayName = String(pack.manifest.displayName || packId);

  next.id = `theme-pack-${packId}`;
  next.name = displayName;
  next.mode = "sidebar-art";
  next.appearance = next.appearance || "auto";
  next.palette = {
    accent: palette.accent,
    secondary: palette.secondary,
    highlight: palette.highlight,
    surface: palette.surface,
    surfaceStrong: palette.surfaceStrong,
    text: palette.text
  };
  next.layout = Object.assign({}, next.layout || {}, {
    workspaceTreatment: "native",
    blockContrast: "segmented",
    cornerArmor: "sidebar-top-left"
  });
  next.modules = Object.assign({}, next.modules || {});
  next.modules.sidebar = {
    accent: palette.accent,
    surface: palette.surface,
    border: rgbaFromHex(palette.accent, 0.28)
  };
  next.modules.header = {
    accent: palette.warm,
    surface: "rgba(14, 26, 31, 0.34)",
    border: rgbaFromHex(palette.warm, 0.18)
  };
  next.modules.composer = {
    accent: palette.warm,
    surface: "rgba(12, 24, 30, 0.30)",
    border: rgbaFromHex(palette.accent, 0.22)
  };
  next.modules.popover = {
    accent: palette.highlight,
    surface: palette.surfaceStrong,
    border: rgbaFromHex(palette.highlight, 0.2)
  };
  next.modules.mecha = {
    frame: "#161a20",
    armor: palette.warm,
    glow: palette.accent
  };
  next.modules.status = {
    success: palette.accent,
    warning: palette.warm,
    danger: palette.highlight,
    info: palette.secondary
  };
  next.art = Object.assign({}, next.art || {}, {
    focusX: 0.58,
    focusY: 0.5,
    safeArea: "sides",
    taskMode: "ambient"
  });
  next.icons = Object.assign({}, next.icons || {});
  next.icons.badge = {
    enabled: true,
    path: pack.assets.interactionMascot.absolutePath,
    placement: "sidebar-dock",
    size: 58,
    opacity: 0.9
  };
  next.icons.character = {
    enabled: true,
    path: pack.assets.heroCharacter.absolutePath,
    placement: "sidebar-hero",
    size: 350,
    opacity: 1
  };
  next.icons.tableFlipCat = {
    enabled: true,
    path: pack.assets.interactionPoster.absolutePath,
    spritePath: pack.assets.interactionSprite.absolutePath,
    posterPath: pack.assets.interactionPoster.absolutePath,
    triggerIconPath: pack.assets.interactionTrigger.absolutePath,
    placement: "right-bottom",
    size: 128,
    opacity: 0.96,
    frameCount: Number(pack.manifest.interaction.frameCount || 8),
    durationMs: Number(pack.manifest.interaction.durationMs || 1430)
  };

  const previousButtons = next.icons.buttons && typeof next.icons.buttons === "object" ? next.icons.buttons : {};
  next.icons.buttons = cloneJson(previousButtons);
  next.icons.buttons.enabled = previousButtons.enabled === true;
  next.icons.buttons.applyMode = previousButtons.applyMode || "opt-in";
  next.icons.buttons.style = previousButtons.style || "cat-mecha-symbols";
  next.icons.buttons.paths = Object.fromEntries(
    Object.entries(pack.icons).map(([key, asset]) => [key, asset.absolutePath])
  );
  next.backgroundImagePath = pack.assets.background.absolutePath;
  next.themePack = {
    id: packId,
    displayName,
    manifestPath: pack.manifestPath,
    activatedBy: "theme-packs/scripts/activate-pack.mjs"
  };
  next.updatedAt = new Date().toISOString();
  return next;
}

function collectAssetBudget(pack, theme) {
  const iconBytes = Object.values(pack.icons).reduce((total, asset) => total + asset.bytes, 0);
  const buttonsEnabled = theme.icons.buttons.enabled === true && theme.icons.buttons.applyMode === "module";
  return {
    visualBytes: pack.assets.background.bytes + pack.assets.interactionMascot.bytes + pack.assets.heroCharacter.bytes,
    animationShellBytes: pack.assets.interactionTrigger.bytes,
    animationPlaybackBytes: pack.assets.interactionSprite.bytes,
    buttonBytesIfEnabled: iconBytes,
    activeButtonBytes: buttonsEnabled ? iconBytes : 0
  };
}

function createPlan(command, rootDir, assetsDir, stateDir, packId) {
  const pack = loadPack(rootDir, packId);
  const base = readBaseTheme(stateDir, assetsDir);
  const theme = mapPackToTheme(base.theme, pack);
  const budget = collectAssetBudget(pack, theme);
  const activePath = activeThemePath(stateDir);
  const backupDir = backupDirPath(stateDir);
  const backupPath = path.join(backupDir, `active-${timestampForFile()}.json`);
  return {
    command,
    pack: {
      id: pack.manifest.id,
      displayName: pack.manifest.displayName,
      sourceDir: pack.packDir,
      manifestPath: pack.manifestPath
    },
    base: {
      source: base.source,
      path: base.path
    },
    target: {
      stateDir,
      assetsDir,
      activeThemePath: activePath,
      backupPath: fs.existsSync(activePath) ? backupPath : ""
    },
    theme,
    budget,
    writesActiveTheme: command === "activate"
  };
}

function timestampForFile() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function commandActivate(plan) {
  const activePath = plan.target.activeThemePath;
  if (fs.existsSync(activePath)) {
    fs.mkdirSync(path.dirname(plan.target.backupPath), { recursive: true, mode: 0o700 });
    fs.copyFileSync(activePath, plan.target.backupPath);
  }
  writeJsonAtomic(activePath, plan.theme);
  return Object.assign({}, plan, {
    activated: true
  });
}

function commandRollback(stateDir) {
  const backupDir = backupDirPath(stateDir);
  if (!fs.existsSync(backupDir)) {
    throw new Error(`backup directory does not exist: ${backupDir}`);
  }
  const backups = fs.readdirSync(backupDir)
    .filter((name) => /^active-\d{8}-\d{6}\.json$/.test(name))
    .sort()
    .reverse();
  if (backups.length === 0) {
    throw new Error("no activation backups found");
  }
  const selected = path.join(backupDir, backups[0]);
  const theme = readJson(selected);
  writeJsonAtomic(activeThemePath(stateDir), theme);
  return {
    rolledBack: true,
    restoredFrom: selected,
    activeThemePath: activeThemePath(stateDir),
    themeId: theme.id || "",
    themeName: theme.name || ""
  };
}

function printText(value) {
  if (Array.isArray(value.packs)) {
    for (const pack of value.packs) {
      console.log(`${pack.id}\t${pack.status}\t${pack.displayName}`);
    }
    return;
  }
  if (value.rolledBack) {
    console.log(`rollback restored ${value.themeName || value.themeId}`);
    console.log(`from ${value.restoredFrom}`);
    console.log(`to ${value.activeThemePath}`);
    return;
  }
  console.log(`${value.command} ${value.pack.id}`);
  console.log(`name: ${value.pack.displayName}`);
  console.log(`base: ${value.base.source}`);
  console.log(`active: ${value.target.activeThemePath}`);
  if (value.target.backupPath) {
    console.log(`backup: ${value.target.backupPath}`);
  }
  console.log(`visual bytes: ${value.budget.visualBytes}`);
  console.log(`animation shell bytes: ${value.budget.animationShellBytes}`);
  console.log(`animation playback bytes: ${value.budget.animationPlaybackBytes}`);
  console.log(`button bytes if enabled: ${value.budget.buttonBytesIfEnabled}`);
  console.log(`writes active theme: ${value.writesActiveTheme ? "yes" : "no"}`);
}

function printResult(value, format) {
  if (format === "json") {
    console.log(JSON.stringify(value, null, 2));
    return;
  }
  printText(value);
}

function main() {
  const parsed = parseArgs(process.argv);
  if (parsed.options.help || !parsed.command) {
    console.log(usage());
    return;
  }

  const format = formatOption(parsed.options);
  const rootDir = optionPath(parsed.options, "root", PACK_ROOT_DEFAULT);
  const assetsDir = optionPath(parsed.options, "assets-dir", ASSETS_DIR_DEFAULT);
  const stateDir = optionPath(parsed.options, "state-dir", STATE_DIR_DEFAULT);

  if (parsed.command === "list") {
    printResult({ packs: listPacks(rootDir) }, format);
    return;
  }

  if (parsed.command === "rollback") {
    printResult(commandRollback(stateDir), format);
    return;
  }

  if (!["plan", "activate"].includes(parsed.command)) {
    throw new Error(`unknown command: ${parsed.command}`);
  }

  const packId = parsed.options.pack;
  if (!packId) {
    throw new Error("missing required option --pack");
  }
  assertPlainDirectory(assetsDir, "assets directory");
  const themePath = defaultThemePath(assetsDir);
  assertPlainFile(themePath, "default theme");
  const plan = createPlan(parsed.command, rootDir, assetsDir, stateDir, packId);
  if (parsed.command === "activate") {
    printResult(commandActivate(plan), format);
    return;
  }
  printResult(plan, format);
}

try {
  main();
} catch (error) {
  console.error(`[codex-dream-skin-pack] ${error.message}`);
  process.exitCode = 1;
}
