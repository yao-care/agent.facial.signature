# 資安掃描修補與標頭層風險接受紀錄

對應 ZAP web 掃描（`sign.yao.care`，深度 deep）。本文件記錄修補結果，
以及 HTTP 回應標頭層發現的**風險接受決策**。掃描豁免規則見 `docs/.zap/rules.tsv`。

## 系統前提

`agent.facial.signature` 為**純前端 PWA**，部署於 **GitHub Pages**：

- 零雲端、零網路外送；模型本地內嵌（`vendor/human/models`）。
- 無伺服器端、無逐人資料 API；生物特徵與報到資料全在 **client 端 IndexedDB／OPFS**，
  不出現在任何 HTTP 回應中。
- `sign.yao.care` 為 GitHub Pages 自訂網域，**未經 Cloudflare 前置**，
  因此**無法設定任何自訂 HTTP 回應標頭**，亦無法於 edge 注入。

## 已修復並上線（main / GitHub Pages）

| 發現 | 處置 | 狀態 |
|---|---|---|
| 🟠 10038 CSP Header Not Set | 4 個 HTML 以 `<meta http-equiv="Content-Security-Policy">` 交付 CSP（`default-src 'self'`、`object-src 'none'`、`base-uri 'self'`、`form-action 'self'` 等；放行 Human wasm `'wasm-unsafe-eval'`、face/fflate blob worker、縮圖 blob）| ✅ CSP 內容層已建立（SW `v32`） |

CSP 以 `<meta http-equiv>` 交付（GitHub Pages 唯一可行方式），已用 Playwright 實測：
example-checkin 的 WebAssembly 編譯、blob worker、inline module 水合、Service Worker 接管
皆正常，**零 CSP 違規**；admin 7 分頁正常掛載；94 個 vitest 全過。

> ⚠️ **限制**：ZAP 10038 為標頭層被動檢測，meta 非回應標頭，重掃時此項**可能仍報 WARN**；
> 真正消除需在站台前置可設標頭的一層（見下方途徑）。本次的實質收穫是 CSP 保護已實際存在。

## 風險接受：標頭層發現

下列發現屬 **HTTP 回應標頭層**，GitHub Pages（純前端、不允許自訂回應標頭、未經 Cloudflare）
**物理上無法修復**。經評估**接受風險**，於 `docs/.zap/rules.tsv` 降為 WARN：

| ZAP | 發現 | 風險評估 |
|---|---|---|
| 10020 | Clickjacking（`X-Frame-Options` / `frame-ancestors`）| 標頭層才生效（meta 的 `frame-ancestors` 被瀏覽器忽略）。站台純靜態、回應不含逐人資料，UI redressing 風險有限。 |
| 10021 | 缺 `X-Content-Type-Options: nosniff` | 縱深防禦缺口；資源皆自託管、MIME 正確，非直接可利用。 |
| 10035 | 缺 HSTS | **GitHub Pages 自訂網域即使開 Enforce HTTPS 也不送 HSTS 標頭**，僅做 HTTP→HTTPS 轉址。自訂網域要 HSTS 只能靠前置一層。 |
| 10055 | CSP `unsafe-inline` | 頁面仍有 inline `<style>`／`<script type=module>`，CSP 必須保留 `'unsafe-inline'`。屬縱深防禦弱化，非直接可利用；外部化 inline 或改 hash 後可清除。 |
| 10063 | 缺 `Permissions-Policy` | 標頭層；無 meta 對應。縱深防禦缺口。 |
| 10098 | CORS `Access-Control-Allow-Origin: *` | GitHub CDN 固定回傳、不可改。回應不含伺服器端機密，跨域無可竊取之物。 |
| 90004 / 90005 | 缺 COEP / COOP | 標頭層；無 meta 對應。縱深防禦缺口。 |

## 完全消除標頭層發現的途徑（未採用，待決）

> 2026-06-11 評估時曾提出以下選項，當次選擇「維持純 GitHub Pages，只加 CSP meta」。
> 若日後要把標頭層發現完全清掉，採下列任一：

- **方案 A（最輕）**：把 `sign.yao.care` 改為**橘雲代理經 Cloudflare**（GitHub Pages 仍當 origin，
  SSL 模式設 Full），加一條 **Response Header Transform Rule**，於 edge 一次補上
  X-Content-Type-Options、Permissions-Policy、COOP/COEP、X-Frame-Options、HSTS，
  並可覆寫 CORS 的 `ACAO:*`。不動 hosting 與部署流程。
- **方案 B**：把本子網域 hosting 改到可設標頭的 host（Cloudflare Pages / Netlify / Vercel，CNAME 即可），
  以 `_headers` / `vercel.json` 宣告所有安全標頭，保留現有 meta CSP。
- **方案 C（補強 10055）**：把各頁 inline `<style>`／`<script type=module>` 外部化或改為 hash-based CSP，
  即可移除 `'unsafe-inline'` 並從 `rules.tsv` 拿掉 10055（參考 `smart-func-cds` 的 Astro 每頁雜湊做法）。
