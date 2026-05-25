# Facial Signature 簽到平台

純前端、瀏覽器資料、PWA 部署的人臉識別簽到平台。涵蓋兩種模式：

- **簽到** — 偵測到臉 → 識別/建檔 → 寫一筆紀錄。涵蓋長者報到、活動簽到、員工出勤、訪客登記、課程點名、接送、發藥核對等。
- **警示** — 偵測到臉 → 比對指定名單 → 命中主動跳警示。涵蓋走失預警、黑名單監看。

設計規格見 [`docs/superpowers/specs/2026-05-23-facial-signature-design.md`](docs/superpowers/specs/2026-05-23-facial-signature-design.md)。

**Live**：https://sign.yao.care/

---

## 系統頁面

| 頁面 | 用途 |
|---|---|
| `/admin.html` | 管理介面（5 個 tab：人員 / 紀錄 / 警示名單 / 校準參數 / 系統工具） |
| `/example-checkin.html` | 簽到示範頁（搭配 `configs/example-checkin.json`） |
| `/example-alert.html` | 警示監看示範頁（搭配 `configs/example-watchlist.json`） |
| `/`（index） | 自動轉到 admin |

要新增情境，複製 example HTML + config，改 scenarioId / scenarioName / watchlistId 等即可（細節見 [`docs/superpowers/specs/2026-05-23-facial-signature-design.md`](docs/superpowers/specs/2026-05-23-facial-signature-design.md) § 7）。

---

## 部署

### 方法 A：GitHub Pages（推薦）

1. Push repo 到 GitHub
2. Settings → Pages → Source 選「GitHub Actions」（workflow 已包含在 `.github/workflows/pages.yml`）
3. push 後 1-2 分鐘 Actions 自動部署，URL：`https://<user>.github.io/<repo>/`

自訂網域：repo 已有 `CNAME` 檔（內含 `sign.yao.care`），DNS 加一筆 `CNAME sign → <user/org>.github.io` 即可。

### 方法 B：機構內網 HTTPS server

任何 HTTPS 靜態檔案 server（nginx、Caddy、樹莓派）皆可。檔案放 root 即可。

### ⚠️ 不可雙擊 HTML 開啟

`getUserMedia` 與 OPFS 都需要 secure context (`https://` 或 `http://localhost`)。`file://` 雙擊**無法用**。

---

## 加到主畫面（PWA）

### iOS Safari
1. Safari 開頁面
2. 分享按鈕 → 「加入主畫面」
3. 桌面圖示點進去 = standalone 模式
4. 首次進入請允許攝影機

### Android Chrome
1. Chrome 開頁面
2. 右上選單 → 「安裝應用程式」
3. 設定 → 網站設定 → 相機 → 永久允許

### Desktop Chrome / Edge
1. 網址列右側「安裝」圖示
2. 從應用程式啟動

### 設定相機永久允許

不然每次 standalone 啟動都要重新授權相機，體驗很差。
- **iOS**：設定 → Safari → 相機 → 對該網域選「允許」
- **Android**：Chrome → 網站設定 → 相機 → 永久允許
- **Desktop**：網址列鎖頭 → 相機 → 允許

### Persistent storage

瀏覽器可能在空間吃緊時清除 IDB / OPFS 資料。本系統會在啟動時呼叫 `navigator.storage.persist()`；若被拒絕，到 admin → 系統工具 → 「請求授權」按鈕重試。**「加到主畫面」會大幅提升授權通過機率**。

---

## 第一次使用流程

1. 開 `admin.html`，到「**系統工具**」確認 persistent storage 已授權
2. 若要警示，到「**警示名單**」建立一個名單（從下拉選預設類型，例如「高風險走失 / highrisk」）
3. 開 `example-checkin.html`：選「開啟語音播報」或「不用」→ 允許相機 → 對著鏡頭 → 等圓圈轉一圈 → 自動建檔
4. 回 `admin.html` → 「**人員**」tab 為新建檔的人命名（直接改 input → 點儲存）
5. 想記電話、關係、聯絡人等：點該人員「備註」欄打開編輯器，按 + 新增欄位
6. 再次入鏡 → 應認得 + TTS 播報「{姓名} {時段問候}」（早安 / 午安 / 晚安）

---

## 管理介面（admin.html）

### 人員 tab
- 列出所有人員，依「最後簽到」時間排序
- **近 3 日簽到**欄位顯示「5/25 10 次 / 5/24 2 次 / 5/23 3 次」格式（0 次不顯示）；點按鈕跳轉到紀錄 tab 並篩該人
- 姓名 inline 編輯，按「儲存」存
- 備註欄可開 modal 自由新增 key-value（電話、關係、緊急聯絡人、地址、年齡、性別…）。系統會在新人建檔時自動填入「年齡」「性別」（Human library 預測）
- 操作：合併 / 拆分 / 刪除
- 篩選：未命名 / 已命名、辨識模型版本（單版本時隱藏）、搜尋姓名 / 備註

### 紀錄 tab
- 所有簽到/警示 events 列表（最多 200 筆，依時間排序）
- 篩選：類型（簽到/警示）、結果（命中/新人/模糊/警示命中）、未審模糊區、場合
- 從人員 tab 跳轉時自動顯示「正在查看 X 的紀錄」橫幅 + [取消篩選] 按鈕
- 模糊區紀錄背景反白；可逐筆指派 / 建檔 / 忽略，meta.reviewOutcome 記錄結局

### 警示名單 tab
- 下拉選預設名單類型（高風險走失 / 失智長者 / 黑名單 / 重要訪客 / 員工 / 志工 / 家屬 / 自訂）
- 每個名單顯示成員清單；加入新成員用下拉選人員（不用打 ID）

### 校準參數 tab
- 4 個分組卡片：採樣 / 比對 / 容量 / 系統
- 數字參數可改；資料庫版本唯讀
- 按鈕 sticky 在底部

### 系統工具 tab
- **左欄**：儲存狀態（持久儲存、用量）+ 清理孤兒快照 + 備份/還原
- **右欄**：相似度測試器 — 挑兩位人員，顯示照片 + 計算最高 cosine + 自動判斷「視為同一人 / 不同人 / 模糊區」

---

## 重要前提

- **資料留在瀏覽器**：清快取 / 重灌系統 = 資料消失。**請定期 admin → 系統工具 → 匯出備份**。
- **首次連網下載模型**：當前用 Human library v3 FaceRes embedding，模型總大小約 12 MB，函式庫 ESM 約 2 MB。模型快取後離線可用。
- **準確度需上線後校準**：預設閾值是經驗起始值（matchThreshold 0.55、newPersonThreshold 0.35、contaminationGuard 0.65）。請用真實資料於「校準參數」tab 調整。
- **識別會錯**：合併 / 拆分 / 校準工具就是為此存在。請定期 review 模糊區紀錄。
- **資料庫已部署過的版本不會自動升級**：tuning 欄位改動只影響新建立的瀏覽器資料；既有使用者的 tuning 仍是他們上次儲存的值。

---

## 合規責任聲明

本系統處理**生物特徵資料**（人臉特徵向量）。**部署方為個資控制者**，請依當地法規（台灣個資法 / GDPR / HIPAA 等）：

- 使用前向被識別者告知並取得同意（系統已內建 consent dialog，需在 config 開啟）
- 對長者、未成年人需依規定取得監護人同意
- 公共 kiosk 部署需評估他人接觸資料的風險
- 本系統不負責資料的法律合規，部署方須自行確認

---

## 已知 MVP 限制

- **拆分後新 person 的 vectors 從空開始**：需被識別者再次入鏡 + 管理員再次合併。v2+ 改善。
- **單一裝置使用**：無多裝置同步（架構決定，永久非目標）。
- **同時只能開一個 tab**：全平台級鎖（用 `navigator.locks`，後開的進唯讀）。
- **模糊區 event 不自動建檔**：管理員到 events tab 審處後決定。

---

## 開發

### 跑測試（vitest，無相機需求）

```bash
npm install
npm test
```

### 本機 dev server

```bash
npm run serve              # python3 -m http.server
# 或
npm run serve:node         # npx http-server
```

開 `http://localhost:8000/admin.html`

### 模型版本管理

當前 `MODEL_VERSION = 'human-3.3.5-faceres'`（見 `shared/face-engine.js`）。模型升級時舊向量無法用新模型比對，升級流程見 spec § 6.5（系統自動把舊人當新人，admin 提供「v1 → v2 合併」入口）。

---

## License

請填入。
