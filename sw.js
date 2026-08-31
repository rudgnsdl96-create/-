// 오프라인 캐시 (홈화면 앱 실행 시 데이터까지 캐싱)
const CACHE = 'hanja-v1';
const ASSETS = ['./','./index.html','./app.js','./manifest.webmanifest',
  './kanji_bank.json','./examples.json','./etymology.json','./word_bank.json',
  './icon-192.png','./icon-512.png','./apple-touch-icon.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(()=>self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(res=>{
    const cp=res.clone(); caches.open(CACHE).then(c=>c.put(e.request,cp)); return res;
  }).catch(()=>r)));
});
