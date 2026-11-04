/* 슈가브레이크 Worker (2026-11-04 Cloudflare Pages `blood` · `sugarbreak` 에서 옮김 — xim 연결)
   - 로그인 = 사이트 회원(xms). 예전 공용 비밀번호(APP_PASSWORD · x-pass)는 없앰 → 이 사이트 관리자(레벨1)만 /api 를 쓴다
   - 기록은 예전 D1 `sugarbreak` 을 그대로 쓴다 (SB_DB) — 표 구조는 schema.sql
     /api/me · GET /api/data · POST /api/records · DELETE /api/records/<id>(지우는 척 — 영구 보관)
     PUT /api/days/<날짜> · PUT /api/settings · POST /api/import(예전 앱 백업 합치기)
   - 그 밖: xim 공통 사이트 Worker (회원 화면 · 계정 버튼 · 정적 파일) */
import site from '../../xim/_worker/site-worker.js';

const json = (o, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });

// 지금 로그인한 xms 회원 { email, admin } | null
async function member(request, env) {
  const cookie = request.headers.get('Cookie') || '';
  if (!env.XMS || !/(?:^|;\s*)xms_sess=/.test(cookie)) return null;
  try {
    const req = new Request(`${new URL(request.url).origin}/xms-api/me`, { headers: { Cookie: cookie, 'X-Xim-Site': env.XIM_SITE } });
    const res = await env.XMS.fetch(req);
    if (!res.ok) return null;
    const d = await res.json();
    return d.login_id ? { email: String(d.login_id).toLowerCase(), admin: !!d.admin } : null;
  } catch { return null; }
}

const RECORD_TYPES = new Set(['weight', 'bp', 'waist', 'glucose', 'hba1c', 'workout']);
const SETTING_KEYS = new Set(['why', 'myGoal', 'goals', 'best']);

function recordStmt(db, r, now) {
  if (!r || !r.id || !RECORD_TYPES.has(r.type) || !/^\d{4}-\d{2}-\d{2}$/.test(r.date) || !Number.isFinite(+r.t)) return null;
  return db.prepare('INSERT OR IGNORE INTO records (id,type,date,t,data,created_at) VALUES (?,?,?,?,?,?)')
    .bind(String(r.id), r.type, r.date, +r.t, JSON.stringify(r.data || {}), now);
}

// 구버전 앱 백업(JSON) → 레코드/날짜/설정. 이미 있는 건 건드리지 않는다(멱등).
function importStmts(db, old, now) {
  const out = [];
  for (const m of old.measures || []) {
    if (!m || !m.t) continue;
    const { type, date, t, ts, ...data } = m;
    const s = recordStmt(db, { id: 'm' + t, type, date, t, data }, now);
    if (s) out.push(s);
  }
  for (const w of old.workouts || []) {
    if (!w || !w.t) continue;
    const { date, t, ts, ...data } = w;
    const s = recordStmt(db, { id: 'w' + t, type: 'workout', date, t, data }, now);
    if (s) out.push(s);
  }
  for (const [date, d] of Object.entries(old.days || {})) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    out.push(db.prepare('INSERT OR IGNORE INTO days (date,data,updated_at) VALUES (?,?,?)').bind(date, JSON.stringify(d || {}), now));
  }
  for (const k of ['why', 'myGoal', 'goals']) {
    if (old[k] === undefined) continue;
    out.push(db.prepare('INSERT OR IGNORE INTO settings (key,value,updated_at) VALUES (?,?,?)').bind(k, JSON.stringify(old[k]), now));
  }
  if (old.best) {
    out.push(db.prepare(`INSERT INTO settings (key,value,updated_at) VALUES ('best',?,?)
      ON CONFLICT(key) DO UPDATE SET value=CAST(MAX(CAST(value AS INTEGER), CAST(excluded.value AS INTEGER)) AS TEXT), updated_at=excluded.updated_at`)
      .bind(String(+old.best || 0), now));
  }
  return out;
}

async function api(request, env, url) {
  // 이 사이트 관리자(레벨1) 계정만 — 한 사람의 건강 기록이라 회원별로 나뉘어 있지 않다
  const me = await member(request, env);
  if (!me || !me.admin) return json({ error: 'unauthorized' }, 401);
  if (request.method !== 'GET') {
    const origin = request.headers.get('Origin');
    if (origin && origin !== url.origin) return json({ error: 'bad origin' }, 403);
  }
  const db = env.SB_DB;
  const [a, b] = url.pathname.replace(/^\/api\/?/, '').split('/').map(decodeURIComponent);
  const method = request.method;
  const now = Date.now();
  const body = method === 'GET' || method === 'DELETE' ? null : await request.json().catch(() => null);

  try {
    if (a === 'me') return json({ ok: true, email: me.email });

    if (a === 'data' && method === 'GET') {
      const [r, d, s] = await db.batch([
        db.prepare('SELECT id,type,date,t,data FROM records WHERE deleted=0 ORDER BY t DESC'),
        db.prepare('SELECT date,data FROM days'),
        db.prepare('SELECT key,value FROM settings'),
      ]);
      const settings = {};
      for (const x of s.results) settings[x.key] = JSON.parse(x.value);
      const days = {};
      for (const x of d.results) days[x.date] = JSON.parse(x.data);
      const records = r.results.map((x) => ({ id: x.id, type: x.type, date: x.date, t: x.t, ...JSON.parse(x.data) }));
      return json({ records, days, settings });
    }

    if (a === 'records' && method === 'POST') {
      const s = recordStmt(db, body, now);
      if (!s) return json({ error: 'bad record' }, 400);
      await s.run();
      return json({ ok: true });
    }

    // 삭제해도 실제로는 남겨둔다 (건강 기록 영구 보관)
    if (a === 'records' && b && method === 'DELETE') {
      await db.prepare('UPDATE records SET deleted=1, deleted_at=? WHERE id=?').bind(now, b).run();
      return json({ ok: true });
    }

    if (a === 'days' && b && method === 'PUT') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(b)) return json({ error: 'bad date' }, 400);
      await db.prepare('INSERT INTO days (date,data,updated_at) VALUES (?,?,?) ON CONFLICT(date) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at')
        .bind(b, JSON.stringify((body && body.data) || {}), now).run();
      return json({ ok: true });
    }

    if (a === 'settings' && method === 'PUT') {
      // 최고 연속 일수(best)는 줄어들지 않게 — 기록이 빈 새 폰이 작은 값을 올려도 더 큰 값을 남긴다
      const stmts = Object.entries(body || {}).filter(([k]) => SETTING_KEYS.has(k)).map(([k, v]) => (k === 'best'
        ? db.prepare(`INSERT INTO settings (key,value,updated_at) VALUES ('best',?,?)
            ON CONFLICT(key) DO UPDATE SET value=CAST(MAX(CAST(value AS INTEGER), CAST(excluded.value AS INTEGER)) AS TEXT), updated_at=excluded.updated_at`).bind(String(+v || 0), now)
        : db.prepare('INSERT INTO settings (key,value,updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at')
          .bind(k, JSON.stringify(v), now)));
      if (stmts.length) await db.batch(stmts);
      return json({ ok: true });
    }

    if (a === 'import' && method === 'POST') {
      if (!body || typeof body !== 'object') return json({ error: 'bad backup' }, 400);
      const stmts = importStmts(db, body, now);
      if (stmts.length) await db.batch(stmts);
      return json({ ok: true, count: stmts.length });
    }

    return json({ error: 'not found' }, 404);
  } catch (e) {
    return json({ error: String(e && e.message || e) }, 500);
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) return api(request, env, url);
    return env.XMS ? site.fetch(request, env, ctx) : env.ASSETS.fetch(request);
  },
};
