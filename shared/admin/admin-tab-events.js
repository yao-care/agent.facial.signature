import * as store from '../face-store.js';

export async function mountEventsTab(root, db) {
  root.innerHTML = `
    <div class="filter-row">
      <label>mode <select id="f-mode"><option value="all">全部</option><option>checkin</option><option>alert</option></select></label>
      <label>decision <select id="f-decision"><option value="all">全部</option><option>match</option><option>new</option><option>fuzzy</option><option>alert-hit</option></select></label>
      <label><input type="checkbox" id="f-needsReview"> 僅未審 fuzzy</label>
      <input id="f-scenario" placeholder="scenario">
    </div>
    <table class="admin-table">
      <thead><tr>
        <th>快照</th><th>時間</th><th>場合</th><th>mode</th><th>decision</th><th>personId</th><th>similarity</th><th>狀態</th><th>操作</th>
      </tr></thead>
      <tbody id="ev-tbody"></tbody>
    </table>
  `;

  async function render() {
    const tbody = root.querySelector('#ev-tbody');
    let events = await store.listEvents(db);
    const mode = root.querySelector('#f-mode').value;
    const dec = root.querySelector('#f-decision').value;
    const onlyPending = root.querySelector('#f-needsReview').checked;
    const scenario = root.querySelector('#f-scenario').value.trim();

    events = events
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
      tr.innerHTML = `
        <td>${snap ? `<img class="thumb" src="${URL.createObjectURL(snap)}">` : '—'}</td>
        <td>${new Date(e.timestamp).toLocaleString()}</td>
        <td>${escape(e.scenario)}</td>
        <td>${e.mode}</td>
        <td>${e.decision}</td>
        <td>${escape((e.personId || '').slice(0, 12))}</td>
        <td>${e.matchSimilarity != null ? e.matchSimilarity.toFixed(3) : '—'} <small>(${e.matchScope})</small></td>
        <td>${e.needsReview ? '待審' : (e.meta?.reviewOutcome || '已處理')}</td>
        <td>${e.needsReview ? `
          <button class="btn btn-assign" data-id="${e.id}">指派</button>
          <button class="btn btn-create" data-id="${e.id}">建新人</button>
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
    const picks = all.slice(0, 30).map(p => `${p.id.slice(0, 8)}=${p.displayName || '?'}`).join('\n');
    const choice = prompt(`輸入 person id 前綴指派此 event：\n${picks}`);
    if (!choice) return;
    const target = all.find(p => p.id.startsWith(choice));
    if (!target) { alert('找不到'); return; }
    await store.updateEvent(db, e.id, {
      personId: target.id,
      needsReview: false,
      meta: { ...e.meta, reviewOutcome: 'assigned' },
    });
    render();
  }

  async function createNew(e) {
    if (!confirm('請確認當事人已知悉並同意建檔。')) return;
    const name = prompt('輸入 displayName（可留空）');
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
