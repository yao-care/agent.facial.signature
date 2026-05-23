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
