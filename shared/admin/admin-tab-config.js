import * as store from '../face-store.js';
import { showToast } from '../face-ui.js';

const SERVICE_OPTIONS = ['關懷訪視', '電話問安', '健康促進', '餐飲服務'];
const REQUIRE_ACTIVITY_ID = ['健康促進', '餐飲服務']; // 這兩類活動編號必填
const MEAL_TYPES = ['', '共餐', '送餐'];

// 已知範例情境（沒有 IndexedDB 記錄時也讓管理者能建一筆）
const KNOWN_SCENARIOS = [
  { scenarioId: 'example-checkin', name: '示範簽到場景' },
];

export async function mountConfigTab(root, db) {
  async function render() {
    const stored = await store.listScenarioConfigs(db);
    const byId = new Map(stored.map(r => [r.scenarioId, r]));
    // 合併已知範例 + 已存記錄
    const ids = new Set([...KNOWN_SCENARIOS.map(s => s.scenarioId), ...byId.keys()]);
    const list = [...ids].map(id => ({
      scenarioId: id,
      name: KNOWN_SCENARIOS.find(s => s.scenarioId === id)?.name || id,
      serviceRecord: byId.get(id)?.serviceRecord || {},
    }));

    root.innerHTML = `
      <p class="hint">編輯各情境頁的今日服務紀錄欄位。報到頁下次載入即生效；活動日期自動取報到當天。</p>
      <div class="config-cards">${list.map(c => renderCard(c)).join('')}</div>
    `;

    root.querySelectorAll('.config-card').forEach(card => {
      const sid = card.dataset.sid;
      const svcSel = card.querySelector('.cfg-service');
      const mealWrap = card.querySelector('.cfg-meal-wrap');
      const syncMeal = () => { mealWrap.hidden = svcSel.value !== '餐飲服務'; };
      svcSel.addEventListener('change', syncMeal);
      syncMeal();

      card.querySelector('.cfg-save').addEventListener('click', async () => {
        const 服務項目 = svcSel.value;
        const 活動編號 = card.querySelector('.cfg-actno').value.trim();
        if (REQUIRE_ACTIVITY_ID.includes(服務項目) && !活動編號) {
          showToast(null, `「${服務項目}」需先填活動編號（平台規定須先建活動）`, 'error');
          return;
        }
        const serviceRecord = {
          服務項目,
          時段: card.querySelector('.cfg-period').value.trim(),
          活動編號,
          活動主題: card.querySelector('.cfg-topic').value.trim(),
          餐飲類型: 服務項目 === '餐飲服務' ? card.querySelector('.cfg-meal').value : '',
          服務志工: card.querySelector('.cfg-volunteer').value.trim(),
        };
        await store.putScenarioConfig(db, sid, serviceRecord);
        showToast(null, `已儲存「${sid}」情境設定`, 'success');
        render();
      });
    });
  }

  function renderCard(c) {
    const sr = c.serviceRecord;
    return `
      <div class="config-card watchlist-card" data-sid="${escape(c.scenarioId)}">
        <h3>${escape(c.name)}</h3>
        <small style="color:var(--text-muted);">情境編號 ${escape(c.scenarioId)}</small>
        <div class="field-row"><label>服務項目</label>
          <select class="cfg-service">
            ${SERVICE_OPTIONS.map(o => `<option ${o === sr.服務項目 ? 'selected' : ''}>${o}</option>`).join('')}
          </select>
        </div>
        <div class="field-row"><label>時段</label>
          <input type="text" class="cfg-period" value="${escape(sr.時段 || '')}" placeholder="上午 / 下午"></div>
        <div class="field-row"><label>活動編號</label>
          <input type="text" class="cfg-actno" value="${escape(sr.活動編號 || '')}" placeholder="健促/餐飲必填，例 HP-115052601"></div>
        <div class="field-row"><label>活動主題</label>
          <input type="text" class="cfg-topic" value="${escape(sr.活動主題 || '')}" placeholder="例 匹克球"></div>
        <div class="field-row cfg-meal-wrap" hidden><label>餐飲類型</label>
          <select class="cfg-meal">
            ${MEAL_TYPES.map(o => `<option value="${o}" ${o === sr.餐飲類型 ? 'selected' : ''}>${o || '（未選）'}</option>`).join('')}
          </select>
        </div>
        <div class="field-row"><label>服務志工</label>
          <input type="text" class="cfg-volunteer" value="${escape(sr.服務志工 || '')}"></div>
        <button class="btn btn-primary cfg-save">儲存</button>
      </div>
    `;
  }

  await render();
}

function escape(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
