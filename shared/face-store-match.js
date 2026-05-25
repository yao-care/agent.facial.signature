import { getTuning } from './face-store-tuning.js';
import { listPeople } from './face-store-people.js';
import { matchVectorsAgainstPeople } from './face-worker-logic.js';

let workerPromise = null;

function getWorker() {
  if (typeof Worker === 'undefined') return null; // test 環境
  if (!workerPromise) {
    workerPromise = Promise.resolve(
      new Worker(new URL('./face-worker.js', import.meta.url), { type: 'module' })
    );
  }
  return workerPromise;
}

let nextReqId = 1;
const pending = new Map();

function ensureWorkerWired(worker) {
  if (worker._wired) return;
  worker._wired = true;
  worker.onmessage = (e) => {
    const { id, ok, result, error } = e.data;
    const cb = pending.get(id);
    if (!cb) return;
    pending.delete(id);
    if (ok) cb.resolve(result); else cb.reject(new Error(error));
  };
}

/**
 * Match query vectors against people in the database.
 *
 * @param {IDBDatabase} db - Face database instance
 * @param {Float32Array[]} queryVectors - Vectors to match (from face embeddings)
 * @param {string} modelVersion - Model version filter (e.g., 'v1', 'v2')
 * @param {Object} opts - Options
 * @param {string[]} opts.candidatePersonIds - Optional: restrict matching to these person IDs (watchlist mode)
 *
 * @returns {Promise<Object>} Match result with { decision, matchScope, candidates, topSimilarity }
 *
 * In test environment (Worker unavailable), runs synchronously via matchVectorsAgainstPeople.
 * In production (browser), dispatches to Web Worker with transferable Float32Array buffers.
 *
 * WARNING: When using Worker mode, queryVectors and their buffers become invalid after
 * postMessage (they are transferred, not copied). The caller should not reference them afterward.
 */
export async function match(db, queryVectors, modelVersion, opts = {}) {
  const tuning = await getTuning(db);
  const all = await listPeople(db);
  const samePeople = all
    .filter(p => p.modelVersion === modelVersion)
    .map(p => ({ id: p.id, vectors: p.vectors }));

  const workerP = getWorker();
  if (!workerP) {
    // 測試環境同步跑
    return matchVectorsAgainstPeople(queryVectors, samePeople, tuning, opts);
  }

  const worker = await workerP;
  ensureWorkerWired(worker);
  const id = nextReqId++;

  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });

    // No transferables — structured clone copies the Float32Array buffers.
    // We previously transferred, but result.vectors is also written to IDB after match()
    // returns, and transferred buffers become detached. The clone cost is small
    // (~hundreds of KB per call) and worth the safety.
    worker.postMessage({
      id,
      type: 'match',
      payload: {
        queryVectors,
        people: samePeople,
        tuning,
        candidatePersonIds: opts.candidatePersonIds,
      },
    });
  });
}
