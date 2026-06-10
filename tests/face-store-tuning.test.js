import { describe, it, expect, beforeEach } from 'vitest';
import { openFaceDb, DB_NAME } from '../shared/face-store-schema.js';
import { getTuning, putTuning, DEFAULT_TUNING } from '../shared/face-store-tuning.js';

beforeEach(() => { indexedDB.deleteDatabase(DB_NAME); });

describe('tuning', () => {
  it('returns DEFAULT_TUNING when none stored', async () => {
    const db = await openFaceDb();
    const t = await getTuning(db);
    expect(t.matchThreshold).toBe(DEFAULT_TUNING.matchThreshold);
    expect(t.id).toBe('tuning');
    db.close();
  });

  it('persists overrides via putTuning', async () => {
    const db = await openFaceDb();
    await putTuning(db, { matchThreshold: 0.85 });
    const t = await getTuning(db);
    expect(t.matchThreshold).toBe(0.85);
    expect(t.newPersonThreshold).toBe(DEFAULT_TUNING.newPersonThreshold);
    db.close();
  });

  it('DEFAULT_TUNING has all required fields', () => {
    const required = [
      'samplingMinFrames', 'samplingMaxDurationMs', 'samplingNoFaceTimeoutMs',
      'samplingMinFaceSize', 'qualityFactorThresholds',
      'matchThreshold', 'newPersonThreshold', 'contaminationGuard',
      'vectorsPerPersonCap', 'snapshotsPerPersonCap', 'schemaVersion',
    ];
    for (const k of required) expect(DEFAULT_TUNING).toHaveProperty(k);
  });

  it('DEFAULT_TUNING 含退冊保留期與匯出提醒參數', () => {
    expect(DEFAULT_TUNING.bioRetentionDays).toBe(180);
    expect(DEFAULT_TUNING.exportReminderDays).toBe(7);
  });
});
