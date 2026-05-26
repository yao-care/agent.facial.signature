// report-aggregate.js — 純函式：把 checkin events 彙總成 B 表列（無 DB 依賴，可單元測試）

export const B_TABLE_COLUMNS = [
  '流水號', '活動日期', '星期', '時段', '服務項目', '活動編號', '活動主題',
  '餐飲類型', '個案編號', '姓名', '簽到時間', '簽退時間', '報到方式',
  '是否平台已登錄', '血壓收縮', '血壓舒張', '服務志工', '備註',
];

const WEEKDAYS = ['週日', '週一', '週二', '週三', '週四', '週五', '週六'];

export function toMinguoDate(ts) {
  const d = new Date(ts);
  const roc = d.getFullYear() - 1911;
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${roc}/${mm}/${dd}`;
}

export function toWeekday(ts) {
  return WEEKDAYS[new Date(ts).getDay()];
}

export function toHHMM(ts) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function dateKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

// opts: { dateFrom, dateTo, scenarioId }。dateFrom/dateTo 為「含端點」的 epoch-ms 上下界。
export function aggregateServiceRecords(events, peopleById, opts = {}) {
  const { dateFrom = null, dateTo = null, scenarioId = null } = opts;

  const checkins = events.filter(e =>
    e.mode === 'checkin' && e.personId != null &&
    (scenarioId == null || e.scenario === scenarioId) &&
    (dateFrom == null || e.timestamp >= dateFrom) &&
    (dateTo == null || e.timestamp <= dateTo)
  );

  const groups = new Map();
  for (const e of checkins) {
    // 同組（同人/同日/同情境/同時段）的 serviceRecord 視為一致，取首筆即可（spec §5.2 假設）
    const sr = (e.meta && e.meta.serviceRecord) || {};
    const seg = sr.時段 || '';
    const key = `${e.personId}\x00${dateKey(e.timestamp)}\x00${e.scenario}\x00${seg}`;
    let g = groups.get(key);
    if (!g) { g = { events: [], sr }; groups.set(key, g); }
    g.events.push(e);
  }

  const rows = [];
  for (const g of groups.values()) {
    const times = g.events.map(e => e.timestamp);
    const minTs = Math.min(...times);
    const maxTs = Math.max(...times);
    const sr = g.sr;
    const person = peopleById.get(g.events[0].personId);
    rows.push({
      活動日期: toMinguoDate(minTs),
      星期: toWeekday(minTs),
      時段: sr.時段 || '',
      服務項目: sr.服務項目 || '',
      活動編號: sr.活動編號 || '',
      活動主題: sr.活動主題 || '',
      餐飲類型: sr.餐飲類型 || '',
      個案編號: person?.meta?.['個案編號'] || '',
      姓名: person?.displayName || '',
      簽到時間: toHHMM(minTs),
      簽退時間: toHHMM(maxTs),
      報到方式: '人工補登',
      是否平台已登錄: '',
      血壓收縮: '',
      血壓舒張: '',
      服務志工: sr.服務志工 || '',
      備註: person?.meta?.['備註'] || '',
      _minTs: minTs,
    });
  }

  rows.sort((a, b) => a._minTs - b._minTs);
  rows.forEach((r, i) => { r.流水號 = i + 1; delete r._minTs; });
  return rows;
}
