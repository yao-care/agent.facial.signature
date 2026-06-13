# 部署與上線驗證

## 部署前必做（改前端就要照做）

1. **改 `shared/app.css` 或 `shared/**/*.js` 之後，一定要 bump `service-worker.js` 的 `VERSION`**。沒升版號 = 瀏覽器吃舊快取，「為什麼改了沒效果」99% 是這個。
2. **新增的 `.js` 檔要加進 `service-worker.js` 的 `APP_SHELL`**，否則離線／PWA 模式拿不到。

## 部署方式

### 方法 A：GitHub Pages（正式環境用這個）

- push 到 `main` → GitHub Actions（`.github/workflows/pages.yml`）自動部署 → `https://sign.yao.care/`。
- 自訂網域靠 repo 內的 `CNAME` 檔（內含 `sign.yao.care`），DNS 加一筆 `CNAME sign → <user/org>.github.io`。
- Settings → Pages → Source 選「GitHub Actions」。

### 方法 B：機構內網 HTTPS server

任何 HTTPS 靜態檔案 server（nginx、Caddy、樹莓派）皆可，檔案放 root。

### ⚠️ 不可雙擊 HTML 開啟

`getUserMedia` 與 OPFS 都需要 secure context（`https://` 或 `http://localhost`）。`file://` 雙擊**無法用**攝影機。

## 上線後 Playwright 驗證

部署後驗證要**連續 navigate 同一個 URL 兩次**：

1. 第一次載入觸發 SW 更新（v(n-1) → v(n)），SW 自動 reload。
2. 第二次才真的看到新版。

## 踩雷點

- **SW 自動 reload 會打斷首次點擊**：`shared/sw-register.js` 有 `controllerchange → location.reload()`。部署後首次載入新 SW 接管時會整頁重載。若剛好撞到「開啟語音播報」第一次點擊，看起來像「按鈕導致導向」，其實是 SW 更新。**診斷時不要先懷疑按鈕。**
