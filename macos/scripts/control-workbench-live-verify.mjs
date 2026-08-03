#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const CONTROL_ID = "codex-interface-theme-control-workbench";
const DEFAULT_MODES = ["carrier-only", "framework-only", "control-only", "visual"];
const DEFAULT_TOGGLES = ["launchIfMissing", "interact", "allowStatefulControls", "autoAllowlist", "drag"];

function usage() {
  return `Usage:
  control-workbench-live-verify.mjs --port <port> --out-dir <absolute-path>
    [--click-local-controls true|false] [--screenshot true|false]
    [--format text|json]

Verifies the control-only in-window workbench through CDP. By default it is
read-only: it does not click, drag, launch, restart, restore, or run shell
commands. With --click-local-controls true it clicks only buttons and toggles
inside #${CONTROL_ID}; it never clicks native Codex UI outside that panel.`;
}

function parseArgs(argv) {
  const options = {
    clickLocalControls: "false",
    screenshot: "true",
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
    const optionName = key.slice(2).replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
    options[optionName] = value;
    index += 1;
  }
  return options;
}

function requireOption(options, name) {
  const value = options[name];
  if (!value) {
    throw new Error(`missing required option --${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`);
  }
  return value;
}

function boolOption(options, name) {
  const raw = String(options[name]);
  if (raw === "true") {
    return true;
  }
  if (raw === "false") {
    return false;
  }
  throw new Error(`--${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)} must be true or false`);
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
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

async function evaluate(session, expression, timeoutMs = 8000) {
  const result = await session.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
    timeout: timeoutMs
  }, timeoutMs + 1000);
  if (result.exceptionDetails) {
    const description = result.exceptionDetails.exception && result.exceptionDetails.exception.description || result.exceptionDetails.text || "Runtime.evaluate failed";
    throw new Error(description);
  }
  return result.result ? result.result.value : undefined;
}

function inspectExpression() {
  return `(() => {
    const control = document.getElementById(${JSON.stringify(CONTROL_ID)});
    const visible = (node) => {
      if (!node) return false;
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return rect.width > 20 && rect.height > 20 && rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth && style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || "1") > 0.02;
    };
    const rectOf = (node) => {
      if (!node) return null;
      const rect = node.getBoundingClientRect();
      return { left: Math.round(rect.left), top: Math.round(rect.top), right: Math.round(rect.right), bottom: Math.round(rect.bottom), width: Math.round(rect.width), height: Math.round(rect.height) };
    };
    const command = control ? control.querySelector(".cit-control-command") : null;
    const modes = control ? Array.from(control.querySelectorAll("[data-mode]")).map((node) => ({
      mode: node.getAttribute("data-mode"),
      text: String(node.textContent || "").trim(),
      ariaPressed: node.getAttribute("aria-pressed"),
      buttonType: node.tagName.toLowerCase() === "button" ? node.getAttribute("type") || "submit" : "",
      visible: visible(node),
      rect: rectOf(node)
    })) : [];
    const toggles = control ? Array.from(control.querySelectorAll("input[type=checkbox][data-key]")).map((node) => ({
      key: node.getAttribute("data-key"),
      checked: Boolean(node.checked),
      visible: visible(node.closest("label") || node),
      rect: rectOf(node.closest("label") || node)
    })) : [];
    return {
      present: Boolean(control),
      visible: visible(control),
      revision: document.getElementById("codex-interface-theme-marker")?.dataset?.revision || "",
      runtimeMode: document.getElementById("codex-interface-theme-marker")?.dataset?.runtimeMode || "",
      rootRuntimeMode: document.documentElement.getAttribute("data-codex-interface-theme") || "",
      rect: rectOf(control),
      modeButtons: modes,
      toggles,
      commandText: String(command && command.textContent || ""),
      statusText: String(control && control.querySelector(".cit-control-status")?.textContent || "")
    };
  })()`;
}

function clickLocalControlsExpression() {
  return `(() => {
    const control = document.getElementById(${JSON.stringify(CONTROL_ID)});
    if (!control) {
      return { ok: false, error: "missing control workbench" };
    }
    const results = [];
    const commandOf = () => String(control.querySelector(".cit-control-command")?.textContent || "");
    for (const mode of ${JSON.stringify(DEFAULT_MODES)}) {
      const button = control.querySelector('[data-mode="' + mode + '"]');
      if (!button || button.closest("#" + ${JSON.stringify(CONTROL_ID)}) !== control) {
        results.push({ type: "mode", key: mode, ok: false, error: "missing scoped mode button" });
        continue;
      }
      button.click();
      results.push({ type: "mode", key: mode, ok: commandOf().includes("--load-mode " + mode), commandText: commandOf() });
    }
    const toggleExpectations = [
      ["launchIfMissing", "--launch-if-missing true"],
      ["allowStatefulControls", "--allow-stateful-controls true"],
      ["autoAllowlist", "--auto-allowlist true"]
    ];
    for (const pair of toggleExpectations) {
      const input = control.querySelector('input[type="checkbox"][data-key="' + pair[0] + '"]');
      if (!input || input.closest("#" + ${JSON.stringify(CONTROL_ID)}) !== control) {
        results.push({ type: "toggle", key: pair[0], ok: false, error: "missing scoped toggle" });
        continue;
      }
      if (!input.checked) {
        input.click();
      }
      results.push({ type: "toggle", key: pair[0], ok: commandOf().includes(pair[1]), commandText: commandOf() });
      if (input.checked) {
        input.click();
      }
    }
    const carrier = control.querySelector('[data-mode="carrier-only"]');
    if (carrier) {
      carrier.click();
    }
    return { ok: results.every((item) => item.ok), results, finalCommandText: commandOf() };
  })()`;
}

function validateInspection(inspection, clickResult, clickLocalControls) {
  const errors = [];
  const modes = new Set((inspection.modeButtons || []).map((item) => item.mode));
  const toggles = new Set((inspection.toggles || []).map((item) => item.key));
  if (!inspection.present) {
    errors.push("control workbench is missing");
  }
  if (!inspection.visible) {
    errors.push("control workbench is not visible");
  }
  if (inspection.runtimeMode !== "control-only") {
    errors.push(`marker runtime mode must be control-only: ${inspection.runtimeMode || "<missing>"}`);
  }
  if (inspection.rootRuntimeMode !== "control-only") {
    errors.push(`root runtime mode must be control-only: ${inspection.rootRuntimeMode || "<missing>"}`);
  }
  for (const mode of DEFAULT_MODES) {
    if (!modes.has(mode)) {
      errors.push(`missing mode button: ${mode}`);
    }
  }
  for (const toggle of DEFAULT_TOGGLES) {
    if (!toggles.has(toggle)) {
      errors.push(`missing toggle: ${toggle}`);
    }
  }
  if (!String(inspection.commandText || "").includes("macos/scripts/atomic-ui-automation-gate.sh")) {
    errors.push("command text must target atomic-ui-automation-gate.sh");
  }
  if (!String(inspection.commandText || "").includes("--load-mode")) {
    errors.push("command text must include --load-mode");
  }
  if (!String(inspection.statusText || "").includes("plan only; no shell execution from renderer")) {
    errors.push("status text must declare no shell execution");
  }
  if (clickLocalControls && (!clickResult || clickResult.ok !== true)) {
    errors.push("local control click verification failed");
  }
  return errors;
}

async function captureScreenshot(session, filePath) {
  const result = await session.send("Page.captureScreenshot", { format: "png", fromSurface: true }, 12000);
  if (!result || !result.data) {
    throw new Error("Page.captureScreenshot returned no data");
  }
  fs.writeFileSync(filePath, Buffer.from(result.data, "base64"));
}

async function verifyTarget(target, options) {
  const session = new CdpSession(target.webSocketDebuggerUrl);
  await session.open();
  try {
    const warnings = [];
    const before = await evaluate(session, inspectExpression());
    let clickResult = null;
    let after = before;
    if (options.clickLocalControls) {
      clickResult = await evaluate(session, clickLocalControlsExpression());
      after = await evaluate(session, inspectExpression());
    }
    const errors = validateInspection(after, clickResult, options.clickLocalControls);
    if (options.screenshot) {
      try {
        await captureScreenshot(session, path.join(options.outDir, `${target.id || "target"}-control-workbench.png`));
      } catch (error) {
        const message = `control workbench screenshot skipped: ${error && error.message ? error.message : String(error)}`;
        if (String(target.url || "").includes("initialRoute=%2Favatar-overlay")) {
          warnings.push(message);
        } else {
          errors.push(message);
        }
      }
    }
    return {
      id: target.id,
      title: target.title,
      url: target.url,
      ok: errors.length === 0,
      readOnly: !options.clickLocalControls,
      clickLocalControls: options.clickLocalControls,
      before,
      after,
      clickResult,
      warnings,
      errors
    };
  } finally {
    session.close();
  }
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    console.log(usage());
    return;
  }
  const port = String(requireOption(args, "port"));
  if (!/^[0-9]+$/.test(port)) {
    throw new Error(`--port must be numeric: ${port}`);
  }
  const outDirValue = requireOption(args, "outDir");
  if (!path.isAbsolute(outDirValue)) {
    throw new Error(`--out-dir must be absolute: ${outDirValue}`);
  }
  const outDir = path.resolve(outDirValue);
  const clickLocalControls = boolOption(args, "clickLocalControls");
  const screenshot = boolOption(args, "screenshot");
  ensureDir(outDir);

  const allTargets = await fetchJson(`http://127.0.0.1:${port}/json/list`, 2500);
  if (!Array.isArray(allTargets)) {
    throw new Error("CDP /json/list did not return an array");
  }
  const targets = allTargets.filter(isInjectableTarget);
  if (targets.length === 0) {
    throw new Error("no injectable Codex renderer targets found");
  }
  const results = [];
  for (const target of targets) {
    try {
      results.push(await verifyTarget(target, { outDir, clickLocalControls, screenshot }));
    } catch (error) {
      results.push({
        id: target.id,
        title: target.title,
        url: target.url,
        ok: false,
        readOnly: !clickLocalControls,
        clickLocalControls,
        errors: [String(error && error.message || error)]
      });
    }
  }
  const report = {
    ok: results.some((item) => item.ok) && results.every((item) => item.ok),
    mode: "control-workbench-live-verify",
    readOnly: !clickLocalControls,
    clickLocalControls,
    screenshot,
    scanned: results.length,
    results
  };
  fs.writeFileSync(path.join(outDir, "control-workbench-live-verify.json"), `${JSON.stringify(report, null, 2)}\n`);
  if (args.format === "json") {
    console.log(JSON.stringify(report, null, 2));
  } else if (args.format === "text") {
    console.log("[codex-interface-theme] control workbench live verify");
    console.log(`ok=${report.ok}`);
    console.log(`readOnly=${report.readOnly}`);
    console.log(`clickLocalControls=${report.clickLocalControls}`);
    console.log(`scanned=${report.scanned}`);
    for (const result of results) {
      console.log(`- ${result.ok ? "passed" : "blocked"} ${result.id || "<target>"} ${result.title || ""}`);
      for (const error of result.errors || []) {
        console.log(`  error=${error}`);
      }
    }
  } else {
    throw new Error(`unknown format: ${args.format}`);
  }
  if (!report.ok) {
    process.exit(1);
  }
}

try {
  main();
} catch (error) {
  console.error(`[codex-interface-theme][control-workbench-live-verify] ${error.message}`);
  process.exit(1);
}
