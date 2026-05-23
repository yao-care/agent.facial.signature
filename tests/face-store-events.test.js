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
