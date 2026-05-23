import { ulid } from './util-ulid.js';
import {
  removePersonFromAllWatchlists, replacePersonInAllWatchlists,
} from './face-store-watchlists.js';
import { deleteSnapshot } from './face-store-opfs.js';
import { accumulateVectors } from './face-store-accumulate.js';

export async function mergePerson(db, fromId, toId, accumParams) {
  if (fromId === toId) throw new Error('cannot merge person to itself');
  const a = await db.get('people', fromId);
  const b = await db.get('people', toId);
  if (!a || !b) throw new Error('person not found');

  // 1. vectors 處理
  if (a.modelVersion === b.modelVersion && a.vectors.length > 0) {
    // 同模型 → 套 § 8.3 過濾
    await accumulateVectors(db, toId, a.vectors, accumParams);
  }
  // 跨模型版本 → 直接丟棄 a.vectors（§ 6.5）

  // 2. 改 events.personId（IDB transaction 內）
  const tx = db.transaction(['events', 'people'], 'readwrite');
  const evIdx = tx.objectStore('events').index('personId');
  let cursor = await evIdx.openCursor(IDBKeyRange.only(fromId));
  while (cursor) {
    const ev = cursor.value;
    ev.personId = toId;
    await cursor.update(ev);
    cursor = await cursor.continue();
  }
  // 3. 刪 person a
  await tx.objectStore('people').delete(fromId);
  await tx.done;

  // 4. watchlist 連動
  await replacePersonInAllWatchlists(db, fromId, toId);
}

export async function splitPerson(db, fromId, { eventIdsToSplit }) {
  if (!Array.isArray(eventIdsToSplit) || eventIdsToSplit.length === 0) {
    throw new Error('eventIdsToSplit must be non-empty array');
  }
  const source = await db.get('people', fromId);
  if (!source) throw new Error('source person not found');

  // 建新 person B（空 vectors，displayName=null）
  const newId = ulid();
  const now = Date.now();
  const newPerson = {
    id: newId,
    displayName: null,
    vectors: [],
    modelVersion: source.modelVersion,
    meta: {},
    createdAt: now,
    updatedAt: now,
  };

  const tx = db.transaction(['people', 'events'], 'readwrite');
  await tx.objectStore('people').put(newPerson);

  // 把指定 events 改 personId = newId（needsReview 維持 false：拆分本身已是審處動作）
  for (const evId of eventIdsToSplit) {
    const ev = await tx.objectStore('events').get(evId);
    if (!ev) continue;
    if (ev.personId !== fromId) continue; // 避免拆走別人的 events
    ev.personId = newId;
    await tx.objectStore('events').put(ev);
  }
  await tx.done;

  return { newPersonId: newId };
}

export async function deletePersonCascade(db, personId) {
  // 1. 蒐集該人的 snapshotIds
  const events = await db.getAllFromIndex('events', 'personId', personId);
  const snapshotIds = events.map(e => e.snapshotId).filter(Boolean);

  // 2. IDB transaction: 刪 events + 刪 person
  const tx = db.transaction(['events', 'people'], 'readwrite');
  for (const ev of events) {
    await tx.objectStore('events').delete(ev.id);
  }
  await tx.objectStore('people').delete(personId);
  await tx.done;

  // 3. watchlist 連動
  await removePersonFromAllWatchlists(db, personId);

  // 4. OPFS snapshots（補償盡力而為 — § 10 統一策略）
  for (const sid of snapshotIds) {
    await deleteSnapshot(sid);
  }
}
