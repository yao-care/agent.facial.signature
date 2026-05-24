# Facial Signature 平台實作計畫

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 純前端、瀏覽器資料、可 PWA 部署的人臉辨識簽到平台 MVP，涵蓋簽到 + 警示兩種模式 + 管理介面。

**Architecture:** 6 個共用 JS 模組（engine / store / ui / worker + checkin-template / alert-template）+ 3 個 HTML（example-checkin / example-alert / admin）+ PWA 配套。資料層 IndexedDB（結構化）+ OPFS（snapshots）。比對放 Web Worker。

**Tech Stack:** ES modules + Vanilla JS + @vladmandic/human + idb + WebCrypto + vitest + fake-indexeddb（測試）

**Spec 參照:** `docs/superpowers/specs/2026-05-23-facial-signature-design.md`

---

## File Structure (locked)

```
/
  example-checkin.html         ← Phase 6
  example-alert.html           ← Phase 6
  admin.html                   ← Phase 7
  manifest.json                ← Phase 8
  service-worker.js            ← Phase 8

  configs/
    example-checkin.json       ← Phase 6
    example-watchlist.json     ← Phase 6

  shared/
    face-store.js              ← Phase 2 (核心資料層)
    face-worker.js             ← Phase 2 (比對 worker)
    face-engine.js             ← Phase 3 (相機 + 採樣 + 萃取)
    face-ui.js                 ← Phase 4 (UI 元件)
    face-checkin-template.js   ← Phase 5
    face-alert-template.js     ← Phase 5
    util-ulid.js               ← Phase 2 (ULID 產生器)
    util-cosine.js             ← Phase 2 (cosine similarity)

  vendor/
    human/human.esm.js         ← Phase 1
    idb/idb.min.js             ← Phase 1

  tests/
    setup.js                   ← Phase 1 (fake-indexeddb wiring)
    util-cosine.test.js        ← Phase 2
    util-ulid.test.js          ← Phase 2
    face-store.test.js         ← Phase 2 (多檔切分)
    quality-score.test.js      ← Phase 3
    config-parser.test.js      ← Phase 5
    export-import.test.js      ← Phase 2

  package.json                 ← Phase 1
  vitest.config.js             ← Phase 1
  README.md                    ← Phase 9
  .gitignore                   ← Phase 1
```

**模組責任邊界**：嚴格遵守 spec § 3.1（face-store 不做 cosine math、face-engine 不做 storage、face-ui 不做 math、face-worker 不碰 DOM）。

---

## Phase 1：Project Bootstrap

### Task 1: 初始化專案結構

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `vitest.config.js`
- Create: `tests/setup.js`

- [ ] **Step 1: 建立目錄骨架**

```bash
cd /Users/lightman/yao.care/agent.facial.signature
mkdir -p configs shared vendor/human vendor/idb tests
```

- [ ] **Step 2: 建立 package.json**

Create `package.json`:

```json
{
  "name": "facial-signature",
  "version": "0.1.0",
  "description": "Pure-frontend facial recognition check-in platform",
  "type": "module",
  "private": true,
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "serve": "python3 -m http.server 8000",
    "serve:node": "npx http-server -p 8000 -c-1"
  },
  "devDependencies": {
    "vitest": "^1.6.0",
    "fake-indexeddb": "^6.0.0",
    "jsdom": "^25.0.0",
    "happy-dom": "^15.0.0"
  }
}
```

- [ ] **Step 3: 建立 .gitignore**

Create `.gitignore`:

```
node_modules/
.DS_Store
*.log
coverage/
.vitest/
backup-*.zip
```

- [ ] **Step 4: 建立 vitest.config.js**

Create `vitest.config.js`:

```js
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    setupFiles: ['./tests/setup.js'],
    include: ['tests/**/*.test.js'],
  },
});
```

- [ ] **Step 5: 建立 tests/setup.js（fake-indexeddb wiring）**

Create `tests/setup.js`:

```js
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
```

- [ ] **Step 6: 安裝依賴並驗證**

```bash
npm install
npx vitest run --reporter=verbose
```

Expected: vitest 跑起來，0 tests 通過（沒測試檔）

- [ ] **Step 7: Git init + 第一次 commit**

```bash
git init
git add package.json .gitignore vitest.config.js tests/setup.js
git commit -m "chore: bootstrap project (package.json, vitest, fake-indexeddb)"
```

---

### Task 2: Vendor 第三方函式庫

**Files:**
- Create: `vendor/human/human.esm.js`
- Create: `vendor/human/models/` (Human library 模型檔)
- Create: `vendor/idb/idb.min.js`

- [ ] **Step 1: 下載 Human library ESM 版本**

```bash
mkdir -p vendor/human/models
cd vendor/human
curl -L -o human.esm.js https://cdn.jsdelivr.net/npm/@vladmandic/human@3.3.5/dist/human.esm.js
```

驗證檔案非空：

```bash
test -s human.esm.js && echo OK
```

- [ ] **Step 2: 下載 Human library 模型（face detection + embedding）**

```bash
cd vendor/human/models
for model in blazeface.json blazeface.bin facemesh.json facemesh.bin iris.json iris.bin emotion.json emotion.bin mb3-centernet.json mb3-centernet.bin faceres.json faceres.bin; do
  curl -L -O "https://cdn.jsdelivr.net/npm/@vladmandic/human@3.3.5/models/${model}" || true
done
ls -la
```

Expected: 多個 `.json` + `.bin` 檔案，總大小 10-30 MB
（若部分模型下載失敗，spec § 13.3 要求實作完成後在 README 註明所用模型；先抓全集，跑起來後再精簡）

- [ ] **Step 3: 下載 idb library**

```bash
cd ../../vendor/idb
curl -L -o idb.min.js https://cdn.jsdelivr.net/npm/idb@8.0.0/build/index.js
test -s idb.min.js && echo OK
```

- [ ] **Step 4: Commit vendor**

```bash
cd /Users/lightman/yao.care/agent.facial.signature
git add vendor/
git commit -m "vendor: add Human library + idb (locally hosted, no CDN runtime dependency)"
```

---

### Task 3: 確認 dev server 流程

**Files:** 不建立檔案，只驗證

- [ ] **Step 1: 啟動 dev server**

```bash
cd /Users/lightman/yao.care/agent.facial.signature
python3 -m http.server 8000 &
sleep 1
curl -sI http://localhost:8000/vendor/human/human.esm.js | head -1
kill %1
```

Expected: `HTTP/1.0 200 OK`

- [ ] **Step 2: 確認 service worker scope 限制可用（之後 Phase 8 會驗證 PWA）**

無動作，僅紀錄。`service-worker.js` 與 `manifest.json` 將放根目錄；所有 scenario HTML 也必須放根目錄。Phase 6 / 7 / 8 會遵守此規則。

---

## Phase 2：Core Data Layer

### Task 4: ULID 產生器（時間序主鍵）

**Files:**
- Create: `shared/util-ulid.js`
- Test: `tests/util-ulid.test.js`

- [ ] **Step 1: 寫失敗測試**

Create `tests/util-ulid.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { ulid } from '../shared/util-ulid.js';

describe('ulid', () => {
  it('produces a 26-char string', () => {
    expect(ulid()).toHaveLength(26);
  });

  it('produces monotonically increasing values', async () => {
    const a = ulid();
    await new Promise(r => setTimeout(r, 2));
    const b = ulid();
    expect(b > a).toBe(true);
  });

  it('produces unique values when called rapidly', () => {
    const set = new Set();
    for (let i = 0; i < 1000; i++) set.add(ulid());
    expect(set.size).toBe(1000);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

```bash
npx vitest run tests/util-ulid.test.js
```

Expected: FAIL "Cannot find module"

- [ ] **Step 3: 實作 ULID**

Create `shared/util-ulid.js`:

```js
// ULID: Crockford Base32, time-sortable, 26 chars
const CHARS = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
let lastTs = 0;
let lastRand = new Uint8Array(10);

function encodeTime(ts, len) {
  let out = '';
  for (let i = len - 1; i >= 0; i--) {
    out = CHARS[ts % 32] + out;
    ts = Math.floor(ts / 32);
  }
  return out;
}

function encodeRand(bytes) {
  let out = '';
  let bits = 0, value = 0;
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += CHARS[(value >> bits) & 0x1f];
    }
  }
  return out.slice(0, 16);
}

export function ulid() {
  const ts = Date.now();
  let rand;
  if (ts === lastTs) {
    // increment last rand to preserve monotonicity within same ms
    rand = new Uint8Array(lastRand);
    for (let i = 9; i >= 0; i--) {
      if (rand[i] < 255) { rand[i]++; break; }
      rand[i] = 0;
    }
  } else {
    rand = new Uint8Array(10);
    crypto.getRandomValues(rand);
  }
  lastTs = ts;
  lastRand = rand;
  return encodeTime(ts, 10) + encodeRand(rand);
}
```

- [ ] **Step 4: 跑測試確認通過**

```bash
npx vitest run tests/util-ulid.test.js
```

Expected: 3 passed

- [ ] **Step 5: Commit**

```bash
git add shared/util-ulid.js tests/util-ulid.test.js
git commit -m "feat(util): ULID generator for time-sortable primary keys"
```

---

### Task 5: Cosine similarity 純函式

**Files:**
- Create: `shared/util-cosine.js`
- Test: `tests/util-cosine.test.js`

- [ ] **Step 1: 寫失敗測試**

Create `tests/util-cosine.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { cosineSimilarity, cosineMax } from '../shared/util-cosine.js';

function vec(arr) { return new Float32Array(arr); }

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    expect(cosineSimilarity(vec([1, 0, 0]), vec([1, 0, 0]))).toBeCloseTo(1, 6);
  });

  it('returns 0 for orthogonal vectors', () => {
    expect(cosineSimilarity(vec([1, 0]), vec([0, 1]))).toBeCloseTo(0, 6);
  });

  it('returns -1 for opposite vectors', () => {
    expect(cosineSimilarity(vec([1, 0]), vec([-1, 0]))).toBeCloseTo(-1, 6);
  });

  it('throws on dimension mismatch', () => {
    expect(() => cosineSimilarity(vec([1, 0]), vec([1, 0, 0]))).toThrow();
  });
});

describe('cosineMax', () => {
  it('returns the max similarity over a set', () => {
    const target = vec([1, 0, 0]);
    const set = [vec([0, 1, 0]), vec([1, 0, 0]), vec([0, 0, 1])];
    expect(cosineMax(target, set)).toBeCloseTo(1, 6);
  });

  it('returns -Infinity for empty set', () => {
    expect(cosineMax(vec([1, 0]), [])).toBe(-Infinity);
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

```bash
npx vitest run tests/util-cosine.test.js
```

Expected: FAIL

- [ ] **Step 3: 實作**

Create `shared/util-cosine.js`:

```js
export function cosineSimilarity(a, b) {
  if (a.length !== b.length) {
    throw new Error(`dim mismatch: ${a.length} vs ${b.length}`);
  }
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / Math.sqrt(na * nb);
}

export function cosineMax(target, set) {
  let max = -Infinity;
  for (const v of set) {
    const s = cosineSimilarity(target, v);
    if (s > max) max = s;
  }
  return max;
}
```

- [ ] **Step 4: 跑測試通過**

```bash
npx vitest run tests/util-cosine.test.js
```

Expected: 6 passed

- [ ] **Step 5: Commit**

```bash
git add shared/util-cosine.js tests/util-cosine.test.js
git commit -m "feat(util): cosine similarity + cosineMax over set"
```

---

### Task 6: IndexedDB schema 與初始化

**Files:**
- Create: `shared/face-store-schema.js`
- Test: `tests/face-store-schema.test.js`

依據 spec § 6.1，schema 含 5 個 stores：people, events, watchlists, settings, meta-stats。

- [ ] **Step 1: 寫失敗測試**

Create `tests/face-store-schema.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest';
import { openFaceDb, DB_NAME } from '../shared/face-store-schema.js';

beforeEach(async () => {
  indexedDB.deleteDatabase(DB_NAME);
});

describe('openFaceDb', () => {
  it('creates all 5 stores', async () => {
    const db = await openFaceDb();
    const names = [...db.objectStoreNames].sort();
    expect(names).toEqual(['events', 'meta-stats', 'people', 'settings', 'watchlists']);
    db.close();
  });

  it('creates required indexes on events', async () => {
    const db = await openFaceDb();
    const tx = db.transaction('events');
    const store = tx.objectStore('events');
    const indexNames = [...store.indexNames].sort();
    expect(indexNames).toEqual(
      ['decision', 'mode', 'needsReview', 'personId', 'scenario', 'timestamp'].sort()
    );
    db.close();
  });

  it('creates displayName + modelVersion indexes on people', async () => {
    const db = await openFaceDb();
    const tx = db.transaction('people');
    const indexNames = [...tx.objectStore('people').indexNames].sort();
    expect(indexNames).toEqual(['displayName', 'modelVersion']);
    db.close();
  });
});
```

- [ ] **Step 2: 跑測試確認失敗**

```bash
npx vitest run tests/face-store-schema.test.js
```

Expected: FAIL

- [ ] **Step 3: 實作 schema 開啟**

Create `shared/face-store-schema.js`:

```js
import { openDB } from '../vendor/idb/idb.min.js';

export const DB_NAME = 'facial-signature';
export const DB_VERSION = 1;

export async function openFaceDb() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion, newVersion, tx) {
      if (oldVersion < 1) {
        const people = db.createObjectStore('people', { keyPath: 'id' });
        people.createIndex('displayName', 'displayName');
        people.createIndex('modelVersion', 'modelVersion');

        const events = db.createObjectStore('events', { keyPath: 'id' });
        events.createIndex('personId', 'personId');
        events.createIndex('scenario', 'scenario');
        events.createIndex('timestamp', 'timestamp');
        events.createIndex('needsReview', 'needsReview');
        events.createIndex('mode', 'mode');
        events.createIndex('decision', 'decision');

        db.createObjectStore('watchlists', { keyPath: 'id' });
        db.createObjectStore('settings', { keyPath: 'id' });
        db.createObjectStore('meta-stats', { keyPath: 'id' });
      }
    },
  });
}
```

注意：test setup 用 fake-indexeddb，但 idb 模組 import 路徑是 `vendor/`。vitest 預設不會解析這條路徑（瀏覽器絕對路徑），需要 vitest config alias。

- [ ] **Step 4: 調整 vitest.config.js 加 alias**

修改 `vitest.config.js`:

```js
import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      // vendor 在瀏覽器端用相對路徑，測試時 alias 到 npm 套件
      '../vendor/idb/idb.min.js': 'idb',
      '../vendor/human/human.esm.js': resolve(__dirname, 'tests/stubs/human.js'),
    },
  },
  test: {
    environment: 'happy-dom',
    setupFiles: ['./tests/setup.js'],
    include: ['tests/**/*.test.js'],
  },
});
```

裝 idb npm 版本：

```bash
npm install --save-dev idb
```

建立 Human stub（測試時不真的跑 Human）：

```bash
mkdir -p tests/stubs
```

Create `tests/stubs/human.js`:

```js
export default class Human {
  constructor() {}
  async load() {}
  async detect() { return { face: [] }; }
}
```

- [ ] **Step 5: 跑測試確認通過**

```bash
npx vitest run tests/face-store-schema.test.js
```

Expected: 3 passed

- [ ] **Step 6: Commit**

```bash
git add shared/face-store-schema.js tests/face-store-schema.test.js tests/stubs/human.js vitest.config.js package.json package-lock.json
git commit -m "feat(store): IDB schema with 5 stores + required indexes"
```

---

### Task 7: tuning 設定預設值 + CRUD

**Files:**
- Create: `shared/face-store-tuning.js`
- Test: `tests/face-store-tuning.test.js`

依 spec § 1.4，**起始值由實作階段決定** — 此 task 落實這個動作（並在 admin 校準頁可改）。所有起始值都標註「**待校準**」。

- [ ] **Step 1: 寫失敗測試**

Create `tests/face-store-tuning.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest';
import { openFaceDb, DB_NAME } from '../shared/face-store-schema.js';
import { getTuning, putTuning, DEFAULT_TUNING } from '../shared/face-store-tuning.js';

beforeEach(() => { indexedDB.deleteDatabase(DB_NAME); });

describe('tuning', () => {
  it('returns DEFAULT_TUNING when none stored', async () => {
    const db = await openFaceDb();
    const t = await getTuning(db);
    expect(t.matchThreshold).toBe(DEFAULT_TUNING.matchThreshold);
    expect(t.id).toBe('tuning');
    db.close();
  });

  it('persists overrides via putTuning', async () => {
    const db = await openFaceDb();
    await putTuning(db, { matchThreshold: 0.85 });
    const t = await getTuning(db);
    expect(t.matchThreshold).toBe(0.85);
    expect(t.newPersonThreshold).toBe(DEFAULT_TUNING.newPersonThreshold);
    db.close();
  });

  it('DEFAULT_TUNING has all required fields', () => {
    const required = [
      'samplingMinFrames', 'samplingMaxDurationMs', 'samplingNoFaceTimeoutMs',
      'samplingMinFaceSize', 'qualityFactorThresholds',
      'matchThreshold', 'newPersonThreshold', 'contaminationGuard',
      'vectorsPerPersonCap', 'snapshotsPerPersonCap', 'schemaVersion',
    ];
    for (const k of required) expect(DEFAULT_TUNING).toHaveProperty(k);
  });
});
```

- [ ] **Step 2: 跑測試失敗**

```bash
npx vitest run tests/face-store-tuning.test.js
```

Expected: FAIL

- [ ] **Step 3: 實作 tuning store**

Create `shared/face-store-tuning.js`:

```js
// 起始值為「待校準」placeholder — admin 校準頁可調整
// 這些數字不是設計決策，只是讓系統能跑起來的初始值
export const DEFAULT_TUNING = {
  id: 'tuning',
  // 採樣（待校準）
  samplingMinFrames: 5,
  samplingMaxDurationMs: 5000,
  samplingNoFaceTimeoutMs: 1500,
  samplingMinFaceSize: 100,
  qualityFactorThresholds: {
    detectionConfidenceMin: 0.7,
    faceSize: 100,
    poseAngleMax: 30,
    blurScoreMin: 50,
    landmarksCompletenessMin: 0.8,
    interFrameConsistencyMin: 0.75,
  },
  // 比對（待校準）
  matchThreshold: 0.7,
  newPersonThreshold: 0.5,
  contaminationGuard: 0.85,
  // 容量（待校準）
  vectorsPerPersonCap: 30,
  snapshotsPerPersonCap: 50,
  // schema
  schemaVersion: 1,
};

export async function getTuning(db) {
  const stored = await db.get('settings', 'tuning');
  if (!stored) return { ...DEFAULT_TUNING };
  return { ...DEFAULT_TUNING, ...stored, qualityFactorThresholds: {
    ...DEFAULT_TUNING.qualityFactorThresholds,
    ...(stored.qualityFactorThresholds || {}),
  }};
}

export async function putTuning(db, overrides) {
  const current = await getTuning(db);
  const next = { ...current, ...overrides, id: 'tuning' };
  await db.put('settings', next);
  return next;
}
```

- [ ] **Step 4: 跑測試通過**

```bash
npx vitest run tests/face-store-tuning.test.js
```

Expected: 3 passed

- [ ] **Step 5: Commit**

```bash
git add shared/face-store-tuning.js tests/face-store-tuning.test.js
git commit -m "feat(store): tuning defaults + get/put (values are calibration placeholders)"
```

---

### Task 8: people store CRUD

**Files:**
- Create: `shared/face-store-people.js`
- Test: `tests/face-store-people.test.js`

- [ ] **Step 1: 寫失敗測試**

Create `tests/face-store-people.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest';
import { openFaceDb, DB_NAME } from '../shared/face-store-schema.js';
import { createPerson, getPerson, updatePerson, listPeople, deletePerson } from '../shared/face-store-people.js';

beforeEach(() => { indexedDB.deleteDatabase(DB_NAME); });

function vec(arr) { return new Float32Array(arr); }

describe('people CRUD', () => {
  it('creates a person with auto-generated id, vectors, modelVersion', async () => {
    const db = await openFaceDb();
    const p = await createPerson(db, {
      vectors: [vec([1, 0])],
      modelVersion: 'v1',
      meta: { age: 70 },
    });
    expect(p.id).toMatch(/^[0-9A-Z]{26}$/);
    expect(p.displayName).toBeNull();
    expect(p.vectors[0]).toBeInstanceOf(Float32Array);
    expect(p.createdAt).toBeGreaterThan(0);
    db.close();
  });

  it('retrieves a person by id', async () => {
    const db = await openFaceDb();
    const p = await createPerson(db, { vectors: [vec([1, 0])], modelVersion: 'v1' });
    const fetched = await getPerson(db, p.id);
    expect(fetched.id).toBe(p.id);
    db.close();
  });

  it('updatePerson can set displayName + meta + replace vectors', async () => {
    const db = await openFaceDb();
    const p = await createPerson(db, { vectors: [vec([1, 0])], modelVersion: 'v1' });
    await updatePerson(db, p.id, { displayName: '王伯伯', meta: { phone: '0912' } });
    const fetched = await getPerson(db, p.id);
    expect(fetched.displayName).toBe('王伯伯');
    expect(fetched.meta.phone).toBe('0912');
    expect(fetched.updatedAt).toBeGreaterThanOrEqual(p.createdAt);
    db.close();
  });

  it('listPeople returns all people', async () => {
    const db = await openFaceDb();
    await createPerson(db, { vectors: [vec([1])], modelVersion: 'v1' });
    await createPerson(db, { vectors: [vec([0])], modelVersion: 'v1' });
    const all = await listPeople(db);
    expect(all).toHaveLength(2);
    db.close();
  });

  it('deletePerson removes by id', async () => {
    const db = await openFaceDb();
    const p = await createPerson(db, { vectors: [vec([1])], modelVersion: 'v1' });
    await deletePerson(db, p.id);
    expect(await getPerson(db, p.id)).toBeUndefined();
    db.close();
  });
});
```

- [ ] **Step 2: 跑測試失敗**

```bash
npx vitest run tests/face-store-people.test.js
```

Expected: FAIL

- [ ] **Step 3: 實作 people CRUD**

Create `shared/face-store-people.js`:

```js
import { ulid } from './util-ulid.js';

export async function createPerson(db, { vectors = [], modelVersion, meta = {}, displayName = null }) {
  if (!modelVersion) throw new Error('modelVersion required');
  const now = Date.now();
  const person = {
    id: ulid(),
    displayName,
    vectors,
    modelVersion,
    meta,
    createdAt: now,
    updatedAt: now,
  };
  await db.put('people', person);
  return person;
}

export async function getPerson(db, id) {
  return db.get('people', id);
}

export async function updatePerson(db, id, patch) {
  const tx = db.transaction('people', 'readwrite');
  const existing = await tx.store.get(id);
  if (!existing) {
    await tx.done;
    throw new Error(`person ${id} not found`);
  }
  const next = {
    ...existing,
    ...patch,
    id,
    meta: patch.meta ? { ...existing.meta, ...patch.meta } : existing.meta,
    updatedAt: Date.now(),
  };
  await tx.store.put(next);
  await tx.done;
  return next;
}

export async function listPeople(db) {
  return db.getAll('people');
}

export async function deletePerson(db, id) {
  await db.delete('people', id);
}
```

- [ ] **Step 4: 跑測試通過**

```bash
npx vitest run tests/face-store-people.test.js
```

Expected: 5 passed

- [ ] **Step 5: Commit**

```bash
git add shared/face-store-people.js tests/face-store-people.test.js
git commit -m "feat(store): people CRUD with ULID id + dynamic meta + modelVersion"
```

---

### Task 9: events store CRUD（含 schema 不變量校驗）

**Files:**
- Create: `shared/face-store-events.js`
- Test: `tests/face-store-events.test.js`

依 spec § 6.1，events 的 (mode, decision) 合法組合需嚴格校驗。

- [ ] **Step 1: 寫失敗測試**

Create `tests/face-store-events.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest';
import { openFaceDb, DB_NAME } from '../shared/face-store-schema.js';
import { createEvent, listEvents, listEventsByPerson, listFuzzyPending, assertEventInvariants } from '../shared/face-store-events.js';

beforeEach(() => { indexedDB.deleteDatabase(DB_NAME); });

describe('event invariants', () => {
  it('allows (checkin, match) with personId', () => {
    expect(() => assertEventInvariants({
      mode: 'checkin', decision: 'match', personId: 'p1', needsReview: false,
    })).not.toThrow();
  });

  it('rejects (checkin, fuzzy) with personId at write time (only allowed post-review)', () => {
    // at-write invariant: fuzzy must have personId=null + needsReview=true
    expect(() => assertEventInvariants({
      mode: 'checkin', decision: 'fuzzy', personId: 'p1', needsReview: true,
    }, { atWrite: true })).toThrow();
  });

  it('rejects (alert, match) — alert uses alert-hit', () => {
    expect(() => assertEventInvariants({
      mode: 'alert', decision: 'match', personId: 'p1', needsReview: false,
    })).toThrow();
  });

  it('allows (alert, fuzzy) with personId=null', () => {
    expect(() => assertEventInvariants({
      mode: 'alert', decision: 'fuzzy', personId: null, needsReview: true,
    })).not.toThrow();
  });
});

describe('events CRUD', () => {
  it('createEvent writes id + timestamp + modelVersion', async () => {
    const db = await openFaceDb();
    const e = await createEvent(db, {
      personId: 'p1',
      scenario: 'demo',
      mode: 'checkin',
      decision: 'match',
      modelVersion: 'v1',
      matchSimilarity: 0.9,
      matchScope: 'global',
      samplingQuality: 0.85,
      isNewPerson: false,
      needsReview: false,
    });
    expect(e.id).toMatch(/^[0-9A-Z]{26}$/);
    expect(e.timestamp).toBeGreaterThan(0);
    db.close();
  });

  it('listEventsByPerson filters by personId', async () => {
    const db = await openFaceDb();
    await createEvent(db, { personId: 'p1', scenario: 's', mode: 'checkin', decision: 'match', modelVersion: 'v1', matchSimilarity: 0.9, matchScope: 'global', samplingQuality: 0.8, isNewPerson: false, needsReview: false });
    await createEvent(db, { personId: 'p2', scenario: 's', mode: 'checkin', decision: 'match', modelVersion: 'v1', matchSimilarity: 0.9, matchScope: 'global', samplingQuality: 0.8, isNewPerson: false, needsReview: false });
    const filtered = await listEventsByPerson(db, 'p1');
    expect(filtered).toHaveLength(1);
    db.close();
  });

  it('listFuzzyPending returns only needsReview=true events', async () => {
    const db = await openFaceDb();
    await createEvent(db, { personId: null, scenario: 's', mode: 'checkin', decision: 'fuzzy', modelVersion: 'v1', matchSimilarity: 0.6, matchScope: 'global', samplingQuality: 0.8, isNewPerson: false, needsReview: true });
    await createEvent(db, { personId: 'p1', scenario: 's', mode: 'checkin', decision: 'match', modelVersion: 'v1', matchSimilarity: 0.9, matchScope: 'global', samplingQuality: 0.8, isNewPerson: false, needsReview: false });
    const pending = await listFuzzyPending(db);
    expect(pending).toHaveLength(1);
    expect(pending[0].decision).toBe('fuzzy');
    db.close();
  });
});
```

- [ ] **Step 2: 跑測試失敗**

```bash
npx vitest run tests/face-store-events.test.js
```

- [ ] **Step 3: 實作 events 模組**

Create `shared/face-store-events.js`:

```js
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
```

- [ ] **Step 4: 跑測試通過**

```bash
npx vitest run tests/face-store-events.test.js
```

Expected: 7 passed

- [ ] **Step 5: Commit**

```bash
git add shared/face-store-events.js tests/face-store-events.test.js
git commit -m "feat(store): events CRUD with (mode,decision) invariant guards"
```

---

### Task 10: watchlists store CRUD

**Files:**
- Create: `shared/face-store-watchlists.js`
- Test: `tests/face-store-watchlists.test.js`

- [ ] **Step 1: 寫測試**

Create `tests/face-store-watchlists.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest';
import { openFaceDb, DB_NAME } from '../shared/face-store-schema.js';
import {
  createWatchlist, addToWatchlist, removeFromWatchlist,
  listWatchlists, getWatchlist, deleteWatchlist,
  findWatchlistsContaining,
} from '../shared/face-store-watchlists.js';

beforeEach(() => { indexedDB.deleteDatabase(DB_NAME); });

describe('watchlists', () => {
  it('creates with empty personIds + timestamps', async () => {
    const db = await openFaceDb();
    const w = await createWatchlist(db, { id: 'highrisk', name: '高風險走失' });
    expect(w.personIds).toEqual([]);
    expect(w.createdAt).toBeGreaterThan(0);
    db.close();
  });

  it('add / remove dedups + updates timestamp', async () => {
    const db = await openFaceDb();
    await createWatchlist(db, { id: 'w1', name: 'W' });
    await addToWatchlist(db, 'w1', 'p1');
    await addToWatchlist(db, 'w1', 'p1'); // dedup
    let w = await getWatchlist(db, 'w1');
    expect(w.personIds).toEqual(['p1']);
    await removeFromWatchlist(db, 'w1', 'p1');
    w = await getWatchlist(db, 'w1');
    expect(w.personIds).toEqual([]);
    db.close();
  });

  it('findWatchlistsContaining (reverse query, full scan in MVP)', async () => {
    const db = await openFaceDb();
    await createWatchlist(db, { id: 'a', name: 'A' });
    await createWatchlist(db, { id: 'b', name: 'B' });
    await addToWatchlist(db, 'a', 'p1');
    await addToWatchlist(db, 'b', 'p1');
    const found = await findWatchlistsContaining(db, 'p1');
    expect(found.map(w => w.id).sort()).toEqual(['a', 'b']);
    db.close();
  });
});
```

- [ ] **Step 2: 跑失敗**

```bash
npx vitest run tests/face-store-watchlists.test.js
```

- [ ] **Step 3: 實作**

Create `shared/face-store-watchlists.js`:

```js
export async function createWatchlist(db, { id, name }) {
  if (!id) throw new Error('watchlist id required');
  const now = Date.now();
  const w = { id, name, personIds: [], createdAt: now, updatedAt: now };
  await db.put('watchlists', w);
  return w;
}

export async function getWatchlist(db, id) {
  return db.get('watchlists', id);
}

export async function listWatchlists(db) {
  return db.getAll('watchlists');
}

export async function addToWatchlist(db, watchlistId, personId) {
  const tx = db.transaction('watchlists', 'readwrite');
  const w = await tx.store.get(watchlistId);
  if (!w) { await tx.done; throw new Error(`watchlist ${watchlistId} not found`); }
  if (!w.personIds.includes(personId)) w.personIds.push(personId);
  w.updatedAt = Date.now();
  await tx.store.put(w);
  await tx.done;
  return w;
}

export async function removeFromWatchlist(db, watchlistId, personId) {
  const tx = db.transaction('watchlists', 'readwrite');
  const w = await tx.store.get(watchlistId);
  if (!w) { await tx.done; return; }
  w.personIds = w.personIds.filter(id => id !== personId);
  w.updatedAt = Date.now();
  await tx.store.put(w);
  await tx.done;
}

export async function deleteWatchlist(db, id) {
  await db.delete('watchlists', id);
}

// 反向查詢：spec § 6.2 MVP 全表掃可接受
export async function findWatchlistsContaining(db, personId) {
  const all = await db.getAll('watchlists');
  return all.filter(w => w.personIds.includes(personId));
}

// 連動：刪除 person 時呼叫
export async function removePersonFromAllWatchlists(db, personId) {
  const tx = db.transaction('watchlists', 'readwrite');
  const all = await tx.store.getAll();
  for (const w of all) {
    if (w.personIds.includes(personId)) {
      w.personIds = w.personIds.filter(id => id !== personId);
      w.updatedAt = Date.now();
      await tx.store.put(w);
    }
  }
  await tx.done;
}

// 連動：合併 A→B 時呼叫
export async function replacePersonInAllWatchlists(db, fromId, toId) {
  const tx = db.transaction('watchlists', 'readwrite');
  const all = await tx.store.getAll();
  for (const w of all) {
    if (w.personIds.includes(fromId)) {
      const set = new Set(w.personIds);
      set.delete(fromId);
      set.add(toId);
      w.personIds = [...set];
      w.updatedAt = Date.now();
      await tx.store.put(w);
    }
  }
  await tx.done;
}
```

- [ ] **Step 4: 測試通過**

```bash
npx vitest run tests/face-store-watchlists.test.js
```

- [ ] **Step 5: Commit**

```bash
git add shared/face-store-watchlists.js tests/face-store-watchlists.test.js
git commit -m "feat(store): watchlists CRUD + reverse query + linkage helpers"
```

---

### Task 11: OPFS snapshot 儲存層

**Files:**
- Create: `shared/face-store-opfs.js`
- Test: `tests/face-store-opfs.test.js`（用 happy-dom OPFS polyfill）

happy-dom 對 OPFS 支援有限；MVP 採「在測試中提供 in-memory fake」策略。

- [ ] **Step 1: 在 test setup 加 OPFS fake**

Modify `tests/setup.js`:

```js
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
```

- [ ] **Step 2: 寫測試**

Create `tests/face-store-opfs.test.js`:

```js
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
```

- [ ] **Step 3: 實作**

Create `shared/face-store-opfs.js`:

```js
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
```

- [ ] **Step 4: 測試通過**

```bash
npx vitest run tests/face-store-opfs.test.js
```

- [ ] **Step 5: Commit**

```bash
git add shared/face-store-opfs.js tests/face-store-opfs.test.js tests/setup.js
git commit -m "feat(store): OPFS snapshot store (flat /snapshots/{ulid}.jpg)"
```

---

### Task 12: face-worker.js（比對 worker）

**Files:**
- Create: `shared/face-worker.js`
- Test: `tests/face-worker-logic.test.js`（測純邏輯，不開真 worker）

Worker 內邏輯抽出獨立模組供測試。

- [ ] **Step 1: 寫純邏輯測試**

Create `tests/face-worker-logic.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { matchVectorsAgainstPeople } from '../shared/face-worker-logic.js';

const vec = (a) => new Float32Array(a);

const PEOPLE = [
  { id: 'p1', vectors: [vec([1, 0, 0])] },
  { id: 'p2', vectors: [vec([0, 1, 0])] },
  { id: 'p3', vectors: [vec([0.7, 0.7, 0])] },
];
const TUNING = { matchThreshold: 0.9, newPersonThreshold: 0.5 };

describe('matchVectorsAgainstPeople', () => {
  it('returns decision=match when topSimilarity >= matchThreshold', () => {
    const r = matchVectorsAgainstPeople([vec([1, 0, 0])], PEOPLE, TUNING);
    expect(r.decision).toBe('match');
    expect(r.candidates[0].personId).toBe('p1');
    expect(r.candidates[0].similarity).toBeCloseTo(1, 6);
    expect(r.topSimilarity).toBeCloseTo(1, 6);
  });

  it('returns decision=fuzzy when between thresholds', () => {
    const r = matchVectorsAgainstPeople([vec([0.8, 0.6, 0])], PEOPLE, TUNING);
    expect(r.decision).toBe('fuzzy');
  });

  it('returns decision=new when below newPersonThreshold and matchScope=global', () => {
    const r = matchVectorsAgainstPeople([vec([0, 0, 1])], PEOPLE, TUNING);
    expect(r.decision).toBe('new');
  });

  it('respects candidatePersonIds subset', () => {
    const r = matchVectorsAgainstPeople(
      [vec([1, 0, 0])], PEOPLE, TUNING, { candidatePersonIds: ['p2', 'p3'] }
    );
    // p1 不在 subset → 只比 p2/p3
    expect(['p2', 'p3']).toContain(r.candidates[0].personId);
    expect(r.matchScope).toBe('watchlist');
  });

  it('averages multiple query vectors via max-per-vector approach', () => {
    // 多個 query vector 對同一 person，取「每個 query vector 對該 person 的最大 cosineMax 後再取平均」
    const r = matchVectorsAgainstPeople([vec([1, 0, 0]), vec([0.9, 0.1, 0])], PEOPLE, TUNING);
    expect(r.candidates[0].personId).toBe('p1');
  });
});
```

- [ ] **Step 2: 跑失敗**

```bash
npx vitest run tests/face-worker-logic.test.js
```

- [ ] **Step 3: 實作純邏輯模組**

Create `shared/face-worker-logic.js`:

```js
import { cosineMax } from './util-cosine.js';

// 純邏輯，給 worker 與測試共用
export function matchVectorsAgainstPeople(queryVectors, people, tuning, opts = {}) {
  const { candidatePersonIds } = opts;
  const pool = candidatePersonIds
    ? people.filter(p => candidatePersonIds.includes(p.id))
    : people;

  // 對每個 person 計算「query 集對該 person.vectors 的綜合相似度」
  // 策略：每個 query 向量對該 person 的 cosineMax，取「query 集的平均」
  const scored = pool.map(p => {
    if (!p.vectors || p.vectors.length === 0) {
      return { personId: p.id, similarity: -Infinity };
    }
    let sum = 0;
    for (const q of queryVectors) sum += cosineMax(q, p.vectors);
    return { personId: p.id, similarity: sum / queryVectors.length };
  });

  scored.sort((a, b) => b.similarity - a.similarity);
  const top = scored[0];
  const topSimilarity = top?.similarity ?? null;

  let decision;
  if (scored.length === 0 || topSimilarity == null || topSimilarity === -Infinity) {
    decision = 'new';
  } else if (topSimilarity >= tuning.matchThreshold) {
    decision = 'match';
  } else if (topSimilarity < tuning.newPersonThreshold) {
    decision = 'new';
  } else {
    decision = 'fuzzy';
  }

  return {
    candidates: scored.slice(0, 5),
    decision,
    topSimilarity: topSimilarity === -Infinity ? null : topSimilarity,
    matchScope: candidatePersonIds ? 'watchlist' : 'global',
  };
}
```

- [ ] **Step 4: 跑通過**

```bash
npx vitest run tests/face-worker-logic.test.js
```

- [ ] **Step 5: 實作 worker entry**

Create `shared/face-worker.js`:

```js
// Web Worker entry point
import { matchVectorsAgainstPeople } from './face-worker-logic.js';

self.onmessage = (e) => {
  const { id, type, payload } = e.data;
  try {
    if (type === 'match') {
      const { queryVectors, people, tuning, candidatePersonIds } = payload;
      const result = matchVectorsAgainstPeople(queryVectors, people, tuning, { candidatePersonIds });
      self.postMessage({ id, ok: true, result });
    } else {
      self.postMessage({ id, ok: false, error: `unknown type ${type}` });
    }
  } catch (err) {
    self.postMessage({ id, ok: false, error: err.message });
  }
};
```

- [ ] **Step 6: Commit**

```bash
git add shared/face-worker.js shared/face-worker-logic.js tests/face-worker-logic.test.js
git commit -m "feat(worker): cosine matching with decision + matchScope + candidate subset"
```

---

### Task 13: face-store.match() 主執行緒包裝

**Files:**
- Create: `shared/face-store-match.js`
- Test: `tests/face-store-match.test.js`

主執行緒不啟動 worker 在測試時太重；測試走「同步呼叫純邏輯」，正式運行時改用 worker。

- [ ] **Step 1: 寫測試**

Create `tests/face-store-match.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest';
import { openFaceDb, DB_NAME } from '../shared/face-store-schema.js';
import { createPerson } from '../shared/face-store-people.js';
import { match } from '../shared/face-store-match.js';

beforeEach(() => { indexedDB.deleteDatabase(DB_NAME); });

const vec = (a) => new Float32Array(a);

describe('face-store.match (in-process for tests)', () => {
  it('finds existing person', async () => {
    const db = await openFaceDb();
    await createPerson(db, { vectors: [vec([1, 0, 0])], modelVersion: 'v1' });
    const r = await match(db, [vec([1, 0, 0])], 'v1');
    expect(r.decision).toBe('match');
    expect(r.matchScope).toBe('global');
    db.close();
  });

  it('filters by modelVersion (v2 query ignores v1 people)', async () => {
    const db = await openFaceDb();
    await createPerson(db, { vectors: [vec([1, 0, 0])], modelVersion: 'v1' });
    const r = await match(db, [vec([1, 0, 0])], 'v2');
    expect(r.decision).toBe('new');
    db.close();
  });

  it('candidatePersonIds restricts to watchlist subset', async () => {
    const db = await openFaceDb();
    const p1 = await createPerson(db, { vectors: [vec([1, 0, 0])], modelVersion: 'v1' });
    const p2 = await createPerson(db, { vectors: [vec([0, 1, 0])], modelVersion: 'v1' });
    const r = await match(db, [vec([1, 0, 0])], 'v1', { candidatePersonIds: [p2.id] });
    expect(r.matchScope).toBe('watchlist');
    expect(r.candidates[0].personId).toBe(p2.id);
    db.close();
  });
});
```

- [ ] **Step 2: 失敗**

```bash
npx vitest run tests/face-store-match.test.js
```

- [ ] **Step 3: 實作 match wrapper**

Create `shared/face-store-match.js`:

```js
import { getTuning } from './face-store-tuning.js';
import { listPeople } from './face-store-people.js';
import { matchVectorsAgainstPeople } from './face-worker-logic.js';

let workerPromise = null;

function getWorker() {
  if (typeof Worker === 'undefined') return null; // test 環境
  if (!workerPromise) {
    workerPromise = Promise.resolve(
      new Worker(new URL('./face-worker.js', import.meta.url), { type: 'module' })
    );
  }
  return workerPromise;
}

let nextReqId = 1;
const pending = new Map();

function ensureWorkerWired(worker) {
  if (worker._wired) return;
  worker._wired = true;
  worker.onmessage = (e) => {
    const { id, ok, result, error } = e.data;
    const cb = pending.get(id);
    if (!cb) return;
    pending.delete(id);
    if (ok) cb.resolve(result); else cb.reject(new Error(error));
  };
}

export async function match(db, queryVectors, modelVersion, opts = {}) {
  const tuning = await getTuning(db);
  const all = await listPeople(db);
  const samePeople = all
    .filter(p => p.modelVersion === modelVersion)
    .map(p => ({ id: p.id, vectors: p.vectors }));

  const workerP = getWorker();
  if (!workerP) {
    // 測試環境同步跑
    return matchVectorsAgainstPeople(queryVectors, samePeople, tuning, opts);
  }

  const worker = await workerP;
  ensureWorkerWired(worker);
  const id = nextReqId++;

  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    worker.postMessage(
      {
        id,
        type: 'match',
        payload: {
          queryVectors,
          people: samePeople,
          tuning,
          candidatePersonIds: opts.candidatePersonIds,
        },
      },
      // Transfer Float32Array buffers if possible
      queryVectors.map(v => v.buffer).concat(
        samePeople.flatMap(p => p.vectors.map(v => v.buffer))
      )
    );
  });
}
```

注意 transferable buffers — 主執行緒 post 後 buffer 失效。實際使用時 caller 不應在 post 後再讀。文件記入 comment。

- [ ] **Step 4: 測試通過**

```bash
npx vitest run tests/face-store-match.test.js
```

- [ ] **Step 5: Commit**

```bash
git add shared/face-store-match.js tests/face-store-match.test.js
git commit -m "feat(store): match() wrapper — worker in production, in-process in tests"
```

---

### Task 14: 漸進累積 + 污染防護（含 empty-target fallback）

**Files:**
- Create: `shared/face-store-accumulate.js`
- Test: `tests/face-store-accumulate.test.js`

依 spec § 8.3 規則：簽到 match / 合併 A→B 觸發；含 empty-target fallback。

- [ ] **Step 1: 寫測試**

Create `tests/face-store-accumulate.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest';
import { openFaceDb, DB_NAME } from '../shared/face-store-schema.js';
import { createPerson, getPerson } from '../shared/face-store-people.js';
import { accumulateVectors } from '../shared/face-store-accumulate.js';

beforeEach(() => { indexedDB.deleteDatabase(DB_NAME); });
const vec = (a) => new Float32Array(a);

describe('accumulateVectors', () => {
  it('empty target → accepts all incoming vectors regardless of similarity', async () => {
    const db = await openFaceDb();
    const p = await createPerson(db, { vectors: [], modelVersion: 'v1' });
    await accumulateVectors(db, p.id, [vec([1, 0]), vec([0, 1])], {
      contaminationGuard: 0.99, vectorsPerPersonCap: 30,
    });
    const updated = await getPerson(db, p.id);
    expect(updated.vectors).toHaveLength(2);
    db.close();
  });

  it('filters vectors below contaminationGuard', async () => {
    const db = await openFaceDb();
    const p = await createPerson(db, { vectors: [vec([1, 0])], modelVersion: 'v1' });
    await accumulateVectors(db, p.id, [vec([1, 0]), vec([0, 1])], {
      contaminationGuard: 0.9, vectorsPerPersonCap: 30,
    });
    const updated = await getPerson(db, p.id);
    expect(updated.vectors).toHaveLength(2); // 原本 1 + 通過的 1（[1,0]）
    db.close();
  });

  it('FIFO汰換最舊向量達到 cap', async () => {
    const db = await openFaceDb();
    const initial = [vec([1, 0, 0]), vec([1, 0, 0]), vec([1, 0, 0])];
    const p = await createPerson(db, { vectors: initial, modelVersion: 'v1' });
    await accumulateVectors(db, p.id, [vec([1, 0, 0])], {
      contaminationGuard: 0.5, vectorsPerPersonCap: 3,
    });
    const updated = await getPerson(db, p.id);
    expect(updated.vectors).toHaveLength(3);
    db.close();
  });
});
```

- [ ] **Step 2: 失敗**

```bash
npx vitest run tests/face-store-accumulate.test.js
```

- [ ] **Step 3: 實作**

Create `shared/face-store-accumulate.js`:

```js
import { cosineMax } from './util-cosine.js';

// 依 spec § 8.3 — 包含 empty-target fallback
export async function accumulateVectors(db, personId, incomingVectors, params) {
  const { contaminationGuard, vectorsPerPersonCap } = params;
  const tx = db.transaction('people', 'readwrite');
  const person = await tx.store.get(personId);
  if (!person) { await tx.done; throw new Error(`person ${personId} not found`); }

  let current = person.vectors.slice();
  const accepted = [];

  for (const v of incomingVectors) {
    if (current.length === 0) {
      // empty-target fallback
      accepted.push(v);
      current.push(v);
      continue;
    }
    const sMax = cosineMax(v, current);
    if (sMax >= contaminationGuard) {
      accepted.push(v);
      current.push(v);
    }
  }

  // FIFO 汰換到 cap
  if (current.length > vectorsPerPersonCap) {
    current = current.slice(current.length - vectorsPerPersonCap);
  }

  person.vectors = current;
  person.updatedAt = Date.now();
  await tx.store.put(person);
  await tx.done;
  return { accepted: accepted.length, total: current.length };
}
```

- [ ] **Step 4: 通過**

```bash
npx vitest run tests/face-store-accumulate.test.js
```

- [ ] **Step 5: Commit**

```bash
git add shared/face-store-accumulate.js tests/face-store-accumulate.test.js
git commit -m "feat(store): vector accumulation with contamination guard + empty-target fallback"
```

---

### Task 15: Merge / Split / Delete person 運維操作

**Files:**
- Create: `shared/face-store-ops.js`
- Test: `tests/face-store-ops.test.js`

包含 watchlist 連動、OPFS snapshot 清理、§ 10 統一 rollback 策略。

- [ ] **Step 1: 寫測試**

Create `tests/face-store-ops.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest';
import { openFaceDb, DB_NAME } from '../shared/face-store-schema.js';
import { createPerson, getPerson, listPeople } from '../shared/face-store-people.js';
import { createEvent, listEventsByPerson } from '../shared/face-store-events.js';
import { createWatchlist, addToWatchlist, getWatchlist } from '../shared/face-store-watchlists.js';
import { writeSnapshot, listAllSnapshotIds } from '../shared/face-store-opfs.js';
import { mergePerson, splitPerson, deletePersonCascade } from '../shared/face-store-ops.js';

beforeEach(() => {
  indexedDB.deleteDatabase(DB_NAME);
  navigator.storage._files.clear();
});

const vec = (a) => new Float32Array(a);

describe('mergePerson A→B', () => {
  it('moves events, applies vector filter, deletes A, replaces in watchlists', async () => {
    const db = await openFaceDb();
    const a = await createPerson(db, { vectors: [vec([1, 0])], modelVersion: 'v1' });
    const b = await createPerson(db, { vectors: [vec([1, 0])], modelVersion: 'v1' });
    await createEvent(db, { personId: a.id, scenario: 's', mode: 'checkin', decision: 'match', modelVersion: 'v1', matchSimilarity: 0.9, matchScope: 'global', samplingQuality: 0.8, isNewPerson: false, needsReview: false });
    await createWatchlist(db, { id: 'w', name: 'W' });
    await addToWatchlist(db, 'w', a.id);

    await mergePerson(db, a.id, b.id, { contaminationGuard: 0.5, vectorsPerPersonCap: 30 });

    expect(await getPerson(db, a.id)).toBeUndefined();
    const bEvents = await listEventsByPerson(db, b.id);
    expect(bEvents).toHaveLength(1);
    const wl = await getWatchlist(db, 'w');
    expect(wl.personIds).toEqual([b.id]);
    db.close();
  });

  it('v1→v2 merge discards old vectors when modelVersions differ', async () => {
    const db = await openFaceDb();
    const a = await createPerson(db, { vectors: [vec([1, 0])], modelVersion: 'v1' });
    const b = await createPerson(db, { vectors: [vec([1, 0, 0])], modelVersion: 'v2' });
    await mergePerson(db, a.id, b.id, { contaminationGuard: 0.5, vectorsPerPersonCap: 30 });
    const updated = await getPerson(db, b.id);
    expect(updated.vectors).toHaveLength(1); // 維持 v2 原本，丟棄 v1
    db.close();
  });
});

describe('splitPerson A→A+B', () => {
  it('moves selected events to new B, A vectors unchanged, B vectors empty', async () => {
    const db = await openFaceDb();
    const a = await createPerson(db, { vectors: [vec([1, 0])], modelVersion: 'v1' });
    const e1 = await createEvent(db, { personId: a.id, scenario: 's', mode: 'checkin', decision: 'match', modelVersion: 'v1', matchSimilarity: 0.9, matchScope: 'global', samplingQuality: 0.8, isNewPerson: false, needsReview: false });
    const e2 = await createEvent(db, { personId: a.id, scenario: 's', mode: 'checkin', decision: 'match', modelVersion: 'v1', matchSimilarity: 0.9, matchScope: 'global', samplingQuality: 0.8, isNewPerson: false, needsReview: false });

    const result = await splitPerson(db, a.id, { eventIdsToSplit: [e2.id] });

    const aAfter = await getPerson(db, a.id);
    const bAfter = await getPerson(db, result.newPersonId);
    expect(aAfter.vectors).toHaveLength(1);
    expect(bAfter.vectors).toHaveLength(0);
    expect(await listEventsByPerson(db, a.id)).toHaveLength(1);
    expect(await listEventsByPerson(db, result.newPersonId)).toHaveLength(1);
    db.close();
  });
});

describe('deletePersonCascade', () => {
  it('removes person, all events, all snapshots, watchlist linkage', async () => {
    const db = await openFaceDb();
    const p = await createPerson(db, { vectors: [vec([1])], modelVersion: 'v1' });
    const snap = await writeSnapshot(new Blob(['img']));
    await createEvent(db, { personId: p.id, scenario: 's', mode: 'checkin', decision: 'match', modelVersion: 'v1', matchSimilarity: 0.9, matchScope: 'global', samplingQuality: 0.8, isNewPerson: false, needsReview: false, snapshotId: snap });
    await createWatchlist(db, { id: 'w', name: 'W' });
    await addToWatchlist(db, 'w', p.id);

    await deletePersonCascade(db, p.id);

    expect(await getPerson(db, p.id)).toBeUndefined();
    expect(await listEventsByPerson(db, p.id)).toHaveLength(0);
    expect(await listAllSnapshotIds()).toHaveLength(0);
    const wl = await getWatchlist(db, 'w');
    expect(wl.personIds).toEqual([]);
    db.close();
  });
});
```

- [ ] **Step 2: 失敗**

```bash
npx vitest run tests/face-store-ops.test.js
```

- [ ] **Step 3: 實作運維 ops**

Create `shared/face-store-ops.js`:

```js
import { ulid } from './util-ulid.js';
import {
  removePersonFromAllWatchlists, replacePersonInAllWatchlists,
} from './face-store-watchlists.js';
import { deleteSnapshot } from './face-store-opfs.js';
import { accumulateVectors } from './face-store-accumulate.js';

export async function mergePerson(db, fromId, toId, accumParams) {
  if (fromId === toId) throw new Error('cannot merge person to itself');
  const a = await db.get('people', fromId);
  const b = await db.get('people', toId);
  if (!a || !b) throw new Error('person not found');

  // 1. vectors 處理
  if (a.modelVersion === b.modelVersion && a.vectors.length > 0) {
    // 同模型 → 套 § 8.3 過濾
    await accumulateVectors(db, toId, a.vectors, accumParams);
  }
  // 跨模型版本 → 直接丟棄 a.vectors（§ 6.5）

  // 2. 改 events.personId（IDB transaction 內）
  const tx = db.transaction(['events', 'people'], 'readwrite');
  const evIdx = tx.objectStore('events').index('personId');
  let cursor = await evIdx.openCursor(IDBKeyRange.only(fromId));
  while (cursor) {
    const ev = cursor.value;
    ev.personId = toId;
    await cursor.update(ev);
    cursor = await cursor.continue();
  }
  // 3. 刪 person a
  await tx.objectStore('people').delete(fromId);
  await tx.done;

  // 4. watchlist 連動
  await replacePersonInAllWatchlists(db, fromId, toId);
}

export async function splitPerson(db, fromId, { eventIdsToSplit }) {
  if (!Array.isArray(eventIdsToSplit) || eventIdsToSplit.length === 0) {
    throw new Error('eventIdsToSplit must be non-empty array');
  }
  const source = await db.get('people', fromId);
  if (!source) throw new Error('source person not found');

  // 建新 person B（空 vectors，displayName=null）
  const newId = ulid();
  const now = Date.now();
  const newPerson = {
    id: newId,
    displayName: null,
    vectors: [],
    modelVersion: source.modelVersion,
    meta: {},
    createdAt: now,
    updatedAt: now,
  };

  const tx = db.transaction(['people', 'events'], 'readwrite');
  await tx.objectStore('people').put(newPerson);

  // 把指定 events 改 personId = newId（needsReview 維持 false：拆分本身已是審處動作）
  for (const evId of eventIdsToSplit) {
    const ev = await tx.objectStore('events').get(evId);
    if (!ev) continue;
    if (ev.personId !== fromId) continue; // 避免拆走別人的 events
    ev.personId = newId;
    await tx.objectStore('events').put(ev);
  }
  await tx.done;

  return { newPersonId: newId };
}

export async function deletePersonCascade(db, personId) {
  // 1. 蒐集該人的 snapshotIds
  const events = await db.getAllFromIndex('events', 'personId', personId);
  const snapshotIds = events.map(e => e.snapshotId).filter(Boolean);

  // 2. IDB transaction: 刪 events + 刪 person
  const tx = db.transaction(['events', 'people'], 'readwrite');
  for (const ev of events) {
    await tx.objectStore('events').delete(ev.id);
  }
  await tx.objectStore('people').delete(personId);
  await tx.done;

  // 3. watchlist 連動
  await removePersonFromAllWatchlists(db, personId);

  // 4. OPFS snapshots（補償盡力而為 — § 10 統一策略）
  for (const sid of snapshotIds) {
    await deleteSnapshot(sid);
  }
}
```

- [ ] **Step 4: 測試通過**

```bash
npx vitest run tests/face-store-ops.test.js
```

- [ ] **Step 5: Commit**

```bash
git add shared/face-store-ops.js tests/face-store-ops.test.js
git commit -m "feat(store): merge/split/delete person with watchlist linkage + OPFS cleanup"
```

---

### Task 16: 孤兒檔回收（orphan GC）

**Files:**
- Create: `shared/face-store-gc.js`
- Test: `tests/face-store-gc.test.js`

- [ ] **Step 1: 測試**

Create `tests/face-store-gc.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest';
import { openFaceDb, DB_NAME } from '../shared/face-store-schema.js';
import { createPerson } from '../shared/face-store-people.js';
import { createEvent } from '../shared/face-store-events.js';
import { writeSnapshot, listAllSnapshotIds, readSnapshot } from '../shared/face-store-opfs.js';
import { scanOrphanSnapshots, gcOrphanSnapshots } from '../shared/face-store-gc.js';

beforeEach(() => {
  indexedDB.deleteDatabase(DB_NAME);
  navigator.storage._files.clear();
});

describe('orphan GC', () => {
  it('finds snapshots not referenced by any event', async () => {
    const db = await openFaceDb();
    const p = await createPerson(db, { vectors: [], modelVersion: 'v1' });
    const used = await writeSnapshot(new Blob(['used']));
    const orphan = await writeSnapshot(new Blob(['orphan']));
    await createEvent(db, { personId: p.id, scenario: 's', mode: 'checkin', decision: 'match', modelVersion: 'v1', matchSimilarity: 0.9, matchScope: 'global', samplingQuality: 0.8, isNewPerson: false, needsReview: false, snapshotId: used });
    const orphans = await scanOrphanSnapshots(db);
    expect(orphans).toEqual([orphan]);
    db.close();
  });

  it('gcOrphanSnapshots deletes orphans', async () => {
    const db = await openFaceDb();
    await writeSnapshot(new Blob(['orphan']));
    const removed = await gcOrphanSnapshots(db);
    expect(removed).toBe(1);
    expect(await listAllSnapshotIds()).toHaveLength(0);
    db.close();
  });
});
```

- [ ] **Step 2: 失敗**

```bash
npx vitest run tests/face-store-gc.test.js
```

- [ ] **Step 3: 實作**

Create `shared/face-store-gc.js`:

```js
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
```

- [ ] **Step 4: 通過 + commit**

```bash
npx vitest run tests/face-store-gc.test.js
git add shared/face-store-gc.js tests/face-store-gc.test.js
git commit -m "feat(store): orphan snapshot GC"
```

---

### Task 17: Export / Import 備份格式

**Files:**
- Create: `shared/face-store-export.js`
- Create: `shared/face-store-import.js`
- Test: `tests/face-store-export-import.test.js`

⚠️ MVP 採全覆蓋匯入（spec § 9.5）。zip 打包用瀏覽器原生 `CompressionStream` 處理 gzip，但 zip 結構需要組裝。實際操作：vendor 一個輕量 zip 函式庫（fflate 約 ~30KB ESM）。

- [ ] **Step 1: vendor fflate**

```bash
cd /Users/lightman/yao.care/agent.facial.signature/vendor
mkdir -p fflate
curl -L -o fflate/fflate.module.js https://cdn.jsdelivr.net/npm/fflate@0.8.2/esm/index.mjs
test -s fflate/fflate.module.js && echo OK
cd ..
npm install --save-dev fflate
```

更新 `vitest.config.js` alias：

```js
import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '../vendor/idb/idb.min.js': 'idb',
      '../vendor/fflate/fflate.module.js': 'fflate',
      '../vendor/human/human.esm.js': resolve(__dirname, 'tests/stubs/human.js'),
    },
  },
  test: {
    environment: 'happy-dom',
    setupFiles: ['./tests/setup.js'],
    include: ['tests/**/*.test.js'],
  },
});
```

- [ ] **Step 2: 寫 export + import 來回測試**

Create `tests/face-store-export-import.test.js`:

```js
import { describe, it, expect, beforeEach } from 'vitest';
import { openFaceDb, DB_NAME } from '../shared/face-store-schema.js';
import { createPerson, listPeople, getPerson } from '../shared/face-store-people.js';
import { createEvent, listEvents } from '../shared/face-store-events.js';
import { createWatchlist } from '../shared/face-store-watchlists.js';
import { writeSnapshot, listAllSnapshotIds } from '../shared/face-store-opfs.js';
import { exportAll } from '../shared/face-store-export.js';
import { importAll } from '../shared/face-store-import.js';

beforeEach(() => {
  indexedDB.deleteDatabase(DB_NAME);
  navigator.storage._files.clear();
});

const vec = (a) => new Float32Array(a);

describe('export → import round-trip', () => {
  it('preserves people, events, watchlists, snapshots, vectors', async () => {
    const db = await openFaceDb();
    const p = await createPerson(db, {
      vectors: [vec([1, 0, 0]), vec([0, 1, 0])],
      modelVersion: 'v1',
      displayName: '王伯伯',
      meta: { phone: '0912' },
    });
    const snap = await writeSnapshot(new Blob(['img-bytes']));
    await createEvent(db, {
      personId: p.id, scenario: 's', mode: 'checkin', decision: 'match',
      modelVersion: 'v1', matchSimilarity: 0.9, matchScope: 'global',
      samplingQuality: 0.8, isNewPerson: false, needsReview: false,
      snapshotId: snap,
    });
    await createWatchlist(db, { id: 'w', name: 'W' });

    const zipBlob = await exportAll(db);
    expect(zipBlob.size).toBeGreaterThan(0);

    // 清空後 import
    db.close();
    indexedDB.deleteDatabase(DB_NAME);
    navigator.storage._files.clear();
    const db2 = await openFaceDb();
    await importAll(db2, zipBlob);

    const people = await listPeople(db2);
    expect(people).toHaveLength(1);
    expect(people[0].displayName).toBe('王伯伯');
    expect(people[0].vectors[0]).toBeInstanceOf(Float32Array);
    expect(people[0].vectors[0][0]).toBeCloseTo(1, 6);
    expect(people[0].vectors).toHaveLength(2);

    const events = await listEvents(db2);
    expect(events).toHaveLength(1);
    expect(events[0].snapshotId).toBe(snap);

    const snaps = await listAllSnapshotIds();
    expect(snaps).toEqual([snap]);

    db2.close();
  });
});
```

- [ ] **Step 3: 跑失敗**

```bash
npx vitest run tests/face-store-export-import.test.js
```

- [ ] **Step 4: 實作 export**

Create `shared/face-store-export.js`:

```js
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
```

- [ ] **Step 5: 實作 import（全覆蓋）**

Create `shared/face-store-import.js`:

```js
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
```

- [ ] **Step 6: 跑通過**

```bash
npx vitest run tests/face-store-export-import.test.js
```

- [ ] **Step 7: Commit**

```bash
git add shared/face-store-export.js shared/face-store-import.js tests/face-store-export-import.test.js vendor/fflate vitest.config.js package.json package-lock.json
git commit -m "feat(store): export/import zip backup with vectors.bin + optional AES-GCM encryption"
```

---

### Task 18: face-store.js 統一入口（barrel export）

**Files:**
- Create: `shared/face-store.js`

- [ ] **Step 1: 建立 barrel**

Create `shared/face-store.js`:

```js
// face-store.js — 對外 API barrel
export { openFaceDb, DB_NAME, DB_VERSION } from './face-store-schema.js';
export { getTuning, putTuning, DEFAULT_TUNING } from './face-store-tuning.js';
export {
  createPerson, getPerson, updatePerson, listPeople, deletePerson,
} from './face-store-people.js';
export {
  createEvent, getEvent, listEvents,
  listEventsByPerson, listEventsByScenario, listFuzzyPending, updateEvent,
} from './face-store-events.js';
export {
  createWatchlist, getWatchlist, listWatchlists,
  addToWatchlist, removeFromWatchlist, deleteWatchlist,
  findWatchlistsContaining,
} from './face-store-watchlists.js';
export { writeSnapshot, readSnapshot, deleteSnapshot, listAllSnapshotIds } from './face-store-opfs.js';
export { accumulateVectors } from './face-store-accumulate.js';
export { match } from './face-store-match.js';
export { mergePerson, splitPerson, deletePersonCascade } from './face-store-ops.js';
export { scanOrphanSnapshots, gcOrphanSnapshots } from './face-store-gc.js';
export { exportAll } from './face-store-export.js';
export { importAll } from './face-store-import.js';
```

- [ ] **Step 2: Commit**

```bash
git add shared/face-store.js
git commit -m "feat(store): unified barrel export"
```

**Phase 2 里程碑**：所有資料層完成，可被 console 互動測試。執行 `npx vitest run` 應全綠。

---

## Phase 3：face-engine 相機 + 偵測 + 採樣

### Task 19: 品質分數計算（純函式）

**Files:**
- Create: `shared/face-quality.js`
- Test: `tests/face-quality.test.js`

依 spec § 8.0 六因子。

- [ ] **Step 1: 寫測試**

Create `tests/face-quality.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { computeFrameQuality, isFrameAcceptable } from '../shared/face-quality.js';

const baseThresholds = {
  detectionConfidenceMin: 0.7,
  faceSize: 100,
  poseAngleMax: 30,
  blurScoreMin: 50,
  landmarksCompletenessMin: 0.8,
  interFrameConsistencyMin: 0.75,
};

describe('computeFrameQuality', () => {
  it('produces per-factor scores from Human-like input', () => {
    const q = computeFrameQuality({
      detectionConfidence: 0.92,
      faceSize: 150,
      poseAngle: 10,
      blurScore: 120,
      landmarksCompleteness: 0.95,
      interFrameConsistency: 0.88,
    });
    expect(q.detectionConfidence).toBe(0.92);
    expect(q.passAll(baseThresholds)).toBe(true);
  });

  it('rejects when any factor below threshold', () => {
    const q = computeFrameQuality({
      detectionConfidence: 0.5, // below 0.7
      faceSize: 150, poseAngle: 10, blurScore: 120,
      landmarksCompleteness: 0.95, interFrameConsistency: 0.88,
    });
    expect(q.passAll(baseThresholds)).toBe(false);
  });

  it('interFrameConsistency: first frame auto-pass', () => {
    const q = computeFrameQuality({
      detectionConfidence: 0.9, faceSize: 150, poseAngle: 10,
      blurScore: 120, landmarksCompleteness: 0.9,
      interFrameConsistency: null, // 第一個 frame
    });
    expect(q.passAll(baseThresholds)).toBe(true);
  });
});

describe('isFrameAcceptable (size pre-gate vs quality)', () => {
  it('pre-gate: faceSize < samplingMinFaceSize → reject immediately', () => {
    expect(isFrameAcceptable({ faceSize: 50 }, { samplingMinFaceSize: 100 })).toBe(false);
  });
  it('pre-gate: faceSize >= → continue', () => {
    expect(isFrameAcceptable({ faceSize: 150 }, { samplingMinFaceSize: 100 })).toBe(true);
  });
});
```

- [ ] **Step 2: 失敗**

```bash
npx vitest run tests/face-quality.test.js
```

- [ ] **Step 3: 實作**

Create `shared/face-quality.js`:

```js
export function computeFrameQuality(metrics) {
  return {
    ...metrics,
    passAll(thresholds) {
      const fcCheck = metrics.interFrameConsistency == null
        ? true // 第一個 frame 自動視為通過
        : metrics.interFrameConsistency >= thresholds.interFrameConsistencyMin;
      return (
        metrics.detectionConfidence >= thresholds.detectionConfidenceMin &&
        metrics.faceSize >= thresholds.faceSize &&
        Math.abs(metrics.poseAngle) <= thresholds.poseAngleMax &&
        metrics.blurScore >= thresholds.blurScoreMin &&
        metrics.landmarksCompleteness >= thresholds.landmarksCompletenessMin &&
        fcCheck
      );
    },
  };
}

// pre-gate：小於 samplingMinFaceSize 連 session 都不啟動
export function isFrameAcceptable(metrics, tuning) {
  return metrics.faceSize >= tuning.samplingMinFaceSize;
}

// 把 Human face 物件轉為品質 metrics（spec § 8.0 來源欄位）
export function metricsFromHumanFace(face, canvas) {
  const [x, y, w, h] = face.box || [0, 0, 0, 0];
  const faceSize = Math.min(w, h);
  const poseAngle = Math.max(
    Math.abs(face.rotation?.angle?.yaw ?? 0),
    Math.abs(face.rotation?.angle?.pitch ?? 0),
    Math.abs(face.rotation?.angle?.roll ?? 0),
  ) * (180 / Math.PI);
  // blur: 簡化用 face.real（Human 偵測活體分數的近似）
  const blurScore = (face.real ?? 0.5) * 200;
  const landmarksCompleteness = face.mesh?.length ? Math.min(1, face.mesh.length / 478) : 0.5;
  return {
    detectionConfidence: face.score ?? 0,
    faceSize,
    poseAngle,
    blurScore,
    landmarksCompleteness,
    // interFrameConsistency 由 session 累積計算（見 face-engine sampling）
  };
}

export function sessionSummaryQuality(qualities) {
  if (qualities.length === 0) return 0;
  let sum = 0;
  for (const q of qualities) {
    sum += q.detectionConfidence;
  }
  return sum / qualities.length;
}
```

- [ ] **Step 4: 通過 + commit**

```bash
npx vitest run tests/face-quality.test.js
git add shared/face-quality.js tests/face-quality.test.js
git commit -m "feat(engine): quality factors per spec § 8.0 + Human face → metrics adapter"
```

---

### Task 20: face-engine 入口（相機 + Human 載入 + emitter）

**Files:**
- Create: `shared/face-engine.js`

face-engine 不易單元測試（需要相機 + Human）；以「手動真機」為主要驗證。此檔僅做骨架 + emitter；採樣邏輯下一個 task。

- [ ] **Step 1: 建立骨架**

Create `shared/face-engine.js`:

```js
import Human from '../vendor/human/human.esm.js';
import { metricsFromHumanFace, computeFrameQuality, isFrameAcceptable } from './face-quality.js';
import { cosineSimilarity } from './util-cosine.js';

const HUMAN_CONFIG = {
  modelBasePath: '/vendor/human/models/',
  cacheModels: true,
  face: {
    enabled: true,
    detector: { rotation: true, maxDetected: 8 },
    mesh: { enabled: true },
    iris: { enabled: false },
    description: { enabled: true }, // FaceRes embedding
    emotion: { enabled: false },
  },
  body: { enabled: false },
  hand: { enabled: false },
  gesture: { enabled: false },
  filter: { enabled: false },
};

export const MODEL_VERSION = 'human-3.3.5-faceres'; // 模型升級時改這裡

export async function createFaceEngine({ videoElement, tuning, concurrency = 'multi-face', singleRoiBox = null }) {
  const human = new Human(HUMAN_CONFIG);
  await human.load();
  await human.warmup();

  const listeners = { faceResult: [], error: [], frameTick: [] };
  const emit = (ev, payload) => { for (const fn of listeners[ev] || []) try { fn(payload); } catch (e) { console.error(e); } };

  const sessions = new Map(); // faceId → session state
  let running = false;
  let stopFn = null;

  function on(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); }
  function off(ev, fn) { listeners[ev] = (listeners[ev] || []).filter(f => f !== fn); }

  async function loop() {
    while (running) {
      const detection = await human.detect(videoElement);
      const faces = detection.face || [];
      const seenIds = new Set();

      for (const face of faces) {
        const faceId = face.id ?? `${Math.round(face.box[0])}-${Math.round(face.box[1])}`;
        seenIds.add(faceId);

        // single-roi 過濾
        if (concurrency === 'single-roi') {
          if (!isInRoi(face, singleRoiBox, videoElement)) continue;
        }

        const metrics = metricsFromHumanFace(face, videoElement);
        if (!isFrameAcceptable(metrics, tuning)) continue;

        let sess = sessions.get(faceId);
        if (!sess) {
          sess = createSession(faceId, tuning);
          sessions.set(faceId, sess);
        }

        await sess.feedFrame(face, metrics, videoElement, human, emit);
      }

      // 清掉長時間沒看到的 sessions
      for (const [id, sess] of sessions.entries()) {
        if (!seenIds.has(id)) {
          const elapsed = Date.now() - sess.lastSeenTs;
          if (elapsed > tuning.samplingNoFaceTimeoutMs) {
            sessions.delete(id);
          }
        } else {
          sess.lastSeenTs = Date.now();
        }
      }

      emit('frameTick', { faceCount: faces.length, sessionCount: sessions.size });
      await new Promise(r => requestAnimationFrame(r));
    }
  }

  function start() {
    if (running) return;
    running = true;
    loop().catch(err => emit('error', err));
  }

  function stop() {
    running = false;
    sessions.clear();
  }

  return { on, off, start, stop, modelVersion: MODEL_VERSION };
}

function isInRoi(face, roiBox, video) {
  if (!roiBox) return true;
  const [fx, fy, fw, fh] = face.box;
  const fcx = fx + fw / 2;
  const fcy = fy + fh / 2;
  return fcx >= roiBox.x && fcx <= roiBox.x + roiBox.w &&
         fcy >= roiBox.y && fcy <= roiBox.y + roiBox.h;
}

function createSession(faceId, tuning) {
  const start = Date.now();
  const vectors = [];
  const qualities = [];
  let lastSeenTs = Date.now();
  let done = false;

  async function feedFrame(face, metrics, video, human, emit) {
    if (done) return;

    // interFrameConsistency：與上一個 vector 比
    const desc = face.embedding || face.descriptor;
    if (!desc) return;
    const vector = new Float32Array(desc);

    let consistency = null;
    if (vectors.length > 0) {
      consistency = cosineSimilarity(vector, vectors[vectors.length - 1]);
    }
    const q = computeFrameQuality({ ...metrics, interFrameConsistency: consistency });

    if (q.passAll(tuning.qualityFactorThresholds)) {
      vectors.push(vector);
      qualities.push(q);
    }

    const elapsed = Date.now() - start;
    const enough = vectors.length >= tuning.samplingMinFrames;

    if (enough) {
      done = true;
      const snapshot = await captureSnapshot(face, video);
      emit('faceResult', {
        faceId,
        vectors,
        snapshot,
        qualityScore: q,
        samplingQuality: averageDetectionConfidence(qualities),
        modelVersion: 'human-3.3.5-faceres',
      });
    } else if (elapsed > tuning.samplingMaxDurationMs) {
      done = true;
      emit('faceResult', {
        faceId, vectors, snapshot: null, qualityScore: q,
        samplingQuality: 0, modelVersion: 'human-3.3.5-faceres',
        timedOut: true,
      });
    }
  }

  return {
    faceId,
    get lastSeenTs() { return lastSeenTs; },
    set lastSeenTs(v) { lastSeenTs = v; },
    feedFrame,
  };
}

function averageDetectionConfidence(qs) {
  if (qs.length === 0) return 0;
  return qs.reduce((s, q) => s + q.detectionConfidence, 0) / qs.length;
}

async function captureSnapshot(face, video) {
  const [x, y, w, h] = face.box;
  const margin = 0.2;
  const sx = Math.max(0, x - w * margin);
  const sy = Math.max(0, y - h * margin);
  const sw = w * (1 + 2 * margin);
  const sh = h * (1 + 2 * margin);
  const canvas = document.createElement('canvas');
  canvas.width = 200; canvas.height = 200;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, 200, 200);
  return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85));
}
```

- [ ] **Step 2: Commit（無單測，留待真機驗證 Phase 6）**

```bash
git add shared/face-engine.js
git commit -m "feat(engine): camera + Human library + adaptive multi-face sampling (manual test only)"
```

---

**Phase 3 里程碑**：face-engine 完成。真機測試到 Phase 6 才做（需要 HTML + 相機）。

---

## Phase 4：face-ui 元件

### Task 21: face-ui 包：camera 預覽 + 偵測框 + 進度條 + TTS + 視覺反饋

**Files:**
- Create: `shared/face-ui.js`
- Create: `shared/face-ui.css`

UI 較難單測；先做骨架，Phase 6 用真機驗證。

- [ ] **Step 1: 建 face-ui.js**

Create `shared/face-ui.js`:

```js
// face-ui.js — UI 元件層：相機、疊圖、TTS、視覺反饋
// 不負責特徵向量數學（spec § 3.1）

let audioUnlocked = false;

export function setupAudioUnlock(rootEl) {
  if (audioUnlocked) return;
  const overlay = document.createElement('div');
  overlay.className = 'audio-unlock-overlay';
  overlay.innerHTML = `
    <div class="audio-unlock-card">
      <h2>請點任意處啟用聲音</h2>
      <p>iOS 與部分瀏覽器要求使用者互動後才能播放語音。</p>
    </div>
  `;
  rootEl.appendChild(overlay);
  const unlock = () => {
    audioUnlocked = true;
    // 觸發一次空語音以解鎖 audio context
    try {
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0;
      speechSynthesis.speak(u);
    } catch {}
    overlay.remove();
  };
  overlay.addEventListener('click', unlock, { once: true });
  overlay.addEventListener('touchstart', unlock, { once: true });
}

export async function setupCamera(videoEl) {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false,
  });
  videoEl.srcObject = stream;
  await new Promise(r => videoEl.addEventListener('loadedmetadata', r, { once: true }));
  await videoEl.play();
  return stream;
}

export function teardownCamera(stream) {
  if (!stream) return;
  for (const t of stream.getTracks()) t.stop();
}

export function createOverlayCanvas(videoEl, parent) {
  const canvas = document.createElement('canvas');
  canvas.className = 'face-overlay';
  parent.appendChild(canvas);
  const resize = () => {
    canvas.width = videoEl.videoWidth;
    canvas.height = videoEl.videoHeight;
    canvas.style.width = videoEl.offsetWidth + 'px';
    canvas.style.height = videoEl.offsetHeight + 'px';
  };
  videoEl.addEventListener('loadedmetadata', resize);
  window.addEventListener('resize', resize);
  resize();
  return canvas;
}

export function drawFaceBoxes(canvas, faces, sessionsMeta) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (const face of faces) {
    const [x, y, w, h] = face.box;
    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, w, h);
    const sess = sessionsMeta?.get(face.id);
    if (sess) {
      // progress bar
      const pct = Math.min(1, sess.framesCollected / sess.targetFrames);
      ctx.fillStyle = 'rgba(34, 197, 94, 0.3)';
      ctx.fillRect(x, y - 12, w, 6);
      ctx.fillStyle = '#22c55e';
      ctx.fillRect(x, y - 12, w * pct, 6);
    }
  }
}

export function drawRoi(canvas, roiBox) {
  if (!roiBox) return;
  const ctx = canvas.getContext('2d');
  ctx.strokeStyle = '#3b82f6';
  ctx.setLineDash([10, 5]);
  ctx.lineWidth = 3;
  ctx.strokeRect(roiBox.x, roiBox.y, roiBox.w, roiBox.h);
  ctx.setLineDash([]);
  ctx.fillStyle = '#3b82f6';
  ctx.font = '20px sans-serif';
  ctx.fillText('請站這裡', roiBox.x + 10, roiBox.y + 30);
}

export function showCheckinResult(rootEl, { decision, person, ttsConfig }) {
  const card = document.createElement('div');
  card.className = `result-card result-${decision}`;
  if (decision === 'fuzzy') {
    card.innerHTML = `<div class="result-icon">✓</div><div class="result-text">已完成</div>`;
  } else if (person?.displayName) {
    card.innerHTML = `<div class="result-icon">✓</div><div class="result-text">${escapeHtml(person.displayName)}</div>`;
    if (ttsConfig?.enabled && audioUnlocked) {
      speak(ttsConfig.templateNamed.replace('{name}', person.displayName));
    }
  } else {
    card.innerHTML = `<div class="result-icon">✓</div><div class="result-text">歡迎光臨</div>`;
  }
  rootEl.appendChild(card);
  setTimeout(() => card.remove(), 2500);
}

export function showAlertPopup(rootEl, { person, message, sound }) {
  const popup = document.createElement('div');
  popup.className = 'alert-popup';
  popup.innerHTML = `
    <div class="alert-card">
      <h2>⚠️ 警示</h2>
      <p>${escapeHtml(person?.displayName || '名單命中')}</p>
      <p>${escapeHtml(message || '')}</p>
      <button class="alert-dismiss">確認</button>
    </div>
  `;
  rootEl.appendChild(popup);
  let audio;
  if (sound?.url) {
    audio = new Audio(sound.url);
    audio.loop = sound.mode === 'repeat' && sound.repeatUntilDismissed;
    audio.play().catch(() => {});
  }
  popup.querySelector('.alert-dismiss').addEventListener('click', () => {
    audio?.pause();
    popup.remove();
  });
}

export function showRetry(rootEl, msg = '請再試一次') {
  const card = document.createElement('div');
  card.className = 'result-card result-retry';
  card.innerHTML = `<div class="result-text">${escapeHtml(msg)}</div>`;
  rootEl.appendChild(card);
  setTimeout(() => card.remove(), 2000);
}

export async function showConsentDialog(rootEl, { message, requireExplicit }) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'consent-overlay';
    const checkboxHtml = requireExplicit
      ? `<label><input type="checkbox" class="consent-cb"> 我已知悉並同意</label>`
      : '';
    overlay.innerHTML = `
      <div class="consent-card">
        <h2>個資告知</h2>
        <p>${escapeHtml(message)}</p>
        ${checkboxHtml}
        <div class="consent-actions">
          <button class="consent-cancel">取消</button>
          <button class="consent-ok">繼續</button>
        </div>
      </div>
    `;
    rootEl.appendChild(overlay);
    const ok = overlay.querySelector('.consent-ok');
    const cancel = overlay.querySelector('.consent-cancel');
    const cb = overlay.querySelector('.consent-cb');
    if (requireExplicit) {
      ok.disabled = true;
      cb.addEventListener('change', () => ok.disabled = !cb.checked);
    }
    ok.addEventListener('click', () => { overlay.remove(); resolve(true); });
    cancel.addEventListener('click', () => { overlay.remove(); resolve(false); });
  });
}

export async function showExtraFieldsDialog(rootEl, fields) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'fields-overlay';
    const fieldHtml = fields.map(f => {
      if (f.type === 'bool') return `<label><input type="checkbox" name="${f.key}"> ${escapeHtml(f.label)}</label>`;
      if (f.type === 'select') return `<label>${escapeHtml(f.label)} <select name="${f.key}">${f.options.map(o => `<option>${escapeHtml(o)}</option>`).join('')}</select></label>`;
      return `<label>${escapeHtml(f.label)} <input type="text" name="${f.key}"></label>`;
    }).join('<br/>');
    overlay.innerHTML = `
      <div class="fields-card">
        <h2>請補資訊</h2>
        ${fieldHtml}
        <div class="fields-actions">
          <button class="fields-skip">跳過</button>
          <button class="fields-ok">確認</button>
        </div>
      </div>
    `;
    rootEl.appendChild(overlay);
    overlay.querySelector('.fields-ok').addEventListener('click', () => {
      const result = {};
      for (const f of fields) {
        const el = overlay.querySelector(`[name="${f.key}"]`);
        if (!el) continue;
        result[f.key] = f.type === 'bool' ? el.checked : el.value;
      }
      overlay.remove();
      resolve({ submitted: true, values: result });
    });
    overlay.querySelector('.fields-skip').addEventListener('click', () => {
      overlay.remove();
      resolve({ submitted: false, values: null });
    });
  });
}

function speak(text) {
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'zh-TW';
    speechSynthesis.speak(u);
  } catch {}
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
```

- [ ] **Step 2: 建 face-ui.css**

Create `shared/face-ui.css`:

```css
.face-overlay {
  position: absolute; top: 0; left: 0; pointer-events: none;
}
.audio-unlock-overlay, .consent-overlay, .fields-overlay, .alert-popup {
  position: fixed; inset: 0; background: rgba(0,0,0,0.6);
  display: flex; align-items: center; justify-content: center; z-index: 1000;
}
.audio-unlock-card, .consent-card, .fields-card, .alert-card {
  background: white; padding: 24px; border-radius: 12px; max-width: 400px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.2);
}
.result-card {
  position: fixed; top: 24px; left: 50%; transform: translateX(-50%);
  background: white; padding: 16px 32px; border-radius: 24px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.15);
  display: flex; align-items: center; gap: 12px; z-index: 100;
  animation: result-pop 0.3s ease-out;
}
.result-icon { font-size: 32px; color: #22c55e; }
.result-text { font-size: 20px; font-weight: 600; }
.result-retry { background: #fef3c7; }
.alert-card h2 { color: #dc2626; }
.consent-actions, .fields-actions { display: flex; gap: 12px; margin-top: 16px; justify-content: flex-end; }
.consent-ok, .fields-ok { background: #22c55e; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; }
.consent-ok:disabled { background: #94a3b8; cursor: not-allowed; }
@keyframes result-pop { from { transform: translate(-50%, -100%); opacity: 0; } }
```

- [ ] **Step 3: Commit**

```bash
git add shared/face-ui.js shared/face-ui.css
git commit -m "feat(ui): camera + overlay + TTS + result/alert/consent/fields dialogs"
```

---

## Phase 5：流程模板（簽到 + 警示）

### Task 22: 平台級單 tab 鎖

**Files:**
- Create: `shared/single-tab-lock.js`
- Test: `tests/single-tab-lock.test.js`

- [ ] **Step 1: 測試**

Create `tests/single-tab-lock.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { acquireSingleTabLock } from '../shared/single-tab-lock.js';

beforeEach(() => {
  globalThis.BroadcastChannel = class {
    constructor() { this.listeners = []; }
    postMessage() {}
    addEventListener(_e, fn) { this.listeners.push(fn); }
    close() {}
  };
});

describe('acquireSingleTabLock (BroadcastChannel fallback)', () => {
  it('returns acquired=true when navigator.locks unavailable + no other tab announces', async () => {
    delete globalThis.navigator?.locks;
    const result = await acquireSingleTabLock({ timeoutMs: 100 });
    expect(result.acquired).toBe(true);
    result.release();
  });
});
```

- [ ] **Step 2: 失敗**

```bash
npx vitest run tests/single-tab-lock.test.js
```

- [ ] **Step 3: 實作**

Create `shared/single-tab-lock.js`:

```js
const LOCK_NAME = 'facial-signature-tab';
const BC_NAME = 'facial-signature-tab-bc';

export async function acquireSingleTabLock({ timeoutMs = 1000 } = {}) {
  // 優先用 navigator.locks
  if (typeof navigator !== 'undefined' && navigator.locks?.request) {
    return acquireViaLocks();
  }
  // fallback to BroadcastChannel
  return acquireViaBroadcast(timeoutMs);
}

function acquireViaLocks() {
  return new Promise(resolve => {
    let released;
    const releasePromise = new Promise(r => { released = r; });
    navigator.locks.request(LOCK_NAME, { mode: 'exclusive', ifAvailable: true }, async lock => {
      if (!lock) {
        resolve({ acquired: false, release: () => {} });
        return;
      }
      resolve({ acquired: true, release: () => released() });
      await releasePromise;
    });
  });
}

async function acquireViaBroadcast(timeoutMs) {
  const bc = new BroadcastChannel(BC_NAME);
  let othersResponded = false;

  bc.addEventListener('message', (ev) => {
    if (ev.data === 'ping') {
      bc.postMessage('held');
    } else if (ev.data === 'held') {
      othersResponded = true;
    }
  });

  bc.postMessage('ping');
  await new Promise(r => setTimeout(r, timeoutMs));

  if (othersResponded) {
    bc.close();
    return { acquired: false, release: () => {} };
  }

  // claim — keep responding to future pings
  return {
    acquired: true,
    release: () => bc.close(),
  };
}
```

- [ ] **Step 4: 通過 + commit**

```bash
npx vitest run tests/single-tab-lock.test.js
git add shared/single-tab-lock.js tests/single-tab-lock.test.js
git commit -m "feat(lock): platform-wide single-tab lock via navigator.locks + BC fallback"
```

---

### Task 23: persistent storage 請求

**Files:**
- Create: `shared/persistent-storage.js`

- [ ] **Step 1: 實作（無單測，行為依賴瀏覽器）**

Create `shared/persistent-storage.js`:

```js
export async function requestPersistentStorage() {
  if (!navigator.storage?.persist) return { supported: false, persisted: false };
  const already = await navigator.storage.persisted();
  if (already) return { supported: true, persisted: true };
  const granted = await navigator.storage.persist();
  return { supported: true, persisted: granted };
}

export async function isPersisted() {
  if (!navigator.storage?.persisted) return false;
  return navigator.storage.persisted();
}

export async function getStorageEstimate() {
  if (!navigator.storage?.estimate) return null;
  return navigator.storage.estimate();
}
```

- [ ] **Step 2: Commit**

```bash
git add shared/persistent-storage.js
git commit -m "feat(storage): persistent storage request + quota estimate"
```

---

### Task 24: face-checkin-template.js

**Files:**
- Create: `shared/face-checkin-template.js`

整合 engine + store + ui + lock + persistent。

- [ ] **Step 1: 實作**

Create `shared/face-checkin-template.js`:

```js
import * as store from './face-store.js';
import { createFaceEngine, MODEL_VERSION } from './face-engine.js';
import * as ui from './face-ui.js';
import { acquireSingleTabLock } from './single-tab-lock.js';
import { requestPersistentStorage } from './persistent-storage.js';
import { accumulateVectors } from './face-store.js';

export async function runCheckin(config, rootEl) {
  // 1. 環境檢查
  if (location.protocol === 'file:') {
    rootEl.innerHTML = `<div class="error">請使用 HTTPS 或加入主畫面以 PWA 開啟（file:// 不支援攝影機）</div>`;
    return;
  }

  // 2. 單 tab 鎖
  const lock = await acquireSingleTabLock();
  if (!lock.acquired) {
    rootEl.innerHTML = `<div class="readonly">另一個 tab 已開啟，本頁進入唯讀模式</div>`;
    return;
  }

  // 3. persistent storage
  await requestPersistentStorage();

  // 4. UI 元素
  rootEl.innerHTML = `
    <link rel="stylesheet" href="./shared/face-ui.css">
    <header><h1>${escape(config.scenarioName)}</h1></header>
    <div class="cam-container" style="position:relative;">
      <video id="cam" autoplay playsinline muted></video>
    </div>
  `;
  applyTheme(rootEl, config.uiTheme);
  const video = rootEl.querySelector('#cam');
  const camContainer = rootEl.querySelector('.cam-container');

  ui.setupAudioUnlock(rootEl);

  // 5. 開啟資料庫 + 相機
  const db = await store.openFaceDb();
  await ui.setupCamera(video);
  const overlay = ui.createOverlayCanvas(video, camContainer);

  // 6. 啟動引擎
  const tuning = await store.getTuning(db);
  const roiBox = config.concurrency === 'single-roi' ? computeCenterRoi(video) : null;

  const engine = await createFaceEngine({
    videoElement: video,
    tuning,
    concurrency: config.concurrency,
    singleRoiBox: roiBox,
  });

  // 7. 去重節流：記錄每個 personId 最後寫 event 的時間
  const lastEventTs = new Map();

  engine.on('faceResult', async (result) => {
    if (result.timedOut) {
      ui.showRetry(rootEl, '請正面對鏡頭、摘下口罩');
      return;
    }

    const matchResult = await store.match(db, result.vectors, engine.modelVersion);
    const decision = matchResult.decision;

    let personId = null;
    let isNewPerson = false;
    let person = null;
    let extraValues = null;

    // === Consent ===
    if (decision === 'new' && config.consentNotice?.enabled) {
      const ok = await ui.showConsentDialog(rootEl, {
        message: config.consentNotice.message,
        requireExplicit: config.consentNotice.requireExplicitConsent,
      });
      if (!ok) return; // 拒絕 → 不寫 event
    }

    // === extraFields 收集 ===
    if (config.extraFields?.length) {
      const fieldsToCollect = await pickExtraFields(db, config.extraFields, decision, null, matchResult);
      if (fieldsToCollect.length) {
        const r = await ui.showExtraFieldsDialog(rootEl, fieldsToCollect);
        if (!r.submitted) {
          const anyRequired = fieldsToCollect.some(f => f.required);
          if (anyRequired) return; // required 跳過 → 中止
        } else {
          extraValues = r.values;
        }
      }
    }

    // === 寫 person / event ===
    const snapshotBlob = result.snapshot;
    let snapshotId = null;
    if (snapshotBlob) snapshotId = await store.writeSnapshot(snapshotBlob);

    if (decision === 'match') {
      personId = matchResult.candidates[0].personId;
      // dedup
      const last = lastEventTs.get(personId) ?? 0;
      if (Date.now() - last < config.dedupWindowMs) {
        person = await store.getPerson(db, personId);
        ui.showCheckinResult(rootEl, { decision, person, ttsConfig: config.tts });
        return; // 跳過 event 寫入與向量回寫
      }
      lastEventTs.set(personId, Date.now());

      person = await store.getPerson(db, personId);
      // accumulate vectors per § 8.3
      await accumulateVectors(db, personId, result.vectors, {
        contaminationGuard: tuning.contaminationGuard,
        vectorsPerPersonCap: tuning.vectorsPerPersonCap,
      });
    } else if (decision === 'new') {
      // 新人：直接寫入所有 vectors（empty-target fallback 同效果）
      person = await store.createPerson(db, {
        vectors: result.vectors,
        modelVersion: engine.modelVersion,
        meta: extractPersonMeta(config.extraFields, extraValues),
      });
      personId = person.id;
      isNewPerson = true;
    } else if (decision === 'fuzzy') {
      // 不建檔；寫 event personId=null + needsReview=true
      personId = null;
    }

    const eventMeta = extractEventMeta(config.extraFields, extraValues);
    if (decision === 'fuzzy') {
      eventMeta.candidates = matchResult.candidates;
    }

    await store.createEvent(db, {
      personId,
      scenario: config.scenarioId,
      mode: 'checkin',
      decision,
      modelVersion: engine.modelVersion,
      matchSimilarity: matchResult.topSimilarity,
      matchScope: matchResult.matchScope,
      samplingQuality: result.samplingQuality,
      isNewPerson,
      needsReview: decision === 'fuzzy',
      snapshotId,
      meta: eventMeta,
    });

    ui.showCheckinResult(rootEl, { decision, person, ttsConfig: config.tts });
  });

  engine.on('error', err => {
    console.error('engine error', err);
    ui.showRetry(rootEl, '系統錯誤，請重整頁面');
  });

  if (config.trigger === 'manual') {
    setupManualTrigger(rootEl, config.manualUi, engine);
  } else {
    engine.start();
  }
}

function setupManualTrigger(rootEl, manualUi, engine) {
  const btn = document.createElement('button');
  btn.className = 'manual-trigger';
  btn.textContent = manualUi.buttonLabel;
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    if (manualUi.countdownSec) {
      for (let i = manualUi.countdownSec; i > 0; i--) {
        btn.textContent = `${i}...`;
        await new Promise(r => setTimeout(r, 1000));
      }
    }
    engine.start();
    setTimeout(() => {
      engine.stop();
      btn.disabled = false;
      btn.textContent = manualUi.buttonLabel;
    }, 6000);
  });
  rootEl.appendChild(btn);
}

function computeCenterRoi(video) {
  const w = video.videoWidth || 640;
  const h = video.videoHeight || 480;
  return { x: w * 0.25, y: h * 0.15, w: w * 0.5, h: h * 0.7 };
}

async function pickExtraFields(db, fields, decision, _personId, _matchResult) {
  // fuzzy → 只收 event-scope
  if (decision === 'fuzzy') {
    return fields.filter(f => f.scope === 'event');
  }
  const result = [];
  for (const f of fields) {
    if (f.collectOn === 'every') result.push(f);
    else if (f.collectOn === 'newPersonOnly' && decision === 'new') result.push(f);
    else if (f.collectOn === 'firstTimeAtScenario') {
      // TODO: 之後接 events 查詢；暫每次都收集
      result.push(f);
    }
  }
  return result;
}

function extractPersonMeta(fields, values) {
  if (!values) return {};
  const out = {};
  for (const f of (fields || [])) {
    if (f.scope === 'person' && f.key in values) out[f.key] = values[f.key];
  }
  return out;
}
function extractEventMeta(fields, values) {
  if (!values) return {};
  const out = {};
  for (const f of (fields || [])) {
    if (f.scope === 'event' && f.key in values) out[f.key] = values[f.key];
  }
  return out;
}

function applyTheme(root, theme) {
  if (!theme) return;
  if (theme.primary) root.style.setProperty('--primary', theme.primary);
  if (theme.background) root.style.background = theme.background;
}

function escape(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
```

- [ ] **Step 2: Commit**

```bash
git add shared/face-checkin-template.js
git commit -m "feat(template): face-checkin-template orchestrating engine + store + ui"
```

---

### Task 25: face-alert-template.js

**Files:**
- Create: `shared/face-alert-template.js`

- [ ] **Step 1: 實作**

Create `shared/face-alert-template.js`:

```js
import * as store from './face-store.js';
import { createFaceEngine } from './face-engine.js';
import * as ui from './face-ui.js';
import { acquireSingleTabLock } from './single-tab-lock.js';
import { requestPersistentStorage } from './persistent-storage.js';

export async function runAlert(config, rootEl) {
  if (location.protocol === 'file:') {
    rootEl.innerHTML = `<div class="error">請使用 HTTPS 或加入主畫面開啟</div>`;
    return;
  }

  const lock = await acquireSingleTabLock();
  if (!lock.acquired) {
    rootEl.innerHTML = `<div class="readonly">另一個 tab 已開啟，本頁進入唯讀模式</div>`;
    return;
  }

  await requestPersistentStorage();

  rootEl.innerHTML = `
    <link rel="stylesheet" href="./shared/face-ui.css">
    <header><h1>${escape(config.scenarioName)}</h1></header>
    <div class="cam-container" style="position:relative;">
      <video id="cam" autoplay playsinline muted></video>
    </div>
  `;
  const video = rootEl.querySelector('#cam');
  const camContainer = rootEl.querySelector('.cam-container');

  const db = await store.openFaceDb();
  const watchlist = await store.getWatchlist(db, config.watchlistId);
  if (!watchlist) {
    rootEl.innerHTML = `<div class="error">找不到名單 ${escape(config.watchlistId)}</div>`;
    return;
  }

  await ui.setupCamera(video);
  ui.createOverlayCanvas(video, camContainer);

  const tuning = await store.getTuning(db);
  const engine = await createFaceEngine({
    videoElement: video,
    tuning,
    concurrency: config.concurrency,
  });

  const lastAlertTs = new Map();

  engine.on('faceResult', async (result) => {
    if (result.timedOut) return; // 警示模式靜默

    const matchResult = await store.match(db, result.vectors, engine.modelVersion, {
      candidatePersonIds: watchlist.personIds,
    });

    let decision = matchResult.decision;
    let personId = null;

    if (decision === 'new') return; // 不寫 event，靜默
    if (decision === 'match') {
      personId = matchResult.candidates[0].personId;
      // dedup
      const last = lastAlertTs.get(personId) ?? 0;
      if (Date.now() - last < config.dedupWindowMs) return;
      lastAlertTs.set(personId, Date.now());
      decision = 'alert-hit'; // template 改寫
    }
    // decision === 'fuzzy' → 仍跳警示，需 review

    let snapshotId = null;
    if (result.snapshot) snapshotId = await store.writeSnapshot(result.snapshot);

    const person = personId ? await store.getPerson(db, personId) : null;
    const meta = decision === 'fuzzy' ? { candidates: matchResult.candidates } : {};

    await store.createEvent(db, {
      personId,
      scenario: config.scenarioId,
      mode: 'alert',
      decision,
      modelVersion: engine.modelVersion,
      matchSimilarity: matchResult.topSimilarity,
      matchScope: 'watchlist',
      samplingQuality: result.samplingQuality,
      isNewPerson: false,
      needsReview: decision === 'fuzzy',
      snapshotId,
      meta,
    });

    ui.showAlertPopup(rootEl, {
      person,
      message: config.alertMessage,
      sound: config.alertSound,
    });
  });

  engine.start();
}

function escape(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
```

- [ ] **Step 2: Commit**

```bash
git add shared/face-alert-template.js
git commit -m "feat(template): face-alert-template with watchlist subset + fuzzy alert"
```

---

## Phase 6：示範 HTML + Configs（真機測試里程碑）

### Task 26: example-checkin.html + config

**Files:**
- Create: `example-checkin.html`
- Create: `configs/example-checkin.json`

- [ ] **Step 1: config JSON**

Create `configs/example-checkin.json`:

```json
{
  "scenarioId": "example-checkin",
  "scenarioName": "示範簽到場景",
  "uiTheme": { "primary": "#22c55e", "background": "#f8fafc" },
  "trigger": "auto",
  "concurrency": "multi-face",
  "dedupWindowMs": 30000,
  "consentNotice": {
    "enabled": true,
    "message": "本系統將擷取您的人臉特徵以進行簽到，資料留在本機。是否同意？",
    "requireExplicitConsent": true
  },
  "extraFields": [
    {
      "key": "withFamily",
      "label": "家屬陪同",
      "type": "bool",
      "scope": "event",
      "collectOn": "every",
      "required": false
    }
  ],
  "tts": {
    "enabled": true,
    "templateNamed": "{name} 您好，歡迎光臨！"
  }
}
```

- [ ] **Step 2: HTML**

Create `example-checkin.html`:

```html
<!doctype html>
<html lang="zh-TW">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no">
  <link rel="manifest" href="/manifest.json">
  <title>簽到</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 0; padding: 0; }
    #app { display: flex; flex-direction: column; height: 100vh; }
    video { max-width: 100%; max-height: 80vh; background: #000; }
    .error, .readonly { padding: 40px; text-align: center; font-size: 18px; color: #dc2626; }
  </style>
</head>
<body>
  <div id="app"></div>
  <script type="module">
    import config from './configs/example-checkin.json' with { type: 'json' };
    import { runCheckin } from './shared/face-checkin-template.js';
    runCheckin(config, document.getElementById('app'));
  </script>
</body>
</html>
```

注意：`import ... with { type: 'json' }` 需要新版瀏覽器；fallback 改用 `fetch`：

如果 import attributes 不可用，改寫為：

```html
<script type="module">
  import { runCheckin } from './shared/face-checkin-template.js';
  const config = await fetch('./configs/example-checkin.json').then(r => r.json());
  runCheckin(config, document.getElementById('app'));
</script>
```

開發初期建議用 fetch 版本，跨瀏覽器較穩。

- [ ] **Step 3: 真機驗證**

```bash
cd /Users/lightman/yao.care/agent.facial.signature
python3 -m http.server 8000
```

瀏覽器開 `http://localhost:8000/example-checkin.html`：
- 允許攝影機
- 過 consent
- 看見自己的臉 → 採樣 → 寫 event（首次當新人建檔）
- 第二次出現 → 識別為 match，回放 TTS

開 DevTools Application > IndexedDB > facial-signature 確認資料寫入。

- [ ] **Step 4: Commit**

```bash
git add example-checkin.html configs/example-checkin.json
git commit -m "feat: example-checkin.html + config for manual testing"
```

---

### Task 27: example-alert.html + config

**Files:**
- Create: `example-alert.html`
- Create: `configs/example-watchlist.json`

- [ ] **Step 1: config**

Create `configs/example-watchlist.json`:

```json
{
  "scenarioId": "example-alert",
  "scenarioName": "示範警示場景",
  "uiTheme": { "primary": "#dc2626", "background": "#fef2f2" },
  "watchlistId": "demo-watchlist",
  "concurrency": "multi-face",
  "dedupWindowMs": 60000,
  "alertSound": {
    "url": "",
    "mode": "once",
    "repeatUntilDismissed": false
  },
  "alertMessage": "高風險名單命中，請工作人員注意"
}
```

- [ ] **Step 2: HTML**

Create `example-alert.html`:

```html
<!doctype html>
<html lang="zh-TW">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no">
  <link rel="manifest" href="/manifest.json">
  <title>警示監看</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 0; padding: 0; }
    #app { display: flex; flex-direction: column; height: 100vh; }
    video { max-width: 100%; max-height: 80vh; background: #000; }
    .error, .readonly { padding: 40px; text-align: center; font-size: 18px; color: #dc2626; }
  </style>
</head>
<body>
  <div id="app"></div>
  <script type="module">
    import { runAlert } from './shared/face-alert-template.js';
    const config = await fetch('./configs/example-watchlist.json').then(r => r.json());
    runAlert(config, document.getElementById('app'));
  </script>
</body>
</html>
```

- [ ] **Step 3: Commit + 真機驗證**

```bash
git add example-alert.html configs/example-watchlist.json
git commit -m "feat: example-alert.html + watchlist config for manual testing"
```

真機驗證需先在 admin（Phase 7）建立 watchlist；先建 commit，回頭驗證。

---

**Phase 6 里程碑**：兩個範例 HTML 可運行；checkin 可在無 admin 的情況下測試新人建檔 + match flow。

---

## Phase 7：admin.html 管理介面

### Task 28: admin.html 骨架 + 4 個 tab 切換

**Files:**
- Create: `admin.html`
- Create: `shared/admin/admin-shell.js`
- Create: `shared/admin/admin.css`

- [ ] **Step 1: HTML**

Create `admin.html`:

```html
<!doctype html>
<html lang="zh-TW">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="manifest" href="/manifest.json">
  <link rel="stylesheet" href="./shared/admin/admin.css">
  <title>管理介面</title>
</head>
<body>
  <header class="admin-header">
    <h1>Facial Signature 管理</h1>
    <nav class="admin-tabs">
      <button data-tab="people" class="active">人員</button>
      <button data-tab="events">Events</button>
      <button data-tab="watchlists">警示名單</button>
      <button data-tab="settings">設定 &amp; 校準</button>
    </nav>
  </header>
  <main id="admin-main"></main>
  <script type="module">
    import { mountAdmin } from './shared/admin/admin-shell.js';
    mountAdmin(document.getElementById('admin-main'));
  </script>
</body>
</html>
```

- [ ] **Step 2: shell**

Create `shared/admin/admin-shell.js`:

```js
import * as store from '../face-store.js';
import { mountPeopleTab } from './admin-tab-people.js';
import { mountEventsTab } from './admin-tab-events.js';
import { mountWatchlistsTab } from './admin-tab-watchlists.js';
import { mountSettingsTab } from './admin-tab-settings.js';

export async function mountAdmin(rootEl) {
  const db = await store.openFaceDb();
  let currentTab = 'people';

  const tabs = {
    people: () => mountPeopleTab(rootEl, db),
    events: () => mountEventsTab(rootEl, db),
    watchlists: () => mountWatchlistsTab(rootEl, db),
    settings: () => mountSettingsTab(rootEl, db),
  };

  document.querySelectorAll('.admin-tabs button').forEach(btn => {
    btn.addEventListener('click', () => {
      currentTab = btn.dataset.tab;
      document.querySelectorAll('.admin-tabs button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      rootEl.innerHTML = '';
      tabs[currentTab]();
    });
  });

  await tabs.people();
}
```

- [ ] **Step 3: CSS**

Create `shared/admin/admin.css`:

```css
body { font-family: system-ui, sans-serif; margin: 0; background: #f8fafc; }
.admin-header { background: #1e293b; color: white; padding: 16px 24px; }
.admin-header h1 { margin: 0 0 12px; font-size: 22px; }
.admin-tabs button {
  background: transparent; border: none; color: white;
  padding: 8px 16px; cursor: pointer; border-bottom: 2px solid transparent;
  font-size: 14px;
}
.admin-tabs button.active { border-bottom-color: #22c55e; font-weight: 600; }
#admin-main { padding: 24px; max-width: 1200px; margin: 0 auto; }

table.admin-table { width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden; }
.admin-table th, .admin-table td { padding: 12px; text-align: left; border-bottom: 1px solid #e2e8f0; }
.admin-table thead { background: #f1f5f9; }
.admin-table img.thumb { width: 48px; height: 48px; object-fit: cover; border-radius: 4px; }

.btn { padding: 6px 12px; border-radius: 6px; cursor: pointer; border: 1px solid #cbd5e1; background: white; }
.btn-primary { background: #22c55e; color: white; border-color: #22c55e; }
.btn-danger { background: #dc2626; color: white; border-color: #dc2626; }

.filter-row { display: flex; gap: 12px; margin-bottom: 16px; align-items: center; }
.filter-row input, .filter-row select { padding: 6px 8px; border: 1px solid #cbd5e1; border-radius: 4px; }

.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; }
.modal { background: white; padding: 24px; border-radius: 8px; max-width: 600px; max-height: 90vh; overflow: auto; }
```

- [ ] **Step 4: Commit**

```bash
mkdir -p shared/admin
git add admin.html shared/admin/admin-shell.js shared/admin/admin.css
git commit -m "feat(admin): shell + 4-tab navigation"
```

---

### Task 29: 人員 tab

**Files:**
- Create: `shared/admin/admin-tab-people.js`

- [ ] **Step 1: 實作**

Create `shared/admin/admin-tab-people.js`:

```js
import * as store from '../face-store.js';

export async function mountPeopleTab(root, db) {
  root.innerHTML = `
    <div class="filter-row">
      <input id="search" placeholder="搜尋姓名 / meta">
      <select id="filter-named">
        <option value="all">全部</option>
        <option value="unnamed">僅未命名</option>
        <option value="named">僅有姓名</option>
      </select>
      <select id="filter-model">
        <option value="all">所有模型版本</option>
      </select>
    </div>
    <table class="admin-table">
      <thead><tr>
        <th>快照</th><th>姓名</th><th>最後活動</th><th>模型</th><th>meta</th><th>操作</th>
      </tr></thead>
      <tbody id="people-tbody"></tbody>
    </table>
  `;

  async function render() {
    const tbody = root.querySelector('#people-tbody');
    const all = await store.listPeople(db);
    const events = await store.listEvents(db);
    const lastEvent = new Map();
    for (const e of events) {
      const prev = lastEvent.get(e.personId);
      if (!prev || e.timestamp > prev.timestamp) lastEvent.set(e.personId, e);
    }
    const filter = root.querySelector('#filter-named').value;
    const search = root.querySelector('#search').value.trim().toLowerCase();

    // populate model filter
    const modelSel = root.querySelector('#filter-model');
    const models = [...new Set(all.map(p => p.modelVersion))];
    if (modelSel.options.length - 1 !== models.length) {
      modelSel.innerHTML = `<option value="all">所有模型版本</option>` + models.map(m => `<option>${escape(m)}</option>`).join('');
    }
    const modelFilter = modelSel.value;

    const rows = all
      .filter(p => filter === 'all' || (filter === 'unnamed' ? !p.displayName : !!p.displayName))
      .filter(p => modelFilter === 'all' || p.modelVersion === modelFilter)
      .filter(p => !search ||
        (p.displayName || '').toLowerCase().includes(search) ||
        JSON.stringify(p.meta).toLowerCase().includes(search))
      .sort((a, b) => (lastEvent.get(b.id)?.timestamp || 0) - (lastEvent.get(a.id)?.timestamp || 0));

    tbody.innerHTML = '';
    for (const p of rows) {
      const tr = document.createElement('tr');
      const last = lastEvent.get(p.id);
      const snapBlob = last?.snapshotId ? await safeReadSnapshot(last.snapshotId) : null;
      const thumb = snapBlob ? `<img class="thumb" src="${URL.createObjectURL(snapBlob)}">` : '—';
      tr.innerHTML = `
        <td>${thumb}</td>
        <td><input class="name-input" value="${escape(p.displayName || '')}" placeholder="（未命名）"></td>
        <td>${last ? new Date(last.timestamp).toLocaleString() : '—'}</td>
        <td>${escape(p.modelVersion)}</td>
        <td><code>${escape(JSON.stringify(p.meta || {}))}</code></td>
        <td>
          <button class="btn btn-save" data-id="${p.id}">儲存</button>
          <button class="btn btn-merge" data-id="${p.id}">合併到…</button>
          <button class="btn btn-split" data-id="${p.id}">拆分</button>
          <button class="btn btn-danger btn-delete" data-id="${p.id}">刪除</button>
        </td>
      `;
      tbody.appendChild(tr);

      tr.querySelector('.btn-save').addEventListener('click', async () => {
        const name = tr.querySelector('.name-input').value.trim() || null;
        await store.updatePerson(db, p.id, { displayName: name });
        render();
      });
      tr.querySelector('.btn-delete').addEventListener('click', async () => {
        if (!confirm(`刪除「${p.displayName || '未命名'}」？此操作將刪除該人所有 events 與 snapshots。`)) return;
        await store.deletePersonCascade(db, p.id);
        render();
      });
      tr.querySelector('.btn-merge').addEventListener('click', () => openMergeDialog(p.id));
      tr.querySelector('.btn-split').addEventListener('click', () => openSplitDialog(p.id));
    }
  }

  async function openMergeDialog(fromId) {
    const all = await store.listPeople(db);
    const others = all.filter(p => p.id !== fromId);
    const choice = prompt(`輸入要合併到的 person id（可選: ${others.slice(0, 10).map(p => `${p.id.slice(0, 8)}=${p.displayName || '?'}`).join(', ')}...）`);
    if (!choice) return;
    const target = all.find(p => p.id.startsWith(choice));
    if (!target) { alert('找不到 target'); return; }
    const tuning = await store.getTuning(db);
    await store.mergePerson(db, fromId, target.id, {
      contaminationGuard: tuning.contaminationGuard,
      vectorsPerPersonCap: tuning.vectorsPerPersonCap,
    });
    render();
  }

  async function openSplitDialog(fromId) {
    const events = await store.listEventsByPerson(db, fromId);
    if (events.length < 2) { alert('events 不足，無法拆分'); return; }
    // 簡化 UI: 列出 events 讓使用者勾選
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal">
        <h2>拆分 — 勾選要拆出去的 events</h2>
        <p>新建 person B 將接收這些 events（與其 snapshot 所有權）。A 的 vectors 保留。</p>
        <ul id="split-list">${events.map(e => `
          <li><label><input type="checkbox" value="${e.id}"> ${new Date(e.timestamp).toLocaleString()} — ${escape(e.scenario)}</label></li>
        `).join('')}</ul>
        <div class="consent-actions">
          <button class="btn split-cancel">取消</button>
          <button class="btn btn-primary split-ok">確認拆分</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('.split-cancel').addEventListener('click', () => overlay.remove());
    overlay.querySelector('.split-ok').addEventListener('click', async () => {
      const ids = [...overlay.querySelectorAll('input[type=checkbox]:checked')].map(c => c.value);
      if (!ids.length) { alert('請至少勾選一個'); return; }
      await store.splitPerson(db, fromId, { eventIdsToSplit: ids });
      overlay.remove();
      render();
    });
  }

  root.querySelector('#search').addEventListener('input', render);
  root.querySelector('#filter-named').addEventListener('change', render);
  root.querySelector('#filter-model').addEventListener('change', render);

  await render();
}

async function safeReadSnapshot(id) {
  try { return await store.readSnapshot(id); } catch { return null; }
}

function escape(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
```

- [ ] **Step 2: Commit**

```bash
git add shared/admin/admin-tab-people.js
git commit -m "feat(admin): people tab — list, edit, search, merge, split, delete"
```

---

### Task 30: Events tab（含 fuzzy 審處）

**Files:**
- Create: `shared/admin/admin-tab-events.js`

- [ ] **Step 1: 實作**

Create `shared/admin/admin-tab-events.js`:

```js
import * as store from '../face-store.js';

export async function mountEventsTab(root, db) {
  root.innerHTML = `
    <div class="filter-row">
      <label>mode <select id="f-mode"><option value="all">全部</option><option>checkin</option><option>alert</option></select></label>
      <label>decision <select id="f-decision"><option value="all">全部</option><option>match</option><option>new</option><option>fuzzy</option><option>alert-hit</option></select></label>
      <label><input type="checkbox" id="f-needsReview"> 僅未審 fuzzy</label>
      <input id="f-scenario" placeholder="scenario">
    </div>
    <table class="admin-table">
      <thead><tr>
        <th>快照</th><th>時間</th><th>場合</th><th>mode</th><th>decision</th><th>personId</th><th>similarity</th><th>狀態</th><th>操作</th>
      </tr></thead>
      <tbody id="ev-tbody"></tbody>
    </table>
  `;

  async function render() {
    const tbody = root.querySelector('#ev-tbody');
    let events = await store.listEvents(db);
    const mode = root.querySelector('#f-mode').value;
    const dec = root.querySelector('#f-decision').value;
    const onlyPending = root.querySelector('#f-needsReview').checked;
    const scenario = root.querySelector('#f-scenario').value.trim();

    events = events
      .filter(e => mode === 'all' || e.mode === mode)
      .filter(e => dec === 'all' || e.decision === dec)
      .filter(e => !onlyPending || e.needsReview === true)
      .filter(e => !scenario || e.scenario === scenario)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 200);

    tbody.innerHTML = '';
    for (const e of events) {
      const tr = document.createElement('tr');
      if (e.needsReview) tr.style.background = '#fef3c7';
      const snap = e.snapshotId ? await safeReadSnapshot(e.snapshotId) : null;
      tr.innerHTML = `
        <td>${snap ? `<img class="thumb" src="${URL.createObjectURL(snap)}">` : '—'}</td>
        <td>${new Date(e.timestamp).toLocaleString()}</td>
        <td>${escape(e.scenario)}</td>
        <td>${e.mode}</td>
        <td>${e.decision}</td>
        <td>${escape((e.personId || '').slice(0, 12))}</td>
        <td>${e.matchSimilarity != null ? e.matchSimilarity.toFixed(3) : '—'} <small>(${e.matchScope})</small></td>
        <td>${e.needsReview ? '待審' : (e.meta?.reviewOutcome || '已處理')}</td>
        <td>${e.needsReview ? `
          <button class="btn btn-assign" data-id="${e.id}">指派</button>
          <button class="btn btn-create" data-id="${e.id}">建新人</button>
          <button class="btn btn-ignore" data-id="${e.id}">忽略</button>
        ` : ''}</td>
      `;
      tbody.appendChild(tr);

      if (e.needsReview) {
        tr.querySelector('.btn-assign').addEventListener('click', () => assign(e));
        tr.querySelector('.btn-create').addEventListener('click', () => createNew(e));
        tr.querySelector('.btn-ignore').addEventListener('click', () => ignore(e));
      }
    }
  }

  async function assign(e) {
    const all = await store.listPeople(db);
    const picks = all.slice(0, 30).map(p => `${p.id.slice(0, 8)}=${p.displayName || '?'}`).join('\n');
    const choice = prompt(`輸入 person id 前綴指派此 event：\n${picks}`);
    if (!choice) return;
    const target = all.find(p => p.id.startsWith(choice));
    if (!target) { alert('找不到'); return; }
    await store.updateEvent(db, e.id, {
      personId: target.id,
      needsReview: false,
      meta: { ...e.meta, reviewOutcome: 'assigned' },
    });
    render();
  }

  async function createNew(e) {
    if (!confirm('請確認當事人已知悉並同意建檔。')) return;
    const name = prompt('輸入 displayName（可留空）');
    const p = await store.createPerson(db, {
      vectors: [], // MVP 不補 vectors
      modelVersion: e.modelVersion,
      displayName: name?.trim() || null,
    });
    await store.updateEvent(db, e.id, {
      personId: p.id,
      needsReview: false,
      meta: { ...e.meta, reviewOutcome: 'created' },
    });
    render();
  }

  async function ignore(e) {
    await store.updateEvent(db, e.id, {
      needsReview: false,
      meta: { ...e.meta, reviewOutcome: 'ignored' },
    });
    render();
  }

  ['#f-mode', '#f-decision', '#f-needsReview', '#f-scenario'].forEach(sel => {
    root.querySelector(sel).addEventListener('change', render);
  });
  root.querySelector('#f-scenario').addEventListener('input', render);

  await render();
}

async function safeReadSnapshot(id) {
  try { return await store.readSnapshot(id); } catch { return null; }
}
function escape(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
```

- [ ] **Step 2: Commit**

```bash
git add shared/admin/admin-tab-events.js
git commit -m "feat(admin): events tab with fuzzy review (assign/create/ignore + meta.reviewOutcome)"
```

---

### Task 31: 警示名單 tab

**Files:**
- Create: `shared/admin/admin-tab-watchlists.js`

- [ ] **Step 1: 實作**

Create `shared/admin/admin-tab-watchlists.js`:

```js
import * as store from '../face-store.js';

export async function mountWatchlistsTab(root, db) {
  root.innerHTML = `
    <div class="filter-row">
      <input id="new-id" placeholder="新名單 id (英數)">
      <input id="new-name" placeholder="名稱">
      <button class="btn btn-primary" id="new-btn">建立</button>
    </div>
    <div id="lists"></div>
  `;

  root.querySelector('#new-btn').addEventListener('click', async () => {
    const id = root.querySelector('#new-id').value.trim();
    const name = root.querySelector('#new-name').value.trim();
    if (!id) { alert('需要 id'); return; }
    await store.createWatchlist(db, { id, name: name || id });
    render();
  });

  async function render() {
    const lists = await store.listWatchlists(db);
    const allPeople = await store.listPeople(db);
    const peopleById = new Map(allPeople.map(p => [p.id, p]));
    const container = root.querySelector('#lists');
    container.innerHTML = '';
    for (const wl of lists) {
      const card = document.createElement('div');
      card.className = 'modal';
      card.style.margin = '12px 0';
      card.innerHTML = `
        <h3>${escape(wl.name)} <code>${escape(wl.id)}</code>
          <button class="btn btn-danger" data-action="del">刪除</button></h3>
        <p>${wl.personIds.length} 人在名單上</p>
        <ul>${wl.personIds.map(pid => `
          <li>${escape(peopleById.get(pid)?.displayName || pid.slice(0, 12))}
            <button class="btn" data-remove="${pid}">移出</button></li>
        `).join('')}</ul>
        <input class="add-input" placeholder="輸入 person id 前綴新增">
        <button class="btn" data-action="add">加入</button>
      `;
      container.appendChild(card);
      card.querySelector('[data-action=del]').addEventListener('click', async () => {
        if (!confirm('刪除此名單？')) return;
        await store.deleteWatchlist(db, wl.id);
        render();
      });
      card.querySelector('[data-action=add]').addEventListener('click', async () => {
        const prefix = card.querySelector('.add-input').value.trim();
        const target = allPeople.find(p => p.id.startsWith(prefix));
        if (!target) { alert('找不到'); return; }
        await store.addToWatchlist(db, wl.id, target.id);
        render();
      });
      card.querySelectorAll('[data-remove]').forEach(btn => {
        btn.addEventListener('click', async () => {
          await store.removeFromWatchlist(db, wl.id, btn.dataset.remove);
          render();
        });
      });
    }
  }

  await render();
}

function escape(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
```

- [ ] **Step 2: Commit**

```bash
git add shared/admin/admin-tab-watchlists.js
git commit -m "feat(admin): watchlists tab (CRUD + member management)"
```

---

### Task 32: 設定 & 校準 tab

**Files:**
- Create: `shared/admin/admin-tab-settings.js`

- [ ] **Step 1: 實作**

Create `shared/admin/admin-tab-settings.js`:

```js
import * as store from '../face-store.js';
import { isPersisted, getStorageEstimate, requestPersistentStorage } from '../persistent-storage.js';
import { cosineSimilarity } from '../util-cosine.js';

export async function mountSettingsTab(root, db) {
  root.innerHTML = `
    <h2>Tuning 參數</h2>
    <div id="tuning-form"></div>
    <h2>儲存狀態</h2>
    <div id="storage-status"></div>
    <h2>相似度測試器</h2>
    <div id="similarity-tester">
      <select id="sim-a"></select>
      <select id="sim-b"></select>
      <button class="btn" id="sim-compute">計算</button>
      <div id="sim-result"></div>
    </div>
    <h2>匯出 / 匯入</h2>
    <div>
      <button class="btn btn-primary" id="export-btn">匯出全部資料</button>
      <input type="password" id="export-pwd" placeholder="（可選）密碼">
      <input type="file" id="import-file" accept=".zip,.bin">
      <button class="btn btn-danger" id="import-btn">匯入（會清空現有）</button>
      <input type="password" id="import-pwd" placeholder="密碼（如有加密）">
    </div>
    <h2>孤兒檔回收</h2>
    <button class="btn" id="gc-btn">掃描並刪除孤兒 snapshot</button>
    <div id="gc-status"></div>
  `;

  const tuning = await store.getTuning(db);
  const tuningForm = root.querySelector('#tuning-form');
  tuningForm.innerHTML = Object.keys(tuning)
    .filter(k => k !== 'id' && typeof tuning[k] !== 'object')
    .map(k => `
      <label style="display:block; margin: 4px 0;">
        ${k} <input data-key="${k}" type="number" step="any" value="${tuning[k]}">
      </label>
    `).join('') + `<button class="btn btn-primary" id="save-tuning">儲存</button>`;
  tuningForm.querySelector('#save-tuning').addEventListener('click', async () => {
    const overrides = {};
    tuningForm.querySelectorAll('[data-key]').forEach(inp => {
      overrides[inp.dataset.key] = Number(inp.value);
    });
    await store.putTuning(db, overrides);
    alert('已儲存');
  });

  // storage status
  const persisted = await isPersisted();
  const est = await getStorageEstimate();
  root.querySelector('#storage-status').innerHTML = `
    Persistent storage: ${persisted ? '✓ 已授權' : '✗ 未授權'}
    ${!persisted ? `<button class="btn" id="req-persist">請求授權</button>` : ''}
    <br/>用量: ${est ? `${Math.round(est.usage/1024/1024)} MB / ${Math.round(est.quota/1024/1024)} MB` : '不支援'}
  `;
  root.querySelector('#req-persist')?.addEventListener('click', async () => {
    await requestPersistentStorage();
    mountSettingsTab(root, db);
  });

  // similarity tester
  const all = await store.listPeople(db);
  const opts = all.map(p => `<option value="${p.id}">${escape(p.displayName || p.id.slice(0, 8))}</option>`).join('');
  root.querySelector('#sim-a').innerHTML = opts;
  root.querySelector('#sim-b').innerHTML = opts;
  root.querySelector('#sim-compute').addEventListener('click', async () => {
    const aId = root.querySelector('#sim-a').value;
    const bId = root.querySelector('#sim-b').value;
    const a = await store.getPerson(db, aId);
    const b = await store.getPerson(db, bId);
    if (!a.vectors.length || !b.vectors.length) {
      root.querySelector('#sim-result').textContent = '至少一邊沒有向量';
      return;
    }
    // 最大跨向量 similarity
    let max = -Infinity;
    for (const va of a.vectors) for (const vb of b.vectors) {
      const s = cosineSimilarity(va, vb);
      if (s > max) max = s;
    }
    root.querySelector('#sim-result').textContent = `cosine max = ${max.toFixed(4)}`;
  });

  // export / import
  root.querySelector('#export-btn').addEventListener('click', async () => {
    const pwd = root.querySelector('#export-pwd').value || undefined;
    const blob = await store.exportAll(db, { password: pwd });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `facial-signature-backup-${new Date().toISOString().slice(0, 10)}.${pwd ? 'bin' : 'zip'}`;
    a.click();
  });
  root.querySelector('#import-btn').addEventListener('click', async () => {
    const file = root.querySelector('#import-file').files[0];
    if (!file) { alert('請選檔'); return; }
    if (!confirm('匯入會清空現有資料，確認？')) return;
    const pwd = root.querySelector('#import-pwd').value || undefined;
    try {
      await store.importAll(db, file, { password: pwd });
      alert('匯入成功，請重整頁面');
    } catch (err) {
      alert(`匯入失敗：${err.message}`);
    }
  });

  // orphan GC
  root.querySelector('#gc-btn').addEventListener('click', async () => {
    const n = await store.gcOrphanSnapshots(db);
    root.querySelector('#gc-status').textContent = `刪除 ${n} 個孤兒檔`;
  });
}

function escape(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
```

- [ ] **Step 2: Commit + 真機驗證 admin 整體**

```bash
git add shared/admin/admin-tab-settings.js
git commit -m "feat(admin): settings & calibration tab (tuning + storage + similarity tester + export/import + GC)"
```

打開 `http://localhost:8000/admin.html`，逐 tab 驗證。

---

**Phase 7 里程碑**：admin 完整可用，可審 fuzzy events、合併拆分、設定 watchlist。回頭驗證 example-alert.html 真機 flow。

---

## Phase 8：PWA + Service Worker

### Task 33: manifest.json

**Files:**
- Create: `manifest.json`
- Create: `icons/icon-192.png`, `icons/icon-512.png`（placeholder）

- [ ] **Step 1: manifest**

Create `manifest.json`:

```json
{
  "name": "Facial Signature 簽到平台",
  "short_name": "FaceSign",
  "description": "純前端人臉識別簽到平台",
  "start_url": "/admin.html",
  "scope": "/",
  "display": "standalone",
  "background_color": "#f8fafc",
  "theme_color": "#1e293b",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

- [ ] **Step 2: 產生 placeholder icons**

```bash
mkdir -p icons
# 用任意工具產生 192x192 與 512x512 的純色 PNG；以下用 ImageMagick：
which convert || echo "請安裝 ImageMagick 或自行放入 icons/icon-192.png 與 icon-512.png"
convert -size 192x192 xc:#22c55e icons/icon-192.png 2>/dev/null || true
convert -size 512x512 xc:#22c55e icons/icon-512.png 2>/dev/null || true
ls icons/
```

- [ ] **Step 3: Commit**

```bash
git add manifest.json icons/
git commit -m "feat(pwa): manifest.json + placeholder icons"
```

---

### Task 34: service-worker.js

**Files:**
- Create: `service-worker.js`
- Create: `shared/sw-register.js`

- [ ] **Step 1: SW 實作**

Create `service-worker.js`:

```js
// service-worker.js — cache app shell + Human models + vendor
const VERSION = 'v1';
const CACHE_APP = `app-shell-${VERSION}`;
const CACHE_MODELS = `human-models-${VERSION}`;

const APP_SHELL = [
  '/',
  '/admin.html',
  '/example-checkin.html',
  '/example-alert.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/shared/face-store.js',
  '/shared/face-store-schema.js',
  '/shared/face-store-tuning.js',
  '/shared/face-store-people.js',
  '/shared/face-store-events.js',
  '/shared/face-store-watchlists.js',
  '/shared/face-store-opfs.js',
  '/shared/face-store-accumulate.js',
  '/shared/face-store-match.js',
  '/shared/face-store-ops.js',
  '/shared/face-store-gc.js',
  '/shared/face-store-export.js',
  '/shared/face-store-import.js',
  '/shared/face-engine.js',
  '/shared/face-quality.js',
  '/shared/face-ui.js',
  '/shared/face-ui.css',
  '/shared/face-worker.js',
  '/shared/face-worker-logic.js',
  '/shared/face-checkin-template.js',
  '/shared/face-alert-template.js',
  '/shared/single-tab-lock.js',
  '/shared/persistent-storage.js',
  '/shared/util-ulid.js',
  '/shared/util-cosine.js',
  '/shared/admin/admin-shell.js',
  '/shared/admin/admin-tab-people.js',
  '/shared/admin/admin-tab-events.js',
  '/shared/admin/admin-tab-watchlists.js',
  '/shared/admin/admin-tab-settings.js',
  '/shared/admin/admin.css',
  '/vendor/idb/idb.min.js',
  '/vendor/fflate/fflate.module.js',
  '/vendor/human/human.esm.js',
  '/configs/example-checkin.json',
  '/configs/example-watchlist.json',
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE_APP);
    await cache.addAll(APP_SHELL.map(u => new Request(u, { cache: 'reload' })));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => !k.endsWith(VERSION)).map(k => caches.delete(k)));
    self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // models 走 cache-first + 背景更新
  if (url.pathname.startsWith('/vendor/human/models/')) {
    e.respondWith((async () => {
      const cache = await caches.open(CACHE_MODELS);
      const cached = await cache.match(e.request);
      if (cached) return cached;
      const fresh = await fetch(e.request);
      cache.put(e.request, fresh.clone());
      return fresh;
    })());
    return;
  }
  // app shell 走 cache-first
  e.respondWith((async () => {
    const cached = await caches.match(e.request);
    if (cached) return cached;
    try {
      return await fetch(e.request);
    } catch {
      return new Response('Offline', { status: 503 });
    }
  })());
});

self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});
```

- [ ] **Step 2: 註冊 SW 的輔助模組**

Create `shared/sw-register.js`:

```js
export async function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.register('/service-worker.js', { scope: '/' });
    reg.addEventListener('updatefound', () => {
      const newWorker = reg.installing;
      newWorker?.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          // 有新版本；下次重整生效
          console.log('[sw] new version available');
        }
      });
    });
  } catch (err) {
    console.warn('[sw] register failed', err);
  }
}
```

- [ ] **Step 3: 在 3 個 HTML 註冊 SW**

修改 `example-checkin.html`、`example-alert.html`、`admin.html` 在 `<script type="module">` 內加：

```js
import { registerSW } from './shared/sw-register.js';
registerSW();
```

- [ ] **Step 4: Commit + 真機驗證 PWA**

```bash
git add service-worker.js shared/sw-register.js example-checkin.html example-alert.html admin.html
git commit -m "feat(pwa): service worker (app shell + Human models cache) + register helper"
```

驗證：
- 開 `http://localhost:8000/admin.html`
- DevTools > Application > Service Workers 確認註冊
- DevTools > Application > Cache Storage 確認 `app-shell-v1` 有檔案
- 關掉 dev server → 重新整理 → 仍可開（離線）

---

**Phase 8 里程碑**：PWA 可加到主畫面、可離線運作。

---

## Phase 9：文件 + 收尾

### Task 35: README.md（部署 + 合規 + 操作指引）

**Files:**
- Create: `README.md`

- [ ] **Step 1: 撰寫 README**

Create `README.md`:

```markdown
# Facial Signature 簽到平台

純前端、瀏覽器資料、PWA 部署的人臉識別簽到平台。涵蓋簽到（模式 A）與警示（模式 B）兩種情境。設計規格見 [`docs/superpowers/specs/2026-05-23-facial-signature-design.md`](docs/superpowers/specs/2026-05-23-facial-signature-design.md)。

## 部署

### 方法 A：GitHub Pages / Netlify（推薦）

1. 把整個 repo 推到 GitHub
2. 啟用 GitHub Pages（settings → Pages → main branch / root）
3. 取得 `https://<user>.github.io/<repo>/admin.html`
4. 在裝置上打開 → 「加入主畫面」

### 方法 B：機構內網 HTTPS server

任何能提供 HTTPS 的靜態檔案 server（nginx、Caddy、樹莓派）皆可。檔案布署在 root 即可。

### ⚠️ 不可雙擊 HTML 開啟

`getUserMedia` 與 OPFS 都需要 secure context (`https://` 或 `http://localhost`)。`file://` 雙擊**無法用**。

## 加到主畫面操作

### iOS Safari
1. 用 Safari 開頁面
2. 分享按鈕 → 「加入主畫面」
3. 確認後桌面出現圖示，點圖示進入 standalone 模式
4. 首次進入請允許攝影機與聲音

### Android Chrome
1. 用 Chrome 開頁面
2. 右上選單 → 「安裝應用程式」或「加入主畫面」
3. 進入 standalone 後設定相機為「永久允許」

### Desktop Chrome / Edge
1. 網址列右側出現「安裝」圖示
2. 點擊安裝
3. 從應用程式啟動

## 第一次使用流程

1. 開啟 `admin.html`，點「請求 persistent storage 授權」
2. 建立至少一個 watchlist（如需警示）
3. 開啟 `example-checkin.html`，過 consent，第一個人臉自動建檔
4. 回 `admin.html` 為新建檔人員命名

## 重要前提

- **資料留在瀏覽器**：清快取 / 重灌系統 = 資料消失。**請定期至 admin → 匯出備份**。
- **首次連網下載模型**（檔案大小視所選 Human variant 而定，實測完請更新此處 → **TODO: 填入實測 MB**）。模型快取後離線可用。
- **準確度需上線後校準**。所有閾值在 admin → 設定 & 校準 可調，從預設值開始用真實資料逐步調整。
- **識別會錯**。系統用合併 / 拆分 / 校準工具補救誤判，請定期 review 待審 events。

## 合規責任聲明

本系統處理**生物特徵資料**（人臉特徵向量）。**部署方為個資控制者**，請依當地法規（台灣個資法 / GDPR / HIPAA 等）：

- 使用前向被識別者告知並取得同意
- 對長者、未成年人需依規定取得監護人同意
- 公共 kiosk 部署需評估他人接觸資料的風險
- 本系統不負責資料的法律合規，部署方須自行確認

## 開發

### 跑測試

```bash
npm install
npm test
```

### 本機跑 dev server

```bash
npm run serve              # python3 -m http.server
# 或
npm run serve:node         # npx http-server
```

開 `http://localhost:8000/admin.html`

## 已知 MVP 限制

- **拆分後新 person 的 vectors 從空開始**：需被識別者再次入鏡 + 管理員再次合併。v2+ 改善。
- **單一裝置使用**：無多裝置同步（架構決定，永久非目標）。
- **同時只能開一個 tab**：全平台級鎖。
- **模糊區 event 不自動建檔**：管理員到 events tab 審處後決定。

## 模型版本管理

當前 `MODEL_VERSION = 'human-3.3.5-faceres'`（見 `shared/face-engine.js`）。模型升級流程見 spec § 6.5。

## License

[請填入]
```

- [ ] **Step 2: 補實測模型大小**

```bash
du -sh vendor/human/models/
```

把結果填入 README 的 TODO。

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: README with deployment, add-to-homescreen, compliance, dev"
```

---

### Task 36: 最終驗證

- [ ] **Step 1: 跑所有測試**

```bash
npx vitest run
```

Expected: 全部 passed（約 30+ 個測試案例）

- [ ] **Step 2: 手動 E2E 流程**

依此順序在瀏覽器確認：

1. `admin.html` → 設定 & 校準 → 請求 persistent storage → 確認獲准
2. `example-checkin.html` → consent → 首次入鏡 → 建檔 → 反饋「歡迎光臨」
3. `admin.html` → 人員 → 該新建檔人員命名「測試 A」
4. `example-checkin.html` → 第二次入鏡 → match → 反饋 + TTS「測試 A 您好」
5. `admin.html` → events → 確認兩筆 event（new + match）
6. `admin.html` → 警示名單 → 建 `demo-watchlist` → 加入「測試 A」
7. `example-alert.html` → 「測試 A」入鏡 → 警示彈窗
8. `admin.html` → 匯出備份 → 下載 zip
9. （可選）清空 IDB → 匯入備份 → 驗證資料還原

- [ ] **Step 3: 離線驗證**

關閉 dev server，重整 `admin.html`，確認仍可開（SW cache 生效）。

- [ ] **Step 4: 最終 commit**

```bash
git status
git log --oneline | head -40
```

確認分支乾淨、commits 有條理。

---

## 完成里程碑

- ✅ Phase 1：bootstrap
- ✅ Phase 2：資料層（unit tests 全綠）
- ✅ Phase 3：engine（手動驗證留待 Phase 6）
- ✅ Phase 4：UI 元件
- ✅ Phase 5：流程模板
- ✅ Phase 6：example HTMLs（真機驗證 checkin flow）
- ✅ Phase 7：admin（真機驗證 alert flow）
- ✅ Phase 8：PWA + 離線
- ✅ Phase 9：文件 + 收尾

## Self-Review Checklist

針對 spec 各章節檢核覆蓋（plan task 對應）：

| Spec 章節 | 對應 Task |
|---|---|
| § 3 模組架構 | T18 barrel + 各模組 task |
| § 4 技術選型 | T2 vendor Human/idb，T17 vendor fflate |
| § 5 部署模型 | T35 README + T33–34 PWA |
| § 6.1 schemas | T6 schema、T7 tuning、T8 people、T9 events、T10 watchlists、T11 OPFS |
| § 6.3 OPFS flat | T11 |
| § 6.5 模型升級 | T15 mergePerson 跨 modelVersion 分支 |
| § 7 HTML/config | T26、T27 |
| § 8.0 quality factors | T19 |
| § 8.1 簽到流程 | T24 face-checkin-template |
| § 8.2 警示流程 | T25 face-alert-template |
| § 8.3 漸進累積 | T14 + T15 mergePerson |
| § 9.1 人員 tab | T29 |
| § 9.2 events tab | T30 |
| § 9.3 警示名單 | T31 |
| § 9.4 設定 & 校準 | T32 |
| § 9.5 export/import | T17 |
| § 10 錯誤處理 | T24/25 各模板的 file:// 檢測 + try/catch + § 10 統一 rollback 落在 ops |
| § 11 合規 | T24 consent + T30 admin 建檔確認 + T35 README |
| § 12 測試 | 各 task 的 unit test + T36 手動 E2E |
| § 13.1 MVP 交付 | 全部 task |
| § 13.3 重要前提 | T35 README |

無遺漏。

---

**Plan complete and saved to `docs/superpowers/plans/2026-05-23-facial-signature-implementation.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - 每個 task 派一個獨立 subagent 實作，task 間 review，快速迭代

**2. Inline Execution** - 在此 session 內逐 task 執行，批次 checkpoint review

**選哪一種？**


