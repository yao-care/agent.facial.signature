import * as store from '../face-store.js';
import { mountPeopleTab } from './admin-tab-people.js';
import { mountEventsTab } from './admin-tab-events.js';
import { mountWatchlistsTab } from './admin-tab-watchlists.js';
import { mountSettingsTab } from './admin-tab-settings.js';

export async function mountAdmin(rootEl) {
  const db = await store.openFaceDb();
  let currentTab = 'people';

  const tabs = {
    people: () => mountPeopleTab(rootEl, db),
    events: () => mountEventsTab(rootEl, db),
    watchlists: () => mountWatchlistsTab(rootEl, db),
    settings: () => mountSettingsTab(rootEl, db),
  };

  document.querySelectorAll('.admin-tabs button').forEach(btn => {
    btn.addEventListener('click', () => {
      currentTab = btn.dataset.tab;
      document.querySelectorAll('.admin-tabs button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      rootEl.innerHTML = '';
      tabs[currentTab]();
    });
  });

  await tabs.people();
}
