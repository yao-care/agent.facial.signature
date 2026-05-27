import * as store from '../face-store.js';
import { aggregateServiceRecords, B_TABLE_COLUMNS } from '../report-aggregate.js';

export async function mountReportTab(root, db) {
  root.innerHTML = `
    <div class="filter-row">
      <label>起 <input type="date" id="rpt-from"></label>
      <label>迄 <input type="date" id="rpt-to"></label>
      <input id="rpt-scenario" placeholder="情境編號（留空=全部）">
      <label><input type="checkbox" id="rpt-hide-done"> 隱藏已登錄</label>
    </div>
    <p class="hint">框選「流水號」到「備註」整段複製貼進社會局平台。貼好後勾左側「登錄」，該列變灰、是否平台已登錄填 Y。<strong style="color:var(--color-critical);">紅底</strong>列代表個案編號未填，請先到人員 tab 補。</p>
    <div id="rpt-out"></div>
  `;

  let currentRows = [];

  root.querySelector('#rpt-from').addEventListener('change', render);
  root.querySelector('#rpt-to').addEventListener('change', render);
  root.querySelector('#rpt-scenario').addEventListener('input', render);
  root.querySelector('#rpt-hide-done').addEventListener('change', render);
  // checkbox 在 #rpt-out 內、每次 render 重建；委派在 #rpt-out（此元素本身不被換掉）
  root.querySelector('#rpt-out').addEventListener('change', async (e) => {
    if (!e.target.classList.contains('rpt-done-cb')) return;
    const row = currentRows[Number(e.target.dataset.idx)];
    if (!row) return;
    await store.setRegistered(db, row._key, e.target.checked);
    render().catch(console.error);
  });

  async function render() {
    const events = await store.listEvents(db);
    const people = await store.listPeople(db);
    const peopleById = new Map(people.map(p => [p.id, p]));
    const registered = await store.getRegisteredKeys(db);

    const fromVal = root.querySelector('#rpt-from').value;
    const toVal = root.querySelector('#rpt-to').value;
    const scenario = root.querySelector('#rpt-scenario').value.trim() || null;
    const hideDone = root.querySelector('#rpt-hide-done').checked;
    const dateFrom = fromVal ? new Date(fromVal + 'T00:00:00').getTime() : null;
    const dateTo = toVal ? new Date(toVal + 'T23:59:59.999').getTime() : null;

    let rows = aggregateServiceRecords(events, peopleById, { dateFrom, dateTo, scenarioId: scenario });
    if (hideDone) rows = rows.filter(r => !registered.has(r._key));
    rows.forEach((r, i) => { r.流水號 = i + 1; });
    currentRows = rows;

    const out = root.querySelector('#rpt-out');
    if (rows.length === 0) {
      out.innerHTML = `<p style="color:var(--text-muted);">此範圍沒有報到紀錄。</p>`;
      return;
    }
    out.innerHTML = `
      <table class="admin-table report-table">
        <thead><tr><th>登錄</th>${B_TABLE_COLUMNS.map(c => `<th>${c}</th>`).join('')}</tr></thead>
        <tbody>${rows.map((r, i) => {
          const done = registered.has(r._key);
          const cls = `${done ? 'report-row-done ' : ''}${r['個案編號'] ? '' : 'report-row-warn'}`.trim();
          const trAttr = cls ? ` class="${cls}"` : '';
          const cells = B_TABLE_COLUMNS.map(c =>
            `<td>${escape(c === '是否平台已登錄' ? (done ? 'Y' : '') : (r[c] ?? ''))}</td>`
          ).join('');
          return `<tr${trAttr}><td><input type="checkbox" class="rpt-done-cb" data-idx="${i}" ${done ? 'checked' : ''}></td>${cells}</tr>`;
        }).join('')}</tbody>
      </table>
    `;
  }

  await render();
}

function escape(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
