#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyRuntimeDefaults } from "./theme-runtime-defaults.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SCRIPT_DIR = path.dirname(SCRIPT_PATH);
const ENGINE_ROOT = path.resolve(SCRIPT_DIR, "..");
const ASSETS_DIR = path.join(ENGINE_ROOT, "assets");
const DEFAULT_WAIT_MS = 20000;
const APPLY_INTERVAL_MS = 1500;
const TARGET_ASSET_CACHE = "__CODEX_INTERFACE_THEME_ASSET_GROUPS__";
const LEGACY_TARGET_ASSET_STORAGE = "codex-interface-theme:asset-groups:v1";
const TARGET_ASSET_INDEX = "codex-interface-theme:asset-groups:v2:index";
const TARGET_ASSET_GROUP_PREFIX = "codex-interface-theme:asset-groups:v2:";

function usage() {
  return `Usage:
  injector.mjs --port <port> --state-dir <dir> --once [--wait-ms <ms>]
  injector.mjs --port <port> --state-dir <dir> --daemon [--wait-ms <ms>]
  injector.mjs --state-dir <dir> --remove [--port <port>]
  injector.mjs --state-dir <dir> --verify [--port <port>] [--screenshot <path>] [--simulate-table-flip] [--hide-composer]`;
}

function parseArgs(argv) {
  const options = {};
  for (let index = 2; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith("--")) {
      throw new Error(`unexpected argument: ${key}`);
    }
    const name = key.slice(2);
    if (["once", "daemon", "remove", "verify", "simulate-table-flip", "hide-composer", "help"].includes(name)) {
      options[name] = true;
      continue;
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`missing value for ${key}`);
    }
    options[name] = value;
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

function mkdirp(directory) {
  fs.mkdirSync(directory, { recursive: true });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJsonAtomic(filePath, value) {
  mkdirp(path.dirname(filePath));
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  fs.renameSync(tempPath, filePath);
}

function removeFileIfExists(filePath) {
  try {
    fs.unlinkSync(filePath);
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
}

function sha256Text(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function statePaths(stateDir) {
  return {
    stateDir,
    themesDir: path.join(stateDir, "themes"),
    logsDir: path.join(stateDir, "logs"),
    runDir: path.join(stateDir, "run"),
    activeTheme: path.join(stateDir, "themes", "active.json"),
    session: path.join(stateDir, "run", "session.json"),
    pause: path.join(stateDir, "run", "pause.json")
  };
}

function appendLog(paths, message) {
  mkdirp(paths.logsDir);
  const stamp = new Date().toISOString();
  const date = stamp.slice(0, 10);
  const line = `[${stamp}] ${message}\n`;
  fs.appendFileSync(path.join(paths.logsDir, `injector-${date}.log`), line, "utf8");
  console.log(`[codex-interface-theme] ${message}`);
}

async function sleep(ms) {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function fetchJson(url, timeoutMs = 2500) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for ${url}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function waitForCdp(port, waitMs) {
  const deadline = Date.now() + waitMs;
  let lastError = null;
  while (Date.now() <= deadline) {
    try {
      await fetchJson(`http://127.0.0.1:${port}/json/version`, 1000);
      return;
    } catch (error) {
      lastError = error;
      await sleep(300);
    }
  }
  throw new Error(`CDP did not become ready on 127.0.0.1:${port}: ${lastError ? lastError.message : "timeout"}`);
}

async function listTargets(port) {
  const targets = await fetchJson(`http://127.0.0.1:${port}/json/list`, 2500);
  if (!Array.isArray(targets)) {
    throw new Error("CDP /json/list did not return an array");
  }
  return targets;
}

async function waitForInjectableTargets(port, waitMs) {
  const deadline = Date.now() + waitMs;
  let lastError = null;
  while (Date.now() <= deadline) {
    try {
      const allTargets = await listTargets(port);
      const targets = allTargets.filter(isInjectableTarget);
      if (targets.length > 0) {
        return targets;
      }
      lastError = new Error(`CDP returned ${allTargets.length} target(s), none injectable`);
    } catch (error) {
      lastError = error;
    }
    await sleep(300);
  }
  throw new Error(`no injectable Codex renderer targets found within ${waitMs}ms: ${lastError ? lastError.message : "timeout"}`);
}

function isInjectableTarget(target) {
  if (!target || target.type !== "page" || !target.webSocketDebuggerUrl) {
    return false;
  }
  const url = String(target.url || "");
  if (url.startsWith("devtools://") || url.startsWith("chrome://") || url.startsWith("chrome-extension://")) {
    return false;
  }
  if (url === "about:blank") {
    return true;
  }
  if (url.startsWith("app://")) {
    return true;
  }
  if (url.startsWith("https://chatgpt.com") || url.startsWith("https://chat.openai.com")) {
    return true;
  }
  const title = String(target.title || "");
  return /codex|chatgpt/i.test(title);
}

class CdpSession {
  constructor(webSocketUrl) {
    if (typeof WebSocket !== "function") {
      throw new Error("global WebSocket is unavailable; use the bundled Codex Node v22+");
    }
    this.webSocketUrl = webSocketUrl;
    this.nextId = 1;
    this.pending = new Map();
    this.socket = null;
  }

  async open() {
    this.socket = new WebSocket(this.webSocketUrl);
    this.socket.addEventListener("message", (event) => {
      let message;
      try {
        message = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if (!message || typeof message.id !== "number") {
        return;
      }
      const pending = this.pending.get(message.id);
      if (!pending) {
        return;
      }
      this.pending.delete(message.id);
      if (message.error) {
        pending.reject(new Error(message.error.message || JSON.stringify(message.error)));
      } else {
        pending.resolve(message.result || {});
      }
    });
    this.socket.addEventListener("error", () => {});
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("WebSocket open timeout")), 3000);
      this.socket.addEventListener("open", () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });
      this.socket.addEventListener("error", () => {
        clearTimeout(timer);
        reject(new Error(`WebSocket error for ${this.webSocketUrl}`));
      }, { once: true });
    });
  }

  send(method, params = {}, timeoutMs = 5000) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("WebSocket is not open"));
    }
    const id = this.nextId;
    this.nextId += 1;
    const payload = JSON.stringify({ id, method, params });
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP command timeout: ${method}`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        }
      });
      this.socket.send(payload);
    });
  }

  close() {
    if (this.socket) {
      this.socket.close();
    }
  }
}

function inferMimeFromPath(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".png") {
    return "image/png";
  }
  if (extension === ".jpg" || extension === ".jpeg") {
    return "image/jpeg";
  }
  if (extension === ".svg") {
    return "image/svg+xml";
  }
  if (extension === ".gif") {
    return "image/gif";
  }
  if (extension === ".webp") {
    return "image/webp";
  }
  if (extension === ".svg") {
    return "image/svg+xml";
  }
  throw new Error(`unsupported image extension: ${extension}`);
}

function readBackgroundDataUrl(theme) {
  const imagePath = String(theme.backgroundImagePath || "");
  if (!imagePath) {
    return "";
  }
  if (!path.isAbsolute(imagePath)) {
    throw new Error("active theme backgroundImagePath must be absolute");
  }
  const stat = fs.statSync(imagePath);
  if (!stat.isFile()) {
    throw new Error(`background image is not a file: ${imagePath}`);
  }
  if (stat.size <= 0 || stat.size > 16 * 1024 * 1024) {
    throw new Error(`background image size is invalid: ${stat.size}`);
  }
  const mime = inferMimeFromPath(imagePath);
  const buffer = fs.readFileSync(imagePath);
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

function resolvePackagedAsset(assetPath, fieldName) {
  const value = String(assetPath || "").trim();
  if (!value) {
    return "";
  }
  if (path.isAbsolute(value)) {
    return value;
  }
  const absolutePath = path.resolve(ASSETS_DIR, value);
  const assetRoot = `${ASSETS_DIR}${path.sep}`;
  if (absolutePath !== ASSETS_DIR && !absolutePath.startsWith(assetRoot)) {
    throw new Error(`${fieldName} must stay inside assets when relative`);
  }
  return absolutePath;
}

function readPackagedAssetDataUrl(assetPath, fieldName, maxBytes) {
  const absolutePath = resolvePackagedAsset(assetPath, fieldName);
  if (!absolutePath) {
    return "";
  }
  const stat = fs.statSync(absolutePath);
  if (!stat.isFile()) {
    throw new Error(`${fieldName} is not a file: ${absolutePath}`);
  }
  if (stat.size <= 0 || stat.size > maxBytes) {
    throw new Error(`${fieldName} size is invalid: ${stat.size}`);
  }
  const mime = inferMimeFromPath(absolutePath);
  const buffer = fs.readFileSync(absolutePath);
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

function readIconBadgeDataUrl(theme) {
  const badge = theme.icons && typeof theme.icons === "object" && theme.icons.badge && typeof theme.icons.badge === "object"
    ? theme.icons.badge
    : {};
  if (badge.enabled === false || String(badge.placement || "") === "off") {
    return "";
  }
  return readPackagedAssetDataUrl(badge.path || "icons/orange-hacker-cat-128.png", "icon badge", 4 * 1024 * 1024);
}

function readCharacterDataUrl(theme) {
  const character = theme.icons && typeof theme.icons === "object" && theme.icons.character && typeof theme.icons.character === "object"
    ? theme.icons.character
    : {};
  if (character.enabled === false || String(character.placement || "") === "off") {
    return "";
  }
  return readPackagedAssetDataUrl(character.path || "icons/cyber-mecha-cat-male-helmet-900.png", "character asset", 4 * 1024 * 1024);
}

function readTableFlipCatDataUrl(theme) {
  const tableFlipCat = theme.icons && typeof theme.icons === "object" && theme.icons.tableFlipCat && typeof theme.icons.tableFlipCat === "object"
    ? theme.icons.tableFlipCat
    : {};
  if (tableFlipCat.enabled === false || String(tableFlipCat.placement || "") === "off") {
    return "";
  }
  return readPackagedAssetDataUrl(tableFlipCat.path || "icons/table-flip-cat-left.gif", "table flip cat", 4 * 1024 * 1024);
}

function inferTableFlipCatTriggerIconPath(tableFlipCat) {
  const explicitPath = String(tableFlipCat.triggerIconPath || "").trim();
  if (explicitPath) {
    return explicitPath;
  }
  return "icons/table-flip-trigger-angry.svg";
}

function inferTableFlipCatSpritePath(tableFlipCat) {
  const explicitPath = String(tableFlipCat.spritePath || "").trim();
  if (explicitPath) {
    return explicitPath;
  }
  return "icons/table-flip-cat-left-sprite.webp";
}

function readTableFlipCatTriggerIconDataUrl(theme) {
  const tableFlipCat = theme.icons && typeof theme.icons === "object" && theme.icons.tableFlipCat && typeof theme.icons.tableFlipCat === "object"
    ? theme.icons.tableFlipCat
    : {};
  if (tableFlipCat.enabled === false || String(tableFlipCat.placement || "") === "off") {
    return "";
  }
  return readPackagedAssetDataUrl(inferTableFlipCatTriggerIconPath(tableFlipCat), "table flip cat trigger icon", 512 * 1024);
}

function readTableFlipCatSpriteDataUrl(theme) {
  const tableFlipCat = theme.icons && typeof theme.icons === "object" && theme.icons.tableFlipCat && typeof theme.icons.tableFlipCat === "object"
    ? theme.icons.tableFlipCat
    : {};
  if (tableFlipCat.enabled === false || String(tableFlipCat.placement || "") === "off") {
    return "";
  }
  return readPackagedAssetDataUrl(inferTableFlipCatSpritePath(tableFlipCat), "table flip cat sprite", 4 * 1024 * 1024);
}

function readIconButtonDataUrls(theme) {
  const buttons = theme.icons && typeof theme.icons === "object" && theme.icons.buttons && typeof theme.icons.buttons === "object"
    ? theme.icons.buttons
    : {};
  if (buttons.enabled !== true || String(buttons.applyMode || "") !== "module") {
    return {};
  }
  const modules = buttons.modules && typeof buttons.modules === "object" ? buttons.modules : {};
  const sidebarNavigation = modules.sidebarNavigation && typeof modules.sidebarNavigation === "object" ? modules.sidebarNavigation : {};
  const titlebarNavigation = modules.titlebarNavigation && typeof modules.titlebarNavigation === "object" ? modules.titlebarNavigation : {};
  const composerControls = modules.composerControls && typeof modules.composerControls === "object" ? modules.composerControls : {};
  const topUtilityActions = modules.topUtilityActions && typeof modules.topUtilityActions === "object" ? modules.topUtilityActions : {};
  const messageActions = modules.messageActions && typeof modules.messageActions === "object" ? modules.messageActions : {};
  const projectPanelRows = modules.projectPanelRows && typeof modules.projectPanelRows === "object" ? modules.projectPanelRows : {};
  if (sidebarNavigation.enabled !== true && titlebarNavigation.enabled !== true && composerControls.enabled !== true && topUtilityActions.enabled !== true && messageActions.enabled !== true && projectPanelRows.enabled !== true) {
    return {};
  }
  const paths = buttons.paths && typeof buttons.paths === "object" ? buttons.paths : {};
  const result = {};
  for (const [key, assetPath] of Object.entries(paths)) {
    result[key] = readPackagedAssetDataUrl(assetPath, `button icon ${key}`, 256 * 1024);
  }
  return result;
}

function normalizeTheme(theme) {
  return applyRuntimeDefaults(theme);
}

function buildPayload(paths) {
  const css = fs.readFileSync(path.join(ASSETS_DIR, "theme.css"), "utf8");
  const renderer = fs.readFileSync(path.join(ASSETS_DIR, "renderer-inject.js"), "utf8");
  const fallbackTheme = readJson(path.join(ASSETS_DIR, "theme.json"));
  const activeTheme = fs.existsSync(paths.activeTheme) ? readJson(paths.activeTheme) : fallbackTheme;
  const theme = normalizeTheme(activeTheme);
  const backgroundDataUrl = readBackgroundDataUrl(theme);
  const iconBadgeDataUrl = readIconBadgeDataUrl(theme);
  const characterDataUrl = readCharacterDataUrl(theme);
  const tableFlipCatTriggerIconDataUrl = readTableFlipCatTriggerIconDataUrl(theme);
  const tableFlipCatSpriteDataUrl = readTableFlipCatSpriteDataUrl(theme);
  const tableFlipCatDataUrl = tableFlipCatSpriteDataUrl ? "" : readTableFlipCatDataUrl(theme);
  const iconButtonDataUrls = readIconButtonDataUrls(theme);
  const assetGroups = {
    visual: { backgroundDataUrl, iconBadgeDataUrl, characterDataUrl },
    animationShell: { tableFlipCatTriggerIconDataUrl },
    animationPlayback: { tableFlipCatDataUrl, tableFlipCatSpriteDataUrl },
    buttons: { iconButtonDataUrls }
  };
  const assetGroupHashes = Object.fromEntries(Object.entries(assetGroups).map(([groupId, groupPayload]) => [groupId, sha256Text(JSON.stringify(groupPayload))]));
  const revision = sha256Text(JSON.stringify({
    css,
    renderer,
    theme,
    assetGroupHashes
  })).slice(0, 16);

  return {
    css,
    renderer,
    core: { css, theme, revision },
    assetGroups,
    assetGroupHashes,
    theme,
    backgroundDataUrl,
    iconBadgeDataUrl,
    characterDataUrl,
    tableFlipCatDataUrl,
    tableFlipCatTriggerIconDataUrl,
    tableFlipCatSpriteDataUrl,
    iconButtonDataUrls,
    revision
  };
}

function buildAssetGroupExpression(assetGroups, assetGroupHashes) {
  const incoming = Object.fromEntries(Object.entries(assetGroups).map(([groupId, groupPayload]) => [groupId, {
    hash: assetGroupHashes[groupId],
    payload: groupPayload
  }]));
  return `(() => {
    let cache = window.${TARGET_ASSET_CACHE} && typeof window.${TARGET_ASSET_CACHE} === "object" ? window.${TARGET_ASSET_CACHE} : {};
    let index = {};
    try { index = JSON.parse(localStorage.getItem(${JSON.stringify(TARGET_ASSET_INDEX)}) || "{}"); } catch (_) {}
    const incoming = ${JSON.stringify(incoming)};
    const activeGroupIds = ${JSON.stringify(Object.keys(assetGroupHashes))};
    Array.from(new Set(Object.keys(cache).concat(Object.keys(index)))).forEach((groupId) => {
      if (!activeGroupIds.includes(groupId)) {
        delete cache[groupId];
        delete index[groupId];
        try { localStorage.removeItem(${JSON.stringify(TARGET_ASSET_GROUP_PREFIX)} + groupId); } catch (_) {}
      }
    });
    Object.keys(incoming).forEach((groupId) => {
      let stored = false;
      try {
        localStorage.setItem(${JSON.stringify(TARGET_ASSET_GROUP_PREFIX)} + groupId, JSON.stringify(incoming[groupId]));
        stored = true;
      } catch (_) {}
      index[groupId] = incoming[groupId].hash;
      cache[groupId] = groupId === "animationPlayback" && stored ? { hash: incoming[groupId].hash } : incoming[groupId];
    });
    window.${TARGET_ASSET_CACHE} = cache;
    try {
      localStorage.setItem(${JSON.stringify(TARGET_ASSET_INDEX)}, JSON.stringify(index));
      localStorage.removeItem(${JSON.stringify(LEGACY_TARGET_ASSET_STORAGE)});
    } catch (_) {}
    return index;
  })();`;
}

function buildCoreExpression(payload) {
  return `(() => {
    const cache = window.${TARGET_ASSET_CACHE} && typeof window.${TARGET_ASSET_CACHE} === "object" ? window.${TARGET_ASSET_CACHE} : {};
    let index = {};
    try { index = JSON.parse(localStorage.getItem(${JSON.stringify(TARGET_ASSET_INDEX)}) || "{}"); } catch (_) {}
    const loadGroup = (groupId, retain = true) => {
      if (cache[groupId] && cache[groupId].payload) { return cache[groupId].payload; }
      try {
        const entry = JSON.parse(localStorage.getItem(${JSON.stringify(TARGET_ASSET_GROUP_PREFIX)} + groupId) || "null");
        if (entry && entry.payload) { if (retain) { cache[groupId] = entry; } return entry.payload; }
      } catch (_) {}
      return {};
    };
    if (index.animationPlayback) { cache.animationPlayback = { hash: index.animationPlayback }; }
    window.${TARGET_ASSET_CACHE} = cache;
    const assets = Object.assign({}, loadGroup("visual"), loadGroup("animationShell"), loadGroup("buttons"));
    const core = Object.assign(${JSON.stringify(payload.core)}, assets);
    if (index.animationPlayback || cache.animationPlayback) { core.loadTableFlipCatPlayback = () => loadGroup("animationPlayback", false); }
    return ${payload.renderer}(core);
  })();`;
}

async function readTargetAssetGroupHashes(session) {
  const result = await session.send("Runtime.evaluate", {
    expression: `(() => {
      const cache = window.${TARGET_ASSET_CACHE} && typeof window.${TARGET_ASSET_CACHE} === "object" ? window.${TARGET_ASSET_CACHE} : {};
      let index = null;
      try { index = JSON.parse(localStorage.getItem(${JSON.stringify(TARGET_ASSET_INDEX)}) || "null"); } catch (_) {}
      return Object.assign({ __persistent: index ? "v2" : "" }, Object.fromEntries(Object.entries(cache).map(([groupId, entry]) => [groupId, entry && entry.hash || ""])), index || {});
    })();`,
    awaitPromise: false,
    returnByValue: true
  }).catch(() => null);
  return result && result.result && result.result.value && typeof result.result.value === "object" ? result.result.value : {};
}

async function applyToTarget(target, payload) {
  const session = new CdpSession(target.webSocketDebuggerUrl);
  await session.open();
  try {
    await session.send("Runtime.enable").catch(() => {});
    await session.send("Page.enable").catch(() => {});
    const cachedHashes = await readTargetAssetGroupHashes(session);
    const changedGroupIds = Object.keys(payload.assetGroups).filter((groupId) => cachedHashes[groupId] !== payload.assetGroupHashes[groupId]);
    const staleGroupIds = Object.keys(cachedHashes).filter((groupId) => groupId !== "__persistent" && !Object.hasOwn(payload.assetGroups, groupId));
    const needsPersistence = cachedHashes.__persistent !== "v2";
    const groupsToSend = needsPersistence ? Object.keys(payload.assetGroups) : changedGroupIds;
    const changedGroups = Object.fromEntries(groupsToSend.map((groupId) => [groupId, payload.assetGroups[groupId]]));
    let assetExpressionBytes = 0;
    if (groupsToSend.length > 0 || staleGroupIds.length > 0) {
      const assetExpression = buildAssetGroupExpression(changedGroups, payload.assetGroupHashes);
      assetExpressionBytes = Buffer.byteLength(assetExpression);
      await session.send("Page.addScriptToEvaluateOnNewDocument", { source: assetExpression }).catch(() => {});
      await session.send("Runtime.evaluate", {
        expression: assetExpression,
        awaitPromise: false,
        returnByValue: true,
        userGesture: false
      });
    }
    const coreExpression = buildCoreExpression(payload);
    await session.send("Page.addScriptToEvaluateOnNewDocument", { source: coreExpression }).catch(() => {});
    const result = await session.send("Runtime.evaluate", {
      expression: coreExpression,
      awaitPromise: false,
      returnByValue: true,
      userGesture: false
    });
    const value = result.result && result.result.value ? result.result.value : { ok: true };
    return {
      ...value,
      assetGroupsChanged: changedGroupIds,
      assetGroupsTransferred: groupsToSend,
      assetGroupsReused: Object.keys(payload.assetGroups).filter((groupId) => !changedGroupIds.includes(groupId)),
      assetGroupsPruned: staleGroupIds,
      assetCachePersistent: true,
      assetExpressionBytes,
      coreExpressionBytes: Buffer.byteLength(coreExpression)
    };
  } finally {
    session.close();
  }
}

async function removeFromTarget(target) {
  const session = new CdpSession(target.webSocketDebuggerUrl);
  await session.open();
  try {
    await session.send("Runtime.enable").catch(() => {});
    const result = await session.send("Runtime.evaluate", {
      expression: `(() => {
        if (typeof window.__CODEX_INTERFACE_THEME_REMOVE__ === "function") {
          return window.__CODEX_INTERFACE_THEME_REMOVE__();
        }
        const style = document.getElementById("codex-interface-theme-style");
        if (style) {
          style.remove();
        }
        const marker = document.getElementById("codex-interface-theme-marker");
        if (marker) {
          marker.remove();
        }
        document.documentElement.removeAttribute("data-codex-interface-theme");
        return { ok: true, removed: true, fallback: true };
      })();`,
      awaitPromise: false,
      returnByValue: true
    });
    return result.result && result.result.value ? result.result.value : { ok: true, removed: true };
  } finally {
    session.close();
  }
}

async function verifyTableFlipTarget(session) {
  const evaluate = async (expression, timeoutMs = 5000) => {
    const result = await session.send("Runtime.evaluate", {
      expression,
      awaitPromise: false,
      returnByValue: true
    }, timeoutMs);
    return result.result && result.result.value ? result.result.value : {};
  };
  const base = await evaluate(`(() => {
      const root = document.documentElement;
      const hud = document.getElementById("codex-interface-theme-right-hud");
      const trigger = hud ? hud.querySelector(".codex-interface-theme-table-flip-trigger-icon") : null;
      const cache = window.${TARGET_ASSET_CACHE} && typeof window.${TARGET_ASSET_CACHE} === "object" ? window.${TARGET_ASSET_CACHE} : {};
      return {
        active: root.getAttribute("data-codex-interface-theme") === "active",
        revision: root.getAttribute("data-cit-revision") || "",
        hasStyle: Boolean(document.getElementById("codex-interface-theme-style")),
        hasMarker: Boolean(document.getElementById("codex-interface-theme-marker")),
        hasRightHud: Boolean(hud),
        tableFlipCatMode: root.getAttribute("data-cit-table-flip-cat-mode") || "",
        animationPlaybackResident: Boolean(cache.animationPlayback && cache.animationPlayback.payload),
        idleAnimationNode: Boolean(hud && hud.querySelector(".codex-interface-theme-table-flip-cat-animated")),
        hasTrigger: Boolean(trigger),
        skipped: String(location.href).includes("initialRoute=%2Favatar-overlay")
      };
    })();`);
  if (base.skipped) {
    return { ...base, tableFlipPlayback: { ok: true, skipped: true, reason: "non-primary Codex surface" } };
  }
  if (!base.hasRightHud || !base.hasTrigger) {
    return { ...base, tableFlipPlayback: { ok: false, error: !base.hasRightHud ? "missing right HUD" : "missing table flip trigger icon" } };
  }
  const started = await evaluate(`(() => {
      const hud = document.getElementById("codex-interface-theme-right-hud");
      const trigger = hud.querySelector(".codex-interface-theme-table-flip-trigger-icon");
      const before = { state: hud.getAttribute("data-cit-table-flip-state") || "", playing: hud.classList.contains("codex-interface-theme-table-flip-playing") };
      hud.click();
      const afterContainerClick = { state: hud.getAttribute("data-cit-table-flip-state") || "", playing: hud.classList.contains("codex-interface-theme-table-flip-playing") };
      trigger.click();
      return { before, afterContainerClick };
    })();`, 15000);
  await sleep(320);
  const during = await evaluate(`(() => {
      const hud = document.getElementById("codex-interface-theme-right-hud");
      const animated = hud.querySelector(".codex-interface-theme-table-flip-cat-animated");
      const computed = animated ? getComputedStyle(animated) : null;
      const animations = animated && typeof animated.getAnimations === "function" ? animated.getAnimations() : [];
      return {
        state: hud.getAttribute("data-cit-table-flip-state") || "",
        playing: hud.classList.contains("codex-interface-theme-table-flip-playing"),
        frame: hud.getAttribute("data-cit-table-flip-frame") || "",
        backgroundImage: computed ? computed.backgroundImage.slice(0, 32) : "",
        animationName: computed ? computed.animationName : "",
        animationDuration: computed ? computed.animationDuration : "",
        animationPlayState: computed ? computed.animationPlayState : "",
        animationCount: animations.length,
        animationState: animations[0] ? animations[0].playState : "",
        animationCurrentTime: animations[0] ? Math.round(Number(animations[0].currentTime) || 0) : 0
      };
    })();`);
  await sleep(1800);
  const after = await evaluate(`(() => {
      const hud = document.getElementById("codex-interface-theme-right-hud");
      if (hud && typeof hud.__codexInterfaceThemeMaintainTableFlipPlayback__ === "function") {
        hud.__codexInterfaceThemeMaintainTableFlipPlayback__();
      }
      const released = hud.querySelector(".codex-interface-theme-table-flip-cat-animated");
      const cache = window.${TARGET_ASSET_CACHE} && typeof window.${TARGET_ASSET_CACHE} === "object" ? window.${TARGET_ASSET_CACHE} : {};
      const animations = released && typeof released.getAnimations === "function" ? released.getAnimations() : [];
      return {
        state: hud.getAttribute("data-cit-table-flip-state") || "",
        playing: hud.classList.contains("codex-interface-theme-table-flip-playing"),
        nodeReleased: !released,
        payloadReleased: !(cache.animationPlayback && cache.animationPlayback.payload),
        animationCount: animations.length,
        animationState: animations[0] ? animations[0].playState : "",
        animationCurrentTime: animations[0] ? Math.round(Number(animations[0].currentTime) || 0) : 0
      };
    })();`);
  return {
    ...base,
    animationPlaybackResident: !after.payloadReleased,
    tableFlipPlayback: {
      ok: !base.idleAnimationNode && started.before.state === "idle" && !started.before.playing && started.afterContainerClick.state === "idle" && !started.afterContainerClick.playing && during.state === "playing" && during.playing && ["css", "gif"].includes(during.frame) && during.backgroundImage.startsWith('url("data:image/') && after.nodeReleased && after.payloadReleased,
      before: started.before,
      afterContainerClick: started.afterContainerClick,
      during,
      after
    }
  };
}

async function verifyTarget(target, screenshotPath, simulateTableFlip = false, hideComposer = false) {
  const session = new CdpSession(target.webSocketDebuggerUrl);
  await session.open();
  try {
    await session.send("Runtime.enable").catch(() => {});
    await session.send("Page.enable").catch(() => {});
    if (simulateTableFlip) {
      if (!String(target.url || "").includes("initialRoute=%2Favatar-overlay")) {
        await session.send("Page.bringToFront").catch(() => {});
        await sleep(120);
      }
      const value = await verifyTableFlipTarget(session);
      if (screenshotPath) {
        const screenshot = await session.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }, 15000);
        const absoluteScreenshot = path.resolve(screenshotPath);
        mkdirp(path.dirname(absoluteScreenshot));
        fs.writeFileSync(absoluteScreenshot, Buffer.from(screenshot.data, "base64"), { mode: 0o600 });
        value.screenshot = absoluteScreenshot;
      }
      return value;
    }
    const result = await session.send("Runtime.evaluate", {
      expression: `(async () => {
        const root = document.documentElement;
        const style = document.getElementById("codex-interface-theme-style");
        const marker = document.getElementById("codex-interface-theme-marker");
        const themeAssetCache = window.${TARGET_ASSET_CACHE} && typeof window.${TARGET_ASSET_CACHE} === "object" ? window.${TARGET_ASSET_CACHE} : {};
        const rightHud = document.getElementById("codex-interface-theme-right-hud");
        const backdrop = document.getElementById("codex-interface-theme-backdrop");
        const rightHudStyle = rightHud ? getComputedStyle(rightHud) : null;
        const tableFlipAnimated = rightHud ? rightHud.querySelector(".codex-interface-theme-table-flip-cat-animated") : null;
        const tableFlipAnimatedStyle = tableFlipAnimated ? getComputedStyle(tableFlipAnimated) : null;
        const tableFlipTrigger = rightHud ? rightHud.querySelector(".codex-interface-theme-table-flip-trigger-icon") : null;
        const tableFlipTriggerStyle = tableFlipTrigger ? getComputedStyle(tableFlipTrigger) : null;
        const character = document.getElementById("codex-interface-theme-character");
        const characterStyle = character ? getComputedStyle(character) : null;
        const playbackOnly = ${simulateTableFlip ? "true" : "false"};
        const composerSurface = playbackOnly ? null : document.querySelector(".codex-interface-theme-composer-surface") || document.querySelector(".composer-surface-chrome");
        const composerNativeFade = document.querySelector(".codex-interface-theme-composer-native-fade");
        const composerNativeFadeStyle = composerNativeFade ? getComputedStyle(composerNativeFade) : null;
        const composerNativeFadeRect = composerNativeFade ? composerNativeFade.getBoundingClientRect() : null;
        const workspacePickerShell = document.querySelector(".codex-interface-theme-workspace-picker");
        const workspacePickerShellStyle = workspacePickerShell ? getComputedStyle(workspacePickerShell) : null;
        const workspacePickerPlate = document.getElementById("codex-interface-theme-workspace-picker-plate");
        const workspacePickerPlateStyle = workspacePickerPlate ? getComputedStyle(workspacePickerPlate) : null;
        const activeSelection = playbackOnly ? null : window.getSelection();
        const selectionRects = activeSelection ? Array.from({ length: activeSelection.rangeCount }, (_, index) => activeSelection.getRangeAt(index)).flatMap((range) => Array.from(range.getClientRects()).map((rect) => ({
          left: Math.round(rect.left),
          top: Math.round(rect.top),
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        }))).slice(0, 120) : [];
        const composerLayers = [];
        let composerLayer = composerSurface;
        let composerLayerDepth = 0;
        while (composerLayer && composerLayer !== document.documentElement && composerLayerDepth < 12) {
          const rect = composerLayer.getBoundingClientRect();
          const computed = getComputedStyle(composerLayer);
          const before = getComputedStyle(composerLayer, "::before");
          const after = getComputedStyle(composerLayer, "::after");
          composerLayers.push({
            depth: composerLayerDepth,
            tag: composerLayer.tagName,
            id: composerLayer.id || "",
            className: String(composerLayer.className || "").slice(0, 260),
            left: Math.round(rect.left),
            top: Math.round(rect.top),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            backgroundColor: computed.backgroundColor,
            backgroundImage: computed.backgroundImage.slice(0, 180),
            boxShadow: computed.boxShadow.slice(0, 180),
            backdropFilter: computed.backdropFilter || computed.webkitBackdropFilter || "",
            beforeContent: before.content,
            beforeBackgroundColor: before.backgroundColor,
            beforeBackgroundImage: before.backgroundImage.slice(0, 120),
            afterContent: after.content,
            afterBackgroundColor: after.backgroundColor,
            afterBackgroundImage: after.backgroundImage.slice(0, 120)
          });
          composerLayer = composerLayer.parentElement;
          composerLayerDepth += 1;
        }
        const composerPaintedDescendants = composerSurface ? Array.from(composerSurface.querySelectorAll("*")).map((node) => {
          const rect = node.getBoundingClientRect();
          const computed = getComputedStyle(node);
          const before = getComputedStyle(node, "::before");
          const after = getComputedStyle(node, "::after");
          return {
            tag: node.tagName,
            className: String(node.className || "").slice(0, 220),
            left: Math.round(rect.left),
            top: Math.round(rect.top),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            backgroundColor: computed.backgroundColor,
            backgroundImage: computed.backgroundImage.slice(0, 140),
            boxShadow: computed.boxShadow.slice(0, 140),
            filter: computed.filter,
            backdropFilter: computed.backdropFilter || computed.webkitBackdropFilter || "",
            opacity: computed.opacity,
            mixBlendMode: computed.mixBlendMode,
            maskImage: computed.maskImage || computed.webkitMaskImage || "",
            beforeContent: before.content,
            beforeBackgroundColor: before.backgroundColor,
            beforeBackgroundImage: before.backgroundImage.slice(0, 100),
            afterContent: after.content,
            afterBackgroundColor: after.backgroundColor,
            afterBackgroundImage: after.backgroundImage.slice(0, 100)
          };
        }).filter((item) => (
          item.backgroundColor !== "rgba(0, 0, 0, 0)" ||
          item.backgroundImage !== "none" ||
          item.boxShadow !== "none" ||
          item.filter !== "none" ||
          item.backdropFilter !== "none" ||
          item.opacity !== "1" ||
          item.mixBlendMode !== "normal" ||
          item.maskImage !== "none" ||
          item.beforeContent !== "none" ||
          item.afterContent !== "none"
        )).slice(0, 80) : [];
        const composerPointLayers = composerSurface ? (() => {
          const rect = composerSurface.getBoundingClientRect();
          const points = [
            [rect.left + rect.width / 2, rect.top + rect.height / 2],
            [rect.left + 8, rect.top + 8],
            [rect.right - 8, rect.bottom - 8]
          ];
          return points.map(([x, y]) => ({
            x: Math.round(x),
            y: Math.round(y),
            layers: document.elementsFromPoint(x, y).slice(0, 16).map((node) => {
              const computed = getComputedStyle(node);
              return {
                tag: node.tagName,
                id: node.id || "",
                className: String(node.className || "").slice(0, 220),
                backgroundColor: computed.backgroundColor,
                backgroundImage: computed.backgroundImage.slice(0, 120),
                filter: computed.filter,
                opacity: computed.opacity
              };
            })
          }));
        })() : [];
        const characterRetreatPanels = Array.from(document.querySelectorAll(".codex-interface-theme-project-panel-frame, .codex-interface-theme-project-panel")).slice(0, 6).map((panel) => {
          const rect = panel.getBoundingClientRect();
          const style = getComputedStyle(panel);
          return {
            className: String(panel.className || ""),
            left: Math.round(rect.left),
            right: Math.round(rect.right),
            top: Math.round(rect.top),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            display: style.display,
            visibility: style.visibility,
            opacity: style.opacity
          };
        });
        let tableFlipPlayback = null;
        const isPrimaryCodexSurface = !String(location.href).includes("initialRoute=%2Favatar-overlay");
        if (${simulateTableFlip ? "true" : "false"} && !isPrimaryCodexSurface) {
          tableFlipPlayback = { ok: true, skipped: true, reason: "non-primary Codex surface" };
        } else if (${simulateTableFlip ? "true" : "false"}) {
          if (!rightHud) {
            tableFlipPlayback = { ok: false, error: "missing right HUD" };
          } else if (!tableFlipTrigger) {
            tableFlipPlayback = { ok: false, error: "missing table flip trigger icon" };
          } else {
            const before = {
              state: rightHud.getAttribute("data-cit-table-flip-state") || "",
              playing: rightHud.classList.contains("codex-interface-theme-table-flip-playing")
            };
            rightHud.click();
            await new Promise((resolve) => setTimeout(resolve, 120));
            const afterContainerClick = {
              state: rightHud.getAttribute("data-cit-table-flip-state") || "",
              playing: rightHud.classList.contains("codex-interface-theme-table-flip-playing")
            };
            tableFlipTrigger.click();
            await new Promise((resolve) => setTimeout(resolve, 320));
            const activeTableFlipAnimated = rightHud.querySelector(".codex-interface-theme-table-flip-cat-animated");
            const during = {
              state: rightHud.getAttribute("data-cit-table-flip-state") || "",
              playing: rightHud.classList.contains("codex-interface-theme-table-flip-playing"),
              frame: rightHud.getAttribute("data-cit-table-flip-frame") || "",
              backgroundImage: activeTableFlipAnimated ? getComputedStyle(activeTableFlipAnimated).backgroundImage.slice(0, 32) : "",
              backgroundPositionX: activeTableFlipAnimated ? getComputedStyle(activeTableFlipAnimated).backgroundPositionX : ""
            };
            await new Promise((resolve) => setTimeout(resolve, 1800));
            const releasedTableFlipAnimated = rightHud.querySelector(".codex-interface-theme-table-flip-cat-animated");
            const after = {
              state: rightHud.getAttribute("data-cit-table-flip-state") || "",
              playing: rightHud.classList.contains("codex-interface-theme-table-flip-playing"),
              frame: rightHud.getAttribute("data-cit-table-flip-frame") || "",
              backgroundImage: releasedTableFlipAnimated ? getComputedStyle(releasedTableFlipAnimated).backgroundImage : "none",
              nodeReleased: !releasedTableFlipAnimated
            };
            tableFlipPlayback = {
              ok: before.state === "idle" && afterContainerClick.state === "idle" && afterContainerClick.playing === false && during.state === "playing" && during.playing === true && Number(during.frame) > 0 && during.backgroundImage.startsWith('url("data:image/') && after.state === "idle" && after.playing === false && after.backgroundImage === "none" && after.nodeReleased,
              before,
              afterContainerClick,
              during,
              after
            };
          }
        }
        return {
          active: root.getAttribute("data-codex-interface-theme") === "active",
          revision: root.getAttribute("data-cit-revision") || "",
          hasStyle: Boolean(style),
          hasMarker: Boolean(marker),
          animationPlaybackResident: Boolean(themeAssetCache.animationPlayback && themeAssetCache.animationPlayback.payload),
          hasBackdrop: Boolean(backdrop),
          hasRightHud: Boolean(rightHud),
          mode: root.getAttribute("data-cit-mode") || "",
          runtimeModules: root.getAttribute("data-cit-runtime-modules") || "",
          runtimePhase: root.getAttribute("data-cit-runtime-phase") || "",
          runtimePhaseModules: root.getAttribute("data-cit-runtime-phase-modules") || "",
          maintenanceIntervalMs: root.getAttribute("data-cit-maintenance-interval-ms") || "",
          heavyMaintenanceMs: root.getAttribute("data-cit-heavy-maintenance-ms") || "",
          staticAccessGeneration: root.getAttribute("data-cit-static-access-generation") || "",
          staticAccessHits: root.getAttribute("data-cit-static-access-hits") || "",
          staticAccessMisses: root.getAttribute("data-cit-static-access-misses") || "",
          staticAccessReason: root.getAttribute("data-cit-static-access-reason") || "",
          workspacePickers: root.getAttribute("data-cit-workspace-pickers") || "",
          workspacePickerShells: String(document.querySelectorAll(".codex-interface-theme-workspace-picker").length),
          workspacePickerBackgroundColor: workspacePickerShellStyle ? workspacePickerShellStyle.backgroundColor : "",
          workspacePickerBackgroundImage: workspacePickerShellStyle ? workspacePickerShellStyle.backgroundImage.slice(0, 120) : "",
          workspacePickerPlate: workspacePickerPlate ? "true" : "false",
          workspacePickerPlateBackgroundColor: workspacePickerPlateStyle ? workspacePickerPlateStyle.backgroundColor : "",
          iconBadge: root.getAttribute("data-cit-icon-badge") || "",
          buttonIcons: root.getAttribute("data-cit-button-icons") || "",
          buttonSidebarNavigation: root.getAttribute("data-cit-button-sidebar-navigation") || "",
          buttonTitlebarNavigation: root.getAttribute("data-cit-button-titlebar-navigation") || "",
          buttonComposerControls: root.getAttribute("data-cit-button-composer-controls") || "",
          buttonTopUtilityActions: root.getAttribute("data-cit-button-top-utility-actions") || "",
          buttonMessageActions: root.getAttribute("data-cit-button-message-actions") || "",
          buttonProjectPanelRows: root.getAttribute("data-cit-button-project-panel-rows") || "",
          projectPanels: root.getAttribute("data-cit-project-panels") || "",
          rightMajorPanel: root.getAttribute("data-cit-right-major-panel") || "",
          tableFlipCatMode: root.getAttribute("data-cit-table-flip-cat-mode") || "",
          rightHudMode: rightHud ? rightHud.getAttribute("data-cit-table-flip-mode") || "" : "",
          rightHudUsesSprite: rightHud ? rightHud.getAttribute("data-cit-uses-sprite") || "" : "",
          rightHudState: rightHud ? rightHud.getAttribute("data-cit-table-flip-state") || "" : "",
          rightHudRole: rightHud ? rightHud.getAttribute("role") || "" : "",
          rightHudTabindex: rightHud ? rightHud.getAttribute("tabindex") || "" : "",
          rightHudOutlineStyle: rightHudStyle ? rightHudStyle.outlineStyle : "",
          rightHudOutlineWidth: rightHudStyle ? rightHudStyle.outlineWidth : "",
          rightHudBoxShadow: rightHudStyle ? rightHudStyle.boxShadow : "",
          rightHudPointerEvents: rightHudStyle ? rightHudStyle.pointerEvents : "",
          tableFlipTriggerRole: tableFlipTrigger ? tableFlipTrigger.getAttribute("role") || "" : "",
          tableFlipTriggerTabindex: tableFlipTrigger ? tableFlipTrigger.getAttribute("tabindex") || "" : "",
          tableFlipTriggerPointerEvents: tableFlipTriggerStyle ? tableFlipTriggerStyle.pointerEvents : "",
          tableFlipAnimatedTag: tableFlipAnimated ? tableFlipAnimated.tagName : "",
          tableFlipAnimatedBackgroundImage: tableFlipAnimatedStyle ? tableFlipAnimatedStyle.backgroundImage.slice(0, 96) : "",
          tableFlipAnimatedAnimationName: tableFlipAnimatedStyle ? tableFlipAnimatedStyle.animationName : "",
          hasCharacter: Boolean(character),
          characterRetreat: root.getAttribute("data-cit-character-retreat") || "",
          characterDisplay: characterStyle ? characterStyle.display : "",
          characterOpacity: characterStyle ? characterStyle.opacity : "",
          composerLayers,
          composerNativeFade: composerNativeFade && composerNativeFadeStyle && composerNativeFadeRect ? {
            className: String(composerNativeFade.className || "").slice(0, 280),
            left: Math.round(composerNativeFadeRect.left),
            top: Math.round(composerNativeFadeRect.top),
            width: Math.round(composerNativeFadeRect.width),
            height: Math.round(composerNativeFadeRect.height),
            backgroundColor: composerNativeFadeStyle.backgroundColor,
            backgroundImage: composerNativeFadeStyle.backgroundImage.slice(0, 180),
            opacity: composerNativeFadeStyle.opacity,
            display: composerNativeFadeStyle.display,
            visibility: composerNativeFadeStyle.visibility
          } : null,
          selection: activeSelection ? {
            text: String(activeSelection).slice(0, 240),
            rangeCount: activeSelection.rangeCount,
            rects: selectionRects
          } : null,
          composerPaintedDescendants,
          composerPointLayers,
          characterRetreatPanels,
          tableFlipPlayback,
          href: String(location.href)
        };
      })();`,
      awaitPromise: true,
      returnByValue: true
    }, 15000);
    const value = result.result && result.result.value ? result.result.value : {};
    if (screenshotPath) {
      let previousComposerStyle = null;
      if (hideComposer) {
        const hideResult = await session.send("Runtime.evaluate", {
          expression: `(() => {
            const composer = document.querySelector(".codex-interface-theme-composer-surface") || document.querySelector(".composer-surface-chrome");
            if (!composer) {
              return { found: false, previousStyle: null, pointLayers: [], paintedOverlaps: [], dockNodes: [] };
            }
            const rect = composer.getBoundingClientRect();
            const previousStyle = composer.getAttribute("style");
            composer.style.setProperty("visibility", "hidden", "important");
            const describe = (node) => {
              const nodeRect = node.getBoundingClientRect();
              const computed = getComputedStyle(node);
              const before = getComputedStyle(node, "::before");
              const after = getComputedStyle(node, "::after");
              return {
                tag: node.tagName,
                id: node.id || "",
                className: String(node.className || "").slice(0, 240),
                left: Math.round(nodeRect.left),
                top: Math.round(nodeRect.top),
                width: Math.round(nodeRect.width),
                height: Math.round(nodeRect.height),
                position: computed.position,
                zIndex: computed.zIndex,
                pointerEvents: computed.pointerEvents,
                backgroundColor: computed.backgroundColor,
                backgroundImage: computed.backgroundImage.slice(0, 140),
                boxShadow: computed.boxShadow.slice(0, 140),
                border: computed.border,
                outline: computed.outline,
                filter: computed.filter,
                backdropFilter: computed.backdropFilter || computed.webkitBackdropFilter || "",
                opacity: computed.opacity,
                maskImage: (computed.maskImage || computed.webkitMaskImage || "").slice(0, 120),
                beforeContent: before.content,
                beforeBackgroundColor: before.backgroundColor,
                beforeBackgroundImage: before.backgroundImage.slice(0, 100),
                afterContent: after.content,
                afterBackgroundColor: after.backgroundColor,
                afterBackgroundImage: after.backgroundImage.slice(0, 100)
              };
            };
            const points = [
              [rect.left + rect.width / 2, rect.top + rect.height / 2],
              [rect.left + 12, rect.top + 12],
              [rect.right - 12, rect.bottom - 12],
              [rect.left + rect.width / 2, Math.min(window.innerHeight - 2, rect.bottom + 24)]
            ];
            const pointLayers = points.map(([x, y]) => ({
              x: Math.round(x),
              y: Math.round(y),
              layers: document.elementsFromPoint(x, y).slice(0, 24).map(describe)
            }));
            const paintedOverlaps = Array.from(document.querySelectorAll("body *")).filter((node) => {
              if (node === composer || composer.contains(node)) {
                return false;
              }
              const nodeRect = node.getBoundingClientRect();
              if (nodeRect.width <= 0 || nodeRect.height <= 0 || nodeRect.right <= rect.left || nodeRect.left >= rect.right || nodeRect.bottom <= rect.top || nodeRect.top >= rect.bottom) {
                return false;
              }
              const computed = getComputedStyle(node);
              const before = getComputedStyle(node, "::before");
              const after = getComputedStyle(node, "::after");
              return computed.backgroundColor !== "rgba(0, 0, 0, 0)" ||
                computed.backgroundImage !== "none" ||
                computed.boxShadow !== "none" ||
                computed.filter !== "none" ||
                (computed.backdropFilter || computed.webkitBackdropFilter || "none") !== "none" ||
                before.content !== "none" ||
                after.content !== "none";
            }).slice(0, 80).map(describe);
            const stickyDock = composer.closest(".sticky.bottom-0");
            const dockNodes = stickyDock ? [stickyDock, ...Array.from(stickyDock.querySelectorAll("*"))].filter((node) => {
              if (node === composer || composer.contains(node)) {
                return false;
              }
              const nodeRect = node.getBoundingClientRect();
              const computed = getComputedStyle(node);
              return nodeRect.width > 2 && nodeRect.height > 2 && computed.display !== "none" && computed.visibility !== "hidden" && computed.opacity !== "0";
            }).slice(0, 120).map((node) => ({
              ...describe(node),
              text: String(node.innerText || node.textContent || "").replace(/\s+/g, " ").trim().slice(0, 180),
              html: String(node.outerHTML || "").slice(0, 320)
            })) : [];
            return { found: true, previousStyle, pointLayers, paintedOverlaps, dockNodes };
          })();`,
          awaitPromise: false,
          returnByValue: true
        });
        const hideValue = hideResult.result && hideResult.result.value ? hideResult.result.value : { found: false, previousStyle: null };
        previousComposerStyle = hideValue.previousStyle;
        value.composerHiddenDiagnostic = hideValue.found === true;
        value.composerHiddenPointLayers = hideValue.pointLayers || [];
        value.composerHiddenPaintedOverlaps = hideValue.paintedOverlaps || [];
        value.composerHiddenDockNodes = hideValue.dockNodes || [];
        await sleep(80);
      }
      try {
        const screenshot = await session.send("Page.captureScreenshot", {
          format: "png",
          captureBeyondViewport: false
        }, 15000);
        if (!screenshot.data) {
          throw new Error("CDP did not return screenshot data");
        }
        const absoluteScreenshot = path.resolve(screenshotPath);
        mkdirp(path.dirname(absoluteScreenshot));
        fs.writeFileSync(absoluteScreenshot, Buffer.from(screenshot.data, "base64"), { mode: 0o600 });
        value.screenshot = absoluteScreenshot;
      } finally {
        if (hideComposer && value.composerHiddenDiagnostic) {
          await session.send("Runtime.evaluate", {
            expression: `(() => {
              const composer = document.querySelector(".codex-interface-theme-composer-surface") || document.querySelector(".composer-surface-chrome");
              if (!composer) {
                return false;
              }
              const previousStyle = ${JSON.stringify(previousComposerStyle)};
              if (previousStyle === null) {
                composer.removeAttribute("style");
              } else {
                composer.setAttribute("style", previousStyle);
              }
              return true;
            })();`,
            awaitPromise: false,
            returnByValue: true
          }).catch(() => {});
        }
      }
    }
    return value;
  } finally {
    session.close();
  }
}

async function applyOnce(port, paths, waitMs = 0) {
  const payload = buildPayload(paths);
  const targets = waitMs > 0
    ? await waitForInjectableTargets(port, waitMs)
    : (await listTargets(port)).filter(isInjectableTarget);
  if (targets.length === 0) {
    throw new Error("no injectable Codex renderer targets found");
  }
  const results = [];
  for (const target of targets) {
    try {
      const result = await applyToTarget(target, payload);
      results.push({ id: target.id, title: target.title, url: target.url, ok: true, result });
    } catch (error) {
      results.push({ id: target.id, title: target.title, url: target.url, ok: false, error: error.message });
    }
  }
  const okCount = results.filter((item) => item.ok).length;
  if (okCount === 0) {
    throw new Error(`failed to inject all ${results.length} target(s): ${JSON.stringify(results)}`);
  }
  return { revision: payload.revision, targets: results };
}

async function runDaemon(port, paths, waitMs) {
  await waitForCdp(port, waitMs);
  await stopExistingDaemonForPort(paths, port);
  mkdirp(paths.runDir);
  const sessionInfo = {
    port,
    pid: process.pid,
    mode: "daemon",
    startedAt: new Date().toISOString(),
    engineRoot: ENGINE_ROOT
  };
  writeJsonAtomic(paths.session, sessionInfo);
  appendLog(paths, `daemon started on 127.0.0.1:${port}`);

  let lastSummary = "";
  let consecutiveConnectionFailures = 0;
  process.on("SIGINT", () => {
    appendLog(paths, "daemon received SIGINT");
    removeFileIfExists(paths.session);
    process.exit(130);
  });
  process.on("SIGTERM", () => {
    appendLog(paths, "daemon received SIGTERM");
    removeFileIfExists(paths.session);
    process.exit(143);
  });

  while (true) {
    try {
      if (fs.existsSync(paths.pause)) {
        appendLog(paths, "pause requested; removing theme and stopping daemon");
        try {
          await commandRemove(port, paths, { fromDaemon: true });
        } finally {
          removeFileIfExists(paths.pause);
          removeFileIfExists(paths.session);
        }
        return;
      }
      const result = await applyOnce(port, paths);
      const summary = `${result.revision}:${result.targets.map((target) => `${target.id}:${target.ok ? "ok" : "fail"}`).join(",")}`;
      if (summary !== lastSummary) {
        appendLog(paths, `applied revision ${result.revision} to ${result.targets.length} target(s)`);
        lastSummary = summary;
      }
    } catch (error) {
      appendLog(paths, `apply failed: ${error.message}`);
      const message = String(error.message || "");
      const connectionLost = /fetch failed|ECONNREFUSED|ECONNRESET|CDP did not become ready|Failed to connect|WebSocket/i.test(message);
      consecutiveConnectionFailures = connectionLost ? consecutiveConnectionFailures + 1 : 0;
      if (consecutiveConnectionFailures >= 5) {
        appendLog(paths, `CDP disconnected on 127.0.0.1:${port}; stopping daemon after ${consecutiveConnectionFailures} consecutive connection failure(s)`);
        removeFileIfExists(paths.session);
        return;
      }
      if (!connectionLost) {
        consecutiveConnectionFailures = 0;
      }
    }
    await sleep(APPLY_INTERVAL_MS);
  }
}

function inferPort(options, paths) {
  if (options.port) {
    const parsed = Number(options.port);
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
      throw new Error(`invalid port: ${options.port}`);
    }
    return parsed;
  }
  if (fs.existsSync(paths.session)) {
    const session = readJson(paths.session);
    const parsed = Number(session.port);
    if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 65535) {
      return parsed;
    }
  }
  throw new Error("missing --port and no saved session port exists");
}

function readSessionIfPresent(paths) {
  if (!fs.existsSync(paths.session)) {
    return null;
  }
  try {
    return readJson(paths.session);
  } catch {
    return null;
  }
}

function processExists(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function stopExistingDaemonForPort(paths, port) {
  const session = readSessionIfPresent(paths);
  if (!session || session.mode !== "daemon") {
    return false;
  }

  const existingPid = Number(session.pid);
  const existingPort = Number(session.port);
  if (!Number.isInteger(existingPid) || existingPid === process.pid || existingPort !== port) {
    return false;
  }
  if (session.engineRoot && session.engineRoot !== ENGINE_ROOT) {
    return false;
  }
  if (!processExists(existingPid)) {
    removeFileIfExists(paths.session);
    return false;
  }

  appendLog(paths, `stopping previous daemon pid=${existingPid} on port ${port}`);
  try {
    process.kill(existingPid, "SIGTERM");
  } catch {
    return false;
  }

  const deadline = Date.now() + 3500;
  while (Date.now() <= deadline) {
    if (!processExists(existingPid)) {
      appendLog(paths, `previous daemon pid=${existingPid} stopped`);
      removeFileIfExists(paths.session);
      return true;
    }
    await sleep(150);
  }

  appendLog(paths, `previous daemon pid=${existingPid} still running after SIGTERM`);
  return false;
}

async function waitForDaemonPause(paths, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    const session = readSessionIfPresent(paths);
    if (!session || session.mode !== "daemon" || !processExists(Number(session.pid))) {
      return true;
    }
    await sleep(150);
  }
  return false;
}

async function requestDaemonPause(paths) {
  const session = readSessionIfPresent(paths);
  if (!session || session.mode !== "daemon" || Number(session.pid) === process.pid) {
    return false;
  }
  if (session.engineRoot && session.engineRoot !== ENGINE_ROOT) {
    return false;
  }
  writeJsonAtomic(paths.pause, {
    requestedAt: new Date().toISOString(),
    requestedByPid: process.pid,
    daemonPid: session.pid,
    engineRoot: ENGINE_ROOT
  });
  return processExists(Number(session.pid));
}

async function commandRemove(port, paths, options = {}) {
  if (!options.fromDaemon) {
    const daemonWasRunning = await requestDaemonPause(paths);
    if (daemonWasRunning) {
      const stopped = await waitForDaemonPause(paths, 3500);
      if (stopped) {
        appendLog(paths, "daemon stopped after restore pause request");
      } else {
        appendLog(paths, "daemon did not stop before direct restore; continuing direct removal");
      }
    }
  }

  const targets = (await listTargets(port)).filter(isInjectableTarget);
  if (targets.length === 0) {
    throw new Error("no injectable renderer targets found for restore");
  }
  const results = [];
  for (const target of targets) {
    try {
      const result = await removeFromTarget(target);
      results.push({ id: target.id, title: target.title, url: target.url, ok: true, result });
    } catch (error) {
      results.push({ id: target.id, title: target.title, url: target.url, ok: false, error: error.message });
    }
  }
  removeFileIfExists(paths.session);
  if (!options.fromDaemon) {
    removeFileIfExists(paths.pause);
  }
  appendLog(paths, `restore attempted on ${results.length} target(s)`);
  if (!options.fromDaemon) {
    console.log(JSON.stringify({ ok: results.some((item) => item.ok), targets: results }, null, 2));
  }
}

async function commandVerify(port, paths, screenshotPath, options = {}) {
  const targets = (await listTargets(port)).filter(isInjectableTarget).sort((left, right) => {
    const leftOverlay = String(left.url || "").includes("initialRoute=%2Favatar-overlay") ? 1 : 0;
    const rightOverlay = String(right.url || "").includes("initialRoute=%2Favatar-overlay") ? 1 : 0;
    return leftOverlay - rightOverlay;
  });
  if (targets.length === 0) {
    throw new Error("no injectable renderer targets found for verify");
  }
  const results = [];
  let screenshotUsed = false;
  for (const target of targets) {
    try {
      const result = await verifyTarget(target, screenshotUsed ? "" : screenshotPath, options.simulateTableFlip === true, options.hideComposer === true);
      if (result.screenshot) {
        screenshotUsed = true;
      }
      results.push({ id: target.id, title: target.title, url: target.url, ok: true, result });
    } catch (error) {
      results.push({ id: target.id, title: target.title, url: target.url, ok: false, error: error.message });
    }
  }
  const active = results.some((item) => item.ok && item.result && item.result.active && item.result.hasStyle && item.result.hasMarker);
  const playbackOk = options.simulateTableFlip === true
    ? results.some((item) => item.ok && item.result && item.result.tableFlipPlayback && item.result.tableFlipPlayback.ok === true && item.result.tableFlipPlayback.skipped !== true)
    : true;
  const output = { ok: active && playbackOk, targets: results };
  console.log(JSON.stringify(output, null, 2));
  if (!active || !playbackOk) {
    process.exitCode = 2;
  }
}

async function main() {
  const options = parseArgs(process.argv);
  if (options.help) {
    console.log(usage());
    return;
  }

  const modeCount = ["once", "daemon", "remove", "verify"].filter((name) => options[name]).length;
  if (modeCount !== 1) {
    throw new Error(`choose exactly one mode: --once, --daemon, --remove, or --verify${"\n"}${usage()}`);
  }

  const stateDir = path.resolve(requireOption(options, "state-dir"));
  const paths = statePaths(stateDir);
  mkdirp(paths.logsDir);
  mkdirp(paths.runDir);

  if (options.once || options.daemon) {
    const port = inferPort(options, paths);
    const waitMs = options["wait-ms"] ? Number(options["wait-ms"]) : DEFAULT_WAIT_MS;
    if (!Number.isFinite(waitMs) || waitMs < 0) {
      throw new Error(`invalid wait-ms: ${options["wait-ms"]}`);
    }
    if (options.once) {
      await waitForCdp(port, waitMs);
      const result = await applyOnce(port, paths, waitMs);
      writeJsonAtomic(paths.session, {
        port,
        pid: process.pid,
        mode: "once",
        appliedAt: new Date().toISOString(),
        revision: result.revision,
        engineRoot: ENGINE_ROOT
      });
      console.log(JSON.stringify({ ok: true, ...result }, null, 2));
      return;
    }
    await runDaemon(port, paths, waitMs);
    return;
  }

  const port = inferPort(options, paths);
  if (options.remove) {
    await commandRemove(port, paths);
    return;
  }
  if (options.verify) {
    await commandVerify(port, paths, options.screenshot ? path.resolve(options.screenshot) : "", {
      simulateTableFlip: options["simulate-table-flip"] === true,
      hideComposer: options["hide-composer"] === true
    });
  }
}

try {
  await main();
} catch (error) {
  console.error(`[codex-interface-theme][injector] ${error.message}`);
  process.exitCode = 1;
}
