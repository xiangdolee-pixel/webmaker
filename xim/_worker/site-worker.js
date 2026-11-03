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
const XMS_PATHS = /^\/(admin|xms|xms-api|member|board)(\/|$)/;

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

// 이 방문자에게 보이는 xms 메뉴 (등급별로 걸러진 트리). 실패하면 null → 사이트 원래 메뉴 그대로.
async function xmsMenu(request, env) {
  try {
    const url = new URL(request.url);
    const req = new Request(`${url.origin}/xms-api/menu`, { headers: { Cookie: request.headers.get('Cookie') || '' } });
    req.headers.set('X-Xim-Site', env.XIM_SITE);
    const res = await env.XMS.fetch(req);
    if (!res.ok) return null;
    const list = await res.json();
    return Array.isArray(list) && list.length ? list : null;
  } catch (e) {
    console.error('xms menu 실패', e);
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

// 모든 html 페이지: ① 공통 계정 버튼(사람 동그라미 · 로그인) 스크립트 ② [data-xms-menu] 안의 [data-xms-item] 메뉴를 xms 메뉴로 바꿔 끼운다
//   사이트 html 에 원래 메뉴를 [data-xms-item] 으로 적어 두면, xms 메뉴가 비었거나 응답이 없을 때 그대로 보인다.
async function withXms(res, request, env) {
  if (!(res.headers.get('Content-Type') || '').includes('text/html')) return res;
  const menu = await xmsMenu(request, env);
  const pathname = new URL(request.url).pathname;
  let rw = new HTMLRewriter()
    .on('head', { element(el) { el.append('<script src="/xms/js/account.js" defer></script>', { html: true }); } });
  if (menu) {
    rw = rw
      .on('[data-xms-menu] [data-xms-item]', { element(el) { el.remove(); } })
      .on('[data-xms-menu]', { element(el) { el.prepend(menuLinks(menu, pathname), { html: true }); } });
  }
  return rw.transform(res);
}
