#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const DEFAULT_OUT_ROOT = path.join(ROOT, "macos", "previews", "static-black-layer-index");
const LATEST_PATH = path.join(DEFAULT_OUT_ROOT, "latest-static-black-layer-index.json");

const SOURCE_FILES = [
  "macos/assets/theme.css",
  "macos/assets/renderer-inject.js",
  "macos/assets/surface-registry.js",
  "macos/assets/theme-modules/black-shell-transparency.css",
  "macos/assets/runtime-modules.json",
  "docs/KNOWN_BLACK_RANGE_LEDGER.json",
  "docs/SURFACE_GAP_MATRIX.json"
];

const DEFAULT_SNAPSHOT_GLOBS = [
  "macos/previews/global-black-scan-20260826-0108/priority",
  "macos/previews/global-black-layer-memory"
];
const BLACK_COLOR_TOKEN_RE = /(^|[^\w-])black(?=$|[^\w-])/i;
const PAINT_DECLARATION_RE = /(?:^|[;"'{\s])([-\w]*background(?:-color|-image)?|box-shadow|filter|backdrop-filter|-webkit-backdrop-filter|border(?:-[\w]+)?-color|outline-color|fill|stroke)\s*:/i;
const THEME_PAINT_VAR_RE = /^\s*(--cit-(?:.*(?:bg|background|surface|shadow|plate|border|glow|accent|highlight|frame|armor|popover|composer|sidebar|header).*))\s*:/i;

function usage() {
  return `Usage: node macos/scripts/static-black-layer-index.mjs [options]

Options:
  --out-root <path>             Output root. Default: macos/previews/static-black-layer-index
  --reported-screenshot <path>  Attach a user-reported screenshot path as evidence.
  --snapshot-root <path>        Add a directory containing prior scan JSON evidence. Repeatable.

Static-only contract:
  reads local files and previous evidence JSON; does not connect to CDP, click,
  launch, apply, restore, or mutate live Codex UI.`;
}

function parseArgs(argv) {
  const options = {
    outRoot: DEFAULT_OUT_ROOT,
    reportedScreenshots: [],
    snapshotRoots: [...DEFAULT_SNAPSHOT_GLOBS]
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
    if (arg === "--out-root") {
      options.outRoot = path.resolve(value);
    } else if (arg === "--reported-screenshot") {
      options.reportedScreenshots.push(path.resolve(value));
    } else if (arg === "--snapshot-root") {
      options.snapshotRoots.push(path.resolve(value));
    } else {
      throw new Error(`unknown option: ${arg}`);
    }
    index += 1;
  }
  return options;
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

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function walkJsonFiles(dir) {
  const root = path.resolve(dir);
  const files = [];
  if (!fs.existsSync(root)) {
    return files;
  }
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    const stat = fs.statSync(current);
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(current)) {
        stack.push(path.join(current, entry));
      }
      continue;
    }
    if (current.endsWith(".json")) {
      files.push(current);
    }
  }
  return files.sort();
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
  const expand = raw.length === 3 || raw.length === 4;
  const full = expand ? raw.split("").map((char) => char + char).join("") : raw;
  if (full.length < 6) {
    return null;
  }
  const r = Number.parseInt(full.slice(0, 2), 16);
  const g = Number.parseInt(full.slice(2, 4), 16);
  const b = Number.parseInt(full.slice(4, 6), 16);
  const a = full.length >= 8 ? Number.parseInt(full.slice(6, 8), 16) / 255 : 1;
  return { r, g, b, a };
}

function isNearBlackColorToken(value) {
  const text = String(value || "");
  if (BLACK_COLOR_TOKEN_RE.test(text)) {
    return true;
  }
  const parts = colorParts(text);
  return Boolean(parts && parts.a >= 0.42 && Math.max(parts.r, parts.g, parts.b) <= 56 && parts.r + parts.g + parts.b <= 150);
}

function isNearBlackValue(value) {
  const text = String(value || "");
  if (/^\s*mask-image\s*:/i.test(text)) {
    return false;
  }
  if (isNearBlackColorToken(text)) {
    return true;
  }
  const colors = text.match(/rgba?\([^)]+\)|#[0-9a-f]{3,8}\b/gi) || [];
  return colors.some(isNearBlackColorToken);
}

function layerNameFromLine(line) {
  const text = String(line || "");
  const match = text.match(PAINT_DECLARATION_RE) || text.match(THEME_PAINT_VAR_RE);
  if (match) {
    return match[1];
  }
  return "";
}

function ownerFromContext(lines, lineIndex) {
  const start = Math.max(0, lineIndex - 10);
  const context = lines.slice(start, lineIndex + 1).join("\n");
  const selectors = [
    ["projectPanel", /project-panel|right.*panel|來源|環境|source|environment/i],
    ["transientShell", /transient-shell|popover|tooltip|menu|toast|radix|floating/i],
    ["composerSurface", /composer|message-composer|textarea|slate/i],
    ["conversationSurface", /chat-bubble|message|thread-scroll|conversation/i],
    ["sidebarShell", /sidebar|left-panel|app-shell-left-panel/i],
    ["routeShell", /route|main|workspace|webview|surface/i],
    ["sourcePreview", /source-preview|attachment|截圖|screenshot|preview/i],
    ["themeOwnedDecoration", /private-duel|right-hud|character|hot-swap|backdrop/i]
  ];
  const hit = selectors.find(([, regex]) => regex.test(context));
  return hit ? hit[0] : "unclassifiedStaticRule";
}

function selectorFromContext(lines, lineIndex) {
  for (let index = lineIndex; index >= Math.max(0, lineIndex - 16); index -= 1) {
    const line = lines[index].trim();
    if (!line || line.startsWith("@") || line.includes(":")) {
      continue;
    }
    if (line.includes("{") || line.includes("html") || line.includes(".codex-interface-theme") || line.includes("[data-")) {
      return line.replace(/\s+/g, " ").slice(0, 260);
    }
  }
  return "";
}

function scanSourceFile(file) {
  const absolute = path.join(ROOT, file);
  const text = safeRead(absolute);
  const lines = text.split(/\r?\n/);
  const records = [];
  let inMaskImageDeclaration = false;
  let activePaintDeclaration = "";
  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (/^(-webkit-)?mask-image\s*:/i.test(trimmed)) {
      inMaskImageDeclaration = !trimmed.includes(";");
      activePaintDeclaration = "";
      return;
    }
    if (inMaskImageDeclaration) {
      if (trimmed.includes(";")) {
        inMaskImageDeclaration = false;
      }
      return;
    }
    const declaredLayer = layerNameFromLine(line);
    if (declaredLayer) {
      activePaintDeclaration = declaredLayer;
    }
    if (!declaredLayer && !activePaintDeclaration) {
      return;
    }
    if (!isNearBlackValue(line)) {
      if (trimmed.includes(";")) {
        activePaintDeclaration = "";
      }
      return;
    }
    const layer = declaredLayer || activePaintDeclaration;
    if (!layer) {
      return;
    }
    const owner = ownerFromContext(lines, index);
    const selector = selectorFromContext(lines, index);
    const value = line.trim().slice(0, 320);
    records.push({
      key: `${file}:${index + 1}:${owner}:${layer}:${value}`,
      file,
      line: index + 1,
      owner,
      layer,
      selector,
      value
    });
    if (trimmed.includes(";")) {
      activePaintDeclaration = "";
    }
  });
  return records;
}

function flattenCandidates(value, sourceFile) {
  const results = [];
  const stack = [value];
  while (stack.length) {
    const current = stack.pop();
    if (!current || typeof current !== "object") {
      continue;
    }
    if (Array.isArray(current)) {
      for (const item of current) {
        stack.push(item);
      }
      continue;
    }
    const layers = [
      ...(Array.isArray(current.blackLayers) ? current.blackLayers : []),
      ...(Array.isArray(current.gradientLayers) ? current.gradientLayers : [])
    ];
    const hasBlack = current.blackCandidate === true || layers.some((layer) => isNearBlackValue(layer.value));
    if (hasBlack && (current.key || layers.length || current.owner || current.rect)) {
      const rect = current.rect || {};
      results.push({
        key: String(current.key || `${sourceFile}:${current.owner || "unknown"}:${current.tag || "node"}:${rect.left || 0},${rect.top || 0},${rect.width || 0},${rect.height || 0}`),
        sourceFile,
        state: current.state || "",
        owner: current.owner || "unclassifiedObservedNode",
        tag: current.tag || "",
        role: current.role || "",
        label: current.label || "",
        rect,
        className: String(current.className || "").slice(0, 240),
        blackLayers: layers.map((layer) => ({
          layer: layer.layer || "unknown",
          kind: layer.kind || "",
          value: String(layer.value || "").slice(0, 220),
          luminance: layer.luminance ?? null,
          alpha: layer.alpha ?? null
        }))
      });
    }
    for (const nested of Object.values(current)) {
      if (nested && typeof nested === "object") {
        stack.push(nested);
      }
    }
  }
  return results;
}

function loadObservedNodes(snapshotRoots) {
  const files = [...new Set(snapshotRoots.flatMap(walkJsonFiles))];
  const nodes = [];
  for (const file of files) {
    const json = safeJson(file);
    if (!json) {
      continue;
    }
    nodes.push(...flattenCandidates(json, relative(file)));
  }
  const deduped = new Map();
  for (const node of nodes) {
    if (!deduped.has(node.key)) {
      deduped.set(node.key, node);
    }
  }
  return [...deduped.values()].sort((a, b) => a.key.localeCompare(b.key));
}

function countBy(items, field) {
  return items.reduce((acc, item) => {
    const key = item[field] || "unknown";
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
  const body = rows.map((row) => {
    const cells = columns.map((column) => {
      const value = column.value(row);
      return String(value ?? "").replace(/\r?\n/g, " ").replace(/\|/g, "\\|");
    });
    return `| ${cells.join(" | ")} |`;
  });
  return [header, divider, ...body].join("\n");
}

function ownerRows(report) {
  const owners = new Set([
    ...Object.keys(report.byOwner.staticRules),
    ...Object.keys(report.byOwner.observedNodes)
  ]);
  return [...owners].sort().map((owner) => ({
    owner,
    staticRules: report.byOwner.staticRules[owner] || 0,
    observedNodes: report.byOwner.observedNodes[owner] || 0
  }));
}

function importantGapRows(report) {
  return ownerRows(report)
    .filter((row) => row.staticRules > 0 && row.observedNodes === 0)
    .sort((a, b) => b.staticRules - a.staticRules || a.owner.localeCompare(b.owner));
}

function observedPointRows(report) {
  return report.observedNodes.map((node) => {
    const rect = node.rect || {};
    return {
      state: node.state || "(stored)",
      owner: node.owner,
      tag: node.tag || "",
      rect: `${Math.round(rect.left || 0)},${Math.round(rect.top || 0)},${Math.round(rect.width || 0)}x${Math.round(rect.height || 0)}`,
      layers: node.blackLayers.map((layer) => layer.layer).join(", "),
      key: node.key.slice(0, 150)
    };
  });
}

function staticOwnerRows(report) {
  return report.staticRules
    .filter((rule) => ["projectPanel", "transientShell", "composerSurface", "conversationSurface", "sidebarShell", "routeShell"].includes(rule.owner))
    .map((rule) => ({
      owner: rule.owner,
      fileLine: `${rule.file}:${rule.line}`,
      layer: rule.layer,
      selector: rule.selector || "(context-only)"
    }));
}

function renderMarkdown(report, jsonPath) {
  const lines = [];
  lines.push("# Static Black Layer Index");
  lines.push("");
  lines.push(`generatedAt: ${report.generatedAt}`);
  lines.push(`json: ${jsonPath}`);
  lines.push("");
  lines.push("## Contract");
  lines.push("");
  lines.push("- Static-only: no CDP, no click, no launch, no apply, no restore.");
  lines.push("- Repair mode: replace existing owner rule or owner marker only.");
  lines.push("- Next run target: added keys first, then persistent black keys by owner.");
  lines.push("");
  lines.push("## Counts");
  lines.push("");
  lines.push(`- staticBlackRules: ${report.counts.staticBlackRules}`);
  lines.push(`- observedBlackNodes: ${report.counts.observedBlackNodes}`);
  lines.push(`- observedBlackLayers: ${report.counts.observedBlackLayers}`);
  lines.push(`- addedStaticRules: ${report.deltaFromPreviousLatest.staticRules.added.length}`);
  lines.push(`- addedObservedNodes: ${report.deltaFromPreviousLatest.observedNodes.added.length}`);
  lines.push("");
  lines.push("## Owner Index");
  lines.push("");
  lines.push(markdownTable(ownerRows(report), [
    { label: "owner", value: (row) => row.owner },
    { label: "static rules", value: (row) => row.staticRules },
    { label: "observed nodes", value: (row) => row.observedNodes }
  ]));
  lines.push("");
  lines.push("## Static Owner Gaps");
  lines.push("");
  const gapRows = importantGapRows(report);
  if (gapRows.length) {
    lines.push(markdownTable(gapRows, [
      { label: "owner", value: (row) => row.owner },
      { label: "static rules", value: (row) => row.staticRules },
      { label: "observed nodes", value: (row) => row.observedNodes }
    ]));
  } else {
    lines.push("- none");
  }
  lines.push("");
  lines.push("## Observed Node Points");
  lines.push("");
  const pointRows = observedPointRows(report);
  if (pointRows.length) {
    lines.push(markdownTable(pointRows, [
      { label: "state", value: (row) => row.state },
      { label: "owner", value: (row) => row.owner },
      { label: "tag", value: (row) => row.tag },
      { label: "rect", value: (row) => row.rect },
      { label: "layers", value: (row) => row.layers },
      { label: "key", value: (row) => row.key }
    ]));
  } else {
    lines.push("- none");
  }
  lines.push("");
  lines.push("## Static Rule Grab Points");
  lines.push("");
  const ruleRows = staticOwnerRows(report);
  if (ruleRows.length) {
    lines.push(markdownTable(ruleRows, [
      { label: "owner", value: (row) => row.owner },
      { label: "file:line", value: (row) => row.fileLine },
      { label: "layer", value: (row) => row.layer },
      { label: "selector/context", value: (row) => row.selector }
    ]));
  } else {
    lines.push("- none");
  }
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
  const runId = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const outDir = path.join(outRoot, runId);
  ensureDir(outDir);
  const latestPath = path.join(outRoot, "latest-static-black-layer-index.json");
  const previous = safeJson(latestPath);

  const staticRules = SOURCE_FILES.flatMap(scanSourceFile);
  const observedNodes = loadObservedNodes(options.snapshotRoots);
  const report = {
    ok: true,
    mode: "static-black-layer-index",
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
      snapshotRoots: options.snapshotRoots.map((item) => path.resolve(item)),
      reportedScreenshots: screenshotEvidence(options.reportedScreenshots)
    },
    counts: {
      staticBlackRules: staticRules.length,
      observedBlackNodes: observedNodes.length,
      observedBlackLayers: observedNodes.reduce((sum, node) => sum + node.blackLayers.length, 0)
    },
    byOwner: {
      staticRules: countBy(staticRules, "owner"),
      observedNodes: countBy(observedNodes, "owner")
    },
    deltaFromPreviousLatest: {
      staticRules: compareKeys(staticRules, previous?.staticRules),
      observedNodes: compareKeys(observedNodes, previous?.observedNodes)
    },
    repairContract: {
      mode: "replace-existing-owner-rule-only",
      coordinatePolicy: "coordinates are evidence only; owner identity comes from selector, marker, role, class, semantic text, and stored scan key",
      nextRunPolicy: "load latest-static-black-layer-index.json and target added or still-black keys first"
    },
    staticRules,
    observedNodes
  };

  const runPath = path.join(outDir, "static-black-layer-index.json");
  const runMarkdownPath = path.join(outDir, "static-black-layer-index.md");
  const latestMarkdownPath = path.join(outRoot, "latest-static-black-layer-index.md");
  fs.writeFileSync(runPath, JSON.stringify(report, null, 2) + "\n");
  fs.writeFileSync(latestPath, JSON.stringify(report, null, 2) + "\n");
  fs.writeFileSync(runMarkdownPath, renderMarkdown(report, runPath) + "\n");
  fs.writeFileSync(latestMarkdownPath, renderMarkdown(report, latestPath) + "\n");
  console.log(`report=${runPath}`);
  console.log(`markdown=${runMarkdownPath}`);
  console.log(`latest=${latestPath}`);
  console.log(`latestMarkdown=${latestMarkdownPath}`);
  console.log(`staticBlackRules=${report.counts.staticBlackRules}`);
  console.log(`observedBlackNodes=${report.counts.observedBlackNodes}`);
  console.log(`observedBlackLayers=${report.counts.observedBlackLayers}`);
  console.log(`addedStaticRules=${report.deltaFromPreviousLatest.staticRules.added.length}`);
  console.log(`addedObservedNodes=${report.deltaFromPreviousLatest.observedNodes.added.length}`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
