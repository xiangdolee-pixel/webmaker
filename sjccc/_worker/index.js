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
    return withAccount(await env.ASSETS.fetch(request));
  },
};

// 모든 html 페이지에 공통 계정 버튼(사람 동그라미 · 로그인)을 넣는다 — xim 관할 모든 서비스 공통
function withAccount(res) {
  if (!(res.headers.get('Content-Type') || '').includes('text/html')) return res;
  return new HTMLRewriter()
    .on('head', { element(el) { el.append('<script src="/xms/js/account.js" defer></script>', { html: true }); } })
    .transform(res);
}
