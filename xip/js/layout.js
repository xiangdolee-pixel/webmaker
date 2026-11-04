// xip 화면 구성 — 회원은 블록 보이기 · 숨기기 · 순서 · 칸 · 목록 개수를 바꿔 저장한다 (서버 /api/prefs, 회원별)
//   손님: 머리글에 "회원가입하면 편집할 수 있어요" 흐르는 글자
//   회원: "화면 편집" 버튼 → 지금 화면에서 바로 편집(블록마다 ⠿ 끌기 · 켜기/끄기 · 줄 수), 바꾸면 바로 저장
//   끌기는 xms 공통 sortable(xms/js/drag.js)과 같은 움직임(따라오기 · FLIP 비켜나기 · 내려앉기)을 칸 사이로 넓힌 것
import { topTabs } from './tabs.js?v=1';

topTabs(document.getElementById('top-tabs'));

const BLOCKS = {
  hours: '장 시간', indices: '주요 지수', fx: '환율', cmdty: '원자재', bonds: '미국채 금리', macro: '미국 경제지표',
  top: '거래대금 상위 종목', coins: '코인 시가총액', f13: '13F 매수 종목',
};
const LISTS = ['top', 'coins', 'f13'];
const COUNTS = [5, 10, 15, 20];
const DEF = { cols: [['hours', 'indices', 'fx', 'cmdty'], ['top'], ['coins'], ['bonds', 'f13'], ['macro']], hidden: [], counts: { top: 20, coins: 20, f13: 20 } };
const KEY = 'xip:layout:v1';
const MAXC = 5; // 칸은 1~5개 (칸 가장자리에 놓으면 새 칸)

const $ = (id) => document.getElementById(id);
const dash = document.querySelector('.dash');
const colsNow = () => [...dash.querySelectorAll(':scope > .col')];
// 칸 수를 맞춘다 (모자라면 만들고, 남는 빈 칸은 뺀다 — 블록은 place 가 옮긴다)
function ensureCols(n) {
  let list = colsNow();
  while (list.length < n) { const c = document.createElement('div'); c.className = 'col'; dash.append(c); list = colsNow(); }
  list.slice(n).forEach((c) => { if (!c.querySelector('[data-block]')) c.remove(); });
  return colsNow();
}
const numberCols = () => colsNow().forEach((c, i) => { c.dataset.col = i; });
const sec = (id) => dash.querySelector(`[data-block="${id}"]`);
const copy = (l) => JSON.parse(JSON.stringify(l));

// 모르는 값 · 빠진 블록을 채운다 (서버와 같은 규칙)
function clean(v) {
  const seen = new Set();
  let out = ((v && Array.isArray(v.cols) && v.cols) || []).slice(0, MAXC)
    .map((c) => (Array.isArray(c) ? c : []).filter((id) => BLOCKS[id] && !seen.has(id) && seen.add(id))).filter((c) => c.length);
  if (!out.length) out = [[]];
  Object.keys(BLOCKS).forEach((id) => {
    if (seen.has(id)) return;
    // 새로 생긴 블록(예전에 저장한 모습에 없음): 기본 모습에서 바로 앞 블록 뒤에, 없으면 기본 칸 끝에
    const home = DEF.cols.findIndex((c) => c.includes(id));
    const before = DEF.cols[home][DEF.cols[home].indexOf(id) - 1];
    const ci = before ? out.findIndex((c) => c.includes(before)) : -1;
    if (ci >= 0) out[ci].splice(out[ci].indexOf(before) + 1, 0, id);
    else out[Math.min(home, out.length - 1)].push(id);
    seen.add(id);
  });
  const hidden = ((v && v.hidden) || []).filter((id, i, a) => BLOCKS[id] && a.indexOf(id) === i);
  const counts = {};
  LISTS.forEach((id) => { const n = v && v.counts && v.counts[id]; counts[id] = COUNTS.includes(n) ? n : 20; });
  return { cols: out, hidden, counts };
}

// 화면에 반영: 블록을 칸으로 옮기고(다시 그리지 않음 — 값 · 탭 상태 그대로), 숨기고, 목록 줄 수를 자른다
function place(l) {
  const cols = ensureCols(l.cols.length);
  l.cols.forEach((ids, i) => ids.forEach((id) => cols[i].appendChild(sec(id))));
  ensureCols(l.cols.length);
  numberCols();
  LISTS.forEach((id) => {
    const ol = sec(id).querySelector('.coin-list');
    COUNTS.forEach((n) => ol.classList.toggle(`lim-${n}`, l.counts[id] === n && n < 20));
    sec(id).classList.toggle('lim', l.counts[id] < 20); // 줄을 줄이면 블록 높이도 줄고, 같은 칸 다른 블록이 그 자리를 쓴다
  });
  return colsNow();
}
function apply(l) {
  const cols = place(l);
  Object.keys(BLOCKS).forEach((id) => { sec(id).hidden = l.hidden.includes(id); });
  let shown = 0;
  cols.forEach((c) => {
    c.hidden = ![...c.children].some((s) => !s.hidden);
    if (!c.hidden) shown++;
  });
  dash.style.setProperty('--cols', shown || 1);
  dash.dataset.n = shown || 1;
  // 1200~1499 화면: 1~3열만 첫 줄에 (4열부터는 아래 줄 전체 폭)
  dash.style.setProperty('--cols3', cols.slice(0, 3).filter((c) => !c.hidden).length || 1);
  const cn = dash.querySelector('[data-coin-n]');
  if (cn) cn.textContent = l.counts.coins;
  midSpans();
  window.dispatchEvent(new Event('resize')); // 알약 탭 배경 다시 재기
}

// 1200~1499 화면: 4 · 5열의 작은 블록(칸)은 아래 줄에 나란히 — 남는 폭 없이 딱 맞게 나눈다 (표는 CSS 가 전체 폭)
const MID = matchMedia('(min-width: 1200px) and (max-width: 1499px) and (min-height: 680px)');
function midSpans() {
  const blocks = colsNow().slice(3).flatMap((c) => [...c.querySelectorAll(':scope > [data-block]')]);
  blocks.forEach((b) => { b.style.gridColumn = ''; });
  if (!MID.matches || document.body.classList.contains('editing')) return;
  const small = blocks.filter((b) => !b.hidden && !b.classList.contains('sec-list'));
  const tracks = Math.min(3, colsNow().slice(0, 3).filter((c) => !c.hidden).length || 1);
  // 한 줄에 tracks 칸씩. 마지막 줄이 모자라면 그 줄 첫 블록을 넓혀 채운다
  for (let i = 0; i < small.length; i += tracks) {
    const row = small.slice(i, i + tracks);
    if (row.length < tracks) row[0].style.gridColumn = `span ${tracks - row.length + 1}`;
  }
}
MID.addEventListener('change', midSpans);

let saved = copy(DEF);
const store = {
  get() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } },
  set(v) { try { if (v) localStorage.setItem(KEY, JSON.stringify(v)); else localStorage.removeItem(KEY); } catch (e) { /* 저장 안 됨 */ } },
};

// 로그인 상태: 공통 계정 버튼 자리에 서버가 적어 둔 값
let me = { guest: true };
try { me = JSON.parse(document.querySelector('[data-xa-me]').getAttribute('data-xa-me')) || me; } catch (e) { /* xms 응답 없음 → 손님 */ }
const member = !me.guest;

midSpans(); // 손님(저장한 모습 없음)도
if (member) {
  $('top-edit').hidden = false;
  const cached = store.get();
  if (cached) { saved = clean(cached); apply(saved); }
  fetch('/api/prefs', { credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : null)).then((d) => {
    if (!d) return;
    saved = d.layout ? clean(d.layout) : copy(DEF);
    store.set(d.layout ? saved : null);
    if (editing) return; // 편집 중이면 건드리지 않는다
    apply(saved);
  }).catch(() => {});
} else {
  store.set(null);
  $('top-flow').hidden = false;
}

/* ---------- 화면에서 바로 편집 ---------- */
const EASE = 'cubic-bezier(.22, .8, .24, 1)';
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
let editing = false;

// 블록마다 편집 도구(편집 중에만 보임)
Object.keys(BLOCKS).forEach((id) => {
  const t = document.createElement('div');
  t.className = 'ed-tools';
  t.innerHTML = `<button type="button" class="handle" aria-label="${BLOCKS[id]} 끌어서 옮기기">⠿</button><b>${BLOCKS[id]}</b>` +
    (LISTS.includes(id) ? `<select class="ed-cnt" aria-label="${BLOCKS[id]} 줄 수">${COUNTS.map((n) => `<option value="${n}">${n}개</option>`).join('')}</select>` : '') +
    `<label class="ed-sw"><input type="checkbox" role="switch" aria-label="${BLOCKS[id]} 켜기"><i aria-hidden="true"></i><span>켜짐</span></label>`;
  sec(id).prepend(t);
});
// 아래 막대
const bar = document.createElement('div');
bar.className = 'ed-bar';
bar.hidden = true;
bar.innerHTML = `<div class="wrap ed-bar-in"><b>화면 편집 중</b><span class="ed-tip">⠿ 를 끌어 옮기고 · 켜기/끄기 · 줄 수를 고르세요 — 바꾸면 바로 저장돼요</span>
  <span class="ed-st" role="status"></span><span class="ed-gap"></span>
  <button class="btn-l" type="button" data-act="reset">기본값</button><button class="btn-l" type="button" data-act="undo">처음대로</button><button class="btn-l pri" type="button" data-act="done">완료</button></div>`;
document.body.appendChild(bar);
const st = bar.querySelector('.ed-st');
const status = (t, bad) => { st.textContent = t; st.classList.toggle('bad', !!bad); };

// 바꿀 때마다 바로 저장 (0.5초 모아서 한 번)
let saveTimer = 0;
let saving = null;
let startLayout = null; // 편집을 시작할 때 모습 (처음대로)
async function saveNow() {
  clearTimeout(saveTimer);
  const l = readEdit();
  if (JSON.stringify(l) === JSON.stringify(saved)) { status('저장됨 ✓'); return; }
  const isDef = JSON.stringify(l) === JSON.stringify(clean(DEF));
  status('저장 중…');
  saving = (async () => {
    try {
      const r = await fetch('/api/prefs', {
        method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isDef ? { reset: true } : l),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(r.status === 401 ? '회원 계정으로 로그인해야 저장돼요.' : d.error || '저장하지 못했어요.');
      saved = l;
      store.set(isDef ? null : l);
      status('저장됨 ✓');
    } catch (ex) {
      status(ex.message, true);
    } finally {
      saving = null;
    }
  })();
  return saving;
}
const queueSave = () => { clearTimeout(saveTimer); status('저장 중…'); saveTimer = setTimeout(saveNow, 500); };

// 편집 중 모습: 꺼진 블록도 흐리게 보이고, 빈 칸도 놓을 자리로 보인다
function applyEdit(l) {
  const cols = place(l);
  cols.forEach((c) => { c.hidden = false; });
  dash.style.setProperty('--cols', cols.length);
  dash.dataset.n = cols.length;
  dash.style.setProperty('--cols3', Math.min(3, cols.length));
  Object.keys(BLOCKS).forEach((id) => {
    const s = sec(id);
    const on = !l.hidden.includes(id);
    s.hidden = false;
    s.classList.toggle('ed-off', !on);
    s.querySelector('.ed-sw input').checked = on;
    s.querySelector('.ed-sw span').textContent = on ? '켜짐' : '꺼짐';
    const sel = s.querySelector('.ed-cnt');
    if (sel) sel.value = l.counts[id];
  });
  window.dispatchEvent(new Event('resize'));
}
// 지금 화면 → 값
function readEdit() {
  const out = { cols: colsNow().map((c) => [...c.querySelectorAll(':scope > [data-block]')].map((s) => s.dataset.block)).filter((c) => c.length), hidden: [], counts: {} };
  Object.keys(BLOCKS).forEach((id) => { if (sec(id).classList.contains('ed-off')) out.hidden.push(id); });
  LISTS.forEach((id) => { out.counts[id] = +sec(id).querySelector('.ed-cnt').value; });
  return clean(out);
}

function startEdit() {
  if (editing) return;
  editing = true;
  status('');
  startLayout = copy(saved);
  document.body.classList.add('editing');
  $('top-edit').classList.add('on');
  bar.hidden = false;
  applyEdit(saved);
  midSpans();
}
function stopEdit(l) {
  editing = false;
  document.body.classList.remove('editing');
  $('top-edit').classList.remove('on');
  bar.hidden = true;
  Object.keys(BLOCKS).forEach((id) => sec(id).classList.remove('ed-off'));
  apply(l);
}
async function finish() { await saveNow(); if (saving) await saving; stopEdit(saved); }
$('top-edit').addEventListener('click', () => (editing ? finish() : startEdit()));
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && editing) finish(); });

dash.addEventListener('change', (e) => {
  if (!editing) return;
  const box = e.target.closest('.ed-sw input');
  if (box) {
    const s = box.closest('[data-block]');
    s.classList.toggle('ed-off', !box.checked);
    s.querySelector('.ed-sw span').textContent = box.checked ? '켜짐' : '꺼짐';
  }
  if (e.target.closest('.ed-cnt')) applyEdit(readEdit());
  queueSave();
});
// 편집 중에는 칸을 눌러도 차트가 열리지 않게
dash.addEventListener('click', (e) => { if (editing && !e.target.closest('.ed-tools')) { e.preventDefault(); e.stopPropagation(); } }, true);

bar.addEventListener('click', (e) => {
  const act = e.target.closest('[data-act]');
  if (!act) return;
  const a = act.dataset.act;
  if (a === 'done') { finish(); return; }
  applyEdit(a === 'reset' ? copy(DEF) : startLayout);
  queueSave();
});

// 블록들 자리 바꾸기를 부드럽게 (FLIP: 바꾸기 전 위치 → 바꾼 뒤 차이만큼 되돌렸다가 0 으로)
function flipBlocks(mutate, skip) {
  const list = [...dash.querySelectorAll('[data-block]')].filter((b) => b !== skip);
  const first = new Map(list.map((b) => [b, b.getBoundingClientRect()]));
  mutate();
  if (reduced()) return;
  for (const b of list) {
    const a = first.get(b);
    const n = b.getBoundingClientRect();
    const dx = a.left - n.left;
    const dy = a.top - n.top;
    if (!dx && !dy) continue;
    b.style.transition = 'none';
    b.style.transform = `translate(${dx}px, ${dy}px)`;
    void b.offsetHeight;
    b.style.transition = `transform 220ms ${EASE}`;
    b.style.transform = '';
  }
}
// 새 칸 자리 안내선 (칸 가장자리에 끌고 오면)
const colLine = document.createElement('div');
colLine.className = 'ed-colline';
colLine.hidden = true;
colLine.innerHTML = '<span>여기에 새 칸</span>';
document.body.appendChild(colLine);

// 끌어서 옮기기
//   칸 가운데에 놓으면 그 칸 안 위아래로(나머지 블록이 비켜난다), 칸 왼쪽 · 오른쪽 가장자리에 놓으면 그 자리에 새 칸(세로 안내선)
//   끄는 블록은 손가락을 따라오고, 놓으면 제자리로 내려앉은 뒤 빈 칸을 정리한다
dash.addEventListener('pointerdown', (e) => {
  if (!editing || e.button > 0) return;
  const handle = e.target.closest('.ed-tools .handle');
  if (!handle) return;
  e.preventDefault();
  const el = handle.closest('[data-block]');
  const sx = e.clientX;
  const sy = e.clientY;
  let lx = sx;
  let ly = sy;
  let r0 = el.getBoundingClientRect();
  let ox = 0; // 새 칸으로 옮긴 뒤 기준점 보정
  let oy = 0;
  const grid = getComputedStyle(dash).display === 'grid'; // 폰(칸이 위아래로 쌓임)에서는 새 칸 없음
  let newCol = null; // { ref: 그 앞에 넣을 칸 (null = 맨 끝) }
  el.classList.add('ed-drag');
  document.body.classList.add('is-sorting');

  // 지금 원래 자리(변환 없이)를 재서, 손가락이 처음 잡은 곳 밑에 그대로 둔다
  const follow = () => {
    el.style.transform = 'none';
    const r = el.getBoundingClientRect();
    el.style.transform = `translate(${lx - sx - (r.left - r0.left) + ox}px, ${ly - sy - (r.top - r0.top) + oy}px)`;
  };
  // 손가락에 가장 가까운 칸 (PC: 가로 위치가 먼저, 폰: 칸이 위아래로 쌓여 세로 위치로)
  const pickCol = () => {
    let best = colsNow()[0];
    let bd = Infinity;
    for (const c of colsNow()) {
      const r = c.getBoundingClientRect();
      const dx = lx < r.left ? r.left - lx : lx > r.right ? lx - r.right : 0;
      const dy = ly < r.top ? r.top - ly : ly > r.bottom ? ly - r.bottom : 0;
      const d = dx * 10 + dy;
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  };
  const showLine = (x) => {
    const d = dash.getBoundingClientRect();
    const top = Math.max(d.top, 0);
    colLine.style.left = `${Math.round(x)}px`;
    colLine.style.top = `${Math.round(top)}px`;
    colLine.style.height = `${Math.round(Math.min(d.bottom, innerHeight) - top)}px`;
    colLine.hidden = false;
  };
  const move = () => {
    const col = pickCol();
    const r = col.getBoundingClientRect();
    // 칸 가장자리(폭의 16%, 적어도 32px) → 새 칸. 칸이 이미 5개면 없음
    const edge = Math.max(32, r.width * 0.16);
    const alone = el.parentNode === col && col.querySelectorAll(':scope > [data-block]').length === 1;
    const canNew = grid && (colsNow().length < MAXC || alone);
    if (canNew && (lx < r.left + edge || lx > r.right - edge)) {
      const after = lx > r.right - edge;
      const ref = after ? col.nextElementSibling : col;
      // 자기 혼자 있는 칸 바로 옆 = 제자리 (안내선 안 보임)
      const same = alone;
      if (!same) {
        newCol = { ref };
        showLine(after ? r.right + 6 : r.left - 6);
        follow();
        return;
      }
    }
    newCol = null;
    colLine.hidden = true;
    const sibs = [...col.querySelectorAll(':scope > [data-block]')].filter((b) => b !== el);
    let target = null;
    for (const b of sibs) {
      const br = b.getBoundingClientRect();
      const tf = getComputedStyle(b).transform;
      const m = new DOMMatrixReadOnly(tf === 'none' ? undefined : tf);
      if (ly < br.top - m.f + br.height / 2) { target = b; break; } // 미끄러지는 중이면 도착 위치로
    }
    const here = el.parentNode === col && el.nextElementSibling === target
      && (target || !sibs.length || sibs[sibs.length - 1].nextElementSibling === el);
    if (!here) flipBlocks(() => col.insertBefore(el, target), el);
    follow();
  };
  // 화면 끝에 가까우면 저절로 스크롤 (폰)
  let raf = 0;
  const auto = () => {
    const edgeY = 70;
    const v = ly < edgeY ? -12 : ly > innerHeight - edgeY ? 12 : 0;
    if (v && document.scrollingElement.scrollHeight > innerHeight) { window.scrollBy(0, v); move(); }
    raf = requestAnimationFrame(auto);
  };
  raf = requestAnimationFrame(auto);
  const onMove = (ev) => { lx = ev.clientX; ly = ev.clientY; move(); };
  const up = () => {
    cancelAnimationFrame(raf);
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', up);
    document.removeEventListener('pointercancel', up);
    document.body.classList.remove('is-sorting');
    colLine.hidden = true;
    if (newCol) {
      // 새 칸을 만들어 거기로 — 다른 블록들은 새 자리로 미끄러지고, 끄던 블록은 새 칸으로 내려앉는다
      const ref = newCol.ref;
      const before = el.getBoundingClientRect(); // 지금 화면에 보이는 자리 (손가락 밑)
      flipBlocks(() => {
        const c = document.createElement('div');
        c.className = 'col';
        dash.insertBefore(c, ref);
        c.appendChild(el);
        colsNow().forEach((x) => { if (!x.querySelector('[data-block]')) x.remove(); });
        numberCols();
        dash.style.setProperty('--cols', colsNow().length);
        dash.style.setProperty('--cols3', Math.min(3, colsNow().length));
      }, el);
      // 보이던 자리에서 새 자리로 내려앉게
      el.style.transform = 'none';
      const now = el.getBoundingClientRect();
      el.style.transition = 'none';
      el.style.transform = `translate(${before.left - now.left}px, ${before.top - now.top}px)`;
      void el.offsetHeight;
    }
    el.style.transition = reduced() ? 'none' : `transform 240ms ${EASE}`;
    el.style.transform = '';
    // 내려앉은 뒤에 정리 (바로 다시 그리면 끊긴다): 빈 칸 빼기도 부드럽게
    setTimeout(() => {
      el.classList.remove('ed-drag');
      el.style.transition = '';
      flipBlocks(() => applyEdit(readEdit()));
      setTimeout(() => dash.querySelectorAll('[data-block]').forEach((b) => { b.style.transition = ''; }), 240);
      queueSave();
    }, reduced() ? 0 : 240);
  };
  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', up);
  document.addEventListener('pointercancel', up);
});
