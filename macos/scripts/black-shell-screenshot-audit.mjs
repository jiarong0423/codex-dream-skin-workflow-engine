#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const DEFAULT_STEP = 6;
const DEFAULT_MIN_AREA = 2200;
const DEFAULT_MAX_CANDIDATES = 48;
const DEFAULT_BLACK_THRESHOLD = 62;
const DEFAULT_GRAY_THRESHOLD = 128;
const DEFAULT_CHROMA_THRESHOLD = 52;

function usage() {
  return `Usage: black-shell-screenshot-audit.mjs --image <path> [--image <path> ...] [options]
       black-shell-screenshot-audit.mjs <image-path> [image-path ...] [options]

Options:
  --out-dir <absolute-path>       Optional report directory.
  --format text|json              Output format. Default: text.
  --step <px>                     Downsample step. Default: 6.
  --min-area <px>                 Minimum candidate rectangle area. Default: 2200.
  --max-candidates <n>            Maximum candidates per image. Default: 48.
  --black-threshold <0-255>       Strict black luminance threshold. Default: 62.
  --gray-threshold <0-255>        Dark gray shell luminance threshold. Default: 106.
  --chroma-threshold <0-255>      Low-saturation gray threshold. Default: 36.

Read-only contract:
  analyzes screenshot pixels only. It never reads live DOM, launches Codex,
  applies a theme, restores, clicks, drags, resizes, deletes source files, or
  changes project/account/permission state.`;
}

function parseArgs(argv) {
  const options = {
    images: [],
    outDir: "",
    format: "text",
    step: DEFAULT_STEP,
    minArea: DEFAULT_MIN_AREA,
    maxCandidates: DEFAULT_MAX_CANDIDATES,
    blackThreshold: DEFAULT_BLACK_THRESHOLD,
    grayThreshold: DEFAULT_GRAY_THRESHOLD,
    chromaThreshold: DEFAULT_CHROMA_THRESHOLD
  };
  for (let index = 2; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === "--help" || key === "-h") {
      options.help = true;
      continue;
    }
    if (key === "--image") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("--image requires a path");
      }
      options.images.push(value);
      index += 1;
      continue;
    }
    if (key.startsWith("--")) {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new Error(`missing value for ${key}`);
      }
      const name = key.slice(2).replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
      options[name] = value;
      index += 1;
      continue;
    }
    options.images.push(key);
  }
  return options;
}

function assertNumber(name, value, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < min || numeric > max) {
    throw new Error(`${name} must be between ${min} and ${max}`);
  }
  return numeric;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
}

function removeDirectoryQuietly(dirPath) {
  try {
    fs.rmSync(dirPath, { recursive: true, force: true });
  } catch {
    return;
  }
}

function convertToBmp(imagePath, tempDir) {
  const output = path.join(tempDir, `${path.basename(imagePath).replace(/[^a-zA-Z0-9._-]/g, "_")}.bmp`);
  const result = spawnSync("/usr/bin/sips", ["-s", "format", "bmp", imagePath, "--out", output], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  if (result.status !== 0) {
    throw new Error(`sips failed for ${imagePath}: ${(result.stderr || result.stdout || "").trim()}`);
  }
  return output;
}

function readBmp(filePath) {
  const buffer = fs.readFileSync(filePath);
  if (buffer.toString("ascii", 0, 2) !== "BM") {
    throw new Error(`not a BMP file: ${filePath}`);
  }
  const offset = buffer.readUInt32LE(10);
  const dibSize = buffer.readUInt32LE(14);
  if (dibSize < 40) {
    throw new Error(`unsupported BMP DIB header size: ${dibSize}`);
  }
  const width = buffer.readInt32LE(18);
  const rawHeight = buffer.readInt32LE(22);
  const planes = buffer.readUInt16LE(26);
  const bitsPerPixel = buffer.readUInt16LE(28);
  const compression = buffer.readUInt32LE(30);
  if (planes !== 1 || ![0, 3].includes(compression) || ![24, 32].includes(bitsPerPixel)) {
    throw new Error(`unsupported BMP format: planes=${planes} bits=${bitsPerPixel} compression=${compression}`);
  }
  if (compression === 3 && bitsPerPixel !== 32) {
    throw new Error(`unsupported BMP bitfield depth: bits=${bitsPerPixel}`);
  }
  let bitMasks = null;
  if (compression === 3) {
    bitMasks = {
      r: buffer.readUInt32LE(54),
      g: buffer.readUInt32LE(58),
      b: buffer.readUInt32LE(62),
      a: buffer.readUInt32LE(66)
    };
  }
  const height = Math.abs(rawHeight);
  const topDown = rawHeight < 0;
  const bytesPerPixel = bitsPerPixel / 8;
  const rowStride = Math.floor((bitsPerPixel * width + 31) / 32) * 4;
  const readChannel = (pixelValue, mask) => {
    if (!mask) {
      return 255;
    }
    let shift = 0;
    let shifted = mask >>> 0;
    while ((shifted & 1) === 0 && shift < 32) {
      shifted >>>= 1;
      shift += 1;
    }
    const raw = (pixelValue & mask) >>> shift;
    const max = shifted;
    if (max <= 0) {
      return 0;
    }
    return Math.round(raw * 255 / max);
  };
  return {
    width,
    height,
    getPixel(x, y) {
      const clampedX = Math.max(0, Math.min(width - 1, Math.round(x)));
      const clampedY = Math.max(0, Math.min(height - 1, Math.round(y)));
      const row = topDown ? clampedY : height - 1 - clampedY;
      const index = offset + row * rowStride + clampedX * bytesPerPixel;
      if (bitMasks) {
        const value = buffer.readUInt32LE(index);
        return {
          r: readChannel(value, bitMasks.r),
          g: readChannel(value, bitMasks.g),
          b: readChannel(value, bitMasks.b),
          a: bitMasks.a ? readChannel(value, bitMasks.a) : 255
        };
      }
      const b = buffer[index];
      const g = buffer[index + 1];
      const r = buffer[index + 2];
      const a = bytesPerPixel === 4 ? buffer[index + 3] : 255;
      return { r, g, b, a };
    }
  };
}

function pixelMetrics(pixel) {
  const max = Math.max(pixel.r, pixel.g, pixel.b);
  const min = Math.min(pixel.r, pixel.g, pixel.b);
  const luminance = 0.2126 * pixel.r + 0.7152 * pixel.g + 0.0722 * pixel.b;
  return {
    r: pixel.r,
    g: pixel.g,
    b: pixel.b,
    a: pixel.a,
    max,
    min,
    chroma: max - min,
    luminance
  };
}

function isShellDark(metrics, options) {
  if (metrics.luminance <= options.blackThreshold && metrics.max <= options.blackThreshold + 24) {
    return true;
  }
  if (metrics.luminance <= options.grayThreshold && metrics.chroma <= options.chromaThreshold) {
    return true;
  }
  if (metrics.luminance <= options.grayThreshold - 12 && metrics.max <= options.grayThreshold + 12 && metrics.chroma <= options.chromaThreshold + 22) {
    return true;
  }
  return false;
}

function sampleRegion(image, x1, y1, x2, y2, step, options) {
  const left = Math.max(0, Math.floor(x1));
  const top = Math.max(0, Math.floor(y1));
  const right = Math.min(image.width, Math.ceil(x2));
  const bottom = Math.min(image.height, Math.ceil(y2));
  let samples = 0;
  let luminance = 0;
  let chroma = 0;
  let dark = 0;
  let strictBlack = 0;
  for (let y = top; y < bottom; y += step) {
    for (let x = left; x < right; x += step) {
      const metrics = pixelMetrics(image.getPixel(x, y));
      samples += 1;
      luminance += metrics.luminance;
      chroma += metrics.chroma;
      if (isShellDark(metrics, options)) {
        dark += 1;
      }
      if (metrics.luminance <= options.blackThreshold && metrics.max <= options.blackThreshold + 24) {
        strictBlack += 1;
      }
    }
  }
  if (samples === 0) {
    return { samples: 0, avgLuminance: 255, avgChroma: 0, darkRatio: 0, strictBlackRatio: 0 };
  }
  return {
    samples,
    avgLuminance: luminance / samples,
    avgChroma: chroma / samples,
    darkRatio: dark / samples,
    strictBlackRatio: strictBlack / samples
  };
}

function sampleRing(image, rect, step, options) {
  const margin = Math.max(step * 2, 14);
  const regions = [
    [rect.left - margin, rect.top - margin, rect.right + margin, rect.top],
    [rect.left - margin, rect.bottom, rect.right + margin, rect.bottom + margin],
    [rect.left - margin, rect.top, rect.left, rect.bottom],
    [rect.right, rect.top, rect.right + margin, rect.bottom]
  ];
  const summaries = regions.map((region) => sampleRegion(image, region[0], region[1], region[2], region[3], step, options)).filter((entry) => entry.samples > 0);
  const samples = summaries.reduce((sum, entry) => sum + entry.samples, 0);
  if (samples === 0) {
    return { samples: 0, avgLuminance: 255, avgChroma: 0, darkRatio: 0, strictBlackRatio: 0 };
  }
  return {
    samples,
    avgLuminance: summaries.reduce((sum, entry) => sum + entry.avgLuminance * entry.samples, 0) / samples,
    avgChroma: summaries.reduce((sum, entry) => sum + entry.avgChroma * entry.samples, 0) / samples,
    darkRatio: summaries.reduce((sum, entry) => sum + entry.darkRatio * entry.samples, 0) / samples,
    strictBlackRatio: summaries.reduce((sum, entry) => sum + entry.strictBlackRatio * entry.samples, 0) / samples
  };
}

function connectedComponents(mask, gridWidth, gridHeight) {
  const seen = new Uint8Array(mask.length);
  const components = [];
  const offsets = [
    [-1, -1], [0, -1], [1, -1],
    [-1, 0], [1, 0],
    [-1, 1], [0, 1], [1, 1]
  ];
  for (let y = 0; y < gridHeight; y += 1) {
    for (let x = 0; x < gridWidth; x += 1) {
      const start = y * gridWidth + x;
      if (!mask[start] || seen[start]) {
        continue;
      }
      const stack = [[x, y]];
      seen[start] = 1;
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      let cells = 0;
      while (stack.length > 0) {
        const [currentX, currentY] = stack.pop();
        cells += 1;
        minX = Math.min(minX, currentX);
        maxX = Math.max(maxX, currentX);
        minY = Math.min(minY, currentY);
        maxY = Math.max(maxY, currentY);
        for (const [dx, dy] of offsets) {
          const nextX = currentX + dx;
          const nextY = currentY + dy;
          if (nextX < 0 || nextY < 0 || nextX >= gridWidth || nextY >= gridHeight) {
            continue;
          }
          const nextIndex = nextY * gridWidth + nextX;
          if (mask[nextIndex] && !seen[nextIndex]) {
            seen[nextIndex] = 1;
            stack.push([nextX, nextY]);
          }
        }
      }
      components.push({ minX, maxX, minY, maxY, cells });
    }
  }
  return components;
}

function blockMetrics(image, centerX, centerY, blockSize, step) {
  const half = Math.max(1, Math.floor(blockSize / 2));
  const left = Math.max(0, Math.floor(centerX - half));
  const top = Math.max(0, Math.floor(centerY - half));
  const right = Math.min(image.width, Math.ceil(centerX + half));
  const bottom = Math.min(image.height, Math.ceil(centerY + half));
  const luminanceValues = [];
  let chromaSum = 0;
  for (let y = top; y < bottom; y += step) {
    for (let x = left; x < right; x += step) {
      const metrics = pixelMetrics(image.getPixel(x, y));
      luminanceValues.push(metrics.luminance);
      chromaSum += metrics.chroma;
    }
  }
  if (luminanceValues.length === 0) {
    return { avgLuminance: 255, avgChroma: 0, variance: 0 };
  }
  const avgLuminance = luminanceValues.reduce((sum, value) => sum + value, 0) / luminanceValues.length;
  const variance = luminanceValues.reduce((sum, value) => {
    const diff = value - avgLuminance;
    return sum + diff * diff;
  }, 0) / luminanceValues.length;
  return {
    avgLuminance,
    avgChroma: chromaSum / luminanceValues.length,
    variance
  };
}

function isSmoothDarkShellBlock(stats, options) {
  if (stats.avgLuminance <= options.blackThreshold + 18 && stats.avgChroma <= options.chromaThreshold + 36) {
    return true;
  }
  if (stats.avgLuminance <= options.grayThreshold + 26 && stats.avgChroma <= options.chromaThreshold + 44 && stats.variance <= 980) {
    return true;
  }
  if (stats.avgLuminance <= options.grayThreshold + 44 && stats.avgChroma <= options.chromaThreshold + 26 && stats.variance <= 520) {
    return true;
  }
  return false;
}

function classifyCandidate(candidate, image) {
  const screenArea = image.width * image.height;
  if (candidate.area >= screenArea * 0.42) {
    return "screen-scale dark layer/background";
  }
  if (candidate.sourceKind === "smooth-dark-rectangle" && candidate.width >= image.width * 0.18 && candidate.height >= 42) {
    return "smooth darkened rectangle/panel";
  }
  if (candidate.width >= image.width * 0.28 && candidate.height >= image.height * 0.16) {
    return "large panel/backdrop shell";
  }
  if (candidate.width >= 150 && candidate.height <= 110) {
    return "row/chip/input shell";
  }
  if (candidate.height >= 180 && candidate.width >= 120) {
    return "popover/sidebar shell";
  }
  return "dark shell candidate";
}

function scoreCandidate(candidate) {
  const edge = Math.max(0, candidate.edgeContrast);
  const densityScore = Math.min(1, candidate.density);
  const darkScore = Math.min(1, candidate.darkRatio);
  const blackScore = Math.min(1, candidate.strictBlackRatio);
  const rectangularity = Math.min(1, candidate.coveredPixelEstimate / Math.max(1, candidate.area));
  const smoothBonus = candidate.sourceKind === "smooth-dark-rectangle" ? 0.1 : 0;
  const screenPenalty = candidate.classification === "screen-scale dark layer/background" ? 0.22 : 0;
  const score = densityScore * 0.28 + darkScore * 0.24 + blackScore * 0.12 + rectangularity * 0.12 + Math.min(1, edge / 42) * 0.14 + smoothBonus - screenPenalty;
  return Math.round(Math.max(0, Math.min(1, score)) * 1000) / 1000;
}

function candidateOverlap(left, right) {
  const x1 = Math.max(left.rect.left, right.rect.left);
  const y1 = Math.max(left.rect.top, right.rect.top);
  const x2 = Math.min(left.rect.right, right.rect.right);
  const y2 = Math.min(left.rect.bottom, right.rect.bottom);
  const width = Math.max(0, x2 - x1);
  const height = Math.max(0, y2 - y1);
  const intersection = width * height;
  if (intersection <= 0) {
    return 0;
  }
  const union = left.area + right.area - intersection;
  return intersection / Math.max(1, union);
}

function dedupeCandidates(candidates) {
  const kept = [];
  for (const candidate of candidates) {
    let absorbed = false;
    for (let index = 0; index < kept.length; index += 1) {
      const existing = kept[index];
      const overlap = candidateOverlap(candidate, existing);
      const candidateIsScreen = candidate.classification === "screen-scale dark layer/background";
      const existingIsScreen = existing.classification === "screen-scale dark layer/background";
      if (overlap >= 0.82 || (existingIsScreen && !candidateIsScreen && overlap >= 0.7)) {
        if (candidate.confidence > existing.confidence || (existingIsScreen && !candidateIsScreen)) {
          kept[index] = candidate;
        }
        absorbed = true;
        break;
      }
      if (candidateIsScreen && !existingIsScreen && overlap >= 0.7) {
        absorbed = true;
        break;
      }
    }
    if (!absorbed) {
      kept.push(candidate);
    }
  }
  return kept;
}

function buildCandidatesFromComponents(image, components, options, sourceKind) {
  const candidates = [];
  for (const component of components) {
    const left = component.minX * options.step;
    const top = component.minY * options.step;
    const right = Math.min(image.width, (component.maxX + 1) * options.step);
    const bottom = Math.min(image.height, (component.maxY + 1) * options.step);
    const width = right - left;
    const height = bottom - top;
    const area = width * height;
    if (width < 48 || height < 18 || area < options.minArea) {
      continue;
    }
    const rectCells = (component.maxX - component.minX + 1) * (component.maxY - component.minY + 1);
    const density = component.cells / Math.max(1, rectCells);
    const densityFloor = sourceKind === "smooth-dark-rectangle" ? 0.18 : 0.22;
    if (density < densityFloor) {
      continue;
    }
    const inside = sampleRegion(image, left, top, right, bottom, options.step, options);
    const darkRatioFloor = sourceKind === "smooth-dark-rectangle" ? 0.12 : 0.28;
    if (inside.darkRatio < darkRatioFloor && inside.avgLuminance > options.grayThreshold + 42) {
      continue;
    }
    const ring = sampleRing(image, { left, top, right, bottom }, options.step, options);
    const edgeContrast = ring.samples > 0 ? ring.avgLuminance - inside.avgLuminance : 0;
    const candidate = {
      sourceKind,
      rect: {
        left,
        top,
        right,
        bottom,
        width,
        height
      },
      area,
      width,
      height,
      gridCells: component.cells,
      coveredPixelEstimate: component.cells * options.step * options.step,
      density: Math.round(density * 1000) / 1000,
      avgLuminance: Math.round(inside.avgLuminance * 10) / 10,
      avgChroma: Math.round(inside.avgChroma * 10) / 10,
      darkRatio: Math.round(inside.darkRatio * 1000) / 1000,
      strictBlackRatio: Math.round(inside.strictBlackRatio * 1000) / 1000,
      outsideAvgLuminance: Math.round(ring.avgLuminance * 10) / 10,
      edgeContrast: Math.round(edgeContrast * 10) / 10,
      classification: "",
      confidence: 0
    };
    candidate.classification = classifyCandidate(candidate, image);
    candidate.confidence = scoreCandidate(candidate);
    candidates.push(candidate);
  }
  return candidates;
}

function auditImage(imagePath, options) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cit-black-shell-screenshot-"));
  try {
    const bmpPath = convertToBmp(imagePath, tempDir);
    const image = readBmp(bmpPath);
    const gridWidth = Math.ceil(image.width / options.step);
    const gridHeight = Math.ceil(image.height / options.step);
    const mask = new Uint8Array(gridWidth * gridHeight);
    const smoothMask = new Uint8Array(gridWidth * gridHeight);
    for (let gridY = 0; gridY < gridHeight; gridY += 1) {
      for (let gridX = 0; gridX < gridWidth; gridX += 1) {
        const x = Math.min(image.width - 1, gridX * options.step + Math.floor(options.step / 2));
        const y = Math.min(image.height - 1, gridY * options.step + Math.floor(options.step / 2));
        const metrics = pixelMetrics(image.getPixel(x, y));
        if (isShellDark(metrics, options)) {
          mask[gridY * gridWidth + gridX] = 1;
        }
        const block = blockMetrics(image, x, y, options.step * 3, options.step);
        if (isSmoothDarkShellBlock(block, options)) {
          smoothMask[gridY * gridWidth + gridX] = 1;
        }
      }
    }
    const components = connectedComponents(mask, gridWidth, gridHeight);
    const smoothComponents = connectedComponents(smoothMask, gridWidth, gridHeight);
    const candidates = dedupeCandidates([
      ...buildCandidatesFromComponents(image, components, options, "absolute-dark"),
      ...buildCandidatesFromComponents(image, smoothComponents, options, "smooth-dark-rectangle")
    ]);
    candidates.sort((left, right) => {
      if (right.confidence !== left.confidence) {
        return right.confidence - left.confidence;
      }
      return right.area - left.area;
    });
    return {
      image: imagePath,
      width: image.width,
      height: image.height,
      step: options.step,
      thresholds: {
        black: options.blackThreshold,
        gray: options.grayThreshold,
        chroma: options.chromaThreshold,
        minArea: options.minArea
      },
      summary: {
        connectedComponents: components.length,
        smoothComponents: smoothComponents.length,
        candidates: Math.min(candidates.length, options.maxCandidates),
        rawCandidates: candidates.length,
        screenScale: candidates.filter((candidate) => candidate.classification === "screen-scale dark layer/background").length,
        panels: candidates.filter((candidate) => candidate.classification === "large panel/backdrop shell").length,
        smoothPanels: candidates.filter((candidate) => candidate.classification === "smooth darkened rectangle/panel").length,
        rows: candidates.filter((candidate) => candidate.classification === "row/chip/input shell").length
      },
      candidates: candidates.slice(0, options.maxCandidates)
    };
  } finally {
    removeDirectoryQuietly(tempDir);
  }
}

function safeReportName(imagePath, index) {
  const base = path.basename(imagePath).replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return `${String(index + 1).padStart(2, "0")}-${base || "image"}`;
}

function writeHtmlReport(report, outPath) {
  const imageUrl = pathToFileURL(report.image).href;
  const boxes = report.candidates.map((candidate, index) => {
    const left = candidate.rect.left / report.width * 100;
    const top = candidate.rect.top / report.height * 100;
    const width = candidate.rect.width / report.width * 100;
    const height = candidate.rect.height / report.height * 100;
    const hue = candidate.classification.includes("screen-scale") ? "#f59e0b" : candidate.classification.includes("row") ? "#22d3ee" : "#f43f5e";
    return `<div class="box" style="left:${left}%;top:${top}%;width:${width}%;height:${height}%;border-color:${hue};"><span>${index + 1}</span></div>`;
  }).join("\n");
  const rows = report.candidates.map((candidate, index) => `<tr><td>${index + 1}</td><td>${escapeHtml(candidate.classification)}</td><td>${candidate.confidence}</td><td>${candidate.rect.left},${candidate.rect.top},${candidate.rect.width}x${candidate.rect.height}</td><td>${candidate.avgLuminance}</td><td>${candidate.darkRatio}</td><td>${candidate.edgeContrast}</td></tr>`).join("\n");
  const html = `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<title>Black Shell Screenshot Audit</title>
<style>
body{margin:0;background:#0b0f12;color:#e8eef2;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
main{padding:20px}
.stage{position:relative;display:inline-block;max-width:100%;border:1px solid rgba(255,255,255,.22)}
.stage img{display:block;max-width:100%;height:auto}
.box{position:absolute;box-sizing:border-box;border:2px solid #f43f5e;background:rgba(244,63,94,.08);pointer-events:none}
.box span{position:absolute;top:0;left:0;transform:translateY(-100%);background:rgba(0,0,0,.82);color:white;font-size:12px;padding:2px 5px}
table{border-collapse:collapse;margin-top:18px;width:100%;font-size:13px}
th,td{border-bottom:1px solid rgba(255,255,255,.16);padding:7px 9px;text-align:left}
code{background:rgba(255,255,255,.12);padding:2px 5px;border-radius:4px}
</style>
</head>
<body>
<main>
<h1>Black Shell Screenshot Audit</h1>
<p><code>${escapeHtml(report.image)}</code> ${report.width}x${report.height}</p>
<div class="stage"><img src="${imageUrl}" alt="audited screenshot">${boxes}</div>
<table>
<thead><tr><th>#</th><th>classification</th><th>confidence</th><th>rect</th><th>avgLum</th><th>darkRatio</th><th>edgeContrast</th></tr></thead>
<tbody>${rows}</tbody>
</table>
</main>
</body>
</html>
`;
  fs.writeFileSync(outPath, html, "utf8");
}

function printText(report) {
  console.log("[codex-interface-theme] read-only black shell screenshot audit");
  console.log(`images=${report.images.length} clicks=false drags=false applies=false launches=false liveDom=false`);
  for (const image of report.images) {
    console.log(`image=${image.image}`);
    console.log(`size=${image.width}x${image.height} candidates=${image.summary.candidates}/${image.summary.rawCandidates} components=${image.summary.connectedComponents} smoothComponents=${image.summary.smoothComponents} screenScale=${image.summary.screenScale} panels=${image.summary.panels} smoothPanels=${image.summary.smoothPanels} rows=${image.summary.rows}`);
    image.candidates.slice(0, 12).forEach((candidate, index) => {
      console.log(`  [${index + 1}] ${candidate.classification} source=${candidate.sourceKind} confidence=${candidate.confidence} rect=${candidate.rect.left},${candidate.rect.top},${candidate.rect.width}x${candidate.rect.height} avgLum=${candidate.avgLuminance} darkRatio=${candidate.darkRatio} edgeContrast=${candidate.edgeContrast}`);
    });
  }
  if (report.outDir) {
    console.log(`outDir=${report.outDir}`);
  }
}

async function main() {
  const parsed = parseArgs(process.argv);
  if (parsed.help) {
    console.log(usage());
    return;
  }
  const options = {
    images: parsed.images,
    outDir: parsed.outDir,
    format: parsed.format,
    step: assertNumber("--step", parsed.step, 2, 24),
    minArea: assertNumber("--min-area", parsed.minArea, 128, 1000000),
    maxCandidates: assertNumber("--max-candidates", parsed.maxCandidates, 1, 240),
    blackThreshold: assertNumber("--black-threshold", parsed.blackThreshold, 1, 255),
    grayThreshold: assertNumber("--gray-threshold", parsed.grayThreshold, 1, 255),
    chromaThreshold: assertNumber("--chroma-threshold", parsed.chromaThreshold, 0, 255)
  };
  if (!["text", "json"].includes(String(options.format))) {
    throw new Error("--format must be text or json");
  }
  if (options.outDir && !String(options.outDir).startsWith("/")) {
    throw new Error("--out-dir must be an absolute path");
  }
  if (options.images.length === 0) {
    throw new Error("provide at least one --image or image path");
  }
  for (const image of options.images) {
    if (!fs.existsSync(image)) {
      throw new Error(`image not found: ${image}`);
    }
  }
  if (options.outDir) {
    fs.mkdirSync(options.outDir, { recursive: true });
  }
  const report = {
    ok: true,
    mode: "read-only-black-shell-screenshot-audit",
    liveDom: false,
    mutatesSource: false,
    launches: false,
    applies: false,
    restores: false,
    clicks: false,
    drags: false,
    images: options.images.map((image) => auditImage(image, options)),
    outDir: options.outDir || ""
  };
  if (options.outDir) {
    fs.writeFileSync(path.join(options.outDir, "black-shell-screenshot-audit.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
    report.images.forEach((imageReport, index) => {
      writeHtmlReport(imageReport, path.join(options.outDir, `${safeReportName(imageReport.image, index)}.html`));
    });
  }
  if (options.format === "json") {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printText(report);
  }
}

main().catch((error) => {
  console.error(`[codex-interface-theme][error] ${error.message}`);
  process.exitCode = 1;
});
