// portfolio — 비밀번호를 넣어야 보이는 포트폴리오
//   비밀번호는 리포에 두지 않는다(공개 리포): Worker 비밀값 PORTFOLIO_PASSWORD
//     node deploy.mjs --wrangler secret put PORTFOLIO_PASSWORD --name portfolio
//   접속할 때마다(새로고침 포함) 비밀번호를 묻는다:
//     맞게 넣으면 한 번 쓰는 표(pf_once, 30초)로 페이지를 딱 한 번 열고, 그 응답에서 표를 지운다.
//     이미지 · 그 밖의 파일은 따로 짧은 표(pf_ok, 10분)로 통과. 표는 비밀번호로 서명 → 비밀번호를 바꾸면 무효.
//   카드의 사이트명 · 설명 · 이미지는 각 사이트 xms 설정을 읽어 채운다(5분 캐시):
//     사이트명 = 검색엔진 제목, 설명 = 카톡 미리보기 설명, 이미지 = 카톡 미리보기 그림. 비어 있으면 index.html 에 적힌 그대로.
//   그 밖(페이지 · /xms 관리 · /member)은 xim 공통 사이트 Worker 가 맡는다.
import site from '../../xim/_worker/site-worker.js';

const ONCE = 'pf_once', ONCE_AGE = 30;   // 페이지 한 번 열기
const FILES = 'pf_ok', FILES_AGE = 600;  // 이미지 등
// 비밀번호 없이 열리는 것: 관리 화면 · 회원(자체 로그인), 파비콘 · CSS(비밀번호 화면이 씀)
const OPEN = /^\/(xms|xms-api|member)(\/|$)|^\/(icon-\d+\.png|favicon\.ico|robots\.txt)$|^\/css\//;

const enc = new TextEncoder();
async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
// 표 = 만료시각.서명
async function ticket(secret, kind, age) {
  const exp = Math.floor(Date.now() / 1000) + age;
  return `${exp}.${await hmac(secret, `portfolio-v2:${kind}:${exp}`)}`;
}
async function valid(secret, kind, value) {
  const [exp, sig] = String(value).split('.');
  if (!secret || !sig || !(Number(exp) > Date.now() / 1000)) return false;
  return same(sig, await hmac(secret, `portfolio-v2:${kind}:${exp}`));
}
const cookie = (name, value, age) => `${name}=${value}; Path=/; Max-Age=${age}; HttpOnly; Secure; SameSite=Lax`;
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
<link rel="stylesheet" href="/css/style.css?v=6">
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

// ── 각 사이트의 xms 설정 읽기 ──
//   사이트 주소로 직접 가져오면 같은 계정 Worker 끼리는 Cloudflare 가 막는 곳이 있어(오류 1014, 올리브바스켓)
//   xms 에 서비스 바인딩으로 바로 묻는다 — 사이트 Worker 가 html 머리를 채울 때 쓰는 그 값(/xms-api/site-head).
const OG_TTL = 300;
async function readSite(env, ctx, slug, origin) {
  const key = new Request(`https://portfolio-og.cache/${encodeURIComponent(slug)}`);
  const hit = await caches.default.match(key).catch(() => null);
  if (hit) return hit.json();
  let out = {};
  try {
    const r = await env.XMS.fetch(new Request(`${origin}/xms-api/site-head`, { headers: { 'X-Xim-Site': slug } }));
    if (r.ok) {
      const h = (await r.json()).head || {};
      out = { name: h.title || '', desc: h.share_description || '', image: h.og_image ? new URL(h.og_image, origin).href : '' };
      ctx.waitUntil(caches.default.put(key, new Response(JSON.stringify(out), { headers: { 'Content-Type': 'application/json', 'Cache-Control': `max-age=${OG_TTL}` } })).catch(() => {}));
    }
  } catch { /* 못 읽으면 index.html 에 적힌 그대로 */ }
  return out;
}
// 카드(a.card data-xim=사이트 이름표)마다 xms 값으로 사이트명 · 설명 · 이미지를 바꿔 끼운다
async function fillCards(res, env, ctx) {
  const html = await res.text();
  const cards = [...html.matchAll(/<a class="card" href="([^"]+)" data-xim="([^"]+)"/g)].map((m) => ({ href: m[1], slug: m[2] }));
  const info = env.XMS ? await Promise.all(cards.map((c) => readSite(env, ctx, c.slug, new URL(c.href).origin))) : [];
  let rw = new HTMLRewriter();
  cards.forEach((c, i) => {
    const d = info[i] || {}, sel = `a.card[data-xim="${c.slug}"]`;
    if (d.name) rw = rw.on(`${sel} .name`, { element(e) { e.setInnerContent(d.name); } })
      .on(`${sel} .thumb img`, { element(e) { e.setAttribute('alt', `${d.name} 공유 이미지`); } });
    if (d.desc) rw = rw.on(`${sel} .desc`, { element(e) { e.setInnerContent(d.desc); } });
    if (d.image) rw = rw.on(`${sel} .thumb img`, { element(e) { e.setAttribute('src', d.image); } });
  });
  return rw.transform(new Response(html, res));
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
      const h = new Headers({ Location: next, 'Cache-Control': 'no-store' });
      h.append('Set-Cookie', cookie(ONCE, await ticket(secret, 'once', ONCE_AGE), ONCE_AGE));
      h.append('Set-Cookie', cookie(FILES, await ticket(secret, 'files', FILES_AGE), FILES_AGE));
      return new Response(null, { status: 303, headers: h });
    }

    if (!OPEN.test(url.pathname)) {
      const isPage = request.method === 'GET' && (request.headers.get('Accept') || '').includes('text/html');
      const ok = isPage ? await valid(secret, 'once', cookieOf(request, ONCE)) : await valid(secret, 'files', cookieOf(request, FILES));
      if (!ok) {
        if (isPage) return lockPage(false, url.pathname + url.search);
        return new Response('Unauthorized', { status: 401, headers: { 'Cache-Control': 'no-store' } });
      }
      let res = await (env.XMS ? site.fetch(request, env, ctx) : env.ASSETS.fetch(request));
      if (isPage && /^\/(index\.html)?$/.test(url.pathname) && (res.headers.get('Content-Type') || '').includes('text/html')) res = await fillCards(res, env, ctx);
      // 비밀번호 뒤의 내용은 브라우저 · 중간 캐시에 남기지 않는다
      const out = new Response(res.body, res);
      out.headers.set('Cache-Control', 'private, no-store');
      out.headers.set('X-Robots-Tag', 'noindex, nofollow');
      if (isPage) out.headers.append('Set-Cookie', cookie(ONCE, '', 0)); // 한 번 썼으면 지움 → 다음 접속 · 새로고침은 다시 비밀번호
      return out;
    }
    return env.XMS ? site.fetch(request, env, ctx) : env.ASSETS.fetch(request);
  },
};
