# example-checkin.html 畫面重新設計 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 將 example-checkin.html 改為 CSS grid 50/50 雙區塊版型，攝影機區與流程說明區各佔半個畫面，字級與顏色完全遵循 design token。

**Architecture:** `body` 改 CSS grid（portrait = rows 1fr 1fr，landscape = columns 1fr 1fr）。`#app` 為攝影機格（JS template 繼續控制其 innerHTML）；`.flow-section` 為靜態 HTML 格，含標題 + 4 個彩色大字區塊。`tokens.css` 直接 link 在 `<head>` 讓變數立即可用。JS template、tokens.css、face-ui.css 完全不動。

**Tech Stack:** HTML、CSS Grid、CSS custom properties（tokens.css）、Playwright（驗證）

---

## 修改檔案清單

| 檔案 | 動作 |
|---|---|
| `example-checkin.html` | 全部改寫 |
| `service-worker.js` | VERSION v18 → v19 |

---

### Task 1：改寫 example-checkin.html

**Files:**
- Modify: `example-checkin.html`（完整覆寫）

- [ ] **Step 1：用以下內容完整覆寫 `example-checkin.html`**

```html
<!doctype html>
<html lang="zh-TW">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no">
  <link rel="manifest" href="./manifest.json">
  <link rel="stylesheet" href="./shared/tokens.css">
  <title>簽到</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }

    body {
      margin: 0;
      height: 100vh;
      height: 100dvh;
      display: grid;
      overflow: hidden;
    }

    @media (orientation: portrait) {
      body { grid-template-rows: 1fr 1fr; }
    }
    @media (orientation: landscape) {
      body { grid-template-columns: 1fr 1fr; }
    }

    /* 攝影機格 */
    #app {
      position: relative;
      background: #000;
      overflow: hidden;
      min-height: 0;
      min-width: 0;
    }
    #app video {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    #app header {
      position: absolute;
      top: 0; left: 0;
      z-index: 10;
      padding: 8px 16px;
      background: oklch(0.10 0.01 250 / 0.55);
      border-radius: 0 0 10px 0;
    }
    #app header h1 {
      margin: 0;
      font-size: var(--text-sm);
      font-weight: 600;
      color: white;
    }
    #app .error {
      padding: 40px;
      text-align: center;
      color: var(--color-critical);
      font-size: var(--text-lg);
    }
    #app .readonly {
      padding: 40px;
      text-align: center;
      color: var(--text-secondary);
      font-size: var(--text-lg);
    }

    /* 流程說明格 */
    .flow-section {
      display: flex;
      flex-direction: column;
      overflow: hidden;
      min-height: 0;
      min-width: 0;
    }

    .flow-title {
      flex-shrink: 0;
      padding: 16px 20px 8px;
      font-size: var(--text-3xl);
      font-weight: 700;
      color: var(--text-primary);
      background: var(--bg-overlay);
      line-height: 1.2;
    }

    .flow-grid {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
    }
    @media (orientation: portrait) {
      .flow-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
      }
    }

    .flow-card {
      flex: 1;
      padding: 16px 20px;
      display: flex;
      flex-direction: column;
      justify-content: center;
      min-height: 0;
    }
    .flow-card-label {
      margin: 0;
      font-size: var(--text-xl);
      font-weight: 700;
      line-height: 1.2;
    }
    .flow-card-desc {
      margin-top: 6px;
      font-size: var(--text-lg);
      opacity: 0.85;
      line-height: 1.3;
    }

    /* 各區塊顏色 */
    .flow-card-scope  { background: var(--bg-overlay);      color: var(--text-secondary); }
    .flow-card-new    { background: var(--badge-bg-info);   color: var(--color-info); }
    .flow-card-match  { background: var(--badge-bg-pass);   color: var(--color-pass); }
    .flow-card-fuzzy  { background: var(--badge-bg-warn);   color: var(--color-warn); }
  </style>
</head>
<body>
  <div id="app"></div>
  <section class="flow-section">
    <div class="flow-title">示範簽到場景</div>
    <div class="flow-grid">
      <div class="flow-card flow-card-scope">
        <div class="flow-card-label">比對對象</div>
        <div class="flow-card-desc">DB 全體已建檔人員</div>
      </div>
      <div class="flow-card flow-card-new">
        <div class="flow-card-label">新人入鏡</div>
        <div class="flow-card-desc">自動建檔・TTS「歡迎」</div>
      </div>
      <div class="flow-card flow-card-match">
        <div class="flow-card-label">已建檔者</div>
        <div class="flow-card-desc">TTS 播報姓名・寫簽到紀錄</div>
      </div>
      <div class="flow-card flow-card-fuzzy">
        <div class="flow-card-label">模糊臉</div>
        <div class="flow-card-desc">寫 event 待管理員 review</div>
      </div>
    </div>
  </section>
  <script type="module">
    import { registerSW } from './shared/sw-register.js';
    import { runCheckin } from './shared/face-checkin-template.js';
    registerSW();
    const config = await fetch('./configs/example-checkin.json').then(r => r.json());
    runCheckin(config, document.getElementById('app'));
  </script>
</body>
</html>
```

---

### Task 2：Bump Service Worker 版本

**Files:**
- Modify: `service-worker.js`（第 4 行）

- [ ] **Step 1：將 VERSION v18 改為 v19**

```js
const VERSION = 'v19';
```

---

### Task 3：Commit + Push + 等 Actions 完成

**Files:** 以上兩個檔案

- [ ] **Step 1：Commit**

```bash
git add example-checkin.html service-worker.js
git commit -m "feat: checkin page redesign — CSS grid 50/50 雙區塊版型"
```

- [ ] **Step 2：Push**

```bash
git push
```

- [ ] **Step 3：等 GitHub Actions 部署完成**

```bash
gh run list --repo yao-care/agent.facial.signature --limit 1
```

預期輸出：`completed  success  ...  Deploy to GitHub Pages`

---

### Task 4：Playwright 視覺驗證

**Files:** 無（純驗證）

- [ ] **Step 1：截圖 portrait（1080×1920 模擬直立手機）**

```js
// 用 Playwright navigate + resize + screenshot
// URL: https://sign.yao.care/example-checkin.html
// viewport: width=390, height=844
// fullPage: true
```

確認：
- 上半是攝影機（黑底或畫面），左上角有半透明標題 overlay
- 下半是 2×2 彩色格，字夠大（目視約 32px 的標籤文字）
- 無捲動條，無內容溢出

- [ ] **Step 2：截圖 landscape（1280×720 模擬橫向桌電）**

```js
// viewport: width=1280, height=720
```

確認：
- 左半攝影機，右半 4 列彩色格縱向排列
- 標題「示範簽到場景」出現在右半頂部（灰底大字）
- 無任何破版
