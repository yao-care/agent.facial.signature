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

// in-memory OPFS fake for tests
function makeFakeOPFS() {
  const files = new Map(); // path → Blob

  async function getDirectoryHandle(name, opts) {
    return makeDirHandle(name);
  }

  function makeDirHandle(prefix) {
    return {
      async getDirectoryHandle(name, opts) {
        return makeDirHandle(`${prefix}/${name}`);
      },
      async getFileHandle(name, opts) {
        const key = `${prefix}/${name}`;
        return {
          name,
          async getFile() {
            const blob = files.get(key);
            if (!blob) throw new Error('NotFound');
            return blob;
          },
          async createWritable() {
            return {
              async write(data) {
                const blob = data instanceof Blob ? data : new Blob([data]);
                files.set(key, blob);
              },
              async close() {},
            };
          },
        };
      },
      async removeEntry(name) {
        const key = `${prefix}/${name}`;
        files.delete(key);
      },
      async *entries() {
        for (const k of files.keys()) {
          if (k.startsWith(`${prefix}/`)) {
            const name = k.slice(prefix.length + 1);
            yield [name, await this.getFileHandle(name)];
          }
        }
      },
      async *keys() {
        for await (const [k] of this.entries()) yield k;
      },
    };
  }

  return {
    async getDirectory() { return makeDirHandle('opfs'); },
    _files: files,
  };
}

globalThis.navigator = globalThis.navigator || {};
globalThis.navigator.storage = makeFakeOPFS();
