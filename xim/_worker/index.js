// xim — 고객 사이트 통합 관리 + 공용 엔진
//
//   기본 export (xim.….workers.dev)   운영자 관리 화면(/) + 운영자 API(/api/*)
//   Engine (서비스 바인딩 전용)          각 고객 사이트 Worker 가 부른다. 공개 주소로는 닿지 않는다.
//     status(slug)                      사이트 상태(active | suspended | unknown)
//     fetch(request)                    고객 사이트의 /admin(업체 관리자 화면) · /xim-api/* · /__suspended
//                                       어느 사이트인지는 고객 Worker 가 붙여 주는 X-Xim-Site 헤더로 안다.
//
//   바인딩: DB(D1 xim), ASSETS(정적 파일)   비밀값: XIM_ADMIN_PASSWORD (wrangler secret, 리포에 없음)
import { WorkerEntrypoint } from 'cloudflare:workers';

const DAY = 86400000;
const SESSION_MS = 7 * DAY;
const PBKDF2_ITER = 10000; // 무료 플랜 CPU 10ms 안에 들도록 낮게 잡음
const FAIL_WINDOW = 10 * 60000;
const FAIL_MAX = 8;
const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,39}$/;
const STATUSES = ['new', 'doing', 'done'];

// ───────────────────────── 공통 도우미 ─────────────────────────

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const bad = (msg) => new HttpError(400, msg);

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });
}

function fail(err) {
  if (err instanceof HttpError) return json({ error: err.message }, err.status);
  console.error(err);
  return json({ error: '서버 오류가 났습니다.' }, 500);
}

const now = () => Date.now();
const str = (v, max = 2000) => String(v ?? '').trim().slice(0, max);

// 다른 사이트에서 폼으로 몰래 보내는 요청(CSRF)을 막기 위해 쓰기 요청은 JSON 만 받는다.
async function body(request) {
  if (!(request.headers.get('Content-Type') || '').includes('application/json')) throw bad('JSON 으로 보내 주세요.');
  try { return await request.json(); } catch { throw bad('요청 내용을 읽을 수 없습니다.'); }
}

function cookie(request, name) {
  const m = (request.headers.get('Cookie') || '').match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? m[1] : null;
}
const setCookie = (name, value, maxAgeSec) =>
  `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSec}`;

function hex(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function randomHex(bytes) {
  return hex(crypto.getRandomValues(new Uint8Array(bytes)));
}

async function hashPassword(password, saltHex) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const salt = Uint8Array.from(saltHex.match(/../g).map((h) => parseInt(h, 16)));
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITER }, key, 256));
}

// 길이가 같은 두 문자열을 시간차 없이 비교
function sameText(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
async function sha256(text) {
  return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}

async function tooManyFails(db, key) {
  await db.prepare('DELETE FROM login_fails WHERE at < ?').bind(now() - FAIL_WINDOW).run();
  const row = await db.prepare('SELECT COUNT(*) AS n FROM login_fails WHERE key = ?').bind(key).first();
  return row.n >= FAIL_MAX;
}
const recordFail = (db, key) => db.prepare('INSERT INTO login_fails (key, at) VALUES (?, ?)').bind(key, now()).run();

async function newSession(db, kind, siteId = null, adminId = null, expiresAt = now() + SESSION_MS) {
  const token = randomHex(32);
  await db.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now()).run();
  await db.prepare('INSERT INTO sessions (token, kind, site_id, admin_id, expires_at) VALUES (?, ?, ?, ?, ?)')
    .bind(token, kind, siteId, adminId, expiresAt).run();
  return token;
}

// ───────── 구글 OTP (TOTP, RFC 6238: SHA-1 · 6자리 · 30초) ─────────

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32(bytes) {
  let bits = 0; let val = 0; let out = '';
  for (const b of bytes) {
    val = ((val << 8) | b) & 0xffff; bits += 8;
    while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(val << (5 - bits)) & 31];
  return out;
}
function unbase32(s) {
  let bits = 0; let val = 0; const out = [];
  for (const c of s.toUpperCase().replace(/=+$/, '')) {
    const i = B32.indexOf(c);
    if (i < 0) throw new Error('base32');
    val = ((val << 5) | i) & 0xffff; bits += 5;
    if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; }
  }
  return new Uint8Array(out);
}
async function totpAt(secret, counter) {
  const key = await crypto.subtle.importKey('raw', unbase32(secret), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const msg = new DataView(new ArrayBuffer(8));
  msg.setUint32(0, Math.floor(counter / 2 ** 32));
  msg.setUint32(4, counter >>> 0);
  const h = new Uint8Array(await crypto.subtle.sign('HMAC', key, msg));
  const o = h[19] & 15;
  const n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1000000).padStart(6, '0');
}

const getSetting = async (db, key) => (await db.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first())?.value ?? null;
const setSetting = (db, key, value) =>
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(key, value).run();

// 앞뒤 30초까지 허용. 한 번 쓴 번호(같은 30초 칸)는 다시 못 쓴다.
async function checkTotp(db, secret, code) {
  code = String(code ?? '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(code)) return false;
  const c0 = Math.floor(now() / 30000);
  const last = Number(await getSetting(db, 'totp_last')) || 0;
  for (const c of [c0 - 1, c0, c0 + 1]) {
    if (c > last && sameText(await totpAt(secret, c), code)) {
      await setSetting(db, 'totp_last', String(c));
      return true;
    }
  }
  return false;
}

const OTP_COOKIE = 'xim_otp';
async function otpTrustUntil(db, request) {
  const token = cookie(request, OTP_COOKIE);
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return 0;
  const row = await db.prepare('SELECT expires_at FROM otp_trust WHERE token = ? AND expires_at > ?').bind(token, now()).first();
  return row ? row.expires_at : 0;
}
async function trustBrowser(db) {
  const token = randomHex(32);
  const until = now() + DAY;
  await db.prepare('DELETE FROM otp_trust WHERE expires_at < ?').bind(now()).run();
  await db.prepare('INSERT INTO otp_trust (token, expires_at) VALUES (?, ?)').bind(token, until).run();
  return { until, cookie: setCookie(OTP_COOKIE, token, DAY / 1000) };
}
async function readSession(db, request, cookieName, kind) {
  const token = cookie(request, cookieName);
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;
  const s = await db.prepare('SELECT * FROM sessions WHERE token = ? AND kind = ? AND expires_at > ?')
    .bind(token, kind, now()).first();
  return s;
}

const clientIp = (request) => request.headers.get('CF-Connecting-IP') || 'local';

// ───────────────────────── 운영자 API ─────────────────────────

const XIM_COOKIE = 'xim_sess';

async function ximApi(request, env, url) {
  const db = env.DB;
  const path = url.pathname.replace(/\/+$/, '');
  const method = request.method;

  if (path === '/api/login' && method === 'POST') {
    if (!env.XIM_ADMIN_PASSWORD) throw new HttpError(503, '운영자 비밀번호가 아직 설정되지 않았습니다.');
    const key = `xim:${clientIp(request)}`;
    if (await tooManyFails(db, key)) throw new HttpError(429, '로그인 실패가 많아 10분 뒤에 다시 시도해 주세요.');
    const { password, otp } = await body(request);
    const ok = sameText(await sha256(String(password ?? '').slice(0, 200)), await sha256(env.XIM_ADMIN_PASSWORD));
    if (!ok) { await recordFail(db, key); throw new HttpError(401, '비밀번호가 맞지 않습니다.'); }

    // 구글 OTP 를 등록했으면: 이 브라우저가 24시간 안에 OTP 를 넣었을 때만 비밀번호로 통과
    const secret = await getSetting(db, 'totp_secret');
    const cookies = [];
    let expires = now() + DAY;
    if (secret) {
      const until = await otpTrustUntil(db, request);
      if (until) expires = until;
      else {
        if (!otp) return json({ need_otp: true });
        if (!(await checkTotp(db, secret, otp))) { await recordFail(db, key); throw new HttpError(401, 'OTP 번호가 맞지 않습니다.'); }
        const t = await trustBrowser(db);
        cookies.push(t.cookie);
        expires = t.until;
      }
    }
    const token = await newSession(db, 'xim', null, null, expires);
    cookies.push(setCookie(XIM_COOKIE, token, Math.round((expires - now()) / 1000)));
    const res = json({ ok: true });
    cookies.forEach((c) => res.headers.append('Set-Cookie', c));
    return res;
  }

  const session = await readSession(db, request, XIM_COOKIE, 'xim');
  if (!session) throw new HttpError(401, '로그인이 필요합니다.');

  if (path === '/api/logout' && method === 'POST') {
    await db.prepare('DELETE FROM sessions WHERE token = ?').bind(session.token).run();
    return json({ ok: true }, 200, { 'Set-Cookie': setCookie(XIM_COOKIE, '', 0) });
  }
  if (path === '/api/me') return json({ ok: true });

  // 구글 OTP 등록 · 해제
  if (path === '/api/otp' && method === 'GET') {
    return json({ enabled: !!(await getSetting(db, 'totp_secret')) });
  }
  if (path === '/api/otp/setup' && method === 'POST') {
    if (await getSetting(db, 'totp_secret')) throw bad('이미 OTP 가 등록돼 있습니다. 다시 등록하려면 먼저 해제해 주세요.');
    const secret = base32(crypto.getRandomValues(new Uint8Array(20)));
    await setSetting(db, 'totp_pending', secret);
    const uri = `otpauth://totp/xim:${encodeURIComponent('운영자')}?secret=${secret}&issuer=xim&algorithm=SHA1&digits=6&period=30`;
    return json({ secret, uri });
  }
  if (path === '/api/otp/enable' && method === 'POST') {
    const { code } = await body(request);
    const pending = await getSetting(db, 'totp_pending');
    if (!pending) throw bad('먼저 QR 코드를 만들어 주세요.');
    if (!(await checkTotp(db, pending, code))) throw bad('OTP 번호가 맞지 않습니다. 앱에 보이는 6자리를 다시 넣어 주세요.');
    await db.batch([
      db.prepare("INSERT INTO settings (key, value) VALUES ('totp_secret', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(pending),
      db.prepare("DELETE FROM settings WHERE key = 'totp_pending'"),
      db.prepare('DELETE FROM otp_trust'),
    ]);
    const t = await trustBrowser(db); // 지금 이 브라우저는 방금 OTP 를 넣었으니 24시간 믿는다
    return json({ ok: true }, 200, { 'Set-Cookie': t.cookie });
  }
  if (path === '/api/otp/disable' && method === 'POST') {
    const { code } = await body(request);
    const secret = await getSetting(db, 'totp_secret');
    if (!secret) return json({ ok: true });
    if (!(await checkTotp(db, secret, code))) throw bad('OTP 번호가 맞지 않습니다.');
    await db.batch([
      db.prepare("DELETE FROM settings WHERE key IN ('totp_secret', 'totp_pending')"),
      db.prepare('DELETE FROM otp_trust'),
    ]);
    return json({ ok: true });
  }

  if (path === '/api/summary') {
    const r = await db.batch([
      db.prepare('SELECT COUNT(*) AS n FROM customers'),
      db.prepare("SELECT COUNT(*) AS n, SUM(status = 'suspended') AS off FROM sites"),
      db.prepare("SELECT COUNT(*) AS n FROM requests WHERE status != 'done'"),
    ]);
    return json({
      customers: r[0].results[0].n,
      sites: r[1].results[0].n,
      suspended: r[1].results[0].off || 0,
      openRequests: r[2].results[0].n,
    });
  }

  // 고객
  if (path === '/api/customers' && method === 'GET') {
    const { results } = await db.prepare(
      'SELECT c.*, (SELECT COUNT(*) FROM sites s WHERE s.customer_id = c.id) AS site_count FROM customers c ORDER BY c.id DESC',
    ).all();
    return json(results);
  }
  if (path === '/api/customers' && method === 'POST') {
    const b = customerFields(await body(request));
    const r = await db.prepare('INSERT INTO customers (name, contact, phone, email, memo, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(b.name, b.contact, b.phone, b.email, b.memo, now()).run();
    return json({ id: r.meta.last_row_id });
  }
  let m = path.match(/^\/api\/customers\/(\d+)$/);
  if (m && method === 'PUT') {
    const b = customerFields(await body(request));
    await db.prepare('UPDATE customers SET name = ?, contact = ?, phone = ?, email = ?, memo = ? WHERE id = ?')
      .bind(b.name, b.contact, b.phone, b.email, b.memo, +m[1]).run();
    return json({ ok: true });
  }
  if (m && method === 'DELETE') {
    const used = await db.prepare('SELECT COUNT(*) AS n FROM sites WHERE customer_id = ?').bind(+m[1]).first();
    if (used.n) throw bad('이 고객에 연결된 사이트가 있어 지울 수 없습니다. 사이트의 고객을 먼저 바꿔 주세요.');
    await db.prepare('DELETE FROM customers WHERE id = ?').bind(+m[1]).run();
    return json({ ok: true });
  }

  // 사이트
  if (path === '/api/sites' && method === 'GET') {
    const { results } = await db.prepare(`
      SELECT s.*, c.name AS customer_name,
        (SELECT COUNT(*) FROM requests r WHERE r.site_id = s.id AND r.status != 'done') AS open_requests,
        (SELECT COUNT(*) FROM site_admins a WHERE a.site_id = s.id) AS admin_count
      FROM sites s LEFT JOIN customers c ON c.id = s.customer_id
      ORDER BY s.id DESC`).all();
    return json(results);
  }
  if (path === '/api/sites' && method === 'POST') {
    const raw = await body(request);
    const slug = str(raw.slug, 40).toLowerCase();
    if (!SLUG_RE.test(slug)) throw bad('사이트 ID 는 영문 소문자·숫자·하이픈 2~40자로 넣어 주세요.');
    const b = siteFields(raw);
    const dup = await db.prepare('SELECT id FROM sites WHERE slug = ?').bind(slug).first();
    if (dup) throw bad('이미 있는 사이트 ID 입니다.');
    const r = await db.prepare(
      'INSERT INTO sites (slug, name, customer_id, domain, status, quota_mb, memo, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(slug, b.name, b.customer_id, b.domain, b.status, b.quota_mb, b.memo, now()).run();
    return json({ id: r.meta.last_row_id });
  }
  m = path.match(/^\/api\/sites\/(\d+)$/);
  if (m && method === 'PUT') {
    const b = siteFields(await body(request));
    await db.prepare('UPDATE sites SET name = ?, customer_id = ?, domain = ?, status = ?, quota_mb = ?, memo = ? WHERE id = ?')
      .bind(b.name, b.customer_id, b.domain, b.status, b.quota_mb, b.memo, +m[1]).run();
    return json({ ok: true });
  }
  m = path.match(/^\/api\/sites\/(\d+)\/status$/);
  if (m && method === 'POST') {
    const { status } = await body(request);
    if (!['active', 'suspended'].includes(status)) throw bad('상태 값이 잘못됐습니다.');
    await db.prepare('UPDATE sites SET status = ? WHERE id = ?').bind(status, +m[1]).run();
    return json({ ok: true });
  }

  // 업체 관리자 계정
  m = path.match(/^\/api\/sites\/(\d+)\/admins$/);
  if (m && method === 'GET') {
    const { results } = await db.prepare('SELECT id, username, name, created_at FROM site_admins WHERE site_id = ? ORDER BY id')
      .bind(+m[1]).all();
    return json(results);
  }
  if (m && method === 'POST') {
    const raw = await body(request);
    const username = str(raw.username, 40);
    const password = String(raw.password ?? '');
    if (!/^[A-Za-z0-9._-]{3,40}$/.test(username)) throw bad('아이디는 영문·숫자 3~40자로 넣어 주세요.');
    if (password.length < 8 || password.length > 200) throw bad('비밀번호는 8자 이상으로 넣어 주세요.');
    const site = await db.prepare('SELECT id FROM sites WHERE id = ?').bind(+m[1]).first();
    if (!site) throw new HttpError(404, '사이트가 없습니다.');
    const salt = randomHex(16);
    try {
      await db.prepare('INSERT INTO site_admins (site_id, username, name, pw_hash, pw_salt, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(site.id, username, str(raw.name, 40), await hashPassword(password, salt), salt, now()).run();
    } catch (e) {
      if (String(e.message).includes('UNIQUE')) throw bad('이 사이트에 같은 아이디가 이미 있습니다.');
      throw e;
    }
    return json({ ok: true });
  }
  m = path.match(/^\/api\/admins\/(\d+)$/);
  if (m && method === 'DELETE') {
    await db.batch([
      db.prepare("DELETE FROM sessions WHERE kind = 'site' AND admin_id = ?").bind(+m[1]),
      db.prepare('DELETE FROM site_admins WHERE id = ?').bind(+m[1]),
    ]);
    return json({ ok: true });
  }

  // 수정요청
  if (path === '/api/requests' && method === 'GET') {
    const status = url.searchParams.get('status');
    const where = STATUSES.includes(status) ? 'WHERE r.status = ?' : '';
    const stmt = db.prepare(`
      SELECT r.*, s.slug, s.name AS site_name, a.username, a.name AS admin_name
      FROM requests r JOIN sites s ON s.id = r.site_id LEFT JOIN site_admins a ON a.id = r.admin_id
      ${where} ORDER BY (r.status = 'done'), r.id DESC LIMIT 200`);
    const { results } = await (where ? stmt.bind(status) : stmt).all();
    return json(results);
  }
  m = path.match(/^\/api\/requests\/(\d+)$/);
  if (m && method === 'PUT') {
    const raw = await body(request);
    if (!STATUSES.includes(raw.status)) throw bad('상태 값이 잘못됐습니다.');
    await db.prepare('UPDATE requests SET status = ?, reply = ?, updated_at = ? WHERE id = ?')
      .bind(raw.status, str(raw.reply, 5000), now(), +m[1]).run();
    return json({ ok: true });
  }

  throw new HttpError(404, '없는 주소입니다.');
}

function customerFields(raw) {
  const name = str(raw.name, 80);
  if (!name) throw bad('고객 이름을 넣어 주세요.');
  return { name, contact: str(raw.contact, 40), phone: str(raw.phone, 40), email: str(raw.email, 120), memo: str(raw.memo) };
}
function siteFields(raw) {
  const name = str(raw.name, 80);
  if (!name) throw bad('사이트 이름을 넣어 주세요.');
  const quota = Math.round(Number(raw.quota_mb));
  if (!Number.isFinite(quota) || quota < 0 || quota > 1000000) throw bad('용량은 0 이상 숫자(MB)로 넣어 주세요.');
  const status = raw.status === 'suspended' ? 'suspended' : 'active';
  const customer = raw.customer_id ? Number(raw.customer_id) : null;
  return {
    name,
    customer_id: Number.isInteger(customer) && customer > 0 ? customer : null,
    domain: str(raw.domain, 200),
    status,
    quota_mb: quota,
    memo: str(raw.memo),
  };
}

// ───────────────────────── 엔진: 고객 사이트용 ─────────────────────────

const SITE_COOKIE = 'xim_site';

async function siteApi(request, env, site, url) {
  const db = env.DB;
  const path = url.pathname.replace(/\/+$/, '');
  const method = request.method;

  if (path === '/xim-api/site') return json({ name: site.name, slug: site.slug, status: site.status });

  if (path === '/xim-api/login' && method === 'POST') {
    const key = `site:${site.id}:${clientIp(request)}`;
    if (await tooManyFails(db, key)) throw new HttpError(429, '로그인 실패가 많아 10분 뒤에 다시 시도해 주세요.');
    const raw = await body(request);
    const admin = await db.prepare('SELECT * FROM site_admins WHERE site_id = ? AND username = ?')
      .bind(site.id, str(raw.username, 40)).first();
    const hash = admin ? await hashPassword(String(raw.password ?? '').slice(0, 200), admin.pw_salt) : '';
    if (!admin || !sameText(hash, admin.pw_hash)) {
      await recordFail(db, key);
      throw new HttpError(401, '아이디 또는 비밀번호가 맞지 않습니다.');
    }
    const token = await newSession(db, 'site', site.id, admin.id);
    return json({ ok: true }, 200, { 'Set-Cookie': setCookie(SITE_COOKIE, token, SESSION_MS / 1000) });
  }

  const session = await readSession(db, request, SITE_COOKIE, 'site');
  if (!session || session.site_id !== site.id) throw new HttpError(401, '로그인이 필요합니다.');

  if (path === '/xim-api/logout' && method === 'POST') {
    await db.prepare('DELETE FROM sessions WHERE token = ?').bind(session.token).run();
    return json({ ok: true }, 200, { 'Set-Cookie': setCookie(SITE_COOKIE, '', 0) });
  }
  if (path === '/xim-api/me') {
    const a = await db.prepare('SELECT username, name FROM site_admins WHERE id = ?').bind(session.admin_id).first();
    return json({ ...a, site: { name: site.name, status: site.status, quota_mb: site.quota_mb, used_mb: site.used_mb } });
  }
  if (path === '/xim-api/requests' && method === 'GET') {
    const { results } = await db.prepare(
      'SELECT id, title, body, status, reply, created_at, updated_at FROM requests WHERE site_id = ? ORDER BY id DESC LIMIT 100',
    ).bind(site.id).all();
    return json(results);
  }
  if (path === '/xim-api/requests' && method === 'POST') {
    const raw = await body(request);
    const title = str(raw.title, 120);
    if (!title) throw bad('제목을 넣어 주세요.');
    const t = now();
    await db.prepare('INSERT INTO requests (site_id, admin_id, title, body, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(site.id, session.admin_id, title, str(raw.body, 5000), 'new', t, t).run();
    return json({ ok: true });
  }

  throw new HttpError(404, '없는 주소입니다.');
}

function suspendedPage(site) {
  const name = (site?.name || '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  return new Response(`<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>서비스 일시 중단</title>
<style>*{-webkit-tap-highlight-color:transparent}body{margin:0;min-height:100vh;display:grid;place-items:center;
font-family:system-ui,-apple-system,"Apple SD Gothic Neo","Noto Sans KR",sans-serif;background:#f4f5f7;color:#222;padding:24px;box-sizing:border-box}
main{max-width:420px;text-align:center}h1{font-size:1.4rem;margin:0 0 12px}p{margin:0;line-height:1.7;color:#555}</style>
</head><body><main><h1>서비스 일시 중단</h1><p>${name ? `${name} 홈페이지는` : '이 홈페이지는'} 현재 이용할 수 없습니다.<br>관리자에게 문의해 주세요.</p></main></body></html>`,
  { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Retry-After': '3600' } });
}

const getSite = (env, slug) =>
  SLUG_RE.test(slug || '') ? env.DB.prepare('SELECT * FROM sites WHERE slug = ?').bind(slug).first() : null;

export class Engine extends WorkerEntrypoint {
  // 고객 사이트 Worker 가 요청마다(30초 캐시) 묻는다
  async status(slug) {
    const site = await getSite(this.env, slug);
    return site ? site.status : 'unknown';
  }

  async fetch(request) {
    const url = new URL(request.url);
    const site = await getSite(this.env, request.headers.get('X-Xim-Site'));
    if (url.pathname === '/__suspended') return suspendedPage(site);
    if (!site) return new Response('xim 에 등록되지 않은 사이트입니다.', { status: 404 });

    if (url.pathname.startsWith('/xim-api/')) {
      try { return await siteApi(request, this.env, site, url); } catch (e) { return fail(e); }
    }
    // /admin/ → 업체 관리자 화면. xim 의 site-admin/index.html 과 같은 css/ · js/ 를 그대로 쓴다.
    if (url.pathname === '/admin') return Response.redirect(`${url.origin}/admin/`, 301);
    if (url.pathname.startsWith('/admin/')) {
      const rest = url.pathname.slice('/admin/'.length);
      let asset;
      if (rest === '' || rest === 'index.html') asset = '/site-admin/';
      else if (/^(css|js)\/[\w.-]+$/.test(rest)) asset = `/${rest}`;
      else return new Response('Not found', { status: 404 });
      const res = await this.env.ASSETS.fetch(new Request(`https://assets${asset}`));
      const out = new Response(res.body, res);
      out.headers.set('Cache-Control', 'no-cache');
      out.headers.set('X-Robots-Tag', 'noindex');
      return out;
    }
    return new Response('Not found', { status: 404 });
  }
}

// ───────────────────────── 기본 export: xim 운영자 화면 ─────────────────────────

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      try { return await ximApi(request, env, url); } catch (e) { return fail(e); }
    }
    return env.ASSETS.fetch(request);
  },
};
