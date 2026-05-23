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

  let current = person.vectors.slice();
  const accepted = [];
  const isInitiallyEmpty = current.length === 0;

  for (const v of incomingVectors) {
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
