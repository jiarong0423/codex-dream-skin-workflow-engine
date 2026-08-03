#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

function usage() {
  return `Usage:
  atomic-control-plan.mjs [--schema <path>] [--runtime-manifest <path>]
    [--port <port>] [--wait-ms <ms>] [--out-dir <absolute-path>]
    [--plan-kind atomic-gate|dynamic-coverage]
    [--samples <n>] [--interval-ms <ms>]
    [--load-mode visual|carrier-only|framework-only|control-only]
    [--launch-if-missing true|false]
    [--interact true|false]
    [--allow-stateful-controls true|false]
    [--auto-allowlist true|false]
    [--verify-local-control-clicks true|false]
    [--allow-indexes <csv>]
    [--drag true|false]
    [--format text|json]

Builds an offline command plan for atomic-ui-automation-gate.sh. It never
launches Codex, never connects to CDP, never clicks, never drags, and never
executes the generated command.`;
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

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function boolOption(options, name, defaultValue) {
  const raw = options[name];
  if (raw === undefined) {
    return defaultValue;
  }
  if (raw === "true") {
    return true;
  }
  if (raw === "false") {
    return false;
  }
  throw new Error(`--${name} must be true or false`);
}

function numericOption(options, name, defaultValue) {
  const raw = options[name] === undefined ? String(defaultValue) : String(options[name]);
  if (!/^[0-9]+$/.test(raw)) {
    throw new Error(`--${name} must be numeric: ${raw}`);
  }
  return Number(raw);
}

export function shellQuote(value) {
  const text = String(value);
  if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(text)) {
    return text;
  }
  return `'${text.replace(/'/g, `'\\''`)}'`;
}

export function buildCommand(plan) {
  if (plan.options.planKind === "dynamic-coverage") {
    return [
      "bash",
      "macos/scripts/dynamic-boundary-readonly-gate.sh",
      "--port",
      String(plan.options.port),
      "--out-dir",
      plan.options.outDir,
      "--samples",
      String(plan.options.samples),
      "--interval-ms",
      String(plan.options.intervalMs),
      "--allow-stateful-controls",
      String(plan.options.allowStatefulControls)
    ];
  }
  const command = [
    "bash",
    "macos/scripts/atomic-ui-automation-gate.sh",
    "--port",
    String(plan.options.port),
    "--out-dir",
    plan.options.outDir,
    "--wait-ms",
    String(plan.options.waitMs),
    "--load-mode",
    plan.options.loadMode,
    "--launch-if-missing",
    String(plan.options.launchIfMissing),
    "--interact",
    String(plan.options.interact),
    "--allow-stateful-controls",
    String(plan.options.allowStatefulControls),
    "--auto-allowlist",
    String(plan.options.autoAllowlist),
    "--verify-local-control-clicks",
    String(plan.options.verifyLocalControlClicks),
    "--drag",
    String(plan.options.drag)
  ];
  if (plan.options.allowIndexes) {
    command.push("--allow-indexes", plan.options.allowIndexes);
  }
  return command;
}

export function validatePlan(schema, runtimeManifest, options) {
  const defaults = schema.defaults || {};
  const planKind = options["plan-kind"] || defaults.planKind || "atomic-gate";
  const schemaPlanKinds = Array.isArray(schema.planKinds) ? schema.planKinds.map((item) => item.id) : ["atomic-gate"];
  if (!schemaPlanKinds.includes(planKind)) {
    throw new Error(`unknown plan kind: ${planKind}`);
  }
  const loadMode = options["load-mode"] || defaults.loadMode || "carrier-only";
  const manifestModes = runtimeManifest.loadModes && typeof runtimeManifest.loadModes === "object"
    ? Object.keys(runtimeManifest.loadModes)
    : [];
  const schemaModes = Array.isArray(schema.loadModes) ? schema.loadModes.map((item) => item.id) : [];
  const allowedModes = new Set([...manifestModes, ...schemaModes]);
  if (!allowedModes.has(loadMode)) {
    throw new Error(`unknown load mode: ${loadMode}`);
  }

  const outDir = options["out-dir"] || defaults.outDir || "";
  if (!path.isAbsolute(outDir)) {
    throw new Error(`--out-dir must be absolute: ${outDir}`);
  }

  const allowIndexes = String(options["allow-indexes"] || defaults.allowIndexes || "").trim();
  if (allowIndexes && !/^[0-9]+(,[0-9]+)*$/.test(allowIndexes)) {
    throw new Error("--allow-indexes must be a comma-separated numeric index list");
  }

  const plan = {
    ok: true,
    mode: "offline-command-plan",
    executes: false,
    mutates: false,
    connectsToCdp: false,
    options: {
      port: numericOption(options, "port", defaults.port || 9341),
      waitMs: numericOption(options, "wait-ms", defaults.waitMs || 8000),
      samples: numericOption(options, "samples", defaults.samples || 3),
      intervalMs: numericOption(options, "interval-ms", defaults.intervalMs || 700),
      outDir,
      planKind,
      loadMode,
      launchIfMissing: boolOption(options, "launch-if-missing", Boolean(defaults.launchIfMissing)),
      interact: boolOption(options, "interact", Boolean(defaults.interact)),
      allowStatefulControls: boolOption(options, "allow-stateful-controls", Boolean(defaults.allowStatefulControls)),
      autoAllowlist: boolOption(options, "auto-allowlist", Boolean(defaults.autoAllowlist)),
      verifyLocalControlClicks: boolOption(options, "verify-local-control-clicks", Boolean(defaults.verifyLocalControlClicks)),
      allowIndexes,
      drag: boolOption(options, "drag", Boolean(defaults.drag))
    },
    invariants: Array.isArray(schema.invariants) ? schema.invariants : [],
    warnings: []
  };

  if (plan.options.planKind === "dynamic-coverage") {
    if (plan.options.launchIfMissing) {
      throw new Error("dynamic coverage plan refuses launch-if-missing");
    }
    if (plan.options.interact || plan.options.autoAllowlist || plan.options.verifyLocalControlClicks || plan.options.allowIndexes || plan.options.drag) {
      throw new Error("dynamic coverage plan is read-only and rejects interact, auto allowlist, local clicks, allow indexes, and drag");
    }
    plan.warnings.push("dynamic coverage uses read-only inventory only; it does not apply, restore, click, drag, launch, or mutate UI");
    if (plan.options.loadMode !== "carrier-only") {
      plan.warnings.push("load mode is ignored by dynamic coverage; no theme is applied");
    }
  }
  if (plan.options.interact && !plan.options.autoAllowlist && !plan.options.allowIndexes) {
    throw new Error("interactive plan requires --allow-indexes or --auto-allowlist true");
  }
  if (!plan.options.interact && (plan.options.autoAllowlist || plan.options.allowIndexes)) {
    plan.warnings.push("allowlist settings are retained in the plan but the generated gate remains non-interactive");
  }
  if (plan.options.drag && !plan.options.interact) {
    throw new Error("drag plan requires --interact true");
  }
  if (plan.options.drag && !plan.options.allowIndexes) {
    throw new Error("drag plan requires explicit --allow-indexes; derived allowlists stay click-only");
  }
  if (plan.options.loadMode === "visual") {
    plan.warnings.push("visual mode carries theme assets; use carrier-only for first-pass dynamic UI audits");
  }
  if (plan.options.loadMode === "control-only") {
    plan.warnings.push("control-only applies only the in-window atomic command workbench; it is one-shot and carries no visual assets");
  }
  if (plan.options.verifyLocalControlClicks && plan.options.loadMode !== "control-only") {
    throw new Error("local control click verification requires --load-mode control-only");
  }
  if (plan.options.verifyLocalControlClicks) {
    plan.warnings.push("local control click verification is scoped to the theme-owned control workbench only");
  }
  if (plan.options.launchIfMissing) {
    plan.warnings.push("launch-if-missing may open Codex only if it is not already running; it still refuses restart");
  }

  plan.command = buildCommand(plan);
  plan.commandText = plan.command.map(shellQuote).join(" ");
  return plan;
}

function main() {
  const options = parseArgs(process.argv);
  if (options.help) {
    console.log(usage());
    return;
  }
  const scriptDir = path.dirname(new URL(import.meta.url).pathname);
  const rootDir = path.resolve(scriptDir, "..");
  const schemaPath = path.resolve(options.schema || path.join(rootDir, "assets", "atomic-control-schema.json"));
  const runtimeManifestPath = path.resolve(options["runtime-manifest"] || path.join(rootDir, "assets", "runtime-modules.json"));
  const schema = readJson(schemaPath);
  const runtimeManifest = readJson(runtimeManifestPath);
  const plan = validatePlan(schema, runtimeManifest, options);

  if (options.format === "json") {
    console.log(JSON.stringify(plan, null, 2));
    return;
  }
  if (options.format !== "text") {
    throw new Error(`unknown format: ${options.format}`);
  }
  console.log("[codex-interface-theme] atomic control plan");
  console.log(`ok=${plan.ok}`);
  console.log(`mode=${plan.mode}`);
  console.log(`executes=${plan.executes}`);
  console.log(`mutates=${plan.mutates}`);
  console.log(`connectsToCdp=${plan.connectsToCdp}`);
  console.log(`planKind=${plan.options.planKind}`);
  console.log(`loadMode=${plan.options.loadMode}`);
  console.log(`command=${plan.commandText}`);
  if (plan.warnings.length > 0) {
    console.log("warnings:");
    for (const warning of plan.warnings) {
      console.log(`- ${warning}`);
    }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  try {
    main();
  } catch (error) {
    console.error(`[codex-interface-theme][atomic-control-plan] ${error.message}`);
    process.exit(1);
  }
}
