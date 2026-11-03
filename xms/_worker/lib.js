// xms 공통 도우미: 응답 · 쿠키 · 비밀번호 · 세션 · 권한 · 설정 · HTML 정리

export const DAY = 86400000;
export const now = () => Date.now();
export const PBKDF2_ITER = 10000; // xim 과 같은 값 (계정을 옮겨도 비밀번호가 맞도록)

export class HttpError extends Error {
  constructor(status, message, extra) { super(message); this.status = status; this.extra = extra; }
}
export const bad = (msg) => new HttpError(400, msg);
export const forbidden = (msg = '권한이 없습니다.') => new HttpError(403, msg);
export const notFound = (msg = '찾을 수 없습니다.') => new HttpError(404, msg);

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });
}
export function fail(err) {
  if (err instanceof HttpError) return json({ error: err.message, ...(err.extra || {}) }, err.status);
  console.error(err);
  return json({ error: '서버 오류가 났습니다.' }, 500);
}
export function html(body, status = 200, headers = {}) {
  return new Response(body, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', ...headers } });
}

export const str = (v, max = 2000) => String(v ?? '').trim().slice(0, max);
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export async function body(request) {
  if (!(request.headers.get('Content-Type') || '').includes('application/json')) throw bad('JSON 으로 보내 주세요.');
  try { return await request.json(); } catch { throw bad('요청 내용을 읽을 수 없습니다.'); }
}

export function cookie(request, name) {
  const m = (request.headers.get('Cookie') || '').match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? m[1] : null;
}
export const setCookie = (name, value, maxAgeSec) =>
  `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAgeSec}`;

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
export const randomHex = (bytes) => hex(crypto.getRandomValues(new Uint8Array(bytes)));

export async function hashPassword(password, saltHex) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const salt = Uint8Array.from(saltHex.match(/../g).map((h) => parseInt(h, 16)));
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITER }, key, 256));
}
export async function newPassword(password) {
  const salt = randomHex(16);
  return { pw_salt: salt, pw_hash: await hashPassword(password, salt) };
}
export function sameText(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export const clientIp = (request) => request.headers.get('CF-Connecting-IP') || 'local';

export async function tooManyFails(db, key, max = 20) {
  await db.prepare('DELETE FROM login_fails WHERE at < ?').bind(now() - 15 * 60000).run();
  const row = await db.prepare('SELECT COUNT(*) AS n FROM login_fails WHERE key = ?').bind(key).first();
  return row.n >= max;
}
export const recordFail = (db, key) => db.prepare('INSERT INTO login_fails (key, at) VALUES (?, ?)').bind(key, now()).run();

// ───────── 세션 ─────────
export const SESS_COOKIE = 'xms_sess';
const MEMBER_SESSION = 7 * DAY;
const STAFF_SESSION = 8 * 3600000;

export async function createSession(db, site, kind, memberId = null) {
  const token = randomHex(32);
  const ms = kind === 'staff' ? STAFF_SESSION : MEMBER_SESSION;
  await db.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now()).run();
  await db.prepare('INSERT INTO sessions (token, site, member_id, kind, expires_at) VALUES (?, ?, ?, ?, ?)')
    .bind(token, site, memberId, kind, now() + ms).run();
  return setCookie(SESS_COOKIE, token, ms / 1000);
}

// 지금 요청한 사람: { kind: 'guest' } | { kind: 'member', member, level } | { kind: 'staff', level: 1 }
export async function whoAmI(db, request, site) {
  const token = cookie(request, SESS_COOKIE);
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return { kind: 'guest', level: 0 };
  const s = await db.prepare('SELECT * FROM sessions WHERE token = ? AND site = ? AND expires_at > ?').bind(token, site, now()).first();
  if (!s) return { kind: 'guest', level: 0 };
  if (s.kind === 'staff') return { kind: 'staff', level: 1, token, name: '웹촌 직원' };
  const m = await db.prepare("SELECT * FROM members WHERE id = ? AND site = ? AND status = 'ACTIVE'").bind(s.member_id, site).first();
  if (!m) return { kind: 'guest', level: 0 };
  return { kind: 'member', member: m, level: m.level, token, name: m.name };
}
export const isAdmin = (me) => me.level === 1;

// ───────── 권한 (등급 1~9 비트, 10 = 제한회원) ─────────
export const ALL_LEVELS = 511;
export const levelBit = (lv) => 1 << (lv - 1);
export function canBy(mask, guestOk, me, write = false) {
  if (me.level === 1) return true; // 관리자 · 웹촌 직원은 언제나
  if (!me.level) return !!guestOk;
  if (me.level === 10) return write ? false : !!(mask & levelBit(9));
  return !!(mask & levelBit(me.level));
}
export function maskFrom(list) {
  let m = 0;
  for (const v of Array.isArray(list) ? list : []) { const n = Number(v); if (n >= 1 && n <= 9) m |= levelBit(n); }
  return m;
}
export const levelsOf = (mask) => [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((k) => mask & levelBit(k));

// ───────── 업체 설정 ─────────
export const DEFAULT_LEVEL_NAMES = { 1: '관리자', 9: '일반회원', 10: '제한회원' };
export const BUILTIN_FIELDS = [
  { key: 'name', label: '이름', type: 'TEXT', builtin: true },
  { key: 'church', label: '교회', type: 'TEXT', builtin: true },
  { key: 'mobile', label: '휴대전화', type: 'TEXT', builtin: true },
  { key: 'phone', label: '전화', type: 'TEXT', builtin: true },
  { key: 'email', label: '이메일', type: 'TEXT', builtin: true },
  { key: 'nickname', label: '닉네임', type: 'TEXT', builtin: true },
];
const DEFAULT_MODES = { name: 'REQUIRED', mobile: 'OPTIONAL', phone: 'OPTIONAL', email: 'OPTIONAL', church: 'EXCLUDED', nickname: 'EXCLUDED' };
export const MEMBER_COLUMNS = ['name', 'nickname', 'email', 'mobile', 'phone'];

export async function siteSettings(db, site) {
  const row = await db.prepare('SELECT * FROM site_settings WHERE site = ?').bind(site).first();
  const levelNames = { ...DEFAULT_LEVEL_NAMES, ...(row ? JSON.parse(row.level_names) : {}) };
  for (let i = 1; i <= 10; i++) if (!levelNames[i]) levelNames[i] = `${i}등급`;
  let fields = row ? JSON.parse(row.signup_fields) : [];
  if (!fields.length) {
    fields = BUILTIN_FIELDS.map((f, i) => ({ key: f.key, label: f.label, type: 'TEXT', mode: DEFAULT_MODES[f.key], sort: i }));
  }
  fields = fields.map((f) => ({ ...f, builtin: BUILTIN_FIELDS.some((b) => b.key === f.key) }));
  fields.sort((a, b) => a.sort - b.sort);
  return { levelNames, fields };
}
export async function saveSettings(db, site, patch) {
  const cur = await db.prepare('SELECT * FROM site_settings WHERE site = ?').bind(site).first();
  const levelNames = patch.levelNames ?? (cur ? JSON.parse(cur.level_names) : {});
  const fields = patch.fields ?? (cur ? JSON.parse(cur.signup_fields) : []);
  await db.prepare(`INSERT INTO site_settings (site, level_names, signup_fields, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(site) DO UPDATE SET level_names = excluded.level_names, signup_fields = excluded.signup_fields, updated_at = excluded.updated_at`)
    .bind(site, JSON.stringify(levelNames), JSON.stringify(fields.map(({ builtin, ...f }) => f)), now()).run();
}

export async function audit(db, site, me, request, action, target = '', detail = '') {
  await db.prepare('INSERT INTO audit_log (site, actor_kind, actor_name, action, target, detail, ip, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(site, me.kind === 'staff' ? 'staff' : 'admin', me.kind === 'staff' ? '웹촌 직원' : `${me.member.name}(${me.member.login_id})`,
      action, String(target).slice(0, 200), String(detail).slice(0, 1000), clientIp(request), now()).run();
}

// ───────── HTML 정리: 허용한 태그 · 속성만 남긴다 (글 본문 · 약관) ─────────
const KEEP_TAGS = new Set(['p', 'br', 'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'blockquote',
  'a', 'img', 'hr', 'span', 'div', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'figure', 'figcaption', 'pre', 'code', 'sub', 'sup']);
const DROP_WITH_CONTENT = new Set(['script', 'style', 'iframe', 'object', 'embed', 'noscript', 'template', 'svg', 'math', 'form', 'textarea', 'select', 'button', 'input', 'link', 'meta', 'base', 'title', 'head']);
const KEEP_ATTR = { a: ['href', 'target'], img: ['src', 'alt', 'width', 'height'], td: ['colspan', 'rowspan'], th: ['colspan', 'rowspan'] };
const SAFE_URL = /^(https?:\/\/|mailto:|tel:|\/(?!\/)|#)/i;

export async function sanitizeHtml(input) {
  const src = String(input ?? '').slice(0, 200000);
  const rewriter = new HTMLRewriter()
    .on('*', {
      element(el) {
        const tag = el.tagName.toLowerCase();
        if (DROP_WITH_CONTENT.has(tag)) { el.remove(); return; }
        if (!KEEP_TAGS.has(tag)) { el.removeAndKeepContent(); return; }
        const keep = KEEP_ATTR[tag] || [];
        for (const [name] of [...el.attributes]) if (!keep.includes(name.toLowerCase())) el.removeAttribute(name);
        for (const name of ['href', 'src']) {
          const v = el.getAttribute(name);
          if (v !== null && !SAFE_URL.test(v.trim())) el.removeAttribute(name);
        }
        if (tag === 'a') {
          const href = el.getAttribute('href') || '';
          if (/^https?:\/\//i.test(href)) { el.setAttribute('target', '_blank'); el.setAttribute('rel', 'noopener noreferrer'); }
          else el.removeAttribute('target');
        }
      },
      comments(c) { c.remove(); },
    });
  const out = await rewriter.transform(new Response(`<body>${src}</body>`, { headers: { 'Content-Type': 'text/html' } })).text();
  return out.replace(/^<body>/, '').replace(/<\/body>$/, '').trim();
}
export const plainText = (h) => String(h || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&[a-z#0-9]+;/gi, (e) =>
  ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" }[e] || ' ')).replace(/\s+/g, ' ').trim();
