import { describe, it, expect, beforeEach } from 'vitest';
import { openFaceDb, DB_NAME } from '../shared/face-store-schema.js';
import { createPerson, getPerson } from '../shared/face-store-people.js';
import { accumulateVectors } from '../shared/face-store-accumulate.js';

beforeEach(() => { indexedDB.deleteDatabase(DB_NAME); });

const vec = (a) => new Float32Array(a);

describe('accumulateVectors', () => {
  it('empty target → accepts all incoming vectors regardless of similarity', async () => {
    const db = await openFaceDb();
    const p = await createPerson(db, { vectors: [], modelVersion: 'v1' });
    await accumulateVectors(db, p.id, [vec([1, 0]), vec([0, 1])], {
      contaminationGuard: 0.99, vectorsPerPersonCap: 30,
    });
    const updated = await getPerson(db, p.id);
    expect(updated.vectors).toHaveLength(2);
    db.close();
  });

  it('filters vectors below contaminationGuard', async () => {
    const db = await openFaceDb();
    const p = await createPerson(db, { vectors: [vec([1, 0])], modelVersion: 'v1' });
    await accumulateVectors(db, p.id, [vec([1, 0]), vec([0, 1])], {
      contaminationGuard: 0.9, vectorsPerPersonCap: 30,
    });
    const updated = await getPerson(db, p.id);
    expect(updated.vectors).toHaveLength(2); // 原本 1 + 通過的 1（[1,0]）
    db.close();
  });

  it('FIFO汰換最舊向量達到 cap', async () => {
    const db = await openFaceDb();
    const initial = [vec([1, 0, 0]), vec([1, 0, 0]), vec([1, 0, 0])];
    const p = await createPerson(db, { vectors: initial, modelVersion: 'v1' });
    await accumulateVectors(db, p.id, [vec([1, 0, 0])], {
      contaminationGuard: 0.5, vectorsPerPersonCap: 3,
    });
    const updated = await getPerson(db, p.id);
    expect(updated.vectors).toHaveLength(3);
    db.close();
  });
});
