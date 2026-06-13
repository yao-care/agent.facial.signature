# 維運：PWA 安裝、儲存／相機授權、已知限制、踩雷點

## 加到主畫面（PWA）

### iOS Safari
1. Safari 開頁面 → 分享按鈕 → 「加入主畫面」
2. 桌面圖示點進去 = standalone 模式；首次進入請允許攝影機

### Android Chrome
1. Chrome 開頁面 → 右上選單 → 「安裝應用程式」
2. 設定 → 網站設定 → 相機 → 永久允許

### Desktop Chrome / Edge
1. 網址列右側「安裝」圖示 → 從應用程式啟動

## 設定相機永久允許

不然每次 standalone 啟動都要重新授權相機，體驗很差。

- **iOS**：設定 → Safari → 相機 → 對該網域選「允許」
- **Android**：Chrome → 網站設定 → 相機 → 永久允許
- **Desktop**：網址列鎖頭 → 相機 → 允許

## Persistent storage

瀏覽器可能在空間吃緊時清除 IDB / OPFS 資料。系統啟動時會呼叫 `navigator.storage.persist()`；若被拒，到 admin → 系統工具 → 「請求授權」重試。**「加到主畫面」會大幅提升授權通過機率。**

## 部署前必知的資料前提

- **資料留瀏覽器**：清快取／重灌 = 資料消失，請定期 admin → 系統工具 → 匯出備份。
- **準確度需上線後校準**：預設閾值是經驗起始值，請用真實資料在「校準參數」tab 調整。
- **資料庫已部署過的版本不會自動升級**：tuning 欄位改動只影響新建立的瀏覽器資料；既有使用者的 tuning 仍是他們上次儲存的值。

## 已知 MVP 限制

- **拆分後新 person 的 vectors 從空開始**：需被識別者再次入鏡 + 管理員再次合併（v2+ 改善）。
- **單一裝置使用**：無多裝置同步（架構決定，永久非目標）。
- **同時只能開一個 tab**：全平台級鎖（`navigator.locks`，後開的進唯讀）。
- **模糊區 event 不自動建檔**：管理員到 events tab 審處後決定。

## 踩雷點

- **`_key` 含 `\x00` 不能放進 HTML 屬性**：report-aggregate 的 row `_key` 用 null-char 分隔（穩健分組），HTML 屬性會剝除 null byte → 用 `data-idx`（列索引）對應 `currentRows[idx]._key`。
- **CSS 只有一份 `shared/app.css`**：所有頁面都載它，改完務必 bump SW VERSION（見 [`deploy-and-verify.md`](deploy-and-verify.md)）。
