import { listAllSnapshotIds, deleteSnapshot } from './face-store-opfs.js';

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

const MAINTENANCE_ID = 'maintenance';
const MAINTENANCE_DEFAULT = { id: MAINTENANCE_ID, lastExportAt: null, lastBioPurgeAt: null, lastBioPurgeCount: 0 };

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
