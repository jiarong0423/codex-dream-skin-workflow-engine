# Button Module Replacement Plan

## 原則

- 一次只替換一個模組。
- 橘貓本體只做 sidebar badge，不貼到每個按鈕。
- 按鈕只用抽象貓系、寵物用品、機甲符號。
- 新模組進 runtime 替換前必須先有 DOM map、測試預覽、截圖檢查。
- 任何替換都必須保留原生 label、aria-label、title、tooltip 與點擊範圍。

## Reference Mapping

- 機械鍵盤 / 透明鍵帽參考：用在小型控制件、邊線、RGB 薄光，不做大面積鋪色。
- GravaStar / 透明機械外殼參考：用在 sidebar icon 與 titlebar 小按鈕的機械框架感。
- 黑金機甲貓參考：用在左上與 header 的黑鈦、金橘裝甲語言。
- 駭客橘貓參考：橘貓本體只作 badge；按鈕改用爪、尾巴、魚骨、罐頭、晶片等抽象符號。
- 衝突跳色策略：青色負責導航、金橘負責機甲/焦點、洋紅負責 popover 和局部反差；避免整體全綠。
- 左右背景策略：`cyber-ruins-pale.png` 分成左右安全區使用；左邊露廢墟面板 / 資料雨，右邊露淡色廢墟走廊，中間工作區不鋪圖。
- 角色策略：`cyber-mecha-cat-male-helmet-900.png` 是 sidebar 右側外部展示區的不透明前景角色；不進功能欄文字後面、不進 row、不進每顆 button、不覆蓋 main workspace。

## 模組順序

| Order | Module | Status | Scope |
|------:|--------|--------|-------|
| 1 | `sidebarNavigation` | live-enabled-verified | 左側固定導覽 |
| 2 | `titlebarNavigation` | live-enabled-verified | 上方返回/前進 |
| 3 | `projectPanels` | chrome-live-calibrated-no-icon-replacement | 專案/檔案/整理/設定面板 |
| 4 | `composerControls` | live-enabled-verified | 輸入區送出/停止/執行 |
| 5 | `topUtilityActions` | live-enabled-verified | 上方工具列 / 面板切換 / 文件工具 |
| 6 | `messageActions` | live-enabled-verified | 可見訊息操作列 |
| 7 | `projectPanelRows` | live-enabled-visible-panel-guarded | 右側 project/resource panel 可見資料列 |

## Sidebar Navigation Mapping

| Action | Native Label | Test Glyph | Asset |
|--------|--------------|------------|-------|
| search | Search / 搜尋 | cat eye | `macos/assets/icons/buttons/cat-eye-search.svg` |
| newTask | New Task / 新增任務 | paw plus | `macos/assets/icons/buttons/cat-paw-new-task.svg` |
| projects | Projects / 專案 | neko chip | `macos/assets/icons/buttons/neko-chip-project.svg` |
| pullRequests | Pull Request | fishbone files | `macos/assets/icons/buttons/fishbone-files.svg` |
| websites | Websites / 網站 | teaser wand spark | `macos/assets/icons/buttons/teaser-wand-spark.svg` |
| scheduled | Scheduled / 已排程 | collar tag | `macos/assets/icons/buttons/collar-tag-task.svg` |
| extensions | Extensions / 外掛程式 | cat can package | `macos/assets/icons/buttons/cat-can-package.svg` |

## Titlebar Navigation Mapping

| Action | Native Label | Test Glyph | Asset |
|--------|--------------|------------|-------|
| back | 上一步 / Back | cat tail back | `macos/assets/icons/buttons/cat-tail-back.svg` |
| forward | 向前 / Forward | cat tail forward | `macos/assets/icons/buttons/cat-tail-forward.svg` |

## Project Panel Chrome

First pass does not replace icons. It only marks the visible right-side resource/project summary panel after runtime DOM checks, then applies:

- Transparent keyboard shell surface.
- Thin cyan/magenta/gold RGB rail.
- Rounded data-chip rows for sources, outputs, environment, and related panel items.
- No composer control changes and no workspace overlay.

## Composer Controls Mapping

Only the visible controls inside `.composer-surface-chrome` are eligible. This pass does not change the text box surface, model selector, dictation button, or attachment button. The state-dependent primary action button uses a composer-bounded fallback that selects only the rightmost small composer action button after excluding dictation and already-replaced controls.

| Action | Native Label | Test Glyph | Asset |
|--------|--------------|------------|-------|
| run | 代我核准 / Run / Approve | food bowl run | `macos/assets/icons/buttons/food-bowl-run.svg` |
| stop | 停止 / 停止產生 / Stop | claw stop | `macos/assets/icons/buttons/claw-stop.svg` |
| send | 送出 / 送出訊息 / Send / Submit | whisker send | `macos/assets/icons/buttons/whisker-send.svg` |

## Top Utility Actions Mapping

Only visible top toolbar and document toolbar buttons are eligible. Sidebar, composer, message action buttons, and breadcrumb text links are excluded.

| Action | Native Label | Test Glyph | Asset |
|--------|--------------|------------|-------|
| projectContext | 專案： / Project: | neko chip | `macos/assets/icons/buttons/neko-chip-project.svg` |
| taskActions | 任務動作 / Task actions | mecha ear settings | `macos/assets/icons/buttons/mecha-ear-settings.svg` |
| summaryToggle | 切換摘要 / Toggle summary | yarn thread | `macos/assets/icons/buttons/yarn-thread.svg` |
| sideTab | 開啟側邊面板分頁 / Open side panel tab | neko chip | `macos/assets/icons/buttons/neko-chip-project.svg` |
| expandPanel | 展開面板 / Expand panel | teaser wand spark | `macos/assets/icons/buttons/teaser-wand-spark.svg` |
| bottomPanel | 切換底部面板 / Toggle bottom panel | collar tag | `macos/assets/icons/buttons/collar-tag-task.svg` |
| sidePanel | 切換側邊面板 / Toggle side panel | fishbone files | `macos/assets/icons/buttons/fishbone-files.svg` |
| sourceView | 查看原始碼 / View source | fishbone files | `macos/assets/icons/buttons/fishbone-files.svg` |
| fileTree | 切換檔案樹 / Toggle file tree | yarn thread | `macos/assets/icons/buttons/yarn-thread.svg` |
| openExternal | 在 VS Code 中開啟 / Open in VS Code | cat can package | `macos/assets/icons/buttons/cat-can-package.svg` |
| openOptions | 開啟選項 / Open options | mecha ear settings | `macos/assets/icons/buttons/mecha-ear-settings.svg` |

## Message Actions Mapping

Only visible message action buttons are eligible. Sidebar, composer, top toolbar, right project panel, and message minimap jump rows are excluded.

| Action | Native Label | Test Glyph | Asset |
|--------|--------------|------------|-------|
| copyMessage | 複製訊息 / 複製 / Copy | fishbone files | `macos/assets/icons/buttons/fishbone-files.svg` |
| goodResponse | 良好回覆 / Good response | teaser wand spark | `macos/assets/icons/buttons/teaser-wand-spark.svg` |
| badResponse | 不佳回覆 / Bad response | claw stop | `macos/assets/icons/buttons/claw-stop.svg` |
| continueTask | 從此處繼續到新工作 | collar tag | `macos/assets/icons/buttons/collar-tag-task.svg` |
| guide | 引導 / Guide | yarn thread | `macos/assets/icons/buttons/yarn-thread.svg` |
| deleteAction | 刪除 / Delete | litter scoop | `macos/assets/icons/buttons/litter-scoop-clean.svg` |
| moreActions | 更多 / More actions | mecha ear settings | `macos/assets/icons/buttons/mecha-ear-settings.svg` |
| scrollBottom | 捲動至底部 / Scroll to bottom | whisker send | `macos/assets/icons/buttons/whisker-send.svg` |

## Project Panel Rows Mapping

Only rows inside a fully visible `.codex-interface-theme-project-panel` are eligible. Hidden or offscreen summary/resource panels are intentionally ignored, so this module reports `0` when the right panel is closed or shifted outside the viewport.

| Action | Native Target | Test Glyph | Asset |
|--------|---------------|------------|-------|
| outputRow | 輸出內容 / output row | fishbone files | `macos/assets/icons/buttons/fishbone-files.svg` |
| agentRow | 子代理 / agent row | teaser wand spark | `macos/assets/icons/buttons/teaser-wand-spark.svg` |
| sourceRow | 來源 / source row | yarn thread | `macos/assets/icons/buttons/yarn-thread.svg` |
| environmentRow | 環境 / branch / project row | mecha ear settings | `macos/assets/icons/buttons/mecha-ear-settings.svg` |
| statusRow | status / pull request state | claw stop | `macos/assets/icons/buttons/claw-stop.svg` |
| viewAll | 查看全部 / view all | cat eye search | `macos/assets/icons/buttons/cat-eye-search.svg` |

## Preview

Open these local previews to inspect module-specific visual rhythm without touching live Codex:

- [sidebar-navigation-test.html](../macos/previews/sidebar-navigation-test.html)
- [project-panel-rows-test.html](../macos/previews/project-panel-rows-test.html)

The runtime path is wired but disabled by default in source theme. Live application checks require an explicit module enable command and a working CDP session.

## Text Style Test

The sidebar preview also tests typography:

- Main preview title uses readable Traditional Chinese UI typography.
- Small labels use a cyber/mecha plate style with monospace fallback.
- Sidebar navigation text stays compact, readable, and ellipsized when long.
- Section labels use gold/cyan accent hierarchy instead of all-green text.
- No external font is downloaded; this stays local CSS only.
