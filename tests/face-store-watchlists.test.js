import { describe, it, expect, beforeEach } from 'vitest';
import { openFaceDb, DB_NAME } from '../shared/face-store-schema.js';
import {
  createWatchlist, addToWatchlist, removeFromWatchlist,
  listWatchlists, getWatchlist, deleteWatchlist,
  findWatchlistsContaining,
} from '../shared/face-store-watchlists.js';

beforeEach(() => { indexedDB.deleteDatabase(DB_NAME); });

describe('watchlists', () => {
  it('creates with empty personIds + timestamps', async () => {
    const db = await openFaceDb();
    const w = await createWatchlist(db, { id: 'highrisk', name: '高風險走失' });
    expect(w.personIds).toEqual([]);
    expect(w.createdAt).toBeGreaterThan(0);
    db.close();
  });

  it('add / remove dedups + updates timestamp', async () => {
    const db = await openFaceDb();
    await createWatchlist(db, { id: 'w1', name: 'W' });
    await addToWatchlist(db, 'w1', 'p1');
    await addToWatchlist(db, 'w1', 'p1'); // dedup
    let w = await getWatchlist(db, 'w1');
    expect(w.personIds).toEqual(['p1']);
    await removeFromWatchlist(db, 'w1', 'p1');
    w = await getWatchlist(db, 'w1');
    expect(w.personIds).toEqual([]);
    db.close();
  });

  it('findWatchlistsContaining (reverse query, full scan in MVP)', async () => {
    const db = await openFaceDb();
    await createWatchlist(db, { id: 'a', name: 'A' });
    await createWatchlist(db, { id: 'b', name: 'B' });
    await addToWatchlist(db, 'a', 'p1');
    await addToWatchlist(db, 'b', 'p1');
    const found = await findWatchlistsContaining(db, 'p1');
    expect(found.map(w => w.id).sort()).toEqual(['a', 'b']);
    db.close();
  });
});
