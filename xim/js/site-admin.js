// 고객 사이트 /admin/ — 업체 관리자 화면 (xim 엔진이 내준다)
import { $, esc, makeApi, fmtDate, badge, toast, formData, busy } from './common.js';

const api = makeApi('/xim-api');

async function start() {
  try {
    const site = await api('/site');
    document.querySelectorAll('[data-site-name]').forEach((el) => { el.textContent = `${site.name} 관리자`; });
    document.title = `${site.name} 관리자`;
  } catch { /* 이름 없이 진행 */ }
  try {
    const me = await api('/me');
    showApp(me);
  } catch (e) {
    if (e.status !== 401) toast(e.message);
    showLogin();
  }
}

function showLogin() {
  $('#app').hidden = true;
  $('#login').hidden = false;
  $('#login-form [name=username]').focus();
}

async function showApp(me) {
  $('#login').hidden = true;
  $('#app').hidden = false;
  $('#who').textContent = `${me.name || me.username} 님`;
  await loadList();
}

$('#login-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  busy(form.querySelector('button'), $('#login-err'), async () => {
    await api('/login', { method: 'POST', data: formData(form) });
    form.reset();
    showApp(await api('/me'));
  });
});

$('#logout').addEventListener('click', async () => {
  try { await api('/logout', { method: 'POST', data: {} }); } catch { /* 이미 끊김 */ }
  showLogin();
});

$('#req-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  busy(form.querySelector('button'), $('#req-err'), async () => {
    await api('/requests', { method: 'POST', data: formData(form) });
    form.reset();
    toast('요청을 보냈습니다. 처리되면 아래에 답변이 표시됩니다.');
    await loadList();
  });
});

async function loadList() {
  let list;
  try { list = await api('/requests'); } catch (e) {
    if (e.status === 401) return showLogin();
    return toast(e.message);
  }
  $('#list').innerHTML = list.map((r) => `
    <article class="card item">
      <div class="item-head"><h3>${esc(r.title)}</h3>${badge(r.status)}</div>
      <div class="meta"><span>${fmtDate(r.created_at)}</span></div>
      ${r.body ? `<p class="pre">${esc(r.body)}</p>` : ''}
      ${r.reply ? `<div class="reply"><b>답변</b><p class="pre">${esc(r.reply)}</p></div>` : ''}
    </article>`).join('') || '<div class="card empty">아직 보낸 요청이 없습니다.</div>';
}

start();
