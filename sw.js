// =============================================================
//  sw.js — 앱이 꺼져 있어도 푸시 알림을 받아서 화면에 띄우는 부분 (서비스 워커)
// =============================================================
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

// 업데이트가 바로 보이게: 이 사이트 파일은 항상 서버에 "바뀐 거 있어?" 하고 확인한 뒤 씀
// (브라우저나 Dock 앱이 옛날 화면을 계속 보여 주는 문제 방지. 인터넷이 끊기면 그냥 원래대로)
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  e.respondWith(fetch(url.href, { cache: 'no-cache', credentials: 'same-origin' }).catch(() => fetch(req)));
});

self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || '갓생메이트', {
    body: d.body || '새 알림이 있어요',
    tag: d.tag,
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
  }));
});

// 알림을 누르면 앱을 열고 알림 화면으로
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) {
      if ('focus' in w) { w.postMessage('open-notifs'); return w.focus(); }
    }
    return self.clients.openWindow('./#notifs');
  })());
});
