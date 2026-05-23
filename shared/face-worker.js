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
