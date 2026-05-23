export async function createWatchlist(db, { id, name }) {
  if (!id) throw new Error('watchlist id required');
  const now = Date.now();
  const w = { id, name, personIds: [], createdAt: now, updatedAt: now };
  await db.put('watchlists', w);
  return w;
}

export async function getWatchlist(db, id) {
  return db.get('watchlists', id);
}

export async function listWatchlists(db) {
  return db.getAll('watchlists');
}

export async function addToWatchlist(db, watchlistId, personId) {
  const tx = db.transaction('watchlists', 'readwrite');
  const w = await tx.store.get(watchlistId);
  if (!w) { await tx.done; throw new Error(`watchlist ${watchlistId} not found`); }
  if (!w.personIds.includes(personId)) w.personIds.push(personId);
  w.updatedAt = Date.now();
  await tx.store.put(w);
  await tx.done;
  return w;
}

export async function removeFromWatchlist(db, watchlistId, personId) {
  const tx = db.transaction('watchlists', 'readwrite');
  const w = await tx.store.get(watchlistId);
  if (!w) { await tx.done; return; }
  w.personIds = w.personIds.filter(id => id !== personId);
  w.updatedAt = Date.now();
  await tx.store.put(w);
  await tx.done;
}

export async function deleteWatchlist(db, id) {
  await db.delete('watchlists', id);
}

// 反向查詢：spec § 6.2 MVP 全表掃可接受
export async function findWatchlistsContaining(db, personId) {
  const all = await db.getAll('watchlists');
  return all.filter(w => w.personIds.includes(personId));
}

// 連動：刪除 person 時呼叫
export async function removePersonFromAllWatchlists(db, personId) {
  const tx = db.transaction('watchlists', 'readwrite');
  const all = await tx.store.getAll();
  for (const w of all) {
    if (w.personIds.includes(personId)) {
      w.personIds = w.personIds.filter(id => id !== personId);
      w.updatedAt = Date.now();
      await tx.store.put(w);
    }
  }
  await tx.done;
}

// 連動：合併 A→B 時呼叫
export async function replacePersonInAllWatchlists(db, fromId, toId) {
  const tx = db.transaction('watchlists', 'readwrite');
  const all = await tx.store.getAll();
  for (const w of all) {
    if (w.personIds.includes(fromId)) {
      const set = new Set(w.personIds);
      set.delete(fromId);
      set.add(toId);
      w.personIds = [...set];
      w.updatedAt = Date.now();
      await tx.store.put(w);
    }
  }
  await tx.done;
}
