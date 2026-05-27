// schedule-resolve.js — 純函式：報到時依時間解析排程 + 編輯畫面 agenda 排版（無 DB/DOM）

const WD_CHAR = ['日', '一', '二', '三', '四', '五', '六'];
const MON_FIRST = [1, 2, 3, 4, 5, 6, 0]; // 週一→週日

function pad2(n) { return String(n).padStart(2, '0'); }
function hhmm(d) { return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; }
function localDateStr(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }

function pickFields(r) {
  return {
    時段: r.時段 || '', 服務項目: r.服務項目 || '', 活動編號: r.活動編號 || '',
    活動主題: r.活動主題 || '', 餐飲類型: r.餐飲類型 || '', 服務志工: r.服務志工 || '',
  };
}

// 報到時間 → serviceRecord（命中規則）或 {}（無規則）。特定日期優先於星期。
export function resolveServiceRecord(schedule, ts) {
  if (!schedule) return {};
  const d = new Date(ts);
  const T = hhmm(d);
  const wd = d.getDay();
  const dateStr = localDateStr(d);
  const inRange = r => (r.start || '') <= T && T < (r.end || '');
  const sp = (schedule.specific || []).filter(r => r.date === dateStr && inRange(r));
  if (sp.length) return pickFields(sp[0]);
  const wk = (schedule.weekly || []).filter(r => r.weekday === wd && inRange(r));
  if (wk.length) return pickFields(wk[0]);
  return {};
}

// 排程 + 今天 → { days:[7列 週一→週日], future:[本週窗之後的特定日期] }
export function buildScheduleAgenda(schedule, today) {
  const t0 = new Date(today);
  t0.setHours(0, 0, 0, 0);
  const dateByWeekday = {};
  for (let off = 0; off < 7; off++) {
    const d = new Date(t0);
    d.setDate(t0.getDate() + off);
    dateByWeekday[d.getDay()] = d;
  }
  const todayStr = localDateStr(t0);
  const lastWin = new Date(t0);
  lastWin.setDate(t0.getDate() + 6);
  const lastWinStr = localDateStr(lastWin);

  const weekly = schedule?.weekly || [];
  const specific = schedule?.specific || [];

  const days = MON_FIRST.map(wd => {
    const d = dateByWeekday[wd];
    const dateStr = localDateStr(d);
    const rules = [
      ...weekly.filter(r => r.weekday === wd).map(r => ({ ...r, isSpecific: false })),
      ...specific.filter(r => r.date === dateStr).map(r => ({ ...r, isSpecific: true })),
    ].sort((a, b) => (a.start || '').localeCompare(b.start || ''));
    return {
      weekday: wd,
      date: dateStr,
      label: `${d.getMonth() + 1}/${d.getDate()} (${WD_CHAR[wd]})`,
      isToday: dateStr === todayStr,
      rules,
    };
  });

  const future = specific
    .filter(r => r.date > lastWinStr)
    .sort((a, b) => (a.date || '').localeCompare(b.date || ''));

  return { days, future };
}
