// xms 방문자 화면: 메뉴 열기 · 로그인 · 가입 · 마이페이지 · 글쓰기 · 댓글
import { $, $$, makeApi, formData, busy, toast, openDialog, confirmInline } from './common.js';
import { mountEditor } from './editor.js';

const api = makeApi('/xms-api');

// 모바일 메뉴
const navBtn = $('[data-nav-toggle]');
navBtn?.addEventListener('click', () => {
  const open = !$('[data-nav]').classList.contains('open');
  $('[data-nav]').classList.toggle('open', open);
  navBtn.setAttribute('aria-expanded', String(open));
});

$('[data-logout]')?.addEventListener('click', async () => {
  try { await api('/logout', { method: 'POST', data: {} }); } catch { /* 이미 끊김 */ }
  location.href = '/';
});

$$('[data-autosubmit]').forEach((el) => el.addEventListener('change', () => el.form.submit()));

// 체크박스 묶음(다중선택) 값을 배열로, 단일 체크(동의 등)는 true/false
function values(form) {
  const data = formData(form);
  $$('fieldset[data-type=CHECKBOX]', form).forEach((fs) => {
    data[fs.dataset.group] = $$('input:checked', fs).map((i) => i.value);
  });
  return data;
}

function onForm(name, fn) {
  const form = $(`form[data-form="${name}"]`);
  if (!form) return;
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const btn = form.querySelector('[type=submit]');
    const run = () => busy(btn, form.querySelector('.err'), () => fn(form, values(form)));
    if (btn?.dataset.confirm) confirmInline(btn, btn.dataset.confirm, btn.textContent.trim(), run);
    else run();
  });
}

// 필수 다중선택 확인
function checkGroups(form) {
  for (const fs of $$('fieldset[data-required]', form)) {
    if (!$$('input:checked', fs).length) throw new Error(`${fs.querySelector('legend').textContent.replace('*', '').trim()}을(를) 골라 주세요.`);
  }
}

onForm('login', async (form, data) => {
  const r = await api('/login', { method: 'POST', data });
  const next = form.dataset.next || '/';
  location.href = r.admin && next === '/' ? '/admin/' : next;
});

onForm('signup', async (form, data) => {
  if (data.password !== data.password2) throw new Error('비밀번호 확인이 서로 다릅니다.');
  checkGroups(form);
  delete data.password2;
  await api('/signup', { method: 'POST', data });
  location.href = '/member/mypage?welcome=1';
});

onForm('profile', async (form, data) => {
  checkGroups(form);
  await api('/profile', { method: 'PUT', data });
  toast('저장했습니다.');
});
onForm('password', async (form, data) => {
  if (data.next !== data.next2) throw new Error('새 비밀번호 확인이 서로 다릅니다.');
  await api('/password', { method: 'POST', data: { current: data.current, next: data.next } });
  form.reset();
  toast('비밀번호를 바꿨습니다.');
});
onForm('withdraw', async (form, data) => {
  await api('/withdraw', { method: 'POST', data });
  location.href = '/';
});
if (new URLSearchParams(location.search).get('welcome')) toast('가입을 환영합니다!');

// 가입: 비밀번호 같음 확인 · 보기 · 모두 동의 · 약관 전문
const pw = $('form[data-form=signup] [name=password]');
const pw2 = $('form[data-form=signup] [name=password2]');
const pwMsg = $('[data-pw-match]');
const checkPw = () => { if (pwMsg) pwMsg.textContent = pw2.value ? (pw.value === pw2.value ? '같습니다 ✓' : '서로 다릅니다') : ''; };
pw?.addEventListener('input', checkPw);
pw2?.addEventListener('input', checkPw);
$('[data-show-pw]')?.addEventListener('change', (e) => { [pw, pw2].forEach((i) => { i.type = e.target.checked ? 'text' : 'password'; }); });
const all = $('[data-agree-all]');
all?.addEventListener('change', () => $$('input[name^=agree_]').forEach((i) => { i.checked = all.checked; }));
$$('input[name^=agree_]').forEach((i) => i.addEventListener('change', () => { all.checked = $$('input[name^=agree_]').every((x) => x.checked); }));
$$('[data-doc]').forEach((b) => b.addEventListener('click', () => {
  const tpl = $(`#doc-${b.dataset.doc}`);
  openDialog(`<h2>${b.dataset.doc === 'terms' ? '이용약관' : '개인정보 처리방침'}</h2><div class="prose">${tpl.innerHTML}</div>
    <div class="dlg-foot"><button class="btn primary" type="button" data-close>닫기</button></div>`);
}));

// 글쓰기
const edHost = $('[data-editor]');
const ed = edHost ? mountEditor(edHost) : null;
onForm('post', async (form, data) => {
  ed?.sync();
  data.content = form.querySelector('[name=content]').value;
  const { board, id } = form.dataset;
  if (id) {
    await api(`/posts/${id}`, { method: 'PUT', data });
    location.href = `/board/${board}/${id}`;
  } else {
    const r = await api(`/boards/${board}/posts`, { method: 'POST', data });
    location.href = `/board/${board}/${r.id}`;
  }
});

// 글 · 댓글 지우기
$$('[data-del-post]').forEach((b) => b.addEventListener('click', () => confirmInline(b, '이 글을 지울까요? 지운 글은 목록에서 사라집니다.', '지우기', async () => {
  await api(`/posts/${b.dataset.delPost}`, { method: 'DELETE' });
  location.href = b.dataset.back;
})));
$$('[data-del-comment]').forEach((b) => b.addEventListener('click', () => confirmInline(b, '이 댓글을 지울까요?', '지우기', async () => {
  await api(`/comments/${b.dataset.delComment}`, { method: 'DELETE' });
  location.reload();
})));
onForm('comment', async (form, data) => {
  await api(`/posts/${form.dataset.post}/comments`, { method: 'POST', data });
  location.reload();
});
