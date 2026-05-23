import 'fake-indexeddb/auto';

if (!globalThis.crypto?.randomUUID) {
  globalThis.crypto = globalThis.crypto || {};
  globalThis.crypto.randomUUID = () =>
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
}
