import Human from '../vendor/human/human.esm.js';
import { metricsFromHumanFace, computeFrameQuality, isFrameAcceptable } from './face-quality.js';
import { cosineSimilarity } from './util-cosine.js';

const HUMAN_CONFIG = {
  modelBasePath: '/vendor/human/models/',
  cacheModels: true,
  face: {
    enabled: true,
    detector: { rotation: true, maxDetected: 8 },
    mesh: { enabled: true },
    iris: { enabled: false },
    description: { enabled: true }, // FaceRes embedding
    emotion: { enabled: false },
  },
  body: { enabled: false },
  hand: { enabled: false },
  gesture: { enabled: false },
  filter: { enabled: false },
};

export const MODEL_VERSION = 'human-3.3.5-faceres'; // 模型升級時改這裡

export async function createFaceEngine({ videoElement, tuning, concurrency = 'multi-face', singleRoiBox = null }) {
  const human = new Human(HUMAN_CONFIG);
  await human.load();
  await human.warmup();

  const listeners = { faceResult: [], error: [], frameTick: [] };
  const emit = (ev, payload) => { for (const fn of listeners[ev] || []) try { fn(payload); } catch (e) { console.error(e); } };

  const sessions = new Map(); // faceId → session state
  let running = false;
  let stopFn = null;

  function on(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); }
  function off(ev, fn) { listeners[ev] = (listeners[ev] || []).filter(f => f !== fn); }

  async function loop() {
    while (running) {
      const detection = await human.detect(videoElement);
      const faces = detection.face || [];
      const seenIds = new Set();

      for (const face of faces) {
        const faceId = face.id ?? `${Math.round(face.box[0])}-${Math.round(face.box[1])}`;
        seenIds.add(faceId);

        // single-roi 過濾
        if (concurrency === 'single-roi') {
          if (!isInRoi(face, singleRoiBox, videoElement)) continue;
        }

        const metrics = metricsFromHumanFace(face, videoElement);
        if (!isFrameAcceptable(metrics, tuning)) continue;

        let sess = sessions.get(faceId);
        if (!sess) {
          sess = createSession(faceId, tuning);
          sessions.set(faceId, sess);
        }

        await sess.feedFrame(face, metrics, videoElement, human, emit);
      }

      // 清掉長時間沒看到的 sessions
      for (const [id, sess] of sessions.entries()) {
        if (!seenIds.has(id)) {
          const elapsed = Date.now() - sess.lastSeenTs;
          if (elapsed > tuning.samplingNoFaceTimeoutMs) {
            sessions.delete(id);
          }
        } else {
          sess.lastSeenTs = Date.now();
        }
      }

      // 為 UI 疊圖（人臉框 + 進度條）建立 normalized face data
      const faceData = faces.map(face => {
        const faceId = face.id ?? `${Math.round(face.box[0])}-${Math.round(face.box[1])}`;
        const sess = sessions.get(faceId);
        return {
          faceId,
          box: face.box,
          framesCollected: sess?.framesCollected ?? 0,
          targetFrames: tuning.samplingMinFrames,
          done: sess?.done ?? false,
        };
      });
      emit('frameTick', { faces: faceData, faceCount: faces.length, sessionCount: sessions.size });
      await new Promise(r => requestAnimationFrame(r));
    }
  }

  function start() {
    if (running) return;
    running = true;
    loop().catch(err => emit('error', err));
  }

  function stop() {
    running = false;
    sessions.clear();
  }

  return { on, off, start, stop, modelVersion: MODEL_VERSION };
}

function isInRoi(face, roiBox, video) {
  if (!roiBox) return true;
  const [fx, fy, fw, fh] = face.box;
  const fcx = fx + fw / 2;
  const fcy = fy + fh / 2;
  return fcx >= roiBox.x && fcx <= roiBox.x + roiBox.w &&
         fcy >= roiBox.y && fcy <= roiBox.y + roiBox.h;
}

function createSession(faceId, tuning) {
  const start = Date.now();
  const vectors = [];
  const qualities = [];
  let lastSeenTs = Date.now();
  let done = false;

  async function feedFrame(face, metrics, video, human, emit) {
    if (done) return;

    // interFrameConsistency：與上一個 vector 比
    const desc = face.embedding || face.descriptor;
    // Human 偶爾回 null / undefined / 空陣列。空陣列在 `!desc` 下 truthy 通過，
    // 但會產出 0-length Float32Array 後續 cosine 比對會 dim mismatch 炸掉。
    if (!desc || !desc.length) return;
    const vector = new Float32Array(desc);

    let consistency = null;
    if (vectors.length > 0) {
      consistency = cosineSimilarity(vector, vectors[vectors.length - 1]);
    }
    const q = computeFrameQuality({ ...metrics, interFrameConsistency: consistency });

    if (q.passAll(tuning.qualityFactorThresholds)) {
      vectors.push(vector);
      qualities.push(q);
    }

    const elapsed = Date.now() - start;
    const enough = vectors.length >= tuning.samplingMinFrames;

    if (enough) {
      done = true;
      const snapshot = await captureSnapshot(face, video);
      emit('faceResult', {
        faceId,
        vectors,
        snapshot,
        qualityScore: q,
        samplingQuality: averageDetectionConfidence(qualities),
        modelVersion: MODEL_VERSION,
      });
    } else if (elapsed > tuning.samplingMaxDurationMs) {
      done = true;
      emit('faceResult', {
        faceId, vectors, snapshot: null, qualityScore: q,
        samplingQuality: averageDetectionConfidence(qualities), modelVersion: MODEL_VERSION,
        timedOut: true,
      });
    }
  }

  return {
    faceId,
    get lastSeenTs() { return lastSeenTs; },
    set lastSeenTs(v) { lastSeenTs = v; },
    get framesCollected() { return vectors.length; },
    get done() { return done; },
    feedFrame,
  };
}

function averageDetectionConfidence(qs) {
  if (qs.length === 0) return 0;
  return qs.reduce((s, q) => s + q.detectionConfidence, 0) / qs.length;
}

async function captureSnapshot(face, video) {
  const [x, y, w, h] = face.box;
  const margin = 0.2;
  const sx = Math.max(0, x - w * margin);
  const sy = Math.max(0, y - h * margin);
  const sw = w * (1 + 2 * margin);
  const sh = h * (1 + 2 * margin);
  const canvas = document.createElement('canvas');
  canvas.width = 200; canvas.height = 200;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, 200, 200);
  return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85));
}
