import * as store from '../face-store.js';
import { aggregateServiceRecords, B_TABLE_COLUMNS } from '../report-aggregate.js';

export async function mountReportTab(root, db) {
  root.innerHTML = `
    <div class="filter-row">
      <label>起 <input type="date" id="rpt-from"></label>
      <label>迄 <input type="date" id="rpt-to"></label>
      <input id="rpt-scenario" placeholder="情境編號（留空=全部）">
    </div>
    <p class="hint">框選整張表格即可複製貼進社會局平台。<strong style="color:var(--color-critical);">紅底</strong>列代表個案編號未填、貼回平台無法對應，請先到人員 tab 補。</p>
    <div id="rpt-out"></div>
  `;

  // 篩選欄位改動即時更新（不需按鈕）：date 用 change、文字用 input
  root.querySelector('#rpt-from').addEventListener('change', render);
  root.querySelector('#rpt-to').addEventListener('change', render);
  root.querySelector('#rpt-scenario').addEventListener('input', render);

  async function render() {
    const events = await store.listEvents(db);
    const people = await store.listPeople(db);
    const peopleById = new Map(people.map(p => [p.id, p]));

    const fromVal = root.querySelector('#rpt-from').value;
    const toVal = root.querySelector('#rpt-to').value;
    const scenario = root.querySelector('#rpt-scenario').value.trim() || null;
    // date input 為當地日期；迄日含整天 → 用 23:59:59.999
    const dateFrom = fromVal ? new Date(fromVal + 'T00:00:00').getTime() : null;
    const dateTo = toVal ? new Date(toVal + 'T23:59:59.999').getTime() : null;

    const rows = aggregateServiceRecords(events, peopleById, { dateFrom, dateTo, scenarioId: scenario });
    const out = root.querySelector('#rpt-out');
    if (rows.length === 0) {
      out.innerHTML = `<p style="color:var(--text-muted);">此範圍沒有報到紀錄。</p>`;
      return;
    }
    out.innerHTML = `
      <table class="admin-table report-table">
        <thead><tr>${B_TABLE_COLUMNS.map(c => `<th>${c}</th>`).join('')}</tr></thead>
        <tbody>${rows.map(r => `
          <tr${r['個案編號'] ? '' : ' style="background:var(--badge-bg-warn);"'}>
            ${B_TABLE_COLUMNS.map(c => `<td>${escape(r[c] ?? '')}</td>`).join('')}
          </tr>`).join('')}</tbody>
      </table>
    `;
  }

  await render();
}

function escape(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
