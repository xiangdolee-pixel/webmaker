/* 주사위 Dice — 개수를 고르고 판을 누르면 누른 자리에서 주사위가 굴러 나간다 */
(function () {
  'use strict';

  var MIN = 1, MAX = 10, KEY = 'dice-count';
  var board = document.getElementById('board');
  var stage = document.getElementById('stage');
  var hint = document.getElementById('hint');
  var countEl = document.getElementById('count');
  var totalEl = document.getElementById('total');
  var chipsEl = document.getElementById('chips');
  var historyEl = document.getElementById('history');
  var stepBtns = document.querySelectorAll('.step');
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // 눈 자리(3×3 칸 번호)
  var PIPS = { 1: [5], 2: [3, 7], 3: [3, 5, 7], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] };
  // 그 숫자가 앞을 보게 하는 정육면체 회전 [X, Y]
  var SHOW = { 1: [0, 0], 2: [-90, 0], 3: [0, -90], 4: [0, 90], 5: [90, 0], 6: [0, 180] };

  var count = 2;
  try { var saved = parseInt(localStorage.getItem(KEY), 10); if (saved >= MIN && saved <= MAX) count = saved; } catch (e) {}

  var dice = [];      // { el, hop, cube, shade, value, fx, fy, x, y, z }
  var size = 80;
  var rolling = false;
  var history = [];

  // 치우침 없는 1~6
  function roll6() {
    if (window.crypto && crypto.getRandomValues) {
      var b = new Uint8Array(1);
      do { crypto.getRandomValues(b); } while (b[0] >= 252);
      return (b[0] % 6) + 1;
    }
    return Math.floor(Math.random() * 6) + 1;
  }
  function rand(a, b) { return a + Math.random() * (b - a); }
  function spins() { return (2 + Math.floor(Math.random() * 2)) * 360 * (Math.random() < .5 ? -1 : 1); }

  function makeDie() {
    var el = document.createElement('div');
    el.className = 'dpos';
    var faces = '';
    for (var v = 1; v <= 6; v++) {
      var pips = '';
      for (var i = 0; i < PIPS[v].length; i++) pips += '<i class="p' + PIPS[v][i] + '"></i>';
      faces += '<div class="face f' + v + ' v' + v + '">' + pips + '</div>';
    }
    el.innerHTML = '<div class="shade"></div><div class="hop"><div class="cube"><b class="core"></b><b class="core cx"></b><b class="core cy"></b>' + faces + '</div></div>';
    stage.appendChild(el);
    var value = roll6(), s = SHOW[value];
    return { el: el, hop: el.querySelector('.hop'), cube: el.querySelector('.cube'), shade: el.querySelector('.shade'),
      value: value, fx: .5, fy: .5, x: s[0], y: s[1], z: rand(-25, 25) };
  }

  function cubeTf(x, y, z) { return 'rotateZ(' + z + 'deg) rotateX(' + x + 'deg) rotateY(' + y + 'deg)'; }
  function posTf(px, py) { return 'translate3d(' + (px - size / 2) + 'px,' + (py - size / 2) + 'px,0)'; }

  // 판 크기 · 개수에 맞춘 주사위 크기
  function measure() {
    var w = board.clientWidth, h = board.clientHeight, n = dice.length || count;
    size = Math.round(Math.max(40, Math.min(w > 700 ? 112 : 96, Math.sqrt(w * h / n) * 0.42)));
    stage.style.setProperty('--s', size + 'px');
    stage.style.setProperty('--persp', size * 6 + 'px');
  }

  // 겹치지 않는 자리 (판 크기 비율로 저장 — 화면 크기가 바뀌어도 그대로)
  function layout() {
    measure();
    var w = board.clientWidth, h = board.clientHeight;
    var pad = size * 0.72, minD = size * 1.5, placed = [];
    var bottom = h - pad - (board.classList.contains('rolled') ? 0 : 28);   // 안내 글자 자리 비움
    for (var i = 0; i < dice.length; i++) {
      var best = null, bestD = -1;
      for (var t = 0; t < 160; t++) {
        var x = rand(pad, Math.max(pad, w - pad)), y = rand(pad, Math.max(pad, bottom));
        var d = Infinity;
        for (var j = 0; j < placed.length; j++) d = Math.min(d, Math.hypot(placed[j][0] - x, placed[j][1] - y));
        if (d >= minD) { best = [x, y]; break; }
        if (d > bestD) { bestD = d; best = [x, y]; }
      }
      placed.push(best);
      dice[i].fx = best[0] / w; dice[i].fy = best[1] / h;
    }
  }

  function place(d) {
    d.el.style.transform = posTf(d.fx * board.clientWidth, d.fy * board.clientHeight);
    d.cube.style.transform = cubeTf(d.x, d.y, d.z);
  }

  function clearResult(text) {
    totalEl.textContent = text;
    chipsEl.innerHTML = '';
  }

  function setCount(n) {
    count = Math.max(MIN, Math.min(MAX, n));
    try { localStorage.setItem(KEY, count); } catch (e) {}
    countEl.textContent = count;
    stepBtns[0].disabled = count <= MIN;
    stepBtns[1].disabled = count >= MAX;
    while (dice.length > count) stage.removeChild(dice.pop().el);
    while (dice.length < count) dice.push(makeDie());
    // 개수를 바꾸면 새로 던지기 전까지 흐리게, 결과는 비움
    stage.classList.add('idle');
    board.classList.remove('rolled');
    clearResult('–');
    layout();
    dice.forEach(place);
  }

  function throwDice(ox, oy) {
    if (rolling) return;
    rolling = true;
    stage.classList.remove('idle');
    board.classList.add('rolled');
    clearResult('…');
    layout();

    var w = board.clientWidth, h = board.clientHeight, longest = 0, P = 'perspective(' + size * 6 + 'px) ';
    dice.forEach(function (d, i) {
      d.value = roll6();
      var s = SHOW[d.value];
      // 끝 각도 = 보여 줄 면 + 여러 바퀴 (지금 각도에서 이어서), 화면 쪽으로는 비스듬히
      var fromX = d.x, fromY = d.y, fromZ = d.z;
      d.x = s[0] + Math.round((fromX - s[0]) / 360) * 360 + spins();
      d.y = s[1] + Math.round((fromY - s[1]) / 360) * 360 + spins();
      d.z = rand(-30, 30);
      var tx = d.fx * w, ty = d.fy * h;
      var sx = ox + rand(-size * .3, size * .3), sy = oy + rand(-size * .3, size * .3);
      var dur = reduce ? 200 : Math.round(rand(900, 1250)), delay = reduce ? 0 : i * 35;
      longest = Math.max(longest, dur + delay);

      place(d);
      if (!d.el.animate) return;
      if (reduce) { d.el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: dur }); return; }

      var timing = { duration: dur, delay: delay, fill: 'backwards' };
      // 누른 자리에서 살짝 휘어 날아가 멈춤
      var mx = (sx + tx) / 2 + rand(-size, size) * .6, my = (sy + ty) / 2 + rand(-size, size) * .6;
      d.el.animate([
        { transform: posTf(sx, sy) },
        { transform: posTf(mx, my), offset: .35 },
        { transform: posTf(tx, ty) }
      ], Object.assign({ easing: 'cubic-bezier(.2,.65,.3,1)' }, timing));
      // 데굴데굴 — 빨리 돌다 천천히 멈춤
      d.cube.animate([
        { transform: cubeTf(fromX, fromY, fromZ + rand(-180, 180)) },
        { transform: cubeTf(d.x, d.y, d.z) }
      ], Object.assign({ easing: 'cubic-bezier(.15,.55,.25,1)' }, timing));
      // 높이: 손에서 떠올랐다 → 바닥에 두 번 튀고 멈춤 (그림자는 반대로)
      d.hop.animate([
        { transform: P + 'scale(1.55)' },
        { transform: P + 'scale(1.3)', offset: .25 },
        { transform: P + 'scale(1)', offset: .52 },
        { transform: P + 'scale(1.1)', offset: .66 },
        { transform: P + 'scale(1)', offset: .8 },
        { transform: P + 'scale(1.025)', offset: .9 },
        { transform: P + 'scale(1)' }
      ], Object.assign({ easing: 'ease-in-out' }, timing));
      d.shade.animate([
        { transform: 'translateY(40%) scale(1.5)', opacity: .25 },
        { transform: 'translateY(20%) scale(1.3)', opacity: .4, offset: .25 },
        { transform: 'none', opacity: 1, offset: .52 },
        { transform: 'translateY(8%) scale(1.1)', opacity: .7, offset: .66 },
        { transform: 'none', opacity: 1 }
      ], Object.assign({ easing: 'ease-in-out' }, timing));
    });

    setTimeout(function () {
      rolling = false;
      showResult();
      if (navigator.vibrate && !reduce) { try { navigator.vibrate(20); } catch (e) {} }
    }, longest);
  }

  function showResult() {
    var vals = dice.map(function (d) { return d.value; });
    var sum = vals.reduce(function (a, b) { return a + b; }, 0);
    totalEl.textContent = sum;
    chipsEl.innerHTML = dice.length > 1 ? vals.map(function (v, i) {
      return '<li style="animation-delay:' + (i * 30) + 'ms">' + v + '</li>';
    }).join('') : '';
    history.unshift(dice.length > 1 ? sum + ' (' + vals.join('·') + ')' : String(sum));
    history = history.slice(0, 8);
    historyEl.textContent = history.length > 1 ? '이전  ' + history.slice(1).join('  ·  ') : '';
  }

  function throwFromBottom() { throwDice(board.clientWidth / 2, board.clientHeight - 20); }

  // 판 누르기 / 키보드
  board.addEventListener('pointerdown', function (e) {
    if (e.button) return;
    var r = board.getBoundingClientRect();
    throwDice(e.clientX - r.left, e.clientY - r.top);
  });
  board.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); throwFromBottom(); }
  });
  // 어디서든: 스페이스 = 던지기, + / - = 개수
  document.addEventListener('keydown', function (e) {
    if (e.target === board || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === ' ' && e.target.tagName !== 'BUTTON') { e.preventDefault(); throwFromBottom(); }
    else if (!rolling && (e.key === '+' || e.key === '=')) setCount(count + 1);
    else if (!rolling && e.key === '-') setCount(count - 1);
  });

  for (var i = 0; i < stepBtns.length; i++) {
    stepBtns[i].addEventListener('click', function () {
      if (!rolling) setCount(count + parseInt(this.getAttribute('data-step'), 10));
    });
  }

  // 화면 크기가 바뀌면 크기 · 자리 다시
  var rt;
  window.addEventListener('resize', function () {
    clearTimeout(rt);
    rt = setTimeout(function () { if (!rolling) { measure(); dice.forEach(place); } }, 120);
  });

  setCount(count);
  if (!('ontouchstart' in window)) hint.textContent = '판을 클릭하거나 스페이스를 눌러 던지세요';
})();
