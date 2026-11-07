/* global __BUILD_ID__ */
import { setUi, showToast, welcomeOpen } from './ui.js';

const TABS = ['today', 'calendar', 'progress', 'awards'];

/** Deep links from notifications and Android shortcuts: #today, #calendar, #progress, #awards or #welcome. */
export function openFromUrl(url) {
  const hash = new URL(url, location.href).hash.slice(1);
  if (hash === 'welcome') welcomeOpen.value = true;
  else if (TABS.includes(hash)) setUi({ tab: hash });
  else return;
  // Clear it so a later reload doesn't jump to the same place again.
  if (location.hash.slice(1) === hash) history.replaceState(history.state, '', location.pathname + location.search);
}

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;
  navigator.serviceWorker.register('./sw.js', { scope: './' }).catch((e) => console.warn('Service worker failed', e));
  navigator.serviceWorker.addEventListener('message', (e) => {
    if (e.data?.type === 'open') openFromUrl(e.data.url);
  });
  document.addEventListener('visibilitychange', () => {
    // A newer version is saved and ready: switch to it while the app is in the background, so
    // it's simply there the next time you look. Your data is saved before this runs.
    if (document.visibilityState === 'hidden') {
      if (updateReady) location.reload();
    } else checkForUpdate();
  });
  // The app opens from the cache, so look for a newer build shortly after every launch too.
  setTimeout(checkForUpdate, 3000);
}

// iOS keeps Home Screen apps alive for days, so look for a newer build whenever the app comes back.
let lastCheck = 0;
let updateReady = false;

async function checkForUpdate() {
  if (updateReady || Date.now() - lastCheck < 60 * 1000) return;
  lastCheck = Date.now();
  try {
    const res = await fetch('./version.json', { cache: 'no-store' });
    const { build } = await res.json();
    if (!build || build === __BUILD_ID__) return;
    await saveNewestApp();
    updateReady = true;
    showToast('A new version of Keep It Lit is ready.', {
      action: { label: 'Update', fn: () => location.reload() },
      duration: 15000,
    });
  } catch {
    /* offline */
  }
}

/** Has the service worker download and keep the newest app, so a reload opens it right away. */
function saveNewestApp() {
  const sw = navigator.serviceWorker.controller;
  if (!sw) return Promise.resolve();
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => resolve();
    sw.postMessage({ type: 'refresh' }, [channel.port2]);
    setTimeout(resolve, 10000);
  });
}

/** When this version was built, for Settings: e.g. "Nov 4, 1:04 AM". */
export function buildLabel() {
  const b = __BUILD_ID__;
  const at = new Date(Date.UTC(+b.slice(0, 4), +b.slice(4, 6) - 1, +b.slice(6, 8), +b.slice(8, 10), +b.slice(10, 12)));
  return Number.isNaN(at.getTime())
    ? b
    : new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(at);
}
