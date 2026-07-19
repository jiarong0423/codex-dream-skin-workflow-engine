#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { TABLE_FLIP_CAT_DEFAULTS } from "./theme-runtime-defaults.mjs";

const MAX_IMAGE_BYTES = 16 * 1024 * 1024;
const MAX_IMAGE_SIDE = 16384;
const MAX_IMAGE_PIXELS = 50_000_000;

function usage() {
  return `Usage:
  theme-store.mjs init --state-dir <dir> --assets-dir <dir>
  theme-store.mjs show --state-dir <dir> --assets-dir <dir>
  theme-store.mjs reset --state-dir <dir> --assets-dir <dir>
  theme-store.mjs set-image --state-dir <dir> --assets-dir <dir> [--image <path>] [theme options]

Theme options:
  --name <name>
  --appearance <auto|light|dark>
  --accent <hex>
  --secondary <hex>
  --highlight <hex>
  --surface <css-color>
  --surface-strong <css-color>
  --mode <chrome-only|sidebar-art|wallpaper>
  --sidebar-accent <hex>
  --sidebar-surface <css-color>
  --sidebar-border <css-color>
  --header-accent <hex>
  --header-surface <css-color>
  --header-border <css-color>
  --composer-accent <hex>
  --composer-surface <css-color>
  --composer-border <css-color>
  --popover-accent <hex>
  --popover-surface <css-color>
  --popover-border <css-color>
  --mecha-armor <hex>
  --mecha-glow <hex>
  --status-success <hex>
  --status-warning <hex>
  --status-danger <hex>
  --status-info <hex>
  --icon-badge-enabled <true|false>
  --icon-badge-path <path>
  --icon-badge-size <32..128>
  --character-enabled <true|false>
  --character-path <path>
  --character-placement <sidebar-hero|right-bottom|off>
  --character-size <180..520>
  --character-opacity <0..1>
  --table-flip-cat-enabled <true|false>
  --table-flip-cat-path <path>
  --table-flip-cat-sprite-path <path>
  --table-flip-cat-poster-path <path>
  --table-flip-cat-trigger-icon-path <path>
  --table-flip-cat-placement <right-bottom|off>
  --table-flip-cat-size <72..180>
  --table-flip-cat-opacity <0..1>
  --table-flip-cat-frame-count <2..60>
  --table-flip-cat-duration-ms <100..10000>
  --icon-buttons-enabled <true|false>
  --icon-buttons-apply-mode <opt-in|module|off>
  --icon-buttons-sidebar-navigation-enabled <true|false>
  --icon-buttons-titlebar-navigation-enabled <true|false>
  --icon-buttons-composer-controls-enabled <true|false>
  --icon-buttons-top-utility-actions-enabled <true|false>
  --icon-buttons-message-actions-enabled <true|false>
  --icon-buttons-project-panel-rows-enabled <true|false>
  --focus-x <0..1>
  --focus-y <0..1>
  --safe-area <auto|left|right|center|none|sides>
  --task-mode <auto|ambient|banner|off>`;
}

function parseArgs(argv) {
  const result = { command: argv[2] || "", options: {} };
  for (let index = 3; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith("--")) {
      throw new Error(`unexpected argument: ${key}`);
    }
    const optionName = key.slice(2);
    if (optionName === "help") {
      result.options.help = true;
      continue;
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`missing value for ${key}`);
    }
    result.options[optionName] = value;
    index += 1;
  }
  return result;
}

function requireOption(options, name) {
  const value = options[name];
  if (!value) {
    throw new Error(`missing required option --${name}`);
  }
  return value;
}

function mkdirp(directory) {
  fs.mkdirSync(directory, { recursive: true });
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJsonAtomic(filePath, value) {
  mkdirp(path.dirname(filePath));
  const payload = `${JSON.stringify(value, null, 2)}\n`;
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, payload, { encoding: "utf8", mode: 0o600 });
  fs.renameSync(tempPath, filePath);
}

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function normalizeHexColor(value, fieldName) {
  if (value === undefined) {
    return undefined;
  }
  const text = String(value).trim();
  if (!/^#[0-9a-fA-F]{6}$/.test(text)) {
    throw new Error(`${fieldName} must be a #RRGGBB color`);
  }
  return text.toLowerCase();
}

function normalizeCssColor(value, fieldName) {
  if (value === undefined) {
    return undefined;
  }
  const text = String(value).trim();
  if (text.length < 3 || text.length > 96) {
    throw new Error(`${fieldName} must contain 3 to 96 characters`);
  }
  if (/[;{}<>]/.test(text) || /url\s*\(/i.test(text) || /expression\s*\(/i.test(text)) {
    throw new Error(`${fieldName} contains unsupported CSS syntax`);
  }
  if (
    !/^#[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(text) &&
    !/^rgba?\(\s*(\d{1,3}\s*,\s*){2}\d{1,3}\s*(,\s*(0|1|0?\.\d+))?\s*\)$/.test(text)
  ) {
    throw new Error(`${fieldName} must be a hex, rgb(), or rgba() color`);
  }
  return text;
}

function normalizeEnum(value, fieldName, allowed) {
  if (value === undefined) {
    return undefined;
  }
  const text = String(value).trim().toLowerCase();
  if (!allowed.includes(text)) {
    throw new Error(`${fieldName} must be one of: ${allowed.join(", ")}`);
  }
  return text;
}

function normalizeBoolean(value, fieldName) {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === "boolean") {
    return value;
  }
  const text = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(text)) {
    return true;
  }
  if (["false", "0", "no", "off"].includes(text)) {
    return false;
  }
  throw new Error(`${fieldName} must be true or false`);
}

function normalizeUnitNumber(value, fieldName) {
  if (value === undefined) {
    return undefined;
  }
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue < 0 || numberValue > 1) {
    throw new Error(`${fieldName} must be a number between 0 and 1`);
  }
  return numberValue;
}

function normalizeIntegerRange(value, fieldName, min, max) {
  if (value === undefined) {
    return undefined;
  }
  const numberValue = Number(value);
  if (!Number.isInteger(numberValue) || numberValue < min || numberValue > max) {
    throw new Error(`${fieldName} must be an integer between ${min} and ${max}`);
  }
  return numberValue;
}

function normalizeAssetPath(value, fieldName) {
  if (value === undefined) {
    return undefined;
  }
  const text = String(value).trim();
  if (text.length < 1 || text.length > 240) {
    throw new Error(`${fieldName} must contain 1 to 240 characters`);
  }
  if (text.includes("\0") || /[<>]/.test(text)) {
    throw new Error(`${fieldName} contains unsupported characters`);
  }
  return text;
}

function sanitizeName(value) {
  if (value === undefined) {
    return undefined;
  }
  const text = String(value).trim();
  if (text.length < 1 || text.length > 80) {
    throw new Error("name must contain 1 to 80 characters");
  }
  return text;
}

function normalizeModuleColorModule(module, fallback) {
  const source = module && typeof module === "object" ? module : {};
  return {
    accent: normalizeHexColor(source.accent || fallback.accent, `${fallback.name}-accent`),
    surface: normalizeCssColor(source.surface || fallback.surface, `${fallback.name}-surface`),
    border: normalizeCssColor(source.border || fallback.border, `${fallback.name}-border`)
  };
}

function normalizeButtonIconPaths(paths) {
  const source = paths && typeof paths === "object" ? paths : {};
  const defaults = {
    search: "icons/buttons/cat-eye-search.svg",
    newTask: "icons/buttons/cat-paw-new-task.svg",
    back: "icons/buttons/cat-tail-back.svg",
    forward: "icons/buttons/cat-tail-forward.svg",
    stop: "icons/buttons/claw-stop.svg",
    settings: "icons/buttons/mecha-ear-settings.svg",
    project: "icons/buttons/neko-chip-project.svg",
    send: "icons/buttons/whisker-send.svg",
    tagTask: "icons/buttons/collar-tag-task.svg",
    files: "icons/buttons/fishbone-files.svg",
    thread: "icons/buttons/yarn-thread.svg",
    clean: "icons/buttons/litter-scoop-clean.svg",
    run: "icons/buttons/food-bowl-run.svg",
    package: "icons/buttons/cat-can-package.svg",
    spark: "icons/buttons/teaser-wand-spark.svg"
  };
  const result = {};
  for (const [key, defaultPath] of Object.entries(defaults)) {
    result[key] = normalizeAssetPath(source[key] || defaultPath, `button-icon-${key}`);
  }
  return result;
}

function normalizeButtonModules(modules) {
  const source = modules && typeof modules === "object" ? modules : {};
  const sidebarNavigation = source.sidebarNavigation && typeof source.sidebarNavigation === "object" ? source.sidebarNavigation : {};
  const sidebarActions = sidebarNavigation.actions && typeof sidebarNavigation.actions === "object" ? sidebarNavigation.actions : {};
  const titlebarNavigation = source.titlebarNavigation && typeof source.titlebarNavigation === "object" ? source.titlebarNavigation : {};
  const titlebarActions = titlebarNavigation.actions && typeof titlebarNavigation.actions === "object" ? titlebarNavigation.actions : {};
  const composerControls = source.composerControls && typeof source.composerControls === "object" ? source.composerControls : {};
  const composerActions = composerControls.actions && typeof composerControls.actions === "object" ? composerControls.actions : {};
  const topUtilityActions = source.topUtilityActions && typeof source.topUtilityActions === "object" ? source.topUtilityActions : {};
  const topUtilityActionMap = topUtilityActions.actions && typeof topUtilityActions.actions === "object" ? topUtilityActions.actions : {};
  const messageActions = source.messageActions && typeof source.messageActions === "object" ? source.messageActions : {};
  const messageActionMap = messageActions.actions && typeof messageActions.actions === "object" ? messageActions.actions : {};
  const projectPanelRows = source.projectPanelRows && typeof source.projectPanelRows === "object" ? source.projectPanelRows : {};
  const projectPanelRowActionMap = projectPanelRows.actions && typeof projectPanelRows.actions === "object" ? projectPanelRows.actions : {};
  return {
    sidebarNavigation: {
      enabled: normalizeBoolean(sidebarNavigation.enabled ?? false, "button-module-sidebar-navigation-enabled"),
      strategy: normalizeEnum(sidebarNavigation.strategy || "text-or-aria-exact-match", "button-module-sidebar-navigation-strategy", ["text-or-aria-exact-match"]),
      actions: {
        search: normalizeAssetPath(sidebarActions.search || "search", "button-action-search"),
        newTask: normalizeAssetPath(sidebarActions.newTask || "newTask", "button-action-new-task"),
        projects: normalizeAssetPath(sidebarActions.projects || "project", "button-action-projects"),
        pullRequests: normalizeAssetPath(sidebarActions.pullRequests || "files", "button-action-pull-requests"),
        websites: normalizeAssetPath(sidebarActions.websites || "spark", "button-action-websites"),
        scheduled: normalizeAssetPath(sidebarActions.scheduled || "tagTask", "button-action-scheduled"),
        extensions: normalizeAssetPath(sidebarActions.extensions || "package", "button-action-extensions")
      }
    },
    titlebarNavigation: {
      enabled: normalizeBoolean(titlebarNavigation.enabled ?? false, "button-module-titlebar-navigation-enabled"),
      strategy: normalizeEnum(titlebarNavigation.strategy || "aria-exact-visible-topbar", "button-module-titlebar-navigation-strategy", ["aria-exact-visible-topbar"]),
      actions: {
        back: normalizeAssetPath(titlebarActions.back || "back", "button-action-titlebar-back"),
        forward: normalizeAssetPath(titlebarActions.forward || "forward", "button-action-titlebar-forward")
      }
    },
    composerControls: {
      enabled: normalizeBoolean(composerControls.enabled ?? false, "button-module-composer-controls-enabled"),
      strategy: normalizeEnum(composerControls.strategy || "composer-visible-control-match", "button-module-composer-controls-strategy", ["composer-visible-control-match"]),
      actions: {
        run: normalizeAssetPath(composerActions.run || "run", "button-action-composer-run"),
        stop: normalizeAssetPath(composerActions.stop || "stop", "button-action-composer-stop"),
        send: normalizeAssetPath(composerActions.send || "send", "button-action-composer-send")
      }
    },
    topUtilityActions: {
      enabled: normalizeBoolean(topUtilityActions.enabled ?? false, "button-module-top-utility-actions-enabled"),
      strategy: normalizeEnum(topUtilityActions.strategy || "visible-top-toolbar-match", "button-module-top-utility-actions-strategy", ["visible-top-toolbar-match"]),
      actions: {
        projectContext: normalizeAssetPath(topUtilityActionMap.projectContext || "project", "button-action-top-project-context"),
        taskActions: normalizeAssetPath(topUtilityActionMap.taskActions || "settings", "button-action-top-task-actions"),
        summaryToggle: normalizeAssetPath(topUtilityActionMap.summaryToggle || "thread", "button-action-top-summary-toggle"),
        sideTab: normalizeAssetPath(topUtilityActionMap.sideTab || "project", "button-action-top-side-tab"),
        expandPanel: normalizeAssetPath(topUtilityActionMap.expandPanel || "spark", "button-action-top-expand-panel"),
        bottomPanel: normalizeAssetPath(topUtilityActionMap.bottomPanel || "tagTask", "button-action-top-bottom-panel"),
        sidePanel: normalizeAssetPath(topUtilityActionMap.sidePanel || "files", "button-action-top-side-panel"),
        sourceView: normalizeAssetPath(topUtilityActionMap.sourceView || "files", "button-action-top-source-view"),
        fileTree: normalizeAssetPath(topUtilityActionMap.fileTree || "thread", "button-action-top-file-tree"),
        openExternal: normalizeAssetPath(topUtilityActionMap.openExternal || "package", "button-action-top-open-external"),
        openOptions: normalizeAssetPath(topUtilityActionMap.openOptions || "settings", "button-action-top-open-options")
      }
    },
    messageActions: {
      enabled: normalizeBoolean(messageActions.enabled ?? false, "button-module-message-actions-enabled"),
      strategy: normalizeEnum(messageActions.strategy || "visible-message-action-match", "button-module-message-actions-strategy", ["visible-message-action-match"]),
      actions: {
        copyMessage: normalizeAssetPath(messageActionMap.copyMessage || "files", "button-action-message-copy"),
        goodResponse: normalizeAssetPath(messageActionMap.goodResponse || "spark", "button-action-message-good-response"),
        badResponse: normalizeAssetPath(messageActionMap.badResponse || "stop", "button-action-message-bad-response"),
        continueTask: normalizeAssetPath(messageActionMap.continueTask || "tagTask", "button-action-message-continue-task"),
        guide: normalizeAssetPath(messageActionMap.guide || "thread", "button-action-message-guide"),
        deleteAction: normalizeAssetPath(messageActionMap.deleteAction || "clean", "button-action-message-delete"),
        moreActions: normalizeAssetPath(messageActionMap.moreActions || "settings", "button-action-message-more"),
        scrollBottom: normalizeAssetPath(messageActionMap.scrollBottom || "send", "button-action-message-scroll-bottom")
      }
    },
    projectPanelRows: {
      enabled: normalizeBoolean(projectPanelRows.enabled ?? false, "button-module-project-panel-rows-enabled"),
      strategy: normalizeEnum(projectPanelRows.strategy || "visible-project-panel-row-match", "button-module-project-panel-rows-strategy", ["visible-project-panel-row-match"]),
      actions: {
        outputRow: normalizeAssetPath(projectPanelRowActionMap.outputRow || "files", "button-action-project-panel-output-row"),
        agentRow: normalizeAssetPath(projectPanelRowActionMap.agentRow || "spark", "button-action-project-panel-agent-row"),
        sourceRow: normalizeAssetPath(projectPanelRowActionMap.sourceRow || "thread", "button-action-project-panel-source-row"),
        environmentRow: normalizeAssetPath(projectPanelRowActionMap.environmentRow || "settings", "button-action-project-panel-environment-row"),
        statusRow: normalizeAssetPath(projectPanelRowActionMap.statusRow || "stop", "button-action-project-panel-status-row"),
        viewAll: normalizeAssetPath(projectPanelRowActionMap.viewAll || "search", "button-action-project-panel-view-all")
      }
    },
    projectPanels: {
      enabled: normalizeBoolean(source.projectPanels?.enabled ?? false, "button-module-project-panels-enabled")
    }
  };
}

function statePaths(stateDir, assetsDir) {
  return {
    stateDir,
    assetsDir,
    imagesDir: path.join(stateDir, "images"),
    themesDir: path.join(stateDir, "themes"),
    logsDir: path.join(stateDir, "logs"),
    runDir: path.join(stateDir, "run"),
    activeTheme: path.join(stateDir, "themes", "active.json"),
    defaultTheme: path.join(assetsDir, "theme.json")
  };
}

function ensureState(paths) {
  mkdirp(paths.stateDir);
  mkdirp(paths.imagesDir);
  mkdirp(paths.themesDir);
  mkdirp(paths.logsDir);
  mkdirp(paths.runDir);
  if (!fs.existsSync(paths.defaultTheme)) {
    throw new Error(`missing default theme: ${paths.defaultTheme}`);
  }
}

function readDefaultTheme(paths) {
  const theme = readJson(paths.defaultTheme);
  return normalizeTheme(theme);
}

function readActiveTheme(paths) {
  if (!fs.existsSync(paths.activeTheme)) {
    return readDefaultTheme(paths);
  }
  return normalizeTheme(readJson(paths.activeTheme));
}

function normalizeTheme(theme) {
  const modules = theme.modules && typeof theme.modules === "object" ? theme.modules : {};
  const layout = theme.layout && typeof theme.layout === "object" ? theme.layout : {};
  const icons = theme.icons && typeof theme.icons === "object" ? theme.icons : {};
  const badge = icons.badge && typeof icons.badge === "object" ? icons.badge : {};
  const character = icons.character && typeof icons.character === "object" ? icons.character : {};
  const tableFlipCat = icons.tableFlipCat && typeof icons.tableFlipCat === "object" ? icons.tableFlipCat : {};
  const buttons = icons.buttons && typeof icons.buttons === "object" ? icons.buttons : {};

  const result = {
    id: String(theme.id || "codex-interface-custom"),
    name: String(theme.name || "Codex Interface Theme"),
    mode: normalizeEnum(theme.mode || "chrome-only", "mode", ["chrome-only", "sidebar-art", "wallpaper"]),
    appearance: normalizeEnum(theme.appearance || "auto", "appearance", ["auto", "light", "dark"]),
    palette: {
      accent: normalizeHexColor(theme.palette?.accent || "#19e6a3", "accent"),
      secondary: normalizeHexColor(theme.palette?.secondary || "#00c8f8", "secondary"),
      highlight: normalizeHexColor(theme.palette?.highlight || "#ff5a45", "highlight"),
      surface: normalizeCssColor(theme.palette?.surface || "rgba(10, 15, 18, 0.46)", "surface"),
      surfaceStrong: normalizeCssColor(theme.palette?.surfaceStrong || "rgba(10, 15, 18, 0.64)", "surface-strong"),
      text: normalizeHexColor(theme.palette?.text || "#f4f7fb", "text")
    },
    layout: {
      workspaceTreatment: normalizeEnum(layout.workspaceTreatment || "native", "workspace-treatment", ["native", "tinted", "glass"]),
      blockContrast: normalizeEnum(layout.blockContrast || "segmented", "block-contrast", ["subtle", "segmented", "high"]),
      cornerArmor: normalizeEnum(layout.cornerArmor || "off", "corner-armor", ["off", "sidebar-top-left", "top-left"])
    },
    modules: {
      sidebar: normalizeModuleColorModule(modules.sidebar, {
        name: "sidebar",
        accent: "#00c8f8",
        surface: "rgba(8, 13, 16, 0.78)",
        border: "rgba(0, 200, 248, 0.20)"
      }),
      header: normalizeModuleColorModule(modules.header, {
        name: "header",
        accent: "#f2a23a",
        surface: "rgba(12, 13, 14, 0.62)",
        border: "rgba(242, 162, 58, 0.16)"
      }),
      composer: normalizeModuleColorModule(modules.composer, {
        name: "composer",
        accent: "#f2a23a",
        surface: "rgba(9, 10, 12, 0.56)",
        border: "rgba(242, 162, 58, 0.16)"
      }),
      popover: normalizeModuleColorModule(modules.popover, {
        name: "popover",
        accent: "#ff5a45",
        surface: "rgba(16, 11, 12, 0.88)",
        border: "rgba(255, 90, 69, 0.18)"
      }),
      mecha: {
        frame: normalizeHexColor(modules.mecha?.frame || "#161a20", "mecha-frame"),
        armor: normalizeHexColor(modules.mecha?.armor || "#f2a23a", "mecha-armor"),
        glow: normalizeHexColor(modules.mecha?.glow || "#00c8f8", "mecha-glow")
      },
      status: {
        success: normalizeHexColor(modules.status?.success || "#19e6a3", "status-success"),
        warning: normalizeHexColor(modules.status?.warning || "#f2a23a", "status-warning"),
        danger: normalizeHexColor(modules.status?.danger || "#ff5a45", "status-danger"),
        info: normalizeHexColor(modules.status?.info || "#00c8f8", "status-info")
      }
    },
    art: {
      focusX: normalizeUnitNumber(theme.art?.focusX ?? 0.72, "focus-x"),
      focusY: normalizeUnitNumber(theme.art?.focusY ?? 0.44, "focus-y"),
      safeArea: normalizeEnum(theme.art?.safeArea || "sides", "safe-area", ["auto", "left", "right", "center", "none", "sides"]),
      taskMode: normalizeEnum(theme.art?.taskMode || "ambient", "task-mode", ["auto", "ambient", "banner", "off"])
    },
    icons: {
      badge: {
        enabled: normalizeBoolean(badge.enabled ?? false, "icon-badge-enabled"),
        path: normalizeAssetPath(badge.path || "icons/orange-hacker-cat-128.png", "icon-badge-path"),
        placement: normalizeEnum(badge.placement || "sidebar-dock", "icon-badge-placement", ["sidebar-dock", "sidebar-bottom", "off"]),
        size: normalizeIntegerRange(badge.size ?? 58, "icon-badge-size", 32, 128),
        opacity: normalizeUnitNumber(badge.opacity ?? 0.92, "icon-badge-opacity")
      },
      character: {
        enabled: normalizeBoolean(character.enabled ?? false, "character-enabled"),
        path: normalizeAssetPath(character.path || "icons/cyber-mecha-cat-male-helmet-900.png", "character-path"),
        placement: normalizeEnum(character.placement || "sidebar-hero", "character-placement", ["sidebar-hero", "right-bottom", "off"]),
        size: normalizeIntegerRange(character.size ?? 350, "character-size", 180, 520),
        opacity: normalizeUnitNumber(character.opacity ?? 1, "character-opacity")
      },
      tableFlipCat: {
        enabled: normalizeBoolean(tableFlipCat.enabled ?? TABLE_FLIP_CAT_DEFAULTS.enabled, "table-flip-cat-enabled"),
        path: normalizeAssetPath(tableFlipCat.path || TABLE_FLIP_CAT_DEFAULTS.path, "table-flip-cat-path"),
        spritePath: normalizeAssetPath(tableFlipCat.spritePath || TABLE_FLIP_CAT_DEFAULTS.spritePath, "table-flip-cat-sprite-path"),
        posterPath: normalizeAssetPath(tableFlipCat.posterPath || TABLE_FLIP_CAT_DEFAULTS.posterPath, "table-flip-cat-poster-path"),
        triggerIconPath: normalizeAssetPath(tableFlipCat.triggerIconPath || TABLE_FLIP_CAT_DEFAULTS.triggerIconPath, "table-flip-cat-trigger-icon-path"),
        placement: normalizeEnum(tableFlipCat.placement || TABLE_FLIP_CAT_DEFAULTS.placement, "table-flip-cat-placement", ["right-bottom", "off"]),
        size: normalizeIntegerRange(tableFlipCat.size ?? TABLE_FLIP_CAT_DEFAULTS.size, "table-flip-cat-size", 72, 180),
        opacity: normalizeUnitNumber(tableFlipCat.opacity ?? TABLE_FLIP_CAT_DEFAULTS.opacity, "table-flip-cat-opacity"),
        frameCount: normalizeIntegerRange(tableFlipCat.frameCount ?? TABLE_FLIP_CAT_DEFAULTS.frameCount, "table-flip-cat-frame-count", 2, 60),
        durationMs: normalizeIntegerRange(tableFlipCat.durationMs ?? TABLE_FLIP_CAT_DEFAULTS.durationMs, "table-flip-cat-duration-ms", 100, 10000)
      },
      buttons: {
        enabled: normalizeBoolean(buttons.enabled ?? false, "icon-buttons-enabled"),
        style: normalizeEnum(buttons.style || "cat-mecha-symbols", "icon-buttons-style", ["cat-mecha-symbols", "native"]),
        applyMode: normalizeEnum(buttons.applyMode || "opt-in", "icon-buttons-apply-mode", ["opt-in", "module", "off"]),
        modules: normalizeButtonModules(buttons.modules),
        paths: normalizeButtonIconPaths(buttons.paths)
      }
    },
    backgroundImagePath: typeof theme.backgroundImagePath === "string" ? theme.backgroundImagePath : "",
    updatedAt: typeof theme.updatedAt === "string" ? theme.updatedAt : new Date().toISOString()
  };

  if (result.backgroundImagePath !== "" && !path.isAbsolute(result.backgroundImagePath)) {
    throw new Error("backgroundImagePath must be absolute when set");
  }

  return result;
}

function readPngDimensions(buffer) {
  const signature = "89504e470d0a1a0a";
  if (buffer.length < 24 || buffer.subarray(0, 8).toString("hex") !== signature) {
    return null;
  }
  return {
    mime: "image/png",
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20)
  };
}

function readJpegDimensions(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    return null;
  }

  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    let marker = buffer[offset + 1];
    while (marker === 0xff) {
      offset += 1;
      marker = buffer[offset + 1];
    }

    if (marker === 0xd9 || marker === 0xda) {
      break;
    }

    const blockLength = buffer.readUInt16BE(offset + 2);
    if (blockLength < 2) {
      break;
    }

    const isStartOfFrame = [
      0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf
    ].includes(marker);

    if (isStartOfFrame) {
      return {
        mime: "image/jpeg",
        height: buffer.readUInt16BE(offset + 5),
        width: buffer.readUInt16BE(offset + 7)
      };
    }

    offset += 2 + blockLength;
  }

  return null;
}

function readWebpDimensions(buffer) {
  if (buffer.length < 30 || buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WEBP") {
    return null;
  }
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const chunkType = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const dataOffset = offset + 8;
    if (dataOffset + chunkSize > buffer.length) {
      return null;
    }
    if (chunkType === "VP8X" && chunkSize >= 10) {
      return {
        mime: "image/webp",
        width: 1 + buffer.readUIntLE(dataOffset + 4, 3),
        height: 1 + buffer.readUIntLE(dataOffset + 7, 3)
      };
    }
    if (chunkType === "VP8 " && chunkSize >= 10 && buffer[dataOffset + 3] === 0x9d && buffer[dataOffset + 4] === 0x01 && buffer[dataOffset + 5] === 0x2a) {
      return {
        mime: "image/webp",
        width: buffer.readUInt16LE(dataOffset + 6) & 0x3fff,
        height: buffer.readUInt16LE(dataOffset + 8) & 0x3fff
      };
    }
    if (chunkType === "VP8L" && chunkSize >= 5 && buffer[dataOffset] === 0x2f) {
      const b1 = buffer[dataOffset + 1];
      const b2 = buffer[dataOffset + 2];
      const b3 = buffer[dataOffset + 3];
      const b4 = buffer[dataOffset + 4];
      return {
        mime: "image/webp",
        width: 1 + b1 + ((b2 & 0x3f) << 8),
        height: 1 + (b2 >> 6) + (b3 << 2) + ((b4 & 0x0f) << 10)
      };
    }
    offset = dataOffset + chunkSize + (chunkSize % 2);
  }
  return null;
}

function validateImage(imagePath) {
  const absolutePath = path.resolve(imagePath);
  const stat = fs.statSync(absolutePath);
  if (!stat.isFile()) {
    throw new Error(`image path is not a file: ${absolutePath}`);
  }
  if (stat.size <= 0) {
    throw new Error("image file is empty");
  }
  if (stat.size > MAX_IMAGE_BYTES) {
    throw new Error(`image is larger than ${MAX_IMAGE_BYTES} bytes`);
  }

  const buffer = fs.readFileSync(absolutePath);
  const dimensions = readPngDimensions(buffer) || readJpegDimensions(buffer) || readWebpDimensions(buffer);
  if (!dimensions) {
    throw new Error("only PNG, JPEG, and WebP backgrounds are supported");
  }
  if (dimensions.width <= 0 || dimensions.height <= 0) {
    throw new Error("image dimensions are invalid");
  }
  if (dimensions.width > MAX_IMAGE_SIDE || dimensions.height > MAX_IMAGE_SIDE) {
    throw new Error(`image side exceeds ${MAX_IMAGE_SIDE}px`);
  }
  if (dimensions.width * dimensions.height > MAX_IMAGE_PIXELS) {
    throw new Error(`image exceeds ${MAX_IMAGE_PIXELS} total pixels`);
  }

  return {
    absolutePath,
    buffer,
    size: stat.size,
    hash: sha256(buffer),
    mime: dimensions.mime,
    width: dimensions.width,
    height: dimensions.height
  };
}

function copyImageIntoStore(paths, imageInfo) {
  const extension = imageInfo.mime === "image/png" ? ".png" : imageInfo.mime === "image/webp" ? ".webp" : ".jpg";
  const destination = path.join(paths.imagesDir, `${imageInfo.hash.slice(0, 24)}${extension}`);
  if (!fs.existsSync(destination)) {
    const tempPath = `${destination}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tempPath, imageInfo.buffer, { mode: 0o600 });
    fs.renameSync(tempPath, destination);
  }
  return destination;
}

function applyThemeOptions(theme, options) {
  const next = normalizeTheme(theme);
  const name = sanitizeName(options.name);
  if (name !== undefined) {
    next.name = name;
  }
  const appearance = normalizeEnum(options.appearance, "appearance", ["auto", "light", "dark"]);
  if (appearance !== undefined) {
    next.appearance = appearance;
  }
  const accent = normalizeHexColor(options.accent, "accent");
  if (accent !== undefined) {
    next.palette.accent = accent;
  }
  const secondary = normalizeHexColor(options.secondary, "secondary");
  if (secondary !== undefined) {
    next.palette.secondary = secondary;
  }
  const highlight = normalizeHexColor(options.highlight, "highlight");
  if (highlight !== undefined) {
    next.palette.highlight = highlight;
  }
  const surface = normalizeCssColor(options.surface, "surface");
  if (surface !== undefined) {
    next.palette.surface = surface;
  }
  const surfaceStrong = normalizeCssColor(options["surface-strong"], "surface-strong");
  if (surfaceStrong !== undefined) {
    next.palette.surfaceStrong = surfaceStrong;
  }
  const mode = normalizeEnum(options.mode, "mode", ["chrome-only", "sidebar-art", "wallpaper"]);
  if (mode !== undefined) {
    next.mode = mode;
  }
  const sidebarAccent = normalizeHexColor(options["sidebar-accent"], "sidebar-accent");
  if (sidebarAccent !== undefined) {
    next.modules.sidebar.accent = sidebarAccent;
  }
  const sidebarSurface = normalizeCssColor(options["sidebar-surface"], "sidebar-surface");
  if (sidebarSurface !== undefined) {
    next.modules.sidebar.surface = sidebarSurface;
  }
  const sidebarBorder = normalizeCssColor(options["sidebar-border"], "sidebar-border");
  if (sidebarBorder !== undefined) {
    next.modules.sidebar.border = sidebarBorder;
  }
  const headerAccent = normalizeHexColor(options["header-accent"], "header-accent");
  if (headerAccent !== undefined) {
    next.modules.header.accent = headerAccent;
  }
  const headerSurface = normalizeCssColor(options["header-surface"], "header-surface");
  if (headerSurface !== undefined) {
    next.modules.header.surface = headerSurface;
  }
  const headerBorder = normalizeCssColor(options["header-border"], "header-border");
  if (headerBorder !== undefined) {
    next.modules.header.border = headerBorder;
  }
  const composerAccent = normalizeHexColor(options["composer-accent"], "composer-accent");
  if (composerAccent !== undefined) {
    next.modules.composer.accent = composerAccent;
  }
  const composerSurface = normalizeCssColor(options["composer-surface"], "composer-surface");
  if (composerSurface !== undefined) {
    next.modules.composer.surface = composerSurface;
  }
  const composerBorder = normalizeCssColor(options["composer-border"], "composer-border");
  if (composerBorder !== undefined) {
    next.modules.composer.border = composerBorder;
  }
  const popoverAccent = normalizeHexColor(options["popover-accent"], "popover-accent");
  if (popoverAccent !== undefined) {
    next.modules.popover.accent = popoverAccent;
  }
  const popoverSurface = normalizeCssColor(options["popover-surface"], "popover-surface");
  if (popoverSurface !== undefined) {
    next.modules.popover.surface = popoverSurface;
  }
  const popoverBorder = normalizeCssColor(options["popover-border"], "popover-border");
  if (popoverBorder !== undefined) {
    next.modules.popover.border = popoverBorder;
  }
  const mechaArmor = normalizeHexColor(options["mecha-armor"], "mecha-armor");
  if (mechaArmor !== undefined) {
    next.modules.mecha.armor = mechaArmor;
  }
  const mechaGlow = normalizeHexColor(options["mecha-glow"], "mecha-glow");
  if (mechaGlow !== undefined) {
    next.modules.mecha.glow = mechaGlow;
  }
  const statusSuccess = normalizeHexColor(options["status-success"], "status-success");
  if (statusSuccess !== undefined) {
    next.modules.status.success = statusSuccess;
  }
  const statusWarning = normalizeHexColor(options["status-warning"], "status-warning");
  if (statusWarning !== undefined) {
    next.modules.status.warning = statusWarning;
  }
  const statusDanger = normalizeHexColor(options["status-danger"], "status-danger");
  if (statusDanger !== undefined) {
    next.modules.status.danger = statusDanger;
  }
  const statusInfo = normalizeHexColor(options["status-info"], "status-info");
  if (statusInfo !== undefined) {
    next.modules.status.info = statusInfo;
  }
  const iconBadgeEnabled = normalizeBoolean(options["icon-badge-enabled"], "icon-badge-enabled");
  if (iconBadgeEnabled !== undefined) {
    next.icons.badge.enabled = iconBadgeEnabled;
  }
  const iconBadgePath = normalizeAssetPath(options["icon-badge-path"], "icon-badge-path");
  if (iconBadgePath !== undefined) {
    next.icons.badge.path = iconBadgePath;
  }
  const iconBadgeSize = normalizeIntegerRange(options["icon-badge-size"], "icon-badge-size", 32, 128);
  if (iconBadgeSize !== undefined) {
    next.icons.badge.size = iconBadgeSize;
  }
  const characterEnabled = normalizeBoolean(options["character-enabled"], "character-enabled");
  if (characterEnabled !== undefined) {
    next.icons.character.enabled = characterEnabled;
  }
  const characterPath = normalizeAssetPath(options["character-path"], "character-path");
  if (characterPath !== undefined) {
    next.icons.character.path = characterPath;
  }
  const characterPlacement = normalizeEnum(options["character-placement"], "character-placement", ["sidebar-hero", "right-bottom", "off"]);
  if (characterPlacement !== undefined) {
    next.icons.character.placement = characterPlacement;
  }
  const characterSize = normalizeIntegerRange(options["character-size"], "character-size", 180, 520);
  if (characterSize !== undefined) {
    next.icons.character.size = characterSize;
  }
  const characterOpacity = normalizeUnitNumber(options["character-opacity"], "character-opacity");
  if (characterOpacity !== undefined) {
    next.icons.character.opacity = characterOpacity;
  }
  const tableFlipCatEnabled = normalizeBoolean(options["table-flip-cat-enabled"], "table-flip-cat-enabled");
  if (tableFlipCatEnabled !== undefined) {
    next.icons.tableFlipCat.enabled = tableFlipCatEnabled;
  }
  const tableFlipCatPath = normalizeAssetPath(options["table-flip-cat-path"], "table-flip-cat-path");
  if (tableFlipCatPath !== undefined) {
    next.icons.tableFlipCat.path = tableFlipCatPath;
  }
  const tableFlipCatSpritePath = normalizeAssetPath(options["table-flip-cat-sprite-path"], "table-flip-cat-sprite-path");
  if (tableFlipCatSpritePath !== undefined) {
    next.icons.tableFlipCat.spritePath = tableFlipCatSpritePath;
  }
  const tableFlipCatPosterPath = normalizeAssetPath(options["table-flip-cat-poster-path"], "table-flip-cat-poster-path");
  if (tableFlipCatPosterPath !== undefined) {
    next.icons.tableFlipCat.posterPath = tableFlipCatPosterPath;
  }
  const tableFlipCatTriggerIconPath = normalizeAssetPath(options["table-flip-cat-trigger-icon-path"], "table-flip-cat-trigger-icon-path");
  if (tableFlipCatTriggerIconPath !== undefined) {
    next.icons.tableFlipCat.triggerIconPath = tableFlipCatTriggerIconPath;
  }
  const tableFlipCatPlacement = normalizeEnum(options["table-flip-cat-placement"], "table-flip-cat-placement", ["right-bottom", "off"]);
  if (tableFlipCatPlacement !== undefined) {
    next.icons.tableFlipCat.placement = tableFlipCatPlacement;
  }
  const tableFlipCatSize = normalizeIntegerRange(options["table-flip-cat-size"], "table-flip-cat-size", 72, 180);
  if (tableFlipCatSize !== undefined) {
    next.icons.tableFlipCat.size = tableFlipCatSize;
  }
  const tableFlipCatOpacity = normalizeUnitNumber(options["table-flip-cat-opacity"], "table-flip-cat-opacity");
  if (tableFlipCatOpacity !== undefined) {
    next.icons.tableFlipCat.opacity = tableFlipCatOpacity;
  }
  const tableFlipCatFrameCount = normalizeIntegerRange(options["table-flip-cat-frame-count"], "table-flip-cat-frame-count", 2, 60);
  if (tableFlipCatFrameCount !== undefined) {
    next.icons.tableFlipCat.frameCount = tableFlipCatFrameCount;
  }
  const tableFlipCatDurationMs = normalizeIntegerRange(options["table-flip-cat-duration-ms"], "table-flip-cat-duration-ms", 100, 10000);
  if (tableFlipCatDurationMs !== undefined) {
    next.icons.tableFlipCat.durationMs = tableFlipCatDurationMs;
  }
  const iconButtonsEnabled = normalizeBoolean(options["icon-buttons-enabled"], "icon-buttons-enabled");
  if (iconButtonsEnabled !== undefined) {
    next.icons.buttons.enabled = iconButtonsEnabled;
  }
  const iconButtonsApplyMode = normalizeEnum(options["icon-buttons-apply-mode"], "icon-buttons-apply-mode", ["opt-in", "module", "off"]);
  if (iconButtonsApplyMode !== undefined) {
    next.icons.buttons.applyMode = iconButtonsApplyMode;
  }
  const iconButtonsSidebarNavigationEnabled = normalizeBoolean(options["icon-buttons-sidebar-navigation-enabled"], "icon-buttons-sidebar-navigation-enabled");
  if (iconButtonsSidebarNavigationEnabled !== undefined) {
    next.icons.buttons.modules.sidebarNavigation.enabled = iconButtonsSidebarNavigationEnabled;
  }
  const iconButtonsTitlebarNavigationEnabled = normalizeBoolean(options["icon-buttons-titlebar-navigation-enabled"], "icon-buttons-titlebar-navigation-enabled");
  if (iconButtonsTitlebarNavigationEnabled !== undefined) {
    next.icons.buttons.modules.titlebarNavigation.enabled = iconButtonsTitlebarNavigationEnabled;
  }
  const iconButtonsComposerControlsEnabled = normalizeBoolean(options["icon-buttons-composer-controls-enabled"], "icon-buttons-composer-controls-enabled");
  if (iconButtonsComposerControlsEnabled !== undefined) {
    next.icons.buttons.modules.composerControls.enabled = iconButtonsComposerControlsEnabled;
  }
  const iconButtonsTopUtilityActionsEnabled = normalizeBoolean(options["icon-buttons-top-utility-actions-enabled"], "icon-buttons-top-utility-actions-enabled");
  if (iconButtonsTopUtilityActionsEnabled !== undefined) {
    next.icons.buttons.modules.topUtilityActions.enabled = iconButtonsTopUtilityActionsEnabled;
  }
  const iconButtonsMessageActionsEnabled = normalizeBoolean(options["icon-buttons-message-actions-enabled"], "icon-buttons-message-actions-enabled");
  if (iconButtonsMessageActionsEnabled !== undefined) {
    next.icons.buttons.modules.messageActions.enabled = iconButtonsMessageActionsEnabled;
  }
  const iconButtonsProjectPanelRowsEnabled = normalizeBoolean(options["icon-buttons-project-panel-rows-enabled"], "icon-buttons-project-panel-rows-enabled");
  if (iconButtonsProjectPanelRowsEnabled !== undefined) {
    next.icons.buttons.modules.projectPanelRows.enabled = iconButtonsProjectPanelRowsEnabled;
  }
  const focusX = normalizeUnitNumber(options["focus-x"], "focus-x");
  if (focusX !== undefined) {
    next.art.focusX = focusX;
  }
  const focusY = normalizeUnitNumber(options["focus-y"], "focus-y");
  if (focusY !== undefined) {
    next.art.focusY = focusY;
  }
  const safeArea = normalizeEnum(options["safe-area"], "safe-area", ["auto", "left", "right", "center", "none", "sides"]);
  if (safeArea !== undefined) {
    next.art.safeArea = safeArea;
  }
  const taskMode = normalizeEnum(options["task-mode"], "task-mode", ["auto", "ambient", "banner", "off"]);
  if (taskMode !== undefined) {
    next.art.taskMode = taskMode;
  }
  next.updatedAt = new Date().toISOString();
  return next;
}

function commandInit(paths) {
  ensureState(paths);
  if (!fs.existsSync(paths.activeTheme)) {
    const defaultTheme = readDefaultTheme(paths);
    writeJsonAtomic(paths.activeTheme, defaultTheme);
  } else {
    normalizeTheme(readJson(paths.activeTheme));
  }
  return readActiveTheme(paths);
}

function commandReset(paths) {
  ensureState(paths);
  const defaultTheme = readDefaultTheme(paths);
  defaultTheme.updatedAt = new Date().toISOString();
  writeJsonAtomic(paths.activeTheme, defaultTheme);
  return defaultTheme;
}

function commandSetImage(paths, options) {
  ensureState(paths);
  let theme = readActiveTheme(paths);
  theme = applyThemeOptions(theme, options);

  if (options.image) {
    const imageInfo = validateImage(options.image);
    const storedPath = copyImageIntoStore(paths, imageInfo);
    theme.backgroundImagePath = storedPath;
    theme.image = {
      originalPath: imageInfo.absolutePath,
      storedPath,
      sha256: imageInfo.hash,
      mime: imageInfo.mime,
      width: imageInfo.width,
      height: imageInfo.height,
      bytes: imageInfo.size
    };
  }

  if (!options.image && Object.keys(options).every((key) => ["state-dir", "assets-dir"].includes(key))) {
    throw new Error("set-image requires --image or at least one theme option");
  }

  theme.id = theme.backgroundImagePath ? `custom-${sha256(Buffer.from(`${theme.name}:${theme.backgroundImagePath}`)).slice(0, 12)}` : theme.id;
  theme.updatedAt = new Date().toISOString();
  writeJsonAtomic(paths.activeTheme, theme);
  return theme;
}

function main() {
  const parsed = parseArgs(process.argv);
  if (parsed.options.help || !parsed.command) {
    console.log(usage());
    return;
  }

  const stateDir = requireOption(parsed.options, "state-dir");
  const assetsDir = requireOption(parsed.options, "assets-dir");
  const paths = statePaths(path.resolve(stateDir), path.resolve(assetsDir));

  let theme;
  switch (parsed.command) {
    case "init":
      theme = commandInit(paths);
      break;
    case "show":
      ensureState(paths);
      theme = readActiveTheme(paths);
      break;
    case "reset":
      theme = commandReset(paths);
      break;
    case "set-image":
      theme = commandSetImage(paths, parsed.options);
      break;
    default:
      throw new Error(`unknown command: ${parsed.command}${os.EOL}${usage()}`);
  }

  console.log(JSON.stringify(theme, null, 2));
}

try {
  main();
} catch (error) {
  console.error(`[codex-interface-theme][theme-store] ${error.message}`);
  process.exitCode = 1;
}
