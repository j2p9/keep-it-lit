// Keep It Lit service worker: opens instantly and offline, shows reminders, opens the app from a notification.
const CACHE = 'kil-v3';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest?v=2',
  './icons/icon-192.png?v=2',
  './icons/apple-touch-icon.png?v=2',
  './icons/favicon.svg?v=2',
];

const assetsOf = (html) => [...new Set([...html.matchAll(/(?:src|href)="\.?\/?(assets\/[^"]+)"/g)].map((m) => `./${m[1]}`))];

// Cache the app's built files (named in index.html). Files of the version before are kept too,
// since the app that was just opened from the cache may still be loading them.
async function cacheApp(html, previousHtml = '') {
  const cache = await caches.open(CACHE);
  const assets = assetsOf(html);
  await Promise.all(assets.map((url) => cache.match(url, { ignoreVary: true }).then((hit) => hit || cache.add(url)).catch(() => {})));
  const keep = new Set([...assets, ...assetsOf(previousHtml)].map((u) => new URL(u, self.registration.scope).href));
  for (const req of await cache.keys()) {
    if (req.url.includes('/assets/') && !keep.has(req.url)) await cache.delete(req);
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(SHELL).catch(() => {});
      const res = await fetch('./index.html', { cache: 'no-store' });
      if (res.ok) {
        await cache.put('./index.html', res.clone());
        await cacheApp(await res.text());
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Supabase and other APIs go straight to the network

  if (req.mode === 'navigate') {
    // Open instantly from the cache, online or not, and fetch the newest page in the background
    // for next time. The app offers "Update" as soon as it sees a newer version.
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        const cached = await cache.match('./index.html', { ignoreVary: true });
        const previousHtml = cached ? await cached.clone().text() : '';
        const network = fetch(req).then(async (res) => {
          if (res.ok) {
            await cache.put('./index.html', res.clone());
            await cacheApp(await res.clone().text(), previousHtml);
          }
          return res;
        });
        if (cached) {
          event.waitUntil(network.catch(() => {}));
          return cached;
        }
        return network;
      })(),
    );
    return;
  }

  if (url.pathname.includes('/assets/')) {
    // Built files have content hashes in their names, so a cached copy is always right. Vary is
    // ignored: module scripts send an Origin header that the cached copy was stored without.
    event.respondWith(
      caches.match(req, { ignoreVary: true }).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  // Icons, manifest, version file: cached copy now, refreshed in the background.
  event.respondWith(
    caches.match(req, { ignoreVary: true }).then((hit) => {
      const network = fetch(req)
        .then((res) => {
          if (res.ok && !url.pathname.endsWith('version.json')) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => hit);
      return url.pathname.endsWith('version.json') ? network : hit || network;
    }),
  );
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data?.text() };
  }
  const title = data.title || 'Keep It Lit';
  event.waitUntil(
    (async () => {
      await self.registration.showNotification(title, {
        body: data.body || 'Time to check in on your goals 🔥',
        icon: './icons/icon-192.png',
        badge: './icons/badge-72.png', // Android status-bar icon
        tag: data.tag || 'keep-it-lit',
        renotify: true,
        vibrate: [60, 40, 60], // Android
        data: { url: data.url || './#today' },
      });
      if (typeof data.badge === 'number' && self.navigator.setAppBadge) {
        try {
          if (data.badge > 0) await self.navigator.setAppBadge(data.badge);
          else await self.navigator.clearAppBadge();
        } catch {
          /* badges are optional */
        }
      }
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || './', self.registration.scope).href;
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of windows) {
        if (client.url.startsWith(self.registration.scope)) {
          await client.focus();
          client.postMessage({ type: 'open', url: target });
          return;
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});
