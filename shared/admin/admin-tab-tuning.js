import * as store from '../face-store.js';
import { showToast } from '../face-ui.js';

const TUNING_GROUPS = [
  {
    title: '採樣',
    hint: '每次識別人臉時的取樣行為。',
    fields: [
      { key: 'samplingMinFrames',         label: '最少採樣畫面數' },
      { key: 'samplingMaxDurationMs',     label: '採樣最長時間（毫秒）' },
      { key: 'samplingNoFaceTimeoutMs',   label: '無人臉超時（毫秒）' },
      { key: 'samplingMinFaceSize',       label: '臉框最小邊長（像素）' },
    ],
  },
  {
    title: '比對',
    hint: '判定兩張臉是否同一人的相似度閾值。',
    fields: [
      { key: 'matchThreshold',     label: '視為同一人的最低相似度' },
      { key: 'newPersonThreshold', label: '視為新人的最高相似度' },
      { key: 'contaminationGuard', label: '向量回寫的最低相似度（污染防護）' },
    ],
  },
  {
    title: '容量',
    hint: '每位人員可保留的特徵向量與快照上限。',
    fields: [
      { key: 'vectorsPerPersonCap',   label: '每人特徵向量上限' },
      { key: 'snapshotsPerPersonCap', label: '每人快照上限' },
    ],
  },
  {
    title: '系統',
    hint: '資料庫版本（僅供升級對照，請勿手動修改）。',
    fields: [
      { key: 'schemaVersion', label: '資料庫版本' },
    ],
  },
];

export async function mountTuningTab(root, db) {
  const tuning = await store.getTuning(db);
  const groupsHtml = TUNING_GROUPS.map(g => `
    <section class="tuning-group">
      <h3>${escape(g.title)}</h3>
      <p class="hint">${escape(g.hint)}</p>
      <div class="tuning-fields">
        ${g.fields.map(f => `
          <label class="tuning-row">
            <span class="tuning-label">${escape(f.label)}</span>
            <input data-key="${escape(f.key)}" type="number" step="any" value="${tuning[f.key] ?? ''}">
          </label>
        `).join('')}
      </div>
    </section>
  `).join('');

  root.innerHTML = `
    <h2>校準參數</h2>
    <p class="hint">所有數字皆需上線後依實際使用情況調整。修改後請點下方「儲存參數」。</p>
    <div class="tuning-grid">${groupsHtml}</div>
    <button class="btn btn-primary tuning-save" id="save-tuning">儲存參數</button>
  `;

  root.querySelector('#save-tuning').addEventListener('click', async () => {
    const overrides = {};
    root.querySelectorAll('[data-key]').forEach(inp => {
      overrides[inp.dataset.key] = Number(inp.value);
    });
    await store.putTuning(db, overrides);
    showToast(null, '參數已儲存', 'success');
  });
}

function escape(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
