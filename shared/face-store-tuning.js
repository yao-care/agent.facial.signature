// 起始值仍屬「placeholder」性質 — 正式部署後請依實測校準。
// 此版的數字根據 Human library v3 FaceRes embedding 在常見光線下的
// 經驗值挑選，比初版（matchThreshold 0.7 / contaminationGuard 0.85）
// 寬鬆些，避免「同人但燈光不同」直接判成新人。
export const DEFAULT_TUNING = {
  id: 'tuning',
  // 採樣
  samplingMinFrames: 12,         // ~1 秒（搭配 1.5 秒視覺 ease）
  samplingMaxDurationMs: 6000,   // 超過 6 秒沒湊滿就放棄
  samplingNoFaceTimeoutMs: 1500, // 連續 1.5 秒無臉 → session 結束
  samplingMinFaceSize: 100,      // 臉小於 100px 不啟動 session
  qualityFactorThresholds: {
    detectionConfidenceMin: 0.65,    // Human face.score（>0.5 OK，0.65 較穩）
    faceSize: 120,                   // session 內接受 frame 的臉框最小邊長
    poseAngleMax: 35,                // 偏離正面 35° 內可接受（含戴口罩低頭）
    blurScoreMin: 40,                // 簡化指標，太低為糊照
    landmarksCompletenessMin: 0.7,   // landmark 點數比例
    interFrameConsistencyMin: 0.6,   // 同 session 內向量穩定度（低於這值表示偵測在抖）
  },
  // 比對 — FaceRes 1024-dim embedding 在我們測試的範圍內：
  //   同一人 cosine 通常 0.55-0.80
  //   不同人 cosine 通常 0.10-0.35
  //   模糊區 0.35-0.55
  matchThreshold: 0.55,         // ≥ 0.55 視為同一人
  newPersonThreshold: 0.35,     // < 0.35 視為新人；0.35-0.55 落入 fuzzy
  contaminationGuard: 0.65,     // 回寫向量的最低相似度，比 match 稍高保護
  // 容量
  vectorsPerPersonCap: 30,      // 每人最多累積 30 個向量（足夠多角度）
  snapshotsPerPersonCap: 50,    // 每人最多保留 50 張快照（含 FIFO 汰換）
  // 保留 / 提醒生命週期（可校準起始值，非法定值）
  bioRetentionDays: 180,    // 退冊清除：未簽到 ≥ 此天數自動清生物特徵
  exportReminderDays: 7,    // 超過此天數未匯出備份即告警
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
