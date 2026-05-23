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
