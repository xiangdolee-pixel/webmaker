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
const DEF = { cols: [['hours', 'indices', 'fx', 'cmdty'], ['top'], ['coins'], ['bonds', 'macro', 'f13']], hidden: [], counts: { top: 20, coins: 20, f13: 20 } };
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
    // 새로 생긴 블록(예전에 저장한 모습에 없음): 기본 모습에서 바로 앞 블록 뒤에, 없으면 기본 칸 끝에
    const home = DEF.cols.findIndex((c) => c.includes(id));
    const before = DEF.cols[home][DEF.cols[home].indexOf(id) - 1];
    const ci = before ? out.findIndex((c) => c.includes(before)) : -1;
    if (ci >= 0) out[ci].splice(out[ci].indexOf(before) + 1, 0, id);
    else out[home].push(id);
    seen.add(id);
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
  // 1200~1499 화면: 1~3열만 첫 줄에 (4열은 아래 줄 전체 폭)
  dash.style.setProperty('--cols3', cols.slice(0, 3).filter((c) => !c.hidden).length || 1);
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
  l.cols.forEach((ids, i) => ids.forEach((id) => cols[i].appendChild(sec(id))));
  cols.forEach((c) => { c.hidden = false; });
  dash.style.setProperty('--cols', 4);
  dash.style.setProperty('--cols3', 3);
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
  LISTS.forEach((id) => {
    const ol = sec(id).querySelector('.coin-list');
    COUNTS.forEach((n) => ol.classList.toggle(`lim-${n}`, l.counts[id] === n && n < 20));
  });
  window.dispatchEvent(new Event('resize'));
}
// 지금 화면 → 값
function readEdit() {
  const out = { cols: cols.map((c) => [...c.querySelectorAll(':scope > [data-block]')].map((s) => s.dataset.block)), hidden: [], counts: {} };
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

// 끌어서 옮기기 — 칸 안 위아래 + 다른 칸으로. 끄는 블록은 손가락을 따라오고, 나머지는 미끄러지듯 비켜난다(FLIP)
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
  const r0 = el.getBoundingClientRect();
  el.classList.add('ed-drag');
  document.body.classList.add('is-sorting');

  // 지금 원래 자리(변환 없이)를 재서, 손가락이 처음 잡은 곳 밑에 그대로 둔다
  const follow = () => {
    el.style.transform = 'none';
    const r = el.getBoundingClientRect();
    el.style.transform = `translate(${lx - sx - (r.left - r0.left)}px, ${ly - sy - (r.top - r0.top)}px)`;
  };
  const others = () => [...dash.querySelectorAll('[data-block]')].filter((b) => b !== el);
  const flip = (mutate) => {
    const list = others();
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
  };
  // 손가락에 가장 가까운 칸 (PC: 가로 위치가 먼저, 폰: 칸이 위아래로 쌓여 세로 위치로)
  const pickCol = () => {
    let best = cols[0];
    let bd = Infinity;
    for (const c of cols) {
      const r = c.getBoundingClientRect();
      const dx = lx < r.left ? r.left - lx : lx > r.right ? lx - r.right : 0;
      const dy = ly < r.top ? r.top - ly : ly > r.bottom ? ly - r.bottom : 0;
      const d = dx * 10 + dy;
      if (d < bd) { bd = d; best = c; }
    }
    return best;
  };
  const move = () => {
    const col = pickCol();
    const sibs = [...col.querySelectorAll(':scope > [data-block]')].filter((b) => b !== el);
    let target = null;
    for (const b of sibs) {
      const r = b.getBoundingClientRect();
      const m = new DOMMatrixReadOnly(getComputedStyle(b).transform === 'none' ? undefined : getComputedStyle(b).transform);
      if (ly < r.top - m.f + r.height / 2) { target = b; break; } // 미끄러지는 중이면 도착 위치로
    }
    const here = el.parentNode === col && el.nextElementSibling === target
      && (target || !sibs.length || sibs[sibs.length - 1].nextElementSibling === el);
    if (!here) flip(() => col.insertBefore(el, target));
    follow();
  };
  // 화면 끝에 가까우면 저절로 스크롤 (폰)
  let raf = 0;
  const auto = () => {
    const edge = 70;
    const v = ly < edge ? -12 : ly > innerHeight - edge ? 12 : 0;
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
    el.style.transition = reduced() ? 'none' : `transform 240ms ${EASE}`;
    el.style.transform = '';
    // 내려앉은 뒤에 정리 (바로 다시 그리면 끊긴다)
    setTimeout(() => {
      el.classList.remove('ed-drag');
      el.style.transition = '';
      others().forEach((b) => { b.style.transition = ''; });
      window.dispatchEvent(new Event('resize'));
      queueSave();
    }, reduced() ? 0 : 240);
  };
  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', up);
  document.addEventListener('pointercancel', up);
});
