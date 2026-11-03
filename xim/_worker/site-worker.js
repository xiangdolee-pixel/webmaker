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
const XMS_PATHS = /^\/(admin|xms|xms-api|member|board)(\/|$)|^\/(robots\.txt|sitemap\.xml)$/;

async function siteStatus(env) {
  const t = Date.now();
  if (t - statusCache.at < STATUS_TTL) return statusCache.value;
  try {
    statusCache = { at: t, value: await env.XIM.status(env.XIM_SITE) };
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

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    const isAdmin = pathname === '/admin' || pathname.startsWith('/admin/') || pathname.startsWith('/xms/') || pathname.startsWith('/xms-api/');
    if (!isAdmin && (await siteStatus(env)) === 'suspended') return forward(env.XIM, request, env, '/__suspended');
    if (XMS_PATHS.test(pathname)) return forward(env.XMS, request, env);
    return withXms(await env.ASSETS.fetch(request), request, env);
  },
};

const escHtml = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// 이 방문자에게 보이는 xms 메뉴 · 머리(head) 값 · (홈이면) 팝업을 한 번에. 실패하면 null → 사이트 원래 모습 그대로.
async function siteHead(request, env, home) {
  try {
    const url = new URL(request.url);
    const req = new Request(`${url.origin}/xms-api/site-head${home ? '?home=1' : ''}`, { headers: { Cookie: request.headers.get('Cookie') || '' } });
    req.headers.set('X-Xim-Site', env.XIM_SITE);
    const res = await env.XMS.fetch(req);
    return res.ok ? await res.json() : null;
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

const attr = (v) => escHtml(v);
const isHome = (p) => p === '/' || p === '/index.html' || p === '/index';

// 모든 html 페이지:
//   ① 공통 계정 버튼(사람 동그라미 · 로그인) 스크립트
//   ② [data-xms-menu] 안의 [data-xms-item] 메뉴를 xms 메뉴로 바꿔 끼운다 (xms 가 비었거나 응답 없으면 원래 메뉴 그대로)
//   ③ xms 의 파비콘 · 검색엔진(제목 · 설명 · 소유권 확인) · 카카오톡 미리보기(og) 값을 머리에 넣는다 (값이 있을 때만 사이트 원래 태그를 바꾼다)
//   ④ 홈이면 노출 중인 팝업
async function withXms(res, request, env) {
  if (!(res.headers.get('Content-Type') || '').includes('text/html')) return res;
  const url = new URL(request.url);
  const home = isHome(url.pathname);
  const data = await siteHead(request, env, home);
  const menu = data?.menu?.length ? data.menu : null;
  const h = data?.head || {};
  const ogDesc = h.share_description || '';
  const ogImage = h.og_image ? `${url.origin}${h.og_image}` : '';
  let hasDesc = false;

  let rw = new HTMLRewriter();
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
      const tags = ['<script src="/xms/js/account.js" defer></script>'];
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
