// 報表「已登錄」追蹤 — 用 settings store 存已登錄的列 key 清單
const KEY = 'reportRegistered';

export async function getRegisteredKeys(db) {
  const rec = await db.get('settings', KEY);
  return new Set(rec?.keys || []);
}

export async function setRegistered(db, rowKey, registered) {
  const rec = await db.get('settings', KEY);
  const set = new Set(rec?.keys || []);
  if (registered) set.add(rowKey); else set.delete(rowKey);
  await db.put('settings', { id: KEY, keys: [...set] });
  return set;
}
