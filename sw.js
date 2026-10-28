// Service worker: кэширует приложение целиком, чтобы оно открывалось офлайн.
// При изменении файлов поднимите версию — старый кэш будет удалён.
const CACHE = 'soap-calc-v7';
const FILES = ['./', './index.html', './src/styles.css', './src/app.js', './src/calc.js', './src/oils.js', './src/oils_ru.js', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', (e) => {
  // НЕ вызываем skipWaiting() сразу: при обновлении новый worker ждёт в состоянии
  // «waiting», пока пользователь не нажмёт «Обновить» (сообщение SKIP_WAITING ниже).
  // При первой установке активного worker нет, поэтому он активируется и так.
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

// Клиент просит ожидающий worker встать сразу — по кнопке «Обновить».
self.addEventListener('message', (e) => {
  if (e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// Сначала кэш, затем сеть; свежий ответ из сети обновляет кэш.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request).then((cached) => {
    const network = fetch(e.request).then((res) => {
      if (res.ok) caches.open(CACHE).then((c) => c.put(e.request, res.clone()));
      return res;
    }).catch(() => cached);
    return cached || network;
  }));
});
