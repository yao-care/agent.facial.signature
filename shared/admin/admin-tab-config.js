import * as store from '../face-store.js';
import { showToast } from '../face-ui.js';
import { buildScheduleAgenda } from '../schedule-resolve.js';

const SERVICE_OPTIONS = ['關懷訪視', '電話問安', '健康促進', '餐飲服務'];
const REQUIRE_ACTIVITY_ID = ['健康促進', '餐飲服務'];
const MEAL_TYPES = ['', '共餐', '送餐'];
const KNOWN_SCENARIOS = [{ scenarioId: 'example-checkin', name: '示範簽到場景' }];

export async function mountConfigTab(root, db) {
  async function render() {
    const stored = await store.listScenarioConfigs(db);
    const byId = new Map(stored.map(r => [r.scenarioId, r]));
    const ids = new Set([...KNOWN_SCENARIOS.map(s => s.scenarioId), ...byId.keys()]);
    const scenarios = [...ids].map(id => ({
      scenarioId: id,
      name: KNOWN_SCENARIOS.find(s => s.scenarioId === id)?.name || id,
      schedule: byId.get(id)?.schedule || { weekly: [], specific: [] },
    }));

    root.innerHTML = `
      <p class="hint">設定每個情境頁的服務時段排程。報到時依當下時間自動套用（特定日期優先於星期）；無規則時情境留空。</p>
      <div class="config-cards">${scenarios.map(renderCard).join('')}</div>
    `;
    scenarios.forEach(s => {
      const card = root.querySelector(`.config-card[data-sid="${cssEsc(s.scenarioId)}"]`);
      wireCard(card, s.scenarioId);
    });
  }

  function renderCard(s) {
    const { days, future } = buildScheduleAgenda(s.schedule, new Date());
    return `
      <div class="config-card watchlist-card" data-sid="${escape(s.scenarioId)}">
        <h3>${escape(s.name)}</h3>
        <small style="color:var(--text-muted);">情境編號 ${escape(s.scenarioId)}</small>
        <div class="sched-days">${days.map(renderDay).join('')}</div>
        <h4 style="margin:16px 0 8px;">未來特定日期</h4>
        <div class="sched-future">${future.map(r => renderRule(r, 'specific')).join('')}</div>
        <button class="btn btn-sm sched-add-specific">＋ 新增特定日期</button>
        <div style="margin-top:16px;"><button class="btn btn-primary sched-save">儲存排程</button></div>
      </div>
    `;
  }

  function renderDay(d) {
    return `
      <div class="sched-day" data-weekday="${d.weekday}">
        <div class="sched-day-label">${escape(d.label)}${d.isToday ? ' <strong>今</strong>' : ''}</div>
        <div class="sched-day-rules">${d.rules.map(r => renderRule(r, r.isSpecific ? 'specific' : 'weekly')).join('')}</div>
        <button class="btn btn-sm sched-add-weekly">＋ 新增此日規則</button>
      </div>
    `;
  }

  function renderRule(r, kind) {
    const meal = r.服務項目 === '餐飲服務';
    return `
      <div class="sched-rule" data-kind="${kind}">
        ${kind === 'specific' ? `<div class="field-row"><label>日期</label><input type="date" class="r-date" value="${escape(r.date || '')}"></div>` : ''}
        <div class="field-row"><label>時間</label>
          <input type="time" class="r-start" value="${escape(r.start || '')}">
          <input type="time" class="r-end" value="${escape(r.end || '')}">
        </div>
        <div class="field-row"><label>時段</label><input type="text" class="r-period" value="${escape(r.時段 || '')}" placeholder="上午/下午"></div>
        <div class="field-row"><label>服務項目</label>
          <select class="r-service">${SERVICE_OPTIONS.map(o => `<option ${o === r.服務項目 ? 'selected' : ''}>${o}</option>`).join('')}</select>
        </div>
        <div class="field-row"><label>活動編號</label><input type="text" class="r-actno" value="${escape(r.活動編號 || '')}" placeholder="健促/餐飲必填"></div>
        <div class="field-row"><label>活動主題</label><input type="text" class="r-topic" value="${escape(r.活動主題 || '')}"></div>
        <div class="field-row r-meal-wrap" ${meal ? '' : 'hidden'}><label>餐飲類型</label>
          <select class="r-meal">${MEAL_TYPES.map(o => `<option value="${o}" ${o === r.餐飲類型 ? 'selected' : ''}>${o || '（未選）'}</option>`).join('')}</select>
        </div>
        <div class="field-row"><label>服務志工</label><input type="text" class="r-volunteer" value="${escape(r.服務志工 || '')}"></div>
        <button class="btn btn-sm btn-danger r-remove">移除規則</button>
      </div>
    `;
  }

  function wireCard(card, scenarioId) {
    if (!card) return;
    card.addEventListener('change', e => {
      if (e.target.classList.contains('r-service')) {
        const wrap = e.target.closest('.sched-rule').querySelector('.r-meal-wrap');
        wrap.hidden = e.target.value !== '餐飲服務';
      }
    });
    card.addEventListener('click', e => {
      const t = e.target;
      if (t.classList.contains('r-remove')) {
        t.closest('.sched-rule').remove();
      } else if (t.classList.contains('sched-add-weekly')) {
        t.closest('.sched-day').querySelector('.sched-day-rules')
          .insertAdjacentHTML('beforeend', renderRule({}, 'weekly'));
      } else if (t.classList.contains('sched-add-specific')) {
        card.querySelector('.sched-future').insertAdjacentHTML('beforeend', renderRule({}, 'specific'));
      } else if (t.classList.contains('sched-save')) {
        saveCard(card, scenarioId);
      }
    });
  }

  async function saveCard(card, scenarioId) {
    const weekly = [];
    const specific = [];
    let err = null;
    card.querySelectorAll('.sched-rule').forEach(el => {
      if (err) return;
      const 服務項目 = el.querySelector('.r-service').value;
      const start = el.querySelector('.r-start').value;
      const end = el.querySelector('.r-end').value;
      const 活動編號 = el.querySelector('.r-actno').value.trim();
      if (!start || !end) { err = '每條規則都要填開始與結束時間'; return; }
      if (end <= start) { err = '結束時間必須晚於開始時間'; return; }
      if (REQUIRE_ACTIVITY_ID.includes(服務項目) && !活動編號) { err = `「${服務項目}」需填活動編號`; return; }
      const rule = {
        start, end,
        時段: el.querySelector('.r-period').value.trim(),
        服務項目, 活動編號,
        活動主題: el.querySelector('.r-topic').value.trim(),
        餐飲類型: 服務項目 === '餐飲服務' ? el.querySelector('.r-meal').value : '',
        服務志工: el.querySelector('.r-volunteer').value.trim(),
      };
      if (el.dataset.kind === 'weekly') {
        const wd = Number(el.closest('.sched-day')?.dataset.weekday);
        if (Number.isNaN(wd)) { err = '星期規則缺星期'; return; }
        rule.weekday = wd;
        weekly.push(rule);
      } else {
        const date = el.querySelector('.r-date').value;
        if (!date) { err = '特定日期規則要選日期'; return; }
        rule.date = date;
        specific.push(rule);
      }
    });
    if (err) { showToast(null, err, 'error'); return; }
    await store.putScenarioConfig(db, scenarioId, { weekly, specific });
    showToast(null, '已儲存排程', 'success');
    render();
  }

  await render();
}

function escape(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
function cssEsc(s) { return String(s).replace(/["\\]/g, '\\$&'); }
