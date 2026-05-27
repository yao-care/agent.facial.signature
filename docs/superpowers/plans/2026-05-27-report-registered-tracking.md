# 報表「已登錄」追蹤 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 服務紀錄報表每列加「已登錄」勾選框，標記持久化於瀏覽器；已登錄列變灰、「是否平台已登錄」欄填 Y，並可隱藏已登錄列。

**Architecture:** IndexedDB settings store 存已登錄 row-key 清單。`report-aggregate.js` 每列加 `_key`。報表 tab 讀清單疊加狀態。checkbox 用 `data-idx`（列索引）對應 row（避免 `_key` 內 `\x00` 進 HTML 屬性被剝除）。

**Tech Stack:** 純前端 PWA、IndexedDB、vitest。無新增函式庫。

依據 spec：`docs/superpowers/specs/2026-05-27-report-registered-tracking-design.md`

---

## 檔案結構

| 檔案 | 責任 |
|---|---|
| `shared/face-store-report.js`（新） | getRegisteredKeys / setRegistered（settings store） |
| `tests/face-store-report.test.js`（新） | store 讀寫測試 |
| `shared/face-store.js` | 匯出兩函式 |
| `shared/report-aggregate.js` | 每列加 `_key` |
| `tests/report-aggregate.test.js` | 補測 `_key` |
| `shared/admin/admin-tab-report.js` | 登錄欄 + 變灰 + Y + 隱藏已登錄 |
| `shared/app.css` | `.report-row-done` 樣式 |
| `service-worker.js` | APP_SHELL + bump VERSION |

---

### Task 1：face-store-report.js（已登錄清單 store）

**Files:** Create `shared/face-store-report.js`, `tests/face-store-report.test.js`; Modify `shared/face-store.js`

- [ ] **Step 1：寫失敗測試 `tests/face-store-report.test.js`**

```js
import { describe, it, expect, beforeEach } from 'vitest';
import { openFaceDb, DB_NAME } from '../shared/face-store-schema.js';
import { getRegisteredKeys, setRegistered } from '../shared/face-store-report.js';

beforeEach(() => { indexedDB.deleteDatabase(DB_NAME); });

describe('report registered', () => {
  it('初始為空', async () => {
    const db = await openFaceDb();
    expect((await getRegisteredKeys(db)).size).toBe(0);
    db.close();
  });
  it('set true 加入、set false 移除', async () => {
    const db = await openFaceDb();
    await setRegistered(db, 'k1', true);
    await setRegistered(db, 'k2', true);
    expect([...(await getRegisteredKeys(db))].sort()).toEqual(['k1', 'k2']);
    await setRegistered(db, 'k1', false);
    expect([...(await getRegisteredKeys(db))]).toEqual(['k2']);
    db.close();
  });
  it('set true 具冪等性', async () => {
    const db = await openFaceDb();
    await setRegistered(db, 'k1', true);
    await setRegistered(db, 'k1', true);
    expect([...(await getRegisteredKeys(db))]).toEqual(['k1']);
    db.close();
  });
});
```

- [ ] **Step 2：跑測試確認失敗**

Run: `npm test -- face-store-report`
Expected: FAIL（找不到 `shared/face-store-report.js`）

- [ ] **Step 3：實作 `shared/face-store-report.js`**

```js
// 報表「已登錄」追蹤 — 用 settings store 存已登錄的列 key 清單
const KEY = 'reportRegistered';

export async function getRegisteredKeys(db) {
  const rec = await db.get('settings', KEY);
  return new Set(rec?.keys || []);
}

export async function setRegistered(db, rowKey, registered) {
  const rec = await db.get('settings', KEY);
  const set = new Set(rec?.keys || []);
  if (registered) set.add(rowKey); else set.delete(rowKey);
  await db.put('settings', { id: KEY, keys: [...set] });
  return set;
}
```

- [ ] **Step 4：在 `shared/face-store.js` 末尾加匯出**

```js
export { getRegisteredKeys, setRegistered } from './face-store-report.js';
```

- [ ] **Step 5：跑測試確認通過**

Run: `npm test -- face-store-report`
Expected: PASS（3 tests）

- [ ] **Step 6：Commit**

```bash
git add shared/face-store-report.js tests/face-store-report.test.js shared/face-store.js
git commit -m "feat: face-store-report 已登錄清單 store (TDD)"
```

---

### Task 2：report-aggregate 每列加 `_key`

**Files:** Modify `shared/report-aggregate.js`, `tests/report-aggregate.test.js`

- [ ] **Step 1：在 `tests/report-aggregate.test.js` 的 `describe('aggregateServiceRecords', ...)` 區塊內加測試**

```js
  it('每列帶 _key 字串（含 personId）', () => {
    const rows = aggregateServiceRecords([ev('p1', day(9), '上午')], people);
    expect(typeof rows[0]._key).toBe('string');
    expect(rows[0]._key).toContain('p1');
  });
  it('不同時段 → _key 不同', () => {
    const rows = aggregateServiceRecords([ev('p1', day(9), '上午'), ev('p1', day(14), '下午')], people);
    expect(rows[0]._key).not.toBe(rows[1]._key);
  });
```

- [ ] **Step 2：跑測試確認失敗**

Run: `npm test -- report-aggregate`
Expected: FAIL（`rows[0]._key` 為 undefined）

- [ ] **Step 3：在 `shared/report-aggregate.js` 的分組與輸出加 `_key`**

找到分組迴圈裡建立 group 的這行：

```js
    let g = groups.get(key);
    if (!g) { g = { events: [], sr }; groups.set(key, g); }
```

改成（把 key 存進 group）：

```js
    let g = groups.get(key);
    if (!g) { g = { events: [], sr, key }; groups.set(key, g); }
```

接著找到 `rows.push({` 那個物件，在其中（例如 `_minTs: minTs,` 那行之後、`});` 之前）加一行：

```js
      _key: g.key,
```

注意：流水號收尾的 `delete r._minTs;` 只刪 `_minTs`，`_key` 保留。

- [ ] **Step 4：跑測試確認通過**

Run: `npm test -- report-aggregate`
Expected: PASS（原有 + 新增 2 條全綠）

- [ ] **Step 5：Commit**

```bash
git add shared/report-aggregate.js tests/report-aggregate.test.js
git commit -m "feat: report-aggregate 每列加 _key（供已登錄追蹤對應）"
```

---

### Task 3：報表 tab 登錄欄 + 變灰 + Y + 隱藏已登錄

**Files:** Modify `shared/admin/admin-tab-report.js`（整檔覆寫）, `shared/app.css`

- [ ] **Step 1：整檔覆寫 `shared/admin/admin-tab-report.js`**

```js
import * as store from '../face-store.js';
import { aggregateServiceRecords, B_TABLE_COLUMNS } from '../report-aggregate.js';

export async function mountReportTab(root, db) {
  root.innerHTML = `
    <div class="filter-row">
      <label>起 <input type="date" id="rpt-from"></label>
      <label>迄 <input type="date" id="rpt-to"></label>
      <input id="rpt-scenario" placeholder="情境編號（留空=全部）">
      <label><input type="checkbox" id="rpt-hide-done"> 隱藏已登錄</label>
    </div>
    <p class="hint">框選「流水號」到「備註」整段複製貼進社會局平台。貼好後勾左側「登錄」，該列變灰、是否平台已登錄填 Y。<strong style="color:var(--color-critical);">紅底</strong>列代表個案編號未填，請先到人員 tab 補。</p>
    <div id="rpt-out"></div>
  `;

  let currentRows = [];

  root.querySelector('#rpt-from').addEventListener('change', render);
  root.querySelector('#rpt-to').addEventListener('change', render);
  root.querySelector('#rpt-scenario').addEventListener('input', render);
  root.querySelector('#rpt-hide-done').addEventListener('change', render);
  // checkbox 在 #rpt-out 內、每次 render 重建；委派在 #rpt-out（此元素本身不被換掉）
  root.querySelector('#rpt-out').addEventListener('change', async (e) => {
    if (!e.target.classList.contains('rpt-done-cb')) return;
    const row = currentRows[Number(e.target.dataset.idx)];
    if (!row) return;
    await store.setRegistered(db, row._key, e.target.checked);
    render();
  });

  async function render() {
    const events = await store.listEvents(db);
    const people = await store.listPeople(db);
    const peopleById = new Map(people.map(p => [p.id, p]));
    const registered = await store.getRegisteredKeys(db);

    const fromVal = root.querySelector('#rpt-from').value;
    const toVal = root.querySelector('#rpt-to').value;
    const scenario = root.querySelector('#rpt-scenario').value.trim() || null;
    const hideDone = root.querySelector('#rpt-hide-done').checked;
    const dateFrom = fromVal ? new Date(fromVal + 'T00:00:00').getTime() : null;
    const dateTo = toVal ? new Date(toVal + 'T23:59:59.999').getTime() : null;

    let rows = aggregateServiceRecords(events, peopleById, { dateFrom, dateTo, scenarioId: scenario });
    if (hideDone) rows = rows.filter(r => !registered.has(r._key));
    currentRows = rows;

    const out = root.querySelector('#rpt-out');
    if (rows.length === 0) {
      out.innerHTML = `<p style="color:var(--text-muted);">此範圍沒有報到紀錄。</p>`;
      return;
    }
    out.innerHTML = `
      <table class="admin-table report-table">
        <thead><tr><th>登錄</th>${B_TABLE_COLUMNS.map(c => `<th>${c}</th>`).join('')}</tr></thead>
        <tbody>${rows.map((r, i) => {
          const done = registered.has(r._key);
          const trAttr = done
            ? ' class="report-row-done"'
            : (r['個案編號'] ? '' : ' style="background:var(--badge-bg-warn);"');
          const cells = B_TABLE_COLUMNS.map(c =>
            `<td>${escape(c === '是否平台已登錄' ? (done ? 'Y' : '') : (r[c] ?? ''))}</td>`
          ).join('');
          return `<tr${trAttr}><td><input type="checkbox" class="rpt-done-cb" data-idx="${i}" ${done ? 'checked' : ''}></td>${cells}</tr>`;
        }).join('')}</tbody>
      </table>
    `;
  }

  await render();
}

function escape(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
```

- [ ] **Step 2：在 `shared/app.css` 末尾加樣式**

```css

/* 報表已登錄列變灰 */
.report-row-done td { color: var(--text-muted); background: var(--bg-overlay); }
```

- [ ] **Step 3：跑全測試**

Run: `npm test`
Expected: PASS（既有全綠；UI 於 Task 4 驗證）

- [ ] **Step 4：Commit**

```bash
git add shared/admin/admin-tab-report.js shared/app.css
git commit -m "feat: 報表登錄欄 checkbox + 變灰 + Y + 隱藏已登錄 toggle"
```

---

### Task 4：SW + 整體驗證

**Files:** Modify `service-worker.js`

- [ ] **Step 1：APP_SHELL 加入 face-store-report.js**

在 `service-worker.js` 的 `APP_SHELL` 裡，`'./shared/face-store-config.js',` 之後加：

```js
  './shared/face-store-report.js',
```

- [ ] **Step 2：bump VERSION**

把 `const VERSION = 'v29';` 改為：

```js
const VERSION = 'v30';
```

- [ ] **Step 3：跑全測試**

Run: `npm test`
Expected: PASS（全綠）

- [ ] **Step 4：Commit + push**

```bash
git add service-worker.js
git commit -m "chore: SW v29→v30 + APP_SHELL 加 face-store-report.js"
git push
```

- [ ] **Step 5：等部署 + Playwright 驗證**

```bash
gh run list --repo yao-care/agent.facial.signature --limit 1
```

部署 success 後，開 `https://sign.yao.care/admin.html` → 服務紀錄報表（雙載讓 SW 接管）：
- 最左有「登錄」欄、每列一個 checkbox；篩選列有「隱藏已登錄」
- 勾一列 → 該列變灰、是否平台已登錄欄顯示 Y
- 開「隱藏已登錄」→ 該列收起；關閉 → 又出現（證明持久化）
- 重整頁面後勾選狀態仍在（持久化）
