import * as store from '../face-store.js';
import { showToast } from '../face-ui.js';

export async function mountPeopleTab(root, db) {
  root.innerHTML = `
    <div class="filter-row">
      <input id="search" placeholder="搜尋姓名 / 備註">
      <select id="filter-named">
        <option value="all">全部</option>
        <option value="unnamed">僅未命名</option>
        <option value="named">僅有姓名</option>
      </select>
      <select id="filter-model">
        <option value="all">所有辨識模型</option>
      </select>
    </div>
    <table class="admin-table">
      <thead><tr>
        <th>快照</th><th>姓名</th><th>最後活動</th><th>辨識模型</th><th>備註</th><th>操作</th>
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
      modelSel.innerHTML = `<option value="all">所有辨識模型</option>` + models.map(m => `<option>${escape(m)}</option>`).join('');
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
        showToast(null, `已儲存：${name || '（未命名）'}`, 'success');
        render();
      });
      tr.querySelector('.btn-delete').addEventListener('click', async () => {
        if (!confirm(`確定刪除「${p.displayName || '未命名'}」？將同時刪除該人員的所有紀錄與快照，無法復原。`)) return;
        await store.deletePersonCascade(db, p.id);
        showToast(null, '已刪除', 'success');
        render();
      });
      tr.querySelector('.btn-merge').addEventListener('click', () => openMergeDialog(p.id));
      tr.querySelector('.btn-split').addEventListener('click', () => openSplitDialog(p.id));
    }
  }

  async function openMergeDialog(fromId) {
    const all = await store.listPeople(db);
    const others = all.filter(p => p.id !== fromId);
    const picks = others.slice(0, 10).map(p => `${p.id.slice(0, 8)} = ${p.displayName || '（未命名）'}`).join('\n');
    const choice = prompt(`輸入要合併到的人員編號前綴：\n${picks}`);
    if (!choice) return;
    const target = all.find(p => p.id.startsWith(choice));
    if (!target) { showToast(null, '找不到該人員', 'error'); return; }
    const tuning = await store.getTuning(db);
    await store.mergePerson(db, fromId, target.id, {
      contaminationGuard: tuning.contaminationGuard,
      vectorsPerPersonCap: tuning.vectorsPerPersonCap,
    });
    showToast(null, `已合併至「${target.displayName || target.id.slice(0, 8)}」`, 'success');
    render();
  }

  async function openSplitDialog(fromId) {
    const events = await store.listEventsByPerson(db, fromId);
    if (events.length < 2) { showToast(null, '紀錄不足，無法拆分', 'error'); return; }
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal">
        <h2>拆分人員 — 勾選要拆出去的紀錄</h2>
        <p>系統會新建一個人員，將勾選的紀錄與其快照轉移過去；原人員的特徵向量保留不動。</p>
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
      if (!ids.length) { showToast(null, '請至少勾選一筆紀錄', 'error'); return; }
      await store.splitPerson(db, fromId, { eventIdsToSplit: ids });
      overlay.remove();
      showToast(null, `已拆分 ${ids.length} 筆紀錄到新人員`, 'success');
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
