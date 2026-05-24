// face-ui.js — UI 元件層：相機、疊圖、TTS、視覺反饋
// 不負責特徵向量數學（spec § 3.1）

let audioUnlocked = false;

export function setupAudioUnlock(rootEl) {
  if (audioUnlocked) return;
  const overlay = document.createElement('div');
  overlay.className = 'audio-unlock-overlay';
  overlay.innerHTML = `
    <div class="audio-unlock-card">
      <h2>請點任意處啟用聲音</h2>
      <p>iOS 與部分瀏覽器要求使用者互動後才能播放語音。</p>
    </div>
  `;
  rootEl.appendChild(overlay);
  const unlock = () => {
    audioUnlocked = true;
    // 觸發一次空語音以解鎖 audio context
    try {
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0;
      speechSynthesis.speak(u);
    } catch {}
    overlay.remove();
  };
  overlay.addEventListener('click', unlock, { once: true });
  overlay.addEventListener('touchstart', unlock, { once: true });
}

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

export function drawFaceBoxes(canvas, faces, sessionsMeta) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (const face of faces) {
    const [x, y, w, h] = face.box;
    ctx.strokeStyle = '#22c55e';
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, w, h);
    const sess = sessionsMeta?.get(face.id);
    if (sess) {
      // progress bar
      const pct = Math.min(1, sess.framesCollected / sess.targetFrames);
      ctx.fillStyle = 'rgba(34, 197, 94, 0.3)';
      ctx.fillRect(x, y - 12, w, 6);
      ctx.fillStyle = '#22c55e';
      ctx.fillRect(x, y - 12, w * pct, 6);
    }
  }
}

export function drawRoi(canvas, roiBox) {
  if (!roiBox) return;
  const ctx = canvas.getContext('2d');
  ctx.strokeStyle = '#3b82f6';
  ctx.setLineDash([10, 5]);
  ctx.lineWidth = 3;
  ctx.strokeRect(roiBox.x, roiBox.y, roiBox.w, roiBox.h);
  ctx.setLineDash([]);
  ctx.fillStyle = '#3b82f6';
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
    if (ttsConfig?.enabled && audioUnlocked) {
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
      <button class="alert-dismiss">確認</button>
    </div>
  `;
  rootEl.appendChild(popup);
  let audio;
  if (sound?.url) {
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

export async function showConsentDialog(rootEl, { message, requireExplicit }) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'consent-overlay';
    const checkboxHtml = requireExplicit
      ? `<label><input type="checkbox" class="consent-cb"> 我已知悉並同意</label>`
      : '';
    overlay.innerHTML = `
      <div class="consent-card">
        <h2>個資告知</h2>
        <p>${escapeHtml(message)}</p>
        ${checkboxHtml}
        <div class="consent-actions">
          <button class="consent-cancel">取消</button>
          <button class="consent-ok">繼續</button>
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

export async function showExtraFieldsDialog(rootEl, fields) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'fields-overlay';
    const fieldHtml = fields.map(f => {
      if (f.type === 'bool') return `<label><input type="checkbox" name="${f.key}"> ${escapeHtml(f.label)}</label>`;
      if (f.type === 'select') return `<label>${escapeHtml(f.label)} <select name="${f.key}">${f.options.map(o => `<option>${escapeHtml(o)}</option>`).join('')}</select></label>`;
      return `<label>${escapeHtml(f.label)} <input type="text" name="${f.key}"></label>`;
    }).join('<br/>');
    overlay.innerHTML = `
      <div class="fields-card">
        <h2>請補資訊</h2>
        ${fieldHtml}
        <div class="fields-actions">
          <button class="fields-skip">跳過</button>
          <button class="fields-ok">確認</button>
        </div>
      </div>
    `;
    rootEl.appendChild(overlay);
    overlay.querySelector('.fields-ok').addEventListener('click', () => {
      const result = {};
      for (const f of fields) {
        const el = overlay.querySelector(`[name="${f.key}"]`);
        if (!el) continue;
        result[f.key] = f.type === 'bool' ? el.checked : el.value;
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
