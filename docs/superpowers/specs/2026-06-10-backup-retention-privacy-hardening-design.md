# 備份／保留生命週期隱私強化 — 設計 spec

- 日期：2026-06-10
- 狀態：設計核可，待 implementation plan
- 觸發來源：資安掃描 20260610-044842-f661 之隱私強化建議（非掃描器漏洞，屬合規強化）

## §0 背景與定位約束

facial.signature 是純前端 PWA、資料留瀏覽器、零雲端的長者報到系統，處理**臉部特徵向量（特種個資）**。本案針對「備份／資料保留生命週期」做三項隱私強化，全部在既有架構內，**不改變系統定位**（仍不上雲、不存身分證等完整 PII）。

依紀律：所有閾值為**可校準起始值非法定值**（呼應 `face-store-tuning.js` 既有「起始值仍屬 placeholder 性質」註解與 [[no-placeholder-numbers]]）。

## §1 範圍與非目標

**範圍**（三項獨立但同屬備份／保留生命週期）：
- A. 匯出加密強化（明文防呆 + 補測試）
- B. 退冊生物特徵自動清除（依未簽到天數）
- C. 匯出提醒（距上次匯出天數告警）

**非目標**：
- 不做雲端備份／排程（client-side PWA 無 server，架構決定）
- 不改加密演算法本身（`exportAll`/`importAll` 的 PBKDF2+AES-GCM 已實作且正確）
- 不新增 person 的「退冊」狀態欄位（退冊純依活動推導，見 §3）

---

## §2 Feature A — 匯出加密強化

### 現況（查證結果）
加密**已完整實作且 UI 已接線**：`exportAll(db, {password})` → PBKDF2 200k + AES-GCM-256（`face-store-export.js`）；`importAll` 自動偵測 PK 標頭並解密；admin `#export-pwd`/`#import-pwd` 已傳值（`admin-tab-system.js:154-173`）。殘留缺口僅兩點：

### A1. 明文防呆
匯出 handler（`admin-tab-system.js` 的 `#export-btn`）在 `pwd` 為空時，先跳確認對話框：

> 「未設密碼會匯出**未加密**的明文備份，內含長者臉部特徵。建議設定密碼。仍要繼續匯出明文嗎？」

確認才繼續匯出明文 `.zip`；取消則中止。有密碼則照舊直接匯出 `.bin`。用 `confirm()`（與既有匯入確認一致）即可，不需新 UI。

### A2. 補測試
`tests/face-store-export-import.test.js` 新增：
- 加密往返：`exportAll(db,{password:'p'})` → `importAll(db2, blob, {password:'p'})` → 人員/向量/事件一致
- 錯誤密碼：以錯誤密碼 import 加密檔 → reject
- 缺密碼：加密檔（非 PK 標頭）無密碼 import → throw `encrypted backup requires password`

---

## §3 Feature B — 退冊生物特徵自動清除

### 判定（純依活動，不加狀態欄）
某人「最後活動時間」`lastActivity = max(該人所有 events.timestamp)`；若無任何 event 則用 `person.createdAt`。
`daysInactive = floor((now − lastActivity) / 86400000)`。
**符合清除**＝ `daysInactive ≥ bioRetentionDays` **且** 該人尚有向量（`vectors.length > 0`）。

### 清除動作（只刪生物特徵，留統計）
對每位符合者：
- `person.vectors = []`、`person.updatedAt = now`，`put` 回 people
- 刪除該人 events 所引用的 OPFS 快照（蒐集其 events 的 `snapshotId`，逐一 `deleteSnapshot`）
- **保留** person 記錄（姓名／meta／個案編號）與所有 events → 報表／B 表／已登錄追蹤完全不受影響

清除後該人向量為空，下次入鏡會被當新人重新建檔（與既有「拆分後空向量」行為一致，非資料毀損）。

### 觸發
1. **自動**：admin 載入時掃描並執行（**新增行為**——既有孤兒快照 GC 為手動按鈕，本功能額外引入啟動自動清除以落實最小化，不依賴管理者記得按）。執行後以 toast 告知清除筆數。
2. **手動**：系統工具新增「立即執行退冊清除」按鈕。

### 程式碼落點
`face-store-gc.js` 新增（與既有 GC 並列）：
- `scanInactiveBiometrics(db, { retentionDays, now })` → 回傳 `[{ personId, displayName, daysInactive }]`（唯讀，供預覽／稽核）
- `purgeInactiveBiometrics(db, { retentionDays, now })` → 執行清除，回傳 `{ purgedCount, personIds }`

### 稽核紀錄
寫入 settings 的 `maintenance` 文件（見 §5）：`lastBioPurgeAt`、`lastBioPurgeCount`。系統工具顯示「上次退冊清除：日期（N 筆）」，並可預覽「即將／已符合清除」名單。

### 邊界
- 向量已空者：跳過（不重複處理、不再刪快照）
- 全部不符合：toast「無符合退冊清除的人員」
- `bioRetentionDays` 經 `getTuning` 取得（預設 180，可調）

---

## §4 Feature C — 匯出提醒

- 匯出成功後（A1 之後、`a.click()` 後）寫 `maintenance.lastExportAt = Date.now()`
- 系統工具「儲存狀態」區顯示「距上次匯出備份：N 天」
  - `N > exportReminderDays`（預設 7）→ 套警示色（沿用既有 warn 樣式）
  - 從未匯出（無 `lastExportAt`）→ 顯示「尚未匯出備份」並套警示色
- 純顯示提醒，不阻擋任何操作

---

## §5 資料模型變更彙整

### tuning（`DEFAULT_TUNING` in `face-store-tuning.js`）
新增兩個可校準參數：
- `bioRetentionDays: 180` — 退冊清除未簽到天數門檻（規範依據：個資法第 5/11 條目的必要原則；生物特徵屬敏感個資，越短越合最小化；實務可辯護上限約 365 天。180 為保守起始值，依據點出席週期校準）
- `exportReminderDays: 7` — 超過此天數未匯出即告警

兩者經 `getTuning`/`putTuning` 既有合併機制讀寫，無需 schema migration。

### settings 新增 `maintenance` 文件
`{ id: 'maintenance', lastExportAt: <ms|null>, lastBioPurgeAt: <ms|null>, lastBioPurgeCount: <number|0> }`
不存在時視為全 null（首次）。

## §6 UI 變更

### 系統工具 tab（`admin-tab-system.js`）
- 「儲存狀態」區加「距上次匯出 N 天」（C，含告警色）
- 新增退冊清除卡：顯示「上次退冊清除：日期（N 筆）」+「即將符合清除」預覽 + 「立即執行退冊清除」按鈕（B）
- 匯出按鈕加明文防呆 confirm（A1）

### 校準參數 tab
- 「系統」分組加 `bioRetentionDays`、`exportReminderDays` 兩個可改數字欄（屬保留／提醒生命週期參數，歸「系統」；沿用既有 tuning 編輯機制）

## §7 測試計畫（vitest）

- `face-store-export-import.test.js`：加密往返 / 錯誤密碼 / 缺密碼（A2）
- `face-store-gc.test.js`：`scanInactiveBiometrics` 正確篩選（含 fallback createdAt、邊界等於門檻）、`purgeInactiveBiometrics` 只清向量+快照且保留 person/events、向量已空者跳過（B）
- 匯出提醒天數計算（純函式，必要時抽出可測）（C）
- 既有 85 測試不得回歸

## §8 部署

- 本案僅**編輯既有** `shared/*.js`，不新增檔案 → `service-worker.js` 的 `APP_SHELL` 不變
- 完成後 **bump SW VERSION v30 → v31**（否則瀏覽器吃舊快取）
- push main → GitHub Actions 部署 → Playwright 連續 navigate 兩次驗證

## §9 風險

- **自動清除誤判暫離長者**：使用者已知並接受（純活動判定）；代價僅重新入鏡建檔，不丟統計歷史 → 風險可接受。180 天門檻容忍多數住院／出遊情境。
- **自動觸發於 admin 載入**：清除為破壞性（刪向量+快照不可逆）。緩解：清除後 toast 告知筆數 + 系統工具留稽核紀錄 + 提供唯讀預覽名單，管理者可事後檢視。
