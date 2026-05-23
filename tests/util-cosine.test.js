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
