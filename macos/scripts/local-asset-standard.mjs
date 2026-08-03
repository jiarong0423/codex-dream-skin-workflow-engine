#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const DEFAULT_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const REQUIRED_SIDE_EFFECT_FALSE_KEYS = [
  "executes",
  "mutates",
  "connectsToCdp",
  "launches",
  "clicks",
  "drags",
  "appliesTheme"
];
const REQUIRED_PACK_ASSET_KEYS = [
  "background",
  "heroCharacter",
  "interactionMascot",
  "interactionPoster",
  "interactionSprite",
  "interactionTrigger"
];
const REQUIRED_ICON_KEYS = [
  "search",
  "newTask",
  "back",
  "forward",
  "stop",
  "settings",
  "project",
  "send",
  "tagTask",
  "files",
  "thread",
  "clean",
  "run",
  "spark",
  "package"
];
const LOCAL_POLLUTION_PATTERNS = [
  { kind: "finder-metadata", test: (entry) => entry.name === ".DS_Store" },
  { kind: "python-cache-dir", test: (entry) => entry.isDirectory && entry.name === "__pycache__" },
  { kind: "python-bytecode", test: (entry) => entry.isFile && entry.name.endsWith(".pyc") }
];

function usage() {
  return `Usage:
  local-asset-standard.mjs [--root <macos-dir>] [--theme-packs-root <dir>]
    [--atomic-manifest <path>] [--format text|json] [--strict true|false]

Runs the local asset inspection standard. It reads local files only. It never
connects to CDP, launches Codex, injects CSS, applies a theme, clicks, drags,
restores, deletes, or changes permissions.`;
}

function parseArgs(argv) {
  const options = {
    root: DEFAULT_ROOT,
    themePacksRoot: "",
    atomicManifest: "",
    format: "text",
    strict: "false"
  };
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
  if (!["text", "json"].includes(options.format)) {
    throw new Error(`unknown format: ${options.format}`);
  }
  if (!["true", "false"].includes(options.strict)) {
    throw new Error("--strict must be true or false");
  }
  return options;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function pushIssue(list, scope, message, details = {}) {
  list.push({
    scope,
    message,
    ...details
  });
}

function pathInside(rootDir, relativePath) {
  if (!relativePath || path.isAbsolute(relativePath) || relativePath.split(/[\\/]/).includes("..")) {
    return null;
  }
  const resolved = path.resolve(rootDir, relativePath);
  const root = `${path.resolve(rootDir)}${path.sep}`;
  if (resolved !== path.resolve(rootDir) && !resolved.startsWith(root)) {
    return null;
  }
  return resolved;
}

function mediaTypeFromExtension(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".png") return "image/png";
  if (extension === ".webp") return "image/webp";
  if (extension === ".gif") return "image/gif";
  if (extension === ".svg") return "image/svg+xml";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  return "";
}

function readFileMeta(filePath) {
  const buffer = fs.readFileSync(filePath);
  const stat = fs.statSync(filePath);
  const detected = detectImage(buffer, filePath);
  const identified = identifyImageWithMagick(filePath);
  const merged = identified ? {
    ...detected,
    width: identified.width,
    height: identified.height,
    hasAlpha: identified.hasAlpha,
    identifyFormat: identified.format,
    identifyChannels: identified.channels,
    imageProbe: "magick"
  } : {
    ...detected,
    imageProbe: "signature"
  };
  return {
    exists: true,
    path: filePath,
    bytes: stat.size,
    ...merged
  };
}

function identifyImageWithMagick(filePath) {
  const result = spawnSync("magick", ["identify", "-format", "%m|%w|%h|%[channels]", filePath], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"]
  });
  if (result.status !== 0 || !result.stdout) {
    return null;
  }
  const parts = String(result.stdout).trim().split("|");
  if (parts.length < 4) {
    return null;
  }
  const width = Number(parts[1]);
  const height = Number(parts[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    return null;
  }
  const channels = parts.slice(3).join("|").toLowerCase();
  return {
    format: parts[0],
    width,
    height,
    channels,
    hasAlpha: channels.includes("a") || channels.includes("alpha")
  };
}

function detectImage(buffer, filePath) {
  const extensionType = mediaTypeFromExtension(filePath);
  const signature = buffer.subarray(0, 16);
  if (signature.length >= 8 && signature.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return parsePng(buffer);
  }
  if (signature.length >= 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
    return parseWebp(buffer);
  }
  if (signature.length >= 6 && ["GIF87a", "GIF89a"].includes(buffer.toString("ascii", 0, 6))) {
    return parseGif(buffer);
  }
  const textStart = buffer.subarray(0, Math.min(buffer.length, 512)).toString("utf8").trimStart();
  if (extensionType === "image/svg+xml" && (textStart.startsWith("<svg") || textStart.startsWith("<?xml"))) {
    return parseSvg(buffer);
  }
  return {
    mediaType: extensionType || "application/octet-stream",
    magic: "unknown",
    width: null,
    height: null,
    hasAlpha: "unknown"
  };
}

function parsePng(buffer) {
  if (buffer.length < 33 || buffer.toString("ascii", 12, 16) !== "IHDR") {
    return {
      mediaType: "image/png",
      magic: "png-invalid",
      width: null,
      height: null,
      hasAlpha: "unknown"
    };
  }
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  const colorType = buffer.readUInt8(25);
  return {
    mediaType: "image/png",
    magic: "png",
    width,
    height,
    hasAlpha: colorType === 4 || colorType === 6,
    colorType
  };
}

function readUInt24LE(buffer, offset) {
  return buffer.readUInt8(offset) + (buffer.readUInt8(offset + 1) << 8) + (buffer.readUInt8(offset + 2) << 16);
}

function parseWebp(buffer) {
  let offset = 12;
  const meta = {
    mediaType: "image/webp",
    magic: "webp",
    width: null,
    height: null,
    hasAlpha: "unknown",
    chunks: []
  };
  while (offset + 8 <= buffer.length) {
    const chunk = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const dataStart = offset + 8;
    const dataEnd = dataStart + size;
    meta.chunks.push(chunk);
    if (dataEnd > buffer.length) {
      break;
    }
    if (chunk === "VP8X" && size >= 10) {
      const flags = buffer.readUInt8(dataStart);
      meta.width = readUInt24LE(buffer, dataStart + 4) + 1;
      meta.height = readUInt24LE(buffer, dataStart + 7) + 1;
      meta.hasAlpha = Boolean(flags & 0x10);
    } else if (chunk === "VP8 " && size >= 10 && buffer[dataStart + 3] === 0x9d && buffer[dataStart + 4] === 0x01 && buffer[dataStart + 5] === 0x2a) {
      meta.width = buffer.readUInt16LE(dataStart + 6) & 0x3fff;
      meta.height = buffer.readUInt16LE(dataStart + 8) & 0x3fff;
      meta.hasAlpha = false;
    } else if (chunk === "VP8L" && size >= 5 && buffer[dataStart] === 0x2f) {
      const bits = buffer.readUInt32LE(dataStart + 1);
      meta.width = (bits & 0x3fff) + 1;
      meta.height = ((bits >> 14) & 0x3fff) + 1;
      meta.hasAlpha = "unknown";
    }
    offset = dataEnd + (size % 2);
  }
  return meta;
}

function parseGif(buffer) {
  return {
    mediaType: "image/gif",
    magic: "gif",
    width: buffer.readUInt16LE(6),
    height: buffer.readUInt16LE(8),
    hasAlpha: true
  };
}

function parseSvg(buffer) {
  const text = buffer.toString("utf8");
  const svgMatch = text.match(/<svg\b[^>]*>/i);
  const tag = svgMatch ? svgMatch[0] : "";
  const widthMatch = tag.match(/\bwidth=["']?([0-9.]+)/i);
  const heightMatch = tag.match(/\bheight=["']?([0-9.]+)/i);
  const viewBoxMatch = tag.match(/\bviewBox=["']\s*[-0-9.]+\s+[-0-9.]+\s+([0-9.]+)\s+([0-9.]+)/i);
  const width = widthMatch ? Number(widthMatch[1]) : (viewBoxMatch ? Number(viewBoxMatch[1]) : null);
  const height = heightMatch ? Number(heightMatch[1]) : (viewBoxMatch ? Number(viewBoxMatch[2]) : null);
  return {
    mediaType: "image/svg+xml",
    magic: "svg",
    width: Number.isFinite(width) ? width : null,
    height: Number.isFinite(height) ? height : null,
    hasAlpha: true
  };
}

function aspect(meta) {
  return meta && Number(meta.width) > 0 && Number(meta.height) > 0 ? Number(meta.width) / Number(meta.height) : null;
}

function around(actual, target, tolerance) {
  return Math.abs(actual - target) <= tolerance;
}

function validateBasicAsset({
  rootDir,
  relativePath,
  declaredMediaType = "",
  declaredBytes = null,
  scope,
  errors,
  warnings
}) {
  const absolutePath = pathInside(rootDir, relativePath);
  if (!absolutePath) {
    pushIssue(errors, scope, `unsafe asset path: ${relativePath || "<missing>"}`);
    return {
      relativePath,
      absolutePath: "",
      exists: false,
      bytes: 0,
      mediaType: "",
      magic: "missing",
      width: null,
      height: null,
      hasAlpha: "unknown"
    };
  }
  if (!fs.existsSync(absolutePath) || !fs.statSync(absolutePath).isFile()) {
    pushIssue(errors, scope, `missing asset file: ${relativePath}`);
    return {
      relativePath,
      absolutePath,
      exists: false,
      bytes: 0,
      mediaType: declaredMediaType || mediaTypeFromExtension(relativePath),
      magic: "missing",
      width: null,
      height: null,
      hasAlpha: "unknown"
    };
  }
  const meta = readFileMeta(absolutePath);
  if (declaredMediaType && meta.mediaType !== declaredMediaType) {
    pushIssue(errors, scope, `media type mismatch for ${relativePath}: declared=${declaredMediaType} detected=${meta.mediaType}`);
  }
  const extensionType = mediaTypeFromExtension(relativePath);
  if (extensionType && meta.mediaType !== extensionType) {
    pushIssue(errors, scope, `file extension does not match image signature for ${relativePath}: extension=${extensionType} detected=${meta.mediaType}`);
  }
  if (declaredBytes !== null && Number(declaredBytes) !== meta.bytes) {
    pushIssue(errors, scope, `declared byte size mismatch for ${relativePath}: declared=${declaredBytes} actual=${meta.bytes}`);
  }
  if (meta.width !== null && (!Number.isFinite(Number(meta.width)) || Number(meta.width) <= 0)) {
    pushIssue(errors, scope, `invalid width for ${relativePath}`);
  }
  if (meta.height !== null && (!Number.isFinite(Number(meta.height)) || Number(meta.height) <= 0)) {
    pushIssue(errors, scope, `invalid height for ${relativePath}`);
  }
  if (meta.magic === "unknown") {
    pushIssue(warnings, scope, `unknown image signature for ${relativePath}`);
  }
  return {
    relativePath,
    absolutePath,
    ...meta
  };
}

function requireAlpha(meta, scope, errors, warnings) {
  if (meta.hasAlpha === false) {
    pushIssue(errors, scope, `asset must have transparency: ${meta.relativePath}`);
  } else if (meta.hasAlpha === "unknown") {
    pushIssue(warnings, scope, `alpha channel could not be proven locally: ${meta.relativePath}`);
  }
}

function validateAspect(meta, target, tolerance, scope, errors) {
  const ratio = aspect(meta);
  if (ratio === null) {
    pushIssue(errors, scope, `missing dimensions for aspect check: ${meta.relativePath}`);
    return;
  }
  if (!around(ratio, target, tolerance)) {
    pushIssue(errors, scope, `aspect ratio ${ratio.toFixed(3)} outside ${target.toFixed(3)} +/- ${tolerance.toFixed(3)}: ${meta.relativePath}`);
  }
}

function validateAtomicManifest(rootDir, manifestPath) {
  const errors = [];
  const warnings = [];
  const manifest = readJson(manifestPath);
  const assetsDir = path.dirname(manifestPath);
  const fitTargets = isObject(manifest.fitTargets) ? manifest.fitTargets : {};
  const budgets = isObject(manifest.budgets) ? manifest.budgets : {};
  const groups = asArray(manifest.groups);
  const items = [];

  if (manifest.mode !== "offline-asset-mount-manifest") {
    pushIssue(errors, "atomic", "atomic manifest must use offline-asset-mount-manifest mode");
  }
  for (const key of REQUIRED_SIDE_EFFECT_FALSE_KEYS) {
    if (!manifest.sideEffects || manifest.sideEffects[key] !== false) {
      pushIssue(errors, "atomic", `sideEffects.${key} must be false`);
    }
  }
  if (groups.length === 0) {
    pushIssue(errors, "atomic", "atomic manifest must declare asset groups");
  }
  for (const group of groups) {
    const mount = String(group.mount || "");
    const fitTarget = fitTargets[mount];
    if (!mount || !fitTarget) {
      pushIssue(errors, `atomic/${group.id || "<missing-group>"}`, `missing fit target for mount: ${mount || "<missing>"}`);
    }
    for (const item of asArray(group.items)) {
      const scope = `atomic/${group.id || "<missing-group>"}/${item.id || "<missing-item>"}`;
      const meta = validateBasicAsset({
        rootDir: assetsDir,
        relativePath: String(item.path || ""),
        declaredMediaType: String(item.mediaType || ""),
        declaredBytes: Number.isFinite(Number(item.bytes)) ? Number(item.bytes) : null,
        scope,
        errors,
        warnings
      });
      const runtime = item.runtime === true;
      const preview = item.preview === true;
      const maxBytes = fitTarget && Number.isFinite(Number(fitTarget.maxBytes)) ? Number(fitTarget.maxBytes) : null;
      if ((runtime || preview) && fitTarget) {
        if (fitTarget.requiredRuntime === true && runtime !== true) {
          pushIssue(errors, scope, "fit target requires a runtime asset");
        }
        if (Array.isArray(fitTarget.preferredMediaTypes) && !fitTarget.preferredMediaTypes.includes(meta.mediaType)) {
          pushIssue(errors, scope, `media type is not allowed for mount ${mount}: ${meta.mediaType}`);
        }
        if (Number.isFinite(Number(fitTarget.minWidth)) && Number(meta.width || 0) < Number(fitTarget.minWidth)) {
          pushIssue(errors, scope, `width below fit target minimum ${fitTarget.minWidth}`);
        }
        if (Number.isFinite(Number(fitTarget.maxWidth)) && Number(meta.width || 0) > Number(fitTarget.maxWidth)) {
          pushIssue(errors, scope, `width above fit target maximum ${fitTarget.maxWidth}`);
        }
        if (Number.isFinite(Number(fitTarget.minHeight)) && Number(meta.height || 0) < Number(fitTarget.minHeight)) {
          pushIssue(errors, scope, `height below fit target minimum ${fitTarget.minHeight}`);
        }
        if (maxBytes !== null && Number(meta.bytes || 0) > maxBytes) {
          pushIssue(errors, scope, `bytes above fit target maximum ${maxBytes}`);
        }
        if (Number.isFinite(Number(fitTarget.aspectRatio))) {
          validateAspect(meta, Number(fitTarget.aspectRatio), Number(fitTarget.aspectTolerance || 0), scope, errors);
        }
        const ratio = aspect(meta);
        if (ratio !== null && Number.isFinite(Number(fitTarget.aspectMin)) && ratio < Number(fitTarget.aspectMin)) {
          pushIssue(errors, scope, `aspect ratio below minimum ${fitTarget.aspectMin}`);
        }
        if (ratio !== null && Number.isFinite(Number(fitTarget.aspectMax)) && ratio > Number(fitTarget.aspectMax)) {
          pushIssue(errors, scope, `aspect ratio above maximum ${fitTarget.aspectMax}`);
        }
      }
      if (runtime && group.id === "heroCharacter") {
        requireAlpha(meta, scope, errors, warnings);
      }
      if (runtime && group.id === "sidebarBadge") {
        requireAlpha(meta, scope, errors, warnings);
      }
      if (runtime && group.id === "buttonGlyphs" && meta.mediaType !== "image/svg+xml") {
        pushIssue(errors, scope, "button glyph runtime assets must be SVG");
      }
      if (runtime && group.id === "runtimeBackground" && meta.mediaType !== "image/webp") {
        pushIssue(errors, scope, "runtime background must be WebP");
      }
      if (preview && Number(meta.bytes || 0) > Number(budgets.maxPreviewBytes || Infinity) && meta.mediaType !== "image/svg+xml") {
        pushIssue(warnings, scope, `preview asset exceeds preview budget: ${meta.bytes}`);
      }
      items.push({
        scope,
        groupId: group.id || "",
        mount,
        id: item.id || "",
        runtime,
        preview,
        mediaType: meta.mediaType,
        bytes: meta.bytes,
        width: meta.width,
        height: meta.height,
        hasAlpha: meta.hasAlpha,
        path: meta.relativePath
      });
    }
  }
  return {
    ok: errors.length === 0,
    manifestPath,
    groups: groups.length,
    items,
    runtimeItems: items.filter((item) => item.runtime).length,
    previewItems: items.filter((item) => item.preview).length,
    runtimeBytes: items.filter((item) => item.runtime).reduce((sum, item) => sum + item.bytes, 0),
    errors,
    warnings
  };
}

function listPackDirs(themePacksRoot) {
  if (!fs.existsSync(themePacksRoot)) {
    return [];
  }
  return fs.readdirSync(themePacksRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(themePacksRoot, entry.name))
    .filter((dir) => fs.existsSync(path.join(dir, "pack.json")))
    .sort();
}

function validatePack(packDir) {
  const errors = [];
  const warnings = [];
  const manifestPath = path.join(packDir, "pack.json");
  const pack = readJson(manifestPath);
  const packId = String(pack.id || path.basename(packDir));
  const assetRefs = [];

  if (pack.schemaVersion !== 1) {
    pushIssue(errors, packId, "pack schemaVersion must be 1");
  }
  if (pack.status !== "asset-ready-unmounted") {
    pushIssue(errors, packId, "pack status must be asset-ready-unmounted before local mounting");
  }
  if (!isObject(pack.assets)) {
    pushIssue(errors, packId, "pack assets must be an object");
  }
  if (!isObject(pack.iconMap)) {
    pushIssue(errors, packId, "pack iconMap must be an object");
  }
  if (!isObject(pack.mountContracts)) {
    pushIssue(errors, packId, "pack mountContracts must be an object");
  }
  if (!isObject(pack.payloadGroups)) {
    pushIssue(errors, packId, "pack payloadGroups must be an object");
  }
  if (!isObject(pack.interaction)) {
    pushIssue(errors, packId, "pack interaction must be an object");
  }
  if (pack.interaction && pack.interaction.activation !== "manual-click-only") {
    pushIssue(errors, packId, "interaction activation must be manual-click-only");
  }
  if (pack.interaction && pack.interaction.preload !== false) {
    pushIssue(errors, packId, "interaction preload must be false");
  }
  if (pack.interaction && pack.interaction.idlePlaybackDom !== false) {
    pushIssue(errors, packId, "idle playback DOM must be false");
  }
  if (!String(pack.interaction && pack.interaction.cleanup || "").includes("remove playback node")) {
    pushIssue(errors, packId, "interaction cleanup must remove playback node");
  }
  const visualGroup = asArray(pack.payloadGroups && pack.payloadGroups.visual);
  const playbackGroup = asArray(pack.payloadGroups && pack.payloadGroups.animationPlayback);
  if (visualGroup.includes("interactionSprite") || visualGroup.includes("interactionPoster")) {
    pushIssue(errors, packId, "animation playback assets must not be in the visual payload group");
  }
  if (!playbackGroup.includes("interactionSprite")) {
    pushIssue(errors, packId, "animationPlayback payload group must include interactionSprite");
  }

  for (const key of REQUIRED_PACK_ASSET_KEYS) {
    if (!pack.assets || !pack.assets[key]) {
      pushIssue(errors, packId, `missing required asset key: ${key}`);
      continue;
    }
    const scope = `${packId}/assets/${key}`;
    const meta = validateBasicAsset({
      rootDir: packDir,
      relativePath: String(pack.assets[key]),
      scope,
      errors,
      warnings
    });
    const contractKey = key === "background" ? "background" : key === "heroCharacter" ? "heroCharacter" : key.startsWith("interaction") ? "interaction" : "";
    const budget = contractKey && pack.mountContracts && pack.mountContracts[contractKey]
      ? Number(pack.mountContracts[contractKey].budgetBytes || Infinity)
      : Infinity;
    if (Number(meta.bytes || 0) > budget) {
      pushIssue(errors, scope, `asset exceeds mount contract budget ${budget}`);
    }
    if (key === "background") {
      if (meta.mediaType !== "image/webp") {
        pushIssue(errors, scope, "runtime background must be WebP");
      }
      if (Number(meta.width || 0) < 1440) {
        pushIssue(errors, scope, "runtime background width must be at least 1440");
      }
      validateAspect(meta, 16 / 9, 0.12, scope, errors);
    }
    if (key === "heroCharacter") {
      if (Number(meta.height || 0) < 512) {
        pushIssue(errors, scope, "hero character height must be at least 512");
      }
      requireAlpha(meta, scope, errors, warnings);
    }
    if (key === "interactionMascot" || key === "interactionPoster" || key === "interactionSprite") {
      requireAlpha(meta, scope, errors, warnings);
    }
    if (key === "interactionTrigger" && meta.mediaType !== "image/svg+xml") {
      pushIssue(errors, scope, "interaction trigger must be SVG");
    }
    assetRefs.push({
      key,
      path: meta.relativePath,
      mediaType: meta.mediaType,
      bytes: meta.bytes,
      width: meta.width,
      height: meta.height,
      hasAlpha: meta.hasAlpha
    });
  }

  const iconEntries = Object.entries(isObject(pack.iconMap) ? pack.iconMap : {});
  const iconKeys = new Set(iconEntries.map(([key]) => key));
  for (const key of REQUIRED_ICON_KEYS) {
    if (!iconKeys.has(key)) {
      pushIssue(errors, packId, `missing iconMap key: ${key}`);
    }
  }
  for (const [key, relativePath] of iconEntries) {
    const scope = `${packId}/iconMap/${key}`;
    const meta = validateBasicAsset({
      rootDir: packDir,
      relativePath: String(relativePath),
      scope,
      errors,
      warnings
    });
    if (meta.mediaType !== "image/svg+xml") {
      pushIssue(errors, scope, "iconMap entries must be SVG");
    }
    if (Number(meta.bytes || 0) > 5000) {
      pushIssue(errors, scope, "icon SVG exceeds 5000 byte local runtime budget");
    }
    assetRefs.push({
      key: `icon:${key}`,
      path: meta.relativePath,
      mediaType: meta.mediaType,
      bytes: meta.bytes,
      width: meta.width,
      height: meta.height,
      hasAlpha: meta.hasAlpha
    });
  }

  const frameDir = path.join(packDir, "runtime", "animations", "frames");
  const frameFiles = fs.existsSync(frameDir)
    ? fs.readdirSync(frameDir).filter((name) => name.endsWith(".png")).sort()
    : [];
  const declaredFrameCount = Number(pack.interaction && pack.interaction.frameCount || 0);
  if (declaredFrameCount <= 0) {
    pushIssue(errors, packId, "interaction frameCount must be positive");
  } else if (frameFiles.length !== declaredFrameCount) {
    pushIssue(errors, packId, `frame count mismatch: declared=${declaredFrameCount} actual=${frameFiles.length}`);
  }
  for (const frameFile of frameFiles) {
    const meta = validateBasicAsset({
      rootDir: packDir,
      relativePath: path.join("runtime", "animations", "frames", frameFile),
      scope: `${packId}/frames/${frameFile}`,
      errors,
      warnings
    });
    requireAlpha(meta, `${packId}/frames/${frameFile}`, errors, warnings);
  }

  const sourceDir = path.join(packDir, "sources");
  const sourceFiles = fs.existsSync(sourceDir)
    ? fs.readdirSync(sourceDir).filter((name) => fs.statSync(path.join(sourceDir, name)).isFile()).sort()
    : [];
  if (sourceFiles.length === 0) {
    pushIssue(warnings, packId, "pack has no source files");
  }

  return {
    ok: errors.length === 0,
    id: packId,
    displayName: pack.displayName || "",
    manifestPath,
    assetRefs,
    frameCount: {
      declared: declaredFrameCount,
      actual: frameFiles.length
    },
    sourceFiles: sourceFiles.length,
    runtimeBytes: assetRefs
      .filter((asset) => !String(asset.key).startsWith("icon:"))
      .reduce((sum, asset) => sum + asset.bytes, 0),
    iconCount: iconEntries.length,
    errors,
    warnings
  };
}

function scanLocalPollution(rootDir) {
  const findings = [];
  function walk(currentDir) {
    if (!fs.existsSync(currentDir)) {
      return;
    }
    for (const dirent of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const absolutePath = path.join(currentDir, dirent.name);
      const entry = {
        name: dirent.name,
        isFile: dirent.isFile(),
        isDirectory: dirent.isDirectory(),
        path: absolutePath
      };
      for (const pattern of LOCAL_POLLUTION_PATTERNS) {
        if (pattern.test(entry)) {
          findings.push({
            kind: pattern.kind,
            path: absolutePath
          });
        }
      }
      if (dirent.isDirectory() && dirent.name !== "__pycache__") {
        walk(absolutePath);
      }
    }
  }
  walk(rootDir);
  return findings.sort((a, b) => a.path.localeCompare(b.path));
}

function buildReport(options) {
  const rootDir = path.resolve(options.root);
  const assetsDir = path.join(rootDir, "assets");
  const themePacksRoot = path.resolve(options.themePacksRoot || path.join(rootDir, "..", "theme-packs"));
  const atomicManifestPath = path.resolve(options.atomicManifest || path.join(assetsDir, "atomic-control-assets.json"));
  const atomic = validateAtomicManifest(rootDir, atomicManifestPath);
  const packDirs = listPackDirs(themePacksRoot);
  const packs = packDirs.map((packDir) => validatePack(packDir));
  const pollution = scanLocalPollution(themePacksRoot);
  const errors = [
    ...atomic.errors,
    ...packs.flatMap((pack) => pack.errors)
  ];
  const warnings = [
    ...atomic.warnings,
    ...packs.flatMap((pack) => pack.warnings)
  ];
  for (const finding of pollution) {
    pushIssue(errors, "theme-packs/local-cleanliness", `local generated metadata is present: ${path.relative(themePacksRoot, finding.path)}`, {
      kind: finding.kind,
      path: finding.path
    });
  }
  const runtimeBytes = atomic.runtimeBytes + packs.reduce((sum, pack) => sum + pack.runtimeBytes, 0);
  const report = {
    ok: errors.length === 0,
    mode: "local-asset-standard",
    mutates: false,
    launches: false,
    connectsToCdp: false,
    clicks: false,
    drags: false,
    appliesTheme: false,
    deletes: false,
    rootDir,
    assetsDir,
    themePacksRoot,
    strict: options.strict === "true",
    mountReady: errors.length === 0,
    totals: {
      atomicItems: atomic.items.length,
      atomicRuntimeItems: atomic.runtimeItems,
      packCount: packs.length,
      packRuntimeRefs: packs.reduce((sum, pack) => sum + pack.assetRefs.length, 0),
      runtimeBytes,
      errors: errors.length,
      warnings: warnings.length,
      localPollutionFindings: pollution.length
    },
    standard: {
      noLiveSideEffects: true,
      pathSafety: "all asset references must be relative and stay inside their asset root",
      formatSafety: "extension, declared media type, and file signature must agree",
      runtimeBudget: "runtime assets must pass manifest or mount-contract byte budgets",
      alphaSafety: "foreground characters, badges, mascots, posters, sprites, frames, and SVG icons must preserve transparency",
      backgroundFit: "runtime backgrounds must be WebP, wide enough for desktop preview, and close to 16:9",
      playbackIsolation: "manual animation playback must remain outside visual preload groups",
      cleanliness: "Finder metadata, bytecode, and cache directories are reported and block strict mount readiness"
    },
    atomic: {
      ok: atomic.ok,
      manifestPath: atomic.manifestPath,
      groups: atomic.groups,
      runtimeItems: atomic.runtimeItems,
      previewItems: atomic.previewItems,
      runtimeBytes: atomic.runtimeBytes,
      items: atomic.items
    },
    packs: packs.map((pack) => ({
      ok: pack.ok,
      id: pack.id,
      displayName: pack.displayName,
      manifestPath: pack.manifestPath,
      frameCount: pack.frameCount,
      sourceFiles: pack.sourceFiles,
      iconCount: pack.iconCount,
      runtimeBytes: pack.runtimeBytes,
      assetRefs: pack.assetRefs
    })),
    localPollution: pollution,
    errors,
    warnings
  };
  return report;
}

function printText(report) {
  console.log("[codex-interface-theme] local asset standard");
  console.log(`ok=${report.ok}`);
  console.log(`mode=${report.mode}`);
  console.log(`mountReady=${report.mountReady}`);
  console.log(`strict=${report.strict}`);
  console.log(`mutates=${report.mutates}`);
  console.log(`launches=${report.launches}`);
  console.log(`connectsToCdp=${report.connectsToCdp}`);
  console.log(`clicks=${report.clicks}`);
  console.log(`drags=${report.drags}`);
  console.log(`appliesTheme=${report.appliesTheme}`);
  console.log(`deletes=${report.deletes}`);
  console.log(`atomicItems=${report.totals.atomicItems}`);
  console.log(`atomicRuntimeItems=${report.totals.atomicRuntimeItems}`);
  console.log(`packCount=${report.totals.packCount}`);
  console.log(`packRuntimeRefs=${report.totals.packRuntimeRefs}`);
  console.log(`runtimeBytes=${report.totals.runtimeBytes}`);
  console.log(`localPollutionFindings=${report.totals.localPollutionFindings}`);
  for (const pack of report.packs) {
    console.log(`pack=${pack.id} ok=${pack.ok} frames=${pack.frameCount.actual}/${pack.frameCount.declared} icons=${pack.iconCount} runtimeBytes=${pack.runtimeBytes}`);
  }
  for (const finding of report.localPollution) {
    console.log(`pollution=${finding.kind} ${finding.path}`);
  }
  for (const warning of report.warnings) {
    console.log(`warning=${warning.scope}: ${warning.message}`);
  }
  for (const error of report.errors) {
    console.log(`error=${error.scope}: ${error.message}`);
  }
}

function main() {
  const options = parseArgs(process.argv);
  if (options.help) {
    console.log(usage());
    return;
  }
  const report = buildReport(options);
  if (options.format === "json") {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printText(report);
  }
  if (options.strict === "true" && !report.ok) {
    process.exit(1);
  }
}

try {
  main();
} catch (error) {
  console.error(`[codex-interface-theme][local-asset-standard] ${error.message}`);
  process.exit(1);
}
