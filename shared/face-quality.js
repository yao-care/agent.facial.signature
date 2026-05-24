export function computeFrameQuality(metrics) {
  return {
    ...metrics,
    passAll(thresholds) {
      const fcCheck = metrics.interFrameConsistency == null
        ? true // 第一個 frame 自動視為通過
        : metrics.interFrameConsistency >= thresholds.interFrameConsistencyMin;
      return (
        metrics.detectionConfidence >= thresholds.detectionConfidenceMin &&
        metrics.faceSize >= thresholds.faceSize &&
        Math.abs(metrics.poseAngle) <= thresholds.poseAngleMax &&
        metrics.blurScore >= thresholds.blurScoreMin &&
        metrics.landmarksCompleteness >= thresholds.landmarksCompletenessMin &&
        fcCheck
      );
    },
  };
}

// pre-gate：小於 samplingMinFaceSize 連 session 都不啟動
export function isFrameAcceptable(metrics, tuning) {
  return metrics.faceSize >= tuning.samplingMinFaceSize;
}

// 把 Human face 物件轉為品質 metrics（spec § 8.0 來源欄位）
export function metricsFromHumanFace(face, canvas) {
  const [x, y, w, h] = face.box || [0, 0, 0, 0];
  const faceSize = Math.min(w, h);
  const poseAngle = Math.max(
    Math.abs(face.rotation?.angle?.yaw ?? 0),
    Math.abs(face.rotation?.angle?.pitch ?? 0),
    Math.abs(face.rotation?.angle?.roll ?? 0),
  ) * (180 / Math.PI);
  // blur: 簡化用 face.real（Human 偵測活體分數的近似）
  const blurScore = (face.real ?? 0.5) * 200;
  const landmarksCompleteness = face.mesh?.length ? Math.min(1, face.mesh.length / 478) : 0.5;
  return {
    detectionConfidence: face.score ?? 0,
    faceSize,
    poseAngle,
    blurScore,
    landmarksCompleteness,
    // interFrameConsistency 由 session 累積計算（見 face-engine sampling）
  };
}

export function sessionSummaryQuality(qualities) {
  if (qualities.length === 0) return 0;
  let sum = 0;
  for (const q of qualities) {
    sum += q.detectionConfidence;
  }
  return sum / qualities.length;
}
