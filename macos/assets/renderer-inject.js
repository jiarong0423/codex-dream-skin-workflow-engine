(function codexInterfaceThemeApply(payload) {
  "use strict";

  const STYLE_ID = "codex-interface-theme-style";
  const BACKGROUND_STYLE_ID = "codex-interface-theme-background-style";
  const BACKDROP_ID = "codex-interface-theme-backdrop";
  const RIGHT_HUD_ID = "codex-interface-theme-right-hud";
  const CHARACTER_ID = "codex-interface-theme-character";
  const BADGE_ID = "codex-interface-theme-badge";
  const MARKER_ID = "codex-interface-theme-marker";
  const ROOT_ATTR = "data-codex-interface-theme";
  const ROUTE_WATCH_INTERVAL_MS = 2500;
  const HEAVY_MAINTENANCE_EVERY_TICKS = 4;
  const STATIC_ACCESS_INVALIDATION_MIN_MS = 240;
  const STABILIZE_AFTER_PAINT_MS = 350;
  const TABLE_FLIP_CAT_DEFAULT_DURATION_MS = 1430;
  const TABLE_FLIP_CAT_DEFAULT_FRAMES = 8;

  if (!payload || typeof payload !== "object") {
    return { ok: false, error: "missing payload" };
  }

  const doc = document;
  const root = doc.documentElement;
  const revision = String(payload.revision || "unknown");
  const theme = payload.theme && typeof payload.theme === "object" ? payload.theme : {};
  const palette = theme.palette && typeof theme.palette === "object" ? theme.palette : {};
  const art = theme.art && typeof theme.art === "object" ? theme.art : {};
  const modules = theme.modules && typeof theme.modules === "object" ? theme.modules : {};
  const layout = theme.layout && typeof theme.layout === "object" ? theme.layout : {};
  const icons = theme.icons && typeof theme.icons === "object" ? theme.icons : {};
  const buttonDataUrls = payload.iconButtonDataUrls && typeof payload.iconButtonDataUrls === "object" ? payload.iconButtonDataUrls : {};
  let tableFlipCatTimer = null;
  let tableFlipCatPlaybackInterval = null;
  let characterRetreatObserver = null;
  let characterRetreatCheckTimer = null;
  let characterRetreatLastCheckAt = 0;
  let characterRetreatHoldUntil = 0;
  let characterRetreatResizeHandler = null;
  let characterRetreatScrollHandler = null;
  let projectPanelChromeCheckTimer = null;
  let projectPanelChromeFollowupTimer = null;
  let projectPanelChromeLastCheckAt = 0;
  let projectPanelChromeTriggerHandler = null;
  let projectPanelChromePendingUntil = 0;
  let workspacePickerCheckTimer = null;
  let workspacePickerTriggerHandler = null;
  let workspacePickerHoldUntil = 0;
  const staticAccess = {
    generation: 0,
    hits: 0,
    misses: 0,
    lastInvalidatedAt: 0,
    reason: "init",
    nodes: Object.create(null)
  };

  function clampNumber(value, min, max, fallback) {
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue)) {
      return fallback;
    }
    return Math.min(max, Math.max(min, numberValue));
  }

  function setVariable(name, value) {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      root.style.setProperty(name, String(value));
    }
  }

  function cssUrlFromDataUrl(dataUrl) {
    const value = String(dataUrl || "");
    if (!value.startsWith("data:image/")) {
      return "none";
    }
    return "url(\"" + value.replace(/[\\\n\r\t "]/g, function replaceUnsafe(match) {
      if (match === " ") {
        return "%20";
      }
      if (match === "\"") {
        return "%22";
      }
      return "";
    }) + "\")";
  }

  function inferAppearance() {
    const explicit = String(theme.appearance || "auto").toLowerCase();
    if (explicit === "light" || explicit === "dark") {
      return explicit;
    }
    const computed = getComputedStyle(root).getPropertyValue("color-scheme").toLowerCase();
    if (computed.includes("light") && !computed.includes("dark")) {
      return "light";
    }
    if (computed.includes("dark")) {
      return "dark";
    }
    if (window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches) {
      return "light";
    }
    return "dark";
  }

  function updateRouteState() {
    invalidateStaticAccess("route", true);
    const href = String(window.location && window.location.href ? window.location.href : "");
    const path = String(window.location && window.location.pathname ? window.location.pathname : "");
    const routeValue = href || path || "unknown";
    root.dataset.citRoute = routeValue.slice(0, 240);
    if (/thread|conversation|task|pull|pr|diff|commit/i.test(routeValue)) {
      root.dataset.citPageKind = "task";
    } else {
      root.dataset.citPageKind = "home";
    }
  }

  function publishStaticAccessStats() {
    root.dataset.citStaticAccessGeneration = String(staticAccess.generation);
    root.dataset.citStaticAccessHits = String(staticAccess.hits);
    root.dataset.citStaticAccessMisses = String(staticAccess.misses);
    root.dataset.citStaticAccessReason = staticAccess.reason;
  }

  function invalidateStaticAccess(reason, force) {
    const now = Date.now();
    const nextReason = String(reason || "unknown").slice(0, 64);
    if (!force && now - staticAccess.lastInvalidatedAt < STATIC_ACCESS_INVALIDATION_MIN_MS) {
      return;
    }
    staticAccess.nodes = Object.create(null);
    staticAccess.generation += 1;
    staticAccess.reason = nextReason;
    staticAccess.lastInvalidatedAt = now;
    publishStaticAccessStats();
  }

  function cachedElement(key, queryFn, validateFn) {
    const cacheKey = String(key || "");
    const cached = staticAccess.nodes[cacheKey];
    if (cached && cached.node && cached.node.isConnected && (typeof validateFn !== "function" || validateFn(cached.node))) {
      staticAccess.hits += 1;
      publishStaticAccessStats();
      return cached.node;
    }
    staticAccess.misses += 1;
    const node = typeof queryFn === "function" ? queryFn() : null;
    staticAccess.nodes[cacheKey] = { node: node || null };
    publishStaticAccessStats();
    return node || null;
  }

  function cachedNodeList(key, queryFn, validateFn) {
    const cacheKey = String(key || "");
    const cached = staticAccess.nodes[cacheKey];
    if (
      cached &&
      Array.isArray(cached.nodes) &&
      cached.nodes.every(function nodeListEntryIsValid(node) {
        return node && node.isConnected && (typeof validateFn !== "function" || validateFn(node));
      })
    ) {
      staticAccess.hits += 1;
      publishStaticAccessStats();
      return cached.nodes;
    }
    staticAccess.misses += 1;
    const nodes = typeof queryFn === "function" ? Array.from(queryFn() || []) : [];
    staticAccess.nodes[cacheKey] = { nodes };
    publishStaticAccessStats();
    return nodes;
  }

  function staticLeftSidebar() {
    return cachedElement("leftSidebar", function queryLeftSidebar() {
      return doc.querySelector("aside.app-shell-left-panel");
    });
  }

  function staticThreadContainer() {
    return cachedElement("threadScrollContainer", function queryThreadContainer() {
      return doc.querySelector(".thread-scroll-container");
    });
  }

  function staticProjectPanel() {
    return cachedElement(
      "projectPanel",
      function queryProjectPanel() {
        return doc.querySelector(".codex-interface-theme-project-panel");
      },
      function validateProjectPanel(node) {
        return node.classList && node.classList.contains("codex-interface-theme-project-panel");
      }
    );
  }

  function staticProjectPanelChrome() {
    return cachedElement(
      "projectPanelChrome",
      function queryProjectPanelChrome() {
        return doc.querySelector(".codex-interface-theme-project-panel-frame, .codex-interface-theme-project-panel");
      },
      function validateProjectPanelChrome(node) {
        return node.classList && (
          node.classList.contains("codex-interface-theme-project-panel-frame") ||
          node.classList.contains("codex-interface-theme-project-panel")
        );
      }
    );
  }

  function staticInteractiveTargets() {
    return cachedNodeList("interactiveTargets", function queryInteractiveTargets() {
      return doc.querySelectorAll("button, [role=\"button\"], a[role=\"button\"]");
    });
  }

  function staticAriaButtonTargets() {
    return cachedNodeList("ariaButtonTargets", function queryAriaButtonTargets() {
      return doc.querySelectorAll("button[aria-label], [role=\"button\"][aria-label]");
    });
  }

  function cleanupProjectPanels() {
    doc.querySelectorAll(".codex-interface-theme-project-panel-frame").forEach(function cleanupPanelFrame(panelFrame) {
      panelFrame.classList.remove("codex-interface-theme-project-panel-frame");
    });
    doc.querySelectorAll(".codex-interface-theme-project-panel").forEach(function cleanupPanel(panel) {
      panel.classList.remove("codex-interface-theme-project-panel");
      panel.removeAttribute("data-cit-panel-kind");
    });
    doc.querySelectorAll(".codex-interface-theme-project-panel-content").forEach(function cleanupPanelContent(panelContent) {
      panelContent.classList.remove("codex-interface-theme-project-panel-content");
    });
    doc.querySelectorAll(".codex-interface-theme-project-panel-section").forEach(function cleanupSection(section) {
      section.classList.remove("codex-interface-theme-project-panel-section");
    });
    doc.querySelectorAll(".codex-interface-theme-composer-frame").forEach(function cleanupComposerFrame(composerFrame) {
      composerFrame.classList.remove("codex-interface-theme-composer-frame");
      composerFrame.style.removeProperty("--cit-composer-frame-top");
      composerFrame.style.removeProperty("--cit-composer-frame-bottom");
    });
    doc.querySelectorAll(".codex-interface-theme-composer-surface").forEach(function cleanupComposerSurface(composerSurface) {
      composerSurface.classList.remove("codex-interface-theme-composer-surface");
    });
    doc.querySelectorAll(".codex-interface-theme-composer-native-fade").forEach(function cleanupComposerNativeFade(nativeFade) {
      nativeFade.classList.remove("codex-interface-theme-composer-native-fade");
    });
    doc.querySelectorAll(".codex-interface-theme-chat-bubble").forEach(function cleanupChatBubble(chatBubble) {
      chatBubble.classList.remove("codex-interface-theme-chat-bubble");
    });
    doc.querySelectorAll(".codex-interface-theme-chat-card").forEach(function cleanupChatCard(chatCard) {
      chatCard.classList.remove("codex-interface-theme-chat-card");
    });
  }

  function findProjectPanelShell(contentNode) {
    let current = contentNode;
    while (current && current !== doc.body) {
      const rect = current.getBoundingClientRect();
      const className = String(current.className || "");
      if (
        rect.left >= window.innerWidth - 540 &&
        rect.right <= window.innerWidth - 4 &&
        rect.width >= 280 &&
        rect.width <= 340 &&
        rect.top >= 40 &&
        rect.top <= 100 &&
        className.includes("rounded-3xl") &&
        className.includes("overflow-hidden")
      ) {
        return current;
      }
      current = current.parentElement;
    }
    return contentNode;
  }

  function findProjectPanelFrame(panelNode) {
    const panelRect = panelNode.getBoundingClientRect();
    let current = panelNode.parentElement;
    let frame = panelNode;
    let depth = 0;
    while (current && current !== doc.body && depth < 5) {
      const rect = current.getBoundingClientRect();
      const className = String(current.className || "");
      const containsPanel = (
        rect.left <= panelRect.left + 1 &&
        rect.right >= panelRect.right - 1 &&
        rect.top <= panelRect.top + 1 &&
        rect.bottom >= panelRect.bottom - 1
      );
      const sizedLikeFrame = (
        rect.width >= panelRect.width &&
        rect.width <= panelRect.width + 80 &&
        rect.height >= panelRect.height &&
        rect.height <= panelRect.height + 80
      );
      if (containsPanel && sizedLikeFrame && rect.left >= window.innerWidth - 560) {
        frame = current;
      }
      current = current.parentElement;
      depth += 1;
    }
    return frame;
  }

  function installStyle() {
    let style = doc.getElementById(STYLE_ID);
    if (!style) {
      style = doc.createElement("style");
      style.id = STYLE_ID;
      style.type = "text/css";
      const parent = doc.head || root;
      parent.appendChild(style);
    }
    style.setAttribute("data-revision", revision);
    style.textContent = String(payload.css || "");
  }

  function removeLegacyBackgroundStyle() {
    const style = doc.getElementById(BACKGROUND_STYLE_ID);
    if (style) {
      style.remove();
    }
  }

  function clearBodyInlineBackground(force) {
    const body = doc.body;
    const cssText = body ? body.style.cssText : "";
    if (!body || (!force && !body.dataset.citInlineBackground && !(cssText.includes("data:image/") && cssText.includes("rgba(4, 6, 8")))) {
      return;
    }
    ["background", "background-image", "background-size", "background-position", "background-repeat", "background-attachment"].forEach(function removeBodyBackgroundProperty(propertyName) {
      body.style.removeProperty(propertyName);
    });
    delete body.dataset.citInlineBackground;
  }

  function installBodyBackgroundInline() {
    const body = doc.body;
    if (!body) {
      return;
    }
    clearBodyInlineBackground(false);
    const backgroundImage = cssUrlFromDataUrl(payload.backgroundDataUrl);
    if (backgroundImage === "none") {
      return;
    }
    const focusX = root.style.getPropertyValue("--cit-bg-focus-x") || "50.00%";
    const focusY = root.style.getPropertyValue("--cit-bg-focus-y") || "50.00%";
    const backgroundLayers = [
      "linear-gradient(180deg, rgba(12, 16, 18, 0.026), rgba(4, 6, 8, 0.155))",
      "linear-gradient(90deg, rgba(0, 0, 0, 0.08) 0%, transparent 24%, transparent 76%, rgba(0, 0, 0, 0.09) 100%)",
      backgroundImage
    ];
    body.style.setProperty("background-image", backgroundLayers.join(", "), "important");
    body.style.setProperty("background-size", "cover, cover, cover", "important");
    body.style.setProperty("background-position", "center center, center center, " + focusX + " " + focusY, "important");
    body.style.setProperty("background-repeat", "no-repeat, no-repeat, no-repeat", "important");
    body.style.setProperty("background-attachment", "scroll, scroll, scroll", "important");
    body.dataset.citInlineBackground = revision;
  }

  function installMarker() {
    let marker = doc.getElementById(MARKER_ID);
    if (!marker) {
      marker = doc.createElement("div");
      marker.id = MARKER_ID;
      marker.setAttribute("aria-hidden", "true");
      marker.setAttribute("title", "Codex Interface Theme active");
      doc.body.appendChild(marker);
    }
    marker.setAttribute("data-revision", revision);
  }

  function installBackdrop() {
    let backdrop = doc.getElementById(BACKDROP_ID);
    if (!backdrop) {
      backdrop = doc.createElement("div");
      backdrop.id = BACKDROP_ID;
      backdrop.setAttribute("aria-hidden", "true");
      doc.body.prepend(backdrop);
    }
    backdrop.setAttribute("data-revision", revision);
    backdrop.style.removeProperty("background-image");
  }

  function installRightHud() {
    let hud = doc.getElementById(RIGHT_HUD_ID);
    if (!hud) {
      hud = doc.createElement("div");
      hud.id = RIGHT_HUD_ID;
      doc.body.appendChild(hud);
    }
    let hasTableFlipFallback = String(payload.tableFlipCatDataUrl || "").startsWith("data:image/");
    let hasTableFlipSprite = String(payload.tableFlipCatSpriteDataUrl || "").startsWith("data:image/");
    const loadTableFlipCatPlayback = typeof payload.loadTableFlipCatPlayback === "function" ? payload.loadTableFlipCatPlayback : null;
    const hasTableFlipAsset = hasTableFlipSprite || hasTableFlipFallback || Boolean(loadTableFlipCatPlayback);
    const tableFlipCatTheme = icons.tableFlipCat && typeof icons.tableFlipCat === "object" ? icons.tableFlipCat : {};
    const tableFlipCatDurationMs = Math.round(clampNumber(tableFlipCatTheme.durationMs, 100, 10000, TABLE_FLIP_CAT_DEFAULT_DURATION_MS));
    const tableFlipCatFrames = Math.round(clampNumber(tableFlipCatTheme.frameCount, 2, 60, TABLE_FLIP_CAT_DEFAULT_FRAMES));
    if (!hasTableFlipAsset) {
      hud.setAttribute("aria-hidden", "true");
      hud.removeAttribute("role");
      hud.removeAttribute("tabindex");
      hud.replaceChildren();
      hud.classList.remove("codex-interface-theme-table-flip-playing");
      hud.removeAttribute("data-cit-table-flip-state");
      hud.onclick = null;
      hud.onkeydown = null;
      hud.onanimationend = null;
      delete hud.__codexInterfaceThemeMaintainTableFlipPlayback__;
      if (hud.__codexInterfaceThemeSuppressTableFlipContainerClick__) {
        hud.removeEventListener("click", hud.__codexInterfaceThemeSuppressTableFlipContainerClick__, true);
      }
      if (hud.__codexInterfaceThemeSuppressTableFlipContainerKeydown__) {
        hud.removeEventListener("keydown", hud.__codexInterfaceThemeSuppressTableFlipContainerKeydown__, true);
      }
      if (tableFlipCatTimer) {
        window.clearTimeout(tableFlipCatTimer);
        tableFlipCatTimer = null;
      }
      return;
    }
    let animated = hud.querySelector(".codex-interface-theme-table-flip-cat-animated");
    if (animated) {
      animated.remove();
      animated = null;
    }
    let triggerIcon = hud.querySelector(".codex-interface-theme-table-flip-trigger-icon");
    if (!triggerIcon) {
      triggerIcon = doc.createElement("span");
      triggerIcon.className = "codex-interface-theme-table-flip-trigger-icon";
      hud.appendChild(triggerIcon);
    }
    triggerIcon.style.setProperty("background-image", cssUrlFromDataUrl(payload.tableFlipCatTriggerIconDataUrl), "important");
    hud.classList.remove("codex-interface-theme-table-flip-playing");
    hud.setAttribute("data-cit-table-flip-state", "idle");
    hud.setAttribute("data-cit-table-flip-frame", "idle");
    hud.removeAttribute("aria-hidden");
    hud.removeAttribute("role");
    hud.removeAttribute("tabindex");
    hud.removeAttribute("aria-label");
    hud.removeAttribute("title");
    hud.setAttribute("data-revision", revision);
    hud.setAttribute("data-cit-table-flip-mode", "manual");
    hud.setAttribute("data-cit-has-trigger-icon", payload.tableFlipCatTriggerIconDataUrl ? "true" : "false");
    hud.setAttribute("data-cit-uses-sprite", hasTableFlipSprite ? "true" : "false");
    hud.setAttribute("data-cit-lazy-playback", "true");
    if (!hud.__codexInterfaceThemeSuppressTableFlipContainerClick__) {
      hud.__codexInterfaceThemeSuppressTableFlipContainerClick__ = function suppressTableFlipContainerClick(event) {
        if (event.target === hud) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
      };
    }
    if (!hud.__codexInterfaceThemeSuppressTableFlipContainerKeydown__) {
      hud.__codexInterfaceThemeSuppressTableFlipContainerKeydown__ = function suppressTableFlipContainerKeydown(event) {
        if (event.target === hud) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
      };
    }
    hud.removeEventListener("click", hud.__codexInterfaceThemeSuppressTableFlipContainerClick__, true);
    hud.addEventListener("click", hud.__codexInterfaceThemeSuppressTableFlipContainerClick__, true);
    hud.removeEventListener("keydown", hud.__codexInterfaceThemeSuppressTableFlipContainerKeydown__, true);
    hud.addEventListener("keydown", hud.__codexInterfaceThemeSuppressTableFlipContainerKeydown__, true);
    triggerIcon.setAttribute("role", "button");
    triggerIcon.setAttribute("tabindex", "0");
    triggerIcon.setAttribute("aria-label", "播放翻桌貓動畫");
    triggerIcon.setAttribute("title", "點一下播放翻桌貓");
    function stopTableFlipCatPlayback() {
      if (tableFlipCatTimer) {
        window.clearTimeout(tableFlipCatTimer);
        tableFlipCatTimer = null;
      }
      if (tableFlipCatPlaybackInterval) {
        window.clearInterval(tableFlipCatPlaybackInterval);
        tableFlipCatPlaybackInterval = null;
      }
      hud.classList.remove("codex-interface-theme-table-flip-playing");
      hud.setAttribute("data-cit-table-flip-state", "idle");
      hud.setAttribute("data-cit-table-flip-frame", "idle");
      hud.removeAttribute("data-cit-table-flip-deadline");
      const activeAnimated = animated || hud.querySelector(".codex-interface-theme-table-flip-cat-animated");
      if (activeAnimated) {
        activeAnimated.style.setProperty("background-image", "none", "important");
        activeAnimated.remove();
      }
      animated = null;
    }
    function playTableFlipCat(event) {
      if (event) {
        event.preventDefault();
        event.stopPropagation();
      }
      if (hud.getAttribute("data-cit-table-flip-state") === "playing") {
        return;
      }
      stopTableFlipCatPlayback();
      const playback = loadTableFlipCatPlayback ? loadTableFlipCatPlayback() : payload;
      const spriteDataUrl = String(playback.tableFlipCatSpriteDataUrl || "");
      const fallbackDataUrl = String(playback.tableFlipCatDataUrl || "");
      hasTableFlipSprite = spriteDataUrl.startsWith("data:image/");
      hasTableFlipFallback = fallbackDataUrl.startsWith("data:image/");
      if (!hasTableFlipSprite && !hasTableFlipFallback) {
        return;
      }
      animated = doc.createElement("span");
      animated.className = "codex-interface-theme-table-flip-cat-animated";
      animated.setAttribute("aria-hidden", "true");
      hud.insertBefore(animated, triggerIcon);
      hud.setAttribute("data-cit-uses-sprite", hasTableFlipSprite ? "true" : "false");
      animated.style.setProperty("background-image", cssUrlFromDataUrl(hasTableFlipSprite ? spriteDataUrl : fallbackDataUrl), "important");
      animated.style.setProperty("--cit-table-flip-cat-frame-index", "0");
      const playbackNode = animated;
      function releaseCompletedPlayback() {
        if (animated !== playbackNode) {
          return;
        }
        stopTableFlipCatPlayback();
      }
      playbackNode.addEventListener("animationend", releaseCompletedPlayback, { once: true });
      hud.setAttribute("data-cit-table-flip-state", "playing");
      hud.setAttribute("data-cit-table-flip-frame", hasTableFlipSprite ? "css" : "gif");
      hud.classList.add("codex-interface-theme-table-flip-playing");
      const playbackDeadline = Date.now() + tableFlipCatDurationMs + 360;
      hud.setAttribute("data-cit-table-flip-deadline", String(playbackDeadline));
      tableFlipCatPlaybackInterval = window.setInterval(function releaseFinishedTableFlipPlayback() {
        if (animated !== playbackNode) {
          window.clearInterval(tableFlipCatPlaybackInterval);
          tableFlipCatPlaybackInterval = null;
          return;
        }
        const animations = typeof playbackNode.getAnimations === "function" ? playbackNode.getAnimations() : [];
        if ((animations[0] && animations[0].playState === "finished") || Date.now() >= playbackDeadline) {
          releaseCompletedPlayback();
        }
      }, 160);
      tableFlipCatTimer = window.setTimeout(function stopTableFlipCatFallback() {
        releaseCompletedPlayback();
      }, Math.max(tableFlipCatDurationMs + 260, 700));
    }
    hud.onclick = null;
    hud.onkeydown = null;
    triggerIcon.onclick = playTableFlipCat;
    triggerIcon.onkeydown = function onTableFlipCatTriggerKeydown(event) {
      if (event.key === "Enter" || event.key === " ") {
        playTableFlipCat(event);
      }
    };
    hud.onanimationend = null;
    hud.__codexInterfaceThemeMaintainTableFlipPlayback__ = function maintainTableFlipPlayback() {
      if (hud.getAttribute("data-cit-table-flip-state") !== "playing") {
        return false;
      }
      const playbackNode = animated || hud.querySelector(".codex-interface-theme-table-flip-cat-animated");
      const animations = playbackNode && typeof playbackNode.getAnimations === "function" ? playbackNode.getAnimations() : [];
      const deadline = Number(hud.getAttribute("data-cit-table-flip-deadline") || 0);
      if (!playbackNode || (animations[0] && animations[0].playState === "finished") || (deadline > 0 && Date.now() >= deadline)) {
        stopTableFlipCatPlayback();
        return true;
      }
      return false;
    };
  }

  function maintainRightHud() {
    const hud = doc.getElementById(RIGHT_HUD_ID);
    if (hud && typeof hud.__codexInterfaceThemeMaintainTableFlipPlayback__ === "function") {
      hud.__codexInterfaceThemeMaintainTableFlipPlayback__();
    }
  }

  function installCharacter() {
    const characterTheme = icons.character && typeof icons.character === "object" ? icons.character : {};
    const characterPlacement = String(characterTheme.placement || "sidebar-hero").toLowerCase();
    const hasCharacter = String(payload.characterDataUrl || "").startsWith("data:image/");
    let character = doc.getElementById(CHARACTER_ID);
    if (!hasCharacter || characterTheme.enabled === false || characterPlacement === "off") {
      if (character) {
        character.remove();
      }
      root.dataset.citCharacter = "false";
      delete root.dataset.citCharacterPlacement;
      delete root.dataset.citCharacterRetreat;
      return;
    }
    if (!character) {
      character = doc.createElement("div");
      character.id = CHARACTER_ID;
      character.setAttribute("aria-hidden", "true");
    }
    const sidebar = staticLeftSidebar();
    const parent = doc.body;
    if (parent && character.parentElement !== parent) {
      parent.appendChild(character);
    }
    character.setAttribute("data-revision", revision);
    character.setAttribute("data-cit-character-placement", characterPlacement);
    character.style.backgroundImage = cssUrlFromDataUrl(payload.characterDataUrl);
    root.dataset.citCharacter = "true";
    root.dataset.citCharacterPlacement = characterPlacement;
  }

  function rectArea(rect) {
    if (!rect) {
      return 0;
    }
    return Math.max(0, rect.width) * Math.max(0, rect.height);
  }

  function rectIntersectionArea(leftRect, rightRect) {
    if (!leftRect || !rightRect) {
      return 0;
    }
    const width = Math.max(0, Math.min(leftRect.right, rightRect.right) - Math.max(leftRect.left, rightRect.left));
    const height = Math.max(0, Math.min(leftRect.bottom, rightRect.bottom) - Math.max(leftRect.top, rightRect.top));
    return width * height;
  }

  function isVisibleElement(node) {
    if (!node || typeof node.getBoundingClientRect !== "function") {
      return false;
    }
    const rect = node.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2 || rect.bottom < 0 || rect.top > window.innerHeight || rect.right < 0 || rect.left > window.innerWidth) {
      return false;
    }
    const style = window.getComputedStyle(node);
    return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity || "1") > 0.05;
  }

  function hasLayoutBox(node) {
    if (!node || typeof node.getBoundingClientRect !== "function") {
      return false;
    }
    const rect = node.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2 || rect.bottom < 0 || rect.top > window.innerHeight || rect.right < 0 || rect.left > window.innerWidth) {
      return false;
    }
    const style = window.getComputedStyle(node);
    return style.display !== "none" && style.visibility !== "hidden";
  }

  function hasVisibleRightSidePanel(character) {
    const characterRect = character && typeof character.getBoundingClientRect === "function"
      ? character.getBoundingClientRect()
      : null;
    const panels = Array.from(doc.querySelectorAll(".codex-interface-theme-project-panel-frame, .codex-interface-theme-project-panel"));
    for (const panel of panels) {
      if (!isVisibleElement(panel)) {
        continue;
      }
      const rect = panel.getBoundingClientRect();
      if (rect.width < 220 || rect.height < 140 || rect.right < window.innerWidth - 90) {
        continue;
      }
      const overlapsCharacter = characterRect && rectIntersectionArea(rect, characterRect) > 96;
      const wideDrawer = rect.width >= Math.min(420, window.innerWidth * 0.28);
      const intrudesIntoWorkspace = rect.left < Math.max(720, window.innerWidth * 0.72);
      if (overlapsCharacter || wideDrawer || intrudesIntoWorkspace) {
        return true;
      }
    }
    return false;
  }

  function parentElementForText(textNode) {
    let current = textNode && textNode.parentNode ? textNode.parentNode : null;
    while (current && current.nodeType !== 1) {
      current = current.parentNode;
    }
    return current;
  }

  function isTextNodeExcluded(parent) {
    return Boolean(
      !parent ||
      parent.closest("aside.app-shell-left-panel") ||
      parent.closest(".composer-surface-chrome") ||
      parent.closest(".codex-interface-theme-project-panel-frame") ||
      parent.closest(".codex-interface-theme-project-panel") ||
      parent.closest("#" + CHARACTER_ID) ||
      parent.closest("#" + RIGHT_HUD_ID) ||
      parent.closest("button") ||
      parent.closest("[role=\"button\"]") ||
      parent.closest("svg") ||
      parent.closest("script") ||
      parent.closest("style")
    );
  }

  function characterOverlapsMainText(character) {
    if (!character || !hasLayoutBox(character)) {
      return false;
    }
    const characterRect = character.getBoundingClientRect();
    const characterArea = rectArea(characterRect);
    if (characterArea < 1000) {
      return false;
    }
    const containers = Array.from(new Set(Array.from(doc.querySelectorAll(".thread-scroll-container, main, [role=\"main\"], article")).filter(isVisibleElement)));
    if (containers.length === 0 && doc.body) {
      containers.push(doc.body);
    }
    let inspected = 0;
    for (const container of containers) {
      const walker = doc.createTreeWalker(container, 4);
      let textNode = walker.nextNode();
      while (textNode && inspected < 520) {
        const text = String(textNode.textContent || "").replace(/\s+/g, " ").trim();
        const parent = parentElementForText(textNode);
        if (text.length >= 4 && !isTextNodeExcluded(parent) && isVisibleElement(parent)) {
          const range = doc.createRange();
          range.selectNodeContents(textNode);
          const rects = Array.from(range.getClientRects());
          if (typeof range.detach === "function") {
            range.detach();
          }
          for (const rect of rects) {
            if (
              rect.width < 18 ||
              rect.height < 9 ||
              rect.top < 46 ||
              rect.bottom > window.innerHeight - 74 ||
              rect.right < 220
            ) {
              continue;
            }
            const overlap = rectIntersectionArea(characterRect, rect);
            const textArea = rectArea(rect);
            if (overlap > Math.max(48, Math.min(textArea * 0.34, characterArea * 0.014))) {
              return true;
            }
          }
          inspected += 1;
        }
        textNode = walker.nextNode();
      }
      if (inspected >= 520) {
        break;
      }
    }
    return false;
  }

  function updateCharacterRetreat() {
    const character = doc.getElementById(CHARACTER_ID);
    if (!character || root.dataset.citCharacter !== "true") {
      delete root.dataset.citCharacterRetreat;
      return "off";
    }
    let reason = "none";
    const now = Date.now();
    if (hasVisibleRightSidePanel(character)) {
      reason = "side-panel";
    } else if (window.innerWidth < 980) {
      reason = "narrow";
    } else if (characterOverlapsMainText(character)) {
      reason = "text-overlap";
      characterRetreatHoldUntil = now + 480;
      scheduleCharacterRetreatCheck(500);
    } else if (characterRetreatHoldUntil > now) {
      reason = "text-overlap";
      scheduleCharacterRetreatCheck(characterRetreatHoldUntil - now + 20);
    }
    root.dataset.citCharacterRetreat = reason;
    character.setAttribute("data-cit-character-retreat", reason);
    return reason;
  }

  function scheduleCharacterRetreatCheck(delayMs) {
    if (!doc.body) {
      return;
    }
    const now = Date.now();
    const minDelay = Math.max(Number(delayMs) || 0, characterRetreatLastCheckAt + 520 - now, 0);
    if (characterRetreatCheckTimer) {
      window.clearTimeout(characterRetreatCheckTimer);
    }
    characterRetreatCheckTimer = window.setTimeout(function runScheduledCharacterRetreatCheck() {
      characterRetreatCheckTimer = null;
      characterRetreatLastCheckAt = Date.now();
      updateCharacterRetreat();
    }, minDelay);
  }

  function cleanupCharacterRetreatObserver() {
    if (characterRetreatObserver) {
      characterRetreatObserver.disconnect();
      characterRetreatObserver = null;
    }
    if (characterRetreatCheckTimer) {
      window.clearTimeout(characterRetreatCheckTimer);
      characterRetreatCheckTimer = null;
    }
    if (characterRetreatResizeHandler) {
      window.removeEventListener("resize", characterRetreatResizeHandler);
      characterRetreatResizeHandler = null;
    }
    if (characterRetreatScrollHandler) {
      window.removeEventListener("scroll", characterRetreatScrollHandler, true);
      characterRetreatScrollHandler = null;
    }
    if (window.__CODEX_INTERFACE_THEME_CHARACTER_RETREAT_CLEANUP__ === cleanupCharacterRetreatObserver) {
      delete window.__CODEX_INTERFACE_THEME_CHARACTER_RETREAT_CLEANUP__;
    }
  }

  function installCharacterRetreatObserver() {
    if (!doc.body || typeof MutationObserver !== "function") {
      return;
    }
    if (typeof window.__CODEX_INTERFACE_THEME_CHARACTER_RETREAT_CLEANUP__ === "function" && window.__CODEX_INTERFACE_THEME_CHARACTER_RETREAT_CLEANUP__ !== cleanupCharacterRetreatObserver) {
      try {
        window.__CODEX_INTERFACE_THEME_CHARACTER_RETREAT_CLEANUP__();
      } catch {
      }
    }
    cleanupCharacterRetreatObserver();
    characterRetreatObserver = new MutationObserver(function onCharacterRetreatMutation(mutations) {
      for (const mutation of mutations) {
        const target = mutation.target && mutation.target.nodeType === 1 ? mutation.target : null;
        if (target && (target.closest("#" + CHARACTER_ID) || target.closest("#" + RIGHT_HUD_ID))) {
          continue;
        }
        invalidateStaticAccess("mutation");
        scheduleCharacterRetreatCheck(160);
        scheduleProjectPanelChromeCheck(70);
        scheduleProjectPanelChromeFollowupCheck(360);
        return;
      }
    });
    characterRetreatObserver.observe(doc.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style", "hidden", "aria-expanded", "data-state", "data-open", "open"]
    });
    characterRetreatResizeHandler = function onCharacterRetreatResize() {
      invalidateStaticAccess("resize", true);
      scheduleCharacterRetreatCheck(80);
      scheduleProjectPanelChromeCheck(40);
      scheduleProjectPanelChromeFollowupCheck(300);
    };
    characterRetreatScrollHandler = function onCharacterRetreatScroll() {
      scheduleCharacterRetreatCheck(180);
    };
    window.addEventListener("resize", characterRetreatResizeHandler, { passive: true });
    window.addEventListener("scroll", characterRetreatScrollHandler, true);
    window.__CODEX_INTERFACE_THEME_CHARACTER_RETREAT_CLEANUP__ = cleanupCharacterRetreatObserver;
  }

  function installBadge() {
    const badgeTheme = icons.badge && typeof icons.badge === "object" ? icons.badge : {};
    let badge = doc.getElementById(BADGE_ID);
    const hasIcon = String(payload.iconBadgeDataUrl || "").startsWith("data:image/");
    if (!hasIcon || badgeTheme.enabled === false || String(badgeTheme.placement || "") === "off") {
      if (badge) {
        badge.remove();
      }
      root.dataset.citIconBadge = "false";
      return;
    }
    if (!badge) {
      badge = doc.createElement("div");
      badge.id = BADGE_ID;
      badge.setAttribute("aria-hidden", "true");
      badge.setAttribute("title", "Codex Interface Theme badge");
    }
    const sidebar = staticLeftSidebar();
    const parent = sidebar || doc.body;
    if (parent && badge.parentElement !== parent) {
      parent.appendChild(badge);
    }
    badge.setAttribute("data-revision", revision);
    badge.style.backgroundImage = cssUrlFromDataUrl(payload.iconBadgeDataUrl);
    root.dataset.citIconBadge = "true";
  }

  function normalizeText(value) {
    return String(value || "").replace(/\s+/g, " ").trim().toLowerCase();
  }

  function restoreNativeIconNode(node) {
    const originalStyle = node.getAttribute("data-cit-native-icon-style");
    if (originalStyle) {
      node.setAttribute("style", originalStyle);
    } else {
      node.removeAttribute("style");
    }
    node.removeAttribute("data-cit-native-icon-style");
    node.removeAttribute("data-cit-native-icon-hidden");
  }

  function cleanupButtonGlyphs() {
    doc.querySelectorAll(".cit-button-glyph").forEach(function removeGlyph(node) {
      node.remove();
    });
    doc.querySelectorAll("[data-cit-native-icon-hidden=\"true\"]").forEach(restoreNativeIconNode);
    doc.querySelectorAll("[data-cit-button-action]").forEach(function clearButtonAction(node) {
      node.classList.remove("codex-interface-theme-button-iconized");
      node.classList.remove("codex-interface-theme-button-sidebarNavigation");
      node.classList.remove("codex-interface-theme-button-titlebarNavigation");
      node.classList.remove("codex-interface-theme-button-composerControls");
      node.classList.remove("codex-interface-theme-button-topUtilityActions");
      node.classList.remove("codex-interface-theme-button-messageActions");
      node.classList.remove("codex-interface-theme-button-projectPanelRows");
      node.removeAttribute("data-cit-button-module");
      node.removeAttribute("data-cit-button-action");
    });
  }

  function cleanupButtonGlyphsForModule(moduleName) {
    const safeModuleName = String(moduleName || "").replace(/[^a-zA-Z0-9_-]/g, "");
    if (!safeModuleName) {
      return;
    }
    doc.querySelectorAll("[data-cit-button-module=\"" + safeModuleName + "\"]").forEach(function clearModuleButton(node) {
      node.querySelectorAll(":scope > .cit-button-glyph").forEach(function removeGlyph(glyph) {
        glyph.remove();
      });
      node.querySelectorAll("[data-cit-native-icon-hidden=\"true\"]").forEach(restoreNativeIconNode);
      node.classList.remove("codex-interface-theme-button-iconized");
      node.classList.remove("codex-interface-theme-button-" + safeModuleName);
      node.removeAttribute("data-cit-button-module");
      node.removeAttribute("data-cit-button-action");
    });
  }

  function cleanupWorkspacePickers() {
    workspacePickerHoldUntil = 0;
    doc.querySelectorAll(".codex-interface-theme-workspace-picker").forEach(function clearWorkspacePicker(node) {
      node.classList.remove("codex-interface-theme-workspace-picker");
      node.removeAttribute("data-cit-workspace-picker");
    });
    const legacyPlate = doc.getElementById("codex-interface-theme-workspace-picker-plate");
    if (legacyPlate) {
      legacyPlate.remove();
    }
  }

  function candidateText(target) {
    const values = [
      target.getAttribute("aria-label"),
      target.getAttribute("title"),
      target.innerText,
      target.textContent
    ];
    const seen = new Set();
    return values.map(normalizeText).filter(function uniqueText(value) {
      if (!value || seen.has(value)) {
        return false;
      }
      seen.add(value);
      return true;
    });
  }

  function matchesLabels(texts, labels) {
    const normalizedLabels = labels.map(normalizeText);
    return texts.some(function hasText(text) {
      return normalizedLabels.some(function hasLabel(label) {
        return text === label || text.startsWith(label + " ");
      });
    });
  }

  function matchesLabelPrefixes(texts, labels) {
    const normalizedLabels = labels.map(normalizeText);
    return texts.some(function hasText(text) {
      return normalizedLabels.some(function hasLabel(label) {
        return text === label || text.startsWith(label);
      });
    });
  }

  function hideNativeIcon(target) {
    const nativeIcon = target.querySelector("svg");
    if (!nativeIcon || nativeIcon.closest(".cit-button-glyph")) {
      return;
    }
    if (!nativeIcon.hasAttribute("data-cit-native-icon-hidden")) {
      nativeIcon.setAttribute("data-cit-native-icon-style", nativeIcon.getAttribute("style") || "");
    }
    nativeIcon.setAttribute("data-cit-native-icon-hidden", "true");
    nativeIcon.style.display = "none";
  }

  function addButtonGlyph(target, moduleName, actionName, iconKey) {
    const dataUrl = buttonDataUrls[iconKey];
    if (!dataUrl || !String(dataUrl).startsWith("data:image/")) {
      return false;
    }
    let glyph = target.querySelector(":scope > .cit-button-glyph");
    if (!glyph) {
      glyph = doc.createElement("span");
      glyph.className = "cit-button-glyph";
      glyph.setAttribute("aria-hidden", "true");
      target.insertBefore(glyph, target.firstChild);
    }
    glyph.setAttribute("data-cit-icon-key", iconKey);
    glyph.style.backgroundImage = cssUrlFromDataUrl(dataUrl);
    target.classList.add("codex-interface-theme-button-iconized");
    target.classList.add("codex-interface-theme-button-" + moduleName);
    target.setAttribute("data-cit-button-module", moduleName);
    target.setAttribute("data-cit-button-action", actionName);
    hideNativeIcon(target);
    return true;
  }

  function installSidebarNavigationButtons() {
    const buttonsTheme = icons.buttons && typeof icons.buttons === "object" ? icons.buttons : {};
    const buttonModules = buttonsTheme.modules && typeof buttonsTheme.modules === "object" ? buttonsTheme.modules : {};
    const sidebarModule = buttonModules.sidebarNavigation && typeof buttonModules.sidebarNavigation === "object" ? buttonModules.sidebarNavigation : {};
    if (buttonsTheme.enabled !== true || String(buttonsTheme.applyMode || "") !== "module" || sidebarModule.enabled !== true) {
      root.dataset.citButtonSidebarNavigation = "0";
      return 0;
    }
    const sidebar = staticLeftSidebar();
    if (!sidebar) {
      root.dataset.citButtonSidebarNavigation = "0";
      return 0;
    }
    const actionIcons = sidebarModule.actions && typeof sidebarModule.actions === "object" ? sidebarModule.actions : {};
    const actionLabels = {
      search: ["Search", "搜尋"],
      newTask: ["New Task", "New task", "新增任務"],
      projects: ["Projects", "Project", "專案"],
      pullRequests: ["Pull Request", "Pull Requests"],
      websites: ["Websites", "Website", "網站"],
      scheduled: ["Scheduled", "Schedule", "已排程"],
      extensions: ["Extensions", "Plugins", "外掛程式"]
    };
    const replacedActions = new Set();
    const candidates = sidebar.querySelectorAll("a, button, [role=\"button\"], [role=\"link\"]");
    candidates.forEach(function maybeReplace(target) {
      if (replacedActions.size >= Object.keys(actionLabels).length) {
        return;
      }
      const texts = candidateText(target);
      for (const [actionName, labels] of Object.entries(actionLabels)) {
        if (replacedActions.has(actionName)) {
          continue;
        }
        if (matchesLabels(texts, labels)) {
          const iconKey = actionIcons[actionName];
          if (iconKey && addButtonGlyph(target, "sidebarNavigation", actionName, iconKey)) {
            replacedActions.add(actionName);
          }
          break;
        }
      }
    });
    root.dataset.citButtonSidebarNavigation = String(replacedActions.size);
    return replacedActions.size;
  }

  function isVisibleHitTarget(target) {
    const rect = target.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return false;
    }
    const styles = window.getComputedStyle(target);
    if (styles.display === "none" || styles.visibility === "hidden" || Number(styles.opacity) === 0) {
      return false;
    }
    const hit = doc.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    return hit === target || Boolean(hit && target.contains(hit));
  }

  function installTitlebarNavigationButtons() {
    const buttonsTheme = icons.buttons && typeof icons.buttons === "object" ? icons.buttons : {};
    const buttonModules = buttonsTheme.modules && typeof buttonsTheme.modules === "object" ? buttonsTheme.modules : {};
    const titlebarModule = buttonModules.titlebarNavigation && typeof buttonModules.titlebarNavigation === "object" ? buttonModules.titlebarNavigation : {};
    if (buttonsTheme.enabled !== true || String(buttonsTheme.applyMode || "") !== "module" || titlebarModule.enabled !== true) {
      root.dataset.citButtonTitlebarNavigation = "0";
      return 0;
    }
    const actionIcons = titlebarModule.actions && typeof titlebarModule.actions === "object" ? titlebarModule.actions : {};
    const actionLabels = {
      back: ["上一步", "Back", "Go Back"],
      forward: ["向前", "Forward", "Go Forward"]
    };
    const replacedActions = new Set();
    const candidates = staticAriaButtonTargets();
    candidates.forEach(function maybeReplace(target) {
      if (replacedActions.size >= Object.keys(actionLabels).length) {
        return;
      }
      if (target.closest("aside.app-shell-left-panel")) {
        return;
      }
      const rect = target.getBoundingClientRect();
      if (rect.top < 4 || rect.top > 42 || rect.left < 32 || rect.left > 112 || rect.width > 40 || rect.height > 40) {
        return;
      }
      if (!isVisibleHitTarget(target)) {
        return;
      }
      const texts = candidateText(target);
      for (const [actionName, labels] of Object.entries(actionLabels)) {
        if (replacedActions.has(actionName)) {
          continue;
        }
        if (matchesLabels(texts, labels)) {
          const iconKey = actionIcons[actionName] || actionName;
          if (iconKey && addButtonGlyph(target, "titlebarNavigation", actionName, iconKey)) {
            replacedActions.add(actionName);
          }
          break;
        }
      }
    });
    root.dataset.citButtonTitlebarNavigation = String(replacedActions.size);
    return replacedActions.size;
  }

  function findComposerSurfaceUncached() {
    const candidates = Array.from(doc.querySelectorAll(".composer-surface-chrome"));
    let chosen = null;
    candidates.forEach(function chooseComposer(candidate) {
      const rect = candidate.getBoundingClientRect();
      if (rect.width < 320 || rect.height < 48 || rect.top < window.innerHeight - 230) {
        return;
      }
      if (!chosen || rect.top > chosen.getBoundingClientRect().top) {
        chosen = candidate;
      }
    });
    return chosen;
  }

  function findComposerSurface() {
    return cachedElement("composerSurface", findComposerSurfaceUncached, function validateComposerSurface(node) {
      const rect = node.getBoundingClientRect();
      return node.matches(".composer-surface-chrome") && rect.width >= 320 && rect.height >= 48 && rect.top >= window.innerHeight - 230;
    });
  }

  function installComposerFrame() {
    const composer = findComposerSurface();
    doc.querySelectorAll(".codex-interface-theme-composer-frame").forEach(function cleanupComposerFrame(composerFrame) {
      composerFrame.classList.remove("codex-interface-theme-composer-frame");
      composerFrame.style.removeProperty("--cit-composer-frame-top");
      composerFrame.style.removeProperty("--cit-composer-frame-bottom");
    });
    doc.querySelectorAll(".codex-interface-theme-composer-surface").forEach(function cleanupComposerSurface(composerSurface) {
      if (composerSurface !== composer) composerSurface.classList.remove("codex-interface-theme-composer-surface");
    });
    doc.querySelectorAll(".codex-interface-theme-composer-native-fade").forEach(function cleanupComposerNativeFade(nativeFade) {
      nativeFade.classList.remove("codex-interface-theme-composer-native-fade");
    });
    if (!composer) {
      root.dataset.citComposerFrame = "0";
      return 0;
    }
    composer.classList.add("codex-interface-theme-composer-surface");
    const stickyDock = composer.closest(".sticky.bottom-0");
    const nativeFade = stickyDock ? stickyDock.querySelector('[class*="bg-gradient-to-t"][class*="from-token-main-surface-primary"]') : null;
    if (nativeFade && !composer.contains(nativeFade)) {
      nativeFade.classList.add("codex-interface-theme-composer-native-fade");
    }
    root.dataset.citComposerFrame = "surface";
    return 1;
  }

  function installConversationSurfaces() {
    doc.querySelectorAll(".codex-interface-theme-chat-bubble").forEach(function cleanupChatBubble(chatBubble) {
      chatBubble.classList.remove("codex-interface-theme-chat-bubble");
    });
    doc.querySelectorAll(".codex-interface-theme-chat-card").forEach(function cleanupChatCard(chatCard) {
      chatCard.classList.remove("codex-interface-theme-chat-card");
    });
    const thread = staticThreadContainer();
    if (!thread) {
      root.dataset.citConversationSurfaces = "0";
      return 0;
    }
    const sidePanel = staticProjectPanelChrome();
    const sidePanelLeft = sidePanel ? sidePanel.getBoundingClientRect().left : window.innerWidth - 360;
    const maxBubbleWidth = Math.min(1560, Math.max(980, sidePanelLeft - 330));
    const selectors = [
      "[class*=\"bg-token-foreground/5\"][class*=\"rounded-2xl\"]",
      "[class*=\"bg-token-foreground/5\"][class*=\"rounded\"]"
    ];
    const seen = new Set();
    let marked = 0;
    selectors.forEach(function markConversationSelector(selector) {
      thread.querySelectorAll(selector).forEach(function maybeMarkSurface(node) {
        if (marked >= 32 || seen.has(node)) {
          return;
        }
        seen.add(node);
        if (
          node.closest("aside.app-shell-left-panel") ||
          node.closest(".composer-surface-chrome") ||
          node.closest(".codex-interface-theme-project-panel-frame") ||
          node.closest(".codex-interface-theme-project-panel") ||
          node.closest("button") ||
          node.closest("[role=\"button\"]") ||
          node.closest(".codex-interface-theme-chat-bubble") ||
          node.closest(".codex-interface-theme-chat-card")
        ) {
          return;
        }
        const rect = node.getBoundingClientRect();
        if (
          rect.width < 120 ||
          rect.width > maxBubbleWidth ||
          rect.height < 20 ||
          rect.height > 900 ||
          rect.top < 56 ||
          rect.top > window.innerHeight - 118 ||
          rect.left < 320 ||
          rect.right > sidePanelLeft - 18
        ) {
          return;
        }
        const text = normalizeText(node.innerText || node.textContent || "");
        if (!text) {
          return;
        }
        if (
          text.includes("已處理") ||
          text.includes("正在") ||
          text.includes("已執行") ||
          text.includes("已讀取") ||
          text.includes("已載入") ||
          text.includes("已變更") ||
          text.includes("工具") ||
          text.includes("執行指令") ||
          text.includes("讀取檔案") ||
          text.includes("edited") ||
          text.includes("changed") ||
          text.includes("running")
        ) {
          return;
        }
        const className = String(node.className || "");
        node.classList.add("codex-interface-theme-chat-bubble");
        marked += 1;
      });
    });
    root.dataset.citConversationSurfaces = String(marked);
    return marked;
  }

  function installWorkspacePickers() {
    const oldPicker = doc.querySelector(".codex-interface-theme-workspace-picker");
    doc.getElementById("codex-interface-theme-workspace-picker-plate")?.remove();
    let picker = null;
    let pickerRank = -1;
    function workspacePickerSurfaceRank(node) {
      const className = String(node && node.className || "");
      let rank = 0;
      if (node && node.matches && node.matches("[role=\"dialog\"],[role=\"menu\"],[role=\"listbox\"],[cmdk-root],[data-cmdk-root]")) {
        rank += 4;
      }
      if (/bg-token-dropdown-background/i.test(className)) {
        rank += 6;
      }
      if (/backdrop-blur|rounded|border|overflow-hidden/i.test(className)) {
        rank += 3;
      }
      if (/max-h-\[|max-h-|p-1|text-sm/i.test(className)) {
        rank += 2;
      }
      if (/absolute/i.test(className)) {
        rank -= 2;
      }
      return rank;
    }
    Array.from(doc.querySelectorAll("body > div,[role=\"dialog\"],[role=\"menu\"],[role=\"listbox\"],[cmdk-root],[data-cmdk-root],[data-radix-popper-content-wrapper],main [class*=\"bg-token-dropdown-background\"]")).forEach(function chooseWorkspacePicker(node) {
      if (!node || node.nodeType !== 1 || !hasLayoutBox(node) || node === doc.body || node === root || node.id === BACKDROP_ID || node.id === RIGHT_HUD_ID || node.id === CHARACTER_ID || node.id === BADGE_ID || node.id === MARKER_ID || node.closest("aside.app-shell-left-panel,.composer-surface-chrome,.codex-interface-theme-project-panel-frame,.codex-interface-theme-project-panel")) {
        return;
      }
      const rect = node.getBoundingClientRect();
      if (rect.width < 420 || rect.height < 116 || rect.height > Math.min(780, window.innerHeight - 80) || rect.left < 80 || rect.right > window.innerWidth - 8 || rect.top < 52 || rect.top > window.innerHeight - 120) {
        return;
      }
      const style = window.getComputedStyle(node);
      const className = String(node.className || "");
      if (style.position === "static" && !node.getAttribute("role") && !/(fixed|absolute|popover|cmdk|rounded|border)/i.test(className)) {
        return;
      }
      const hasMenuStructure = Boolean(node.matches("[role=\"dialog\"],[role=\"menu\"],[role=\"listbox\"],[cmdk-root],[data-cmdk-root]") || node.querySelector("[role=\"option\"],[role=\"menuitem\"],[cmdk-item],[data-cmdk-item],[role=\"listbox\"],[role=\"menu\"]"));
      const interactiveCount = node.querySelectorAll("button,[role=\"button\"],[role=\"option\"],[role=\"menuitem\"],a,[tabindex],[cmdk-item],[data-cmdk-item]").length;
      if (!hasMenuStructure && interactiveCount < 2) {
        return;
      }
      const text = normalizeText(node.innerText || node.textContent || "");
      if (text.length < 10 || text.length > 5200) {
        return;
      }
      if (/已處理|正在思考|已執行|已讀取|驗證通過|runtime gate|revision|重疊|消失/.test(text)) {
        return;
      }
      let score = 0;
      "新增|附加|google chrome|chrome|目標|規劃模式|外掛程式|documents|pdf|spreadsheets|presentations".split("|").forEach(function countPickerTerm(term) {
        if (text.includes(term)) {
          score += 1;
        }
      });
      if ((text.includes("documents") && text.includes("pdf")) || (text.includes("spreadsheets") && text.includes("presentations")) || (text.includes("附加") && (text.includes("目標") || text.includes("規劃模式")))) {
        score += 3;
      }
      if (score < 5) {
        return;
      }
      const rank = workspacePickerSurfaceRank(node);
      if (!picker || rank > pickerRank || (rank === pickerRank && rectArea(node.getBoundingClientRect()) > rectArea(picker.getBoundingClientRect()))) {
        picker = node;
        pickerRank = rank;
      }
    });
    if (!picker) {
      if (oldPicker && Date.now() < workspacePickerHoldUntil) { root.dataset.citWorkspacePickers = "holding"; return 1; }
      if (oldPicker) cleanupWorkspacePickers();
      root.dataset.citWorkspacePickers = "0";
      return 0;
    }
    if (oldPicker && oldPicker !== picker) cleanupWorkspacePickers();
    workspacePickerHoldUntil = Date.now() + 1400;
    picker.classList.add("codex-interface-theme-workspace-picker");
    picker.setAttribute("data-cit-workspace-picker", "shell");
    root.dataset.citWorkspacePickers = "1";
    return 1;
  }

  function triggerWorkspacePickerChecks() {
    if (workspacePickerCheckTimer) {
      window.clearTimeout(workspacePickerCheckTimer);
    }
    workspacePickerCheckTimer = window.setTimeout(function checkPicker() {
      workspacePickerCheckTimer = null;
      installWorkspacePickers();
      window.setTimeout(installWorkspacePickers, 260);
      window.setTimeout(installWorkspacePickers, 720);
    }, 120);
  }

  function installWorkspacePickerEventHooks() {
    if (workspacePickerTriggerHandler) {
      return;
    }
    workspacePickerTriggerHandler = triggerWorkspacePickerChecks;
    ["pointerdown", "click", "keydown", "focusin"].forEach(function addPickerHook(eventName) {
      doc.addEventListener(eventName, workspacePickerTriggerHandler, true);
    });
  }

  function cleanupWorkspacePickerEventHooks() {
    if (workspacePickerCheckTimer) {
      window.clearTimeout(workspacePickerCheckTimer);
      workspacePickerCheckTimer = null;
    }
    if (workspacePickerTriggerHandler) {
      ["pointerdown", "click", "keydown", "focusin"].forEach(function removePickerHook(eventName) {
        doc.removeEventListener(eventName, workspacePickerTriggerHandler, true);
      });
      workspacePickerTriggerHandler = null;
    }
    cleanupWorkspacePickers();
    root.dataset.citWorkspacePickers = "0";
  }

  function installComposerControlButtons() {
    const buttonsTheme = icons.buttons && typeof icons.buttons === "object" ? icons.buttons : {};
    const buttonModules = buttonsTheme.modules && typeof buttonsTheme.modules === "object" ? buttonsTheme.modules : {};
    const composerModule = buttonModules.composerControls && typeof buttonModules.composerControls === "object" ? buttonModules.composerControls : {};
    if (buttonsTheme.enabled !== true || String(buttonsTheme.applyMode || "") !== "module" || composerModule.enabled !== true) {
      root.dataset.citButtonComposerControls = "0";
      return 0;
    }
    const composer = findComposerSurface();
    if (!composer) {
      root.dataset.citButtonComposerControls = "0";
      return 0;
    }
    const actionIcons = composerModule.actions && typeof composerModule.actions === "object" ? composerModule.actions : {};
    const actionLabels = {
      run: ["代我核准", "Run", "Approve"],
      stop: ["停止", "停止產生", "Stop", "Stop generating"],
      send: ["送出", "送出訊息", "Send", "Send message", "Submit"]
    };
    const replacedActions = new Set();
    const candidates = composer.querySelectorAll("button, [role=\"button\"]");
    candidates.forEach(function maybeReplace(target) {
      if (replacedActions.size >= Object.keys(actionLabels).length) {
        return;
      }
      if (!isVisibleHitTarget(target)) {
        return;
      }
      const texts = candidateText(target);
      for (const [actionName, labels] of Object.entries(actionLabels)) {
        if (replacedActions.has(actionName)) {
          continue;
        }
        if (matchesLabels(texts, labels)) {
          const iconKey = actionIcons[actionName] || actionName;
          if (iconKey && addButtonGlyph(target, "composerControls", actionName, iconKey)) {
            replacedActions.add(actionName);
          }
          break;
        }
      }
    });
    if (!replacedActions.has("stop") && !replacedActions.has("send")) {
      const composerRect = composer.getBoundingClientRect();
      let primaryAction = null;
      candidates.forEach(function findPrimaryAction(target) {
        if (!isVisibleHitTarget(target)) {
          return;
        }
        const rect = target.getBoundingClientRect();
        if (rect.width > 42 || rect.height > 42 || rect.left < composerRect.right - 150) {
          return;
        }
        const texts = candidateText(target);
        if (matchesLabels(texts, ["聽寫", "Dictate", "Voice input"])) {
          return;
        }
        if (target.querySelector(".cit-button-glyph")) {
          return;
        }
        if (!primaryAction || rect.left > primaryAction.getBoundingClientRect().left) {
          primaryAction = target;
        }
      });
      if (primaryAction) {
        const texts = candidateText(primaryAction);
        const actionName = matchesLabels(texts, actionLabels.stop) ? "stop" : "send";
        const iconKey = actionIcons[actionName] || actionName;
        if (iconKey && addButtonGlyph(primaryAction, "composerControls", actionName, iconKey)) {
          replacedActions.add(actionName);
        }
      }
    }
    root.dataset.citButtonComposerControls = String(replacedActions.size);
    return replacedActions.size;
  }

  function installTopUtilityActionButtons() {
    const buttonsTheme = icons.buttons && typeof icons.buttons === "object" ? icons.buttons : {};
    const buttonModules = buttonsTheme.modules && typeof buttonsTheme.modules === "object" ? buttonsTheme.modules : {};
    const topUtilityModule = buttonModules.topUtilityActions && typeof buttonModules.topUtilityActions === "object" ? buttonModules.topUtilityActions : {};
    if (buttonsTheme.enabled !== true || String(buttonsTheme.applyMode || "") !== "module" || topUtilityModule.enabled !== true) {
      root.dataset.citButtonTopUtilityActions = "0";
      return 0;
    }
    const actionIcons = topUtilityModule.actions && typeof topUtilityModule.actions === "object" ? topUtilityModule.actions : {};
    const actionLabels = {
      projectContext: { labels: ["專案：", "Project:"], prefix: true },
      taskActions: { labels: ["任務動作", "Task actions"], prefix: false },
      summaryToggle: { labels: ["切換摘要", "Toggle summary"], prefix: false },
      sideTab: { labels: ["開啟側邊面板分頁", "Open side panel tab"], prefix: false },
      expandPanel: { labels: ["展開面板", "Expand panel"], prefix: false },
      bottomPanel: { labels: ["切換底部面板", "Toggle bottom panel"], prefix: false },
      sidePanel: { labels: ["切換側邊面板", "Toggle side panel"], prefix: false },
      sourceView: { labels: ["查看原始碼", "View source"], prefix: false },
      fileTree: { labels: ["切換檔案樹", "Toggle file tree"], prefix: false },
      openExternal: { labels: ["在 VS Code 中開啟", "Open in VS Code"], prefix: false },
      openOptions: { labels: ["開啟選項", "Open options"], prefix: false }
    };
    const replacedActions = new Set();
    const candidates = staticInteractiveTargets();
    candidates.forEach(function maybeReplace(target) {
      if (replacedActions.size >= Object.keys(actionLabels).length) {
        return;
      }
      if (target.closest("aside.app-shell-left-panel") || target.closest(".composer-surface-chrome")) {
        return;
      }
      if (!isVisibleHitTarget(target)) {
        return;
      }
      const rect = target.getBoundingClientRect();
      if (rect.top < 0 || rect.top > 92 || rect.left < 284 || rect.width > 124 || rect.height > 40) {
        return;
      }
      const texts = candidateText(target);
      for (const [actionName, definition] of Object.entries(actionLabels)) {
        if (replacedActions.has(actionName)) {
          continue;
        }
        const matched = definition.prefix
          ? matchesLabelPrefixes(texts, definition.labels)
          : matchesLabels(texts, definition.labels);
        if (matched) {
          const iconKey = actionIcons[actionName] || actionName;
          if (iconKey && addButtonGlyph(target, "topUtilityActions", actionName, iconKey)) {
            replacedActions.add(actionName);
          }
          break;
        }
      }
    });
    root.dataset.citButtonTopUtilityActions = String(replacedActions.size);
    return replacedActions.size;
  }

  function installMessageActionButtons() {
    const buttonsTheme = icons.buttons && typeof icons.buttons === "object" ? icons.buttons : {};
    const buttonModules = buttonsTheme.modules && typeof buttonsTheme.modules === "object" ? buttonsTheme.modules : {};
    const messageModule = buttonModules.messageActions && typeof buttonModules.messageActions === "object" ? buttonModules.messageActions : {};
    if (buttonsTheme.enabled !== true || String(buttonsTheme.applyMode || "") !== "module" || messageModule.enabled !== true) {
      root.dataset.citButtonMessageActions = "0";
      return 0;
    }
    const actionIcons = messageModule.actions && typeof messageModule.actions === "object" ? messageModule.actions : {};
    const actionLabels = {
      copyMessage: ["複製訊息", "複製", "Copy message", "Copy"],
      goodResponse: ["良好回覆", "Good response"],
      badResponse: ["不佳回覆", "Bad response"],
      continueTask: ["從此處繼續到新工作", "Continue from here in new task"],
      guide: ["引導", "Guide"],
      deleteAction: ["刪除", "Delete"],
      moreActions: ["更多", "More actions", "More"],
      scrollBottom: ["捲動至底部", "Scroll to bottom"]
    };
    const sidePanel = staticProjectPanel();
    const sidePanelRect = sidePanel ? sidePanel.getBoundingClientRect() : null;
    const rightBound = sidePanelRect && sidePanelRect.left > 0 ? sidePanelRect.left - 20 : window.innerWidth - 64;
    let replaced = 0;
    const candidates = staticInteractiveTargets();
    candidates.forEach(function maybeReplace(target) {
      if (replaced >= 28) {
        return;
      }
      if (
        target.closest("aside.app-shell-left-panel") ||
        target.closest(".composer-surface-chrome") ||
        target.closest(".codex-interface-theme-project-panel") ||
        target.getAttribute("data-cit-button-module") === "topUtilityActions"
      ) {
        return;
      }
      if (!isVisibleHitTarget(target)) {
        return;
      }
      const rect = target.getBoundingClientRect();
      if (rect.top < 80 || rect.top > window.innerHeight - 86 || rect.left < 320 || rect.left > rightBound || rect.width > 96 || rect.height > 44) {
        return;
      }
      const texts = candidateText(target);
      for (const [actionName, labels] of Object.entries(actionLabels)) {
        if (matchesLabels(texts, labels)) {
          const iconKey = actionIcons[actionName] || actionName;
          if (iconKey && addButtonGlyph(target, "messageActions", actionName, iconKey)) {
            replaced += 1;
          }
          break;
        }
      }
    });
    root.dataset.citButtonMessageActions = String(replaced);
    return replaced;
  }

  function hasVisibleUnreplacedMessageActionButton() {
    const buttonsTheme = icons.buttons && typeof icons.buttons === "object" ? icons.buttons : {};
    const buttonModules = buttonsTheme.modules && typeof buttonsTheme.modules === "object" ? buttonsTheme.modules : {};
    const messageModule = buttonModules.messageActions && typeof buttonModules.messageActions === "object" ? buttonModules.messageActions : {};
    if (buttonsTheme.enabled !== true || String(buttonsTheme.applyMode || "") !== "module" || messageModule.enabled !== true) {
      return false;
    }
    const labels = [
      "複製訊息", "複製", "Copy message", "Copy",
      "良好回覆", "Good response",
      "不佳回覆", "Bad response",
      "從此處繼續到新工作", "Continue from here in new task",
      "引導", "Guide",
      "刪除", "Delete",
      "更多", "More actions", "More",
      "捲動至底部", "Scroll to bottom"
    ];
    const sidePanel = staticProjectPanel();
    const sidePanelRect = sidePanel ? sidePanel.getBoundingClientRect() : null;
    const rightBound = sidePanelRect && sidePanelRect.left > 0 ? sidePanelRect.left - 20 : window.innerWidth - 64;
    const candidates = staticInteractiveTargets();
    for (const target of candidates) {
      if (target.getAttribute("data-cit-button-module") === "messageActions" || target.querySelector(":scope > .cit-button-glyph")) {
        continue;
      }
      if (
        target.closest("aside.app-shell-left-panel") ||
        target.closest(".composer-surface-chrome") ||
        target.closest(".codex-interface-theme-project-panel") ||
        target.getAttribute("data-cit-button-module") === "topUtilityActions"
      ) {
        continue;
      }
      if (!isVisibleHitTarget(target)) {
        continue;
      }
      const rect = target.getBoundingClientRect();
      if (rect.top < 80 || rect.top > window.innerHeight - 86 || rect.left < 320 || rect.left > rightBound || rect.width > 96 || rect.height > 44) {
        continue;
      }
      if (matchesLabels(candidateText(target), labels)) {
        return true;
      }
    }
    return false;
  }

  function projectPanelRowAction(target) {
    const texts = candidateText(target);
    const joined = texts.join(" ");
    const section = target.closest(".codex-interface-theme-project-panel-section");
    const sectionText = normalizeText(section ? section.innerText || section.textContent || "" : "");
    if (matchesLabels(texts, ["查看全部", "View all", "Show all"])) {
      return "viewAll";
    }
    if (joined.includes("無法取得") || joined.includes("pull request status") || joined.includes("failed")) {
      return "statusRow";
    }
    if (sectionText.includes("子代理") || sectionText.includes("agents") || /maxwell|archimedes|aristotle/i.test(joined)) {
      return "agentRow";
    }
    if (sectionText.includes("輸出內容") || sectionText.includes("outputs") || /\.(md|json|csv|tsv|txt|png|jpg|jpeg|html)\b/i.test(joined)) {
      return "outputRow";
    }
    if (sectionText.includes("來源") || sectionText.includes("source") || joined.includes("-----") || joined.includes("/")) {
      return "sourceRow";
    }
    if (sectionText.includes("環境") || sectionText.includes("environment") || matchesLabels(texts, ["變更", "本機", "送交或推送", "Changes", "Local", "Send or push"])) {
      return "environmentRow";
    }
    return "";
  }

  function projectPanelRowTargets(panel) {
    const rows = [];
    const seen = new Set();
    const candidates = cachedNodeList(
      "projectPanelRowCandidates",
      function queryProjectPanelRowCandidates() {
        return panel.querySelectorAll(".group\\/summary-panel-item, button, [role=\"button\"], [role=\"listitem\"], a");
      },
      function validateProjectPanelRowCandidate(node) {
        return panel.contains(node);
      }
    );
    candidates.forEach(function collectRow(target) {
      const row = target.closest(".group\\/summary-panel-item") || target;
      if (seen.has(row)) {
        return;
      }
      seen.add(row);
      rows.push(row);
    });
    return rows;
  }

  function installProjectPanelRowButtons() {
    const buttonsTheme = icons.buttons && typeof icons.buttons === "object" ? icons.buttons : {};
    const buttonModules = buttonsTheme.modules && typeof buttonsTheme.modules === "object" ? buttonsTheme.modules : {};
    const panelRowsModule = buttonModules.projectPanelRows && typeof buttonModules.projectPanelRows === "object" ? buttonModules.projectPanelRows : {};
    if (buttonsTheme.enabled !== true || String(buttonsTheme.applyMode || "") !== "module" || panelRowsModule.enabled !== true) {
      root.dataset.citButtonProjectPanelRows = "0";
      return 0;
    }
    const panel = staticProjectPanel();
    if (!panel) {
      root.dataset.citButtonProjectPanelRows = "0";
      return 0;
    }
    const actionIcons = panelRowsModule.actions && typeof panelRowsModule.actions === "object" ? panelRowsModule.actions : {};
    let replaced = 0;
    projectPanelRowTargets(panel).forEach(function maybeReplaceRow(target) {
      if (replaced >= 28) {
        return;
      }
      if (target.closest(".group\\/section-toggle") || target.classList.contains("group/section-toggle")) {
        return;
      }
      if (target.querySelector(":scope > .cit-button-glyph")) {
        return;
      }
      const rect = target.getBoundingClientRect();
      if (rect.width < 40 || rect.height < 20 || rect.height > 44) {
        return;
      }
      if (!isVisibleHitTarget(target)) {
        return;
      }
      const actionName = projectPanelRowAction(target);
      if (!actionName) {
        return;
      }
      const iconKey = actionIcons[actionName] || actionName;
      if (iconKey && addButtonGlyph(target, "projectPanelRows", actionName, iconKey)) {
        replaced += 1;
      }
    });
    root.dataset.citButtonProjectPanelRows = String(replaced);
    return replaced;
  }

  function hasVisibleUnreplacedProjectPanelRow() {
    const buttonsTheme = icons.buttons && typeof icons.buttons === "object" ? icons.buttons : {};
    const buttonModules = buttonsTheme.modules && typeof buttonsTheme.modules === "object" ? buttonsTheme.modules : {};
    const panelRowsModule = buttonModules.projectPanelRows && typeof buttonModules.projectPanelRows === "object" ? buttonModules.projectPanelRows : {};
    if (buttonsTheme.enabled !== true || String(buttonsTheme.applyMode || "") !== "module" || panelRowsModule.enabled !== true) {
      return false;
    }
    const panel = staticProjectPanel();
    if (!panel) {
      return false;
    }
    for (const target of projectPanelRowTargets(panel)) {
      if (target.getAttribute("data-cit-button-module") === "projectPanelRows" || target.querySelector(":scope > .cit-button-glyph")) {
        continue;
      }
      if (target.closest(".group\\/section-toggle") || target.classList.contains("group/section-toggle")) {
        continue;
      }
      const rect = target.getBoundingClientRect();
      if (rect.width < 40 || rect.height < 20 || rect.height > 44) {
        continue;
      }
      if (!isVisibleHitTarget(target)) {
        continue;
      }
      if (projectPanelRowAction(target)) {
        return true;
      }
    }
    return false;
  }

  function isThemeOrPrimaryWorkspaceNode(node) {
    return Boolean(
      !node ||
      node === root ||
      node === doc.body ||
      node.closest("aside.app-shell-left-panel") ||
      node.closest(".thread-scroll-container") ||
      node.closest(".composer-surface-chrome") ||
      node.closest("#" + BACKDROP_ID) ||
      node.closest("#" + RIGHT_HUD_ID) ||
      node.closest("#" + CHARACTER_ID) ||
      node.closest("#" + BADGE_ID) ||
      node.closest("#" + MARKER_ID)
    );
  }

  function findRightMajorPanelRect() {
    if (!doc.body || window.innerWidth < 980) {
      return null;
    }
    const minWidth = Math.max(520, window.innerWidth * 0.34);
    const minHeight = Math.max(360, window.innerHeight * 0.56);
    let chosen = null;
    const candidates = doc.querySelectorAll("aside, section, div");
    for (const node of candidates) {
      if (isThemeOrPrimaryWorkspaceNode(node) || !hasLayoutBox(node)) {
        continue;
      }
      const rect = node.getBoundingClientRect();
      if (
        rect.width < minWidth ||
        rect.height < minHeight ||
        rect.left < window.innerWidth * 0.38 ||
        rect.right < window.innerWidth - 18 ||
        rect.top > 88 ||
        rect.bottom < window.innerHeight * 0.72
      ) {
        continue;
      }
      const text = normalizeText(node.innerText || node.textContent || "");
      const looksLikeAttachmentColumn = (
        text.includes("來源") ||
        text.includes("source") ||
        text.includes("已附加至對話") ||
        text.includes("attached to chat") ||
        text.includes("/users/") ||
        /\.(png|mov|jpg|jpeg|gif|webp|md|json|csv|txt)\b/i.test(text)
      );
      const hasStrongRightColumnGeometry = rect.width >= Math.max(760, window.innerWidth * 0.44) && rect.left >= window.innerWidth * 0.45;
      if (!looksLikeAttachmentColumn && !hasStrongRightColumnGeometry) {
        continue;
      }
      if (!chosen || rect.width * rect.height > chosen.width * chosen.height) {
        chosen = rect;
      }
    }
    return chosen;
  }

  function projectPanelChromeCollidesWithLargeRightColumn() {
    const projectPanel = staticProjectPanelChrome();
    if (!projectPanel || !hasLayoutBox(projectPanel) || window.innerWidth < 980) {
      return false;
    }
    const projectRect = projectPanel.getBoundingClientRect();
    const projectArea = rectArea(projectRect);
    if (projectArea < 12000) {
      return false;
    }
    const minWidth = Math.max(440, window.innerWidth * 0.24);
    const minHeight = Math.max(320, window.innerHeight * 0.46);
    const candidates = doc.querySelectorAll("aside, section, div");
    for (const node of candidates) {
      if (
        node === projectPanel ||
        node.contains(projectPanel) ||
        projectPanel.contains(node) ||
        isThemeOrPrimaryWorkspaceNode(node) ||
        !hasLayoutBox(node)
      ) {
        continue;
      }
      const rect = node.getBoundingClientRect();
      if (
        rect.width < minWidth ||
        rect.height < minHeight ||
        rect.left < window.innerWidth * 0.38 ||
        rect.right < window.innerWidth - 18 ||
        rect.top > 112 ||
        rect.bottom < window.innerHeight * 0.68
      ) {
        continue;
      }
      const overlap = rectIntersectionArea(projectRect, rect);
      if (overlap > Math.max(1200, projectArea * 0.14)) {
        return true;
      }
    }
    return false;
  }

  function hasRightMajorPanelOpen() {
    return Boolean(findRightMajorPanelRect() || projectPanelChromeCollidesWithLargeRightColumn());
  }

  function suppressProjectPanelChromeForRightMajorPanel(mode) {
    const state = String(mode || "detected");
    cleanupProjectPanels();
    cleanupButtonGlyphsForModule("projectPanelRows");
    root.dataset.citRightMajorPanel = state === "pending" ? "pending" : "true";
    root.dataset.citProjectPanels = state === "pending" ? "pending-right-trigger" : "hidden-by-major-right-panel";
    root.dataset.citButtonProjectPanelRows = "0";
    return 0;
  }

  function installProjectPanelChrome() {
    cleanupProjectPanels();
    if (hasRightMajorPanelOpen()) {
      return suppressProjectPanelChromeForRightMajorPanel();
    }
    if (Date.now() < projectPanelChromePendingUntil) {
      return suppressProjectPanelChromeForRightMajorPanel("pending");
    }
    root.dataset.citRightMajorPanel = "false";
    const candidates = Array.from(doc.querySelectorAll("div")).filter(function isPanelCandidate(node) {
      const rect = node.getBoundingClientRect();
      if (rect.width < 240 || rect.width > 420 || rect.height < 150 || rect.height > window.innerHeight - 24) {
        return false;
      }
      if (rect.left < window.innerWidth - 520 || rect.right > window.innerWidth - 4 || rect.top < 36 || rect.top > 140) {
        return false;
      }
      const text = normalizeText(node.innerText || node.textContent || "");
      const hasPanelLanguage = (
        text.includes("來源") ||
        text.includes("輸出內容") ||
        text.includes("環境") ||
        text.includes("子代理") ||
        text.includes("查看全部") ||
        text.includes("source") ||
        text.includes("environment") ||
        text.includes("outputs")
      );
      if (!hasPanelLanguage) {
        return false;
      }
      return node.querySelector("section, [role=\"list\"], button, [role=\"listitem\"]");
    });
    let content = null;
    candidates.forEach(function choosePanel(candidate) {
      if (!content) {
        content = candidate;
        return;
      }
      const currentRect = content.getBoundingClientRect();
      const candidateRect = candidate.getBoundingClientRect();
      if (candidateRect.width <= currentRect.width && candidateRect.height <= currentRect.height) {
        content = candidate;
      }
    });
    if (!content) {
      root.dataset.citProjectPanels = "0";
      return 0;
    }
    const panel = findProjectPanelShell(content);
    const frame = findProjectPanelFrame(panel);
    frame.classList.add("codex-interface-theme-project-panel-frame");
    panel.classList.add("codex-interface-theme-project-panel");
    panel.setAttribute("data-cit-panel-kind", "resource-summary");
    if (content !== panel) {
      content.classList.add("codex-interface-theme-project-panel-content");
    }
    content.querySelectorAll("section").forEach(function markSection(section) {
      section.classList.add("codex-interface-theme-project-panel-section");
    });
    const sectionCount = content.querySelectorAll(".codex-interface-theme-project-panel-section").length;
    root.dataset.citProjectPanels = String(Math.max(1, sectionCount));
    return Math.max(1, sectionCount);
  }

  function installButtonGlyphs() {
    cleanupButtonGlyphs();
    const buttonsTheme = icons.buttons && typeof icons.buttons === "object" ? icons.buttons : {};
    if (buttonsTheme.enabled !== true || String(buttonsTheme.applyMode || "") !== "module") {
      root.dataset.citButtonIcons = "false";
      root.dataset.citButtonSidebarNavigation = "0";
      root.dataset.citButtonTitlebarNavigation = "0";
      root.dataset.citButtonComposerControls = "0";
      root.dataset.citButtonTopUtilityActions = "0";
      root.dataset.citButtonMessageActions = "0";
      root.dataset.citButtonProjectPanelRows = "0";
      return;
    }
    const replaced = installSidebarNavigationButtons() + installTitlebarNavigationButtons() + installComposerControlButtons() + installTopUtilityActionButtons() + installMessageActionButtons() + installProjectPanelRowButtons();
    root.dataset.citButtonIcons = replaced > 0 ? "true" : "false";
  }

  function maintainButtonGlyphs() {
    const buttonsTheme = icons.buttons && typeof icons.buttons === "object" ? icons.buttons : {};
    if (buttonsTheme.enabled !== true || String(buttonsTheme.applyMode || "") !== "module") {
      return;
    }
    const sidebarExpected = Number(root.dataset.citButtonSidebarNavigation || "0");
    const titlebarExpected = Number(root.dataset.citButtonTitlebarNavigation || "0");
    const composerExpected = Number(root.dataset.citButtonComposerControls || "0");
    const topUtilityExpected = Number(root.dataset.citButtonTopUtilityActions || "0");
    const messageExpected = Number(root.dataset.citButtonMessageActions || "0");
    const projectPanelRowsExpected = Number(root.dataset.citButtonProjectPanelRows || "0");
    const sidebarActual = doc.querySelectorAll("[data-cit-button-module=\"sidebarNavigation\"] .cit-button-glyph").length;
    const titlebarActual = doc.querySelectorAll("[data-cit-button-module=\"titlebarNavigation\"] .cit-button-glyph").length;
    const composerActual = doc.querySelectorAll("[data-cit-button-module=\"composerControls\"] .cit-button-glyph").length;
    const topUtilityActual = doc.querySelectorAll("[data-cit-button-module=\"topUtilityActions\"] .cit-button-glyph").length;
    const messageActual = doc.querySelectorAll("[data-cit-button-module=\"messageActions\"] .cit-button-glyph").length;
    const projectPanelRowsActual = doc.querySelectorAll("[data-cit-button-module=\"projectPanelRows\"] .cit-button-glyph").length;
    if (
      sidebarActual !== sidebarExpected ||
      titlebarActual !== titlebarExpected ||
      composerActual !== composerExpected ||
      topUtilityActual !== topUtilityExpected ||
      messageActual !== messageExpected ||
      projectPanelRowsActual !== projectPanelRowsExpected ||
      hasVisibleUnreplacedMessageActionButton() ||
      hasVisibleUnreplacedProjectPanelRow()
    ) {
      installButtonGlyphs();
    }
  }

  function maintainProjectPanelChrome() {
    if (hasRightMajorPanelOpen()) {
      suppressProjectPanelChromeForRightMajorPanel();
      return;
    }
    if (Date.now() < projectPanelChromePendingUntil) {
      suppressProjectPanelChromeForRightMajorPanel("pending");
      return;
    }
    root.dataset.citRightMajorPanel = "false";
    const expectedRaw = root.dataset.citProjectPanels || "0";
    const expected = Number(expectedRaw);
    const actual = doc.querySelectorAll(".codex-interface-theme-project-panel").length;
    if (expectedRaw === "hidden-by-major-right-panel" || expectedRaw === "pending-right-trigger" || !Number.isFinite(expected) || expected === 0 || actual === 0) {
      installProjectPanelChrome();
    }
  }

  function scheduleProjectPanelChromeCheck(delayMs) {
    if (!doc.body) {
      return;
    }
    const now = Date.now();
    const minDelay = Math.max(Number(delayMs) || 0, projectPanelChromeLastCheckAt + 120 - now, 0);
    if (projectPanelChromeCheckTimer) {
      window.clearTimeout(projectPanelChromeCheckTimer);
    }
    projectPanelChromeCheckTimer = window.setTimeout(function runScheduledProjectPanelChromeCheck() {
      projectPanelChromeCheckTimer = null;
      projectPanelChromeLastCheckAt = Date.now();
      maintainProjectPanelChrome();
      updateCharacterRetreat();
    }, minDelay);
  }

  function scheduleProjectPanelChromeFollowupCheck(delayMs) {
    if (!doc.body) {
      return;
    }
    if (projectPanelChromeFollowupTimer) {
      window.clearTimeout(projectPanelChromeFollowupTimer);
    }
    projectPanelChromeFollowupTimer = window.setTimeout(function runProjectPanelChromeFollowupCheck() {
      projectPanelChromeFollowupTimer = null;
      projectPanelChromeLastCheckAt = Date.now();
      maintainProjectPanelChrome();
      updateCharacterRetreat();
    }, Math.max(Number(delayMs) || 0, 260));
  }

  function isRightMajorPanelTriggerEvent(event) {
    const rawTarget = event && event.target && event.target.nodeType === 1 ? event.target : null;
    if (!rawTarget) {
      return false;
    }
    const target = rawTarget.closest("button, [role=\"button\"], a, [aria-label], [title]");
    if (!target || isProjectPanelChromeMutationIgnored(target)) {
      return false;
    }
    if (
      target.closest("aside.app-shell-left-panel") ||
      target.closest(".composer-surface-chrome") ||
      target.closest(".codex-interface-theme-project-panel-frame") ||
      target.closest(".codex-interface-theme-project-panel")
    ) {
      return false;
    }
    const rect = target.getBoundingClientRect();
    if (
      rect.width < 18 ||
      rect.height < 18 ||
      rect.width > 96 ||
      rect.height > 72 ||
      rect.top > 76 ||
      rect.left < window.innerWidth * 0.48 ||
      rect.right < window.innerWidth - 280
    ) {
      return false;
    }
    const text = candidateText(target).join(" ");
    const explicitPanelLabel = /來源|source|side|panel|sidebar|側邊|面板|附件|attached|檔案|files/i.test(text);
    const compactTopRightUtility = rect.top <= 58 && rect.right >= window.innerWidth - 180;
    return explicitPanelLabel || compactTopRightUtility;
  }

  function triggerProjectPanelChromePreflight() {
    invalidateStaticAccess("right-trigger", true);
    projectPanelChromePendingUntil = Date.now() + 980;
    suppressProjectPanelChromeForRightMajorPanel("pending");
    scheduleProjectPanelChromeCheck(40);
    scheduleProjectPanelChromeFollowupCheck(220);
    window.setTimeout(function runLateProjectPanelChromePreflightCheck() {
      maintainProjectPanelChrome();
      updateCharacterRetreat();
    }, 760);
    window.setTimeout(function clearProjectPanelChromePreflightCheck() {
      if (Date.now() >= projectPanelChromePendingUntil && !hasRightMajorPanelOpen()) {
        projectPanelChromePendingUntil = 0;
        maintainProjectPanelChrome();
        updateCharacterRetreat();
      }
    }, 1040);
  }

  function isProjectPanelChromeMutationIgnored(target) {
    return Boolean(
      !target ||
      target.closest("#" + BACKDROP_ID) ||
      target.closest("#" + RIGHT_HUD_ID) ||
      target.closest("#" + CHARACTER_ID) ||
      target.closest("#" + BADGE_ID) ||
      target.closest("#" + MARKER_ID)
    );
  }

  function cleanupProjectPanelChromeEventHooks() {
    if (projectPanelChromeCheckTimer) {
      window.clearTimeout(projectPanelChromeCheckTimer);
      projectPanelChromeCheckTimer = null;
    }
    if (projectPanelChromeFollowupTimer) {
      window.clearTimeout(projectPanelChromeFollowupTimer);
      projectPanelChromeFollowupTimer = null;
    }
    if (projectPanelChromeTriggerHandler) {
      doc.removeEventListener("pointerdown", projectPanelChromeTriggerHandler, true);
      doc.removeEventListener("click", projectPanelChromeTriggerHandler, true);
      projectPanelChromeTriggerHandler = null;
    }
    projectPanelChromePendingUntil = 0;
    if (window.__CODEX_INTERFACE_THEME_PROJECT_PANEL_CHROME_CLEANUP__ === cleanupProjectPanelChromeEventHooks) {
      delete window.__CODEX_INTERFACE_THEME_PROJECT_PANEL_CHROME_CLEANUP__;
    }
  }

  function installProjectPanelChromeEventHooks() {
    if (!doc.body) {
      return;
    }
    if (typeof window.__CODEX_INTERFACE_THEME_PROJECT_PANEL_CHROME_CLEANUP__ === "function" && window.__CODEX_INTERFACE_THEME_PROJECT_PANEL_CHROME_CLEANUP__ !== cleanupProjectPanelChromeEventHooks) {
      try {
        window.__CODEX_INTERFACE_THEME_PROJECT_PANEL_CHROME_CLEANUP__();
      } catch {
      }
    }
    cleanupProjectPanelChromeEventHooks();
    projectPanelChromeTriggerHandler = function onProjectPanelChromeTrigger(event) {
      if (!isRightMajorPanelTriggerEvent(event)) {
        return;
      }
      triggerProjectPanelChromePreflight();
    };
    doc.addEventListener("pointerdown", projectPanelChromeTriggerHandler, true);
    doc.addEventListener("click", projectPanelChromeTriggerHandler, true);
    window.__CODEX_INTERFACE_THEME_PROJECT_PANEL_CHROME_CLEANUP__ = cleanupProjectPanelChromeEventHooks;
  }

  function applyVariables() {
    const focusX = clampNumber(art.focusX, 0, 1, 0.72) * 100;
    const focusY = clampNumber(art.focusY, 0, 1, 0.44) * 100;
    const safeArea = ["auto", "left", "right", "center", "none", "sides"].includes(String(art.safeArea || "").toLowerCase())
      ? String(art.safeArea || "sides").toLowerCase()
      : "sides";
    const taskMode = ["ambient", "banner", "off", "auto"].includes(String(art.taskMode || "").toLowerCase())
      ? String(art.taskMode || "ambient").toLowerCase()
      : "ambient";
    const mode = ["chrome-only", "sidebar-art", "wallpaper"].includes(String(theme.mode || "").toLowerCase())
      ? String(theme.mode || "chrome-only").toLowerCase()
      : "chrome-only";
    const badgeTheme = icons.badge && typeof icons.badge === "object" ? icons.badge : {};
    const badgeSize = clampNumber(badgeTheme.size, 32, 128, 58);
    const badgeOpacity = clampNumber(badgeTheme.opacity, 0, 1, 0.92);
    const characterTheme = icons.character && typeof icons.character === "object" ? icons.character : {};
    const characterSize = clampNumber(characterTheme.size, 180, 520, 350);
    const characterOpacity = clampNumber(characterTheme.opacity, 0, 1, 1);
    const tableFlipCatTheme = icons.tableFlipCat && typeof icons.tableFlipCat === "object" ? icons.tableFlipCat : {};
    const tableFlipCatSize = clampNumber(tableFlipCatTheme.size, 72, 180, 118);
    const tableFlipCatOpacity = clampNumber(tableFlipCatTheme.opacity, 0, 1, 0.96);
    const tableFlipCatFrames = Math.round(clampNumber(tableFlipCatTheme.frameCount, 2, 60, TABLE_FLIP_CAT_DEFAULT_FRAMES));
    const tableFlipCatFrameSteps = Math.max(1, tableFlipCatFrames - 1);
    const tableFlipCatDurationMs = Math.round(clampNumber(tableFlipCatTheme.durationMs, 100, 10000, TABLE_FLIP_CAT_DEFAULT_DURATION_MS));

    setVariable("--cit-accent", palette.accent || "#7cc7ff");
    setVariable("--cit-secondary", palette.secondary || "#7fffd4");
    setVariable("--cit-highlight", palette.highlight || "#ffd166");
    setVariable("--cit-surface", palette.surface);
    setVariable("--cit-surface-strong", palette.surfaceStrong);
    setVariable("--cit-text", palette.text);
    setVariable("--cit-sidebar-accent", modules.sidebar && modules.sidebar.accent || "#00c8f8");
    setVariable("--cit-sidebar-surface", modules.sidebar && modules.sidebar.surface || "rgba(8, 13, 16, 0.78)");
    setVariable("--cit-sidebar-border", modules.sidebar && modules.sidebar.border || "rgba(0, 200, 248, 0.20)");
    setVariable("--cit-header-accent", modules.header && modules.header.accent || "#f2a23a");
    setVariable("--cit-header-surface", modules.header && modules.header.surface || "rgba(12, 13, 14, 0.62)");
    setVariable("--cit-header-border", modules.header && modules.header.border || "rgba(242, 162, 58, 0.16)");
    setVariable("--cit-composer-accent", modules.composer && modules.composer.accent || "#f2a23a");
    setVariable("--cit-composer-surface", modules.composer && modules.composer.surface || "rgba(9, 10, 12, 0.56)");
    setVariable("--cit-composer-border", modules.composer && modules.composer.border || "rgba(242, 162, 58, 0.16)");
    setVariable("--cit-popover-accent", modules.popover && modules.popover.accent || "#ff5a45");
    setVariable("--cit-popover-surface", modules.popover && modules.popover.surface || "rgba(16, 11, 12, 0.88)");
    setVariable("--cit-popover-border", modules.popover && modules.popover.border || "rgba(255, 90, 69, 0.18)");
    setVariable("--cit-mecha-frame", modules.mecha && modules.mecha.frame || "#161a20");
    setVariable("--cit-mecha-armor", modules.mecha && modules.mecha.armor || "#f2a23a");
    setVariable("--cit-mecha-glow", modules.mecha && modules.mecha.glow || "#00c8f8");
    setVariable("--cit-status-success", modules.status && modules.status.success || "#19e6a3");
    setVariable("--cit-status-warning", modules.status && modules.status.warning || "#f2a23a");
    setVariable("--cit-status-danger", modules.status && modules.status.danger || "#ff5a45");
    setVariable("--cit-status-info", modules.status && modules.status.info || "#00c8f8");
    setVariable("--cit-bg-focus-x", focusX.toFixed(2) + "%");
    setVariable("--cit-bg-focus-y", focusY.toFixed(2) + "%");
    setVariable("--cit-badge-size", badgeSize.toFixed(0) + "px");
    setVariable("--cit-badge-opacity", badgeOpacity.toFixed(2));
    setVariable("--cit-character-size", characterSize.toFixed(0) + "px");
    setVariable("--cit-character-opacity", characterOpacity.toFixed(2));
    setVariable("--cit-table-flip-cat-size", tableFlipCatSize.toFixed(0) + "px");
    setVariable("--cit-table-flip-cat-opacity", tableFlipCatOpacity.toFixed(2));
    setVariable("--cit-table-flip-cat-frames", String(tableFlipCatFrames));
    setVariable("--cit-table-flip-cat-frame-steps", String(tableFlipCatFrameSteps));
    setVariable("--cit-table-flip-cat-sprite-width", String(tableFlipCatFrames * 100) + "%");
    setVariable("--cit-table-flip-cat-duration", tableFlipCatDurationMs + "ms");
    root.style.setProperty("--cit-bg-image", cssUrlFromDataUrl(payload.backgroundDataUrl));
    root.style.setProperty("--cit-character-image", cssUrlFromDataUrl(payload.characterDataUrl));
    root.style.setProperty("--cit-table-flip-cat-trigger-icon", cssUrlFromDataUrl(payload.tableFlipCatTriggerIconDataUrl));
    root.dataset.citHasImage = payload.backgroundDataUrl ? "true" : "false";
    root.dataset.citTableFlipCat = typeof payload.loadTableFlipCatPlayback === "function" || payload.tableFlipCatSpriteDataUrl || payload.tableFlipCatDataUrl ? "true" : "false";
    root.dataset.citTableFlipCatMode = root.dataset.citTableFlipCat === "true" ? "manual-lazy-sprite" : "off";
    root.dataset.citAppearance = inferAppearance();
    root.dataset.citMode = mode;
    root.dataset.citWorkspaceTreatment = String(layout.workspaceTreatment || "native").toLowerCase();
    root.dataset.citBlockContrast = String(layout.blockContrast || "segmented").toLowerCase();
    root.dataset.citCornerArmor = String(layout.cornerArmor || "off").toLowerCase();
    root.dataset.citSafeArea = safeArea === "auto" ? "sides" : safeArea;
    root.dataset.citTaskMode = taskMode === "auto" ? "ambient" : taskMode;
  }

  const RUNTIME_MODULES = [
    {
      id: "backdrop",
      install: installBackdrop
    },
    {
      id: "rightHud",
      install: installRightHud,
      route: installRightHud,
      light: maintainRightHud,
      heavy: installRightHud,
      stabilize: installRightHud
    },
    {
      id: "badge",
      install: installBadge
    },
    {
      id: "projectPanels",
      install: installProjectPanelChrome,
      route: installProjectPanelChrome,
      light: maintainProjectPanelChrome,
      stabilize: maintainProjectPanelChrome
    },
    {
      id: "character",
      install: function installCharacterModule() {
        installCharacter();
        updateCharacterRetreat();
      },
      route: function routeCharacterModule() {
        installCharacter();
        updateCharacterRetreat();
      },
      light: updateCharacterRetreat,
      heavy: function heavyCharacterModule() {
        installCharacter();
        updateCharacterRetreat();
      },
      stabilize: function stabilizeCharacterModule() {
        installCharacter();
        updateCharacterRetreat();
      }
    },
    {
      id: "collisionScheduler",
      install: function installCollisionSchedulerModule() {
        installCharacterRetreatObserver();
        installProjectPanelChromeEventHooks();
      },
      cleanup: function cleanupCollisionSchedulerModule() {
        cleanupCharacterRetreatObserver();
        cleanupProjectPanelChromeEventHooks();
      }
    },
    {
      id: "composerSurface",
      install: installComposerFrame,
      route: installComposerFrame,
      stabilize: installComposerFrame
    },
    {
      id: "conversationSurface",
      install: installConversationSurfaces,
      route: installConversationSurfaces,
      heavy: installConversationSurfaces,
      stabilize: installConversationSurfaces
    },
    {
      id: "workspacePickers",
      install: function installWorkspacePickerModule() {
        installWorkspacePickerEventHooks();
      },
      cleanup: cleanupWorkspacePickerEventHooks
    },
    {
      id: "buttonGlyphs",
      install: installButtonGlyphs,
      route: installButtonGlyphs,
      heavy: maintainButtonGlyphs,
      stabilize: maintainButtonGlyphs
    },
    {
      id: "marker",
      install: installMarker
    }
  ];

  function runRuntimeModulePhase(phaseName) {
    const phase = String(phaseName || "");
    const executed = [];
    RUNTIME_MODULES.forEach(function runRuntimeModule(moduleConfig) {
      const action = moduleConfig[phase];
      if (typeof action !== "function") {
        return;
      }
      action();
      executed.push(moduleConfig.id);
    });
    root.dataset.citRuntimeModules = RUNTIME_MODULES.map(function mapRuntimeModule(moduleConfig) {
      return moduleConfig.id;
    }).join(",");
    root.dataset.citRuntimePhase = phase;
    root.dataset.citRuntimePhaseModules = executed.join(",");
    return executed.length;
  }

  function installBodyRuntimeModules() {
    invalidateStaticAccess("install", true);
    return runRuntimeModulePhase("install");
  }

  function cleanupRuntimeModules() {
    RUNTIME_MODULES.slice().reverse().forEach(function cleanupRuntimeModule(moduleConfig) {
      if (typeof moduleConfig.cleanup === "function") {
        moduleConfig.cleanup();
      }
    });
    delete root.dataset.citRuntimePhase;
    delete root.dataset.citRuntimePhaseModules;
    delete root.dataset.citRuntimeModules;
  }

  function removeTheme() {
    const style = doc.getElementById(STYLE_ID);
    if (style) {
      style.remove();
    }
    removeLegacyBackgroundStyle();
    clearBodyInlineBackground(true);
    const backdrop = doc.getElementById(BACKDROP_ID);
    if (backdrop) {
      backdrop.remove();
    }
    const rightHud = doc.getElementById(RIGHT_HUD_ID);
    if (rightHud) {
      rightHud.remove();
    }
    const character = doc.getElementById(CHARACTER_ID);
    if (character) {
      character.remove();
    }
    const marker = doc.getElementById(MARKER_ID);
    if (marker) {
      marker.remove();
    }
    const badge = doc.getElementById(BADGE_ID);
    if (badge) {
      badge.remove();
    }
    cleanupButtonGlyphs();
    cleanupProjectPanels();
    root.removeAttribute(ROOT_ATTR);
    delete root.dataset.citHasImage;
    delete root.dataset.citAppearance;
    delete root.dataset.citMode;
    delete root.dataset.citWorkspaceTreatment;
    delete root.dataset.citBlockContrast;
    delete root.dataset.citCornerArmor;
    delete root.dataset.citSafeArea;
    delete root.dataset.citTaskMode;
    delete root.dataset.citIconBadge;
    delete root.dataset.citCharacter;
    delete root.dataset.citCharacterPlacement;
    delete root.dataset.citCharacterRetreat;
    delete root.dataset.citTableFlipCat;
    delete root.dataset.citTableFlipCatMode;
    delete root.dataset.citButtonIcons;
    delete root.dataset.citButtonSidebarNavigation;
    delete root.dataset.citButtonTitlebarNavigation;
    delete root.dataset.citButtonComposerControls;
    delete root.dataset.citButtonTopUtilityActions;
    delete root.dataset.citButtonMessageActions;
    delete root.dataset.citButtonProjectPanelRows;
    delete root.dataset.citProjectPanels;
    delete root.dataset.citRightMajorPanel;
    delete root.dataset.citConversationSurfaces;
    delete root.dataset.citComposerFrame;
    delete root.dataset.citMaintenanceIntervalMs;
    delete root.dataset.citHeavyMaintenanceMs;
    delete root.dataset.citStaticAccessGeneration;
    delete root.dataset.citStaticAccessHits;
    delete root.dataset.citStaticAccessMisses;
    delete root.dataset.citStaticAccessReason;
    delete root.dataset.citRoute;
    delete root.dataset.citPageKind;
    root.style.removeProperty("--cit-accent");
    root.style.removeProperty("--cit-secondary");
    root.style.removeProperty("--cit-highlight");
    root.style.removeProperty("--cit-bg-image");
    root.style.removeProperty("--cit-character-image");
    root.style.removeProperty("--cit-table-flip-cat-trigger-icon");
    root.style.removeProperty("--cit-bg-focus-x");
    root.style.removeProperty("--cit-bg-focus-y");
    root.style.removeProperty("--cit-badge-size");
    root.style.removeProperty("--cit-badge-opacity");
    root.style.removeProperty("--cit-character-size");
    root.style.removeProperty("--cit-character-opacity");
    root.style.removeProperty("--cit-table-flip-cat-size");
    root.style.removeProperty("--cit-table-flip-cat-opacity");
    root.style.removeProperty("--cit-table-flip-cat-frames");
    root.style.removeProperty("--cit-table-flip-cat-frame-steps");
    root.style.removeProperty("--cit-table-flip-cat-sprite-width");
    root.style.removeProperty("--cit-table-flip-cat-duration");
    root.style.removeProperty("--cit-surface");
    root.style.removeProperty("--cit-surface-strong");
    root.style.removeProperty("--cit-text");
    root.style.removeProperty("--cit-sidebar-accent");
    root.style.removeProperty("--cit-sidebar-surface");
    root.style.removeProperty("--cit-sidebar-border");
    root.style.removeProperty("--cit-header-accent");
    root.style.removeProperty("--cit-header-surface");
    root.style.removeProperty("--cit-header-border");
    root.style.removeProperty("--cit-composer-accent");
    root.style.removeProperty("--cit-composer-surface");
    root.style.removeProperty("--cit-composer-border");
    root.style.removeProperty("--cit-popover-accent");
    root.style.removeProperty("--cit-popover-surface");
    root.style.removeProperty("--cit-popover-border");
    root.style.removeProperty("--cit-mecha-frame");
    root.style.removeProperty("--cit-mecha-armor");
    root.style.removeProperty("--cit-mecha-glow");
    root.style.removeProperty("--cit-status-success");
    root.style.removeProperty("--cit-status-warning");
    root.style.removeProperty("--cit-status-danger");
    root.style.removeProperty("--cit-status-info");
    if (window.__CODEX_INTERFACE_THEME_ROUTE_WATCH__) {
      window.clearInterval(window.__CODEX_INTERFACE_THEME_ROUTE_WATCH__);
      delete window.__CODEX_INTERFACE_THEME_ROUTE_WATCH__;
    }
    cleanupRuntimeModules();
    if (tableFlipCatTimer) {
      window.clearTimeout(tableFlipCatTimer);
      tableFlipCatTimer = null;
    }
    if (tableFlipCatPlaybackInterval) {
      window.clearInterval(tableFlipCatPlaybackInterval);
      tableFlipCatPlaybackInterval = null;
    }
    delete window.__CODEX_INTERFACE_THEME_MAINTENANCE_TICK__;
    return { ok: true, removed: true };
  }

  window.__CODEX_INTERFACE_THEME_REMOVE__ = removeTheme;
  window.__CODEX_INTERFACE_THEME_APPLY__ = function reapplyCodexInterfaceTheme(nextPayload) {
    return codexInterfaceThemeApply(nextPayload || payload);
  };

  installStyle();
  applyVariables();
  root.setAttribute(ROOT_ATTR, "active");
  root.setAttribute("data-cit-revision", revision);
  removeLegacyBackgroundStyle();
  installBodyBackgroundInline();

  if (doc.body) {
    installBodyRuntimeModules();
  } else {
    doc.addEventListener("DOMContentLoaded", function installBodyElements() {
      installBodyRuntimeModules();
    }, { once: true });
  }

  updateRouteState();

  if (window.__CODEX_INTERFACE_THEME_ROUTE_WATCH__) {
    window.clearInterval(window.__CODEX_INTERFACE_THEME_ROUTE_WATCH__);
  }
  let lastHref = String(window.location && window.location.href ? window.location.href : "");
  window.__CODEX_INTERFACE_THEME_ROUTE_WATCH__ = window.setInterval(function watchRoute() {
    const currentHref = String(window.location && window.location.href ? window.location.href : "");
    if (currentHref !== lastHref) {
      lastHref = currentHref;
      updateRouteState();
      runRuntimeModulePhase("route");
      return;
    }
    runRuntimeModulePhase("light");
    window.__CODEX_INTERFACE_THEME_MAINTENANCE_TICK__ = (Number(window.__CODEX_INTERFACE_THEME_MAINTENANCE_TICK__ || 0) + 1);
    if (window.__CODEX_INTERFACE_THEME_MAINTENANCE_TICK__ % HEAVY_MAINTENANCE_EVERY_TICKS === 0) {
      runRuntimeModulePhase("heavy");
    }
  }, ROUTE_WATCH_INTERVAL_MS);
  root.dataset.citMaintenanceIntervalMs = String(ROUTE_WATCH_INTERVAL_MS);
  root.dataset.citHeavyMaintenanceMs = String(ROUTE_WATCH_INTERVAL_MS * HEAVY_MAINTENANCE_EVERY_TICKS);
  window.setTimeout(function stabilizeThemeAfterPaint() {
    runRuntimeModulePhase("stabilize");
  }, STABILIZE_AFTER_PAINT_MS);

  return {
    ok: true,
    revision: revision,
    href: String(window.location && window.location.href ? window.location.href : ""),
    marker: Boolean(doc.getElementById(MARKER_ID))
  };
})
