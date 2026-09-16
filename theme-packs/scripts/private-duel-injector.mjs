#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const THEME_PACK_ROOT = path.resolve(SCRIPT_DIR, "..");
const PROJECT_ROOT = path.resolve(THEME_PACK_ROOT, "..");
const PRIVATE_ROOT = path.join(THEME_PACK_ROOT, "private-packs");
const PACK_ID_RE = /^[a-z0-9][a-z0-9-]{1,80}$/;
const DEFAULT_PORT = 9341;
const DEFAULT_WAIT_MS = 8000;
const DEFAULT_PACK_ID = "anime-chainsaw-train-duel";
const ROOT_ID = "codex-interface-theme-private-duel-scene";
const MATERIAL_LAYER_ID = "codex-interface-theme-private-duel-material";
const ACTOR_LAYER_ID = "codex-interface-theme-private-duel-actors";
const EFFECT_LAYER_ID = "codex-interface-theme-private-duel-effect-detection";
const STYLE_ID = "codex-interface-theme-private-duel-style";
const CANVAS_ID = "codex-interface-theme-private-duel-sparks";
const STATUS_ID = "codex-interface-theme-private-duel-status-mascot";
const STATE_KEY = "__codexInterfaceThemePrivateDuel";
const FORMAL_ART_CLOAK_STYLE_ID = "codex-interface-theme-private-duel-formal-art-cloak";
const BLACK_SHELL_STYLE_ID = "codex-interface-theme-private-duel-black-shell-style";

function usage() {
  return [
    "Usage:",
    "  private-duel-injector.mjs --pack anime-chainsaw-train-duel --port 9341 --once",
    "  private-duel-injector.mjs --pack anime-chainsaw-train-duel --port 9341 --remove",
    "  private-duel-injector.mjs --pack anime-chainsaw-train-duel --dry-run [--format text|json]",
    "",
    "Notes:",
    "  Private-local-only injector.",
    "  Does not launch, restart, click, drag, or write the formal animal pack.",
    "  Loads selected runtime assets only and keeps the injected background translucent."
  ].join("\n");
}

function parseArgs(argv) {
  const options = {
    pack: DEFAULT_PACK_ID,
    port: String(DEFAULT_PORT),
    "wait-ms": String(DEFAULT_WAIT_MS),
    format: "text"
  };
  for (let index = 2; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith("--")) {
      throw new Error(`unexpected argument: ${key}`);
    }
    const name = key.slice(2);
    if (["once", "remove", "dry-run", "help"].includes(name)) {
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

function resolvePackDir(packId) {
  if (!PACK_ID_RE.test(packId)) {
    throw new Error("--pack must use lowercase letters, numbers, and hyphens");
  }
  const packDir = ensureInside(PRIVATE_ROOT, path.join(PRIVATE_ROOT, packId), "private pack directory");
  const stat = fs.lstatSync(packDir);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error(`private pack directory is invalid: ${packDir}`);
  }
  return packDir;
}

function inferMime(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".png") {
    return "image/png";
  }
  if (extension === ".jpg" || extension === ".jpeg") {
    return "image/jpeg";
  }
  if (extension === ".webp") {
    return "image/webp";
  }
  throw new Error(`unsupported image extension: ${extension}`);
}

function readImageDataUrl(filePath, label, maxBytes) {
  const bytes = assertPlainFile(filePath, label);
  if (bytes <= 0 || bytes > maxBytes) {
    throw new Error(`${label} byte size is outside policy: ${bytes}`);
  }
  const buffer = fs.readFileSync(filePath);
  return {
    bytes,
    mime: inferMime(filePath),
    dataUrl: `data:${inferMime(filePath)};base64,${buffer.toString("base64")}`
  };
}

function resolveProjectPath(projectPath, label) {
  const value = String(projectPath || "").trim();
  if (!value || path.isAbsolute(value) || value.includes("\0")) {
    throw new Error(`${label} must be a project-relative path`);
  }
  if (value.split(/[\\/]+/).includes("..")) {
    throw new Error(`${label} must not traverse parent directories`);
  }
  return ensureInside(PROJECT_ROOT, path.join(PROJECT_ROOT, value), label);
}

function scopedSurfaceRegistrySource(source) {
  const formalArtSelector = "#codex-interface-theme-backdrop,#codex-interface-theme-right-hud,#codex-interface-theme-character,#codex-interface-theme-badge,#codex-interface-theme-marker";
  const formalProtectedAncestorSelector = ".composer-surface-chrome,.codex-interface-theme-composer-surface,aside.app-shell-left-panel";
  const privateProtectedAncestorSelector = ".composer-surface-chrome,.codex-interface-theme-composer-surface,.codex-interface-theme-composer-dock,.codex-interface-theme-composer-native-floor,[class*=\"ComposerLayoutRoot\"],aside.app-shell-left-panel,.codex-interface-theme-project-panel,.codex-interface-theme-project-panel-frame";
  const privateArtSelector = [
    formalArtSelector,
    `#${ROOT_ID}`,
    `#${MATERIAL_LAYER_ID}`,
    `#${ACTOR_LAYER_ID}`,
    `#${EFFECT_LAYER_ID}`,
    `#${CANVAS_ID}`,
    `#${STATUS_ID}`
  ].join(",");
  if (!String(source || "").includes(formalArtSelector)) {
    throw new Error("surface registry art exclusion selector changed");
  }
  if (!String(source || "").includes(formalProtectedAncestorSelector)) {
    throw new Error("surface registry protected composer selector changed");
  }
  return String(source)
    .replaceAll(formalArtSelector, privateArtSelector)
    .replaceAll(formalProtectedAncestorSelector, privateProtectedAncestorSelector);
}

function loadPrivatePayload(packId) {
  const packDir = resolvePackDir(packId);
  const bridgePath = path.join(packDir, "runtime", "private-loader", "private-apply-bridge.json");
  const runtimePath = path.join(packDir, "runtime", "private-loader", "private-runtime.json");
  const bridge = readJson(bridgePath);
  const runtime = readJson(runtimePath);

  if (bridge.kind !== "dream-skin-private-apply-bridge") {
    throw new Error("private apply bridge kind mismatch");
  }
  if (runtime.kind !== "dream-skin-private-runtime-plan") {
    throw new Error("private runtime kind mismatch");
  }
  for (const source of [bridge, runtime]) {
    if (source.id !== packId) {
      throw new Error(`private pack id mismatch: ${source.id}`);
    }
    if (source.visibility !== "private-local-only") {
      throw new Error(`private pack visibility mismatch: ${source.visibility}`);
    }
    if (source.formalActivation !== false) {
      throw new Error("private pack must keep formalActivation=false");
    }
    if (source.writesFormalActiveTheme !== false || source.writesCodexProcess !== false || source.startsOrRestartsCodex !== false) {
      throw new Error("private pack bridge/runtime must not write formal theme, process, launch, or restart Codex");
    }
  }
  if (bridge.rendererContract?.bodyMountId !== ROOT_ID || bridge.rendererContract?.canvasId !== CANVAS_ID) {
    throw new Error("private renderer contract does not match injector ids");
  }

  const backgroundPath = resolveProjectPath(runtime.runtimeAssets.background.projectPath, "background");
  const upperActorPath = resolveProjectPath(runtime.runtimeAssets.upperActor.projectPath, "upper actor");
  const lowerActorPath = resolveProjectPath(runtime.runtimeAssets.lowerActor.projectPath, "lower actor");
  const statusMascotPath = path.join(packDir, "runtime", "icons", "chibi-saw-3d-v1-160.png");
  const surfaceRegistrySource = scopedSurfaceRegistrySource(fs.readFileSync(path.join(PROJECT_ROOT, "macos", "assets", "surface-registry.js"), "utf8"));
  const blackShellCss = fs.readFileSync(path.join(PROJECT_ROOT, "macos", "assets", "theme-modules", "black-shell-transparency.css"), "utf8");
  const composerShellCss = fs.readFileSync(path.join(PROJECT_ROOT, "macos", "assets", "theme-modules", "composer-shell.css"), "utf8");
  const workspaceGlassCss = fs.readFileSync(path.join(PROJECT_ROOT, "macos", "assets", "theme-modules", "workspace-glass.css"), "utf8");

  const background = readImageDataUrl(backgroundPath, "background", 500000);
  const upperActor = readImageDataUrl(upperActorPath, "upper actor", 180000);
  const lowerActor = readImageDataUrl(lowerActorPath, "lower actor", 180000);
  const statusMascot = readImageDataUrl(statusMascotPath, "status mascot", 60000);
  const selectedRuntimePayloadBytes = background.bytes + upperActor.bytes + lowerActor.bytes + statusMascot.bytes;

  return {
    packId,
    displayName: runtime.displayName,
    revision: [runtime.runtimeAssets.background.sha256, runtime.runtimeAssets.upperActor.sha256, runtime.runtimeAssets.lowerActor.sha256]
      .join(":")
      .slice(0, 40),
    selectedRuntimePayloadBytes,
    targetRuntimePayloadBytes: runtime.budget.targetRuntimePayloadBytes,
    interaction: {
      maxAutoTriggers: Number(runtime.interaction.maxAutoTriggers || 2),
      cooldownMs: Number(runtime.interaction.cooldownMs || 1200)
    },
    assets: {
      background: background.dataUrl,
      upperActor: upperActor.dataUrl,
      lowerActor: lowerActor.dataUrl,
      statusMascot: statusMascot.dataUrl
    },
    modules: {
      surfaceRegistrySource,
      blackShellCss,
      composerShellCss,
      workspaceGlassCss
    },
    policy: {
      transparentInjection: true,
      formalActivation: false,
      rightSideAccessory: false,
      manualFallbackButton: false,
      pointerEvents: "none"
    }
  };
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

async function waitForTargets(port, waitMs) {
  const deadline = Date.now() + waitMs;
  let lastError = null;
  while (Date.now() <= deadline) {
    try {
      const targets = await fetchJson(`http://127.0.0.1:${port}/json/list`, 1500);
      if (!Array.isArray(targets)) {
        throw new Error("CDP /json/list did not return an array");
      }
      const injectable = targets.filter(isInjectableTarget);
      if (injectable.length > 0) {
        return injectable;
      }
      lastError = new Error(`found ${targets.length} target(s), none injectable`);
    } catch (error) {
      lastError = error;
    }
    await sleep(300);
  }
  throw new Error(`no injectable Codex app target on 127.0.0.1:${port}: ${lastError ? lastError.message : "timeout"}`);
}

function isInjectableTarget(target) {
  if (!target || target.type !== "page" || !target.webSocketDebuggerUrl) {
    return false;
  }
  const url = String(target.url || "");
  return url.startsWith("app://-/index.html");
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

function privateDuelRuntime(payload, mode) {
  const data = JSON.stringify(payload);
  const selectedMode = JSON.stringify(mode);
  return `(() => {
    const payload = ${data};
    const mode = ${selectedMode};
    const ROOT_ID = ${JSON.stringify(ROOT_ID)};
    const MATERIAL_LAYER_ID = ${JSON.stringify(MATERIAL_LAYER_ID)};
    const ACTOR_LAYER_ID = ${JSON.stringify(ACTOR_LAYER_ID)};
    const EFFECT_LAYER_ID = ${JSON.stringify(EFFECT_LAYER_ID)};
    const STYLE_ID = ${JSON.stringify(STYLE_ID)};
    const CANVAS_ID = ${JSON.stringify(CANVAS_ID)};
    const STATUS_ID = ${JSON.stringify(STATUS_ID)};
    const STATE_KEY = ${JSON.stringify(STATE_KEY)};
    const FORMAL_ART_CLOAK_STYLE_ID = ${JSON.stringify(FORMAL_ART_CLOAK_STYLE_ID)};
    const BLACK_SHELL_STYLE_ID = ${JSON.stringify(BLACK_SHELL_STYLE_ID)};
    const FORMAL_ART_SELECTOR = [
      "#codex-interface-theme-backdrop",
      "#codex-interface-theme-character",
      "#codex-interface-theme-badge",
      "#codex-interface-theme-marker",
      "#codex-interface-theme-right-hud",
      ".codex-interface-theme-pack-bay",
      ".codex-interface-theme-pack-switcher"
    ].join(",");
    const BODY_ART_PROPERTIES = [
      "background",
      "background-image",
      "background-size",
      "background-position",
      "background-repeat",
      "background-attachment"
    ];
    const FORMAL_THEME_HTML_ATTRIBUTES = [
      "data-codex-interface-theme",
      "data-cit-has-image",
      "data-cit-bg-mode",
      "data-cit-task-mode",
      "data-cit-safe-area",
      "data-cit-character",
      "data-cit-icon-badge",
      "data-cit-table-flip-cat-mode",
      "data-cit-hot-swap",
      "data-cit-corner-armor"
    ];
    function restoreFormalThemeArt(state) {
      const html = document.documentElement;
      if (html && html.dataset) {
        delete html.dataset.citPrivateChainsawOnly;
      }
      if (state && state.htmlAttributeSnapshot && html) {
        for (const [attributeName, value] of Object.entries(state.htmlAttributeSnapshot)) {
          if (value === null) {
            html.removeAttribute(attributeName);
          } else {
            html.setAttribute(attributeName, value);
          }
        }
      }
      document.getElementById(FORMAL_ART_CLOAK_STYLE_ID)?.remove();
      document.getElementById(BLACK_SHELL_STYLE_ID)?.remove();
      if (state && state.installedSurfaceRegistry && window.__CODEX_INTERFACE_THEME_SURFACE_REGISTRY__ && typeof window.__CODEX_INTERFACE_THEME_SURFACE_REGISTRY__.cleanup === "function") {
        try {
          window.__CODEX_INTERFACE_THEME_SURFACE_REGISTRY__.cleanup();
        } catch {
        }
      }
      if (state && state.bodyArtSnapshot && document.body) {
        for (const [propertyName, entry] of Object.entries(state.bodyArtSnapshot)) {
          if (entry && entry.value) {
            document.body.style.setProperty(propertyName, entry.value, entry.priority || "");
          } else {
            document.body.style.removeProperty(propertyName);
          }
        }
        delete document.body.dataset.citPrivateChainsawBodyCleared;
      }
    }

    function removeExisting() {
      const state = window[STATE_KEY];
      if (state && Array.isArray(state.timers)) {
        for (const timer of state.timers) {
          clearTimeout(timer);
          clearInterval(timer);
          cancelAnimationFrame(timer);
        }
      }
      if (state && typeof state.onResize === "function") {
        window.removeEventListener("resize", state.onResize);
      }
      if (state && typeof state.cleanupRetreat === "function") {
        state.cleanupRetreat();
      }
      restoreFormalThemeArt(state);
      document.getElementById(ROOT_ID)?.remove();
      document.getElementById(MATERIAL_LAYER_ID)?.remove();
      document.getElementById("codex-interface-theme-private-duel-frame")?.remove();
      document.getElementById(ACTOR_LAYER_ID)?.remove();
      document.getElementById(EFFECT_LAYER_ID)?.remove();
      document.getElementById(CANVAS_ID)?.remove();
      document.getElementById(STATUS_ID)?.remove();
      document.getElementById(STYLE_ID)?.remove();
      delete window[STATE_KEY];
    }

    if (mode === "remove") {
      removeExisting();
      return { ok: true, mode, removed: true };
    }

    removeExisting();

    const bodyArtSnapshot = {};
    if (document.body) {
      for (const propertyName of BODY_ART_PROPERTIES) {
        bodyArtSnapshot[propertyName] = {
          value: document.body.style.getPropertyValue(propertyName),
          priority: document.body.style.getPropertyPriority(propertyName)
        };
      }
    }
    const htmlAttributeSnapshot = {};
    for (const attributeName of FORMAL_THEME_HTML_ATTRIBUTES) {
      htmlAttributeSnapshot[attributeName] = document.documentElement.getAttribute(attributeName);
    }

    function installFormalThemeArtCloak() {
      document.documentElement.dataset.citPrivateChainsawOnly = "true";
      let cloak = document.getElementById(FORMAL_ART_CLOAK_STYLE_ID);
      if (!cloak) {
        cloak = document.createElement("style");
        cloak.id = FORMAL_ART_CLOAK_STYLE_ID;
        document.head.appendChild(cloak);
      }
      cloak.textContent = \`
        html[data-cit-private-chainsaw-only="true"] :is(\${FORMAL_ART_SELECTOR}) {
          display: none !important;
          visibility: hidden !important;
          opacity: 0 !important;
          pointer-events: none !important;
          background-image: none !important;
        }
        html[data-cit-private-chainsaw-only="true"] body {
          background: none !important;
          background-image: none !important;
        }
        html[data-cit-private-chainsaw-only="true"] body::before,
        html[data-cit-private-chainsaw-only="true"] body::after,
        html[data-cit-private-chainsaw-only="true"] aside.app-shell-left-panel::before,
        html[data-cit-private-chainsaw-only="true"] aside.app-shell-left-panel::after,
        html[data-cit-private-chainsaw-only="true"] .codex-interface-theme-project-panel::before,
        html[data-cit-private-chainsaw-only="true"] .codex-interface-theme-project-panel::after,
        html[data-cit-private-chainsaw-only="true"] .codex-interface-theme-project-panel-frame::before,
        html[data-cit-private-chainsaw-only="true"] .codex-interface-theme-project-panel-frame::after {
          content: none !important;
          display: none !important;
          visibility: hidden !important;
          opacity: 0 !important;
          animation: none !important;
          transition: none !important;
          background: none !important;
          background-image: none !important;
          box-shadow: none !important;
          filter: none !important;
        }
      \`;
    }

    function suspendFormalThemeAttributes() {
      for (const attributeName of FORMAL_THEME_HTML_ATTRIBUTES) {
        document.documentElement.removeAttribute(attributeName);
      }
      document.documentElement.dataset.citPrivateChainsawOnly = "true";
    }

    function clearFormalBodyArt() {
      if (!document.body) {
        return;
      }
      for (const propertyName of BODY_ART_PROPERTIES) {
        document.body.style.setProperty(propertyName, propertyName === "background-image" || propertyName === "background" ? "none" : "", "important");
      }
      document.body.dataset.citPrivateChainsawBodyCleared = "true";
    }

    function enforceChainsawOnlyVisuals() {
      suspendFormalThemeAttributes();
      installFormalThemeArtCloak();
      clearFormalBodyArt();
      document.querySelectorAll(FORMAL_ART_SELECTOR).forEach((node) => {
        if (!(node instanceof HTMLElement)) {
          return;
        }
        node.style.setProperty("display", "none", "important");
        node.style.setProperty("visibility", "hidden", "important");
        node.style.setProperty("opacity", "0", "important");
        node.style.setProperty("pointer-events", "none", "important");
      });
    }

    enforceChainsawOnlyVisuals();

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = \`
      #\${ROOT_ID} {
        position: fixed;
        inset: 0;
        z-index: 0;
        overflow: hidden;
        pointer-events: none;
        contain: layout paint style;
        isolation: isolate;
      }
      #\${MATERIAL_LAYER_ID} {
        position: fixed;
        inset: 0;
        z-index: 1;
        overflow: hidden;
        pointer-events: none;
        contain: layout paint style;
        isolation: isolate;
      }
      #\${ACTOR_LAYER_ID} {
        position: fixed;
        inset: 0;
        z-index: 2147482998;
        overflow: hidden;
        pointer-events: none;
        contain: layout paint style;
        isolation: isolate;
      }
      #\${EFFECT_LAYER_ID} {
        position: fixed;
        inset: 0;
        z-index: 2147482999;
        overflow: hidden;
        pointer-events: none;
        contain: layout paint style;
        isolation: isolate;
      }
      #\${ROOT_ID} .private-duel-bg-band {
        position: absolute;
        inset: 0;
        z-index: 0;
        width: 100vw;
        height: 100vh;
        background-image:
          linear-gradient(90deg, rgba(0, 230, 255, 0.14), rgba(0, 0, 0, 0.1) 48%, rgba(255, 54, 90, 0.22)),
          linear-gradient(180deg, rgba(0, 0, 0, 0.12), rgba(0, 0, 0, 0.32)),
          url("\${payload.assets.background}");
        background-repeat: no-repeat, no-repeat, no-repeat;
        background-size: auto, auto, cover;
        background-position: center, center, center center;
        opacity: 0.98;
        filter: saturate(1.08) contrast(1.04) brightness(1);
      }
      #\${ROOT_ID} .private-duel-bg-band::after {
        content: "";
        position: absolute;
        inset: 0;
        background:
          linear-gradient(90deg, rgba(0, 0, 0, 0.04), transparent 38%, rgba(0, 0, 0, 0.06)),
          radial-gradient(circle at 29% 58%, rgba(0, 255, 255, 0.08), transparent 34%),
          radial-gradient(circle at 86% 28%, rgba(255, 80, 40, 0.10), transparent 28%);
      }
      #\${MATERIAL_LAYER_ID} .private-duel-material-pane {
        position: absolute;
        inset: 0;
        width: 100vw;
        height: 100vh;
        background: none;
        box-shadow: none;
        opacity: 0;
      }
      body,
      main,
      [role="main"],
      .thread-scroll-container,
      .relative.flex.h-full,
      .composer-surface-chrome {
        background-color: transparent !important;
        background-image: none !important;
      }
      html[data-cit-private-chainsaw-only="true"] main :is([class*="bg-token-main-surface-primary"], [class*="bg-token-main-surface-secondary"]):not(button):not([role="button"]):not(input):not(textarea):not(pre):not(code):not([role="dialog"]):not([role="menu"]):not([role="listbox"]),
      html[data-cit-private-chainsaw-only="true"] main [class*="_MainContentTopFade"] {
        background-color: transparent !important;
        background-image: none !important;
        box-shadow: none !important;
      }
      html[data-cit-private-chainsaw-only="true"] main :is([class*="sticky"][class*="z-"], [class*="sticky"][class*="bg-token-main-surface"]) {
        background:
          linear-gradient(180deg, rgba(255, 255, 255, 0.050), rgba(255, 255, 255, 0.014) 34%, rgba(0, 0, 0, 0)),
          rgba(5, 10, 13, 0.08) !important;
        background-color: rgba(5, 10, 13, 0.08) !important;
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.035) !important;
        transition: none !important;
      }
      html[data-cit-private-chainsaw-only="true"] main [class*="sticky"]::after {
        background:
          linear-gradient(180deg, rgba(5, 10, 13, 0.08), rgba(5, 10, 13, 0)) !important;
        transition: none !important;
      }
      html[data-cit-private-chainsaw-only="true"] .thread-scroll-container .sticky.bottom-0:has([class*="ComposerLayoutRoot"]),
      html[data-cit-private-chainsaw-only="true"] .thread-scroll-container .sticky.bottom-0:has(.codex-interface-theme-composer-surface),
      html[data-cit-private-chainsaw-only="true"] .thread-scroll-container .sticky.bottom-0[class*="mt-auto"][class*="shrink-0"] {
        background: none !important;
        background-color: transparent !important;
        background-image: none !important;
        box-shadow: none !important;
        -webkit-backdrop-filter: none !important;
        backdrop-filter: none !important;
      }
      html[data-cit-private-chainsaw-only="true"] .thread-scroll-container .sticky.bottom-0[class*="mt-auto"][class*="shrink-0"]::before,
      html[data-cit-private-chainsaw-only="true"] .thread-scroll-container .sticky.bottom-0[class*="mt-auto"][class*="shrink-0"]::after,
      html[data-cit-private-chainsaw-only="true"] .thread-scroll-container .sticky.bottom-0:has([class*="ComposerLayoutRoot"])::before,
      html[data-cit-private-chainsaw-only="true"] .thread-scroll-container .sticky.bottom-0:has([class*="ComposerLayoutRoot"])::after,
      html[data-cit-private-chainsaw-only="true"] .thread-scroll-container .sticky.bottom-0:has(.codex-interface-theme-composer-surface)::before,
      html[data-cit-private-chainsaw-only="true"] .thread-scroll-container .sticky.bottom-0:has(.codex-interface-theme-composer-surface)::after {
        content: none !important;
        display: none !important;
        background: none !important;
        background-color: transparent !important;
        background-image: none !important;
        opacity: 0 !important;
        box-shadow: none !important;
      }
      html[data-cit-private-chainsaw-only="true"] main :is([class*="bg-token-input-background"], [class*="bg-token-dropdown-background"]):not([role="dialog"]):not([role="menu"]):not([role="listbox"]):not(.codex-interface-theme-workspace-picker):not([data-cit-workspace-picker="shell"]):not([class*="ComposerTopMenuShell"] *):not([class*="ComposerTopMenuShell"] > *) {
        background-color: rgba(5, 10, 13, 0.16) !important;
        background-image: none !important;
        border-color: rgba(130, 230, 246, 0.38) !important;
        box-shadow:
          inset 0 0 0 1px rgba(130, 230, 246, 0.30),
          0 0 0 1px rgba(255, 179, 83, 0.12) !important;
        transition: none !important;
      }
      html[data-cit-private-chainsaw-only="true"] main:has(input:is([placeholder*="搜尋"], [placeholder*="Search"])) .flex.h-full.min-h-0.flex-col.bg-surface {
        background: rgba(22, 45, 58, 0.16) !important;
        background-color: rgba(22, 45, 58, 0.16) !important;
        background-image: none !important;
        box-shadow: none !important;
      }
      html[data-cit-private-chainsaw-only="true"] main:has(input:is([placeholder*="搜尋"], [placeholder*="Search"])) :is([class*="bg-token-input-background"][class*="rounded-full"], [class*="bg-background-primary-soft"][class*="rounded-full"], [data-project-row-wrapper], [data-project-row], [role="listitem"], [class*="group/plugin-row"], [role="button"][class*="rounded-2xl"]) {
        background-color: rgba(22, 45, 58, 0.20) !important;
        background-image: none !important;
        border-color: rgba(255, 255, 255, 0.060) !important;
        outline: 0 !important;
        box-shadow: none !important;
      }
      html[data-cit-private-chainsaw-only="true"] main:has(input:is([placeholder*="搜尋"], [placeholder*="Search"])) :is([class*="border-token-border"], [class*="border-token-border-light"], [class*="border-b"], [class*="border-t"]) {
        border-color: transparent !important;
        box-shadow: none !important;
      }
      html[data-cit-private-chainsaw-only="true"] main:has(input:is([placeholder*="搜尋"], [placeholder*="Search"])) [class*="before:absolute"][class*="before:-inset-x-3"]::after {
        content: none !important;
        display: none !important;
        background: none !important;
        background-image: none !important;
      }
      html[data-cit-private-chainsaw-only="true"] main :is(
        [class*="bg-token-dropdown-background/50"][class*="rounded-lg"],
        [class*="bg-token-dropdown-background"][class*="rounded-lg"][class*="overflow-hidden"],
        [class*="bg-token-main-surface-primary/70"][class*="cursor-interaction"]
      ):not(.group.flex.w-full.flex-col.items-end > [class*="bg-token-foreground/5"]) {
        background-color: rgba(5, 10, 13, 0.080) !important;
        background-image: none !important;
        border-color: transparent !important;
        outline: 0 !important;
        box-shadow: none !important;
        transition: none !important;
      }
      html[data-cit-private-chainsaw-only="true"] main :is(
        [class*="border-token-border"],
        [class*="border-t"],
        [class*="border-b"]
      ):has([class*="codex-diffs"], [class*="thread-resource-card-row-padding-x"]) {
        border-color: rgba(255, 255, 255, 0.060) !important;
        box-shadow: none !important;
      }
      html[data-cit-private-chainsaw-only="true"] [data-cit-private-top-action="true"] {
        background: transparent !important;
        background-color: transparent !important;
        background-image: none !important;
        border-color: transparent !important;
        outline: 0 !important;
        box-shadow: none !important;
        color: rgba(236, 255, 255, 0.94) !important;
        text-shadow:
          0 0 12px rgba(126, 231, 246, 0.46),
          0 1px 8px rgba(0, 0, 0, 0.42) !important;
        transition: none !important;
      }
      html[data-cit-private-chainsaw-only="true"] [data-cit-private-top-action="true"] :is(svg, path) {
        color: rgba(236, 255, 255, 0.94) !important;
        stroke: currentColor !important;
        filter: drop-shadow(0 0 7px rgba(126, 231, 246, 0.42)) !important;
      }
      html[data-cit-private-chainsaw-only="true"] [data-cit-private-top-action="true"]:is(:hover, :focus-visible, [data-state="open"], [aria-expanded="true"]) {
        background: rgba(126, 231, 246, 0.075) !important;
        border-color: transparent !important;
        box-shadow:
          inset 0 -1px 0 rgba(126, 231, 246, 0.42),
          0 0 18px rgba(126, 231, 246, 0.10) !important;
      }
      html[data-cit-private-chainsaw-only="true"] :is(
        [role="dialog"],
        [role="menu"],
        [role="listbox"],
        [cmdk-root],
        [data-radix-popper-content-wrapper] > *
      ) {
        border-color: transparent !important;
        outline: 0 !important;
        box-shadow:
          inset 0 1px 0 rgba(255, 255, 255, 0.075),
          inset 0 0 0 1px rgba(126, 231, 246, 0.045) !important;
        background: rgba(22, 45, 58, 0.52) !important;
        backdrop-filter: blur(18px) saturate(1.16) brightness(1.02) !important;
        -webkit-backdrop-filter: blur(18px) saturate(1.16) brightness(1.02) !important;
      }
      html[data-cit-private-chainsaw-only="true"] [role="tooltip"] {
        background:
          linear-gradient(90deg, rgba(2, 8, 11, 0.78), rgba(7, 17, 22, 0.58)) !important;
        background-color: rgba(3, 10, 13, 0.70) !important;
        border-color: transparent !important;
        outline: 0 !important;
        box-shadow: none !important;
        color: rgba(222, 247, 250, 0.90) !important;
        text-shadow: 0 1px 8px rgba(0, 0, 0, 0.48) !important;
        backdrop-filter: blur(10px) saturate(1.08) !important;
        -webkit-backdrop-filter: blur(10px) saturate(1.08) !important;
      }
      html[data-cit-private-chainsaw-only="true"] [class*="ComposerTopMenuShell"] > [class*="bg-token-dropdown-background"],
      html[data-cit-private-chainsaw-only="true"] [class*="ComposerTopMenuShell"] > [class*="bg-surface-elevated-secondary"] {
        background: rgba(22, 45, 58, 0.52) !important;
        background-color: rgba(22, 45, 58, 0.52) !important;
        border-color: rgba(126, 231, 246, 0.26) !important;
        outline: 0 !important;
        box-shadow:
          inset 0 1px 0 rgba(255, 255, 255, 0.075),
          inset 0 0 0 1px rgba(126, 231, 246, 0.045) !important;
        backdrop-filter: blur(18px) saturate(1.16) brightness(1.02) !important;
        -webkit-backdrop-filter: blur(18px) saturate(1.16) brightness(1.02) !important;
      }
      html[data-cit-private-chainsaw-only="true"] [class*="ComposerTopMenuShell"] :is(
        [class*="bg-token-dropdown-background"],
        [class*="bg-surface-elevated-secondary"],
        [class*="bg-token-input-background"],
        [class*="border-token-border"],
        [class*="focus-visible:ring"],
        [class*="ring-token-focus-border"]
      ) {
        --tw-ring-color: transparent !important;
        --tw-ring-shadow: 0 0 transparent !important;
        --tw-ring-offset-shadow: 0 0 transparent !important;
        border-color: transparent !important;
        border-width: 0 !important;
        outline: 0 !important;
        box-shadow: none !important;
      }
      html[data-cit-private-chainsaw-only="true"] [class*="ComposerTopMenuShell"] .sticky {
        background: none !important;
        background-color: transparent !important;
        background-image: none !important;
        border: 0 !important;
        outline: 0 !important;
        box-shadow: none !important;
        color: rgba(213, 241, 244, 0.82) !important;
        text-shadow: 0 1px 8px rgba(0, 0, 0, 0.55) !important;
      }
      html[data-cit-private-chainsaw-only="true"] main [class*="ComposerTopMenuShell"] [class*="sticky"][class*="bg-token-dropdown-background"],
      html[data-cit-private-chainsaw-only="true"] main [class*="ComposerTopMenuShell"] [class*="sticky"][class*="bg-surface-elevated-secondary"] {
        border: 0 !important;
        outline: 0 !important;
        box-shadow: none !important;
      }
      html[data-cit-private-chainsaw-only="true"] [class*="ComposerTopMenuShell"] :is(
        [role="option"],
        [role="menuitem"],
        [role="button"],
        button,
        a
      ):is(:hover, :focus-visible, [aria-selected="true"], [data-selected="true"], [data-highlighted], [data-state="checked"]) {
        background: transparent !important;
        background-color: transparent !important;
        background-image: none !important;
        border-color: transparent !important;
        outline: 0 !important;
        box-shadow: none !important;
        border-radius: 12px !important;
      }
      html[data-cit-private-chainsaw-only="true"] :is(
        [role="dialog"],
        [role="menu"],
        [role="listbox"],
        [cmdk-root],
        [data-radix-popper-content-wrapper] > *
      ) :is([class*="bg-token-input-background"], [class*="bg-token-dropdown-background"], [class*="border-token-border"]) {
        background:
          linear-gradient(90deg, rgba(2, 8, 11, 0.72), rgba(7, 17, 22, 0.52)) !important;
        background-color: rgba(3, 10, 13, 0.64) !important;
        border-color: transparent !important;
        outline: 0 !important;
        box-shadow:
          inset 0 1px 0 rgba(255, 255, 255, 0.026),
          inset 0 -1px 0 rgba(0, 0, 0, 0.48) !important;
      }
      html[data-cit-private-chainsaw-only="true"] :is(
        [role="dialog"],
        [role="menu"],
        [role="listbox"],
        [cmdk-root],
        [data-radix-popper-content-wrapper] > *
      ) :is(input, textarea, [contenteditable="true"], [role="textbox"], [cmdk-input]) {
        background: rgba(2, 8, 11, 0.58) !important;
        border: 0 !important;
        outline: 0 !important;
        box-shadow: none !important;
        border-radius: 14px !important;
        color: rgb(253, 253, 253) !important;
      }
      html[data-cit-private-chainsaw-only="true"] :is(
        [role="dialog"],
        [role="menu"],
        [role="listbox"],
        [cmdk-root],
        [data-radix-popper-content-wrapper] > *
      ) :is([cmdk-group-heading], [role="heading"], [class*="text-token-text-tertiary"]) {
        color: rgba(126, 231, 246, 0.86) !important;
        background: transparent !important;
        background-color: transparent !important;
        background-image: none !important;
        border: 0 !important;
        outline: 0 !important;
        box-shadow: none !important;
      }
      html[data-cit-private-chainsaw-only="true"] :is(
        [role="dialog"],
        [role="menu"],
        [role="listbox"],
        [cmdk-root],
        [data-radix-popper-content-wrapper] > *
      ) :is(
        [cmdk-item],
        [role="option"],
        [role="menuitem"],
        [role="button"],
        button,
        a
      ):is(:hover, :focus-visible, [aria-selected="true"], [data-selected="true"], [data-highlighted], [data-state="checked"]) {
        background: transparent !important;
        background-color: transparent !important;
        background-image: none !important;
        border: 0 !important;
        outline: 0 !important;
        box-shadow: none !important;
        border-radius: 13px !important;
      }
      html[data-cit-private-chainsaw-only="true"] main [class*="before:bg-token-list-hover-background"]::before,
      html[data-cit-private-chainsaw-only="true"] main [class*="after:bg-black"]::after {
        background: rgba(255, 255, 255, 0.035) !important;
        opacity: 1 !important;
      }
      aside.app-shell-left-panel,
      header.app-header-tint,
      .composer-surface-chrome,
      .codex-interface-theme-project-panel,
      .codex-interface-theme-project-panel-frame,
      [data-cit-black-shell="true"] {
        background-color: transparent !important;
        background-image: none !important;
        border-color: rgba(155, 230, 242, 0.13) !important;
        box-shadow: none !important;
        -webkit-backdrop-filter: none !important;
        backdrop-filter: none !important;
      }
      aside.app-shell-left-panel,
      .codex-interface-theme-project-panel,
      .codex-interface-theme-project-panel-frame {
        background-color: transparent !important;
        box-shadow: none !important;
      }
      aside.app-shell-left-panel :is(button, a, [role="button"], [tabindex]),
      .codex-interface-theme-project-panel :is(button, a, [role="button"], [tabindex]),
      .codex-interface-theme-project-panel-frame :is(button, a, [role="button"], [tabindex]) {
        background-color: transparent !important;
        background-image: none !important;
        box-shadow: none !important;
      }
      aside.app-shell-left-panel :is(button, a, [role="button"], [tabindex]):is(:hover, :focus-visible, [aria-current="page"], [aria-selected="true"], [data-state="open"]),
      .codex-interface-theme-project-panel :is(button, a, [role="button"], [tabindex]):is(:hover, :focus-visible, [aria-current="page"], [aria-selected="true"], [data-state="open"]),
      .codex-interface-theme-project-panel-frame :is(button, a, [role="button"], [tabindex]):is(:hover, :focus-visible, [aria-current="page"], [aria-selected="true"], [data-state="open"]) {
        background-color: transparent !important;
        background-image: none !important;
        box-shadow: none !important;
      }
      html[data-cit-private-chainsaw-only="true"] .codex-interface-theme-project-panel-content header[class*="bg-surface-elevated-secondary"] {
        background: none !important;
        background-color: transparent !important;
        background-image: none !important;
        box-shadow: none !important;
      }
      html[data-cit-private-chainsaw-only="true"] .codex-interface-theme-project-panel-content header[class*="bg-surface-elevated-secondary"]::before {
        content: none !important;
        display: none !important;
        background: none !important;
        background-color: transparent !important;
        background-image: none !important;
        opacity: 0 !important;
        box-shadow: none !important;
      }
      html[data-cit-private-chainsaw-only="true"] .codex-interface-theme-project-panel-content header[class*="bg-surface-elevated-secondary"]::after {
        content: none !important;
        display: none !important;
        background: none !important;
        background-color: transparent !important;
        background-image: none !important;
        opacity: 0 !important;
        box-shadow: none !important;
      }
      html[data-cit-private-chainsaw-only="true"] main .group.flex.w-full.flex-col.items-end > [class*="bg-token-foreground/5"][class*="max-w-[77%]"] {
        position: relative !important;
        overflow: visible !important;
        background:
          linear-gradient(180deg, rgba(255, 255, 255, 0.050), transparent 34%),
          linear-gradient(105deg, rgba(119, 226, 244, 0.075), rgba(27, 54, 70, 0.22) 52%, rgba(255, 184, 88, 0.040)),
          rgba(24, 49, 60, 0.30) !important;
        border: 0 !important;
        outline: 0 !important;
        border-radius: 22px 22px 9px 22px !important;
        box-shadow:
          inset 0 1px 0 rgba(255, 255, 255, 0.070),
          inset 0 0 0 1px rgba(119, 226, 244, 0.050) !important;
        backdrop-filter: blur(12px) saturate(1.12) brightness(1.02) !important;
        -webkit-backdrop-filter: blur(12px) saturate(1.12) brightness(1.02) !important;
        transition: none !important;
      }
      html[data-cit-private-chainsaw-only="true"] main .group.flex.w-full.flex-col.items-end > [class*="bg-token-foreground/5"][class*="max-w-[77%]"]::after {
        content: none !important;
        display: none !important;
        background: none !important;
        background-color: transparent !important;
        background-image: none !important;
        box-shadow: none !important;
        pointer-events: none !important;
      }
      html[data-cit-private-chainsaw-only="true"] main .group.flex.w-full.flex-col.items-end > [class*="bg-token-foreground/5"][class*="max-w-[77%]"] :is(p, li, span, div) {
        text-shadow: 0 1px 7px rgba(0, 0, 0, 0.36) !important;
      }
      html[data-cit-private-chainsaw-only="true"] :is(.composer-surface-chrome, .codex-interface-theme-composer-surface) {
        border: 1.5px solid rgba(130, 230, 246, 0.46) !important;
        box-shadow:
          inset 0 0 0 1px rgba(255, 255, 255, 0.055),
          inset 0 1px 0 rgba(255, 255, 255, 0.075),
          0 0 0 1px rgba(255, 179, 83, 0.14),
          0 12px 28px rgba(0, 0, 0, 0.16) !important;
        transition: none !important;
      }
      [class*="ComposerLayoutRoot"] {
        background: none !important;
        background-color: transparent !important;
        background-image: none !important;
        border: 1.5px solid rgba(130, 230, 246, 0.46) !important;
        box-shadow:
          inset 0 0 0 1px rgba(255, 255, 255, 0.055),
          inset 0 1px 0 rgba(255, 255, 255, 0.075),
          0 0 0 1px rgba(255, 179, 83, 0.12),
          0 12px 28px rgba(0, 0, 0, 0.14) !important;
        transition: none !important;
      }
      .thread-scroll-container [class*="bg-gradient-to-t"][class*="from-surface"][class*="via-surface"] {
        display: none !important;
        background: none !important;
        background-color: transparent !important;
        background-image: none !important;
        opacity: 0 !important;
        pointer-events: none !important;
      }
      #\${ACTOR_LAYER_ID} .private-duel-actor {
        position: absolute;
        z-index: 1;
        display: block;
        width: var(--private-duel-width);
        height: auto;
        opacity: 0.9;
        object-fit: contain;
        pointer-events: none;
        transform-origin: var(--private-duel-origin, 50% 50%);
        filter: contrast(1.06) saturate(1.04) drop-shadow(0 12px 18px rgba(0, 0, 0, 0.34));
        will-change: transform, opacity, filter;
      }
      #\${ACTOR_LAYER_ID}[data-private-duel-retreat="side-panel"] .private-duel-actor,
      #\${ACTOR_LAYER_ID}[data-private-duel-retreat="composer-overlap"] .private-duel-actor,
      #\${ACTOR_LAYER_ID}[data-private-duel-retreat="object-overlap"] .private-duel-actor,
      #\${ACTOR_LAYER_ID}[data-private-duel-retreat="text-overlap"] .private-duel-actor,
      #\${ACTOR_LAYER_ID}[data-private-duel-retreat="narrow"] .private-duel-actor {
        opacity: 0 !important;
        transform: translate3d(0, 0, 0) scale(1) !important;
        filter: none !important;
        animation: none !important;
        transition: opacity 120ms ease;
      }
      #\${ACTOR_LAYER_ID} .private-duel-actor--upper {
        --private-duel-width: var(--private-duel-upper-width, 330px);
        --private-duel-origin: 58% 74%;
        left: var(--private-duel-upper-left, 338px);
        top: var(--private-duel-upper-top, 82px);
      }
      #\${ACTOR_LAYER_ID} .private-duel-actor--lower {
        --private-duel-width: var(--private-duel-lower-width, 330px);
        --private-duel-origin: 50% 24%;
        left: var(--private-duel-lower-left, 328px);
        top: var(--private-duel-lower-top, 430px);
      }
      #\${STATUS_ID} {
        position: fixed;
        z-index: 2147483001;
        left: var(--private-duel-status-left, 200px);
        top: var(--private-duel-status-top, 858px);
        width: var(--private-duel-status-size, 88px);
        height: auto;
        opacity: 0.96;
        object-fit: contain;
        pointer-events: none;
        filter:
          drop-shadow(0 7px 10px rgba(0, 0, 0, 0.42))
          drop-shadow(0 0 8px rgba(255, 132, 36, 0.18));
      }
      #\${STATUS_ID}[data-private-duel-retreat="menu-overlap"] {
        opacity: 0;
        transition: opacity 120ms ease;
      }
      #\${ACTOR_LAYER_ID}.is-disappearing .private-duel-actor--upper {
        animation: private-duel-upper-disappear 380ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
      }
      #\${ACTOR_LAYER_ID}.is-disappearing .private-duel-actor--lower {
        animation: private-duel-lower-disappear 380ms cubic-bezier(0.22, 1, 0.36, 1) forwards;
      }
      #\${ACTOR_LAYER_ID}.is-aggregating .private-duel-actor--upper {
        animation: private-duel-upper-aggregate 680ms cubic-bezier(0.16, 1, 0.3, 1) both;
      }
      #\${ACTOR_LAYER_ID}.is-aggregating .private-duel-actor--lower {
        animation: private-duel-lower-aggregate 680ms cubic-bezier(0.16, 1, 0.3, 1) both;
      }
      #\${ACTOR_LAYER_ID}.is-impacting .private-duel-actor {
        animation: private-duel-impact-lock 360ms cubic-bezier(0.22, 1, 0.36, 1) both;
      }
      #\${ACTOR_LAYER_ID}.is-recomposing .private-duel-actor {
        animation: private-duel-recompose-pulse 420ms cubic-bezier(0.22, 1, 0.36, 1) both;
      }
      @keyframes private-duel-upper-disappear {
        0% { opacity: 0.9; transform: translate3d(0, 0, 0); filter: contrast(1.06) saturate(1.04) drop-shadow(0 12px 18px rgba(0, 0, 0, 0.34)); }
        52% { opacity: 0.42; transform: translate3d(-42px, -12px, 0) scale(0.992); filter: blur(1px) contrast(1.1) saturate(1.08); }
        100% { opacity: 0; transform: translate3d(-128px, -34px, 0) scale(0.968); filter: blur(5px) contrast(1.02) saturate(1.02); }
      }
      @keyframes private-duel-lower-disappear {
        0% { opacity: 0.9; transform: translate3d(0, 0, 0); filter: contrast(1.06) saturate(1.04) drop-shadow(0 12px 18px rgba(0, 0, 0, 0.34)); }
        52% { opacity: 0.42; transform: translate3d(46px, 12px, 0) scale(0.992); filter: blur(1px) contrast(1.1) saturate(1.08); }
        100% { opacity: 0; transform: translate3d(150px, 34px, 0) scale(0.968); filter: blur(5px) contrast(1.02) saturate(1.02); }
      }
      @keyframes private-duel-upper-aggregate {
        0% { opacity: 0; transform: translate3d(-230px, -42px, 0) scale(0.945); filter: blur(5px) contrast(1.02) saturate(1.02); }
        48% { opacity: 0.78; transform: translate3d(-82px, -16px, 0) scale(0.982); filter: blur(1px) contrast(1.12) saturate(1.12) drop-shadow(0 0 16px rgba(255, 136, 34, 0.18)); }
        78% { opacity: 1; transform: translate3d(10px, 2px, 0) scale(1.012); filter: blur(0) contrast(1.14) saturate(1.12) drop-shadow(0 0 24px rgba(255, 136, 34, 0.26)); }
        100% { opacity: 0.9; transform: translate3d(0, 0, 0) scale(1); filter: contrast(1.06) saturate(1.04) drop-shadow(0 12px 18px rgba(0, 0, 0, 0.34)); }
      }
      @keyframes private-duel-lower-aggregate {
        0% { opacity: 0; transform: translate3d(260px, 46px, 0) scale(0.945); filter: blur(5px) contrast(1.02) saturate(1.02); }
        48% { opacity: 0.78; transform: translate3d(94px, 18px, 0) scale(0.982); filter: blur(1px) contrast(1.12) saturate(1.12) drop-shadow(0 0 16px rgba(94, 232, 255, 0.18)); }
        78% { opacity: 1; transform: translate3d(-10px, -2px, 0) scale(1.012); filter: blur(0) contrast(1.14) saturate(1.12) drop-shadow(0 0 24px rgba(94, 232, 255, 0.26)); }
        100% { opacity: 0.9; transform: translate3d(0, 0, 0) scale(1); filter: contrast(1.06) saturate(1.04) drop-shadow(0 12px 18px rgba(0, 0, 0, 0.34)); }
      }
      @keyframes private-duel-impact-lock {
        0% { opacity: 0.92; transform: translate3d(0, 0, 0) scale(1); filter: contrast(1.08) saturate(1.06) drop-shadow(0 12px 18px rgba(0, 0, 0, 0.34)); }
        42% { opacity: 1; transform: translate3d(0, 0, 0) scale(1.018); filter: contrast(1.18) saturate(1.18) drop-shadow(0 0 22px rgba(255, 196, 70, 0.32)); }
        100% { opacity: 0.9; transform: translate3d(0, 0, 0) scale(1); filter: contrast(1.06) saturate(1.04) drop-shadow(0 12px 18px rgba(0, 0, 0, 0.34)); }
      }
      @keyframes private-duel-recompose-pulse {
        0% { opacity: 0.34; transform: translate3d(0, 0, 0) scale(0.992); filter: blur(3px) contrast(1.02) saturate(1.02); }
        42% { opacity: 0.98; transform: translate3d(0, 0, 0) scale(1.012); filter: blur(0) contrast(1.14) saturate(1.12) drop-shadow(0 0 18px rgba(255, 142, 44, 0.22)); }
        100% { opacity: 0.9; transform: translate3d(0, 0, 0) scale(1); filter: contrast(1.06) saturate(1.04) drop-shadow(0 12px 18px rgba(0, 0, 0, 0.34)); }
      }
      #\${CANVAS_ID} {
        position: absolute;
        inset: 0;
        z-index: 0;
        width: 100vw;
        height: 100vh;
        pointer-events: none;
        contain: layout paint style;
      }
      @media (prefers-reduced-motion: reduce) {
        #\${ACTOR_LAYER_ID}.is-disappearing .private-duel-actor,
        #\${ACTOR_LAYER_ID}.is-aggregating .private-duel-actor,
        #\${ACTOR_LAYER_ID}.is-impacting .private-duel-actor {
          animation-duration: 1ms;
        }
      }
    \`;
    document.head.appendChild(style);

    const scene = document.createElement("section");
    scene.id = ROOT_ID;
    scene.dataset.privatePack = payload.packId;
    scene.dataset.privateRevision = payload.revision;
    scene.dataset.transparentInjection = "true";
    scene.setAttribute("aria-hidden", "true");

    const background = document.createElement("div");
    background.className = "private-duel-bg-band";
    scene.appendChild(background);

    const materialLayer = document.createElement("section");
    materialLayer.id = MATERIAL_LAYER_ID;
    materialLayer.dataset.privatePack = payload.packId;
    materialLayer.dataset.privateRevision = payload.revision;
    materialLayer.dataset.owner = "black-shell-material";
    materialLayer.setAttribute("aria-hidden", "true");

    const materialPane = document.createElement("div");
    materialPane.className = "private-duel-material-pane";
    materialLayer.appendChild(materialPane);

    const actorLayer = document.createElement("section");
    actorLayer.id = ACTOR_LAYER_ID;
    actorLayer.dataset.privatePack = payload.packId;
    actorLayer.dataset.privateRevision = payload.revision;
    actorLayer.dataset.transparentInjection = "true";
    actorLayer.setAttribute("aria-hidden", "true");

    const effectLayer = document.createElement("section");
    effectLayer.id = EFFECT_LAYER_ID;
    effectLayer.dataset.privatePack = payload.packId;
    effectLayer.dataset.privateRevision = payload.revision;
    effectLayer.dataset.owner = "effect-detection";
    effectLayer.dataset.trigger = "person-aggregation-only";
    effectLayer.setAttribute("aria-hidden", "true");

    const upper = document.createElement("img");
    upper.className = "private-duel-actor private-duel-actor--upper";
    upper.alt = "";
    upper.decoding = "async";
    upper.src = payload.assets.upperActor;
    upper.dataset.contactX = "0.857";
    upper.dataset.contactY = "0.925";
    actorLayer.appendChild(upper);

    const lower = document.createElement("img");
    lower.className = "private-duel-actor private-duel-actor--lower";
    lower.alt = "";
    lower.decoding = "async";
    lower.src = payload.assets.lowerActor;
    lower.dataset.contactX = "0.735";
    lower.dataset.contactY = "0.145";
    actorLayer.appendChild(lower);

    const canvas = document.createElement("canvas");
    canvas.id = CANVAS_ID;
    canvas.setAttribute("aria-hidden", "true");
    effectLayer.appendChild(canvas);
    const statusMascot = document.createElement("img");
    statusMascot.id = STATUS_ID;
    statusMascot.alt = "";
    statusMascot.decoding = "async";
    statusMascot.src = payload.assets.statusMascot;
    statusMascot.setAttribute("aria-hidden", "true");
    document.body.prepend(statusMascot);
    document.body.prepend(effectLayer);
    document.body.prepend(actorLayer);
    document.body.prepend(materialLayer);
    document.body.prepend(scene);

    const state = {
      revision: payload.revision,
      timers: [],
      triggers: 0,
      maxAutoTriggers: Math.max(0, Number(payload.interaction.maxAutoTriggers) || 2),
      cooldownMs: Math.max(800, Number(payload.interaction.cooldownMs) || 1200),
      lastTriggerAt: 0,
      effectLockUntil: 0,
      effectInFlight: false,
      actorDisappeared: false,
      lastAggregationRouteKey: "",
      retreatWasActive: false,
      installedSurfaceRegistry: false,
      onResize: null,
      bodyArtSnapshot,
      htmlAttributeSnapshot
    };
    window[STATE_KEY] = state;

    let retreatCheckTimer = null;
    let retreatLastCheckAt = 0;
    let retreatHoldUntil = 0;
    let retreatObserver = null;
    let retreatAggregationInFlight = false;
    let lastRetreatAggregationAt = 0;
    let lastRetreatReleaseAt = 0;

    function effectWindowActive() {
      return Boolean(state.effectInFlight) || performance.now() < Number(state.effectLockUntil || 0);
    }

    function reserveEffectWindow(durationMs, reason) {
      const until = performance.now() + Math.max(900, Number(durationMs) || 0);
      state.effectInFlight = true;
      state.effectLockUntil = Math.max(Number(state.effectLockUntil || 0), until);
      state.effectLockReason = String(reason || "effect");
      return true;
    }

    function releaseEffectWindow(reason, tailMs = 700) {
      state.effectInFlight = false;
      state.effectReleaseReason = String(reason || "effect-complete");
      if (tailMs > 0) {
        state.effectLockUntil = Math.max(Number(state.effectLockUntil || 0), performance.now() + tailMs);
      }
      return true;
    }

    function installPackagedBlackShellModules() {
      let blackShellStyle = document.getElementById(BLACK_SHELL_STYLE_ID);
      if (!blackShellStyle) {
        blackShellStyle = document.createElement("style");
        blackShellStyle.id = BLACK_SHELL_STYLE_ID;
        document.head.appendChild(blackShellStyle);
      }
      blackShellStyle.textContent = [
        String(payload.modules.blackShellCss || ""),
        String(payload.modules.composerShellCss || ""),
        String(payload.modules.workspaceGlassCss || "")
      ].join("\\n")
        .replaceAll('html[data-codex-interface-theme="active"]', 'html[data-cit-private-chainsaw-only="true"]');
      try {
        const installSurfaceRegistry = (0, eval)(String(payload.modules.surfaceRegistrySource || ""));
        if (typeof installSurfaceRegistry === "function") {
          installSurfaceRegistry({ revision: payload.revision });
          state.installedSurfaceRegistry = true;
        }
        if (window.__CODEX_INTERFACE_THEME_SURFACE_REGISTRY__ && typeof window.__CODEX_INTERFACE_THEME_SURFACE_REGISTRY__.tick === "function") {
          window.__CODEX_INTERFACE_THEME_SURFACE_REGISTRY__.tick("black-shell");
        }
      } catch (error) {
        state.surfaceRegistryError = String(error && error.message ? error.message : error);
      }
    }

    function resizeCanvas() {
      const ratio = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
      const width = Math.max(1, Math.floor(window.innerWidth * ratio));
      const height = Math.max(1, Math.floor(window.innerHeight * ratio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      canvas.style.width = "100vw";
      canvas.style.height = "100vh";
    }

    function positionPrivateDuelLayout() {
      const mascot = document.getElementById(STATUS_ID);
      const rootNode = document.getElementById(ROOT_ID);
      const materialNode = document.getElementById(MATERIAL_LAYER_ID);
      const actorNode = document.getElementById(ACTOR_LAYER_ID);
      const effectNode = document.getElementById(EFFECT_LAYER_ID);
      const sidebar = document.querySelector("aside.app-shell-left-panel");
      const artWidth = Math.max(360, Math.min(410, Math.round(window.innerWidth * 0.205)));
      const impactRatioX = 0.784;
      const impactRatioY = 0.430;
      const upperWidth = Math.max(300, Math.min(342, Math.round(artWidth * 0.84)));
      const lowerWidth = Math.max(314, Math.min(346, Math.round(artWidth * 0.85)));
      const upperHeight = upperWidth * 1.251;
      const lowerHeight = lowerWidth * 1.501;
      const statusSize = 88;
      const statusRightPadding = 20;
      if (!sidebar) {
        const fallbackArtLeft = 300;
        const fallbackImpactX = fallbackArtLeft + Math.round(artWidth * impactRatioX);
        const fallbackImpactY = Math.max(464, Math.round(window.innerHeight * impactRatioY));
        if (rootNode) {
          rootNode.style.setProperty("--private-duel-art-left", fallbackArtLeft + "px");
          rootNode.style.setProperty("--private-duel-art-top", "72px");
          rootNode.style.setProperty("--private-duel-art-width", artWidth + "px");
          rootNode.style.setProperty("--private-duel-art-right", fallbackArtLeft + artWidth + "px");
        }
        if (materialNode) {
          materialNode.style.setProperty("--private-duel-art-left", fallbackArtLeft + "px");
          materialNode.style.setProperty("--private-duel-art-top", "72px");
          materialNode.style.setProperty("--private-duel-art-width", artWidth + "px");
          materialNode.style.setProperty("--private-duel-art-right", fallbackArtLeft + artWidth + "px");
        }
        if (actorNode) {
          actorNode.style.setProperty("--private-duel-art-left", fallbackArtLeft + "px");
          actorNode.style.setProperty("--private-duel-art-right", fallbackArtLeft + artWidth + "px");
          actorNode.style.setProperty("--private-duel-upper-left", Math.round(fallbackImpactX - upperWidth * 0.857) + "px");
          actorNode.style.setProperty("--private-duel-upper-top", Math.round(fallbackImpactY - upperHeight * 0.925) + "px");
          actorNode.style.setProperty("--private-duel-upper-width", upperWidth + "px");
          actorNode.style.setProperty("--private-duel-lower-left", Math.round(fallbackImpactX - lowerWidth * 0.735) + "px");
          actorNode.style.setProperty("--private-duel-lower-top", Math.round(fallbackImpactY - lowerHeight * 0.145) + "px");
          actorNode.style.setProperty("--private-duel-lower-width", lowerWidth + "px");
        }
        if (effectNode) {
          effectNode.style.setProperty("--private-duel-art-left", fallbackArtLeft + "px");
          effectNode.style.setProperty("--private-duel-art-right", fallbackArtLeft + artWidth + "px");
        }
        if (mascot) {
          mascot.style.setProperty("--private-duel-status-left", "215px");
          mascot.style.setProperty("--private-duel-status-top", "818px");
          mascot.style.setProperty("--private-duel-status-size", statusSize + "px");
        }
        return;
      }
      const rect = sidebar.getBoundingClientRect();
      const artLeft = Math.round(rect.right);
      const artRight = artLeft + artWidth;
      const impactX = artLeft + Math.round(artWidth * impactRatioX);
      const impactY = Math.max(464, Math.round(window.innerHeight * impactRatioY));
      if (rootNode) {
        rootNode.style.setProperty("--private-duel-art-left", artLeft + "px");
        rootNode.style.setProperty("--private-duel-art-top", "72px");
        rootNode.style.setProperty("--private-duel-art-width", artWidth + "px");
        rootNode.style.setProperty("--private-duel-art-right", artRight + "px");
      }
      if (materialNode) {
        materialNode.style.setProperty("--private-duel-art-left", artLeft + "px");
        materialNode.style.setProperty("--private-duel-art-top", "72px");
        materialNode.style.setProperty("--private-duel-art-width", artWidth + "px");
        materialNode.style.setProperty("--private-duel-art-right", artRight + "px");
      }
      if (actorNode) {
        actorNode.style.setProperty("--private-duel-art-left", artLeft + "px");
        actorNode.style.setProperty("--private-duel-art-right", artRight + "px");
        actorNode.style.setProperty("--private-duel-upper-left", Math.round(impactX - upperWidth * 0.857) + "px");
        actorNode.style.setProperty("--private-duel-upper-top", Math.round(impactY - upperHeight * 0.925) + "px");
        actorNode.style.setProperty("--private-duel-upper-width", upperWidth + "px");
        actorNode.style.setProperty("--private-duel-lower-left", Math.round(impactX - lowerWidth * 0.735) + "px");
        actorNode.style.setProperty("--private-duel-lower-top", Math.round(impactY - lowerHeight * 0.145) + "px");
        actorNode.style.setProperty("--private-duel-lower-width", lowerWidth + "px");
      }
      if (effectNode) {
        effectNode.style.setProperty("--private-duel-art-left", artLeft + "px");
        effectNode.style.setProperty("--private-duel-art-right", artRight + "px");
      }
      if (mascot) {
        const originalBadgeLeft = Math.max(8, Math.round(rect.right - statusRightPadding - statusSize));
        const accountButton = Array.from(sidebar.querySelectorAll("button,[role='button']")).find((node) => {
          const text = String(node.textContent || node.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim();
          return /jiarong sun|個人檔案|profile/i.test(text);
        });
        const accountRect = accountButton && typeof accountButton.getBoundingClientRect === "function" ? accountButton.getBoundingClientRect() : null;
        const originalBadgeTop = Math.max(8, Math.round((accountRect && accountRect.top > 0 ? accountRect.top : rect.bottom - 38) - statusSize - 54));
        mascot.style.setProperty("--private-duel-status-left", originalBadgeLeft + "px");
        mascot.style.setProperty("--private-duel-status-top", originalBadgeTop + "px");
        mascot.style.setProperty("--private-duel-status-size", statusSize + "px");
      }
    }

    function contactPoint(actor) {
      const rect = actor.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        return null;
      }
      return {
        x: rect.left + rect.width * Number(actor.dataset.contactX || 0.5),
        y: rect.top + rect.height * Number(actor.dataset.contactY || 0.5)
      };
    }

    function renderedActorAlpha(actor, sampleRect) {
      const actorRect = actor.getBoundingClientRect();
      const width = Math.max(1, Math.ceil(sampleRect.right - sampleRect.left));
      const height = Math.max(1, Math.ceil(sampleRect.bottom - sampleRect.top));
      const alphaCanvas = document.createElement("canvas");
      alphaCanvas.width = width;
      alphaCanvas.height = height;
      const ctx = alphaCanvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) {
        return null;
      }
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(
        actor,
        actorRect.left - sampleRect.left,
        actorRect.top - sampleRect.top,
        actorRect.width,
        actorRect.height
      );
      return ctx.getImageData(0, 0, width, height).data;
    }

    function resolveDualObjectAlphaImpact(fallbackImpact) {
      const upperRect = upper.getBoundingClientRect();
      const lowerRect = lower.getBoundingClientRect();
      const sampleRect = {
        left: Math.max(Math.floor(Math.max(upperRect.left, lowerRect.left)), Math.floor(fallbackImpact.x - 170)),
        top: Math.max(Math.floor(Math.max(upperRect.top, lowerRect.top)), Math.floor(fallbackImpact.y - 170)),
        right: Math.min(Math.ceil(Math.min(upperRect.right, lowerRect.right)), Math.ceil(fallbackImpact.x + 170)),
        bottom: Math.min(Math.ceil(Math.min(upperRect.bottom, lowerRect.bottom)), Math.ceil(fallbackImpact.y + 170))
      };
      const width = Math.max(0, Math.ceil(sampleRect.right - sampleRect.left));
      const height = Math.max(0, Math.ceil(sampleRect.bottom - sampleRect.top));
      if (width < 3 || height < 3 || width * height > 160000) {
        state.lastDualObjectCollision = {
          source: "alpha-mask",
          ok: false,
          reason: "invalid-sample",
          width,
          height
        };
        return null;
      }
      try {
        const upperAlpha = renderedActorAlpha(upper, sampleRect);
        const lowerAlpha = renderedActorAlpha(lower, sampleRect);
        if (!upperAlpha || !lowerAlpha) {
          state.lastDualObjectCollision = {
            source: "alpha-mask",
            ok: false,
            reason: "missing-alpha"
          };
          return null;
        }
        let best = null;
        let hitCount = 0;
        const threshold = 46;
        const fallbackLocalX = fallbackImpact.x - sampleRect.left;
        const fallbackLocalY = fallbackImpact.y - sampleRect.top;
        for (let y = 0; y < height; y += 1) {
          for (let x = 0; x < width; x += 1) {
            const offset = (y * width + x) * 4 + 3;
            const upperA = upperAlpha[offset];
            const lowerA = lowerAlpha[offset];
            if (upperA < threshold || lowerA < threshold) {
              continue;
            }
            hitCount += 1;
            const distance = Math.hypot(x - fallbackLocalX, y - fallbackLocalY);
            const score = distance - Math.min(upperA, lowerA) / 255;
            if (!best || score < best.score) {
              best = { x, y, score, distance };
            }
          }
        }
        if (!best) {
          const opaque = (data, x, y) => {
            if (x < 0 || y < 0 || x >= width || y >= height) {
              return false;
            }
            return data[(y * width + x) * 4 + 3] >= threshold;
          };
          const boundaryPoints = (data) => {
            const points = [];
            const maxDistance = 180;
            for (let y = 1; y < height - 1; y += 1) {
              for (let x = 1; x < width - 1; x += 1) {
                if (!opaque(data, x, y)) {
                  continue;
                }
                if (
                  opaque(data, x - 1, y) &&
                  opaque(data, x + 1, y) &&
                  opaque(data, x, y - 1) &&
                  opaque(data, x, y + 1)
                ) {
                  continue;
                }
                if (Math.hypot(sampleRect.left + x - fallbackImpact.x, sampleRect.top + y - fallbackImpact.y) <= maxDistance) {
                  points.push({ x, y });
                }
              }
            }
            return points;
          };
          const upperBoundary = boundaryPoints(upperAlpha);
          const lowerBoundary = boundaryPoints(lowerAlpha);
          let nearest = null;
          for (const upperPoint of upperBoundary) {
            for (const lowerPoint of lowerBoundary) {
              const dx = upperPoint.x - lowerPoint.x;
              const dy = upperPoint.y - lowerPoint.y;
              const distance = Math.hypot(dx, dy);
              const midpointX = sampleRect.left + (upperPoint.x + lowerPoint.x) / 2;
              const midpointY = sampleRect.top + (upperPoint.y + lowerPoint.y) / 2;
              const anchorDistance = Math.hypot(midpointX - fallbackImpact.x, midpointY - fallbackImpact.y);
              const score = distance * distance + anchorDistance * 0.18;
              if (!nearest || score < nearest.score) {
                nearest = {
                  score,
                  distance,
                  anchorDistance,
                  midpointX,
                  midpointY,
                  upperX: sampleRect.left + upperPoint.x,
                  upperY: sampleRect.top + upperPoint.y,
                  lowerX: sampleRect.left + lowerPoint.x,
                  lowerY: sampleRect.top + lowerPoint.y
                };
              }
            }
          }
          if (nearest) {
            const impact = {
              x: nearest.midpointX,
              y: nearest.midpointY,
              distance: nearest.distance,
              source: "dual-alpha-nearest"
            };
            state.lastDualObjectCollision = {
              source: "alpha-nearest",
              ok: true,
              x: Math.round(impact.x),
              y: Math.round(impact.y),
              distance: Math.round(nearest.distance),
              nearestAnchorDistance: Math.round(nearest.anchorDistance),
              upperPoint: {
                x: Math.round(nearest.upperX),
                y: Math.round(nearest.upperY)
              },
              lowerPoint: {
                x: Math.round(nearest.lowerX),
                y: Math.round(nearest.lowerY)
              },
              upperBoundary: upperBoundary.length,
              lowerBoundary: lowerBoundary.length,
              sampleRect: {
                left: Math.round(sampleRect.left),
                top: Math.round(sampleRect.top),
                right: Math.round(sampleRect.right),
                bottom: Math.round(sampleRect.bottom)
              }
            };
            return impact;
          }
          state.lastDualObjectCollision = {
            source: "alpha-mask",
            ok: false,
            reason: "no-alpha-overlap-or-boundary",
            upperBoundary: upperBoundary.length,
            lowerBoundary: lowerBoundary.length,
            sampleRect: {
              left: Math.round(sampleRect.left),
              top: Math.round(sampleRect.top),
              right: Math.round(sampleRect.right),
              bottom: Math.round(sampleRect.bottom)
            }
          };
          return null;
        }
        let sumX = 0;
        let sumY = 0;
        let sumWeight = 0;
        const clusterRadius = 18;
        for (let y = Math.max(0, best.y - clusterRadius); y <= Math.min(height - 1, best.y + clusterRadius); y += 1) {
          for (let x = Math.max(0, best.x - clusterRadius); x <= Math.min(width - 1, best.x + clusterRadius); x += 1) {
            const offset = (y * width + x) * 4 + 3;
            const upperA = upperAlpha[offset];
            const lowerA = lowerAlpha[offset];
            if (upperA < threshold || lowerA < threshold || Math.hypot(x - best.x, y - best.y) > clusterRadius) {
              continue;
            }
            const weight = Math.min(upperA, lowerA);
            sumX += x * weight;
            sumY += y * weight;
            sumWeight += weight;
          }
        }
        const localX = sumWeight > 0 ? sumX / sumWeight : best.x;
        const localY = sumWeight > 0 ? sumY / sumWeight : best.y;
        const impact = {
          x: sampleRect.left + localX,
          y: sampleRect.top + localY,
          distance: Math.min(260, Math.round(best.distance)),
          source: "dual-alpha-mask",
          alphaHits: hitCount
        };
        state.lastDualObjectCollision = {
          source: "alpha-mask",
          ok: true,
          x: Math.round(impact.x),
          y: Math.round(impact.y),
          alphaHits: hitCount,
          nearestAnchorDistance: Math.round(best.distance),
          sampleRect: {
            left: Math.round(sampleRect.left),
            top: Math.round(sampleRect.top),
            right: Math.round(sampleRect.right),
            bottom: Math.round(sampleRect.bottom)
          }
        };
        return impact;
      } catch (error) {
        state.lastDualObjectCollision = {
          source: "alpha-mask",
          ok: false,
          reason: String(error && error.message ? error.message : error)
        };
        return null;
      }
    }

    function resolvedImpactPoint() {
      const upperPoint = contactPoint(upper);
      const lowerPoint = contactPoint(lower);
      if (!upperPoint || !lowerPoint) {
        return null;
      }
      const fallbackImpact = {
        x: (upperPoint.x + lowerPoint.x) / 2,
        y: (upperPoint.y + lowerPoint.y) / 2,
        distance: Math.hypot(upperPoint.x - lowerPoint.x, upperPoint.y - lowerPoint.y),
        source: "contact-anchor"
      };
      const alphaImpact = resolveDualObjectAlphaImpact(fallbackImpact);
      const impact = alphaImpact || fallbackImpact;
      state.lastResolvedImpactSource = impact.source || "contact-anchor";
      return impact;
    }

    function rectArea(rect) {
      if (!rect) {
        return 0;
      }
      return Math.max(0, rect.right - rect.left) * Math.max(0, rect.bottom - rect.top);
    }

    function rectIntersectionArea(left, right) {
      if (!left || !right) {
        return 0;
      }
      return Math.max(0, Math.min(left.right, right.right) - Math.max(left.left, right.left)) *
        Math.max(0, Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top));
    }

    function visibleElement(node) {
      if (!node || typeof node.getBoundingClientRect !== "function") {
        return false;
      }
      const rect = node.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2 || rect.bottom < 0 || rect.top > window.innerHeight || rect.right < 0 || rect.left > window.innerWidth) {
        return false;
      }
      const nodeStyle = window.getComputedStyle(node);
      return nodeStyle.display !== "none" && nodeStyle.visibility !== "hidden" && Number(nodeStyle.opacity || "1") > 0.04;
    }

    function markTopRightActions() {
      const previous = document.querySelectorAll("[data-cit-private-top-action='true']");
      previous.forEach((node) => {
        node.removeAttribute("data-cit-private-top-action");
      });
      const selector = [
        "main button",
        "main [role='button']",
        "main a",
        "header button",
        "header [role='button']",
        "header a"
      ].join(",");
      const nodes = Array.from(document.querySelectorAll(selector));
      let marked = 0;
      for (const node of nodes) {
        if (!visibleElement(node)) {
          continue;
        }
        if (node.closest("[role='dialog'],[role='menu'],[role='listbox'],[cmdk-root],[data-radix-popper-content-wrapper],.composer-surface-chrome,.codex-interface-theme-composer-surface")) {
          continue;
        }
        const rect = node.getBoundingClientRect();
        if (rect.top < 0 || rect.top > 64 || rect.right < window.innerWidth - 380 || rect.width > 170 || rect.height > 48) {
          continue;
        }
        const text = String(node.textContent || node.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim();
        const className = String(node.className || "");
        if (!text && !/rounded|no-drag|cursor-interaction|bg-token|text-token/i.test(className)) {
          continue;
        }
        node.setAttribute("data-cit-private-top-action", "true");
        marked += 1;
      }
      state.lastTopRightActionCount = marked;
      return marked;
    }

    function measurableElement(node) {
      if (!node || typeof node.getBoundingClientRect !== "function") {
        return false;
      }
      const rect = node.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2 || rect.bottom < 0 || rect.top > window.innerHeight || rect.right < 0 || rect.left > window.innerWidth) {
        return false;
      }
      const nodeStyle = window.getComputedStyle(node);
      return nodeStyle.display !== "none" && nodeStyle.visibility !== "hidden";
    }

    function actorCoreRect(actor, trim) {
      if (!actor || !measurableElement(actor)) {
        return null;
      }
      const rect = actor.getBoundingClientRect();
      const leftTrim = rect.width * trim.left;
      const rightTrim = rect.width * trim.right;
      const topTrim = rect.height * trim.top;
      const bottomTrim = rect.height * trim.bottom;
      return {
        left: rect.left + leftTrim,
        right: rect.right - rightTrim,
        top: rect.top + topTrim,
        bottom: rect.bottom - bottomTrim,
        width: rect.width - leftTrim - rightTrim,
        height: rect.height - topTrim - bottomTrim
      };
    }

    function privateDuelActorCollisionRects() {
      const upperRect = actorCoreRect(upper, { left: 0.18, right: 0.06, top: 0.08, bottom: 0.04 });
      const lowerRect = actorCoreRect(lower, { left: 0.16, right: 0.10, top: 0.05, bottom: 0.05 });
      return [
        upperRect ? { actor: "upper", rect: upperRect } : null,
        lowerRect ? { actor: "lower", rect: lowerRect } : null
      ].filter(Boolean);
    }

    function privateDuelCollisionRect(actorRects = privateDuelActorCollisionRects()) {
      const rects = actorRects.map((entry) => entry.rect).filter(Boolean);
      if (!rects.length) {
        return null;
      }
      return {
        left: Math.min(...rects.map((rect) => rect.left)),
        right: Math.max(...rects.map((rect) => rect.right)),
        top: Math.min(...rects.map((rect) => rect.top)),
        bottom: Math.max(...rects.map((rect) => rect.bottom))
      };
    }

    function actorObjectIntersection(actorRects, objectRect) {
      if (!actorRects || !actorRects.length || !objectRect) {
        return null;
      }
      let best = null;
      for (const entry of actorRects) {
        const area = rectIntersectionArea(entry.rect, objectRect);
        if (area <= 0) {
          continue;
        }
        const current = {
          actor: entry.actor,
          area,
          actorArea: rectArea(entry.rect),
          objectArea: rectArea(objectRect),
          actorRect: entry.rect,
          objectRect
        };
        if (!best || current.area > best.area) {
          best = current;
        }
      }
      return best;
    }

    function actorObjectCollision(actorRects, objectRect, minArea = 120) {
      const hit = actorObjectIntersection(actorRects, objectRect);
      if (!hit) {
        return null;
      }
      const threshold = Math.max(minArea, Math.min(hit.objectArea * 0.68, hit.actorArea * 0.022));
      return hit.area >= threshold ? hit : null;
    }

    function describeObjectCollision(kind, hit, node) {
      const rect = hit.objectRect;
      return {
        kind,
        actor: hit.actor,
        area: Math.round(hit.area),
        actorArea: Math.round(hit.actorArea),
        objectArea: Math.round(hit.objectArea),
        objectTag: String(node && node.tagName ? node.tagName : "").toLowerCase(),
        objectClass: String(node && node.className ? node.className : "").slice(0, 120),
        objectRect: {
          left: Math.round(rect.left),
          top: Math.round(rect.top),
          right: Math.round(rect.right),
          bottom: Math.round(rect.bottom)
        }
      };
    }

    function overlapsComposerSurface(actorRects) {
      if (!actorRects || !actorRects.length) {
        return false;
      }
      const composerNodes = document.querySelectorAll(".composer-surface-chrome,.codex-interface-theme-composer-surface,[class*='ComposerLayoutRoot']");
      for (const node of composerNodes) {
        if (!visibleElement(node)) {
          continue;
        }
        const rect = node.getBoundingClientRect();
        if (rect.top < window.innerHeight - 260 && !String(node.className || "").includes("ComposerLayoutRoot")) {
          continue;
        }
        const hit = actorObjectCollision(actorRects, { left: rect.left + 4, right: rect.right - 4, top: rect.top - 8, bottom: rect.bottom + 2 }, 120);
        if (hit) {
          state.lastObjectCollision = describeObjectCollision("composer-overlap", hit, node);
          return true;
        }
      }
      return false;
    }

    function overlapsRightPanel(actorRects) {
      if (!actorRects || !actorRects.length) {
        return false;
      }
      const nodes = document.querySelectorAll(".codex-interface-theme-project-panel-frame,.codex-interface-theme-project-panel,[class*='bg-token-dropdown-background'][class*='rounded']");
      for (const node of nodes) {
        if (!visibleElement(node)) {
          continue;
        }
        const rect = node.getBoundingClientRect();
        if (rect.width < 220 || rect.height < 120 || rect.right < window.innerWidth * 0.52) {
          continue;
        }
        const hit = actorObjectCollision(actorRects, rect, 120);
        if (hit) {
          state.lastObjectCollision = describeObjectCollision("side-panel", hit, node);
          return true;
        }
      }
      return false;
    }

    function privateDuelObjectAllowed(node) {
      if (!node || node === document.documentElement || node === document.body || node.nodeType !== 1) {
        return false;
      }
      if (node.closest("#" + ROOT_ID + ",#" + MATERIAL_LAYER_ID + ",#" + ACTOR_LAYER_ID + ",#" + EFFECT_LAYER_ID + ",#" + STATUS_ID)) {
        return false;
      }
      if (node.matches("script,style,template,link,meta,svg,path")) {
        return false;
      }
      const rect = node.getBoundingClientRect();
      if (rect.width > window.innerWidth * 0.78 && rect.height > window.innerHeight * 0.42) {
        return false;
      }
      if (rect.width < 12 || rect.height < 10 || rect.top < 38 || rect.bottom > window.innerHeight - 18) {
        return false;
      }
      return true;
    }

    function overlapsBlockingUiObject(actorRects) {
      if (!actorRects || !actorRects.length) {
        return false;
      }
      const selector = [
        ".composer-surface-chrome",
        ".codex-interface-theme-composer-surface",
        ".codex-interface-theme-project-panel-frame",
        ".codex-interface-theme-project-panel",
        "[data-radix-popper-content-wrapper]",
        "[role='dialog']",
        "[role='menu']",
        "[role='menuitem']",
        "[role='button']",
        "[role='textbox']",
        "[role='tab']",
        "button",
        "a",
        "input",
        "textarea",
        "select",
        "pre",
        "code",
        "img",
        "video",
        "canvas"
      ].join(",");
      const nodes = Array.from(document.querySelectorAll(selector));
      for (const node of nodes) {
        if (!privateDuelObjectAllowed(node) || !visibleElement(node)) {
          continue;
        }
        const hit = actorObjectCollision(actorRects, node.getBoundingClientRect(), 90);
        if (hit) {
          state.lastObjectCollision = describeObjectCollision("object-overlap", hit, node);
          return true;
        }
      }
      return false;
    }

    function textParentAllowed(parent) {
      return Boolean(parent && visibleElement(parent) && !parent.closest(
        "aside.app-shell-left-panel,.composer-surface-chrome,.codex-interface-theme-composer-surface,.codex-interface-theme-project-panel-frame,.codex-interface-theme-project-panel,#" +
          ROOT_ID + ",#" + MATERIAL_LAYER_ID + ",#" + ACTOR_LAYER_ID + ",#" + EFFECT_LAYER_ID + ",#" + STATUS_ID + ",button,[role='button'],svg,script,style"
      ));
    }

    function overlapsReadableText(actorRects) {
      if (!actorRects || !actorRects.length) {
        return false;
      }
      const containers = Array.from(new Set(Array.from(document.querySelectorAll(".thread-scroll-container,main,[role='main'],article")).filter(visibleElement)));
      let inspected = 0;
      for (const container of containers) {
        const walker = document.createTreeWalker(container, 4);
        let textNode = walker.nextNode();
        while (textNode && inspected < 420) {
          const text = String(textNode.textContent || "").replace(/\\s+/g, " ").trim();
          const parent = textNode.parentNode && textNode.parentNode.nodeType === 1 ? textNode.parentNode : null;
          if (text.length >= 4 && textParentAllowed(parent)) {
            const range = document.createRange();
            range.selectNodeContents(textNode);
            const rects = Array.from(range.getClientRects());
            if (typeof range.detach === "function") {
              range.detach();
            }
            for (const rect of rects) {
              if (rect.width < 18 || rect.height < 9 || rect.top < 46 || rect.bottom > window.innerHeight - 74 || rect.right < 220) {
                continue;
              }
              const hit = actorObjectCollision(actorRects, rect, 70);
              if (hit) {
                state.lastObjectCollision = describeObjectCollision("text-overlap", hit, parent);
                return true;
              }
            }
            inspected += 1;
          }
          textNode = walker.nextNode();
        }
        if (inspected >= 420) {
          break;
        }
      }
      return false;
    }

    function statusMascotOverlapsMenu(mascot) {
      if (!mascot || !measurableElement(mascot)) {
        return false;
      }
      const mascotRect = mascot.getBoundingClientRect();
      const candidates = Array.from(document.querySelectorAll("[role='menu'],[data-radix-popper-content-wrapper],body > div")).filter((node) => {
        if (!node || node === document.body || node.id === ROOT_ID || node.id === MATERIAL_LAYER_ID || node.id === ACTOR_LAYER_ID || node.id === EFFECT_LAYER_ID || node.id === STATUS_ID) {
          return false;
        }
        if (!visibleElement(node)) {
          return false;
        }
        const rect = node.getBoundingClientRect();
        const style = window.getComputedStyle(node);
        const menuLike = node.matches("[role='menu'],[data-radix-popper-content-wrapper]") || /absolute|fixed/i.test(style.position);
        if (!menuLike || rect.width > 420 || rect.height > 620 || rect.left > 360 || rect.top < window.innerHeight * 0.35 || rect.bottom > window.innerHeight + 8) {
          return false;
        }
        const text = String(node.innerText || node.textContent || "").replace(/\\s+/g, " ").trim();
        return /剩餘用量|深入了解|隱藏寵物|邀請好友|設定|登出|jiarong sun|account|settings|logout/i.test(text);
      });
      for (const node of candidates) {
        const rect = node.getBoundingClientRect();
        if (rect.width < 120 || rect.height < 120 || rect.left > 360 || rect.bottom < window.innerHeight * 0.45) {
          continue;
        }
        if (rectIntersectionArea(mascotRect, rect) > 80) {
          return true;
        }
      }
      return false;
    }

    function updateStatusMascotRetreat() {
      const mascot = document.getElementById(STATUS_ID);
      if (!mascot) {
        return "off";
      }
      const reason = statusMascotOverlapsMenu(mascot) ? "menu-overlap" : "none";
      mascot.dataset.privateDuelRetreat = reason;
      document.documentElement.dataset.citPrivateDuelStatusRetreat = reason;
      state.lastStatusRetreat = reason;
      return reason;
    }

    function updatePrivateDuelRetreat() {
      const now = Date.now();
      const previousReason = state.lastRetreat || "none";
      let reason = "none";
      const actorRects = privateDuelActorCollisionRects();
      const collisionRect = privateDuelCollisionRect(actorRects);
      state.lastActorCollisionRects = actorRects.map((entry) => ({
        actor: entry.actor,
        left: Math.round(entry.rect.left),
        top: Math.round(entry.rect.top),
        right: Math.round(entry.rect.right),
        bottom: Math.round(entry.rect.bottom)
      }));
      if (window.innerWidth < 980) {
        reason = "narrow";
      } else if (overlapsRightPanel(actorRects)) {
        reason = "side-panel";
      } else if (overlapsComposerSurface(actorRects)) {
        reason = "composer-overlap";
        retreatHoldUntil = now + 520;
      } else if (overlapsBlockingUiObject(actorRects)) {
        reason = "object-overlap";
        retreatHoldUntil = now + 520;
      } else if (overlapsReadableText(actorRects)) {
        reason = "text-overlap";
        retreatHoldUntil = now + 520;
      } else if (retreatHoldUntil > now) {
        reason = previousReason !== "none" ? previousReason : "object-overlap";
      }
      actorLayer.dataset.privateDuelRetreat = reason;
      document.documentElement.dataset.citPrivateDuelRetreat = reason;
      state.lastRetreat = reason;
      if (reason !== "none" && retreatHoldUntil > now) {
        schedulePrivateDuelRetreatCheck(retreatHoldUntil - now + 30);
      }
      updateStatusMascotRetreat();
      state.lastRetreatTransition = {
        from: previousReason,
        to: reason,
        at: Math.round(performance.now())
      };
      if (reason !== "none") {
        state.retreatWasActive = true;
      } else if (state.retreatWasActive) {
        state.retreatWasActive = false;
        const releaseNow = performance.now();
        if (releaseNow - lastRetreatReleaseAt >= Math.max(3200, state.cooldownMs * 2.4) && !effectWindowActive()) {
          lastRetreatReleaseAt = releaseNow;
          state.retreatAggregationScheduled = scheduleRetreatAggregationSparks(previousReason !== "none" ? previousReason : "retreat-release");
        } else {
          state.retreatAggregationScheduled = false;
          state.retreatAggregationSkipped = effectWindowActive() ? "effect-window" : "release-cooldown";
        }
      }
      return reason;
    }

    function schedulePrivateDuelRetreatCheck(delayMs) {
      const now = Date.now();
      const minDelay = Math.max(Number(delayMs) || 0, retreatLastCheckAt + 260 - now, 0);
      if (retreatCheckTimer) {
        window.clearTimeout(retreatCheckTimer);
      }
      retreatCheckTimer = window.setTimeout(() => {
        retreatCheckTimer = null;
        retreatLastCheckAt = Date.now();
        updatePrivateDuelRetreat();
      }, minDelay);
    }

    function cleanupPrivateDuelRetreat() {
      if (retreatCheckTimer) {
        window.clearTimeout(retreatCheckTimer);
        retreatCheckTimer = null;
      }
      if (retreatObserver) {
        retreatObserver.disconnect();
        retreatObserver = null;
      }
      delete document.documentElement.dataset.citPrivateDuelRetreat;
      delete document.documentElement.dataset.citPrivateDuelStatusRetreat;
    }

    function installPrivateDuelRetreatObserver() {
      cleanupPrivateDuelRetreat();
      if (typeof MutationObserver !== "function" || !document.body) {
        return;
      }
      retreatObserver = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          const target = mutation.target && mutation.target.nodeType === 1 ? mutation.target : null;
          if (target && target.closest("#" + ROOT_ID + ",#" + MATERIAL_LAYER_ID + ",#" + ACTOR_LAYER_ID + ",#" + EFFECT_LAYER_ID + ",#" + STATUS_ID)) {
            continue;
          }
          schedulePrivateDuelRetreatCheck(80);
          return;
        }
      });
      retreatObserver.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["class", "style", "hidden", "aria-expanded", "data-state", "open"]
      });
      state.cleanupRetreat = cleanupPrivateDuelRetreat;
    }

    function afterDefaultContact(callback) {
      actorLayer.classList.remove("is-disappearing");
      actorLayer.classList.remove("is-aggregating");
      actorLayer.classList.remove("is-impacting");
      actorLayer.classList.remove("is-recomposing");
      actorLayer.dataset.privateDuelRetreat = "none";
      document.documentElement.dataset.citPrivateDuelRetreat = "none";
      positionPrivateDuelLayout();
      const firstFrame = requestAnimationFrame(() => {
        const secondFrame = requestAnimationFrame(() => {
          const impact = resolvedImpactPoint();
          if (impact && impact.distance <= 260) {
            state.lastDefaultContactImpact = {
              x: Math.round(impact.x),
              y: Math.round(impact.y),
              distance: Math.round(impact.distance)
            };
            callback(impact);
          } else {
            state.lastDefaultContactImpact = null;
            callback(null);
          }
        });
        state.timers.push(secondFrame);
      });
      state.timers.push(firstFrame);
    }

    function scheduleRetreatAggregationSparks(sourceReason, options = {}) {
      if (retreatAggregationInFlight) {
        state.retreatAggregationSkipped = "in-flight";
        return false;
      }
      if (effectWindowActive()) {
        state.retreatAggregationSkipped = "effect-window";
        return false;
      }
      const now = performance.now();
      if (!options.bypassCooldown && now - lastRetreatAggregationAt < Math.max(1500, state.cooldownMs)) {
        state.retreatAggregationSkipped = "cooldown";
        return false;
      }
      retreatAggregationInFlight = true;
      lastRetreatAggregationAt = now;
      reserveEffectWindow(3200, "retreat-aggregation");
      state.retreatAggregationSkipped = "";
      state.retreatAggregationSourceReason = String(sourceReason || "retreat");
      const timer = setTimeout(() => {
        fireRetreatAggregationSparks(sourceReason);
      }, 80);
      const failSafeTimer = setTimeout(() => {
        retreatAggregationInFlight = false;
      }, 2200);
      state.timers.push(timer);
      state.timers.push(failSafeTimer);
      return true;
    }

    function fireRetreatAggregationSparks(sourceReason) {
      let impactAccepted = false;
      const acceptImpact = (impact, source) => {
        if (impactAccepted || !impact || impact.distance > 260) {
          return false;
        }
        impactAccepted = true;
        state.lastRetreatAggregation = {
          sourceReason: String(sourceReason || "retreat"),
          source: String(source || "default-contact"),
          x: Math.round(impact.x),
          y: Math.round(impact.y),
          distance: Math.round(impact.distance)
        };
        state.lastCollisionImpact = {
          x: Math.round(impact.x),
          y: Math.round(impact.y),
          distance: Math.round(impact.distance)
        };
        actorLayer.classList.add("is-aggregating");
        const impactTimer = setTimeout(() => {
          actorLayer.classList.remove("is-aggregating");
          drawImpactSparks(impact);
          retreatAggregationInFlight = false;
        }, 700);
        state.timers.push(impactTimer);
        return true;
      };
      afterDefaultContact((impact) => {
        acceptImpact(impact, "after-default-contact");
      });
      const fallbackTimer = setTimeout(() => {
        if (impactAccepted) {
          return;
        }
        const fallbackImpact = resolvedImpactPoint();
        state.lastRetreatAggregationFallback = fallbackImpact ? {
          x: Math.round(fallbackImpact.x),
          y: Math.round(fallbackImpact.y),
          distance: Math.round(fallbackImpact.distance)
        } : null;
        if (!acceptImpact(fallbackImpact, "fallback-resolved-impact")) {
          retreatAggregationInFlight = false;
          releaseEffectWindow("retreat-aggregation-no-impact", 700);
        }
      }, 180);
      state.timers.push(fallbackTimer);
      return true;
    }

    function makeParticle(origin, index) {
      const angle = -Math.PI * 0.95 + Math.random() * Math.PI * 1.62;
      const speed = 140 + Math.random() * 360;
      const longTail = index % 3 === 0;
      const isDot = index % 5 === 0;
      const colors = ["#fff6ce", "#ffd15b", "#ff8a24", "#ffef9e", "#ffffff"];
      return {
        x: origin.x + (Math.random() - 0.5) * 18,
        y: origin.y + (Math.random() - 0.5) * 14,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed + (Math.random() - 0.5) * 80,
        life: 260 + Math.random() * 520,
        delay: Math.random() * 90,
        width: isDot ? 1.5 + Math.random() * 2.5 : 1 + Math.random() * 2,
        length: isDot ? 0 : (longTail ? 38 + Math.random() * 64 : 12 + Math.random() * 36),
        color: colors[index % colors.length],
        dot: isDot
      };
    }

    function makeRecomposeParticle(origin, index) {
      const angle = Math.PI * 2 * (index / 28) + (Math.random() - 0.5) * 0.32;
      const speed = 70 + Math.random() * 160;
      const colors = ["#ff8a24", "#fff6ce", "#5ee8ff", "#ffd15b"];
      return {
        x: origin.x + (Math.random() - 0.5) * 10,
        y: origin.y + (Math.random() - 0.5) * 10,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 220 + Math.random() * 260,
        width: 1.2 + Math.random() * 2.2,
        length: 16 + Math.random() * 30,
        color: colors[index % colors.length]
      };
    }

    function fireRecomposeSparks(impact) {
      const selectedImpact = impact || resolvedImpactPoint();
      if (!selectedImpact) {
        releaseEffectWindow("recompose-no-impact", 700);
        return false;
      }
      resizeCanvas();
      const ratio = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        releaseEffectWindow("recompose-no-context", 700);
        return false;
      }
      const origin = {
        x: selectedImpact.x * ratio,
        y: selectedImpact.y * ratio
      };
      const particles = Array.from({ length: 28 }, (_value, index) => makeRecomposeParticle(origin, index));
      const startedAt = performance.now();
      state.lastRecomposeAt = Math.round(startedAt);
      actorLayer.classList.add("is-recomposing");

      function draw(frameNow) {
        const elapsed = frameNow - startedAt;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.globalCompositeOperation = "lighter";
        for (const particle of particles) {
          if (elapsed > particle.life) {
            continue;
          }
          const t = elapsed / particle.life;
          const x = particle.x + particle.vx * t * 0.32;
          const y = particle.y + particle.vy * t * 0.32;
          const tailX = Math.cos(Math.atan2(particle.vy, particle.vx)) * particle.length * ratio * (1 - t * 0.4);
          const tailY = Math.sin(Math.atan2(particle.vy, particle.vx)) * particle.length * ratio * (1 - t * 0.4);
          ctx.globalAlpha = Math.max(0, 1 - t);
          ctx.strokeStyle = particle.color;
          ctx.lineWidth = particle.width * ratio;
          ctx.beginPath();
          ctx.moveTo(x - tailX * 0.5, y - tailY * 0.5);
          ctx.lineTo(x + tailX * 0.5, y + tailY * 0.5);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
        if (elapsed < 520) {
          const id = requestAnimationFrame(draw);
          state.timers.push(id);
        } else {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          actorLayer.classList.remove("is-recomposing");
          releaseEffectWindow("recompose-complete", 900);
        }
      }
      const id = requestAnimationFrame(draw);
      state.timers.push(id);
      return true;
    }

    function drawImpactSparks(impact) {
      resizeCanvas();
      const ratio = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        releaseEffectWindow("impact-no-context", 700);
        return false;
      }
      const origin = {
        x: impact.x * ratio,
        y: impact.y * ratio
      };
      state.lastImpactSparkOrigin = {
        cssX: Math.round(impact.x),
        cssY: Math.round(impact.y),
        canvasX: Math.round(origin.x),
        canvasY: Math.round(origin.y),
        ratio
      };
      const particles = Array.from({ length: 64 }, (_, index) => makeParticle(origin, index));
      const startedAt = performance.now();
      actorLayer.classList.add("is-impacting");

      function draw(frameNow) {
        const elapsed = frameNow - startedAt;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.globalCompositeOperation = "lighter";
        if (elapsed < 460) {
          const pulse = Math.max(0, 1 - elapsed / 460);
          const radius = (26 + 70 * (1 - pulse)) * ratio;
          const glow = ctx.createRadialGradient(origin.x, origin.y, 0, origin.x, origin.y, radius);
          glow.addColorStop(0, "rgba(255, 248, 194, " + (0.58 * pulse).toFixed(3) + ")");
          glow.addColorStop(0.38, "rgba(255, 132, 36, " + (0.34 * pulse).toFixed(3) + ")");
          glow.addColorStop(0.72, "rgba(94, 232, 255, " + (0.18 * pulse).toFixed(3) + ")");
          glow.addColorStop(1, "rgba(255, 132, 36, 0)");
          ctx.fillStyle = glow;
          ctx.globalAlpha = 1;
          ctx.beginPath();
          ctx.arc(origin.x, origin.y, radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "rgba(255, 238, 162, " + (0.74 * pulse).toFixed(3) + ")";
          ctx.lineWidth = 2.2 * ratio;
          ctx.beginPath();
          ctx.moveTo(origin.x - 68 * ratio, origin.y + 4 * ratio);
          ctx.lineTo(origin.x + 68 * ratio, origin.y - 4 * ratio);
          ctx.moveTo(origin.x - 8 * ratio, origin.y - 56 * ratio);
          ctx.lineTo(origin.x + 8 * ratio, origin.y + 56 * ratio);
          ctx.stroke();
        }
        for (const particle of particles) {
          const age = elapsed - particle.delay;
          if (age < 0 || age > particle.life) {
            continue;
          }
          const t = age / particle.life;
          const x = particle.x + particle.vx * t * 0.42;
          const y = particle.y + particle.vy * t * 0.42 + 36 * t * t;
          const alpha = Math.max(0, 1 - t);
          ctx.strokeStyle = particle.color;
          ctx.fillStyle = particle.color;
          ctx.globalAlpha = alpha;
          ctx.lineWidth = particle.width * ratio;
          if (particle.dot) {
            ctx.beginPath();
            ctx.arc(x, y, particle.width * ratio * (1.1 + 1.4 * (1 - t)), 0, Math.PI * 2);
            ctx.fill();
          } else {
            const tailX = Math.cos(Math.atan2(particle.vy, particle.vx)) * particle.length * ratio * (1 - t * 0.35);
            const tailY = Math.sin(Math.atan2(particle.vy, particle.vx)) * particle.length * ratio * (1 - t * 0.35);
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x - tailX, y - tailY);
            ctx.stroke();
          }
        }
        ctx.globalAlpha = 1;
        if (elapsed < 1120) {
          const id = requestAnimationFrame(draw);
          state.timers.push(id);
        } else {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          const timer = setTimeout(() => {
            actorLayer.classList.remove("is-impacting");
            state.lastAutoRecomposeSkipped = "disabled-after-impact";
            releaseEffectWindow("impact-complete", 900);
          }, 260);
          state.timers.push(timer);
        }
      }
      const id = requestAnimationFrame(draw);
      state.timers.push(id);
      return true;
    }

    function fireSparks() {
      if (state.triggers >= state.maxAutoTriggers) {
        return false;
      }
      if (effectWindowActive()) {
        state.lastSparkSkipped = "effect-window";
        return false;
      }
      const now = performance.now();
      if (now - state.lastTriggerAt < state.cooldownMs) {
        state.lastSparkSkipped = "cooldown";
        return false;
      }
      reserveEffectWindow(3600, "person-aggregation");
      state.lastTriggerAt = now;
      state.lastSparkSkipped = "";
      afterDefaultContact((impact) => {
        if (!impact) {
          state.lastCollisionImpact = null;
          releaseEffectWindow("person-aggregation-no-impact", 700);
          return;
        }
        state.triggers += 1;
        state.actorDisappeared = true;
        state.lastCollisionImpact = {
          x: Math.round(impact.x),
          y: Math.round(impact.y),
          distance: Math.round(impact.distance)
        };
        actorLayer.classList.add("is-disappearing");
        const aggregateTimer = setTimeout(() => {
          actorLayer.classList.remove("is-disappearing");
          actorLayer.classList.add("is-aggregating");
        }, 390);
        const impactTimer = setTimeout(() => {
          actorLayer.classList.remove("is-aggregating");
          drawImpactSparks(impact);
        }, 1040);
        state.timers.push(aggregateTimer);
        state.timers.push(impactTimer);
      });
      return true;
    }

    function personAggregationRouteKey() {
      const href = String(window.location && window.location.href ? window.location.href : "");
      const search = String(window.location && window.location.search ? window.location.search : "");
      let initialRoute = "";
      try {
        initialRoute = new URLSearchParams(search).get("initialRoute") || "";
      } catch {
        initialRoute = "";
      }
      const routeKey = [href, initialRoute].join(" ");
      return /avatar-overlay|person-aggregation|character-aggregation/i.test(routeKey) ? routeKey : "";
    }

    function triggerPersonAggregationEffect() {
      const routeKey = personAggregationRouteKey();
      if (!routeKey || state.lastAggregationRouteKey === routeKey) {
        return false;
      }
      state.lastAggregationRouteKey = routeKey;
      const timer = setTimeout(() => {
        positionPrivateDuelLayout();
        fireSparks();
      }, 340);
      state.timers.push(timer);
      return true;
    }

    state.fireCollisionSparks = fireSparks;
    state.fireRecomposeAtDefaultContact = () => {
      afterDefaultContact((defaultImpact) => {
        fireRecomposeSparks(defaultImpact);
      });
      return true;
    };
    state.forceRetreatAggregationReturn = (sourceReason = "retreat-release") => {
      state.retreatWasActive = false;
      state.lastRetreat = "none";
      actorLayer.dataset.privateDuelRetreat = "none";
      document.documentElement.dataset.citPrivateDuelRetreat = "none";
      return scheduleRetreatAggregationSparks(sourceReason);
    };

    state.onResize = () => {
      resizeCanvas();
      positionPrivateDuelLayout();
      markTopRightActions();
      schedulePrivateDuelRetreatCheck(80);
    };
    window.addEventListener("resize", state.onResize, { passive: true });
    installPackagedBlackShellModules();
    installPrivateDuelRetreatObserver();
    resizeCanvas();
    positionPrivateDuelLayout();
    markTopRightActions();
    updatePrivateDuelRetreat();
    triggerPersonAggregationEffect();
    state.timers.push(setInterval(() => {
      enforceChainsawOnlyVisuals();
      if (window.__CODEX_INTERFACE_THEME_SURFACE_REGISTRY__ && typeof window.__CODEX_INTERFACE_THEME_SURFACE_REGISTRY__.tick === "function") {
        window.__CODEX_INTERFACE_THEME_SURFACE_REGISTRY__.tick("black-shell");
      }
      positionPrivateDuelLayout();
      updatePrivateDuelRetreat();
      triggerPersonAggregationEffect();
    }, 5000));

    return {
      ok: true,
      mode,
      packId: payload.packId,
      revision: payload.revision,
      transparentInjection: true,
      rightSideAccessory: false,
      chainsawOnly: true,
      formalAnimalArtHidden: true,
      selectedRuntimePayloadBytes: payload.selectedRuntimePayloadBytes
    };
  })()`;
}

async function applyToTarget(target, payload, mode) {
  const session = new CdpSession(target.webSocketDebuggerUrl);
  try {
    await session.open();
    await session.send("Runtime.enable", {}, 3000);
    const result = await session.send("Runtime.evaluate", {
      expression: privateDuelRuntime(payload, mode),
      awaitPromise: true,
      returnByValue: true
    }, 15000);
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text || "runtime evaluation failed");
    }
    return {
      targetTitle: target.title || "",
      targetUrl: target.url || "",
      result: result.result?.value || null
    };
  } finally {
    session.close();
  }
}

function printResult(format, result) {
  if (format === "json") {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log("Private duel injector");
  console.log(`pack: ${result.packId}`);
  console.log(`mode: ${result.mode}`);
  console.log(`payload: ${result.selectedRuntimePayloadBytes}/${result.targetRuntimePayloadBytes} bytes`);
  console.log(`transparent: ${result.transparentInjection ? "yes" : "no"}`);
  console.log(`chainsawOnly: ${result.chainsawOnly ? "yes" : "no"}`);
  console.log(`targets: ${result.targets.length}`);
  for (const target of result.targets) {
    console.log(`- ${target.targetUrl || target.targetTitle}: ok=${target.result?.ok === true}`);
  }
}

async function main() {
  const options = parseArgs(process.argv);
  if (options.help) {
    console.log(usage());
    return;
  }
  const format = formatOption(options);
  const packId = String(options.pack || DEFAULT_PACK_ID);
  const mode = options.remove ? "remove" : "apply";
  if (!options["dry-run"] && !options.once && !options.remove) {
    throw new Error("choose one of --once, --remove, or --dry-run");
  }
  const payload = loadPrivatePayload(packId);
  const result = {
    ok: true,
    dryRun: Boolean(options["dry-run"]),
    mode,
    packId,
    transparentInjection: payload.policy.transparentInjection,
    chainsawOnly: true,
    formalAnimalArtHidden: true,
    selectedRuntimePayloadBytes: payload.selectedRuntimePayloadBytes,
    targetRuntimePayloadBytes: payload.targetRuntimePayloadBytes,
    targets: []
  };
  if (options["dry-run"]) {
    printResult(format, result);
    return;
  }
  const port = Number(options.port || DEFAULT_PORT);
  const waitMs = Number(options["wait-ms"] || DEFAULT_WAIT_MS);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error("--port must be a valid TCP port");
  }
  if (!Number.isInteger(waitMs) || waitMs < 0 || waitMs > 60000) {
    throw new Error("--wait-ms must be between 0 and 60000");
  }
  const targets = await waitForTargets(port, waitMs);
  for (const target of targets) {
    result.targets.push(await applyToTarget(target, payload, mode));
  }
  printResult(format, result);
}

main().catch((error) => {
  console.error(`[private-duel-injector][error] ${error.message}`);
  process.exit(1);
});
