// xms 방문자 화면 · API — 고객 사이트 주소 아래 /member/* · /board/* · /xms-api/*
import {
  DAY, now, bad, forbidden, notFound, HttpError, json, html, esc, str, body, siteSettings, MEMBER_COLUMNS, canBy, levelBit,
  createSession, SESS_COOKIE, setCookie, ensureDocs, hashPassword, newPassword, sameText, sanitizeHtml, plainText, clientIp, tooManyFails, recordFail, isAdmin,
} from './lib.js';
import { boardOptions } from './admin-api.js';

const LOCK_AFTER = 5;
const LOCK_MS = 15 * 60000;

// ───────── 공통: 사이트 정보 · 메뉴 ─────────
async function siteInfo(env, site) {
  const s = await env.XIM_DB.prepare('SELECT name, domain FROM sites WHERE slug = ?').bind(site).first();
  return { slug: site, name: s?.name || site };
}

// 이 방문자에게 보이는 메뉴 트리
export async function visibleMenus(db, site, me) {
  const { results } = await db.prepare(`SELECT m.*, b.slug AS board_slug, b.list_levels, b.allow_guest_list, b.guest_menu, b.visible AS board_visible
    FROM menus m LEFT JOIN boards b ON b.id = m.board_id AND b.deleted_at IS NULL WHERE m.site = ? ORDER BY m.sort, m.id`).bind(site).all();
  const can = (m) => {
    if (!m.visible) return false;
    if (me.level === 1) return true;
    if (m.menu_type === 'BOARD') {
      if (!m.board_slug || !m.board_visible) return false;
      return me.level ? canBy(m.list_levels, 0, me) : !!(m.allow_guest_list || m.guest_menu);
    }
    if (!me.level) return !!m.allow_guest_read;
    if (m.read_levels === null) return true;
    return !!(m.read_levels & levelBit(me.level === 10 ? 9 : me.level));
  };
  const build = (parent) => results.filter((m) => (m.parent_id ?? null) === parent && can(m)).map((m) => ({
    title: m.title,
    href: m.menu_type === 'BOARD' ? `/board/${m.board_slug}` : m.path,
    external: m.menu_type === 'LINK',
    children: m.menu_type === 'LINK' ? [] : build(m.id),
  }));
  return build(null);
}

function navHtml(items, depth = 0) {
  if (!items.length) return '';
  return `<ul class="${depth ? 'sub' : 'gnb'}">${items.map((m) => {
    const a = m.href
      ? `<a href="${esc(m.href)}"${m.external ? ' target="_blank" rel="noopener"' : ''}>${esc(m.title)}</a>`
      : `<span>${esc(m.title)}</span>`;
    return `<li>${a}${navHtml(m.children, depth + 1)}</li>`;
  }).join('')}</ul>`;
}

async function page(ctx, title, content, opts = {}) {
  const { env, site, me } = ctx;
  const info = await siteInfo(env, site);
  const menus = await visibleMenus(env.DB, site, me);
  // 로그인 · 계정 메뉴는 모든 서비스 공통 버튼(/xms/js/account.js)이 그린다
  return html(`<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)} - ${esc(info.name)}</title>
${opts.noindex ? '<meta name="robots" content="noindex">' : ''}
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
<link rel="stylesheet" href="/xms/css/style.css">
<script type="module" src="/xms/js/public.js"></script>
<script src="/xms/js/account.js" defer></script>
</head><body class="pub">
<header class="pub-top"><div class="pub-in">
  <a class="pub-brand" href="/">${esc(info.name)}</a>
  <nav class="pub-nav" data-nav>${navHtml(menus)}</nav>
  <span class="pub-account" data-xms-account></span>
  <button type="button" class="nav-btn" aria-label="메뉴 열기" aria-expanded="false" data-nav-toggle><i></i><i></i><i></i></button>
</div></header>
<main class="pub-main">${content}</main>
<footer class="pub-foot">© ${esc(info.name)}</footer>
</body></html>`, opts.status || 200);
}

const msgPage = (ctx, title, text, action = '', status = 200) => page(ctx, title, `<section class="pub-box narrow center"><h1>${esc(title)}</h1><p class="lede">${text}</p>${action}</section>`, { status, noindex: true });
const needLogin = (ctx, back) => msgPage(ctx, '로그인이 필요합니다', '회원만 볼 수 있는 곳입니다. 로그인해 주세요.',
  `<div class="actions center"><a class="btn primary" href="/member/login?next=${encodeURIComponent(back)}">로그인</a><a class="btn" href="/member/signup">회원가입</a></div>`);
const noRight = (ctx) => msgPage(ctx, '볼 수 없는 곳입니다', '지금 회원 등급으로는 볼 수 없습니다. 궁금하면 관리자에게 문의해 주세요.', '<div class="actions center"><a class="btn" href="/">홈으로</a></div>');

const fmtDate = (ms, withTime = false) => {
  const d = new Date(ms + 9 * 3600000).toISOString();
  return withTime ? `${d.slice(0, 10).replace(/-/g, '.')} ${d.slice(11, 16)}` : d.slice(0, 10).replace(/-/g, '.');
};

// ───────── 회원 화면 ─────────
async function latestDocs(db, site, env) {
  if (env) await ensureDocs(env, site);
  const { results } = await db.prepare(`SELECT d.* FROM documents d WHERE d.site = ? AND d.version =
    (SELECT MAX(version) FROM documents x WHERE x.site = d.site AND x.doc_type = d.doc_type)`).bind(site).all();
  return { TERMS: results.find((d) => d.doc_type === 'TERMS'), PRIVACY: results.find((d) => d.doc_type === 'PRIVACY') };
}

function fieldInput(f, value) {
  const req = f.mode === 'REQUIRED' ? ' required' : '';
  const label = `<span>${esc(f.label)}${f.mode === 'REQUIRED' ? ' <em class="req">*</em>' : ''}</span>`;
  const v = value ?? '';
  if (f.type === 'SELECT') {
    return `<label class="field">${label}<select class="input" name="${f.key}"${req}><option value="">선택해 주세요</option>${(f.options || [])
      .map((o) => `<option${o === v ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select></label>`;
  }
  if (f.type === 'RADIO' || f.type === 'CHECKBOX') {
    const vals = Array.isArray(v) ? v : [v];
    const t = f.type === 'RADIO' ? 'radio' : 'checkbox';
    return `<fieldset class="field" data-group="${f.key}" data-type="${f.type}"${req ? ' data-required' : ''}>${label.replace('span', 'legend').replace('</span>', '</legend>')}
      <div class="choices">${(f.options || []).map((o) => `<label class="check"><input type="${t}" name="${f.key}" value="${esc(o)}"${vals.includes(o) ? ' checked' : ''}> ${esc(o)}</label>`).join('')}</div></fieldset>`;
  }
  const type = f.type === 'NUMBER' ? 'number' : f.type === 'DATE' ? 'date'
    : f.key === 'email' ? 'email' : (f.key === 'mobile' || f.key === 'phone') ? 'tel' : 'text';
  const auto = { name: 'name', email: 'email', mobile: 'tel', nickname: 'nickname' }[f.key] || 'off';
  return `<label class="field">${label}<input class="input" type="${type}" name="${f.key}" value="${esc(v)}" autocomplete="${auto}"${req}${type === 'text' ? ' maxlength="100"' : ''}></label>`;
}

async function loginPage(ctx) {
  if (ctx.me.kind === 'member') return Response.redirect(`${ctx.url.origin}/member/mypage`, 302);
  const next = safeNext(ctx.url.searchParams.get('next'));
  return page(ctx, '로그인', `<section class="pub-box narrow">
    <h1>로그인</h1>
    <form data-form="login" data-next="${esc(next)}">
      <label class="field"><span>아이디</span><input class="input" name="login_id" autocomplete="username" required></label>
      <label class="field"><span>비밀번호</span><input class="input" type="password" name="password" autocomplete="current-password" required></label>
      <p class="err" role="alert"></p>
      <button class="btn primary wide" type="submit">로그인</button>
    </form>
    <p class="sub-links"><a href="/member/signup">회원가입</a><span>비밀번호를 잊으셨으면 관리자에게 새 비밀번호를 받으세요.</span></p>
  </section>`, { noindex: true });
}

async function signupPage(ctx) {
  const { env, site, me } = ctx;
  if (me.kind === 'member') return Response.redirect(`${ctx.url.origin}/member/mypage`, 302);
  const { fields } = await siteSettings(env.DB, site);
  const docs = await latestDocs(env.DB, site, env);
  const agree = (d, key, label) => (d ? `<div class="agree-row"><label class="check"><input type="checkbox" name="agree_${key}" required> ${label} 동의 <em class="req">(필수)</em></label>
    <button type="button" class="linkish" data-doc="${key}">전문 보기</button><template id="doc-${key}">${d.content}</template></div>` : '');
  const agreeBox = docs.TERMS || docs.PRIVACY ? `<div class="agree">
      <label class="check all"><input type="checkbox" data-agree-all> 아래 내용에 모두 동의합니다</label>
      ${agree(docs.TERMS, 'terms', '이용약관')}${agree(docs.PRIVACY, 'privacy', '개인정보 처리방침')}</div>` : '';
  return page(ctx, '회원가입', `<section class="pub-box narrow">
    <h1>회원가입</h1>
    <form data-form="signup">
      <label class="field"><span>아이디 <em class="req">*</em></span><input class="input" name="login_id" autocomplete="username" required minlength="4" maxlength="50" pattern="[A-Za-z0-9_\\-]{4,50}">
        <small>영문·숫자·_·- 4~50자</small></label>
      <label class="field"><span>비밀번호 <em class="req">*</em></span><input class="input" type="password" name="password" autocomplete="new-password" required minlength="8" maxlength="200"><small>8자 이상</small></label>
      <label class="field"><span>비밀번호 확인 <em class="req">*</em></span><input class="input" type="password" name="password2" autocomplete="new-password" required><small data-pw-match></small></label>
      <label class="check show-pw"><input type="checkbox" data-show-pw> 비밀번호 보기</label>
      ${fields.filter((f) => f.mode !== 'EXCLUDED').map((f) => fieldInput(f)).join('')}
      ${agreeBox}
      <p class="err" role="alert"></p>
      <button class="btn primary wide" type="submit">가입하기</button>
    </form>
  </section>`, { noindex: true });
}

async function mypage(ctx) {
  const { env, site, me } = ctx;
  if (me.kind !== 'member') return needLogin(ctx, '/member/mypage');
  const { fields, levelNames } = await siteSettings(env.DB, site);
  const m = me.member;
  const extra = JSON.parse(m.extra || '{}');
  const val = (f) => (MEMBER_COLUMNS.includes(f.key) ? m[f.key] : extra[f.key]);
  return page(ctx, '마이페이지', `<section class="pub-box narrow">
    <h1>마이페이지</h1>
    <dl class="kv"><dt>아이디</dt><dd>${esc(m.login_id)}</dd><dt>등급</dt><dd>${esc(levelNames[m.level])}</dd><dt>가입일</dt><dd>${fmtDate(m.created_at)}</dd></dl>
    <h2>내 정보</h2>
    <form data-form="profile">
      ${fields.filter((f) => f.mode !== 'EXCLUDED').map((f) => fieldInput(f, val(f))).join('')}
      <p class="err" role="alert"></p>
      <button class="btn primary" type="submit">저장</button>
    </form>
    <h2>비밀번호 변경</h2>
    <form data-form="password">
      <label class="field"><span>지금 비밀번호</span><input class="input" type="password" name="current" autocomplete="current-password" required></label>
      <label class="field"><span>새 비밀번호</span><input class="input" type="password" name="next" autocomplete="new-password" minlength="8" required><small>8자 이상</small></label>
      <label class="field"><span>새 비밀번호 확인</span><input class="input" type="password" name="next2" autocomplete="new-password" required></label>
      <p class="err" role="alert"></p>
      <button class="btn" type="submit">비밀번호 바꾸기</button>
    </form>
    <h2>회원 탈퇴</h2>
    <form data-form="withdraw">
      <label class="field"><span>탈퇴 사유 (선택)</span><input class="input" name="reason" maxlength="200"></label>
      <p class="err" role="alert"></p>
      <button class="btn danger" type="submit" data-confirm="정말 탈퇴할까요? 탈퇴하면 이 아이디로 로그인할 수 없습니다. 쓴 글과 댓글은 그대로 남습니다.">탈퇴하기</button>
    </form>
  </section>`, { noindex: true });
}

async function docPage(ctx, type) {
  const d = (await latestDocs(ctx.env.DB, ctx.site, ctx.env))[type];
  const title = type === 'TERMS' ? '이용약관' : '개인정보 처리방침';
  if (!d) return msgPage(ctx, title, '아직 게시된 내용이 없습니다.');
  return page(ctx, title, `<section class="pub-box"><h1>${title}</h1><p class="meta">v${d.version} · ${fmtDate(d.published_at)} 시행</p><div class="prose">${d.content}</div></section>`);
}

// ───────── 게시판 화면 ─────────
async function loadBoard(db, site, slug) {
  const b = await db.prepare('SELECT * FROM boards WHERE site = ? AND slug = ? AND deleted_at IS NULL').bind(site, slug).first();
  return b ? { ...b, opt: boardOptions(JSON.parse(b.options || '{}')) } : null;
}
const canList = (b, me) => b.visible || me.level === 1 ? canBy(b.list_levels, b.allow_guest_list, me) : false;
const canRead = (b, me) => canBy(b.read_levels, b.allow_guest_read, me);
const canWrite = (b, me) => canBy(b.write_levels, b.allow_guest_write, me, true);
const canComment = (b, me) => me.level > 0 && canBy(b.comment_levels, 0, me, true);
const isMine = (p, me) => me.kind === 'member' && p.writer_id === me.member.id;
const writerOf = (b, p, me) => (b.opt.writer_mode === 'HIDDEN' && me.level !== 1 && !isMine(p, me) ? '비공개' : p.writer_name);
const firstImage = (h) => (String(h).match(/<img[^>]+src="([^"]+)"/i) || [])[1] || '';

async function boardList(ctx, b) {
  const { env, me, url } = ctx;
  if (!canList(b, me)) return me.level ? noRight(ctx) : needLogin(ctx, url.pathname);
  const q = str(url.searchParams.get('q'), 50);
  const size = [10, 20, 30].includes(Number(url.searchParams.get('size'))) ? Number(url.searchParams.get('size')) : b.opt.page_size;
  const pg = Math.max(1, Number(url.searchParams.get('page')) || 1);
  const admin = me.level === 1;
  const where = ['board_id = ?', 'deleted_at IS NULL', 'is_notice = 0'];
  const args = [b.id];
  if (!admin) { where.push('published_at <= ?'); args.push(now()); }
  if (q) { where.push('(title LIKE ? OR content_html LIKE ?)'); args.push(`%${q}%`, `%${q}%`); }
  const w = where.join(' AND ');
  const total = (await env.DB.prepare(`SELECT COUNT(*) AS n FROM posts WHERE ${w}`).bind(...args).first()).n;
  const { results: rows } = await env.DB.prepare(`SELECT * FROM posts WHERE ${w} ORDER BY published_at DESC, id DESC LIMIT ? OFFSET ?`).bind(...args, size, (pg - 1) * size).all();
  const notices = pg === 1 && !q ? (await env.DB.prepare(`SELECT * FROM posts WHERE board_id = ? AND deleted_at IS NULL AND is_notice = 1 ${admin ? '' : 'AND published_at <= ?'} ORDER BY published_at DESC`)
    .bind(...(admin ? [b.id] : [b.id, now()])).all()).results : [];
  const ls = b.opt.list_show;
  const isNew = (p) => now() - p.published_at < b.opt.new_hours * 3600000;
  const secretHidden = (p) => p.is_secret && !admin && !isMine(p, me);
  const titleHtml = (p) => `${p.is_secret ? '<span class="tag">비밀</span>' : ''}${p.published_at > now() ? '<span class="tag warn">예약</span>' : ''}${esc(secretHidden(p) ? '비밀글입니다' : p.title)}${isNew(p) ? '<span class="tag new">N</span>' : ''}`;
  const link = (p) => `/board/${b.slug}/${p.id}`;
  let list = '';
  const all = [...notices.map((p) => ({ ...p, _notice: true })), ...rows];
  if (!all.length) {
    list = `<div class="empty"><b>${q ? '검색 결과가 없습니다' : '아직 게시글이 없습니다'}</b>${q ? `<a href="/board/${b.slug}">전체 글 보기</a>` : ''}</div>`;
  } else if (b.list_layout === 'CARD') {
    list = `<div class="cards">${all.map((p) => {
      const img = secretHidden(p) ? '' : firstImage(p.content_html);
      return `<a class="pcard" href="${link(p)}"><div class="thumb">${img ? `<img src="${esc(img)}" alt="" loading="lazy">` : '<span>No Image</span>'}</div>
        <div class="pcard-b">${p._notice ? '<span class="tag notice">공지</span>' : ''}<b>${titleHtml(p)}</b>${ls.date ? `<small>${fmtDate(p.published_at)}</small>` : ''}</div></a>`;
    }).join('')}</div>`;
  } else if (b.list_layout === 'BLOG') {
    list = `<div class="blog">${all.map((p) => `<article class="blog-row"><a href="${link(p)}">${p._notice ? '<span class="tag notice">공지</span>' : ''}<h3>${titleHtml(p)}</h3>
      ${secretHidden(p) ? '' : `<p>${esc(plainText(p.content_html).slice(0, 160))}</p>`}</a>
      <div class="meta">${ls.writer ? `<span>${esc(writerOf(b, p, me))}</span>` : ''}${ls.date ? `<span>${fmtDate(p.published_at)}</span>` : ''}${ls.views ? `<span>조회 ${p.view_count}</span>` : ''}</div></article>`).join('')}</div>`;
  } else {
    list = `<table class="ptable"><thead><tr>${ls.no ? '<th class="c-no">번호</th>' : ''}<th>제목</th>${ls.writer ? '<th class="c-w">작성자</th>' : ''}${ls.date ? '<th class="c-d">작성일</th>' : ''}${ls.views ? '<th class="c-v">조회</th>' : ''}</tr></thead><tbody>
      ${all.map((p, i) => `<tr class="${p._notice ? 'is-notice' : ''}">${ls.no ? `<td class="c-no">${p._notice ? '<span class="tag notice">공지</span>' : total - (pg - 1) * size - (i - notices.length)}</td>` : ''}
        <td class="c-t"><a href="${link(p)}">${!ls.no && p._notice ? '<span class="tag notice">공지</span>' : ''}${titleHtml(p)}</a></td>
        ${ls.writer ? `<td class="c-w">${esc(writerOf(b, p, me))}</td>` : ''}${ls.date ? `<td class="c-d">${fmtDate(p.published_at)}</td>` : ''}${ls.views ? `<td class="c-v">${p.view_count}</td>` : ''}</tr>`).join('')}
      </tbody></table>`;
  }
  const pages = Math.max(1, Math.ceil(total / size));
  const qs = (n) => `?${new URLSearchParams({ ...(q ? { q } : {}), ...(size !== b.opt.page_size ? { size } : {}), page: n })}`;
  const start = Math.floor((pg - 1) / 5) * 5 + 1;
  const pager = pages > 1 ? `<nav class="pager">${start > 1 ? `<a href="${qs(start - 1)}">‹</a>` : ''}${Array.from({ length: Math.min(5, pages - start + 1) }, (_, i) => start + i)
    .map((n) => (n === pg ? `<b>${n}</b>` : `<a href="${qs(n)}">${n}</a>`)).join('')}${start + 5 <= pages ? `<a href="${qs(start + 5)}">›</a>` : ''}</nav>` : '';
  return page(ctx, b.name, `<section class="pub-box wide">
    <div class="board-head"><h1>${esc(b.name)}</h1>${canWrite(b, me) ? `<a class="btn primary" href="/board/${b.slug}/write">글쓰기</a>` : ''}</div>
    <form class="board-tools" method="get"><input class="input" name="q" value="${esc(q)}" placeholder="제목·내용 검색"><button class="btn" type="submit">검색</button>
      <select class="input" name="size" data-autosubmit aria-label="한 쪽에 보일 글 수">${[10, 20, 30].map((n) => `<option value="${n}"${n === size ? ' selected' : ''}>${n}개씩</option>`).join('')}</select></form>
    ${list}${pager}
  </section>`);
}

async function postView(ctx, b, id) {
  const { env, me, url } = ctx;
  const p = await env.DB.prepare('SELECT * FROM posts WHERE id = ? AND board_id = ? AND deleted_at IS NULL').bind(id, b.id).first();
  if (!p || (p.published_at > now() && me.level !== 1)) return msgPage(ctx, '글이 없습니다', '지워졌거나 없는 글입니다.', `<div class="actions center"><a class="btn" href="/board/${b.slug}">목록으로</a></div>`, 404);
  if (!canRead(b, me)) return me.level ? noRight(ctx) : needLogin(ctx, url.pathname);
  if (p.is_secret && me.level !== 1 && !isMine(p, me)) return msgPage(ctx, '비밀글입니다', '쓴 사람과 관리자만 볼 수 있습니다.', `<div class="actions center"><a class="btn" href="/board/${b.slug}">목록으로</a></div>`);
  await env.DB.prepare('UPDATE posts SET view_count = view_count + 1 WHERE id = ?').bind(p.id).run();
  const vs = b.opt.view_show;
  let comments = '';
  if (b.use_comment) {
    const { results } = await env.DB.prepare('SELECT * FROM comments WHERE post_id = ? AND deleted_at IS NULL ORDER BY id').bind(p.id).all();
    comments = `<section class="comments"><h2>댓글 ${results.length}</h2>
      ${results.map((c) => `<div class="cmt"><div class="meta"><b>${esc(c.writer_name)}</b><span>${fmtDate(c.created_at, true)}</span>
        ${me.level === 1 || (me.kind === 'member' && me.member.id === c.writer_id) ? `<button type="button" class="linkish danger" data-del-comment="${c.id}">삭제</button>` : ''}</div>
        <p class="pre">${esc(c.body)}</p></div>`).join('') || '<p class="meta">첫 댓글을 남겨 보세요.</p>'}
      ${canComment(b, me) ? `<form data-form="comment" data-post="${p.id}"><textarea class="input" name="body" maxlength="2000" required placeholder="댓글을 남겨 주세요"></textarea>
        <p class="err" role="alert"></p><div class="actions end"><button class="btn primary" type="submit">댓글 등록</button></div></form>`
        : me.level ? '' : `<p class="meta"><a href="/member/login?next=${encodeURIComponent(url.pathname)}">로그인</a>하면 댓글을 남길 수 있습니다.</p>`}
    </section>`;
  }
  const mine = me.level === 1 || isMine(p, me);
  return page(ctx, p.title, `<section class="pub-box wide">
    <p class="crumb"><a href="/board/${b.slug}">${esc(b.name)}</a></p>
    <article class="post">
      <h1>${p.is_notice ? '<span class="tag notice">공지</span>' : ''}${p.is_secret ? '<span class="tag">비밀</span>' : ''}${esc(p.title)}</h1>
      <div class="meta">${vs.writer ? `<span>${esc(writerOf(b, p, me))}</span>` : ''}${vs.date ? `<span>${fmtDate(p.published_at, true)}</span>` : ''}${vs.views ? `<span>조회 ${p.view_count + 1}</span>` : ''}
        ${p.published_at > now() ? `<span class="tag warn">${fmtDate(p.published_at, true)} 공개 예약</span>` : ''}</div>
      <div class="prose">${p.content_html}</div>
    </article>
    <div class="actions"><a class="btn" href="/board/${b.slug}">목록</a>${mine ? `<a class="btn" href="/board/${b.slug}/${p.id}/edit">수정</a>
      <button class="btn danger" type="button" data-del-post="${p.id}" data-back="/board/${b.slug}">삭제</button>` : ''}</div>
    ${comments}
  </section>`);
}

async function postForm(ctx, b, id) {
  const { env, me, url } = ctx;
  let p = null;
  if (id) {
    p = await env.DB.prepare('SELECT * FROM posts WHERE id = ? AND board_id = ? AND deleted_at IS NULL').bind(id, b.id).first();
    if (!p) return msgPage(ctx, '글이 없습니다', '지워졌거나 없는 글입니다.', '', 404);
    if (!(me.level === 1 || isMine(p, me))) return me.level ? noRight(ctx) : needLogin(ctx, url.pathname);
  } else if (!canWrite(b, me)) return me.level ? noRight(ctx) : needLogin(ctx, url.pathname);
  const admin = me.level === 1;
  const local = (ms) => new Date(ms + 9 * 3600000).toISOString().slice(0, 16);
  return page(ctx, id ? '글 수정' : '글쓰기', `<section class="pub-box wide">
    <p class="crumb"><a href="/board/${b.slug}">${esc(b.name)}</a></p>
    <h1>${id ? '글 수정' : '글쓰기'}</h1>
    <form data-form="post" data-board="${esc(b.slug)}" data-id="${id || ''}">
      <label class="field"><span>제목</span><input class="input" name="title" maxlength="200" required value="${esc(p?.title)}"></label>
      ${me.kind === 'guest' ? '<label class="field"><span>이름</span><input class="input" name="writer_name" maxlength="20" required><small>비회원으로 남기는 글입니다. 수정·삭제는 관리자에게 문의해 주세요.</small></label>' : ''}
      <div class="field"><span>내용</span><div class="editor" data-editor><textarea name="content" hidden>${esc(p?.content_html || '')}</textarea></div></div>
      <div class="opts">
        ${admin ? `<label class="check"><input type="checkbox" name="is_notice"${p?.is_notice ? ' checked' : ''}> 공지로 지정</label>` : ''}
        ${b.use_secret ? `<label class="check"><input type="checkbox" name="is_secret"${p?.is_secret ? ' checked' : ''}> 비밀글</label>` : ''}
        ${admin ? `<label class="field inline"><span>작성일</span><input class="input" type="datetime-local" name="published_at" value="${p ? local(p.published_at) : ''}"><small>비워 두면 지금. 미래로 정하면 그때까지 숨겨집니다(예약 발행).</small></label>` : ''}
      </div>
      <p class="err" role="alert"></p>
      <div class="actions"><a class="btn" href="${id ? `/board/${b.slug}/${id}` : `/board/${b.slug}`}">취소</a><button class="btn primary" type="submit">${id ? '수정' : '등록'}</button></div>
    </form>
  </section>`, { noindex: true });
}

// ───────── 라우터: 화면 ─────────
export async function publicPage(ctx) {
  const p = ctx.url.pathname.replace(/\/+$/, '') || '/';
  if (p === '/member/login') return loginPage(ctx);
  if (p === '/member/signup') return signupPage(ctx);
  if (p === '/member/mypage') return mypage(ctx);
  if (p === '/member/terms') return docPage(ctx, 'TERMS');
  if (p === '/member/privacy') return docPage(ctx, 'PRIVACY');
  const m = p.match(/^\/board\/([a-z0-9-]+)(?:\/(\d+|write)(?:\/(edit))?)?$/);
  if (m) {
    const b = await loadBoard(ctx.env.DB, ctx.site, m[1]);
    if (!b || (!b.visible && ctx.me.level !== 1)) return msgPage(ctx, '게시판이 없습니다', '주소가 바뀌었거나 없는 게시판입니다.', '<div class="actions center"><a class="btn" href="/">홈으로</a></div>', 404);
    if (!m[2]) return boardList(ctx, b);
    if (m[2] === 'write') return postForm(ctx, b, null);
    if (m[3]) return postForm(ctx, b, Number(m[2]));
    return postView(ctx, b, Number(m[2]));
  }
  return msgPage(ctx, '페이지가 없습니다', '주소를 다시 확인해 주세요.', '', 404);
}

// ───────── 라우터: 방문자 API ─────────
function safeNext(n) { return n && /^\/(?!\/)/.test(n) ? n : '/'; }

export async function publicApi(ctx) {
  const { request, env, site, me, url } = ctx;
  const db = env.DB;
  const path = url.pathname.replace(/^\/xms-api/, '').replace(/\/+$/, '');
  const method = request.method;
  let m;

  if (path === '/menu' && method === 'GET') return json(await visibleMenus(db, site, me));
  if (path === '/me' && method === 'GET') {
    if (me.kind === 'guest') return json({ guest: true });
    return json(me.kind === 'staff' ? { staff: true, admin: true } : { name: me.member.name, login_id: me.member.login_id, admin: isAdmin(me) });
  }

  if (path === '/login' && method === 'POST') {
    const ipKey = `ip:${site}:${clientIp(request)}`;
    if (await tooManyFails(db, ipKey)) throw new HttpError(429, '로그인 시도가 너무 많습니다. 15분 뒤에 다시 해 주세요.');
    const raw = await body(request);
    const m2 = await db.prepare("SELECT * FROM members WHERE site = ? AND login_id = ? AND status != 'WITHDRAWN'").bind(site, str(raw.login_id, 50)).first();
    if (m2 && m2.locked_until > now()) throw new HttpError(423, `비밀번호를 ${LOCK_AFTER}번 틀려 잠시 잠겼습니다. ${Math.ceil((m2.locked_until - now()) / 60000)}분 뒤에 다시 해 주세요.`);
    const ok = m2 && sameText(await hashPassword(String(raw.password ?? '').slice(0, 200), m2.pw_salt), m2.pw_hash);
    if (!ok) {
      await recordFail(db, ipKey);
      if (m2) {
        const n = m2.fail_count + 1;
        await db.prepare('UPDATE members SET fail_count = ?, locked_until = ? WHERE id = ?').bind(n >= LOCK_AFTER ? 0 : n, n >= LOCK_AFTER ? now() + LOCK_MS : 0, m2.id).run();
        if (n >= LOCK_AFTER) throw new HttpError(423, `비밀번호를 ${LOCK_AFTER}번 틀려 15분 동안 잠겼습니다.`);
      }
      throw new HttpError(401, '아이디 또는 비밀번호가 맞지 않습니다.');
    }
    if (m2.status === 'LOCKED') throw new HttpError(423, '관리자가 로그인을 막아 둔 계정입니다. 관리자에게 문의해 주세요.');
    await db.prepare('UPDATE members SET fail_count = 0, locked_until = 0, last_login_at = ? WHERE id = ?').bind(now(), m2.id).run();
    return json({ ok: true, admin: m2.level === 1 }, 200, { 'Set-Cookie': await createSession(db, site, 'member', m2.id) });
  }
  if (path === '/logout' && method === 'POST') {
    if (me.token) await db.prepare('DELETE FROM sessions WHERE token = ?').bind(me.token).run();
    return json({ ok: true }, 200, { 'Set-Cookie': setCookie(SESS_COOKIE, '', 0) });
  }

  if (path === '/signup' && method === 'POST') {
    const raw = await body(request);
    const loginId = str(raw.login_id, 50);
    if (!/^[A-Za-z0-9_-]{4,50}$/.test(loginId)) throw bad('아이디는 영문·숫자·_·- 4~50자로 넣어 주세요.');
    const pw = String(raw.password ?? '');
    if (pw.length < 8 || pw.length > 200) throw bad('비밀번호는 8자 이상으로 넣어 주세요.');
    const { fields } = await siteSettings(db, site);
    const vals = memberValues(fields, raw, true);
    const docs = await latestDocs(db, site, env);
    if (docs.TERMS && !raw.agree_terms) throw bad('이용약관에 동의해 주세요.');
    if (docs.PRIVACY && !raw.agree_privacy) throw bad('개인정보 처리방침에 동의해 주세요.');
    const dup = await db.prepare('SELECT id FROM members WHERE site = ? AND login_id = ?').bind(site, loginId).first();
    if (dup) throw bad('이미 사용 중인 아이디입니다.');
    const p = await newPassword(pw);
    const t = now();
    const r = await db.prepare(`INSERT INTO members (site, login_id, pw_hash, pw_salt, name, nickname, level, email, mobile, phone, extra, last_login_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 9, ?, ?, ?, ?, ?, ?)`).bind(site, loginId, p.pw_hash, p.pw_salt, vals.cols.name, vals.cols.nickname,
      vals.cols.email, vals.cols.mobile, vals.cols.phone, JSON.stringify(vals.extra), t, t).run();
    const id = r.meta.last_row_id;
    const agreeStmts = [docs.TERMS, docs.PRIVACY].filter(Boolean).map((d) => db.prepare('INSERT INTO member_agreements (member_id, document_id, agreed_at) VALUES (?, ?, ?)').bind(id, d.id, t));
    if (agreeStmts.length) await db.batch(agreeStmts);
    return json({ ok: true }, 200, { 'Set-Cookie': await createSession(db, site, 'member', id) });
  }

  // 아래는 로그인한 회원만
  if (path === '/profile' && method === 'PUT') {
    if (me.kind !== 'member') throw new HttpError(401, '로그인이 필요합니다.');
    const { fields } = await siteSettings(db, site);
    const vals = memberValues(fields, await body(request), false);
    const extra = { ...JSON.parse(me.member.extra || '{}'), ...vals.extra };
    await db.prepare('UPDATE members SET name = ?, nickname = ?, email = ?, mobile = ?, phone = ?, extra = ? WHERE id = ?')
      .bind(vals.cols.name || me.member.name, vals.cols.nickname, vals.cols.email, vals.cols.mobile, vals.cols.phone, JSON.stringify(extra), me.member.id).run();
    return json({ ok: true });
  }
  if (path === '/password' && method === 'POST') {
    if (me.kind !== 'member') throw new HttpError(401, '로그인이 필요합니다.');
    const raw = await body(request);
    if (!sameText(await hashPassword(String(raw.current ?? '').slice(0, 200), me.member.pw_salt), me.member.pw_hash)) throw bad('지금 비밀번호가 맞지 않습니다.');
    const next = String(raw.next ?? '');
    if (next.length < 8 || next.length > 200) throw bad('새 비밀번호는 8자 이상으로 넣어 주세요.');
    const p = await newPassword(next);
    await db.prepare('UPDATE members SET pw_hash = ?, pw_salt = ? WHERE id = ?').bind(p.pw_hash, p.pw_salt, me.member.id).run();
    await db.prepare('DELETE FROM sessions WHERE member_id = ? AND token != ?').bind(me.member.id, me.token).run();
    return json({ ok: true });
  }
  if (path === '/withdraw' && method === 'POST') {
    if (me.kind !== 'member') throw new HttpError(401, '로그인이 필요합니다.');
    if (me.member.level === 1) {
      const r = await db.prepare("SELECT COUNT(*) AS n FROM members WHERE site = ? AND level = 1 AND status = 'ACTIVE'").bind(site).first();
      if (r.n <= 1) throw bad('마지막 관리자는 탈퇴할 수 없습니다. 다른 관리자를 먼저 정해 주세요.');
    }
    const reason = str((await body(request)).reason, 200);
    await db.batch([
      db.prepare("UPDATE members SET status = 'WITHDRAWN', withdrawn_at = ?, withdraw_reason = ? WHERE id = ?").bind(now(), reason, me.member.id),
      db.prepare('DELETE FROM sessions WHERE member_id = ?').bind(me.member.id),
    ]);
    return json({ ok: true }, 200, { 'Set-Cookie': setCookie(SESS_COOKIE, '', 0) });
  }

  // 글
  if ((m = path.match(/^\/boards\/([a-z0-9-]+)\/posts$/)) && method === 'POST') {
    const b = await loadBoard(db, site, m[1]);
    if (!b) throw notFound('없는 게시판입니다.');
    if (!canWrite(b, me)) throw forbidden('이 게시판에 글을 쓸 수 없습니다.');
    const v = await postValues(b, me, await body(request), null);
    const t = now();
    const r = await db.prepare(`INSERT INTO posts (site, board_id, title, content_html, is_notice, is_secret, writer_id, writer_name, published_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(site, b.id, v.title, v.content, v.is_notice, v.is_secret,
      me.kind === 'member' ? me.member.id : null, v.writer_name, v.published_at ?? t, t, t).run();
    return json({ id: r.meta.last_row_id });
  }
  if ((m = path.match(/^\/posts\/(\d+)$/))) {
    const p = await db.prepare('SELECT * FROM posts WHERE id = ? AND site = ? AND deleted_at IS NULL').bind(+m[1], site).first();
    if (!p) throw notFound('없는 글입니다.');
    if (!(me.level === 1 || isMine(p, me))) throw forbidden('쓴 사람과 관리자만 고칠 수 있습니다.');
    const b = await db.prepare('SELECT * FROM boards WHERE id = ?').bind(p.board_id).first();
    if (method === 'PUT') {
      const v = await postValues({ ...b, opt: boardOptions(JSON.parse(b.options || '{}')) }, me, await body(request), p);
      await db.prepare('UPDATE posts SET title = ?, content_html = ?, is_notice = ?, is_secret = ?, published_at = ?, updated_at = ? WHERE id = ?')
        .bind(v.title, v.content, v.is_notice, v.is_secret, v.published_at ?? p.published_at, now(), p.id).run();
      return json({ ok: true });
    }
    if (method === 'DELETE') {
      await db.prepare('UPDATE posts SET deleted_at = ? WHERE id = ?').bind(now(), p.id).run();
      return json({ ok: true });
    }
  }
  if ((m = path.match(/^\/posts\/(\d+)\/comments$/)) && method === 'POST') {
    const p = await db.prepare('SELECT * FROM posts WHERE id = ? AND site = ? AND deleted_at IS NULL').bind(+m[1], site).first();
    if (!p) throw notFound('없는 글입니다.');
    const b = await db.prepare('SELECT * FROM boards WHERE id = ? AND deleted_at IS NULL').bind(p.board_id).first();
    if (!b || !b.use_comment) throw forbidden('댓글을 쓸 수 없는 게시판입니다.');
    if (me.kind === 'guest') throw new HttpError(401, '로그인하면 댓글을 남길 수 있습니다.');
    if (!canComment(b, me)) throw forbidden('댓글을 쓸 수 있는 등급이 아닙니다.');
    const text = str((await body(request)).body, 2000);
    if (!text) throw bad('댓글 내용을 넣어 주세요.');
    const name = me.kind === 'staff' ? '관리자' : (me.member.nickname || me.member.name);
    await db.prepare('INSERT INTO comments (site, post_id, writer_id, writer_name, body, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(site, p.id, me.kind === 'member' ? me.member.id : 0, name, text, now()).run();
    return json({ ok: true });
  }
  if ((m = path.match(/^\/comments\/(\d+)$/)) && method === 'DELETE') {
    const c = await db.prepare('SELECT * FROM comments WHERE id = ? AND site = ? AND deleted_at IS NULL').bind(+m[1], site).first();
    if (!c) throw notFound('없는 댓글입니다.');
    if (!(me.level === 1 || (me.kind === 'member' && me.member.id === c.writer_id))) throw forbidden('쓴 사람과 관리자만 지울 수 있습니다.');
    await db.prepare('UPDATE comments SET deleted_at = ? WHERE id = ?').bind(now(), c.id).run();
    return json({ ok: true });
  }

  throw notFound('없는 주소입니다.');
}

// 가입 항목 값 검사 → member 컬럼 / extra 로 나눈다
function memberValues(fields, raw, isSignup) {
  const cols = { name: '', nickname: '', email: '', mobile: '', phone: '' };
  const extra = {};
  for (const f of fields) {
    if (f.mode === 'EXCLUDED') continue;
    let v = raw[f.key];
    if (f.type === 'CHECKBOX') {
      v = (Array.isArray(v) ? v : v ? [v] : []).map((x) => str(x, 50)).filter((x) => (f.options || []).includes(x));
      if (f.mode === 'REQUIRED' && !v.length) throw bad(`${f.label}을(를) 골라 주세요.`);
      extra[f.key] = v;
      continue;
    }
    v = str(v, f.key === 'email' ? 120 : 100);
    if (f.mode === 'REQUIRED' && !v) throw bad(`${f.label}을(를) 넣어 주세요.`);
    if (v) {
      if ((f.type === 'SELECT' || f.type === 'RADIO') && !(f.options || []).includes(v)) throw bad(`${f.label} 값이 잘못됐습니다.`);
      if (f.type === 'NUMBER' && !/^-?\d+(\.\d+)?$/.test(v)) throw bad(`${f.label}은(는) 숫자로 넣어 주세요.`);
      if (f.type === 'DATE' && !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw bad(`${f.label}은(는) 날짜로 넣어 주세요.`);
      if (f.key === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) throw bad('이메일 주소를 확인해 주세요.');
      if (f.key === 'mobile' || f.key === 'phone') v = v.replace(/\D/g, '').slice(0, 15);
    }
    if (MEMBER_COLUMNS.includes(f.key)) cols[f.key] = v; else extra[f.key] = v;
  }
  if (isSignup && !cols.name) throw bad('이름을 넣어 주세요.');
  return { cols, extra };
}

async function postValues(b, me, raw, cur) {
  const title = str(raw.title, 200);
  if (!title) throw bad('제목을 넣어 주세요.');
  const content = await sanitizeHtml(raw.content);
  if (!plainText(content) && !/<img/i.test(content)) throw bad('내용을 넣어 주세요.');
  const admin = me.level === 1;
  let writer = '';
  if (!cur) {
    if (me.kind === 'member') writer = me.member.nickname || me.member.name;
    else if (me.kind === 'staff') writer = '관리자';
    else { writer = str(raw.writer_name, 20); if (!writer) throw bad('이름을 넣어 주세요.'); }
  }
  let published = null;
  if (admin && raw.published_at) {
    const t = Date.parse(`${raw.published_at}:00+09:00`);
    if (Number.isFinite(t)) published = t;
  }
  return {
    title, content, writer_name: writer, published_at: published,
    is_notice: admin ? (raw.is_notice ? 1 : 0) : (cur?.is_notice || 0),
    is_secret: b.use_secret ? (raw.is_secret ? 1 : 0) : (cur?.is_secret || 0),
  };
}

export { DAY };
