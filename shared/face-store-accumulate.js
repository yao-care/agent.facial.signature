import { cosineMax } from './util-cosine.js';

// 依 spec § 8.3 — 包含 empty-target fallback
export async function accumulateVectors(db, personId, incomingVectors, params) {
  const { contaminationGuard, vectorsPerPersonCap } = params;
  const tx = db.transaction('people', 'readwrite');
  const person = await tx.store.get(personId);
  if (!person) {
    await tx.done;
    throw new Error(`person ${personId} not found`);
  }

  // 先過濾掉 0-length / null vectors。Float32Array buffer 若曾被 transfer 過會被 detach
  // 變成 length 0，後續 cosineMax 會 dim mismatch 炸掉。此處是最後一道防線。
  const validIncoming = (incomingVectors || []).filter(v => v && v.length > 0);
  // 同時清掉 person 既有 vectors 內可能殘留的 0-length（舊版 bug 可能寫過進去）
  let current = person.vectors.filter(v => v && v.length > 0);
  const accepted = [];
  const isInitiallyEmpty = current.length === 0;

  for (const v of validIncoming) {
    if (isInitiallyEmpty) {
      // empty-target fallback: accepts all incoming vectors
      accepted.push(v);
      current.push(v);
      continue;
    }
    const sMax = cosineMax(v, current);
    if (sMax >= contaminationGuard) {
      accepted.push(v);
      current.push(v);
    }
  }

  // FIFO 汰換到 cap
  if (current.length > vectorsPerPersonCap) {
    current = current.slice(current.length - vectorsPerPersonCap);
  }

  person.vectors = current;
  person.updatedAt = Date.now();
  await tx.store.put(person);
  await tx.done;
  return { accepted: accepted.length, total: current.length };
}
