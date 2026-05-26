import { describe, it, expect, beforeEach } from 'vitest';
import { openFaceDb, DB_NAME } from '../shared/face-store-schema.js';
import {
  getScenarioConfig, putScenarioConfig, listScenarioConfigs,
} from '../shared/face-store-config.js';

beforeEach(() => { indexedDB.deleteDatabase(DB_NAME); });

describe('scenarioConfig', () => {
  it('put then get round-trips serviceRecord', async () => {
    const db = await openFaceDb();
    const sr = { 服務項目: '健康促進', 時段: '上午', 活動編號: 'HP-1', 活動主題: '匹克球', 餐飲類型: '', 服務志工: '王' };
    await putScenarioConfig(db, 'example-checkin', sr);
    const got = await getScenarioConfig(db, 'example-checkin');
    expect(got.scenarioId).toBe('example-checkin');
    expect(got.serviceRecord).toEqual(sr);
    expect(got.updatedAt).toBeGreaterThan(0);
    db.close();
  });

  it('getScenarioConfig returns undefined when absent', async () => {
    const db = await openFaceDb();
    expect(await getScenarioConfig(db, 'nope')).toBeUndefined();
    db.close();
  });

  it('listScenarioConfigs excludes the tuning settings record', async () => {
    const db = await openFaceDb();
    await db.put('settings', { id: 'tuning', matchThreshold: 0.5 });
    await putScenarioConfig(db, 'a', { 服務項目: '電話問安' });
    await putScenarioConfig(db, 'b', { 服務項目: '餐飲服務' });
    const list = await listScenarioConfigs(db);
    expect(list.map(r => r.scenarioId).sort()).toEqual(['a', 'b']);
    db.close();
  });
});
