#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {
  DEFAULT_RUNTIME_MANIFEST,
  buildDynamicBoundaryCoverage,
  readDynamicBoundaryLocks
} from "./dynamic-boundary-coverage.mjs";

function usage() {
  return "Usage: interface-field-inventory.mjs --port <port> [--samples <n>] [--interval-ms <ms>] [--runtime-manifest <path>] [--out <path>] [--format text|json]";
}

function parseArgs(argv) {
  const options = { samples: "4", intervalMs: "900", format: "text", out: "" };
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
    const optionName = key.slice(2).replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
    options[optionName] = value;
    index += 1;
  }
  return options;
}

async function fetchJson(url, timeoutMs = 3000) {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return response.json();
}

function isTarget(target) {
  if (!target || target.type !== "page" || !target.webSocketDebuggerUrl) {
    return false;
  }
  const url = String(target.url || "");
  return url === "about:blank" || url.startsWith("app://") || /codex|chatgpt/i.test(String(target.title || ""));
}

class CdpSession {
  constructor(url) {
    this.url = url;
    this.nextId = 1;
    this.pending = new Map();
    this.socket = null;
  }

  async open() {
    this.socket = new WebSocket(this.url);
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
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("CDP websocket open timeout")), 4000);
      this.socket.addEventListener("open", () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });
      this.socket.addEventListener("error", () => {
        clearTimeout(timer);
        reject(new Error("CDP websocket error"));
      }, { once: true });
    });
  }

  send(method, params = {}, timeoutMs = 10000) {
    const id = this.nextId;
    this.nextId += 1;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP timeout: ${method}`));
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
    const selector = [
      "button",
      "a[href]",
      "summary",
      "select",
      "input:not([type='hidden'])",
      "textarea",
      "[contenteditable='true']",
      "[role='button']",
      "[aria-haspopup]",
      "[aria-expanded]",
      "[tabindex]:not([tabindex='-1'])",
      "[draggable='true']",
      "[data-cit-source-preview-block='true']"
    ].join(",");
    const norm = (value) => String(value || "").replace(/\\s+/g, " ").trim();
    const rectOf = (node) => {
      const rect = node.getBoundingClientRect();
      return {
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      };
    };
    const visible = (node) => {
      if (!node || node.nodeType !== 1) return false;
      const rect = node.getBoundingClientRect();
      if (rect.width < 3 || rect.height < 3 || rect.bottom < 0 || rect.right < 0 || rect.top > innerHeight || rect.left > innerWidth) return false;
      const style = getComputedStyle(node);
      return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || "1") > 0.04;
    };
    const pathOf = (node) => {
      const parts = [];
      let current = node;
      while (current && current.nodeType === 1 && current !== document.body && parts.length < 8) {
        let index = 1;
        let sibling = current;
        while (sibling.previousElementSibling) {
          sibling = sibling.previousElementSibling;
          index += 1;
        }
        parts.unshift(current.tagName.toLowerCase() + ":nth-child(" + index + ")");
        current = current.parentElement;
      }
      return parts.join(">");
    };
    const labelOf = (node) => norm([
      node.getAttribute("aria-label"),
      node.getAttribute("title"),
      node.getAttribute("name"),
      node.getAttribute("placeholder"),
      node.getAttribute("data-cit-button-action"),
      node.getAttribute("data-cit-source-preview-kind"),
      node.value,
      String(node.textContent || "").slice(0, 120)
    ].filter(Boolean).join(" ")).slice(0, 160);
    const kindOf = (node, label) => {
      const text = norm(label).toLowerCase();
      const rect = node.getBoundingClientRect();
      if (node.closest("aside.app-shell-left-panel")) return "sidebar";
      if (node.closest(".composer-surface-chrome,.codex-interface-theme-composer-surface")) return "composer";
      if (node.closest(".codex-interface-theme-project-panel,.codex-interface-theme-project-panel-frame")) return "right-panel";
      if (node.closest("[data-radix-popper-content-wrapper]") || node.closest("[role='menu']") || node.closest("[role='listbox']") || node.getAttribute("aria-haspopup")) return "popover";
      if (node.closest("[data-cit-source-preview-block='true']") || /來源|source|attachment|附件|截圖|screenshot|resize|調整大小|drag|拖曳/.test(text)) return "source-preview";
      if (rect.top <= 92) return "top-toolbar";
      if (/專案|project|pull request|網站|已排程|scheduled|外掛|設定|settings/.test(text)) return "navigation";
      return "general";
    };
    const riskOf = (node, label) => {
      const text = norm(label).toLowerCase();
      if (node.disabled || node.getAttribute("aria-disabled") === "true") return "disabled";
      if (/刪除|delete|trash|移除|remove|archive|封存/.test(text)) return "destructive";
      if (/送出|submit|send message|停止產生|stop generating/.test(text)) return "composer-action";
      if (/送交|推送|push|commit|merge|建立 pull request|create pull request/.test(text)) return "write-action";
      if (/登出|logout|sign out|登入|login|sign in|授權|grant|允許|allow|install|安裝|subscribe|付款|購買|buy/.test(text)) return "external-or-session";
      if (/新聊天|new chat|new task|new conversation/.test(text)) return "route-change";
      return "";
    };
    const dragRiskOf = (node, label, kind) => {
      const text = norm(label).toLowerCase();
      const markedRisk = node.getAttribute("data-cit-drag-risk") || node.closest("[data-cit-drag-risk]")?.getAttribute("data-cit-drag-risk") || "";
      if (markedRisk) return markedRisk;
      const sourcePreview = kind === "source-preview" || node.closest("[data-cit-source-preview-block='true']");
      const hasMedia = node.matches("img,video,canvas") || Boolean(node.querySelector("img,video,canvas"));
      const resizable = node.getAttribute("draggable") === "true" || /drag|拖曳|resize|調整大小|預覽|preview|截圖|screenshot|來源|source|附件|attachment/.test(text);
      if (sourcePreview && (hasMedia || resizable)) return "high-memory-image-resize";
      return "";
    };
    const colorParts = (value) => {
      const text = String(value || "");
      let match = text.match(/rgba?\\(([^)]+)\\)/i);
      if (match) {
        const parts = match[1].split(/[,\\s/]+/).filter(Boolean).map((part) => Number.parseFloat(part));
        if (parts.length >= 3 && parts.slice(0, 3).every(Number.isFinite)) {
          return { r: parts[0], g: parts[1], b: parts[2], a: parts.length >= 4 && Number.isFinite(parts[3]) ? parts[3] : 1 };
        }
      }
      match = text.match(/color\\(srgb\\s+([0-9.]+)\\s+([0-9.]+)\\s+([0-9.]+)(?:\\s*\\/\\s*([0-9.]+))?\\)/i);
      if (match) {
        return {
          r: Number(match[1]) * 255,
          g: Number(match[2]) * 255,
          b: Number(match[3]) * 255,
          a: match[4] === undefined ? 1 : Number(match[4])
        };
      }
      return null;
    };
    const nearBlackShell = (node, style) => {
      const rect = node.getBoundingClientRect();
      if (rect.width < 96 || rect.height < 28) return false;
      if (node.matches("button,input,textarea,select,pre,code,kbd,samp,img,video,canvas,iframe,picture,source,svg,a,[role='button'],[role='menuitem'],[role='option'],[role='textbox'],[role='switch'],[role='checkbox'],[role='tab'],[role='slider'],[role='combobox'],[contenteditable='true'],[data-slate-editor='true'],[data-cit-source-preview-block='true'],[data-cit-drag-risk='high-memory-image-resize']")) return false;
      const bg = colorParts(style.backgroundColor);
      const hasNearBlackBackground = bg && bg.a >= 0.42 && Math.max(bg.r, bg.g, bg.b) <= 52 && bg.r + bg.g + bg.b <= 132;
      const hasDarkImage = style.backgroundImage !== "none" && /rgba?\\(|color\\(srgb|linear-gradient|radial-gradient|conic-gradient/i.test(style.backgroundImage);
      return Boolean(hasNearBlackBackground || hasDarkImage);
    };
    const seen = new Set();
    const fields = [];
    for (const node of Array.from(document.querySelectorAll(selector))) {
      if (!visible(node)) continue;
      const rect = rectOf(node);
      const identity = pathOf(node);
      if (seen.has(identity)) continue;
      seen.add(identity);
      const label = labelOf(node);
      const kind = kindOf(node, label);
      const style = getComputedStyle(node);
      const draggable = node.getAttribute("draggable") === "true" || Boolean(node.closest("[data-cit-source-preview-block='true']")) || /drag|拖曳|resize|調整大小/i.test(label);
      const dragRisk = dragRiskOf(node, label, kind);
      fields.push({
        identity,
        tag: node.tagName.toLowerCase(),
        role: node.getAttribute("role") || "",
        type: node.getAttribute("type") || "",
        label,
        kind,
        risk: riskOf(node, label),
        field: node.matches("input,textarea,[contenteditable='true']"),
        draggable,
        dragRisk,
        expanded: node.getAttribute("aria-expanded") || "",
        hasPopup: node.getAttribute("aria-haspopup") || "",
        surfaceLock: node.getAttribute("data-cit-surface-lock") || node.closest("[data-cit-surface-lock]")?.getAttribute("data-cit-surface-lock") || "",
        surfaceModule: node.getAttribute("data-cit-surface-module") || node.closest("[data-cit-surface-module]")?.getAttribute("data-cit-surface-module") || "",
        sourcePreview: node.getAttribute("data-cit-source-preview-block") || node.closest("[data-cit-source-preview-block='true']")?.getAttribute("data-cit-source-preview-block") || "",
        rect,
        paint: {
          backgroundColor: style.backgroundColor,
          backgroundImage: style.backgroundImage === "none" ? "none" : "image",
          boxShadow: style.boxShadow === "none" ? "none" : "shadow",
          opacity: style.opacity
        }
      });
    }
    const shellSelector = [
      "body",
      "main",
      "aside.app-shell-left-panel",
      ".composer-surface-chrome",
      "header",
      "[class*='bg-token-main-surface']",
      "[class*='bg-token-dropdown-background']",
      "[data-radix-popper-content-wrapper] > *",
      "[role='menu']",
      "[role='listbox']"
    ].join(",");
    for (const node of Array.from(document.querySelectorAll(shellSelector))) {
      if (!visible(node)) continue;
      const style = getComputedStyle(node);
      if (!nearBlackShell(node, style)) continue;
      const rect = rectOf(node);
      const identity = "black-shell:" + pathOf(node);
      if (seen.has(identity)) continue;
      seen.add(identity);
      fields.push({
        identity,
        tag: node.tagName.toLowerCase(),
        role: node.getAttribute("role") || "",
        type: "",
        label: "official near-black native shell " + node.tagName.toLowerCase(),
        kind: "black-shell",
        risk: "black-shell-material",
        field: false,
        draggable: false,
        dragRisk: "",
        expanded: "",
        hasPopup: "",
        surfaceLock: node.getAttribute("data-cit-surface-lock") || "",
        surfaceModule: node.getAttribute("data-cit-surface-module") || "",
        sourcePreview: "",
        blackShell: "true",
        rect,
        paint: {
          backgroundColor: style.backgroundColor,
          backgroundImage: style.backgroundImage === "none" ? "none" : "image",
          boxShadow: style.boxShadow === "none" ? "none" : "shadow",
          opacity: style.opacity
        }
      });
    }
    return {
      href: location.href,
      viewport: { width: innerWidth, height: innerHeight, devicePixelRatio },
      theme: {
        active: document.documentElement.getAttribute("data-codex-interface-theme") || "",
        revision: document.documentElement.getAttribute("data-cit-revision") || "",
        surfaceLocks: document.querySelectorAll("[data-cit-surface-lock='locked']").length
      },
      fields
    };
  })())`;
}

async function evaluateScan(session) {
  const result = await session.send("Runtime.evaluate", {
    expression: scanExpression(),
    awaitPromise: true,
    returnByValue: true
  }, 12000);
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || "Runtime.evaluate failed");
  }
  return JSON.parse(result.result && result.result.value ? result.result.value : "{}");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function summarize(samples) {
  const map = new Map();
  for (const sample of samples) {
    for (const field of sample.scan.fields || []) {
      const key = field.identity;
      const entry = map.get(key) || {
        identity: key,
        kind: field.kind,
        label: field.label,
        risk: field.risk,
        field: field.field,
        draggable: field.draggable,
        dragRisk: field.dragRisk,
        seen: 0,
        rects: new Set(),
        modules: new Set()
      };
      entry.seen += 1;
      entry.rects.add(JSON.stringify(field.rect));
      entry.modules.add(field.surfaceModule || "");
      map.set(key, entry);
    }
  }
  const totalSamples = samples.length;
  const fields = Array.from(map.values()).map((entry) => ({
    identity: entry.identity,
    kind: entry.kind,
    label: entry.label,
    risk: entry.risk,
    field: entry.field,
    draggable: entry.draggable,
    dragRisk: entry.dragRisk,
    seen: entry.seen,
    dynamic: entry.seen !== totalSamples || entry.rects.size > 1 || entry.modules.size > 1,
    rectVariantCount: entry.rects.size,
    moduleVariantCount: entry.modules.size
  }));
  const byKind = {};
  const byRisk = {};
  const byDragRisk = {};
  for (const field of fields) {
    byKind[field.kind] = (byKind[field.kind] || 0) + 1;
    byRisk[field.risk || "safe"] = (byRisk[field.risk || "safe"] || 0) + 1;
    byDragRisk[field.dragRisk || "none"] = (byDragRisk[field.dragRisk || "none"] || 0) + 1;
  }
  const lockConfig = readDynamicBoundaryLocks(summarize.runtimeManifestPath);
  const dynamicBoundaryLocks = buildDynamicBoundaryCoverage(fields, lockConfig);
  return {
    totalFields: fields.length,
    dynamicFields: fields.filter((field) => field.dynamic).length,
    staticFields: fields.filter((field) => !field.dynamic).length,
    draggableFields: fields.filter((field) => field.draggable).length,
    highMemoryDragFields: fields.filter((field) => field.dragRisk === "high-memory-image-resize").length,
    textFields: fields.filter((field) => field.field).length,
    byKind,
    byRisk,
    byDragRisk,
    dynamicBoundaryLocks,
    fields
  };
}

async function scanTarget(target, samples, intervalMs) {
  const session = new CdpSession(target.webSocketDebuggerUrl);
  await session.open();
  const sampleReports = [];
  try {
    await session.send("Runtime.enable").catch(() => {});
    for (let index = 1; index <= samples; index += 1) {
      sampleReports.push({ index, at: new Date().toISOString(), scan: await evaluateScan(session) });
      if (index < samples) {
        await sleep(intervalMs);
      }
    }
  } finally {
    session.close();
  }
  return {
    id: target.id,
    title: target.title || "",
    url: target.url || "",
    samples: sampleReports,
    summary: summarize(sampleReports)
  };
}

async function main() {
  const options = parseArgs(process.argv);
  if (options.help) {
    console.log(usage());
    return;
  }
  const port = Number(options.port);
  const samples = Math.max(1, Math.min(20, Number(options.samples || 4)));
  const intervalMs = Math.max(250, Math.min(5000, Number(options.intervalMs || 900)));
  summarize.runtimeManifestPath = path.resolve(options.runtimeManifest || DEFAULT_RUNTIME_MANIFEST);
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error("--port must be a positive integer");
  }
  const targets = (await fetchJson(`http://127.0.0.1:${port}/json/list`)).filter(isTarget);
  if (targets.length === 0) {
    throw new Error("no Codex renderer target found");
  }
  const report = {
    ok: true,
    mode: "read-only-interface-field-inventory",
    intervalMs,
    samples,
    targets: []
  };
  for (const target of targets) {
    report.targets.push(await scanTarget(target, samples, intervalMs));
  }
  if (options.out) {
    fs.mkdirSync(path.dirname(path.resolve(options.out)), { recursive: true });
    fs.writeFileSync(path.resolve(options.out), JSON.stringify(report, null, 2) + "\n", "utf8");
  }
  if (options.format === "json") {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log("[codex-interface-theme] interface field inventory");
    console.log(`mode=${report.mode} interval=${intervalMs}ms samples=${samples}`);
    for (const target of report.targets) {
      const summary = target.summary;
      console.log(`target=${target.title} ${target.url}`);
      console.log(`fields=${summary.totalFields} static=${summary.staticFields} dynamic=${summary.dynamicFields} draggable=${summary.draggableFields} highMemoryDrag=${summary.highMemoryDragFields} textFields=${summary.textFields}`);
      console.log(`byKind=${JSON.stringify(summary.byKind)}`);
      console.log(`byRisk=${JSON.stringify(summary.byRisk)}`);
      console.log(`byDragRisk=${JSON.stringify(summary.byDragRisk)}`);
      console.log(`dynamicBoundaryLocks=${summary.dynamicBoundaryLocks.detectedLocks}/${summary.dynamicBoundaryLocks.totalLocks} missing=${summary.dynamicBoundaryLocks.missingLocks.join(",") || "none"}`);
      for (const field of summary.fields.filter((entry) => entry.dynamic).slice(0, 24)) {
        console.log(`- dynamic kind=${field.kind} risk=${field.risk || "safe"} seen=${field.seen} rectVariants=${field.rectVariantCount} label=${field.label.slice(0, 90)}`);
      }
    }
  }
}

try {
  await main();
} catch (error) {
  console.error(`[codex-interface-theme][interface-field-inventory] ${error.message}`);
  process.exitCode = 1;
}
