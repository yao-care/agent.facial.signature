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
