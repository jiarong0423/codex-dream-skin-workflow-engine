#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

function usage() {
  return `Usage:
  derive-clickable-allowlist.mjs --report <clickable-surface-audit.json> [--out <path>]
                                 [--include-stateful true|false] [--limit <n>]
                                 [--format text|json]

Derives a reviewed candidate index allowlist from a clickable dry-run report.
The script is read-only: it never connects to CDP, clicks, drags, launches,
restores, deletes files, or changes user state. It refuses destructive, write,
permission, session, composer-send, source-preview, and high-memory drag
candidates even when stateful UI controls are included.`;
}

function parseArgs(argv) {
  const options = { includeStateful: "false", limit: "24", format: "text", out: "" };
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
    options[key.slice(2).replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase())] = value;
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

function boolOption(value, name) {
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  throw new Error(`--${name} must be true or false`);
}

function norm(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

const HARD_DENY_RISK = new Set([
  "disabled",
  "composer-action",
  "write-action",
  "destructive-or-session",
  "permission-or-external",
  "source-preview-state"
]);

const STATEFUL_RISK = new Set([
  "new-task-route",
  "workspace-or-sidebar-state",
  "navigation-state",
  "sidebar-state",
  "top-toolbar-state",
  "popover-state",
  "right-panel-state"
]);

const HARD_DENY_LABEL = /送出|submit|send message|停止產生|stop generating|送交|推送|push|commit|merge|建立 pull request|create pull request|建立|create|復原|還原|undo|restore|revert|套用|apply|核准|approve|authorize|確認|confirm|執行|run|刪除|delete|trash|移除|remove|archive|封存|登出|logout|sign out|安裝|install|權限|permission|授權|grant|允許|allow|登入|login|sign in|訂閱|subscribe|付款|pay|buy|購買/i;

function classifyCandidate(candidate, includeStateful) {
  const label = norm(candidate && candidate.label).toLowerCase();
  const risk = norm(candidate && candidate.risk);
  const kind = norm(candidate && candidate.kind);
  const index = Number(candidate && candidate.index);
  if (!Number.isInteger(index) || index < 0) {
    return { allowed: false, reason: "invalid-index" };
  }
  if (HARD_DENY_LABEL.test(label)) {
    return { allowed: false, reason: "hard-deny-label" };
  }
  if (HARD_DENY_RISK.has(risk)) {
    return { allowed: false, reason: risk };
  }
  if (kind === "source-preview") {
    return { allowed: false, reason: "source-preview" };
  }
  if (candidate && candidate.dragRisk === "high-memory-image-resize") {
    return { allowed: false, reason: "high-memory-image-resize" };
  }
  if (candidate && candidate.draggable && candidate.autoDragSafe !== true) {
    return { allowed: false, reason: "unsafe-drag" };
  }
  if (!risk && candidate && candidate.safe === true) {
    return { allowed: true, reason: "safe" };
  }
  if (includeStateful && STATEFUL_RISK.has(risk)) {
    return { allowed: true, reason: `stateful:${risk}` };
  }
  return { allowed: false, reason: risk || "not-safe" };
}

function main() {
  const options = parseArgs(process.argv);
  if (options.help) {
    console.log(usage());
    return;
  }
  const includeStateful = boolOption(options.includeStateful, "include-stateful");
  const limit = Math.max(0, Math.min(200, Number(options.limit || 24)));
  if (!Number.isFinite(limit)) {
    throw new Error(`invalid --limit: ${options.limit}`);
  }
  const reportPath = path.resolve(requireOption(options, "report"));
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  const candidates = Array.isArray(report.candidates) ? report.candidates : [];
  const selected = [];
  const skipped = [];
  for (const candidate of candidates) {
    const classification = classifyCandidate(candidate, includeStateful);
    const entry = {
      index: Number(candidate.index),
      kind: candidate.kind || "",
      label: candidate.label || "",
      risk: candidate.risk || "",
      dragRisk: candidate.dragRisk || "",
      reason: classification.reason
    };
    if (classification.allowed && selected.length < limit) {
      selected.push(entry);
    } else {
      skipped.push(entry);
    }
  }
  const output = {
    ok: true,
    mode: "derive-clickable-allowlist",
    sourceReport: reportPath,
    includeStateful,
    limit,
    indexes: selected.map((entry) => entry.index),
    indexesCsv: selected.map((entry) => String(entry.index)).join(","),
    selected,
    skipped
  };
  if (options.out) {
    const outPath = path.resolve(options.out);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  }
  if (options.format === "json") {
    console.log(JSON.stringify(output, null, 2));
  } else {
    console.log("[codex-interface-theme] derived clickable allowlist");
    console.log(`source=${reportPath}`);
    console.log(`includeStateful=${includeStateful} selected=${selected.length} skipped=${skipped.length}`);
    console.log(`indexes=${output.indexesCsv}`);
    for (const entry of selected.slice(0, 24)) {
      console.log(`- ${entry.index} ${entry.kind} reason=${entry.reason} label=${norm(entry.label).slice(0, 90)}`);
    }
  }
}

try {
  main();
} catch (error) {
  console.error(`[codex-interface-theme][derive-clickable-allowlist] ${error.message}`);
  process.exitCode = 1;
}
