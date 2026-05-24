import { unzipSync, strFromU8 } from '../vendor/fflate/fflate.module.js';
import { writeSnapshot } from './face-store-opfs.js';

const SCHEMA_VERSION = 1;

export async function importAll(db, zipBlob, { password } = {}) {
  let bytes = new Uint8Array(await zipBlob.arrayBuffer());

  // 自動偵測加密：zip 標頭是 'PK\x03\x04'；加密則需密碼
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    if (!password) throw new Error('encrypted backup requires password');
    bytes = await decryptZip(bytes, password);
  }

  const files = unzipSync(bytes);
  const manifest = JSON.parse(strFromU8(files['manifest.json']));
  if (manifest.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(`schema version mismatch: backup=${manifest.schemaVersion}, current=${SCHEMA_VERSION}`);
  }

  // 清空現有資料（spec § 9.5 全覆蓋策略）
  const tx = db.transaction(['people', 'events', 'watchlists', 'settings', 'meta-stats'], 'readwrite');
  for (const name of ['people', 'events', 'watchlists', 'settings', 'meta-stats']) {
    await tx.objectStore(name).clear();
  }
  await tx.done;

  // 讀回 vectors
  const vectorsIndex = JSON.parse(strFromU8(files['vectors-index.json']));
  const vectorsBin = files['vectors.bin'];
  const vectorsByPerson = {};
  for (const idx of vectorsIndex) {
    const { personId, offset, count, dim } = idx;
    const arr = [];
    for (let i = 0; i < count; i++) {
      const start = offset + i * dim * 4;
      // copy to avoid aliasing whole bin
      const slice = vectorsBin.slice(start, start + dim * 4);
      arr.push(new Float32Array(slice.buffer, slice.byteOffset, dim));
    }
    vectorsByPerson[personId] = arr;
  }

  // 寫入 people（合併 vectors）
  const peopleLines = strFromU8(files['people.ndjson']).split('\n').filter(Boolean);
  const tx2 = db.transaction(['people'], 'readwrite');
  for (const line of peopleLines) {
    const p = JSON.parse(line);
    p.vectors = vectorsByPerson[p.id] || [];
    await tx2.objectStore('people').put(p);
  }
  await tx2.done;

  // events / watchlists / settings
  const eventLines = strFromU8(files['events.ndjson']).split('\n').filter(Boolean);
  const tx3 = db.transaction(['events'], 'readwrite');
  for (const line of eventLines) await tx3.objectStore('events').put(JSON.parse(line));
  await tx3.done;

  const wlLines = strFromU8(files['watchlists.ndjson']).split('\n').filter(Boolean);
  const tx4 = db.transaction(['watchlists'], 'readwrite');
  for (const line of wlLines) await tx4.objectStore('watchlists').put(JSON.parse(line));
  await tx4.done;

  const settings = JSON.parse(strFromU8(files['settings.json']));
  const tx5 = db.transaction(['settings'], 'readwrite');
  for (const s of settings) await tx5.objectStore('settings').put(s);
  await tx5.done;

  // OPFS snapshots
  for (const name of Object.keys(files)) {
    if (name.startsWith('snapshots/') && name.endsWith('.jpg')) {
      const sid = name.slice('snapshots/'.length, -4);
      const blob = new Blob([files[name]], { type: 'image/jpeg' });
      await writeSnapshot(blob, sid);
    }
  }
}

async function decryptZip(encBytes, password) {
  const enc = new TextEncoder();
  const salt = encBytes.slice(0, 16);
  const iv = encBytes.slice(16, 28);
  const ciphertext = encBytes.slice(28);
  const baseKey = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 200000, hash: 'SHA-256' },
    baseKey, { name: 'AES-GCM', length: 256 }, false, ['decrypt']
  );
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
  return new Uint8Array(plain);
}
