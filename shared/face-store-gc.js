import { listAllSnapshotIds, deleteSnapshot } from './face-store-opfs.js';

const MS_PER_DAY = 86400000;
const MAINTENANCE_ID = 'maintenance';
const MAINTENANCE_DEFAULT = { id: MAINTENANCE_ID, lastExportAt: null, lastBioPurgeAt: null, lastBioPurgeCount: 0 };

export async function scanOrphanSnapshots(db) {
  const allInOpfs = await listAllSnapshotIds();
  const allEvents = await db.getAll('events');
  const referenced = new Set(allEvents.map(e => e.snapshotId).filter(Boolean));
  return allInOpfs.filter(id => !referenced.has(id));
}

export async function gcOrphanSnapshots(db) {
  const orphans = await scanOrphanSnapshots(db);
  for (const id of orphans) await deleteSnapshot(id);
  return orphans.length;
}

export async function scanInactiveBiometrics(db, { retentionDays, now = Date.now() }) {
  const people = await db.getAll('people');
  const events = await db.getAll('events');
  const lastActivity = {};
  for (const e of events) {
    if (!e.personId) continue;
    if (lastActivity[e.personId] === undefined || e.timestamp > lastActivity[e.personId]) {
      lastActivity[e.personId] = e.timestamp;
    }
  }
  const cutoff = retentionDays * MS_PER_DAY;
  const result = [];
  for (const p of people) {
    if (!p.vectors || p.vectors.length === 0) continue; // 已無生物特徵
    const last = lastActivity[p.id] ?? p.createdAt;
    if (now - last >= cutoff) {
      result.push({ personId: p.id, displayName: p.displayName, daysInactive: Math.floor((now - last) / MS_PER_DAY) });
    }
  }
  return result;
}

export async function purgeInactiveBiometrics(db, { retentionDays, now = Date.now() }) {
  const eligible = await scanInactiveBiometrics(db, { retentionDays, now });
  const events = await db.getAll('events');
  const snapsByPerson = {};
  for (const e of events) {
    if (e.personId && e.snapshotId) {
      (snapsByPerson[e.personId] = snapsByPerson[e.personId] || []).push(e.snapshotId);
    }
  }
  for (const { personId } of eligible) {
    const p = await db.get('people', personId);
    if (!p) continue;
    p.vectors = [];
    p.updatedAt = now;
    await db.put('people', p);
    for (const sid of (snapsByPerson[personId] || [])) {
      await deleteSnapshot(sid);
    }
  }
  await setMaintenance(db, { lastBioPurgeAt: now, lastBioPurgeCount: eligible.length });
  return { purgedCount: eligible.length, personIds: eligible.map((e) => e.personId) };
}

export async function getMaintenance(db) {
  const stored = await db.get('settings', MAINTENANCE_ID);
  return { ...MAINTENANCE_DEFAULT, ...(stored || {}) };
}

export async function setMaintenance(db, patch) {
  const cur = await getMaintenance(db);
  const next = { ...cur, ...patch, id: MAINTENANCE_ID };
  await db.put('settings', next);
  return next;
}
