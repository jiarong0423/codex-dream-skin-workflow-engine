#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

function usage() {
  return `Usage:
  dynamic-boundary-summary-viewer-smoke.mjs [--html <path>] [--format text|json]

Checks the offline dynamic boundary summary viewer. It does not launch Codex,
connect to CDP, click live UI, drag, apply, restore, delete, or execute the
viewer.`;
}

function parseArgs(argv) {
  const options = { format: "text" };
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

function assert(condition, errors, message) {
  if (!condition) {
    errors.push(message);
  }
}

function buildReport(htmlPath) {
  const html = fs.readFileSync(htmlPath, "utf8");
  const errors = [];
  const warnings = [];
  const requiredLocks = [
    "sourcePreviewBlocks",
    "rightTopChips",
    "leftSidebarRows",
    "projectPanelRows",
    "accountPopover",
    "composerSurface",
    "blackShellTransparency"
  ];
  const requiredControls = [
    'id="summaryFile"',
    'id="loadFixture"',
    'id="renderJson"',
    'id="clearInput"',
    'id="jsonInput"',
    'id="lockGrid"',
    'id="targetList"'
  ];
  const forbidden = [
    "fetch(",
    "WebSocket",
    "Runtime.evaluate",
    "Input.dispatch",
    "Page.captureScreenshot",
    "start.sh",
    "restore.sh",
    "atomic-ui-automation-gate.sh",
    "dynamic-boundary-readonly-gate.sh",
    "osascript",
    "open -a",
    "git push",
    "localStorage.setItem",
    "sessionStorage.setItem"
  ];

  assert(html.includes('data-viewer-mode="offline-summary-viewer"'), errors, "viewer must expose offline summary mode");
  assert(html.includes("read-only-dynamic-boundary-artifact-summary"), errors, "viewer must accept the read-only artifact summary mode");
  assert(html.includes("FIXTURE_SUMMARY"), errors, "viewer must include a built-in fixture summary");
  assert(html.includes("FileReader"), errors, "viewer must load local files through FileReader");
  assert(html.includes("JSON.parse"), errors, "viewer must parse pasted JSON");
  assert(html.includes("renderSummary"), errors, "viewer must render summaries through a single renderer function");
  assert(html.includes("replaceChildren"), errors, "viewer must update rendered lists without appending stale cards");
  assert(html.includes("highMemoryImageResizeLocks"), errors, "viewer must expose high-memory resize lock status");
  assert(html.includes("mutates: false"), errors, "viewer fixture must declare mutates false");
  assert(html.includes("clicks: false"), errors, "viewer fixture must declare clicks false");
  assert(html.includes("drags: false"), errors, "viewer fixture must declare drags false");

  for (const lockId of requiredLocks) {
    assert(html.includes(lockId), errors, `viewer missing lock mapping: ${lockId}`);
  }
  for (const control of requiredControls) {
    assert(html.includes(control), errors, `viewer missing control: ${control}`);
  }
  for (const token of forbidden) {
    assert(!html.includes(token), errors, `viewer must not include live or mutating token: ${token}`);
  }
  if (/(^|[\s;&|])rm(\s|$)/.test(html)) {
    errors.push("viewer must not include an rm command path");
  }
  const lockCardCount = Array.from(html.matchAll(/id:\s*"([A-Za-z0-9]+)"/g)).filter((match) => requiredLocks.includes(match[1])).length;
  if (lockCardCount < requiredLocks.length) {
    warnings.push(`fixture lock count may be lower than required locks: fixture=${lockCardCount} required=${requiredLocks.length}`);
  }

  return {
    ok: errors.length === 0,
    htmlPath,
    controls: requiredControls.length,
    locks: requiredLocks,
    warnings,
    errors
  };
}

function main() {
  const options = parseArgs(process.argv);
  if (options.help) {
    console.log(usage());
    return;
  }
  const scriptDir = path.dirname(new URL(import.meta.url).pathname);
  const rootDir = path.resolve(scriptDir, "..");
  const htmlPath = path.resolve(options.html || path.join(rootDir, "previews", "dynamic-boundary-summary-viewer.html"));
  const report = buildReport(htmlPath);
  if (options.format === "json") {
    console.log(JSON.stringify(report, null, 2));
  } else if (options.format === "text") {
    console.log("[codex-interface-theme] dynamic boundary summary viewer smoke");
    console.log(`ok=${report.ok}`);
    console.log(`controls=${report.controls}`);
    console.log(`locks=${report.locks.join(",")}`);
    for (const warning of report.warnings) {
      console.log(`warning=${warning}`);
    }
    for (const error of report.errors) {
      console.log(`error=${error}`);
    }
  } else {
    throw new Error(`unknown format: ${options.format}`);
  }
  if (!report.ok) {
    process.exit(1);
  }
}

try {
  main();
} catch (error) {
  console.error(`[codex-interface-theme][dynamic-boundary-summary-viewer-smoke] ${error.message}`);
  process.exit(1);
}
