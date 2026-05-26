import * as store from '../face-store.js';
import { mountPeopleTab } from './admin-tab-people.js';
import { mountEventsTab } from './admin-tab-events.js';
import { mountWatchlistsTab } from './admin-tab-watchlists.js';
import { mountConfigTab } from './admin-tab-config.js';
import { mountReportTab } from './admin-tab-report.js';
import { mountTuningTab } from './admin-tab-tuning.js';
import { mountSystemTab } from './admin-tab-system.js';

export async function mountAdmin(rootEl) {
  const db = await store.openFaceDb();
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
