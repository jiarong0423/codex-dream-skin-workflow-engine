(function codexInterfaceThemeControlApply(payload) {
  "use strict";

  const STYLE_ID = "codex-interface-theme-style";
  const CONTROL_ID = "codex-interface-theme-control-workbench";
  const MARKER_ID = "codex-interface-theme-marker";
  const ROOT_ATTR = "data-codex-interface-theme";
  const DEFAULT_OUT_DIR = "/tmp/codex-interface-theme-atomic-control-evidence";
  const I18N = {
    "zh-Hant": {
      title: "Atomic Control",
      subtitle: "離線命令規劃器",
      collapse: "收合",
      expand: "展開",
      close: "關閉",
      planAtomicGate: "原子流程",
      planDynamicCoverage: "動態盤點",
      carrier: "載體",
      framework: "框架",
      control: "控制",
      visual: "視覺",
      launchIfMissing: "缺少時啟動",
      interact: "互動",
      stateful: "有狀態",
      autoAllowlist: "自動白名單",
      localControlClicks: "本地控制點擊",
      drag: "拖曳",
      evidenceDirectory: "證據輸出資料夾",
      allowIndexes: "允許 indexes，例如 0,4,12",
      samples: "取樣次數",
      intervalMs: "取樣間隔 ms",
      copyCommand: "複製命令",
      languageToggle: "中文 / EN",
      planOnly: "只產生命令；renderer 不執行 shell / plan only; no shell execution from renderer",
      commandCopied: "命令已複製",
      copyUnavailable: "無法自動複製；請手動選取命令",
      errorOutDir: "out-dir 必須是絕對路徑",
      errorAllowIndexes: "allow indexes 必須是數字 csv",
      errorInteraction: "互動需要 allowlist",
      errorDrag: "拖曳需要互動與明確 indexes",
      errorLocalClicks: "本地控制點擊需要 control-only",
      errorSamples: "samples 必須是數字",
      errorInterval: "interval ms 必須是數字",
      errorDynamicCoverage: "dynamic coverage 是只讀；請關閉啟動、互動、自動白名單、本地點擊、allow indexes 與拖曳",
      assetMountTitle: "素材掛載",
      assetMountHint: "文字狀態只讀；control-only 不載入圖片素材",
      assetRuntime: "runtime"
    },
    en: {
      title: "Atomic Control",
      subtitle: "offline command planner",
      collapse: "Collapse",
      expand: "Expand",
      close: "Close",
      planAtomicGate: "Atomic Gate",
      planDynamicCoverage: "Dynamic Coverage",
      carrier: "Carrier",
      framework: "Framework",
      control: "Control",
      visual: "Visual",
      launchIfMissing: "launch-if-missing",
      interact: "interact",
      stateful: "stateful",
      autoAllowlist: "auto-allowlist",
      localControlClicks: "local-control-clicks",
      drag: "drag",
      evidenceDirectory: "Evidence directory",
      allowIndexes: "allow indexes, e.g. 0,4,12",
      samples: "samples",
      intervalMs: "interval ms",
      copyCommand: "Copy command",
      languageToggle: "中文 / EN",
      planOnly: "plan only; no shell execution from renderer",
      commandCopied: "command copied",
      copyUnavailable: "copy unavailable; select command manually",
      errorOutDir: "out-dir must be absolute",
      errorAllowIndexes: "allow indexes must be numeric csv",
      errorInteraction: "interaction requires allowlist",
      errorDrag: "drag requires interact and explicit indexes",
      errorLocalClicks: "local control clicks require control-only",
      errorSamples: "samples must be numeric",
      errorInterval: "interval ms must be numeric",
      errorDynamicCoverage: "dynamic coverage is read-only; disable launch, interact, auto allowlist, local clicks, allow indexes, and drag",
      assetMountTitle: "Asset Mounts",
      assetMountHint: "Text status only; control-only does not load image assets",
      assetRuntime: "runtime"
    }
  };
  const ASSET_STATUS = [
    ["runtimeBackground", "body-background-preview", "cyberpunkContrastCityRuntime"],
    ["sidebarBadge", "sidebar-dock-preview", "orangeHackerCat128"],
    ["heroCharacter", "sidebar-hero-preview", "cyberMechaCatRuntime"],
    ["tableFlipCat", "manual-trigger-preview", "tableFlipTrigger"],
    ["buttonGlyphs", "semantic-button-preview", "newTask"]
  ];

  if (!payload || typeof payload !== "object") {
    return { ok: false, error: "missing payload" };
  }

  const doc = document;
  const root = doc.documentElement;
  const revision = String(payload.revision || "unknown");

  function removeControl() {
    const panel = doc.getElementById(CONTROL_ID);
    if (panel) {
      panel.remove();
    }
    const marker = doc.getElementById(MARKER_ID);
    if (marker) {
      marker.remove();
    }
    const style = doc.getElementById(STYLE_ID);
    if (style) {
      style.remove();
    }
    if (root.getAttribute(ROOT_ATTR) === "control-only") {
      root.removeAttribute(ROOT_ATTR);
    }
    delete window.__CODEX_INTERFACE_THEME_APPLY__;
    delete window.__CODEX_INTERFACE_THEME_REMOVE__;
    return { ok: true, removed: true, controlOnly: true };
  }

  function installStyle() {
    let style = doc.getElementById(STYLE_ID);
    if (!style) {
      style = doc.createElement("style");
      style.id = STYLE_ID;
      style.type = "text/css";
      (doc.head || root).appendChild(style);
    }
    style.setAttribute("data-revision", revision);
    style.textContent = String(payload.css || "");
  }

  function shellQuote(value) {
    const text = String(value);
    return /^[A-Za-z0-9_./:@%+=,-]+$/.test(text) ? text : "'" + text.replace(/'/g, "'\\''") + "'";
  }

  function buildCommand(state) {
    if (state.planKind === "dynamic-coverage") {
      const command = [
        "bash",
        "macos/scripts/dynamic-boundary-readonly-gate.sh",
        "--port",
        "9341",
        "--out-dir",
        state.outDir || DEFAULT_OUT_DIR,
        "--samples",
        String(state.samples || 3),
        "--interval-ms",
        String(state.intervalMs || 700),
        "--allow-stateful-controls",
        String(state.allowStatefulControls)
      ];
      return command.map(shellQuote).join(" ");
    }
    const command = [
      "bash",
      "macos/scripts/atomic-ui-automation-gate.sh",
      "--port",
      "9341",
      "--out-dir",
      state.outDir || DEFAULT_OUT_DIR,
      "--wait-ms",
      "8000",
      "--load-mode",
      state.loadMode,
      "--launch-if-missing",
      String(state.launchIfMissing),
      "--interact",
      String(state.interact),
      "--allow-stateful-controls",
      String(state.allowStatefulControls),
      "--auto-allowlist",
      String(state.autoAllowlist),
      "--verify-local-control-clicks",
      String(state.verifyLocalControlClicks),
      "--drag",
      String(state.drag)
    ];
    if (state.allowIndexes) {
      command.push("--allow-indexes", state.allowIndexes);
    }
    return command.map(shellQuote).join(" ");
  }

  function t(state, key) {
    return (I18N[state.locale] && I18N[state.locale][key]) || I18N.en[key] || key;
  }

  function validate(state) {
    const errors = [];
    if (!String(state.outDir || "").startsWith("/")) {
      errors.push(t(state, "errorOutDir"));
    }
    if (state.allowIndexes && !/^[0-9]+(,[0-9]+)*$/.test(state.allowIndexes)) {
      errors.push(t(state, "errorAllowIndexes"));
    }
    if (!/^[0-9]+$/.test(String(state.samples))) {
      errors.push(t(state, "errorSamples"));
    }
    if (!/^[0-9]+$/.test(String(state.intervalMs))) {
      errors.push(t(state, "errorInterval"));
    }
    if (state.planKind === "dynamic-coverage") {
      if (state.launchIfMissing || state.interact || state.autoAllowlist || state.verifyLocalControlClicks || state.allowIndexes || state.drag) {
        errors.push(t(state, "errorDynamicCoverage"));
      }
      return errors;
    }
    if (state.interact && !state.autoAllowlist && !state.allowIndexes) {
      errors.push(t(state, "errorInteraction"));
    }
    if (state.drag && (!state.interact || !state.allowIndexes)) {
      errors.push(t(state, "errorDrag"));
    }
    if (state.verifyLocalControlClicks && state.loadMode !== "control-only") {
      errors.push(t(state, "errorLocalClicks"));
    }
    return errors;
  }

  function button(label, className) {
    const node = doc.createElement("button");
    node.type = "button";
    node.className = className;
    node.textContent = label;
    return node;
  }

  function installControl() {
    const existing = doc.getElementById(CONTROL_ID);
    if (existing) {
      existing.remove();
    }

    const state = {
      locale: "zh-Hant",
      planKind: "atomic-gate",
      loadMode: "carrier-only",
      samples: 3,
      intervalMs: 700,
      launchIfMissing: false,
      interact: false,
      allowStatefulControls: false,
      autoAllowlist: false,
      verifyLocalControlClicks: false,
      drag: false,
      allowIndexes: "",
      outDir: DEFAULT_OUT_DIR
    };

    const panel = doc.createElement("section");
    panel.id = CONTROL_ID;
    panel.setAttribute("aria-label", "Atomic Control Workbench");
    panel.setAttribute("data-collapsed", "false");

    const head = doc.createElement("div");
    head.className = "cit-control-head";
    const titleWrap = doc.createElement("div");
    const title = doc.createElement("div");
    title.className = "cit-control-title";
    const subtitle = doc.createElement("div");
    subtitle.className = "cit-control-subtitle";
    titleWrap.append(title, subtitle);
    const language = button("", "cit-control-collapse");
    const collapse = button("", "cit-control-collapse");
    const close = button("", "cit-control-collapse");
    head.append(titleWrap, language, collapse, close);

    const body = doc.createElement("div");
    body.className = "cit-control-body";

    const assetBox = doc.createElement("div");
    assetBox.className = "cit-control-assets";

    const planKindGrid = doc.createElement("div");
    planKindGrid.className = "cit-control-mode-grid";
    const planKindButtons = [
      ["atomic-gate", "planAtomicGate"],
      ["dynamic-coverage", "planDynamicCoverage"]
    ].map(([planKind, labelKey]) => {
      const node = button("", "cit-control-button");
      node.dataset.planKind = planKind;
      node.dataset.labelKey = labelKey;
      node.setAttribute("aria-pressed", String(planKind === state.planKind));
      planKindGrid.appendChild(node);
      return node;
    });

    const modeGrid = doc.createElement("div");
    modeGrid.className = "cit-control-mode-grid";
    const modeLabels = {
      "carrier-only": "carrier",
      "framework-only": "framework",
      "control-only": "control",
      visual: "visual"
    };
    const modeButtons = ["carrier-only", "framework-only", "control-only", "visual"].map((mode) => {
      const node = button("", "cit-control-button");
      node.dataset.mode = mode;
      node.dataset.labelKey = modeLabels[mode];
      node.setAttribute("aria-pressed", String(mode === state.loadMode));
      modeGrid.appendChild(node);
      return node;
    });

    const toggleGrid = doc.createElement("div");
    toggleGrid.className = "cit-control-toggle-grid";
    const toggles = [
      ["launchIfMissing", "launchIfMissing"],
      ["interact", "interact"],
      ["allowStatefulControls", "stateful"],
      ["autoAllowlist", "autoAllowlist"],
      ["verifyLocalControlClicks", "localControlClicks"],
      ["drag", "drag"]
    ].map(([key, labelKey]) => {
      const row = doc.createElement("label");
      row.className = "cit-control-toggle";
      const text = doc.createElement("span");
      text.dataset.labelKey = labelKey;
      const input = doc.createElement("input");
      input.type = "checkbox";
      input.dataset.key = key;
      row.append(text, input);
      toggleGrid.appendChild(row);
      return input;
    });

    const outDir = doc.createElement("input");
    outDir.className = "cit-control-input";
    outDir.value = state.outDir;

    const allowIndexes = doc.createElement("input");
    allowIndexes.className = "cit-control-input";

    const samples = doc.createElement("input");
    samples.className = "cit-control-input";
    samples.value = String(state.samples);

    const intervalMs = doc.createElement("input");
    intervalMs.className = "cit-control-input";
    intervalMs.value = String(state.intervalMs);

    const command = doc.createElement("pre");
    command.className = "cit-control-command";
    const status = doc.createElement("div");
    status.className = "cit-control-status";
    const copy = button("", "cit-control-copy");

    body.append(assetBox, planKindGrid, modeGrid, toggleGrid, outDir, allowIndexes, samples, intervalMs, command, copy, status);
    panel.append(head, body);
    (doc.body || root).appendChild(panel);

    function render() {
      planKindButtons.forEach((node) => {
        node.setAttribute("aria-pressed", String(node.dataset.planKind === state.planKind));
        node.textContent = t(state, node.dataset.labelKey);
      });
      modeButtons.forEach((node) => {
        node.setAttribute("aria-pressed", String(node.dataset.mode === state.loadMode));
        node.textContent = t(state, node.dataset.labelKey);
      });
      title.textContent = t(state, "title");
      subtitle.textContent = t(state, "subtitle");
      language.textContent = t(state, "languageToggle");
      collapse.textContent = panel.dataset.collapsed === "true" ? t(state, "expand") : t(state, "collapse");
      close.textContent = t(state, "close");
      copy.textContent = t(state, "copyCommand");
      assetBox.replaceChildren();
      const assetTitle = doc.createElement("strong");
      assetTitle.textContent = t(state, "assetMountTitle");
      const assetHint = doc.createElement("span");
      assetHint.className = "cit-control-hint";
      assetHint.textContent = t(state, "assetMountHint");
      assetBox.append(assetTitle, assetHint);
      ASSET_STATUS.forEach(([groupId, mount, itemId]) => {
        const row = doc.createElement("span");
        row.dataset.assetGroup = groupId;
        row.dataset.assetMount = mount;
        row.textContent = `${groupId}: ${t(state, "assetRuntime")} / ${itemId}`;
        assetBox.appendChild(row);
      });
      outDir.setAttribute("aria-label", t(state, "evidenceDirectory"));
      allowIndexes.placeholder = t(state, "allowIndexes");
      allowIndexes.setAttribute("aria-label", t(state, "allowIndexes"));
      samples.placeholder = t(state, "samples");
      samples.setAttribute("aria-label", t(state, "samples"));
      intervalMs.placeholder = t(state, "intervalMs");
      intervalMs.setAttribute("aria-label", t(state, "intervalMs"));
      toggles.forEach((input) => {
        input.checked = Boolean(state[input.dataset.key]);
        const label = input.parentElement && input.parentElement.querySelector("span");
        if (label) {
          label.textContent = t(state, label.dataset.labelKey);
        }
      });
      command.textContent = buildCommand(state);
      const errors = validate(state);
      status.textContent = errors.length > 0 ? errors.join(" / ") : t(state, "planOnly");
      panel.dataset.valid = String(errors.length === 0);
      panel.dataset.locale = state.locale;
      panel.dataset.planKind = state.planKind;
    }

    planKindButtons.forEach((node) => {
      node.addEventListener("click", () => {
        state.planKind = node.dataset.planKind || "atomic-gate";
        render();
      });
    });
    modeButtons.forEach((node) => {
      node.addEventListener("click", () => {
        state.loadMode = node.dataset.mode || "carrier-only";
        render();
      });
    });
    toggles.forEach((input) => {
      input.addEventListener("change", () => {
        state[input.dataset.key] = input.checked;
        render();
      });
    });
    outDir.addEventListener("input", () => {
      state.outDir = outDir.value.trim();
      render();
    });
    allowIndexes.addEventListener("input", () => {
      state.allowIndexes = allowIndexes.value.trim();
      render();
    });
    samples.addEventListener("input", () => {
      state.samples = samples.value.trim();
      render();
    });
    intervalMs.addEventListener("input", () => {
      state.intervalMs = intervalMs.value.trim();
      render();
    });
    collapse.addEventListener("click", () => {
      const collapsed = panel.dataset.collapsed === "true";
      panel.dataset.collapsed = String(!collapsed);
      render();
    });
    language.addEventListener("click", () => {
      state.locale = state.locale === "zh-Hant" ? "en" : "zh-Hant";
      render();
    });
    close.addEventListener("click", removeControl);
    copy.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(command.textContent);
        status.textContent = t(state, "commandCopied");
      } catch (_) {
        status.textContent = t(state, "copyUnavailable");
      }
    });

    render();
    return panel;
  }

  installStyle();
  const panel = installControl();
  let marker = doc.getElementById(MARKER_ID);
  if (!marker) {
    marker = doc.createElement("meta");
    marker.id = MARKER_ID;
    (doc.head || root).appendChild(marker);
  }
  marker.dataset.revision = revision;
  marker.dataset.runtimeMode = "control-only";
  root.setAttribute(ROOT_ATTR, "control-only");
  window.__CODEX_INTERFACE_THEME_APPLY__ = codexInterfaceThemeControlApply;
  window.__CODEX_INTERFACE_THEME_REMOVE__ = removeControl;

  return {
    ok: true,
    revision,
    runtimeMode: "control-only",
    controlWorkbench: Boolean(panel)
  };
})
