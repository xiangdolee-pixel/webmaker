const $ = id => document.getElementById(id);
let stars = 3;
let editId = 0;
let items = [];

function setView(authed) {
  $('editCard').hidden = !authed;
  $('listSec').hidden = !authed;
}

async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) { toLogin(); throw new Error('auth'); }
  return res.json();
}

// 로그인 화면으로 (사이트 회원 로그인 — 로그인하면 이 화면으로 돌아온다)
function toLogin() {
  try { localStorage.removeItem('ob_authed'); localStorage.removeItem('ob_basket'); } catch {}
  location.href = '/member/login?next=/basket';
}

async function logout() {
  try { await fetch('/xms-api/logout', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{}' }); } catch {}
  try { localStorage.removeItem('ob_authed'); localStorage.removeItem('ob_basket'); } catch {}
  location.href = './';
}

function pickStars(v) {
  stars = v;
  document.querySelectorAll('#starPick button').forEach(b =>
    b.classList.toggle('on', +b.dataset.v === v));
}

function resetForm() {
  editId = 0;
  $('text').value = '';
  $('src').value = '';
  pickStars(3);
  $('saveBtn').textContent = '담기';
  $('cancelBtn').hidden = true;
}

async function save() {
  const text = $('text').value.trim();
  if (!text) { $('editMsg').textContent = '구절을 입력해 주세요.'; return; }
  $('editMsg').textContent = '';
  const body = { text, source: $('src').value.trim(), stars };
  try {
    if (editId) await api('PUT', '/api/items', { ...body, id: editId });
    else await api('POST', '/api/items', body);
    $('editMsg').textContent = editId ? '고쳤습니다.' : '담았습니다.';
    $('editMsg').className = 'msg ok';
    setTimeout(() => { $('editMsg').textContent = ''; $('editMsg').className = 'msg'; }, 2000);
    resetForm();
    loadList();
  } catch {}
}

function startEdit(it) {
  editId = it.id;
  $('text').value = it.text;
  $('src').value = it.source || '';
  pickStars(it.stars || 1);
  $('saveBtn').textContent = '고치기';
  $('cancelBtn').hidden = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function remove(it) {
  if (!confirm('이 구절을 지울까요?\n\n' + it.text.slice(0, 40))) return;
  try { await api('DELETE', '/api/items?id=' + it.id); loadList(); } catch {}
}

function esc(s) {
  return s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// 담은 시각: D1 의 UTC 'YYYY-MM-DD HH:MM:SS' → 한국 시간 '2026. 10. 24. 오전 10:41'
function when(s) {
  if (!s) return '';
  const d = new Date(s.replace(' ', 'T') + 'Z');
  return isNaN(d) ? '' : d.toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

const PER_PAGE = 10;
let page = 1;

async function loadList() {
  try { items = await api('GET', '/api/items'); } catch { return; }
  try { localStorage.setItem('ob_basket', JSON.stringify(items)); } catch {}
  renderList();
}

// 검색어로 거른 뒤 한 페이지에 10구절씩
function renderList() {
  const q = $('q').value.trim().toLowerCase();
  const found = q
    ? items.filter(it => (it.text + ' ' + (it.source || '')).toLowerCase().includes(q))
    : items;
  const pages = Math.max(1, Math.ceil(found.length / PER_PAGE));
  page = Math.min(Math.max(1, page), pages);
  const shown = found.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  $('count').textContent = q
    ? `검색 ${found.length}구절 / 모두 ${items.length}구절`
    : '모두 ' + items.length + '구절';
  $('pager').innerHTML = pages > 1 ? `
    <button class="ghost small" data-pg="${page - 1}" ${page === 1 ? 'disabled' : ''}>‹ 이전</button>
    <span>${page} / ${pages}</span>
    <button class="ghost small" data-pg="${page + 1}" ${page === pages ? 'disabled' : ''}>다음 ›</button>` : '';
  $('list').innerHTML = (q && !found.length) ? '<div class="s">검색된 구절이 없습니다.</div>' : shown.map(it => `
    <div class="item" data-id="${it.id}">
      <div class="st">${'★'.repeat(it.stars || 1)}</div>
      <div class="t">${esc(it.text)}</div>
      <div class="s">${esc(it.source || '')}</div>
      <div class="when">${when(it.created_at)}</div>
      <div class="btns">
        <button class="ghost small" data-act="edit">고치기</button>
        <button class="danger small" data-act="del">지우기</button>
      </div>
    </div>`).join('') || '<div class="s">아직 담긴 구절이 없습니다.</div>';
}

$('q').addEventListener('input', () => { page = 1; renderList(); });
$('pager').addEventListener('click', e => {
  const btn = e.target.closest('button[data-pg]');
  if (!btn || btn.disabled) return;
  page = +btn.dataset.pg;
  renderList();
  $('listSec').scrollIntoView({ behavior: 'smooth' });
});

$('list').addEventListener('click', e => {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const id = +btn.closest('.item').dataset.id;
  const it = items.find(x => x.id === id);
  if (!it) return;
  if (btn.dataset.act === 'edit') startEdit(it);
  else remove(it);
});

// 성경 묵상 인증글 붙여넣기: "구절"시49:20 → 구절칸엔 인용문만, 출처칸엔 장절만
$('text').addEventListener('paste', e => {
  const raw = (e.clipboardData || window.clipboardData).getData('text');
  const m = raw.match(/["“”]([^"“”]+)["“”]\s*([가-힣]{1,5}\s*\d+\s*[:：]\s*\d+(?:\s*[-~,]\s*\d+)*)/);
  if (!m) return;
  e.preventDefault();
  $('text').value = m[1].trim();
  $('src').value = m[2].replace(/\s+/g, '');
});

// 담긴 구절 전체를 JSON 파일로 내려받기
async function backup() {
  let all;
  try { all = await api('GET', '/api/items'); } catch { return; }
  const d = new Date();
  const ymd = d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
  const blob = new Blob([JSON.stringify(all, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `olivebasket_${(localStorage.getItem('ob_email') || 'me').split('@')[0]}_${ymd}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

$('backupBtn').addEventListener('click', backup);
$('saveBtn').addEventListener('click', save);
$('cancelBtn').addEventListener('click', resetForm);
$('logoutBtn').addEventListener('click', logout);
document.querySelectorAll('#starPick button').forEach(b =>
  b.addEventListener('click', () => pickStars(+b.dataset.v)));

// 문구를 보여주는 방식 (계정별 저장)
const MODE_NOTE = {
  random: '모든 문구가 같은 확률로 나옵니다. 한 바퀴를 다 볼 때까지 같은 문구는 다시 나오지 않습니다.',
  recent: '최근에 담은 문구일수록 자주 나옵니다. 가장 오래된 문구도 가끔 나옵니다.',
  stars: '별이 많은 문구일수록 자주 나옵니다. (★ : ★★ : ★★★ = 1 : 2 : 3)',
  short: '짧은 문구일수록 자주 나옵니다. 긴 문구도 가끔 나옵니다.',
  long: '긴 문구일수록 자주 나옵니다. 짧은 문구도 가끔 나옵니다.',
};
function showMode(m) {
  document.querySelectorAll('#modePick button').forEach(b => b.classList.toggle('on', b.dataset.m === m));
  $('modeNote').textContent = MODE_NOTE[m] || '';
}
async function loadMode() {
  try { showMode((await api('GET', '/api/settings')).weight_mode); } catch {}
}
document.querySelectorAll('#modePick button').forEach(b =>
  b.addEventListener('click', async () => {
    const prev = document.querySelector('#modePick button.on')?.dataset.m;
    showMode(b.dataset.m);
    try { await api('PUT', '/api/settings', { weight_mode: b.dataset.m }); }
    catch { showMode(prev); }
  }));

// 시작: 기다리지 않고 바로 보여 준다 — 폼은 곧장, 목록은 지난번 받아 둔 것부터.
//   로그인 확인 · 목록 · 보기 방식은 한꺼번에 받는다 (로그인이 안 돼 있으면 api 가 로그인 화면으로 보냄)
try { const saved = JSON.parse(localStorage.getItem('ob_basket') || 'null'); if (Array.isArray(saved)) { items = saved; renderList(); } } catch {}
try { if (localStorage.getItem('ob_authed')) setView(true); } catch {}
api('GET', '/api/me').then(me => {
  if (!me.email) return toLogin();
  $('who').textContent = me.email;
  setView(true);
}).catch(() => {});
loadList();
loadMode();

// iOS 사파리 핀치 확대 차단 (viewport user-scalable=no 를 무시함)
['gesturestart', 'gesturechange'].forEach(t =>
  document.addEventListener(t, e => e.preventDefault(), { passive: false }));
document.addEventListener('touchmove', e => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
