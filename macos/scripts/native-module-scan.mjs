#!/usr/bin/env node
import fs from "node:fs";

const DEFAULT_WATCH_INTERVAL_MS = 2500;
const DEFAULT_WATCH_SAMPLES = 4;

function parseArgs(argv) {
  const options = { format: "text", out: "", watch: false, intervalMs: DEFAULT_WATCH_INTERVAL_MS, samples: DEFAULT_WATCH_SAMPLES };
  for (let index = 2; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === "--watch") {
      options.watch = true;
      continue;
    }
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
    const optionName = key.slice(2).replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
    options[optionName] = value;
    index += 1;
  }
  return options;
}

function usage() {
  return "Usage: native-module-scan.mjs --port <port> [--format text|json] [--out <absolute-path>] [--watch --interval-ms <ms> --samples <n>]";
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

class CdpSession {
  constructor(webSocketUrl) {
    if (typeof WebSocket !== "function") {
      throw new Error("global WebSocket is unavailable; use Codex bundled Node v22+");
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
        pending.reject(new Error(message.error.message || JSON.stringify(message.error)));
      } else {
        pending.resolve(message.result || {});
      }
    });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("WebSocket open timeout")), 3000);
      this.socket.addEventListener("open", () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });
      this.socket.addEventListener("error", () => {
        clearTimeout(timer);
        reject(new Error("WebSocket connection failed"));
      }, { once: true });
    });
  }

  send(method, params = {}, timeoutMs = 8000) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("WebSocket is not open"));
    }
    const id = this.nextId;
    this.nextId += 1;
    this.socket.send(JSON.stringify({ id, method, params }));
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
    });
  }

  close() {
    if (this.socket) {
      this.socket.close();
    }
  }
}

function scanExpression() {
  return `JSON.stringify((() => {
    const alphaOf = (value) => {
      const text = String(value || "");
      if (text === "transparent" || text === "none") return 0;
      const match = text.match(/rgba?\\(([^)]+)\\)/i);
      if (!match) return text.includes("color(srgb 0 0 0 / 0)") ? 0 : 1;
      const parts = match[1].split(",").map((part) => Number.parseFloat(part.trim()));
      return parts.length >= 4 && Number.isFinite(parts[3]) ? parts[3] : 1;
    };
    const visible = (node) => {
      if (!node || node.nodeType !== 1) return false;
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return rect.width >= 2 && rect.height >= 2 && rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth && style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || "1") > 0.02;
    };
    const textOf = (node) => String(node && (node.innerText || node.textContent || node.getAttribute("aria-label") || node.getAttribute("title") || "") || "").trim().replace(/\\s+/g, " ");
    const rectOf = (node) => {
      const rect = node.getBoundingClientRect();
      return { left: Math.round(rect.left), top: Math.round(rect.top), right: Math.round(rect.right), bottom: Math.round(rect.bottom), width: Math.round(rect.width), height: Math.round(rect.height) };
    };
    const pathOf = (node) => {
      const parts = [];
      let current = node;
      while (current && current.nodeType === 1 && current !== document.body && parts.length < 10) {
        let siblingIndex = 1;
        let sibling = current;
        while (sibling.previousElementSibling) {
          sibling = sibling.previousElementSibling;
          siblingIndex += 1;
        }
        parts.unshift(current.tagName.toLowerCase() + ":nth-child(" + siblingIndex + ")");
        current = current.parentElement;
      }
      return parts.join(">");
    };
    const visualState = (node) => {
      const style = getComputedStyle(node);
      const before = getComputedStyle(node, "::before");
      const after = getComputedStyle(node, "::after");
      return {
        backgroundColor: style.backgroundColor,
        backgroundImage: String(style.backgroundImage || "").slice(0, 180),
        borderColor: style.borderColor,
        borderRadius: style.borderRadius,
        boxShadow: String(style.boxShadow || "").slice(0, 180),
        opacity: style.opacity,
        zIndex: style.zIndex,
        beforeBackground: before.backgroundColor,
        beforeImage: String(before.backgroundImage || "").slice(0, 120),
        afterBackground: after.backgroundColor,
        afterImage: String(after.backgroundImage || "").slice(0, 120)
      };
    };
    const paints = (state) => alphaOf(state.backgroundColor) > 0.02 || state.backgroundImage !== "none" || alphaOf(state.beforeBackground) > 0.02 || state.beforeImage !== "none" || alphaOf(state.afterBackground) > 0.02 || state.afterImage !== "none" || state.boxShadow !== "none";
    const layersOf = (node) => {
      const layers = [];
      let current = node;
      let depth = 0;
      while (current && current.nodeType === 1 && depth < 14) {
        const state = visualState(current);
        if (paints(state)) {
          layers.push({ depth, tag: current.tagName, id: current.id || "", className: String(current.className || "").slice(0, 140), state });
        }
        if (current === document.body) break;
        current = current.parentElement;
        depth += 1;
      }
      return layers;
    };
    const brief = (node, withLayers = false) => {
      if (!node || !visible(node)) return null;
      const state = visualState(node);
      const result = {
        tag: node.tagName,
        id: node.id || "",
        className: String(node.className || "").slice(0, 180),
        path: pathOf(node),
        role: node.getAttribute("role") || "",
        ariaLabel: node.getAttribute("aria-label") || "",
        state: node.getAttribute("data-state") || node.getAttribute("aria-current") || node.getAttribute("data-selected") || "",
        text: textOf(node).slice(0, 120),
        rect: rectOf(node),
        visual: state
      };
      if (withLayers) {
        result.layers = layersOf(node);
        result.layerCount = result.layers.length;
      }
      return result;
    };
    const uniqueRows = (sidebar) => {
      const labels = /新聊天|專案|Pull Request|網站|已排程|外掛程式|New Chat|New Task|Projects|Project|Websites|Scheduled|Extensions|Plugins/i;
      const seen = new Set();
      const rows = [];
      for (const target of sidebar.querySelectorAll("a,button,[role=\\"button\\"],[role=\\"link\\"]")) {
        if (!visible(target) || !labels.test(textOf(target))) continue;
        const row = target.closest(".sidebar-item") || target.closest("li") || target.parentElement || target;
        if (!row || seen.has(row) || !visible(row)) continue;
        seen.add(row);
        rows.push(brief(row, true));
      }
      return rows.slice(0, 24);
    };
    const visibleNodes = (selector, limit = 16) => Array.from(document.querySelectorAll(selector)).filter(visible).slice(0, limit).map((node) => brief(node, true));
    const sidebar = document.querySelector("aside.app-shell-left-panel");
    const header = document.querySelector("header");
    const composer = document.querySelector(".composer-surface-chrome");
    const rightPanels = Array.from(document.querySelectorAll("body aside, body [role=\\"dialog\\"], body [data-state=\\"open\\"]"))
      .filter((node) => visible(node) && !node.closest("aside.app-shell-left-panel"))
      .map((node) => ({ node, rect: node.getBoundingClientRect() }))
      .filter(({ rect }) => rect.left > innerWidth * 0.35 || rect.width > innerWidth * 0.35)
      .sort((left, right) => right.rect.width * right.rect.height - left.rect.width * left.rect.height)
      .slice(0, 12)
      .map(({ node }) => brief(node, true));
    const nativeMarkers = Array.from(document.querySelectorAll("#codex-interface-theme-style,#codex-interface-theme-marker,#codex-interface-theme-backdrop,#codex-interface-theme-right-hud,#codex-interface-theme-character,#codex-interface-theme-badge,[data-cit-surface-lock],[data-cit-black-shell]"));
    const nativeMarkerDetails = nativeMarkers.slice(0, 32).map((node) => ({
      tag: node.tagName,
      id: node.id || "",
      className: String(node.className || "").slice(0, 160),
      surfaceLock: node.getAttribute("data-cit-surface-lock") || "",
      surfaceModule: node.getAttribute("data-cit-surface-module") || ""
    }));
    const moduleCandidates = {
      sidebarNavigation: { count: sidebar ? uniqueRows(sidebar).length : 0, surface: sidebar ? brief(sidebar, true) : null },
      titlebar: { count: header ? 1 : 0, surface: header ? brief(header, true) : null },
      searchControls: { count: document.querySelectorAll("input").length, surfaces: visibleNodes("input", 12) },
      composerSurface: { count: composer && visible(composer) ? 1 : 0, surface: composer ? brief(composer, true) : null },
      rightPanels: { count: rightPanels.length, surfaces: rightPanels },
      transientPopovers: { count: document.querySelectorAll("[data-radix-popper-content-wrapper],[role=\\"listbox\\"],[cmdk-root]").length, surfaces: visibleNodes("[data-radix-popper-content-wrapper],[role=\\"listbox\\"],[cmdk-root]", 12) },
      sourcePreviewBlocks: { count: document.querySelectorAll("[data-cit-source-preview-block=\\"true\\"]").length, surfaces: visibleNodes("[data-cit-source-preview-block=\\"true\\"]", 16) },
      blackShellTransparency: { count: document.querySelectorAll("[data-cit-black-shell=\\"true\\"]").length, surfaces: visibleNodes("[data-cit-black-shell=\\"true\\"]", 16) },
      sourceAndDraggable: { count: document.querySelectorAll("[draggable=\\"true\\"],img,video").length, surfaces: visibleNodes("[draggable=\\"true\\"],img,video", 16) }
    };
    return {
      href: location.href,
      viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
      nativeMarkers: nativeMarkers.length,
      nativeMarkerDetails,
      themeRuntime: {
        rootState: document.documentElement.getAttribute("data-codex-interface-theme") || "",
        revision: document.documentElement.getAttribute("data-cit-revision") || "",
        hasRemoveHook: typeof window.__CODEX_INTERFACE_THEME_REMOVE__ === "function",
        hasSurfaceRegistry: Boolean(window.__CODEX_INTERFACE_THEME_SURFACE_REGISTRY__),
        restoreSentinel: (() => {
          try {
            return {
              local: localStorage.getItem("codex-interface-theme:restore-sentinel:v1") || "",
              session: sessionStorage.getItem("codex-interface-theme:restore-sentinel:v1") || ""
            };
          } catch (_) {
            return { local: "unreadable", session: "unreadable" };
          }
        })()
      },
      body: brief(document.body, true),
      moduleCandidates,
      sidebarRows: sidebar ? uniqueRows(sidebar) : [],
      header: header ? brief(header, true) : null,
      composer: composer ? brief(composer, true) : null,
      rightPanels,
      popovers: visibleNodes("[data-radix-popper-content-wrapper],[role=\\"listbox\\"],[cmdk-root]", 12),
      sourcePreviewBlocks: visibleNodes("[data-cit-source-preview-block=\\"true\\"]", 16),
      blackShellTransparency: visibleNodes("[data-cit-black-shell=\\"true\\"]", 16),
      sourceAndDraggable: visibleNodes("[draggable=\\"true\\"],img,video", 16)
    };
  })())`;
}

async function evaluateJson(session, expression) {
  const response = await session.send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true
  }, 12000);
  if (response.exceptionDetails) {
    throw new Error(response.exceptionDetails.text || "Runtime.evaluate failed");
  }
  const value = response.result ? response.result.value : "";
  if (typeof value !== "string") {
    throw new Error("native scan did not return serialized JSON");
  }
  return JSON.parse(value);
}

function compactModuleSummary(scan) {
  const summary = {};
  for (const [moduleName, value] of Object.entries(scan.moduleCandidates || {})) {
    const surfaces = value.surfaces || (value.surface ? [value.surface] : []);
    summary[moduleName] = {
      count: value.count || surfaces.length,
      visibleSurfaces: surfaces.filter(Boolean).length,
      layerCounts: surfaces.filter(Boolean).map((surface) => surface.layerCount || 0)
    };
  }
  return summary;
}

function surfaceIdentity(surface) {
  if (!surface) {
    return "missing";
  }
  return surface.path || [surface.tag, surface.id, surface.role, surface.ariaLabel].join("|");
}

function boundarySnapshot(report) {
  const snapshot = {};
  for (const target of report.targets) {
    const targetKey = target.id || target.url || target.title || "target";
    const modules = {};
    for (const [moduleName, value] of Object.entries(target.scan.moduleCandidates || {})) {
      const surfaces = value.surfaces || (value.surface ? [value.surface] : []);
      modules[moduleName] = {
        count: value.count || surfaces.length,
        surfaces: surfaces.filter(Boolean).map((surface) => ({
          identity: surfaceIdentity(surface),
          path: surface.path || "",
          rect: surface.rect,
          layerCount: surface.layerCount || 0,
          className: surface.className || "",
          state: surface.state || ""
        }))
      };
    }
    snapshot[targetKey] = {
      targetKey,
      title: target.title || "",
      url: target.url || "",
      viewport: target.scan.viewport,
      nativeMarkers: target.scan.nativeMarkers,
      modules
    };
  }
  return snapshot;
}

function surfaceMap(targetSnapshot) {
  const result = new Map();
  for (const [moduleName, value] of Object.entries(targetSnapshot.modules || {})) {
    for (const surface of value.surfaces || []) {
      const key = `${targetSnapshot.targetKey}|${surface.identity}`;
      result.set(key, { key, moduleName, surface });
    }
  }
  return result;
}

function observeBoundaries(previous, current, locks) {
  const changes = [];
  const currentKeys = new Set();
  for (const target of Object.values(current)) {
    const previousTarget = previous[target.targetKey];
    if (!previousTarget) {
      changes.push({ type: "target-added", target: target.targetKey, viewport: target.viewport });
    } else if (JSON.stringify(previousTarget.viewport) !== JSON.stringify(target.viewport)) {
      changes.push({ type: "viewport-changed", target: target.targetKey, from: previousTarget.viewport, to: target.viewport });
    }
    const oldSurfaces = previousTarget ? surfaceMap(previousTarget) : new Map();
    const newSurfaces = surfaceMap(target);
    for (const [key, observed] of newSurfaces) {
      currentKeys.add(key);
      const lock = locks.get(key);
      if (!lock) {
        locks.set(key, { key, target: target.targetKey, moduleName: observed.moduleName, identity: observed.surface.identity, firstSeenModule: observed.moduleName });
        changes.push({ type: "locked", target: target.targetKey, moduleName: observed.moduleName, identity: observed.surface.identity });
      } else if (lock.moduleName !== observed.moduleName) {
        changes.push({ type: "reclassification-blocked", target: target.targetKey, lockedModule: lock.moduleName, observedModule: observed.moduleName, identity: observed.surface.identity });
      }
      const old = oldSurfaces.get(key);
      if (old && (JSON.stringify(old.surface.rect) !== JSON.stringify(observed.surface.rect) || old.surface.layerCount !== observed.surface.layerCount || old.surface.state !== observed.surface.state)) {
        changes.push({ type: "boundary-changed", target: target.targetKey, moduleName: lock ? lock.moduleName : observed.moduleName, identity: observed.surface.identity, from: { rect: old.surface.rect, layerCount: old.surface.layerCount, state: old.surface.state }, to: { rect: observed.surface.rect, layerCount: observed.surface.layerCount, state: observed.surface.state } });
      }
    }
    for (const [key, old] of oldSurfaces) {
      if (!newSurfaces.has(key)) {
        changes.push({ type: "boundary-missing", target: target.targetKey, moduleName: old.moduleName, identity: old.surface.identity });
      }
    }
  }
  for (const target of Object.values(previous)) {
    if (!current[target.targetKey]) {
      changes.push({ type: "target-removed", target: target.targetKey });
    }
  }
  return { changes, currentKeys };
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function scanTargets(port) {
  const targets = (await fetchJson(`http://127.0.0.1:${port}/json/list`)).filter(isInjectableTarget);
  if (targets.length === 0) {
    throw new Error("no injectable Codex renderer target found");
  }
  const report = { ok: true, targets: [] };
  for (const target of targets) {
    const session = new CdpSession(target.webSocketDebuggerUrl);
    await session.open();
    try {
      await session.send("Runtime.enable");
      report.targets.push({ id: target.id, title: target.title || "", url: target.url || "", scan: await evaluateJson(session, scanExpression()) });
    } finally {
      session.close();
    }
  }
  return report;
}

function printText(report) {
  console.log("[codex-interface-theme] native module scan");
  for (const target of report.targets) {
    console.log(`target=${target.title} ${target.url}`);
    console.log(`viewport=${target.scan.viewport.width}x${target.scan.viewport.height} nativeThemeMarkers=${target.scan.nativeMarkers}`);
    if (target.scan.nativeMarkerDetails.length > 0) {
      console.log(`markerDetails=${target.scan.nativeMarkerDetails.map((marker) => marker.id || marker.surfaceModule || marker.tag).join(",")}`);
    }
    console.log(`themeRuntime=${JSON.stringify(target.scan.themeRuntime)}`);
    for (const [moduleName, value] of Object.entries(compactModuleSummary(target.scan))) {
      console.log(`- ${moduleName}: candidates=${value.count} visible=${value.visibleSurfaces} layers=${value.layerCounts.join(",") || "0"}`);
    }
    console.log(`sidebarRows=${target.scan.sidebarRows.length} rightPanels=${target.scan.rightPanels.length} popovers=${target.scan.popovers.length} sourceAndDraggable=${target.scan.sourceAndDraggable.length}`);
  }
}

function printWatchText(report) {
  console.log(`[codex-interface-theme] native module watch interval=${report.intervalMs}ms samples=${report.samples.length}`);
  for (const sample of report.samples) {
    console.log(`sample=${sample.index} at=${sample.at} targets=${sample.targetCount} changes=${sample.changes.length}`);
    for (const change of sample.changes) {
      const moduleName = change.moduleName || change.lockedModule || "";
      const identity = change.identity ? ` ${change.identity.slice(0, 120)}` : "";
      console.log(`- ${change.type} ${change.target}${moduleName ? ` module=${moduleName}` : ""}${identity}`);
    }
  }
  console.log(`lockedBoundaries=${report.locks.length}`);
}

async function watchTargets(port, intervalMs, samples) {
  let previous = {};
  const locks = new Map();
  const output = { ok: true, mode: "watch", intervalMs, samples: [], locks: [] };
  for (let index = 1; index <= samples; index += 1) {
    const report = await scanTargets(port);
    const current = boundarySnapshot(report);
    const observed = observeBoundaries(previous, current, locks);
    output.samples.push({
      index,
      at: new Date().toISOString(),
      targetCount: report.targets.length,
      changes: observed.changes,
      snapshot: current
    });
    previous = current;
    if (index < samples) {
      await sleep(intervalMs);
    }
  }
  output.locks = Array.from(locks.values());
  return output;
}

async function main() {
  const options = parseArgs(process.argv);
  if (options.help) {
    console.log(usage());
    return;
  }
  const port = Number(options.port);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error("--port must be a positive integer");
  }
  const intervalMs = Number(options.intervalMs);
  const samples = Number(options.samples);
  if (!Number.isInteger(intervalMs) || intervalMs < 1000) {
    throw new Error("--interval-ms must be an integer >= 1000");
  }
  if (!Number.isInteger(samples) || samples < 1 || samples > 120) {
    throw new Error("--samples must be an integer between 1 and 120");
  }
  const report = options.watch ? await watchTargets(port, intervalMs, samples) : await scanTargets(port);
  const output = JSON.stringify(report, null, 2);
  if (options.out) {
    fs.writeFileSync(String(options.out), `${output}\n`, "utf8");
  }
  if (options.format === "json") {
    console.log(output);
  } else if (options.format === "text" && options.watch) {
    printWatchText(report);
  } else if (options.format === "text") {
    printText(report);
  } else {
    throw new Error(`unsupported --format: ${options.format}`);
  }
}

main().catch((error) => {
  console.error(`[codex-interface-theme][error] ${error.message}`);
  process.exitCode = 1;
});
