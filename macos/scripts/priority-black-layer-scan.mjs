#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const MEMORY_DIR = path.join(path.dirname(SCRIPT_DIR), "previews", "global-black-layer-memory");
const MEMORY_PATH = path.join(MEMORY_DIR, "latest-priority-black-layers.json");

function usage() {
  return `Usage:
  priority-black-layer-scan.mjs --port <port> --out-dir <absolute-path> [--format text|json]

Connects to an existing Codex CDP renderer, captures the current UI state,
opens reversible priority surfaces, and records near-black DOM ownership.
It does not restart Codex, force quit, select menu actions, drag, restore,
apply a theme, or click destructive/write/permission controls.`;
}

function parseArgs(argv) {
  const options = {
    port: "",
    outDir: "",
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
    if (!value || value.startsWith("--")) {
      throw new Error(`missing value for ${key}`);
    }
    options[key.slice(2).replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase())] = value;
    index += 1;
  }
  return options;
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJsonIfExists(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchJson(url, timeoutMs = 2500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for ${url}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function isInjectableTarget(target) {
  if (!target || target.type !== "page" || !target.webSocketDebuggerUrl) {
    return false;
  }
  const url = String(target.url || "");
  if (url.startsWith("devtools://") || url.startsWith("chrome://") || url.startsWith("chrome-extension://")) {
    return false;
  }
  return url === "about:blank" || url.startsWith("app://") || /codex|chatgpt/i.test(String(target.title || ""));
}

function chooseTarget(targets) {
  const pages = targets.filter(isInjectableTarget);
  const main = pages.find((target) => String(target.url || "") === "app://-/index.html");
  if (main) {
    return main;
  }
  const nonAvatar = pages.find((target) => !String(target.url || "").includes("avatar-overlay"));
  if (nonAvatar) {
    return nonAvatar;
  }
  return pages[0] || null;
}

class CdpSession {
  constructor(webSocketUrl) {
    if (typeof WebSocket !== "function") {
      throw new Error("global WebSocket is unavailable; use Node.js with WebSocket support");
    }
    this.webSocketUrl = webSocketUrl;
    this.nextId = 1;
    this.pending = new Map();
    this.socket = null;
  }

  async open() {
    this.socket = new WebSocket(this.webSocketUrl);
    this.socket.addEventListener("message", (event) => {
      let message = null;
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
        pending.reject(new Error(message.error.message || "CDP command failed"));
      } else {
        pending.resolve(message.result || {});
      }
    });
    this.socket.addEventListener("error", (error) => {
      for (const pending of this.pending.values()) {
        pending.reject(error);
      }
      this.pending.clear();
    });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("CDP websocket open timeout")), 5000);
      this.socket.addEventListener("open", () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });
      this.socket.addEventListener("error", (error) => {
        clearTimeout(timer);
        reject(error);
      }, { once: true });
    });
  }

  send(method, params = {}) {
    const id = this.nextId;
    this.nextId += 1;
    const payload = JSON.stringify({ id, method, params });
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(payload);
    });
  }

  close() {
    if (this.socket) {
      this.socket.close();
    }
  }
}

async function evaluate(session, expression, timeoutMs = 10000) {
  const result = await session.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
    timeout: timeoutMs
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || "Runtime.evaluate exception");
  }
  return result.result ? result.result.value : undefined;
}

async function captureScreenshot(session, filePath) {
  const result = await session.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
    fromSurface: true
  });
  fs.writeFileSync(filePath, Buffer.from(result.data, "base64"));
}

async function pressEscape(session) {
  await session.send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Escape",
    code: "Escape",
    windowsVirtualKeyCode: 27,
    nativeVirtualKeyCode: 27
  });
  await session.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Escape",
    code: "Escape",
    windowsVirtualKeyCode: 27,
    nativeVirtualKeyCode: 27
  });
}

async function moveMouse(session, x, y) {
  await session.send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x,
    y,
    button: "none"
  });
}

async function clickPoint(session, x, y) {
  await moveMouse(session, x, y);
  await session.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x,
    y,
    button: "left",
    buttons: 1,
    clickCount: 1
  });
  await session.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x,
    y,
    button: "left",
    buttons: 0,
    clickCount: 1
  });
}

function browserInventoryExpression(label) {
  return `(() => {
    const stateLabel = ${JSON.stringify(label)};
    const viewport = {
      width: window.innerWidth,
      height: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio || 1,
      url: location.href,
      title: document.title
    };
    const parseColor = (value) => {
      const text = String(value || "").trim();
      if (!text || text === "transparent" || text === "initial" || text === "inherit") {
        return null;
      }
      const match = text.match(/rgba?\\(([^)]+)\\)/i);
      if (!match) {
        return null;
      }
      const parts = match[1].split(/[,/]/).map((part) => part.trim()).filter(Boolean);
      if (parts.length < 3) {
        return null;
      }
      const channel = (part) => {
        if (part.endsWith("%")) {
          return Math.max(0, Math.min(255, Number.parseFloat(part) * 2.55));
        }
        return Math.max(0, Math.min(255, Number.parseFloat(part)));
      };
      const alpha = parts[3] === undefined ? 1 : Math.max(0, Math.min(1, Number.parseFloat(parts[3])));
      const r = channel(parts[0]);
      const g = channel(parts[1]);
      const b = channel(parts[2]);
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      return {
        value: text,
        r,
        g,
        b,
        a: Number.isFinite(alpha) ? alpha : 1,
        luminance: 0.2126 * r + 0.7152 * g + 0.0722 * b,
        chroma: max - min,
        max
      };
    };
    const isNearBlack = (color) => {
      if (!color || color.a < 0.12) {
        return false;
      }
      if (color.a <= 0.72 && color.chroma >= 22 && color.max >= 48) {
        return false;
      }
      if (color.luminance <= 70 && color.max <= 92) {
        return true;
      }
      if (color.luminance <= 96 && color.chroma <= 34) {
        return true;
      }
      return false;
    };
    const colorsInText = (value) => {
      const text = String(value || "");
      const matches = text.match(/rgba?\\([^)]+\\)/gi) || [];
      return matches.map(parseColor).filter(Boolean);
    };
    const hasNearBlackColorInText = (value) => colorsInText(value).some(isNearBlack);
    const hasGradientText = (value) => /gradient|oklab\\(/i.test(String(value || ""));
    const addColorLayer = (layers, name, value) => {
      const color = parseColor(value);
      if (isNearBlack(color)) {
        layers.push({
          layer: name,
          kind: "color",
          value: color.value,
          luminance: Math.round(color.luminance),
          alpha: color.a
        });
      }
    };
    const addTextLayer = (blackLayers, gradientLayers, name, value) => {
      const text = String(value || "");
      if (!text || text === "none") {
        return;
      }
      if (hasNearBlackColorInText(text)) {
        blackLayers.push({
          layer: name,
          kind: "paint",
          value: text.slice(0, 220)
        });
      }
      if (hasGradientText(text)) {
        gradientLayers.push({
          layer: name,
          kind: "gradient",
          value: text.slice(0, 220)
        });
      }
    };
    const textOf = (node) => {
      const text = (node.innerText || node.textContent || "").replace(/\\s+/g, " ").trim();
      return text.slice(0, 180);
    };
    const labelOf = (node) => {
      const parts = [
        node.getAttribute("aria-label"),
        node.getAttribute("title"),
        node.getAttribute("placeholder"),
        textOf(node)
      ].filter(Boolean);
      return parts.join(" | ").replace(/\\s+/g, " ").trim().slice(0, 220);
    };
    const simple = (node) => {
      if (!node || node.nodeType !== Node.ELEMENT_NODE) {
        return "";
      }
      const id = node.id ? "#" + node.id : "";
      const role = node.getAttribute("role") ? "[role=" + node.getAttribute("role") + "]" : "";
      const cls = String(node.className || "").replace(/\\s+/g, ".").slice(0, 120);
      return node.tagName.toLowerCase() + id + (cls ? "." + cls : "") + role;
    };
    const ancestry = (node) => {
      const chain = [];
      let current = node;
      for (let index = 0; current && index < 7; index += 1) {
        chain.push(simple(current));
        current = current.parentElement;
      }
      return chain;
    };
    const inferOwner = (node, rect, labelText) => {
      const text = String(labelText || "");
      const cls = String(node.className || "");
      if (node.closest(".composer-surface-chrome,.codex-interface-theme-composer-surface,.codex-interface-theme-composer-dock,.codex-interface-theme-composer-native-floor,[class*='ComposerLayoutRoot']")) {
        if (node.closest("[class*='ComposerTopMenuShell']")) {
          return "transientMenuShell";
        }
        return "composerSurface";
      }
      if (node.closest("[class*='ComposerTopMenuShell']")) {
        return "transientMenuShell";
      }
      if (node.closest("[role='menu'],[role='dialog'],[role='listbox'],[cmdk-root],[data-radix-popper-content-wrapper]")) {
        if (/檢閱|終端|瀏覽器|檔案|側邊對話/.test(text)) {
          return "commandPaletteShell";
        }
        return "transientMenuShell";
      }
      if (node.closest(".codex-interface-theme-project-panel,.codex-interface-theme-project-panel-frame") || /環境|來源|輸出內容|進度表|查看全部/.test(text)) {
        return "rightSourceOutputPanel";
      }
      if (node.closest("aside,[class*='sidebar'],[class*='Sidebar']")) {
        return "leftSidebarRows";
      }
      if (
        rect.left >= 220 &&
        rect.left <= Math.max(720, viewport.width * 0.42) &&
        rect.top >= 60 &&
        rect.top <= viewport.height * 0.72 &&
        rect.width >= 180 &&
        rect.height >= 38 &&
        rect.height <= 220 &&
        /Dream Skin|專案勝率|skin|最近項目|封存對話|未讀/.test(text)
      ) {
        return "sidebarHoverPreviewShell";
      }
      if (/ComposerLayoutRoot|composer/i.test(cls)) {
        return "composerSurface";
      }
      if (rect.left > viewport.width * 0.45 && rect.width > viewport.width * 0.28 && rect.height > viewport.height * 0.45) {
        return "browserWebviewShell";
      }
      if (node.closest("main")) {
        if (/引用|複製|分享|更多/.test(text)) {
          return "conversationSurface.messageRows";
        }
        return "routeOrConversationShell";
      }
      return "unclassified";
    };
    const visibleRect = (node) => {
      const rect = node.getBoundingClientRect();
      if (!rect || rect.width < 6 || rect.height < 6) {
        return null;
      }
      if (rect.right <= 0 || rect.bottom <= 0 || rect.left >= viewport.width || rect.top >= viewport.height) {
        return null;
      }
      return {
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        right: Math.round(rect.right),
        bottom: Math.round(rect.bottom),
        area: Math.round(rect.width * rect.height)
      };
    };
    const records = [];
    for (const node of document.querySelectorAll("body *")) {
      const rect = visibleRect(node);
      if (!rect) {
        continue;
      }
      const style = getComputedStyle(node);
      const before = getComputedStyle(node, "::before");
      const after = getComputedStyle(node, "::after");
      const blackLayers = [];
      const gradientLayers = [];
      addColorLayer(blackLayers, "element.backgroundColor", style.backgroundColor);
      addColorLayer(blackLayers, "element.borderTopColor", style.borderTopColor);
      addColorLayer(blackLayers, "element.outlineColor", style.outlineColor);
      addColorLayer(blackLayers, "before.backgroundColor", before.backgroundColor);
      addColorLayer(blackLayers, "after.backgroundColor", after.backgroundColor);
      addTextLayer(blackLayers, gradientLayers, "element.backgroundImage", style.backgroundImage);
      addTextLayer(blackLayers, gradientLayers, "before.backgroundImage", before.backgroundImage);
      addTextLayer(blackLayers, gradientLayers, "after.backgroundImage", after.backgroundImage);
      addTextLayer(blackLayers, gradientLayers, "element.boxShadow", style.boxShadow);
      addTextLayer(blackLayers, gradientLayers, "before.boxShadow", before.boxShadow);
      addTextLayer(blackLayers, gradientLayers, "after.boxShadow", after.boxShadow);
      addTextLayer(blackLayers, gradientLayers, "element.filter", style.filter);
      addTextLayer(blackLayers, gradientLayers, "element.backdropFilter", style.backdropFilter || style.webkitBackdropFilter);
      const nearBlackKeys = blackLayers.map((layer) => layer.layer);
      const hasGradient = gradientLayers.length > 0;
      if (blackLayers.length === 0 && !hasGradient) {
        continue;
      }
      const nodeLabel = labelOf(node);
      const owner = inferOwner(node, rect, nodeLabel);
      const pointerEvents = style.pointerEvents;
      const zIndex = style.zIndex;
      records.push({
        owner,
        nearBlackKeys,
        blackLayers,
        gradientLayers,
        stackedBlackLayerCount: blackLayers.length,
        stackedVisualLayerCount: blackLayers.length + gradientLayers.length,
        needsReplacement: blackLayers.length > 0,
        blackCandidate: blackLayers.length > 0,
        gradientOnly: blackLayers.length === 0 && hasGradient,
        hasGradient,
        rect,
        tag: node.tagName.toLowerCase(),
        role: node.getAttribute("role") || "",
        ariaLabel: node.getAttribute("aria-label") || "",
        label: nodeLabel,
        className: String(node.className || "").replace(/\\s+/g, " ").trim().slice(0, 260),
        background: style.backgroundColor,
        backgroundImage: String(style.backgroundImage || "").slice(0, 180),
        beforeBackground: before.backgroundColor,
        beforeBackgroundImage: String(before.backgroundImage || "").slice(0, 120),
        afterBackground: after.backgroundColor,
        afterBackgroundImage: String(after.backgroundImage || "").slice(0, 120),
        pointerEvents,
        zIndex,
        ancestry: ancestry(node)
      });
    }
    records.sort((a, b) => {
      if (a.owner !== b.owner) {
        return a.owner.localeCompare(b.owner);
      }
      return b.rect.area - a.rect.area;
    });
    const byOwner = {};
    const byOwnerNearBlack = {};
    const byOwnerGradientOnly = {};
    for (const record of records) {
      byOwner[record.owner] = (byOwner[record.owner] || 0) + 1;
      if (record.blackCandidate) {
        byOwnerNearBlack[record.owner] = (byOwnerNearBlack[record.owner] || 0) + 1;
      }
      if (record.gradientOnly) {
        byOwnerGradientOnly[record.owner] = (byOwnerGradientOnly[record.owner] || 0) + 1;
      }
    }
    return {
      state: stateLabel,
      capturedAt: new Date().toISOString(),
      viewport,
      totalCandidates: records.length,
      nearBlackCandidates: records.filter((record) => record.blackCandidate).length,
      gradientOnlyCandidates: records.filter((record) => record.gradientOnly).length,
      byOwner,
      byOwnerNearBlack,
      byOwnerGradientOnly,
      candidates: records.slice(0, 120)
    };
  })()`;
}

async function collectInventory(session, label, outDir) {
  const report = await evaluate(session, browserInventoryExpression(label), 15000);
  const filePath = path.join(outDir, `${label}-dom-black-inventory.json`);
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2));
  return { filePath, report };
}

async function collectState(session, label, outDir) {
  const screenshot = path.join(outDir, `${label}.png`);
  await captureScreenshot(session, screenshot);
  const inventory = await collectInventory(session, label, outDir);
  return {
    label,
    screenshot,
    domInventory: inventory.filePath,
    totalCandidates: inventory.report.totalCandidates,
    nearBlackCandidates: inventory.report.nearBlackCandidates,
    gradientOnlyCandidates: inventory.report.gradientOnlyCandidates,
    byOwner: inventory.report.byOwner,
    byOwnerNearBlack: inventory.report.byOwnerNearBlack,
    byOwnerGradientOnly: inventory.report.byOwnerGradientOnly
  };
}

function bucket(value, size = 12) {
  return Math.round(Number(value || 0) / size) * size;
}

function layerPositionKey(stateLabel, candidate) {
  const rect = candidate.rect || {};
  const layers = Array.isArray(candidate.nearBlackKeys) && candidate.nearBlackKeys.length > 0
    ? candidate.nearBlackKeys.join("+")
    : (Array.isArray(candidate.gradientLayers) && candidate.gradientLayers.length > 0 ? "gradient-only" : "unknown-layer");
  const classToken = String(candidate.className || "").replace(/\s+/g, " ").trim().slice(0, 96);
  return [
    stateLabel,
    candidate.owner || "unclassified",
    candidate.tag || "",
    candidate.role || "",
    bucket(rect.left),
    bucket(rect.top),
    bucket(rect.width),
    bucket(rect.height),
    layers,
    classToken
  ].join("|");
}

function extractMemoryLayers(result) {
  const layers = [];
  for (const state of result.states || []) {
    const inventory = readJsonIfExists(state.domInventory);
    const candidates = inventory && Array.isArray(inventory.candidates) ? inventory.candidates : [];
    for (const candidate of candidates) {
      if (!candidate.blackCandidate && !candidate.gradientOnly) {
        continue;
      }
      const key = layerPositionKey(state.label, candidate);
      layers.push({
        key,
        state: state.label,
        owner: candidate.owner || "unclassified",
        tag: candidate.tag || "",
        role: candidate.role || "",
        label: candidate.label || "",
        rect: candidate.rect || {},
        blackCandidate: Boolean(candidate.blackCandidate),
        gradientOnly: Boolean(candidate.gradientOnly),
        stackedBlackLayerCount: Number(candidate.stackedBlackLayerCount || 0),
        stackedVisualLayerCount: Number(candidate.stackedVisualLayerCount || 0),
        nearBlackKeys: candidate.nearBlackKeys || [],
        blackLayers: candidate.blackLayers || [],
        gradientLayers: candidate.gradientLayers || [],
        className: candidate.className || "",
        background: candidate.background || "",
        backgroundImage: candidate.backgroundImage || ""
      });
    }
  }
  return layers;
}

function updateGlobalLayerMemory(result) {
  ensureDir(MEMORY_DIR);
  const previous = readJsonIfExists(MEMORY_PATH);
  const previousLayers = previous && Array.isArray(previous.layers) ? previous.layers : [];
  const previousBlackKeys = new Set(previousLayers.filter((layer) => layer.blackCandidate).map((layer) => layer.key));
  const previousAnyKeys = new Set(previousLayers.map((layer) => layer.key));
  const layers = extractMemoryLayers(result);
  const currentBlackLayers = layers.filter((layer) => layer.blackCandidate);
  const currentBlackKeys = new Set(currentBlackLayers.map((layer) => layer.key));
  const baselineCreated = !previous;
  const becameBlackTargets = baselineCreated ? [] : currentBlackLayers.filter((layer) => !previousBlackKeys.has(layer.key));
  const resolvedBlackLayers = baselineCreated ? [] : previousLayers.filter((layer) => layer.blackCandidate && !currentBlackKeys.has(layer.key));
  const newVisualLayers = baselineCreated ? [] : layers.filter((layer) => !previousAnyKeys.has(layer.key));
  const memory = {
    ok: true,
    mode: "global-black-layer-memory",
    baselineCreated,
    memoryPath: MEMORY_PATH,
    previousScanAt: previous ? previous.scanAt : "",
    currentScanAt: new Date().toISOString(),
    totalRememberedLayers: layers.length,
    currentBlackLayerCount: currentBlackLayers.length,
    becameBlackTargetCount: becameBlackTargets.length,
    resolvedBlackLayerCount: resolvedBlackLayers.length,
    newVisualLayerCount: newVisualLayers.length,
    becameBlackTargets: becameBlackTargets.slice(0, 32),
    resolvedBlackLayers: resolvedBlackLayers.slice(0, 32),
    newVisualLayers: newVisualLayers.slice(0, 32)
  };
  const snapshot = {
    ok: true,
    scanAt: memory.currentScanAt,
    sourceScanOutDir: result.outDir,
    revision: result.revision || "",
    target: result.target,
    layers
  };
  fs.writeFileSync(MEMORY_PATH, `${JSON.stringify(snapshot, null, 2)}\n`);
  fs.writeFileSync(path.join(result.outDir, "global-black-layer-memory.json"), `${JSON.stringify(memory, null, 2)}\n`);
  result.memory = memory;
  return memory;
}

async function findSidebarHoverTarget(session) {
  return await evaluate(session, `(() => {
    const rows = [];
    const nodes = Array.from(document.querySelectorAll("[data-app-action-sidebar-thread-row],[data-app-action-sidebar-thread-title],[role='button'],a,button"));
    for (const node of nodes) {
      const rect = node.getBoundingClientRect();
      if (!rect || rect.width < 80 || rect.height < 18) {
        continue;
      }
      if (rect.left > 260 || rect.top < 180 || rect.top > window.innerHeight - 80) {
        continue;
      }
      const title = [
        node.getAttribute("data-app-action-sidebar-thread-title"),
        node.getAttribute("aria-label"),
        node.getAttribute("title"),
        node.innerText,
        node.textContent
      ].filter(Boolean).join(" ").replace(/\\s+/g, " ").trim();
      if (!title || /新對話|專案$|Pull Request|網站$|已排程|外掛程式|Codex$|語音/.test(title)) {
        continue;
      }
      const score =
        (/Dream Skin|專案勝率|掃描改版後破圖/.test(title) ? 30 : 0) +
        (/data-app-action-sidebar-thread/.test(Array.from(node.attributes).map((item) => item.name).join(" ")) ? 12 : 0) +
        (rect.top < window.innerHeight * 0.72 ? 6 : 0) +
        Math.min(8, Math.round(rect.width / 40));
      rows.push({
        text: title.slice(0, 220),
        score,
        rect: {
          left: Math.round(rect.left),
          top: Math.round(rect.top),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          right: Math.round(rect.right),
          bottom: Math.round(rect.bottom),
          centerX: Math.round(rect.left + rect.width / 2),
          centerY: Math.round(rect.top + rect.height / 2)
        },
        className: String(node.className || "").replace(/\\s+/g, " ").trim().slice(0, 180)
      });
    }
    rows.sort((left, right) => right.score - left.score || left.rect.top - right.rect.top);
    return rows[0] || null;
  })()`, 10000);
}

async function sidebarPreviewStatus(session, targetText) {
  return await evaluate(session, `(() => {
    const targetText = ${JSON.stringify(String(targetText || ""))};
    const normalizedTarget = targetText.replace(/\\s+/g, " ").trim();
    const records = [];
    for (const node of document.querySelectorAll("body *")) {
      const rect = node.getBoundingClientRect();
      if (!rect || rect.width < 160 || rect.height < 34) {
        continue;
      }
      if (rect.right <= 220 || rect.left > Math.max(760, window.innerWidth * 0.46) || rect.top < 40 || rect.top > window.innerHeight * 0.78) {
        continue;
      }
      if (node.closest("aside")) {
        continue;
      }
      const text = (node.innerText || node.textContent || "").replace(/\\s+/g, " ").trim();
      if (!text) {
        continue;
      }
      const style = getComputedStyle(node);
      const backgroundText = [style.backgroundColor, style.backgroundImage, style.boxShadow, style.filter, style.backdropFilter || style.webkitBackdropFilter].join(" ");
      const textMatches =
        /Dream Skin|專案勝率|skin|封存對話|未讀/.test(text) ||
        (normalizedTarget && text.includes(normalizedTarget.slice(0, Math.min(16, normalizedTarget.length))));
      const darkPaint = /rgba?\\((?:\\s*[0-9.]+\\s*,){2}\\s*[0-9.]+\\s*(?:,\\s*(?:0\\.[2-9]|1))?\\)|gradient|shadow/i.test(backgroundText);
      if (!textMatches && !darkPaint) {
        continue;
      }
      records.push({
        text: text.slice(0, 180),
        rect: {
          left: Math.round(rect.left),
          top: Math.round(rect.top),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          right: Math.round(rect.right),
          bottom: Math.round(rect.bottom)
        },
        className: String(node.className || "").replace(/\\s+/g, " ").trim().slice(0, 220),
        backgroundColor: style.backgroundColor,
        backgroundImage: String(style.backgroundImage || "").slice(0, 180),
        boxShadow: String(style.boxShadow || "").slice(0, 180),
        zIndex: style.zIndex
      });
    }
    records.sort((left, right) => left.rect.left - right.rect.left || left.rect.top - right.rect.top);
    return {
      found: records.length > 0,
      candidates: records.slice(0, 12)
    };
  })()`, 10000);
}

async function hoverSidebarPreview(session, sidebarTarget) {
  if (!sidebarTarget || !sidebarTarget.rect) {
    return { found: false, target: sidebarTarget || null, preview: null };
  }
  const rect = sidebarTarget.rect;
  const points = [
    { x: Math.max(rect.left + 8, rect.right - 24), y: rect.centerY },
    { x: rect.centerX, y: rect.centerY },
    { x: Math.max(rect.left + 12, Math.min(rect.right - 8, rect.left + 40)), y: rect.centerY },
    { x: Math.max(rect.left + 8, rect.right - 8), y: Math.max(rect.top + 4, rect.bottom - 6) }
  ];
  let lastPreview = null;
  for (const point of points) {
    await moveMouse(session, point.x, point.y);
    await sleep(950);
    const preview = await sidebarPreviewStatus(session, sidebarTarget.text);
    lastPreview = preview;
    if (preview.found) {
      return {
        found: true,
        target: sidebarTarget,
        point,
        preview
      };
    }
  }
  return {
    found: false,
    target: sidebarTarget,
    point: points[points.length - 1],
    preview: lastPreview
  };
}

async function findPlusButton(session) {
  return await evaluate(session, `(() => {
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const candidates = [];
    const nodes = Array.from(document.querySelectorAll("button,[role='button']"));
    for (const node of nodes) {
      const rect = node.getBoundingClientRect();
      if (!rect || rect.width < 10 || rect.height < 10) {
        continue;
      }
      if (rect.bottom < viewport.height * 0.55) {
        continue;
      }
      const text = [
        node.getAttribute("aria-label"),
        node.getAttribute("title"),
        node.innerText,
        node.textContent
      ].filter(Boolean).join(" ").replace(/\\s+/g, " ").trim();
      const looksLikePlus = /新增檔案|更多內容|附加|附件|attach|add/i.test(text) || text === "+" || /(^|\\s)\\+(\\s|$)/.test(text);
      const svgPlus = !!node.querySelector("svg path[d*='M12 5v14'], svg path[d*='M5 12h14'], svg line");
      if (!looksLikePlus && !svgPlus) {
        continue;
      }
      const disabled = node.disabled || node.getAttribute("aria-disabled") === "true";
      candidates.push({
        text,
        disabled,
        rect: {
          left: Math.round(rect.left),
          top: Math.round(rect.top),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          centerX: Math.round(rect.left + rect.width / 2),
          centerY: Math.round(rect.top + rect.height / 2)
        },
        className: String(node.className || "").replace(/\\s+/g, " ").trim().slice(0, 180)
      });
    }
    candidates.sort((a, b) => {
      const bottomBias = b.rect.centerY - a.rect.centerY;
      if (bottomBias !== 0) {
        return bottomBias;
      }
      return a.rect.left - b.rect.left;
    });
    return candidates.find((candidate) => !candidate.disabled) || null;
  })()`, 10000);
}

async function findButtonByTextPattern(session, patternSource, options = {}) {
  return await evaluate(session, `(() => {
    const pattern = new RegExp(${JSON.stringify(patternSource)}, "i");
    const minTop = ${JSON.stringify(Number(options.minTop || 0))};
    const maxTop = ${JSON.stringify(Number(options.maxTop || 1))};
    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const candidates = [];
    const nodes = Array.from(document.querySelectorAll("button,[role='button']"));
    for (const node of nodes) {
      const rect = node.getBoundingClientRect();
      if (!rect || rect.width < 10 || rect.height < 10) {
        continue;
      }
      const topRatio = rect.top / Math.max(1, viewport.height);
      if (topRatio < minTop || topRatio > maxTop) {
        continue;
      }
      const text = [
        node.getAttribute("aria-label"),
        node.getAttribute("title"),
        node.innerText,
        node.textContent
      ].filter(Boolean).join(" ").replace(/\\s+/g, " ").trim();
      if (!pattern.test(text)) {
        continue;
      }
      const disabled = node.disabled || node.getAttribute("aria-disabled") === "true";
      candidates.push({
        text,
        disabled,
        rect: {
          left: Math.round(rect.left),
          top: Math.round(rect.top),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          centerX: Math.round(rect.left + rect.width / 2),
          centerY: Math.round(rect.top + rect.height / 2)
        },
        className: String(node.className || "").replace(/\\s+/g, " ").trim().slice(0, 180)
      });
    }
    candidates.sort((a, b) => b.rect.top - a.rect.top || b.rect.left - a.rect.left);
    return candidates.find((candidate) => !candidate.disabled) || null;
  })()`, 10000);
}

async function main() {
  const options = parseArgs(process.argv);
  if (options.help) {
    console.log(usage());
    return;
  }
  if (!options.port) {
    throw new Error("missing required option --port");
  }
  if (!options.outDir || !path.isAbsolute(options.outDir)) {
    throw new Error("missing required absolute option --out-dir");
  }
  ensureDir(options.outDir);
  const targets = await fetchJson(`http://127.0.0.1:${options.port}/json/list`);
  const target = chooseTarget(targets);
  if (!target) {
    throw new Error(`no injectable target found on port ${options.port}`);
  }
  const session = new CdpSession(target.webSocketDebuggerUrl);
  const result = {
    ok: true,
    mode: "priority-black-layer-scan",
    port: Number(options.port),
    target: {
      id: target.id,
      title: target.title,
      url: target.url
    },
    outDir: options.outDir,
    states: [],
    interactions: []
  };
  try {
    await session.open();
    await session.send("Page.enable");
    await session.send("Runtime.enable");
    await sleep(300);
    await pressEscape(session);
    await sleep(300);

    result.states.push(await collectState(session, "00-current", options.outDir));

    const sidebarTarget = await findSidebarHoverTarget(session);
    const sidebarHover = await hoverSidebarPreview(session, sidebarTarget);
    result.interactions.push({
      name: "sidebar-hover-preview",
      found: sidebarHover.found,
      target: sidebarHover.target,
      point: sidebarHover.point || null,
      preview: sidebarHover.preview || null
    });
    if (sidebarTarget && sidebarTarget.rect) {
      result.states.push(await collectState(session, "01-sidebar-hover-preview", options.outDir));
      await moveMouse(session, Math.min(12, Math.max(0, sidebarTarget.rect.left + 2)), Math.min(12, Math.max(0, sidebarTarget.rect.top - 16)));
      await pressEscape(session);
      await sleep(350);
    }

    const plusButton = await findPlusButton(session);
    result.interactions.push({ name: "composer-plus-menu", found: !!plusButton, candidate: plusButton });
    if (plusButton && plusButton.rect) {
      await clickPoint(session, plusButton.rect.centerX, plusButton.rect.centerY);
      await sleep(700);
      result.states.push(await collectState(session, "02-plus-menu", options.outDir));
      await pressEscape(session);
      await sleep(400);
    }

    const openModeButton = await findButtonByTextPattern(session, "開啟方式|open mode|open with", { maxTop: 0.18 });
    result.interactions.push({ name: "open-mode-menu", found: !!openModeButton, candidate: openModeButton });
    if (openModeButton && openModeButton.rect) {
      await clickPoint(session, openModeButton.rect.centerX, openModeButton.rect.centerY);
      await sleep(700);
      result.states.push(await collectState(session, "03-open-mode", options.outDir));
      await pressEscape(session);
      await sleep(400);
    }

    result.states.push(await collectState(session, "04-after-escape", options.outDir));
    updateGlobalLayerMemory(result);

    fs.writeFileSync(path.join(options.outDir, "priority-black-layer-scan.json"), JSON.stringify(result, null, 2));
    if (options.format === "json") {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log("[codex-interface-theme] priority black layer scan");
      console.log(`target=${result.target.title} ${result.target.url}`);
      console.log(`outDir=${result.outDir}`);
      for (const state of result.states) {
      console.log(`${state.label}: candidates=${state.totalCandidates} byOwner=${JSON.stringify(state.byOwner)}`);
      console.log(`${state.label}: nearBlack=${state.nearBlackCandidates} byOwnerNearBlack=${JSON.stringify(state.byOwnerNearBlack)}`);
      console.log(`${state.label}: gradientOnly=${state.gradientOnlyCandidates} byOwnerGradientOnly=${JSON.stringify(state.byOwnerGradientOnly)}`);
      }
      for (const interaction of result.interactions) {
        console.log(`interaction ${interaction.name}: found=${interaction.found}`);
      }
      if (result.memory) {
        console.log(`memory baselineCreated=${result.memory.baselineCreated} currentBlack=${result.memory.currentBlackLayerCount} becameBlackTargets=${result.memory.becameBlackTargetCount} resolvedBlack=${result.memory.resolvedBlackLayerCount}`);
        console.log(`memoryPath=${result.memory.memoryPath}`);
      }
    }
  } finally {
    session.close();
  }
}

main().catch((error) => {
  console.error(`[codex-interface-theme][priority-black-layer-scan] ${error.message}`);
  process.exitCode = 1;
});
