import * as store from '../face-store.js';
import { showToast } from '../face-ui.js';

const MODE_LABELS = { checkin: '簽到', alert: '警示' };
const DECISION_LABELS = {
  match: '命中',
  new: '新人',
  fuzzy: '模糊',
  'alert-hit': '警示命中',
};
const SCOPE_LABELS = { global: '全庫', watchlist: '名單' };
const REVIEW_LABELS = { assigned: '已指派', created: '已建檔', ignored: '已忽略' };

export async function mountEventsTab(root, db, { initialPersonId } = {}) {
  let personFilter = initialPersonId || null;
  let personFilterName = null;
  if (personFilter) {
    const p = await store.getPerson(db, personFilter);
    personFilterName = p?.displayName || personFilter.slice(0, 8);
  }

  root.innerHTML = `
    ${personFilter ? `
      <div class="filter-row" style="background: var(--badge-bg-info); padding: 12px 16px; border-radius: 8px;">
        正在查看「${escape(personFilterName)}」的紀錄
        <button class="btn" id="clear-person">取消篩選</button>
      </div>` : ''}
    <div class="filter-row">
      <label>類型 <select id="f-mode">
        <option value="all">全部</option>
        <option value="checkin">簽到</option>
        <option value="alert">警示</option>
      </select></label>
      <label>結果 <select id="f-decision">
        <option value="all">全部</option>
        <option value="match">命中</option>
        <option value="new">新人</option>
        <option value="fuzzy">模糊</option>
        <option value="alert-hit">警示命中</option>
      </select></label>
      <label><input type="checkbox" id="f-needsReview"> 僅未審「模糊」紀錄</label>
      <input id="f-scenario" placeholder="場合名稱">
    </div>
    <table class="admin-table">
      <thead><tr>
        <th>快照</th><th>時間</th><th>場合</th><th>類型</th><th>結果</th><th>人員編號</th><th>相似度</th><th>狀態</th><th>操作</th>
      </tr></thead>
      <tbody id="ev-tbody"></tbody>
    </table>
  `;

  root.querySelector('#clear-person')?.addEventListener('click', () => {
    personFilter = null;
    personFilterName = null;
    // 重新 mount tab 以隱藏 banner
    mountEventsTab(root, db, {});
  });

  async function render() {
    const tbody = root.querySelector('#ev-tbody');
    let events = await store.listEvents(db);
    const mode = root.querySelector('#f-mode').value;
    const dec = root.querySelector('#f-decision').value;
    const onlyPending = root.querySelector('#f-needsReview').checked;
    const scenario = root.querySelector('#f-scenario').value.trim();

    events = events
      .filter(e => !personFilter || e.personId === personFilter)
      .filter(e => mode === 'all' || e.mode === mode)
      .filter(e => dec === 'all' || e.decision === dec)
      .filter(e => !onlyPending || e.needsReview === true)
      .filter(e => !scenario || e.scenario === scenario)
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 200);

    tbody.innerHTML = '';
    for (const e of events) {
      const tr = document.createElement('tr');
      if (e.needsReview) tr.style.background = '#fef3c7';
      const snap = e.snapshotId ? await safeReadSnapshot(e.snapshotId) : null;
      const outcomeLabel = e.needsReview
        ? '待審'
        : (REVIEW_LABELS[e.meta?.reviewOutcome] || '已處理');
      tr.innerHTML = `
        <td>${snap ? `<img class="thumb" src="${URL.createObjectURL(snap)}">` : '—'}</td>
        <td>${new Date(e.timestamp).toLocaleString()}</td>
        <td>${escape(e.scenario)}</td>
        <td>${MODE_LABELS[e.mode] || e.mode}</td>
        <td>${DECISION_LABELS[e.decision] || e.decision}</td>
        <td>${escape((e.personId || '').slice(0, 12))}</td>
        <td>${e.matchSimilarity != null ? e.matchSimilarity.toFixed(3) : '—'} <small>(${SCOPE_LABELS[e.matchScope] || e.matchScope})</small></td>
        <td>${outcomeLabel}</td>
        <td>${e.needsReview ? `
          <button class="btn btn-assign" data-id="${e.id}">指派</button>
          <button class="btn btn-create" data-id="${e.id}">建檔</button>
          <button class="btn btn-ignore" data-id="${e.id}">忽略</button>
        ` : ''}</td>
      `;
      tbody.appendChild(tr);

      if (e.needsReview) {
        tr.querySelector('.btn-assign').addEventListener('click', () => assign(e));
        tr.querySelector('.btn-create').addEventListener('click', () => createNew(e));
        tr.querySelector('.btn-ignore').addEventListener('click', () => ignore(e));
      }
    }
  }

  async function assign(e) {
    const all = await store.listPeople(db);
    const picks = all.slice(0, 30).map(p => `${p.id.slice(0, 8)} = ${p.displayName || '（未命名）'}`).join('\n');
    const choice = prompt(`輸入人員編號前綴將此紀錄指派給該人員：\n${picks}`);
    if (!choice) return;
    const target = all.find(p => p.id.startsWith(choice));
    if (!target) { showToast(null, '找不到該人員', 'error'); return; }
    await store.updateEvent(db, e.id, {
      personId: target.id,
      needsReview: false,
      meta: { ...e.meta, reviewOutcome: 'assigned' },
    });
    render();
  }

  async function createNew(e) {
    if (!confirm('請確認當事人已知悉並同意建檔。')) return;
    const name = prompt('請輸入姓名（可留空）');
    const p = await store.createPerson(db, {
      vectors: [], // MVP 不補 vectors
      modelVersion: e.modelVersion,
      displayName: name?.trim() || null,
    });
    await store.updateEvent(db, e.id, {
      personId: p.id,
      needsReview: false,
      meta: { ...e.meta, reviewOutcome: 'created' },
    });
    render();
  }

  async function ignore(e) {
    await store.updateEvent(db, e.id, {
      needsReview: false,
      meta: { ...e.meta, reviewOutcome: 'ignored' },
    });
    render();
  }

  ['#f-mode', '#f-decision', '#f-needsReview', '#f-scenario'].forEach(sel => {
    root.querySelector(sel).addEventListener('change', render);
  });
  root.querySelector('#f-scenario').addEventListener('input', render);

  await render();
}

async function safeReadSnapshot(id) {
  try { return await store.readSnapshot(id); } catch { return null; }
}

function escape(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
