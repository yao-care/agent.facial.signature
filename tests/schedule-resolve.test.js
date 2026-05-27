import { describe, it, expect } from 'vitest';
import { resolveServiceRecord, buildScheduleAgenda } from '../shared/schedule-resolve.js';

const schedule = {
  weekly: [
    { weekday: 1, start: '09:00', end: '11:00', 時段: '上午', 服務項目: '健康促進', 活動編號: 'HP-1', 活動主題: '匹克球', 餐飲類型: '', 服務志工: '王' },
    { weekday: 3, start: '14:00', end: '16:00', 時段: '下午', 服務項目: '電話問安', 活動編號: '', 活動主題: '', 餐飲類型: '', 服務志工: '' },
  ],
  specific: [
    { date: '2026-05-30', start: '10:00', end: '11:30', 時段: '上午', 服務項目: '關懷訪視', 活動編號: '', 活動主題: '局長視察', 餐飲類型: '', 服務志工: '' },
    { date: '2026-06-15', start: '09:00', end: '10:00', 時段: '上午', 服務項目: '健康促進', 活動編號: 'HP-2', 活動主題: '衛教', 餐飲類型: '', 服務志工: '' },
  ],
};
const at = (y, mo, da, h, mi) => new Date(y, mo - 1, da, h, mi).getTime();

describe('resolveServiceRecord', () => {
  it('星期規則命中（2026-05-27 週三 14:30 → 電話問安）', () => {
    expect(resolveServiceRecord(schedule, at(2026,5,27,14,30)).服務項目).toBe('電話問安');
  });
  it('特定日期優先於星期（2026-05-30 10:30 → 局長視察）', () => {
    const sr = resolveServiceRecord(schedule, at(2026,5,30,10,30));
    expect(sr.活動主題).toBe('局長視察');
    expect(sr.服務項目).toBe('關懷訪視');
  });
  it('時間在所有區間外 → {}', () => {
    expect(resolveServiceRecord(schedule, at(2026,5,27,8,0))).toEqual({});
  });
  it('該星期無規則 → {}（2026-05-26 週二）', () => {
    expect(resolveServiceRecord(schedule, at(2026,5,26,10,0))).toEqual({});
  });
  it('schedule 為 null → {}', () => {
    expect(resolveServiceRecord(null, at(2026,5,27,10,0))).toEqual({});
  });
});

describe('buildScheduleAgenda', () => {
  const today = new Date(2026, 4, 27); // 2026-05-27 週三

  it('七列、週一→週日順序、label 格式、今天標記', () => {
    const { days } = buildScheduleAgenda(schedule, today);
    expect(days).toHaveLength(7);
    expect(days.map(d => d.weekday)).toEqual([1,2,3,4,5,6,0]);
    expect(days[0].label).toBe('6/1 (一)');
    expect(days[2].weekday).toBe(3);
    expect(days[2].isToday).toBe(true);
    expect(days[2].label).toBe('5/27 (三)');
  });
  it('星期規則落在對應日（週一含健促，isSpecific=false）', () => {
    const { days } = buildScheduleAgenda(schedule, today);
    expect(days[0].rules.map(r => r.服務項目)).toContain('健康促進');
    expect(days[0].rules[0].isSpecific).toBe(false);
  });
  it('本週特定日期插入對應週幾（5/30 → 週六列 days[5]，isSpecific=true）', () => {
    const { days } = buildScheduleAgenda(schedule, today);
    expect(days[5].weekday).toBe(6);
    expect(days[5].rules.some(r => r.isSpecific && r.活動主題 === '局長視察')).toBe(true);
  });
  it('未來特定日期收進 future（6/15）', () => {
    expect(buildScheduleAgenda(schedule, today).future.map(r => r.date)).toEqual(['2026-06-15']);
  });
  it('同一天依 start 由小到大排序', () => {
    const s2 = { weekly: [
      { weekday: 3, start: '14:00', end: '15:00', 服務項目: 'B' },
      { weekday: 3, start: '09:00', end: '10:00', 服務項目: 'A' },
    ], specific: [] };
    expect(buildScheduleAgenda(s2, today).days[2].rules.map(r => r.服務項目)).toEqual(['A','B']);
  });
});
