// xms 관리자 화면 (/admin/) — 해시 주소로 화면을 바꾼다: #/members, #/boards/3 …
import { $, $$, esc, makeApi, fmtDate, fmtPhone, toast, pillTabs, formData, openDialog, busy, confirmInline } from './common.js';
import { mountEditor } from './editor.js';
import { sortable, treeFromDepths } from './drag.js';

const api = makeApi('/xms-api/admin');
const pub = makeApi('/xms-api');
const main = $('#main');
let INFO = null; // { site, me, levelNames }
let dirty = false;

const LV = (n) => INFO.levelNames[n] || `${n}등급`;
const ACTIONS = {
  MEMBER_LEVEL: '등급 변경', MEMBER_LOCK: '로그인 막기', MEMBER_UNLOCK: '잠금 풀기', TEMP_PASSWORD: '비밀번호 재발급', MEMBER_WITHDRAW: '회원 탈퇴 처리',
  MEMBER_EXPORT: '엑셀 내려받기', LEVEL_NAMES: '등급 이름 변경', SIGNUP_FIELDS: '가입 항목 변경', SIGNUP_FIELD_ADD: '가입 항목 추가', SIGNUP_FIELD_DELETE: '가입 항목 삭제',
  DOC_PUBLISH: '약관·방침 발행', BOARD_CREATE: '게시판 만들기', BOARD_UPDATE: '게시판 설정 변경', BOARD_DELETE: '게시판 삭제', BOARD_RESTORE: '게시판 되살리기',
  MENU_CREATE: '메뉴 추가', MENU_UPDATE: '메뉴 변경', MENU_DELETE: '메뉴 삭제', MENU_SHOW: '메뉴 보이기', MENU_HIDE: '메뉴 숨기기',
  REQUEST_CREATE: '수정 요청', PASSWORD_CHANGE: '비밀번호 변경',
};

// ───────── 시작 · 로그인 ─────────
async function start() {
  try { INFO = await api('/me'); } catch (e) {
    if (e.status === 401 || e.status === 403) return showLogin(e.status === 403 ? '관리자 등급만 들어올 수 있습니다. 관리자 계정으로 다시 로그인해 주세요.' : '');
    return showLogin(e.message);
  }
  showApp();
}
function showLogin(msg = '') {
  $('#app').hidden = true;
  $('#login').hidden = false;
  $('#login .err').textContent = msg;
  $('#login-form [name=login_id]').focus();
}
$('#login-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  busy(form.querySelector('button'), form.querySelector('.err'), async () => {
    const r = await pub('/login', { method: 'POST', data: formData(form) });
    if (!r.admin) {
      await pub('/logout', { method: 'POST', data: {} });
      throw new Error('관리자 등급만 들어올 수 있습니다.');
    }
    form.reset();
    await start();
  });
});
$('#logout').addEventListener('click', async () => {
  try { await pub('/logout', { method: 'POST', data: {} }); } catch { /* 이미 끊김 */ }
  location.href = '/';
});

function showApp() {
  $('#login').hidden = true;
  $('#app').hidden = false;
  const s = INFO.site;
  document.title = `${s.name} 관리`;
  $('#who').textContent = INFO.me.staff ? '웹촌 직원' : `${INFO.me.name} 님`;
  if (INFO.me.staff) {
    $('#staff-bar').hidden = false;
    $('#staff-bar').textContent = `웹촌 직원이 ${s.name} 관리 화면에 대신 들어와 있습니다 — 여기서 하는 모든 작업은 기록에 남습니다.`;
    $('#adm').classList.add('staff');
  }
  renderSide();
  route();
}

// ───────── 왼쪽 메뉴 ─────────
const SIDE = [
  [null, [['#/storage', '저장 공간', 'storage']]],
  ['회원관리', [['#/members', '가입회원'], ['#/members/withdrawn', '탈퇴회원'], ['#/levels', '등급 이름'],
    ['head', '가입 항목'], ['#/fields', '항목 목록', 'sub'], ['#/fields/new', '항목 추가', 'sub'],
    ['head', '약관·방침'], ['#/terms', '이용약관', 'sub'], ['#/privacy', '개인정보 처리방침', 'sub']]],
  ['사이트', [['head', '게시판'], ['#/boards', '게시판 목록', 'sub'], ['#/boards/new', '게시판 만들기', 'sub'],
    ['head', '메뉴'], ['#/menus', '메뉴 목록', 'sub'], ['#/menus/new', '메뉴 추가', 'sub'], ['#/requests', '수정 요청']]],
  ['내 계정', [['#/account', '비밀번호 변경'], ['#/audit', '관리 로그']]],
];
function renderSide() {
  const s = INFO.site;
  const pct = s.quota_mb ? Math.round((s.used_mb / s.quota_mb) * 100) : 0;
  $('#side').innerHTML = `<a class="brand" href="/" target="_blank" rel="noopener"><i>${esc(s.slug.slice(0, 2).toUpperCase())}</i><span><b>${esc(s.name)}</b><small>${esc(s.domain || s.slug)}</small></span></a>
    ${SIDE.map(([group, items]) => `${group ? `<h4>${group}</h4>` : ''}${items.map(([href, label, kind]) => (href === 'head'
      ? `<div class="head">${label}</div>`
      : `<a href="${href}" class="${kind === 'sub' ? 'sub' : ''}">${label}${kind === 'storage' ? `<span class="meter${pct >= 90 ? ' full' : ''}">${pct}%</span>` : ''}</a>`)).join('')}`).join('')}
    <p class="foot">${esc(s.name)} 관리자 화면</p>`;
}
function markSide() {
  const h = location.hash || '#/members';
  const cands = $$('#side a[href^="#/"]');
  const best = cands.filter((a) => h === a.getAttribute('href') || h.startsWith(`${a.getAttribute('href')}/`))
    .sort((a, b) => b.getAttribute('href').length - a.getAttribute('href').length)[0];
  cands.forEach((a) => a.classList.toggle('on', a === best));
}
const side = $('#side');
$('#menu-btn').addEventListener('click', () => side.classList.toggle('open'));
$('#side-dim').addEventListener('click', () => side.classList.remove('open'));
side.addEventListener('click', (e) => { if (e.target.closest('a[href^="#/"]')) side.classList.remove('open'); });

// ───────── 화면 바꾸기 ─────────
addEventListener('hashchange', () => route());
addEventListener('beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
async function route() {
  if (!INFO) return;
  dirty = false;
  markSide();
  const h = (location.hash || '#/members').slice(1);
  const parts = h.split('?')[0].split('/').filter(Boolean);
  const qs = new URLSearchParams(h.split('?')[1] || '');
  main.innerHTML = '';
  scrollTo(0, 0);
  try {
    if (parts[0] === 'members' && parts[1] === 'withdrawn') return await withdrawnPage(qs);
    if (parts[0] === 'members') return await membersPage(qs);
    if (parts[0] === 'levels') return await levelsPage();
    if (parts[0] === 'fields' && parts[1] === 'new') return fieldNewPage();
    if (parts[0] === 'fields') return await fieldsPage();
    if (parts[0] === 'terms' || parts[0] === 'privacy') return await docPage(parts[0]);
    if (parts[0] === 'boards' && parts[1] === 'new') return await boardPage(null);
    if (parts[0] === 'boards' && parts[1]) return await boardPage(Number(parts[1]));
    if (parts[0] === 'boards') return await boardsPage();
    if (parts[0] === 'menus' && parts[1] === 'new') return await menuPage(null);
    if (parts[0] === 'menus' && parts[1]) return await menuPage(Number(parts[1]));
    if (parts[0] === 'menus') return await menusPage();
    if (parts[0] === 'requests') return await requestsPage();
    if (parts[0] === 'storage') return storagePage();
    if (parts[0] === 'account') return accountPage();
    if (parts[0] === 'audit') return await auditPage(qs);
    location.hash = '#/members';
  } catch (e) {
    if (e.status === 401 || e.status === 403) return showLogin('다시 로그인해 주세요.');
    main.innerHTML = `<div class="panel empty"><b>불러오지 못했습니다</b>${esc(e.message)}</div>`;
  }
}
const go = (hash) => { if (location.hash === hash) route(); else location.hash = hash; };

function head(eyebrow, title, lede = '') {
  return `<header class="ph"><small>${eyebrow}</small><h1>${title}</h1>${lede ? `<p>${lede}</p>` : ''}</header>`;
}
const empty = (t, hint, action = '') => `<div class="empty"><b>${t}</b><span>${hint}</span>${action}</div>`;
function pager(page, size, total, href) {
  const pages = Math.ceil(total / size);
  if (pages <= 1) return '';
  const start = Math.floor((page - 1) / 5) * 5 + 1;
  const nums = Array.from({ length: Math.min(5, pages - start + 1) }, (_, i) => start + i);
  return `<nav class="pager">${start > 1 ? `<a href="${href(start - 1)}">‹</a>` : ''}${nums.map((n) => (n === page ? `<b>${n}</b>` : `<a href="${href(n)}">${n}</a>`)).join('')}${start + 5 <= pages ? `<a href="${href(start + 5)}">›</a>` : ''}</nav>`;
}
function saveBar(text, cancelHref) {
  return `<div class="savebar"><span>${text}</span>${cancelHref ? `<a href="${cancelHref}">취소</a>` : ''}<button class="btn primary" type="submit">저장</button></div>`;
}
function ctrlS(form) {
  const h = (e) => { if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); form.requestSubmit(); } };
  addEventListener('keydown', h);
  addEventListener('hashchange', () => removeEventListener('keydown', h), { once: true });
  form.addEventListener('input', () => { dirty = true; });
}

// ───────── 가입회원 ─────────
let tempNotice = '';
async function membersPage(qs) {
  const d = await api(`/members?${qs}`);
  const extraFields = d.fields.filter((f) => !['name', 'email', 'mobile', 'nickname', 'phone'].includes(f.key));
  const filtered = qs.get('q') || qs.get('level') || qs.get('missing');
  const lede = filtered ? `조건에 맞는 회원 ${d.total}명입니다.` : `${d.all}명이 가입해 있습니다. 등급을 바꾸거나 로그인을 막을 수 있습니다.`;
  const exportQs = new URLSearchParams(qs); exportQs.delete('page');
  const reqFields = d.fields.filter((f) => f.mode === 'REQUIRED');
  const lvOpts = (sel) => Array.from({ length: 10 }, (_, i) => i + 1).map((n) => `<option value="${n}"${n === sel ? ' selected' : ''}>${esc(LV(n))}</option>`).join('');
  main.innerHTML = `${head('회원', '가입회원', lede)}
    ${tempNotice ? `<div class="notice-bar" role="status"><span>${tempNotice}</span><button type="button" aria-label="닫기" data-x>×</button></div>` : ''}
    <form class="search" id="msearch">
      <input class="input" name="q" value="${esc(qs.get('q') || '')}" placeholder="이름, 아이디, 이메일, 휴대전화${extraFields.map((f) => `, ${esc(f.label)}`).join('')}로 찾기">
      <select class="input" name="missing"><option value="">필수 항목 채움 여부</option>${reqFields.map((f) => `<option value="${f.key}"${qs.get('missing') === f.key ? ' selected' : ''}>${esc(f.label)} 비어 있음</option>`).join('')}</select>
      <select class="input" name="level"><option value="">모든 등급</option>${lvOpts(Number(qs.get('level')))}</select>
      <button class="btn primary" type="submit">찾기</button>
      ${filtered ? '<a class="btn" href="#/members">조건 지우기</a>' : ''}
      <a class="btn green right" href="/xms-api/admin/members/export?${exportQs}">엑셀로 내려받기</a>
    </form>
    <div class="panel">${d.rows.length ? `<table class="tbl cardy"><thead><tr><th>이름</th><th>아이디</th><th>연락처</th>${extraFields.map((f) => `<th>${esc(f.label)}</th>`).join('')}<th>등급</th><th>최근 로그인</th><th>관리</th></tr></thead><tbody>
      ${d.rows.map((m) => `<tr data-id="${m.id}">
        <td><button type="button" class="who-btn" data-detail>${esc(m.name)}</button>${m.nickname ? ` <span class="num">(${esc(m.nickname)})</span>` : ''}${m.status === 'LOCKED' ? ' <span class="tag red">잠김</span>' : ''}</td>
        <td data-l="아이디">${esc(m.login_id)}</td>
        <td data-l="연락처">${m.email || m.mobile ? `${esc(m.email)}${m.mobile ? `<small>${esc(fmtPhone(m.mobile))}</small>` : ''}` : '<span class="dash">—</span>'}</td>
        ${extraFields.map((f) => { const v = m.extra[f.key]; const t = Array.isArray(v) ? v.join(', ') : v; return `<td data-l="${esc(f.label)}">${t ? esc(t) : '<span class="dash">—</span>'}</td>`; }).join('')}
        <td data-l="등급"><div class="lv"><select class="input" aria-label="등급">${lvOpts(m.level)}</select><button class="btn sm" type="button" data-level>바꾸기</button></div></td>
        <td data-l="최근 로그인">${m.last_login_at ? fmtDate(m.last_login_at) : '<span class="dash">—</span>'}</td>
        <td><div class="mng"><button class="btn sm" type="button" data-lock>${m.status === 'LOCKED' ? '잠금 풀기' : '로그인 막기'}</button>
          <button class="btn sm" type="button" data-temp>비밀번호 재발급</button><button class="btn sm danger" type="button" data-out>탈퇴</button></div></td>
      </tr>`).join('')}</tbody></table>`
    : filtered ? empty('조건에 맞는 회원이 없습니다', '다른 이름이나 아이디로 찾아보세요.', '<a class="btn" href="#/members">조건 지우고 전체 보기</a>')
      : empty('아직 가입한 회원이 없습니다', '홈페이지에서 누군가 가입하면 여기에 나타납니다.')}</div>
    ${pager(d.page, d.size, d.total, (n) => { const p = new URLSearchParams(qs); p.set('page', n); return `#/members?${p}`; })}`;

  $('[data-x]')?.addEventListener('click', (e) => { tempNotice = ''; e.target.closest('.notice-bar').remove(); });
  $('#msearch').addEventListener('submit', (e) => {
    e.preventDefault();
    const p = new URLSearchParams(Object.entries(formData(e.target)).filter(([, v]) => v));
    go(`#/members?${p}`);
  });
  const reload = () => route();
  $$('tr[data-id]').forEach((tr) => {
    const m = d.rows.find((x) => x.id === +tr.dataset.id);
    const who = `${m.name}(${m.login_id})`;
    tr.querySelector('[data-detail]').onclick = () => memberDetail(m, d.fields);
    tr.querySelector('[data-level]').onclick = (e) => busy(e.currentTarget, null, async () => {
      await api(`/members/${m.id}/level`, { method: 'POST', data: { level: Number(tr.querySelector('select').value) } });
      toast(`${who} 님 등급을 바꿨습니다.`); reload();
    });
    tr.querySelector('[data-lock]').onclick = (e) => busy(e.currentTarget, null, async () => {
      await api(`/members/${m.id}/lock`, { method: 'POST', data: { locked: m.status !== 'LOCKED' } });
      toast(m.status === 'LOCKED' ? '잠금을 풀었습니다.' : '로그인을 막았습니다.'); reload();
    });
    tr.querySelector('[data-temp]').onclick = (e) => confirmInline(e.currentTarget, `<b>${esc(who)}</b> 님의 비밀번호가 즉시 바뀝니다. 지금 쓰는 비밀번호로는 로그인할 수 없게 되니, 바로 전달할 수 있을 때 발급하세요.`, '새 비밀번호 발급', async () => {
      const r = await api(`/members/${m.id}/temp-password`, { method: 'POST', data: {} });
      tempNotice = `<b>${esc(r.who)}</b> 님의 새 비밀번호 <code>${esc(r.password)}</code> — 이전 비밀번호는 이제 쓸 수 없습니다.`;
      reload();
    });
    tr.querySelector('[data-out]').onclick = (e) => confirmInline(e.currentTarget, `<b>${esc(who)}</b> 님이 가입회원 목록에서 사라지고 로그인할 수 없게 되며, 이 화면에서는 되돌릴 수 없습니다. 쓴 글과 댓글은 그대로 남습니다.`, '탈퇴 처리', async () => {
      await api(`/members/${m.id}/withdraw`, { method: 'POST', data: {} });
      toast('탈퇴 처리했습니다.'); reload();
    });
  });
}
function memberDetail(m, fields) {
  const val = (f) => { const v = ['name', 'nickname', 'email', 'mobile', 'phone'].includes(f.key) ? m[f.key] : m.extra[f.key]; return Array.isArray(v) ? v.join(', ') : (f.key === 'mobile' || f.key === 'phone' ? fmtPhone(v) : v); };
  openDialog(`<h2>${esc(m.name)}</h2><dl class="kv"><dt>아이디</dt><dd>${esc(m.login_id)}</dd><dt>등급</dt><dd>${esc(LV(m.level))}</dd>
    ${fields.map((f) => `<dt>${esc(f.label)}${f.mode === 'EXCLUDED' ? ' (안 받음)' : ''}</dt><dd>${esc(val(f)) || '<span class="dash">—</span>'}</dd>`).join('')}
    <dt>가입일</dt><dd>${fmtDate(m.created_at, true)}</dd><dt>최근 로그인</dt><dd>${m.last_login_at ? fmtDate(m.last_login_at, true) : '—'}</dd></dl>
    <div class="dlg-foot"><button class="btn primary" type="button" data-close>닫기</button></div>`);
}

// ───────── 탈퇴회원 ─────────
async function withdrawnPage(qs) {
  const d = await api(`/members/withdrawn?${qs}`);
  const exportQs = new URLSearchParams(qs); exportQs.delete('page'); exportQs.set('withdrawn', '1');
  main.innerHTML = `${head('회원', '탈퇴회원', qs.get('q') ? `조건에 맞는 탈퇴회원 ${d.total}명입니다.` : `탈퇴한 회원 ${d.all}명의 기록입니다.`)}
    <form class="search" id="wsearch"><input class="input" name="q" value="${esc(qs.get('q') || '')}" placeholder="이름, 아이디로 찾기"><button class="btn primary" type="submit">찾기</button>
      ${qs.get('q') ? '<a class="btn" href="#/members/withdrawn">조건 지우기</a>' : ''}<a class="btn green right" href="/xms-api/admin/members/export?${exportQs}">엑셀로 내려받기</a></form>
    <div class="panel">${d.rows.length ? `<table class="tbl cardy"><thead><tr><th>이름</th><th>아이디</th><th>탈퇴일</th><th>탈퇴사유</th></tr></thead><tbody>
      ${d.rows.map((m) => `<tr><td><b>${esc(m.name)}</b></td><td data-l="아이디">${esc(m.login_id)}</td><td data-l="탈퇴일">${fmtDate(m.withdrawn_at)}</td>
        <td data-l="탈퇴사유">${m.withdraw_reason ? esc(m.withdraw_reason) : '<span class="dash">적혀 있지 않음</span>'}</td></tr>`).join('')}</tbody></table>`
    : empty('탈퇴한 회원이 없습니다', '회원이 탈퇴하면 여기에 기록이 남습니다.')}</div>
    ${pager(d.page, d.size, d.total, (n) => { const p = new URLSearchParams(qs); p.set('page', n); return `#/members/withdrawn?${p}`; })}`;
  $('#wsearch').addEventListener('submit', (e) => { e.preventDefault(); const q = e.target.q.value.trim(); go(`#/members/withdrawn${q ? `?q=${encodeURIComponent(q)}` : ''}`); });
}

// ───────── 등급 이름 ─────────
const LEVEL_HINT = { 1: '사이트 관리자 — 이 관리 화면에 들어올 수 있는 유일한 등급', 9: '가입 기본 등급', 10: '제한 등급 — 읽기만 되고 글·댓글은 막힌다' };
const DEFAULT_LV = { 1: '관리자', 9: '일반회원', 10: '제한회원' };
async function levelsPage() {
  const d = await api('/levels');
  main.innerHTML = `${head('회원', '등급 이름', '등급은 1부터 10까지 정해져 있고 이름만 바꿀 수 있습니다. 비워 두면 기본 이름으로 돌아갑니다.')}
    <form id="lvform"><div class="panel"><table class="tbl cardy"><thead><tr><th>등급</th><th>이름</th><th>회원 수</th><th>설명</th></tr></thead><tbody>
      ${Array.from({ length: 10 }, (_, i) => i + 1).map((n) => `<tr><td><b>${n}</b></td>
        <td data-l="이름"><input class="input" name="${n}" maxlength="20" value="${esc(d.levelNames[n] === (DEFAULT_LV[n] || `${n}등급`) ? '' : d.levelNames[n])}" placeholder="${esc(DEFAULT_LV[n] || `${n}등급`)}"></td>
        <td data-l="회원 수">${d.counts[n] || 0}명</td><td data-l="설명"><small>${LEVEL_HINT[n] || ''}</small></td></tr>`).join('')}
    </tbody></table></div>${saveBar('등급 이름을 고치는 중입니다.', '#/members')}</form>`;
  const form = $('#lvform');
  ctrlS(form);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    busy(form.querySelector('[type=submit]'), null, async () => {
      await api('/levels', { method: 'PUT', data: { names: formData(form) } });
      INFO = await api('/me'); dirty = false;
      toast('등급 이름을 저장했습니다.'); route();
    });
  });
}

// ───────── 가입 항목 ─────────
const TYPE_LABEL = { TEXT: '입력', NUMBER: '숫자', DATE: '날짜', SELECT: '리스트선택', RADIO: '선택', CHECKBOX: '다중선택' };
const MODE_LABEL = { REQUIRED: '필수', OPTIONAL: '선택', EXCLUDED: '안 받음' };
async function fieldsPage() {
  const d = await api('/fields');
  let fields = d.fields;
  main.innerHTML = `${head('회원', '가입 항목', '회원가입 화면에서 받을 항목입니다. ⠿ 를 끌어 순서를 바꾸고 저장하세요.')}
    <form id="fform"><div class="panel"><table class="tbl cardy"><thead><tr><th></th><th>이름표</th><th>종류</th><th>받기</th><th>입력한 회원</th><th>관리</th></tr></thead><tbody id="frows">
    ${fields.map((f) => `<tr data-id="${f.key}">
      <td><button type="button" class="handle" aria-label="끌어서 순서 바꾸기">⠿</button></td>
      <td><input class="input" name="label" value="${esc(f.label)}" maxlength="30" aria-label="이름표"><small>키 ${esc(f.key)}</small></td>
      <td data-l="종류">${f.builtin ? '<span class="tag blue">기본 제공</span>' : `<span class="tag">${TYPE_LABEL[f.type]}</span>`}${f.options ? `<small>${esc(f.options.join(' · '))}</small>` : ''}</td>
      <td data-l="받기"><select class="input" name="mode"${f.key === 'name' ? ' disabled' : ''}>${Object.entries(MODE_LABEL).map(([k, v]) => `<option value="${k}"${k === f.mode ? ' selected' : ''}>${v}</option>`).join('')}</select>
        <small class="warn-txt" hidden></small></td>
      <td data-l="입력한 회원">${f.used}명 / ${d.total}명</td>
      <td><div class="mng">${f.options ? '<button type="button" class="btn sm" data-opts>보기 고치기</button>' : ''}${f.builtin ? '' : '<button type="button" class="btn sm danger" data-del>삭제</button>'}</div></td>
    </tr>`).join('')}</tbody></table></div>
    <p class="actions gap"><a class="btn" href="#/fields/new">+ 항목 추가</a></p>
    ${saveBar('가입 항목을 고치는 중입니다.', '#/members')}</form>`;
  const form = $('#fform');
  ctrlS(form);
  sortable($('#frows'), { rowSel: 'tr[data-id]', onDrop: () => { dirty = true; } });
  $$('#frows tr').forEach((tr) => {
    const f = fields.find((x) => x.key === tr.dataset.id);
    const sel = tr.querySelector('select');
    sel.addEventListener('change', () => {
      const w = tr.querySelector('.warn-txt');
      const left = d.total - f.used;
      w.hidden = !(sel.value === 'REQUIRED' && f.mode !== 'REQUIRED' && left > 0);
      w.textContent = `이미 가입한 회원 ${left}명이 이 항목을 비운 채로 남습니다.`;
    });
    tr.querySelector('[data-opts]')?.addEventListener('click', () => openDialog(`<h2>${esc(f.label)} 보기</h2><form>
      <label class="field"><span>보기 (한 줄에 하나, 쉼표 없이)</span><textarea class="input" name="o">${esc((f.options || []).join('\n'))}</textarea></label>
      <div class="dlg-foot"><button class="btn" type="button" data-close>취소</button><button class="btn primary" type="submit">적용</button></div></form>`, (dlg) => {
      dlg.querySelector('form').addEventListener('submit', (e) => {
        e.preventDefault();
        f.options = dlg.querySelector('[name=o]').value.split('\n').map((x) => x.trim()).filter(Boolean);
        tr.querySelector('td[data-l=종류] small').textContent = f.options.join(' · ');
        dirty = true; dlg.close();
      });
    }));
    tr.querySelector('[data-del]')?.addEventListener('click', (e) => confirmInline(e.currentTarget,
      `"${esc(f.label)}" 항목을 지웁니다. 회원 ${f.used}명이 넣은 값이 화면에서 보이지 않게 됩니다(같은 키로 다시 만들면 다시 보입니다).`, '항목 삭제', async () => {
        await api(`/fields/${f.key}`, { method: 'DELETE' });
        toast('항목을 지웠습니다.'); route();
      }));
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const list = $$('#frows tr').map((tr) => {
      const f = fields.find((x) => x.key === tr.dataset.id);
      return { key: f.key, label: tr.querySelector('[name=label]').value, mode: f.key === 'name' ? 'REQUIRED' : tr.querySelector('select').value, options: f.options };
    });
    busy(form.querySelector('[type=submit]'), null, async () => {
      await api('/fields', { method: 'PUT', data: { fields: list } });
      dirty = false; toast('가입 항목을 저장했습니다.'); route();
    });
  });
}
function fieldNewPage() {
  main.innerHTML = `${head('회원 › 가입 항목', '항목 추가', '새 항목은 목록 맨 끝에 붙습니다.')}
    <form class="panel pad" id="fnew">
      <div class="row2">
        <label class="field"><span>항목 키</span><input class="input" name="key" required pattern="[A-Za-z][A-Za-z0-9_]{0,29}" placeholder="birthday"><small>영문으로 시작, 영문·숫자·밑줄. 저장한 뒤에는 바꿀 수 없습니다.</small></label>
        <label class="field"><span>이름표</span><input class="input" name="label" required maxlength="30" placeholder="생일"></label>
      </div>
      <label class="field"><span>받기</span><select class="input" name="mode">${Object.entries(MODE_LABEL).map(([k, v]) => `<option value="${k}"${k === 'OPTIONAL' ? ' selected' : ''}>${v}</option>`).join('')}</select></label>
      <fieldset class="field"><legend>종류</legend><div class="choices">${Object.entries(TYPE_LABEL).map(([k, v], i) => `<label class="check"><input type="radio" name="type" value="${k}"${i ? '' : ' checked'}> ${v}</label>`).join('')}</div></fieldset>
      <label class="field" id="opt-field" hidden><span>보기 (한 줄에 하나, 쉼표 없이)</span><textarea class="input" name="options"></textarea></label>
      <p class="err" role="alert"></p>
      <div class="actions end"><a class="btn" href="#/fields">취소</a><button class="btn primary" type="submit">항목 추가</button></div>
    </form>`;
  const form = $('#fnew');
  form.addEventListener('change', () => { $('#opt-field').hidden = !['SELECT', 'RADIO', 'CHECKBOX'].includes(formData(form).type); });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    busy(form.querySelector('[type=submit]'), form.querySelector('.err'), async () => {
      const data = formData(form);
      await api('/fields', { method: 'POST', data: { ...data, options: data.options.split('\n') } });
      toast('항목을 추가했습니다.'); go('#/fields');
    });
  });
}

// ───────── 약관 · 방침 ─────────
async function docPage(kind) {
  const d = await api(`/documents/${kind}`);
  const title = kind === 'terms' ? '이용약관' : '개인정보 처리방침';
  const next = (d.current?.version || 0) + 1;
  main.innerHTML = `${head('회원 › 약관·방침', title, d.current ? `지금 v${d.current.version} (${fmtDate(d.current.published_at)} 발행). 고쳐서 새 버전으로 발행하면 그 뒤 가입하는 회원이 새 버전에 동의합니다.`
    : '<span class="tag warn">아직 없음</span> 기본 문안을 다듬어 발행하세요. 발행하면 회원가입 화면에 동의 칸이 생깁니다.')}
    <form id="dform"><div class="editor" data-editor><textarea name="content" hidden>${esc(d.current?.content || d.template)}</textarea></div>
      ${d.history.length ? `<p class="meta gap">이력: ${d.history.map((h) => `<button type="button" class="linkish" data-v="${h.version}">v${h.version} (${fmtDate(h.published_at)})</button>`).join(' ')}</p>` : ''}
      <div class="savebar"><span>발행한 버전은 지울 수 없습니다.</span><button class="btn primary" type="submit">새 버전으로 발행</button></div>
    </form>`;
  const ed = mountEditor($('[data-editor]'));
  const form = $('#dform');
  form.addEventListener('input', () => { dirty = true; });
  $$('[data-v]').forEach((b) => b.addEventListener('click', async () => {
    const h = await api(`/documents/${kind}/${b.dataset.v}`);
    openDialog(`<h2>${title} v${h.version}</h2><div class="prose">${h.content}</div><div class="dlg-foot"><button class="btn primary" type="button" data-close>닫기</button></div>`);
  }));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const btn = form.querySelector('[type=submit]');
    confirmInline(btn, `v${next}을 발행합니다 — 지금 이후 가입하는 회원은 v${next}에 동의하게 됩니다. 발행한 버전은 지울 수 없습니다.`, '발행', async () => {
      ed.sync();
      await api(`/documents/${kind}`, { method: 'POST', data: { content: form.content.value } });
      dirty = false; toast(`v${next}을 발행했습니다.`); route();
    });
  });
}

// ───────── 게시판 ─────────
const LAYOUT_LABEL = { TABLE: '테이블', CARD: '카드', BLOG: '블로그' };
async function boardsPage() {
  const d = await api('/boards');
  main.innerHTML = `${head('사이트', '게시판 목록', d.boards.length ? `홈페이지에 붙어 있는 게시판 ${d.boards.length}개입니다. 여기 순서는 이 목록의 차례이고, 홈페이지 메뉴 차례는 <a href="#/menus">메뉴</a>에서 정합니다.` : '')}
    <div class="panel">${d.boards.length ? `<table class="tbl cardy"><thead><tr><th>순서</th><th>이름</th><th>주소</th><th>목록 모양</th><th>제한</th><th>글</th><th>메뉴 위치</th><th>관리</th></tr></thead><tbody id="brows">
      ${d.boards.map((b) => `<tr data-id="${b.id}"><td><button type="button" class="handle" aria-label="끌어서 순서 바꾸기">⠿</button></td>
        <td><b>${esc(b.name)}</b>${b.visible ? '' : ' <span class="tag">숨김</span>'}</td>
        <td data-l="주소"><a href="/board/${esc(b.slug)}" target="_blank" rel="noopener">/board/${esc(b.slug)}</a></td>
        <td data-l="목록 모양">${LAYOUT_LABEL[b.list_layout]}</td><td data-l="제한">${b.allow_guest_list ? '<span class="dash">—</span>' : '<span class="tag blue">회원만</span>'}</td>
        <td data-l="글">${b.post_count}</td><td data-l="메뉴 위치">${b.menu ? esc(b.menu) : '<span class="dash">메뉴에 없음</span>'}</td>
        <td><div class="mng"><a class="btn sm" href="#/boards/${b.id}">설정</a><button class="btn sm danger" type="button" data-del>삭제</button></div></td></tr>`).join('')}</tbody></table>`
    : empty('아직 게시판이 없습니다', '공지사항이나 자유게시판처럼, 글을 올릴 자리를 만들어 보세요.', '<a class="btn primary" href="#/boards/new">첫 게시판 만들기</a>')}</div>
    ${d.trash.length ? `<section class="panel pad"><h2>지운 게시판은 30일 동안 여기 있습니다</h2>
      ${d.trash.map((b) => `<div class="tree-row" data-tid="${b.id}"><div class="tt"><b>${esc(b.name)}</b><small>/board/${esc(b.slug)} · 글 ${b.post_count}건 · <b>${fmtDate(b.deleted_at + 30 * 86400000)}</b> 완전 삭제 예정</small></div>
        <div class="mng"><button class="btn sm" type="button" data-restore>되살리기</button></div></div>`).join('')}
      <p class="meta gap">지우는 즉시 주소가 풀려서, 그사이 다른 게시판이 같은 주소를 쓰면 되살릴 수 없습니다. 메뉴는 함께 되살아나지 않습니다.</p></section>` : ''}`;
  if (d.boards.length) {
    sortable($('#brows'), { rowSel: 'tr[data-id]', onDrop: (list) => busy(null, null, async () => {
      await api('/boards/order', { method: 'PUT', data: { ids: list.map((r) => Number(r.id)) } }); toast('순서를 저장했습니다.');
    }) });
  }
  $$('#brows tr').forEach((tr) => {
    const b = d.boards.find((x) => x.id === +tr.dataset.id);
    tr.querySelector('[data-del]').onclick = (e) => confirmInline(e.currentTarget, `"${esc(b.name)}" 게시판이 글 ${b.post_count}건과 함께 30일 보관되며 그동안 복원할 수 있습니다. 주소 /board/${esc(b.slug)} 와 메뉴는 즉시 사라집니다.`, '게시판 삭제', async () => {
      await api(`/boards/${b.id}`, { method: 'DELETE' }); toast('보관함으로 옮겼습니다.'); route();
    });
  });
  $$('[data-tid]').forEach((row) => {
    row.querySelector('[data-restore]').onclick = (e) => busy(e.currentTarget, null, async () => {
      await api(`/boards/${row.dataset.tid}/restore`, { method: 'POST', data: {} }); toast('되살렸습니다. 메뉴는 따로 붙여 주세요.'); route();
    });
  });
}

function levelChecks(name, selected, { guest = null, guestName = '' } = {}) {
  return `<div class="lv-grid" data-lv="${name}">${guest !== null ? `<label class="check"><input type="checkbox" name="${guestName}"${guest ? ' checked' : ''}> 비회원</label>` : ''}
    ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<label class="check"><input type="checkbox" name="${name}" value="${n}" data-array${selected.includes(n) ? ' checked' : ''}> ${esc(LV(n))}</label>`).join('')}
    <button type="button" class="linkish" data-all="${name}">전체</button><button type="button" class="linkish" data-none="${name}">해제</button></div>`;
}

async function boardPage(id) {
  const [b, menus] = await Promise.all([id ? api(`/boards/${id}`) : null, api('/menus')]);
  const v = b || {
    name: '', slug: '', list_layout: 'TABLE', list_levels: [1, 2, 3, 4, 5, 6, 7, 8, 9], read_levels: [1, 2, 3, 4, 5, 6, 7, 8, 9], write_levels: [1],
    comment_levels: [1, 2, 3, 4, 5, 6, 7, 8, 9], allow_guest_list: true, allow_guest_read: true, allow_guest_write: false, guest_menu: true,
    use_comment: true, use_secret: false, visible: true,
    options: { list_show: { no: true, writer: true, date: true, views: true }, view_show: { writer: true, date: true, views: true }, writer_mode: 'NAME', page_size: 20 },
  };
  const o = v.options;
  const chk = (name, on, label) => `<label class="check"><input type="checkbox" name="${name}"${on ? ' checked' : ''}> ${label}</label>`;
  const parentOpts = menus.filter((m) => m.menu_type !== 'LINK').map((m) => `<option value="${m.id}">${esc(m.title)}</option>`).join('');
  const sec1 = `<section class="panel pad" data-sec="basic"><h2>이름과 주소</h2>
      <div class="row2"><label class="field"><span>게시판 이름</span><input class="input" name="name" required maxlength="40" value="${esc(v.name)}" placeholder="공지사항"></label>
      <label class="field"><span>주소</span><input class="input" name="slug" required pattern="[a-z0-9][a-z0-9\\-]{0,39}" value="${esc(v.slug)}" placeholder="notice"><small>${esc(INFO.site.domain || '')}/board/<b data-slug>${esc(v.slug) || '…'}</b></small></label></div>
      ${b ? chk('visible', v.visible, '메뉴와 목록에 보입니다') : ''}
      ${b ? '' : `<div class="perm"><b>메뉴에 붙이기</b>${chk('attach_menu', true, '만들면서 메뉴에도 바로 붙입니다')}
        <label class="field"><span>상위 메뉴</span><select class="input" name="parent_menu_id"><option value="">맨 위 (대메뉴)</option>${parentOpts}</select></label></div>`}
    </section>`;
  const sec2 = `<section class="panel pad" data-sec="look"><h2>목록 모양</h2>
      <div class="layouts">${Object.entries(LAYOUT_LABEL).map(([k, l]) => `<label><input type="radio" name="list_layout" value="${k}"${v.list_layout === k ? ' checked' : ''}>
        <span class="pv ${k.toLowerCase()}">${'<i></i>'.repeat(k === 'CARD' ? 6 : k === 'BLOG' ? 2 : 4)}</span><b>${l}</b></label>`).join('')}</div>
    </section>
    <section class="panel pad" data-sec="look"><h2>기능</h2>
      <div class="choices">${chk('use_comment', v.use_comment, '댓글')}${chk('use_secret', v.use_secret, '비밀글')}${chk('allow_guest_write', v.allow_guest_write, '비회원도 글쓰기')}</div>
      <div class="perm"><b>목록에 보일 것</b><div class="choices">${chk('ls_no', o.list_show.no, '번호')}${chk('ls_writer', o.list_show.writer, '작성자')}${chk('ls_date', o.list_show.date, '작성일')}${chk('ls_views', o.list_show.views, '조회수')}</div><small class="meta">제목은 항상 보입니다.</small></div>
      <div class="perm"><b>글 읽기에 보일 것</b><div class="choices">${chk('vs_writer', o.view_show.writer, '작성자')}${chk('vs_date', o.view_show.date, '작성일')}${chk('vs_views', o.view_show.views, '조회수')}</div></div>
      <div class="perm"><b>작성자 표시</b><div class="choices"><label class="check"><input type="radio" name="writer_mode" value="NAME"${o.writer_mode !== 'HIDDEN' ? ' checked' : ''}> 이름 그대로</label>
        <label class="check"><input type="radio" name="writer_mode" value="HIDDEN"${o.writer_mode === 'HIDDEN' ? ' checked' : ''}> 비공개로 가리기</label></div></div>
      <div class="perm"><b>목록 개수</b><div class="choices">${[10, 20, 30].map((n) => `<label class="check"><input type="radio" name="page_size" value="${n}"${o.page_size === n ? ' checked' : ''}> ${n}개</label>`).join('')}</div><small class="meta">방문자가 바꿀 수도 있습니다.</small></div>
    </section>
    <section class="panel pad" data-sec="look"><h2>게시판 권한</h2>
      <div class="perm"><b>목록을 볼 수 있는 등급</b>${levelChecks('list_levels', v.list_levels, { guest: v.allow_guest_list, guestName: 'allow_guest_list' })}
        ${chk('guest_menu', v.guest_menu, '비회원에게도 메뉴 보이기')}</div>
      <div class="perm"><b>글을 읽을 수 있는 등급</b>${levelChecks('read_levels', v.read_levels, { guest: v.allow_guest_read, guestName: 'allow_guest_read' })}</div>
      <div class="perm"><b>글 쓸 수 있는 등급</b>${levelChecks('write_levels', v.write_levels)}<small class="meta">비회원 글쓰기는 위 "기능" 에서 켭니다.</small></div>
      <div class="perm"><b>댓글 달 수 있는 등급</b>${levelChecks('comment_levels', v.comment_levels)}<small class="meta">댓글은 회원만 달 수 있습니다.</small></div>
    </section>`;
  const sec3 = b ? `<section class="panel pad" data-sec="del"><h2>게시판 지우기</h2><p class="meta">지운 게시판은 글 ${b.post_count}건과 함께 30일 동안 보관함에 있고, 그동안 되살릴 수 있습니다.</p>
      <div class="actions"><button class="btn danger" type="button" data-del>이 게시판 지우기</button></div></section>` : '';
  main.innerHTML = `${head('사이트 › 게시판', b ? esc(b.name) : '게시판 만들기', b ? `주소 /board/${esc(b.slug)} · 글 ${b.post_count}건 · ${b.menu ? `메뉴 "${esc(b.menu)}"에 붙어 있습니다` : '메뉴에 없음'}` : '이름과 주소, 모양과 권한을 정하고 한 번에 만듭니다.')}
    ${b ? '<div class="tabs gap" id="btabs"></div>' : ''}
    <form id="bform" class="gap">${sec1}${sec2}${sec3}${saveBar(b ? '게시판 설정을 고치는 중입니다.' : '새 게시판을 만드는 중입니다.', '#/boards')}</form>`;
  const form = $('#bform');
  ctrlS(form);
  const slug = form.slug;
  slug.addEventListener('input', () => { $('[data-slug]').textContent = slug.value || '…'; });
  form.addEventListener('click', (e) => {
    const a = e.target.closest('[data-all],[data-none]');
    if (!a) return;
    const name = a.dataset.all || a.dataset.none;
    $$(`input[name="${name}"]`, form).forEach((i) => { i.checked = !!a.dataset.all; });
    dirty = true;
  });
  if (b) {
    const show = (k) => {
      $$('[data-sec]', form).forEach((s) => { s.hidden = s.dataset.sec !== k; });
      form.querySelector('.savebar').hidden = k === 'del';
    };
    pillTabs($('#btabs'), [['basic', '이름과 주소'], ['look', '모양·기능·권한'], ['del', '게시판 지우기']], 'basic', show);
    show('basic');
    form.querySelector('[data-del]').onclick = (e) => confirmInline(e.currentTarget, `글 ${b.post_count}건과 함께 30일 보관되며 그동안 복원할 수 있습니다. 주소 /board/${esc(b.slug)} 와 메뉴는 즉시 사라집니다.`, '게시판 삭제', async () => {
      await api(`/boards/${b.id}`, { method: 'DELETE' }); dirty = false; toast('보관함으로 옮겼습니다.'); go('#/boards');
    });
  }
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = formData(form);
    const data = {
      name: f.name, slug: f.slug, list_layout: f.list_layout,
      list_levels: f.list_levels || [], read_levels: f.read_levels || [], write_levels: f.write_levels || [], comment_levels: f.comment_levels || [],
      allow_guest_list: f.allow_guest_list, allow_guest_read: f.allow_guest_read, allow_guest_write: f.allow_guest_write, guest_menu: f.guest_menu,
      use_comment: f.use_comment, use_secret: f.use_secret,
      options: { list_show: { no: f.ls_no, writer: f.ls_writer, date: f.ls_date, views: f.ls_views }, view_show: { writer: f.vs_writer, date: f.vs_date, views: f.vs_views }, writer_mode: f.writer_mode, page_size: Number(f.page_size) },
    };
    if (b) data.visible = f.visible; else { data.attach_menu = f.attach_menu; data.parent_menu_id = f.parent_menu_id; }
    busy(form.querySelector('[type=submit]'), null, async () => {
      if (!form.reportValidity()) return;
      if (b) await api(`/boards/${b.id}`, { method: 'PUT', data });
      else await api('/boards', { method: 'POST', data });
      dirty = false; toast(b ? '저장했습니다.' : '게시판을 만들었습니다.'); go('#/boards');
    });
  });
}

// ───────── 메뉴 ─────────
const TYPE_TAG = { PAGE: '페이지', BOARD: '게시판', LINK: '외부 링크' };
const folded = new Set();
async function menusPage() {
  const menus = await api('/menus');
  const kids = (pid) => menus.filter((m) => (m.parent_id ?? null) === pid).sort((a, b) => a.sort - b.sort || a.id - b.id);
  const rows = [];
  const walk = (pid, depth, hiddenAbove, foldedAbove) => kids(pid).forEach((m) => {
    rows.push({ m, depth, hiddenAbove, foldedAbove, n: kids(m.id).length });
    walk(m.id, depth + 1, hiddenAbove || !m.visible, foldedAbove || folded.has(m.id));
  });
  walk(null, 0, false, false);
  const where = (m) => (m.menu_type === 'BOARD' ? `/board/${m.board_slug || '?'}` : m.path || '대분류 (주소 없음)');
  main.innerHTML = `${head('사이트', '메뉴 목록', '홈페이지 위쪽 메뉴를 정리합니다. 이름과 순서는 언제든 바꿀 수 있고 배포가 필요 없습니다. ⠿ 를 위아래로 끌면 순서, 오른쪽으로 끌면 위 메뉴 아래로 들어갑니다.')}
    <div class="panel" id="mtree">${rows.length ? rows.map(({ m, depth, hiddenAbove, foldedAbove, n }) => `
      <div class="tree-row${m.visible && !hiddenAbove ? '' : ' hid'}" data-id="${m.id}" data-depth="${depth}" data-type="${m.menu_type}" style="--d:${depth}"${foldedAbove ? ' hidden' : ''}>
        <button type="button" class="handle" aria-label="끌어서 옮기기">⠿</button>
        ${n ? `<button type="button" class="tw" data-fold aria-label="하위 메뉴 접기/펴기">${folded.has(m.id) ? '▸' : '▾'}</button>` : '<span class="tw"></span>'}
        <div class="tt"><b>${esc(m.title)}</b> <span class="tag ${m.menu_type === 'BOARD' ? 'blue' : m.menu_type === 'LINK' ? 'warn' : ''}">${TYPE_TAG[m.menu_type]}</span>${n ? `<span class="tag">하위 ${n}</span>` : ''}
          ${m.visible ? (hiddenAbove ? '<span class="tag">위가 숨김</span>' : '') : '<span class="tag red">숨김</span>'}<small>${esc(where(m))}</small></div>
        <div class="mng"><a class="btn sm" href="#/menus/${m.id}">편집</a>
          <button class="btn sm" type="button" data-vis>${m.visible ? '숨기기' : '보이기'}</button><button class="btn sm danger" type="button" data-del>삭제</button></div>
      </div>`).join('') : empty('메뉴가 없습니다.', '메뉴를 추가하거나, 게시판을 만들 때 메뉴에 바로 붙일 수 있습니다.', '<a class="btn primary" href="#/menus/new">메뉴 추가</a>')}</div>`;
  const tree = $('#mtree');
  if (!rows.length) return;
  // 접힌 묶음이 있으면 끌기 전에 펼쳐야 하위가 함께 움직인다
  sortable(tree, {
    rowSel: '.tree-row:not([hidden])', nest: true, canParent: (r) => r.dataset.type !== 'LINK',
    onDrop: (list) => busy(null, null, async () => {
      toast('메뉴 순서를 저장하는 중…');
      const hiddenRows = $$('.tree-row[hidden]', tree);
      if (hiddenRows.length) { toast('접힌 메뉴를 모두 편 뒤에 옮겨 주세요.'); return route(); }
      await api('/menus/tree', { method: 'PUT', data: { items: treeFromDepths(list) } });
      toast('메뉴 순서를 저장했습니다.'); route();
    }),
  });
  $$('.tree-row', tree).forEach((row) => {
    const m = menus.find((x) => x.id === +row.dataset.id);
    row.querySelector('[data-fold]')?.addEventListener('click', () => { if (folded.has(m.id)) folded.delete(m.id); else folded.add(m.id); route(); });
    row.querySelector('[data-vis]').onclick = (e) => {
      if (!m.visible) return busy(e.currentTarget, null, async () => { await api(`/menus/${m.id}/visible`, { method: 'POST', data: { visible: true } }); route(); });
      return confirmInline(e.currentTarget, `"${esc(m.title)}" 메뉴를 숨깁니다. 숨긴 메뉴는 방문자에게 보이지 않고 검색엔진에도 알리지 않으며, 하위 메뉴도 함께 숨겨집니다.`, '숨기기', async () => {
        await api(`/menus/${m.id}/visible`, { method: 'POST', data: { visible: false } }); route();
      });
    };
    row.querySelector('[data-del]').onclick = (e) => confirmInline(e.currentTarget, `"${esc(m.title)}" 메뉴를 지웁니다. 메뉴 칸만 사라지고 게시판·페이지 내용은 그대로 남습니다.${kids(m.id).length ? ' 하위 메뉴는 한 단계 위로 올라갑니다.' : ''}`, '메뉴 삭제', async () => {
      await api(`/menus/${m.id}`, { method: 'DELETE' }); toast('메뉴를 지웠습니다.'); route();
    });
  });
}

async function menuPage(id) {
  const [menus, bd] = await Promise.all([api('/menus'), api('/boards')]);
  const m = id ? menus.find((x) => x.id === id) : null;
  if (id && !m) { toast('없는 메뉴입니다.'); return go('#/menus'); }
  const v = m || { title: '', menu_type: 'PAGE', path: '', board_id: null, parent_id: null, read_levels: null, allow_guest_read: 1 };
  const banned = new Set();
  if (m) { const mark = (pid) => { banned.add(pid); menus.filter((x) => x.parent_id === pid).forEach((x) => mark(x.id)); }; mark(m.id); }
  const depthOf = (x) => { let d = 0; let c = x; while (c?.parent_id && d < 20) { c = menus.find((y) => y.id === c.parent_id); d++; } return d; };
  const parentOpts = menus.filter((x) => x.menu_type !== 'LINK' && !banned.has(x.id))
    .map((x) => `<option value="${x.id}"${x.id === v.parent_id ? ' selected' : ''}>${'　'.repeat(depthOf(x))}${esc(x.title)}</option>`).join('');
  const lv = v.read_levels || [];
  main.innerHTML = `${head('사이트 › 메뉴', m ? '메뉴 편집' : '메뉴 추가', '')}
    <form class="panel pad" id="mform">
      <label class="field"><span>메뉴 이름</span><input class="input" name="title" required maxlength="40" value="${esc(v.title)}"></label>
      <fieldset class="field"><legend>종류</legend><div class="choices">${Object.entries(TYPE_TAG).map(([k, l]) => `<label class="check"><input type="radio" name="menu_type" value="${k}"${v.menu_type === k ? ' checked' : ''}> ${l}</label>`).join('')}</div></fieldset>
      <label class="field" data-for="PAGE"><span>사이트 안 주소</span><input class="input" name="page_path" value="${esc(v.menu_type === 'PAGE' ? v.path : '')}" placeholder="/about.html"><small>비워 두면 하위 메뉴를 묶는 대분류가 됩니다.</small></label>
      <label class="field" data-for="BOARD"><span>게시판</span><select class="input" name="board_id"><option value="">게시판을 고르세요</option>${bd.boards.map((b) => `<option value="${b.id}"${b.id === v.board_id ? ' selected' : ''}>${esc(b.name)} (/board/${esc(b.slug)})</option>`).join('')}</select>
        <small>게시판의 주소와 권한을 그대로 씁니다.</small></label>
      <label class="field" data-for="LINK"><span>외부 주소</span><input class="input" name="link_path" value="${esc(v.menu_type === 'LINK' ? v.path : '')}" placeholder="https://"><small>새 창으로 열립니다.</small></label>
      <label class="field"><span>상위 메뉴</span><select class="input" name="parent_id"><option value="">맨 위 (대메뉴)</option>${parentOpts}</select></label>
      <div class="field" data-for="PAGE LINK"><span>누가 볼 수 있나</span>
        <div class="lv-grid"><label class="check"><input type="checkbox" name="allow_guest_read"${v.allow_guest_read ? ' checked' : ''}> 비회원</label>
        ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<label class="check"><input type="checkbox" name="read_levels" value="${n}" data-array${lv.includes(n) ? ' checked' : ''}> ${esc(LV(n))}</label>`).join('')}</div>
        <small>등급을 하나도 고르지 않으면 로그인한 회원은 모두 볼 수 있습니다.</small></div>
      <p class="err" role="alert"></p>
      <div class="actions end"><a class="btn" href="#/menus">취소</a><button class="btn primary" type="submit">${m ? '저장' : '메뉴 추가'}</button></div>
    </form>`;
  const form = $('#mform');
  const sync = () => { const t = formData(form).menu_type; $$('[data-for]', form).forEach((el) => { el.hidden = !el.dataset.for.split(' ').includes(t); }); };
  form.addEventListener('change', sync); sync();
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = formData(form);
    const data = { title: f.title, menu_type: f.menu_type, path: f.menu_type === 'LINK' ? f.link_path : f.page_path, board_id: f.board_id, parent_id: f.parent_id,
      read_levels: (f.read_levels || []).length ? f.read_levels : null, allow_guest_read: f.allow_guest_read };
    busy(form.querySelector('[type=submit]'), form.querySelector('.err'), async () => {
      if (m) await api(`/menus/${m.id}`, { method: 'PUT', data }); else await api('/menus', { method: 'POST', data });
      toast(m ? '메뉴를 저장했습니다.' : '메뉴를 추가했습니다.'); go('#/menus');
    });
  });
}

// ───────── 수정 요청 ─────────
const REQ_LABEL = { new: ['접수', 'warn'], doing: ['진행 중', 'blue'], done: ['완료', 'green'] };
async function requestsPage() {
  const list = await api('/requests');
  main.innerHTML = `${head('사이트', '수정 요청', '홈페이지에서 바꾸고 싶은 곳을 웹촌에 요청합니다. 처리되면 아래에 답변이 붙습니다.')}
    <form class="panel pad" id="rform"><label class="field"><span>제목</span><input class="input" name="title" maxlength="120" required placeholder="예) 메인 사진 교체 부탁드립니다"></label>
      <label class="field"><span>내용</span><textarea class="input" name="body" maxlength="5000" placeholder="바꾸고 싶은 곳과 내용을 적어 주세요."></textarea></label>
      <p class="err" role="alert"></p><div class="actions end"><button class="btn primary" type="submit">요청 보내기</button></div></form>
    <div class="panel gap">${list.length ? list.map((r) => `<div class="tree-row"><div class="tt"><b>${esc(r.title)}</b> <span class="tag ${REQ_LABEL[r.status][1]}">${REQ_LABEL[r.status][0]}</span>
      <small>${fmtDate(r.created_at, true)}${r.requester ? ` · ${esc(r.requester)}` : ''}</small>${r.body ? `<p class="pre">${esc(r.body)}</p>` : ''}
      ${r.reply ? `<div class="notice-bar gap"><span><b>답변</b><br><span class="pre">${esc(r.reply)}</span></span></div>` : ''}</div></div>`).join('')
    : empty('아직 보낸 요청이 없습니다', '위에서 첫 요청을 보내 보세요.')}</div>`;
  const form = $('#rform');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    busy(form.querySelector('[type=submit]'), form.querySelector('.err'), async () => {
      await api('/requests', { method: 'POST', data: formData(form) }); toast('요청을 보냈습니다.'); route();
    });
  });
}

// ───────── 저장 공간 · 내 계정 · 관리 로그 ─────────
function storagePage() {
  const s = INFO.site;
  const pct = s.quota_mb ? Math.min(100, Math.round((s.used_mb / s.quota_mb) * 100)) : 0;
  main.innerHTML = `${head('사이트', '저장 공간', `${Math.round(s.used_mb)}MB / ${s.quota_mb}MB 사용 중입니다.`)}
    <div class="panel pad"><div class="quota-bar"><i style="width:${pct}%"></i></div>
    <p class="meta gap">${pct >= 100 ? '저장 공간이 가득 찼습니다. 웹촌에 늘려 달라고 요청하세요.' : pct >= 90 ? '저장 공간이 거의 찼습니다. 필요하면 웹촌에 늘려 달라고 요청하세요.' : '사진·파일 올리기 기능이 생기면 여기에서 쓴 만큼 보입니다.'}</p></div>`;
}
function accountPage() {
  main.innerHTML = `${head('내 계정', '비밀번호 변경', INFO.me.staff ? '웹촌 직원으로 들어온 화면에서는 바꿀 수 없습니다.' : `${esc(INFO.me.login_id)} 계정의 비밀번호를 바꿉니다.`)}
    <form class="panel pad" id="pform"${INFO.me.staff ? ' hidden' : ''}>
      <label class="field"><span>지금 비밀번호</span><input class="input" type="password" name="current" autocomplete="current-password" required></label>
      <label class="field"><span>새 비밀번호</span><input class="input" type="password" name="next" autocomplete="new-password" minlength="8" required><small>8자 이상</small></label>
      <label class="field"><span>새 비밀번호 확인</span><input class="input" type="password" name="next2" autocomplete="new-password" required></label>
      <p class="err" role="alert"></p><div class="actions end"><button class="btn primary" type="submit">비밀번호 바꾸기</button></div></form>`;
  const form = $('#pform');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = formData(form);
    busy(form.querySelector('[type=submit]'), form.querySelector('.err'), async () => {
      if (f.next !== f.next2) throw new Error('새 비밀번호 확인이 서로 다릅니다.');
      await api('/account/password', { method: 'POST', data: { current: f.current, next: f.next } });
      form.reset(); toast('비밀번호를 바꿨습니다.');
    });
  });
}
async function auditPage(qs) {
  const page = Number(qs.get('page')) || 1;
  const d = await api(`/audit?page=${page}`);
  main.innerHTML = `${head('내 계정', '관리 로그', '이 관리 화면에서 한 일이 순서대로 남습니다. 지울 수 없습니다.')}
    <div class="panel">${d.rows.length ? `<table class="tbl cardy"><thead><tr><th>시각</th><th>주체</th><th>행위</th><th>대상</th></tr></thead><tbody>
      ${d.rows.map((r) => `<tr><td>${fmtDate(r.created_at, true)}</td><td data-l="주체">${r.actor_kind === 'staff' ? '<span class="tag warn">웹촌 직원</span>' : esc(r.actor_name)}</td>
        <td data-l="행위">${esc(ACTIONS[r.action] || r.action)}</td><td data-l="대상">${esc(r.target)}${r.detail ? `<small>${esc(r.detail)}</small>` : ''}</td></tr>`).join('')}</tbody></table>`
    : empty('아직 기록이 없습니다', '회원·게시판·메뉴를 바꾸면 여기에 남습니다.')}</div>
    ${pager(d.page, d.size, d.total, (n) => `#/audit?page=${n}`)}`;
}

start();
