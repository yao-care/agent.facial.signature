import { describe, it, expect, beforeEach } from 'vitest';
import { openFaceDb, DB_NAME } from '../shared/face-store-schema.js';

beforeEach(async () => {
  indexedDB.deleteDatabase(DB_NAME);
});

describe('openFaceDb', () => {
  it('creates all 5 stores', async () => {
    const db = await openFaceDb();
    const names = [...db.objectStoreNames].sort();
    expect(names).toEqual(['events', 'meta-stats', 'people', 'settings', 'watchlists']);
    db.close();
  });

  it('creates required indexes on events', async () => {
    const db = await openFaceDb();
    const tx = db.transaction('events');
    const store = tx.objectStore('events');
    const indexNames = [...store.indexNames].sort();
    expect(indexNames).toEqual(
      ['decision', 'mode', 'needsReview', 'personId', 'scenario', 'timestamp'].sort()
    );
    db.close();
  });

  it('creates displayName + modelVersion indexes on people', async () => {
    const db = await openFaceDb();
    const tx = db.transaction('people');
    const indexNames = [...tx.objectStore('people').indexNames].sort();
    expect(indexNames).toEqual(['displayName', 'modelVersion']);
    db.close();
  });
});
