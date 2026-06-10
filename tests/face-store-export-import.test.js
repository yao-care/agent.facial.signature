import { describe, it, expect, beforeEach } from 'vitest';
import { openFaceDb, DB_NAME } from '../shared/face-store-schema.js';
import { createPerson, listPeople, getPerson } from '../shared/face-store-people.js';
import { createEvent, listEvents } from '../shared/face-store-events.js';
import { createWatchlist } from '../shared/face-store-watchlists.js';
import { writeSnapshot, listAllSnapshotIds } from '../shared/face-store-opfs.js';
import { exportAll } from '../shared/face-store-export.js';
import { importAll } from '../shared/face-store-import.js';

beforeEach(() => {
  indexedDB.deleteDatabase(DB_NAME);
  navigator.storage._files.clear();
});

const vec = (a) => new Float32Array(a);

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
    db.close();
    const db2 = await openFaceDb();
    await expect(importAll(db2, blob, { password: 'wrong' })).rejects.toThrow();
    db2.close();
  });

  it('加密檔缺密碼匯入報明確錯誤', async () => {
    const db = await openFaceDb();
    await createPerson(db, { vectors:[vec([1,0,0])], modelVersion:'v1', displayName:'密' });
    const blob = await exportAll(db, { password: 'right' });
    db.close();
    const db2 = await openFaceDb();
    await expect(importAll(db2, blob, {})).rejects.toThrow('encrypted backup requires password');
    db2.close();
  });
});

describe('export → import round-trip', () => {
  it('preserves people, events, watchlists, snapshots, vectors', async () => {
    const db = await openFaceDb();
    const p = await createPerson(db, {
      vectors: [vec([1, 0, 0]), vec([0, 1, 0])],
      modelVersion: 'v1',
      displayName: '王伯伯',
      meta: { phone: '0912' },
    });
    const snap = await writeSnapshot(new Blob(['img-bytes']));
    await createEvent(db, {
      personId: p.id, scenario: 's', mode: 'checkin', decision: 'match',
      modelVersion: 'v1', matchSimilarity: 0.9, matchScope: 'global',
      samplingQuality: 0.8, isNewPerson: false, needsReview: false,
      snapshotId: snap,
    });
    await createWatchlist(db, { id: 'w', name: 'W' });

    const zipBlob = await exportAll(db);
    expect(zipBlob.size).toBeGreaterThan(0);

    // 清空後 import
    db.close();
    indexedDB.deleteDatabase(DB_NAME);
    navigator.storage._files.clear();
    const db2 = await openFaceDb();
    await importAll(db2, zipBlob);

    const people = await listPeople(db2);
    expect(people).toHaveLength(1);
    expect(people[0].displayName).toBe('王伯伯');
    expect(people[0].vectors[0]).toBeInstanceOf(Float32Array);
    expect(people[0].vectors[0][0]).toBeCloseTo(1, 6);
    expect(people[0].vectors).toHaveLength(2);

    const events = await listEvents(db2);
    expect(events).toHaveLength(1);
    expect(events[0].snapshotId).toBe(snap);

    const snaps = await listAllSnapshotIds();
    expect(snaps).toEqual([snap]);

    db2.close();
  });
});
