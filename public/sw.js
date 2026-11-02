// Keep It Lit service worker: works offline, shows reminders, opens the app from a notification.
const CACHE = 'kil-v1';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/apple-touch-icon.png', './icons/favicon.svg'];

// Cache the app's built files (named in index.html) and drop old versions.
async function cacheApp(html) {
  const cache = await caches.open(CACHE);
  const assets = [...new Set([...html.matchAll(/(?:src|href)="\.?\/?(assets\/[^"]+)"/g)].map((m) => `./${m[1]}`))];
  await Promise.all(assets.map((url) => cache.match(url).then((hit) => hit || cache.add(url)).catch(() => {})));
  const keep = new Set(assets.map((u) => new URL(u, self.registration.scope).href));
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
    // Fresh page when online (so updates arrive), cached page when offline or slow.
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        const network = fetch(req).then(async (res) => {
          if (res.ok) {
            await cache.put('./index.html', res.clone());
            event.waitUntil(res.clone().text().then(cacheApp));
          }
          return res;
        });
        const timeout = new Promise((resolve) => setTimeout(resolve, 3500));
        const fast = await Promise.race([network.catch(() => null), timeout]);
        if (fast) return fast;
        const cached = await cache.match('./index.html');
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
    // Built files have content hashes in their names, so a cached copy is always right.
    event.respondWith(
      caches.match(req).then(
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
    caches.match(req).then((hit) => {
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
