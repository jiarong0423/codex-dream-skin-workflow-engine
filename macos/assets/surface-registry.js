(function codexInterfaceThemeSurfaceRegistryFactory() {
  "use strict";

  const INTERVAL_MS = 2500;
  const MAX_CANDIDATES_PER_MODULE = 32;
  const DYNAMIC_SCAN_DELAYS = [80, 260, 720];
  const BLACK_SHELL_SETTLE_DELAY_MS = 360;
  const ROOT_ATTR = "data-codex-interface-theme";
  const LOCK_ATTR = "data-cit-surface-lock";
  const MODULE_ATTR = "data-cit-surface-module";
  const KIND_ATTR = "data-cit-surface-kind";
  const REVISION_ATTR = "data-cit-surface-lock-revision";
  const SOURCE_PREVIEW_ATTR = "data-cit-source-preview-block";
  const SOURCE_PREVIEW_KIND_ATTR = "data-cit-source-preview-kind";
  const DRAG_RISK_ATTR = "data-cit-drag-risk";
  const HIGH_MEMORY_DRAG_RISK = "high-memory-image-resize";
  const BLACK_SHELL_ATTR = "data-cit-black-shell";
  const BLACK_SHELL_REASON_ATTR = "data-cit-black-shell-reason";
  const BLACK_SHELL_PROTECTED_SELECTOR = "button,input,textarea,select,pre,code,kbd,samp,img,video,canvas,iframe,picture,source,svg,a,[role=\"button\"],[role=\"menuitem\"],[role=\"option\"],[role=\"textbox\"],[role=\"switch\"],[role=\"checkbox\"],[role=\"tab\"],[role=\"slider\"],[role=\"combobox\"],[contenteditable=\"true\"],[data-slate-editor=\"true\"],[data-testid=\"composer\"],[data-testid=\"message-composer\"],[data-cit-source-preview-block=\"true\"],[data-cit-drag-risk=\"high-memory-image-resize\"]";
  const BLACK_SHELL_PROTECTED_ANCESTOR_SELECTOR = "[role=\"dialog\"],[role=\"menu\"],[role=\"listbox\"],[data-radix-popper-content-wrapper],[cmdk-root],[data-cmdk-root],.composer-surface-chrome,.codex-interface-theme-composer-surface,aside.app-shell-left-panel,[data-cit-workspace-picker=\"shell\"],.codex-interface-theme-workspace-picker";
  const BLACK_SHELL_EXCLUDE_SELECTOR = `${BLACK_SHELL_PROTECTED_SELECTOR},${BLACK_SHELL_PROTECTED_ANCESTOR_SELECTOR}`;
  const BLACK_SHELL_CANDIDATE_SELECTOR =
    "[data-cit-black-shell-candidate=\"true\"]";
  const MODULE_ORDER = [
    "sidebarNavigation",
    "titlebar",
    "searchControls",
    "composerSurface",
    "sourcePreviewBlocks",
    "rightPanels",
    "transientPopovers",
    "sourceAndDraggable"
  ];

  const previous = window.__CODEX_INTERFACE_THEME_SURFACE_REGISTRY__;
  if (previous && typeof previous.cleanup === "function") {
    previous.cleanup();
  }

  let revision = "unknown";
  let lastRunAt = 0;
  let locks = new WeakMap();
  let installed = false;
  let blackShellSettleTimer = null;
  let dynamicSurfaceTimers = [];

  function visible(node) {
    if (!node || node.nodeType !== 1) {
      return false;
    }
    const rect = node.getBoundingClientRect();
    const style = window.getComputedStyle(node);
    return rect.width >= 2 && rect.height >= 2 && rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth && style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || "1") > 0.02;
  }

  function excluded(node) {
    return Boolean(
      !node ||
      node === document.documentElement ||
      node === document.body ||
      node.closest("#codex-interface-theme-backdrop,#codex-interface-theme-right-hud,#codex-interface-theme-character,#codex-interface-theme-badge,#codex-interface-theme-marker")
    );
  }

  function rightSide(node) {
    if (!visible(node) || node.closest("aside.app-shell-left-panel")) {
      return false;
    }
    const rect = node.getBoundingClientRect();
    return rect.left > window.innerWidth * 0.35 || rect.width > window.innerWidth * 0.35;
  }

  function norm(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function surfaceText(node) {
    if (!node || node.nodeType !== 1) {
      return "";
    }
    return norm([
      node.getAttribute("aria-label"),
      node.getAttribute("title"),
      node.getAttribute("data-cit-source-preview-kind"),
      node.getAttribute("data-testid"),
      node.getAttribute("class"),
      String(node.innerText || node.textContent || "").slice(0, 220)
    ].filter(Boolean).join(" "));
  }

  function sourcePreviewSignal(node) {
    const text = surfaceText(node);
    return /來源|source|attachment|附件|使用者附件|user attachment|截圖|screenshot|讀取檔案|read file|預覽|preview|調整大小|resize|拖曳|drag/i.test(text);
  }

  function mediaSignal(node) {
    if (!node || node.nodeType !== 1) {
      return false;
    }
    const tag = String(node.tagName || "").toLowerCase();
    return tag === "img" || tag === "video" || tag === "canvas" || Boolean(node.querySelector("img,video,canvas"));
  }

  function sourcePreviewOwner(node) {
    if (!node || node.nodeType !== 1) {
      return null;
    }
    const existing = node.closest(`[${SOURCE_PREVIEW_ATTR}="true"]`);
    if (existing && visible(existing) && !excluded(existing)) {
      return existing;
    }
    let current = node;
    let best = null;
    for (let depth = 0; current && current.nodeType === 1 && depth < 6; depth += 1) {
      if (excluded(current)) {
        break;
      }
      if (visible(current)) {
        const rect = current.getBoundingClientRect();
        const hasSourceText = sourcePreviewSignal(current);
        const hasMedia = mediaSignal(current);
        const inTransientHost = Boolean(current.closest("[data-radix-popper-content-wrapper],[role=\"dialog\"],[role=\"listbox\"],[role=\"menu\"],[cmdk-root]"));
        const resizable = current.getAttribute("draggable") === "true" || /調整大小|resize|拖曳|drag/i.test(surfaceText(current));
        const boundedPanel = rect.width >= 120 && rect.height >= 44 && rect.width <= window.innerWidth * 0.92 && rect.height <= window.innerHeight * 0.92;
        if (boundedPanel && ((hasSourceText && (hasMedia || inTransientHost || resizable)) || (hasMedia && resizable))) {
          best = current;
        }
      }
      current = current.parentElement;
    }
    return best || (sourcePreviewSignal(node) || mediaSignal(node) ? node : null);
  }

  function sourcePreviewKind(node) {
    const text = surfaceText(node).toLowerCase();
    if (/截圖|screenshot/.test(text)) {
      return "screenshot";
    }
    if (/附件|attachment|user attachment|使用者附件/.test(text)) {
      return "attachment";
    }
    if (/來源|source|讀取檔案|read file/.test(text)) {
      return "source";
    }
    if (/resize|調整大小|drag|拖曳/.test(text)) {
      return "resizable-preview";
    }
    return "preview";
  }

  function candidates(moduleName) {
    if (moduleName === "sidebarNavigation") {
      return document.querySelectorAll("aside.app-shell-left-panel");
    }
    if (moduleName === "titlebar") {
      return document.querySelectorAll("header");
    }
    if (moduleName === "searchControls") {
      return document.querySelectorAll("input");
    }
    if (moduleName === "composerSurface") {
      return document.querySelectorAll(".composer-surface-chrome");
    }
    if (moduleName === "sourcePreviewBlocks") {
      return document.querySelectorAll(`[${SOURCE_PREVIEW_ATTR}="true"],[${DRAG_RISK_ATTR}="${HIGH_MEMORY_DRAG_RISK}"],[draggable="true"],img,video,canvas,[data-radix-popper-content-wrapper] > *,[role="dialog"],[role="listbox"],[role="menu"]`);
    }
    if (moduleName === "rightPanels") {
      return document.querySelectorAll("body aside, body [role=\"dialog\"], body [data-state=\"open\"]");
    }
    if (moduleName === "transientPopovers") {
      return document.querySelectorAll("[data-radix-popper-content-wrapper],[role=\"listbox\"],[role=\"menu\"],[cmdk-root]");
    }
    return document.querySelectorAll("[draggable=\"true\"],img,video");
  }

  function qualifies(moduleName, node) {
    if (excluded(node) || !visible(node)) {
      return false;
    }
    if (moduleName === "titlebar" && node.closest("aside.app-shell-left-panel")) {
      return false;
    }
    if (moduleName === "searchControls" && node.closest(".composer-surface-chrome")) {
      return false;
    }
    if (moduleName === "composerSurface") {
      const rect = node.getBoundingClientRect();
      return rect.width >= 320 && rect.height >= 48 && rect.top >= window.innerHeight - 230;
    }
    if (moduleName === "sourcePreviewBlocks") {
      return Boolean(sourcePreviewOwner(node));
    }
    if (moduleName === "rightPanels") {
      return rightSide(node);
    }
    if (moduleName === "transientPopovers") {
      const rect = node.getBoundingClientRect();
      return rect.width >= 160 && rect.height >= 48 && rightSide(node);
    }
    if (moduleName === "sourceAndDraggable") {
      const tag = String(node.tagName || "").toLowerCase();
      const rect = node.getBoundingClientRect();
      return (tag === "img" || tag === "video" || node.getAttribute("draggable") === "true") && rect.width >= 24 && rect.height >= 24;
    }
    return true;
  }

  function ownerNodeFor(moduleName, node) {
    if (moduleName === "sourcePreviewBlocks") {
      return sourcePreviewOwner(node);
    }
    return node;
  }

  function lockNode(moduleName, node) {
    const existing = locks.get(node);
    if (existing) {
      return false;
    }
    const existingModule = node.getAttribute(MODULE_ATTR);
    const lockedModule = node.getAttribute(LOCK_ATTR) === "locked" && existingModule ? existingModule : moduleName;
    locks.set(node, { moduleName: lockedModule, firstSeenRevision: node.getAttribute(REVISION_ATTR) || revision });
    node.setAttribute(LOCK_ATTR, "locked");
    node.setAttribute(MODULE_ATTR, lockedModule);
    node.setAttribute(KIND_ATTR, "native-boundary");
    node.setAttribute(REVISION_ATTR, node.getAttribute(REVISION_ATTR) || revision);
    if (lockedModule === "sourcePreviewBlocks") {
      node.setAttribute(SOURCE_PREVIEW_ATTR, "true");
      node.setAttribute(SOURCE_PREVIEW_KIND_ATTR, node.getAttribute(SOURCE_PREVIEW_KIND_ATTR) || sourcePreviewKind(node));
      node.setAttribute(DRAG_RISK_ATTR, HIGH_MEMORY_DRAG_RISK);
      node.setAttribute(KIND_ATTR, "source-preview");
    }
    return true;
  }

  function bypassInterval(reason) {
    const value = String(reason || "");
    return value === "install" || value === "route" || value === "black-shell" || value === "manual-black-shell" || value.startsWith("settle-install-") || value.startsWith("settle-route-");
  }

  function scan(reason) {
    if (!installed || !document.body) {
      return 0;
    }
    const now = Date.now();
    if (!bypassInterval(reason) && now - lastRunAt < INTERVAL_MS) {
      return 0;
    }
    lastRunAt = now;
    const claimed = new Set();
    let discovered = 0;
    for (const moduleName of MODULE_ORDER) {
      let count = 0;
      for (const node of candidates(moduleName)) {
        if (count >= MAX_CANDIDATES_PER_MODULE) {
          break;
        }
        if (!qualifies(moduleName, node)) {
          continue;
        }
        const ownerNode = ownerNodeFor(moduleName, node);
        if (!ownerNode || claimed.has(ownerNode)) {
          continue;
        }
        claimed.add(ownerNode);
        if (lockNode(moduleName, ownerNode)) {
          discovered += 1;
        }
        count += 1;
      }
    }
    const lockedCount = document.querySelectorAll(`[${LOCK_ATTR}=\"locked\"]`).length;
    const sourcePreviewCount = document.querySelectorAll(`[${SOURCE_PREVIEW_ATTR}=\"true\"]`).length;
    const highMemoryDragCount = document.querySelectorAll(`[${DRAG_RISK_ATTR}=\"${HIGH_MEMORY_DRAG_RISK}\"]`).length;
    const root = document.documentElement;
    root.dataset.citSurfaceRegistry = "active";
    root.dataset.citSurfaceRegistryIntervalMs = String(INTERVAL_MS);
    root.dataset.citSurfaceRegistryLastReason = String(reason || "phase");
    root.dataset.citSurfaceRegistryDiscovered = String(discovered);
    root.dataset.citSurfaceLocks = String(lockedCount);
    root.dataset.citSourcePreviewBlocks = String(sourcePreviewCount);
    root.dataset.citHighMemoryDragBlocks = String(highMemoryDragCount);
    return discovered;
  }

  function colorParts(value) {
    const match = String(value || "").match(/rgba?\(([^)]+)\)/i);
    if (!match) {
      return null;
    }
    const parts = match[1].split(/[,\s/]+/).filter(Boolean);
    if (parts.length < 3) {
      return null;
    }
    return {
      r: Number(parts[0]),
      g: Number(parts[1]),
      b: Number(parts[2]),
      a: parts.length >= 4 ? Number(parts[3]) : 1
    };
  }

  function nearBlackShellColor(value) {
    const color = colorParts(value);
    if (!color || !Number.isFinite(color.r) || !Number.isFinite(color.g) || !Number.isFinite(color.b) || !Number.isFinite(color.a)) {
      return false;
    }
    return color.a >= 0.72 && Math.max(color.r, color.g, color.b) <= 38 && (color.r + color.g + color.b) <= 84;
  }

  function protectedBlackShellSurface(node) {
    if (!node || node.nodeType !== 1) {
      return true;
    }
    if (
      node.matches(BLACK_SHELL_EXCLUDE_SELECTOR) ||
      node.closest(BLACK_SHELL_PROTECTED_ANCESTOR_SELECTOR) ||
      node.closest(`[${SOURCE_PREVIEW_ATTR}="true"],[${DRAG_RISK_ATTR}="${HIGH_MEMORY_DRAG_RISK}"]`)
    ) {
      return true;
    }
    const role = String(node.getAttribute("role") || "").toLowerCase();
    if (/button|menuitem|option|textbox|switch|checkbox|tab|slider|combobox/.test(role)) {
      return true;
    }
    const text = surfaceText(node).toLowerCase();
    return /composer|message-composer|editor|monaco|codemirror|mcp content|model context|iframe|canvas|video|source preview|attachment preview|使用者附件|來源預覽|截圖預覽/.test(text) && mediaSignal(node);
  }

  function blackShellPrimitive(node) {
    return protectedBlackShellSurface(node);
  }

  function protectedBlackShellSurfaceCount() {
    let count = 0;
    for (const node of document.querySelectorAll(BLACK_SHELL_EXCLUDE_SELECTOR)) {
      if (visible(node)) {
        count += 1;
      }
      if (count >= 999) {
        break;
      }
    }
    return count;
  }

  function cleanupOwnBlackShellResidue(reason) {
    let cleaned = 0;
    document.querySelectorAll(`[${BLACK_SHELL_ATTR}="true"]`).forEach((node) => {
      if (!node.isConnected || !blackShellCandidate(node)) {
        node.removeAttribute(BLACK_SHELL_ATTR);
        node.removeAttribute(BLACK_SHELL_REASON_ATTR);
        cleaned += 1;
      }
    });
    const root = document.documentElement;
    root.dataset.citBlackShellLastCleanupReason = String(reason || "preflight");
    root.dataset.citBlackShellCleaned = String(cleaned);
    return cleaned;
  }

  function runBlackShellPreflight(reason) {
    const blackShellCleaned = cleanupOwnBlackShellResidue(reason);
    const protectedCount = protectedBlackShellSurfaceCount();
    const root = document.documentElement;
    root.dataset.citSurfacePreflight = "cleanup-then-exclude";
    root.dataset.citSurfacePreflightReason = String(reason || "phase");
    root.dataset.citProtectedSurfaces = String(protectedCount);
    return { blackShellCleaned, protectedCount };
  }

  function blackShellCandidate(node) {
    if (!node.matches(BLACK_SHELL_CANDIDATE_SELECTOR)) {
      return false;
    }
    if (excluded(node) || !visible(node) || blackShellPrimitive(node)) {
      return false;
    }
    const rect = node.getBoundingClientRect();
    const viewportArea = Math.max(1, window.innerWidth * window.innerHeight);
    if (rect.width < 220 || rect.height < 96 || rect.width * rect.height < 36000) {
      return false;
    }
    if (rect.width * rect.height > viewportArea * 0.93) {
      return false;
    }
    const style = window.getComputedStyle(node);
    if (!nearBlackShellColor(style.backgroundColor)) {
      return false;
    }
    return node.children.length > 0 || /main|region|complementary/i.test(String(node.getAttribute("role") || ""));
  }

  function collectBlackShellCandidates() {
    const nodes = Array.from(document.querySelectorAll(BLACK_SHELL_CANDIDATE_SELECTOR)).filter(blackShellCandidate);
    nodes.sort((left, right) => {
      const leftRect = left.getBoundingClientRect();
      const rightRect = right.getBoundingClientRect();
      return leftRect.width * leftRect.height - rightRect.width * rightRect.height;
    });
    const selected = [];
    for (const node of nodes) {
      if (selected.length >= 12) {
        break;
      }
      if (selected.some((entry) => entry.contains(node) || node.contains(entry))) {
        continue;
      }
      selected.push(node);
    }
    return selected;
  }

  function markBlackShells(reason) {
    runBlackShellPreflight(reason);
    let marked = document.querySelectorAll(`[${BLACK_SHELL_ATTR}="true"]`).length;
    for (const node of collectBlackShellCandidates()) {
      if (node.getAttribute(BLACK_SHELL_ATTR) === "true") {
        continue;
      }
      node.setAttribute(BLACK_SHELL_ATTR, "true");
      node.setAttribute(BLACK_SHELL_REASON_ATTR, String(reason || "scan"));
      marked += 1;
    }
    const root = document.documentElement;
    root.dataset.citBlackShellTransparency = "active";
    root.dataset.citBlackShellLocks = String(marked);
    return marked;
  }

  function scanBlackShells(reason) {
    if (!installed || !document.body) {
      return 0;
    }
    const marked = markBlackShells(reason || "manual");
    const root = document.documentElement;
    root.dataset.citBlackShellLastReason = String(reason || "manual");
    root.dataset.citBlackShellScanMode = "static";
    return marked;
  }

  function clearBlackShellSettleTimer() {
    if (blackShellSettleTimer !== null) {
      window.clearTimeout(blackShellSettleTimer);
      blackShellSettleTimer = null;
    }
  }

  function scheduleBlackShellScan(reason) {
    if (!installed || !document.body) {
      return;
    }
    clearBlackShellSettleTimer();
    const stableReason = String(reason || "route");
    blackShellSettleTimer = window.setTimeout(() => {
      blackShellSettleTimer = null;
      scanBlackShells(`settled-${stableReason}`);
    }, BLACK_SHELL_SETTLE_DELAY_MS);
    document.documentElement.dataset.citBlackShellScheduledReason = stableReason;
  }

  function clearDynamicSurfaceTimers() {
    for (const timer of dynamicSurfaceTimers) {
      window.clearTimeout(timer);
    }
    dynamicSurfaceTimers = [];
  }

  // Bounded post-mount settling only. No user-input or geometry listeners.
  function scheduleDynamicSurfaceScans(reason) {
    if (!installed || !document.body) {
      return;
    }
    clearDynamicSurfaceTimers();
    const stableReason = String(reason || "route");
    dynamicSurfaceTimers = DYNAMIC_SCAN_DELAYS.map((delay, index) => {
      let timer = null;
      timer = window.setTimeout(() => {
        dynamicSurfaceTimers = dynamicSurfaceTimers.filter((entry) => entry !== timer);
        scan(`settle-${stableReason}-${index + 1}`);
      }, delay);
      return timer;
    });
    document.documentElement.dataset.citSurfaceRegistryDynamic = `settle-${stableReason}`;
  }

  function triggerDynamicSurfaceScan(reason) {
    const value = String(reason || "");
    if (value !== "install" && value !== "route") {
      return 0;
    }
    scheduleDynamicSurfaceScans(value);
    return 0;
  }

  function installDynamicSurfaceHooks() {
    // Legacy API boundary retained without attaching native interaction listeners.
  }

  function cleanupDynamicSurfaceHooks() {
    clearDynamicSurfaceTimers();
  }

  function install(options) {
    const value = options && typeof options === "object" ? options : {};
    revision = String(value.revision || document.documentElement.getAttribute("data-cit-revision") || "unknown");
    installed = true;
    scan("install");
    installDynamicSurfaceHooks();
    triggerDynamicSurfaceScan("install");
    scheduleBlackShellScan("install");
    return { ok: true, locks: document.querySelectorAll(`[${LOCK_ATTR}=\"locked\"]`).length };
  }

  function tick(reason) {
    const value = reason || "phase";
    const discovered = scan(value);
    if (value === "route") {
      triggerDynamicSurfaceScan("route");
      scheduleBlackShellScan("route");
    }
    if (value === "black-shell" || value === "manual-black-shell") {
      scanBlackShells(value);
    }
    return discovered;
  }

  function cleanup() {
    installed = false;
    cleanupDynamicSurfaceHooks();
    clearBlackShellSettleTimer();
    document.querySelectorAll(`[${LOCK_ATTR}=\"locked\"]`).forEach((node) => {
      node.removeAttribute(LOCK_ATTR);
      node.removeAttribute(MODULE_ATTR);
      node.removeAttribute(KIND_ATTR);
      node.removeAttribute(REVISION_ATTR);
      node.removeAttribute(SOURCE_PREVIEW_ATTR);
      node.removeAttribute(SOURCE_PREVIEW_KIND_ATTR);
      node.removeAttribute(DRAG_RISK_ATTR);
    });
    document.querySelectorAll(`[${BLACK_SHELL_ATTR}=\"true\"]`).forEach((node) => {
      node.removeAttribute(BLACK_SHELL_ATTR);
      node.removeAttribute(BLACK_SHELL_REASON_ATTR);
    });
    locks = new WeakMap();
    const root = document.documentElement;
    delete root.dataset.citSurfaceRegistry;
    delete root.dataset.citSurfaceRegistryIntervalMs;
    delete root.dataset.citSurfaceRegistryLastReason;
    delete root.dataset.citSurfaceRegistryDiscovered;
    delete root.dataset.citSurfaceLocks;
    delete root.dataset.citSourcePreviewBlocks;
    delete root.dataset.citHighMemoryDragBlocks;
    delete root.dataset.citSurfaceRegistryDynamic;
    delete root.dataset.citBlackShellTransparency;
    delete root.dataset.citBlackShellLocks;
    delete root.dataset.citBlackShellLastCleanupReason;
    delete root.dataset.citBlackShellCleaned;
    delete root.dataset.citSurfacePreflight;
    delete root.dataset.citSurfacePreflightReason;
    delete root.dataset.citProtectedSurfaces;
    delete root.dataset.citBlackShellLastReason;
    delete root.dataset.citBlackShellScanMode;
    delete root.dataset.citBlackShellScheduledReason;
    return { ok: true, removed: true };
  }

  const api = { install, tick, cleanup, scanBlackShells };
  window.__CODEX_INTERFACE_THEME_SURFACE_REGISTRY__ = api;
  return install;
})()
