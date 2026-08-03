#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SCRIPT_DIR, "..", "..");
const matrixPath = path.join(ROOT, "docs", "SURFACE_GAP_MATRIX.json");
const architecturePath = path.join(ROOT, "docs", "WORKBENCH_ARCHITECTURE.md");
const runtimeModulesPath = path.join(ROOT, "macos", "assets", "runtime-modules.json");
const blackShellCssPath = path.join(ROOT, "macos", "assets", "theme-modules", "black-shell-transparency.css");
const pageHeaderRouteSearchCssPath = path.join(ROOT, "macos", "assets", "theme-modules", "page-header-route-search-band.css");

const REQUIRED_POLICY_FALSE = [
  "connectsToCdp",
  "clicks",
  "drags",
  "appliesTheme",
  "restores",
  "mutatesLiveUi"
];

const REQUIRED_GAPS = [
  "staticSafety.offlineGate",
  "runtimeRegistry.dynamicLocks",
  "gapInventory.timestampAndDedupe",
  "blackShellTransparency.global",
  "pageHeaderShell.routeSearchBand",
  "rightSourceOutputPanel.iconRail",
  "transientMenuShell.workspacePicker",
  "settingsControlCards",
  "projectListRows",
  "composerSurface.inputEditorShell",
  "conversationSurface.messageRows",
  "sourcePreviewBlocks.resizablePreviewPane",
  "themeArtStackRightHud.floatingBadgeZOrder",
  "liveVisualProof",
  "restoreResidueProof",
  "rendererBudgetPromotion"
];

const REQUIRED_ARCHITECTURE_MARKERS = [
  "### 缺口矩陣狀態圖",
  "O Atomic Safety Gate",
  "O Dynamic Lock Registry",
  "O Gap Inventory and Timestamp Gate",
  "O static module",
  "O route header detached",
  "O static style module",
  "O runtime registration",
  "X live read-only visual proof",
  "△ pageHeaderShell + routeSearchBand",
  "△ composerSurface + inputEditorShell",
  "△ sourcePreviewBlocks + resizablePreviewPane",
  "X themeArtStackRightHud + floatingBadgeZOrder",
  "X Live Visual Proof",
  "X Package / Release"
];

const VALID_STATUSES = new Set(["O", "△", "X"]);
const failures = [];
const now = new Date();
const jsonOutput = process.argv.includes("--json");

function fail(message) {
  failures.push(message);
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    fail(`cannot read JSON: ${path.relative(ROOT, file)}: ${error.message}`);
    return null;
  }
}

function readText(file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch (error) {
    fail(`cannot read text: ${path.relative(ROOT, file)}: ${error.message}`);
    return "";
  }
}

function isIsoTimestamp(value) {
  return typeof value === "string" && value.length > 0 && !Number.isNaN(Date.parse(value));
}

function fingerprintGap(gap) {
  const source = [gap.id, gap.owner, gap.status, gap.nextAction].join("\u0000");
  return crypto.createHash("sha256").update(source).digest("hex").slice(0, 16);
}

function buildInventory(matrixDocument) {
  const reviewWindowDays = matrixDocument.inventory?.reviewWindowDays ?? 0;
  const reviewWindowMs = reviewWindowDays * 24 * 60 * 60 * 1000;
  const seen = new Map();
  const duplicates = [];
  const records = [];
  let reviewed = 0;
  let reviewDue = 0;
  let evidenceBackedO = 0;

  for (const gap of matrixDocument.gaps ?? []) {
    const dedupeKey = gap.dedupeKey ?? "";
    const reviewedAt = Date.parse(gap.lastReviewedAt ?? "");
    const hasReview = !Number.isNaN(reviewedAt);
    const due = hasReview && reviewWindowMs > 0 && now.getTime() - reviewedAt > reviewWindowMs;
    if (hasReview) {
      reviewed += 1;
    }
    if (due) {
      reviewDue += 1;
    }
    if (gap.status === "O" && Array.isArray(gap.verifiedBy) && gap.verifiedBy.length > 0 && isIsoTimestamp(gap.verifiedAt)) {
      evidenceBackedO += 1;
    }
    if (seen.has(dedupeKey)) {
      duplicates.push({ dedupeKey, ids: [seen.get(dedupeKey), gap.id] });
    } else {
      seen.set(dedupeKey, gap.id);
    }
    records.push({
      id: gap.id,
      dedupeKey,
      status: gap.status,
      lastReviewedAt: gap.lastReviewedAt,
      fingerprint: fingerprintGap(gap)
    });
  }

  return {
    mode: matrixDocument.inventory?.mode,
    reviewWindowDays,
    unique: seen.size,
    duplicates,
    reviewed,
    reviewDue,
    evidenceBackedO,
    records
  };
}

function requireSubStatus(gapById, id, expected) {
  const gap = gapById.get(id);
  if (!gap) {
    return;
  }
  if (!gap.subStatus || typeof gap.subStatus !== "object") {
    fail(`gap ${id} missing subStatus`);
    return;
  }
  for (const [key, value] of Object.entries(expected)) {
    if (gap.subStatus[key] !== value) {
      fail(`gap ${id} subStatus.${key} expected ${value}, got ${gap.subStatus[key] ?? "missing"}`);
    }
  }
}

const matrix = readJson(matrixPath);
const architecture = readText(architecturePath);
const runtimeModules = readJson(runtimeModulesPath);
const blackShellCss = readText(blackShellCssPath);
const pageHeaderRouteSearchCss = readText(pageHeaderRouteSearchCssPath);

if (matrix) {
  if (matrix.version !== 2) {
    fail("surface gap matrix version must be 2");
  }
  if (!isIsoTimestamp(matrix.updatedAt)) {
    fail("surface gap matrix updatedAt must be an ISO timestamp");
  }
  if (!matrix.inventory || typeof matrix.inventory !== "object") {
    fail("surface gap matrix inventory is missing");
  } else {
    if (matrix.inventory.mode !== "static-read-only") {
      fail("surface gap inventory must remain static-read-only");
    }
    if (matrix.inventory.dedupeField !== "gap.id") {
      fail("surface gap inventory must dedupe by gap.id");
    }
    if (!Number.isInteger(matrix.inventory.reviewWindowDays) || matrix.inventory.reviewWindowDays <= 0) {
      fail("surface gap inventory reviewWindowDays must be a positive integer");
    }
    if (!isIsoTimestamp(matrix.inventory.lastInventoryAt)) {
      fail("surface gap inventory lastInventoryAt must be an ISO timestamp");
    }
  }
  if (!matrix.policy || typeof matrix.policy !== "object") {
    fail("surface gap matrix policy is missing");
  } else {
    for (const key of REQUIRED_POLICY_FALSE) {
      if (matrix.policy[key] !== false) {
        fail(`surface gap policy must remain false: ${key}`);
      }
    }
    if (matrix.policy.defaultPlanKind !== "atomic-gate") {
      fail("surface gap matrix must default to atomic-gate");
    }
    if (matrix.policy.defaultLoadMode !== "carrier-only") {
      fail("surface gap matrix must default to carrier-only");
    }
  }

  if (!Array.isArray(matrix.gaps)) {
    fail("surface gap matrix gaps must be an array");
  } else {
    const gapById = new Map(matrix.gaps.map((gap) => [gap.id, gap]));
    const seenIds = new Set();
    const seenDedupeKeys = new Set();
    for (const id of REQUIRED_GAPS) {
      if (!gapById.has(id)) {
        fail(`surface gap matrix missing gap: ${id}`);
      }
    }
    for (const gap of matrix.gaps) {
      if (!gap.id || typeof gap.id !== "string") {
        fail("surface gap matrix contains gap without string id");
        continue;
      }
      if (seenIds.has(gap.id)) {
        fail(`surface gap matrix contains duplicate id: ${gap.id}`);
      }
      seenIds.add(gap.id);
      if (gap.dedupeKey !== gap.id) {
        fail(`surface gap dedupeKey must equal id: ${gap.id}`);
      }
      if (seenDedupeKeys.has(gap.dedupeKey)) {
        fail(`surface gap matrix contains duplicate dedupeKey: ${gap.dedupeKey}`);
      }
      seenDedupeKeys.add(gap.dedupeKey);
      if (!isIsoTimestamp(gap.lastReviewedAt)) {
        fail(`surface gap missing valid lastReviewedAt: ${gap.id}`);
      }
      if (!gap.owner || typeof gap.owner !== "string") {
        fail(`surface gap missing owner: ${gap.id}`);
      }
      if (!VALID_STATUSES.has(gap.status)) {
        fail(`surface gap has invalid status: ${gap.id}`);
      }
      if (gap.status === "O") {
        if (!Array.isArray(gap.verifiedBy) || gap.verifiedBy.length === 0) {
          fail(`verified gap must include evidence: ${gap.id}`);
        }
        if (!isIsoTimestamp(gap.verifiedAt)) {
          fail(`verified gap must include verifiedAt: ${gap.id}`);
        }
      }
      if (gap.status === "△" || gap.status === "X") {
        if (!Array.isArray(gap.blocks) || !gap.blocks.includes("release")) {
          fail(`non-verified gap must block release: ${gap.id}`);
        }
        if (!isIsoTimestamp(gap.blockedAt)) {
          fail(`non-verified gap must include blockedAt: ${gap.id}`);
        }
      }
      if (gap.owner && !architecture.includes(gap.owner)) {
        fail(`architecture diagram missing owner label: ${gap.owner}`);
      }
    }
    requireSubStatus(gapById, "blackShellTransparency.global", {
      blackShellStaticModule: "O",
      routeHeaderDetached: "O",
      liveReadOnlyProof: "X"
    });
    requireSubStatus(gapById, "pageHeaderShell.routeSearchBand", {
      staticStyleModule: "O",
      runtimeRegistration: "O",
      liveReadOnlyProof: "X"
    });
  }

  if (!Array.isArray(matrix.releaseBlockers) || matrix.releaseBlockers.length === 0) {
    fail("surface gap matrix releaseBlockers must be non-empty");
  } else if (Array.isArray(matrix.gaps)) {
    const gapById = new Map(matrix.gaps.map((gap) => [gap.id, gap]));
    for (const blocker of matrix.releaseBlockers) {
      const gap = gapById.get(blocker);
      if (!gap) {
        fail(`release blocker does not map to a gap: ${blocker}`);
      } else if (gap.status === "O") {
        fail(`release blocker cannot be verified status O: ${blocker}`);
      }
    }
  }

  if (!Array.isArray(matrix.mustRemainStaticUntil) || !matrix.mustRemainStaticUntil.includes("liveReadOnlyApproval")) {
    fail("surface gap matrix must stay static until liveReadOnlyApproval");
  }
}

for (const marker of REQUIRED_ARCHITECTURE_MARKERS) {
  if (!architecture.includes(marker)) {
    fail(`architecture missing marker: ${marker}`);
  }
}

const counts = { O: 0, "△": 0, X: 0 };
if (matrix && Array.isArray(matrix.gaps)) {
  for (const gap of matrix.gaps) {
    if (Object.hasOwn(counts, gap.status)) {
      counts[gap.status] += 1;
    }
  }
}

const inventory = matrix && Array.isArray(matrix.gaps) ? buildInventory(matrix) : null;
if (inventory?.duplicates.length > 0) {
  fail(`surface gap inventory found ${inventory.duplicates.length} duplicate dedupe key(s)`);
}
if (inventory?.reviewDue > 0) {
  fail(`surface gap inventory found ${inventory.reviewDue} overdue review(s)`);
}

const ok = failures.length === 0;
if (jsonOutput) {
  console.log(JSON.stringify({
    ok,
    policy: {
      mutates: false,
      connectsToCdp: false,
      clicks: false,
      drags: false,
      appliesTheme: false,
      restores: false
    },
    snapshotAt: now.toISOString(),
    matrixUpdatedAt: matrix?.updatedAt ?? null,
    lastInventoryAt: matrix?.inventory?.lastInventoryAt ?? null,
    gaps: matrix?.gaps?.length ?? 0,
    status: counts,
    releaseBlockers: matrix?.releaseBlockers?.length ?? 0,
    inventory
  }));
} else {
  console.log("[codex-interface-theme] surface gap matrix");
  console.log(`ok=${ok}`);
  console.log(`mutates=${false}`);
  console.log(`connectsToCdp=${false}`);
  console.log(`clicks=${false}`);
  console.log(`drags=${false}`);
  console.log(`appliesTheme=${false}`);
  console.log(`restores=${false}`);
  console.log(`gaps=${matrix?.gaps?.length ?? 0}`);
  console.log(`status=O:${counts.O},△:${counts["△"]},X:${counts.X}`);
  console.log(`releaseBlockers=${matrix?.releaseBlockers?.length ?? 0}`);
  console.log(`matrixUpdatedAt=${matrix?.updatedAt ?? "missing"}`);
  console.log(`lastInventoryAt=${matrix?.inventory?.lastInventoryAt ?? "missing"}`);
  console.log(`inventory=unique:${inventory?.unique ?? 0},duplicates:${inventory?.duplicates.length ?? 0},reviewed:${inventory?.reviewed ?? 0},reviewDue:${inventory?.reviewDue ?? 0},evidenceBackedO:${inventory?.evidenceBackedO ?? 0}`);
}

if (!ok) {
  for (const message of failures) {
    console.error(`FAIL ${message}`);
  }
  process.exit(1);
}
