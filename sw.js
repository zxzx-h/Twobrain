const CACHE_NAME = 'twobrain-v3';
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/storage.js',
  './js/reminder.js',
  './manifest.json'
];

// Install: 预缓存 App Shell
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Activate: 删除旧版本缓存
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: 网络优先 → 失败则用缓存（自动获取最新版本，断网时离线可用）
self.addEventListener('fetch', event => {
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // 网络请求成功 → 更新缓存 + 返回响应
        const clone = response.clone();
        caches.open(CACHE_NAME).then(cache =>
          cache.put(event.request, clone)
        );
        return response;
      })
      .catch(() => {
        // 网络失败 → 尝试缓存
        return caches.match(event.request);
      })
  );
});
