import * as store from '../face-store.js';
import { showToast } from '../face-ui.js';

// 常用名單預設 — 編號（內部用）與顯示名稱
const WATCHLIST_PRESETS = [
  { id: 'highrisk',   name: '高風險走失' },
  { id: 'demented',   name: '失智長者' },
  { id: 'banned',     name: '黑名單' },
  { id: 'vip',        name: '重要訪客' },
  { id: 'staff',      name: '員工' },
  { id: 'volunteer',  name: '志工' },
  { id: 'family',     name: '家屬' },
  { id: 'custom',     name: '自訂…' },
];

export async function mountWatchlistsTab(root, db) {
  root.innerHTML = `
    <div class="new-list-form">
      <label>名單類型
        <select id="new-preset">
          ${WATCHLIST_PRESETS.map(p => `<option value="${p.id}">${escape(p.name)}（${escape(p.id)}）</option>`).join('')}
        </select>
      </label>
      <label class="custom-id-wrap" hidden>名單編號
        <input id="new-id" placeholder="英數字元，例如 evening">
      </label>
      <label>顯示名稱
        <input id="new-name" placeholder="（可空白，預設用名單類型名稱）">
      </label>
      <button class="btn btn-primary" id="new-btn">建立新名單</button>
    </div>
    <div id="lists"></div>
  `;

  const presetSel = root.querySelector('#new-preset');
  const customWrap = root.querySelector('.custom-id-wrap');
  const idInput = root.querySelector('#new-id');
  const nameInput = root.querySelector('#new-name');

  function applyPreset() {
    const presetId = presetSel.value;
    if (presetId === 'custom') {
      customWrap.hidden = false;
      nameInput.placeholder = '請輸入名稱';
    } else {
      customWrap.hidden = true;
      const preset = WATCHLIST_PRESETS.find(p => p.id === presetId);
      nameInput.placeholder = preset?.name || '';
    }
  }
  presetSel.addEventListener('change', applyPreset);
  applyPreset();

  root.querySelector('#new-btn').addEventListener('click', async () => {
    const presetId = presetSel.value;
    let id, defaultName;
    if (presetId === 'custom') {
      id = idInput.value.trim();
      if (!id) { showToast(null, '請輸入自訂名單編號', 'error'); return; }
      if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
        showToast(null, '名單編號只能用英數、底線或連字號', 'error');
        return;
      }
      defaultName = id;
    } else {
      id = presetId;
      const preset = WATCHLIST_PRESETS.find(p => p.id === presetId);
      defaultName = preset.name;
    }
    // 檢查重複
    if (await store.getWatchlist(db, id)) {
      showToast(null, `名單「${id}」已存在`, 'error');
      return;
    }
    const name = nameInput.value.trim() || defaultName;
    await store.createWatchlist(db, { id, name });
    idInput.value = '';
    nameInput.value = '';
    showToast(null, `已建立名單「${name}」`, 'success');
    render();
  });

  async function render() {
    const lists = await store.listWatchlists(db);
    const allPeople = await store.listPeople(db);
    const peopleById = new Map(allPeople.map(p => [p.id, p]));
    const container = root.querySelector('#lists');
    container.innerHTML = '';
    for (const wl of lists) {
      const card = document.createElement('div');
      card.className = 'modal';
      card.style.margin = '12px 0';
      // 候選名單：所有人員減去已在名單上的
      const candidates = allPeople.filter(p => !wl.personIds.includes(p.id));
      const candidateOptions = candidates.length === 0
        ? `<option value="">（所有人員都已在名單上）</option>`
        : candidates.map(p =>
            `<option value="${p.id}">${escape(p.displayName || '（未命名 ' + p.id.slice(0, 6) + '）')}</option>`
          ).join('');

      card.innerHTML = `
        <h3>${escape(wl.name)} <small style="color:var(--text-muted);">（編號 ${escape(wl.id)}）</small>
          <button class="btn btn-danger" data-action="del">刪除名單</button></h3>
        <p>目前共 ${wl.personIds.length} 人</p>
        <ul class="member-list">${wl.personIds.map(pid => `
          <li>${escape(peopleById.get(pid)?.displayName || '（未命名 ' + pid.slice(0, 6) + '）')}
            <button class="btn btn-sm" data-remove="${pid}">移出</button></li>
        `).join('')}</ul>
        <div class="add-member-row">
          <select class="add-select" ${candidates.length === 0 ? 'disabled' : ''}>${candidateOptions}</select>
          <button class="btn btn-primary" data-action="add" ${candidates.length === 0 ? 'disabled' : ''}>加入此人</button>
        </div>
      `;
      container.appendChild(card);
      card.querySelector('[data-action=del]').addEventListener('click', async () => {
        if (!confirm(`確定刪除名單「${wl.name}」？`)) return;
        await store.deleteWatchlist(db, wl.id);
        render();
      });
      card.querySelector('[data-action=add]').addEventListener('click', async () => {
        const select = card.querySelector('.add-select');
        const targetId = select.value;
        if (!targetId) return;
        const target = allPeople.find(p => p.id === targetId);
        await store.addToWatchlist(db, wl.id, targetId);
        showToast(null, `已加入「${target?.displayName || targetId.slice(0, 8)}」`, 'success');
        render();
      });
      card.querySelectorAll('[data-remove]').forEach(btn => {
        btn.addEventListener('click', async () => {
          await store.removeFromWatchlist(db, wl.id, btn.dataset.remove);
          render();
        });
      });
    }
  }

  await render();
}

function escape(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
