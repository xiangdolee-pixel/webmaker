// portfolio — 비밀번호를 넣어야 보이는 포트폴리오
//   비밀번호는 리포에 두지 않는다(공개 리포): Worker 비밀값 PORTFOLIO_PASSWORD
//     node deploy.mjs --wrangler secret put PORTFOLIO_PASSWORD --name portfolio
//   맞게 넣으면 30일 동안 쿠키(비밀번호로 서명한 값)로 통과. 비밀번호를 바꾸면 예전 쿠키는 저절로 무효.
//   그 밖(페이지 · /xms 관리 · /member)은 xim 공통 사이트 Worker 가 맡는다.
import site from '../../xim/_worker/site-worker.js';

const COOKIE = 'pf_ok';
const MAX_AGE = 60 * 60 * 24 * 30;
// 비밀번호 없이 열리는 것: 관리 화면 · 회원(자체 로그인), 파비콘 · CSS(비밀번호 화면이 씀)
const OPEN = /^\/(xms|xms-api|member)(\/|$)|^\/(icon-\d+\.png|favicon\.ico|robots\.txt)$|^\/css\//;

const enc = new TextEncoder();
async function sign(secret) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode('portfolio-ok-v1'));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function same(a, b) {
  const x = enc.encode(String(a)), y = enc.encode(String(b));
  if (x.length !== y.length) return false;
  let d = 0;
  for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i];
  return d === 0;
}
const cookieOf = (req, name) => (req.headers.get('Cookie') || '').split(/;\s*/).find((c) => c.startsWith(name + '='))?.slice(name.length + 1) || '';

function lockPage(error, next) {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
  return new Response(`<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>포트폴리오</title>
<link rel="icon" type="image/png" sizes="32x32" href="/icon-32.png">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css">
<link rel="stylesheet" href="/css/style.css?v=4">
</head>
<body>
<main class="lock">
  <form class="lock-box" method="post" action="/__unlock">
    <img class="lock-logo" src="/icon-192.png" alt="">
    <h1>포트폴리오</h1>
    <p>비밀번호를 입력해 주세요.</p>
    <input type="hidden" name="next" value="${esc(next)}">
    <input class="lock-in" type="password" name="pw" inputmode="numeric" autocomplete="current-password" aria-label="비밀번호" required autofocus>
    <button class="lock-btn" type="submit">보기</button>
    <p class="lock-err" role="alert">${error ? '비밀번호가 맞지 않습니다.' : ''}</p>
  </form>
</main>
</body>
</html>`, {
    status: error ? 401 : 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' },
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const secret = env.PORTFOLIO_PASSWORD || '';

    if (url.pathname === '/__unlock' && request.method === 'POST') {
      const form = await request.formData().catch(() => null);
      const pw = String(form?.get('pw') || '').trim();
      let next = String(form?.get('next') || '/');
      if (!next.startsWith('/') || next.startsWith('//')) next = '/';
      if (!secret || !same(pw, secret)) {
        await new Promise((r) => setTimeout(r, 800)); // 연달아 맞혀 보기 늦추기
        return lockPage(true, next);
      }
      return new Response(null, {
        status: 303,
        headers: {
          Location: next,
          'Set-Cookie': `${COOKIE}=${await sign(secret)}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; Secure; SameSite=Lax`,
          'Cache-Control': 'no-store',
        },
      });
    }

    if (!OPEN.test(url.pathname)) {
      const ok = secret && same(cookieOf(request, COOKIE), await sign(secret));
      if (!ok) {
        if (request.method === 'GET' && (request.headers.get('Accept') || '').includes('text/html')) return lockPage(false, url.pathname + url.search);
        return new Response('Unauthorized', { status: 401, headers: { 'Cache-Control': 'no-store' } });
      }
      const res = await (env.XMS ? site.fetch(request, env, ctx) : env.ASSETS.fetch(request));
      // 비밀번호 뒤의 내용은 브라우저 · 중간 캐시에 남기지 않는다
      const out = new Response(res.body, res);
      out.headers.set('Cache-Control', 'private, no-store');
      out.headers.set('X-Robots-Tag', 'noindex, nofollow');
      return out;
    }
    return env.XMS ? site.fetch(request, env, ctx) : env.ASSETS.fetch(request);
  },
};
