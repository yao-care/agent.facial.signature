import * as store from './face-store.js';
import { createFaceEngine } from './face-engine.js';
import * as ui from './face-ui.js';
import { acquireSingleTabLock } from './single-tab-lock.js';
import { requestPersistentStorage } from './persistent-storage.js';

export async function runAlert(config, rootEl) {
  try {
    return await runAlertInner(config, rootEl);
  } catch (err) {
    console.error('[alert] startup failed:', err);
    rootEl.innerHTML = `<div class="error">啟動失敗：${escape(err.message || String(err))}<br><small>請開啟瀏覽器 DevTools 查看 console 詳情</small></div>`;
  }
}

async function runAlertInner(config, rootEl) {
  if (location.protocol === 'file:') {
    rootEl.innerHTML = `<div class="error">請使用 HTTPS 或加入主畫面開啟</div>`;
    return;
  }

  const lock = await acquireSingleTabLock();
  if (!lock.acquired) {
    rootEl.innerHTML = `<div class="readonly">另一個 tab 已開啟，本頁進入唯讀模式</div>`;
    return;
  }

  await requestPersistentStorage();

  rootEl.innerHTML = `
    <header><h1>${escape(config.scenarioName)}</h1></header>
    <div class="cam-container" style="position:relative;">
      <video id="cam" autoplay playsinline muted></video>
    </div>
  `;
  const video = rootEl.querySelector('#cam');
  const camContainer = rootEl.querySelector('.cam-container');

  const db = await store.openFaceDb();
  const watchlist = await store.getWatchlist(db, config.watchlistId);
  if (!watchlist) {
    rootEl.innerHTML = `<div class="error">找不到名單 ${escape(config.watchlistId)}</div>`;
    return;
  }

  try {
    await ui.setupCamera(video);
  } catch (err) {
    rootEl.innerHTML = `<div class="error">無法開啟攝影機：${escape(err.message)}。請確認瀏覽器已授權相機、且沒有其他程式佔用。</div>`;
    return;
  }
  const overlay = ui.createOverlayCanvas(video, camContainer);

  const tuning = await store.getTuning(db);
  const engine = await createFaceEngine({
    videoElement: video,
    tuning,
    concurrency: config.concurrency,
  });

  // 即時人臉框 + 進度條
  engine.on('frameTick', ({ faces }) => {
    ui.drawFaceBoxes(overlay, faces);
  });

  const lastAlertTs = new Map();
  const TONE_BY_ID = { highrisk: 'critical', demented: 'warn', banned: 'critical' };
  const alertTone = watchlist.tone || TONE_BY_ID[watchlist.id] || 'warn';

  engine.on('faceResult', async (result) => {
    if (result.timedOut) return; // 警示模式靜默

    const matchResult = await store.match(db, result.vectors, engine.modelVersion, {
      candidatePersonIds: watchlist.personIds,
    });

    let decision = matchResult.decision;
    let personId = null;

    if (decision === 'new') return; // 不寫 event，靜默
    if (decision === 'match') {
      personId = matchResult.candidates[0].personId;
      // dedup
      const last = lastAlertTs.get(personId) ?? 0;
      if (Date.now() - last < config.dedupWindowMs) return;
      lastAlertTs.set(personId, Date.now());
      decision = 'alert-hit'; // template 改寫
    }
    // decision === 'fuzzy' → 仍跳警示，需 review

    let snapshotId = null;
    if (result.snapshot) snapshotId = await store.writeSnapshot(result.snapshot);

    const person = personId ? await store.getPerson(db, personId) : null;
    const meta = decision === 'fuzzy' ? { candidates: matchResult.candidates } : {};

    await store.createEvent(db, {
      personId,
      scenario: config.scenarioId,
      mode: 'alert',
      decision,
      modelVersion: engine.modelVersion,
      matchSimilarity: matchResult.topSimilarity,
      matchScope: 'watchlist',
      samplingQuality: result.samplingQuality,
      isNewPerson: false,
      needsReview: decision === 'fuzzy',
      snapshotId,
      meta,
    });

    ui.showAlertPopup(rootEl, {
      person,
      message: config.alertMessage,
      sound: config.alertSound,
      tone: alertTone,
    });
  });

  engine.start();
}

function escape(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
