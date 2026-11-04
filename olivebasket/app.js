const $quote = document.getElementById('quote');
const $source = document.getElementById('source');
const $stars = document.getElementById('stars');
const $meta = document.getElementById('meta');
const $stage = document.getElementById('stage');

const hist = [];      // 본 구절 히스토리 (스와이프로 되돌아가기)
let idx = -1;
let lastId = 0;
// 이번 바퀴에 이미 본 구절 id (모두 한 번씩 볼 때까지 다시 안 나옴, 앱 껐다 켜도 유지)
let seen = [];
try { seen = JSON.parse(localStorage.getItem('ob_seen') || '[]'); } catch {}
let busy = false;
// 로그인 = 사이트 회원(xms, 같은 xms_sess 쿠키) — 2026-11-04 자체 로그인에서 옮김
// 빨리 뜨게(사용자 지시 2026-11-04 "너무 느려"): 지난번 로그인 상태로 바로 시작하고, 서버 확인은 뒤에서 한다
let token = ''; // '1' = 로그인함 (이름만 남김: 아래 코드가 그대로 쓰게)
try { token = localStorage.getItem('ob_authed') || ''; } catch {}

// 로그인 안 했으면 소개 문구만, 하단에 로그인·가입
const INTRO = { id: 0, text: '가입하고,\n올리브를 모으듯\n나만의 영감을 담아보세요.', source: '올리브바스켓', stars: 1 };
function setAuthed() { /* 담기 버튼은 늘 보인다 — 로그인 전이면 /basket 이 로그인 화면으로 보낸다 */ }
// 로그인 여부: 서버에 묻는다. 인터넷이 없으면 지난번 상태로 (마지막 구절을 보여 주게)
const authReady = fetch('/api/me', { credentials: 'same-origin', cache: 'no-store' })
  .then(r => (r.ok ? r.json() : {}))
  .then(me => {
    const was = token;
    token = me.email ? '1' : '';
    try { localStorage.setItem('ob_authed', token); if (me.email) localStorage.setItem('ob_email', me.email); else localStorage.removeItem('ob_ahead'); } catch {}
    setAuthed(!!token);
    if (was !== token && idx === 0) { ahead.length = 0; hist.length = 0; idx = -1; next(); } // 로그인 상태가 바뀌었으면 첫 화면을 다시
    else fillAhead();
  })
  .catch(() => {});
setAuthed(!!token);

// 배경 장면 6가지를 두 겹으로 교차 페이드 (직전 장면은 피함)
const SCENES = 6;
const bgs = [document.getElementById('bgA'), document.getElementById('bgB')];
let bgFront = 0, scene = -1;
function changeScene() {
  let n;
  do { n = Math.floor(Math.random() * SCENES); } while (n === scene);
  scene = n;
  const back = bgs[1 - bgFront];
  back.className = 'bg sc' + n;
  void back.offsetWidth;
  back.classList.add('on');
  bgs[bgFront].classList.remove('on');
  bgFront = 1 - bgFront;
  document.body.className = 'lock sc' + n; // 글자·가지·별 색도 장면에 맞춤
  const tc = document.querySelector('meta[name="theme-color"]');
  if (tc) tc.content = getComputedStyle(back).getPropertyValue('--b0').trim();
}

const $branch = $stars; // 글 위 별표 (예전 바구니 그림 자리) — 글자와 함께 사라졌다 나타남

function render(item) {
  changeScene();
  $quote.textContent = item.text;
  $source.textContent = item.source || '';
  $stars.textContent = item.id ? '★'.repeat(item.stars || 1) : '';
  $stars.setAttribute('aria-label', item.id ? `중요도 ${item.stars || 1}` : '');
  lastId = item.id || 0;
  fitQuote();
  try { localStorage.setItem('ob_last', JSON.stringify(item)); } catch {}
}

// 긴 문구가 오른쪽 아래 '담기' 버튼과 겹치지 않게: 화면에 들어올 때까지 글자를 1px씩 줄임
function fitQuote() {
  $quote.style.fontSize = '';
  const limit = document.getElementById('addLink').getBoundingClientRect().top - 12;
  let size = parseFloat(getComputedStyle($quote).fontSize);
  while ($meta.getBoundingClientRect().bottom > limit && size > 14) {
    size -= 1;
    $quote.style.fontSize = size + 'px';
  }
}
window.addEventListener('resize', fitQuote);

const FADE = 220; // style.css 의 .branch/.quote/.meta 전환 시간과 맞춤

// dir: 1 = 다음(오른쪽에서 들어옴), -1 = 이전(왼쪽에서 들어옴)
async function transition(getItem, dir) {
  if (busy) return;
  busy = true;
  // 바구니도 글자와 함께 사라졌다 새 자리에서 같이 나타남 (따로 움직이면 바구니만 눈에 띔)
  const els = [$branch, $quote, $meta];
  const outCls = dir > 0 ? 'shift-l' : 'shift-r';
  const inCls = dir > 0 ? 'shift-r' : 'shift-l';
  els.forEach(el => el.classList.add(outCls));
  const [item] = await Promise.all([getItem(), new Promise(r => setTimeout(r, FADE))]);
  if (item) render(item);
  els.forEach(el => {
    el.classList.remove(outCls);
    el.style.transition = 'none';
    el.classList.add(inCls);
    void el.offsetWidth; // reflow로 즉시 반대편 배치
    el.style.transition = '';
    el.classList.remove(inCls);
  });
  busy = false;
}

async function fetchRandom() {
  if (!token) return INTRO;
  try {
    // 미리 받아 둔 게 있으면 그 마지막 구절 다음으로 이어지게
    const last = ahead.length ? ahead[ahead.length - 1].id : lastId;
    const res = await fetch('/api/random?not=' + seen.join(',') + '&last=' + last, { credentials: 'same-origin' });
    if (res.status === 401) {
      token = '';
      try { localStorage.removeItem('ob_authed'); } catch {}
      setAuthed(false);
      return INTRO;
    }
    const data = await res.json();
    if (!data.empty) {
      if (data.cycled) seen = [];
      seen.push(data.id);
      // 가중 모드는 최근 본 것만 피하면 되니 목록을 짧게 유지
      if (data.mode && data.mode !== 'random' && seen.length > 30) seen = seen.slice(-30);
      try { localStorage.setItem('ob_seen', JSON.stringify(seen)); } catch {}
    }
    if (data.empty) {
      return { id: 0, text: '첫 올리브가 될\n영감의 문구를 담아보세요.', source: '', stars: 1 };
    }
    return data;
  } catch {
    // 오프라인: 마지막으로 본 구절
    try {
      const saved = JSON.parse(localStorage.getItem('ob_last') || 'null');
      if (saved) return saved;
    } catch {}
    return { id: 0, text: '연결이 필요합니다.', source: '', stars: 1 };
  }
}

// 다음 구절을 2개까지 미리 받아 둠 → 넘길 때 서버를 기다리지 않음
const AHEAD = 2;
const ahead = [];
try { (JSON.parse(localStorage.getItem('ob_ahead') || '[]') || []).forEach(x => x && x.id && ahead.push(x)); } catch {}
const saveAhead = () => { try { localStorage.setItem('ob_ahead', JSON.stringify(ahead)); } catch {} };
let filling = null; // 받는 중인 Promise (동시에 두 번 받아 같은 구절이 겹치지 않게)
function fillAhead() {
  if (filling || !token) return filling;
  filling = (async () => {
    while (ahead.length < AHEAD && token) {
      const item = await fetchRandom();
      if (!item || !item.id) break; // 빈 바구니·오프라인 안내문은 쌓아 두지 않음
      ahead.push(item);
      saveAhead();
    }
  })().finally(() => { filling = null; });
  return filling;
}

function next() {
  if (idx < hist.length - 1) {
    // 되돌아간 상태면 앞으로
    transition(() => hist[++idx], 1);
  } else {
    transition(async () => {
      if (!ahead.length && filling) await filling;
      const item = ahead.length ? ahead.shift() : await fetchRandom();
      saveAhead();
      setTimeout(fillAhead, 0);
      hist.push(item);
      if (hist.length > 100) { hist.shift(); }
      idx = hist.length - 1;
      return item;
    }, 1);
  }
}

function prev() {
  if (idx > 0) transition(() => hist[--idx], -1);
}

// 책장 넘기듯: 오른쪽→왼쪽 스와이프 = 다음, 왼쪽→오른쪽 = 이전
// 탭은 화면 오른쪽 절반 = 다음, 왼쪽 절반 = 이전
let tx = 0, ty = 0, swiped = false;
$stage.addEventListener('touchstart', e => {
  tx = e.touches[0].clientX;
  ty = e.touches[0].clientY;
}, { passive: true });
$stage.addEventListener('touchend', e => {
  const dx = e.changedTouches[0].clientX - tx;
  const dy = e.changedTouches[0].clientY - ty;
  if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
    swiped = true;
    if (dx < 0) next(); // 오른쪽에서 왼쪽으로 쓸기 → 다음 구절
    else prev();        // 왼쪽에서 오른쪽으로 쓸기 → 직전 구절
  }
}, { passive: true });
// 당겨서 새로고침: 맨 위에서 아래로 끌어내리면 표시가 따라오고, 충분히 당겼다 놓으면 reload
// (body 가 position:fixed 라 브라우저 기본 당겨서 새로고침이 안 되므로 직접 구현)
const $ptr = document.getElementById('ptr');
const PTR_GO = 90;
let pulling = false, pullY = 0;
$stage.addEventListener('touchstart', e => {
  pulling = $stage.scrollTop <= 0 && e.touches.length === 1;
  pullY = 0;
}, { passive: true });
$stage.addEventListener('touchmove', e => {
  if (!pulling) return;
  const dx = e.touches[0].clientX - tx;
  const dy = e.touches[0].clientY - ty;
  if (dy <= 0 || Math.abs(dx) > dy) { pullY = 0; $ptr.style.transform = ''; $ptr.classList.remove('ready'); return; }
  pullY = Math.min(dy * 0.5, 120);
  $ptr.style.transition = 'none';
  $ptr.style.transform = `translate(-50%, ${pullY}px) rotate(${pullY * 3}deg)`;
  $ptr.classList.toggle('ready', pullY >= PTR_GO * 0.66);
}, { passive: true });
$stage.addEventListener('touchend', () => {
  if (!pulling) return;
  pulling = false;
  $ptr.style.transition = '';
  if ($ptr.classList.contains('ready')) {
    swiped = true;
    $ptr.classList.add('spin');
    location.reload();
  } else {
    $ptr.style.transform = '';
  }
}, { passive: true });

$stage.addEventListener('click', e => {
  if (swiped) { swiped = false; return; }
  if (e.clientX < window.innerWidth / 2) prev();
  else next();
});

// 첫 구절: 미리 받아 둔 게 있으면 바로, 없으면 받아서
if (token && ahead.length) next(); else authReady.then(next);

// 시작 화면은 앱을 열 때 한 번만 (당겨서 새로고침 때는 생략)
const $splash = document.getElementById('splash');
if ($splash && !document.documentElement.classList.contains('nosplash')) {
  try { sessionStorage.setItem('ob_splash', '1'); } catch {}
  setTimeout(() => {
    $splash.classList.add('out');
    setTimeout(() => $splash.remove(), 700);
  }, 1500);
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js');
}

// iOS 사파리 핀치 확대 차단 (viewport user-scalable=no 를 무시함)
['gesturestart', 'gesturechange'].forEach(t =>
  document.addEventListener(t, e => e.preventDefault(), { passive: false }));
document.addEventListener('touchmove', e => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
