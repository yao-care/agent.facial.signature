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
