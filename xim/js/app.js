// xim 운영자 화면
import { $, $$, esc, makeApi, fmtDate, badge, toast, pillTabs, slideTabs, formData, openDialog, busy } from './common.js';
import { qrSvg } from './qr.js';

const api = makeApi('/api');
const view = $('#view');
let tab = 'sites';
let reqFilter = '';
let reqSite = ''; // 사이트 카드의 '처리할 요청' 을 눌러 들어오면 그 사이트만
let customers = [];

// ───────── 로그인 ─────────
async function start() {
  try { await api('/me'); } catch (e) {
    if (e.status === 401) return showLogin();
    toast(e.message);
    return showLogin();
  }
  showApp();
}

function showLogin() {
  $('#app').hidden = true;
  $('#login').hidden = false;
  $('#login-form input').focus();
}

$('#login-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  const otpField = $('#otp-field');
  busy(form.querySelector('button'), $('#login-err'), async () => {
    const res = await api('/login', { method: 'POST', data: formData(form) });
    if (res?.need_otp) {
      // 비밀번호는 맞음 → 오늘 첫 로그인이라 구글 OTP 를 묻는다
      otpField.hidden = false;
      otpField.querySelector('input').required = true;
      otpField.querySelector('input').focus();
      return;
    }
    form.reset();
    otpField.hidden = true;
    otpField.querySelector('input').required = false;
    showApp();
  });
});

$('#logout').addEventListener('click', async () => {
  try { await api('/logout', { method: 'POST', data: {} }); } catch { /* 이미 끊김 */ }
  showLogin();
});

const NAV_ICON = {
  sites: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="14" rx="2"/><path d="M3 9h18M8 21h8"/></svg>',
  customers: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.6-3 2.9-5 5.5-5s4.9 2 5.5 5"/><circle cx="17" cy="9" r="2.4"/><path d="M15.5 14.2c2.4.2 4.3 1.9 4.9 4.8"/></svg>',
  requests: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/></svg>',
  monitor: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z"/><path d="M8.5 12h2l1-2.5 2 5 1-2.5h1"/></svg>',
  security: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>',
};
let navReady = false;
function showApp() {
  $('#login').hidden = true;
  $('#app').hidden = false;
  if (!navReady) {
    navReady = true;
    pillTabs($('#nav'), [['sites', '사이트'], ['customers', '고객'], ['requests', '수정요청'], ['monitor', '감시'], ['security', '보안']], tab, (v) => {
      tab = v;
      if (reqOpen && !(v === 'requests' && /^#req-\d+$/.test(location.hash))) { reqOpen = 0; if (location.hash) history.replaceState(null, '', location.pathname); }
      render();
    });
    // 왼쪽 메뉴: 글자 앞에 그림
    $$('#nav > button').forEach((b) => b.insertAdjacentHTML('afterbegin', NAV_ICON[b.dataset.v] || ''));
    requestAnimationFrame(() => slideTabs($('#nav')));
  }
  render();
}

// 401 이 나면 로그인 화면으로
async function guarded(fn) {
  try { await fn(); } catch (e) {
    if (e.status === 401) showLogin(); else toast(e.message);
  }
}

// ───────── 요약 타일 ─────────
async function renderTiles() {
  const s = await api('/summary');
  navBadge(s.unreadRequests);
  $('#tiles').innerHTML = [
    ['고객', s.customers],
    ['사이트', s.sites],
    ['정지된 사이트', s.suspended],
    ['처리할 수정요청', s.openRequests, s.openRequests > 0, 'reqs'],
  ].map(([label, n, alert, act]) => (act
    ? `<button type="button" class="card tile tile-btn${alert ? ' alert' : ''}" data-go-reqs><b>${n}${s.unreadRequests ? ` <i class="new-num" title="새 글이 있는 요청">새 글 ${s.unreadRequests}</i>` : ''}</b><span>${label} →</span></button>`
    : `<div class="card tile${alert ? ' alert' : ''}"><b>${n}</b><span>${label}</span></div>`)).join('')
  // Workers 유료(Paid) 기준: D1 은 DB 하나 최대 10GB · 계정 전체 5GB 까지 요금에 포함(넘으면 GB당 월 $0.75), R2 는 10GB 까지 무료(넘으면 GB당 월 $0.015)
  + (s.storage ? `<div class="card tile wide-tile"><div class="meters-head"><b class="meters-title">전체 사용량</b><span>Cloudflare Workers 유료 요금제 기준</span></div>
      <div class="meters">${[
    ['xms DB', '업체 회원 · 글 · 메뉴 · DB 하나 최대 10GB', s.storage.xms_db, 10 * 1073741824, 'm1'],
    ['xim DB', '고객 · 사이트 · 요청 · 감시 · 최대 10GB', s.storage.xim_db, 10 * 1073741824, 'm2'],
    ['DB 합계', '요금에 포함 5GB · 넘으면 GB당 월 $0.75', s.storage.xms_db + s.storage.xim_db, 5 * 1073741824, 'm4'],
    ['R2 파일', '사진 · 첨부 · 무료 10GB · 넘으면 GB당 월 $0.015', s.storage.r2, 10 * 1073741824, 'm3'],
  ].map(([name, sub, used, limit, cls]) => meter(name, sub, used, limit, cls)).join('')}</div></div>` : '');
}

// 수정요청 탭으로 (slug 가 있으면 그 사이트 요청만)
function goRequests(slug = '') {
  reqSite = slug;
  reqFilter = '';
  if (reqOpen) { reqOpen = 0; history.replaceState(null, '', location.pathname); }
  const b = $('#nav [data-v="requests"]');
  if (b && !b.classList.contains('on')) b.click(); else render();
  scrollTo({ top: 0, behavior: 'smooth' });
}
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-go-reqs]');
  if (t) goRequests(t.dataset.goReqs || '');
});
// 위 탭 '수정요청' 옆 숫자 = 새 글이 있는 요청 수
function navBadge(n) {
  const b = $('#nav [data-v="requests"]');
  if (!b) return;
  let i = b.querySelector('.nav-num');
  const before = i ? i.textContent : '';
  if (!n) i?.remove();
  else { if (!i) { i = document.createElement('i'); i.className = 'nav-num'; b.append(i); } i.textContent = n; }
  // 숫자가 생기거나 없어지면 탭 폭이 바뀐다 → 고른 탭 배경을 다시 맞춘다
  if (before !== (n ? String(n) : '')) requestAnimationFrame(() => slideTabs($('#nav')));
}

// 막대 하나: 이름 · 쓴 양 / 한도 · % — 아주 적어도 막대 끝이 보이게 최소 폭을 둔다
function meter(name, sub, used, limit, cls) {
  const pct = limit ? (used / limit) * 100 : 0;
  const pctText = pct === 0 ? '0%' : pct < 0.1 ? '0.1% 미만' : pct < 10 ? `${pct.toFixed(1)}%` : `${Math.round(pct)}%`;
  const limitText = limit >= 1073741824 ? `${limit / 1073741824}GB` : `${limit / 1048576}MB`;
  return `<div class="meter ${cls}${pct >= 90 ? ' hot' : ''}">
    <div class="m-head"><span class="m-name">${name}</span><span class="m-pct">${pctText}</span></div>
    <div class="m-val"><strong>${mb(used)}</strong><span>/ ${limitText}</span></div>
    <div class="meter-bar" role="meter" aria-label="${name}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${pct.toFixed(2)}"><i style="width:${Math.min(100, Math.max(pct, used ? 0.8 : 0))}%"></i></div>
    <p class="m-sub">${sub}</p>
  </div>`;
}

function render() {
  guarded(async () => {
    const tasks = [renderTiles()];
    if (tab === 'sites') tasks.push(renderSites());
    if (tab === 'customers') tasks.push(renderCustomers());
    if (tab === 'requests') tasks.push(renderRequests());
    if (tab === 'security') tasks.push(renderSecurity());
    if (tab === 'monitor') tasks.push(renderMonitor());
    await Promise.all(tasks);
  });
}

// ───────── 사이트 ─────────
let siteQ = '';
async function renderSites() {
  const [sites, cs] = await Promise.all([api('/sites'), api('/customers')]);
  customers = cs;
  view.innerHTML = `
    <div class="bar"><h2>사이트 ${sites.length}</h2>
      <input class="input search-q" type="search" placeholder="사이트 · 고객 · 도메인 · 연락처 찾기" value="${esc(siteQ)}" data-q>
      <button class="btn primary" type="button" data-act="connect">GitHub에서 연결</button><button class="btn" type="button" data-act="new-site">+ 직접 만들기</button></div>
    <div class="rows">${sites.map(siteRow).join('') || '<div class="card empty">아직 등록된 사이트가 없습니다.</div>'}</div>
    <div class="card empty" data-none hidden>찾는 사이트가 없습니다.</div>`;
  liveSearch(view.querySelector('[data-q]'), (v) => { siteQ = v; });
  view.querySelector('[data-act="new-site"]').onclick = () => siteDialog();
  view.querySelector('[data-act="connect"]').onclick = () => connectDialog();
  view.querySelectorAll('[data-site]').forEach((el) => {
    const site = sites.find((s) => s.id === +el.dataset.site);
    el.querySelector('[data-act="edit"]').onclick = () => siteDialog(site);
    el.querySelector('[data-act="admins"]').onclick = () => adminsDialog(site);
    el.querySelector('[data-act="cms"]').onclick = (e) => busy(e.currentTarget, null, async () => {
      // 팝업 차단을 피하려고 먼저 빈 창을 열고 주소를 넣는다
      const w = window.open('', '_blank');
      const r = await api(`/sites/${site.id}/staff-ticket`, { method: 'POST', data: {} });
      if (w) w.location = r.url; else location.href = r.url;
    });
    el.querySelector('[data-act="toggle"]').onclick = (e) => toggleSite(site, e.currentTarget);
  });
}

// 글자를 넣는 대로 아래 목록([data-find])을 걸러 보인다
function liveSearch(input, remember) {
  const run = () => {
    const words = input.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    let shown = 0;
    view.querySelectorAll('[data-find]').forEach((el) => {
      const ok = words.every((w) => el.dataset.find.includes(w));
      el.hidden = !ok;
      if (ok) shown++;
    });
    const none = view.querySelector('[data-none]');
    if (none) none.hidden = shown > 0 || !view.querySelectorAll('[data-find]').length;
    remember?.(input.value);
  };
  input.addEventListener('input', run);
  run();
}

// ───────── GitHub에서 연결 ─────────
const RUN_LABEL = { queued: ['대기 중', 'new'], in_progress: ['진행 중', 'doing'], waiting: ['대기 중', 'new'], requested: ['대기 중', 'new'], pending: ['대기 중', 'new'] };
function runBadge(r) {
  if (r.status !== 'completed') { const [t, c] = RUN_LABEL[r.status] || ['진행 중', 'doing']; return `<span class="badge ${c}">${t}</span>`; }
  return r.conclusion === 'success' ? '<span class="badge done">완료</span>' : `<span class="badge suspended">${r.conclusion === 'cancelled' ? '취소됨' : '실패'}</span>`;
}
function connectDialog() {
  let timer = null;
  let changed = false;
  const dlg = openDialog(`
    <h2>GitHub에서 연결</h2>
    <p class="meta">webmaker 저장소에 올라간 홈페이지 폴더 주소를 넣으면 로그인 · 관리 화면 · 회원 · 게시판 · 메뉴를 붙이고, xim 에 등록하고, Cloudflare 에 배포합니다. 1~2분 걸립니다.</p>
    <form>
      <label class="field"><span>폴더 주소</span><input class="input" name="url" required placeholder="https://github.com/xiangdolee-pixel/webmaker2/tree/main/sjccc" autocomplete="off">
        <small>폴더 이름만 넣어도 됩니다 (예: sjccc). 이미 연결된 사이트를 다시 넣으면 최신 내용으로 다시 배포합니다.</small></label>
      <p class="err" role="alert"></p>
      <div class="dlg-foot"><button class="btn" type="button" data-close>닫기</button><button class="btn primary" type="submit">연결 시작</button></div>
    </form>
    <h3 class="runs-h">최근 연결</h3>
    <div class="sub-list" data-runs><div class="sub-row"><span>불러오는 중…</span></div></div>`, (d) => {
    const form = d.querySelector('form');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      busy(form.querySelector('[type=submit]'), form.querySelector('.err'), async () => {
        const r = await api('/connect', { method: 'POST', data: { url: form.url.value } });
        form.reset();
        toast(`${r.folder} 연결을 시작했습니다.`);
        setTimeout(loadRuns, 2500);
      });
    });
    d.addEventListener('close', () => { clearTimeout(timer); if (changed) render(); });
  });
  const box = dlg.querySelector('[data-runs]');
  const seen = new Map();
  async function loadRuns() {
    clearTimeout(timer);
    let data;
    try { data = await api('/connect/runs'); } catch (e) { box.innerHTML = `<div class="sub-row"><span>${esc(e.message)}</span></div>`; return; }
    if (!data.ready) {
      box.innerHTML = '<div class="sub-row"><span>처음 한 번 설정이 필요합니다 — GitHub 토큰이 아직 없습니다. Claude 에게 "xim GitHub 연결 설정" 을 물어보세요.</span></div>';
      return;
    }
    box.innerHTML = data.runs.map((r) => `<div class="sub-row"><span><b>${esc(r.title.replace(/^xim 연결:\s*/, ''))}</b> <small class="meta">${fmtDate(r.created_at)}</small></span>
      ${runBadge(r)}<a class="btn sm" href="${esc(r.url)}" target="_blank" rel="noopener">기록</a></div>`).join('') || '<div class="sub-row"><span>아직 연결한 적이 없습니다.</span></div>';
    for (const r of data.runs) {
      const before = seen.get(r.id);
      if (before && before !== 'completed' && r.status === 'completed') {
        changed = true;
        toast(r.conclusion === 'success' ? `${r.title.replace(/^xim 연결:\s*/, '')} 연결이 끝났습니다.` : '연결이 실패했습니다. "기록" 을 눌러 확인해 주세요.');
      }
      seen.set(r.id, r.status);
    }
    if (dlg.open && data.runs.some((r) => r.status !== 'completed')) timer = setTimeout(loadRuns, 5000);
  }
  loadRuns();
}

// 바이트 → 읽기 쉬운 크기
const mb = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(b >= 104857600 ? 0 : 1)}MB` : b >= 1024 ? `${Math.round(b / 1024)}KB` : `${b || 0}B`);

// 사이트 한 줄: 이름 · 고객(담당 · 연락처) · 주소(메일 · 봇확인) · 관리자 · 요청 · 사용량 · 버튼
function siteRow(s) {
  const u = s.usage || { db: 0, files: 0, file_count: 0, r2: 0, d1_files: 0 };
  const quotaB = (s.quota_mb || 0) * 1048576;
  const pct = quotaB ? Math.min(100, (u.files / quotaB) * 100) : 0;
  const dev = `https://${s.slug}.xiangdolee.workers.dev`;
  const link = (href, label) => `<a href="${esc(href)}" target="_blank" rel="noopener">${esc(label)}</a>`;
  const c = customers.find((x) => x.id === s.customer_id);
  // 메일(가입 인증 메일 주소) · 봇확인(Turnstile): 초록 = 준비됨, 회색 = 설정 전, 빨강 = 정말 실패. 누르면 다시 시도
  const ST = (label) => ({ ok: [`${label} ✓`, 'done'], added: [`${label} ✓`, 'done'], error: [`${label} 확인 필요`, 'suspended'], skip: [`${label} 설정 전`, 'idle'] });
  const tagOf = (status, note, label, hint) => {
    const [t, cl] = ST(label)[status] || ST(label).skip;
    return `<button type="button" class="badge ${cl} mail-badge" data-mail="${s.id}" title="${esc(note || hint)} — 누르면 다시 시도합니다">${t}</button>`;
  };
  const tags = s.domain ? tagOf(s.mail_status, s.mail_note, '메일', '아직 등록 전 — 인증 메일이 예비 주소 noreply@plators.com 으로 나갑니다')
    + tagOf(s.bot_status, s.bot_note, '봇확인', '아직 만들기 전 — 가입할 때 봇 확인 없이 진행됩니다') : '';
  const find = [s.name, s.slug, s.domain, c?.name, c?.contact, c?.phone, c?.email, s.status === 'active' ? '운영' : '정지'].filter(Boolean).join(' ').toLowerCase();
  return `
  <article class="card srow${s.status === 'active' ? '' : ' off'}" data-site="${s.id}" data-find="${esc(find)}">
    <div class="sr-name">
      <a class="site-name" href="${esc(s.url)}" target="_blank" rel="noopener" title="홈페이지 열기">${s.favicon ? `<img class="site-fav" src="${esc(s.favicon)}" alt="" width="20" height="20" onerror="this.remove()">` : ''}<b>${esc(s.name)}</b></a>
      <small>${esc(s.slug)}</small>${badge(s.status)}
    </div>
    <div class="sr-cust">${c ? `<b>${esc(c.name)}</b>${c.contact ? `<span>${esc(c.contact)}</span>` : ''}${c.phone ? `<a href="tel:${esc(c.phone)}">${esc(c.phone)}</a>` : ''}${c.email ? `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : ''}` : '<span class="dim">고객 없음</span>'}</div>
    <div class="sr-addr">${s.domain ? link(s.url, s.domain) : '<span class="dim">도메인 없음</span>'}${link(dev, 'workers.dev')}${tags}</div>
    <div class="sr-num"><span>관리자 <b>${s.admin_count}</b></span>${s.open_requests ? `<button type="button" class="link-btn" data-go-reqs="${esc(s.slug)}">요청 <b>${s.open_requests}</b></button>` : '<span>요청 0</span>'}</div>
    <div class="sr-use" title="DB ${mb(u.db)} · 파일 ${u.file_count}개(R2 ${mb(u.r2)} · DB ${mb(u.d1_files)}) · 홈페이지 ${s.static_mb || 0}MB">
      <span>DB ${mb(u.db)}</span><span>파일 ${mb(u.files)} / ${s.quota_mb}MB</span><span>홈 ${s.static_mb ? `${s.static_mb}MB` : '—'}</span>
      <div class="quota" aria-hidden="true"><i style="width:${pct}%"></i></div></div>
    <div class="sr-act">
      <a class="btn sm" href="${esc(s.url)}" target="_blank" rel="noopener">홈</a>
      <button class="btn sm primary" type="button" data-act="cms">xms</button>
      <button class="btn sm" type="button" data-act="edit">수정</button>
      <button class="btn sm" type="button" data-act="admins">관리자</button>
      <button class="btn sm${s.status === 'active' ? ' danger' : ''}" type="button" data-act="toggle">${s.status === 'active' ? '정지' : '다시 운영'}</button>
    </div>
  </article>`;
}

const customerOptions = (selected) => `<option value="">— 고객 없음 —</option>${customers
  .map((c) => `<option value="${c.id}"${c.id === selected ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}`;

function siteDialog(site) {
  const s = site || { quota_mb: 500, status: 'active' };
  openDialog(`
    <h2>${site ? '사이트 수정' : '사이트 만들기'}</h2>
    <form>
      <div class="row2">
        <label class="field"><span>사이트 이름</span><input class="input" name="name" value="${esc(s.name)}" required></label>
        <label class="field"><span>사이트 ID</span>
          <input class="input" name="slug" value="${esc(s.slug)}" ${site ? 'disabled' : 'required pattern="[a-z0-9][a-z0-9\\-]{1,39}"'} placeholder="sjccc">
          <small>WebMaker2 폴더 이름과 같게 (영문 소문자)</small></label>
      </div>
      <label class="field"><span>고객</span><select class="input" name="customer_id">${customerOptions(s.customer_id)}</select></label>
      <div class="row2">
        <label class="field"><span>대표 도메인</span><input class="input" name="domain" value="${esc(s.domain)}" placeholder="example.kr"><small>저장하면 회원가입 인증 메일(noreply@대표 도메인)도 자동으로 준비됩니다</small></label>
        <label class="field"><span>저장 용량 (MB)</span><input class="input" name="quota_mb" type="number" min="0" value="${esc(s.quota_mb)}" required></label>
      </div>
      <label class="field"><span>메모</span><textarea class="input" name="memo">${esc(s.memo)}</textarea></label>
      <p class="err" role="alert"></p>
      <div class="dlg-foot"><button class="btn" type="button" data-close>취소</button><button class="btn primary" type="submit">저장</button></div>
    </form>`, (dlg) => {
    const form = dlg.querySelector('form');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      busy(form.querySelector('[type=submit]'), form.querySelector('.err'), async () => {
        const data = { ...formData(form), status: s.status };
        const r = site ? await api(`/sites/${site.id}`, { method: 'PUT', data }) : await api('/sites', { method: 'POST', data });
        dlg.close();
        const mail = r?.mail ? ` 메일: ${r.mail.message}` : '';
        toast(site ? `저장했습니다.${mail}` : `사이트를 만들었습니다.${mail}`);
        render();
      });
    });
  });
}

function toggleSite(site, btn) {
  const next = site.status === 'active' ? 'suspended' : 'active';
  const msg = next === 'suspended'
    ? `"${site.name}" 사이트를 정지할까요? 방문자에게 "서비스 일시 중단" 화면이 나옵니다.`
    : `"${site.name}" 사이트를 다시 운영할까요?`;
  openDialog(`<h2>${next === 'suspended' ? '사이트 정지' : '다시 운영'}</h2><p>${esc(msg)}</p>
    <div class="dlg-foot"><button class="btn" type="button" data-close>취소</button>
    <button class="btn ${next === 'suspended' ? 'danger' : 'primary'}" type="button" data-ok>${next === 'suspended' ? '정지' : '운영 시작'}</button></div>`, (dlg) => {
    dlg.querySelector('[data-ok]').onclick = (e) => busy(e.currentTarget, null, async () => {
      await api(`/sites/${site.id}/status`, { method: 'POST', data: { status: next } });
      dlg.close();
      toast(next === 'suspended' ? '정지했습니다. 30초 안에 반영됩니다.' : '다시 운영합니다. 30초 안에 반영됩니다.');
      render();
    });
  });
  btn.blur();
}

function adminsDialog(site) {
  openDialog(`
    <h2>${esc(site.name)} 관리자 계정</h2>
    <p class="meta">업체 담당자가 <b>사이트 주소/xms/</b> 에서 이 계정으로 로그인해 회원·게시판·메뉴를 관리합니다 (xms 관리자 등급 회원).</p>
    <div class="sub-list" data-list></div>
    <form>
      <div class="row2">
        <label class="field"><span>아이디</span><input class="input" name="username" required autocomplete="off" pattern="[A-Za-z0-9_\\-]{4,50}"></label>
        <label class="field"><span>이름</span><input class="input" name="name" autocomplete="off" placeholder="홍길동"></label>
      </div>
      <label class="field"><span>비밀번호</span><input class="input" name="password" type="password" minlength="8" required autocomplete="new-password">
        <small>8자 이상. 업체 담당자에게 따로 알려 주세요.</small></label>
      <p class="err" role="alert"></p>
      <div class="dlg-foot"><button class="btn" type="button" data-close>닫기</button><button class="btn primary" type="submit">계정 추가</button></div>
    </form>`, (dlg) => {
    const listEl = dlg.querySelector('[data-list]');
    const load = async () => {
      const admins = await api(`/sites/${site.id}/admins`);
      listEl.innerHTML = admins.map((a) => `<div class="sub-row"><span><b>${esc(a.username)}</b> ${esc(a.name)}</span>
        <button class="btn sm danger" type="button" data-del="${a.id}">삭제</button></div>`).join('')
        || '<div class="sub-row"><span>아직 계정이 없습니다.</span></div>';
      listEl.querySelectorAll('[data-del]').forEach((b) => {
        b.onclick = () => busy(b, null, async () => {
          if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.textContent = '정말 삭제'; return; }
          await api(`/sites/${site.id}/admins/${b.dataset.del}`, { method: 'DELETE' });
          await load();
          render();
        });
      });
    };
    guarded(load);
    const form = dlg.querySelector('form');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      busy(form.querySelector('[type=submit]'), form.querySelector('.err'), async () => {
        await api(`/sites/${site.id}/admins`, { method: 'POST', data: formData(form) });
        form.reset();
        toast('계정을 추가했습니다.');
        await load();
        render();
      });
    });
  });
}

// ───────── 고객 ─────────
let custQ = '';
async function renderCustomers() {
  customers = await api('/customers');
  view.innerHTML = `
    <div class="bar"><h2>고객 ${customers.length}</h2>
      <input class="input search-q" type="search" placeholder="이름 · 담당 · 전화 · 이메일 찾기" value="${esc(custQ)}" data-q>
      <button class="btn primary" type="button" data-act="new">+ 고객 등록</button></div>
    <div class="rows">${customers.map((c) => `
      <article class="card crow" data-id="${c.id}" data-find="${esc([c.name, c.contact, c.phone, c.email, c.memo].filter(Boolean).join(' ').toLowerCase())}">
        <div class="cr-name"><b>${esc(c.name)}</b><span class="badge doing">사이트 ${c.site_count}</span></div>
        <div class="cr-info">${c.contact ? `<span>담당 ${esc(c.contact)}</span>` : ''}${c.phone ? `<a href="tel:${esc(c.phone)}">${esc(c.phone)}</a>` : ''}${c.email ? `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : ''}${!c.contact && !c.phone && !c.email ? '<span class="dim">연락처 없음</span>' : ''}</div>
        <div class="cr-memo" title="${esc(c.memo || '')}">${c.memo ? esc(c.memo) : '<span class="dim">메모 없음</span>'}</div>
        <div class="cr-date">${fmtDate(c.created_at).slice(0, 10)}</div>
        <div class="sr-act"><button class="btn sm" type="button" data-act="edit">수정</button>
          <button class="btn sm danger" type="button" data-act="del">삭제</button></div>
      </article>`).join('') || '<div class="card empty">아직 등록된 고객이 없습니다.</div>'}</div>
    <div class="card empty" data-none hidden>찾는 고객이 없습니다.</div>`;
  liveSearch(view.querySelector('[data-q]'), (v) => { custQ = v; });
  view.querySelector('[data-act="new"]').onclick = () => customerDialog();
  view.querySelectorAll('[data-id]').forEach((el) => {
    const c = customers.find((x) => x.id === +el.dataset.id);
    el.querySelector('[data-act="edit"]').onclick = () => customerDialog(c);
    const del = el.querySelector('[data-act="del"]');
    del.onclick = () => busy(del, null, async () => {
      if (del.dataset.sure !== '1') { del.dataset.sure = '1'; del.textContent = '정말 삭제'; return; }
      await api(`/customers/${c.id}`, { method: 'DELETE' });
      toast('삭제했습니다.');
      render();
    });
  });
}

function customerDialog(c) {
  const v = c || {};
  openDialog(`
    <h2>${c ? '고객 수정' : '고객 등록'}</h2>
    <form>
      <label class="field"><span>고객(업체) 이름</span><input class="input" name="name" value="${esc(v.name)}" required></label>
      <div class="row2">
        <label class="field"><span>담당자</span><input class="input" name="contact" value="${esc(v.contact)}"></label>
        <label class="field"><span>전화</span><input class="input" name="phone" type="tel" value="${esc(v.phone)}"></label>
      </div>
      <label class="field"><span>이메일</span><input class="input" name="email" type="email" value="${esc(v.email)}"></label>
      <label class="field"><span>메모</span><textarea class="input" name="memo">${esc(v.memo)}</textarea></label>
      <p class="err" role="alert"></p>
      <div class="dlg-foot"><button class="btn" type="button" data-close>취소</button><button class="btn primary" type="submit">저장</button></div>
    </form>`, (dlg) => {
    const form = dlg.querySelector('form');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      busy(form.querySelector('[type=submit]'), form.querySelector('.err'), async () => {
        if (c) await api(`/customers/${c.id}`, { method: 'PUT', data: formData(form) });
        else await api('/customers', { method: 'POST', data: formData(form) });
        dlg.close();
        toast('저장했습니다.');
        render();
      });
    });
  });
}

// ───────── 수정요청 ─────────
let reqTabsBox = null;
let reqOpen = 0; // 읽고 있는 요청 번호 (0 = 목록)
async function renderRequests() {
  if (reqOpen) { reqTabsBox = null; return renderRequestView(reqOpen); }
  const list = await api(`/requests${reqFilter ? `?status=${reqFilter}` : ''}`);
  if (!reqTabsBox || !view.contains(reqTabsBox)) {
    view.innerHTML = `<div class="bar"><h2>수정요청</h2><input class="input search-q" type="search" placeholder="제목 · 사이트 · 요청한 사람 찾기" data-q><div class="tabs" id="req-tabs"></div></div><div class="list" id="req-list"></div><div class="card empty" data-none hidden>찾는 요청이 없습니다.</div>`;
    reqTabsBox = $('#req-tabs');
    pillTabs(reqTabsBox, [['', '전체'], ['new', '접수'], ['doing', '진행 중'], ['done', '완료']], reqFilter, (v) => { reqFilter = v; render(); });
  }
  const box = $('#req-list');
  const shown = reqSite ? list.filter((r) => r.slug === reqSite) : list;
  let only = $('#req-only');
  if (reqSite) {
    if (!only) { only = document.createElement('div'); only.id = 'req-only'; only.className = 'req-only'; box.before(only); }
    only.innerHTML = `<span><b>${esc(shown[0]?.site_name || reqSite)}</b> 요청만 보는 중</span><button type="button" class="link-btn" data-all>전체 보기</button>`;
    only.querySelector('[data-all]').onclick = () => { reqSite = ''; render(); };
  } else only?.remove();
  box.innerHTML = shown.map((r) => `
    <article class="card item clickable" data-id="${r.id}" tabindex="0" data-find="${esc([r.title, r.site_name, r.slug, r.admin_name, r.requester].filter(Boolean).join(' ').toLowerCase())}">
      <div class="item-head"><h3>${esc(r.title)}${r.msg_count ? ` <small class="req-count">[${r.msg_count}]</small>` : ''}${r.op_unread ? ` <span class="new-num">새 글 ${r.op_unread}</span>` : ''}</h3>${badge(r.status)}</div>
      <div class="meta"><span>${esc(r.site_name)} (${esc(r.slug)})</span><span>${esc(r.admin_name || r.username || '')}</span><span>처음 ${fmtDate(r.created_at)}</span>${r.updated_at !== r.created_at ? `<span>마지막 ${fmtDate(r.updated_at)}</span>` : ''}</div>
    </article>`).join('') || '<div class="card empty">해당하는 요청이 없습니다.</div>';
  const q = view.querySelector('[data-q]');
  if (q && !q._live) { q._live = true; liveSearch(q); } else if (q) q.dispatchEvent(new Event('input'));
  box.querySelectorAll('[data-id]').forEach((el) => {
    const r = list.find((x) => x.id === +el.dataset.id);
    el.onclick = () => openRequest(r.id);
    el.onkeydown = (e) => { if (e.key === 'Enter') openRequest(r.id); };
  });
}

// 요청 하나: 처음 요청 → 운영자 답변 → 업체가 다시 … 시간 순서. 맨 아래에서 상태와 함께 답변(사진 · 파일 가능)
function msgAtts(site, atts) {
  if (!atts?.length) return '';
  const isImg = (a) => a.kind === 'IMAGE' || /^image\//.test(a.mime || '');
  const img = atts.filter(isImg);
  const files = atts.filter((a) => !isImg(a));
  return `${img.length ? `<div class="msg-imgs">${img.map((a) => `<a href="${esc(site)}/xms/upload/${esc(a.id)}" target="_blank" rel="noopener"><img src="${esc(site)}/xms/upload/${esc(a.id)}" alt="${esc(a.name)}" loading="lazy"></a>`).join('')}</div>` : ''}
    ${files.length ? `<div class="req-atts">${files.map((a) => `<a href="${esc(site)}/xms/upload/${esc(a.id)}?dl=1" target="_blank" rel="noopener">${esc(a.name)}</a>`).join('')}</div>` : ''}`;
}
const msgItem = (site, side, who, at, bodyHtml, atts, status) => `<li class="msg ${side}">
  <div class="msg-head"><b>${esc(who)}</b>${side === 'op' ? '<span class="badge doing">운영자</span>' : '<span class="badge active">업체</span>'}<time>${fmtDate(at)}</time>${status ? `<span>→ ${badge(status)}</span>` : ''}</div>
  ${bodyHtml}${msgAtts(site, atts)}</li>`;

// 읽기 화면 열기 / 목록으로 — 주소 #req-<번호> 를 써서 브라우저 뒤로 가기도 된다
function openRequest(id) { location.hash = `req-${id}`; }
function closeRequest() { if (/^#req-\d+$/.test(location.hash)) history.back(); else { reqOpen = 0; render(); } }
function syncRequestHash() {
  const m = location.hash.match(/^#req-(\d+)$/);
  const id = m ? +m[1] : 0;
  if (id === reqOpen && (!id || tab === 'requests')) return;
  reqOpen = id;
  const b = $('#nav [data-v="requests"]');
  if (id && b && !b.classList.contains('on')) b.click(); else render();
  scrollTo(0, 0);
}
window.addEventListener('hashchange', syncRequestHash);
if (/^#req-\d+$/.test(location.hash)) { reqOpen = +location.hash.slice(5); tab = 'requests'; }

async function renderRequestView(id) {
  let r;
  try { r = await api(`/requests/${id}`); } catch (e) {
    view.innerHTML = `<div class="bar"><button type="button" class="btn" data-back>← 목록</button></div><div class="card empty">${esc(e.message)}</div>`;
    view.querySelector('[data-back]').onclick = closeRequest;
    return;
  }
  const site = r.site_url || '';
  let status = r.status;
  const files = [];
  const firstBody = !r.body ? '<p class="meta">(내용 없음)</p>'
    : r.body.trim().startsWith('<') ? `<div class="req-html">${r.body.replace(/(src|href)="\/xms\//g, `$1="${site}/xms/`)}</div>`
      : `<p class="pre">${esc(r.body)}</p>`;
  const text = (t) => (t ? `<p class="pre">${esc(t)}</p>` : '');
  const legacy = r.reply && !r.messages.some((x) => x.side === 'op') ? msgItem(site, 'op', '운영자', r.updated_at, text(r.reply), [], '') : '';
  view.innerHTML = `
    <div class="bar"><button type="button" class="btn" data-back>← 목록</button><h2 class="req-title">수정요청</h2><button type="button" class="btn danger bar-right" data-del>요청 삭제</button></div>
    <article class="card item req-read">
      <div class="item-head"><h3>${esc(r.title)}</h3>${badge(r.status)}</div>
      <div class="meta"><span>${esc(r.site_name)} (${esc(r.slug)})</span><span>${esc(r.requester || '')}</span><span>처음 ${fmtDate(r.created_at)}</span>${r.updated_at !== r.created_at ? `<span>마지막 ${fmtDate(r.updated_at)}</span>` : ''}</div>
      <ol class="thread">
        ${msgItem(site, 'site', r.requester || '업체', r.created_at, firstBody, r.attachments, '')}
        ${legacy}
        ${r.messages.map((x) => msgItem(site, x.side, x.author, x.created_at, text(x.body), x.attachments, x.status)).join('')}
      </ol>
      <form class="thread-form">
        <div class="field"><span>상태</span><div class="tabs" data-status></div></div>
        <label class="field"><span>답변 (업체 관리자에게 보입니다)</span><textarea class="input" name="body" rows="4" maxlength="10000" placeholder="처리한 내용이나 물어볼 것을 적어 주세요."></textarea></label>
        <div class="att-row"><button type="button" class="btn sm" data-pick>사진 · 파일 붙이기</button><span class="att-chips" data-chips></span></div>
        <p class="err" role="alert"></p>
        <div class="actions"><button class="btn" type="button" data-back>목록</button><button class="btn primary" type="submit">보내기</button></div>
      </form>
    </article>`;
  view.querySelectorAll('[data-back]').forEach((b) => { b.onclick = closeRequest; });
  view.querySelector('[data-del]').onclick = () => openDialog(`<h2>요청 삭제</h2>
      <p><b>${esc(r.title)}</b> 요청을 지웁니다. 주고받은 글과 붙인 사진 · 파일도 함께 지워지고 되돌릴 수 없습니다. 업체 화면에서도 사라집니다.</p>
      <p class="err" role="alert"></p>
      <div class="dlg-foot"><button class="btn" type="button" data-close>취소</button><button class="btn danger fill" type="button" data-yes>삭제</button></div>`, (dlg) => {
    dlg.querySelector('[data-yes]').onclick = (e) => busy(e.currentTarget, dlg.querySelector('.err'), async () => {
      await api(`/requests/${r.id}`, { method: 'DELETE' });
      dlg.close();
      toast('요청을 지웠습니다.');
      closeRequest();
    });
  });
  pillTabs(view.querySelector('[data-status]'), [['new', '접수'], ['doing', '진행 중'], ['done', '완료']], status, (v) => { status = v; });
  const form = view.querySelector('.thread-form');
  const chips = view.querySelector('[data-chips]');
  const drawChips = () => {
    chips.innerHTML = files.map((f, i) => `<span class="chip">${f.kind === 'IMAGE' ? `<img src="${esc(site)}/xms/upload/${esc(f.id)}" alt="">` : ''}${esc(f.name)}<button type="button" data-x="${i}" aria-label="빼기">✕</button></span>`).join('');
  };
  chips.addEventListener('click', (e) => { const x = e.target.closest('[data-x]'); if (x) { files.splice(+x.dataset.x, 1); drawChips(); } });
  view.querySelector('[data-pick]').addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file'; input.multiple = true;
    input.onchange = async () => {
      for (const f of input.files) {
        try {
          toast(`${f.name} 올리는 중…`);
          const res = await fetch(`/api/requests/${r.id}/upload`, {
            method: 'POST', credentials: 'same-origin',
            headers: { 'Content-Type': f.type || 'application/octet-stream', 'X-File-Name': encodeURIComponent(f.name) },
            body: f,
          });
          const out = await res.json().catch(() => null);
          if (!res.ok) throw new Error(out?.error || '올리지 못했습니다.');
          files.push(out);
          drawChips();
        } catch (er) { toast(er.message); }
      }
    };
    input.click();
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    busy(form.querySelector('[type=submit]'), form.querySelector('.err'), async () => {
      await api(`/requests/${r.id}/messages`, { method: 'POST', data: { status, body: form.body.value, attachments: files.map((f) => f.id) } });
      toast('보냈습니다.');
      render(); // 같은 읽기 화면에 방금 쓴 답변이 아래에 쌓인다
    });
  });
}

// ───────── 감시: 의심 요청 · 자동 차단 ─────────
let monOnly = '';
let monTimer = 0;
const REASON = { attack: ['공격 주소', 'suspended'], '404': ['없는 주소', 'new'] };
const flag = (c) => (c && /^[A-Z]{2}$/.test(c) ? String.fromCodePoint(...[...c].map((x) => 0x1f1a5 + x.charCodeAt(0))) : '');
const ago = (t) => { const s = Math.max(0, Math.round((Date.now() - t) / 1000)); return s < 60 ? `${s}초 전` : s < 3600 ? `${Math.floor(s / 60)}분 전` : s < 86400 ? `${Math.floor(s / 3600)}시간 전` : fmtDate(t); };
const left = (t) => { const m = Math.round((t - Date.now()) / 60000); return m < 60 ? `${m}분 남음` : m < 1440 ? `${Math.round(m / 60)}시간 남음` : `${Math.round(m / 1440)}일 남음`; };
async function renderMonitor() {
  clearTimeout(monTimer);
  const d = await api(`/sec${monOnly ? `?only=${monOnly}` : ''}`);
  if (tab !== 'monitor') return;
  const scroll = scrollY;
  view.innerHTML = `
    <div class="bar"><h2>감시</h2><span class="live-dot" title="10초마다 새로 봅니다">실시간</span></div>
    <div class="mon-tiles">
      <div class="card tile"><b>${d.stats.events24}</b><span>의심 요청 (24시간)</span></div>
      <div class="card tile${d.stats.attacks24 ? ' alert' : ''}"><b>${d.stats.attacks24}</b><span>공격 주소 (24시간)</span></div>
      <div class="card tile"><b>${d.stats.blocked24}</b><span>차단한 IP (24시간)</span></div>
      <div class="card tile${d.stats.active ? ' alert' : ''}"><b>${d.stats.active}</b><span>지금 차단 중</span></div>
    </div>
    <p class="meta mon-rule">공격 주소(.env · wp-admin · .php · .git …)를 찌르면 바로, 없는 주소를 10분에 15번 이상 던지면 그 IP 를 모든 사이트에서 막습니다. 처음엔 하루, 다시 걸리면 7일. 풀거나 막은 뒤 사이트에 반영되기까지 최대 1분.</p>

    <section class="card item">
      <div class="item-head"><h3>지금 차단 중인 IP ${d.blocks.length}</h3>
        <form class="inline-form" data-block><input class="input sm" name="ip" placeholder="IP 직접 차단" required><select class="input sm" name="days"><option value="1">하루</option><option value="7">7일</option><option value="30" selected>30일</option><option value="3650">계속</option></select><button class="btn sm danger" type="submit">차단</button></form></div>
      ${d.blocks.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>IP</th><th>이유</th><th>사이트</th><th>걸린 횟수</th><th>마지막</th><th>풀림</th><th></th></tr></thead><tbody>
        ${d.blocks.map((b) => `<tr><td class="mono">${flag(b.country)} ${esc(b.ip)}</td><td>${esc(b.reason)}${b.manual ? ' <span class="badge doing">직접</span>' : ''}</td><td>${esc(b.site || '')}</td><td>${b.hits}</td><td>${ago(b.last_at)}</td><td>${left(b.until)}</td>
          <td><button type="button" class="btn sm" data-unblock="${esc(b.ip)}">풀기</button></td></tr>`).join('')}</tbody></table></div>` : '<p class="meta">막힌 IP 가 없습니다.</p>'}
    </section>

    <section class="card item">
      <div class="item-head"><h3>최근 의심 요청</h3><div class="tabs" id="mon-tabs"></div></div>
      ${d.events.length ? `<div class="tbl-wrap"><table class="tbl mon-tbl"><thead><tr><th>때</th><th>사이트</th><th>IP</th><th>주소</th><th>이유</th><th>결과</th><th></th></tr></thead><tbody>
        ${d.events.map((e) => `<tr class="${e.action === 'block' ? 'hit' : ''}"><td title="${fmtDate(e.at)}">${ago(e.at)}</td><td>${esc(e.site)}</td><td class="mono">${flag(e.country)} ${esc(e.ip)}</td>
          <td class="mono path" title="${esc(e.ua)}">${esc(e.method)} ${esc(e.path)}</td><td><span class="badge ${REASON[e.reason]?.[1] || 'new'}">${REASON[e.reason]?.[0] || esc(e.reason)}</span></td>
          <td>${e.action === 'block' ? '<b class="blocked">차단</b>' : '기록'}</td><td>${d.blocks.some((b) => b.ip === e.ip) ? '' : `<button type="button" class="btn sm danger" data-block-ip="${esc(e.ip)}">차단</button>`}</td></tr>`).join('')}</tbody></table></div>`
    : '<p class="meta">아직 의심 요청이 없습니다.</p>'}
    </section>

    <section class="card item">
      <div class="item-head"><h3>막지 않을 IP</h3>
        <form class="inline-form" data-allow><input class="input sm" name="ip" placeholder="IP" required><input class="input sm" name="memo" placeholder="메모 (예: 사무실)"><button class="btn sm" type="submit">추가</button></form></div>
      <p class="meta">지금 접속한 IP: <b class="mono">${esc(d.my_ip)}</b> ${d.allow.some((a) => a.ip === d.my_ip) ? '(예외에 있음)' : `<button type="button" class="link-btn" data-allow-me="${esc(d.my_ip)}">이 IP 를 예외로</button>`}</p>
      ${d.allow.length ? `<ul class="allow-list">${d.allow.map((a) => `<li><span class="mono">${esc(a.ip)}</span> <small>${esc(a.memo)}</small><button type="button" class="link-btn" data-unallow="${esc(a.ip)}">빼기</button></li>`).join('')}</ul>` : ''}
    </section>`;
  scrollTo(0, scroll);
  pillTabs($('#mon-tabs'), [['', '전체'], ['attack', '공격 주소'], ['block', '차단된 것']], monOnly, (v) => { monOnly = v; renderMonitor(); });
  const act = (fn) => guarded(async () => { await fn(); renderMonitor(); });
  view.querySelector('[data-block]').onsubmit = (e) => { e.preventDefault(); const f = formData(e.target); act(() => api('/sec/blocks', { method: 'POST', data: f })).then(() => toast(`${f.ip} 를 막았습니다.`)); };
  view.querySelector('[data-allow]').onsubmit = (e) => { e.preventDefault(); const f = formData(e.target); act(() => api('/sec/allow', { method: 'POST', data: f })); };
  view.querySelectorAll('[data-unblock]').forEach((b) => { b.onclick = () => act(() => api(`/sec/blocks/${encodeURIComponent(b.dataset.unblock)}`, { method: 'DELETE' })).then(() => toast('풀었습니다. 1분 안에 반영됩니다.')); });
  view.querySelectorAll('[data-block-ip]').forEach((b) => { b.onclick = () => act(() => api('/sec/blocks', { method: 'POST', data: { ip: b.dataset.blockIp, days: 30 } })).then(() => toast('30일 막았습니다.')); });
  view.querySelectorAll('[data-unallow]').forEach((b) => { b.onclick = () => act(() => api(`/sec/allow/${encodeURIComponent(b.dataset.unallow)}`, { method: 'DELETE' })); });
  view.querySelector('[data-allow-me]')?.addEventListener('click', (e) => act(() => api('/sec/allow', { method: 'POST', data: { ip: e.currentTarget.dataset.allowMe, memo: '운영자' } })));
  // 10초마다 새로 (입력 중이면 미룸)
  monTimer = setTimeout(function tick() {
    if (tab !== 'monitor') return;
    if (view.contains(document.activeElement) && document.activeElement.matches('input, select')) { monTimer = setTimeout(tick, 10000); return; }
    guarded(renderMonitor);
  }, 10000);
}

// ───────── 보안: 구글 OTP ─────────
async function renderSecurity() {
  const { enabled } = await api('/otp');
  view.innerHTML = `
    <div class="bar"><h2>보안</h2></div>
    <section class="card item">
      <div class="item-head"><h3>구글 OTP (2단계 로그인)</h3><span class="badge ${enabled ? 'active' : 'new'}">${enabled ? '사용 중' : '사용 안 함'}</span></div>
      <p class="meta">${enabled
        ? '브라우저마다 하루에 한 번 OTP 번호를 넣어야 로그인됩니다. 넣은 뒤 24시간 동안은 그 브라우저에서 비밀번호만으로 로그인돼요.'
        : 'OTP 를 등록하면 비밀번호만 알아서는 로그인할 수 없습니다. 폰에 Google Authenticator 앱을 설치해 두세요.'}</p>
      <div class="actions">${enabled
        ? '<button class="btn sm danger" type="button" data-act="off">OTP 해제</button>'
        : '<button class="btn primary" type="button" data-act="on">OTP 등록하기</button>'}</div>
    </section>`;
  view.querySelector('[data-act]').onclick = enabled ? otpOffDialog : otpOnDialog;
}

async function otpOnDialog() {
  let setup;
  try { setup = await api('/otp/setup', { method: 'POST', data: {} }); } catch (e) { return toast(e.message); }
  openDialog(`
    <h2>구글 OTP 등록</h2>
    <ol class="steps">
      <li>폰에서 <b>Google Authenticator</b> 앱을 열고 <b>+ → QR 코드 스캔</b></li>
      <li>아래 QR 코드를 찍습니다</li>
      <li>앱에 생긴 <b>xim</b> 의 6자리 번호를 넣고 등록</li>
    </ol>
    <div class="qr">${qrSvg(setup.uri)}</div>
    <p class="meta center">QR 을 못 찍으면 앱에서 "설정 키 입력" → <code class="key">${esc(setup.secret.replace(/(.{4})/g, '$1 ').trim())}</code></p>
    <form>
      <label class="field"><span>OTP 번호 6자리</span>
        <input class="input otp-input" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" required placeholder="000000"></label>
      <p class="err" role="alert"></p>
      <div class="dlg-foot"><button class="btn" type="button" data-close>취소</button><button class="btn primary" type="submit">등록</button></div>
    </form>`, (dlg) => {
    const form = dlg.querySelector('form');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      busy(form.querySelector('[type=submit]'), form.querySelector('.err'), async () => {
        await api('/otp/enable', { method: 'POST', data: formData(form) });
        dlg.close();
        toast('구글 OTP 를 등록했습니다.');
        render();
      });
    });
  });
}

function otpOffDialog() {
  openDialog(`
    <h2>구글 OTP 해제</h2>
    <p class="meta">해제하면 비밀번호만으로 로그인됩니다. 확인을 위해 지금 앱에 보이는 번호를 넣어 주세요.</p>
    <form>
      <label class="field"><span>OTP 번호 6자리</span>
        <input class="input otp-input" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" required placeholder="000000"></label>
      <p class="err" role="alert"></p>
      <div class="dlg-foot"><button class="btn" type="button" data-close>취소</button><button class="btn danger" type="submit">해제</button></div>
    </form>`, (dlg) => {
    const form = dlg.querySelector('form');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      busy(form.querySelector('[type=submit]'), form.querySelector('.err'), async () => {
        await api('/otp/disable', { method: 'POST', data: formData(form) });
        dlg.close();
        toast('구글 OTP 를 해제했습니다.');
        render();
      });
    });
  });
}

start();

// 사이트 카드의 메일 표시: 누르면 대표 도메인을 Email Sending 에 (다시) 등록
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-mail]');
  if (!b) return;
  busy(b, null, async () => {
    const r = await api(`/sites/${b.dataset.mail}/mail`, { method: 'POST', data: {} });
    toast(`메일: ${r.mail.message}`);
    render();
  });
});
