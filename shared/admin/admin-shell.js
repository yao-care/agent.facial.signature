import * as store from '../face-store.js';
import { mountPeopleTab } from './admin-tab-people.js';
import { mountEventsTab } from './admin-tab-events.js';
import { mountWatchlistsTab } from './admin-tab-watchlists.js';
import { mountSettingsTab } from './admin-tab-settings.js';

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
    settings: () => mountSettingsTab(rootEl, db),
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
