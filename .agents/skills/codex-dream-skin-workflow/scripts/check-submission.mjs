#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const manifestPath = path.resolve(process.argv[2] || "competition-manifest.json");
if (!fs.existsSync(manifestPath)) {
  console.error(`[dream-skin-workflow] missing submission manifest: ${manifestPath}`);
  process.exit(1);
}

let manifest;
try {
  manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
} catch (error) {
  console.error(`[dream-skin-workflow] invalid submission manifest: ${error.message}`);
  process.exit(1);
}

const errors = [];
if (manifest.schemaVersion !== 1) {
  errors.push("schemaVersion must equal 1");
}
if (!manifest.product || manifest.product.oneProduct !== true) {
  errors.push("product.oneProduct must be true");
}
if (manifest.product?.primaryTrack !== "Developer Tools") {
  errors.push("product.primaryTrack must be Developer Tools");
}
if (!Array.isArray(manifest.submission) || manifest.submission.length === 0) {
  errors.push("submission requirements are missing");
}

const requirements = Array.isArray(manifest.submission) ? manifest.submission : [];
for (const requirement of requirements) {
  if (!requirement.id || !["ready", "partial", "pending"].includes(requirement.status)) {
    errors.push(`invalid requirement entry: ${JSON.stringify(requirement)}`);
    continue;
  }
  if (!String(requirement.evidence || "").trim()) {
    errors.push(`${requirement.id} is missing evidence`);
  }
}

if (errors.length > 0) {
  for (const error of errors) {
    console.error(`[dream-skin-workflow] ${error}`);
  }
  process.exit(1);
}

const incomplete = requirements.filter((requirement) => requirement.status !== "ready");
for (const requirement of requirements) {
  console.log(`[dream-skin-workflow] ${requirement.status.padEnd(7)} ${requirement.id}: ${requirement.evidence}`);
}
if (incomplete.length > 0) {
  console.error(`[dream-skin-workflow] submission blocked: ${incomplete.length} requirement(s) are not ready`);
  process.exit(2);
}

console.log("[dream-skin-workflow] submission manifest ready");
