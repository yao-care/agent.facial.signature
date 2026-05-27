# 報表「已登錄」追蹤 Design Spec

**Goal:** 在服務紀錄報表每列加一個「已登錄」勾選框，讓管理者把已貼進社會局平台的列標記起來；標記持久化在瀏覽器，已登錄列變灰、「是否平台已登錄」欄自動填 Y，並可一鍵隱藏已登錄列只看未處理的。

**Architecture:** 在 IndexedDB `settings` store 存一筆「已登錄 row-key 清單」。`report-aggregate.js` 為每列加 `_key`（即彙總分組 key）。報表 tab 讀清單疊加狀態（勾選、變灰、Y），勾選即寫回。彙總邏輯保持純、不碰登錄狀態。

**Tech Stack:** 純前端 PWA、IndexedDB（settings store）、vitest。無新增函式庫。

---

## § 1 持久化

每列 B 表 = 一組 `(personId, 活動日期, 情境, 時段)`，即 `report-aggregate.js` 內部的彙總分組 key。用它當「已登錄」識別碼。

新增 `shared/face-store-report.js`（settings store，**不改 schema**），記錄 `{ id: 'reportRegistered', keys: [...] }`：

```js
export async function getRegisteredKeys(db) {
  const rec = await db.get('settings', 'reportRegistered');
  return new Set(rec?.keys || []);
}
export async function setRegistered(db, rowKey, registered) {
  const rec = await db.get('settings', 'reportRegistered');
  const set = new Set(rec?.keys || []);
  if (registered) set.add(rowKey); else set.delete(rowKey);
  await db.put('settings', { id: 'reportRegistered', keys: [...set] });
  return set;
}
```

從 `shared/face-store.js` 匯出。`listScenarioConfigs` 用前綴過濾不受影響（`reportRegistered` 無 `scenarioConfig:` 前綴，本來就被排除）。

---

## § 2 report-aggregate 加 `_key`

`aggregateServiceRecords` 為每列加一個 `_key` 欄位，值＝該列的彙總分組 key（`${personId}\x00${dateKey}\x00${scenario}\x00${時段}`，與既有分組同一把 key）。

- `_key` 是 row 物件 metadata，**不在 `B_TABLE_COLUMNS` 內**，不顯示、不被複製。
- 彙總邏輯其餘不變、仍為純函式（不讀 IndexedDB / 登錄狀態）。

---

## § 3 報表畫面（admin-tab-report.js）

### 3.1 篩選列
既有「起／迄／情境編號」（即時更新）外，加一個 checkbox **「隱藏已登錄」**（`#rpt-hide-done`），改動即時重繪。

### 3.2 表格
- 最左加一欄表頭「登錄」（**不屬於 B 表 18 欄**）。
- 每列最左一個 `<input type="checkbox" data-key="...">`，`checked` = 該列 `_key` 在已登錄清單中。
- render 時讀 `getRegisteredKeys(db)`：
  - 已登錄列 → 加 class `report-row-done`（變灰）。
  - 已登錄列的「是否平台已登錄」欄顯示 **Y**；未登錄顯示空白。
  - 「隱藏已登錄」開啟時，已登錄列不渲染。

### 3.3 互動
- 勾選/取消 checkbox → `setRegistered(db, key, checked)` → 重繪（反映變灰、Y、隱藏）。

### 3.4 與複製的配合
- checkbox 欄在最左、獨立於 B 表欄；框選複製時從「流水號」欄起選即排除它。
- 已登錄列的「是否平台已登錄」欄帶 Y——正是平台要的值，複製貼回正確。

---

## § 4 樣式（app.css）

```css
.report-row-done td { color: var(--text-muted); background: var(--bg-overlay); }
```

---

## § 5 不變

- B 表 18 欄欄序、彙總邏輯、簽到=min/簽退=max、民國年、個案編號缺漏標紅：全部不變。
- 排程解析、人員、情境設定：不受影響。
- DB schema 不變（重用 settings store）。

---

## § 6 影響的檔案

| 檔案 | 動作 |
|---|---|
| `shared/face-store-report.js`（新） | getRegisteredKeys / setRegistered |
| `tests/face-store-report.test.js`（新） | store 讀寫測試 |
| `shared/face-store.js` | 匯出兩個函式 |
| `shared/report-aggregate.js` | 每列加 `_key` |
| `tests/report-aggregate.test.js` | 補測 `_key` 存在且穩定 |
| `shared/admin/admin-tab-report.js` | 登錄欄 checkbox + 變灰 + Y + 隱藏已登錄 toggle |
| `shared/app.css` | `.report-row-done` 樣式 |
| `service-worker.js` | APP_SHELL 加 face-store-report.js，bump VERSION |

---

## § 7 Scope

單一小 feature。實作：store（含測試）→ aggregate 加 _key（含測試）→ 報表 tab 串接 → SW + 驗證。
