import { describe, it, expect } from 'vitest';
import {
  aggregateServiceRecords, toMinguoDate, toWeekday, toHHMM, B_TABLE_COLUMNS,
} from '../shared/report-aggregate.js';

// 2026-05-26 09:00 與 11:00（同人同日同情境同時段）
const day = (h, m = 0) => new Date(2026, 4, 26, h, m).getTime();

function ev(personId, ts, period, extra = {}) {
  return {
    id: 't' + ts, personId, mode: 'checkin', decision: 'match',
    scenario: 'example-checkin', timestamp: ts,
    meta: { serviceRecord: { 服務項目: '健康促進', 時段: period, 活動編號: 'HP-1', 活動主題: '匹克球', 餐飲類型: '', 服務志工: '王' } },
    ...extra,
  };
}

const people = new Map([
  ['p1', { id: 'p1', displayName: '張三', meta: { 個案編號: 'A001', 備註: '行動不便' } }],
]);

describe('format helpers', () => {
  it('民國年日期', () => { expect(toMinguoDate(day(9))).toBe('115/05/26'); });
  it('中文星期', () => { expect(toWeekday(day(9))).toBe('週二'); }); // 2026-05-26 是週二
  it('hh:mm', () => { expect(toHHMM(day(9, 5))).toBe('09:05'); });
});

describe('aggregateServiceRecords', () => {
  it('同人同日同時段多筆 → 一列，簽到=min 簽退=max', () => {
    const rows = aggregateServiceRecords([ev('p1', day(11), '上午'), ev('p1', day(9), '上午')], people);
    expect(rows).toHaveLength(1);
    expect(rows[0].簽到時間).toBe('09:00');
    expect(rows[0].簽退時間).toBe('11:00');
    expect(rows[0].個案編號).toBe('A001');
    expect(rows[0].姓名).toBe('張三');
    expect(rows[0].備註).toBe('行動不便');
    expect(rows[0].報到方式).toBe('人工補登');
    expect(rows[0].流水號).toBe(1);
  });

  it('同人同日上午/下午 → 拆兩列（時段入分組 key）', () => {
    const rows = aggregateServiceRecords([ev('p1', day(9), '上午'), ev('p1', day(14), '下午')], people);
    expect(rows).toHaveLength(2);
    expect(rows.map(r => r.時段).sort()).toEqual(['上午', '下午']);
  });

  it('排除 personId=null 與 mode=alert', () => {
    const rows = aggregateServiceRecords([
      ev('p1', day(9), '上午'),
      { ...ev('p1', day(10), '上午'), personId: null },
      { ...ev('p1', day(10), '上午'), mode: 'alert' },
    ], people);
    expect(rows).toHaveLength(1);
  });

  it('依日期/情境/scenarioId 篩選', () => {
    const rows = aggregateServiceRecords(
      [ev('p1', day(9), '上午')],
      people,
      { scenarioId: 'other' }
    );
    expect(rows).toHaveLength(0);
  });

  it('B_TABLE_COLUMNS 含 18 欄、流水號在最前', () => {
    expect(B_TABLE_COLUMNS.length).toBe(18);
    expect(B_TABLE_COLUMNS[0]).toBe('流水號');
  });

  it('personId 不在 peopleById → 姓名/個案編號留空', () => {
    const rows = aggregateServiceRecords([ev('p_unknown', day(9), '上午')], people);
    expect(rows).toHaveLength(1);
    expect(rows[0].姓名).toBe('');
    expect(rows[0].個案編號).toBe('');
    expect(rows[0].流水號).toBe(1);
  });

  it('每列帶 _key 字串（含 personId）', () => {
    const rows = aggregateServiceRecords([ev('p1', day(9), '上午')], people);
    expect(typeof rows[0]._key).toBe('string');
    expect(rows[0]._key).toContain('p1');
  });
  it('不同時段 → _key 不同', () => {
    const rows = aggregateServiceRecords([ev('p1', day(9), '上午'), ev('p1', day(14), '下午')], people);
    expect(rows[0]._key).not.toBe(rows[1]._key);
  });
});
