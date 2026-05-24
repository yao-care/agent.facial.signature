import * as store from '../face-store.js';

export async function mountPeopleTab(root, db) {
  root.innerHTML = `
    <div class="filter-row">
      <input id="search" placeholder="搜尋姓名 / meta">
      <select id="filter-named">
        <option value="all">全部</option>
        <option value="unnamed">僅未命名</option>
        <option value="named">僅有姓名</option>
      </select>
      <select id="filter-model">
        <option value="all">所有模型版本</option>
      </select>
    </div>
    <table class="admin-table">
      <thead><tr>
        <th>快照</th><th>姓名</th><th>最後活動</th><th>模型</th><th>meta</th><th>操作</th>
      </tr></thead>
      <tbody id="people-tbody"></tbody>
    </table>
  `;

  async function render() {
    const tbody = root.querySelector('#people-tbody');
    const all = await store.listPeople(db);
    const events = await store.listEvents(db);
    const lastEvent = new Map();
    for (const e of events) {
      const prev = lastEvent.get(e.personId);
      if (!prev || e.timestamp > prev.timestamp) lastEvent.set(e.personId, e);
    }
    const filter = root.querySelector('#filter-named').value;
    const search = root.querySelector('#search').value.trim().toLowerCase();

    // populate model filter
    const modelSel = root.querySelector('#filter-model');
    const models = [...new Set(all.map(p => p.modelVersion))];
    if (modelSel.options.length - 1 !== models.length) {
      modelSel.innerHTML = `<option value="all">所有模型版本</option>` + models.map(m => `<option>${escape(m)}</option>`).join('');
    }
    const modelFilter = modelSel.value;

    const rows = all
      .filter(p => filter === 'all' || (filter === 'unnamed' ? !p.displayName : !!p.displayName))
      .filter(p => modelFilter === 'all' || p.modelVersion === modelFilter)
      .filter(p => !search ||
        (p.displayName || '').toLowerCase().includes(search) ||
        JSON.stringify(p.meta).toLowerCase().includes(search))
      .sort((a, b) => (lastEvent.get(b.id)?.timestamp || 0) - (lastEvent.get(a.id)?.timestamp || 0));

    tbody.innerHTML = '';
    for (const p of rows) {
      const tr = document.createElement('tr');
      const last = lastEvent.get(p.id);
      const snapBlob = last?.snapshotId ? await safeReadSnapshot(last.snapshotId) : null;
      const thumb = snapBlob ? `<img class="thumb" src="${URL.createObjectURL(snapBlob)}">` : '—';
      tr.innerHTML = `
        <td>${thumb}</td>
        <td><input class="name-input" value="${escape(p.displayName || '')}" placeholder="（未命名）"></td>
        <td>${last ? new Date(last.timestamp).toLocaleString() : '—'}</td>
        <td>${escape(p.modelVersion)}</td>
        <td><code>${escape(JSON.stringify(p.meta || {}))}</code></td>
        <td>
          <button class="btn btn-save" data-id="${p.id}">儲存</button>
          <button class="btn btn-merge" data-id="${p.id}">合併到…</button>
          <button class="btn btn-split" data-id="${p.id}">拆分</button>
          <button class="btn btn-danger btn-delete" data-id="${p.id}">刪除</button>
        </td>
      `;
      tbody.appendChild(tr);

      tr.querySelector('.btn-save').addEventListener('click', async () => {
        const name = tr.querySelector('.name-input').value.trim() || null;
        await store.updatePerson(db, p.id, { displayName: name });
        render();
      });
      tr.querySelector('.btn-delete').addEventListener('click', async () => {
        if (!confirm(`刪除「${p.displayName || '未命名'}」？此操作將刪除該人所有 events 與 snapshots。`)) return;
        await store.deletePersonCascade(db, p.id);
        render();
      });
      tr.querySelector('.btn-merge').addEventListener('click', () => openMergeDialog(p.id));
      tr.querySelector('.btn-split').addEventListener('click', () => openSplitDialog(p.id));
    }
  }

  async function openMergeDialog(fromId) {
    const all = await store.listPeople(db);
    const others = all.filter(p => p.id !== fromId);
    const choice = prompt(`輸入要合併到的 person id（可選: ${others.slice(0, 10).map(p => `${p.id.slice(0, 8)}=${p.displayName || '?'}`).join(', ')}...）`);
    if (!choice) return;
    const target = all.find(p => p.id.startsWith(choice));
    if (!target) { alert('找不到 target'); return; }
    const tuning = await store.getTuning(db);
    await store.mergePerson(db, fromId, target.id, {
      contaminationGuard: tuning.contaminationGuard,
      vectorsPerPersonCap: tuning.vectorsPerPersonCap,
    });
    render();
  }

  async function openSplitDialog(fromId) {
    const events = await store.listEventsByPerson(db, fromId);
    if (events.length < 2) { alert('events 不足，無法拆分'); return; }
    // 簡化 UI: 列出 events 讓使用者勾選
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal">
        <h2>拆分 — 勾選要拆出去的 events</h2>
        <p>新建 person B 將接收這些 events（與其 snapshot 所有權）。A 的 vectors 保留。</p>
        <ul id="split-list">${events.map(e => `
          <li><label><input type="checkbox" value="${e.id}"> ${new Date(e.timestamp).toLocaleString()} — ${escape(e.scenario)}</label></li>
        `).join('')}</ul>
        <div class="consent-actions">
          <button class="btn split-cancel">取消</button>
          <button class="btn btn-primary split-ok">確認拆分</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('.split-cancel').addEventListener('click', () => overlay.remove());
    overlay.querySelector('.split-ok').addEventListener('click', async () => {
      const ids = [...overlay.querySelectorAll('input[type=checkbox]:checked')].map(c => c.value);
      if (!ids.length) { alert('請至少勾選一個'); return; }
      await store.splitPerson(db, fromId, { eventIdsToSplit: ids });
      overlay.remove();
      render();
    });
  }

  root.querySelector('#search').addEventListener('input', render);
  root.querySelector('#filter-named').addEventListener('change', render);
  root.querySelector('#filter-model').addEventListener('change', render);

  await render();
}

async function safeReadSnapshot(id) {
  try { return await store.readSnapshot(id); } catch { return null; }
}

function escape(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
