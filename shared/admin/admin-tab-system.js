import * as store from '../face-store.js';
import { isPersisted, getStorageEstimate, requestPersistentStorage } from '../persistent-storage.js';
import { cosineSimilarity } from '../util-cosine.js';
import { showToast } from '../face-ui.js';

export async function mountSystemTab(root, db) {
  root.innerHTML = `
    <div class="system-grid">

      <!-- 左欄：儲存 -->
      <section class="system-col">
        <h2>儲存狀態</h2>
        <div id="storage-status"></div>
        <div class="storage-actions">
          <button class="btn" id="gc-btn">清理孤兒快照</button>
          <span id="gc-status" class="hint"></span>
        </div>

        <h2>備份 / 還原</h2>
        <p class="hint">資料只存在這台裝置的瀏覽器內，請定期匯出備份。</p>
        <div class="backup-row">
          <button class="btn btn-primary" id="export-btn">匯出全部資料</button>
          <input type="password" id="export-pwd" placeholder="（可選）加密密碼">
        </div>
        <div class="backup-row" style="margin-top:12px;">
          <input type="file" id="import-file" accept=".zip,.bin">
          <input type="password" id="import-pwd" placeholder="密碼（若有加密）">
          <button class="btn btn-danger" id="import-btn">匯入備份（會清空現有資料）</button>
        </div>
      </section>

      <!-- 右欄：相似度測試器 -->
      <section class="system-col">
        <h2>相似度測試器</h2>
        <p class="hint">挑兩位人員，比對他們的人臉特徵向量相似度。</p>
        <div class="sim-grid">
          <div class="sim-side">
            <select id="sim-a"></select>
            <div class="sim-photo" id="sim-photo-a"><div class="sim-placeholder">尚未選擇</div></div>
          </div>
          <div class="sim-side">
            <select id="sim-b"></select>
            <div class="sim-photo" id="sim-photo-b"><div class="sim-placeholder">尚未選擇</div></div>
          </div>
        </div>
        <button class="btn btn-primary" id="sim-compute" style="margin-top:16px;width:100%;">計算相似度</button>
        <div id="sim-result" class="sim-result">—</div>
      </section>

    </div>
  `;

  // === 儲存狀態 ===
  await refreshStorageStatus();

  async function refreshStorageStatus() {
    const persisted = await isPersisted();
    const est = await getStorageEstimate();
    const maint = await store.getMaintenance(db);
    const tuning = await store.getTuning(db);
    let exportLine;
    if (!maint.lastExportAt) {
      exportLine = `<p style="color:var(--color-critical);">尚未匯出備份</p>`;
    } else {
      const days = Math.floor((Date.now() - maint.lastExportAt) / 86400000);
      const warn = days > tuning.exportReminderDays;
      exportLine = `<p${warn ? ' style="color:var(--color-critical);"' : ''}>距上次匯出備份：${days} 天${warn ? '（建議盡快匯出）' : ''}</p>`;
    }
    root.querySelector('#storage-status').innerHTML = `
      <p>持久儲存：${persisted
        ? '<strong style="color:var(--color-pass);">✓ 已授權</strong>（瀏覽器不會自動清資料）'
        : '<strong style="color:var(--color-critical);">✗ 未授權</strong>（瀏覽器可能在空間不足時清資料） <button class="btn btn-sm" id="req-persist">請求授權</button>'
      }</p>
      <p>用量：${est ? `${Math.round(est.usage / 1024 / 1024)} MB / ${Math.round(est.quota / 1024 / 1024)} MB` : '無法取得'}</p>
      ${exportLine}
    `;
    root.querySelector('#req-persist')?.addEventListener('click', async () => {
      await requestPersistentStorage();
      await refreshStorageStatus();
    });
  }

  // === 清理孤兒快照（併入儲存區塊） ===
  root.querySelector('#gc-btn').addEventListener('click', async () => {
    const n = await store.gcOrphanSnapshots(db);
    root.querySelector('#gc-status').textContent = `已清理 ${n} 個孤兒快照`;
    await refreshStorageStatus();
  });

  // === 相似度測試器 ===
  const all = await store.listPeople(db);
  const allEvents = await store.listEvents(db);
  // 每個 person 的最新有 snapshot 的 event
  const latestSnap = new Map();
  for (const e of allEvents) {
    if (!e.personId || !e.snapshotId) continue;
    const prev = latestSnap.get(e.personId);
    if (!prev || e.timestamp > prev.timestamp) latestSnap.set(e.personId, e);
  }
  const opts = all.map(p =>
    `<option value="${p.id}">${escape(p.displayName || '（未命名 ' + p.id.slice(0, 6) + '）')}</option>`
  ).join('');
  const simA = root.querySelector('#sim-a');
  const simB = root.querySelector('#sim-b');
  simA.innerHTML = `<option value="">— 請選擇 —</option>${opts}`;
  simB.innerHTML = `<option value="">— 請選擇 —</option>${opts}`;

  async function renderPhoto(side, personId) {
    const container = root.querySelector(`#sim-photo-${side}`);
    container.innerHTML = '';
    if (!personId) {
      container.innerHTML = '<div class="sim-placeholder">尚未選擇</div>';
      return;
    }
    const p = await store.getPerson(db, personId);
    const ev = latestSnap.get(personId);
    let imgEl = '';
    if (ev?.snapshotId) {
      try {
        const blob = await store.readSnapshot(ev.snapshotId);
        imgEl = `<img src="${URL.createObjectURL(blob)}" alt="">`;
      } catch {}
    }
    container.innerHTML = `
      ${imgEl || '<div class="sim-placeholder">無快照</div>'}
      <div class="sim-caption">
        <strong>${escape(p.displayName || '（未命名）')}</strong>
        <small>向量 ${p.vectors.length} 筆</small>
      </div>
    `;
  }

  simA.addEventListener('change', () => renderPhoto('a', simA.value));
  simB.addEventListener('change', () => renderPhoto('b', simB.value));

  root.querySelector('#sim-compute').addEventListener('click', async () => {
    const aId = simA.value;
    const bId = simB.value;
    const resultEl = root.querySelector('#sim-result');
    if (!aId || !bId) { resultEl.textContent = '請先選擇兩位人員'; return; }
    const a = await store.getPerson(db, aId);
    const b = await store.getPerson(db, bId);
    if (!a?.vectors?.length || !b?.vectors?.length) {
      resultEl.textContent = '至少一邊沒有特徵向量';
      return;
    }
    let max = -Infinity;
    for (const va of a.vectors) for (const vb of b.vectors) {
      const s = cosineSimilarity(va, vb);
      if (s > max) max = s;
    }
    // 解讀提示
    const tuning = await store.getTuning(db);
    let label;
    if (max >= tuning.matchThreshold) label = '視為同一人';
    else if (max < tuning.newPersonThreshold) label = '視為不同人';
    else label = '模糊區（待人工判斷）';
    resultEl.innerHTML = `
      <div class="sim-score">${max.toFixed(4)}</div>
      <div class="sim-judge">${label}</div>
    `;
  });

  // === 備份 / 還原 ===
  root.querySelector('#export-btn').addEventListener('click', async () => {
    const pwd = root.querySelector('#export-pwd').value || undefined;
    if (!pwd && !confirm('未設密碼會匯出「未加密」的明文備份，內含長者臉部特徵。建議設定密碼。仍要繼續匯出明文嗎？')) {
      return;
    }
    const blob = await store.exportAll(db, { password: pwd });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `facial-signature-backup-${new Date().toISOString().slice(0, 10)}.${pwd ? 'bin' : 'zip'}`;
    a.click();
    await store.setMaintenance(db, { lastExportAt: Date.now() });
    await refreshStorageStatus();
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
}

function escape(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
