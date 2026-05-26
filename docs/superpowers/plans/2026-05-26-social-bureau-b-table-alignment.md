# 社會局 B 表對齊 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讓系統把報到事件產出成對齊社會局平台 B 表的清單，供 admin 選取複製；config 服務紀錄情境移到 IndexedDB 由 admin 編輯。

**Architecture:** 重用 `settings` store 存 scenarioConfig（不改 DB schema）。報到頁載入時合併靜態 JSON + IndexedDB serviceRecord，並把 serviceRecord 戳進每筆 event.meta。純彙總邏輯抽到 `report-aggregate.js`（比照 `face-worker-logic.js` 可單元測試）。admin 新增「情境設定」與「服務紀錄報表」兩個 tab。

**Tech Stack:** 純前端 PWA、IndexedDB（idb）、vitest（純邏輯測試）。無新增函式庫。

依據 spec：`docs/superpowers/specs/2026-05-26-social-bureau-b-table-alignment-design.md`

---

## 檔案結構

| 檔案 | 責任 |
|---|---|
| `shared/face-store-config.js`（新） | scenarioConfig 讀寫（用 settings store） |
| `shared/report-aggregate.js`（新） | 純彙總 + 日期/星期/時間格式化（B 表列） |
| `shared/admin/admin-tab-config.js`（新） | 情境設定 tab |
| `shared/admin/admin-tab-report.js`（新） | 服務紀錄報表 tab |
| `tests/face-store-config.test.js`（新） | config 讀寫測試 |
| `tests/report-aggregate.test.js`（新） | 彙總邏輯測試 |
| `shared/face-store.js` | 匯出 config 函式 |
| `shared/face-checkin-template.js` | 合併 config + 戳 serviceRecord |
| `shared/admin/admin-tab-people.js` | 人員加個案編號/平台個案 ID 欄位 |
| `shared/admin/admin-shell.js` | 接兩個新 tab |
| `admin.html` | 加兩個 tab 按鈕 |
| `configs/example-checkin.json` | 加 serviceRecord 預設 |
| `service-worker.js` | bump VERSION + APP_SHELL 加新檔 |

---

## Phase 1：資料捕捉

### Task 1：scenarioConfig store

**Files:**
- Create: `shared/face-store-config.js`
- Create: `tests/face-store-config.test.js`
- Modify: `shared/face-store.js`

- [ ] **Step 1：寫失敗測試 `tests/face-store-config.test.js`**

```js
import { describe, it, expect, beforeEach } from 'vitest';
import { openFaceDb, DB_NAME } from '../shared/face-store-schema.js';
import {
  getScenarioConfig, putScenarioConfig, listScenarioConfigs,
} from '../shared/face-store-config.js';

beforeEach(() => { indexedDB.deleteDatabase(DB_NAME); });

describe('scenarioConfig', () => {
  it('put then get round-trips serviceRecord', async () => {
    const db = await openFaceDb();
    const sr = { 服務項目: '健康促進', 時段: '上午', 活動編號: 'HP-1', 活動主題: '匹克球', 餐飲類型: '', 服務志工: '王' };
    await putScenarioConfig(db, 'example-checkin', sr);
    const got = await getScenarioConfig(db, 'example-checkin');
    expect(got.scenarioId).toBe('example-checkin');
    expect(got.serviceRecord).toEqual(sr);
    expect(got.updatedAt).toBeGreaterThan(0);
    db.close();
  });

  it('getScenarioConfig returns undefined when absent', async () => {
    const db = await openFaceDb();
    expect(await getScenarioConfig(db, 'nope')).toBeUndefined();
    db.close();
  });

  it('listScenarioConfigs excludes the tuning settings record', async () => {
    const db = await openFaceDb();
    await db.put('settings', { id: 'tuning', matchThreshold: 0.5 });
    await putScenarioConfig(db, 'a', { 服務項目: '電話問安' });
    await putScenarioConfig(db, 'b', { 服務項目: '餐飲服務' });
    const list = await listScenarioConfigs(db);
    expect(list.map(r => r.scenarioId).sort()).toEqual(['a', 'b']);
    db.close();
  });
});
```

- [ ] **Step 2：跑測試確認失敗**

Run: `npm test -- face-store-config`
Expected: FAIL（找不到 `shared/face-store-config.js`）

- [ ] **Step 3：實作 `shared/face-store-config.js`**

```js
// scenarioConfig — 用 settings store 存可編輯的情境服務紀錄欄位
// id 格式：scenarioConfig:<scenarioId>，與 tuning（id='tuning'）共用 store 但前綴隔離
const KEY_PREFIX = 'scenarioConfig:';

export async function getScenarioConfig(db, scenarioId) {
  return db.get('settings', KEY_PREFIX + scenarioId);
}

export async function putScenarioConfig(db, scenarioId, serviceRecord) {
  const rec = {
    id: KEY_PREFIX + scenarioId,
    scenarioId,
    serviceRecord: serviceRecord || {},
    updatedAt: Date.now(),
  };
  await db.put('settings', rec);
  return rec;
}

export async function listScenarioConfigs(db) {
  const all = await db.getAll('settings');
  return all.filter(r => typeof r.id === 'string' && r.id.startsWith(KEY_PREFIX));
}
```

- [ ] **Step 4：在 `shared/face-store.js` 末尾加匯出**

```js
export { getScenarioConfig, putScenarioConfig, listScenarioConfigs } from './face-store-config.js';
```

- [ ] **Step 5：跑測試確認通過**

Run: `npm test -- face-store-config`
Expected: PASS（3 個測試）

- [ ] **Step 6：Commit**

```bash
git add shared/face-store-config.js tests/face-store-config.test.js shared/face-store.js
git commit -m "feat: scenarioConfig store (settings-backed, prefix-isolated)"
```

---

### Task 2：configs/example-checkin.json 加 serviceRecord 預設

**Files:**
- Modify: `configs/example-checkin.json`

- [ ] **Step 1：在 JSON 末尾（`tts` 之後）加 serviceRecord 區塊**

把現有檔案改成（保留原有欄位，新增 `serviceRecord`）：

```json
{
  "scenarioId": "example-checkin",
  "scenarioName": "示範簽到場景",
  "uiTheme": { "primary": "#1e8050", "background": "#f5f6f8" },
  "trigger": "auto",
  "concurrency": "multi-face",
  "dedupWindowMs": 30000,
  "consentNotice": {
    "enabled": true,
    "message": "本系統將擷取您的人臉特徵以進行簽到，資料留在本機。是否同意？",
    "requireExplicitConsent": true
  },
  "extraFields": [],
  "tts": {
    "enabled": true,
    "templateNamed": "{name} {greeting}"
  },
  "serviceRecord": {
    "服務項目": "健康促進",
    "時段": "上午",
    "活動編號": "",
    "活動主題": "示範活動",
    "餐飲類型": "",
    "服務志工": ""
  }
}
```

- [ ] **Step 2：Commit**

```bash
git add configs/example-checkin.json
git commit -m "feat: example-checkin config serviceRecord 預設 (seed 用)"
```

---

### Task 3：checkin template 合併 config + 戳 serviceRecord

**Files:**
- Modify: `shared/face-checkin-template.js`

- [ ] **Step 1：在 db 開啟後合併 serviceRecord（`shared/face-checkin-template.js` 第 55 行 `const db = await store.openFaceDb();` 之後插入）**

```js
  // 合併情境服務紀錄：IndexedDB 優先；無記錄則用靜態 JSON 的 serviceRecord seed 一筆
  let serviceRecord = config.serviceRecord || {};
  const storedCfg = await store.getScenarioConfig(db, config.scenarioId);
  if (storedCfg?.serviceRecord) {
    serviceRecord = storedCfg.serviceRecord;
  } else if (config.serviceRecord) {
    await store.putScenarioConfig(db, config.scenarioId, config.serviceRecord);
  }
```

- [ ] **Step 2：在 event meta 寫入前戳上 serviceRecord（找到第 168 行附近 `const eventMeta = extractEventMeta(...)` 區塊，在 `await store.createEvent` 之前加一行）**

把：

```js
    if (decision === 'fuzzy') {
      // fuzzy 在 meta 中記錄候選者（用於審核）
      eventMeta.candidates = matchResult.candidates;
    }
```

改成（在其後加戳記）：

```js
    if (decision === 'fuzzy') {
      // fuzzy 在 meta 中記錄候選者（用於審核）
      eventMeta.candidates = matchResult.candidates;
    }
    // 戳上當時的服務紀錄情境（B 表用）；複製一份避免日後改 config 污染舊紀錄
    eventMeta.serviceRecord = { ...serviceRecord };
```

- [ ] **Step 3：跑全測試確認沒打壞既有**

Run: `npm test`
Expected: PASS（既有測試全綠；本檔無單元測試，UI 行為於 Task 8 用 Playwright 驗證）

- [ ] **Step 4：Commit**

```bash
git add shared/face-checkin-template.js
git commit -m "feat: checkin 載入時合併 IndexedDB serviceRecord + 戳進 event.meta"
```

---

### Task 4：人員 meta 編輯器加個案編號 + 平台個案 ID

**Files:**
- Modify: `shared/admin/admin-tab-people.js`

- [ ] **Step 1：在 meta 編輯器的 identity-block 之後加連結欄位區塊**

找到 `openMetaEditor` 內 `<div class="identity-block">…</div>` 區塊（含 `#identity-select` 與其 `.hint`）。在該 block 結束 `</div>` 之後、`<h3 style="margin-top:24px;">其他備註</h3>` 之前，插入：

```js
        <div class="identity-block">
          <label class="identity-label">社會局連結欄位</label>
          <div class="field-row">
            <label>個案編號</label>
            <input type="text" class="link-case-no" value="${escape(meta['個案編號'] || '')}" placeholder="自編，例 A001">
          </div>
          <div class="field-row">
            <label>平台個案 ID</label>
            <input type="text" class="link-platform-id" value="${escape(meta['平台個案ID'] || '')}" placeholder="平台建檔後抄回">
          </div>
          <p class="hint">個案編號是 B 表對應社會局個案的 key，建議務必填寫。</p>
        </div>
```

- [ ] **Step 2：在 `.meta-save` 的 click handler 內，把這兩欄一起寫進 next**

找到 `overlay.querySelector('.meta-save').addEventListener('click', async () => {` 內，`if (identity) next['身份'] = identity;` 之後加：

```js
      const caseNo = overlay.querySelector('.link-case-no').value.trim();
      const platformId = overlay.querySelector('.link-platform-id').value.trim();
      if (caseNo) next['個案編號'] = caseNo;
      if (platformId) next['平台個案ID'] = platformId;
```

並把後續一般 key-value rows 的迴圈排除這兩個 key（避免重複），找到：

```js
        if (k && k !== '身份') next[k] = v;
```

改成：

```js
        if (k && !['身份', '個案編號', '平台個案ID'].includes(k)) next[k] = v;
```

- [ ] **Step 3：把這兩個 key 從 otherEntries 排除（避免又出現在自由 key-value 列）**

找到：

```js
    const otherEntries = Object.entries(meta).filter(([k]) => k !== '身份');
```

改成：

```js
    const otherEntries = Object.entries(meta).filter(([k]) => !['身份', '個案編號', '平台個案ID'].includes(k));
```

- [ ] **Step 4：跑測試**

Run: `npm test`
Expected: PASS（既有測試不受影響）

- [ ] **Step 5：Commit**

```bash
git add shared/admin/admin-tab-people.js
git commit -m "feat: 人員 meta 編輯器加個案編號/平台個案 ID 專屬欄位"
```

---

### Task 5：admin「情境設定」tab

**Files:**
- Create: `shared/admin/admin-tab-config.js`
- Modify: `shared/admin/admin-shell.js`
- Modify: `admin.html`

- [ ] **Step 1：建立 `shared/admin/admin-tab-config.js`**

```js
import * as store from '../face-store.js';
import { showToast } from '../face-ui.js';

const SERVICE_OPTIONS = ['關懷訪視', '電話問安', '健康促進', '餐飲服務'];
const REQUIRE_ACTIVITY_ID = ['健康促進', '餐飲服務']; // 這兩類活動編號必填
const MEAL_TYPES = ['', '共餐', '送餐'];

// 已知範例情境（沒有 IndexedDB 記錄時也讓管理者能建一筆）
const KNOWN_SCENARIOS = [
  { scenarioId: 'example-checkin', name: '示範簽到場景' },
];

export async function mountConfigTab(root, db) {
  async function render() {
    const stored = await store.listScenarioConfigs(db);
    const byId = new Map(stored.map(r => [r.scenarioId, r]));
    // 合併已知範例 + 已存記錄
    const ids = new Set([...KNOWN_SCENARIOS.map(s => s.scenarioId), ...byId.keys()]);
    const list = [...ids].map(id => ({
      scenarioId: id,
      name: KNOWN_SCENARIOS.find(s => s.scenarioId === id)?.name || id,
      serviceRecord: byId.get(id)?.serviceRecord || {},
    }));

    root.innerHTML = `
      <p class="hint">編輯各情境頁的今日服務紀錄欄位。報到頁下次載入即生效；活動日期自動取報到當天。</p>
      <div class="config-cards">${list.map(c => renderCard(c)).join('')}</div>
    `;

    root.querySelectorAll('.config-card').forEach(card => {
      const sid = card.dataset.sid;
      const svcSel = card.querySelector('.cfg-service');
      const mealWrap = card.querySelector('.cfg-meal-wrap');
      const syncMeal = () => { mealWrap.hidden = svcSel.value !== '餐飲服務'; };
      svcSel.addEventListener('change', syncMeal);
      syncMeal();

      card.querySelector('.cfg-save').addEventListener('click', async () => {
        const 服務項目 = svcSel.value;
        const 活動編號 = card.querySelector('.cfg-actno').value.trim();
        if (REQUIRE_ACTIVITY_ID.includes(服務項目) && !活動編號) {
          showToast(null, `「${服務項目}」需先填活動編號（平台規定須先建活動）`, 'error');
          return;
        }
        const serviceRecord = {
          服務項目,
          時段: card.querySelector('.cfg-period').value.trim(),
          活動編號,
          活動主題: card.querySelector('.cfg-topic').value.trim(),
          餐飲類型: 服務項目 === '餐飲服務' ? card.querySelector('.cfg-meal').value : '',
          服務志工: card.querySelector('.cfg-volunteer').value.trim(),
        };
        await store.putScenarioConfig(db, sid, serviceRecord);
        showToast(null, `已儲存「${sid}」情境設定`, 'success');
        render();
      });
    });
  }

  function renderCard(c) {
    const sr = c.serviceRecord;
    return `
      <div class="config-card watchlist-card" data-sid="${escape(c.scenarioId)}">
        <h3>${escape(c.name)}</h3>
        <small style="color:var(--text-muted);">情境編號 ${escape(c.scenarioId)}</small>
        <div class="field-row"><label>服務項目</label>
          <select class="cfg-service">
            ${SERVICE_OPTIONS.map(o => `<option ${o === sr.服務項目 ? 'selected' : ''}>${o}</option>`).join('')}
          </select>
        </div>
        <div class="field-row"><label>時段</label>
          <input type="text" class="cfg-period" value="${escape(sr.時段 || '')}" placeholder="上午 / 下午"></div>
        <div class="field-row"><label>活動編號</label>
          <input type="text" class="cfg-actno" value="${escape(sr.活動編號 || '')}" placeholder="健促/餐飲必填，例 HP-115052601"></div>
        <div class="field-row"><label>活動主題</label>
          <input type="text" class="cfg-topic" value="${escape(sr.活動主題 || '')}" placeholder="例 匹克球"></div>
        <div class="field-row cfg-meal-wrap" hidden><label>餐飲類型</label>
          <select class="cfg-meal">
            ${MEAL_TYPES.map(o => `<option value="${o}" ${o === sr.餐飲類型 ? 'selected' : ''}>${o || '（未選）'}</option>`).join('')}
          </select>
        </div>
        <div class="field-row"><label>服務志工</label>
          <input type="text" class="cfg-volunteer" value="${escape(sr.服務志工 || '')}"></div>
        <button class="btn btn-primary cfg-save">儲存</button>
      </div>
    `;
  }

  await render();
}

function escape(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
```

- [ ] **Step 2：在 `shared/admin/admin-shell.js` 接上 tab**

頂部 import 區加：

```js
import { mountConfigTab } from './admin-tab-config.js';
```

`tabs` 物件內（`watchlists` 之後）加：

```js
    config: () => mountConfigTab(rootEl, db),
```

- [ ] **Step 3：在 `admin.html` 的 `.admin-tabs` 加按鈕（放在 watchlists 之後）**

找到：

```html
      <button data-tab="watchlists">警示名單</button>
```

其後加：

```html
      <button data-tab="config">情境設定</button>
```

- [ ] **Step 4：跑測試 + 啟動驗證**

Run: `npm test`
Expected: PASS（既有測試不受影響）

- [ ] **Step 5：Commit**

```bash
git add shared/admin/admin-tab-config.js shared/admin/admin-shell.js admin.html
git commit -m "feat: admin 情境設定 tab（編輯 serviceRecord + 活動編號驗證）"
```

---

## Phase 2：服務紀錄報表

### Task 6：純彙總邏輯 report-aggregate.js

**Files:**
- Create: `shared/report-aggregate.js`
- Create: `tests/report-aggregate.test.js`

- [ ] **Step 1：寫失敗測試 `tests/report-aggregate.test.js`**

```js
import { describe, it, expect } from 'vitest';
import {
  aggregateServiceRecords, toMinguoDate, toWeekday, toHHMM, B_TABLE_COLUMNS,
} from '../shared/report-aggregate.js';

// 2026-05-26 09:00 與 11:00（同人同日同情境同時段）
const day = (h, m = 0) => new Date(2026, 4, 26, h, m).getTime();

function ev(personId, ts, period, extra = {}) {
  return {
    id: 't' + ts, personId, mode: 'checkin', decision: 'match',
    scenario: 'example-checkin', timestamp: ts,
    meta: { serviceRecord: { 服務項目: '健康促進', 時段: period, 活動編號: 'HP-1', 活動主題: '匹克球', 餐飲類型: '', 服務志工: '王' } },
    ...extra,
  };
}

const people = new Map([
  ['p1', { id: 'p1', displayName: '張三', meta: { 個案編號: 'A001', 備註: '行動不便' } }],
]);

describe('format helpers', () => {
  it('民國年日期', () => { expect(toMinguoDate(day(9))).toBe('115/05/26'); });
  it('中文星期', () => { expect(toWeekday(day(9))).toBe('週二'); }); // 2026-05-26 是週二
  it('hh:mm', () => { expect(toHHMM(day(9, 5))).toBe('09:05'); });
});

describe('aggregateServiceRecords', () => {
  it('同人同日同時段多筆 → 一列，簽到=min 簽退=max', () => {
    const rows = aggregateServiceRecords([ev('p1', day(11), '上午'), ev('p1', day(9), '上午')], people);
    expect(rows).toHaveLength(1);
    expect(rows[0].簽到時間).toBe('09:00');
    expect(rows[0].簽退時間).toBe('11:00');
    expect(rows[0].個案編號).toBe('A001');
    expect(rows[0].姓名).toBe('張三');
    expect(rows[0].備註).toBe('行動不便');
    expect(rows[0].報到方式).toBe('人工補登');
    expect(rows[0].流水號).toBe(1);
  });

  it('同人同日上午/下午 → 拆兩列（時段入分組 key）', () => {
    const rows = aggregateServiceRecords([ev('p1', day(9), '上午'), ev('p1', day(14), '下午')], people);
    expect(rows).toHaveLength(2);
    expect(rows.map(r => r.時段).sort()).toEqual(['上午', '下午']);
  });

  it('排除 personId=null 與 mode=alert', () => {
    const rows = aggregateServiceRecords([
      ev('p1', day(9), '上午'),
      { ...ev('p1', day(10), '上午'), personId: null },
      { ...ev('p1', day(10), '上午'), mode: 'alert' },
    ], people);
    expect(rows).toHaveLength(1);
  });

  it('依日期/情境/scenarioId 篩選', () => {
    const rows = aggregateServiceRecords(
      [ev('p1', day(9), '上午')],
      people,
      { scenarioId: 'other' }
    );
    expect(rows).toHaveLength(0);
  });

  it('B_TABLE_COLUMNS 含 18 欄、流水號在最前', () => {
    expect(B_TABLE_COLUMNS.length).toBe(18);
    expect(B_TABLE_COLUMNS[0]).toBe('流水號');
  });
});
```

- [ ] **Step 2：跑測試確認失敗**

Run: `npm test -- report-aggregate`
Expected: FAIL（找不到 `shared/report-aggregate.js`）

- [ ] **Step 3：實作 `shared/report-aggregate.js`**

```js
// report-aggregate.js — 純函式：把 checkin events 彙總成 B 表列（無 DB 依賴，可單元測試）

export const B_TABLE_COLUMNS = [
  '流水號', '活動日期', '星期', '時段', '服務項目', '活動編號', '活動主題',
  '餐飲類型', '個案編號', '姓名', '簽到時間', '簽退時間', '報到方式',
  '是否平台已登錄', '血壓收縮', '血壓舒張', '服務志工', '備註',
];

const WEEKDAYS = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];

export function toMinguoDate(ts) {
  const d = new Date(ts);
  const roc = d.getFullYear() - 1911;
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${roc}/${mm}/${dd}`;
}

export function toWeekday(ts) {
  return WEEKDAYS[new Date(ts).getDay()];
}

export function toHHMM(ts) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function dateKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export function aggregateServiceRecords(events, peopleById, opts = {}) {
  const { dateFrom = null, dateTo = null, scenarioId = null } = opts;

  const checkins = events.filter(e =>
    e.mode === 'checkin' && e.personId != null &&
    (scenarioId == null || e.scenario === scenarioId) &&
    (dateFrom == null || e.timestamp >= dateFrom) &&
    (dateTo == null || e.timestamp <= dateTo)
  );

  const groups = new Map();
  for (const e of checkins) {
    const sr = (e.meta && e.meta.serviceRecord) || {};
    const seg = sr.時段 || '';
    const key = `${e.personId}|${dateKey(e.timestamp)}|${e.scenario}|${seg}`;
    let g = groups.get(key);
    if (!g) { g = { events: [], sr }; groups.set(key, g); }
    g.events.push(e);
  }

  const rows = [];
  for (const g of groups.values()) {
    const times = g.events.map(e => e.timestamp);
    const minTs = Math.min(...times);
    const maxTs = Math.max(...times);
    const sr = g.sr;
    const person = peopleById.get(g.events[0].personId);
    rows.push({
      活動日期: toMinguoDate(minTs),
      星期: toWeekday(minTs),
      時段: sr.時段 || '',
      服務項目: sr.服務項目 || '',
      活動編號: sr.活動編號 || '',
      活動主題: sr.活動主題 || '',
      餐飲類型: sr.餐飲類型 || '',
      個案編號: person?.meta?.['個案編號'] || '',
      姓名: person?.displayName || '',
      簽到時間: toHHMM(minTs),
      簽退時間: toHHMM(maxTs),
      報到方式: '人工補登',
      是否平台已登錄: '',
      血壓收縮: '',
      血壓舒張: '',
      服務志工: sr.服務志工 || '',
      備註: person?.meta?.['備註'] || '',
      _minTs: minTs,
    });
  }

  rows.sort((a, b) => a._minTs - b._minTs);
  rows.forEach((r, i) => { r.流水號 = i + 1; delete r._minTs; });
  return rows;
}
```

- [ ] **Step 4：跑測試確認通過**

Run: `npm test -- report-aggregate`
Expected: PASS（format helpers 3 + aggregate 5）

- [ ] **Step 5：Commit**

```bash
git add shared/report-aggregate.js tests/report-aggregate.test.js
git commit -m "feat: report-aggregate 純彙總邏輯 + B 表格式化 (TDD)"
```

---

### Task 7：admin「服務紀錄報表」tab

**Files:**
- Create: `shared/admin/admin-tab-report.js`
- Modify: `shared/admin/admin-shell.js`
- Modify: `admin.html`

- [ ] **Step 1：建立 `shared/admin/admin-tab-report.js`**

```js
import * as store from '../face-store.js';
import { aggregateServiceRecords, B_TABLE_COLUMNS } from '../report-aggregate.js';

export async function mountReportTab(root, db) {
  root.innerHTML = `
    <div class="filter-row">
      <label>起 <input type="date" id="rpt-from"></label>
      <label>迄 <input type="date" id="rpt-to"></label>
      <input id="rpt-scenario" placeholder="情境編號（留空=全部）">
      <button class="btn btn-primary" id="rpt-run">產生報表</button>
    </div>
    <p class="hint">框選整張表格即可複製貼進社會局平台。<strong style="color:var(--color-critical);">紅底</strong>列代表個案編號未填、貼回平台無法對應，請先到人員 tab 補。</p>
    <div id="rpt-out"></div>
  `;

  root.querySelector('#rpt-run').addEventListener('click', render);

  async function render() {
    const events = await store.listEvents(db);
    const people = await store.listPeople(db);
    const peopleById = new Map(people.map(p => [p.id, p]));

    const fromVal = root.querySelector('#rpt-from').value;
    const toVal = root.querySelector('#rpt-to').value;
    const scenario = root.querySelector('#rpt-scenario').value.trim() || null;
    // date input 為當地日期；迄日含整天 → +1 天再減 1ms
    const dateFrom = fromVal ? new Date(fromVal + 'T00:00:00').getTime() : null;
    const dateTo = toVal ? new Date(toVal + 'T23:59:59').getTime() : null;

    const rows = aggregateServiceRecords(events, peopleById, { dateFrom, dateTo, scenarioId: scenario });
    const out = root.querySelector('#rpt-out');
    if (rows.length === 0) {
      out.innerHTML = `<p style="color:var(--text-muted);">此範圍沒有報到紀錄。</p>`;
      return;
    }
    out.innerHTML = `
      <table class="admin-table report-table">
        <thead><tr>${B_TABLE_COLUMNS.map(c => `<th>${c}</th>`).join('')}</tr></thead>
        <tbody>${rows.map(r => `
          <tr${r.個案編號 ? '' : ' style="background:var(--badge-bg-warn);"'}>
            ${B_TABLE_COLUMNS.map(c => `<td>${escape(r[c] ?? '')}</td>`).join('')}
          </tr>`).join('')}</tbody>
      </table>
    `;
  }

  await render();
}

function escape(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
```

- [ ] **Step 2：在 `shared/admin/admin-shell.js` 接上 tab**

頂部 import 加：

```js
import { mountReportTab } from './admin-tab-report.js';
```

`tabs` 物件內（`config` 之後）加：

```js
    report: () => mountReportTab(rootEl, db),
```

- [ ] **Step 3：在 `admin.html` 的 `.admin-tabs` 加按鈕（放在 config 之後）**

找到：

```html
      <button data-tab="config">情境設定</button>
```

其後加：

```html
      <button data-tab="report">服務紀錄報表</button>
```

- [ ] **Step 4：跑測試**

Run: `npm test`
Expected: PASS（既有 + 新增全綠）

- [ ] **Step 5：Commit**

```bash
git add shared/admin/admin-tab-report.js shared/admin/admin-shell.js admin.html
git commit -m "feat: admin 服務紀錄報表 tab（B 表彙總渲染 + 個案編號缺漏標紅）"
```

---

### Task 8：Service Worker + 整體驗證

**Files:**
- Modify: `service-worker.js`

- [ ] **Step 1：APP_SHELL 加入三個新檔**

在 `service-worker.js` 的 `APP_SHELL` 陣列裡，`./shared/face-store-watchlists.js` 之後加：

```js
  './shared/face-store-config.js',
  './shared/report-aggregate.js',
```

在 `./shared/admin/admin-tab-watchlists.js` 之後加：

```js
  './shared/admin/admin-tab-config.js',
  './shared/admin/admin-tab-report.js',
```

- [ ] **Step 2：bump VERSION**

把 `const VERSION = 'v22';` 改為：

```js
const VERSION = 'v23';
```

- [ ] **Step 3：跑全測試**

Run: `npm test`
Expected: PASS（全綠）

- [ ] **Step 4：Commit + push**

```bash
git add service-worker.js
git commit -m "chore: SW v22→v23 + APP_SHELL 加入 B 表相關新檔"
git push
```

- [ ] **Step 5：等 Actions 部署 + Playwright 驗證**

```bash
gh run list --repo yao-care/agent.facial.signature --limit 1
```

部署 success 後，用 Playwright 開 `https://sign.yao.care/admin.html`：
- 確認多了「情境設定」「服務紀錄報表」兩個 tab
- 情境設定：示範簽到場景卡片可改服務項目、存檔；選「健康促進」但活動編號留空時存檔被擋並提示
- 服務紀錄報表：產生報表，欄位順序＝ B 表 18 欄，民國年日期、中文星期；個案編號空白列標紅
