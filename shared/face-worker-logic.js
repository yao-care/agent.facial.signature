import { cosineMax } from './util-cosine.js';

// Pure logic for worker and testing
export function matchVectorsAgainstPeople(queryVectors, people, tuning, opts = {}) {
  const { candidatePersonIds } = opts;
  const pool = candidatePersonIds
    ? people.filter(p => candidatePersonIds.includes(p.id))
    : people;

  // For each person, calculate "composite similarity of query set to that person's vectors"
  // Strategy: for each query vector, get cosineMax against that person's vectors, then average across query set
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
