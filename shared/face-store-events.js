import { ulid } from './util-ulid.js';

const LEGAL = {
  'checkin:match':     { personIdRequired: true },
  'checkin:new':       { personIdRequired: true },
  'checkin:fuzzy':     { personIdRequired: false }, // null at write
  'alert:alert-hit':   { personIdRequired: true },
  'alert:fuzzy':       { personIdRequired: false }, // null at write
};

export function assertEventInvariants(e, opts = {}) {
  const key = `${e.mode}:${e.decision}`;
  const rule = LEGAL[key];
  if (!rule) throw new Error(`illegal (mode,decision)=(${e.mode},${e.decision})`);

  if (opts.atWrite) {
    // 寫入當下的嚴格 invariant：fuzzy 必須 personId=null + needsReview=true
    if (e.decision === 'fuzzy') {
      if (e.personId != null) throw new Error('fuzzy at write must have personId=null');
      if (e.needsReview !== true) throw new Error('fuzzy at write must have needsReview=true');
    } else {
      if (rule.personIdRequired && e.personId == null) {
        throw new Error(`${key} requires personId`);
      }
    }
  } else {
    // 一般校驗：non-fuzzy 需 personId
    if (rule.personIdRequired && e.personId == null) {
      throw new Error(`${key} requires personId`);
    }
  }
}

export async function createEvent(db, input) {
  const evt = {
    id: ulid(),
    timestamp: Date.now(),
    snapshotId: null,
    meta: {},
    ...input,
  };
  assertEventInvariants(evt, { atWrite: true });
  await db.put('events', evt);
  return evt;
}

export async function getEvent(db, id) {
  return db.get('events', id);
}

export async function listEvents(db) {
  return db.getAll('events');
}

export async function listEventsByPerson(db, personId) {
  return db.getAllFromIndex('events', 'personId', personId);
}

export async function listEventsByScenario(db, scenario) {
  return db.getAllFromIndex('events', 'scenario', scenario);
}

export async function listFuzzyPending(db) {
  // IDB 不支援 boolean index 直接查 true/false 在 happy-dom + fake-indexeddb 下行為一致
  // 改用 needsReview index 查 true（fake-indexeddb 把 boolean 視為合法 keys）
  const all = await db.getAll('events');
  return all.filter(e => e.needsReview === true);
}

export async function updateEvent(db, id, patch) {
  const tx = db.transaction('events', 'readwrite');
  const existing = await tx.store.get(id);
  if (!existing) {
    await tx.done;
    throw new Error(`event ${id} not found`);
  }
  const next = { ...existing, ...patch, id };
  // 審處後的 fuzzy 不再套 atWrite 嚴格 invariant
  assertEventInvariants(next, { atWrite: false });
  await tx.store.put(next);
  await tx.done;
  return next;
}
