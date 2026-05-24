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
