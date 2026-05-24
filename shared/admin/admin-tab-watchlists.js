import * as store from '../face-store.js';

export async function mountWatchlistsTab(root, db) {
  root.innerHTML = `
    <div class="filter-row">
      <input id="new-id" placeholder="新名單 id (英數)">
      <input id="new-name" placeholder="名稱">
      <button class="btn btn-primary" id="new-btn">建立</button>
    </div>
    <div id="lists"></div>
  `;

  root.querySelector('#new-btn').addEventListener('click', async () => {
    const id = root.querySelector('#new-id').value.trim();
    const name = root.querySelector('#new-name').value.trim();
    if (!id) { alert('需要 id'); return; }
    await store.createWatchlist(db, { id, name: name || id });
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
        <h3>${escape(wl.name)} <code>${escape(wl.id)}</code>
          <button class="btn btn-danger" data-action="del">刪除</button></h3>
        <p>${wl.personIds.length} 人在名單上</p>
        <ul>${wl.personIds.map(pid => `
          <li>${escape(peopleById.get(pid)?.displayName || pid.slice(0, 12))}
            <button class="btn" data-remove="${pid}">移出</button></li>
        `).join('')}</ul>
        <input class="add-input" placeholder="輸入 person id 前綴新增">
        <button class="btn" data-action="add">加入</button>
      `;
      container.appendChild(card);
      card.querySelector('[data-action=del]').addEventListener('click', async () => {
        if (!confirm('刪除此名單？')) return;
        await store.deleteWatchlist(db, wl.id);
        render();
      });
      card.querySelector('[data-action=add]').addEventListener('click', async () => {
        const prefix = card.querySelector('.add-input').value.trim();
        const target = allPeople.find(p => p.id.startsWith(prefix));
        if (!target) { alert('找不到'); return; }
        await store.addToWatchlist(db, wl.id, target.id);
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
