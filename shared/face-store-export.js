import { zipSync, strToU8 } from '../vendor/fflate/fflate.module.js';
import { listAllSnapshotIds, readSnapshot } from './face-store-opfs.js';

const SCHEMA_VERSION = 1;

export async function exportAll(db, { password } = {}) {
  const people = await db.getAll('people');
  const events = await db.getAll('events');
  const watchlists = await db.getAll('watchlists');
  const settings = await db.getAll('settings');

  // vectors → binary
  const vectorsIndex = [];
  const vectorChunks = [];
  let cursor = 0;
  for (const p of people) {
    const dim = p.vectors[0]?.length ?? 0;
    for (const v of p.vectors) {
      vectorChunks.push(new Uint8Array(v.buffer, v.byteOffset, v.byteLength));
    }
    vectorsIndex.push({
      personId: p.id,
      offset: cursor,
      count: p.vectors.length,
      dim,
    });
    cursor += p.vectors.length * dim * 4; // float32
  }
  const vectorsBin = new Uint8Array(cursor);
  let off = 0;
  for (const c of vectorChunks) {
    vectorsBin.set(c, off);
    off += c.byteLength;
  }

  // strip vectors from people before serialization
  const peopleNoVecs = people.map(({ vectors, ...rest }) => rest);

  const manifest = {
    schemaVersion: SCHEMA_VERSION,
    modelVersions: [...new Set(people.map(p => p.modelVersion))],
    exportedAt: Date.now(),
    counts: { people: people.length, events: events.length },
  };

  // OPFS snapshots
  const snapshotIds = await listAllSnapshotIds();
  const snapshotFiles = {};
  for (const sid of snapshotIds) {
    const blob = await readSnapshot(sid);
    const buf = new Uint8Array(await blob.arrayBuffer());
    snapshotFiles[`snapshots/${sid}.jpg`] = buf;
  }

  const zipFiles = {
    'manifest.json': strToU8(JSON.stringify(manifest, null, 2)),
    'people.ndjson': strToU8(peopleNoVecs.map(JSON.stringify).join('\n')),
    'events.ndjson': strToU8(events.map(JSON.stringify).join('\n')),
    'watchlists.ndjson': strToU8(watchlists.map(JSON.stringify).join('\n')),
    'settings.json': strToU8(JSON.stringify(settings)),
    'vectors.bin': vectorsBin,
    'vectors-index.json': strToU8(JSON.stringify(vectorsIndex)),
    ...snapshotFiles,
  };

  const zipBytes = zipSync(zipFiles);

  if (password) {
    // AES-GCM 加密 zip → 另一個 zip 內含 ciphertext + IV + salt
    return await encryptZip(zipBytes, password);
  }
  return new Blob([zipBytes], { type: 'application/zip' });
}

async function encryptZip(plainBytes, password) {
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const baseKey = await crypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']
  );
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 200000, hash: 'SHA-256' },
    baseKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt']
  );
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plainBytes);
  // 簡單封裝：salt(16) || iv(12) || ciphertext
  const out = new Uint8Array(16 + 12 + ciphertext.byteLength);
  out.set(salt, 0);
  out.set(iv, 16);
  out.set(new Uint8Array(ciphertext), 28);
  return new Blob([out], { type: 'application/octet-stream' });
}
