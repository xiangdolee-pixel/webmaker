// xim 운영자 화면
import { $, esc, makeApi, fmtDate, badge, toast, pillTabs, formData, openDialog, busy } from './common.js';

const api = makeApi('/api');
const view = $('#view');
let tab = 'sites';
let reqFilter = '';
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
  busy(form.querySelector('button'), $('#login-err'), async () => {
    await api('/login', { method: 'POST', data: formData(form) });
    form.reset();
    showApp();
  });
});

$('#logout').addEventListener('click', async () => {
  try { await api('/logout', { method: 'POST', data: {} }); } catch { /* 이미 끊김 */ }
  showLogin();
});

let navReady = false;
function showApp() {
  $('#login').hidden = true;
  $('#app').hidden = false;
  if (!navReady) {
    navReady = true;
    pillTabs($('#nav'), [['sites', '사이트'], ['customers', '고객'], ['requests', '수정요청']], tab, (v) => { tab = v; render(); });
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
  $('#tiles').innerHTML = [
    ['고객', s.customers],
    ['사이트', s.sites],
    ['정지된 사이트', s.suspended],
    ['처리할 수정요청', s.openRequests, s.openRequests > 0],
  ].map(([label, n, alert]) => `<div class="card tile${alert ? ' alert' : ''}"><b>${n}</b><span>${label}</span></div>`).join('');
}

function render() {
  guarded(async () => {
    const tasks = [renderTiles()];
    if (tab === 'sites') tasks.push(renderSites());
    if (tab === 'customers') tasks.push(renderCustomers());
    if (tab === 'requests') tasks.push(renderRequests());
    await Promise.all(tasks);
  });
}

// ───────── 사이트 ─────────
async function renderSites() {
  const [sites, cs] = await Promise.all([api('/sites'), api('/customers')]);
  customers = cs;
  view.innerHTML = `
    <div class="bar"><h2>사이트 ${sites.length}</h2><button class="btn primary" type="button" data-act="new-site">+ 사이트 만들기</button></div>
    <div class="list cols">${sites.map(siteCard).join('') || '<div class="card empty">아직 등록된 사이트가 없습니다.</div>'}</div>`;
  view.querySelector('[data-act="new-site"]').onclick = () => siteDialog();
  view.querySelectorAll('[data-site]').forEach((el) => {
    const site = sites.find((s) => s.id === +el.dataset.site);
    el.querySelector('[data-act="edit"]').onclick = () => siteDialog(site);
    el.querySelector('[data-act="admins"]').onclick = () => adminsDialog(site);
    el.querySelector('[data-act="toggle"]').onclick = (e) => toggleSite(site, e.currentTarget);
  });
}

function siteCard(s) {
  const pct = s.quota_mb ? Math.min(100, (s.used_mb / s.quota_mb) * 100) : 0;
  const domain = s.domain ? `<a href="${esc(/^https?:/.test(s.domain) ? s.domain : `https://${s.domain}`)}" target="_blank" rel="noopener">${esc(s.domain)}</a>` : '도메인 없음';
  return `
  <article class="card item" data-site="${s.id}">
    <div class="item-head"><h3>${esc(s.name)}</h3>${badge(s.status)}</div>
    <div class="meta"><span>ID ${esc(s.slug)}</span><span>고객 ${esc(s.customer_name || '없음')}</span>${domain}</div>
    <div class="meta"><span>용량 ${Math.round(s.used_mb)} / ${s.quota_mb} MB</span><span>관리자 ${s.admin_count}명</span>
      <span>처리할 요청 ${s.open_requests}건</span></div>
    <div class="quota" aria-hidden="true"><i style="width:${pct}%"></i></div>
    <div class="actions">
      <button class="btn sm" type="button" data-act="edit">수정</button>
      <button class="btn sm" type="button" data-act="admins">관리자 계정</button>
      <button class="btn sm${s.status === 'active' ? ' danger' : ''}" type="button" data-act="toggle">${s.status === 'active' ? '사이트 정지' : '다시 운영'}</button>
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
        <label class="field"><span>도메인</span><input class="input" name="domain" value="${esc(s.domain)}" placeholder="example.kr"></label>
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
        if (site) await api(`/sites/${site.id}`, { method: 'PUT', data });
        else await api('/sites', { method: 'POST', data });
        dlg.close();
        toast(site ? '저장했습니다.' : `사이트를 만들었습니다. 연결은 Claude 에게 "xim 사이트 ${data.slug} 연결해줘" 라고 하세요.`);
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
    <p class="meta">업체 담당자가 <b>사이트 주소/admin</b> 에서 이 계정으로 로그인해 수정요청을 남깁니다.</p>
    <div class="sub-list" data-list></div>
    <form>
      <div class="row2">
        <label class="field"><span>아이디</span><input class="input" name="username" required autocomplete="off" pattern="[A-Za-z0-9._\\-]{3,40}"></label>
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
          await api(`/admins/${b.dataset.del}`, { method: 'DELETE' });
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
async function renderCustomers() {
  customers = await api('/customers');
  view.innerHTML = `
    <div class="bar"><h2>고객 ${customers.length}</h2><button class="btn primary" type="button" data-act="new">+ 고객 등록</button></div>
    <div class="list cols">${customers.map((c) => `
      <article class="card item" data-id="${c.id}">
        <div class="item-head"><h3>${esc(c.name)}</h3><span class="badge doing">사이트 ${c.site_count}</span></div>
        <div class="meta">${c.contact ? `<span>담당 ${esc(c.contact)}</span>` : ''}${c.phone ? `<a href="tel:${esc(c.phone)}">${esc(c.phone)}</a>` : ''}
          ${c.email ? `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : ''}<span>등록 ${fmtDate(c.created_at).slice(0, 10)}</span></div>
        ${c.memo ? `<p class="pre meta">${esc(c.memo)}</p>` : ''}
        <div class="actions"><button class="btn sm" type="button" data-act="edit">수정</button>
          <button class="btn sm danger" type="button" data-act="del">삭제</button></div>
      </article>`).join('') || '<div class="card empty">아직 등록된 고객이 없습니다.</div>'}</div>`;
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
async function renderRequests() {
  const list = await api(`/requests${reqFilter ? `?status=${reqFilter}` : ''}`);
  if (!reqTabsBox || !view.contains(reqTabsBox)) {
    view.innerHTML = `<div class="bar"><h2>수정요청</h2><div class="tabs" id="req-tabs"></div></div><div class="list" id="req-list"></div>`;
    reqTabsBox = $('#req-tabs');
    pillTabs(reqTabsBox, [['', '전체'], ['new', '접수'], ['doing', '진행 중'], ['done', '완료']], reqFilter, (v) => { reqFilter = v; render(); });
  }
  const box = $('#req-list');
  box.innerHTML = list.map((r) => `
    <article class="card item clickable" data-id="${r.id}" tabindex="0">
      <div class="item-head"><h3>${esc(r.title)}</h3>${badge(r.status)}</div>
      <div class="meta"><span>${esc(r.site_name)} (${esc(r.slug)})</span><span>${esc(r.admin_name || r.username || '')}</span><span>${fmtDate(r.created_at)}</span></div>
    </article>`).join('') || '<div class="card empty">해당하는 요청이 없습니다.</div>';
  box.querySelectorAll('[data-id]').forEach((el) => {
    const r = list.find((x) => x.id === +el.dataset.id);
    el.onclick = () => requestDialog(r);
    el.onkeydown = (e) => { if (e.key === 'Enter') requestDialog(r); };
  });
}

function requestDialog(r) {
  let status = r.status;
  openDialog(`
    <h2>${esc(r.title)}</h2>
    <div class="meta"><span>${esc(r.site_name)} (${esc(r.slug)})</span><span>${esc(r.admin_name || r.username || '')}</span><span>${fmtDate(r.created_at)}</span></div>
    <p class="pre body-text">${esc(r.body) || '(내용 없음)'}</p>
    <form>
      <div class="field"><span>상태</span><div class="tabs" data-status></div></div>
      <label class="field"><span>답변 (업체 관리자에게 보입니다)</span><textarea class="input" name="reply">${esc(r.reply)}</textarea></label>
      <p class="err" role="alert"></p>
      <div class="dlg-foot"><button class="btn" type="button" data-close>닫기</button><button class="btn primary" type="submit">저장</button></div>
    </form>`, (dlg) => {
    pillTabs(dlg.querySelector('[data-status]'), [['new', '접수'], ['doing', '진행 중'], ['done', '완료']], status, (v) => { status = v; });
    const form = dlg.querySelector('form');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      busy(form.querySelector('[type=submit]'), form.querySelector('.err'), async () => {
        await api(`/requests/${r.id}`, { method: 'PUT', data: { status, reply: form.reply.value } });
        dlg.close();
        toast('저장했습니다.');
        render();
      });
    });
  });
}

start();
