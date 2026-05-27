import { describe, it, expect, beforeEach } from 'vitest';
import { openFaceDb, DB_NAME } from '../shared/face-store-schema.js';
import {
  getScenarioConfig, putScenarioConfig, listScenarioConfigs,
} from '../shared/face-store-config.js';

beforeEach(() => { indexedDB.deleteDatabase(DB_NAME); });

describe('scenarioConfig', () => {
  it('put then get round-trips schedule', async () => {
    const db = await openFaceDb();
    const schedule = { weekly: [{ weekday: 1, start: '09:00', end: '11:00', 服務項目: '健康促進' }], specific: [] };
    await putScenarioConfig(db, 'example-checkin', schedule);
    const got = await getScenarioConfig(db, 'example-checkin');
    expect(got.scenarioId).toBe('example-checkin');
    expect(got.schedule).toEqual(schedule);
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
    await putScenarioConfig(db, 'a', { weekly: [], specific: [] });
    await putScenarioConfig(db, 'b', { weekly: [], specific: [] });
    const list = await listScenarioConfigs(db);
    expect(list.map(r => r.scenarioId).sort()).toEqual(['a', 'b']);
    db.close();
  });
});
