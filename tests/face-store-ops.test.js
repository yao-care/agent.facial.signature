import { describe, it, expect, beforeEach } from 'vitest';
import { openFaceDb, DB_NAME } from '../shared/face-store-schema.js';
import { createPerson, getPerson, listPeople } from '../shared/face-store-people.js';
import { createEvent, listEventsByPerson } from '../shared/face-store-events.js';
import { createWatchlist, addToWatchlist, getWatchlist } from '../shared/face-store-watchlists.js';
import { writeSnapshot, listAllSnapshotIds } from '../shared/face-store-opfs.js';
import { mergePerson, splitPerson, deletePersonCascade } from '../shared/face-store-ops.js';

beforeEach(() => {
  indexedDB.deleteDatabase(DB_NAME);
  navigator.storage._files.clear();
});

const vec = (a) => new Float32Array(a);

describe('mergePerson A→B', () => {
  it('moves events, applies vector filter, deletes A, replaces in watchlists', async () => {
    const db = await openFaceDb();
    const a = await createPerson(db, { vectors: [vec([1, 0])], modelVersion: 'v1' });
    const b = await createPerson(db, { vectors: [vec([1, 0])], modelVersion: 'v1' });
    await createEvent(db, { personId: a.id, scenario: 's', mode: 'checkin', decision: 'match', modelVersion: 'v1', matchSimilarity: 0.9, matchScope: 'global', samplingQuality: 0.8, isNewPerson: false, needsReview: false });
    await createWatchlist(db, { id: 'w', name: 'W' });
    await addToWatchlist(db, 'w', a.id);

    await mergePerson(db, a.id, b.id, { contaminationGuard: 0.5, vectorsPerPersonCap: 30 });

    expect(await getPerson(db, a.id)).toBeUndefined();
    const bEvents = await listEventsByPerson(db, b.id);
    expect(bEvents).toHaveLength(1);
    const wl = await getWatchlist(db, 'w');
    expect(wl.personIds).toEqual([b.id]);
    db.close();
  });

  it('v1→v2 merge discards old vectors when modelVersions differ', async () => {
    const db = await openFaceDb();
    const a = await createPerson(db, { vectors: [vec([1, 0])], modelVersion: 'v1' });
    const b = await createPerson(db, { vectors: [vec([1, 0, 0])], modelVersion: 'v2' });
    await mergePerson(db, a.id, b.id, { contaminationGuard: 0.5, vectorsPerPersonCap: 30 });
    const updated = await getPerson(db, b.id);
    expect(updated.vectors).toHaveLength(1); // 維持 v2 原本，丟棄 v1
    db.close();
  });
});

describe('splitPerson A→A+B', () => {
  it('moves selected events to new B, A vectors unchanged, B vectors empty', async () => {
    const db = await openFaceDb();
    const a = await createPerson(db, { vectors: [vec([1, 0])], modelVersion: 'v1' });
    const e1 = await createEvent(db, { personId: a.id, scenario: 's', mode: 'checkin', decision: 'match', modelVersion: 'v1', matchSimilarity: 0.9, matchScope: 'global', samplingQuality: 0.8, isNewPerson: false, needsReview: false });
    const e2 = await createEvent(db, { personId: a.id, scenario: 's', mode: 'checkin', decision: 'match', modelVersion: 'v1', matchSimilarity: 0.9, matchScope: 'global', samplingQuality: 0.8, isNewPerson: false, needsReview: false });

    const result = await splitPerson(db, a.id, { eventIdsToSplit: [e2.id] });

    const aAfter = await getPerson(db, a.id);
    const bAfter = await getPerson(db, result.newPersonId);
    expect(aAfter.vectors).toHaveLength(1);
    expect(bAfter.vectors).toHaveLength(0);
    expect(await listEventsByPerson(db, a.id)).toHaveLength(1);
    expect(await listEventsByPerson(db, result.newPersonId)).toHaveLength(1);
    db.close();
  });
});

describe('deletePersonCascade', () => {
  it('removes person, all events, all snapshots, watchlist linkage', async () => {
    const db = await openFaceDb();
    const p = await createPerson(db, { vectors: [vec([1])], modelVersion: 'v1' });
    const snap = await writeSnapshot(new Blob(['img']));
    await createEvent(db, { personId: p.id, scenario: 's', mode: 'checkin', decision: 'match', modelVersion: 'v1', matchSimilarity: 0.9, matchScope: 'global', samplingQuality: 0.8, isNewPerson: false, needsReview: false, snapshotId: snap });
    await createWatchlist(db, { id: 'w', name: 'W' });
    await addToWatchlist(db, 'w', p.id);

    await deletePersonCascade(db, p.id);

    expect(await getPerson(db, p.id)).toBeUndefined();
    expect(await listEventsByPerson(db, p.id)).toHaveLength(0);
    expect(await listAllSnapshotIds()).toHaveLength(0);
    const wl = await getWatchlist(db, 'w');
    expect(wl.personIds).toEqual([]);
    db.close();
  });
});
