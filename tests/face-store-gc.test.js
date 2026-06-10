import { describe, it, expect, beforeEach } from 'vitest';
import { openFaceDb, DB_NAME } from '../shared/face-store-schema.js';
import { createPerson } from '../shared/face-store-people.js';
import { createEvent } from '../shared/face-store-events.js';
import { writeSnapshot, listAllSnapshotIds, readSnapshot } from '../shared/face-store-opfs.js';
import { scanOrphanSnapshots, gcOrphanSnapshots, getMaintenance, setMaintenance, scanInactiveBiometrics, purgeInactiveBiometrics } from '../shared/face-store-gc.js';

beforeEach(() => {
  indexedDB.deleteDatabase(DB_NAME);
  navigator.storage._files.clear();
});

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

  it('未簽到剛好等於門檻天數者納入(>= 邊界)', async () => {
    const db = await openFaceDb();
    const vec = (a) => new Float32Array(a);
    await db.put('people', { id:'edge', vectors:[vec([1,0,0])], modelVersion:'v1', displayName:'邊界', createdAt:NOW-400*DAY, updatedAt:NOW });
    await db.put('events', { id:'ee', personId:'edge', timestamp:NOW-180*DAY, scenario:'s', snapshotId:'snapE' });
    const eligible = await scanInactiveBiometrics(db, { retentionDays: 180, now: NOW });
    expect(eligible.map(e => e.personId)).toContain('edge');
    db.close();
  });
});

describe('purgeInactiveBiometrics', () => {
  const DAY = 86400000;
  const NOW = 1700000000000;
  it('0 筆符合時不覆蓋既有稽核紀錄', async () => {
    const db = await openFaceDb();
    // 預先寫入一筆「昨天清了 5 筆」的稽核
    await setMaintenance(db, { lastBioPurgeAt: 111, lastBioPurgeCount: 5 });
    // 無任何符合退冊者(空庫)
    const res = await purgeInactiveBiometrics(db, { retentionDays: 180, now: 1700000000000 });
    expect(res.purgedCount).toBe(0);
    const m = await getMaintenance(db);
    expect(m.lastBioPurgeAt).toBe(111);   // 未被覆蓋
    expect(m.lastBioPurgeCount).toBe(5);  // 未被覆蓋
    db.close();
  });

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

describe('orphan GC', () => {
  it('finds snapshots not referenced by any event', async () => {
    const db = await openFaceDb();
    const p = await createPerson(db, { vectors: [], modelVersion: 'v1' });
    const used = await writeSnapshot(new Blob(['used']));
    const orphan = await writeSnapshot(new Blob(['orphan']));
    await createEvent(db, { personId: p.id, scenario: 's', mode: 'checkin', decision: 'match', modelVersion: 'v1', matchSimilarity: 0.9, matchScope: 'global', samplingQuality: 0.8, isNewPerson: false, needsReview: false, snapshotId: used });
    const orphans = await scanOrphanSnapshots(db);
    expect(orphans).toEqual([orphan]);
    db.close();
  });

  it('gcOrphanSnapshots deletes orphans', async () => {
    const db = await openFaceDb();
    await writeSnapshot(new Blob(['orphan']));
    const removed = await gcOrphanSnapshots(db);
    expect(removed).toBe(1);
    expect(await listAllSnapshotIds()).toHaveLength(0);
    db.close();
  });
});
