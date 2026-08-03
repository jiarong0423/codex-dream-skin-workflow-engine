#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {
  DEFAULT_RUNTIME_MANIFEST,
  buildDynamicBoundaryCoverage,
  readDynamicBoundaryLocks
} from "./dynamic-boundary-coverage.mjs";

function usage() {
  return `Usage:
  live-clickable-surface-audit.mjs --port <port> --out-dir <dir> [--limit <n>] [--drag true|false] [--runtime-manifest <path>] [--format text|json]
  [--allow-route true|false] [--allow-stateful-controls true|false] [--dry-run true|false] [--interact true|false] [--allow-indexes <csv>]

Audits visible clickable Codex surfaces through CDP. The script opens only
  reversible UI surfaces, skips risky actions, captures screenshots, presses
Escape after each interaction, and optionally performs small drag checks on
low-risk draggable surfaces. High-memory screenshot/source/attachment preview
resize surfaces are inventoried and photographed but never dragged by default.
Route-changing, workspace, sidebar, top-toolbar, popover, right-panel,
permission, write, and destructive actions are report-only by default. Stateful
UI controls require --allow-stateful-controls true plus the interactive
allowlist. Dry-run mode inventories surfaces without dispatching keyboard,
click, drag input, or temporary DOM markers. Interactive mode requires both
--interact true and --dry-run false, plus explicit non-risk candidate indexes
from a previous inventory report.`;
}

function parseArgs(argv) {
  const options = {
    limit: "80",
    drag: "true",
    allowRoute: "false",
    allowStatefulControls: "false",
    dryRun: "true",
    interact: "false",
    allowIndexes: "",
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

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function parseAllowedIndexes(value) {
  const text = String(value || "").trim();
  if (!text) {
    return new Set();
  }
  const indexes = new Set();
  for (const part of text.split(",")) {
    const trimmed = part.trim();
    if (!/^\d+$/.test(trimmed)) {
      throw new Error(`invalid --allow-indexes value: ${value}`);
    }
    indexes.add(Number(trimmed));
  }
  return indexes;
}

function safeSlug(value) {
  return String(value || "surface")
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/giu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72) || "surface";
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout(promise, timeoutMs, label) {
  let timer = null;
  return Promise.race([
    promise,
    new Promise((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} timeout after ${timeoutMs}ms`)), timeoutMs);
    })
  ]).finally(() => {
    if (timer) {
      clearTimeout(timer);
    }
  });
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
  return url === "about:blank" || url.startsWith("app://") || url.startsWith("https://chatgpt.com") || url.startsWith("https://chat.openai.com") || /codex|chatgpt/i.test(String(target.title || ""));
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
    const description = result.exceptionDetails.exception && result.exceptionDetails.exception.description || result.exceptionDetails.text || "Runtime.evaluate failed";
    throw new Error(description);
  }
  return result.result ? result.result.value : undefined;
}

async function pressEscape(session) {
  await session.send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Escape",
    code: "Escape",
    windowsVirtualKeyCode: 27,
    nativeVirtualKeyCode: 53
  });
  await session.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Escape",
    code: "Escape",
    windowsVirtualKeyCode: 27,
    nativeVirtualKeyCode: 53
  });
}

async function cleanupAuditMarkers(session) {
  await evaluate(session, `(() => {
    document.querySelectorAll("[data-cit-clickable-audit-id]").forEach((node) => node.removeAttribute("data-cit-clickable-audit-id"));
    delete window.__codexInterfaceThemeClickableAudit;
    return { ok: true };
  })()`);
}

async function captureScreenshot(session, filePath) {
  const result = await withTimeout(session.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false
  }), 7000, "Page.captureScreenshot");
  fs.writeFileSync(filePath, Buffer.from(result.data || "", "base64"));
  return filePath;
}

function collectExpression(options = {}) {
  const allowRoute = String(options.allowRoute || "false").toLowerCase() === "true";
  const allowStatefulControls = String(options.allowStatefulControls || "false").toLowerCase() === "true";
  const markNodes = options.markNodes !== false;
  return `(() => {
    const allowRoute = ${allowRoute ? "true" : "false"};
    const allowStatefulControls = ${allowStatefulControls ? "true" : "false"};
    const markNodes = ${markNodes ? "true" : "false"};
    const root = document.documentElement;
    const clickableSelector = [
      "button",
      "a[href]",
      "summary",
      "select",
      "textarea",
      "input:not([type='hidden'])",
      "input[type='checkbox']",
      "input[type='radio']",
      "[contenteditable='true']",
      "[role='button']",
      "[aria-haspopup]",
      "[aria-expanded]",
      "[tabindex]:not([tabindex='-1'])",
      "[draggable='true']",
      "[data-cit-source-preview-block='true']"
    ].join(",");
    function norm(value) {
      return String(value || "").replace(/\\s+/g, " ").trim();
    }
    function visible(node) {
      if (!node || typeof node.getBoundingClientRect !== "function") {
        return false;
      }
      const rect = node.getBoundingClientRect();
      if (rect.width < 4 || rect.height < 4 || rect.bottom < 0 || rect.right < 0 || rect.top > window.innerHeight || rect.left > window.innerWidth) {
        return false;
      }
      const style = window.getComputedStyle(node);
      return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || "1") > 0.04;
    }
    function labelOf(node) {
      const parts = [
        node.getAttribute("aria-label"),
        node.getAttribute("title"),
        node.getAttribute("data-cit-button-action"),
        node.getAttribute("data-cit-source-preview-kind"),
        node.value,
        node.innerText,
        node.textContent
      ].map(norm).filter(Boolean);
      return norm(parts.find((part) => part.length >= 2) || parts[0] || node.tagName.toLowerCase()).slice(0, 180);
    }
    function riskOf(label, node) {
      const text = norm(label).toLowerCase();
      if (node.disabled || node.getAttribute("aria-disabled") === "true") {
        return "disabled";
      }
      if (/送出|submit|send message|停止產生|stop generating/.test(text)) {
        return "composer-action";
      }
      if (/新聊天|new chat|new task|new conversation/.test(text)) {
        return allowStatefulControls ? "" : "new-task-route";
      }
      if (/專案|project|工作區|workspace|側邊欄|sidebar|整理側邊欄|切換|switch|關閉|close/.test(text)) {
        return allowStatefulControls ? "" : "workspace-or-sidebar-state";
      }
      if (/送交|推送|push|commit|merge|建立 pull request|create pull request|建立|create|復原|還原|undo|restore|revert|套用|apply|核准|approve|authorize|確認|confirm|執行|run/.test(text)) {
        return "write-action";
      }
      if (/刪除|delete|trash|移除|remove|archive|封存|登出|logout|sign out/.test(text)) {
        return "destructive-or-session";
      }
      if (/安裝|install|權限|permission|授權|grant|允許|allow|登入|login|sign in|訂閱|subscribe|付款|pay|buy|購買/.test(text)) {
        return "permission-or-external";
      }
      return "";
    }
    function stateRiskOf(kind) {
      if (kind === "source-preview") {
        return "source-preview-state";
      }
      if (kind === "navigation" || kind === "sidebar" || kind === "top-toolbar" || kind === "popover" || kind === "right-panel") {
        return allowStatefulControls ? "" : kind + "-state";
      }
      return "";
    }
    function dragRiskOf(node, label, kind) {
      const text = norm(label).toLowerCase();
      const markedRisk = node.getAttribute("data-cit-drag-risk") || node.closest("[data-cit-drag-risk]")?.getAttribute("data-cit-drag-risk") || "";
      if (markedRisk) {
        return markedRisk;
      }
      const sourcePreview = kind === "source-preview" || Boolean(node.closest("[data-cit-source-preview-block='true']"));
      const hasMedia = node.matches("img,video,canvas") || Boolean(node.querySelector("img,video,canvas"));
      const resizable = node.getAttribute("draggable") === "true" || /調整大小|resize|drag|拖曳|預覽|preview|截圖|screenshot|來源|source|附件|attachment/.test(text);
      if (sourcePreview && (hasMedia || resizable)) {
        return "high-memory-image-resize";
      }
      return "";
    }
    function kindOf(node, label) {
      const text = norm(label).toLowerCase();
      const rect = node.getBoundingClientRect();
      if (node.closest("[data-cit-source-preview-block='true']") || /來源|source|使用者附件|user attachment|截圖|screenshot|讀取檔案|read file|調整大小|resize/.test(text)) {
        return "source-preview";
      }
      if (node.closest("header.app-header-tint") || rect.top <= 90) {
        return "top-toolbar";
      }
      if (node.closest("aside.app-shell-left-panel")) {
        return "sidebar";
      }
      if (node.closest(".codex-interface-theme-project-panel,.codex-interface-theme-project-panel-frame")) {
        return "right-panel";
      }
      if (node.closest("[data-radix-popper-content-wrapper]") || node.closest("[role='menu']") || node.closest("[role='listbox']") || node.getAttribute("aria-haspopup")) {
        return "popover";
      }
      if (node.closest(".composer-surface-chrome,.codex-interface-theme-composer-surface")) {
        return "composer";
      }
      if (/專案|project|pull request|網站|已排程|scheduled|外掛程式|extension|設定|settings/.test(text)) {
        return "navigation";
      }
      return "general";
    }
    function bgInfo(node) {
      const style = window.getComputedStyle(node);
      return {
        bg: style.backgroundColor,
        bgImage: style.backgroundImage === "none" ? "none" : "image",
        radius: style.borderRadius,
        boxShadow: style.boxShadow === "none" ? "none" : "shadow"
      };
    }
    const rawNodes = Array.from(document.querySelectorAll(clickableSelector));
    const seen = new Set();
    const items = [];
    rawNodes.forEach((node) => {
      if (!visible(node)) {
        return;
      }
      const rect = node.getBoundingClientRect();
      const roundedKey = [
        node.tagName,
        Math.round(rect.left / 3),
        Math.round(rect.top / 3),
        Math.round(rect.width / 3),
        Math.round(rect.height / 3)
      ].join(":");
      if (seen.has(roundedKey)) {
        return;
      }
      seen.add(roundedKey);
      const label = labelOf(node);
      const kind = kindOf(node, label);
      const risk = riskOf(label, node) || stateRiskOf(kind);
      const draggable = node.getAttribute("draggable") === "true" || /調整大小|resize|drag|拖曳/.test(label) || Boolean(node.closest("[data-cit-source-preview-block='true']"));
      const dragRisk = dragRiskOf(node, label, kind);
      const field = node.matches("input,textarea,[contenteditable='true']");
      const index = items.length;
      if (markNodes) {
        node.setAttribute("data-cit-clickable-audit-id", String(index));
      }
      const paint = bgInfo(node);
      const children = Array.from(node.children || []).filter(visible).map((child) => Object.assign({
        tag: child.tagName.toLowerCase(),
        text: norm(child.innerText || child.textContent).slice(0, 80),
        rect: (() => {
          const childRect = child.getBoundingClientRect();
          return {
            x: Math.round(childRect.left),
            y: Math.round(childRect.top),
            width: Math.round(childRect.width),
            height: Math.round(childRect.height)
          };
        })()
      }, bgInfo(child))).slice(0, 8);
      items.push({
        index,
        tag: node.tagName.toLowerCase(),
        role: node.getAttribute("role") || "",
        type: node.getAttribute("type") || "",
        label,
        kind,
        risk,
        field,
        safe: !risk && (kind !== "composer" || field),
        draggable,
        dragRisk,
        autoDragSafe: draggable && dragRisk !== "high-memory-image-resize",
        expanded: node.getAttribute("aria-expanded") || "",
        hasPopup: node.getAttribute("aria-haspopup") || "",
        rect: {
          x: Math.round(rect.left),
          y: Math.round(rect.top),
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        },
        paint,
        children
      });
    });
    if (markNodes) {
      window.__codexInterfaceThemeClickableAudit = items;
    }
    return {
      href: location.href,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      runtimeModules: root.dataset.citRuntimeModules || "",
      sourcePreviewBlocks: root.dataset.citSourcePreviewBlocks || "0",
      highMemoryPreviewBlocks: document.querySelectorAll("[data-cit-drag-risk='high-memory-image-resize']").length,
      projectPanels: root.dataset.citProjectPanels || "",
      rightMajorPanel: root.dataset.citRightMajorPanel || "",
      candidates: items
    };
  })()`;
}

function clickExpression(index) {
  return `(() => {
    const node = document.querySelector('[data-cit-clickable-audit-id="${Number(index)}"]');
    if (!node || typeof node.getBoundingClientRect !== "function") {
      return { ok: false, reason: "missing" };
    }
    node.scrollIntoView({ block: "center", inline: "center" });
    const rect = node.getBoundingClientRect();
    const x = Math.round(rect.left + rect.width / 2);
    const y = Math.round(rect.top + rect.height / 2);
    try {
      node.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 1, pointerType: "mouse" }));
      node.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, clientX: x, clientY: y }));
      node.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true, clientX: x, clientY: y }));
      node.click();
    } catch (error) {
      try {
        node.click();
      } catch (innerError) {
        return { ok: false, reason: String(innerError && innerError.message || innerError) };
      }
    }
    return { ok: true, rect: { x, y, width: Math.round(rect.width), height: Math.round(rect.height) } };
  })()`;
}

function surfaceStateExpression() {
  return `(() => {
    function norm(value) {
      return String(value || "").replace(/\\s+/g, " ").trim();
    }
    function visible(node) {
      if (!node || typeof node.getBoundingClientRect !== "function") {
        return false;
      }
      const rect = node.getBoundingClientRect();
      if (rect.width < 4 || rect.height < 4 || rect.bottom < 0 || rect.right < 0 || rect.top > window.innerHeight || rect.left > window.innerWidth) {
        return false;
      }
      const style = window.getComputedStyle(node);
      return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || "1") > 0.04;
    }
    function brief(node) {
      if (!node || !visible(node)) {
        return null;
      }
      const rect = node.getBoundingClientRect();
      const style = window.getComputedStyle(node);
      return {
        tag: node.tagName.toLowerCase(),
        text: norm(node.innerText || node.textContent).slice(0, 120),
        kind: node.getAttribute("data-cit-source-preview-kind") || node.getAttribute("data-cit-button-module") || "",
        rect: {
          x: Math.round(rect.left),
          y: Math.round(rect.top),
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        },
        bg: style.backgroundColor,
        bgImage: style.backgroundImage === "none" ? "none" : "image",
        shadow: style.boxShadow === "none" ? "none" : "shadow",
        radius: style.borderRadius
      };
    }
    function isDarkOpaque(bg) {
      const match = String(bg || "").match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)(?:,\\s*([0-9.]+))?\\)/i);
      if (!match) {
        return false;
      }
      const r = Number(match[1]);
      const g = Number(match[2]);
      const b = Number(match[3]);
      const a = match[4] === undefined ? 1 : Number(match[4]);
      return a >= 0.58 && (r + g + b) / 3 <= 35;
    }
    const sourceBlocks = Array.from(document.querySelectorAll("[data-cit-source-preview-block='true']")).filter(visible).map(brief);
    const sourceThumbnails = Array.from(document.querySelectorAll("[data-cit-source-thumbnail='true']")).filter(visible).map(brief);
    const topToolbar = Array.from(document.querySelectorAll("header.app-header-tint :is(button,[role='button'],a)")).filter(visible).map(brief);
    const topDark = topToolbar.filter((item) => item && isDarkOpaque(item.bg));
    const popovers = Array.from(document.querySelectorAll("[data-radix-popper-content-wrapper] > *, [role='menu'], [role='listbox']")).filter(visible).map(brief);
    const rightPanelImages = Array.from(document.querySelectorAll(".codex-interface-theme-project-panel img, [data-cit-source-preview-kind='right-panel'] img")).filter(visible).map(brief);
    const sidebarRows = Array.from(document.querySelectorAll("aside.app-shell-left-panel :is(a,button,[role='button'])")).filter(visible).slice(0, 18).map((node) => {
      const row = node.closest(".sidebar-item") || node.parentElement || node;
      const childPainted = Array.from(row.children || []).filter(visible).map((child) => {
        const style = window.getComputedStyle(child);
        return style.backgroundColor !== "rgba(0, 0, 0, 0)" || style.backgroundImage !== "none" || style.boxShadow !== "none";
      }).filter(Boolean).length;
      return Object.assign(brief(node), { childPainted });
    });
    return {
      sourceBlocks,
      sourceThumbnails,
      topDark,
      popovers,
      rightPanelImages,
      sidebarRows,
      datasets: {
        sourcePreviewBlocks: document.documentElement.dataset.citSourcePreviewBlocks || "0",
        rightMajorPanel: document.documentElement.dataset.citRightMajorPanel || "",
        projectPanels: document.documentElement.dataset.citProjectPanels || "",
        hotSwapRetreat: document.documentElement.dataset.citHotSwapRetreat || ""
      }
    };
  })()`;
}

async function dragAt(session, rect) {
  const startX = Math.round(rect.x + Math.min(rect.width - 6, Math.max(8, rect.width * 0.82)));
  const startY = Math.round(rect.y + Math.min(rect.height - 6, Math.max(8, rect.height * 0.72)));
  const endX = startX + 34;
  const endY = startY + 22;
  await session.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: startX, y: startY, button: "none" });
  await session.send("Input.dispatchMouseEvent", { type: "mousePressed", x: startX, y: startY, button: "left", buttons: 1, clickCount: 1 });
  await session.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: endX, y: endY, button: "left", buttons: 1 });
  await session.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: endX, y: endY, button: "left", buttons: 0, clickCount: 1 });
}

async function main() {
  const options = parseArgs(process.argv);
  if (options.help) {
    console.log(usage());
    return;
  }
  const port = Number(requireOption(options, "port"));
  const outDir = path.resolve(requireOption(options, "out-dir"));
  const limit = Math.max(1, Math.min(200, Number(options.limit || 80)));
  const dragEnabled = String(options.drag || "true").toLowerCase() !== "false";
  const allowRoute = String(options.allowRoute || "false").toLowerCase() === "true";
  const allowStatefulControls = String(options.allowStatefulControls || "false").toLowerCase() === "true";
  const interact = String(options.interact || "false").toLowerCase() === "true";
  const requestedDryRun = String(options.dryRun || "true").toLowerCase() !== "false";
  const allowedIndexes = parseAllowedIndexes(options.allowIndexes);
  const lockConfig = readDynamicBoundaryLocks(options["runtime-manifest"]);
  if (!requestedDryRun && !interact) {
    throw new Error("interactive clickable audit requires --interact true --dry-run false");
  }
  if (interact && !requestedDryRun && allowedIndexes.size === 0) {
    throw new Error("interactive clickable audit requires explicit --allow-indexes from a reviewed dry-run report");
  }
  const dryRun = requestedDryRun;
  const mayDispatchInput = interact && !dryRun;
  ensureDir(outDir);

  const targets = await fetchJson(`http://127.0.0.1:${port}/json/list`);
  const target = targets.find(isInjectableTarget);
  if (!target) {
    throw new Error(`no injectable Codex renderer found on port ${port}`);
  }
  const session = new CdpSession(target.webSocketDebuggerUrl);
  await session.open();
  const records = [];
  try {
    await session.send("Page.enable");
    await session.send("Runtime.enable");
    if (mayDispatchInput) {
      await pressEscape(session);
      await sleep(220);
    }
    const initial = await evaluate(session, collectExpression({ allowRoute, allowStatefulControls, markNodes: mayDispatchInput }));
    const candidates = initial.candidates || [];
    const dynamicBoundaryLocks = buildDynamicBoundaryCoverage(candidates, lockConfig);
    const safeCandidates = candidates
      .filter((item) => item.safe && (!mayDispatchInput || allowedIndexes.has(item.index)))
      .sort((left, right) => Number(left.risk === "new-task-route") - Number(right.risk === "new-task-route"))
      .slice(0, limit);
    const skipped = candidates.filter((item) => !item.safe).map((item) => ({
      index: item.index,
      kind: item.kind,
      label: item.label,
      risk: item.risk || "composer-or-unknown"
    }));

    let shotIndex = 0;
    const initialPath = path.join(outDir, `${String(shotIndex).padStart(3, "0")}-initial.png`);
    const warnings = [];
    let initialScreenshot = initialPath;
    try {
      await captureScreenshot(session, initialPath);
    } catch (error) {
      if (!dryRun) {
        throw error;
      }
      initialScreenshot = "";
      warnings.push(`initial screenshot skipped in dry-run: ${error && error.message ? error.message : String(error)}`);
    }
    records.push({
      type: "initial",
      screenshot: initialScreenshot,
      warning: warnings[0] || "",
      state: await evaluate(session, surfaceStateExpression())
    });
    shotIndex += 1;

    if (dryRun) {
      const report = {
        ok: true,
        dryRun: true,
        target: {
          title: target.title || "",
          url: target.url || ""
        },
        outDir,
        allowStatefulControls,
        scanned: candidates.length,
        clicked: 0,
        skipped,
        dynamicBoundaryLocks,
        candidates,
        warnings,
        records
      };
      fs.writeFileSync(path.join(outDir, "clickable-surface-audit.json"), JSON.stringify(report, null, 2));
      if (options.format === "json") {
        console.log(JSON.stringify(report, null, 2));
      } else {
        console.log("[codex-interface-theme] clickable surface audit dry-run");
        console.log(`target=${report.target.title}`);
        console.log(`outDir=${outDir}`);
        console.log(`scanned=${report.scanned} clicked=0 skipped=${report.skipped.length}`);
        const byKind = {};
        const byRisk = {};
        for (const item of candidates) {
          byKind[item.kind] = (byKind[item.kind] || 0) + 1;
          byRisk[item.risk || "safe"] = (byRisk[item.risk || "safe"] || 0) + 1;
        }
        console.log(`byKind=${JSON.stringify(byKind)}`);
        console.log(`byRisk=${JSON.stringify(byRisk)}`);
        console.log(`dynamicBoundaryLocks=${dynamicBoundaryLocks.detectedLocks}/${dynamicBoundaryLocks.totalLocks} missing=${dynamicBoundaryLocks.missingLocks.join(",") || "none"}`);
        if (warnings.length > 0) {
          console.log(`warning=${warnings.join("; ")}`);
        }
        console.log(`screenshot=${initialScreenshot || "not-captured"}`);
      }
      return;
    }

    for (const candidate of safeCandidates) {
      await pressEscape(session);
      await sleep(180);
      const clickResult = await evaluate(session, clickExpression(candidate.index));
      await sleep(520);
      const state = await evaluate(session, surfaceStateExpression());
      const filePath = path.join(outDir, `${String(shotIndex).padStart(3, "0")}-${safeSlug(candidate.kind)}-${safeSlug(candidate.label)}.png`);
      await captureScreenshot(session, filePath);
      records.push({
        type: "click",
        candidate,
        clickResult,
        screenshot: filePath,
        state
      });
      shotIndex += 1;

      if (dragEnabled && candidate.draggable && candidate.autoDragSafe && clickResult && clickResult.ok && clickResult.rect) {
        await dragAt(session, {
          x: clickResult.rect.x - Math.round(clickResult.rect.width / 2),
          y: clickResult.rect.y - Math.round(clickResult.rect.height / 2),
          width: clickResult.rect.width,
          height: clickResult.rect.height
        });
        await sleep(520);
        const dragState = await evaluate(session, surfaceStateExpression());
        const dragPath = path.join(outDir, `${String(shotIndex).padStart(3, "0")}-drag-${safeSlug(candidate.kind)}-${safeSlug(candidate.label)}.png`);
        await captureScreenshot(session, dragPath);
        records.push({
          type: "drag",
          candidate,
          screenshot: dragPath,
          state: dragState
        });
        shotIndex += 1;
      } else if (dragEnabled && candidate.draggable && !candidate.autoDragSafe) {
        records.push({
          type: "drag-skipped",
          reason: candidate.dragRisk || "unsafe-drag-surface",
          candidate,
          state
        });
      }
    }
    await pressEscape(session);
    await sleep(200);
    await cleanupAuditMarkers(session);

    const report = {
      ok: true,
      target: {
        title: target.title || "",
        url: target.url || ""
      },
      outDir,
      allowStatefulControls,
      scanned: candidates.length,
      clicked: safeCandidates.length,
      skipped,
      dynamicBoundaryLocks,
      records
    };
    fs.writeFileSync(path.join(outDir, "clickable-surface-audit.json"), JSON.stringify(report, null, 2));
    if (options.format === "json") {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log("[codex-interface-theme] clickable surface audit");
      console.log(`target=${report.target.title}`);
      console.log(`outDir=${outDir}`);
      console.log(`scanned=${report.scanned} clicked=${report.clicked} skipped=${report.skipped.length}`);
      console.log(`dynamicBoundaryLocks=${dynamicBoundaryLocks.detectedLocks}/${dynamicBoundaryLocks.totalLocks} missing=${dynamicBoundaryLocks.missingLocks.join(",") || "none"}`);
      for (const record of records.slice(0, 24)) {
        const label = record.candidate ? `${record.candidate.kind}:${record.candidate.label}` : record.type;
        const state = record.state || {};
        const datasets = state.datasets || {};
        const topDark = Array.isArray(state.topDark) ? state.topDark.length : 0;
        const sourceBlocks = Array.isArray(state.sourceBlocks) ? state.sourceBlocks.length : 0;
        const popovers = Array.isArray(state.popovers) ? state.popovers.length : 0;
        console.log(`- ${record.type} ${label} source=${sourceBlocks} popovers=${popovers} topDark=${topDark} dragRisk=${record.reason || record.candidate?.dragRisk || "none"} datasets=${JSON.stringify(datasets)} screenshot=${record.screenshot || ""}`);
      }
      if (records.length > 24) {
        console.log(`... ${records.length - 24} more records in clickable-surface-audit.json`);
      }
      if (skipped.length > 0) {
        console.log("skipped:");
        for (const item of skipped.slice(0, 20)) {
          console.log(`- ${item.kind} ${item.label} risk=${item.risk}`);
        }
      }
    }
  } finally {
    session.close();
  }
}

try {
  await main();
} catch (error) {
  console.error(`[codex-interface-theme][error] ${error && error.message ? error.message : error}`);
  process.exitCode = 1;
}
