#!/usr/bin/env node
import fs from "node:fs";

const DEFAULT_INTERVAL_MS = 2500;
const DEFAULT_SAMPLES = 1;
const MAX_SAMPLES = 120;

function usage() {
  return `Usage: black-shell-layer-audit.mjs --port <port> [options]

Options:
  --format text|json        Output format. Default: text.
  --out <absolute-path>     Optional JSON report output path.
  --watch                   Sample repeatedly while the operator opens surfaces manually.
  --samples <n>             Watch sample count. Default: 1.
  --interval-ms <ms>        Watch interval. Default: 2500.

Read-only contract:
  connects to an already-open CDP renderer, evaluates DOM/computed-style state,
  and never launches, applies, restores, clicks, drags, resizes, deletes, or
  mutates project/account/permission state.`;
}

function parseArgs(argv) {
  const options = {
    format: "text",
    out: "",
    watch: false,
    samples: DEFAULT_SAMPLES,
    intervalMs: DEFAULT_INTERVAL_MS
  };
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
    const name = key.slice(2).replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
    options[name] = value;
    index += 1;
  }
  return options;
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

  send(method, params = {}, timeoutMs = 12000) {
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

function auditExpression() {
  return `JSON.stringify((() => {
    const PROTECTED_SELECTOR = "button,input,textarea,select,pre,code,kbd,samp,img,video,canvas,iframe,picture,source,svg,a,[role='button'],[role='menuitem'],[role='option'],[role='textbox'],[role='switch'],[role='checkbox'],[role='tab'],[role='slider'],[role='combobox'],[contenteditable='true'],[data-slate-editor='true'],[data-testid='composer'],[data-testid='message-composer'],[data-cit-source-preview-block='true'],[data-cit-drag-risk='high-memory-image-resize']";
    const number = (value, fallback = 0) => {
      const parsed = Number.parseFloat(String(value || ""));
      return Number.isFinite(parsed) ? parsed : fallback;
    };
    const colorParts = (value) => {
      const text = String(value || "");
      if (text === "transparent" || text === "none") return { r: 0, g: 0, b: 0, a: 0 };
      const match = text.match(/rgba?\\(([^)]+)\\)/i);
      if (!match) return null;
      const parts = match[1].split(/[,\s/]+/).filter(Boolean).map((part) => Number.parseFloat(part));
      if (parts.length < 3 || !parts.slice(0, 3).every(Number.isFinite)) return null;
      return { r: parts[0], g: parts[1], b: parts[2], a: parts.length >= 4 && Number.isFinite(parts[3]) ? parts[3] : 1 };
    };
    const alphaOf = (value) => {
      const parts = colorParts(value);
      return parts ? parts.a : String(value || "") === "none" ? 0 : 1;
    };
    const nearBlackColor = (value) => {
      const parts = colorParts(value);
      if (!parts) return false;
      return parts.a >= 0.42 && Math.max(parts.r, parts.g, parts.b) <= 52 && (parts.r + parts.g + parts.b) <= 132;
    };
    const darkGradient = (value) => {
      const text = String(value || "");
      if (text === "none") return false;
      const colors = text.match(/rgba?\\([^)]+\\)/gi) || [];
      return colors.some(nearBlackColor) || /linear-gradient|radial-gradient|conic-gradient/i.test(text) && /0,\s*0,\s*0|3,\s*8,\s*11|4,\s*6,\s*8|8,\s*10,\s*13|9,\s*13,\s*16/i.test(text);
    };
    const visible = (node) => {
      if (!node || node.nodeType !== 1) return false;
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return rect.width >= 2 && rect.height >= 2 && rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth && style.display !== "none" && style.visibility !== "hidden" && number(style.opacity, 1) > 0.02;
    };
    const rectOf = (node) => {
      const rect = node.getBoundingClientRect();
      return { left: Math.round(rect.left), top: Math.round(rect.top), right: Math.round(rect.right), bottom: Math.round(rect.bottom), width: Math.round(rect.width), height: Math.round(rect.height), area: Math.round(rect.width * rect.height) };
    };
    const textOf = (node) => String(node && (node.getAttribute("aria-label") || node.getAttribute("title") || node.innerText || node.textContent || "") || "").replace(/\\s+/g, " ").trim().slice(0, 120);
    const pathOf = (node) => {
      const parts = [];
      let current = node;
      while (current && current.nodeType === 1 && current !== document.body && parts.length < 12) {
        let siblingIndex = 1;
        let sibling = current;
        while (sibling.previousElementSibling) {
          sibling = sibling.previousElementSibling;
          siblingIndex += 1;
        }
        const tag = current.tagName.toLowerCase();
        const id = current.id ? "#" + current.id : "";
        const data = current.getAttribute("data-cit-surface-module") || current.getAttribute("data-testid") || current.getAttribute("role") || "";
        parts.unshift(tag + id + (data ? "[" + data + "]" : "") + ":nth-child(" + siblingIndex + ")");
        current = current.parentElement;
      }
      return parts.join(">");
    };
    const styleState = (node) => {
      const style = getComputedStyle(node);
      const before = getComputedStyle(node, "::before");
      const after = getComputedStyle(node, "::after");
      return {
        backgroundColor: style.backgroundColor,
        backgroundImage: String(style.backgroundImage || "").slice(0, 220),
        opacity: style.opacity,
        pointerEvents: style.pointerEvents,
        position: style.position,
        zIndex: style.zIndex,
        backdropFilter: style.backdropFilter || style.webkitBackdropFilter || "",
        boxShadow: String(style.boxShadow || "").slice(0, 220),
        borderColor: style.borderColor,
        beforeBackgroundColor: before.backgroundColor,
        beforeBackgroundImage: String(before.backgroundImage || "").slice(0, 180),
        afterBackgroundColor: after.backgroundColor,
        afterBackgroundImage: String(after.backgroundImage || "").slice(0, 180)
      };
    };
    const blackSignals = (state) => {
      const signals = [];
      if (nearBlackColor(state.backgroundColor)) signals.push("background-color");
      if (darkGradient(state.backgroundImage)) signals.push("background-image");
      if (nearBlackColor(state.beforeBackgroundColor)) signals.push("before-background-color");
      if (darkGradient(state.beforeBackgroundImage)) signals.push("before-background-image");
      if (nearBlackColor(state.afterBackgroundColor)) signals.push("after-background-color");
      if (darkGradient(state.afterBackgroundImage)) signals.push("after-background-image");
      if (/rgba?\\(0,\\s*0,\\s*0|rgba?\\(3,\\s*8,\\s*11|rgba?\\(4,\\s*6,\\s*8/i.test(state.boxShadow)) signals.push("box-shadow");
      return signals;
    };
    const protectedSurface = (node) => Boolean(node && node.nodeType === 1 && (node.matches(PROTECTED_SELECTOR) || node.closest("[data-cit-source-preview-block='true'],[data-cit-drag-risk='high-memory-image-resize']")));
    const describeNode = (node, withAncestors = false) => {
      const state = styleState(node);
      const rect = rectOf(node);
      const result = {
        tag: node.tagName,
        id: node.id || "",
        className: String(node.className || "").slice(0, 180),
        role: node.getAttribute("role") || "",
        dataState: node.getAttribute("data-state") || "",
        surfaceModule: node.getAttribute("data-cit-surface-module") || "",
        blackShell: node.getAttribute("data-cit-black-shell") || "",
        sourcePreview: node.getAttribute("data-cit-source-preview-block") || "",
        protectedSurface: protectedSurface(node),
        text: textOf(node),
        path: pathOf(node),
        rect,
        signals: blackSignals(state),
        visual: state
      };
      if (withAncestors) {
        const ancestors = [];
        let current = node.parentElement;
        let depth = 1;
        while (current && current.nodeType === 1 && depth <= 10) {
          const currentState = styleState(current);
          const signals = blackSignals(currentState);
          if (signals.length > 0 || current === document.body || current === document.documentElement) {
            ancestors.push({
              depth,
              tag: current.tagName,
              id: current.id || "",
              className: String(current.className || "").slice(0, 140),
              role: current.getAttribute("role") || "",
              surfaceModule: current.getAttribute("data-cit-surface-module") || "",
              blackShell: current.getAttribute("data-cit-black-shell") || "",
              rect: rectOf(current),
              signals,
              visual: currentState
            });
          }
          if (current === document.body) break;
          current = current.parentElement;
          depth += 1;
        }
        result.ancestors = ancestors;
      }
      return result;
    };
    const pointLayers = (node) => {
      const rect = node.getBoundingClientRect();
      const points = [
        { name: "center", x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
        { name: "topLeft", x: rect.left + Math.min(16, rect.width / 2), y: rect.top + Math.min(16, rect.height / 2) },
        { name: "topRight", x: rect.right - Math.min(16, rect.width / 2), y: rect.top + Math.min(16, rect.height / 2) },
        { name: "bottomLeft", x: rect.left + Math.min(16, rect.width / 2), y: rect.bottom - Math.min(16, rect.height / 2) },
        { name: "bottomRight", x: rect.right - Math.min(16, rect.width / 2), y: rect.bottom - Math.min(16, rect.height / 2) }
      ].map((point) => ({
        name: point.name,
        x: Math.round(point.x),
        y: Math.round(point.y),
        layers: document.elementsFromPoint(point.x, point.y).slice(0, 10).map((entry) => {
          const state = styleState(entry);
          return {
            tag: entry.tagName,
            id: entry.id || "",
            className: String(entry.className || "").slice(0, 120),
            role: entry.getAttribute("role") || "",
            surfaceModule: entry.getAttribute("data-cit-surface-module") || "",
            blackShell: entry.getAttribute("data-cit-black-shell") || "",
            protectedSurface: protectedSurface(entry),
            rect: rectOf(entry),
            signals: blackSignals(state),
            visual: state
          };
        })
      }));
      return points;
    };
    const selectors = [
      "main",
      "[role='main']",
      "aside",
      "section",
      "[role='dialog']",
      "[role='menu']",
      "[role='listbox']",
      "[data-state='open']",
      "[data-radix-popper-content-wrapper]",
      "[data-radix-popper-content-wrapper] > *",
      "[cmdk-root]",
      ".composer-surface-chrome",
      "header",
      "body > div",
      "div"
    ].join(",");
    const nodes = Array.from(document.querySelectorAll(selectors)).filter(visible);
    const candidates = [];
    const seen = new Set();
    for (const node of nodes) {
      if (seen.has(node)) continue;
      seen.add(node);
      const rect = rectOf(node);
      if (rect.width < 96 || rect.height < 32 || rect.area < 2500) continue;
      const state = styleState(node);
      const signals = blackSignals(state);
      if (signals.length === 0) continue;
      candidates.push(describeNode(node, true));
    }
    candidates.sort((left, right) => {
      const leftMarked = left.blackShell === "true" ? 1 : 0;
      const rightMarked = right.blackShell === "true" ? 1 : 0;
      if (leftMarked !== rightMarked) return rightMarked - leftMarked;
      return right.rect.area - left.rect.area;
    });
    const detailed = candidates.slice(0, 24);
    const unmarked = candidates.filter((item) => item.blackShell !== "true" && !item.protectedSurface).slice(0, 24);
    const marked = candidates.filter((item) => item.blackShell === "true").slice(0, 24);
    const protectedCandidates = candidates.filter((item) => item.protectedSurface).slice(0, 24);
    const pointAudits = candidates.slice(0, 12).map((item) => {
      let node = null;
      for (const candidateNode of nodes) {
        if (pathOf(candidateNode) === item.path) {
          node = candidateNode;
          break;
        }
      }
      return {
        path: item.path,
        text: item.text,
        rect: item.rect,
        blackShell: item.blackShell,
        protectedSurface: item.protectedSurface,
        signals: item.signals,
        points: node ? pointLayers(node) : []
      };
    });
    const root = document.documentElement;
    return {
      mode: "read-only-black-shell-layer-audit",
      mutates: false,
      launches: false,
      applies: false,
      restores: false,
      clicks: false,
      drags: false,
      href: location.href,
      title: document.title || "",
      viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
      diagnostics: {
        themeState: root.getAttribute("data-codex-interface-theme") || "",
        revision: root.getAttribute("data-cit-revision") || "",
        surfacePreflight: root.getAttribute("data-cit-surface-preflight") || "",
        protectedSurfaces: root.getAttribute("data-cit-protected-surfaces") || "",
        blackShellCleaned: root.getAttribute("data-cit-black-shell-cleaned") || "",
        blackShellLocks: root.getAttribute("data-cit-black-shell-locks") || root.dataset.citBlackShellLocks || "",
        hasSurfaceRegistry: Boolean(window.__CODEX_INTERFACE_THEME_SURFACE_REGISTRY__)
      },
      summary: {
        nearBlackCandidates: candidates.length,
        markedBlackShells: marked.length,
        unmarkedNearBlackShells: unmarked.length,
        protectedNearBlackSurfaces: protectedCandidates.length,
        pseudoOrGradientCandidates: candidates.filter((item) => item.signals.some((signal) => /image|before|after|shadow/.test(signal))).length
      },
      marked,
      unmarked,
      protectedCandidates,
      topCandidates: detailed,
      pointAudits
    };
  })())`;
}

async function evaluateJson(session, expression) {
  const response = await session.send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true
  }, 16000);
  if (response.exceptionDetails) {
    throw new Error(response.exceptionDetails.text || "Runtime.evaluate failed");
  }
  const value = response.result ? response.result.value : "";
  if (typeof value !== "string") {
    throw new Error("black shell layer audit did not return serialized JSON");
  }
  return JSON.parse(value);
}

async function scanTargets(port) {
  const targets = (await fetchJson(`http://127.0.0.1:${port}/json/list`)).filter(isInjectableTarget);
  if (targets.length === 0) {
    throw new Error("no injectable Codex renderer target found");
  }
  const samples = [];
  for (const target of targets) {
    const session = new CdpSession(target.webSocketDebuggerUrl);
    await session.open();
    try {
      await session.send("Runtime.enable");
      samples.push({
        targetId: target.id,
        targetTitle: target.title || "",
        targetUrl: target.url || "",
        scan: await evaluateJson(session, auditExpression())
      });
    } finally {
      session.close();
    }
  }
  return samples;
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function runAudit(port, watch, intervalMs, samples) {
  const report = {
    ok: true,
    mode: "read-only-black-shell-layer-audit",
    port,
    watch,
    intervalMs: watch ? intervalMs : 0,
    mutates: false,
    launches: false,
    applies: false,
    restores: false,
    clicks: false,
    drags: false,
    samples: []
  };
  const count = watch ? samples : 1;
  for (let index = 1; index <= count; index += 1) {
    report.samples.push({
      index,
      at: new Date().toISOString(),
      targets: await scanTargets(port)
    });
    if (index < count) {
      await sleep(intervalMs);
    }
  }
  return report;
}

function printCandidate(prefix, candidate) {
  const marker = candidate.blackShell === "true" ? "marked" : "unmarked";
  const protectedFlag = candidate.protectedSurface ? "protected" : "eligible";
  console.log(`${prefix} ${marker}/${protectedFlag} area=${candidate.rect.area} rect=${candidate.rect.left},${candidate.rect.top},${candidate.rect.width}x${candidate.rect.height} signals=${candidate.signals.join("+")}`);
  console.log(`  tag=${candidate.tag} role=${candidate.role || "-"} module=${candidate.surfaceModule || "-"} text=${candidate.text || "-"}`);
  console.log(`  path=${candidate.path}`);
  const ancestor = (candidate.ancestors || []).find((item) => item.signals && item.signals.length > 0);
  if (ancestor) {
    console.log(`  nearest-painted-ancestor depth=${ancestor.depth} tag=${ancestor.tag} module=${ancestor.surfaceModule || "-"} blackShell=${ancestor.blackShell || "-"} signals=${ancestor.signals.join("+")}`);
  }
}

function printText(report) {
  console.log("[codex-interface-theme] read-only black shell layer audit");
  console.log(`samples=${report.samples.length} watch=${report.watch} clicks=false drags=false applies=false launches=false`);
  for (const sample of report.samples) {
    console.log(`sample=${sample.index} at=${sample.at} targets=${sample.targets.length}`);
    for (const target of sample.targets) {
      const scan = target.scan;
      console.log(`target=${target.targetTitle || scan.title || target.targetId} url=${target.targetUrl || scan.href}`);
      console.log(`viewport=${scan.viewport.width}x${scan.viewport.height} theme=${scan.diagnostics.themeState || "-"} revision=${scan.diagnostics.revision || "-"} preflight=${scan.diagnostics.surfacePreflight || "-"} protected=${scan.diagnostics.protectedSurfaces || "0"} blackLocks=${scan.diagnostics.blackShellLocks || "0"}`);
      console.log(`summary nearBlack=${scan.summary.nearBlackCandidates} marked=${scan.summary.markedBlackShells} unmarkedEligible=${scan.summary.unmarkedNearBlackShells} protectedNearBlack=${scan.summary.protectedNearBlackSurfaces} pseudoOrGradient=${scan.summary.pseudoOrGradientCandidates}`);
      scan.unmarked.slice(0, 8).forEach((candidate, index) => printCandidate(`  unmarked[${index}]`, candidate));
      scan.marked.slice(0, 6).forEach((candidate, index) => printCandidate(`  marked[${index}]`, candidate));
    }
  }
}

async function main() {
  const options = parseArgs(process.argv);
  if (options.help) {
    console.log(usage());
    return;
  }
  const port = Number(options.port);
  const intervalMs = Number(options.intervalMs);
  const samples = Number(options.samples);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error("--port must be a positive integer");
  }
  if (!["text", "json"].includes(String(options.format))) {
    throw new Error("--format must be text or json");
  }
  if (options.out && !String(options.out).startsWith("/")) {
    throw new Error("--out must be an absolute path");
  }
  if (!Number.isInteger(intervalMs) || intervalMs < 500) {
    throw new Error("--interval-ms must be an integer >= 500");
  }
  if (!Number.isInteger(samples) || samples < 1 || samples > MAX_SAMPLES) {
    throw new Error(`--samples must be an integer between 1 and ${MAX_SAMPLES}`);
  }
  const report = await runAudit(port, Boolean(options.watch), intervalMs, samples);
  const json = JSON.stringify(report, null, 2);
  if (options.out) {
    fs.writeFileSync(String(options.out), `${json}\n`, "utf8");
  }
  if (options.format === "json") {
    console.log(json);
  } else {
    printText(report);
  }
}

main().catch((error) => {
  console.error(`[codex-interface-theme][error] ${error.message}`);
  process.exitCode = 1;
});
