// 起始值為「待校準」placeholder — admin 校準頁可調整
// 這些數字不是設計決策，只是讓系統能跑起來的初始值
export const DEFAULT_TUNING = {
  id: 'tuning',
  // 採樣（待校準）
  samplingMinFrames: 5,
  samplingMaxDurationMs: 5000,
  samplingNoFaceTimeoutMs: 1500,
  samplingMinFaceSize: 100,
  qualityFactorThresholds: {
    detectionConfidenceMin: 0.7,
    faceSize: 100,
    poseAngleMax: 30,
    blurScoreMin: 50,
    landmarksCompletenessMin: 0.8,
    interFrameConsistencyMin: 0.75,
  },
  // 比對（待校準）
  matchThreshold: 0.7,
  newPersonThreshold: 0.5,
  contaminationGuard: 0.85,
  // 容量（待校準）
  vectorsPerPersonCap: 30,
  snapshotsPerPersonCap: 50,
  // schema
  schemaVersion: 1,
};

export async function getTuning(db) {
  const stored = await db.get('settings', 'tuning');
  if (!stored) return { ...DEFAULT_TUNING };
  return { ...DEFAULT_TUNING, ...stored, qualityFactorThresholds: {
    ...DEFAULT_TUNING.qualityFactorThresholds,
    ...(stored.qualityFactorThresholds || {}),
  }};
}

export async function putTuning(db, overrides) {
  const current = await getTuning(db);
  const next = { ...current, ...overrides, id: 'tuning' };
  await db.put('settings', next);
  return next;
}
