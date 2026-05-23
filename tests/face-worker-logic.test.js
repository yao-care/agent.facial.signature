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
    const r = matchVectorsAgainstPeople([vec([0.5, 0.5, 0.5])], PEOPLE, TUNING);
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
    // p1 not in subset -> only compare p2/p3
    expect(['p2', 'p3']).toContain(r.candidates[0].personId);
    expect(r.matchScope).toBe('watchlist');
  });

  it('averages multiple query vectors via max-per-vector approach', () => {
    // Multiple query vectors against same person, take "max cosine per query vector then average"
    const r = matchVectorsAgainstPeople([vec([1, 0, 0]), vec([0.9, 0.1, 0])], PEOPLE, TUNING);
    expect(r.candidates[0].personId).toBe('p1');
  });
});
