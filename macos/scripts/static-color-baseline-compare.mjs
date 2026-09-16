#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..", "..");
const DEFAULT_OUT_ROOT = path.join(ROOT, "macos", "previews", "static-color-baseline-compare");
const FILES = [
  "macos/assets/theme.css",
  "macos/assets/theme-modules/black-shell-transparency.css",
  "macos/assets/renderer-inject.js"
];
const OWNER_PATTERNS = [
  ["projectPanel", /project-panel|right-panel|summary-panel|來源|環境|source|environment|right-panel-fill|side-rail/i],
  ["transientShell", /transient|popover|tooltip|menu|listbox|dialog|cmdk|radix|picker|shortcut|archived|project-list/i],
  ["composerSurface", /composer|message-composer|textbox|slate/i],
  ["conversationSurface", /chat-bubble|chat-card|messageActions|thread-scroll|conversation/i],
  ["sidebarShell", /sidebar|left-panel|sidebar-item/i],
  ["buttonGlyphs", /button|cit-button|glyph|trigger|toggle|hot-swap/i]
];

function usage() {
  return `Usage: node macos/scripts/static-color-baseline-compare.mjs --baseline <git-ref> [options]

Options:
  --out-root <path>       Output root. Default: macos/previews/static-color-baseline-compare

Static-only contract:
  reads git blobs and current source files only; does not connect to CDP, click,
  launch, apply, restore, or mutate live Codex UI.`;
}

function parseArgs(argv) {
  const options = { baseline: "", outRoot: DEFAULT_OUT_ROOT };
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
    if (arg === "--baseline") {
      options.baseline = value;
    } else if (arg === "--out-root") {
      options.outRoot = path.resolve(value);
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

function readCurrent(file) {
  try {
    return fs.readFileSync(path.join(ROOT, file), "utf8");
  } catch {
    return "";
  }
}

function readGit(ref, file) {
  try {
    return execFileSync("git", ["show", `${ref}:${file}`], { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return "";
  }
}

function colorParts(value) {
  const text = String(value || "");
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
  if (!hex) return null;
  const raw = hex[1];
  const full = raw.length === 3 || raw.length === 4 ? raw.split("").map((char) => char + char).join("") : raw;
  if (full.length < 6) return null;
  const r = Number.parseInt(full.slice(0, 2), 16);
  const g = Number.parseInt(full.slice(2, 4), 16);
  const b = Number.parseInt(full.slice(4, 6), 16);
  const a = full.length >= 8 ? Number.parseInt(full.slice(6, 8), 16) / 255 : 1;
  return { r, g, b, a };
}

function luminance(value) {
  const color = colorParts(value);
  if (!color) return null;
  return Math.round((0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b) * 1000) / 1000;
}

function ownerFromContext(context) {
  const hit = OWNER_PATTERNS.find(([, regex]) => regex.test(context));
  return hit ? hit[0] : "unclassified";
}

function selectorFromLines(lines, lineIndex) {
  for (let index = lineIndex; index >= Math.max(0, lineIndex - 14); index -= 1) {
    const line = lines[index].trim();
    if (!line || line.includes(":")) continue;
    if (line.includes("{") || line.includes("html") || line.includes(".codex-interface-theme") || line.includes("[data-")) {
      return line.replace(/\s+/g, " ").slice(0, 320);
    }
  }
  return "";
}

function extractRecords(text, file, source) {
  const lines = text.split(/\r?\n/);
  const records = [];
  lines.forEach((line, index) => {
    const colors = line.match(/rgba?\([^)]+\)|#[0-9a-f]{3,8}\b/gi) || [];
    if (!colors.length) return;
    const context = lines.slice(Math.max(0, index - 8), Math.min(lines.length, index + 9)).join("\n");
    const selector = selectorFromLines(lines, index);
    const variable = line.match(/(--cit-[\w-]+)\s*:/)?.[1] || "";
    const property = line.match(/(?:^|[;"'{\s])([-\w]*background(?:-color|-image)?|box-shadow|filter|backdrop-filter|-webkit-backdrop-filter|border(?:-[\w]+)?-color|outline-color|fill|stroke|text-shadow|mask-image)\s*:/i)?.[1] || (variable ? "css-variable" : "color-literal");
    colors.forEach((color, colorIndex) => {
      records.push({
        key: variable ? `${file}:${variable}` : `${file}:${index + 1}:${property}:${colorIndex}`,
        source,
        file,
        line: index + 1,
        owner: ownerFromContext(`${context}\n${selector}`),
        variable,
        property,
        selector,
        color,
        luminance: luminance(color),
        text: line.trim().slice(0, 420)
      });
    });
  });
  return records;
}

function indexByKey(records) {
  const map = new Map();
  for (const record of records) {
    if (!map.has(record.key)) {
      map.set(record.key, record);
    }
  }
  return map;
}

function compare(current, baseline) {
  const currentMap = indexByKey(current);
  const baselineMap = indexByKey(baseline);
  const rows = [];
  for (const [key, currentRecord] of currentMap.entries()) {
    const base = baselineMap.get(key);
    if (!base) {
      rows.push({
        key,
        status: "current-only",
        owner: currentRecord.owner,
        file: currentRecord.file,
        line: currentRecord.line,
        variable: currentRecord.variable,
        property: currentRecord.property,
        selector: currentRecord.selector,
        baselineColor: "",
        currentColor: currentRecord.color,
        baselineLuminance: null,
        currentLuminance: currentRecord.luminance,
        luminanceDelta: null,
        currentText: currentRecord.text,
        baselineText: ""
      });
      continue;
    }
    const delta = currentRecord.luminance === null || base.luminance === null ? null : Math.round((currentRecord.luminance - base.luminance) * 1000) / 1000;
    if (currentRecord.color !== base.color || delta !== 0) {
      rows.push({
        key,
        status: delta !== null && delta < 0 ? "darker-than-baseline" : "changed",
        owner: currentRecord.owner,
        file: currentRecord.file,
        line: currentRecord.line,
        variable: currentRecord.variable,
        property: currentRecord.property,
        selector: currentRecord.selector,
        baselineColor: base.color,
        currentColor: currentRecord.color,
        baselineLuminance: base.luminance,
        currentLuminance: currentRecord.luminance,
        luminanceDelta: delta,
        currentText: currentRecord.text,
        baselineText: base.text
      });
    }
  }
  for (const [key, base] of baselineMap.entries()) {
    if (!currentMap.has(key)) {
      rows.push({
        key,
        status: "removed-from-current",
        owner: base.owner,
        file: base.file,
        line: base.line,
        variable: base.variable,
        property: base.property,
        selector: base.selector,
        baselineColor: base.color,
        currentColor: "",
        baselineLuminance: base.luminance,
        currentLuminance: null,
        luminanceDelta: null,
        currentText: "",
        baselineText: base.text
      });
    }
  }
  return rows.sort((a, b) => `${a.owner}:${a.status}:${a.file}:${a.line}:${a.variable}`.localeCompare(`${b.owner}:${b.status}:${b.file}:${b.line}:${b.variable}`));
}

function countBy(rows, field) {
  return rows.reduce((acc, row) => {
    const key = row[field] || "unknown";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function markdownTable(rows, columns) {
  const header = `| ${columns.map((column) => column.label).join(" | ")} |`;
  const divider = `| ${columns.map(() => "---").join(" | ")} |`;
  const body = rows.map((row) => `| ${columns.map((column) => String(column.value(row) ?? "").replace(/\r?\n/g, " ").replace(/\|/g, "\\|")).join(" | ")} |`);
  return [header, divider, ...body].join("\n");
}

function renderMarkdown(report, jsonPath) {
  const important = report.rows.filter((row) => ["projectPanel", "transientShell", "sidebarHoverPreviewShell", "sidebarShell", "conversationSurface"].includes(row.owner));
  const darker = important.filter((row) => row.status === "darker-than-baseline" || row.status === "current-only");
  const lines = [];
  lines.push("# Static Color Baseline Compare");
  lines.push("");
  lines.push(`generatedAt: ${report.generatedAt}`);
  lines.push(`baseline: ${report.baseline}`);
  lines.push(`json: ${jsonPath}`);
  lines.push("");
  lines.push("## Counts");
  lines.push("");
  lines.push(`- changedRows: ${report.counts.changedRows}`);
  lines.push(`- importantOwnerRows: ${important.length}`);
  lines.push(`- darkerOrCurrentOnlyImportantRows: ${darker.length}`);
  lines.push("");
  lines.push("## By Owner");
  lines.push("");
  lines.push(markdownTable(Object.entries(report.byOwner).map(([owner, count]) => ({ owner, count })).sort((a, b) => b.count - a.count), [
    { label: "owner", value: (row) => row.owner },
    { label: "changed rows", value: (row) => row.count }
  ]));
  lines.push("");
  lines.push("## Important Darker Or Current-Only Rows");
  lines.push("");
  if (darker.length) {
    lines.push(markdownTable(darker, [
      { label: "status", value: (row) => row.status },
      { label: "owner", value: (row) => row.owner },
      { label: "file:line", value: (row) => `${row.file}:${row.line}` },
      { label: "variable/property", value: (row) => row.variable || row.property },
      { label: "baseline", value: (row) => row.baselineColor },
      { label: "current", value: (row) => row.currentColor },
      { label: "lum delta", value: (row) => row.luminanceDelta },
      { label: "selector", value: (row) => row.selector },
      { label: "current text", value: (row) => row.currentText }
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
  if (!options.baseline) {
    throw new Error("--baseline is required");
  }
  ensureDir(options.outRoot);
  const baselineRecords = FILES.flatMap((file) => extractRecords(readGit(options.baseline, file), file, "baseline"));
  const currentRecords = FILES.flatMap((file) => extractRecords(readCurrent(file), file, "current"));
  const rows = compare(currentRecords, baselineRecords);
  const report = {
    ok: true,
    mode: "static-color-baseline-compare",
    generatedAt: new Date().toISOString(),
    baseline: options.baseline,
    root: ROOT,
    files: FILES,
    sideEffects: {
      connectsToCdp: false,
      clicks: false,
      drags: false,
      launches: false,
      appliesTheme: false,
      restores: false,
      mutatesLiveUi: false
    },
    counts: {
      baselineRecords: baselineRecords.length,
      currentRecords: currentRecords.length,
      changedRows: rows.length
    },
    byOwner: countBy(rows, "owner"),
    byStatus: countBy(rows, "status"),
    rows
  };
  const runId = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const outDir = path.join(options.outRoot, `${runId}-${options.baseline.replace(/[^a-z0-9._-]/gi, "_")}`);
  ensureDir(outDir);
  const jsonPath = path.join(outDir, "static-color-baseline-compare.json");
  const markdownPath = path.join(outDir, "static-color-baseline-compare.md");
  const latestJson = path.join(options.outRoot, `latest-${options.baseline.replace(/[^a-z0-9._-]/gi, "_")}-static-color-baseline-compare.json`);
  const latestMarkdown = path.join(options.outRoot, `latest-${options.baseline.replace(/[^a-z0-9._-]/gi, "_")}-static-color-baseline-compare.md`);
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2) + "\n");
  fs.writeFileSync(latestJson, JSON.stringify(report, null, 2) + "\n");
  fs.writeFileSync(markdownPath, renderMarkdown(report, jsonPath) + "\n");
  fs.writeFileSync(latestMarkdown, renderMarkdown(report, latestJson) + "\n");
  console.log(`report=${jsonPath}`);
  console.log(`markdown=${markdownPath}`);
  console.log(`latest=${latestJson}`);
  console.log(`latestMarkdown=${latestMarkdown}`);
  console.log(`baselineRecords=${report.counts.baselineRecords}`);
  console.log(`currentRecords=${report.counts.currentRecords}`);
  console.log(`changedRows=${report.counts.changedRows}`);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
