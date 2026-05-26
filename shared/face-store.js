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
export { getScenarioConfig, putScenarioConfig, listScenarioConfigs } from './face-store-config.js';
