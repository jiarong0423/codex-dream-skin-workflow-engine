export const TABLE_FLIP_CAT_DEFAULTS = Object.freeze({
  enabled: true,
  path: "icons/table-flip-cat-left.gif",
  spritePath: "icons/table-flip-cat-left-sprite.webp",
  posterPath: "icons/table-flip-cat-left-poster.png",
  triggerIconPath: "icons/table-flip-trigger-angry.svg",
  placement: "right-bottom",
  size: 118,
  opacity: 0.96,
  frameCount: 8,
  durationMs: 1430
});

export const ICON_BADGE_DEFAULTS = Object.freeze({
  enabled: false,
  path: "icons/orange-hacker-cat-128.png",
  placement: "sidebar-dock",
  size: 58,
  opacity: 0.92
});

export const CHARACTER_DEFAULTS = Object.freeze({
  enabled: false,
  path: "icons/cyber-mecha-cat-male-helmet-900.png",
  placement: "sidebar-hero",
  size: 350,
  opacity: 1
});

export const RUNTIME_MODULE_DEFAULTS = Object.freeze({
  background: {
    id: "background",
    payloadKeys: ["backgroundDataUrl"],
    activation: "backgroundImagePath",
    loadPolicy: "active-theme-only"
  },
  iconBadge: {
    id: "iconBadge",
    payloadKeys: ["iconBadgeDataUrl"],
    activation: "icons.badge.enabled",
    loadPolicy: "enabled-only"
  },
  character: {
    id: "character",
    payloadKeys: ["characterDataUrl"],
    activation: "icons.character.enabled",
    loadPolicy: "enabled-only"
  },
  characterRetreat: {
    id: "characterRetreat",
    payloadKeys: [],
    activation: "icons.character.enabled && renderer-detected",
    loadPolicy: "dom-geometry-only"
  },
  tableFlipCat: {
    id: "tableFlipCat",
    payloadKeys: ["tableFlipCatTriggerIconDataUrl", "loadTableFlipCatPlayback"],
    activation: "icons.tableFlipCat.enabled",
    loadPolicy: "static-cache-click"
  },
  buttonGlyphs: {
    id: "buttonGlyphs",
    payloadKeys: ["iconButtonDataUrls"],
    activation: "icons.buttons.enabled && icons.buttons.applyMode === module",
    loadPolicy: "enabled-module-only"
  },
  projectPanels: {
    id: "projectPanels",
    payloadKeys: [],
    activation: "renderer-detected",
    loadPolicy: "dom-class-only"
  },
  composerSurface: {
    id: "composerSurface",
    payloadKeys: [],
    activation: "renderer-detected",
    loadPolicy: "dom-class-only"
  },
  conversationSurface: {
    id: "conversationSurface",
    payloadKeys: [],
    activation: "renderer-detected",
    loadPolicy: "dom-class-only"
  }
});

function cloneObject(value) {
  if (!value || typeof value !== "object") {
    return {};
  }
  return JSON.parse(JSON.stringify(value));
}

function mergeDefaults(source, defaults) {
  return {
    ...defaults,
    ...(source && typeof source === "object" ? source : {})
  };
}

export function applyRuntimeDefaults(theme) {
  const result = cloneObject(theme);
  result.palette = result.palette && typeof result.palette === "object" ? result.palette : {};
  result.art = result.art && typeof result.art === "object" ? result.art : {};
  result.layout = result.layout && typeof result.layout === "object" ? result.layout : {};
  result.modules = result.modules && typeof result.modules === "object" ? result.modules : {};
  result.icons = result.icons && typeof result.icons === "object" ? result.icons : {};
  result.icons.badge = mergeDefaults(result.icons.badge, ICON_BADGE_DEFAULTS);
  result.icons.character = mergeDefaults(result.icons.character, CHARACTER_DEFAULTS);
  result.icons.tableFlipCat = mergeDefaults(result.icons.tableFlipCat, TABLE_FLIP_CAT_DEFAULTS);
  result.icons.buttons = result.icons.buttons && typeof result.icons.buttons === "object" ? result.icons.buttons : {};
  return result;
}

export function summarizeRuntimeModules(theme) {
  const normalized = applyRuntimeDefaults(theme);
  const icons = normalized.icons || {};
  const buttons = icons.buttons || {};
  const tableFlipCat = icons.tableFlipCat || {};
  return {
    background: Boolean(normalized.backgroundImagePath),
    iconBadge: icons.badge?.enabled === true && String(icons.badge?.placement || "") !== "off",
    character: icons.character?.enabled === true && String(icons.character?.placement || "") !== "off",
    tableFlipCat: tableFlipCat.enabled === true && String(tableFlipCat.placement || "") !== "off",
    tableFlipCatSpriteFirst: Boolean(tableFlipCat.spritePath),
    buttonGlyphs: buttons.enabled === true && String(buttons.applyMode || "") === "module",
    projectPanels: true,
    composerSurface: true,
    conversationSurface: true
  };
}
