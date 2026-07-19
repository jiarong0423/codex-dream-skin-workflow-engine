#!/usr/bin/env node

const DEFAULT_PORT = 9341;
const DEFAULT_SAMPLE_MS = 10000;

function parseArgs(argv) {
  const options = {
    port: DEFAULT_PORT,
    sampleMs: DEFAULT_SAMPLE_MS,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--port") {
      options.port = Number(argv[index + 1]);
      index += 1;
      continue;
    }
    if (value === "--sample-ms") {
      options.sampleMs = Number(argv[index + 1]);
      index += 1;
      continue;
    }
    throw new Error(`unknown option: ${value}`);
  }
  if (!Number.isInteger(options.port) || options.port < 1 || options.port > 65535) {
    throw new Error(`invalid port: ${options.port}`);
  }
  if (!Number.isInteger(options.sampleMs) || options.sampleMs < 1000 || options.sampleMs > 60000) {
    throw new Error(`invalid sample duration: ${options.sampleMs}`);
  }
  return options;
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

class CdpSession {
  constructor(url) {
    this.url = url;
    this.socket = null;
    this.nextId = 1;
    this.pending = new Map();
  }

  async connect() {
    this.socket = new WebSocket(this.url);
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("CDP websocket connection timed out")), 5000);
      this.socket.addEventListener("open", () => {
        clearTimeout(timeout);
        resolve();
      }, { once: true });
      this.socket.addEventListener("error", () => {
        clearTimeout(timeout);
        reject(new Error("CDP websocket connection failed"));
      }, { once: true });
    });
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (!message.id || !this.pending.has(message.id)) {
        return;
      }
      const operation = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) {
        operation.reject(new Error(message.error.message || "CDP command failed"));
        return;
      }
      operation.resolve(message.result || {});
    });
  }

  send(method, params = {}) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("CDP websocket is not open"));
    }
    const id = this.nextId;
    this.nextId += 1;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP command timed out: ${method}`));
      }, 10000);
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timeout);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
      });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    if (this.socket) {
      this.socket.close();
    }
  }
}

function metricMap(result) {
  return Object.fromEntries((result.metrics || []).map((metric) => [metric.name, metric.value]));
}

function metricDelta(before, after, name) {
  return Number(((after[name] || 0) - (before[name] || 0)).toFixed(6));
}

async function readTargets(port) {
  const response = await fetch(`http://127.0.0.1:${port}/json/list`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) {
    throw new Error(`CDP target request failed with HTTP ${response.status}`);
  }
  const targets = await response.json();
  const target = targets.find((candidate) => candidate.type === "page" && candidate.url === "app://-/index.html")
    || targets.find((candidate) => candidate.type === "page" && String(candidate.url || "").startsWith("app://"));
  if (!target || !target.webSocketDebuggerUrl) {
    throw new Error("Codex renderer target was not found");
  }
  return target;
}

async function readVisualState(session) {
  const expression = `(${function inspectVisualState() {
    function label(element) {
      if (element.id) {
        return `#${element.id}`;
      }
      const classes = Array.from(element.classList || []).slice(0, 3);
      const suffix = classes.length > 0 ? `.${classes.join(".")}` : "";
      return `${element.tagName.toLowerCase()}${suffix}`;
    }

    function countBackgroundLayers(value) {
      if (!value || value === "none") {
        return 0;
      }
      let depth = 0;
      let count = 1;
      for (const character of value) {
        if (character === "(") {
          depth += 1;
        } else if (character === ")") {
          depth = Math.max(0, depth - 1);
        } else if (character === "," && depth === 0) {
          count += 1;
        }
      }
      return count;
    }

    function isThemeElement(element) {
      if (!element) {
        return false;
      }
      const id = String(element.id || "");
      const className = String(element.className || "");
      return id.startsWith("codex-interface-theme-")
        || className.includes("codex-interface-theme-")
        || className.includes("cit-button-glyph")
        || Boolean(element.closest("[id^='codex-interface-theme-'], [data-cit-button-action], [data-cit-button-module]"));
    }

    const activeBlur = [];
    const activeFilter = [];
    let themeActiveFilterCount = 0;
    let themeWillChangeCount = 0;
    for (const element of document.querySelectorAll("*")) {
      const style = getComputedStyle(element);
      const filterValue = style.backdropFilter || style.webkitBackdropFilter || "none";
      if (filterValue !== "none" && filterValue !== "") {
        const rect = element.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          activeBlur.push({
            element: label(element),
            filter: filterValue,
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          });
        }
      }
      const rect = element.getBoundingClientRect();
      if (style.filter !== "none" && rect.width > 0 && rect.height > 0) {
        const themed = isThemeElement(element);
        if (themed) {
          themeActiveFilterCount += 1;
        }
        activeFilter.push({
          element: label(element),
          filter: style.filter,
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          themed,
        });
      }
      if (isThemeElement(element) && style.willChange !== "auto") {
        themeWillChangeCount += 1;
      }
    }

    const allRunningAnimations = document.getAnimations()
      .filter((animation) => animation.playState === "running");
    const runningAnimations = allRunningAnimations
      .slice(0, 20)
      .map((animation) => ({
        name: animation.animationName || animation.id || "unnamed",
        target: animation.effect && animation.effect.target ? label(animation.effect.target) : "unknown",
      }));
    const themeRunningAnimationCount = allRunningAnimations.filter((animation) => {
      const target = animation.effect && animation.effect.target;
      return Boolean(target && (String(target.id || "").startsWith("codex-interface-theme-") || target.closest("[id^='codex-interface-theme-']")));
    }).length;

    const root = document.documentElement;
    const bodyStyle = getComputedStyle(document.body);
    return {
      revision: root.dataset.codexInterfaceThemeRevision || document.getElementById("codex-interface-theme-marker")?.dataset.revision || "",
      activeBlurCount: activeBlur.length,
      activeBlur: activeBlur.slice(0, 20),
      activeFilterCount: activeFilter.length,
      themeActiveFilterCount,
      activeFilter: activeFilter.filter((entry) => entry.themed).slice(0, 30),
      themeWillChangeCount,
      runningAnimationCount: allRunningAnimations.length,
      themeRunningAnimationCount,
      runningAnimations,
      bodyBackgroundAttachment: bodyStyle.backgroundAttachment,
      bodyBackgroundLayers: countBackgroundLayers(bodyStyle.backgroundImage),
      animationPlaybackResident: Boolean(document.querySelector(".codex-interface-theme-table-flip-cat-animated")),
    };
  }.toString()})()`;
  const result = await session.send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || "visual state evaluation failed");
  }
  return result.result && result.result.value ? result.result.value : {};
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const target = await readTargets(options.port);
  const session = new CdpSession(target.webSocketDebuggerUrl);
  await session.connect();
  try {
    await session.send("Performance.enable");
    const visual = await readVisualState(session);
    const before = metricMap(await session.send("Performance.getMetrics"));
    await delay(options.sampleMs);
    const after = metricMap(await session.send("Performance.getMetrics"));
    const seconds = options.sampleMs / 1000;
    const taskDuration = metricDelta(before, after, "TaskDuration");
    const result = {
      ok: true,
      target: {
        id: target.id,
        title: target.title,
        url: target.url,
      },
      sampleMs: options.sampleMs,
      visual,
      mainThread: {
        taskDurationSeconds: taskDuration,
        taskUtilizationPercent: Number(((taskDuration / seconds) * 100).toFixed(3)),
        scriptDurationSeconds: metricDelta(before, after, "ScriptDuration"),
        layoutDurationSeconds: metricDelta(before, after, "LayoutDuration"),
        recalcStyleDurationSeconds: metricDelta(before, after, "RecalcStyleDuration"),
      },
      memory: {
        jsHeapUsedBytes: after.JSHeapUsedSize || 0,
        jsHeapTotalBytes: after.JSHeapTotalSize || 0,
        documents: after.Documents || 0,
        nodes: after.Nodes || 0,
      },
    };
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } finally {
    session.close();
  }
}

main().catch((error) => {
  process.stderr.write(`[codex-interface-theme][performance-probe] ${error.message}\n`);
  process.exitCode = 1;
});
