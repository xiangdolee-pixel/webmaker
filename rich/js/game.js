/* 머니로드 — 전자룰렛으로 움직이는 직업 부자 레이스 (폰 한 대로 2~4명) */
(function () {
  'use strict';

  var START_CASH = 20000;
  var LEVEL_PT = 10000;   // 마지막 계산: 레벨 1 = 10,000
  var PASS_PT = 5000;     // 마지막 계산: 동승자 1명 = 5,000
  var MAX_PASS = 5;
  var ALLOWANCE = 2000;   // 학생 용돈
  var FINISH_BONUS = [20000, 10000, 5000, 0];
  var CONTEST_PRIZE = 30000;
  var SAVE_KEY = 'rich-save-v2';
  var SOUND_KEY = 'rich-sound';

  var COLORS = ['#e8413c', '#2f6fed', '#fcc419', '#82c91e'];
  var CAR_NAMES = ['빨강', '파랑', '노랑', '연두'];
  var CAR_DARK = { '#e8413c': '#a61e1a', '#2f6fed': '#1a45a8', '#fcc419': '#c98a00', '#82c91e': '#4f8a10' };
  var SEAT_COL = { '#fcc419': '#ff922b' };

  // 직업 = "○○의 길" 3단계. lp: [2단계까지, 3단계까지 더] 필요한 레벨. 월급이 {spin:x} 이면 월급날 룰렛 × x
  var JOBS = [
    { id: 'chef', n: '요리사', ic: '🍳', col: '#f76707', lp: [2, 3], st: [['주방 보조', 8000, 0], ['셰프', 20000, 5000], ['레스토랑 사장', 45000, 15000]] },
    { id: 'dev', n: '프로그래머', ic: '💻', col: '#4263eb', lp: [3, 3], st: [['신입 개발자', 10000, 0], ['개발 팀장', 24000, 6000], ['IT 회사 대표', 50000, 18000]] },
    { id: 'creator', n: '크리에이터', ic: '🎬', col: '#d6336c', lp: [2, 4], st: [['새내기 크리에이터', { spin: 1000 }, 0], ['인기 크리에이터', { spin: 3500 }, 5000], ['미디어 회사 대표', { spin: 7000 }, 15000]] },
    { id: 'fire', n: '소방관', ic: '🚒', col: '#c92a2a', lp: [2, 2], st: [['소방사', 9000, 0], ['소방서장', 20000, 4000], ['소방본부장', 36000, 10000]] },
    { id: 'doctor', n: '의사', ic: '🩺', col: '#0ca678', lp: [3, 4], st: [['인턴', 7000, 0], ['전문의', 28000, 8000], ['병원장', 56000, 20000]] },
    { id: 'baseball', n: '야구선수', ic: '⚾', col: '#1971c2', lp: [2, 3], st: [['연습생', { spin: 900 }, 0], ['주전 선수', 24000, 6000], ['야구 감독', 40000, 12000]] },
    { id: 'teacher', n: '선생님', ic: '📚', col: '#5c940d', lp: [2, 2], st: [['새내기 선생님', 11000, 0], ['부장 선생님', 19000, 3000], ['교장 선생님', 32000, 8000]] },
    { id: 'astro', n: '우주비행사', ic: '🚀', col: '#6741d9', lp: [4, 4], st: [['우주 훈련생', 6000, 0], ['우주비행사', 32000, 8000], ['우주센터장', 65000, 22000]] },
    { id: 'farmer', n: '농부', ic: '🌾', col: '#e67700', lp: [2, 3], st: [['새내기 농부', 8000, 0], ['스마트팜 운영자', 18000, 4000], ['농장 CEO', { spin: 6000 }, 12000]] }
  ];
  function jobOf(p) { if (!p.job) return null; for (var i = 0; i < JOBS.length; i++) if (JOBS[i].id === p.job) return JOBS[i]; return null; }

  var CHANCE = [
    { t: '잃어버린 지갑을 주인에게 찾아줬어요. 사례금을 받아요.', ic: '👛', m: 5000 },
    { t: '가지고 있던 주식이 크게 올랐어요!', ic: '📈', m: 15000 },
    { t: '주식이 떨어졌어요…', ic: '📉', m: -10000 },
    { t: '자격증 시험에 합격했어요! 레벨 +1', ic: '📜', lv: 1 },
    { t: '큰 상을 받았어요! 레벨 +2', ic: '🎖️', lv: 2 },
    { t: '감기에 걸려 병원에 다녀왔어요.', ic: '🤧', m: -4000 },
    { t: '지름길을 찾았어요! 앞으로 3칸.', ic: '🛣️', mv: 3 },
    { t: '길을 잘못 들었어요. 뒤로 2칸.', ic: '↩️', mv: -2 },
    { t: '오늘은 내 생일! 모두에게 3,000원씩 선물을 받아요.', ic: '🎂', all: 3000 },
    { t: '친구들에게 한턱 냈어요. 모두에게 2,000원씩 줘요.', ic: '🍕', all: -2000 },
    { t: '보너스 월급이 한 번 더 나왔어요!', ic: '💰', sal: 1 },
    { t: '과속으로 벌금을 냈어요.', ic: '🚓', m: -5000 },
    { t: '경품 추첨에 당첨됐어요!', ic: '🎉', m: 8000 },
    { t: '노트북이 고장 나서 고쳤어요.', ic: '💻', m: -7000 },
    { t: '스카우트 제의가 왔어요! 직업 카드를 새로 뽑을 수 있어요.', ic: '🤝', job: 1 },
    { t: '봉사활동으로 상을 받았어요! 레벨 +1', ic: '🏅', lv: 1 },
    { t: 'TV 요리 대결에 나가 상금을 받았어요.', ic: '📺', m: 10000, bj: ['chef', 'creator'], blv: 1 },
    { t: '동네 축제에서 재능 기부를 했어요. 감사 상품권!', ic: '🎪', m: 5000, bj: ['teacher', 'fire', 'farmer'], blv: 1 },
    { t: '학회에서 발표 상을 받았어요.', ic: '🔬', m: 15000, bj: ['doctor', 'dev', 'astro'], blv: 1 },
    { t: '자선 경기에 초대받았어요.', ic: '🏟️', m: 8000, bj: ['baseball', 'creator'], blv: 1 },
    { t: '외국어 학원에 등록했어요. 실력이 쑥쑥! 레벨 +1', ic: '🗣️', m: -10000, lv: 1 }
  ];
  // 자산 카드(찬스 덱에 섞임): 주식 · 부동산. sell = [[룰렛 이하, 값]...], end = 게임 끝 값, tax = 세금 날 낼 돈
  var ASSETS = [
    { id: 's1', kind: '주식', n: '반짝전자 100주', ic: '📟', col: '#4dabf7', price: 20000, sell: [[3, 10000], [7, 30000], [9, 60000]], end: 20000 },
    { id: 's2', kind: '주식', n: '구름항공 100주', ic: '✈️', col: '#748ffc', price: 30000, sell: [[3, 10000], [7, 40000], [9, 90000]], end: 25000 },
    { id: 's3', kind: '주식', n: '새싹바이오 100주', ic: '🧪', col: '#63e6be', price: 15000, sell: [[4, 5000], [8, 25000], [9, 80000]], end: 10000 },
    { id: 's4', kind: '주식', n: '별빛엔터 100주', ic: '🎙️', col: '#f783ac', price: 25000, sell: [[2, 5000], [7, 35000], [9, 70000]], end: 20000 },
    { id: 'e1', kind: '부동산', n: '바닷가 작은 집', ic: '🏡', col: '#ffa94d', price: 60000, tax: 5000, sell: [[3, 50000], [7, 80000], [9, 120000]], end: 70000 },
    { id: 'e2', kind: '부동산', n: '시골 텃밭', ic: '🥬', col: '#94d82d', price: 20000, tax: 1000, sell: [[3, 15000], [7, 30000], [9, 50000]], end: 25000 },
    { id: 'e3', kind: '부동산', n: '도시 오피스텔', ic: '🏢', col: '#91a7ff', price: 80000, tax: 8000, sell: [[3, 60000], [7, 100000], [9, 150000]], end: 90000 },
    { id: 'e4', kind: '부동산', n: '숲속 캠핑장', ic: '🏕️', col: '#69db7c', price: 40000, tax: 3000, sell: [[3, 30000], [7, 55000], [9, 90000]], end: 45000 }
  ];
  function assetOf(id) { for (var i = 0; i < ASSETS.length; i++) if (ASSETS[i].id === id) return ASSETS[i]; return null; }
  function sellRanges(a) { var lo = 1; return a.sell.map(function (r) { var t = (lo === r[0] ? lo : lo + '~' + r[0]) + ' → ' + num(r[1]) + '원'; lo = r[0] + 1; return t; }); }
  function sellValue(a, n) { for (var i = 0; i < a.sell.length; i++) if (n <= a.sell[i][0]) return a.sell[i][1]; return a.sell[a.sell.length - 1][1]; }

  // 43칸 — 학교 → STOP 직업 → 사회생활 · 결혼 · 가족 → 은퇴 주차장
  var T = [
    ['start'], ['earn', '장학금', 10000, '🎓'], ['lv1'], ['spend', '교재 사기', 5000, '📚'], ['earn', '아르바이트', 8000, '🧋'], ['pay'],
    ['chance'], ['stopJob'], ['spend', '정장 맞추기', 10000, '👔'], ['lv1'], ['again'], ['pay'],
    ['earn', '첫 프로젝트 성공', 15000, '🎯'], ['chance'], ['spend', '자취방 보증금', 20000, '🏠'], ['lv2'], ['pay'], ['contest', '노래자랑', '🎤'],
    ['stopWed'], ['spend', '신혼 가구', 15000, '🛋️'], ['lv1'], ['pay'],
    ['baby'], ['chance'], ['lotto'], ['spend', '가족 여행', 12000, '🏖️'], ['lv1'], ['pay'],
    ['invest'], ['stopTax'], ['earn', '특별 상여금', 20000, '💵'], ['chance'],
    ['baby'], ['spend', '자동차 수리', 9000, '🔧'], ['contest', '마라톤 대회', '🏃'], ['lv2'], ['job'], ['pay'],
    ['chance'], ['finish']
  ];
  var TILES = T.map(function (a) { return { type: a[0], name: a[1], amt: a[2], ic: a[a.length - 1] }; });
  var LAST = TILES.length - 1;

  // 판 좌표: 7칸 × 11칸 격자, 한 칸 100
  var M = 16, CELL = 100, BW = M * 2 + 7 * CELL, BH = M * 2 + 11 * CELL;
  var POS = (function () {
    var a = [], c, r;
    for (r = 5; r >= 0; r--) a.push([0, r]);
    for (c = 1; c <= 6; c++) a.push([c, 0]);
    for (r = 1; r <= 10; r++) a.push([6, r]);
    for (c = 5; c >= 0; c--) a.push([c, 10]);
    for (r = 9; r >= 7; r--) a.push([0, r]);
    a.push([1, 7]);
    for (r = 7; r >= 2; r--) a.push([2, r]);
    a.push([3, 2], [4, 2]);
    return a;
  })();
  function XY(i) { return [M + POS[i][0] * CELL + 50, M + POS[i][1] * CELL + 50]; }
  var BANK = [M + 400, M + 790];
  var PARK = [0, 1, 2, 3].map(function (k) { return [M + 325 + k * 50, M + 150]; });
  var MACH = { x: M + 300, y: M + 300, w: 200, h: 400 }; // 판 가운데 전자룰렛 자리

  // 지폐
  var DEN = [100000, 50000, 20000, 10000, 5000, 1000];
  var BILL = { 100000: '#74c0fc', 50000: '#ff8a65', 20000: '#51cf66', 10000: '#c0eb75', 5000: '#ffe066', 1000: '#e9ecef' };

  // ---------- 도우미 ----------
  function $(id) { return document.getElementById(id); }
  function num(n) { return Math.abs(n).toLocaleString('ko-KR'); }
  function won(n) { return (n < 0 ? '−' : '') + num(n) + '원'; }
  function signed(n) { return (n >= 0 ? '+' : '−') + num(n) + '원'; }
  function short(n) { n = Math.abs(n); return n >= 10000 ? (n / 10000) + '만' : (n / 1000) + '천'; }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function roll() { return 1 + Math.floor(Math.random() * 9); }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function reduced() { return window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches; }
  // 위에서 본 지붕 없는 장난감 자동차: 보닛 · 운전대 · 의자 6개, crew = ['me', 'spouse' | 'baby' | 'pet' ...]
  var HAIR = ['#3b2a20', '#7a4a24', '#1f1f1f', '#c2410c', '#4a3428', '#2b2b2b'];
  var SHIRT = ['#ffffff', '#ff8787', '#74c0fc', '#b197fc', '#63e6be', '#ffd8a8'];
  function personSvg(kind, x, y, k) {
    if (kind === 'pet') {
      return '<ellipse cx="' + x + '" cy="' + (y + 1.6) + '" rx="2.6" ry="2" fill="#c08457"/>' +
        '<ellipse cx="' + (x - 2.1) + '" cy="' + (y - .8) + '" rx="1.1" ry="1.8" fill="#6b3f1d"/><ellipse cx="' + (x + 2.1) + '" cy="' + (y - .8) + '" rx="1.1" ry="1.8" fill="#6b3f1d"/>' +
        '<circle cx="' + x + '" cy="' + (y - .4) + '" r="2.1" fill="#d9a066" stroke="rgba(0,0,0,.35)" stroke-width=".35"/><circle cx="' + x + '" cy="' + (y + .4) + '" r=".55" fill="#2b1a10"/>';
    }
    var baby = kind === 'baby', hr = baby ? 1.7 : 2.3, sh = SHIRT[k % SHIRT.length], hc = HAIR[(k * 3 + 1) % HAIR.length];
    if (kind === 'me') { sh = '#ffffff'; hc = '#2b2b2b'; }
    return '<ellipse cx="' + x + '" cy="' + (y + 1.9) + '" rx="' + (baby ? 2.2 : 3) + '" ry="' + (baby ? 1.5 : 1.9) + '" fill="' + sh + '" stroke="rgba(0,0,0,.3)" stroke-width=".35"/>' +
      '<circle cx="' + x + '" cy="' + (y - .3) + '" r="' + hr + '" fill="#ffd8b1" stroke="rgba(0,0,0,.35)" stroke-width=".35"/>' +
      (baby
        ? '<path d="M' + (x - .4) + ' ' + (y - 2) + ' q.6 -.9 1.2 -.2" stroke="' + hc + '" stroke-width=".55" fill="none" stroke-linecap="round"/>'
        : '<path d="M' + (x - hr) + ' ' + (y - .1) + ' a' + hr + ' ' + hr + ' 0 0 1 ' + hr * 2 + ' 0 q-' + hr + ' -1.1 -' + hr * 2 + ' 0z" fill="' + hc + '"/>') +
      (kind === 'spouse' ? '<circle cx="' + (x + hr * .7) + '" cy="' + (y - hr * .7) + '" r=".7" fill="#ff6b9a"/>' : '');
  }
  function carSvg(color, crew) {
    var dk = CAR_DARK[color] || 'rgba(0,0,0,.4)', seat = SEAT_COL[color] || '#ffd43b';
    var seats = [[11.3, 19.5], [20.7, 19.5], [11.3, 28], [20.7, 28], [11.3, 36.5], [20.7, 36.5]], h = '';
    seats.forEach(function (q, k) {
      h += '<rect x="' + (q[0] - 3.6) + '" y="' + (q[1] - 3.4) + '" width="7.2" height="7" rx="1.8" fill="' + seat + '" stroke="rgba(0,0,0,.28)" stroke-width=".45"/>' +
        '<rect x="' + (q[0] - 2.4) + '" y="' + (q[1] - 2.1) + '" width="4.8" height="4" rx="1" fill="rgba(0,0,0,.1)"/>' +
        '<rect x="' + (q[0] - 3.4) + '" y="' + (q[1] + 2.3) + '" width="6.8" height="1.2" rx=".6" fill="rgba(255,255,255,.45)"/>';
      if (crew && crew[k]) h += personSvg(crew[k], q[0], q[1], k);
    });
    return '<svg class="car-ic" viewBox="0 0 32 46" aria-hidden="true">' +
      // 바퀴
      '<rect x="1" y="7" width="4" height="8.5" rx="2" fill="#343a40"/><rect x="27" y="7" width="4" height="8.5" rx="2" fill="#343a40"/>' +
      '<rect x="1" y="31" width="4" height="8.5" rx="2" fill="#343a40"/><rect x="27" y="31" width="4" height="8.5" rx="2" fill="#343a40"/>' +
      // 몸통
      '<rect class="body" x="3.2" y="1.5" width="25.6" height="43" rx="8" fill="' + color + '" stroke="' + dk + '" stroke-width=".9"/>' +
      // 보닛 · 유리창
      '<path d="M5 9.5 Q5 2.6 16 2.6 Q27 2.6 27 9.5 Z" fill="rgba(255,255,255,.22)"/>' +
      '<path d="M5.2 11.4 Q16 8.2 26.8 11.4 L26.8 13.4 Q16 10.4 5.2 13.4 Z" fill="' + dk + '" opacity=".85"/>' +
      '<circle cx="6.8" cy="4.8" r="1.1" fill="#fff3bf"/><circle cx="25.2" cy="4.8" r="1.1" fill="#fff3bf"/>' +
      // 실내 바닥 · 운전대
      '<rect x="6" y="14.4" width="20" height="28" rx="3.6" fill="' + dk + '" opacity=".35"/>' +
      '<rect x="6.6" y="15" width="18.8" height="26.8" rx="3.2" fill="rgba(255,255,255,.14)"/>' +
      '<circle cx="11.3" cy="15.2" r="2" fill="none" stroke="#343a40" stroke-width=".9"/><path d="M9.3 15.2h4" stroke="#343a40" stroke-width=".7"/>' +
      '<rect x="12" y="43.4" width="8" height="1.4" rx=".7" fill="' + dk + '"/>' +
      h + '</svg>';
  }
  function crewOf(p) {
    if (p.crew) return ['me'].concat(p.crew);
    var a = ['me']; for (var k = 0; k < (p.pass || 0); k++) a.push(p.married && k === 0 ? 'spouse' : 'baby'); return a;
  }
  function payText(pay) { return typeof pay === 'object' ? '룰렛 × ' + num(pay.spin) : num(pay) + '원'; }

  // ---------- 저장 ----------
  var S = null;
  function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) {} }
  function load() { try { var s = JSON.parse(localStorage.getItem(SAVE_KEY)); return s && s.players ? s : null; } catch (e) { return null; } }
  function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} }

  // ---------- 소리 ----------
  var sound = true, ac = null;
  try { sound = localStorage.getItem(SOUND_KEY) !== 'off'; } catch (e) {}
  function audio() { ac = ac || new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume(); return ac; }
  function beep(f, d, type, vol) {
    if (!sound) return;
    try {
      var a = audio(), o = a.createOscillator(), g = a.createGain(), t = a.currentTime;
      o.type = type || 'square'; o.frequency.value = f;
      g.gain.setValueAtTime(vol || .05, t); g.gain.exponentialRampToValueAtTime(.0001, t + (d || .06));
      o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + (d || .06) + .02);
    } catch (e) {}
  }
  function whoosh() { // 카드 '촥'
    if (!sound) return;
    try {
      var a = audio(), len = a.sampleRate * .22, buf = a.createBuffer(1, len, a.sampleRate), d = buf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.2);
      var src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
      src.buffer = buf; f.type = 'bandpass'; f.frequency.value = 2600; f.Q.value = .7; g.gain.value = .5;
      src.connect(f); f.connect(g); g.connect(a.destination); src.start();
    } catch (e) {}
  }
  // 또르르르 — 실로폰 같은 맑은 음이 굴러가듯 올라간다
  var ROLL_NOTES = [1047, 1175, 1319, 1568, 1760, 2093, 1760, 1568, 1319, 1568, 1760, 2093, 2349, 2637];
  function pluck(f, t, vol, dur) {
    var a = audio(), o = a.createOscillator(), o2 = a.createOscillator(), g = a.createGain(), lp = a.createBiquadFilter();
    o.type = 'sine'; o.frequency.value = f; o2.type = 'sine'; o2.frequency.value = f * 2.01;
    lp.type = 'lowpass'; lp.frequency.value = 5200;
    g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(vol, t + .004); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    var g2 = a.createGain(); g2.gain.value = .25;
    o.connect(g); o2.connect(g2); g2.connect(g); g.connect(lp); lp.connect(a.destination);
    o.start(t); o2.start(t); o.stop(t + dur + .02); o2.stop(t + dur + .02);
  }
  // 누르면 '띠리리링' 네 번만, 부드러운 가운데 음
  function rollTick() {}
  function rollStart() {
    if (!sound) return;
    try { var t = audio().currentTime; [784, 988, 1175, 1319].forEach(function (f, i) { pluck(f, t + i * .085, .055, i === 3 ? .5 : .22); }); } catch (e) {}
  }
  function rollDone() {}
  function jingle(good) {
    var notes = good ? [660, 880, 1320] : [440, 330, 220];
    notes.forEach(function (f, i) { setTimeout(function () { beep(f, .12, 'triangle', .07); }, i * 110); });
  }
  function setSoundBtn() {
    var b = $('btnSound');
    b.setAttribute('aria-pressed', sound ? 'true' : 'false');
    b.setAttribute('aria-label', sound ? '소리 끄기' : '소리 켜기');
  }

  // ---------- 판 그리기 (SVG) ----------
  function tx(x, y, s, size, fill, extra) {
    return '<text x="' + x + '" y="' + y + '" font-size="' + size + '" fill="' + fill + '" text-anchor="middle" dominant-baseline="central" ' + (extra || '') + '>' + esc(s) + '</text>';
  }
  function cellBox(c0, r0, c1, r1, inset) {
    inset = inset || 0;
    return { x: M + c0 * CELL + inset, y: M + r0 * CELL + inset, w: (c1 - c0 + 1) * CELL - inset * 2, h: (r1 - r0 + 1) * CELL - inset * 2 };
  }
  function rect(b, fill, rx, extra) { return '<rect x="' + b.x + '" y="' + b.y + '" width="' + b.w + '" height="' + b.h + '" rx="' + (rx || 0) + '" fill="' + fill + '" ' + (extra || '') + '/>'; }
  function tree(x, y, s) {
    return '<rect x="' + (x - s * .08) + '" y="' + (y + s * .1) + '" width="' + (s * .16) + '" height="' + (s * .42) + '" rx="3" fill="#8d5524"/>' +
      '<circle cx="' + (x - s * .26) + '" cy="' + (y + s * .1) + '" r="' + (s * .3) + '" fill="#2b8a3e"/>' +
      '<circle cx="' + (x + s * .26) + '" cy="' + (y + s * .1) + '" r="' + (s * .3) + '" fill="#2f9e44"/>' +
      '<circle cx="' + x + '" cy="' + (y - s * .14) + '" r="' + (s * .36) + '" fill="#37b24d"/>' +
      '<circle cx="' + (x - s * .1) + '" cy="' + (y - s * .26) + '" r="' + (s * .1) + '" fill="#69db7c" opacity=".7"/>';
  }
  function flower(x, y, c) {
    return '<g transform="translate(' + x + ' ' + y + ')"><circle r="4.5" cx="-4" fill="' + c + '"/><circle r="4.5" cx="4" fill="' + c + '"/><circle r="4.5" cy="-4" fill="' + c + '"/><circle r="4.5" cy="4" fill="' + c + '"/><circle r="3" fill="#ffe066"/></g>';
  }
  var seed = 11;
  function rnd() { seed = seed * 16807 % 2147483647; return seed / 2147483647; }

  function moneySvg(x, y) { // 돈다발 그림
    var s = '';
    for (var k = 2; k >= 0; k--) {
      s += '<g transform="translate(' + (x - 27 + k * 3) + ' ' + (y - 14 - k * 5) + ') rotate(-8)">' +
        '<rect width="54" height="26" rx="3" fill="' + (k ? '#8ce99a' : '#51cf66') + '" stroke="#2b8a3e" stroke-width="2"/>' +
        '<rect x="5" y="4" width="44" height="18" rx="2" fill="none" stroke="#2b8a3e" stroke-width="1.2" opacity=".6"/>' +
        (k ? '' : '<circle cx="27" cy="13" r="7" fill="#d3f9d8" stroke="#2b8a3e" stroke-width="1.4"/><text x="27" y="13.5" font-size="10" font-weight="900" fill="#2b8a3e" text-anchor="middle" dominant-baseline="central">₩</text>') +
        '</g>';
    }
    s += '<circle cx="' + (x + 22) + '" cy="' + (y + 4) + '" r="9" fill="#fcc419" stroke="#e67700" stroke-width="2"/><circle cx="' + (x + 14) + '" cy="' + (y + 8) + '" r="9" fill="#ffd43b" stroke="#e67700" stroke-width="2"/>';
    return s;
  }
  function stopBadge(x, y) {
    var pts = [];
    for (var k = 0; k < 8; k++) { var a = Math.PI / 8 + k * Math.PI / 4; pts.push((x + Math.cos(a) * 17).toFixed(1) + ',' + (y + Math.sin(a) * 17).toFixed(1)); }
    return '<polygon points="' + pts.join(' ') + '" fill="#e03131" stroke="#fff" stroke-width="2.5"/>' + tx(x, y + 1, 'STOP', 9.5, '#fff', 'font-weight="900"');
  }
  function tileSvg(t, i) {
    var p = XY(i), x = p[0], y = p[1], h = 44, s = '', lab = '', fill = '#fff', fg = '#1f2328', ic = '';
    var box = '<rect x="' + (x - h) + '" y="' + (y - h) + '" width="' + h * 2 + '" height="' + h * 2 + '" rx="12" ';
    switch (t.type) {
      case 'pay':
        return '<g class="tl" data-i="' + i + '"><circle cx="' + x + '" cy="' + y + '" r="52" fill="#fff9db" stroke="#f08c00" stroke-width="4"/>' +
          '<circle cx="' + x + '" cy="' + y + '" r="45" fill="none" stroke="#ffe066" stroke-width="3" stroke-dasharray="4 5"/>' +
          moneySvg(x, y - 6) + tx(x, y + 30, '월급날', 18, '#1f2328', 'font-weight="900"') + '</g>';
      case 'start': {
        var pts = [];
        for (var k = 0; k < 24; k++) { var a = k * Math.PI / 12, r = k % 2 ? 44 : 56; pts.push((x + Math.cos(a) * r).toFixed(1) + ',' + (y + Math.sin(a) * r).toFixed(1)); }
        return '<g class="tl" data-i="' + i + '"><polygon points="' + pts.join(' ') + '" fill="#1c7ed6" stroke="#fff" stroke-width="4"/>' +
          tx(x, y - 8, '🚩', 26, '#fff') + tx(x, y + 20, '출발', 21, '#fff', 'font-weight="900"') + '</g>';
      }
      case 'lv1': case 'lv2':
        s = box + 'fill="#e8413c"/>' +
          '<circle cx="' + (x - 22) + '" cy="' + (y - 22) + '" r="17" fill="#1c4fd8" stroke="#fff" stroke-width="2.5"/>' +
          tx(x - 22, y - 21, t.type === 'lv1' ? '+1' : '+2', 17, '#fff', 'font-weight="900"') +
          tx(x + 12, y - 20, '⭐', 20, '#fff') +
          tx(x, y + 12, '레벨업', 19, '#fff', 'font-weight="900"') + tx(x, y + 32, 'LEVEL UP', 10, '#ffe3e3', 'font-weight="800"');
        return '<g class="tl" data-i="' + i + '">' + s + '</g>';
      case 'stopJob': case 'stopWed': case 'stopTax': case 'finish': {
        var L = { stopJob: ['직업', '카드 뽑기', '💼'], stopWed: ['결혼', '축의금', '💍'], stopTax: ['세금', '내는 날', '🧾'], finish: ['은퇴', '주차장으로', '🏁'] }[t.type];
        s = box + 'fill="#1c4fd8" stroke="#fff" stroke-width="3"/>' + stopBadge(x - 20, y - 22) + tx(x + 18, y - 20, L[2], 22, '#fff') +
          tx(x, y + 10, L[0], 22, '#fff', 'font-weight="900"') + tx(x, y + 31, L[1], 12, '#d0ebff', 'font-weight="700"');
        return '<g class="tl" data-i="' + i + '">' + s + '</g>';
      }
      case 'chance': fill = '#7048e8'; fg = '#fff'; ic = '❓'; lab = '찬스'; break;
      case 'earn': fill = '#ff922b'; fg = '#fff'; ic = t.ic; lab = '+' + short(t.amt); break;
      case 'spend': fill = '#fff'; fg = '#e03131'; ic = t.ic; lab = '−' + short(t.amt); break;
      case 'lotto': fill = '#fcc419'; ic = '🎫'; lab = '복권'; break;
      case 'invest': fill = '#20c997'; fg = '#fff'; ic = '📈'; lab = '투자'; break;
      case 'again': fill = '#dee2e6'; ic = '🔁'; lab = '한 번 더'; break;
      case 'contest': fill = '#f06595'; fg = '#fff'; ic = t.ic; lab = t.name.length > 4 ? t.name.slice(0, 3) : t.name; break;
      case 'baby': fill = '#ffdeeb'; ic = '👶'; lab = '가족 +1'; break;
      case 'job': fill = '#74c0fc'; ic = '💼'; lab = '이직'; break;
    }
    s = box + 'fill="' + fill + '" stroke="rgba(0,0,0,.12)" stroke-width="2"/>' +
      '<rect x="' + (x - h + 4) + '" y="' + (y + h - 8) + '" width="' + (h * 2 - 8) + '" height="4" rx="2" fill="rgba(0,0,0,.1)"/>' +
      tx(x, y - 12, ic, 32, fg) + tx(x, y + 24, lab, 20, fg, 'font-weight="900"');
    if (t.type === 'spend' || t.type === 'earn') s += tx(x, y + 39, t.type === 'spend' ? '내기' : '받기', 9, fg, 'font-weight="700" opacity=".75"');
    return '<g class="tl" data-i="' + i + '">' + s + '</g>';
  }
  function drawBoard() {
    seed = 11;
    var s = [], k, b, x, y;
    s.push('<svg class="bsvg" viewBox="0 0 ' + BW + ' ' + BH + '" role="img" aria-label="머니로드 게임판" font-family="Pretendard, system-ui, sans-serif">');
    s.push('<defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#74c0fc"/><stop offset="1" stop-color="#d0ebff"/></linearGradient>' +
      '<pattern id="grass" width="26" height="26" patternUnits="userSpaceOnUse"><rect width="26" height="26" fill="#8fd14f"/><path d="M5 20l2-6 2 6M16 10l2-6 2 6" stroke="#6fb52c" stroke-width="2" fill="none" stroke-linecap="round"/></pattern>' +
      '<pattern id="water" width="40" height="20" patternUnits="userSpaceOnUse"><rect width="40" height="20" fill="#4dabf7"/><path d="M2 12q8-6 16 0t16 0" stroke="#a5d8ff" stroke-width="2.5" fill="none" stroke-linecap="round"/></pattern></defs>');
    // 바탕: 파란 테두리 + 잔디
    s.push('<rect width="' + BW + '" height="' + BH + '" rx="28" fill="#1c7ed6"/>');
    s.push('<rect x="' + (M - 6) + '" y="' + (M - 6) + '" width="' + (BW - M * 2 + 12) + '" height="' + (BH - M * 2 + 12) + '" rx="22" fill="url(#grass)"/>');
    // 위쪽 도시 (1~2열)
    b = cellBox(1, 1, 2, 1, 4);
    s.push(rect(b, 'url(#sky)', 14));
    s.push('<circle cx="' + (b.x + 40) + '" cy="' + (b.y + 22) + '" r="11" fill="#fff" opacity=".9"/><circle cx="' + (b.x + 56) + '" cy="' + (b.y + 18) + '" r="14" fill="#fff" opacity=".9"/><circle cx="' + (b.x + 72) + '" cy="' + (b.y + 24) + '" r="9" fill="#fff" opacity=".9"/>');
    s.push('<circle cx="' + (b.x + b.w - 30) + '" cy="' + (b.y + 22) + '" r="12" fill="#ffd43b"/>');
    var bc = ['#5c7cfa', '#748ffc', '#4dabf7', '#9775fa', '#63e6be', '#ffa8a8', '#adb5bd'];
    for (x = b.x + 6; x < b.x + b.w - 12;) {
      var w = 24 + Math.floor(rnd() * 22), hh = 30 + Math.floor(rnd() * 48);
      if (x + w > b.x + b.w - 6) w = b.x + b.w - 6 - x;
      var top = b.y + b.h - hh;
      s.push('<rect x="' + x + '" y="' + top + '" width="' + w + '" height="' + hh + '" fill="' + pick(bc) + '"/>');
      for (y = top + 6; y < b.y + b.h - 8; y += 11) for (var wx = x + 4; wx < x + w - 6; wx += 9) if (rnd() > .35) s.push('<rect x="' + wx + '" y="' + y + '" width="5" height="6" fill="#fff3bf" opacity=".85"/>');
      x += w + 3;
    }
    s.push('<rect x="' + b.x + '" y="' + (b.y + b.h - 6) + '" width="' + b.w + '" height="6" fill="#495057"/>');
    // 은퇴 주차장 (3~4열 1줄, 은퇴 칸 바로 위)
    b = cellBox(3, 1, 4, 1, 4);
    s.push(rect(b, '#5c636a', 12, 'stroke="#fff" stroke-width="4"'));
    PARK.forEach(function (q, i) {
      s.push('<rect x="' + (q[0] - 23) + '" y="' + (b.y + 8) + '" width="46" height="' + (b.h - 16) + '" fill="none" stroke="#fff" stroke-width="2.5"/>');
      s.push(tx(q[0], b.y + b.h - 18, 'P' + (i + 1), 17, 'rgba(255,255,255,.85)', 'font-weight="900"'));
    });
    s.push('<rect x="' + (b.x + b.w / 2 - 50) + '" y="' + (b.y - 8) + '" width="100" height="20" rx="6" fill="#ffd43b"/>' + tx(b.x + b.w / 2, b.y + 2, '🅿 은퇴 주차장', 12, '#1f2328', 'font-weight="900"'));
    // 오른쪽 강
    b = cellBox(5, 1, 5, 9, 12);
    s.push(rect(b, 'url(#water)', 40, 'stroke="#d0ebff" stroke-width="5"'));
    s.push(tx(b.x + b.w / 2, b.y + 130, '⛵', 30, '#fff') + tx(b.x + b.w / 2, b.y + 480, '🦆', 24, '#fff') + tx(b.x + b.w / 2, b.y + 720, '🐟', 22, '#fff'));
    // 숲 · 출발 표지판
    [[1, 2], [1, 3], [1, 4], [1, 5], [1, 6], [1, 8], [1, 9], [2, 8], [0, 6]].forEach(function (c) {
      var bx = M + c[0] * CELL, by = M + c[1] * CELL;
      if (c[0] === 0) {
        s.push('<rect x="' + (bx + 46) + '" y="' + (by + 40) + '" width="8" height="50" fill="#8d5524"/><rect x="' + (bx + 14) + '" y="' + (by + 14) + '" width="72" height="34" rx="6" fill="#fff" stroke="#1c4fd8" stroke-width="3"/>' + tx(bx + 50, by + 31, '▲ 출발', 15, '#1c4fd8', 'font-weight="900"'));
        return;
      }
      s.push(tree(bx + 32 + rnd() * 10, by + 38 + rnd() * 8, 46) + tree(bx + 66 + rnd() * 6, by + 64 + rnd() * 6, 40));
      for (k = 0; k < 3; k++) s.push(flower(bx + 12 + rnd() * 76, by + 14 + rnd() * 76, pick(['#ff6b6b', '#f783ac', '#ffffff', '#da77f2'])));
    });
    // 가운데 전자룰렛 받침 (꽃밭 광장)
    b = cellBox(3, 2, 4, 6, 0); b = { x: MACH.x - 8, y: MACH.y - 14, w: MACH.w + 16, h: MACH.h + 26 };
    s.push(rect(b, '#c0eb75', 30, 'stroke="#fff" stroke-width="5"'));
    s.push('<rect x="' + (MACH.x + 6) + '" y="' + (MACH.y + 18) + '" width="' + (MACH.w - 12) + '" height="' + (MACH.h - 8) + '" rx="30" fill="rgba(0,0,0,.22)"/>');
    for (k = 0; k < 14; k++) s.push(flower(b.x + 10 + rnd() * (b.w - 20), (rnd() < .5 ? b.y + 6 + rnd() * 10 : b.y + b.h - 14 - rnd() * 8), pick(['#ff6b6b', '#f783ac', '#ffffff', '#da77f2', '#ffd43b'])));
    // 은행 (지폐가 여기서 나간다)
    x = BANK[0]; y = BANK[1];
    s.push('<polygon points="' + (x - 46) + ',' + (y - 22) + ' ' + x + ',' + (y - 50) + ' ' + (x + 46) + ',' + (y - 22) + '" fill="#e9ecef" stroke="#868e96" stroke-width="2.5"/>' +
      '<rect x="' + (x - 42) + '" y="' + (y - 22) + '" width="84" height="52" fill="#f8f9fa" stroke="#868e96" stroke-width="2.5"/>' +
      [-28, -10, 10, 28].map(function (o) { return '<rect x="' + (x + o - 4) + '" y="' + (y - 16) + '" width="8" height="40" fill="#dee2e6"/>'; }).join('') +
      '<rect x="' + (x - 48) + '" y="' + (y + 30) + '" width="96" height="8" fill="#adb5bd"/>' + tx(x, y - 32, '₩', 15, '#f08c00', 'font-weight="900"') +
      '<rect x="' + (x - 34) + '" y="' + (y + 42) + '" width="68" height="22" rx="6" fill="#1c4fd8"/>' + tx(x, y + 53, '머니 은행', 13, '#fff', 'font-weight="900"'));
    s.push(tree(x - 76, y + 8, 38) + tree(x + 78, y + 10, 36));
    // 아래 간판
    b = cellBox(2, 9, 4, 9, 10);
    s.push(rect(b, '#fff', 18, 'stroke="#1f2328" stroke-width="4"'));
    s.push(tx(b.x + b.w / 2, b.y + 34, '머니로드', 40, '#1f2328', 'font-weight="900" letter-spacing="-1"') + tx(b.x + b.w / 2, b.y + 64, '직업 부자 레이스', 15, '#f08c00', 'font-weight="800"'));
    // 길
    var d = 'M' + POS.map(function (_, i) { return XY(i).join(' '); }).join(' L');
    s.push('<path d="' + d + '" fill="none" stroke="#e8a500" stroke-width="102" stroke-linejoin="round" stroke-linecap="round"/>');
    s.push('<path d="' + d + '" fill="none" stroke="#ffe066" stroke-width="92" stroke-linejoin="round" stroke-linecap="round"/>');
    // 방향 화살표
    for (k = 0; k < LAST; k++) {
      var a = XY(k), c2 = XY(k + 1), dx = (c2[0] - a[0]) / 100, dy = (c2[1] - a[1]) / 100, mx = (a[0] + c2[0]) / 2, my = (a[1] + c2[1]) / 2;
      s.push('<polygon points="' + (mx + dx * 6) + ',' + (my + dy * 6) + ' ' + (mx - dx * 4 - dy * 6) + ',' + (my - dy * 4 + dx * 6) + ' ' + (mx - dx * 4 + dy * 6) + ',' + (my - dy * 4 - dx * 6) + '" fill="#b07a00" opacity=".7"/>');
    }
    // 칸
    TILES.forEach(function (t, i) { s.push(tileSvg(t, i)); });
    s.push('</svg>');
    $('svgBox').innerHTML = s.join('');
    var bk = $('bank');
    bk.style.left = (BANK[0] / BW * 100) + '%'; bk.style.top = (BANK[1] / BH * 100) + '%';
    var mc = $('machine');
    mc.style.left = (MACH.x / BW * 100) + '%'; mc.style.top = (MACH.y / BH * 100) + '%';
    mc.style.width = (MACH.w / BW * 100) + '%'; mc.style.height = (MACH.h / BH * 100) + '%';
  }

  var OFF = [[-20, -17], [20, -17], [-20, 19], [20, 19]], TS = 36, TSH = TS * 46 / 32;
  function placeTokens() {
    var box = $('tokens');
    if (!S) { box.innerHTML = ''; return; }
    if (box.children.length !== S.players.length) box.innerHTML = S.players.map(function () { return '<div class="car"></div>'; }).join('');
    S.players.forEach(function (p, i) {
      var el = box.children[i], q;
      var ck = crewOf(p).join(); if (el.dataset.crew !== ck) { el.innerHTML = carSvg(p.color, crewOf(p)); el.dataset.crew = ck; }
      if (p.done && p.rank) { q = PARK[p.rank - 1]; q = [q[0] - TS / 2, q[1] - TSH / 2 - 8]; }
      else { q = XY(p.pos); q = [q[0] + OFF[i][0] - TS / 2, q[1] + OFF[i][1] - TSH / 2]; }
      el.style.width = (TS / BW * 100) + '%';
      el.style.left = (q[0] / BW * 100) + '%';
      el.style.top = (q[1] / BH * 100) + '%';
      el.classList.toggle('now', S.phase === 'play' && i === S.turn && !p.done);
    });
  }
  function flashTile(i) {
    var el = document.querySelector('.tl[data-i="' + i + '"]'); if (!el) return;
    el.classList.remove('hot'); void el.getBoundingClientRect(); el.classList.add('hot');
  }

  // ---------- 직업 · 단계 ----------
  function stage(p) { var j = jobOf(p); if (!j) return 0; return 1 + (p.level >= j.lp[0] ? 1 : 0) + (p.level >= j.lp[0] + j.lp[1] ? 1 : 0); }
  function stageInfo(p) { var j = jobOf(p); return j ? j.st[stage(p) - 1] : null; }
  function jobLabel(p) { var j = jobOf(p); return j ? j.ic + ' L' + stage(p) + ' ' + stageInfo(p)[0] : '🎒 학생'; }
  function payOf(p) { var si = stageInfo(p); return si ? si[1] : ALLOWANCE; }

  // ---------- 참여자 자리 · 지갑 ----------
  var pend = [], shown = [], lvPend = [];
  function breakdown(n) {
    var out = [];
    n = Math.abs(n);
    DEN.forEach(function (d) { var c = Math.floor(n / d); if (c) { out.push([d, c]); n -= c * d; } });
    return out;
  }
  function billHtml(d, cls) { return '<span class="bill ' + (cls || '') + '" style="--c:' + BILL[d] + '"><i>₩</i>' + short(d) + '</span>'; }
  function walletHtml(cash) {
    if (cash < 0) return '<span class="stack"><span class="bill loan"><i>대출</i>' + short(-cash) + '</span></span>';
    if (!cash) return '<span class="empty">빈 지갑</span>';
    return breakdown(cash).map(function (b) {
      return '<span class="stack' + (b[1] > 1 ? ' many' : '') + (b[1] > 2 ? ' lots' : '') + '">' + billHtml(b[0]) + (b[1] > 1 ? '<b>×' + b[1] + '</b>' : '') + '</span>';
    }).join('');
  }
  var FAM_LABEL = { me: '나', spouse: '배우자', baby: '아기', pet: '반려견' };
  function faceSvg(kind, k) { return '<svg viewBox="-4.4 -4.6 8.8 9" aria-hidden="true">' + personSvg(kind, 0, 0, k) + '</svg>'; }
  function famHtml(p) {
    var crew = crewOf(p), h = '';
    for (var k = 0; k < 6; k++) {
      h += k < crew.length
        ? '<span class="fm in ' + crew[k] + '"><span class="fm-face">' + faceSvg(crew[k], k) + '</span><small>' + FAM_LABEL[crew[k]] + '</small></span>'
        : '<span class="fm"><span class="fm-face"></span><small>빈자리</small></span>';
    }
    return h + (p.done ? '<span class="fm-done">🏁 ' + p.rank + '등 은퇴</span>' : '');
  }
  function jobKey(p) { return (p.job || 'student') + ':' + stage(p) + ':' + p.level; }
  function jobPlate(p) {
    var j = jobOf(p), st = stage(p);
    if (!j) return '<span class="jp student"><span class="jp-ic">🎒</span><span class="jp-t"><small>학교 다니는 중</small><b>학생</b></span>' +
      '<span class="jp-lv"><small>LEVEL</small><b>' + p.level + '</b></span></span>';
    var need = st < 3 ? (st === 1 ? j.lp[0] : j.lp[0] + j.lp[1]) - p.level : 0;
    return '<span class="jp" style="--jc:' + j.col + '"><span class="jp-ic">' + j.ic + '</span><span class="jp-t"><small>' + j.n + '의 길</small><b>L' + st + ' ' + esc(j.st[st - 1][0]) + '</b>' +
      '<span class="jp-st">' + [1, 2, 3].map(function (k) { return '<i class="' + (k <= st ? 'on' : '') + '">L' + k + '</i>'; }).join('') + (need > 0 ? '<em>승진까지 레벨 ' + need + '</em>' : '<em>최고 단계!</em>') + '</span></span>' +
      '<span class="jp-lv"><small>LEVEL</small><b>' + p.level + '</b></span></span>';
  }
  function seatSide(i) { return i % 2 ? 'seatsB' : 'seatsA'; }
  function buildSeats() {
    $('seatsA').innerHTML = ''; $('seatsB').innerHTML = '';
    if (!S) return;
    pend = S.players.map(function () { return 0; }); lvPend = pend.slice();
    shown = S.players.map(function (p) { return p.cash; });
    S.players.forEach(function (p, i) {
      var d = document.createElement('div');
      d.className = 'seat'; d.id = 'seat' + i; d.style.setProperty('--pc', p.color);
      d.innerHTML = '<div class="seat-hd"><span class="seat-car"></span><span class="nm"></span><span class="cash"></span></div>' +
        '<button type="button" class="seat-job" aria-label="직업 카드 보기"></button><div class="fam" aria-label="자동차에 탄 가족"></div><div class="wallet"></div><div class="seat-cards"><span class="lvcards"></span><span class="assets"></span></div>';
      d.querySelector('.seat-job').addEventListener('click', function (e) { if (!modalOpen && !busy) viewCard(S.players[i], e.currentTarget); });
      $(seatSide(i)).appendChild(d);
    });
  }
  function seatEl(i) { return $('seat' + i); }
  function updateSeat(i, animate) {
    var p = S.players[i], d = seatEl(i); if (!d) return;
    d.querySelector('.nm').textContent = p.name + (p.ai ? ' 🤖' : '');
    var car = d.querySelector('.seat-car');
    var ck = crewOf(p).join(); if (car.dataset.crew !== ck) { car.innerHTML = carSvg(p.color, crewOf(p)); car.dataset.crew = ck; }
    var jk = jobKey(p);
    if (d.dataset.jk !== jk) { d.querySelector('.seat-job').innerHTML = jobPlate(p); d.dataset.jk = jk; }
    var fk = crewOf(p).join() + (p.done ? p.rank : '');
    if (d.dataset.fk !== fk) { var fam = d.querySelector('.fam'), old = +(d.dataset.fn || 0); fam.innerHTML = famHtml(p); d.dataset.fk = fk; d.dataset.fn = crewOf(p).length;
      if (old && crewOf(p).length > old) { var nw = fam.querySelectorAll('.fm.in')[crewOf(p).length - 1]; if (nw) nw.classList.add('new'); } }
    if (!lvPend[i]) d.querySelector('.lvcards').innerHTML = p.level ? '<span class="lvcard"><i>LEVEL UP</i></span>' + (p.level > 1 ? '<b>×' + p.level + '</b>' : '') : '';
    d.querySelector('.assets').innerHTML = (p.assets || []).map(function (id) { var a = assetOf(id); return '<span class="acard" style="--c:' + a.col + '" title="' + esc(a.n) + '">' + a.ic + '</span>'; }).join('');
    d.classList.toggle('on', S.phase === 'play' && i === S.turn);
    d.classList.toggle('done', !!p.done);
    if (pend[i]) return; // 지폐가 날아가는 중이면 도착한 뒤에
    var c = d.querySelector('.cash'), from = shown[i], to = p.cash;
    d.querySelector('.wallet').innerHTML = walletHtml(to);
    if (animate && from !== to && !reduced()) {
      var t0 = performance.now();
      (function step(t) {
        var k = Math.min(1, (t - t0) / 500), v = Math.round((from + (to - from) * (1 - Math.pow(1 - k, 3))) / 100) * 100;
        c.textContent = won(v); c.classList.toggle('neg', v < 0);
        if (k < 1) requestAnimationFrame(step);
      })(t0);
      d.classList.remove(to > from ? 'gain' : 'loss'); void d.offsetWidth; d.classList.add(to > from ? 'gain' : 'loss');
    } else { c.textContent = won(to); c.classList.toggle('neg', to < 0); }
    shown[i] = to;
  }
  function center(el) { var r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }
  // 지폐가 또로록 날아간다: from/to = 요소
  function flyBills(fromEl, toEl, amount) {
    var list = [];
    breakdown(amount).forEach(function (b) { for (var k = 0; k < b[1] && list.length < 8; k++) list.push(b[0]); });
    return flyThings(fromEl, toEl, list);
  }
  function flyThings(fromEl, toEl, list) {
    if (reduced() || !fromEl || !toEl || !list.length) return Promise.resolve();
    var a = center(fromEl), z = center(toEl), layer = $('fly');
    return new Promise(function (resolve) {
      var left = list.length;
      list.forEach(function (d, i) {
        var el = document.createElement('div');
        if (d === 'lv') { el.className = 'lvcard fly-bill'; el.innerHTML = '<i>LEVEL UP</i>'; }
        else { el.className = 'bill fly-bill'; el.style.setProperty('--c', BILL[d]); el.innerHTML = '<i>₩</i>' + short(d); }
        layer.appendChild(el);
        var r0 = -20 + Math.random() * 40, r1 = -10 + Math.random() * 20, lift = 40 + Math.random() * 50;
        var mx = (a[0] + z[0]) / 2 + (Math.random() * 40 - 20), my = Math.min(a[1], z[1]) - lift;
        var anim = el.animate([
          { transform: 'translate(' + a[0] + 'px,' + a[1] + 'px) translate(-50%,-50%) rotate(' + r0 + 'deg) scale(.5)', opacity: 0 },
          { transform: 'translate(' + a[0] + 'px,' + (a[1] - 12) + 'px) translate(-50%,-50%) rotate(' + r0 + 'deg) scale(1.05)', opacity: 1, offset: .15 },
          { transform: 'translate(' + mx + 'px,' + my + 'px) translate(-50%,-50%) rotate(' + (r0 + r1) / 2 * 3 + 'deg) scale(1.1)', opacity: 1, offset: .55 },
          { transform: 'translate(' + z[0] + 'px,' + z[1] + 'px) translate(-50%,-50%) rotate(' + r1 + 'deg) scale(.6)', opacity: .9 }
        ], { duration: 720, delay: i * 95, easing: 'cubic-bezier(.35,.6,.3,1)', fill: 'forwards' });
        anim.onfinish = function () {
          el.remove(); beep(1500 + i * 60, .04, 'triangle', .05);
          if (--left === 0) resolve();
        };
      });
    });
  }
  // 돈이 오간다. other 가 있으면 other ↔ p, 없으면 은행 ↔ p
  function money(p, n, why, other) {
    if (!n) return Promise.resolve();
    var i = S.players.indexOf(p), j = other ? S.players.indexOf(other) : -1;
    p.cash += n; if (other) other.cash -= n;
    log(p.name + ' · ' + why + ' ' + signed(n) + (other ? ' (' + other.name + (n > 0 ? '에게서)' : '에게)') : ''));
    var pw = seatEl(i) && seatEl(i).querySelector('.wallet'), ow = j >= 0 ? seatEl(j) && seatEl(j).querySelector('.wallet') : $('bank');
    pend[i]++; if (j >= 0) pend[j]++;
    render();
    return flyBills(n > 0 ? ow : pw, n > 0 ? pw : ow, n).then(function () {
      pend[i]--; if (j >= 0) pend[j]--;
      updateSeat(i, true); if (j >= 0) updateSeat(j, true);
    });
  }

  // ---------- 화면 ----------
  function cur() { return S.players[S.turn]; }
  function render() {
    placeTokens(); setAutoBtn();
    var t = $('turn'), btn = $('btnSpin');
    if (!S || S.phase !== 'play') {
      t.innerHTML = '<span class="who"><span class="nm">머니로드</span><span class="sm">' + (S && S.phase === 'end' ? '게임 끝!' : '새 게임') + '</span></span>';
      btn.disabled = true; btn.querySelector('b').textContent = '누르기';
    } else {
      var p = cur();
      t.innerHTML = '<span class="who" style="--pc:' + p.color + '"><span class="nm">' + esc(p.name) + '</span><span class="sm">' + (p.ai ? 'PC 차례' : S.auto ? '자동 진행' : '차례예요') + '</span></span>';
      btn.disabled = busy || isAI(p);
      btn.querySelector('b').textContent = p.ai ? 'PC' : S.auto ? '자동' : '누르기';
    }
    if (S) S.players.forEach(function (_, i) { updateSeat(i, true); });
    $('log').innerHTML = S ? S.log.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('') : '';
  }
  function log(s) { S.log.unshift(s); if (S.log.length > 40) S.log.length = 40; }

  var toastT = 0;
  function toast(html, ms) {
    var el = $('toast');
    el.innerHTML = html; el.classList.add('show');
    clearTimeout(toastT);
    toastT = setTimeout(function () { el.classList.remove('show'); }, ms || 1300);
    return sleep(reduced() ? 600 : (ms || 1300) - 300);
  }

  // ---------- 창 ----------
  var modalOpen = false;
  var actor = null; // 지금 결정을 내리는 사람 (PC 면 자동)
  function isAI(q) { return !!(q && (q.ai || (S && S.auto))); }
  function isAuto() { return !!(S && S.phase === 'play' && actor && isAI(actor)); }
  function later(ms, fn) { setTimeout(fn, reduced() ? Math.min(ms, 250) : ms); }
  function autoModal(opts) {
    var box = $('mBody'), bx = $('mBtns');
    function click(el) { if (el && document.body.contains(el) && !el.disabled) el.click(); }
    var sp = box.querySelector('[data-spin]');
    if (opts.noAuto) return;
    if (sp) { later(800, function () { click(sp); }); return; }
    var cards = box.querySelectorAll('.cback');
    if (cards.length) { later(1000, function () { click(cards[Math.floor(Math.random() * cards.length)]); }); return; }
    later(opts.buttons && opts.buttons.length > 1 ? 1100 : 1400, function () {
      var btns = bx.querySelectorAll('.btn'), v = opts.ai ? opts.ai() : null, target = null;
      (opts.buttons || []).forEach(function (b, k) { if (v !== null && b.value === v) target = btns[k]; });
      click(target || bx.querySelector('.pri') || btns[btns.length - 1]);
    });
  }
  function modal(opts) {
    return new Promise(function (resolve) {
      var m = $('modal');
      $('mTitle').textContent = opts.title || '';
      $('mBody').innerHTML = opts.body || '';
      var bx = $('mBtns'); bx.innerHTML = '';
      function addBtn(b) {
        var el = document.createElement('button');
        el.type = 'button'; el.className = 'btn' + (b.pri ? ' pri' : ''); el.textContent = b.label;
        el.addEventListener('click', function () { done(b.value); });
        bx.appendChild(el); bx.hidden = false;
        return el;
      }
      bx.hidden = true;
      (opts.buttons || []).forEach(addBtn);
      var closed = false;
      function done(v) { if (closed) return; closed = true; m.hidden = true; modalOpen = false; resolve(v); }
      m.hidden = false; modalOpen = true;
      $('modal').querySelector('.sheet').scrollTop = 0;
      if (opts.onOpen) opts.onOpen($('mBody'), done, addBtn);
      if (isAuto()) autoModal(opts);
      var f = bx.querySelector('.pri') || $('mBody').querySelector('button, input');
      if (f) setTimeout(function () { try { f.focus({ preventScroll: true }); } catch (e) {} }, 30);
    });
  }
  function ok(title, body, label) { return modal({ title: title, body: body, buttons: [{ label: label || '확인', value: 1, pri: true }] }); }

  // ---------- 룰렛 ----------
  function spinTo(numEl, n) {
    if (reduced()) { numEl.textContent = n; beep(1200, .08); return sleep(250).then(function () { return n; }); }
    return new Promise(function (resolve) {
      var steps = 11 + Math.floor(Math.random() * 3), k = 0, last = 0;
      rollStart();
      (function tick() {
        k++;
        if (k >= steps) { numEl.textContent = n; rollDone(); setTimeout(function () { resolve(n); }, 160); return; }
        var v; do { v = roll(); } while (v === last); last = v;
        numEl.textContent = v; rollTick(k);
        setTimeout(tick, 26 + k * k * .55);
      })();
    });
  }
  var MINI = '<div class="mini"><div class="disp"><span class="disp-ghost" aria-hidden="true">88</span><span class="disp-num" data-num>-</span></div><button type="button" class="spin" data-spin>누르기</button></div>';
  function spinModal(title, body, label) {
    return modal({
      title: title,
      body: body + MINI.replace('누르기', label || '누르기'),
      onOpen: function (box, done) {
        var b = box.querySelector('[data-spin]');
        b.addEventListener('click', function () {
          b.disabled = true;
          spinTo(box.querySelector('[data-num]'), roll()).then(function (n) { setTimeout(function () { done(n); }, 450); });
        });
      }
    });
  }

  // ---------- 직업 카드 ----------
  function cardBack() {
    return '<span class="jc-face jc-back"><span class="jb-pat" aria-hidden="true">💼 🍳 🚀 ⚾ 🩺 📚 🎬 🌾 🚒 💻 💼 🍳 🚀 ⚾ 🩺 📚</span><span class="jb-band">직업 카드</span><span class="jb-coin">₩</span></span>';
  }
  function cardFront(j, curStage) {
    return '<span class="jc-face jc-front" style="--jc:' + j.col + '">' +
      '<span class="jf-title">' + j.n + '의 길</span>' +
      '<span class="jf-body"><span class="jf-pic"><span>' + j.ic + '</span></span><span class="jf-st">' +
      j.st.map(function (s, k) {
        return (k ? '<span class="jf-up">레벨 ' + j.lp[k - 1] + ' 더 ▼</span>' : '') +
          '<span class="jf-s s' + (k + 1) + (curStage === k + 1 ? ' cur' : '') + '"><b>L' + (k + 1) + ' ' + s[0] + '</b><small>월급 ' + payText(s[1]) + ' · 세금 ' + num(s[2]) + '</small></span>';
      }).join('') + '</span></span></span>';
  }
  // 고른 카드가 가운데로 날아와 '촥' 열린다
  function revealCard(fromRect, front, buttons, back, tall) {
    return new Promise(function (resolve) {
      var fx = document.createElement('div');
      fx.className = 'cardfx' + (tall ? ' tall' : '');
      fx.innerHTML = '<div class="jc-rays"></div><div class="jc-pos"><div class="jc-in">' + (back || cardBack()) + front + '</div><span class="jc-flash"></span></div><div class="jc-btns"></div>';
      document.body.appendChild(fx);
      modalOpen = true;
      var pos = fx.querySelector('.jc-pos'), inn = fx.querySelector('.jc-in'), rays = fx.querySelector('.jc-rays'), flash = fx.querySelector('.jc-flash'), bx = fx.querySelector('.jc-btns');
      function showBtns() {
        buttons.forEach(function (b) {
          var el = document.createElement('button');
          el.type = 'button'; el.className = 'btn' + (b.pri ? ' pri' : ''); el.textContent = b.label;
          el.addEventListener('click', function () {
            fx.classList.add('out');
            setTimeout(function () { fx.remove(); modalOpen = false; resolve(b.value); }, reduced() ? 0 : 220);
          });
          bx.appendChild(el);
        });
        bx.classList.add('show');
        var f = bx.querySelector('.pri') || bx.querySelector('button'); if (f) f.focus({ preventScroll: true });
        if (isAuto()) later(1400, function () {
          var k = -1; buttons.forEach(function (b, i) { if (b.ai) k = i; });
          var all = bx.querySelectorAll('.btn'); var el = k >= 0 ? all[k] : f; if (el && document.body.contains(el)) el.click();
        });
      }
      if (reduced()) { inn.style.transform = 'rotateY(180deg)'; rays.classList.add('on'); showBtns(); return; }
      var r = pos.getBoundingClientRect(), from = fromRect || { left: r.left, top: r.top + 200, width: r.width * .4, height: r.height * .4 };
      var dx = from.left + from.width / 2 - (r.left + r.width / 2), dy = from.top + from.height / 2 - (r.top + r.height / 2), sc = from.width / r.width;
      whoosh();
      pos.animate([
        { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(' + sc + ') rotate(-6deg)' },
        { transform: 'translate(0,0) scale(1.12) rotate(0deg)' }
      ], { duration: 460, easing: 'cubic-bezier(.2,.8,.25,1)', fill: 'forwards' }).onfinish = function () {
        setTimeout(function () {
          whoosh(); beep(1760, .12, 'triangle', .06);
          rays.classList.add('on'); flash.classList.add('on');
          inn.animate([{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(180deg)' }], { duration: 420, easing: 'cubic-bezier(.3,1.4,.5,1)', fill: 'forwards' });
          pos.animate([{ transform: 'scale(1.12)' }, { transform: 'scale(1.22)', offset: .4 }, { transform: 'scale(1)' }], { duration: 520, easing: 'ease-out', fill: 'forwards' })
            .onfinish = function () { jingle(true); showBtns(); };
        }, 120);
      };
    });
  }
  // 엎어 둔 카드 4장 중 하나 고르기 → 열기
  async function drawJobCard(p, title, msg, keepBtn) {
    var taken = S.players.map(function (q) { return q.job; });
    var pool = shuffle(JOBS.filter(function (j) { return taken.indexOf(j.id) < 0; })).slice(0, 4);
    var rectOf = null;
    var v = await modal({
      title: title,
      body: '<p>' + msg + '</p><div class="deck">' + pool.map(function (_, k) {
        return '<button type="button" class="cback" data-i="' + k + '" aria-label="' + (k + 1) + '번 카드">' + cardBack() + '</button>';
      }).join('') + '</div><p class="note">엎어 둔 카드 중 하나를 눌러요. 무슨 직업이 나올까요?</p>',
      onOpen: function (box, done) {
        box.querySelectorAll('.cback').forEach(function (el) {
          el.addEventListener('click', function () { rectOf = el.getBoundingClientRect(); el.style.visibility = 'hidden'; done(+el.dataset.i); });
        });
      }
    });
    var j = pool[v || 0];
    var curJ = jobOf(p), better = !curJ || (j.lp[0] + j.lp[1] <= curJ.lp[0] + curJ.lp[1] && Math.random() < .7);
    var btns = keepBtn ? [{ label: '지금 직업 그대로', value: 0, ai: !better }, { label: '이 직업으로!', value: 1, pri: true, ai: better }] : [{ label: '좋아요!', value: 1, pri: true }];
    var take = await revealCard(rectOf, cardFront(j), btns);
    if (take) {
      var before = jobOf(p);
      p.job = j.id;
      log(p.name + ' · ' + (before ? '이직 ' + before.n + ' → ' : '직업 ') + j.n + '의 길 (L' + stage(p) + ' ' + stageInfo(p)[0] + ')');
    } else log(p.name + ' · 직업 그대로');
    render();
  }
  function viewCard(p, el) {
    var j = jobOf(p);
    if (!j) { toast('🎒 아직 학생이에요<br><span class="plus">STOP 직업 카드 칸에서 뽑아요</span>', 1600); return; }
    revealCard(el.getBoundingClientRect(), cardFront(j, stage(p)), [{ label: '닫기', value: 0, pri: true }]);
  }

  // ---------- 레벨 ----------
  async function levelUp(p, n, why) {
    var s0 = stage(p), i = S.players.indexOf(p);
    p.level += n;
    log(p.name + ' · ' + why + ' 레벨업 카드 +' + n + ' (Lv ' + p.level + ')');
    lvPend[i] = (lvPend[i] || 0) + 1;
    render();
    var list = []; for (var k = 0; k < n; k++) list.push('lv');
    await flyThings($('bank'), seatEl(i) && seatEl(i).querySelector('.lvcards'), list);
    lvPend[i]--; updateSeat(i);
    var s1 = stage(p);
    if (s1 > s0) {
      var j = jobOf(p);
      log(p.name + ' · 승진! L' + s1 + ' ' + j.st[s1 - 1][0]);
      jingle(true);
      await revealCard(null, cardFront(j, s1), [{ label: '승진 축하해요!', value: 1, pri: true }]);
    }
  }
  function addPass(p, kind) { if (p.pass < MAX_PASS) { p.pass++; p.crew = (p.crew || crewOf(p).slice(1)); p.crew.push(kind); return true; } return false; }
  function others(p) { return S.players.filter(function (q) { return q !== p; }); }

  // ---------- 움직이기 ----------
  async function payday(p) {
    var pay = payOf(p), si = stageInfo(p), amt;
    if (typeof pay === 'object') {
      var n = await spinModal('💰 월급날 · 룰렛 월급', '<p><b>L' + stage(p) + ' ' + esc(si[0]) + '</b>는 룰렛 숫자 × ' + num(pay.spin) + '원을 받아요.</p>');
      amt = n * pay.spin;
    } else amt = pay;
    money(p, amt, si ? '월급날' : '용돈날');
    beep(990, .1, 'triangle', .07);
    await toast('💰 ' + (si ? '월급날' : '용돈날') + '<br><span class="plus">' + signed(amt) + '</span>', 1100);
  }
  async function move(p, n) {
    var dir = n < 0 ? -1 : 1, left = Math.abs(n);
    for (var k = 0; k < left; k++) {
      if (dir > 0 && p.pos >= LAST) break;
      if (dir < 0 && p.pos <= 0) break;
      p.pos += dir;
      placeTokens(); beep(dir > 0 ? 520 : 380, .05, 'triangle', .06);
      await sleep(reduced() ? 60 : 250);
      var t = TILES[p.pos];
      if (dir > 0 && t.type === 'pay' && p.pos !== p.lastPay) { p.lastPay = p.pos; flashTile(p.pos); await payday(p); }
      if (dir > 0 && /^stop|finish/.test(t.type) && k < left - 1) {
        flashTile(p.pos);
        await toast('✋ STOP! 여기서 멈춰요', 1000);
        break;
      }
    }
  }

  async function land(p, depth) {
    var t = TILES[p.pos], o = others(p);
    flashTile(p.pos);
    switch (t.type) {
      case 'spend':
        await moneyScene([{ from: p, to: null, amt: t.amt }], { ic: t.ic, title: t.name, sub: esc(p.name) + ', 돈을 내야 해요!' }); break;
      case 'earn':
        money(p, t.amt, t.name); jingle(true);
        await toast(t.ic + ' ' + esc(t.name) + '<br><span class="plus">' + signed(t.amt) + '</span>'); break;
      case 'lv1': case 'lv2': {
        var n = t.type === 'lv1' ? 1 : 2;
        jingle(true);
        await toast('⭐ 레벨 +' + n + '<br><span class="plus">Lv ' + (p.level + n) + '</span>', 1000);
        await levelUp(p, n, '레벨업 칸');
        break;
      }
      case 'pay': break;
      case 'chance': await chance(p, depth); break;
      case 'stopJob':
        if (!p.job) await drawJobCard(p, '✋ STOP · 직업 카드 뽑기', esc(p.name) + ', 학교를 마쳤어요! 앞으로 걸어갈 길을 뽑아요.');
        break;
      case 'job':
        await drawJobCard(p, '💼 이직 기회', '새 직업 카드를 뽑아 보고, 마음에 들면 바꿔요. 레벨은 그대로예요.', true);
        break;
      case 'again': {
        var lead = o.filter(function (q) { return !q.done; }).every(function (q) { return p.pos > q.pos; });
        if (lead || S.players.length < 2) { await ok('🔁 한 번 더?', '<p>선두는 그냥 지나가요. 1등은 외로워요!</p>'); break; }
        var r = await spinModal('🔁 한 번 더!', '<p>선두가 아니니까 룰렛을 한 번 더 눌러요.</p>');
        log(p.name + ' · 한 번 더 ' + r);
        await move(p, r);
        if ((depth || 0) < 2) await land(p, (depth || 0) + 1);
        break;
      }
      case 'contest': await contest(p, t); break;
      case 'bonus': break;
      case 'lotto': {
        var buy = await modal({
          title: '🎫 복권 가게',
          body: '<p>복권 한 장에 <b>2,000원</b>. 사 볼까요?</p><p class="note">9 → 1등 100,000원 · 7~8 → 2등 30,000원 · 5~6 → 3등 8,000원 · 1~4 → 꽝</p>',
          buttons: [{ label: '안 사요', value: 0 }, { label: '살래요', value: 1, pri: true }],
          ai: function () { return p.cash >= 15000 && Math.random() < .6 ? 1 : 0; }
        });
        if (!buy) { log(p.name + ' · 복권 안 삼'); break; }
        await moneyScene([{ from: p, to: null, amt: 2000 }], { ic: '🎫', title: '복권 한 장', sub: esc(p.name) + ', 복권을 샀어요', why: '복권 구입' });
        var l = await spinModal('🎫 복권 추첨', '<p>룰렛을 눌러 추첨해요!</p>', '추첨');
        var prize = l === 9 ? 100000 : l >= 7 ? 30000 : l >= 5 ? 8000 : 0;
        var rank = l === 9 ? '1등' : l >= 7 ? '2등' : l >= 5 ? '3등' : '';
        if (prize) { money(p, prize, '복권 ' + rank); jingle(true); await ok('🎉 복권 ' + rank + ' 당첨!', '<span class="big plus">' + signed(prize) + '</span>'); }
        else { log(p.name + ' · 복권 꽝'); jingle(false); await ok('꽝…', '<p>숫자 ' + l + '. 다음 기회에!</p>'); }
        break;
      }
      case 'invest': {
        if ((p.assets || []).length) {
          var sb = [{ label: '안 팔아요', value: 0 }].concat(p.assets.map(function (id, k) { var a = assetOf(id); return { label: a.ic + ' ' + a.n.replace(' 100주', '') + ' 팔기', value: k + 1, pri: k === 0 }; }));
          var which = await modal({
            title: '📈 투자 칸 · 팔까요?',
            body: '<p>가진 주식 · 부동산 하나를 룰렛 값으로 팔 수 있어요.</p>' + p.assets.map(function (id) { var a = assetOf(id); return '<p class="note">' + a.ic + ' <b>' + esc(a.n) + '</b> — ' + sellRanges(a).join(' · ') + '</p>'; }).join(''),
            buttons: sb,
            ai: function () { return Math.random() < .55 ? 1 : 0; }
          });
          if (which) {
            var a = assetOf(p.assets[which - 1]);
            var sr = await spinModal('📈 ' + a.n + ' 팔기', '<p class="note">' + sellRanges(a).join(' · ') + '</p>');
            var val = sellValue(a, sr);
            p.assets.splice(which - 1, 1);
            money(p, val, a.n + ' 판매 (룰렛 ' + sr + ')'); jingle(val >= a.price);
            await ok(a.ic + ' ' + a.n + ' 팔았어요', '<p>룰렛 ' + sr + '</p><span class="big plus">' + signed(val) + '</span>');
            break;
          }
          log(p.name + ' · 팔지 않음');
          break;
        }
        var opts = [{ label: '안 해요', value: 0 }];
        if (p.cash >= 10000) opts.push({ label: '1만 원', value: 10000, pri: p.cash < 20000 });
        if (p.cash >= 20000) opts.push({ label: '2만 원', value: 20000, pri: true });
        var inv = await modal({
          title: '📈 투자 기회',
          body: '<p>돈을 넣고 룰렛을 눌러요.</p><p class="note">1~4 → 다 잃음 · 5~7 → 2배 · 8~9 → 3배</p>' + (p.cash < 10000 ? '<p>가진 돈이 1만 원보다 적어 투자할 수 없어요.</p>' : ''),
          buttons: opts,
          ai: function () { return p.cash >= 30000 && Math.random() < .5 ? 10000 : 0; }
        });
        if (!inv) { log(p.name + ' · 투자 안 함'); break; }
        var rr = await spinModal('📈 투자 결과', '<p>' + won(inv) + '을 넣었어요. 두근두근…</p>');
        var mult = rr <= 4 ? 0 : rr <= 7 ? 2 : 3, gain = inv * mult - inv;
        if (gain > 0) money(p, gain, '투자 ' + rr + ' (' + mult + '배)');
        else await moneyScene([{ from: p, to: null, amt: -gain }], { ic: '📉', title: '투자 실패…', sub: '룰렛 ' + rr + ' — 넣은 돈을 다 잃었어요', why: '투자 ' + rr + ' (손해)' });
        jingle(gain > 0);
        await ok(mult ? '📈 ' + mult + '배!' : '📉 다 잃었어요', '<span class="big ' + (gain > 0 ? 'plus' : 'minus') + '">' + signed(gain) + '</span>');
        break;
      }
      case 'stopTax': {
        var si = stageInfo(p), tax = si ? si[2] : 0;
        var est = (p.assets || []).map(assetOf).filter(function (a) { return a.tax; });
        var etax = est.reduce(function (s2, a) { return s2 + a.tax; }, 0);
        if (!(tax + etax)) log(p.name + ' · 세금 없음');
        await ok('✋ STOP · 세금 내는 날', '<p>' + (si ? '<b>L' + stage(p) + ' ' + esc(si[0]) + '</b>의 세금 ' + won(tax) + '. 높이 올라갈수록 세금도 커져요.' : '아직 학생이라 직업 세금이 없어요.') + '</p>' +
          (est.length ? '<p class="note">부동산 세금: ' + est.map(function (a) { return a.ic + ' ' + esc(a.n) + ' ' + won(a.tax); }).join(' · ') + '</p>' : '') +
          '<span class="big minus">' + signed(-(tax + etax)) + '</span>');
        await moneyScene([{ from: p, to: null, amt: tax + etax }], { ic: '🧾', title: '세금 내는 날', sub: esc(p.name) + '의 세금', why: '세금 (L' + stage(p) + (etax ? ' + 부동산' : '') + ')' });
        break;
      }
      case 'stopWed': {
        if (!p.married) {
          p.married = true; addPass(p, 'spouse');
          render(); jingle(true);
          await ok('💍 STOP · 결혼해요!', '<p>배우자가 차에 탔어요 (👪 +1).<br>모두가 5,000원씩 축의금을 줘요.</p>');
          await moneyScene(o.map(function (q) { return { from: q, to: p, amt: 5000 }; }), { ic: '💍', title: '결혼 축의금!', sub: '모두 ' + esc(p.name) + '에게 축의금을 줘요' });
        } else {
          await moneyScene([{ from: p, to: null, amt: 5000 }], { ic: '💍', title: '결혼기념일 여행', sub: esc(p.name) + ', 기념일 여행을 다녀왔어요' });
        }
        break;
      }
      case 'baby': {
        var added = addPass(p, p.married ? 'baby' : 'pet');
        if (p.married) {
          if (added) log(p.name + ' · 아기 탄생 👪 +1');
          render();
          await ok('👶 아기가 태어났어요!', '<p>' + (added ? '차에 한 명 더 탔어요 (👪 +1).' : '차가 꽉 찼어요!') + '<br>모두가 2,000원씩 축하금을 줘요.</p>');
          await moneyScene(o.map(function (q) { return { from: q, to: p, amt: 2000 }; }), { ic: '👶', title: '아기 축하금!', sub: '모두 ' + esc(p.name) + '에게 축하금을 줘요' });
        } else {
          if (added) log(p.name + ' · 반려동물 입양 👪 +1');
          render();
          await ok('🐕 반려동물 입양', '<p>' + (added ? '귀여운 친구가 차에 탔어요 (👪 +1).' : '차가 꽉 찼어요!') + '</p>');
        }
        break;
      }
      case 'finish': {
        p.done = true; p.rank = ++S.finished;
        var fb = FINISH_BONUS[p.rank - 1] || 0;
        placeTokens();
        if (fb) money(p, fb, p.rank + '등 은퇴 보너스'); else log(p.name + ' · 은퇴');
        jingle(true);
        await ok('🏁 ' + esc(p.name) + ' 은퇴!', '<p>' + p.rank + '번째로 도착해 P' + p.rank + ' 자리에 주차했어요.</p>' + (fb ? '<span class="big plus">은퇴 보너스 ' + signed(fb) + '</span>' : ''));
        break;
      }
    }
    render();
  }

  // 모두 참가 대회: 차례로 룰렛, 가장 큰 숫자가 상금
  async function contest(p, t) {
    var order = S.players.slice(S.turn).concat(S.players.slice(0, S.turn)), res = [];
    await modal({
      title: t.ic + ' ' + t.name + ' — 모두 참가!', noAuto: true,
      body: '<p>차례로 룰렛을 눌러 가장 큰 숫자가 나온 사람이 <b>' + won(CONTEST_PRIZE) + '</b>을 받아요. (같으면 나눠 가져요)</p>' +
        '<ol class="ct">' + order.map(function (q, k) { return '<li data-k="' + k + '">' + carSvg(q.color, crewOf(q)) + '<span class="nm">' + esc(q.name) + '</span><b>–</b></li>'; }).join('') + '</ol>' + MINI,
      onOpen: function (box, done, addBtn) {
        var b = box.querySelector('[data-spin]'), k = 0, rows = box.querySelectorAll('.ct li');
        function lab() { b.textContent = order[k].name.slice(0, 5); rows.forEach(function (r, i) { r.classList.toggle('on', i === k); }); if (isAI(order[k])) later(800, function () { if (!b.disabled) b.click(); }); }
        lab();
        b.addEventListener('click', function () {
          b.disabled = true;
          spinTo(box.querySelector('[data-num]'), roll()).then(function (n) {
            res[k] = n; rows[k].querySelector('b').textContent = n;
            k++;
            if (k < order.length) { b.disabled = false; lab(); return; }
            var max = Math.max.apply(null, res);
            rows.forEach(function (r, i) { r.classList.toggle('on', res[i] === max); r.classList.toggle('win', res[i] === max); });
            box.querySelector('.mini').remove();
            var okb = addBtn({ label: '확인', value: 1, pri: true }); okb.focus();
            if (isAuto()) later(1500, function () { okb.click(); });
          });
        });
      }
    });
    var max = Math.max.apply(null, res), wins = order.filter(function (_, i) { return res[i] === max; });
    var each = Math.floor(CONTEST_PRIZE / wins.length / 1000) * 1000;
    wins.forEach(function (q) { money(q, each, t.name + ' 우승'); });
    jingle(true);
    await toast('🏆 ' + wins.map(function (q) { return esc(q.name); }).join(', ') + '<br><span class="plus">' + signed(each) + '</span>', 1500);
  }

  function chanceBack() { return '<span class="jc-face jc-back cb"><span class="jb-pat" aria-hidden="true">? ? ? ? ? ? ? ? ? ? ? ? ? ? ? ?</span><span class="jb-band">찬스 카드</span><span class="jb-coin">?</span></span>'; }
  function tileRect(i) { var el = document.querySelector('.tl[data-i="' + i + '"]'); return el ? el.getBoundingClientRect() : null; }
  function jobNames(ids) { return ids.map(function (id) { for (var k = 0; k < JOBS.length; k++) if (JOBS[k].id === id) return JOBS[k].n; return ''; }).join(' · '); }
  async function pickChance(p) {
    var rectOf = null;
    beep(880, .1, 'triangle', .07);
    await modal({
      title: '❓ 찬스 카드를 뽑아요',
      body: '<p>' + esc(p.name) + ', 엎어 둔 카드 중 한 장을 골라 뒤집어요.</p><div class="deck tall">' + [0, 1, 2].map(function (k) {
        return '<button type="button" class="cback" data-i="' + k + '" aria-label="' + (k + 1) + '번 카드">' + chanceBack() + '</button>';
      }).join('') + '</div>',
      onOpen: function (box, done) {
        box.querySelectorAll('.cback').forEach(function (el) {
          el.addEventListener('click', function () { rectOf = el.getBoundingClientRect(); el.style.visibility = 'hidden'; done(+el.dataset.i); });
        });
      }
    });
    return rectOf || tileRect(p.pos);
  }
  function sellChips(a) {
    var lo = 1;
    return a.sell.map(function (r) { var t = '<span><small>' + (lo === r[0] ? lo : lo + '~' + r[0]) + '</small><b>' + short(r[1]) + '</b></span>'; lo = r[0] + 1; return t; }).join('');
  }
  async function assetCard(p, a, rect) {
    var can = p.cash >= a.price;
    var front = '<span class="jc-face jc-front ac" style="--jc:' + a.col + '">' +
      '<span class="ac-hd">' + (a.kind === '주식' ? '📈' : '🏠') + ' ' + a.kind + ' 카드</span>' +
      '<span class="ac-pic"><span>' + a.ic + '</span><b>' + esc(a.n) + '</b></span>' +
      '<span class="ac-rows"><span><em>사는 값</em><b>' + won(a.price) + '</b></span>' + (a.tax ? '<span><em>세금 날 세금</em><b>' + won(a.tax) + '</b></span>' : '') +
      '<span><em>게임 끝 값</em><b>' + won(a.end) + '</b></span></span>' +
      '<span class="ac-sell"><em>팔 때 · 투자 칸 룰렛</em><span class="ac-chips">' + sellChips(a) + '</span></span></span>';
    var buy = Math.random() < .75 && p.cash >= a.price + 15000;
    var v = await revealCard(rect, front, can
      ? [{ label: '안 사요', value: 0, ai: !buy }, { label: '사요 ' + signed(-a.price), value: 1, pri: true, ai: buy }]
      : [{ label: '돈이 모자라요', value: 0, pri: true }], chanceBack(), true);
    if (v) { p.assets.push(a.id); money(p, -a.price, a.n + ' 구입'); jingle(true); }
    else log(p.name + ' · ' + a.n + ' 안 삼');
    render();
  }
  async function chance(p, depth) {
    var free = ASSETS.filter(function (a) { return !S.players.some(function (q) { return (q.assets || []).indexOf(a.id) >= 0; }); });
    var rect = await pickChance(p);
    if (free.length && Math.random() < .3) return assetCard(p, pick(free), rect);
    var c;
    do { c = pick(CHANCE); } while ((c.job && !p.job) || (c.all && S.players.length < 2));
    var salAmt = 0;
    if (c.sal) { var pay = payOf(p); salAmt = typeof pay === 'object' ? pay.spin * 5 : pay; }
    var hit = c.bj && p.job && c.bj.indexOf(p.job) >= 0;
    var amt = c.m || salAmt;
    var allTxt = c.all ? '<span class="cc-amt ' + (c.all > 0 ? 'plus' : 'minus') + '">모두 ' + (c.all > 0 ? '→ 나 ' : '← 나 ') + won(Math.abs(c.all)) + '씩</span>' : '';
    var extra = c.lv ? '<span class="cc-amt lv"><i class="lvmini">LEVEL UP</i> +' + c.lv + '</span>' : c.mv ? '<span class="cc-amt mv">' + (c.mv > 0 ? '앞으로 ' : '뒤로 ') + Math.abs(c.mv) + '칸</span>' : '';
    var front = '<span class="jc-face jc-front cc"><span class="cc-hd"><i>?</i>찬스 카드<i>?</i></span>' +
      '<span class="cc-pic"><span>' + c.ic + '</span></span><span class="cc-t">' + esc(c.t) + '</span>' +
      (amt ? '<span class="cc-amt ' + (amt > 0 ? 'plus' : 'minus') + '">' + signed(amt) + '</span>' : '') + extra + allTxt +
      '<span class="cc-sp"></span>' +
      (c.bj ? '<span class="cc-bonus' + (hit ? ' hit' : '') + '">추가 보너스 · ' + jobNames(c.bj) + '이면 <i class="lvmini">LEVEL UP</i> 카드 ' + c.blv + '장' + (hit ? ' ✔' : '') + '</span>' : '') +
      '<span class="cc-foot">MONEY ROAD</span></span>';
    await revealCard(rect, front, [{ label: '확인', value: 1, pri: true }], chanceBack(), true);
    if (c.m > 0) { money(p, c.m, '찬스'); jingle(true); }
    if (c.m < 0) await moneyScene([{ from: p, to: null, amt: -c.m }], { ic: c.ic, title: '찬스 · 돈을 내요', sub: esc(c.t) });
    if (c.lv) { jingle(true); await levelUp(p, c.lv, '찬스'); }
    if (hit) { jingle(true); await levelUp(p, c.blv, '찬스 직업 보너스'); }
    if (c.sal) { money(p, salAmt, '찬스 보너스 월급'); jingle(true); }
    if (c.all > 0) await moneyScene(others(p).map(function (q) { return { from: q, to: p, amt: c.all }; }), { ic: c.ic, title: '모두가 ' + p.name + '에게!', sub: esc(c.t), why: '찬스' });
    if (c.all < 0) await moneyScene(others(p).map(function (q) { return { from: p, to: q, amt: -c.all }; }), { ic: c.ic, title: p.name + '이(가) 모두에게!', sub: esc(c.t), why: '찬스' });
    if (c.job) await drawJobCard(p, '🤝 스카우트 제의', '새 직업 카드를 뽑아 보고, 마음에 들면 바꿔요.', true);
    if (c.mv) {
      log(p.name + ' · 찬스 ' + (c.mv > 0 ? '앞으로 ' : '뒤로 ') + Math.abs(c.mv) + '칸');
      await move(p, c.mv);
      if ((depth || 0) < 2) await land(p, (depth || 0) + 1);
    }
  }

  // ---------- 돈 주고받는 장면 ----------
  // list = [{ from: 사람|null(은행), to: 사람|null(은행), amt }], o = { ic, title, sub, why }
  function chip(q) { return q ? '<span class="ms-chip" style="--pc:' + q.color + '">' + esc(q.name) + '</span>' : '<span class="ms-chip bank">🏦 은행</span>'; }
  function moneyScene(list, o) {
    list = list.filter(function (t) { return t.amt > 0; });
    if (!list.length) return Promise.resolve();
    var froms = [], tos = [];
    list.forEach(function (t) { if (froms.indexOf(t.from) < 0) froms.push(t.from); if (tos.indexOf(t.to) < 0) tos.push(t.to); });
    var same = list.every(function (t) { return t.amt === list[0].amt; });
    var flow = froms.map(chip).join('') + '<span class="ms-arrow">➜</span>' + tos.map(chip).join('');
    var amtTxt = won(list[0].amt) + (same && list.length > 1 ? '씩' : '');
    var fx = document.createElement('div');
    fx.className = 'mscene';
    fx.innerHTML = '<div class="ms-card"><span class="ms-ic">' + (o.ic || '💸') + '</span><b class="ms-title">' + esc(o.title) + '</b>' +
      (o.sub ? '<span class="ms-sub">' + o.sub + '</span>' : '') +
      '<span class="ms-flow">' + flow + '</span><span class="ms-amt">' + amtTxt + '</span><span class="ms-total"></span></div>';
    document.body.appendChild(fx);
    var lifted = [];
    froms.concat(tos).forEach(function (q) { if (q) { var el = seatEl(S.players.indexOf(q)); if (el) { el.classList.add('lift'); lifted.push(el); } } });
    beep(392, .14, 'triangle', .07); setTimeout(function () { beep(330, .2, 'triangle', .06); }, 140);
    return (async function () {
      await sleep(reduced() ? 100 : 650);
      for (var k = 0; k < list.length; k++) {
        var t = list[k], fe = t.from ? seatEl(S.players.indexOf(t.from)) : null;
        if (fe) { fe.classList.remove('pay'); void fe.offsetWidth; fe.classList.add('pay'); }
        if (t.to) await money(t.to, t.amt, o.why || o.title, t.from || null);
        else await money(t.from, -t.amt, o.why || o.title);
        await sleep(reduced() ? 0 : 160);
      }
      // 받은 사람 / 낸 사람 합계
      var who = tos.length === 1 && tos[0] ? tos[0] : froms.length === 1 && froms[0] ? froms[0] : null, tot = 0;
      list.forEach(function (t) { if (who && t.to === who) tot += t.amt; else if (who && t.from === who) tot -= t.amt; });
      if (who) { var tt = fx.querySelector('.ms-total'); tt.innerHTML = chip(who) + '<b class="' + (tot >= 0 ? 'plus' : 'minus') + '">' + signed(tot) + '</b>'; tt.classList.add('on'); }
      jingle(tot >= 0 && !!tos[0]);
      await new Promise(function (res) {
        var gone = false;
        function close() { if (gone) return; gone = true; fx.classList.add('out'); lifted.forEach(function (el) { el.classList.remove('lift', 'pay'); }); setTimeout(function () { fx.remove(); res(); }, reduced() ? 0 : 240); }
        fx.addEventListener('click', close);
        setTimeout(close, reduced() ? 300 : 1500);
      });
    })();
  }

  // ---------- 차례 알림: 화면이 어두워지며 '○○ 차례' ----------
  function announce(p) {
    return new Promise(function (resolve) {
      var fx = document.createElement('div'), cname = CAR_NAMES[COLORS.indexOf(p.color)] || '';
      fx.className = 'turnfx'; fx.style.setProperty('--pc', p.color); fx.style.setProperty('--pf', /fcc419|82c91e/.test(p.color) ? '#1f2328' : '#fff');
      fx.innerHTML = '<div class="tf-in"><div class="tf-car">' + carSvg(p.color, crewOf(p)) + '</div><b class="tf-col">' + cname + ' 차례</b>' + (p.name !== cname || p.ai ? '<span class="tf-nm">' + esc(p.name) + (p.ai ? ' 🤖' : '') + '</span>' : '') + '</div>';
      document.body.appendChild(fx);
      beep(660, .09, 'triangle', .06); setTimeout(function () { beep(990, .14, 'triangle', .06); }, 120);
      var gone = false;
      function close() { if (gone) return; gone = true; fx.classList.add('out'); setTimeout(function () { fx.remove(); resolve(); }, reduced() ? 0 : 260); }
      fx.addEventListener('click', close);
      setTimeout(close, reduced() ? 500 : 1300);
    });
  }

  // ---------- 차례 ----------
  var busy = false;
  async function onSpin() {
    if (busy || modalOpen || !S || S.phase !== 'play') return;
    if (this && this.nodeType && isAI(cur())) return; // PC · 자동 차례에는 사람이 누르지 않는다
    busy = true;
    var p = cur(); actor = p;
    render();
    var n = await spinTo($('disp'), roll());
    log(p.name + ' · 룰렛 ' + n);
    await move(p, n);
    await land(p, 0);
    nextTurn();
    await sleep(reduced() ? 0 : 400); // 지폐가 다 도착하게
    if (S.phase === 'play') { render(); await announce(cur()); }
    busy = false; actor = null;
    save(); render();
    if (S.phase === 'end') showResult(); else autoTurn();
  }
  function autoTurn() { if (S && S.phase === 'play' && isAI(cur()) && !busy) later(900, function () { if (S && S.phase === 'play' && isAI(cur()) && !busy && !modalOpen) onSpin(); }); }
  function setAutoBtn() { var b = $('btnAuto'); if (!b) return; var on = !!(S && S.auto); b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); b.textContent = on ? '자동 끄기' : '자동'; }
  function nextTurn() {
    if (S.players.every(function (q) { return q.done; })) { S.phase = 'end'; return; }
    var i = S.turn;
    do { i = (i + 1) % S.players.length; } while (S.players[i].done);
    S.turn = i;
  }

  function assetEnd(p) { return (p.assets || []).reduce(function (s, id) { return s + assetOf(id).end; }, 0); }
  function score(p) { return p.cash + p.level * LEVEL_PT + p.pass * PASS_PT + assetEnd(p); }
  async function showResult() {
    var list = S.players.slice().sort(function (a, b) { return score(b) - score(a); });
    jingle(true);
    var v = await modal({
      title: '🏆 ' + list[0].name + ' 우승!',
      body: '<p class="note">계산: 가진 돈 + 레벨업 카드 × 10,000원 + 동승자 × 5,000원 + 주식 · 부동산(게임 끝 값)</p><ol class="rank">' + list.map(function (p, i) {
        return '<li><span class="no">' + (i + 1) + '</span>' + carSvg(p.color, crewOf(p)) + '<span class="nm">' + esc(p.name) + (p.ai ? ' 🤖' : '') +
          '<small>' + won(p.cash) + ' + Lv ' + p.level + ' + 👪 ' + p.pass + ((p.assets || []).length ? ' + 📄 ' + won(assetEnd(p)) : '') + '</small></span><span class="sum">' + won(score(p)) + '</span></li>';
      }).join('') + '</ol>',
      buttons: [{ label: '판 보기', value: 0 }, { label: '새 게임', value: 1, pri: true }]
    });
    if (v) setup();
  }

  // ---------- 새 게임 ----------
  function slideSeg(seg) {
    var on = seg.querySelector('.on'), ind = seg.querySelector('.seg-ind');
    if (!on || !ind) return;
    if (!on.offsetWidth) { seg.classList.add('no-ind'); return; }
    seg.classList.remove('no-ind');
    ind.style.width = on.offsetWidth + 'px';
    ind.style.transform = 'translateX(' + on.offsetLeft + 'px)';
  }
  async function setup() {
    var prev = S && S.players ? S.players.map(function (p) { return p.name; }) : [];
    var prevHum = S && S.players ? S.players.filter(function (q) { return !q.ai; }).length : 0;
    var count = prevHum || 2, pcs = S && S.players ? Math.max(1, S.players.length - prevHum) : 1;
    var form = await modal({
      title: '새 게임',
      body: '<label class="field"><span>몇 명이 하나요?</span><div class="seg" data-seg="n" role="radiogroup" aria-label="인원"><span class="seg-ind" aria-hidden="true"></span>' +
        [1, 2, 3, 4].map(function (n) { return '<button type="button" role="radio" data-n="' + n + '">' + (n === 1 ? '혼자' : n + '명') + '</button>'; }).join('') + '</div></label>' +
        '<label class="field pc-field"><span>🤖 PC 상대</span><div class="seg" data-seg="pc" role="radiogroup" aria-label="PC 수"><span class="seg-ind" aria-hidden="true"></span>' +
        [1, 2, 3].map(function (n) { return '<button type="button" role="radio" data-n="' + n + '">PC ' + n + '대</button>'; }).join('') + '</div></label>' +
        '<div class="field"><span>이름</span><div class="names">' + [0, 1, 2, 3].map(function (i) {
          return '<div class="name-row" data-row="' + i + '">' + carSvg(COLORS[i], ['me']) + '<input type="text" maxlength="8" aria-label="' + (i + 1) + '번 이름" value="' + esc(prev[i] || CAR_NAMES[i]) + '"></div>';
        }).join('') + '</div></div><p class="note">모두 학생으로 출발해요. 직업은 STOP 칸에서 카드를 뽑아 정해요.</p>',
      buttons: [{ label: '시작하기', value: 1, pri: true }],
      onOpen: function (box) {
        var seg = box.querySelector('[data-seg="n"]'), seg2 = box.querySelector('[data-seg="pc"]');
        function mark(g, n) { g.querySelectorAll('button').forEach(function (b) { var on = +b.dataset.n === n; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); }); slideSeg(g); }
        function set(n) {
          count = n; mark(seg, n);
          box.querySelector('.pc-field').hidden = n !== 1;
          box.querySelectorAll('.name-row').forEach(function (r) { r.hidden = +r.dataset.row >= n; });
          if (n === 1) mark(seg2, pcs);
        }
        seg.querySelectorAll('button').forEach(function (b) { b.addEventListener('click', function () { set(+b.dataset.n); }); });
        seg2.querySelectorAll('button').forEach(function (b) { b.addEventListener('click', function () { pcs = +b.dataset.n; mark(seg2, pcs); }); });
        set(count);
        requestAnimationFrame(function () { slideSeg(seg); slideSeg(seg2); });
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { slideSeg(seg); slideSeg(seg2); });
      }
    });
    if (!form) return;
    var names = [];
    document.querySelectorAll('#mBody .name-row input').forEach(function (inp, i) {
      if (i < count) names.push(inp.value.trim() || (CAR_NAMES[i]));
    });
    var ais = names.map(function () { return false; });
    if (count === 1) for (var q = 1; q <= pcs; q++) { names.push('PC ' + q); ais.push(true); }
    S = { phase: 'play', turn: 0, finished: 0, log: [], players: names.map(function (n, i) {
      return { ai: ais[i], crew: [], assets: [], name: n, color: COLORS[i], job: null, cash: 0, level: 0, pass: 0, married: false, pos: 0, done: false, rank: 0, lastPay: -1 };
    }) };
    $('disp').textContent = '-';
    buildSeats(); render();
    // 출발 자금 — 은행에서 지폐가 날아간다
    busy = true; render();
    log('게임 시작! 출발 자금 ' + won(START_CASH));
    await Promise.all(S.players.map(function (p, i) { return sleep(i * 180).then(function () { return money(p, START_CASH, '출발 자금'); }); }));
    await announce(cur());
    busy = false;
    save(); render(); autoTurn();
  }

  function rules() {
    return ok('머니로드 규칙', '<ol class="rules">' +
      '<li>차례가 되면 <b>전자룰렛</b>을 눌러 나온 숫자(1~9)만큼 앞으로 가요.</li>' +
      '<li>모두 <b>학생</b>으로 출발해요. 월급날에는 용돈 2,000원을 받아요.</li>' +
      '<li><b>STOP 직업 카드</b> 칸에서 엎어 둔 카드를 뽑아 직업(○○의 길)을 정해요.</li>' +
      '<li><b>+1 · +2 레벨업</b>으로 레벨이 쌓이면 L1 → L2 → L3 로 승진해 월급이 커져요. 대신 세금도 커져요.</li>' +
      '<li><b>STOP</b> 칸(직업 · 결혼 · 세금 · 은퇴)은 숫자가 남아도 꼭 멈춰요.</li>' +
      '<li><b>찬스</b> · <b>복권</b> · <b>투자</b> · <b>대회</b>(모두 참가) · <b>한 번 더</b>(선두가 아니면) 칸이 있어요.</li>' +
      '<li>결혼 · 아기 · 반려동물이 생기면 자동차에 <b>동승자</b>가 타요 (최대 5명).</li>' +
      '<li><b>은퇴</b>한 순서대로 주차장 P1~P4 에 차를 세우고 보너스(2만 · 1만 · 5천)를 받아요.</li>' +
      '<li>모두 은퇴하면 <b>가진 돈 + 레벨업 카드 × 1만 + 동승자 × 5천 + 주식 · 부동산</b>으로 계산해 가장 많은 사람이 이겨요.</li>' +
      '<li><b>찬스</b> 덱에는 <b>주식 · 부동산 카드</b>도 섞여 있어요. 사 두면 <b>투자</b> 칸에서 룰렛 값으로 팔 수 있고, 게임이 끝나면 정해진 값으로 계산해요. 부동산은 세금 날에 세금이 붙어요.</li>' +
      '<li><b>혼자</b>여도 PC(🤖)와 할 수 있어요. PC 차례는 저절로 진행돼요.</li>' +
      '<li>자리의 직업 글씨를 누르면 내 직업 카드를 볼 수 있어요.</li>' +
      '</ol>', '알겠어요');
  }

  // ---------- 시작 ----------
  function init() {
    drawBoard();
    setSoundBtn();
    $('btnSpin').addEventListener('click', onSpin);
    $('btnAuto').addEventListener('click', function () {
      if (!S || S.phase !== 'play') return;
      S.auto = !S.auto; setAutoBtn(); save(); render();
      toast(S.auto ? '🤖 자동 모드<br><span class="plus">끝까지 알아서 진행해요</span>' : '✋ 자동 모드 끔', 1200);
      if (S.auto) autoTurn();
    });
    $('btnRules').addEventListener('click', function () { if (!modalOpen) rules(); });
    $('btnNew').addEventListener('click', async function () {
      if (modalOpen || busy) return;
      if (S && S.phase === 'play') {
        var y = await modal({ title: '새 게임', body: '<p>지금 게임을 그만두고 새로 시작할까요?</p>', buttons: [{ label: '아니요', value: 0 }, { label: '새로 시작', value: 1, pri: true }] });
        if (!y) return;
      }
      clearSave(); setup();
    });
    $('btnSound').addEventListener('click', function () {
      sound = !sound; setSoundBtn();
      try { localStorage.setItem(SOUND_KEY, sound ? 'on' : 'off'); } catch (e) {}
      beep(880, .08);
    });
    document.addEventListener('keydown', function (e) {
      if ((e.key === ' ' || e.key === 'Enter') && e.target === document.body) { e.preventDefault(); onSpin(); }
    });
    window.addEventListener('resize', function () { var s = document.querySelector('#mBody .seg'); if (s) slideSeg(s); });

    var saved = load();
    if (saved && saved.phase === 'play') {
      S = saved; buildSeats(); render();
      modal({ title: '이어서 할까요?', body: '<p>하던 게임이 남아 있어요.</p>', buttons: [{ label: '새 게임', value: 0 }, { label: '이어하기', value: 1, pri: true }] })
        .then(function (v) { if (!v) { clearSave(); setup(); } else { busy = true; render(); announce(cur()).then(function () { busy = false; render(); autoTurn(); }); } });
    } else {
      S = null; render();
      rules().then(setup);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
