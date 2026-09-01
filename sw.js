// 네트워크 우선(Network-first) — 열 때마다 최신 파일을 받고, 오프라인일 때만 캐시 사용.
// 코드·데이터가 바뀌면 앱을 껐다 켜거나 새로고침하면 자동 반영됩니다.
const CACHE = 'hanja-v3';
const ASSETS = ['./','./index.html','./app.js','./manifest.webmanifest',
  './kanji_bank.json','./examples.json','./etymology.json','./word_bank.json',
  './icon-192.png','./icon-512.png','./apple-touch-icon.png'];

self.addEventListener('install', e => {
  // 새 서비스워커를 즉시 활성화
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).catch(()=>{}));
});

self.addEventListener('activate', e => {
  // 옛 캐시 삭제 + 즉시 제어
  e.waitUntil(
    caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  // 네트워크 우선: 최신을 받아 캐시에 갱신, 실패(오프라인)하면 캐시 사용
  e.respondWith(
    fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy)).catch(()=>{});
      return res;
    }).catch(() => caches.match(e.request).then(r => r || caches.match('./index.html')))
  );
});
