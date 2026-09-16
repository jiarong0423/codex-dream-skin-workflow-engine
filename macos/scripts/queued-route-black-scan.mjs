#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SCRIPT_DIR = path.dirname(SCRIPT_PATH);
const ENGINE_ROOT = path.resolve(SCRIPT_DIR, "..");
const PROJECT_ROOT = path.resolve(ENGINE_ROOT, "..");
const DEFAULT_PORT = 9341;
const DEFAULT_WAIT_MS = 1600;
const DEFAULT_LABELS = ["current", "專案", "Pull Request", "網站", "已排程", "外掛程式"];
const ALLOWED_LABELS = new Set(DEFAULT_LABELS);

function usage() {
  return `Usage: queued-route-black-scan.mjs [--port <port>] [--out-dir <absolute-path>]
                                     [--labels <comma-list>] [--wait-ms <ms>]

Queues route-level black-layer scans against an already running Codex CDP port.

Allowed labels:
  current, 專案, Pull Request, 網站, 已排程, 外掛程式

Safety contract:
  launches=false applies=false restores=false drags=false
  clicks=true, but only sidebar navigation labels from the fixed allowlist.
  It never clicks 新對話, account controls, permission controls, project rows,
  browser content, composer controls, source previews, or destructive actions.`;
}

function parseArgs(argv) {
  const options = {
    port: DEFAULT_PORT,
    outDir: "",
    labels: DEFAULT_LABELS,
    waitMs: DEFAULT_WAIT_MS
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
    if (key === "--port") {
      options.port = Number(value);
    } else if (key === "--out-dir") {
      options.outDir = value;
    } else if (key === "--labels") {
      options.labels = value.split(",").map((item) => item.trim()).filter(Boolean);
    } else if (key === "--wait-ms") {
      options.waitMs = Number(value);
    } else {
      throw new Error(`unknown option: ${key}`);
    }
    index += 1;
  }
  return options;
}

function assertOptions(options) {
  if (!Number.isInteger(options.port) || options.port <= 0) {
    throw new Error(`invalid --port: ${options.port}`);
  }
  if (!Number.isInteger(options.waitMs) || options.waitMs < 250 || options.waitMs > 10000) {
    throw new Error(`invalid --wait-ms: ${options.waitMs}`);
  }
  for (const label of options.labels) {
    if (!ALLOWED_LABELS.has(label)) {
      throw new Error(`label is not allowlisted for batch navigation: ${label}`);
    }
  }
  if (!options.outDir) {
    const stamp = timestamp();
    options.outDir = path.join(ENGINE_ROOT, "previews", `queued-route-black-scan-${stamp}`);
  }
  if (!path.isAbsolute(options.outDir)) {
    throw new Error(`--out-dir must be absolute: ${options.outDir}`);
  }
}

function timestamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
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

function isCodexTarget(target) {
  if (!target || target.type !== "page" || !target.webSocketDebuggerUrl) {
    return false;
  }
  const url = String(target.url || "");
  if (url.startsWith("devtools://") || url.startsWith("chrome://") || url.startsWith("chrome-extension://")) {
    return false;
  }
  if (url.includes("initialRoute=%2Favatar-overlay")) {
    return false;
  }
  return url.startsWith("app://") || /codex|chatgpt/i.test(String(target.title || ""));
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

async function evaluate(session, expression, timeoutMs = 12000) {
  const result = await session.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture: false
  }, timeoutMs);
  if (result.exceptionDetails) {
    const detail = result.exceptionDetails.exception && result.exceptionDetails.exception.description || result.exceptionDetails.text || "Runtime.evaluate failed";
    throw new Error(detail);
  }
  return result.result ? result.result.value : undefined;
}

function stateExpression() {
  return `(() => {
    const norm = (value) => String(value || "").replace(/\\s+/g, " ").trim();
    const visible = (node) => {
      if (!node || !(node instanceof Element)) return false;
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return rect.width > 1 && rect.height > 1 && style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || "1") > 0.01;
    };
    const brief = (node) => {
      if (!node) return null;
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return {
        tag: node.tagName,
        role: node.getAttribute("role") || "",
        aria: node.getAttribute("aria-label") || "",
        text: norm(node.innerText || node.textContent).slice(0, 120),
        className: String(node.className || "").replace(/\\s+/g, " ").slice(0, 160),
        rect: {
          left: Math.round(rect.left),
          top: Math.round(rect.top),
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        },
        backgroundColor: style.backgroundColor,
        backgroundImage: style.backgroundImage
      };
    };
    const sidebarRows = Array.from(document.querySelectorAll("aside.app-shell-left-panel :is(a,button,[role='button'])")).filter(visible).slice(0, 30).map(brief);
    const headings = Array.from(document.querySelectorAll("h1,h2,[role='heading']")).filter(visible).slice(0, 12).map(brief);
    const inputs = Array.from(document.querySelectorAll("input,textarea,[contenteditable='true']")).filter(visible).slice(0, 12).map((node) => ({
      tag: node.tagName,
      role: node.getAttribute("role") || "",
      placeholder: node.getAttribute("placeholder") || "",
      aria: node.getAttribute("aria-label") || "",
      className: String(node.className || "").replace(/\\s+/g, " ").slice(0, 120)
    }));
    const browserText = norm(document.body && document.body.innerText).includes("BookMirror") ? "BookMirror" : "";
    return {
      href: String(location.href),
      title: document.title || "",
      revision: document.querySelector("#codex-interface-theme-marker")?.dataset?.revision || "",
      activePack: document.documentElement.dataset.citActiveThemePack || "",
      headings,
      inputs,
      sidebarRows,
      browserText
    };
  })()`;
}

function clickSidebarLabelExpression(label, waitMs) {
  const labelLiteral = JSON.stringify(label);
  return `(async () => {
    const label = ${labelLiteral};
    const norm = (value) => String(value || "").replace(/\\s+/g, " ").trim();
    const visible = (node) => {
      if (!node || !(node instanceof Element)) return false;
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return rect.width > 1 && rect.height > 1 && style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || "1") > 0.01;
    };
    const brief = (node) => {
      const rect = node.getBoundingClientRect();
      return {
        tag: node.tagName,
        role: node.getAttribute("role") || "",
        aria: node.getAttribute("aria-label") || "",
        text: norm(node.innerText || node.textContent).slice(0, 120),
        className: String(node.className || "").replace(/\\s+/g, " ").slice(0, 160),
        rect: {
          left: Math.round(rect.left),
          top: Math.round(rect.top),
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        }
      };
    };
    const deny = new Set(["新對話", "New chat", "新增", "建立"]);
    const nodes = Array.from(document.querySelectorAll("aside.app-shell-left-panel :is(a,button,[role='button'])")).filter(visible);
    const candidates = nodes.map((node) => ({ node, text: norm(node.innerText || node.textContent), aria: norm(node.getAttribute("aria-label") || "") }));
    const match = candidates.find((item) => {
      if ([...deny].some((blocked) => item.text.includes(blocked) || item.aria.includes(blocked))) return false;
      return item.text === label || item.aria === label || item.text.includes(label) || item.aria.includes(label);
    });
    if (!match) {
      return { ok: false, clicked: false, label, reason: "sidebar label not found", available: candidates.map((item) => ({ text: item.text, aria: item.aria })).slice(0, 30) };
    }
    match.node.scrollIntoView({ block: "center", inline: "nearest" });
    await new Promise((resolve) => setTimeout(resolve, 120));
    match.node.click();
    await new Promise((resolve) => setTimeout(resolve, ${Number(waitMs)}));
    return { ok: true, clicked: true, label, node: brief(match.node), href: String(location.href), title: document.title || "" };
  })()`;
}

function slugify(value) {
  return String(value)
    .replace(/Pull Request/g, "pull-request")
    .replace(/專案/g, "projects")
    .replace(/網站/g, "websites")
    .replace(/已排程/g, "scheduled")
    .replace(/外掛程式/g, "extensions")
    .replace(/current/g, "current")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "route";
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: PROJECT_ROOT,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 16
  });
  const allowedCodes = options.allowedCodes || [0];
  const ok = allowedCodes.includes(result.status);
  return {
    ok,
    status: result.status,
    signal: result.signal || "",
    command: [command, ...args].join(" "),
    stdout: result.stdout || "",
    stderr: result.stderr || ""
  };
}

function readJsonIfExists(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function summarizeDom(domJson) {
  const summaries = [];
  for (const sample of domJson && domJson.samples || []) {
    for (const target of sample.targets || []) {
      const scan = target.scan || {};
      summaries.push({
        targetTitle: target.targetTitle || "",
        targetUrl: target.targetUrl || "",
        revision: scan.diagnostics && scan.diagnostics.revision || "",
        summary: scan.summary || {},
        topProtected: (scan.protectedCandidates || []).slice(0, 8).map((item) => ({
          tag: item.tag || "",
          role: item.role || "",
          className: String(item.className || "").replace(/\s+/g, " ").slice(0, 140),
          text: String(item.text || "").replace(/\s+/g, " ").slice(0, 90),
          rect: item.rect || {},
          backgroundColor: item.visual && item.visual.backgroundColor || "",
          backgroundImage: item.visual && item.visual.backgroundImage || "",
          signals: item.signals || []
        })),
        topUnmarked: (scan.unmarked || []).slice(0, 8).map((item) => ({
          tag: item.tag || "",
          role: item.role || "",
          className: String(item.className || "").replace(/\s+/g, " ").slice(0, 140),
          text: String(item.text || "").replace(/\s+/g, " ").slice(0, 90),
          rect: item.rect || {},
          backgroundColor: item.visual && item.visual.backgroundColor || "",
          backgroundImage: item.visual && item.visual.backgroundImage || "",
          signals: item.signals || []
        }))
      });
    }
  }
  return summaries;
}

function summarizePixel(pixelJson) {
  const images = pixelJson && pixelJson.images || [];
  return images.map((image) => ({
    image: image.image || "",
    width: image.width,
    height: image.height,
    summary: image.summary || {},
    topCandidates: (image.candidates || []).slice(0, 8).map((candidate) => ({
      classification: candidate.classification || "",
      sourceKind: candidate.sourceKind || "",
      rect: candidate.rect || {},
      avgLuminance: candidate.avgLuminance,
      darkRatio: candidate.darkRatio,
      confidence: candidate.confidence
    }))
  }));
}

function writeTextSummary(report, filePath) {
  const lines = [];
  lines.push("# Queued Route Black Scan");
  lines.push("");
  lines.push(`- port: ${report.port}`);
  lines.push(`- startedAt: ${report.startedAt}`);
  lines.push(`- finishedAt: ${report.finishedAt}`);
  lines.push(`- output: ${report.outDir}`);
  lines.push(`- sideEffects: clicks=true, sidebar-navigation-only; launches=false; applies=false; restores=false; drags=false`);
  lines.push("");
  for (const route of report.routes) {
    lines.push(`## ${route.index}. ${route.label}`);
    lines.push("");
    lines.push(`- routeDir: ${route.routeDir}`);
    lines.push(`- click: ${route.clickResult.clicked ? "clicked" : "not-clicked"}${route.clickResult.reason ? ` (${route.clickResult.reason})` : ""}`);
    lines.push(`- href: ${route.afterState && route.afterState.href || ""}`);
    lines.push(`- revision: ${route.afterState && route.afterState.revision || ""}`);
    for (const dom of route.domSummary) {
      const summary = dom.summary || {};
      lines.push(`- DOM ${dom.targetUrl}: nearBlack=${summary.nearBlackCandidates ?? ""} unmarked=${summary.unmarkedNearBlackShells ?? ""} protected=${summary.protectedNearBlackSurfaces ?? ""} pseudo=${summary.pseudoOrGradientCandidates ?? ""}`);
      for (const item of dom.topUnmarked || []) {
        lines.push(`  - UNMARKED ${item.className} rect=${JSON.stringify(item.rect)} text=${item.text}`);
      }
      for (const item of (dom.topProtected || []).slice(0, 4)) {
        lines.push(`  - protected ${item.className} rect=${JSON.stringify(item.rect)} text=${item.text}`);
      }
    }
    for (const pixel of route.pixelSummary) {
      const summary = pixel.summary || {};
      lines.push(`- pixel: candidates=${summary.candidates ?? ""} panels=${summary.panels ?? ""} smoothPanels=${summary.smoothPanels ?? ""} rows=${summary.rows ?? ""}`);
      for (const candidate of (pixel.topCandidates || []).slice(0, 4)) {
        lines.push(`  - ${candidate.classification} rect=${JSON.stringify(candidate.rect)} darkRatio=${candidate.darkRatio} confidence=${candidate.confidence}`);
      }
    }
    if (!route.screenshotExists) {
      lines.push(`- screenshot: missing; verifyStatus=${route.verify.status}`);
    } else {
      lines.push(`- screenshot: ${route.screenshot}`);
    }
    lines.push("");
  }
  fs.writeFileSync(filePath, `${lines.join("\n")}\n`, "utf8");
}

async function main() {
  const options = parseArgs(process.argv);
  if (options.help) {
    console.log(usage());
    return;
  }
  assertOptions(options);
  fs.mkdirSync(options.outDir, { recursive: true });
  const targets = await fetchJson(`http://127.0.0.1:${options.port}/json/list`, 2500);
  if (!Array.isArray(targets)) {
    throw new Error("CDP /json/list did not return an array");
  }
  const target = targets.find(isCodexTarget);
  if (!target) {
    throw new Error("no main Codex target found");
  }

  const session = new CdpSession(target.webSocketDebuggerUrl);
  await session.open();
  const report = {
    ok: true,
    mode: "queued-route-black-scan",
    port: options.port,
    outDir: options.outDir,
    startedAt: new Date().toISOString(),
    finishedAt: "",
    safety: {
      launches: false,
      applies: false,
      restores: false,
      drags: false,
      clicks: true,
      clickScope: "sidebar navigation labels only",
      allowlist: Array.from(ALLOWED_LABELS)
    },
    target: {
      id: target.id || "",
      title: target.title || "",
      url: target.url || ""
    },
    routes: []
  };

  try {
    await session.send("Runtime.enable");
    await session.send("Page.enable");
    for (let index = 0; index < options.labels.length; index += 1) {
      const label = options.labels[index];
      const routeSlug = `${String(index + 1).padStart(2, "0")}-${slugify(label)}`;
      const routeDir = path.join(options.outDir, routeSlug);
      const domDir = path.join(routeDir, "dom");
      const pixelDir = path.join(routeDir, "pixel");
      fs.mkdirSync(routeDir, { recursive: true });
      const beforeState = await evaluate(session, stateExpression(), 10000);
      let clickResult = { ok: true, clicked: false, label, reason: "current route sample" };
      if (label !== "current") {
        clickResult = await evaluate(session, clickSidebarLabelExpression(label, options.waitMs), Math.max(12000, options.waitMs + 5000));
      }
      const afterState = await evaluate(session, stateExpression(), 10000);
      fs.writeFileSync(path.join(routeDir, "route-state.json"), `${JSON.stringify({ label, beforeState, clickResult, afterState }, null, 2)}\n`, "utf8");

      const domRun = runCommand("bash", [
        path.join(SCRIPT_DIR, "black-shell-layer-audit.sh"),
        "--port", String(options.port),
        "--out-dir", domDir,
        "--watch", "false",
        "--samples", "1",
        "--interval-ms", "1000"
      ]);

      const screenshot = path.join(routeDir, "screenshot.png");
      const verify = runCommand("bash", [
        path.join(SCRIPT_DIR, "verify.sh"),
        "--port", String(options.port),
        "--screenshot", screenshot
      ], { allowedCodes: [0, 2] });
      const screenshotExists = fs.existsSync(screenshot);
      let pixelRun = { ok: false, status: null, command: "", stdout: "", stderr: "", skipped: true };
      if (screenshotExists) {
        pixelRun = runCommand("bash", [
          path.join(SCRIPT_DIR, "black-shell-screenshot-audit.sh"),
          "--out-dir", pixelDir,
          screenshot
        ]);
      }

      const domJson = readJsonIfExists(path.join(domDir, "01-black-shell-layer-audit.json"));
      const pixelJson = readJsonIfExists(path.join(pixelDir, "black-shell-screenshot-audit.json"));
      const routeReport = {
        index: index + 1,
        label,
        routeDir,
        beforeState,
        clickResult,
        afterState,
        screenshot,
        screenshotExists,
        domRun,
        verify,
        pixelRun,
        domSummary: summarizeDom(domJson),
        pixelSummary: summarizePixel(pixelJson)
      };
      fs.writeFileSync(path.join(routeDir, "route-report.json"), `${JSON.stringify(routeReport, null, 2)}\n`, "utf8");
      report.routes.push(routeReport);
    }
  } finally {
    session.close();
  }

  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(options.outDir, "queued-route-black-scan.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeTextSummary(report, path.join(options.outDir, "SUMMARY.md"));
  console.log(`[dream-skin-forge] queued route black scan complete`);
  console.log(options.outDir);
  for (const route of report.routes) {
    const mainDom = route.domSummary.find((item) => item.targetUrl && !item.targetUrl.includes("avatar-overlay")) || route.domSummary[0] || {};
    const dom = mainDom.summary || {};
    const pixel = route.pixelSummary[0] && route.pixelSummary[0].summary || {};
    console.log(`${route.index}. ${route.label}: clicked=${route.clickResult.clicked} nearBlack=${dom.nearBlackCandidates ?? ""} unmarked=${dom.unmarkedNearBlackShells ?? ""} protected=${dom.protectedNearBlackSurfaces ?? ""} panels=${pixel.panels ?? ""} rows=${pixel.rows ?? ""}`);
  }
}

main().catch((error) => {
  console.error(`[dream-skin-forge][queued-route-black-scan] ${error.message}`);
  process.exit(1);
});
