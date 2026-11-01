/* global __BUILD_ID__ */
import { setUi, showToast, welcomeOpen } from './ui.js';

const TABS = ['today', 'calendar', 'progress', 'awards'];

/** Deep links from notifications: #today, #calendar, #progress, #awards or #welcome. */
export function openFromUrl(url) {
  const hash = new URL(url, location.href).hash.slice(1);
  if (hash === 'welcome') welcomeOpen.value = true;
  else if (TABS.includes(hash)) setUi({ tab: hash });
}

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;
  navigator.serviceWorker.register('./sw.js', { scope: './' }).catch((e) => console.warn('Service worker failed', e));
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data?.type === 'open') openFromUrl(e.data.url);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkForUpdate();
  });
}

// iOS keeps Home Screen apps alive for days, so look for a newer build when the app comes back.
let lastCheck = Date.now();
async function checkForUpdate() {
  if (Date.now() - lastCheck < 30 * 60 * 1000) return;
  lastCheck = Date.now();
  try {
    const res = await fetch('./version.json', { cache: 'no-store' });
    const { build } = await res.json();
    if (build && build !== __BUILD_ID__) {
      showToast('A new version of Keep It Lit is ready.', {
        action: { label: 'Update', fn: () => location.reload() },
        duration: 12000,
      });
    }
  } catch {
    /* offline */
  }
}
