# Dream Skin Parallel Notes

## 目的

這份筆記只做 clean-room 架構整理，不下載、不搬移、不複製任何外部主題專案的完整實作。目標是把可取的主題架構邊界轉成我們自己的 Codex Interface Theme 問題清單，找出剛剛套版失敗的位置。

## 參考邊界

- 只保留架構層面的觀察，例如 runtime 注入邊界、頁面模式、安全區、selector 策略與驗證面向。
- 不 vendor、clone、搬移或改寫外部專案原始碼。
- 不把外部專案的檔名、URL、實作細節放進可發佈 preview。

## 外部主題工具的架構重點

- 它不是改官方 app，也不是替換 `app.asar`。核心是透過本機 CDP 把 CSS 與少量 DOM 狀態套到 Codex renderer。
- 它有明確的 root theme class 與 data attributes，讓 CSS 只在主題啟用時生效。
- 它把 home page 與 task page 分開處理。home 可以有較強的 hero/卡片視覺，task page 則降低背景干擾。
- 它優先鎖定 Codex shell 節點，例如 sidebar、main surface、header、composer surface，而不是大量使用模糊的字串 selector。
- 它把背景圖放在 `main.main-surface` 相關層級與 pseudo-element 裡，再用 safe area、wide art、task mode 等 data state 控制位置和強度。
- 它的驗證不是只看 style marker，而是會關注 home hero、sidebar、composer 等可見區域是否真的套到。

## 我們目前的架構狀態

- 我們也是 clean-room runtime skin，不修改官方 app、`app.asar`、登入資料、API key 或雲端狀態。
- 我們已有 install、start、restore、verify、customize、theme-store、injector 生命週期。
- 我們的 CDP target wait 已補上，`--once` 會等 renderer target，不會只等 `/json/version`。
- 目前安全版 CSS 是 chrome-only：只動 sidebar、header、popover、hover、focus、selection、code/terminal border。
- 目前 CSS 已把 `#codex-interface-theme-backdrop` 隱藏，避免圖片蓋住工作區。
- 目前 renderer-inject 仍會建立 backdrop 並塞入 image data URL，但 CSS 隱藏它。這代表資料層和視覺層還沒有整理成正式模式。

## 平行比較

| 面向 | 外部主題工具常見做法 | 我們目前做法 | 差距與問題 |
|------|---------------------------|--------------|------------|
| 啟用邊界 | root class/data attributes 控制整體主題狀態 | `html[data-codex-interface-theme="active"]` 控制主題狀態 | 基本方向正確 |
| 頁面模式 | home 與 task 分開設計 | 只有簡單 route/page kind data，CSS 尚未用它做完整分流 | task page 缺少正式安全區規則 |
| selector 策略 | 鎖定 shell/main/header/composer 等結構節點 | 早期用過 `[class*="message"]`、`[class*="conversation"]`、`[class*="turn"]` | 這是大面積遮罩的直接來源之一 |
| 圖像位置 | 圖像被約束在主 surface 或專用 pseudo-element，並受 task mode 控制 | 早期用全頁 backdrop/body/main 視覺層，後來 chrome-only 隱藏 backdrop | 圖像層級太寬，容易壓到工作區 |
| 任務頁干擾控制 | 有 safe area、wide art、task mode 類的狀態 | 有 `data-cit-task-mode` 但目前沒有成熟 CSS 模式 | 需要補 `chrome-only`、`sidebar-art`、`wallpaper` 明確模式 |
| 驗證方式 | 檢查多個可見 surface | 我們已有 marker/style/screenshot，但早期只看 marker 會漏視覺災難 | 需要把「工作區不被覆蓋」列入 verify |
| 圖像素材 | 可做背景/hero，但位置受控 | 目前貓圖是完整壁紙，不是去背 icon/cutout | 要先做去背小素材，再放入 sidebar-safe slot |
| 還原策略 | runtime 注入可還原 | `restore.sh --port 9341` 可 no-restart 移除 live layer | 方向正確，應保留為急救路徑 |

## 這次不好看的直接原因

- 使用完整壁紙當工作介面底層，沒有先切成去背貓 icon 或安全區素材。
- 曾把背景或 glass layer 套到全頁與 main/workspace 相關容器，視覺上等於把工作區蓋住。
- 曾使用過廣泛 substring selector，誤中 conversation、message、turn 等內容容器。
- 驗證先前偏重「有沒有注入成功」，不夠重視「工作區是否保持可讀、可操作、未被遮擋」。

## 重複發生的根源原因

- 先做視覺效果，再補 DOM 邊界，導致美術層跑到工作層上面。
- 圖片素材沒有分成背景、cutout、icon、badge 等不同用途。
- theme metadata 還沒有把模式寫死，導致 wallpaper 行為可能從資料層意外回到畫面。
- selector map 沒有先建立，導致 CSS 靠猜測而不是靠實際 Codex renderer 結構。

## 下一輪修正準則

- 不再把完整壁紙放回 main workspace。
- 先做 read-only DOM layout map，分出 sidebar、header、main surface、composer、right panel、popover。
- 建立明確模式：`chrome-only`、`sidebar-art`、`wallpaper`。預設只能是 `chrome-only`。
- 貓圖要先做透明背景 cutout，檢查小尺寸可讀性，再放 sidebar badge 或底部非工作區槽位。
- CSS 只能針對穩定 shell 結構節點，禁止再用 message、conversation、turn 類 substring selector 去改背景。
- verify 要新增視覺守門：main workspace 不得有 theme backdrop、composer 不得被蓋住、右側 panel 不得被圖像壓過。

## 目前判定

參考專案可借的是「架構方法」，不是視覺結果本身。它的關鍵不是把背景弄炫，而是把主題狀態、頁面模式、圖像安全區、驗證面向分開。我們目前最正確的狀態是 chrome-only 安全版；下一步若要重做貓主題，應先完成 cutout 資產與 selector map，再把貓放在不遮擋工作區的固定槽位。
