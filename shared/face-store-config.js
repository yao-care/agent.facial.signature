// scenarioConfig — 用 settings store 存可編輯的情境時段排程（schedule）
// id 格式：scenarioConfig:<scenarioId>，與 tuning（id='tuning'）共用 store 但前綴隔離
const KEY_PREFIX = 'scenarioConfig:';

export async function getScenarioConfig(db, scenarioId) {
  return db.get('settings', KEY_PREFIX + scenarioId);
}

export async function putScenarioConfig(db, scenarioId, schedule) {
  const rec = {
    id: KEY_PREFIX + scenarioId,
    scenarioId,
    schedule: schedule ?? { weekly: [], specific: [] },
    updatedAt: Date.now(),
  };
  await db.put('settings', rec);
  return rec;
}

export async function listScenarioConfigs(db) {
  // settings store 很小，全表掃可接受
  const all = await db.getAll('settings');
  return all.filter(r => typeof r.id === 'string' && r.id.startsWith(KEY_PREFIX));
}
