# Facial Signature 簽到平台

純前端、瀏覽器資料、PWA 部署的人臉識別簽到平台。涵蓋簽到（模式 A）與警示（模式 B）兩種情境。設計規格見 [`docs/superpowers/specs/2026-05-23-facial-signature-design.md`](docs/superpowers/specs/2026-05-23-facial-signature-design.md)。

## 部署

### 方法 A：GitHub Pages / Netlify（推薦）

1. 把整個 repo 推到 GitHub
2. 啟用 GitHub Pages（settings → Pages → main branch / root）
3. 取得 `https://<user>.github.io/<repo>/admin.html`
4. 在裝置上打開 → 「加入主畫面」

### 方法 B：機構內網 HTTPS server

任何能提供 HTTPS 的靜態檔案 server（nginx、Caddy、樹莓派）皆可。檔案布署在 root 即可。

### ⚠️ 不可雙擊 HTML 開啟

`getUserMedia` 與 OPFS 都需要 secure context (`https://` 或 `http://localhost`)。`file://` 雙擊**無法用**。

## 加到主畫面操作

### iOS Safari

1. 用 Safari 開頁面
2. 分享按鈕 → 「加入主畫面」
3. 確認後桌面出現圖示，點圖示進入 standalone 模式
4. 首次進入請允許攝影機與聲音

### Android Chrome

1. 用 Chrome 開頁面
2. 右上選單 → 「安裝應用程式」或「加入主畫面」
3. 進入 standalone 後設定相機為「永久允許」

### Desktop Chrome / Edge

1. 網址列右側出現「安裝」圖示
2. 點擊安裝
3. 從應用程式啟動

## 設定相機永久允許

每次 standalone 啟動都要重新授權相機會嚴重影響 UX（尤其 iOS 較舊版本）。建議：

- **iOS**：設定 → Safari → 相機 → 對該網域選「允許」
- **Android**：Chrome → 網站設定 → 相機 → 永久允許
- **Desktop Chrome**：網址列鎖頭 → 相機 → 允許

## persistent storage 授權

瀏覽器可能在空間吃緊時清除 IndexedDB / OPFS 資料。本系統會在啟動時呼叫 `navigator.storage.persist()` 請求授權；若被拒絕，到 `admin.html` → 設定 & 校準 → 「請求授權」按鈕重試。

「加到主畫面」會大幅提升授權通過機率，務必先做。

## 第一次使用流程

1. 開啟 `admin.html`，到「設定 & 校準」確認 persistent storage 已授權
2. 建立至少一個 watchlist（如需警示）
3. 開啟 `example-checkin.html`，過 consent，第一個人臉自動建檔
4. 回 `admin.html` 為新建檔人員命名

## 重要前提

- **資料留在瀏覽器**：清快取 / 重灌系統 = 資料消失。**請定期至 admin → 匯出備份**。
- **首次連網下載模型**：當前使用 Human library 3.3.5 + FaceRes embedding，模型總大小約 12 MB，函式庫 ESM 約 2 MB。模型快取後離線可用。
- **準確度需上線後校準**。所有閾值在 admin → 設定 & 校準 可調，從預設值開始用真實資料逐步調整。
- **識別會錯**。系統用合併 / 拆分 / 校準工具補救誤判，請定期 review 待審 events。

## 合規責任聲明

本系統處理**生物特徵資料**（人臉特徵向量）。**部署方為個資控制者**，請依當地法規（台灣個資法 / GDPR / HIPAA 等）：

- 使用前向被識別者告知並取得同意
- 對長者、未成年人需依規定取得監護人同意
- 公共 kiosk 部署需評估他人接觸資料的風險
- 本系統不負責資料的法律合規，部署方須自行確認

## 開發

### 跑測試

```bash
npm install
npm test
```

### 本機跑 dev server

```bash
npm run serve              # python3 -m http.server
# 或
npm run serve:node         # npx http-server
```

開 `http://localhost:8000/admin.html`

## 已知 MVP 限制

- **拆分後新 person 的 vectors 從空開始**：需被識別者再次入鏡 + 管理員再次合併。v2+ 改善。
- **單一裝置使用**：無多裝置同步（架構決定，永久非目標）。
- **同時只能開一個 tab**：全平台級鎖。
- **模糊區 event 不自動建檔**：管理員到 events tab 審處後決定。

## 模型版本管理

當前 `MODEL_VERSION = 'human-3.3.5-faceres'`（見 `shared/face-engine.js`）。模型升級流程見 spec § 6.5。

## License

請填入。
