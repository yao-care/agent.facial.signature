import * as store from '../face-store.js';
import { showToast } from '../face-ui.js';
import { mountPeopleTab } from './admin-tab-people.js';
import { mountEventsTab } from './admin-tab-events.js';
import { mountWatchlistsTab } from './admin-tab-watchlists.js';
import { mountConfigTab } from './admin-tab-config.js';
import { mountReportTab } from './admin-tab-report.js';
import { mountTuningTab } from './admin-tab-tuning.js';
import { mountSystemTab } from './admin-tab-system.js';

export async function mountAdmin(rootEl) {
  const db = await store.openFaceDb();
  // 退冊生物特徵自動清除（載入時執行一次，落實最小化；失敗不可阻擋 admin 載入）
  try {
    const tuning = await store.getTuning(db);
    const { purgedCount } = await store.purgeInactiveBiometrics(db, { retentionDays: tuning.bioRetentionDays });
    if (purgedCount > 0) showToast(null, `已自動清除 ${purgedCount} 位退冊長者的生物特徵`, 'success');
  } catch (e) {
    console.warn('auto bio-purge failed', e);
  }
  let currentTab = 'people';
  // 跨 tab 傳遞的選取（例如從人員 tab 跳轉到紀錄 tab 並篩特定人員）
  let pendingEventsPersonId = null;

  const tabs = {
    people: () => mountPeopleTab(rootEl, db, { onViewEvents: switchToEventsForPerson }),
    events: () => {
      const personId = pendingEventsPersonId;
      pendingEventsPersonId = null;
      return mountEventsTab(rootEl, db, { initialPersonId: personId });
    },
    watchlists: () => mountWatchlistsTab(rootEl, db),
    config: () => mountConfigTab(rootEl, db),
    report: () => mountReportTab(rootEl, db),
    tuning: () => mountTuningTab(rootEl, db),
    system: () => mountSystemTab(rootEl, db),
  };

  function activateTab(name) {
    currentTab = name;
    document.querySelectorAll('.admin-tabs button').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === name);
    });
    rootEl.innerHTML = '';
    tabs[name]();
  }

  function switchToEventsForPerson(personId) {
    pendingEventsPersonId = personId;
    activateTab('events');
  }

  document.querySelectorAll('.admin-tabs button').forEach(btn => {
    btn.addEventListener('click', () => activateTab(btn.dataset.tab));
  });

  await tabs.people();
}
