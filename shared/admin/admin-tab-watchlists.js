import * as store from '../face-store.js';
import { showToast } from '../face-ui.js';

export async function mountWatchlistsTab(root, db) {
  root.innerHTML = `
    <div class="filter-row">
      <input id="new-id" placeholder="名單編號（英數，例如 highrisk）">
      <input id="new-name" placeholder="顯示名稱（例如：高風險走失）">
      <button class="btn btn-primary" id="new-btn">建立新名單</button>
    </div>
    <div id="lists"></div>
  `;

  root.querySelector('#new-btn').addEventListener('click', async () => {
    const id = root.querySelector('#new-id').value.trim();
    const name = root.querySelector('#new-name').value.trim();
    if (!id) { showToast(null, '請輸入名單編號', 'error'); return; }
    await store.createWatchlist(db, { id, name: name || id });
    root.querySelector('#new-id').value = '';
    root.querySelector('#new-name').value = '';
    showToast(null, `已建立名單「${name || id}」`, 'success');
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
      card.innerHTML = `
        <h3>${escape(wl.name)} <small style="color:#64748b;">（編號 ${escape(wl.id)}）</small>
          <button class="btn btn-danger" data-action="del">刪除名單</button></h3>
        <p>目前共 ${wl.personIds.length} 人</p>
        <ul>${wl.personIds.map(pid => `
          <li>${escape(peopleById.get(pid)?.displayName || '（未命名 ' + pid.slice(0, 6) + '）')}
            <button class="btn" data-remove="${pid}">移出</button></li>
        `).join('')}</ul>
        <input class="add-input" placeholder="輸入人員編號前綴">
        <button class="btn" data-action="add">加入此人</button>
      `;
      container.appendChild(card);
      card.querySelector('[data-action=del]').addEventListener('click', async () => {
        if (!confirm(`確定刪除名單「${wl.name}」？`)) return;
        await store.deleteWatchlist(db, wl.id);
        render();
      });
      card.querySelector('[data-action=add]').addEventListener('click', async () => {
        const prefix = card.querySelector('.add-input').value.trim();
        const target = allPeople.find(p => p.id.startsWith(prefix));
        if (!target) { showToast(null, '找不到該人員', 'error'); return; }
        await store.addToWatchlist(db, wl.id, target.id);
        showToast(null, `已加入「${target.displayName || target.id.slice(0, 8)}」`, 'success');
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
