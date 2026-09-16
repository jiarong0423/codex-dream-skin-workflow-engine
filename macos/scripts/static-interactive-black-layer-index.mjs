#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const DEFAULT_OUT_ROOT = path.join(ROOT, "macos", "previews", "static-interactive-black-layer-index");
const DEFAULT_BLACK_INDEX = path.join(ROOT, "macos", "previews", "static-black-layer-index", "latest-static-black-layer-index.json");

const SOURCE_FILES = [
  "macos/assets/theme.css",
  "macos/assets/theme-modules/black-shell-transparency.css",
  "macos/assets/renderer-inject.js",
  "macos/assets/surface-registry.js",
  "macos/assets/icons/button-action-map.json",
  "macos/assets/runtime-modules.json"
];

const INTERACTIVE_OWNER_RE = /composerSurface|transientShell|projectPanel|sidebarShell|conversationSurface|sidebarHoverPreviewShell|workspacePicker|messageActions|composerControls|projectPanelRows|topUtilityActions|titlebarNavigation|sidebarNavigation/i;
const INTERACTIVE_TEXT_RE = /button|\[role=|role="(?:button|menu|menuitem|option|listbox|dialog|tooltip|textbox|switch|checkbox|tab|slider|combobox)"|cursor-interaction|hover|focus-visible|focus-within|aria-selected|aria-current|data-selected|data-highlighted|data-state|popover|tooltip|menu|listbox|dialog|cmdk|radix|summary-panel-item|project-panel-row|workspace-picker|composer|message-action|cit-button|hot-swap|table-flip|sidebar-item|row|trigger|toggle|send|stop|scroll/i;
const PROTECTED_INTERACTIVE_RE = /input|textarea|textbox|contenteditable|data-slate-editor|composer|message-composer|source-preview|attachment|iframe|webview|canvas|video/i;
const SOURCE_LINE_CACHE = new Map();
const BLACK_COLOR_TOKEN_RE = /(^|[^\w-])black(?=$|[^\w-])/i;

function usage() {
  return `Usage: node macos/scripts/static-interactive-black-layer-index.mjs [options]

Options:
  --black-index <path>          Static black-layer index JSON. Default: latest static index.
  --out-root <path>             Output root. Default: macos/previews/static-interactive-black-layer-index
  --reported-screenshot <path>  Attach reported screenshot evidence. Repeatable.

Static-only contract:
  reads local source files and stored scan JSON only; does not connect to CDP,
  click, launch, apply, restore, or mutate live Codex UI.`;
}

function parseArgs(argv) {
  const options = {
    blackIndex: DEFAULT_BLACK_INDEX,
    outRoot: DEFAULT_OUT_ROOT,
    reportedScreenshots: []
  };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`missing value for ${arg}`);
    }
    if (arg === "--black-index") {
      options.blackIndex = path.resolve(value);
    } else if (arg === "--out-root") {
      options.outRoot = path.resolve(value);
    } else if (arg === "--reported-screenshot") {
      options.reportedScreenshots.push(path.resolve(value));
    } else {
      throw new Error(`unknown option: ${arg}`);
    }
    index += 1;
  }
  return options;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function safeRead(file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

function safeJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function sourceLineStillMatches(rule) {
  const file = String(rule.file || "");
  const lineNumber = Number(rule.line);
  const value = String(rule.value || "").trim();
  if (!file || !Number.isFinite(lineNumber) || lineNumber < 1 || !value) {
    return true;
  }
  if (!SOURCE_LINE_CACHE.has(file)) {
    SOURCE_LINE_CACHE.set(file, safeRead(path.join(ROOT, file)).split(/\r?\n/));
  }
  const line = String(SOURCE_LINE_CACHE.get(file)[lineNumber - 1] || "").trim();
  return line.includes(value);
}

function relative(file) {
  const rel = path.relative(ROOT, file);
  return rel.startsWith("..") ? file : rel;
}

function colorParts(value) {
  const text = String(value || "").trim();
  if (!text || text === "none" || text === "transparent") {
    return null;
  }
  const rgb = text.match(/rgba?\(([^)]+)\)/i);
  if (rgb) {
    const parts = rgb[1].split(/[,\s/]+/).filter(Boolean).map((part) => Number.parseFloat(part));
    if (parts.length >= 3 && parts.slice(0, 3).every(Number.isFinite)) {
      return {
        r: parts[0],
        g: parts[1],
        b: parts[2],
        a: parts.length >= 4 && Number.isFinite(parts[3]) ? parts[3] : 1
      };
    }
  }
  const hex = text.match(/#([0-9a-f]{3,8})\b/i);
  if (!hex) {
    return null;
  }
  const raw = hex[1];
  const full = raw.length === 3 || raw.length === 4 ? raw.split("").map((char) => char + char).join("") : raw;
  if (full.length < 6) {
    return null;
  }
  const r = Number.parseInt(full.slice(0, 2), 16);
  const g = Number.parseInt(full.slice(2, 4), 16);
  const b = Number.parseInt(full.slice(4, 6), 16);
  const a = full.length >= 8 ? Number.parseInt(full.slice(6, 8), 16) / 255 : 1;
  return { r, g, b, a };
}

function nearBlackColorToken(value) {
  const text = String(value || "");
  if (BLACK_COLOR_TOKEN_RE.test(text)) {
    return true;
  }
  const parts = colorParts(text);
  return Boolean(parts && parts.a >= 0.42 && Math.max(parts.r, parts.g, parts.b) <= 56 && parts.r + parts.g + parts.b <= 150);
}

function nearBlackValue(value) {
  const text = String(value || "");
  const colors = text.match(/rgba?\([^)]+\)|#[0-9a-f]{3,8}\b/gi) || [];
  return colors.some(nearBlackColorToken);
}

function nearBlackPaintLine(line) {
  const text = String(line || "");
  if (/^\s*mask-image\s*:/i.test(text)) {
    return false;
  }
  if (nearBlackValue(text)) {
    return true;
  }
  return layerFromDeclaration(text) !== "literal" && BLACK_COLOR_TOKEN_RE.test(text);
}

function layerFromDeclaration(line) {
  const text = String(line || "");
  const match = text.match(/(?:^|[;"'{\s])([-\w]*background(?:-color|-image)?|box-shadow|filter|backdrop-filter|-webkit-backdrop-filter|border(?:-[\w]+)?-color|outline-color|fill|stroke|text-shadow|mask-image)\s*:/i);
  return match ? match[1] : "literal";
}

function normalizeSelector(parts) {
  return parts.join(" ").replace(/\s+/g, " ").trim().slice(0, 500);
}

function selectorOwner(selector) {
  const text = String(selector || "");
  if (/project-panel|summary-panel|來源|環境|source|environment/i.test(text)) return "projectPanel";
  if (/transient-shell|popover|tooltip|menu|listbox|dialog|cmdk|radix|workspace-picker/i.test(text)) return "transientShell";
  if (/composer|message-composer|textbox|slate/i.test(text)) return "composerSurface";
  if (/message-action|chat-bubble|conversation|thread-scroll/i.test(text)) return "conversationSurface";
  if (/sidebar|left-panel|sidebar-item/i.test(text)) return "sidebarShell";
  if (/cit-button|button-icon|topUtility|titlebar/i.test(text)) return "buttonGlyphs";
  if (/hot-swap|table-flip|right-hud|trigger/i.test(text)) return "themeOwnedInteraction";
  return "unclassifiedInteractive";
}

function interactionKind(text) {
  const value = String(text || "");
  if (/tooltip/i.test(value)) return "tooltip";
  if (/popover|menu|listbox|dialog|cmdk|radix/i.test(value)) return "popoverOrMenu";
  if (/project-panel|summary-panel|來源|環境|source|environment/i.test(value)) return "rightPanelRow";
  if (/composer|send|stop|textbox|slate/i.test(value)) return "composerControl";
  if (/message-action|copy|thumb|continue|guide|delete|scroll/i.test(value)) return "messageAction";
  if (/sidebar|left-panel|sidebar-item/i.test(value)) return "sidebarControl";
  if (/hover|focus-visible|focus-within|aria-selected|data-selected|data-highlighted|active/i.test(value)) return "stateLayer";
  if (/button|\[role=|role="button"|trigger|toggle/i.test(value)) return "buttonOrTrigger";
  return "interactiveCandidate";
}

function scanCssFile(file) {
  const absolute = path.join(ROOT, file);
  const lines = safeRead(absolute).split(/\r?\n/);
  const records = [];
  let selectorParts = [];
  let currentSelector = "";
  let inBlock = false;
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!inBlock) {
      if (trimmed && !trimmed.startsWith("/*") && !trimmed.startsWith("*")) {
        selectorParts.push(trimmed.replace(/\{$/, "").trim());
      }
      if (trimmed.includes("{")) {
        currentSelector = normalizeSelector(selectorParts);
        selectorParts = [];
        inBlock = true;
      }
      return;
    }
    if (trimmed.includes("}")) {
      inBlock = false;
      currentSelector = "";
      selectorParts = [];
      return;
    }
    if (!nearBlackPaintLine(trimmed)) {
      return;
    }
    const context = `${currentSelector} ${trimmed}`;
    if (!INTERACTIVE_TEXT_RE.test(context)) {
      return;
    }
    records.push({
      key: `${file}:${index + 1}:${layerFromDeclaration(trimmed)}:${currentSelector}:${trimmed}`,
      source: "source-css",
      file,
      line: index + 1,
      owner: selectorOwner(currentSelector),
      interactionKind: interactionKind(context),
      selector: currentSelector,
      layer: layerFromDeclaration(trimmed),
      value: trimmed.slice(0, 420),
      protectedHint: PROTECTED_INTERACTIVE_RE.test(context)
    });
  });
  return records;
}

function scanTextSourceFile(file) {
  const absolute = path.join(ROOT, file);
  const lines = safeRead(absolute).split(/\r?\n/);
  const records = [];
  lines.forEach((line, index) => {
    if (!nearBlackPaintLine(line)) {
      return;
    }
    const context = lines.slice(Math.max(0, index - 8), Math.min(lines.length, index + 9)).join("\n");
    if (!INTERACTIVE_TEXT_RE.test(context)) {
      return;
    }
    records.push({
      key: `${file}:${index + 1}:${layerFromDeclaration(line)}:${line.trim()}`,
      source: "source-text",
      file,
      line: index + 1,
      owner: selectorOwner(context),
      interactionKind: interactionKind(context),
      selector: context.replace(/\s+/g, " ").slice(0, 500),
      layer: layerFromDeclaration(line),
      value: line.trim().slice(0, 420),
      protectedHint: PROTECTED_INTERACTIVE_RE.test(context)
    });
  });
  return records;
}

function staticIndexRecords(index) {
  const records = [];
  for (const rule of index.staticRules || []) {
    if (!String(rule.file || "").startsWith("macos/assets/")) {
      continue;
    }
    if (!sourceLineStillMatches(rule)) {
      continue;
    }
    if (rule.layer === "literal" && !nearBlackValue(rule.value || "")) {
      continue;
    }
    const context = `${rule.owner || ""} ${rule.selector || ""} ${rule.value || ""}`;
    if (!INTERACTIVE_OWNER_RE.test(rule.owner || "") && !INTERACTIVE_TEXT_RE.test(context)) {
      continue;
    }
    records.push({
      key: `static-index:${rule.key}`,
      source: "static-index-rule",
      file: rule.file,
      line: rule.line,
      owner: rule.owner || selectorOwner(context),
      interactionKind: interactionKind(context),
      selector: rule.selector || "",
      layer: rule.layer || "literal",
      value: String(rule.value || "").slice(0, 420),
      protectedHint: PROTECTED_INTERACTIVE_RE.test(context)
    });
  }
  for (const node of index.observedNodes || []) {
    const context = `${node.owner || ""} ${node.tag || ""} ${node.role || ""} ${node.className || ""} ${node.label || ""}`;
    if (!INTERACTIVE_OWNER_RE.test(node.owner || "") && !INTERACTIVE_TEXT_RE.test(context) && node.tag !== "button") {
      continue;
    }
    const rect = node.rect || {};
    for (const layer of node.blackLayers || []) {
      records.push({
        key: `observed-index:${node.key}:${layer.layer}:${layer.value}`,
        source: "observed-index-node",
        file: node.sourceFile || "",
        line: "",
        owner: node.owner || selectorOwner(context),
        interactionKind: interactionKind(context),
        selector: String(node.className || "").slice(0, 500),
        layer: layer.layer || "unknown",
        value: String(layer.value || "").slice(0, 420),
        state: node.state || "",
        tag: node.tag || "",
        role: node.role || "",
        label: String(node.label || "").slice(0, 160),
        rect: `${Math.round(rect.left || 0)},${Math.round(rect.top || 0)},${Math.round(rect.width || 0)}x${Math.round(rect.height || 0)}`,
        protectedHint: PROTECTED_INTERACTIVE_RE.test(context)
      });
    }
  }
  return records;
}

function dedupe(records) {
  const map = new Map();
  for (const record of records) {
    if (!map.has(record.key)) {
      map.set(record.key, record);
    }
  }
  return [...map.values()].sort((a, b) => `${a.owner}:${a.interactionKind}:${a.file}:${a.line}:${a.layer}`.localeCompare(`${b.owner}:${b.interactionKind}:${b.file}:${b.line}:${b.layer}`));
}

function countBy(records, field) {
  return records.reduce((acc, record) => {
    const key = record[field] || "unknown";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function compareKeys(current, previous) {
  const currentKeys = new Set(current.map((item) => item.key));
  const previousKeys = new Set((previous || []).map((item) => item.key));
  return {
    added: [...currentKeys].filter((key) => !previousKeys.has(key)).sort(),
    removed: [...previousKeys].filter((key) => !currentKeys.has(key)).sort(),
    persistent: [...currentKeys].filter((key) => previousKeys.has(key)).sort()
  };
}

function screenshotEvidence(files) {
  return files.map((file) => {
    try {
      const stat = fs.statSync(file);
      return { path: file, exists: true, bytes: stat.size, mtime: stat.mtime.toISOString() };
    } catch {
      return { path: file, exists: false };
    }
  });
}

function markdownTable(rows, columns) {
  const header = `| ${columns.map((column) => column.label).join(" | ")} |`;
  const divider = `| ${columns.map(() => "---").join(" | ")} |`;
  const body = rows.map((row) => `| ${columns.map((column) => String(column.value(row) ?? "").replace(/\r?\n/g, " ").replace(/\|/g, "\\|")).join(" | ")} |`);
  return [header, divider, ...body].join("\n");
}

function renderMarkdown(report, jsonPath) {
  const ownerRows = Object.entries(report.byOwner).sort((a, b) => b[1] - a[1]).map(([owner, count]) => ({ owner, count }));
  const kindRows = Object.entries(report.byInteractionKind).sort((a, b) => b[1] - a[1]).map(([kind, count]) => ({ kind, count }));
  const lines = [];
  lines.push("# Static Interactive Black Layer Index");
  lines.push("");
  lines.push(`generatedAt: ${report.generatedAt}`);
  lines.push(`json: ${jsonPath}`);
  lines.push("");
  lines.push("## Contract");
  lines.push("");
  lines.push("- Static-only: no CDP, no click, no launch, no apply, no restore.");
  lines.push("- Every row is one black or near-black interactive layer, not just one UI block.");
  lines.push("- Repair target order: added keys, then persistent interactive owner keys, then protected hints only after owner review.");
  lines.push("");
  lines.push("## Counts");
  lines.push("");
  lines.push(`- interactiveBlackLayers: ${report.counts.interactiveBlackLayers}`);
  lines.push(`- protectedHintLayers: ${report.counts.protectedHintLayers}`);
  lines.push(`- addedInteractiveLayers: ${report.deltaFromPreviousLatest.added.length}`);
  lines.push(`- removedInteractiveLayers: ${report.deltaFromPreviousLatest.removed.length}`);
  lines.push(`- persistentInteractiveLayers: ${report.deltaFromPreviousLatest.persistent.length}`);
  lines.push("");
  lines.push("## By Owner");
  lines.push("");
  lines.push(markdownTable(ownerRows, [
    { label: "owner", value: (row) => row.owner },
    { label: "black layers", value: (row) => row.count }
  ]));
  lines.push("");
  lines.push("## By Interaction Kind");
  lines.push("");
  lines.push(markdownTable(kindRows, [
    { label: "interaction kind", value: (row) => row.kind },
    { label: "black layers", value: (row) => row.count }
  ]));
  lines.push("");
  lines.push("## Layer Records");
  lines.push("");
  lines.push(markdownTable(report.layers, [
    { label: "owner", value: (row) => row.owner },
    { label: "kind", value: (row) => row.interactionKind },
    { label: "source", value: (row) => row.source },
    { label: "file:line", value: (row) => row.line ? `${row.file}:${row.line}` : row.file },
    { label: "state/rect", value: (row) => [row.state, row.rect].filter(Boolean).join(" ") },
    { label: "layer", value: (row) => row.layer },
    { label: "protected", value: (row) => row.protectedHint ? "yes" : "no" },
    { label: "selector/class", value: (row) => row.selector },
    { label: "value", value: (row) => row.value }
  ]));
  lines.push("");
  lines.push("## Reported Screenshots");
  lines.push("");
  if (report.inputs.reportedScreenshots.length) {
    lines.push(markdownTable(report.inputs.reportedScreenshots, [
      { label: "path", value: (row) => row.path },
      { label: "exists", value: (row) => row.exists },
      { label: "bytes", value: (row) => row.bytes || "" },
      { label: "mtime", value: (row) => row.mtime || "" }
    ]));
  } else {
    lines.push("- none");
  }
  lines.push("");
  return lines.join("\n");
}

function main() {
  const options = parseArgs(process.argv);
  if (options.help) {
    console.log(usage());
    return;
  }
  const outRoot = path.resolve(options.outRoot);
  ensureDir(outRoot);
  const latestJsonPath = path.join(outRoot, "latest-static-interactive-black-layer-index.json");
  const previous = safeJson(latestJsonPath);
  const blackIndex = safeJson(options.blackIndex) || {};
  const sourceRecords = SOURCE_FILES.flatMap((file) => file.endsWith(".css") ? scanCssFile(file) : scanTextSourceFile(file));
  const layers = dedupe([...sourceRecords, ...staticIndexRecords(blackIndex)]);
  const report = {
    ok: true,
    mode: "static-interactive-black-layer-index",
    generatedAt: new Date().toISOString(),
    root: ROOT,
    sideEffects: {
      connectsToCdp: false,
      clicks: false,
      drags: false,
      launches: false,
      appliesTheme: false,
      restores: false,
      mutatesLiveUi: false
    },
    inputs: {
      sourceFiles: SOURCE_FILES,
      blackIndex: path.resolve(options.blackIndex),
      reportedScreenshots: screenshotEvidence(options.reportedScreenshots)
    },
    counts: {
      interactiveBlackLayers: layers.length,
      protectedHintLayers: layers.filter((layer) => layer.protectedHint).length
    },
    byOwner: countBy(layers, "owner"),
    byInteractionKind: countBy(layers, "interactionKind"),
    deltaFromPreviousLatest: compareKeys(layers, previous?.layers),
    layers
  };
  const runId = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const outDir = path.join(outRoot, runId);
  ensureDir(outDir);
  const runJsonPath = path.join(outDir, "static-interactive-black-layer-index.json");
  const runMarkdownPath = path.join(outDir, "static-interactive-black-layer-index.md");
  const latestMarkdownPath = path.join(outRoot, "latest-static-interactive-black-layer-index.md");
  fs.writeFileSync(runJsonPath, JSON.stringify(report, null, 2) + "\n");
  fs.writeFileSync(latestJsonPath, JSON.stringify(report, null, 2) + "\n");
  fs.writeFileSync(runMarkdownPath, renderMarkdown(report, runJsonPath) + "\n");
  fs.writeFileSync(latestMarkdownPath, renderMarkdown(report, latestJsonPath) + "\n");
  console.log(`report=${runJsonPath}`);
  console.log(`markdown=${runMarkdownPath}`);
  console.log(`latest=${latestJsonPath}`);
  console.log(`latestMarkdown=${latestMarkdownPath}`);
  console.log(`interactiveBlackLayers=${report.counts.interactiveBlackLayers}`);
  console.log(`protectedHintLayers=${report.counts.protectedHintLayers}`);
  console.log(`addedInteractiveLayers=${report.deltaFromPreviousLatest.added.length}`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
