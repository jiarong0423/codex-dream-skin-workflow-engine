#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const THEME_PACK_ROOT_DEFAULT = path.resolve(SCRIPT_DIR, "..");
const PROJECT_ROOT_DEFAULT = path.resolve(THEME_PACK_ROOT_DEFAULT, "..");
const PRIVATE_ROOT_DEFAULT = path.join(THEME_PACK_ROOT_DEFAULT, "private-packs");
const PACK_ID_RE = /^[a-z0-9][a-z0-9-]{1,80}$/;

const REQUIRED_CANDIDATES = [
  {
    key: "background",
    label: "background",
    prefix: "runtime/backgrounds/",
    runtimeLoad: true
  },
  {
    key: "upperActor",
    label: "upper actor",
    prefix: "runtime/actors/",
    runtimeLoad: true
  },
  {
    key: "lowerActor",
    label: "lower actor",
    prefix: "runtime/actors/",
    runtimeLoad: true
  }
];

const OPTIONAL_CANDIDATES = [
  {
    key: "mergedForegroundFallback",
    label: "merged foreground fallback",
    prefix: "runtime/foreground/",
    runtimeLoad: false
  },
  {
    key: "manualPreview",
    label: "manual preview",
    prefix: "previews/",
    runtimeLoad: false
  }
];

function usage() {
  return [
    "Usage:",
    "  private-pack-loader.mjs list [--root <private-packs-dir>] [--format text|json]",
    "  private-pack-loader.mjs plan --pack <pack-id> [--root <private-packs-dir>] [--format text|json]",
    "  private-pack-loader.mjs build --pack <pack-id> [--root <private-packs-dir>] [--out-dir <dir>] [--format text|json]",
    "",
    "Notes:",
    "  This is a private-local-only loader.",
    "  list and plan are read-only.",
    "  build writes only an ignored private runtime manifest.",
    "  build does not write macos/assets/theme.json, active.json, or the formal animal pack list.",
    "  no Codex process is started, restarted, clicked, or injected by this script."
  ].join("\n");
}

function parseArgs(argv) {
  const parsed = { command: argv[2] || "", options: {} };
  for (let index = 3; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === "--help" || key === "-h") {
      parsed.options.help = true;
      continue;
    }
    if (!key.startsWith("--")) {
      throw new Error(`unexpected argument: ${key}`);
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`missing value for ${key}`);
    }
    parsed.options[key.slice(2)] = value;
    index += 1;
  }
  return parsed;
}

function formatOption(options) {
  const format = String(options.format || "text").toLowerCase();
  if (!["text", "json"].includes(format)) {
    throw new Error("--format must be text or json");
  }
  return format;
}

function optionPath(options, name, fallback) {
  return path.resolve(String(options[name] || fallback));
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJsonAtomic(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const payload = `${JSON.stringify(value, null, 2)}\n`;
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, payload, { encoding: "utf8", mode: 0o600 });
  fs.renameSync(tempPath, filePath);
}

function sha256File(filePath) {
  const buffer = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function assertPlainDirectory(directory, label) {
  const stat = fs.lstatSync(directory);
  if (!stat.isDirectory()) {
    throw new Error(`${label} is not a directory: ${directory}`);
  }
  if (stat.isSymbolicLink()) {
    throw new Error(`${label} must not be a symbolic link: ${directory}`);
  }
}

function assertPlainFile(filePath, label) {
  const stat = fs.lstatSync(filePath);
  if (!stat.isFile()) {
    throw new Error(`${label} is not a file: ${filePath}`);
  }
  if (stat.isSymbolicLink()) {
    throw new Error(`${label} must not be a symbolic link: ${filePath}`);
  }
  return stat.size;
}

function ensureInside(rootDir, candidatePath, label) {
  const root = path.resolve(rootDir);
  const candidate = path.resolve(candidatePath);
  if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`)) {
    throw new Error(`${label} escapes root: ${candidatePath}`);
  }
  return candidate;
}

function relativePathFromProject(absolutePath) {
  const relativePath = path.relative(PROJECT_ROOT_DEFAULT, absolutePath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return absolutePath;
  }
  return relativePath.split(path.sep).join("/");
}

function assertSafeRelativePath(relativePath, label) {
  const value = String(relativePath || "").trim();
  if (!value) {
    throw new Error(`${label} path is missing`);
  }
  if (path.isAbsolute(value) || value.includes("\0")) {
    throw new Error(`${label} path must be pack-relative: ${value}`);
  }
  if (value.split(/[\\/]+/).includes("..")) {
    throw new Error(`${label} path must not traverse parent directories: ${value}`);
  }
  return value.replaceAll("\\", "/");
}

function resolvePackDir(rootDir, packId) {
  if (!PACK_ID_RE.test(packId)) {
    throw new Error("--pack must use lowercase letters, numbers, and hyphens");
  }
  const packDir = ensureInside(rootDir, path.join(rootDir, packId), "private pack directory");
  assertPlainDirectory(packDir, "private pack directory");
  return packDir;
}

function resolvePackAsset(packDir, relativePath, label, requiredPrefix) {
  const safePath = assertSafeRelativePath(relativePath, label);
  if (!safePath.startsWith(requiredPrefix)) {
    throw new Error(`${label} must stay under ${requiredPrefix}: ${safePath}`);
  }
  if (safePath.startsWith("sources/") || safePath.startsWith("runtime/previews/")) {
    throw new Error(`${label} must not load source or preview assets: ${safePath}`);
  }
  const absolutePath = ensureInside(packDir, path.join(packDir, safePath), label);
  const bytes = assertPlainFile(absolutePath, label);
  return {
    relativePath: safePath,
    projectPath: relativePathFromProject(absolutePath),
    bytes,
    sha256: sha256File(absolutePath)
  };
}

function resolvePackFile(packDir, relativePath, label, requiredPrefix) {
  const safePath = assertSafeRelativePath(relativePath, label);
  if (!safePath.startsWith(requiredPrefix)) {
    throw new Error(`${label} must stay under ${requiredPrefix}: ${safePath}`);
  }
  const absolutePath = ensureInside(packDir, path.join(packDir, safePath), label);
  const bytes = assertPlainFile(absolutePath, label);
  return {
    relativePath: safePath,
    projectPath: relativePathFromProject(absolutePath),
    bytes,
    sha256: sha256File(absolutePath)
  };
}

function assertPrivateManifest(manifest, requestedPackId) {
  if (manifest.schemaVersion !== 1) {
    throw new Error("private pack schemaVersion must be 1");
  }
  if (manifest.id !== requestedPackId) {
    throw new Error(`private pack id mismatch: expected ${requestedPackId}, got ${manifest.id}`);
  }
  if (manifest.visibility !== "private-local-only") {
    throw new Error(`private pack visibility must be private-local-only: ${manifest.visibility}`);
  }
  if (manifest.formalActivation !== false) {
    throw new Error("private pack must keep formalActivation=false");
  }
  if (manifest.ignoredByGit !== true) {
    throw new Error("private pack must declare ignoredByGit=true");
  }
  if (!["asset-staging", "private-runtime-ready"].includes(String(manifest.status || ""))) {
    throw new Error(`private pack status is not accepted: ${manifest.status}`);
  }
  if (!manifest.ownerBoundary || typeof manifest.ownerBoundary !== "object") {
    throw new Error("private pack ownerBoundary is missing");
  }
  if (!manifest.currentCandidateSet || typeof manifest.currentCandidateSet !== "object") {
    throw new Error("private pack currentCandidateSet is missing");
  }
  if (!manifest.budgetPolicy || typeof manifest.budgetPolicy !== "object") {
    throw new Error("private pack budgetPolicy is missing");
  }
  if (!manifest.interactionPlan || typeof manifest.interactionPlan !== "object") {
    throw new Error("private pack interactionPlan is missing");
  }
}

function loadPrivatePack(rootDir, packId) {
  const packDir = resolvePackDir(rootDir, packId);
  const manifestPath = path.join(packDir, "PRIVATE_PACK.json");
  const manifestBytes = assertPlainFile(manifestPath, "private manifest");
  const manifest = readJson(manifestPath);
  assertPrivateManifest(manifest, packId);

  const selected = {};
  for (const rule of REQUIRED_CANDIDATES) {
    selected[rule.key] = resolvePackAsset(
      packDir,
      manifest.currentCandidateSet[rule.key],
      rule.label,
      rule.prefix
    );
  }
  for (const rule of OPTIONAL_CANDIDATES) {
    const value = manifest.currentCandidateSet[rule.key];
    if (!value) {
      continue;
    }
    const resolver = rule.runtimeLoad ? resolvePackAsset : resolvePackFile;
    selected[rule.key] = resolver(packDir, value, rule.label, rule.prefix);
  }

  return {
    packDir,
    manifestPath,
    manifestBytes,
    manifestHash: sha256File(manifestPath),
    manifest,
    selected
  };
}

function listPrivatePacks(rootDir) {
  if (!fs.existsSync(rootDir)) {
    return [];
  }
  assertPlainDirectory(rootDir, "private pack root");
  const packs = [];
  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || !PACK_ID_RE.test(entry.name)) {
      continue;
    }
    const manifestPath = path.join(rootDir, entry.name, "PRIVATE_PACK.json");
    if (!fs.existsSync(manifestPath)) {
      continue;
    }
    const manifest = readJson(manifestPath);
    packs.push({
      id: String(manifest.id || entry.name),
      displayName: String(manifest.displayName || entry.name),
      status: String(manifest.status || ""),
      visibility: String(manifest.visibility || ""),
      formalActivation: manifest.formalActivation === true
    });
  }
  return packs.sort((left, right) => left.id.localeCompare(right.id));
}

function selectedRuntimeAssets(selected) {
  return {
    background: selected.background,
    upperActor: selected.upperActor,
    lowerActor: selected.lowerActor
  };
}

function sumBytes(assets) {
  return Object.values(assets).reduce((total, asset) => total + asset.bytes, 0);
}

function assetBudgetStatus(manifest, runtimeAssets) {
  const targetRuntimePayloadBytes = Number(manifest.budgetPolicy.targetRuntimePayloadBytes || 0);
  if (!Number.isFinite(targetRuntimePayloadBytes) || targetRuntimePayloadBytes <= 0) {
    throw new Error("budgetPolicy.targetRuntimePayloadBytes must be a positive number");
  }
  const selectedRuntimePayloadBytes = sumBytes(runtimeAssets);
  return {
    selectedRuntimePayloadBytes,
    targetRuntimePayloadBytes,
    ok: selectedRuntimePayloadBytes <= targetRuntimePayloadBytes,
    excludedFromRuntime: [
      "sources",
      "runtime/previews",
      "manualPreview",
      "mergedForegroundFallback"
    ]
  };
}

function createRuntimePlan(command, rootDir, packId) {
  const pack = loadPrivatePack(rootDir, packId);
  const runtimeAssets = selectedRuntimeAssets(pack.selected);
  const budget = assetBudgetStatus(pack.manifest, runtimeAssets);
  if (!budget.ok) {
    throw new Error(
      `selected private runtime payload ${budget.selectedRuntimePayloadBytes} exceeds budget ${budget.targetRuntimePayloadBytes}`
    );
  }

  return {
    schemaVersion: 1,
    kind: "dream-skin-private-runtime-plan",
    command,
    id: pack.manifest.id,
    displayName: pack.manifest.displayName,
    visibility: "private-local-only",
    status: "private-runtime-ready",
    formalActivation: false,
    writesFormalActiveTheme: false,
    writesCodexProcess: false,
    startsOrRestartsCodex: false,
    source: {
      privateRoot: relativePathFromProject(rootDir),
      packRoot: relativePathFromProject(pack.packDir),
      manifest: {
        relativePath: "PRIVATE_PACK.json",
        projectPath: relativePathFromProject(pack.manifestPath),
        bytes: pack.manifestBytes,
        sha256: pack.manifestHash
      }
    },
    runtimeAssets,
    optionalAssets: {
      mergedForegroundFallback: pack.selected.mergedForegroundFallback || null,
      manualPreview: pack.selected.manualPreview || null
    },
    budget,
    interaction: {
      sparkTrigger: pack.manifest.interactionPlan.sparkTrigger,
      manualButton: pack.manifest.interactionPlan.manualButton,
      maxAutoTriggers: Number(pack.manifest.interactionPlan.maxAutoTriggers || 0),
      cooldownMs: Number(pack.manifest.interactionPlan.cooldownMs || 0),
      retreatPolicy: pack.manifest.interactionPlan.retreatPolicy,
      particlePolicy: pack.manifest.interactionPlan.particlePolicy
    },
    loadPolicy: {
      privateLoaderOnly: true,
      formalAnimalPackList: false,
      runtimeLoad: Object.keys(runtimeAssets),
      noRuntimeLoad: budget.excludedFromRuntime
    },
    generatedAt: new Date().toISOString()
  };
}

function outputPathForPlan(packDir, options) {
  if (options["out-dir"]) {
    const outDir = optionPath(options, "out-dir", "");
    const safeOutDir = ensureInside(PROJECT_ROOT_DEFAULT, outDir, "output directory");
    return path.join(safeOutDir, "private-runtime.json");
  }
  return path.join(packDir, "runtime", "private-loader", "private-runtime.json");
}

function commandBuild(rootDir, packId, options) {
  const packDir = resolvePackDir(rootDir, packId);
  const plan = createRuntimePlan("build", rootDir, packId);
  const runtimeManifestPath = outputPathForPlan(packDir, options);
  writeJsonAtomic(runtimeManifestPath, plan);
  return Object.assign({}, plan, {
    built: true,
    output: {
      runtimeManifestPath: relativePathFromProject(runtimeManifestPath)
    }
  });
}

function printText(value) {
  if (Array.isArray(value.packs)) {
    if (value.packs.length === 0) {
      console.log("no private packs found");
      return;
    }
    for (const pack of value.packs) {
      console.log(`${pack.id}\t${pack.status}\t${pack.visibility}\tformal=${pack.formalActivation ? "yes" : "no"}\t${pack.displayName}`);
    }
    return;
  }

  console.log(`${value.command} ${value.id}`);
  console.log(`name: ${value.displayName}`);
  console.log(`visibility: ${value.visibility}`);
  console.log(`formal activation: ${value.formalActivation ? "yes" : "no"}`);
  console.log(`writes formal active theme: ${value.writesFormalActiveTheme ? "yes" : "no"}`);
  console.log(`starts or restarts Codex: ${value.startsOrRestartsCodex ? "yes" : "no"}`);
  console.log(`runtime bytes: ${value.budget.selectedRuntimePayloadBytes}/${value.budget.targetRuntimePayloadBytes}`);
  console.log(`background: ${value.runtimeAssets.background.relativePath}`);
  console.log(`upper actor: ${value.runtimeAssets.upperActor.relativePath}`);
  console.log(`lower actor: ${value.runtimeAssets.lowerActor.relativePath}`);
  if (value.output && value.output.runtimeManifestPath) {
    console.log(`output: ${value.output.runtimeManifestPath}`);
  }
}

function printResult(value, format) {
  if (format === "json") {
    console.log(JSON.stringify(value, null, 2));
    return;
  }
  printText(value);
}

function main() {
  const parsed = parseArgs(process.argv);
  if (parsed.options.help || !parsed.command) {
    console.log(usage());
    return;
  }

  const format = formatOption(parsed.options);
  const rootDir = optionPath(parsed.options, "root", PRIVATE_ROOT_DEFAULT);

  if (parsed.command === "list") {
    printResult({ packs: listPrivatePacks(rootDir) }, format);
    return;
  }

  if (!["plan", "build"].includes(parsed.command)) {
    throw new Error(`unknown command: ${parsed.command}`);
  }

  const packId = parsed.options.pack;
  if (!packId) {
    throw new Error("missing required option --pack");
  }
  assertPlainDirectory(rootDir, "private pack root");

  if (parsed.command === "build") {
    printResult(commandBuild(rootDir, packId, parsed.options), format);
    return;
  }

  printResult(createRuntimePlan("plan", rootDir, packId), format);
}

try {
  main();
} catch (error) {
  console.error(`[dream-skin-private-pack] ${error.message}`);
  process.exitCode = 1;
}
