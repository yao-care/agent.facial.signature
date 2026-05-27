import { describe, it, expect, beforeEach } from 'vitest';
import { openFaceDb, DB_NAME } from '../shared/face-store-schema.js';
import { getRegisteredKeys, setRegistered } from '../shared/face-store-report.js';

beforeEach(() => { indexedDB.deleteDatabase(DB_NAME); });

describe('report registered', () => {
  it('初始為空', async () => {
    const db = await openFaceDb();
    expect((await getRegisteredKeys(db)).size).toBe(0);
    db.close();
  });
  it('set true 加入、set false 移除', async () => {
    const db = await openFaceDb();
    await setRegistered(db, 'k1', true);
    await setRegistered(db, 'k2', true);
    expect([...(await getRegisteredKeys(db))].sort()).toEqual(['k1', 'k2']);
    await setRegistered(db, 'k1', false);
    expect([...(await getRegisteredKeys(db))]).toEqual(['k2']);
    db.close();
  });
  it('set true 具冪等性', async () => {
    const db = await openFaceDb();
    await setRegistered(db, 'k1', true);
    await setRegistered(db, 'k1', true);
    expect([...(await getRegisteredKeys(db))]).toEqual(['k1']);
    db.close();
  });
});
