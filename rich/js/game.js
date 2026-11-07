/* 머니로드 — 전자룰렛으로 움직이는 직업 부자 레이스 (폰 한 대로 2~4명) */
(function () {
  'use strict';

  var COLS = 6;
  var START_CASH = 20000;
  var LEVEL_PAY = 1000;   // 레벨 1 마다 월급 +1,000
  var LEVEL_PT = 10000;   // 마지막 계산: 레벨 1 = 10,000
  var PASS_PT = 5000;     // 마지막 계산: 동승자 1명 = 5,000
  var MAX_PASS = 5;
  var FINISH_BONUS = [20000, 10000, 5000, 0];
  var SAVE_KEY = 'rich-save-v1';
  var SOUND_KEY = 'rich-sound';

  var COLORS = ['#e8413c', '#2f6fed', '#1fa35b', '#8b5cf6'];
  var CAR_NAMES = ['빨강', '파랑', '초록', '보라'];

  var JOBS = [
    { n: '바리스타', ic: '☕', pay: 6000 },
    { n: '소방관', ic: '🚒', pay: 8000 },
    { n: '간호사', ic: '🩺', pay: 9000 },
    { n: '선생님', ic: '📚', pay: 9000 },
    { n: '디자이너', ic: '🎨', pay: 10000 },
    { n: '요리사', ic: '🍳', pay: 10000 },
    { n: '프로그래머', ic: '💻', pay: 12000 },
    { n: '수의사', ic: '🐶', pay: 13000 },
    { n: '조종사', ic: '🛫', pay: 14000 },
    { n: '우주비행사', ic: '🚀', pay: 15000 }
  ];

  var SPEND = [
    ['캠핑 장비 사기', 8000, '⛺'], ['가족 외식', 6000, '🍖'], ['해외 배낭여행', 20000, '🧳'],
    ['스마트폰 바꾸기', 12000, '📱'], ['이사 비용', 15000, '📦'], ['자전거 수리', 3000, '🚲'],
    ['콘서트 관람', 5000, '🎤'], ['자동차 정비', 9000, '🔧'], ['치과 치료', 7000, '🦷'],
    ['피아노 학원', 4000, '🎹'], ['친구 선물', 5000, '🎁']
  ];
  var EARN = [
    ['중고 물건 팔기', 6000, '🏷️'], ['공모전 입상', 15000, '🏆'], ['영상 수익', 10000, '🎬'],
    ['용돈 받기', 3000, '🧧'], ['벼룩시장', 4000, '🛍️'], ['특별 수당', 8000, '💵']
  ];

  var CHANCE = [
    { t: '잃어버린 지갑을 주인에게 찾아줬어요. 사례금을 받아요.', ic: '👛', m: 5000 },
    { t: '가지고 있던 주식이 크게 올랐어요!', ic: '📈', m: 15000 },
    { t: '주식이 떨어졌어요…', ic: '📉', m: -10000 },
    { t: '자격증 시험에 합격했어요! 레벨 +1', ic: '📜', lv: 1 },
    { t: '승진했어요! 레벨 +2', ic: '🎖️', lv: 2 },
    { t: '감기에 걸려 병원에 다녀왔어요.', ic: '🤧', m: -4000 },
    { t: '지름길을 찾았어요! 앞으로 3칸.', ic: '🛣️', mv: 3 },
    { t: '길을 잘못 들었어요. 뒤로 2칸.', ic: '↩️', mv: -2 },
    { t: '오늘은 내 생일! 모두에게 3,000원씩 선물을 받아요.', ic: '🎂', all: 3000 },
    { t: '친구들에게 한턱 냈어요. 모두에게 2,000원씩 줘요.', ic: '🍕', all: -2000 },
    { t: '회사 실적이 좋아 보너스 월급이 나왔어요!', ic: '💰', sal: 1 },
    { t: '과속으로 벌금을 냈어요.', ic: '🚓', m: -5000 },
    { t: '경품 추첨에 당첨됐어요!', ic: '🎉', m: 8000 },
    { t: '노트북이 고장 나서 고쳤어요.', ic: '💻', m: -7000 },
    { t: '스카우트 제의가 왔어요! 직업을 바꿀 수 있어요.', ic: '🤝', job: 1 },
    { t: '봉사활동으로 상을 받았어요! 레벨 +1', ic: '🏅', lv: 1 }
  ];

  // 48칸 — 6칸씩 지그재그
  var PATH = [
    'start', 'earn', 'chance', 'lv1', 'spend', 'pay',
    'bonus', 'spend', 'chance', 'lv1', 'stopWed', 'earn',
    'pay', 'lotto', 'spend', 'invest', 'lv2', 'chance',
    'baby', 'spend', 'pay', 'stopTax', 'earn', 'chance',
    'job', 'lv1', 'spend', 'pay', 'bonus', 'chance',
    'baby', 'invest', 'stopTax', 'pay', 'lv2', 'spend',
    'earn', 'lotto', 'chance', 'pay', 'spend', 'lv1',
    'chance', 'invest', 'pay', 'spend', 'bonus', 'finish'
  ];
  var LAST = PATH.length - 1;
  var TILES = (function () {
    var si = 0, ei = 0;
    return PATH.map(function (t) {
      var o = { type: t };
      if (t === 'spend') o.item = SPEND[si++ % SPEND.length];
      if (t === 'earn') o.item = EARN[ei++ % EARN.length];
      return o;
    });
  })();

  // ---------- 도우미 ----------
  function $(id) { return document.getElementById(id); }
  function won(n) { return (n < 0 ? '−' : '') + Math.abs(n).toLocaleString('ko-KR') + '원'; }
  function signed(n) { return (n >= 0 ? '+' : '−') + Math.abs(n).toLocaleString('ko-KR') + '원'; }
  function short(n) { return n >= 10000 ? (n / 10000) + '만' : (n / 1000) + '천'; }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function roll() { return 1 + Math.floor(Math.random() * 9); }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function reduced() { return window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches; }
  function carSvg(color) {
    return '<svg class="car-ic" viewBox="0 0 24 24" aria-hidden="true">' +
      '<rect class="body" x="5" y="1.5" width="14" height="21" rx="5.5" fill="' + color + '"/>' +
      '<rect class="seat" x="7.3" y="5" width="9.4" height="4.2" rx="1.6" fill="#fff" opacity=".9"/>' +
      '<rect class="seat" x="7.3" y="15.2" width="9.4" height="3" rx="1.3" fill="#fff" opacity=".6"/>' +
      '<rect x="3.5" y="5" width="2" height="4" rx="1" fill="#222"/><rect x="18.5" y="5" width="2" height="4" rx="1" fill="#222"/>' +
      '<rect x="3.5" y="15" width="2" height="4" rx="1" fill="#222"/><rect x="18.5" y="15" width="2" height="4" rx="1" fill="#222"/></svg>';
  }

  // ---------- 저장 ----------
  var S = null; // 게임 상태
  function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) {} }
  function load() { try { var s = JSON.parse(localStorage.getItem(SAVE_KEY)); return s && s.players ? s : null; } catch (e) { return null; } }
  function clearSave() { try { localStorage.removeItem(SAVE_KEY); } catch (e) {} }

  // ---------- 소리 ----------
  var sound = true, ac = null;
  try { sound = localStorage.getItem(SOUND_KEY) !== 'off'; } catch (e) {}
  function beep(f, d, type, vol) {
    if (!sound) return;
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      if (ac.state === 'suspended') ac.resume();
      var o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime;
      o.type = type || 'square'; o.frequency.value = f;
      g.gain.setValueAtTime(vol || .05, t); g.gain.exponentialRampToValueAtTime(.0001, t + (d || .06));
      o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + (d || .06) + .02);
    } catch (e) {}
  }
  function jingle(good) {
    var notes = good ? [660, 880, 1320] : [440, 330, 220];
    notes.forEach(function (f, i) { setTimeout(function () { beep(f, .12, 'triangle', .07); }, i * 110); });
  }
  function setSoundBtn() {
    var b = $('btnSound');
    b.setAttribute('aria-pressed', sound ? 'true' : 'false');
    b.setAttribute('aria-label', sound ? '소리 끄기' : '소리 켜기');
  }

  // ---------- 판 그리기 ----------
  function rc(i) { var r = Math.floor(i / COLS), c = i % COLS; if (r % 2) c = COLS - 1 - c; return { r: r, c: c }; }
  function tileView(t) {
    switch (t.type) {
      case 'start': return { cls: 't-start', ic: '🚩', lb: '출발' };
      case 'finish': return { cls: 't-finish', ic: '🏁', lb: '은퇴' };
      case 'pay': return { cls: 't-pay', ic: '💰', lb: '월급날' };
      case 'lv1': return { cls: 't-lv', ic: '⭐', lb: '+1 레벨' };
      case 'lv2': return { cls: 't-lv', ic: '🌟', lb: '+2 레벨' };
      case 'chance': return { cls: 't-chance', ic: '❓', lb: '찬스' };
      case 'stopTax': return { cls: 't-stop', ic: '✋', lb: 'STOP 세금' };
      case 'stopWed': return { cls: 't-stop', ic: '💍', lb: 'STOP 결혼' };
      case 'bonus': return { cls: 't-bonus', ic: '🎰', lb: '보너스' };
      case 'lotto': return { cls: 't-lotto', ic: '🎫', lb: '복권' };
      case 'invest': return { cls: 't-invest', ic: '📊', lb: '투자' };
      case 'job': return { cls: 't-job', ic: '💼', lb: '이직' };
      case 'baby': return { cls: 't-baby', ic: '👶', lb: '가족 +1' };
      case 'spend': return { cls: 'minus', ic: t.item[2], lb: '−' + short(t.item[1]) };
      case 'earn': return { cls: 'plus', ic: t.item[2], lb: '+' + short(t.item[1]) };
    }
  }
  function tileName(t) {
    if (t.item) return t.item[0] + ' ' + (t.type === 'spend' ? '−' : '+') + t.item[1].toLocaleString('ko-KR') + '원';
    var v = tileView(t); return v.lb;
  }
  function drawBoard() {
    var g = $('grid'), cells = new Array(PATH.length);
    TILES.forEach(function (t, i) {
      var p = rc(i), v = tileView(t), d = document.createElement('div');
      d.className = 'tile ' + v.cls;
      d.style.gridRow = (p.r + 1); d.style.gridColumn = (p.c + 1);
      d.title = tileName(t);
      d.innerHTML = '<span class="no">' + (i || '') + '</span><span class="ic" aria-hidden="true">' + v.ic + '</span><span class="lb">' + v.lb + '</span>';
      cells[i] = d;
    });
    g.innerHTML = '';
    cells.forEach(function (d) { g.appendChild(d); });
  }
  var OFF = [[.05, .04], [.49, .04], [.05, .5], [.49, .5]];
  function placeTokens() {
    var box = $('tokens');
    if (!S) { box.innerHTML = ''; return; }
    if (box.children.length !== S.players.length) {
      box.innerHTML = S.players.map(function (p) { return '<div class="car">' + carSvg(p.color) + '</div>'; }).join('');
    }
    S.players.forEach(function (p, i) {
      var el = box.children[i], q = rc(p.pos);
      el.style.left = ((q.c + OFF[i][0]) / COLS * 100) + '%';
      el.style.top = ((q.r + OFF[i][1]) / 8 * 100) + '%';
      el.classList.toggle('now', S.phase === 'play' && i === S.turn);
    });
  }
  function flashTile(i) {
    var el = $('grid').children[i]; if (!el) return;
    el.classList.remove('hot'); void el.offsetWidth; el.classList.add('hot');
  }

  // ---------- 화면 ----------
  function salary(p) { return p.job.pay + p.level * LEVEL_PAY; }
  function cur() { return S.players[S.turn]; }
  function render() {
    placeTokens();
    var t = $('turn'), btn = $('btnSpin');
    if (!S || S.phase !== 'play') {
      t.innerHTML = '<span class="who"><span class="nm">머니로드</span><span class="sm">새 게임을 시작하세요</span></span>';
      btn.disabled = !S || S.phase !== 'play';
    } else {
      var p = cur();
      t.innerHTML = carSvg(p.color) + '<span class="who"><span class="nm">' + esc(p.name) + '</span><span class="sm">' + p.job.ic + ' ' + p.job.n + ' 차례</span></span>';
      btn.disabled = busy;
    }
    $('players').innerHTML = S ? S.players.map(function (p, i) {
      var meta = p.job.ic + ' ' + p.job.n + ' · Lv ' + p.level + ' · 👪 ' + p.pass + (p.married ? ' · 💍' : '');
      return '<li class="pl' + (S.phase === 'play' && i === S.turn ? ' on' : '') + '">' + carSvg(p.color) +
        '<span><span class="nm">' + esc(p.name) + '</span><span class="meta">' + meta + '</span></span>' +
        '<span><span class="cash' + (p.cash < 0 ? ' neg' : '') + '">' + won(p.cash) + '</span>' +
        (p.done ? '<span class="done">' + p.rank + '등 은퇴</span>' : '<span class="done">월급 ' + short(salary(p)) + '</span>') + '</span></li>';
    }).join('') : '';
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
  // opts: { title, body(html), buttons:[{label, value, pri}], onOpen(sheet) } → Promise(value)
  var modalOpen = false;
  function modal(opts) {
    return new Promise(function (resolve) {
      var m = $('modal');
      $('mTitle').textContent = opts.title || '';
      $('mBody').innerHTML = opts.body || '';
      var bx = $('mBtns'); bx.innerHTML = '';
      (opts.buttons || []).forEach(function (b) {
        var el = document.createElement('button');
        el.type = 'button'; el.className = 'btn' + (b.pri ? ' pri' : ''); el.textContent = b.label;
        el.addEventListener('click', function () { done(b.value); });
        bx.appendChild(el);
      });
      bx.hidden = !(opts.buttons && opts.buttons.length);
      function done(v) { m.hidden = true; modalOpen = false; resolve(v); }
      m.hidden = false; modalOpen = true;
      if (opts.onOpen) opts.onOpen($('mBody'), done);
      var f = bx.querySelector('.pri') || $('mBody').querySelector('button, input');
      if (f) setTimeout(function () { try { f.focus({ preventScroll: true }); } catch (e) {} }, 30);
    });
  }
  function ok(title, body, label) { return modal({ title: title, body: body, buttons: [{ label: label || '확인', value: 1, pri: true }] }); }

  // ---------- 룰렛 ----------
  function spinTo(numEl, n) {
    if (reduced()) { numEl.textContent = n; beep(1200, .08); return sleep(250).then(function () { return n; }); }
    return new Promise(function (resolve) {
      var steps = 16 + Math.floor(Math.random() * 5), k = 0, last = 0;
      (function tick() {
        k++;
        if (k >= steps) { numEl.textContent = n; beep(1320, .14, 'square', .07); setTimeout(function () { resolve(n); }, 260); return; }
        var v; do { v = roll(); } while (v === last); last = v;
        numEl.textContent = v; beep(700 + v * 40, .03);
        setTimeout(tick, 40 + k * k * 1.1);
      })();
    });
  }
  // 창 안의 작은 룰렛: 누르면 돌고 숫자를 돌려준다
  function spinModal(title, body, label) {
    return new Promise(function (resolve) {
      modal({
        title: title,
        body: body + '<div class="mini"><div class="disp"><span class="disp-ghost" aria-hidden="true">8</span><span class="disp-num" data-num>-</span></div>' +
          '<button type="button" class="spin" data-spin>' + (label || '누르기') + '</button></div>',
        onOpen: function (box, done) {
          var b = box.querySelector('[data-spin]');
          b.addEventListener('click', function () {
            b.disabled = true;
            spinTo(box.querySelector('[data-num]'), roll()).then(function (n) { setTimeout(function () { done(n); }, 450); });
          });
        }
      }).then(resolve);
    });
  }

  // ---------- 돈 · 레벨 ----------
  function money(p, n, why) {
    p.cash += n;
    log(p.name + ' · ' + why + ' ' + signed(n));
    render();
  }
  function levelUp(p, n, why) {
    p.level += n;
    log(p.name + ' · ' + why + ' 레벨 +' + n + ' (Lv ' + p.level + ')');
    render();
  }
  function addPass(p) { if (p.pass < MAX_PASS) { p.pass++; return true; } return false; }
  function others(p) { return S.players.filter(function (q) { return q !== p; }); }

  // ---------- 움직이기 ----------
  async function move(p, n) {
    var dir = n < 0 ? -1 : 1, left = Math.abs(n);
    for (var k = 0; k < left; k++) {
      if (dir > 0 && p.pos >= LAST) break;
      if (dir < 0 && p.pos <= 0) break;
      p.pos += dir;
      placeTokens(); beep(dir > 0 ? 520 : 380, .05, 'triangle', .06);
      await sleep(reduced() ? 60 : 250);
      var t = TILES[p.pos];
      if (dir > 0 && t.type === 'pay' && p.pos !== p.lastPay) {
        var s = salary(p); p.lastPay = p.pos;
        money(p, s, '월급날');
        flashTile(p.pos); beep(990, .1, 'triangle', .07);
        await toast('💰 월급날<br><span class="plus">' + signed(s) + '</span>', 1100);
      }
      if (dir > 0 && /^stop/.test(t.type) && k < left - 1) {
        flashTile(p.pos);
        await toast('✋ STOP! 여기서 멈춰요', 1000);
        break;
      }
    }
  }

  async function land(p, depth) {
    var t = TILES[p.pos];
    flashTile(p.pos);
    switch (t.type) {
      case 'spend':
        money(p, -t.item[1], t.item[0]); jingle(false);
        await toast(t.item[2] + ' ' + esc(t.item[0]) + '<br><span class="minus">' + signed(-t.item[1]) + '</span>'); break;
      case 'earn':
        money(p, t.item[1], t.item[0]); jingle(true);
        await toast(t.item[2] + ' ' + esc(t.item[0]) + '<br><span class="plus">' + signed(t.item[1]) + '</span>'); break;
      case 'lv1': case 'lv2':
        var n = t.type === 'lv1' ? 1 : 2;
        levelUp(p, n, '레벨업 칸'); jingle(true);
        await toast('⭐ 레벨 +' + n + '<br><span class="plus">월급 ' + short(salary(p)) + '원으로!</span>'); break;
      case 'pay': break; // 들어오면서 받음
      case 'chance': await chance(p, depth); break;
      case 'bonus': {
        var b = await spinModal('🎰 보너스 룰렛', '<p>룰렛을 눌러 보너스를 받아요.</p><p class="note">1~3 → 3,000원 · 4~6 → 6,000원 · 7~9 → 12,000원</p>');
        var amt = b <= 3 ? 3000 : b <= 6 ? 6000 : 12000;
        money(p, amt, '보너스 룰렛 ' + b); jingle(true);
        await ok('보너스 ' + b + '!', '<span class="big plus">' + signed(amt) + '</span>');
        break;
      }
      case 'lotto': {
        var buy = await modal({
          title: '🎫 복권 가게',
          body: '<p>복권 한 장에 <b>2,000원</b>. 사 볼까요?</p><p class="note">9 → 1등 100,000원 · 7~8 → 2등 30,000원 · 5~6 → 3등 8,000원 · 1~4 → 꽝</p>',
          buttons: [{ label: '안 사요', value: 0 }, { label: '살래요', value: 1, pri: true }]
        });
        if (!buy) { log(p.name + ' · 복권 안 삼'); break; }
        money(p, -2000, '복권 구입');
        var l = await spinModal('🎫 복권 추첨', '<p>룰렛을 눌러 추첨해요!</p>', '추첨');
        var prize = l === 9 ? 100000 : l >= 7 ? 30000 : l >= 5 ? 8000 : 0;
        var rank = l === 9 ? '1등' : l >= 7 ? '2등' : l >= 5 ? '3등' : '';
        if (prize) { money(p, prize, '복권 ' + rank); jingle(true); await ok('🎉 복권 ' + rank + ' 당첨!', '<span class="big plus">' + signed(prize) + '</span>'); }
        else { log(p.name + ' · 복권 꽝'); jingle(false); await ok('꽝…', '<p>숫자 ' + l + '. 다음 기회에!</p>'); }
        break;
      }
      case 'invest': {
        var opts = [{ label: '안 해요', value: 0 }];
        if (p.cash >= 10000) opts.push({ label: '1만 원', value: 10000, pri: p.cash < 20000 });
        if (p.cash >= 20000) opts.push({ label: '2만 원', value: 20000, pri: true });
        var inv = await modal({
          title: '📊 투자 기회',
          body: '<p>돈을 넣고 룰렛을 눌러요.</p><p class="note">1~4 → 다 잃음 · 5~7 → 2배 · 8~9 → 3배</p>' + (p.cash < 10000 ? '<p>가진 돈이 1만 원보다 적어 투자할 수 없어요.</p>' : ''),
          buttons: opts
        });
        if (!inv) { log(p.name + ' · 투자 안 함'); break; }
        var r = await spinModal('📊 투자 결과', '<p>' + won(inv) + '을 넣었어요. 두근두근…</p>');
        var mult = r <= 4 ? 0 : r <= 7 ? 2 : 3, gain = inv * mult - inv;
        money(p, gain, '투자 ' + r + (mult ? ' (' + mult + '배)' : ' (손해)'));
        jingle(gain > 0);
        await ok(mult ? '📈 ' + mult + '배!' : '📉 다 잃었어요', '<span class="big ' + (gain > 0 ? 'plus' : 'minus') + '">' + signed(gain) + '</span>');
        break;
      }
      case 'job': await changeJob(p, '💼 이직 기회', '지금 직업을 유지하거나 새 직업으로 바꿀 수 있어요.'); break;
      case 'stopTax': {
        var tax = p.cash > 0 ? Math.floor(p.cash * 0.1 / 1000) * 1000 : 0;
        if (tax) money(p, -tax, '세금'); else log(p.name + ' · 세금 없음');
        jingle(false);
        await ok('✋ STOP · 세금 내는 날', '<p>가진 돈의 10%를 세금으로 내요.</p><span class="big minus">' + signed(-tax) + '</span>');
        break;
      }
      case 'stopWed': {
        if (!p.married) {
          p.married = true; addPass(p);
          var gift = 5000 * others(p).length;
          others(p).forEach(function (q) { q.cash -= 5000; });
          money(p, gift, '결혼 축의금'); jingle(true);
          await ok('💍 STOP · 결혼해요!', '<p>배우자가 차에 탔어요 (👪 +1).<br>모두가 5,000원씩 축의금을 줘요.</p><span class="big plus">' + signed(gift) + '</span>');
        } else {
          money(p, -5000, '결혼기념일 여행');
          await ok('💍 STOP · 결혼기념일', '<p>기념일 여행을 다녀왔어요.</p><span class="big minus">' + signed(-5000) + '</span>');
        }
        break;
      }
      case 'baby': {
        var added = addPass(p);
        if (p.married) {
          var g = 2000 * others(p).length;
          others(p).forEach(function (q) { q.cash -= 2000; });
          money(p, g, '아기 축하금');
          if (added) log(p.name + ' · 아기 탄생 👪 +1');
          await ok('👶 아기가 태어났어요!', '<p>' + (added ? '차에 한 명 더 탔어요 (👪 +1).' : '차가 꽉 찼어요!') + '<br>모두가 2,000원씩 축하금을 줘요.</p><span class="big plus">' + signed(g) + '</span>');
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
        if (fb) money(p, fb, p.rank + '등 은퇴 보너스'); else log(p.name + ' · 은퇴');
        jingle(true);
        await ok('🏁 ' + esc(p.name) + ' 은퇴!', '<p>' + p.rank + '번째로 도착했어요.</p>' + (fb ? '<span class="big plus">은퇴 보너스 ' + signed(fb) + '</span>' : ''));
        break;
      }
    }
    render();
  }

  async function chance(p, depth) {
    var c = pick(CHANCE);
    beep(880, .1, 'triangle', .07);
    await ok('❓ 찬스 카드', '<div class="card-face"><span class="ic" aria-hidden="true">' + c.ic + '</span>' + esc(c.t) + '</div>' +
      (c.m ? '<span class="big ' + (c.m > 0 ? 'plus' : 'minus') + '">' + signed(c.m) + '</span>' : '') +
      (c.sal ? '<span class="big plus">' + signed(salary(p)) + '</span>' : ''));
    if (c.m) { money(p, c.m, '찬스'); jingle(c.m > 0); }
    if (c.lv) { levelUp(p, c.lv, '찬스'); jingle(true); }
    if (c.sal) { money(p, salary(p), '찬스 보너스 월급'); jingle(true); }
    if (c.all) {
      others(p).forEach(function (q) { q.cash -= c.all; });
      money(p, c.all * others(p).length, '찬스 (모두와 주고받기)');
    }
    if (c.job) await changeJob(p, '🤝 스카우트 제의', '새 직업으로 바꿀 수 있어요.');
    if (c.mv) {
      log(p.name + ' · 찬스 ' + (c.mv > 0 ? '앞으로 ' : '뒤로 ') + Math.abs(c.mv) + '칸');
      await move(p, c.mv);
      if ((depth || 0) < 2) await land(p, (depth || 0) + 1);
    }
  }

  async function changeJob(p, title, msg) {
    var pool = JOBS.filter(function (j) { return j.n !== p.job.n; });
    var a = pick(pool), b; do { b = pick(pool); } while (b === a);
    var list = [p.job, a, b];
    var v = await modal({
      title: title,
      body: '<p>' + msg + '</p><div class="jobs three">' + list.map(function (j, i) {
        return '<button type="button" class="job' + (i ? '' : ' cur') + '" data-i="' + i + '"><span class="ic" aria-hidden="true">' + j.ic + '</span><b>' + j.n + '</b><small>월급 ' + short(j.pay) + '</small>' + (i ? '' : '<small>지금 직업</small>') + '</button>';
      }).join('') + '</div><p class="note">레벨 보너스(Lv × 1,000원)는 그대로예요.</p>',
      onOpen: function (box, done) {
        box.querySelectorAll('.job').forEach(function (el) { el.addEventListener('click', function () { done(+el.dataset.i); }); });
      }
    });
    var j = list[v || 0];
    if (j !== p.job) { log(p.name + ' · 이직 ' + p.job.n + ' → ' + j.n); p.job = j; }
    render();
  }

  // ---------- 차례 ----------
  var busy = false;
  async function onSpin() {
    if (busy || modalOpen || !S || S.phase !== 'play') return;
    busy = true; render();
    var p = cur();
    var n = await spinTo($('disp'), roll());
    log(p.name + ' · 룰렛 ' + n);
    await move(p, n);
    await land(p, 0);
    nextTurn();
    busy = false;
    save(); render();
    if (S.phase === 'end') showResult();
  }
  function nextTurn() {
    if (S.players.every(function (q) { return q.done; })) { S.phase = 'end'; return; }
    var i = S.turn;
    do { i = (i + 1) % S.players.length; } while (S.players[i].done);
    S.turn = i;
  }

  function score(p) { return p.cash + p.level * LEVEL_PT + p.pass * PASS_PT; }
  async function showResult() {
    var list = S.players.slice().sort(function (a, b) { return score(b) - score(a); });
    jingle(true);
    var v = await modal({
      title: '🏆 ' + esc(list[0].name) + ' 우승!',
      body: '<p class="note">계산: 가진 돈 + 레벨 × 10,000원 + 동승자 × 5,000원</p><ol class="rank">' + list.map(function (p, i) {
        return '<li><span class="no">' + (i + 1) + '</span>' + carSvg(p.color) + '<span class="nm">' + esc(p.name) +
          '<small>' + won(p.cash) + ' + Lv ' + p.level + ' + 👪 ' + p.pass + '</small></span><span class="sum">' + won(score(p)) + '</span></li>';
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
    var count = prev.length >= 2 ? prev.length : 2;
    var form = await modal({
      title: '새 게임',
      body: '<label class="field"><span>몇 명이 하나요?</span><div class="seg" role="radiogroup" aria-label="인원"><span class="seg-ind" aria-hidden="true"></span>' +
        [2, 3, 4].map(function (n) { return '<button type="button" role="radio" data-n="' + n + '">' + n + '명</button>'; }).join('') + '</div></label>' +
        '<div class="field"><span>이름</span><div class="names">' + [0, 1, 2, 3].map(function (i) {
          return '<div class="name-row" data-row="' + i + '">' + carSvg(COLORS[i]) + '<input type="text" maxlength="8" aria-label="' + (i + 1) + '번 이름" value="' + esc(prev[i] || CAR_NAMES[i] + ' 자동차') + '"></div>';
        }).join('') + '</div></div>',
      buttons: [{ label: '시작하기', value: 1, pri: true }],
      onOpen: function (box) {
        var seg = box.querySelector('.seg');
        function set(n) {
          count = n;
          seg.querySelectorAll('button').forEach(function (b) { var on = +b.dataset.n === n; b.classList.toggle('on', on); b.setAttribute('aria-checked', on); });
          box.querySelectorAll('.name-row').forEach(function (r) { r.hidden = +r.dataset.row >= n; });
          slideSeg(seg);
        }
        seg.querySelectorAll('button').forEach(function (b) { b.addEventListener('click', function () { set(+b.dataset.n); }); });
        set(count);
        requestAnimationFrame(function () { slideSeg(seg); });
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { slideSeg(seg); });
      }
    });
    if (!form) return;
    var names = [];
    document.querySelectorAll('#mBody .name-row input').forEach(function (inp, i) {
      if (i < count) names.push(inp.value.trim() || (CAR_NAMES[i] + ' 자동차'));
    });
    S = { phase: 'jobs', turn: 0, finished: 0, log: [], players: names.map(function (n, i) {
      return { name: n, color: COLORS[i], job: JOBS[0], cash: START_CASH, level: 0, pass: 0, married: false, pos: 0, done: false, rank: 0, lastPay: -1 };
    }) };
    $('disp').textContent = '-';
    render();
    // 직업 고르기 — 한 사람마다 두 장 중 하나
    var used = [];
    for (var i = 0; i < S.players.length; i++) {
      var p = S.players[i];
      var pool = JOBS.filter(function (j) { return used.indexOf(j.n) < 0; });
      var a = pick(pool), b; do { b = pick(pool); } while (b === a);
      var v = await modal({
        title: esc(p.name) + ', 직업을 고르세요',
        body: '<p>두 직업 중 하나를 골라요. 월급날 칸을 지날 때마다 월급을 받아요.</p><div class="jobs">' + [a, b].map(function (j, k) {
          return '<button type="button" class="job" data-i="' + k + '"><span class="ic" aria-hidden="true">' + j.ic + '</span><b>' + j.n + '</b><small>월급 ' + j.pay.toLocaleString('ko-KR') + '원</small></button>';
        }).join('') + '</div>',
        onOpen: function (box, done) {
          box.querySelectorAll('.job').forEach(function (el) { el.addEventListener('click', function () { done(+el.dataset.i); }); });
        }
      });
      p.job = v ? b : a; used.push(p.job.n);
      log(p.name + ' · 직업 ' + p.job.n);
      render();
    }
    S.phase = 'play';
    log('게임 시작! 출발 자금 ' + won(START_CASH));
    save(); render();
  }

  function rules() {
    return ok('머니로드 규칙', '<ol class="rules">' +
      '<li>차례가 되면 <b>전자룰렛</b>을 눌러 나온 숫자(1~9)만큼 앞으로 가요.</li>' +
      '<li>처음에 고른 <b>직업</b>에 따라 <b>월급날</b> 칸을 지날 때마다 월급을 받아요.</li>' +
      '<li><b>+1 · +2 레벨</b> 칸에서 레벨이 오르면 월급도 Lv × 1,000원 올라요.</li>' +
      '<li><b>STOP</b> 칸(결혼 · 세금)은 숫자가 남아도 꼭 멈춰요.</li>' +
      '<li><b>찬스</b> · <b>복권</b> · <b>투자</b> · <b>보너스</b> 칸에서는 운을 시험해요.</li>' +
      '<li>결혼 · 아기 · 반려동물이 생기면 자동차에 <b>동승자</b>가 타요 (최대 5명).</li>' +
      '<li><b>은퇴</b> 칸에 먼저 도착할수록 보너스(2만 · 1만 · 5천)를 받아요.</li>' +
      '<li>모두 은퇴하면 <b>가진 돈 + 레벨 × 1만 + 동승자 × 5천</b>으로 계산해 가장 많은 사람이 이겨요.</li>' +
      '</ol>', '알겠어요');
  }

  // ---------- 시작 ----------
  function init() {
    drawBoard();
    setSoundBtn();
    $('btnSpin').addEventListener('click', onSpin);
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
      S = saved; render();
      modal({ title: '이어서 할까요?', body: '<p>하던 게임이 남아 있어요.</p>', buttons: [{ label: '새 게임', value: 0 }, { label: '이어하기', value: 1, pri: true }] })
        .then(function (v) { if (!v) { clearSave(); setup(); } });
    } else {
      S = null; render();
      rules().then(setup);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
