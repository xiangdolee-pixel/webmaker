// xip 화면 구성 — 회원은 블록 보이기 · 숨기기 · 순서 · 칸 · 목록 개수를 바꿔 저장한다 (서버 /api/prefs, 회원별)
//   손님: 머리글에 "회원가입하면 편집할 수 있어요" 흐르는 글자
//   회원: "화면 편집" 버튼 → 편집 창. 끌어서 순서 바꾸기는 xms 공통 sortable(/xms/js/drag.js) 그대로
const BLOCKS = {
  hours: '장 시간', indices: '주요 지수', fx: '환율', cmdty: '원자재', bonds: '미국채 금리',
  top: '거래대금 상위 종목', coins: '코인 시가총액', f13: '13F 매수 종목',
};
const LISTS = ['top', 'coins', 'f13'];
const COUNTS = [5, 10, 15, 20];
const DEF = { cols: [['hours', 'indices', 'fx', 'cmdty'], ['top'], ['coins'], ['bonds', 'f13']], hidden: [], counts: { top: 20, coins: 20, f13: 20 } };
const KEY = 'xip:layout:v1';

const $ = (id) => document.getElementById(id);
const dash = document.querySelector('.dash');
const cols = [...dash.querySelectorAll('.col')];
const sec = (id) => dash.querySelector(`[data-block="${id}"]`);
const copy = (l) => JSON.parse(JSON.stringify(l));

// 모르는 값 · 빠진 블록을 채운다 (서버와 같은 규칙)
function clean(v) {
  const seen = new Set();
  const out = [0, 1, 2, 3].map((i) => ((v && v.cols && v.cols[i]) || []).filter((id) => BLOCKS[id] && !seen.has(id) && seen.add(id)));
  Object.keys(BLOCKS).forEach((id) => {
    if (seen.has(id)) return;
    const home = DEF.cols.findIndex((c) => c.includes(id));
    out[home].push(id);
  });
  const hidden = ((v && v.hidden) || []).filter((id, i, a) => BLOCKS[id] && a.indexOf(id) === i);
  const counts = {};
  LISTS.forEach((id) => { const n = v && v.counts && v.counts[id]; counts[id] = COUNTS.includes(n) ? n : 20; });
  return { cols: out, hidden, counts };
}

// 화면에 반영: 블록을 칸으로 옮기고(다시 그리지 않음 — 값 · 탭 상태 그대로), 숨기고, 목록 줄 수를 자른다
function apply(l) {
  l.cols.forEach((ids, i) => ids.forEach((id) => cols[i].appendChild(sec(id))));
  Object.keys(BLOCKS).forEach((id) => { sec(id).hidden = l.hidden.includes(id); });
  let shown = 0;
  cols.forEach((c) => {
    c.hidden = ![...c.children].some((s) => !s.hidden);
    if (!c.hidden) shown++;
  });
  dash.style.setProperty('--cols', shown || 1);
  LISTS.forEach((id) => {
    const ol = sec(id).querySelector('.coin-list');
    COUNTS.forEach((n) => ol.classList.toggle(`lim-${n}`, l.counts[id] === n && n < 20));
  });
  const cn = dash.querySelector('[data-coin-n]');
  if (cn) cn.textContent = l.counts.coins;
  window.dispatchEvent(new Event('resize')); // 알약 탭 배경 다시 재기
}

let saved = copy(DEF);
const store = {
  get() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } },
  set(v) { try { if (v) localStorage.setItem(KEY, JSON.stringify(v)); else localStorage.removeItem(KEY); } catch (e) { /* 저장 안 됨 */ } },
};

// 로그인 상태: 공통 계정 버튼 자리에 서버가 적어 둔 값
let me = { guest: true };
try { me = JSON.parse(document.querySelector('[data-xa-me]').getAttribute('data-xa-me')) || me; } catch (e) { /* xms 응답 없음 → 손님 */ }
const member = !me.guest;

if (member) {
  $('top-edit').hidden = false;
  const cached = store.get();
  if (cached) { saved = clean(cached); apply(saved); }
  fetch('/api/prefs', { credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : null)).then((d) => {
    if (!d) return;
    saved = d.layout ? clean(d.layout) : copy(DEF);
    store.set(d.layout ? saved : null);
    if (edOpen) return; // 편집 중이면 건드리지 않는다
    apply(saved);
  }).catch(() => {});
} else {
  store.set(null);
  $('top-flow').hidden = false;
}

/* ---------- 편집 창 ---------- */
const ed = $('ed');
const list = $('ed-list');
let edOpen = false;
let draft = null;
let lastFocus = null;
let sortReady = false;

function rowHtml(id, l) {
  const cnt = LISTS.includes(id)
    ? `<select class="ed-cnt" aria-label="${BLOCKS[id]} 개수">${COUNTS.map((n) => `<option value="${n}"${l.counts[id] === n ? ' selected' : ''}>${n}개</option>`).join('')}</select>`
    : '';
  const on = !l.hidden.includes(id);
  return `<li class="ed-row${on ? '' : ' off'}" data-id="${id}">
    <button type="button" class="handle" aria-label="${BLOCKS[id]} 끌어서 옮기기">⠿</button>
    <span class="ed-name">${BLOCKS[id]}</span>${cnt}
    <label class="ed-sw"><input type="checkbox"${on ? ' checked' : ''}><span>${on ? '보임' : '숨김'}</span></label>
  </li>`;
}
function draw(l) {
  list.innerHTML = l.cols.map((ids, i) => `<li class="ed-col" data-id="col${i}"><b>${i + 1}열</b></li>${ids.map((id) => rowHtml(id, l)).join('')}`).join('');
}
// 편집 창 → 값
function read() {
  const out = { cols: [[], [], [], []], hidden: [], counts: {} };
  let c = 0;
  [...list.children].forEach((li) => {
    if (li.classList.contains('ed-col')) { c = +li.dataset.id.slice(3); return; }
    const id = li.dataset.id;
    out.cols[c].push(id);
    if (!li.querySelector('input').checked) out.hidden.push(id);
    const s = li.querySelector('select');
    if (s) out.counts[id] = +s.value;
  });
  return clean(out);
}
const preview = () => { draft = read(); apply(draft); };

list.addEventListener('change', (e) => {
  const box = e.target.closest('.ed-sw input');
  if (box) {
    const li = box.closest('.ed-row');
    li.classList.toggle('off', !box.checked);
    li.querySelector('.ed-sw span').textContent = box.checked ? '보임' : '숨김';
  }
  preview();
});

async function openEd() {
  lastFocus = document.activeElement;
  $('ed-err').textContent = '';
  draft = copy(saved);
  draw(draft);
  ed.hidden = false;
  edOpen = true;
  document.body.classList.add('lock');
  $('ed-save').focus({ preventScroll: true });
  if (!sortReady) {
    sortReady = true;
    try {
      const { sortable } = await import('/xms/js/drag.js');
      sortable(list, { rowSel: 'li[data-id]', onDrop: preview });
    } catch (e) {
      sortReady = false;
      $('ed-err').textContent = '끌어서 옮기기를 불러오지 못했어요. 잠시 뒤 다시 열어 주세요.';
    }
  }
}
function closeEd(keep) {
  ed.hidden = true;
  edOpen = false;
  document.body.classList.remove('lock');
  if (!keep) apply(saved); // 취소: 저장한 모습으로 되돌린다
  if (lastFocus) lastFocus.focus({ preventScroll: true });
}
$('top-edit').addEventListener('click', openEd);
ed.addEventListener('click', (e) => { if (e.target.closest('[data-ed-close]')) closeEd(false); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && edOpen) closeEd(false); });
$('ed-reset').addEventListener('click', () => { draw(DEF); preview(); });
$('ed-save').addEventListener('click', async () => {
  const btn = $('ed-save');
  const l = read();
  const isDef = JSON.stringify(l) === JSON.stringify(clean(DEF));
  btn.disabled = true;
  $('ed-err').textContent = '';
  try {
    const r = await fetch('/api/prefs', {
      method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(isDef ? { reset: true } : l),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || '저장하지 못했어요.');
    saved = l;
    store.set(isDef ? null : l);
    closeEd(true);
  } catch (e) {
    $('ed-err').textContent = e.message === '회원 로그인이 필요합니다.' ? '회원 계정으로 로그인해야 저장돼요.' : e.message;
  } finally {
    btn.disabled = false;
  }
});
