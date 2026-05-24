import * as store from '../face-store.js';
import { isPersisted, getStorageEstimate, requestPersistentStorage } from '../persistent-storage.js';
import { cosineSimilarity } from '../util-cosine.js';

export async function mountSettingsTab(root, db) {
  root.innerHTML = `
    <h2>Tuning 參數</h2>
    <div id="tuning-form"></div>
    <h2>儲存狀態</h2>
    <div id="storage-status"></div>
    <h2>相似度測試器</h2>
    <div id="similarity-tester">
      <select id="sim-a"></select>
      <select id="sim-b"></select>
      <button class="btn" id="sim-compute">計算</button>
      <div id="sim-result"></div>
    </div>
    <h2>匯出 / 匯入</h2>
    <div>
      <button class="btn btn-primary" id="export-btn">匯出全部資料</button>
      <input type="password" id="export-pwd" placeholder="（可選）密碼">
      <input type="file" id="import-file" accept=".zip,.bin">
      <button class="btn btn-danger" id="import-btn">匯入（會清空現有）</button>
      <input type="password" id="import-pwd" placeholder="密碼（如有加密）">
    </div>
    <h2>孤兒檔回收</h2>
    <button class="btn" id="gc-btn">掃描並刪除孤兒 snapshot</button>
    <div id="gc-status"></div>
  `;

  const tuning = await store.getTuning(db);
  const tuningForm = root.querySelector('#tuning-form');
  tuningForm.innerHTML = Object.keys(tuning)
    .filter(k => k !== 'id' && typeof tuning[k] !== 'object')
    .map(k => `
      <label style="display:block; margin: 4px 0;">
        ${k} <input data-key="${k}" type="number" step="any" value="${tuning[k]}">
      </label>
    `).join('') + `<button class="btn btn-primary" id="save-tuning">儲存</button>`;
  tuningForm.querySelector('#save-tuning').addEventListener('click', async () => {
    const overrides = {};
    tuningForm.querySelectorAll('[data-key]').forEach(inp => {
      overrides[inp.dataset.key] = Number(inp.value);
    });
    await store.putTuning(db, overrides);
    alert('已儲存');
  });

  // storage status
  const persisted = await isPersisted();
  const est = await getStorageEstimate();
  root.querySelector('#storage-status').innerHTML = `
    Persistent storage: ${persisted ? '✓ 已授權' : '✗ 未授權'}
    ${!persisted ? `<button class="btn" id="req-persist">請求授權</button>` : ''}
    <br/>用量: ${est ? `${Math.round(est.usage/1024/1024)} MB / ${Math.round(est.quota/1024/1024)} MB` : '不支援'}
  `;
  root.querySelector('#req-persist')?.addEventListener('click', async () => {
    await requestPersistentStorage();
    mountSettingsTab(root, db);
  });

  // similarity tester
  const all = await store.listPeople(db);
  const opts = all.map(p => `<option value="${p.id}">${escape(p.displayName || p.id.slice(0, 8))}</option>`).join('');
  root.querySelector('#sim-a').innerHTML = opts;
  root.querySelector('#sim-b').innerHTML = opts;
  root.querySelector('#sim-compute').addEventListener('click', async () => {
    const aId = root.querySelector('#sim-a').value;
    const bId = root.querySelector('#sim-b').value;
    const a = await store.getPerson(db, aId);
    const b = await store.getPerson(db, bId);
    if (!a.vectors.length || !b.vectors.length) {
      root.querySelector('#sim-result').textContent = '至少一邊沒有向量';
      return;
    }
    // 最大跨向量 similarity
    let max = -Infinity;
    for (const va of a.vectors) for (const vb of b.vectors) {
      const s = cosineSimilarity(va, vb);
      if (s > max) max = s;
    }
    root.querySelector('#sim-result').textContent = `cosine max = ${max.toFixed(4)}`;
  });

  // export / import
  root.querySelector('#export-btn').addEventListener('click', async () => {
    const pwd = root.querySelector('#export-pwd').value || undefined;
    const blob = await store.exportAll(db, { password: pwd });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `facial-signature-backup-${new Date().toISOString().slice(0, 10)}.${pwd ? 'bin' : 'zip'}`;
    a.click();
  });
  root.querySelector('#import-btn').addEventListener('click', async () => {
    const file = root.querySelector('#import-file').files[0];
    if (!file) { alert('請選檔'); return; }
    if (!confirm('匯入會清空現有資料，確認？')) return;
    const pwd = root.querySelector('#import-pwd').value || undefined;
    try {
      await store.importAll(db, file, { password: pwd });
      alert('匯入成功，請重整頁面');
    } catch (err) {
      alert(`匯入失敗：${err.message}`);
    }
  });

  // orphan GC
  root.querySelector('#gc-btn').addEventListener('click', async () => {
    const n = await store.gcOrphanSnapshots(db);
    root.querySelector('#gc-status').textContent = `刪除 ${n} 個孤兒檔`;
  });
}

function escape(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
