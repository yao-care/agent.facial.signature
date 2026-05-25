import * as store from '../face-store.js';
import { isPersisted, getStorageEstimate, requestPersistentStorage } from '../persistent-storage.js';
import { cosineSimilarity } from '../util-cosine.js';
import { showToast } from '../face-ui.js';

const TUNING_LABELS = {
  samplingMinFrames: '最少採樣畫面數',
  samplingMaxDurationMs: '採樣最長時間（毫秒）',
  samplingNoFaceTimeoutMs: '無人臉超時（毫秒）',
  samplingMinFaceSize: '臉框最小邊長（像素）',
  matchThreshold: '視為同一人的最低相似度',
  newPersonThreshold: '視為新人的最高相似度',
  contaminationGuard: '向量回寫的最低相似度（污染防護）',
  vectorsPerPersonCap: '每人特徵向量上限',
  snapshotsPerPersonCap: '每人快照上限',
  schemaVersion: '資料庫版本',
};

export async function mountSettingsTab(root, db) {
  root.innerHTML = `
    <h2>校準參數</h2>
    <p class="hint">所有數字皆需上線後依實際使用情況調整。</p>
    <div id="tuning-form"></div>
    <h2>儲存狀態</h2>
    <div id="storage-status"></div>
    <h2>相似度測試器</h2>
    <p class="hint">挑兩位人員，比對他們的人臉特徵向量相似度。</p>
    <div id="similarity-tester">
      <select id="sim-a"></select>
      <select id="sim-b"></select>
      <button class="btn" id="sim-compute">計算</button>
      <div id="sim-result"></div>
    </div>
    <h2>備份 / 還原</h2>
    <p class="hint">資料只存在這台裝置的瀏覽器內，請定期匯出備份。</p>
    <div>
      <button class="btn btn-primary" id="export-btn">匯出全部資料</button>
      <input type="password" id="export-pwd" placeholder="（可選）加密密碼">
      <br/><br/>
      <input type="file" id="import-file" accept=".zip,.bin">
      <button class="btn btn-danger" id="import-btn">匯入備份（會清空現有資料）</button>
      <input type="password" id="import-pwd" placeholder="密碼（若備份有加密）">
    </div>
    <h2>清理孤兒快照</h2>
    <p class="hint">掃描沒有任何紀錄引用的快照檔，並刪除釋放空間。</p>
    <button class="btn" id="gc-btn">掃描並清理</button>
    <div id="gc-status"></div>
  `;

  const tuning = await store.getTuning(db);
  const tuningForm = root.querySelector('#tuning-form');
  tuningForm.innerHTML = Object.keys(tuning)
    .filter(k => k !== 'id' && typeof tuning[k] !== 'object')
    .map(k => `
      <label style="display:block; margin: 6px 0;">
        ${TUNING_LABELS[k] || k}
        <input data-key="${k}" type="number" step="any" value="${tuning[k]}" style="margin-left:8px;">
      </label>
    `).join('') + `<button class="btn btn-primary" id="save-tuning">儲存參數</button>`;
  tuningForm.querySelector('#save-tuning').addEventListener('click', async () => {
    const overrides = {};
    tuningForm.querySelectorAll('[data-key]').forEach(inp => {
      overrides[inp.dataset.key] = Number(inp.value);
    });
    await store.putTuning(db, overrides);
    showToast(null, '參數已儲存', 'success');
  });

  // storage status
  const persisted = await isPersisted();
  const est = await getStorageEstimate();
  root.querySelector('#storage-status').innerHTML = `
    持久儲存：${persisted ? '✓ 已授權（瀏覽器不會自動清資料）' : '✗ 未授權（瀏覽器可能在空間不足時清資料）'}
    ${!persisted ? `<button class="btn" id="req-persist">請求授權</button>` : ''}
    <br/>用量：${est ? `${Math.round(est.usage/1024/1024)} MB / ${Math.round(est.quota/1024/1024)} MB` : '無法取得'}
  `;
  root.querySelector('#req-persist')?.addEventListener('click', async () => {
    await requestPersistentStorage();
    mountSettingsTab(root, db);
  });

  // similarity tester
  const all = await store.listPeople(db);
  const opts = all.map(p => `<option value="${p.id}">${escape(p.displayName || '（未命名 ' + p.id.slice(0, 6) + '）')}</option>`).join('');
  root.querySelector('#sim-a').innerHTML = opts;
  root.querySelector('#sim-b').innerHTML = opts;
  root.querySelector('#sim-compute').addEventListener('click', async () => {
    const aId = root.querySelector('#sim-a').value;
    const bId = root.querySelector('#sim-b').value;
    const a = await store.getPerson(db, aId);
    const b = await store.getPerson(db, bId);
    if (!a?.vectors?.length || !b?.vectors?.length) {
      root.querySelector('#sim-result').textContent = '至少一邊沒有特徵向量';
      return;
    }
    let max = -Infinity;
    for (const va of a.vectors) for (const vb of b.vectors) {
      const s = cosineSimilarity(va, vb);
      if (s > max) max = s;
    }
    root.querySelector('#sim-result').textContent = `最高相似度：${max.toFixed(4)}`;
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
    if (!file) { showToast(null, '請先選擇備份檔', 'error'); return; }
    if (!confirm('匯入會清空現有所有資料，確定嗎？')) return;
    const pwd = root.querySelector('#import-pwd').value || undefined;
    try {
      await store.importAll(db, file, { password: pwd });
      showToast(null, '匯入成功，請重新整理頁面', 'success');
    } catch (err) {
      showToast(null, `匯入失敗：${err.message}`, 'error');
    }
  });

  // orphan GC
  root.querySelector('#gc-btn').addEventListener('click', async () => {
    const n = await store.gcOrphanSnapshots(db);
    root.querySelector('#gc-status').textContent = `已清理 ${n} 個孤兒快照`;
  });
}

function escape(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
