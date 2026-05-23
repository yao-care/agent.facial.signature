import { ulid } from './util-ulid.js';

const DIR_NAME = 'snapshots';

async function getSnapshotsDir() {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(DIR_NAME, { create: true });
}

export async function writeSnapshot(blob, snapshotId) {
  const id = snapshotId || ulid();
  const dir = await getSnapshotsDir();
  const fh = await dir.getFileHandle(`${id}.jpg`, { create: true });
  const w = await fh.createWritable();
  await w.write(blob);
  await w.close();
  return id;
}

export async function readSnapshot(snapshotId) {
  const dir = await getSnapshotsDir();
  const fh = await dir.getFileHandle(`${snapshotId}.jpg`);
  return fh.getFile();
}

export async function deleteSnapshot(snapshotId) {
  const dir = await getSnapshotsDir();
  try {
    await dir.removeEntry(`${snapshotId}.jpg`);
  } catch (e) {
    // ignore NotFound — 與 spec § 10 統一 rollback 策略一致（補償盡力而為）
  }
}

export async function listAllSnapshotIds() {
  const dir = await getSnapshotsDir();
  const ids = [];
  for await (const name of dir.keys()) {
    if (name.endsWith('.jpg')) ids.push(name.slice(0, -4));
  }
  return ids;
}
