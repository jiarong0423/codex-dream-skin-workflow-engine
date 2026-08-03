#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." >/dev/null 2>&1 && pwd)"
REPORT_PATH="/tmp/codex-interface-theme-local-asset-standard.json"

node --check "$ROOT_DIR/scripts/local-asset-standard.mjs"
node "$ROOT_DIR/scripts/local-asset-standard.mjs" --format json >"$REPORT_PATH"

node - "$REPORT_PATH" <<'JS'
const fs = require("fs");
const report = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
if (report.mode !== "local-asset-standard") {
  throw new Error("local asset standard must report local-asset-standard mode");
}
for (const key of ["mutates", "launches", "connectsToCdp", "clicks", "drags", "appliesTheme", "deletes"]) {
  if (report[key] !== false) {
    throw new Error(`local asset standard side effect must be false: ${key}`);
  }
}
if (!report.atomic || report.atomic.runtimeItems < 1) {
  throw new Error("local asset standard must inspect atomic runtime items");
}
if (!Array.isArray(report.packs) || report.packs.length < 1) {
  throw new Error("local asset standard must inspect theme packs");
}
for (const pack of report.packs) {
  if (pack.ok !== true) {
    throw new Error(`theme pack asset contract should pass before local metadata cleanup: ${pack.id}`);
  }
  if (pack.frameCount.actual !== pack.frameCount.declared) {
    throw new Error(`theme pack frame count must match: ${pack.id}`);
  }
  if (pack.iconCount !== 15) {
    throw new Error(`theme pack iconMap must expose 15 semantic icons: ${pack.id}`);
  }
}
if (report.totals.localPollutionFindings > 0 && report.mountReady !== false) {
  throw new Error("mountReady must stay false while local metadata pollution is present");
}
if (report.totals.localPollutionFindings === 0 && report.mountReady !== true) {
  throw new Error("mountReady must be true when local metadata pollution is absent");
}
JS

if [ "$(node - "$REPORT_PATH" <<'JS'
const fs = require("fs");
const report = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
process.stdout.write(String(report.totals.localPollutionFindings));
JS
)" = "0" ]; then
  node "$ROOT_DIR/scripts/local-asset-standard.mjs" --strict true --format json >/tmp/codex-interface-theme-local-asset-standard-strict.json
else
  if node "$ROOT_DIR/scripts/local-asset-standard.mjs" --strict true --format json >/tmp/codex-interface-theme-local-asset-standard-strict.json 2>/tmp/codex-interface-theme-local-asset-standard-strict.err; then
    printf 'local asset standard strict mode should fail while local metadata pollution is present\n' >&2
    exit 1
  fi
fi

printf 'local asset standard rules passed\n'
