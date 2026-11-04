const CACHE = 'olivebasket-v28';
const SHELL = [
  './',
  'basket',
  'style.css',
  'app.js',
  'admin.js',
  'manifest.webmanifest',
  'leaf.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // API · 사이트 회원(로그인 · 가입 · 내 정보) · 관리 화면은 늘 네트워크 (옛 로그인 상태가 캐시로 보이지 않게)
  if (e.request.method !== 'GET' || /^\/(api|xms-api|xms|member|board|login)(\/|$)/.test(url.pathname)) return;

  // 페이지 이동: 네트워크 우선, 실패(오프라인) 시 캐시
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).catch(() =>
        caches.match(e.request, { ignoreSearch: true }).then(hit => hit || caches.match('./'))
      )
    );
    return;
  }

  // 이미지(바구니·아이콘)는 늘 같으니 캐시 우선 — 바꿀 땐 CACHE 버전을 올리면 새로 받음
  if (url.origin === location.origin && /\.(png|jpe?g|webp|svg)$/.test(url.pathname)) {
    e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request).then(res => {
      if (res.ok && !res.redirected) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
      }
      return res;
    })));
    return;
  }

  // 같은 사이트 정적 파일(css·js): 네트워크 우선 → 새 페이지에 옛 css/js 가 섞이지 않게.
  // 받은 건 캐시에 갱신해 두고, 오프라인일 때만 캐시 사용 (리다이렉트 응답은 캐시하지 않음)
  if (url.origin === location.origin) {
    e.respondWith(
      fetch(e.request).then(res => {
        if (res.ok && !res.redirected) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
        }
        return res;
      }).catch(() => caches.match(e.request, { ignoreSearch: true }))
    );
    return;
  }

  // 외부(글꼴 등): 캐시 우선
  e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request)));
});
