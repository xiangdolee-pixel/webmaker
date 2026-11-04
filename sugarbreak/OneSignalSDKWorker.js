// 예전 앱이 등록한 서비스워커(OneSignal) 정리용: 설치되면 스스로 해제된다.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.registration.unregister()));
