// face-checkin-template.js — 完整簽到流程：orchestrates engine + store + ui + lock + persistent
// 從環境檢查 → 單 tab 鎖 → persistent storage → UI 設置 → DB + 相機開啟 →
// 引擎啟動 → 去重節流 → 決策 (match/new/fuzzy) → consent/extraFields → event 寫入 → 反饋

import * as store from './face-store.js';
import { createFaceEngine, MODEL_VERSION } from './face-engine.js';
import * as ui from './face-ui.js';
import { acquireSingleTabLock } from './single-tab-lock.js';
import { requestPersistentStorage } from './persistent-storage.js';
import { accumulateVectors } from './face-store.js';

export async function runCheckin(config, rootEl) {
  // 1. 環境檢查 — file:// protocol 不支援攝影機
  if (location.protocol === 'file:') {
    rootEl.innerHTML = `<div class="error">請使用 HTTPS 或加入主畫面以 PWA 開啟（file:// 不支援攝影機）</div>`;
    return;
  }

  // 2. 單 tab 鎖 — 若另一個 tab 已開啟，本頁進入唯讀模式
  const lock = await acquireSingleTabLock();
  if (!lock.acquired) {
    rootEl.innerHTML = `<div class="readonly">另一個 tab 已開啟，本頁進入唯讀模式</div>`;
    return;
  }

  // 3. Persistent storage 請求（允許但非強制）
  await requestPersistentStorage();

  // 4. UI 骨架（含樣式、標題、視訊容器）
  rootEl.innerHTML = `
    <link rel="stylesheet" href="./shared/face-ui.css">
    <header><h1>${escape(config.scenarioName)}</h1></header>
    <div class="cam-container" style="position:relative;">
      <video id="cam" autoplay playsinline muted></video>
    </div>
  `;
  applyTheme(rootEl, config.uiTheme);
  const video = rootEl.querySelector('#cam');
  const camContainer = rootEl.querySelector('.cam-container');

  // 音訊解鎖（iOS）
  ui.setupAudioUnlock(rootEl);

  // 5. 開啟資料庫 + 設置相機 + overlay canvas
  const db = await store.openFaceDb();
  await ui.setupCamera(video);
  const overlay = ui.createOverlayCanvas(video, camContainer);

  // 6. 啟動引擎 — 帶 tuning 參數、支援 single-roi 並行模式
  const tuning = await store.getTuning(db);
  const roiBox = config.concurrency === 'single-roi' ? computeCenterRoi(video) : null;

  const engine = await createFaceEngine({
    videoElement: video,
    tuning,
    concurrency: config.concurrency,
    singleRoiBox: roiBox,
  });

  // 7. 去重節流：記錄每個 personId 最後寫 event 的時間（防止毫秒級重複）
  const lastEventTs = new Map();

  // === 主流程：faceResult → match → decision → consent/extraFields → write ===
  engine.on('faceResult', async (result) => {
    // 超時（未收足採樣）→ 重試提示
    if (result.timedOut) {
      ui.showRetry(rootEl, '請正面對鏡頭、摘下口罩');
      return;
    }

    // 對向量進行匹配
    const matchResult = await store.match(db, result.vectors, engine.modelVersion);
    const decision = matchResult.decision; // 'match' | 'new' | 'fuzzy'

    let personId = null;
    let isNewPerson = false;
    let person = null;
    let extraValues = null;

    // === 個資同意（僅 decision='new'） ===
    if (decision === 'new' && config.consentNotice?.enabled) {
      const ok = await ui.showConsentDialog(rootEl, {
        message: config.consentNotice.message,
        requireExplicit: config.consentNotice.requireExplicitConsent,
      });
      if (!ok) return; // 拒絕 → 不寫 event，直接返回
    }

    // === 補充欄位收集 ===
    if (config.extraFields?.length) {
      const fieldsToCollect = await pickExtraFields(db, config.extraFields, decision, null, matchResult);
      if (fieldsToCollect.length) {
        const r = await ui.showExtraFieldsDialog(rootEl, fieldsToCollect);
        if (!r.submitted) {
          // 如有必填欄位且用戶跳過 → 中止，不寫 event
          const anyRequired = fieldsToCollect.some(f => f.required);
          if (anyRequired) return;
        } else {
          extraValues = r.values;
        }
      }
    }

    // === 寫 person/event 邏輯 ===
    const snapshotBlob = result.snapshot;
    let snapshotId = null;
    if (snapshotBlob) snapshotId = await store.writeSnapshot(snapshotBlob);

    if (decision === 'match') {
      // 已知人士 → 去重檢查
      personId = matchResult.candidates[0].personId;
      const last = lastEventTs.get(personId) ?? 0;
      if (Date.now() - last < config.dedupWindowMs) {
        // 在 dedup window 內 → 僅顯示結果，跳過 event 寫入與向量回寫
        person = await store.getPerson(db, personId);
        ui.showCheckinResult(rootEl, { decision, person, ttsConfig: config.tts });
        return;
      }
      lastEventTs.set(personId, Date.now());

      // 回寫已知人士的向量（分佈式污染守衛） § 8.3
      person = await store.getPerson(db, personId);
      await accumulateVectors(db, personId, result.vectors, {
        contaminationGuard: tuning.contaminationGuard,
        vectorsPerPersonCap: tuning.vectorsPerPersonCap,
      });
    } else if (decision === 'new') {
      // 新人 → 直接寫入所有向量（empty-target fallback 同效果）
      person = await store.createPerson(db, {
        vectors: result.vectors,
        modelVersion: engine.modelVersion,
        meta: extractPersonMeta(config.extraFields, extraValues),
      });
      personId = person.id;
      isNewPerson = true;
    } else if (decision === 'fuzzy') {
      // 模糊命中 → 不建檔；寫 event personId=null + needsReview=true
      personId = null;
    }

    // === event meta 提取與寫入 ===
    const eventMeta = extractEventMeta(config.extraFields, extraValues);
    if (decision === 'fuzzy') {
      // fuzzy 在 meta 中記錄候選者（用於審核）
      eventMeta.candidates = matchResult.candidates;
    }

    await store.createEvent(db, {
      personId,
      scenario: config.scenarioId,
      mode: 'checkin',
      decision,
      modelVersion: engine.modelVersion,
      matchSimilarity: matchResult.topSimilarity,
      matchScope: matchResult.matchScope,
      samplingQuality: result.samplingQuality,
      isNewPerson,
      needsReview: decision === 'fuzzy',
      snapshotId,
      meta: eventMeta,
    });

    // === UI 反饋 ===
    ui.showCheckinResult(rootEl, { decision, person, ttsConfig: config.tts });
  });

  engine.on('error', err => {
    console.error('engine error', err);
    ui.showRetry(rootEl, '系統錯誤，請重整頁面');
  });

  // 8. 啟動引擎
  if (config.trigger === 'manual') {
    setupManualTrigger(rootEl, config.manualUi, engine);
  } else {
    engine.start();
  }
}

function setupManualTrigger(rootEl, manualUi, engine) {
  const btn = document.createElement('button');
  btn.className = 'manual-trigger';
  btn.textContent = manualUi.buttonLabel;
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    if (manualUi.countdownSec) {
      for (let i = manualUi.countdownSec; i > 0; i--) {
        btn.textContent = `${i}...`;
        await new Promise(r => setTimeout(r, 1000));
      }
    }
    engine.start();
    setTimeout(() => {
      engine.stop();
      btn.disabled = false;
      btn.textContent = manualUi.buttonLabel;
    }, 6000);
  });
  rootEl.appendChild(btn);
}

function computeCenterRoi(video) {
  // 中央 50% × 70% 區域（single-roi 並行模式）
  const w = video.videoWidth || 640;
  const h = video.videoHeight || 480;
  return { x: w * 0.25, y: h * 0.15, w: w * 0.5, h: h * 0.7 };
}

async function pickExtraFields(db, fields, decision, _personId, _matchResult) {
  // fuzzy → 僅收 event-scope 欄位
  if (decision === 'fuzzy') {
    return fields.filter(f => f.scope === 'event');
  }

  const result = [];
  for (const f of fields) {
    if (f.collectOn === 'every') {
      result.push(f);
    } else if (f.collectOn === 'newPersonOnly' && decision === 'new') {
      result.push(f);
    } else if (f.collectOn === 'firstTimeAtScenario') {
      // TODO: 查詢該 person 在該 scenario 的歷史 events；暫時每次都收集
      result.push(f);
    }
  }
  return result;
}

function extractPersonMeta(fields, values) {
  // 提取 scope=person 的欄位值存入 person.meta
  if (!values) return {};
  const out = {};
  for (const f of (fields || [])) {
    if (f.scope === 'person' && f.key in values) {
      out[f.key] = values[f.key];
    }
  }
  return out;
}

function extractEventMeta(fields, values) {
  // 提取 scope=event 的欄位值存入 event.meta
  if (!values) return {};
  const out = {};
  for (const f of (fields || [])) {
    if (f.scope === 'event' && f.key in values) {
      out[f.key] = values[f.key];
    }
  }
  return out;
}

function applyTheme(root, theme) {
  // 動態套用主題（primary色、背景色）
  if (!theme) return;
  if (theme.primary) root.style.setProperty('--primary', theme.primary);
  if (theme.background) root.style.background = theme.background;
}

function escape(s) {
  // HTML escaping for safe text insertion
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}
