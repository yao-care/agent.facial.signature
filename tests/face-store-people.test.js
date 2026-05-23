import { describe, it, expect, beforeEach } from 'vitest';
import { openFaceDb, DB_NAME } from '../shared/face-store-schema.js';
import { createPerson, getPerson, updatePerson, listPeople, deletePerson } from '../shared/face-store-people.js';

beforeEach(() => { indexedDB.deleteDatabase(DB_NAME); });

function vec(arr) { return new Float32Array(arr); }

describe('people CRUD', () => {
  it('creates a person with auto-generated id, vectors, modelVersion', async () => {
    const db = await openFaceDb();
    const p = await createPerson(db, {
      vectors: [vec([1, 0])],
      modelVersion: 'v1',
      meta: { age: 70 },
    });
    expect(p.id).toMatch(/^[0-9A-Z]{26}$/);
    expect(p.displayName).toBeNull();
    expect(p.vectors[0]).toBeInstanceOf(Float32Array);
    expect(p.createdAt).toBeGreaterThan(0);
    db.close();
  });

  it('retrieves a person by id', async () => {
    const db = await openFaceDb();
    const p = await createPerson(db, { vectors: [vec([1, 0])], modelVersion: 'v1' });
    const fetched = await getPerson(db, p.id);
    expect(fetched.id).toBe(p.id);
    db.close();
  });

  it('updatePerson can set displayName + meta + replace vectors', async () => {
    const db = await openFaceDb();
    const p = await createPerson(db, { vectors: [vec([1, 0])], modelVersion: 'v1' });
    await updatePerson(db, p.id, { displayName: '王伯伯', meta: { phone: '0912' } });
    const fetched = await getPerson(db, p.id);
    expect(fetched.displayName).toBe('王伯伯');
    expect(fetched.meta.phone).toBe('0912');
    expect(fetched.updatedAt).toBeGreaterThanOrEqual(p.createdAt);
    db.close();
  });

  it('listPeople returns all people', async () => {
    const db = await openFaceDb();
    await createPerson(db, { vectors: [vec([1])], modelVersion: 'v1' });
    await createPerson(db, { vectors: [vec([0])], modelVersion: 'v1' });
    const all = await listPeople(db);
    expect(all).toHaveLength(2);
    db.close();
  });

  it('deletePerson removes by id', async () => {
    const db = await openFaceDb();
    const p = await createPerson(db, { vectors: [vec([1])], modelVersion: 'v1' });
    await deletePerson(db, p.id);
    expect(await getPerson(db, p.id)).toBeUndefined();
    db.close();
  });
});
