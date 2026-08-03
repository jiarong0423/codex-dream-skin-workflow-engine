#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { validatePlan } from "./atomic-control-plan.mjs";

function usage() {
  return `Usage:
  atomic-control-workbench-smoke.mjs [--schema <path>] [--runtime-manifest <path>] [--asset-manifest <path>]
    [--html <path>] [--renderer <path>] [--format text|json]

Checks that the offline and in-window atomic control workbenches expose the same
clickable load-mode and toggle model as the command planner. It does not launch
Codex, does not connect to CDP, does not click live UI, and does not execute the
generated command.`;
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

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function attrValue(tag, name) {
  const pattern = new RegExp(`\\b${name}=["']([^"']+)["']`, "i");
  const match = tag.match(pattern);
  return match ? match[1] : "";
}

function buttonTags(html) {
  return Array.from(html.matchAll(/<button\b[^>]*>/gi)).map((match) => match[0]);
}

function inputTags(html) {
  return Array.from(html.matchAll(/<input\b[^>]*>/gi)).map((match) => match[0]);
}

function modeCards(html) {
  return buttonTags(html)
    .filter((tag) => /\bmode-card\b/.test(attrValue(tag, "class")))
    .filter((tag) => Boolean(attrValue(tag, "data-mode")))
    .map((tag) => ({
      tag,
      mode: attrValue(tag, "data-mode"),
      type: attrValue(tag, "type"),
      ariaPressed: attrValue(tag, "aria-pressed")
    }));
}

function planCards(html) {
  return buttonTags(html)
    .filter((tag) => /\bplan-card\b/.test(attrValue(tag, "class")))
    .map((tag) => ({
      tag,
      planKind: attrValue(tag, "data-plan-kind"),
      type: attrValue(tag, "type"),
      ariaPressed: attrValue(tag, "aria-pressed")
    }));
}

function htmlToggleIds(html) {
  return inputTags(html)
    .map((tag) => ({ id: attrValue(tag, "id"), type: attrValue(tag, "type") }))
    .filter((item) => item.type === "checkbox")
    .map((item) => item.id)
    .filter(Boolean);
}

function assert(condition, errors, message) {
  if (!condition) {
    errors.push(message);
  }
}

function plannerCase(schema, runtimeManifest, options) {
  try {
    return {
      ok: true,
      plan: validatePlan(schema, runtimeManifest, options)
    };
  } catch (error) {
    return {
      ok: false,
      error: String(error && error.message || error)
    };
  }
}

function buildReport(paths) {
  const schema = readJson(paths.schema);
  const runtimeManifest = readJson(paths.runtimeManifest);
  const assetManifest = readJson(paths.assetManifest);
  const html = readText(paths.html);
  const renderer = readText(paths.renderer);
  const errors = [];
  const warnings = [];
  const schemaModes = Array.isArray(schema.loadModes) ? schema.loadModes.map((item) => item.id).filter(Boolean) : [];
  const schemaPlanKinds = Array.isArray(schema.planKinds) ? schema.planKinds.map((item) => item.id).filter(Boolean) : [];
  const manifestModes = runtimeManifest.loadModes && typeof runtimeManifest.loadModes === "object"
    ? Object.keys(runtimeManifest.loadModes)
    : [];
  const cards = modeCards(html);
  const planKindCards = planCards(html);
  const htmlModes = cards.map((card) => card.mode).filter(Boolean);
  const htmlPlanKinds = planKindCards.map((card) => card.planKind).filter(Boolean);
  const schemaToggleIds = Array.isArray(schema.toggles) ? schema.toggles.map((item) => item.id).filter(Boolean) : [];
  const assetGroups = Array.isArray(assetManifest.groups) ? assetManifest.groups.map((item) => item.id).filter(Boolean) : [];
  const assetMounts = Array.isArray(assetManifest.groups) ? assetManifest.groups.map((item) => item.mount).filter(Boolean) : [];
  const toggles = htmlToggleIds(html);

  assert(schemaModes.length > 0, errors, "schema must declare load modes");
  assert(schemaPlanKinds.length > 0, errors, "schema must declare plan kinds");
  assert(manifestModes.length > 0, errors, "runtime manifest must declare load modes");
  for (const planKind of schemaPlanKinds) {
    assert(htmlPlanKinds.includes(planKind), errors, `preview workbench missing clickable plan kind card: ${planKind}`);
    assert(renderer.includes(`"${planKind}"`), errors, `renderer workbench missing plan kind: ${planKind}`);
  }
  for (const card of planKindCards) {
    assert(card.type === "button", errors, `plan kind card must be a non-submit button: ${card.planKind || "<missing>"}`);
    assert(card.planKind && schemaPlanKinds.includes(card.planKind), errors, `plan kind card has unknown data-plan-kind: ${card.planKind || "<missing>"}`);
  }
  for (const mode of schemaModes) {
    assert(manifestModes.includes(mode), errors, `schema load mode missing from runtime manifest: ${mode}`);
    assert(htmlModes.includes(mode), errors, `preview workbench missing clickable mode card: ${mode}`);
    assert(renderer.includes(`"${mode}"`), errors, `renderer workbench missing load mode: ${mode}`);
  }
  for (const card of cards) {
    assert(card.type === "button", errors, `mode card must be a non-submit button: ${card.mode || "<missing>"}`);
    assert(card.mode && schemaModes.includes(card.mode), errors, `mode card has unknown data-mode: ${card.mode || "<missing>"}`);
  }
  assert(html.includes('button.addEventListener("click"'), errors, "preview mode cards must have click handlers");
  assert(html.includes('state.planKind = button.dataset.planKind'), errors, "preview plan kind cards must have click handlers");
  assert(renderer.includes('node.addEventListener("click"'), errors, "renderer mode buttons must have click handlers");
  assert(renderer.includes('node.dataset.planKind'), errors, "renderer plan kind buttons must have click handlers");
  assert(renderer.includes("panel.dataset.planKind"), errors, "renderer must expose current plan kind on the control panel");
  assert(html.includes('id="languageToggle"'), errors, "preview workbench must expose a language toggle");
  assert(html.includes('"zh-Hant"') && html.includes("en:"), errors, "preview workbench must include Chinese and English dictionaries");
  assert(html.includes('document.getElementById("languageToggle").addEventListener("click"'), errors, "preview language toggle must have a click handler");
  assert(renderer.includes('"zh-Hant"') && renderer.includes("en:"), errors, "renderer workbench must include Chinese and English dictionaries");
  assert(renderer.includes('language.addEventListener("click"'), errors, "renderer language toggle must have a click handler");
  assert(renderer.includes("panel.dataset.locale"), errors, "renderer language toggle must expose current locale on the control panel");
  assert(html.includes("ASSET_GROUPS"), errors, "preview workbench must include an offline asset mount model");
  assert(html.includes('id="assetGrid"'), errors, "preview workbench must render an asset grid");
  assert(renderer.includes("ASSET_STATUS"), errors, "renderer workbench must include text-only asset status");
  assert(renderer.includes("control-only 不載入圖片素材") || renderer.includes("control-only does not load image assets"), errors, "renderer asset status must state that control-only does not load images");
  for (const groupId of assetGroups) {
    assert(html.includes(`id: "${groupId}"`) || html.includes(`"${groupId}"`), errors, `preview workbench missing asset group: ${groupId}`);
    assert(renderer.includes(`"${groupId}"`), errors, `renderer workbench missing text asset group: ${groupId}`);
  }
  for (const mount of assetMounts) {
    assert(html.includes(mount), errors, `preview workbench missing asset mount: ${mount}`);
    assert(renderer.includes(mount), errors, `renderer workbench missing text asset mount: ${mount}`);
  }
  assert(!html.includes("fetch("), errors, "preview asset mounts must not fetch local files or network data");

  for (const toggleId of schemaToggleIds) {
    assert(toggles.includes(toggleId), errors, `preview workbench missing toggle checkbox: ${toggleId}`);
    assert(renderer.includes(`"${toggleId}"`), errors, `renderer workbench missing toggle key: ${toggleId}`);
  }
  assert(html.includes('document.getElementById(id).addEventListener("change"'), errors, "preview toggles must have change handlers");
  assert(renderer.includes('input.addEventListener("change"'), errors, "renderer toggles must have change handlers");
  assert(html.includes('navigator.clipboard.writeText(plan.commandText)'), errors, "preview copy command must copy generated command text");
  assert(renderer.includes('navigator.clipboard.writeText(command.textContent)'), errors, "renderer copy command must copy generated command text");

  const plannerResults = [];
  for (const mode of schemaModes) {
    const result = plannerCase(schema, runtimeManifest, { "load-mode": mode });
    plannerResults.push({ case: `mode:${mode}`, ok: result.ok, error: result.error || "" });
    assert(result.ok, errors, `planner rejected load mode: ${mode}${result.error ? ` (${result.error})` : ""}`);
    if (result.ok) {
      assert(result.plan.executes === false, errors, `planner mode must not execute: ${mode}`);
      assert(result.plan.mutates === false, errors, `planner mode must not mutate: ${mode}`);
      assert(result.plan.connectsToCdp === false, errors, `planner mode must not connect to CDP: ${mode}`);
      assert(result.plan.commandText.includes(`--load-mode ${mode}`), errors, `planner command missing load mode: ${mode}`);
    }
  }

  const validToggleCases = [
    {
      name: "launch-if-missing",
      options: { "launch-if-missing": "true" },
      commandToken: "--launch-if-missing true"
    },
    {
      name: "stateful-controls",
      options: { "allow-stateful-controls": "true" },
      commandToken: "--allow-stateful-controls true"
    },
    {
      name: "interactive-auto-allowlist",
      options: { interact: "true", "auto-allowlist": "true" },
      commandToken: "--interact true"
    },
    {
      name: "control-only-local-clicks",
      options: { "load-mode": "control-only", "verify-local-control-clicks": "true" },
      commandToken: "--verify-local-control-clicks true"
    },
    {
      name: "drag-reviewed-indexes",
      options: { interact: "true", drag: "true", "allow-indexes": "0,4" },
      commandToken: "--drag true"
    }
  ];
  for (const testCase of validToggleCases) {
    const result = plannerCase(schema, runtimeManifest, testCase.options);
    plannerResults.push({ case: testCase.name, ok: result.ok, error: result.error || "" });
    assert(result.ok, errors, `planner rejected valid toggle case: ${testCase.name}${result.error ? ` (${result.error})` : ""}`);
    if (result.ok) {
      assert(result.plan.commandText.includes(testCase.commandToken), errors, `planner command missing token for ${testCase.name}: ${testCase.commandToken}`);
    }
  }

  const validPlanKindCases = [
    {
      name: "dynamic-coverage-readonly",
      options: { "plan-kind": "dynamic-coverage" },
      commandToken: "macos/scripts/dynamic-boundary-readonly-gate.sh"
    },
    {
      name: "dynamic-coverage-stateful-inventory",
      options: { "plan-kind": "dynamic-coverage", "allow-stateful-controls": "true" },
      commandToken: "--allow-stateful-controls true"
    }
  ];
  for (const testCase of validPlanKindCases) {
    const result = plannerCase(schema, runtimeManifest, testCase.options);
    plannerResults.push({ case: testCase.name, ok: result.ok, error: result.error || "" });
    assert(result.ok, errors, `planner rejected valid plan kind case: ${testCase.name}${result.error ? ` (${result.error})` : ""}`);
    if (result.ok) {
      assert(result.plan.options.planKind === "dynamic-coverage", errors, `planner must preserve dynamic coverage plan kind for ${testCase.name}`);
      assert(result.plan.executes === false, errors, `dynamic coverage plan must not execute: ${testCase.name}`);
      assert(result.plan.mutates === false, errors, `dynamic coverage plan must not mutate: ${testCase.name}`);
      assert(result.plan.connectsToCdp === false, errors, `dynamic coverage plan must not connect from planner: ${testCase.name}`);
      assert(result.plan.commandText.includes(testCase.commandToken), errors, `planner command missing token for ${testCase.name}: ${testCase.commandToken}`);
      assert(!result.plan.commandText.includes("atomic-ui-automation-gate.sh"), errors, `dynamic coverage plan must not call atomic apply gate: ${testCase.name}`);
    }
  }

  const invalidCases = [
    {
      name: "interact-without-allowlist",
      options: { interact: "true" },
      error: "interactive plan requires --allow-indexes or --auto-allowlist true"
    },
    {
      name: "drag-without-interact",
      options: { drag: "true", "allow-indexes": "0" },
      error: "drag plan requires --interact true"
    },
    {
      name: "drag-without-indexes",
      options: { interact: "true", drag: "true", "auto-allowlist": "true" },
      error: "drag plan requires explicit --allow-indexes"
    },
    {
      name: "local-clicks-without-control-only",
      options: { "verify-local-control-clicks": "true" },
      error: "local control click verification requires --load-mode control-only"
    },
    {
      name: "dynamic-coverage-interact",
      options: { "plan-kind": "dynamic-coverage", interact: "true", "auto-allowlist": "true" },
      error: "dynamic coverage plan is read-only"
    },
    {
      name: "dynamic-coverage-launch",
      options: { "plan-kind": "dynamic-coverage", "launch-if-missing": "true" },
      error: "dynamic coverage plan refuses launch-if-missing"
    }
  ];
  for (const testCase of invalidCases) {
    const result = plannerCase(schema, runtimeManifest, testCase.options);
    plannerResults.push({ case: testCase.name, ok: !result.ok, error: result.error || "" });
    assert(!result.ok && result.error.includes(testCase.error), errors, `planner must reject ${testCase.name} with ${testCase.error}`);
  }

  if (htmlModes.length !== schemaModes.length) {
    warnings.push(`preview mode card count differs from schema: html=${htmlModes.length} schema=${schemaModes.length}`);
  }
  if (htmlPlanKinds.length !== schemaPlanKinds.length) {
    warnings.push(`preview plan kind card count differs from schema: html=${htmlPlanKinds.length} schema=${schemaPlanKinds.length}`);
  }

  return {
    ok: errors.length === 0,
    paths,
    modes: {
      schema: schemaModes,
      manifest: manifestModes,
      preview: htmlModes
    },
    planKinds: {
      schema: schemaPlanKinds,
      preview: htmlPlanKinds
    },
    assets: {
      groups: assetGroups,
      mounts: assetMounts
    },
    toggles: {
      schema: schemaToggleIds,
      preview: toggles
    },
    plannerResults,
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
  const paths = {
    schema: path.resolve(options.schema || path.join(rootDir, "assets", "atomic-control-schema.json")),
    runtimeManifest: path.resolve(options["runtime-manifest"] || path.join(rootDir, "assets", "runtime-modules.json")),
    assetManifest: path.resolve(options["asset-manifest"] || path.join(rootDir, "assets", "atomic-control-assets.json")),
    html: path.resolve(options.html || path.join(rootDir, "previews", "atomic-control-workbench.html")),
    renderer: path.resolve(options.renderer || path.join(rootDir, "assets", "renderer-control.js"))
  };
  const report = buildReport(paths);
  if (options.format === "json") {
    console.log(JSON.stringify(report, null, 2));
  } else if (options.format === "text") {
    console.log("[codex-interface-theme] atomic control workbench smoke");
    console.log(`ok=${report.ok}`);
    console.log(`modes=${report.modes.schema.join(",")}`);
    console.log(`planKinds=${report.planKinds.schema.join(",")}`);
    console.log(`assetGroups=${report.assets.groups.join(",")}`);
    console.log(`toggles=${report.toggles.schema.join(",")}`);
    console.log(`plannerCases=${report.plannerResults.length}`);
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
  console.error(`[codex-interface-theme][atomic-control-workbench-smoke] ${error.message}`);
  process.exit(1);
}
