# 情境設定改時段排程 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把情境設定改成「一次設定時段排程，報到時依當下時間自動解析對應服務項目/活動」。

**Architecture:** `scenarioConfig` 內容由單組 serviceRecord 換成 schedule（weekly + specific 規則）。新增純模組 `schedule-resolve.js`（`resolveServiceRecord` 報到解析、`buildScheduleAgenda` 編輯畫面排版）。報表與 DB schema 不變。舊 serviceRecord 記錄相容處理。

**Tech Stack:** 純前端 PWA、IndexedDB（settings store）、vitest。無新增函式庫。

依據 spec：`docs/superpowers/specs/2026-05-27-scenario-schedule-design.md`

---

## 檔案結構

| 檔案 | 責任 |
|---|---|
| `shared/schedule-resolve.js`（新） | `resolveServiceRecord(schedule, ts)` + `buildScheduleAgenda(schedule, today)`，純函式 |
| `tests/schedule-resolve.test.js`（新） | 解析優先序/邊界 + agenda 排版測試 |
| `shared/face-store-config.js` | `putScenarioConfig` 改存 `schedule` |
| `tests/face-store-config.test.js` | 改測 schedule round-trip |
| `shared/face-checkin-template.js` | 載入 schedule（含舊 serviceRecord 相容）+ 報到時 resolve 戳記 |
| `configs/example-checkin.json` | `serviceRecord` → `schedule` seed |
| `shared/admin/admin-tab-config.js` | 改寫為 agenda 排程編輯器 |
| `shared/app.css` | 加 `.sched-*` 樣式 |
| `service-worker.js` | APP_SHELL 加 schedule-resolve.js，bump VERSION |

---

### Task 1：schedule-resolve.js（純解析 + agenda）

**Files:**
- Create: `shared/schedule-resolve.js`
- Create: `tests/schedule-resolve.test.js`

- [ ] **Step 1：寫失敗測試 `tests/schedule-resolve.test.js`**

```js
import { describe, it, expect } from 'vitest';
import { resolveServiceRecord, buildScheduleAgenda } from '../shared/schedule-resolve.js';

const schedule = {
  weekly: [
    { weekday: 1, start: '09:00', end: '11:00', 時段: '上午', 服務項目: '健康促進', 活動編號: 'HP-1', 活動主題: '匹克球', 餐飲類型: '', 服務志工: '王' },
    { weekday: 3, start: '14:00', end: '16:00', 時段: '下午', 服務項目: '電話問安', 活動編號: '', 活動主題: '', 餐飲類型: '', 服務志工: '' },
  ],
  specific: [
    { date: '2026-05-30', start: '10:00', end: '11:30', 時段: '上午', 服務項目: '關懷訪視', 活動編號: '', 活動主題: '局長視察', 餐飲類型: '', 服務志工: '' },
    { date: '2026-06-15', start: '09:00', end: '10:00', 時段: '上午', 服務項目: '健康促進', 活動編號: 'HP-2', 活動主題: '衛教', 餐飲類型: '', 服務志工: '' },
  ],
};
const at = (y, mo, da, h, mi) => new Date(y, mo - 1, da, h, mi).getTime();

describe('resolveServiceRecord', () => {
  it('星期規則命中（2026-05-27 週三 14:30 → 電話問安）', () => {
    expect(resolveServiceRecord(schedule, at(2026,5,27,14,30)).服務項目).toBe('電話問安');
  });
  it('特定日期優先於星期（2026-05-30 10:30 → 局長視察）', () => {
    const sr = resolveServiceRecord(schedule, at(2026,5,30,10,30));
    expect(sr.活動主題).toBe('局長視察');
    expect(sr.服務項目).toBe('關懷訪視');
  });
  it('時間在所有區間外 → {}', () => {
    expect(resolveServiceRecord(schedule, at(2026,5,27,8,0))).toEqual({});
  });
  it('該星期無規則 → {}（2026-05-26 週二）', () => {
    expect(resolveServiceRecord(schedule, at(2026,5,26,10,0))).toEqual({});
  });
  it('schedule 為 null → {}', () => {
    expect(resolveServiceRecord(null, at(2026,5,27,10,0))).toEqual({});
  });
});

describe('buildScheduleAgenda', () => {
  const today = new Date(2026, 4, 27); // 2026-05-27 週三

  it('七列、週一→週日順序、label 格式、今天標記', () => {
    const { days } = buildScheduleAgenda(schedule, today);
    expect(days).toHaveLength(7);
    expect(days.map(d => d.weekday)).toEqual([1,2,3,4,5,6,0]);
    expect(days[0].label).toBe('6/1 (一)');
    expect(days[2].weekday).toBe(3);
    expect(days[2].isToday).toBe(true);
    expect(days[2].label).toBe('5/27 (三)');
  });
  it('星期規則落在對應日（週一含健促，isSpecific=false）', () => {
    const { days } = buildScheduleAgenda(schedule, today);
    expect(days[0].rules.map(r => r.服務項目)).toContain('健康促進');
    expect(days[0].rules[0].isSpecific).toBe(false);
  });
  it('本週特定日期插入對應週幾（5/30 → 週六列 days[5]，isSpecific=true）', () => {
    const { days } = buildScheduleAgenda(schedule, today);
    expect(days[5].weekday).toBe(6);
    expect(days[5].rules.some(r => r.isSpecific && r.活動主題 === '局長視察')).toBe(true);
  });
  it('未來特定日期收進 future（6/15）', () => {
    expect(buildScheduleAgenda(schedule, today).future.map(r => r.date)).toEqual(['2026-06-15']);
  });
  it('同一天依 start 由小到大排序', () => {
    const s2 = { weekly: [
      { weekday: 3, start: '14:00', end: '15:00', 服務項目: 'B' },
      { weekday: 3, start: '09:00', end: '10:00', 服務項目: 'A' },
    ], specific: [] };
    expect(buildScheduleAgenda(s2, today).days[2].rules.map(r => r.服務項目)).toEqual(['A','B']);
  });
});
```

- [ ] **Step 2：跑測試確認失敗**

Run: `npm test -- schedule-resolve`
Expected: FAIL（找不到 `shared/schedule-resolve.js`）

- [ ] **Step 3：實作 `shared/schedule-resolve.js`**

```js
// schedule-resolve.js — 純函式：報到時依時間解析排程 + 編輯畫面 agenda 排版（無 DB/DOM）

const WD_CHAR = ['日', '一', '二', '三', '四', '五', '六'];
const MON_FIRST = [1, 2, 3, 4, 5, 6, 0]; // 週一→週日

function pad2(n) { return String(n).padStart(2, '0'); }
function hhmm(d) { return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; }
function localDateStr(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }

function pickFields(r) {
  return {
    時段: r.時段 || '', 服務項目: r.服務項目 || '', 活動編號: r.活動編號 || '',
    活動主題: r.活動主題 || '', 餐飲類型: r.餐飲類型 || '', 服務志工: r.服務志工 || '',
  };
}

// 報到時間 → serviceRecord（命中規則）或 {}（無規則）。特定日期優先於星期。
export function resolveServiceRecord(schedule, ts) {
  if (!schedule) return {};
  const d = new Date(ts);
  const T = hhmm(d);
  const wd = d.getDay();
  const dateStr = localDateStr(d);
  const inRange = r => (r.start || '') <= T && T < (r.end || '');
  const sp = (schedule.specific || []).filter(r => r.date === dateStr && inRange(r));
  if (sp.length) return pickFields(sp[0]);
  const wk = (schedule.weekly || []).filter(r => r.weekday === wd && inRange(r));
  if (wk.length) return pickFields(wk[0]);
  return {};
}

// 排程 + 今天 → { days:[7列 週一→週日], future:[本週窗之後的特定日期] }
export function buildScheduleAgenda(schedule, today) {
  const t0 = new Date(today);
  t0.setHours(0, 0, 0, 0);
  const dateByWeekday = {};
  for (let off = 0; off < 7; off++) {
    const d = new Date(t0);
    d.setDate(t0.getDate() + off);
    dateByWeekday[d.getDay()] = d;
  }
  const todayStr = localDateStr(t0);
  const lastWin = new Date(t0);
  lastWin.setDate(t0.getDate() + 6);
  const lastWinStr = localDateStr(lastWin);

  const weekly = schedule?.weekly || [];
  const specific = schedule?.specific || [];

  const days = MON_FIRST.map(wd => {
    const d = dateByWeekday[wd];
    const dateStr = localDateStr(d);
    const rules = [
      ...weekly.filter(r => r.weekday === wd).map(r => ({ ...r, isSpecific: false })),
      ...specific.filter(r => r.date === dateStr).map(r => ({ ...r, isSpecific: true })),
    ].sort((a, b) => (a.start || '').localeCompare(b.start || ''));
    return {
      weekday: wd,
      date: dateStr,
      label: `${d.getMonth() + 1}/${d.getDate()} (${WD_CHAR[wd]})`,
      isToday: dateStr === todayStr,
      rules,
    };
  });

  const future = specific
    .filter(r => r.date > lastWinStr)
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  return { days, future };
}
```

- [ ] **Step 4：跑測試確認通過**

Run: `npm test -- schedule-resolve`
Expected: PASS（resolve 5 + agenda 5 = 10 tests）

- [ ] **Step 5：Commit**

```bash
git add shared/schedule-resolve.js tests/schedule-resolve.test.js
git commit -m "feat: schedule-resolve 純解析 + agenda 排版 (TDD)"
```

---

### Task 2：face-store-config 改存 schedule

**Files:**
- Modify: `shared/face-store-config.js`
- Modify: `tests/face-store-config.test.js`

- [ ] **Step 1：改寫測試 `tests/face-store-config.test.js`**（把 serviceRecord 換成 schedule）

```js
import { describe, it, expect, beforeEach } from 'vitest';
import { openFaceDb, DB_NAME } from '../shared/face-store-schema.js';
import {
  getScenarioConfig, putScenarioConfig, listScenarioConfigs,
} from '../shared/face-store-config.js';

beforeEach(() => { indexedDB.deleteDatabase(DB_NAME); });

describe('scenarioConfig', () => {
  it('put then get round-trips schedule', async () => {
    const db = await openFaceDb();
    const schedule = { weekly: [{ weekday: 1, start: '09:00', end: '11:00', 服務項目: '健康促進' }], specific: [] };
    await putScenarioConfig(db, 'example-checkin', schedule);
    const got = await getScenarioConfig(db, 'example-checkin');
    expect(got.scenarioId).toBe('example-checkin');
    expect(got.schedule).toEqual(schedule);
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
    await putScenarioConfig(db, 'a', { weekly: [], specific: [] });
    await putScenarioConfig(db, 'b', { weekly: [], specific: [] });
    const list = await listScenarioConfigs(db);
    expect(list.map(r => r.scenarioId).sort()).toEqual(['a', 'b']);
    db.close();
  });
});
```

- [ ] **Step 2：跑測試確認失敗**

Run: `npm test -- face-store-config`
Expected: FAIL（`got.schedule` undefined，因 putScenarioConfig 還在存 serviceRecord）

- [ ] **Step 3：改 `shared/face-store-config.js` 的 putScenarioConfig 存 schedule**

把 `putScenarioConfig` 整個函式換成：

```js
export async function putScenarioConfig(db, scenarioId, schedule) {
  const rec = {
    id: KEY_PREFIX + scenarioId,
    scenarioId,
    schedule: schedule ?? { weekly: [], specific: [] },
    updatedAt: Date.now(),
  };
  await db.put('settings', rec);
  return rec;
}
```

並把檔案頂端註解第一行改為：

```js
// scenarioConfig — 用 settings store 存可編輯的情境時段排程（schedule）
```

- [ ] **Step 4：跑測試確認通過**

Run: `npm test -- face-store-config`
Expected: PASS（3 tests）

- [ ] **Step 5：Commit**

```bash
git add shared/face-store-config.js tests/face-store-config.test.js
git commit -m "feat: scenarioConfig 改存 schedule (取代 serviceRecord)"
```

---

### Task 3：checkin template 載入 schedule + 報到時 resolve

**Files:**
- Modify: `shared/face-checkin-template.js`

- [ ] **Step 1：加入 import（檔案頂端 import 區，與其他 import 並列）**

在 `import { accumulateVectors } from './face-store.js';` 之後新增：

```js
import { resolveServiceRecord } from './schedule-resolve.js';
```

- [ ] **Step 2：把第 55-62 行的 serviceRecord 合併區塊換成 schedule 載入（含舊資料相容）**

找到：

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

整段換成：

```js
  // 載入情境時段排程：IndexedDB 優先；無記錄則用靜態 JSON 的 schedule seed。
  // 舊資料相容：既有記錄若只有 serviceRecord（無 schedule），視為「全時段套用同一組」。
  let schedule = null;
  let legacyServiceRecord = null;
  const storedCfg = await store.getScenarioConfig(db, config.scenarioId);
  if (storedCfg?.schedule) {
    schedule = storedCfg.schedule;
  } else if (storedCfg?.serviceRecord) {
    legacyServiceRecord = storedCfg.serviceRecord;
  } else {
    schedule = config.schedule || { weekly: [], specific: [] };
    if (config.schedule) await store.putScenarioConfig(db, config.scenarioId, config.schedule);
  }
```

- [ ] **Step 3：把第 184 行的戳記改為依時間解析**

找到：

```js
    // 戳上當時的服務紀錄情境（B 表用）；複製一份避免日後改 config 污染舊紀錄
    eventMeta.serviceRecord = { ...serviceRecord };
```

換成：

```js
    // 戳上報到當下解析出的服務紀錄情境（B 表用）。舊資料則沿用 legacy 單組。
    eventMeta.serviceRecord = legacyServiceRecord
      ? { ...legacyServiceRecord }
      : resolveServiceRecord(schedule, Date.now());
```

- [ ] **Step 4：跑全測試確認沒打壞**

Run: `npm test`
Expected: PASS（既有全綠；本檔無單元測試，行為於 Task 6 用 Playwright 驗證）

- [ ] **Step 5：Commit**

```bash
git add shared/face-checkin-template.js
git commit -m "feat: checkin 載入 schedule + 報到時依時間 resolve serviceRecord"
```

---

### Task 4：example-checkin.json serviceRecord → schedule

**Files:**
- Modify: `configs/example-checkin.json`

- [ ] **Step 1：把 `serviceRecord` 區塊換成 `schedule`**

找到現有的：

```json
  "serviceRecord": {
    "服務項目": "健康促進",
    "時段": "上午",
    "活動編號": "",
    "活動主題": "示範活動",
    "餐飲類型": "",
    "服務志工": ""
  }
```

換成：

```json
  "schedule": {
    "weekly": [
      { "weekday": 1, "start": "09:00", "end": "11:00", "時段": "上午", "服務項目": "健康促進", "活動編號": "", "活動主題": "示範活動", "餐飲類型": "", "服務志工": "" }
    ],
    "specific": []
  }
```

- [ ] **Step 2：驗證 JSON 合法**

Run: `node -e "JSON.parse(require('fs').readFileSync('configs/example-checkin.json','utf8')); console.log('valid')"`
Expected: `valid`

- [ ] **Step 3：Commit**

```bash
git add configs/example-checkin.json
git commit -m "feat: example-checkin config serviceRecord → schedule seed"
```

---

### Task 5：admin 情境設定 tab 改寫為排程編輯器

**Files:**
- Modify: `shared/admin/admin-tab-config.js`（整檔覆寫）
- Modify: `shared/app.css`（加 .sched-* 樣式）

- [ ] **Step 1：整檔覆寫 `shared/admin/admin-tab-config.js`**

```js
import * as store from '../face-store.js';
import { showToast } from '../face-ui.js';
import { buildScheduleAgenda } from '../schedule-resolve.js';

const SERVICE_OPTIONS = ['關懷訪視', '電話問安', '健康促進', '餐飲服務'];
const REQUIRE_ACTIVITY_ID = ['健康促進', '餐飲服務'];
const MEAL_TYPES = ['', '共餐', '送餐'];
const KNOWN_SCENARIOS = [{ scenarioId: 'example-checkin', name: '示範簽到場景' }];

export async function mountConfigTab(root, db) {
  async function render() {
    const stored = await store.listScenarioConfigs(db);
    const byId = new Map(stored.map(r => [r.scenarioId, r]));
    const ids = new Set([...KNOWN_SCENARIOS.map(s => s.scenarioId), ...byId.keys()]);
    const scenarios = [...ids].map(id => ({
      scenarioId: id,
      name: KNOWN_SCENARIOS.find(s => s.scenarioId === id)?.name || id,
      schedule: byId.get(id)?.schedule || { weekly: [], specific: [] },
    }));

    root.innerHTML = `
      <p class="hint">設定每個情境頁的服務時段排程。報到時依當下時間自動套用（特定日期優先於星期）；無規則時情境留空。</p>
      <div class="config-cards">${scenarios.map(renderCard).join('')}</div>
    `;
    scenarios.forEach(s => {
      const card = root.querySelector(`.config-card[data-sid="${cssEsc(s.scenarioId)}"]`);
      wireCard(card, s.scenarioId);
    });
  }

  function renderCard(s) {
    const { days, future } = buildScheduleAgenda(s.schedule, new Date());
    return `
      <div class="config-card watchlist-card" data-sid="${escape(s.scenarioId)}">
        <h3>${escape(s.name)}</h3>
        <small style="color:var(--text-muted);">情境編號 ${escape(s.scenarioId)}</small>
        <div class="sched-days">${days.map(renderDay).join('')}</div>
        <h4 style="margin:16px 0 8px;">未來特定日期</h4>
        <div class="sched-future">${future.map(r => renderRule(r, 'specific')).join('')}</div>
        <button class="btn btn-sm sched-add-specific">＋ 新增特定日期</button>
        <div style="margin-top:16px;"><button class="btn btn-primary sched-save">儲存排程</button></div>
      </div>
    `;
  }

  function renderDay(d) {
    return `
      <div class="sched-day" data-weekday="${d.weekday}">
        <div class="sched-day-label">${escape(d.label)}${d.isToday ? ' <strong>今</strong>' : ''}</div>
        <div class="sched-day-rules">${d.rules.map(r => renderRule(r, r.isSpecific ? 'specific' : 'weekly')).join('')}</div>
        <button class="btn btn-sm sched-add-weekly">＋ 新增此日規則</button>
      </div>
    `;
  }

  function renderRule(r, kind) {
    const meal = r.服務項目 === '餐飲服務';
    return `
      <div class="sched-rule" data-kind="${kind}">
        ${kind === 'specific' ? `<div class="field-row"><label>日期</label><input type="date" class="r-date" value="${escape(r.date || '')}"></div>` : ''}
        <div class="field-row"><label>時間</label>
          <input type="time" class="r-start" value="${escape(r.start || '')}">
          <input type="time" class="r-end" value="${escape(r.end || '')}">
        </div>
        <div class="field-row"><label>時段</label><input type="text" class="r-period" value="${escape(r.時段 || '')}" placeholder="上午/下午"></div>
        <div class="field-row"><label>服務項目</label>
          <select class="r-service">${SERVICE_OPTIONS.map(o => `<option ${o === r.服務項目 ? 'selected' : ''}>${o}</option>`).join('')}</select>
        </div>
        <div class="field-row"><label>活動編號</label><input type="text" class="r-actno" value="${escape(r.活動編號 || '')}" placeholder="健促/餐飲必填"></div>
        <div class="field-row"><label>活動主題</label><input type="text" class="r-topic" value="${escape(r.活動主題 || '')}"></div>
        <div class="field-row r-meal-wrap" ${meal ? '' : 'hidden'}><label>餐飲類型</label>
          <select class="r-meal">${MEAL_TYPES.map(o => `<option value="${o}" ${o === r.餐飲類型 ? 'selected' : ''}>${o || '（未選）'}</option>`).join('')}</select>
        </div>
        <div class="field-row"><label>服務志工</label><input type="text" class="r-volunteer" value="${escape(r.服務志工 || '')}"></div>
        <button class="btn btn-sm btn-danger r-remove">移除規則</button>
      </div>
    `;
  }

  function wireCard(card, scenarioId) {
    if (!card) return;
    card.addEventListener('change', e => {
      if (e.target.classList.contains('r-service')) {
        const wrap = e.target.closest('.sched-rule').querySelector('.r-meal-wrap');
        wrap.hidden = e.target.value !== '餐飲服務';
      }
    });
    card.addEventListener('click', e => {
      const t = e.target;
      if (t.classList.contains('r-remove')) {
        t.closest('.sched-rule').remove();
      } else if (t.classList.contains('sched-add-weekly')) {
        t.closest('.sched-day').querySelector('.sched-day-rules')
          .insertAdjacentHTML('beforeend', renderRule({}, 'weekly'));
      } else if (t.classList.contains('sched-add-specific')) {
        card.querySelector('.sched-future').insertAdjacentHTML('beforeend', renderRule({}, 'specific'));
      } else if (t.classList.contains('sched-save')) {
        saveCard(card, scenarioId);
      }
    });
  }

  async function saveCard(card, scenarioId) {
    const weekly = [];
    const specific = [];
    let err = null;
    card.querySelectorAll('.sched-rule').forEach(el => {
      if (err) return;
      const 服務項目 = el.querySelector('.r-service').value;
      const start = el.querySelector('.r-start').value;
      const end = el.querySelector('.r-end').value;
      const 活動編號 = el.querySelector('.r-actno').value.trim();
      if (!start || !end) { err = '每條規則都要填開始與結束時間'; return; }
      if (end <= start) { err = '結束時間必須晚於開始時間'; return; }
      if (REQUIRE_ACTIVITY_ID.includes(服務項目) && !活動編號) { err = `「${服務項目}」需填活動編號`; return; }
      const rule = {
        start, end,
        時段: el.querySelector('.r-period').value.trim(),
        服務項目, 活動編號,
        活動主題: el.querySelector('.r-topic').value.trim(),
        餐飲類型: 服務項目 === '餐飲服務' ? el.querySelector('.r-meal').value : '',
        服務志工: el.querySelector('.r-volunteer').value.trim(),
      };
      if (el.dataset.kind === 'weekly') {
        const wd = Number(el.closest('.sched-day')?.dataset.weekday);
        if (Number.isNaN(wd)) { err = '星期規則缺星期'; return; }
        rule.weekday = wd;
        weekly.push(rule);
      } else {
        const date = el.querySelector('.r-date').value;
        if (!date) { err = '特定日期規則要選日期'; return; }
        rule.date = date;
        specific.push(rule);
      }
    });
    if (err) { showToast(null, err, 'error'); return; }
    await store.putScenarioConfig(db, scenarioId, { weekly, specific });
    showToast(null, '已儲存排程', 'success');
    render();
  }

  await render();
}

function escape(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
function cssEsc(s) { return String(s).replace(/["\\]/g, '\\$&'); }
```

- [ ] **Step 2：在 `shared/app.css` 末尾加排程編輯器樣式**

```css

/* ============ 情境設定排程編輯器 ============ */
.sched-day { padding: 10px 0; border-top: 1px solid var(--border-subtle); }
.sched-day-label { font-weight: 700; color: var(--text-primary); margin-bottom: 6px; }
.sched-day-label strong { color: var(--color-pass); margin-left: 6px; }
.sched-rule {
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  padding: 12px 14px;
  margin: 8px 0;
  background: var(--bg-base);
}
.sched-rule .r-start, .sched-rule .r-end { flex: 0 0 auto; }
.sched-future .sched-rule { background: var(--badge-bg-warn); }
```

- [ ] **Step 3：跑全測試**

Run: `npm test`
Expected: PASS（既有全綠；UI 於 Task 6 驗證）

- [ ] **Step 4：Commit**

```bash
git add shared/admin/admin-tab-config.js shared/app.css
git commit -m "feat: 情境設定 tab 改為週排程 agenda 編輯器"
```

---

### Task 6：Service Worker + 整體驗證

**Files:**
- Modify: `service-worker.js`

- [ ] **Step 1：APP_SHELL 加入 schedule-resolve.js**

在 `service-worker.js` 的 `APP_SHELL` 陣列裡，`'./shared/report-aggregate.js',` 之後加：

```js
  './shared/schedule-resolve.js',
```

- [ ] **Step 2：bump VERSION**

把 `const VERSION = 'v27';` 改為：

```js
const VERSION = 'v28';
```

- [ ] **Step 3：跑全測試**

Run: `npm test`
Expected: PASS（全綠，含 schedule-resolve 10 + 既有）

- [ ] **Step 4：Commit + push**

```bash
git add service-worker.js
git commit -m "chore: SW v27→v28 + APP_SHELL 加 schedule-resolve.js"
git push
```

- [ ] **Step 5：等部署 + Playwright 驗證**

```bash
gh run list --repo yao-care/agent.facial.signature --limit 1
```

部署 success 後，開 `https://sign.yao.care/admin.html`（雙載讓 SW 接管）→ 情境設定 tab：
- 確認顯示週一→週日七列、各列日期 `M/D (週)` 格式、今天標「今」
- 某日「＋ 新增此日規則」可加規則；選「餐飲服務」時餐飲類型欄位出現
- 選「健康促進」但活動編號留空 → 儲存被擋並提示
- 填好按「儲存排程」→ 成功 toast；重整後規則仍在
