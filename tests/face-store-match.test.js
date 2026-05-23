import { describe, it, expect, beforeEach } from 'vitest';
import { openFaceDb, DB_NAME } from '../shared/face-store-schema.js';
import { createPerson } from '../shared/face-store-people.js';
import { match } from '../shared/face-store-match.js';

beforeEach(() => { indexedDB.deleteDatabase(DB_NAME); });

const vec = (a) => new Float32Array(a);

describe('face-store.match (in-process for tests)', () => {
  it('finds existing person', async () => {
    const db = await openFaceDb();
    await createPerson(db, { vectors: [vec([1, 0, 0])], modelVersion: 'v1' });
    const r = await match(db, [vec([1, 0, 0])], 'v1');
    expect(r.decision).toBe('match');
    expect(r.matchScope).toBe('global');
    db.close();
  });

  it('filters by modelVersion (v2 query ignores v1 people)', async () => {
    const db = await openFaceDb();
    await createPerson(db, { vectors: [vec([1, 0, 0])], modelVersion: 'v1' });
    const r = await match(db, [vec([1, 0, 0])], 'v2');
    expect(r.decision).toBe('new');
    db.close();
  });

  it('candidatePersonIds restricts to watchlist subset', async () => {
    const db = await openFaceDb();
    const p1 = await createPerson(db, { vectors: [vec([1, 0, 0])], modelVersion: 'v1' });
    const p2 = await createPerson(db, { vectors: [vec([0, 1, 0])], modelVersion: 'v1' });
    const r = await match(db, [vec([1, 0, 0])], 'v1', { candidatePersonIds: [p2.id] });
    expect(r.matchScope).toBe('watchlist');
    expect(r.candidates[0].personId).toBe(p2.id);
    db.close();
  });
});
