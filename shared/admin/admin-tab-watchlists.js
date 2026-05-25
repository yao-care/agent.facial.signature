import * as store from '../face-store.js';
import { showToast } from '../face-ui.js';

// 警示名單固定只有這三種，每種有對應音效 tone。
// 其他身份分類（家屬/員工/志工/VIP/訪客）在「人員」tab 的「身份」欄位設定。
const WATCHLIST_PRESETS = [
  { id: 'highrisk', name: '高風險走失', tone: 'critical' },
  { id: 'demented', name: '失智長者',   tone: 'warn' },
  { id: 'banned',   name: '黑名單',     tone: 'critical' },
];
const TONE_LOOKUP = Object.fromEntries(WATCHLIST_PRESETS.map(p => [p.id, p.tone]));

export async function mountWatchlistsTab(root, db) {
  root.innerHTML = `
    <div class="new-list-form">
      <label>名單類型
        <select id="new-preset">
          ${WATCHLIST_PRESETS.map(p => `<option value="${p.id}">${escape(p.name)}（${escape(p.id)}）</option>`).join('')}
        </select>
      </label>
      <button class="btn btn-primary" id="new-btn">建立名單</button>
    </div>
    <div id="lists"></div>
  `;

  const presetSel = root.querySelector('#new-preset');

  root.querySelector('#new-btn').addEventListener('click', async () => {
    const presetId = presetSel.value;
    const preset = WATCHLIST_PRESETS.find(p => p.id === presetId);
    if (await store.getWatchlist(db, presetId)) {
      showToast(null, `名單「${preset.name}」已存在`, 'error');
      return;
    }
    await store.createWatchlist(db, { id: presetId, name: preset.name });
    showToast(null, `已建立名單「${preset.name}」`, 'success');
    render();
  });

  async function render() {
    const lists = await store.listWatchlists(db);
    const allPeople = await store.listPeople(db);
    const peopleById = new Map(allPeople.map(p => [p.id, p]));
    const container = root.querySelector('#lists');
    container.innerHTML = '';
    container.classList.add('watchlist-grid');
    for (const wl of lists) {
      const card = document.createElement('div');
      const tone = TONE_LOOKUP[wl.id] || 'neutral';
      const presetName = WATCHLIST_PRESETS.find(p => p.id === wl.id)?.name;
      card.className = `watchlist-card tone-${tone}`;
      // 候選名單：所有人員減去已在名單上的
      const candidates = allPeople.filter(p => !wl.personIds.includes(p.id));
      const candidateOptions = candidates.length === 0
        ? `<option value="">（所有人員都已在名單上）</option>`
        : candidates.map(p =>
            `<option value="${p.id}">${escape(p.displayName || '（未命名 ' + p.id.slice(0, 6) + '）')}</option>`
          ).join('');

      card.innerHTML = `
        <div class="watchlist-header">
          <span class="watchlist-badge">${escape(presetName || '自訂')}</span>
          <h3>${escape(wl.name)}</h3>
          <small style="color:var(--text-muted);">編號 ${escape(wl.id)}</small>
          <button class="btn btn-danger btn-sm watchlist-del" data-action="del">刪除</button>
        </div>
        <p class="watchlist-count">目前共 <strong>${wl.personIds.length}</strong> 人</p>
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
