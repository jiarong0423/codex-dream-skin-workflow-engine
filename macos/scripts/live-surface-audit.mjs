#!/usr/bin/env node
import fs from "node:fs";

function usage() {
  return `Usage:
  live-surface-audit.mjs --port <port> [--packs <id,id,id>] [--format text|json] [--screenshot-dir <dir>]

Audits the active Codex renderer through CDP. The script may switch the
in-renderer theme-pack selector for measurement, then restores the original
selection. It does not write theme state or modify application files.`;
}

function parseArgs(argv) {
  const options = {
    format: "text",
    packs: ""
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

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function evaluateExpression() {
  return `(() => {
    const alphaOf = (value) => {
      const text = String(value || "");
      if (text === "transparent") return 0;
      const match = text.match(/rgba?\\(([^)]+)\\)/);
      if (!match) return text === "none" ? 0 : 1;
      const parts = match[1].split(",").map((part) => Number.parseFloat(part.trim()));
      return parts.length >= 4 && Number.isFinite(parts[3]) ? parts[3] : 1;
    };
    const visible = (node) => {
      if (!node || node.nodeType !== 1) return false;
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return rect.width > 2 && rect.height > 2 && rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth && style.display !== "none" && style.visibility !== "hidden";
    };
    const textOf = (node) => String(node && (node.innerText || node.textContent || node.getAttribute("aria-label") || "") || "").trim().replace(/\\s+/g, " ");
    const brief = (node) => {
      if (!node) return null;
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      const children = Array.from(node.children || []);
      const paintedChildren = children.filter((child) => visible(child) && alphaOf(getComputedStyle(child).backgroundColor) > 0.05).slice(0, 6).map((child) => {
        const childRect = child.getBoundingClientRect();
        const childStyle = getComputedStyle(child);
        return {
          tag: child.tagName,
          text: textOf(child).slice(0, 48),
          rect: { left: Math.round(childRect.left), top: Math.round(childRect.top), width: Math.round(childRect.width), height: Math.round(childRect.height) },
          bg: childStyle.backgroundColor,
          alpha: alphaOf(childStyle.backgroundColor)
        };
      });
      return {
        tag: node.tagName,
        cls: String(node.className || "").slice(0, 150),
        role: node.getAttribute("role") || "",
        aria: node.getAttribute("aria-label") || "",
        text: textOf(node).slice(0, 90),
        rect: { left: Math.round(rect.left), top: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height) },
        bg: style.backgroundColor,
        bgAlpha: alphaOf(style.backgroundColor),
        bgImage: String(style.backgroundImage || "").slice(0, 170),
        border: style.borderColor,
        radius: style.borderRadius,
        shadow: String(style.boxShadow || "").slice(0, 170),
        opacity: style.opacity,
        paintedChildren
      };
    };
    const isThemeNode = (node) => {
      if (!node) return false;
      return Boolean(node.closest("#codex-interface-theme-right-hud,#codex-interface-theme-character,#codex-interface-theme-badge,#codex-interface-theme-marker"));
    };
    const topOpaque = Array.from(document.querySelectorAll("body *"))
      .filter((node) => visible(node) && !isThemeNode(node))
      .filter((node) => {
        const rect = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        return rect.top < 94 && rect.width > Math.min(900, window.innerWidth * 0.52) && alphaOf(style.backgroundColor) > 0.20;
      })
      .slice(0, 8)
      .map(brief);
    const largeOverlay = Array.from(document.querySelectorAll("main *, body > div:first-child *"))
      .filter((node) => visible(node) && !isThemeNode(node))
      .filter((node) => {
        const rect = node.getBoundingClientRect();
        const style = getComputedStyle(node);
        if (rect.width < window.innerWidth * 0.52 || rect.height < window.innerHeight * 0.34) return false;
        if (node.closest("aside.app-shell-left-panel")) return false;
        return alphaOf(style.backgroundColor) > 0.18 || /rgba\\(0,\\s*216,\\s*224|rgba\\(0,\\s*200,\\s*248|rgba\\(3,\\s*8,\\s*11|rgba\\(3,\\s*12,\\s*15/i.test(style.backgroundImage);
      })
      .slice(0, 10)
      .map(brief);
    const startCardLabels = /探索|打造|檢閱|修正|Explore|Build|Review|Fix/i;
    const startCards = Array.from(document.querySelectorAll("main :is(button,[role='button'],a)"))
      .filter((node) => visible(node) && startCardLabels.test(textOf(node)))
      .slice(0, 8)
      .map(brief);
    const composer = brief(document.querySelector(".codex-interface-theme-composer-surface, .composer-surface-chrome"));
    const sidebarRows = Array.from(document.querySelectorAll("aside.app-shell-left-panel :is(a,button,[role='button'])"))
      .filter((node) => visible(node) && /新聊天|專案|Pull Request|網站|已排程|外掛程式|New|Project|Scheduled|Extensions/i.test(textOf(node)))
      .slice(0, 12)
      .map((node) => {
        const row = node.closest(".sidebar-item") || node.parentElement;
        return {
          target: brief(node),
          row: brief(row),
          nestedPaintedCount: brief(row)?.paintedChildren?.length || 0
        };
      });
    const popover = brief(document.querySelector("[data-radix-popper-content-wrapper] > *"));
    const popoverRows = Array.from(document.querySelectorAll("[data-radix-popper-content-wrapper] :is(button,[role='button'],[role='menuitem'],a,[tabindex])"))
      .filter(visible)
      .slice(0, 12)
      .map(brief);
    const projectPanel = document.querySelector(".codex-interface-theme-project-panel");
    const rightIcons = projectPanel
      ? Array.from(projectPanel.querySelectorAll(":is(button,[role='button'],[role='listitem'],.group\\\\/summary-panel-item) > :is(svg,img):first-child, :is(button,[role='button'],[role='listitem'],.group\\\\/summary-panel-item) > :is(span,div):first-child"))
        .filter(visible)
        .slice(0, 14)
        .map(brief)
      : [];
    const searchShells = Array.from(document.querySelectorAll("div:has(> input[id*='search' i]), div:has(> input[placeholder*='搜尋']), div:has(> input[placeholder*='Search' i])"))
      .filter(visible)
      .slice(0, 10)
      .map(brief);
    return {
      href: location.href,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      activeThemePack: document.documentElement.dataset.citActiveThemePack || "",
      revision: document.querySelector("#codex-interface-theme-marker")?.dataset?.revision || "",
      routeState: {
        projectPanels: document.documentElement.dataset.citProjectPanels || "",
        rightMajorPanel: document.documentElement.dataset.citRightMajorPanel || "",
        hotSwapRetreat: document.documentElement.dataset.citHotSwapRetreat || ""
      },
      header: brief(document.querySelector("header.app-header-tint")),
      topOpaque,
      largeOverlay,
      searchShells,
      startCards,
      composer,
      sidebarRows,
      popover,
      popoverRows,
      rightIcons
    };
  })()`;
}

async function evaluate(session, expression, timeoutMs = 8000) {
  const response = await session.send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true
  }, timeoutMs);
  if (response.exceptionDetails) {
    throw new Error(response.exceptionDetails.text || "Runtime.evaluate failed");
  }
  return response.result ? response.result.value : undefined;
}

async function switchPack(session, packId) {
  const expression = `(() => {
    const select = document.querySelector(".codex-interface-theme-pack-select");
    if (!select) return { ok: false, reason: "missing-select", active: document.documentElement.dataset.citActiveThemePack || "" };
    select.value = ${JSON.stringify(packId)};
    select.dispatchEvent(new Event("input", { bubbles: true }));
    select.dispatchEvent(new Event("change", { bubbles: true }));
    return { ok: true, active: document.documentElement.dataset.citActiveThemePack || "", value: select.value };
  })()`;
  return evaluate(session, expression, 5000);
}

async function pressEscape(session) {
  await session.send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Escape",
    code: "Escape",
    windowsVirtualKeyCode: 27,
    nativeVirtualKeyCode: 53
  }, 3000);
  await session.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Escape",
    code: "Escape",
    windowsVirtualKeyCode: 27,
    nativeVirtualKeyCode: 53
  }, 3000);
}

async function captureScreenshot(session, filePath) {
  const result = await session.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false
  }, 10000);
  if (!result.data) {
    throw new Error("Page.captureScreenshot returned no data");
  }
  const directory = filePath.slice(0, filePath.lastIndexOf("/"));
  if (directory) {
    fs.mkdirSync(directory, { recursive: true });
  }
  fs.writeFileSync(filePath, Buffer.from(result.data, "base64"));
}

function summarizeAudit(audit) {
  const issues = [];
  if ((audit.topOpaque || []).some((item) => item.rect.width >= audit.viewport.width * 0.70 && item.bgAlpha > 0.35 && !/app-shell-left-panel/.test(item.cls))) {
    issues.push("top-opaque-band");
  }
  if ((audit.largeOverlay || []).some((item) => /rgba\(0,\s*216,\s*224|rgba\(0,\s*200,\s*248/i.test(item.bgImage) || item.bgAlpha > 0.34)) {
    issues.push("large-tint-overlay");
  }
  if ((audit.sidebarRows || []).some((row) => row.nestedPaintedCount > 1)) {
    issues.push("sidebar-nested-plates");
  }
  if ((audit.startCards || []).length > 0 && (audit.startCards || []).some((card) => card.bgAlpha < 0.16 || card.bgAlpha > 0.36)) {
    issues.push("start-card-alpha");
  }
  if (audit.composer && (audit.composer.bgAlpha < 0.08 || audit.composer.bgAlpha > 0.22)) {
    issues.push("composer-alpha");
  }
  if ((audit.popoverRows || []).some((row) => row.bgAlpha > 0.30)) {
    issues.push("popover-row-too-opaque");
  }
  return issues.length > 0 ? issues : ["clear"];
}

function printText(report) {
  console.log("[codex-interface-theme] live surface audit");
  console.log(`target=${report.target.title} ${report.target.url}`);
  for (const item of report.audits) {
    const issues = summarizeAudit(item.audit).join(",");
    console.log(`- ${item.pack}: issues=${issues}`);
    console.log(`  route=${item.audit.href} viewport=${item.audit.viewport.width}x${item.audit.viewport.height} revision=${item.audit.revision}`);
    console.log(`  topOpaque=${item.audit.topOpaque.length} largeOverlay=${item.audit.largeOverlay.length} searchShells=${item.audit.searchShells.length} startCards=${item.audit.startCards.length} sidebarRows=${item.audit.sidebarRows.length} popoverRows=${item.audit.popoverRows.length} rightIcons=${item.audit.rightIcons.length}`);
    if (item.audit.header) {
      console.log(`  header bg=${item.audit.header.bg} img=${item.audit.header.bgImage}`);
    }
    if (item.audit.composer) {
      console.log(`  composer bg=${item.audit.composer.bg} alpha=${item.audit.composer.bgAlpha}`);
    }
    const firstOverlay = item.audit.largeOverlay[0];
    if (firstOverlay) {
      console.log(`  firstOverlay ${firstOverlay.tag} ${firstOverlay.rect.width}x${firstOverlay.rect.height} bg=${firstOverlay.bg} img=${firstOverlay.bgImage}`);
    }
    const firstSidebar = item.audit.sidebarRows[0];
    if (firstSidebar) {
      console.log(`  firstSidebar rowBg=${firstSidebar.row?.bg || ""} nestedPainted=${firstSidebar.nestedPaintedCount} text=${firstSidebar.target?.text || ""}`);
    }
    const firstRightIcon = item.audit.rightIcons[0];
    if (firstRightIcon) {
      console.log(`  firstRightIcon ${firstRightIcon.rect.width}x${firstRightIcon.rect.height} bg=${firstRightIcon.bg} radius=${firstRightIcon.radius}`);
    }
    if (item.screenshot) {
      console.log(`  screenshot=${item.screenshot}`);
    }
  }
  console.log(`restored=${report.restoredPack}`);
}

async function main() {
  const options = parseArgs(process.argv);
  if (options.help) {
    console.log(usage());
    return;
  }
  const port = Number(requireOption(options, "port"));
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`invalid --port: ${options.port}`);
  }
  const targets = await fetchJson(`http://127.0.0.1:${port}/json/list`, 2500);
  const target = targets.find(isInjectableTarget);
  if (!target) {
    throw new Error("no injectable Codex renderer target found");
  }
  const session = new CdpSession(target.webSocketDebuggerUrl);
  await session.open();
  try {
    await session.send("Runtime.enable");
    await session.send("Page.enable");
    const originalPack = await evaluate(session, `document.documentElement.dataset.citActiveThemePack || document.querySelector(".codex-interface-theme-pack-select")?.value || ""`);
    const configuredPacks = String(options.packs || "").split(",").map((value) => value.trim()).filter(Boolean);
    const discoveredPacks = await evaluate(session, `Array.from(document.querySelectorAll(".codex-interface-theme-pack-select option")).map((option) => option.value).filter(Boolean)`);
    const packs = configuredPacks.length > 0 ? configuredPacks : discoveredPacks;
    if (!Array.isArray(packs) || packs.length === 0) {
      throw new Error("no theme packs available for audit");
    }
    const audits = [];
    for (const pack of packs) {
      await pressEscape(session);
      const switchResult = await switchPack(session, pack);
      await sleep(450);
      await pressEscape(session);
      await sleep(120);
      const audit = await evaluate(session, evaluateExpression(), 10000);
      const entry = { pack, switchResult, audit };
      if (options["screenshot-dir"]) {
        const safePack = pack.replace(/[^a-z0-9-]+/gi, "-");
        const screenshotDir = String(options["screenshot-dir"]).replace(/\/$/, "");
        const filePath = `${screenshotDir}/live-surface-${safePack}.png`;
        await captureScreenshot(session, filePath);
        entry.screenshot = filePath;
      }
      audits.push(entry);
    }
    if (originalPack) {
      await switchPack(session, originalPack);
      await sleep(250);
    }
    const report = {
      ok: true,
      target: {
        id: target.id,
        title: target.title || "",
        url: target.url || ""
      },
      originalPack,
      restoredPack: originalPack || "",
      audits
    };
    if (options.format === "json") {
      console.log(JSON.stringify(report, null, 2));
    } else {
      printText(report);
    }
  } finally {
    session.close();
  }
}

main().catch((error) => {
  console.error(`[codex-interface-theme][error] ${error.message}`);
  process.exit(1);
});
