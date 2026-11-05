/* 올리브바스켓 Worker (2026-11-04 Cloudflare Pages 에서 옮김 — xim 연결)
   - 로그인 · 가입 · 내 정보 = 사이트 회원(xms, 같은 xms_sess 쿠키). 예전 자체 로그인(/api/auth/*) · 메일 인증은 없앰
   - 구절은 예전 D1 `olivebasket` 을 그대로 쓴다 (OB_DB). 회원 = users.email 로 이어 붙인다 → 예전 구절 · 보기 방식이 그대로
     /basket        담기 · 목록 화면 (예전 /admin — /admin 은 xim 에서 관리 화면 /xms/ 로 가는 길이라 바꿈)
     /api/me        GET    { email, admin }  (손님이면 {})
     /api/items     GET · POST · PUT · DELETE?id=
     /api/settings  GET · PUT { weight_mode }
     /api/random    GET ?not=본 id들&last=직전 id → 구절 하나 { id, text, source, stars, mode, cycled } | { empty: true }
   - /       소개 페이지(로그인했으면 /app 으로) · /app 구절 앱 · /basket 담기
   - /login → /member/login (예전 주소로 들어와도)
   - 그 밖: xim 공통 사이트 Worker (회원 화면 · 계정 버튼 · 정적 파일) */
import site from '../../xim/_worker/site-worker.js';

const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
});
const MODES = ['random', 'recent', 'stars', 'short', 'long'];
// 다른 사이트에서 담기 — 길 성경통독(bible.plators.com)의 형광펜 '올리브 담기'. 같은 plators.com 이라 xms_sess 쿠키가 함께 온다
const PARTNERS = ['https://bible.plators.com'];
const partner = (request) => { const o = request.headers.get('Origin'); return o && PARTNERS.includes(o) ? o : null; };
function withCors(res, origin) {
  if (!origin) return res;
  const out = new Response(res.body, res);
  out.headers.set('Access-Control-Allow-Origin', origin);
  out.headers.set('Access-Control-Allow-Credentials', 'true');
  out.headers.append('Vary', 'Origin');
  return out;
}

// 지금 로그인한 xms 회원 { email, admin } | null
const seen = new Map(); // 세션 쿠키 → { me, at }
async function member(request, env) {
  const cookie = request.headers.get('Cookie') || '';
  const sess = (cookie.match(/(?:^|;\s*)xms_sess=([^;]+)/) || [])[1];
  if (!env.XMS || !sess) return null;
  const hit = seen.get(sess);
  if (hit && Date.now() - hit.at < 60000) return hit.me;
  if (seen.size > 500) seen.clear();
  try {
    const req = new Request(`${new URL(request.url).origin}/xms-api/me`, { headers: { Cookie: cookie, 'X-Xim-Site': env.XIM_SITE } });
    const res = await env.XMS.fetch(req);
    if (!res.ok) return null;
    const d = await res.json();
    const me = d.login_id ? { email: String(d.login_id).toLowerCase(), admin: !!d.admin } : null;
    seen.set(sess, { me, at: Date.now() });
    return me;
  } catch { return null; }
}
// 회원 이메일 → 올리브바스켓 users.id (처음이면 만든다)
async function userId(db, email) {
  const row = await db.prepare('SELECT id FROM users WHERE lower(email) = ?').bind(email).first();
  if (row) return row.id;
  const r = await db.prepare('INSERT INTO users (email) VALUES (?)').bind(email).run();
  return r.meta.last_row_id;
}
const clean = (v) => {
  const text = String(v?.text ?? '').trim().slice(0, 4000);
  const source = String(v?.source ?? '').trim().slice(0, 300);
  const stars = Math.min(3, Math.max(1, Math.round(Number(v?.stars) || 1)));
  return { text, source, stars };
};

// 보기 방식별 무게 (가장 낮은 것도 가끔 나오게 1 ~ 10)
function pick(rows, mode) {
  if (mode === 'random') return rows[Math.floor(Math.random() * rows.length)];
  let w;
  if (mode === 'stars') w = rows.map((r) => r.stars || 1);
  else {
    const key = mode === 'recent' ? (r) => r.id : (r) => r.text.length;
    const vals = rows.map(key);
    const lo = Math.min(...vals), hi = Math.max(...vals);
    w = vals.map((v) => {
      const t = hi > lo ? (v - lo) / (hi - lo) : 0.5;
      return 1 + 9 * (mode === 'short' ? 1 - t : t);
    });
  }
  let n = Math.random() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < rows.length; i++) { n -= w[i]; if (n <= 0) return rows[i]; }
  return rows[rows.length - 1];
}

async function api(request, env, url) {
  const db = env.OB_DB;
  const path = url.pathname;
  const me = await member(request, env);
  if (path === '/api/me') return json(me || {});
  if (!me) return json({ error: '로그인이 필요합니다.' }, 401);
  if (request.method !== 'GET') {
    const origin = request.headers.get('Origin');
    if (origin && origin !== url.origin && !(PARTNERS.includes(origin) && path === '/api/items' && request.method === 'POST')) return json({ error: 'bad origin' }, 403);
  }
  const uid = await userId(db, me.email);
  const body = async () => { try { return await request.json(); } catch { return {}; } };

  if (path === '/api/items') {
    if (request.method === 'GET') {
      const { results } = await db.prepare('SELECT id, text, source, stars, created_at FROM aphorisms WHERE user_id = ? ORDER BY id DESC').bind(uid).all();
      return json(results);
    }
    if (request.method === 'POST' || request.method === 'PUT') {
      const v = await body();
      const it = clean(v);
      if (!it.text) return json({ error: '구절을 입력해 주세요.' }, 400);
      if (request.method === 'POST') {
        const r = await db.prepare('INSERT INTO aphorisms (text, source, stars, user_id) VALUES (?, ?, ?, ?)').bind(it.text, it.source, it.stars, uid).run();
        return json({ ok: true, id: r.meta.last_row_id });
      }
      const r = await db.prepare('UPDATE aphorisms SET text = ?, source = ?, stars = ? WHERE id = ? AND user_id = ?').bind(it.text, it.source, it.stars, Number(v.id) || 0, uid).run();
      return json({ ok: r.meta.changes > 0 }, r.meta.changes > 0 ? 200 : 404);
    }
    if (request.method === 'DELETE') {
      const r = await db.prepare('DELETE FROM aphorisms WHERE id = ? AND user_id = ?').bind(Number(url.searchParams.get('id')) || 0, uid).run();
      return json({ ok: r.meta.changes > 0 });
    }
  }
  if (path === '/api/settings') {
    if (request.method === 'PUT') {
      const m = (await body()).weight_mode;
      if (!MODES.includes(m)) return json({ error: 'bad mode' }, 400);
      await db.prepare('UPDATE users SET weight_mode = ? WHERE id = ?').bind(m, uid).run();
      return json({ ok: true, weight_mode: m });
    }
    const u = await db.prepare('SELECT weight_mode FROM users WHERE id = ?').bind(uid).first();
    return json({ weight_mode: MODES.includes(u?.weight_mode) ? u.weight_mode : 'random' });
  }
  if (path === '/api/random') {
    const [{ results: rows }, u] = await Promise.all([
      db.prepare('SELECT id, text, source, stars FROM aphorisms WHERE user_id = ?').bind(uid).all(),
      db.prepare('SELECT weight_mode FROM users WHERE id = ?').bind(uid).first(),
    ]);
    if (!rows.length) return json({ empty: true });
    const mode = MODES.includes(u?.weight_mode) ? u.weight_mode : 'random';
    const not = new Set((url.searchParams.get('not') || '').split(',').map(Number).filter(Boolean));
    const last = Number(url.searchParams.get('last')) || 0;
    // 아직 안 본 것 중에서 (직전 구절은 빼고). 다 봤으면 새 바퀴(cycled)
    let pool = rows.filter((r) => !not.has(r.id) && r.id !== last);
    let cycled = false;
    if (!pool.length) {
      cycled = true;
      pool = rows.length > 1 ? rows.filter((r) => r.id !== last) : rows;
    }
    return json({ ...pick(pool, mode), mode, cycled });
  }
  return json({ error: 'not found' }, 404);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      const po = partner(request);
      if (request.method === 'OPTIONS') {
        if (!po) return new Response(null, { status: 403 });
        return new Response(null, { status: 204, headers: {
          'Access-Control-Allow-Origin': po, 'Access-Control-Allow-Credentials': 'true',
          'Access-Control-Allow-Methods': 'GET, POST', 'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400', Vary: 'Origin',
        } });
      }
      let res;
      try { res = await api(request, env, url); } catch (e) { res = json({ error: String(e.message || e) }, 500); }
      return withCors(res, po);
    }
    // 예전 담기 화면 주소(/admin)를 홈 화면에 저장해 둔 경우
    if (url.pathname === '/admin.html') return Response.redirect(`${url.origin}/basket`, 302);
    // 첫 화면(/) = 소개 페이지. 로그인한 회원이면 바로 구절 앱(/app)으로 (사용자 지시 2026-11-04: "가입하면 기존 서비스가 나오게")
    if ((url.pathname === '/' || url.pathname === '/index.html') && request.method === 'GET' && (await member(request, env))) {
      return new Response(null, { status: 302, headers: { Location: '/app', 'Cache-Control': 'no-store' } });
    }
    if (url.pathname === '/login' || url.pathname === '/login.html') {
      const signup = url.searchParams.get('mode') === 'signup';
      return Response.redirect(`${url.origin}/member/${signup ? 'signup' : 'login'}`, 302);
    }
    return env.XMS ? site.fetch(request, env, ctx) : env.ASSETS.fetch(request);
  },
};
