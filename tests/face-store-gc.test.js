import { describe, it, expect, beforeEach } from 'vitest';
import { openFaceDb, DB_NAME } from '../shared/face-store-schema.js';
import { createPerson } from '../shared/face-store-people.js';
import { createEvent } from '../shared/face-store-events.js';
import { writeSnapshot, listAllSnapshotIds, readSnapshot } from '../shared/face-store-opfs.js';
import { scanOrphanSnapshots, gcOrphanSnapshots } from '../shared/face-store-gc.js';

beforeEach(() => {
  indexedDB.deleteDatabase(DB_NAME);
  navigator.storage._files.clear();
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
