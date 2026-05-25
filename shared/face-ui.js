// face-ui.js — UI 元件層：相機、疊圖、TTS、視覺反饋
// 不負責特徵向量數學（spec § 3.1）

// TTS 模式：'unset' | 'tts'（播報歡迎詞）| 'silent'（只視覺）
let audioMode = 'unset';

export function getAudioMode() { return audioMode; }
export function setAudioMode(mode) { audioMode = mode; }

/**
 * 在頁面開啟時顯示「啟用語音」遮罩，讓使用者明確選擇：
 *  - 「播報歡迎詞」→ audioMode='tts'，並觸發一次空語音以解鎖 audio context
 *  - 「不用」 → audioMode='silent'
 */
export function setupAudioChoice(rootEl) {
  if (audioMode !== 'unset') return;
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
    });
  });
}

// 向後相容舊名稱（template 還在使用）
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

/**
 * 在 canvas 上畫人臉框 + 進度條。
 * faceData: Array<{ faceId, box, framesCollected, targetFrames, done }>
 */
export function drawFaceBoxes(canvas, faceData) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (const f of faceData || []) {
    if (!f.box) continue;
    const [x, y, w, h] = f.box;
    const pct = f.targetFrames > 0 ? Math.min(1, f.framesCollected / f.targetFrames) : 0;

    // 人臉框：done = 綠色 / sampling = 黃綠 / idle = 灰
    if (f.done) ctx.strokeStyle = '#1e8050';
    else if (pct > 0) ctx.strokeStyle = '#1e8050';
    else ctx.strokeStyle = '#8a8c98';
    ctx.lineWidth = 4;
    ctx.strokeRect(x, y, w, h);

    // 進度條（框上方 10px 寬度與框同）
    if (pct > 0 || f.done) {
      const barY = Math.max(0, y - 18);
      const barH = 10;
      ctx.fillStyle = 'rgba(220, 224, 230, 0.85)';
      ctx.fillRect(x, barY, w, barH);
      ctx.fillStyle = '#1e8050';
      ctx.fillRect(x, barY, w * pct, barH);
      // 進度文字（框右上）
      ctx.fillStyle = '#1e2030';
      ctx.font = 'bold 20px sans-serif';
      const text = f.done ? '✓ 完成' : `${f.framesCollected} / ${f.targetFrames}`;
      ctx.fillText(text, x + w + 8, barY + barH);
    }
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

export function showCheckinResult(rootEl, { decision, person, ttsConfig }) {
  const card = document.createElement('div');
  card.className = `result-card result-${decision}`;
  if (decision === 'fuzzy') {
    card.innerHTML = `<div class="result-icon">✓</div><div class="result-text">已完成</div>`;
  } else if (person?.displayName) {
    card.innerHTML = `<div class="result-icon">✓</div><div class="result-text">${escapeHtml(person.displayName)}</div>`;
    if (ttsConfig?.enabled && audioMode === 'tts') {
      speak(ttsConfig.templateNamed.replace('{name}', person.displayName));
    }
  } else {
    card.innerHTML = `<div class="result-icon">✓</div><div class="result-text">歡迎光臨</div>`;
  }
  rootEl.appendChild(card);
  setTimeout(() => card.remove(), 2500);
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
