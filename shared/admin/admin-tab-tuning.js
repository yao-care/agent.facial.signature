import * as store from '../face-store.js';
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

export async function mountTuningTab(root, db) {
  root.innerHTML = `
    <h2>校準參數</h2>
    <p class="hint">所有數字皆需上線後依實際使用情況調整。修改後請點下方「儲存參數」。</p>
    <div id="tuning-form"></div>
  `;

  const tuning = await store.getTuning(db);
  const tuningForm = root.querySelector('#tuning-form');
  tuningForm.innerHTML = Object.keys(tuning)
    .filter(k => k !== 'id' && typeof tuning[k] !== 'object')
    .map(k => `
      <label class="tuning-row">
        <span class="tuning-label">${TUNING_LABELS[k] || k}</span>
        <input data-key="${k}" type="number" step="any" value="${tuning[k]}">
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
}
