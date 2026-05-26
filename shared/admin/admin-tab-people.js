import * as store from '../face-store.js';
import { showToast } from '../face-ui.js';

// 身份分類（人員 meta 中的「身份」欄位選項）。「警示名單」只放需要
// 警示音效的危險類型（高風險走失 / 失智長者 / 黑名單）；身份僅
// 用來標記，影響畫面顏色但不觸發警示音效。
const IDENTITY_OPTIONS = [
  { value: '',        label: '（未設定）',  tone: 'neutral' },
  { value: '長者',     label: '長者 / 居民', tone: 'neutral' },
  { value: '家屬',     label: '家屬',         tone: 'pink' },
  { value: '員工',     label: '員工',         tone: 'info' },
  { value: '志工',     label: '志工',         tone: 'pass' },
  { value: '重要訪客', label: '重要訪客',     tone: 'purple' },
  { value: '訪客',     label: '一般訪客',     tone: 'neutral' },
];
const IDENTITY_TONE = Object.fromEntries(IDENTITY_OPTIONS.map(o => [o.value, o.tone]));

export async function mountPeopleTab(root, db, { onViewEvents } = {}) {
  // 模型版本只在 v1/v2 過渡期才有用；多版本時才顯示 filter
  const allPeopleForCheck = await store.listPeople(db);
  const distinctModels = [...new Set(allPeopleForCheck.map(p => p.modelVersion))];
  const showModelFilter = distinctModels.length > 1;

  root.innerHTML = `
    <div class="filter-row">
      <input id="search" placeholder="搜尋姓名 / 備註">
      <select id="filter-named">
        <option value="all">全部</option>
        <option value="unnamed">僅未命名</option>
        <option value="named">僅有姓名</option>
      </select>
      ${showModelFilter ? `
        <select id="filter-model">
          <option value="all">所有辨識模型</option>
          ${distinctModels.map(m => `<option>${escape(m)}</option>`).join('')}
        </select>
      ` : ''}
    </div>
    <table class="admin-table">
      <thead><tr>
        <th>快照</th><th>姓名</th><th>近 3 日簽到</th><th>最後簽到</th><th>備註</th><th class="col-actions">操作</th>
      </tr></thead>
      <tbody id="people-tbody"></tbody>
    </table>
  `;

  function dayStart(offsetDays = 0) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - offsetDays);
    return d.getTime();
  }
  // 近 3 日的日界（今/昨/前），對應 MM/DD 標籤
  const dayBuckets = [0, 1, 2].map(offset => {
    const startOfDay = dayStart(offset);
    const endOfDay = dayStart(offset - 1);
    const d = new Date(startOfDay);
    return {
      start: startOfDay,
      end: endOfDay,
      label: `${d.getMonth() + 1}/${d.getDate()}`,
    };
  });

  async function render() {
    const tbody = root.querySelector('#people-tbody');
    const all = await store.listPeople(db);
    const events = await store.listEvents(db);
    const lastEvent = new Map();
    const dailyByPerson = new Map(); // personId -> [count_today, count_yest, count_prev]
    for (const e of events) {
      if (!e.personId) continue;
      const prev = lastEvent.get(e.personId);
      if (!prev || e.timestamp > prev.timestamp) lastEvent.set(e.personId, e);
      let counts = dailyByPerson.get(e.personId);
      if (!counts) { counts = [0, 0, 0]; dailyByPerson.set(e.personId, counts); }
      for (let i = 0; i < dayBuckets.length; i++) {
        if (e.timestamp >= dayBuckets[i].start && e.timestamp < dayBuckets[i].end) {
          counts[i]++;
          break;
        }
      }
    }
    const filter = root.querySelector('#filter-named').value;
    const search = root.querySelector('#search').value.trim().toLowerCase();
    const modelFilter = root.querySelector('#filter-model')?.value || 'all';

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
      const counts = dailyByPerson.get(p.id) || [0, 0, 0];
      const dailyLines = dayBuckets
        .map((b, i) => counts[i] > 0 ? `<div>${b.label} <strong>${counts[i]}</strong> 次</div>` : null)
        .filter(Boolean)
        .join('');
      const dailyCell = dailyLines
        ? `<button class="btn btn-count" data-id="${p.id}" title="點擊查看完整紀錄">${dailyLines}</button>`
        : '<span style="color:var(--text-muted);">—</span>';
      const metaPreview = renderMeta(p.meta);
      const identity = (p.meta || {})['身份'];
      const identityBadge = identity
        ? `<span class="identity-badge tone-${IDENTITY_TONE[identity] || 'neutral'}">${escape(identity)}</span>`
        : '';
      tr.innerHTML = `
        <td>${thumb}</td>
        <td>
          <input class="name-input" value="${escape(p.displayName || '')}" placeholder="（未命名）">
          ${identityBadge}
        </td>
        <td>${dailyCell}</td>
        <td>${last ? formatRelative(last.timestamp) : '—'}</td>
        <td><button class="btn btn-sm btn-edit-meta" data-id="${p.id}">${metaPreview}</button></td>
        <td class="col-actions">
          <div class="action-buttons">
            <button class="btn btn-sm btn-save" data-id="${p.id}">儲存</button>
            <button class="btn btn-sm btn-merge" data-id="${p.id}">合併</button>
            <button class="btn btn-sm btn-split" data-id="${p.id}">拆分</button>
            <button class="btn btn-sm btn-danger btn-delete" data-id="${p.id}">刪除</button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);

      tr.querySelector('.btn-count')?.addEventListener('click', () => {
        if (onViewEvents) onViewEvents(p.id);
      });
      tr.querySelector('.btn-edit-meta').addEventListener('click', () => openMetaEditor(p));
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

  function openMetaEditor(p) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    const meta = p.meta || {};
    const currentIdentity = meta['身份'] || '';
    // 排除身份這個 key 從一般 key-value rows（會單獨用下拉處理）
    const otherEntries = Object.entries(meta).filter(([k]) => !['身份', '個案編號', '平台個案ID'].includes(k));
    overlay.innerHTML = `
      <div class="modal meta-modal">
        <h2>編輯「${escape(p.displayName || '未命名')}」的備註</h2>

        <div class="identity-block">
          <label class="identity-label">身份分類</label>
          <select class="identity-select" id="identity-select">
            ${IDENTITY_OPTIONS.map(o =>
              `<option value="${escape(o.value)}" ${o.value === currentIdentity ? 'selected' : ''}>${escape(o.label)}</option>`
            ).join('')}
          </select>
          <p class="hint">識別到時會用此身份的顏色標記。危險類型（高風險走失、失智長者、黑名單）請在「警示名單」tab 設定，那裡會觸發警示音效。</p>
        </div>

        <div class="identity-block">
          <label class="identity-label">社會局連結欄位</label>
          <div class="field-row">
            <label>個案編號</label>
            <input type="text" class="link-case-no" value="${escape(meta['個案編號'] || '')}" placeholder="自編，例 A001">
          </div>
          <div class="field-row">
            <label>平台個案 ID</label>
            <input type="text" class="link-platform-id" value="${escape(meta['平台個案ID'] || '')}" placeholder="平台建檔後抄回">
          </div>
          <p class="hint">個案編號是 B 表對應社會局個案的 key，建議務必填寫。</p>
        </div>

        <h3 style="margin-top:24px;">其他備註</h3>
        <p class="hint">電話、關係、緊急聯絡人、地址、生日… 等自由欄位。</p>
        <datalist id="meta-keys">
          <option value="電話"><option value="關係"><option value="緊急聯絡人">
          <option value="地址"><option value="生日"><option value="備註">
        </datalist>
        <div class="meta-rows" id="meta-rows">
          ${otherEntries.length === 0 ? renderMetaRow('', '') : otherEntries.map(([k, v]) => renderMetaRow(k, v)).join('')}
        </div>
        <button class="btn meta-add" id="meta-add">+ 新增一欄</button>
        <div class="consent-actions">
          <button class="btn meta-cancel">取消</button>
          <button class="btn btn-primary meta-save">儲存</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    const rowsEl = overlay.querySelector('#meta-rows');
    const wireRemove = (btn) => btn.addEventListener('click', () => btn.closest('.meta-row').remove());
    overlay.querySelectorAll('.meta-remove').forEach(wireRemove);
    overlay.querySelector('#meta-add').addEventListener('click', () => {
      const div = document.createElement('div');
      div.innerHTML = renderMetaRow('', '');
      const row = div.firstElementChild;
      rowsEl.appendChild(row);
      wireRemove(row.querySelector('.meta-remove'));
      row.querySelector('.meta-key').focus();
    });
    overlay.querySelector('.meta-cancel').addEventListener('click', () => overlay.remove());
    overlay.querySelector('.meta-save').addEventListener('click', async () => {
      const next = {};
      // 身份單獨從下拉抓
      const identity = overlay.querySelector('#identity-select').value;
      if (identity) next['身份'] = identity;
      const caseNo = overlay.querySelector('.link-case-no').value.trim();
      const platformId = overlay.querySelector('.link-platform-id').value.trim();
      if (caseNo) next['個案編號'] = caseNo;
      if (platformId) next['平台個案ID'] = platformId;
      // 其他 key-value rows
      rowsEl.querySelectorAll('.meta-row').forEach(row => {
        const k = row.querySelector('.meta-key').value.trim();
        const v = row.querySelector('.meta-val').value.trim();
        if (k && !['身份', '個案編號', '平台個案ID'].includes(k)) next[k] = v;
      });
      // 直接覆寫（繞過 updatePerson 的 merge），讓刪 key 真的刪掉
      const tx = db.transaction('people', 'readwrite');
      const fresh = await tx.store.get(p.id);
      fresh.meta = next;
      fresh.updatedAt = Date.now();
      await tx.store.put(fresh);
      await tx.done;
      overlay.remove();
      showToast(null, `已更新 ${p.displayName || '此人員'} 的備註`, 'success');
      render();
    });
  }

  function renderMetaRow(k, v) {
    const val = Array.isArray(v) ? v.join('、') : String(v ?? '');
    return `
      <div class="meta-row">
        <input class="meta-key" list="meta-keys" placeholder="欄位名（如：電話）" value="${escape(k)}">
        <input class="meta-val" placeholder="內容" value="${escape(val)}">
        <button type="button" class="meta-remove" aria-label="移除">×</button>
      </div>
    `;
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
  root.querySelector('#filter-model')?.addEventListener('change', render);

  await render();
}

async function safeReadSnapshot(id) {
  try { return await store.readSnapshot(id); } catch { return null; }
}

function escape(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

function renderMeta(meta) {
  if (!meta || typeof meta !== 'object') return '<span style="color:var(--text-muted);">—</span>';
  const keys = Object.keys(meta);
  if (keys.length === 0) return '<span style="color:var(--text-muted);">—</span>';
  return keys.map(k => {
    const v = meta[k];
    const display = Array.isArray(v) ? v.join('、') : (v == null ? '' : String(v));
    return `<div><strong>${escape(k)}：</strong>${escape(display)}</div>`;
  }).join('');
}

function formatRelative(ts) {
  const now = Date.now();
  const diff = now - ts;
  const min = 60_000, hr = 60 * min, day = 24 * hr;
  if (diff < min) return '剛剛';
  if (diff < hr) return `${Math.floor(diff / min)} 分鐘前`;
  if (diff < day) return `${Math.floor(diff / hr)} 小時前`;
  if (diff < 7 * day) return `${Math.floor(diff / day)} 天前`;
  return new Date(ts).toLocaleDateString();
}
