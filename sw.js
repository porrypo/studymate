// =============================================================
//  sw.js — 앱이 꺼져 있어도 푸시 알림을 받아서 화면에 띄우는 부분 (서비스 워커)
// =============================================================
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

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
