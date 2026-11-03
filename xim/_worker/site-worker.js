// xim · xms 에 연결된 고객 사이트용 Worker — 모든 사이트가 이 파일을 그대로 복사해 쓴다.
//   <사이트폴더>/_worker/index.js       ← 이 파일 그대로
//   <사이트폴더>/_worker/bindings.json  ← { "vars": { "XIM_SITE": "<사이트 ID>" },
//                                         "services": [{ "binding": "XIM", "service": "xim", "entrypoint": "Engine" },
//                                                      { "binding": "XMS", "service": "xms", "entrypoint": "Cms" }],
//                                         "assets": { "run_worker_first": true } }
//
// 하는 일
//   xim 에서 정지된 사이트                         → "서비스 일시 중단" 화면 (/admin/ 은 정지 중에도 열린다)
//   /admin/ · /xms/* · /xms-api/* · /member/* · /board/*  → xms (업체 관리 화면 · 회원 · 게시판)
//   그 밖                                          → 이 폴더의 정적 파일 (html 이면 공통 계정 버튼 스크립트를 넣어서)
//   계정 버튼 자리: 헤더 안에 <span data-xms-account></span> (없으면 오른쪽 위에 떠 있음)
//   메뉴 자리: <nav data-xms-menu> 안의 원래 메뉴 링크에 data-xms-item → xms 메뉴 목록(맨 위 단계)으로 바뀐다.
//              data-xms-item 이 없는 것(예: "후원하기" 버튼)은 그대로 남아 xms 메뉴 뒤에 온다.
// xim 이 잠깐 응답하지 않으면 사이트는 그냥 열어 둔다(정지 확인 실패 = 운영).

const STATUS_TTL = 30000;
let statusCache = { at: 0, value: 'active' };
const XMS_PATHS = /^\/(admin|xms|xms-api|member|board)(\/|$)|^\/(robots\.txt|sitemap\.xml|rss\.xml)$/;

// 정지 여부: 이 Worker 메모리(30초) → Cloudflare 가장자리 캐시(30초, 도메인 주소에서) → xim 순서로 묻는다
async function siteStatus(env, request) {
  const t = Date.now();
  if (t - statusCache.at < STATUS_TTL) return statusCache.value;
  const key = new Request(`${new URL(request.url).origin}/__xim_status__`);
  try {
    const hit = await caches.default.match(key).catch(() => null);
    if (hit) { statusCache = { at: t, value: await hit.text() }; return statusCache.value; }
    statusCache = { at: t, value: await env.XIM.status(env.XIM_SITE) };
    await caches.default.put(key, new Response(statusCache.value, { headers: { 'Cache-Control': 'public, max-age=30' } })).catch(() => {});
  } catch (e) {
    console.error('xim status 실패', e);
    statusCache = { at: t - STATUS_TTL + 5000, value: statusCache.value }; // 5초 뒤 다시 물어본다
  }
  return statusCache.value;
}

function forward(binding, request, env, pathname) {
  const url = new URL(request.url);
  if (pathname) url.pathname = pathname;
  const req = new Request(url, request);
  req.headers.set('X-Xim-Site', env.XIM_SITE);
  return binding.fetch(req);
}

// html 로 보이는 주소 (확장자 없음 · .html) — 이런 요청은 사이트 파일과 xms 메뉴 값을 동시에 가져온다
const looksHtml = (p) => p.endsWith('/') || /\.html?$/i.test(p) || !/\.[a-z0-9]{1,5}$/i.test(p);

// 정적 파일 캐시: 그림 · 글꼴은 하루, css · js 는 5분 바로 쓰고 그 뒤엔 쓰면서 뒤에서 새것 확인 (페이지 옮길 때마다 다시 받지 않게)
function cacheStatic(res, pathname) {
  if (!res.ok) return res;
  const ct = res.headers.get('Content-Type') || '';
  if (ct.includes('text/html')) return res;
  const out = new Response(res.body, res);
  if (/^(image|font)\//.test(ct) || /\.(woff2?|ttf|otf)$/i.test(pathname)) out.headers.set('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
  else if (/css|javascript/.test(ct)) out.headers.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=86400');
  return out;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;
    const isAdmin = pathname === '/admin' || pathname.startsWith('/admin/') || pathname.startsWith('/xms/') || pathname.startsWith('/xms-api/');
    // CSS · JS · 그림 같은 파일은 정지 확인 없이 바로 (페이지가 막히면 파일만으로는 쓸 수 없다) — 파일마다 xim 에 묻지 않게
    if (!isAdmin && request.method === 'GET' && !looksHtml(pathname) && !XMS_PATHS.test(pathname)) return cacheStatic(await env.ASSETS.fetch(request), pathname);
    if (!isAdmin && (await siteStatus(env, request)) === 'suspended') return forward(env.XIM, request, env, '/__suspended');
    // 게시판 · 회원 화면: 사이트의 기존 페이지(틀)에 끼워 넣는다 — 머리 · 꼬리 · CSS 는 사이트 그대로
    if (request.method === 'GET' && /^\/(board|member)(\/|$)/.test(pathname)) return embedPage(request, env);
    if (XMS_PATHS.test(pathname)) return forward(env.XMS, request, env);
    if (request.method === 'GET' && looksHtml(pathname)) {
      const [res, data] = await Promise.all([env.ASSETS.fetch(request), siteHead(request, env, isHome(pathname))]);
      return withXms(res, request, env, data);
    }
    return cacheStatic(await env.ASSETS.fetch(request), pathname);
  },
};

// xms 에게 본문만 받아(X-Xms-Embed) 틀 페이지의 <main> 안을 그것으로 바꾼다. 틀이 없거나 실패하면 xms 화면 그대로.
//   본문 · 틀 · 메뉴 값을 동시에 가져온다.
async function embedPage(request, env) {
  const url = new URL(request.url);
  const req = new Request(url, request);
  req.headers.set('X-Xim-Site', env.XIM_SITE);
  req.headers.set('X-Xms-Embed', '1');
  const [xr, shell, data] = await Promise.all([
    env.XMS.fetch(req),
    env.ASSETS.fetch(new Request(new URL(env.XIM_SHELL || '/', url.origin))),
    siteHead(request, env, false),
  ]);
  if (!(xr.headers.get('Content-Type') || '').includes('application/json')) return xr; // 이동(로그인 뒤 등) · 오류는 그대로
  const d = await xr.json();
  if (!shell.ok || !(shell.headers.get('Content-Type') || '').includes('text/html')) return forward(env.XMS, request, env);
  const headers = new Headers(shell.headers);
  ['ETag', 'Last-Modified', 'Content-Length'].forEach((h) => headers.delete(h));
  headers.set('Cache-Control', 'no-store');
  let replaced = false;
  const framed = new HTMLRewriter()
    .on('title', { element(el) { el.setInnerContent(d.title); } })
    .on('main', { element(el) { if (!replaced) { el.setInnerContent(d.html, { html: true }); replaced = true; } } })
    .on('body', { element(el) { el.onEndTag((end) => { if (!replaced) end.before(d.html, { html: true }); }); } }) // <main> 이 없는 틀
    .on('head', {
      element(el) {
        // 틀 페이지의 상대 주소(css/style.css 등)가 게시판 주소 밑에서도 사이트 기준으로 풀리도록
        el.prepend('<base href="/">', { html: true });
        el.append(`<link rel="stylesheet" href="/xms/css/embed.css">\n<script type="module" src="/xms/js/public.js"></script>${d.noindex ? '\n<meta name="robots" content="noindex">' : ''}`, { html: true });
      },
    })
    .transform(new Response(shell.body, { status: d.status || 200, headers }));
  return withXms(framed, request, env, data);
}

const escHtml = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// 이 방문자에게 보이는 xms 메뉴 · 머리(head) 값 · (홈이면) 팝업을 한 번에. 실패하면 null → 사이트 원래 모습 그대로.
async function siteHead(request, env, home) {
  try {
    const url = new URL(request.url);
    const cookie = request.headers.get('Cookie') || '';
    // 로그인 안 한 방문자는 모두 같은 값 → Cloudflare 가장자리 캐시에 30초 (도메인 주소에서 동작, workers.dev 에서는 그냥 건너뜀)
    const guest = !/(?:^|;\s*)xms_sess=/.test(cookie);
    const key = new Request(`${url.origin}/__xms_site_head__/${home ? 'home' : 'page'}`);
    if (guest) {
      const hit = await caches.default.match(key).catch(() => null);
      if (hit) return await hit.json();
    }
    const req = new Request(`${url.origin}/xms-api/site-head${home ? '?home=1' : ''}`, { headers: { Cookie: cookie } });
    req.headers.set('X-Xim-Site', env.XIM_SITE);
    const res = await env.XMS.fetch(req);
    if (!res.ok) return null;
    const data = await res.json();
    if (guest) {
      await caches.default.put(key, new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=30' } })).catch(() => {});
    }
    return data;
  } catch (e) {
    console.error('xms site-head 실패', e);
    return null;
  }
}
// 메뉴 한 칸 → <a>. 주소 없는 대분류는 첫 하위 메뉴로 보낸다. 지금 페이지면 aria-current.
function menuLinks(items, pathname) {
  const first = (m) => m.href || (m.children || []).map(first).find(Boolean) || '';
  return items.map((m) => {
    const href = first(m);
    if (!href) return '';
    const here = !m.external && new URL(href, 'https://x').pathname === pathname && !href.includes('#');
    return `<a href="${escHtml(href)}"${m.external ? ' target="_blank" rel="noopener"' : ''}${here ? ' aria-current="page"' : ''} data-xms-item>${escHtml(m.title)}</a>`;
  }).join('');
}

// 계정 버튼을 서버에서 미리 그린다 (로그인 링크 / 사람 동그라미) — 화면이 뜬 뒤 바뀌며 메뉴가 흔들리지 않게
const PERSON = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8.2" r="4" fill="currentColor"/><path d="M4 20.2c0-4.1 3.6-6.7 8-6.7s8 2.6 8 6.7" fill="currentColor"/></svg>';
function accountHtml(me, url) {
  if (!me || me.guest) return '<a class="xa-login" href="/member/login">로그인</a>'; // 로그인하면 홈으로
  return `<button type="button" class="xa-avatar" aria-haspopup="menu" aria-expanded="false" aria-label="내 계정 메뉴">${PERSON}</button>`;
}

const attr = (v) => escHtml(v);
const isHome = (p) => p === '/' || p === '/index.html' || p === '/index';

// 모든 html 페이지:
//   ① 공통 계정 버튼(사람 동그라미 · 로그인) 스크립트
//   ② [data-xms-menu] 안의 [data-xms-item] 메뉴를 xms 메뉴로 바꿔 끼운다 (xms 가 비었거나 응답 없으면 원래 메뉴 그대로)
//   ③ xms 의 파비콘 · 검색엔진(제목 · 설명 · 소유권 확인) · 카카오톡 미리보기(og) 값을 머리에 넣는다 (값이 있을 때만 사이트 원래 태그를 바꾼다)
//   ④ 홈이면 노출 중인 팝업
async function withXms(res, request, env, data) {
  if (!(res.headers.get('Content-Type') || '').includes('text/html')) return res;
  const url = new URL(request.url);
  const home = isHome(url.pathname);
  const menu = data?.menu?.length ? data.menu : null;
  const h = data?.head || {};
  const ogDesc = h.share_description || '';
  const ogImage = h.og_image ? `${url.origin}${h.og_image}` : '';
  let hasDesc = false;

  let rw = new HTMLRewriter();
  if (data) {
    rw = rw.on('[data-xms-account]', {
      element(el) {
        el.setAttribute('class', `${el.getAttribute('class') || ''} xa-host`.trim());
        el.setAttribute('data-xa-me', JSON.stringify(data.me || { guest: true }));
        el.setInnerContent(accountHtml(data.me, url), { html: true });
      },
    });
  }
  if (menu) {
    rw = rw
      .on('[data-xms-menu] [data-xms-item]', { element(el) { el.remove(); } })
      .on('[data-xms-menu]', { element(el) { el.prepend(menuLinks(menu, url.pathname), { html: true }); } });
  }
  if (h.favicon) rw = rw.on('link[rel~="icon"], link[rel="apple-touch-icon"], link[rel="shortcut icon"]', { element(el) { el.remove(); } });
  if (home && h.title) {
    rw = rw.on('title', { element(el) { el.setInnerContent(h.title); } })
      .on('meta[property="og:title"]', { element(el) { el.setAttribute('content', h.title); } });
  }
  rw = rw.on('meta[name="description"]', { element(el) { hasDesc = true; if (home && h.description) el.setAttribute('content', h.description); } });
  if (ogDesc) rw = rw.on('meta[property="og:description"], meta[name="twitter:description"]', { element(el) { el.remove(); } });
  if (ogImage) rw = rw.on('meta[property="og:image"], meta[name="twitter:image"]', { element(el) { el.remove(); } });

  rw = rw.on('head', {
    element(el) {
      const tags = [];
      // 계정 버튼 스타일은 파일로 따로 받지 않고 바로 넣는다
      if (data?.account_css) tags.push(`<style id="xa-style">${data.account_css}</style>`);
      tags.push('<script src="/xms/js/account.js" defer></script>');
      tags.push('<link rel="alternate" type="application/rss+xml" title="RSS" href="/rss.xml">');
      for (const v of h.verify || []) tags.push(`<meta name="${attr(v.name)}" content="${attr(v.content)}">`);
      if (h.favicon) {
        for (const f of h.favicon) {
          if (f.size === 180) tags.push(`<link rel="apple-touch-icon" sizes="180x180" href="${attr(f.href)}">`);
          else tags.push(`<link rel="icon" type="image/png" sizes="${f.size}x${f.size}" href="${attr(f.href)}">`);
        }
      }
      if (ogDesc) tags.push(`<meta property="og:description" content="${attr(ogDesc)}">`);
      if (ogImage) tags.push(`<meta property="og:image" content="${attr(ogImage)}">`, '<meta property="og:image:width" content="1200">');
      if (home && data?.popups?.length) {
        tags.push(`<script>window.__XMS_POPUPS=${JSON.stringify(data.popups).replace(/</g, '\\u003c')};</script>`, '<script src="/xms/js/popup.js" defer></script>');
      }
      el.append(tags.join('\n'), { html: true });
      // 설명 태그가 아예 없던 페이지에는 검색엔진 설명글을 넣는다
      el.onEndTag((end) => { if (!hasDesc && h.description) end.before(`<meta name="description" content="${attr(h.description)}">`, { html: true }); });
    },
  });
  return rw.transform(res);
}
