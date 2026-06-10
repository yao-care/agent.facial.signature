# 備份／保留生命週期隱私強化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 為 facial.signature 加三項備份／保留隱私強化：匯出明文防呆+加密測試、退冊生物特徵自動清除、匯出提醒。

**Architecture:** 純前端 PWA、資料留瀏覽器。新邏輯加在既有 `shared/face-store-gc.js`（退冊掃描/清除 + maintenance 設定）與 `face-store-tuning.js`（可校準參數），UI 接在 admin 系統工具 / 校準參數 tab，自動清除掛在 `admin-shell.js` 載入點。不新增檔案（APP_SHELL 不變），完成後 bump SW。

**Tech Stack:** Vanilla ESM、idb（IndexedDB wrapper）、OPFS、vitest（fake-indexeddb + happy-dom）。

**Spec:** `docs/superpowers/specs/2026-06-10-backup-retention-privacy-hardening-design.md`

---

## 檔案結構

| 檔案 | 變更 | 責任 |
|------|------|------|
| `shared/face-store-tuning.js` | 改 | `DEFAULT_TUNING` 加 `bioRetentionDays`/`exportReminderDays` |
| `shared/face-store-gc.js` | 改 | 加 `getMaintenance`/`setMaintenance`/`scanInactiveBiometrics`/`purgeInactiveBiometrics` |
| `shared/face-store.js` | 改 | barrel 匯出上述 4 個新函式 |
| `shared/admin/admin-shell.js` | 改 | 載入時自動退冊清除 + toast |
| `shared/admin/admin-tab-system.js` | 改 | 匯出明文防呆、寫 lastExportAt、匯出提醒顯示、退冊清除卡 |
| `shared/admin/admin-tab-tuning.js` | 改 | 「系統」組加兩個可編輯欄位 |
| `tests/face-store-gc.test.js` | 改 | maintenance / scan / purge 測試 |
| `tests/face-store-export-import.test.js` | 改 | 加密往返 / 錯誤密碼 / 缺密碼測試 |
| `tests/face-store-tuning.test.js` | 改 | 預設含兩新參數 |
| `service-worker.js` | 改 | VERSION v30→v31 |

---

## Task 1: tuning 新增兩個可校準參數

**Files:**
- Modify: `shared/face-store-tuning.js`
- Test: `tests/face-store-tuning.test.js`

- [ ] **Step 1: 寫失敗測試**

在 `tests/face-store-tuning.test.js` 既有 describe 內新增：

```js
it('DEFAULT_TUNING 含退冊保留期與匯出提醒參數', () => {
  expect(DEFAULT_TUNING.bioRetentionDays).toBe(180);
  expect(DEFAULT_TUNING.exportReminderDays).toBe(7);
});
```

（確認檔案頂部已 `import { DEFAULT_TUNING } from '../shared/face-store-tuning.js'`；若只 import 了 getTuning/putTuning，補上 DEFAULT_TUNING。）

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run tests/face-store-tuning.test.js`
Expected: FAIL（`bioRetentionDays` 為 undefined）

- [ ] **Step 3: 加參數**

`shared/face-store-tuning.js` 的 `DEFAULT_TUNING` 內，在 `snapshotsPerPersonCap` 之後、`// schema` 之前插入：

```js
  // 保留 / 提醒生命週期（可校準起始值，非法定值）
  bioRetentionDays: 180,    // 退冊清除：未簽到 ≥ 此天數自動清生物特徵
  exportReminderDays: 7,    // 超過此天數未匯出備份即告警
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run tests/face-store-tuning.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add shared/face-store-tuning.js tests/face-store-tuning.test.js
git commit -m "feat(tuning): 加 bioRetentionDays/exportReminderDays 可校準參數"
```

---

## Task 2: maintenance 設定 helper（getMaintenance/setMaintenance）

**Files:**
- Modify: `shared/face-store-gc.js`, `shared/face-store.js`
- Test: `tests/face-store-gc.test.js`

- [ ] **Step 1: 寫失敗測試**

在 `tests/face-store-gc.test.js` 新增（確認頂部 import 含 `openFaceDb`、`DB_NAME`，並加 `import { getMaintenance, setMaintenance } from '../shared/face-store-gc.js'`）：

```js
describe('maintenance 設定', () => {
  it('預設全 null/0，可部分更新', async () => {
    const db = await openFaceDb();
    expect(await getMaintenance(db)).toMatchObject({
      lastExportAt: null, lastBioPurgeAt: null, lastBioPurgeCount: 0,
    });
    await setMaintenance(db, { lastExportAt: 123 });
    const m = await getMaintenance(db);
    expect(m.lastExportAt).toBe(123);
    expect(m.lastBioPurgeCount).toBe(0); // 未動到的欄位保留
    db.close();
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run tests/face-store-gc.test.js`
Expected: FAIL（`getMaintenance is not a function` / import 失敗）

- [ ] **Step 3: 實作**

`shared/face-store-gc.js` 檔尾加：

```js
const MAINTENANCE_ID = 'maintenance';
const MAINTENANCE_DEFAULT = { id: MAINTENANCE_ID, lastExportAt: null, lastBioPurgeAt: null, lastBioPurgeCount: 0 };

export async function getMaintenance(db) {
  const stored = await db.get('settings', MAINTENANCE_ID);
  return { ...MAINTENANCE_DEFAULT, ...(stored || {}) };
}

export async function setMaintenance(db, patch) {
  const cur = await getMaintenance(db);
  const next = { ...cur, ...patch, id: MAINTENANCE_ID };
  await db.put('settings', next);
  return next;
}
```

`shared/face-store.js` 把 gc 那行改為：

```js
export { scanOrphanSnapshots, gcOrphanSnapshots, scanInactiveBiometrics, purgeInactiveBiometrics, getMaintenance, setMaintenance } from './face-store-gc.js';
```

（`scanInactiveBiometrics`/`purgeInactiveBiometrics` 於 Task 3/4 實作；先列入 barrel 不影響——尚未實作的具名匯出在被引用前不會報錯，但若你的環境嚴格，可先只加 `getMaintenance, setMaintenance`，Task 3/4 再補。）

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run tests/face-store-gc.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add shared/face-store-gc.js shared/face-store.js tests/face-store-gc.test.js
git commit -m "feat(gc): 加 maintenance 設定 (lastExportAt/lastBioPurgeAt/count)"
```

---

## Task 3: scanInactiveBiometrics（唯讀篩選退冊者）

**Files:**
- Modify: `shared/face-store-gc.js`, `shared/face-store.js`（barrel 已於 Task 2 含此名）
- Test: `tests/face-store-gc.test.js`

- [ ] **Step 1: 寫失敗測試**

在 `tests/face-store-gc.test.js` 新增（頂部 import 加 `scanInactiveBiometrics`）：

```js
describe('scanInactiveBiometrics', () => {
  const DAY = 86400000;
  const NOW = 1700000000000;
  it('只篩「未簽到 ≥ 門檻」且仍有向量者', async () => {
    const db = await openFaceDb();
    const vec = (a) => new Float32Array(a);
    // 直接寫入受控 timestamp（繞過 createPerson/createEvent 的 Date.now 預設）
    await db.put('people', { id:'active', vectors:[vec([1,0,0])], modelVersion:'v1', displayName:'活躍', createdAt:NOW-400*DAY, updatedAt:NOW });
    await db.put('events', { id:'e1', personId:'active', timestamp:NOW-10*DAY, scenario:'s', snapshotId:'snapA' });
    await db.put('people', { id:'stale', vectors:[vec([0,1,0])], modelVersion:'v1', displayName:'退冊', createdAt:NOW-400*DAY, updatedAt:NOW });
    await db.put('events', { id:'e2', personId:'stale', timestamp:NOW-200*DAY, scenario:'s', snapshotId:'snapB' });
    await db.put('people', { id:'empty', vectors:[], modelVersion:'v1', displayName:'已空', createdAt:NOW-400*DAY, updatedAt:NOW });
    // 無事件者用 createdAt fallback（370 天前建檔、無簽到）
    await db.put('people', { id:'never', vectors:[vec([0,0,1])], modelVersion:'v1', displayName:'從未簽到', createdAt:NOW-370*DAY, updatedAt:NOW });

    const eligible = await scanInactiveBiometrics(db, { retentionDays: 180, now: NOW });
    const ids = eligible.map(e => e.personId).sort();
    expect(ids).toEqual(['never', 'stale']); // active 太近、empty 無向量
    const staleRow = eligible.find(e => e.personId === 'stale');
    expect(staleRow.daysInactive).toBe(200);
    expect(staleRow.displayName).toBe('退冊');
    db.close();
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run tests/face-store-gc.test.js`
Expected: FAIL（`scanInactiveBiometrics is not a function`）

- [ ] **Step 3: 實作**

`shared/face-store-gc.js` 加（放在 maintenance helper 之前或之後皆可）：

```js
export async function scanInactiveBiometrics(db, { retentionDays, now = Date.now() }) {
  const people = await db.getAll('people');
  const events = await db.getAll('events');
  const lastActivity = {};
  for (const e of events) {
    if (!e.personId) continue;
    if (lastActivity[e.personId] === undefined || e.timestamp > lastActivity[e.personId]) {
      lastActivity[e.personId] = e.timestamp;
    }
  }
  const cutoff = retentionDays * 86400000;
  const result = [];
  for (const p of people) {
    if (!p.vectors || p.vectors.length === 0) continue; // 已無生物特徵
    const last = lastActivity[p.id] ?? p.createdAt;
    if (now - last >= cutoff) {
      result.push({ personId: p.id, displayName: p.displayName, daysInactive: Math.floor((now - last) / 86400000) });
    }
  }
  return result;
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run tests/face-store-gc.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add shared/face-store-gc.js tests/face-store-gc.test.js
git commit -m "feat(gc): scanInactiveBiometrics 依未簽到天數篩退冊者"
```

---

## Task 4: purgeInactiveBiometrics（清向量+快照、留統計、寫稽核）

**Files:**
- Modify: `shared/face-store-gc.js`
- Test: `tests/face-store-gc.test.js`

- [ ] **Step 1: 寫失敗測試**

在 `tests/face-store-gc.test.js` 新增（頂部 import 加 `purgeInactiveBiometrics`，並確認已 import `writeSnapshot, listAllSnapshotIds`——它們來自 `../shared/face-store-opfs.js`）：

```js
describe('purgeInactiveBiometrics', () => {
  const DAY = 86400000;
  const NOW = 1700000000000;
  it('清退冊者向量+快照，保留 people/events，寫稽核紀錄', async () => {
    const db = await openFaceDb();
    const vec = (a) => new Float32Array(a);
    await db.put('people', { id:'active', vectors:[vec([1,0,0])], modelVersion:'v1', displayName:'活躍', createdAt:NOW-400*DAY, updatedAt:NOW });
    await db.put('events', { id:'e1', personId:'active', timestamp:NOW-10*DAY, scenario:'s', snapshotId:'snapA' });
    await db.put('people', { id:'stale', vectors:[vec([0,1,0]), vec([0,1,1])], modelVersion:'v1', displayName:'退冊', createdAt:NOW-400*DAY, updatedAt:NOW });
    await db.put('events', { id:'e2', personId:'stale', timestamp:NOW-200*DAY, scenario:'s', snapshotId:'snapB' });
    await writeSnapshot(new Blob(['a']), 'snapA');
    await writeSnapshot(new Blob(['b']), 'snapB');

    const res = await purgeInactiveBiometrics(db, { retentionDays: 180, now: NOW });

    expect(res.purgedCount).toBe(1);
    expect(res.personIds).toEqual(['stale']);
    // 退冊者向量清空、活躍者不動
    expect((await db.get('people', 'stale')).vectors).toEqual([]);
    expect((await db.get('people', 'active')).vectors).toHaveLength(1);
    // 退冊者快照刪除、活躍者快照保留
    const snaps = await listAllSnapshotIds();
    expect(snaps).toContain('snapA');
    expect(snaps).not.toContain('snapB');
    // events 與 people 記錄都保留（留統計）
    expect(await db.getAll('events')).toHaveLength(2);
    expect(await db.getAll('people')).toHaveLength(2);
    // 稽核紀錄
    const m = await getMaintenance(db);
    expect(m.lastBioPurgeAt).toBe(NOW);
    expect(m.lastBioPurgeCount).toBe(1);
    db.close();
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

Run: `npx vitest run tests/face-store-gc.test.js`
Expected: FAIL（`purgeInactiveBiometrics is not a function`）

- [ ] **Step 3: 實作**

`shared/face-store-gc.js` 加（確認檔案頂部已 `import { listAllSnapshotIds, deleteSnapshot } from './face-store-opfs.js'`——既有）：

```js
export async function purgeInactiveBiometrics(db, { retentionDays, now = Date.now() }) {
  const eligible = await scanInactiveBiometrics(db, { retentionDays, now });
  const events = await db.getAll('events');
  const snapsByPerson = {};
  for (const e of events) {
    if (e.personId && e.snapshotId) {
      (snapsByPerson[e.personId] = snapsByPerson[e.personId] || []).push(e.snapshotId);
    }
  }
  for (const { personId } of eligible) {
    const p = await db.get('people', personId);
    if (!p) continue;
    p.vectors = [];
    p.updatedAt = now;
    await db.put('people', p);
    for (const sid of (snapsByPerson[personId] || [])) {
      await deleteSnapshot(sid);
    }
  }
  await setMaintenance(db, { lastBioPurgeAt: now, lastBioPurgeCount: eligible.length });
  return { purgedCount: eligible.length, personIds: eligible.map((e) => e.personId) };
}
```

- [ ] **Step 4: 跑測試確認通過**

Run: `npx vitest run tests/face-store-gc.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add shared/face-store-gc.js tests/face-store-gc.test.js
git commit -m "feat(gc): purgeInactiveBiometrics 清向量+快照留統計+寫稽核"
```

---

## Task 5: 匯出加密往返測試（A2，加密已實作，補測試）

**Files:**
- Test: `tests/face-store-export-import.test.js`

- [ ] **Step 1: 寫測試（覆蓋既有加密行為，預期直接通過）**

在 `tests/face-store-export-import.test.js` 既有 describe 之後新增（檔案頂部已 import `openFaceDb, DB_NAME, createPerson, listPeople, exportAll, importAll`、有 `vec` helper 與 beforeEach 清庫）：

```js
describe('encrypted export → import round-trip', () => {
  it('正確密碼可加密匯出再還原', async () => {
    const db = await openFaceDb();
    await createPerson(db, { vectors:[vec([1,0,0])], modelVersion:'v1', displayName:'密' });
    const blob = await exportAll(db, { password: 'secret123' });
    const head = new Uint8Array(await blob.arrayBuffer()).slice(0, 2);
    expect(head[0] === 0x50 && head[1] === 0x4b).toBe(false); // 非 PK 標頭＝已加密

    db.close();
    indexedDB.deleteDatabase(DB_NAME);
    navigator.storage._files.clear();
    const db2 = await openFaceDb();
    await importAll(db2, blob, { password: 'secret123' });
    const people = await listPeople(db2);
    expect(people[0].displayName).toBe('密');
    expect(people[0].vectors[0][0]).toBeCloseTo(1, 6);
    db2.close();
  });

  it('錯誤密碼匯入失敗', async () => {
    const db = await openFaceDb();
    await createPerson(db, { vectors:[vec([1,0,0])], modelVersion:'v1', displayName:'密' });
    const blob = await exportAll(db, { password: 'right' });
    const db2 = await openFaceDb();
    await expect(importAll(db2, blob, { password: 'wrong' })).rejects.toThrow();
    db2.close();
  });

  it('加密檔缺密碼匯入報明確錯誤', async () => {
    const db = await openFaceDb();
    await createPerson(db, { vectors:[vec([1,0,0])], modelVersion:'v1', displayName:'密' });
    const blob = await exportAll(db, { password: 'right' });
    const db2 = await openFaceDb();
    await expect(importAll(db2, blob, {})).rejects.toThrow('encrypted backup requires password');
    db2.close();
  });
});
```

- [ ] **Step 2: 跑測試**

Run: `npx vitest run tests/face-store-export-import.test.js`
Expected: PASS（加密功能已存在，測試一次通過即為覆蓋成立）

- [ ] **Step 3: Commit**

```bash
git add tests/face-store-export-import.test.js
git commit -m "test(export): 補加密往返/錯誤密碼/缺密碼測試"
```

---

## Task 6: 匯出明文防呆 + 寫 lastExportAt（A1 + C 寫入）

**Files:**
- Modify: `shared/admin/admin-tab-system.js`（`#export-btn` handler，約 line 154-161）

> 此為 DOM 事件處理，repo 無 admin DOM 測試 harness，採 Playwright 驗證（Task 11）。

- [ ] **Step 1: 改寫匯出 handler**

把現有 `#export-btn` 的 click handler 整段替換為：

```js
  root.querySelector('#export-btn').addEventListener('click', async () => {
    const pwd = root.querySelector('#export-pwd').value || undefined;
    if (!pwd && !confirm('未設密碼會匯出「未加密」的明文備份，內含長者臉部特徵。建議設定密碼。仍要繼續匯出明文嗎？')) {
      return;
    }
    const blob = await store.exportAll(db, { password: pwd });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `facial-signature-backup-${new Date().toISOString().slice(0, 10)}.${pwd ? 'bin' : 'zip'}`;
    a.click();
    await store.setMaintenance(db, { lastExportAt: Date.now() });
    await refreshStorageStatus();
  });
```

- [ ] **Step 2: 手動煙霧測試**

Run: `npm run serve` → 開 `http://localhost:8000/admin.html` → 系統工具 → 不填密碼點「匯出全部資料」→ 應跳確認框；填密碼則不跳、下載 `.bin`。

- [ ] **Step 3: Commit**

```bash
git add shared/admin/admin-tab-system.js
git commit -m "feat(admin): 匯出明文防呆 confirm + 記錄 lastExportAt"
```

---

## Task 7: 匯出提醒顯示（C）

**Files:**
- Modify: `shared/admin/admin-tab-system.js`（`refreshStorageStatus`）

- [ ] **Step 1: 在 refreshStorageStatus 加提醒行**

把 `refreshStorageStatus` 內組 `#storage-status` innerHTML 的部分改為先取 maintenance/tuning 再加一行：

```js
  async function refreshStorageStatus() {
    const persisted = await isPersisted();
    const est = await getStorageEstimate();
    const maint = await store.getMaintenance(db);
    const tuning = await store.getTuning(db);
    let exportLine;
    if (!maint.lastExportAt) {
      exportLine = `<p style="color:var(--color-critical);">尚未匯出備份</p>`;
    } else {
      const days = Math.floor((Date.now() - maint.lastExportAt) / 86400000);
      const warn = days > tuning.exportReminderDays;
      exportLine = `<p${warn ? ' style="color:var(--color-critical);"' : ''}>距上次匯出備份：${days} 天${warn ? '（建議盡快匯出）' : ''}</p>`;
    }
    root.querySelector('#storage-status').innerHTML = `
      <p>持久儲存：${persisted
        ? '<strong style="color:var(--color-pass);">✓ 已授權</strong>（瀏覽器不會自動清資料）'
        : '<strong style="color:var(--color-critical);">✗ 未授權</strong>（瀏覽器可能在空間不足時清資料） <button class="btn btn-sm" id="req-persist">請求授權</button>'
      }</p>
      <p>用量：${est ? `${Math.round(est.usage / 1024 / 1024)} MB / ${Math.round(est.quota / 1024 / 1024)} MB` : '無法取得'}</p>
      ${exportLine}
    `;
    root.querySelector('#req-persist')?.addEventListener('click', async () => {
      await requestPersistentStorage();
      await refreshStorageStatus();
    });
  }
```

- [ ] **Step 2: 手動煙霧測試**

開 admin → 系統工具：未匯出顯示「尚未匯出備份」（紅）；匯出一次後重開顯示「距上次匯出備份：0 天」。

- [ ] **Step 3: Commit**

```bash
git add shared/admin/admin-tab-system.js
git commit -m "feat(admin): 系統工具顯示距上次匯出天數提醒"
```

---

## Task 8: 退冊清除 UI 卡（B 手動 + 預覽 + 稽核顯示）

**Files:**
- Modify: `shared/admin/admin-tab-system.js`（左欄 HTML + handler）

- [ ] **Step 1: 加 HTML**

在左欄「清理孤兒快照」那組 `</div>`（`#gc-status` 所在 `.storage-actions`）之後、`<h2>備份 / 還原</h2>` 之前插入：

```html
        <div class="storage-actions" style="margin-top:12px;">
          <button class="btn" id="bio-purge-btn">立即執行退冊清除</button>
          <span id="bio-purge-status" class="hint"></span>
        </div>
        <p id="bio-purge-preview" class="hint"></p>
```

- [ ] **Step 2: 加 handler + 重新整理函式**

在 `#gc-btn` handler 之後加：

```js
  // === 退冊生物特徵清除 ===
  async function refreshBioPurge() {
    const tuning = await store.getTuning(db);
    const maint = await store.getMaintenance(db);
    const eligible = await store.scanInactiveBiometrics(db, { retentionDays: tuning.bioRetentionDays });
    root.querySelector('#bio-purge-status').textContent = maint.lastBioPurgeAt
      ? `上次退冊清除：${new Date(maint.lastBioPurgeAt).toISOString().slice(0, 10)}（${maint.lastBioPurgeCount} 筆）`
      : '上次退冊清除：尚未執行';
    root.querySelector('#bio-purge-preview').textContent = eligible.length
      ? `符合清除（≥${tuning.bioRetentionDays} 天未簽到，將清向量+快照保留統計）：${eligible.map(e => `${e.displayName || e.personId}（${e.daysInactive}天）`).join('、')}`
      : '目前無符合退冊清除的人員';
  }
  root.querySelector('#bio-purge-btn').addEventListener('click', async () => {
    const tuning = await store.getTuning(db);
    const { purgedCount } = await store.purgeInactiveBiometrics(db, { retentionDays: tuning.bioRetentionDays });
    showToast(null, purgedCount ? `已清除 ${purgedCount} 位退冊長者的生物特徵` : '無符合退冊清除的人員', 'success');
    await refreshBioPurge();
    await refreshStorageStatus();
  });
  await refreshBioPurge();
```

- [ ] **Step 3: 手動煙霧測試**

開 admin → 系統工具：顯示「上次退冊清除：尚未執行」與符合清單（無資料時顯示「目前無符合」）。點按鈕跑清除、toast 出現、清單刷新。

- [ ] **Step 4: Commit**

```bash
git add shared/admin/admin-tab-system.js
git commit -m "feat(admin): 系統工具加退冊清除卡(預覽+手動+稽核顯示)"
```

---

## Task 9: admin 載入時自動退冊清除

**Files:**
- Modify: `shared/admin/admin-shell.js`

- [ ] **Step 1: 加 import**

`shared/admin/admin-shell.js` 頂部 import 區加：

```js
import { showToast } from '../face-ui.js';
```

- [ ] **Step 2: 在 mountAdmin 開 db 後加自動清除**

把 `const db = await store.openFaceDb();` 那行之後緊接插入：

```js
  // 退冊生物特徵自動清除（載入時執行一次，落實最小化；失敗不可阻擋 admin 載入）
  try {
    const tuning = await store.getTuning(db);
    const { purgedCount } = await store.purgeInactiveBiometrics(db, { retentionDays: tuning.bioRetentionDays });
    if (purgedCount > 0) showToast(null, `已自動清除 ${purgedCount} 位退冊長者的生物特徵`, 'success');
  } catch (e) {
    console.warn('auto bio-purge failed', e);
  }
```

- [ ] **Step 3: 手動煙霧測試**

開 admin.html：若有符合退冊者，載入時應 toast「已自動清除 N 位…」；無則安靜。確認 admin 正常載入到人員 tab。

- [ ] **Step 4: Commit**

```bash
git add shared/admin/admin-shell.js
git commit -m "feat(admin): 載入時自動執行退冊生物特徵清除"
```

---

## Task 10: 校準參數 tab 加兩個可編輯欄位

**Files:**
- Modify: `shared/admin/admin-tab-tuning.js`（`TUNING_GROUPS` 的「系統」組）

- [ ] **Step 1: 改「系統」組**

把 `TUNING_GROUPS` 內 title 為 `'系統'` 的物件替換為：

```js
  {
    title: '系統',
    hint: '退冊保留期、匯出提醒門檻（可調），資料庫版本（自動處理）。',
    fields: [
      { key: 'bioRetentionDays',   label: '退冊清除：未簽到天數門檻' },
      { key: 'exportReminderDays', label: '匯出提醒：未匯出天數門檻' },
      { key: 'schemaVersion', label: '資料庫版本', readonly: true },
    ],
  },
```

- [ ] **Step 2: 手動煙霧測試**

開 admin → 校準參數 → 「系統」組應出現兩個可輸入數字欄（預設 180 / 7）+ 唯讀資料庫版本。改值點「儲存參數」後重開，值保留。

- [ ] **Step 3: Commit**

```bash
git add shared/admin/admin-tab-tuning.js
git commit -m "feat(admin): 校準參數加退冊保留期/匯出提醒門檻"
```

---

## Task 11: bump SW + 全測試 + Playwright 驗證

**Files:**
- Modify: `service-worker.js`

- [ ] **Step 1: bump VERSION**

`service-worker.js` 第 4 行 `const VERSION = 'v30';` 改為：

```js
const VERSION = 'v31';
```

（本案未新增檔案，`APP_SHELL` 不需改。）

- [ ] **Step 2: 跑全測試套件**

Run: `npx vitest run`
Expected: 全綠（既有 85 + 新增 maintenance/scan/purge/加密往返 測試）

- [ ] **Step 3: Commit**

```bash
git add service-worker.js
git commit -m "chore: SW v30→v31 (備份/保留隱私強化)"
```

- [ ] **Step 4: Playwright 上線驗證（合併部署後）**

連續 navigate `https://sign.yao.care/admin.html` **兩次**（首次觸發 SW v30→v31 更新+reload、第二次看到新版）。驗證：系統工具有「距上次匯出 N 天」與退冊清除卡；校準參數「系統」組有兩新欄位；匯出不填密碼跳確認框。

---

## Self-Review（對照 spec）

- **A1 明文防呆** → Task 6 ✓；**A2 加密測試** → Task 5 ✓
- **B 判定/清除/觸發(自動+手動)/稽核** → scan Task 3、purge Task 4、手動 UI Task 8、自動 Task 9、稽核 maintenance Task 2 ✓
- **C 寫 lastExportAt** → Task 6；**顯示提醒** → Task 7 ✓
- **參數 bioRetentionDays/exportReminderDays** → Task 1（預設）、Task 10（UI 可改）✓
- **maintenance settings** → Task 2 ✓
- **SW bump v31 / APP_SHELL 不變** → Task 11 ✓
- **型別一致**：`scanInactiveBiometrics`/`purgeInactiveBiometrics`/`getMaintenance`/`setMaintenance` 簽名跨 Task 一致；`{ retentionDays, now }` 參數一致；maintenance 欄位 `lastExportAt`/`lastBioPurgeAt`/`lastBioPurgeCount` 跨 Task 一致 ✓
- 無 placeholder：每個程式步驟都附完整程式碼 ✓
