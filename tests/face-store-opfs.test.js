import { describe, it, expect, beforeEach } from 'vitest';
import {
  writeSnapshot, readSnapshot, deleteSnapshot, listAllSnapshotIds,
} from '../shared/face-store-opfs.js';

beforeEach(() => {
  navigator.storage._files.clear();
});

describe('OPFS snapshots', () => {
  it('write + read round-trip', async () => {
    const blob = new Blob(['test-image-bytes'], { type: 'image/jpeg' });
    const id = await writeSnapshot(blob);
    expect(id).toMatch(/^[0-9A-Z]{26}$/);
    const back = await readSnapshot(id);
    const text = await back.text();
    expect(text).toBe('test-image-bytes');
  });

  it('delete removes file', async () => {
    const id = await writeSnapshot(new Blob(['x']));
    await deleteSnapshot(id);
    await expect(readSnapshot(id)).rejects.toThrow();
  });

  it('listAllSnapshotIds enumerates files', async () => {
    await writeSnapshot(new Blob(['a']));
    await writeSnapshot(new Blob(['b']));
    const ids = await listAllSnapshotIds();
    expect(ids).toHaveLength(2);
  });
});
