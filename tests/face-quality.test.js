import { describe, it, expect } from 'vitest';
import { computeFrameQuality, isFrameAcceptable } from '../shared/face-quality.js';

const baseThresholds = {
  detectionConfidenceMin: 0.7,
  faceSize: 100,
  poseAngleMax: 30,
  blurScoreMin: 50,
  landmarksCompletenessMin: 0.8,
  interFrameConsistencyMin: 0.75,
};

describe('computeFrameQuality', () => {
  it('produces per-factor scores from Human-like input', () => {
    const q = computeFrameQuality({
      detectionConfidence: 0.92,
      faceSize: 150,
      poseAngle: 10,
      blurScore: 120,
      landmarksCompleteness: 0.95,
      interFrameConsistency: 0.88,
    });
    expect(q.detectionConfidence).toBe(0.92);
    expect(q.passAll(baseThresholds)).toBe(true);
  });

  it('rejects when any factor below threshold', () => {
    const q = computeFrameQuality({
      detectionConfidence: 0.5, // below 0.7
      faceSize: 150, poseAngle: 10, blurScore: 120,
      landmarksCompleteness: 0.95, interFrameConsistency: 0.88,
    });
    expect(q.passAll(baseThresholds)).toBe(false);
  });

  it('interFrameConsistency: first frame auto-pass', () => {
    const q = computeFrameQuality({
      detectionConfidence: 0.9, faceSize: 150, poseAngle: 10,
      blurScore: 120, landmarksCompleteness: 0.9,
      interFrameConsistency: null, // 第一個 frame
    });
    expect(q.passAll(baseThresholds)).toBe(true);
  });
});

describe('isFrameAcceptable (size pre-gate vs quality)', () => {
  it('pre-gate: faceSize < samplingMinFaceSize → reject immediately', () => {
    expect(isFrameAcceptable({ faceSize: 50 }, { samplingMinFaceSize: 100 })).toBe(false);
  });
  it('pre-gate: faceSize >= → continue', () => {
    expect(isFrameAcceptable({ faceSize: 150 }, { samplingMinFaceSize: 100 })).toBe(true);
  });
});
