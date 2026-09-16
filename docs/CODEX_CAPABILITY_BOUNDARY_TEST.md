# Codex / GPT-5.6 能力邊界測試紀錄

日期：2026-09-16

這個 repo 對 Build Week 的定位不是「一個桌面換皮工具」。它是一次**刻意拉長的能力邊界測試**：由使用者只提供 intent、taste、constraints 與最終判斷，由 Codex / GPT-5.6 承擔架構、實作、素材管線、驗證與封裝，看這條線能推到哪裡、在哪裡會斷。換皮是題目，不是目的。

## 一、測試的是什麼技術面

這次測試壓的不是「能不能寫出 CSS」，而是以下幾件在單純生成任務中不會出現的能力：

| 能力面 | 測試內容 |
|---|---|
| 頁面資料層注入 | 透過 `127.0.0.1` 的 Chromium DevTools Protocol 一次性注入，不改應用程式本體、不碰簽名、不動使用者登入狀態，且必須保留完整還原路徑 |
| DOM 擁有權辨識 | 判斷每個效果該掛在哪個原生節點，在不改 hitbox、不覆蓋文字、不讓 transient panel 穿透的條件下**替換**擁有者，而不是往上疊遮罩 |
| 靜態存取 | 不連線、不啟動應用程式、不截圖，只讀原始碼就盤點圖層擁有者與色彩基準 |
| 自我檢測與修復迴圈 | 掃描 → 圖層分類 → 決策 → 靜態閘 → 預算檢查 → 單次套用 → 驗證；驗證不過回到替換擁有者重跑 |
| 邊界不變式 | 素材預算、常駐程序禁令、還原就緒、原生受保護區不得重繪 |

## 二、擁有者的人機貢獻估算

以下為專案擁有者依實際協作過程給出的第一手估算，**非量測值**。列出以保留歸屬透明度。

| 階段 | 使用者 input | Codex / GPT-5.6 output | 佔比估算 |
|---|---|---|---|
| 起點定義 | 提出想做 Codex desktop skin / Dream Skin | 判斷應升級成可回復 runtime engine | 使用者 70% / Codex 30% |
| 視覺方向 | 橘貓、駭客、Matrix、cyberpunk、機甲、撞色 | 拆成 theme language、safe area、色彩角色、模組順序 | 使用者 45% / Codex 55% |
| 素材生成 | 提供少量截圖、參考、審美方向 | 生成背景、角色、badge、table-flip 素材變體 | 使用者 25% / Codex 75% |
| 去背與素材處理 | 要求乾淨、可用、不遮擋 | 建立 chroma / cutout / runtime 尺寸，檢查 alpha | 使用者 10% / Codex 90% |
| Runtime 架構 | 要求不要破壞 Codex | 設計 CDP one-shot injection、restore、verify、engine/state 分層 | 使用者 15% / Codex 85% |
| 截圖與圖層除錯 | 回報黑框、遮擋、不乾淨 | 掃 DOM、圖層、owner boundary、direct/root cause | 使用者 20% / Codex 80% |
| 點擊與互動驗證 | 要求可點、不要擋、要確認 | sidebar / composer / right panel / workspace picker / table-flip lifecycle 測試 | 使用者 10% / Codex 90% |
| 動畫生命週期 | 想要互動效果 | 改成 click-time load、播完釋放、避免常駐 | 使用者 15% / Codex 85% |
| 效能治理 | 要求不要卡、不影響使用 | WebP、content-hash cache、移除 blur / idle animation / daemon | 使用者 10% / Codex 90% |
| Build Week 提交 | 決定參賽、提供最終判斷 | README、Devpost 文案、asset inventory、demo timeline、judge path | 使用者 25% / Codex 75% |

**整體估算**

- 使用者佔比：約 20% – 30%
- Codex / GPT-5.6 佔比：約 70% – 80%

更精準的說法：使用者主要貢獻 intent、taste、constraints、approval、defect reports、final judgment；Codex / GPT-5.6 主要貢獻 architecture、implementation、asset pipeline、cutout validation、click testing、layer scanning、performance optimization、restore path、submission packaging。

## 三、可量測的實作規模

以下數值**量測於 commit `e9bd85e`**（2026-09-16）。數字釘在該 commit 上，因此可永久複驗；後續 commit 會使實際值改變，這是預期的。

| 項目 | 數值 |
|---|---|
| 該 commit 時的 commit 總數 | 38 |
| 開發期間 | 2026-07-20 → 2026-09-16 |
| `.mjs` | 38 檔 / 20,069 行 |
| `.sh` | 32 檔 / 5,729 行 |
| `.js` | 3 檔 / 3,851 行 |
| `.md` | 28 檔 / 4,598 行 |
| `.json` | 19 檔 / 3,319 行 |
| `.css` | 11 檔 / 2,542 行 |
| 測試 assertion | 376 |
| gate 與掃描腳本 | 52 |
| runtime 模組宣告 | 14 |
| 公開 theme pack | 3 |

複驗指令（先 `git checkout e9bd85e`）：

```bash
git rev-list --all --count
git ls-files '*.mjs' | xargs wc -l | tail -1
grep -cE '\|\| cit_die|raise SystemExit' macos/tests/run-tests.sh
```

## 四、證據層密度

開發過程的結構化紀錄保存在本機開發日誌 `docs/PROJECT_LOG.md`（本機限定，不隨 repo 發布，因其記錄本機絕對路徑與截圖證據）。其規模與欄位分布如下，作為「每一輪都被迫寫出可稽核結論」的密度指標：

| 欄位 | 次數 |
|---|---|
| 記錄段落 | 269 |
| VALIDATION | 93 |
| DIRECT_CAUSE | 86 |
| ROOT_CAUSE | 62 |
| FIX | 53 |
| SCOPE | 36 |
| RESULT | 32 |
| DECISION | 22 |
| NEXT_DIRECT_GRAB_RULE | 8 |
| 總行數 | 19,236 |

這個結構是刻意的約束：每一輪修改都必須寫出範圍、直接原因、根本原因、修法、驗證指令與下一個接手點。它讓「AI 說修好了」不能只是宣稱。

## 五、方法論限制

誠實標註本紀錄的邊界：

- 第二節的佔比是**擁有者估算**，不是從逐字稿量測。完整協作逐字稿留在本機 Codex session 儲存區，未納入本 repo，因此無法在此提供可複驗的人機比例。
- git 歷史無法區分人機：2026-07-20 至 2026-08-09 的 commit 均以擁有者身分提交，無機器歸屬 trailer。截至 `e9bd85e`，含 `Co-Authored-By` 的 20 個 commit 全部來自 2026-09-16 的一次 Claude Code 稽核與修復作業，不代表整體專案比例。
- 第三、四節的數字可直接複驗；第二節不行。兩者刻意分開陳列。

## English Summary

For Build Week this repository is a deliberate capability-boundary test rather than a desktop skin. The user supplied intent, taste, constraints, defect reports, and final judgment; Codex / GPT-5.6 supplied architecture, implementation, the asset pipeline, cutout validation, click testing, layer scanning, performance optimisation, the restore path, and submission packaging. The owner estimates the split at roughly 20–30% user and 70–80% model.

What was actually under test was not CSS generation but page data-layer CDP injection with a guaranteed restore path, DOM ownership identification that replaces an owner instead of stacking an overlay, an offline static inspection path, and a re-entrant self-checking repair loop bounded by asset budgets and a no-resident-process rule.

Section 3 and section 4 are measured at commit `e9bd85e` and independently reproducible at that commit. Section 2 is the owner's first-hand estimate and is not derived from transcripts; the collaboration transcripts remain local and are not part of this repository. Git authorship cannot separate human from model for the July–August commits, and the 20 commits carrying a `Co-Authored-By` trailer as of `e9bd85e` all come from a single Claude Code audit pass on 2026-09-16.
