import { ulid } from './util-ulid.js';

export async function createPerson(db, { vectors = [], modelVersion, meta = {}, displayName = null }) {
  if (!modelVersion) throw new Error('modelVersion required');
  const now = Date.now();
  const person = {
    id: ulid(),
    displayName,
    vectors,
    modelVersion,
    meta,
    createdAt: now,
    updatedAt: now,
  };
  await db.put('people', person);
  return person;
}

export async function getPerson(db, id) {
  return db.get('people', id);
}

export async function updatePerson(db, id, patch) {
  const tx = db.transaction('people', 'readwrite');
  const existing = await tx.store.get(id);
  if (!existing) {
    await tx.done;
    throw new Error(`person ${id} not found`);
  }
  const next = {
    ...existing,
    ...patch,
    id,
    meta: patch.meta ? { ...existing.meta, ...patch.meta } : existing.meta,
    updatedAt: Date.now(),
  };
  await tx.store.put(next);
  await tx.done;
  return next;
}

export async function listPeople(db) {
  return db.getAll('people');
}

export async function deletePerson(db, id) {
  await db.delete('people', id);
}
