# example-checkin.html 畫面重新設計 Design Spec

**Goal:** 將 example-checkin.html 改為真正的雙區塊版型——攝影機區與流程說明區各佔 50%，字級與顏色完全遵循 design token，任何裝置方向都不破版。

**Architecture:** 純 HTML/CSS 修改，不動 JS template。`body` 改為 CSS grid，`#app`（攝影機，由 JS 控制）佔一格，`.flow-section`（靜態 HTML）佔另一格。`tokens.css` 直接 link 在 `<head>` 讓 CSS 變數在 JS 執行前即可用。

**Tech Stack:** HTML、CSS（CSS Grid、媒體查詢 orientation）、design tokens（`shared/tokens.css`）

---

## § 1 整體 Layout

`body` 為 CSS grid 容器，高度 `100dvh`（fallback `100vh`）：

- **portrait（直立）**：`grid-template-rows: 1fr 1fr`，`#app` 上、`.flow-section` 下，各佔 50dvh
- **landscape（橫向）**：`grid-template-columns: 1fr 1fr`，`#app` 左、`.flow-section` 右，各佔 50vw

兩格皆 `overflow: hidden`，不允許內容破出格子。

---

## § 2 攝影機區（`#app`）

- `position: relative`（讓標題 overlay 可定位）
- `background: #000`（攝影機未啟動前黑底）
- `overflow: hidden`

**video（JS template 注入）：**
- `width: 100%; height: 100%; object-fit: cover`
- 填滿整個格子，不留白邊，裁切超出部分

**標題 overlay（JS template 注入的 `<header>`）：**
- `position: absolute; top: 0; left: 0; z-index: 10`
- `padding: 8px 16px`
- `background: oklch(0.10 0.01 250 / 0.55)`（半透明深色底板）
- `border-radius: 0 0 10px 0`
- `color: white`
- h1：`font-size: var(--text-sm, 20px); font-weight: 600; margin: 0`（清除預設大字）

---

## § 3 流程說明區（`.flow-section`）

**外框：**
- `display: flex; flex-direction: column`
- `overflow: hidden`

**`.flow-title`（標題）：**
- 內容：同 `config.scenarioName`（硬寫 HTML，與 JS config 一致）
- `font-size: var(--text-3xl, 56px); font-weight: 700`
- `color: var(--text-primary, #1e2030)`
- `padding: 16px 20px 8px`
- 背景與「比對對象」區塊相同（`--bg-overlay`），視覺合為一體

**`.flow-grid`（4 個彩色區塊）：**

- portrait：`display: grid; grid-template-columns: 1fr 1fr`，2 × 2 排列
- landscape：`display: flex; flex-direction: column`，4 列各 `flex: 1` 等高

**各區塊（`.flow-card`）：**
- `padding: 16px 20px`
- `display: flex; flex-direction: column; justify-content: center`
- 標籤（`.flow-card-label`）：`font-size: var(--text-xl, 32px); font-weight: 700`
- 說明（`.flow-card-desc`）：`font-size: var(--text-lg, 28px); margin-top: 6px; opacity: 0.85`

**四個區塊內容與顏色：**

| 順序 | 標籤 | 說明文字 | 背景 token（fallback） | 文字 token（fallback） |
|---|---|---|---|---|
| 1 | 比對對象 | DB 全體已建檔人員 | `--bg-overlay` (`#dfe0e5`) | `--text-secondary` (`#5e6070`) |
| 2 | 新人入鏡 | 自動建檔・TTS「歡迎」 | `--badge-bg-info` (`#e8f0fc`) | `--color-info` (`#2a6bb8`) |
| 3 | 已建檔者 | TTS 播報姓名・寫簽到紀錄 | `--badge-bg-pass` (`#e8fcef`) | `--color-pass` (`#1e8050`) |
| 4 | 模糊臉 | 寫 event 待管理員 review | `--badge-bg-warn` (`#fcf5e8`) | `--color-warn` (`#8a7020`) |

Portrait 2×2 排列順序：左上=比對對象、右上=新人入鏡、左下=已建檔者、右下=模糊臉。

---

## § 4 不動的部分

- `face-checkin-template.js`：完全不改，JS 繼續把 header + video + overlay 注入 `#app`
- `shared/tokens.css`：不改，直接 link 使用
- `shared/face-ui.css`：不改，繼續由 JS template 動態注入到 `#app`
- `service-worker.js`：改版號（v18 → v19）讓瀏覽器更新快取

---

## § 5 Scope

僅修改 `example-checkin.html`。`example-alert.html` 為獨立的後續工作，設計相同但四個區塊內容不同（不在本 spec 範圍內）。
