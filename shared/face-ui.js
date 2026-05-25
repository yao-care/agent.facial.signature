// face-ui.js — UI 元件層：相機、疊圖、TTS、視覺反饋
// 不負責特徵向量數學（spec § 3.1）

// TTS 模式：'unset' | 'tts'（播報歡迎詞）| 'silent'（只視覺）
let audioMode = 'unset';

export function getAudioMode() { return audioMode; }
export function setAudioMode(mode) { audioMode = mode; }

/**
 * 顯示「啟用語音播報？」遮罩，讓使用者明確選擇後才繼續。
 * 回傳 Promise<'tts' | 'silent'>，呼叫端應 await 它再開相機/啟動引擎，
 * 避免動線同時跳多個系統提示（相機權限 + 語音 dialog 重疊很亂）。
 *
 * 已選過時直接回傳當前模式，不再顯示。
 */
export function setupAudioChoice(rootEl) {
  if (audioMode !== 'unset') return Promise.resolve(audioMode);
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'audio-unlock-overlay';
    overlay.innerHTML = `
      <div class="audio-unlock-card">
        <h2>是否開啟語音播報？</h2>
        <p>系統可在識別到您時，以中文語音說「歡迎光臨」。<br/>您可選擇開啟或保持安靜，重新整理頁面時可再次選擇。</p>
        <div class="audio-actions">
          <button class="btn-modal btn-modal-cancel" data-choice="silent">不用，謝謝</button>
          <button class="btn-modal btn-modal-primary" data-choice="tts">開啟語音播報</button>
        </div>
      </div>
    `;
    rootEl.appendChild(overlay);
    overlay.querySelectorAll('[data-choice]').forEach(btn => {
      btn.addEventListener('click', () => {
        const choice = btn.dataset.choice;
        audioMode = choice;
        if (choice === 'tts') {
          // 在使用者手勢內觸發空語音，解鎖 audio context（iOS 需要）
          try {
            const u = new SpeechSynthesisUtterance(' ');
            u.volume = 0;
            speechSynthesis.speak(u);
          } catch {}
        }
        overlay.remove();
        resolve(choice);
      });
    });
  });
}

// 向後相容舊名稱
export const setupAudioUnlock = setupAudioChoice;

export async function setupCamera(videoEl) {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
    audio: false,
  });
  videoEl.srcObject = stream;
  await new Promise(r => videoEl.addEventListener('loadedmetadata', r, { once: true }));
  await videoEl.play();
  return stream;
}

export function teardownCamera(stream) {
  if (!stream) return;
  for (const t of stream.getTracks()) t.stop();
}

export function createOverlayCanvas(videoEl, parent) {
  const canvas = document.createElement('canvas');
  canvas.className = 'face-overlay';
  parent.appendChild(canvas);
  const resize = () => {
    canvas.width = videoEl.videoWidth;
    canvas.height = videoEl.videoHeight;
    canvas.style.width = videoEl.offsetWidth + 'px';
    canvas.style.height = videoEl.offsetHeight + 'px';
  };
  videoEl.addEventListener('loadedmetadata', resize);
  window.addEventListener('resize', resize);
  resize();
  return canvas;
}

// 每張臉的「顯示進度」做 ease — 即使實際採樣只花 0.3 秒，
// 視覺上動畫至少跑 1.5 秒讓使用者看得到「轉一圈」。
const _progressDisplay = new Map(); // faceId -> { pct, lastUpdate }
const _progressFillSec = 1.5;

function _easeProgress(faceId, targetPct, now) {
  let state = _progressDisplay.get(faceId);
  if (!state) {
    state = { pct: 0, lastUpdate: now };
    _progressDisplay.set(faceId, state);
  }
  const dt = (now - state.lastUpdate) / 1000;
  state.lastUpdate = now;
  const rate = 1 / _progressFillSec;
  const diff = targetPct - state.pct;
  if (Math.abs(diff) < 0.001) state.pct = targetPct;
  else state.pct += Math.sign(diff) * Math.min(Math.abs(diff), rate * dt);
  return Math.max(0, Math.min(1, state.pct));
}

/**
 * 在 canvas 上畫人臉「圓框」，圓周本身就是進度條：從正上方 12 點鐘
 * 方向順時針繞一圈，圓周閉合 = 採樣完成。實際採樣速度雖快，但顯示
 * 用 ease（1.5 秒滿格），讓使用者看到「轉圈」過程。
 * faceData: Array<{ faceId, box, framesCollected, targetFrames, done }>
 */
export function drawFaceBoxes(canvas, faceData) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const now = Date.now();
  const seen = new Set();
  for (const f of faceData || []) {
    if (!f.box) continue;
    const [x, y, w, h] = f.box;
    seen.add(f.faceId);
    const cx = x + w / 2;
    const cy = y + h / 2;
    // 半徑：取臉框較短那邊的一半（剛好內切於臉，不會撐到背景）
    const radius = Math.min(w, h) / 2;
    const targetPct = f.done ? 1 : (f.targetFrames > 0 ? Math.min(1, f.framesCollected / f.targetFrames) : 0);
    const pct = _easeProgress(f.faceId, targetPct, now);

    // 1. 底層淡灰整圈（讓使用者看到圓在哪裡）
    ctx.strokeStyle = 'rgba(138, 140, 152, 0.6)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, 2 * Math.PI);
    ctx.stroke();

    // 2. 綠色進度弧 — 從 12 點鐘方向順時針掃到 pct
    if (pct > 0) {
      const startAngle = -Math.PI / 2;
      const endAngle = startAngle + 2 * Math.PI * pct;
      ctx.strokeStyle = '#1e8050';
      ctx.lineWidth = 8;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(cx, cy, radius, startAngle, endAngle);
      ctx.stroke();
    }

    // 3. 完成標記（顯示進度也滿了才顯示）
    if (f.done && pct >= 0.99) {
      ctx.fillStyle = '#1e8050';
      ctx.font = 'bold 48px sans-serif';
      ctx.textBaseline = 'middle';
      ctx.fillText('✓', cx + radius * 0.45, cy - radius * 0.45);
    }
  }
  // 清掉看不見的 face 的 ease state
  for (const id of [..._progressDisplay.keys()]) {
    if (!seen.has(id)) _progressDisplay.delete(id);
  }
}

export function drawRoi(canvas, roiBox) {
  if (!roiBox) return;
  const ctx = canvas.getContext('2d');
  ctx.strokeStyle = '#2a6bb8';
  ctx.setLineDash([10, 5]);
  ctx.lineWidth = 3;
  ctx.strokeRect(roiBox.x, roiBox.y, roiBox.w, roiBox.h);
  ctx.setLineDash([]);
  ctx.fillStyle = '#2a6bb8';
  ctx.font = '20px sans-serif';
  ctx.fillText('請站這裡', roiBox.x + 10, roiBox.y + 30);
}

/** 依當前時段回傳合適的問候：早安 / 午安 / 晚安 */
function timeGreeting() {
  const h = new Date().getHours();
  if (h >= 5 && h < 11) return '早安';
  if (h >= 11 && h < 18) return '午安';
  return '晚安';
}

/** 把 TTS / 視覺模板中的 {name} / {greeting} 變數展開 */
function fillTemplate(tpl, { name }) {
  return String(tpl ?? '')
    .replace(/\{name\}/g, name ?? '')
    .replace(/\{greeting\}/g, timeGreeting());
}

export function showCheckinResult(rootEl, { decision, person, ttsConfig, watchlistInfo }) {
  const card = document.createElement('div');
  const toneClass = watchlistInfo ? `tone-${watchlistInfo.tone}` : '';
  card.className = `result-card result-${decision} ${toneClass}`.trim();
  const badge = watchlistInfo
    ? `<div class="result-badge">${escapeHtml(watchlistInfo.label)}</div>`
    : '';
  if (decision === 'fuzzy') {
    card.innerHTML = `<div class="result-icon">✓</div><div class="result-text">已完成</div>${badge}`;
  } else if (person?.displayName) {
    const visualText = fillTemplate(ttsConfig?.templateNamed || '{name} {greeting}', { name: person.displayName });
    card.innerHTML = `<div class="result-icon">✓</div><div class="result-text">${escapeHtml(visualText)}</div>${badge}`;
    if (ttsConfig?.enabled && audioMode === 'tts') {
      speak(visualText);
    }
  } else {
    card.innerHTML = `<div class="result-icon">✓</div><div class="result-text">${timeGreeting()}，歡迎光臨</div>${badge}`;
  }
  rootEl.appendChild(card);
  // critical / warn 名單延長停留時間（工作人員需要看清楚）
  const dwell = watchlistInfo && (watchlistInfo.tone === 'critical' || watchlistInfo.tone === 'warn') ? 5000 : 2500;
  setTimeout(() => card.remove(), dwell);
}

export function showAlertPopup(rootEl, { person, message, sound }) {
  const popup = document.createElement('div');
  popup.className = 'alert-popup';
  popup.innerHTML = `
    <div class="alert-card">
      <h2>⚠️ 警示</h2>
      <p>${escapeHtml(person?.displayName || '名單命中')}</p>
      <p>${escapeHtml(message || '')}</p>
      <div class="consent-actions">
        <button class="btn-modal btn-modal-primary alert-dismiss">確認</button>
      </div>
    </div>
  `;
  rootEl.appendChild(popup);
  let audio;
  if (sound?.url && audioMode !== 'silent') {
    audio = new Audio(sound.url);
    audio.loop = sound.mode === 'repeat' && sound.repeatUntilDismissed;
    audio.play().catch(() => {});
  }
  popup.querySelector('.alert-dismiss').addEventListener('click', () => {
    audio?.pause();
    popup.remove();
  });
}

export function showRetry(rootEl, msg = '請再試一次') {
  const card = document.createElement('div');
  card.className = 'result-card result-retry';
  card.innerHTML = `<div class="result-text">${escapeHtml(msg)}</div>`;
  rootEl.appendChild(card);
  setTimeout(() => card.remove(), 2000);
}

export function showToast(rootEl, msg, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = msg;
  (rootEl || document.body).appendChild(toast);
  setTimeout(() => toast.remove(), 2200);
}

export async function showConsentDialog(rootEl, { message, requireExplicit }) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'consent-overlay';
    const checkboxHtml = requireExplicit
      ? `<label class="field-row" style="margin-top:16px;"><input type="checkbox" class="consent-cb" style="flex:0;width:24px;height:24px;"> <span style="flex:1;">我已知悉並同意</span></label>`
      : '';
    overlay.innerHTML = `
      <div class="consent-card">
        <h2>個資告知</h2>
        <p>${escapeHtml(message)}</p>
        ${checkboxHtml}
        <div class="consent-actions">
          <button class="btn-modal btn-modal-cancel consent-cancel">取消</button>
          <button class="btn-modal btn-modal-primary consent-ok">同意並繼續</button>
        </div>
      </div>
    `;
    rootEl.appendChild(overlay);
    const ok = overlay.querySelector('.consent-ok');
    const cancel = overlay.querySelector('.consent-cancel');
    const cb = overlay.querySelector('.consent-cb');
    if (requireExplicit) {
      ok.disabled = true;
      cb.addEventListener('change', () => ok.disabled = !cb.checked);
    }
    ok.addEventListener('click', () => { overlay.remove(); resolve(true); });
    cancel.addEventListener('click', () => { overlay.remove(); resolve(false); });
  });
}

/**
 * 欄位類型：
 *  - 'bool'        → checkbox，回傳 boolean
 *  - 'text'        → 單行 input，回傳 string
 *  - 'select'      → dropdown，回傳 string
 *  - 'multi-text'  → 多值輸入，可按「+ 新增」加入更多，回傳 string[]
 */
export async function showExtraFieldsDialog(rootEl, fields) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'fields-overlay';

    const fieldHtml = fields.map(f => {
      if (f.type === 'bool') {
        return `
          <div class="field-row">
            <label for="ef-${f.key}">${escapeHtml(f.label)}</label>
            <input type="checkbox" id="ef-${f.key}" name="${f.key}" style="flex:0;width:24px;height:24px;">
          </div>`;
      }
      if (f.type === 'select') {
        return `
          <div class="field-row">
            <label for="ef-${f.key}">${escapeHtml(f.label)}</label>
            <select id="ef-${f.key}" name="${f.key}">
              ${(f.options || []).map(o => `<option>${escapeHtml(o)}</option>`).join('')}
            </select>
          </div>`;
      }
      if (f.type === 'multi-text') {
        return `
          <div class="multi-text-row" data-key="${f.key}">
            <label>${escapeHtml(f.label)}</label>
            <div class="multi-text-list">
              <div class="multi-text-item">
                <input type="text" placeholder="${escapeHtml(f.placeholder || '請輸入')}">
                <button type="button" class="multi-text-remove" aria-label="移除">×</button>
              </div>
            </div>
            <button type="button" class="multi-text-add">+ 新增一筆</button>
          </div>`;
      }
      return `
        <div class="field-row">
          <label for="ef-${f.key}">${escapeHtml(f.label)}</label>
          <input type="text" id="ef-${f.key}" name="${f.key}" placeholder="${escapeHtml(f.placeholder || '')}">
        </div>`;
    }).join('');

    overlay.innerHTML = `
      <div class="fields-card">
        <h2>請補充資訊</h2>
        ${fieldHtml}
        <div class="fields-actions">
          <button class="btn-modal btn-modal-cancel fields-skip">跳過</button>
          <button class="btn-modal btn-modal-primary fields-ok">確認</button>
        </div>
      </div>
    `;
    rootEl.appendChild(overlay);

    overlay.querySelectorAll('.multi-text-row').forEach(row => {
      const list = row.querySelector('.multi-text-list');
      const wireRemove = (btn) => btn.addEventListener('click', () => {
        if (list.children.length > 1) btn.closest('.multi-text-item').remove();
        else {
          const input = btn.parentElement.querySelector('input');
          if (input) input.value = '';
        }
      });
      row.querySelectorAll('.multi-text-remove').forEach(wireRemove);
      row.querySelector('.multi-text-add').addEventListener('click', () => {
        const item = document.createElement('div');
        item.className = 'multi-text-item';
        item.innerHTML = `
          <input type="text" placeholder="請輸入">
          <button type="button" class="multi-text-remove" aria-label="移除">×</button>
        `;
        list.appendChild(item);
        wireRemove(item.querySelector('.multi-text-remove'));
        item.querySelector('input').focus();
      });
    });

    overlay.querySelector('.fields-ok').addEventListener('click', () => {
      const result = {};
      for (const f of fields) {
        if (f.type === 'bool') {
          const el = overlay.querySelector(`[name="${f.key}"]`);
          result[f.key] = el?.checked || false;
        } else if (f.type === 'multi-text') {
          const row = overlay.querySelector(`.multi-text-row[data-key="${f.key}"]`);
          const values = [...row.querySelectorAll('input[type=text]')]
            .map(i => i.value.trim())
            .filter(Boolean);
          result[f.key] = values;
        } else {
          const el = overlay.querySelector(`[name="${f.key}"]`);
          result[f.key] = el?.value || '';
        }
      }
      overlay.remove();
      resolve({ submitted: true, values: result });
    });
    overlay.querySelector('.fields-skip').addEventListener('click', () => {
      overlay.remove();
      resolve({ submitted: false, values: null });
    });
  });
}

function speak(text) {
  if (audioMode !== 'tts') return;
  try {
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'zh-TW';
    speechSynthesis.speak(u);
  } catch {}
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
