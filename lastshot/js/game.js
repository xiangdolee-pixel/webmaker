/* 라스트샷 — 세로 화면 달리기 슈팅
   손가락(또는 ← →)으로 좌우 이동. 부대는 앞으로 자동 사격.
   문: 쏘면 숫자 +1, 지나가면 부대 수가 바뀜(+ · − · ×). 적: 닿으면 한 명씩 줄어듦. 상자: 부수면 총이 세짐. 끝에 보스.
   레벨이 오를수록 적 수 · 체력 · 속도 · 나쁜 문이 커진다. 결제 · 아이템 없음 — 실력만으로. */
(function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };
  var cv = $('#cv'), ctx = cv.getContext('2d');
  var W = 360, H = 640, S = 1, DPR = 1;           // 논리 폭 360 기준으로 그린다
  var ROAD_L = 34, ROAD_R = 326;
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── 저장 ── */
  function load(k, d) { try { var v = +localStorage.getItem(k); return v > 0 ? v : d; } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  var level = load('lastshot_level', 1), best = load('lastshot_best', 1);

  /* ── 상태 ── */
  var G = null, state = 'menu', last = 0, scroll = 0;

  function rnd(a, b) { return a + Math.random() * (b - a); }
  function ri(a, b) { return Math.floor(rnd(a, b + 1)); }

  // 레벨 하나 만들기: 문 · 적 무리 · 상자를 번갈아 놓고 끝에 보스
  function makeLevel(L) {
    var ev = [], d = 520, rows = Math.min(7 + L, 22);
    for (var i = 0; i < rows; i++) {
      var k = i % 3;
      if (k === 0) ev.push({ d: d, kind: 'gate' });
      else if (k === 1) ev.push({ d: d, kind: 'mob' });
      else ev.push({ d: d, kind: Math.random() < .55 ? 'box' : 'mob' });
      d += Math.max(250, 330 - L * 4);
    }
    ev.push({ d: d + 160, kind: 'boss' });
    return { ev: ev, length: d + 160 };
  }

  function newGame() {
    var L = level, lv = makeLevel(L);
    G = {
      L: L, ev: lv.ev, length: lv.length, dist: 0, next: 0,
      speed: 78 + Math.min(L, 30) * 2.2,
      px: W / 2, tx: W / 2, n: 8 + Math.floor(L / 2),
      rate: 3.4, dmg: 1, cd: 0, pow: 0,
      bullets: [], gates: [], mobs: [], boxes: [], boss: null, fx: [], texts: [],
      shake: 0, over: false
    };
    syncHud();
  }

  /* ── 놓기 ── */
  function spawn(e) {
    var L = G.L, y = -60;
    if (e.kind === 'gate') {
      // 한쪽은 좋은 문, 한쪽은 나쁜 문(쏴서 올릴 수 있음). 가끔 ×2
      var good = Math.random() < .2 ? { t: 'x', v: 2 } : { t: '+', v: ri(3, 6) + Math.floor(L / 2) };
      var bad = { t: '+', v: -(ri(3, 6) + Math.floor(L * 1.5)) };
      if (Math.random() < .2 && L > 3) good = { t: '+', v: -(ri(1, 3) + Math.floor(L / 2)) };   // 둘 다 나쁠 때도 — 쏴서 덜 나쁘게
      var left = Math.random() < .5;
      var mid = (ROAD_L + ROAD_R) / 2;
      G.gates.push({ y: y, h: 46, used: false, parts: [
        { x0: ROAD_L, x1: mid - 3, t: (left ? good : bad).t, v: (left ? good : bad).v, hit: 0 },
        { x0: mid + 3, x1: ROAD_R, t: (left ? bad : good).t, v: (left ? bad : good).v, hit: 0 }
      ] });
    } else if (e.kind === 'mob') {
      var c = Math.min(3 + Math.floor(L * 1.3), 40), hp = 1 + Math.floor(L / 4), cx = rnd(ROAD_L + 60, ROAD_R - 60);
      for (var i = 0; i < c; i++) {
        var a = i * 2.39996, r = 9.5 * Math.sqrt(i + 1);
        G.mobs.push({ x: Math.max(ROAD_L + 10, Math.min(ROAD_R - 10, cx + Math.cos(a) * r * 1.4)), y: y - Math.abs(Math.sin(a) * r) - 10, hp: hp, max: hp, vy: 22 + Math.min(L, 25) * 1.6, step: Math.random() * 6 });
      }
    } else if (e.kind === 'box') {
      var hpB = 14 + L * 7;
      G.boxes.push({ x: rnd(ROAD_L + 50, ROAD_R - 50), y: y, w: 64, h: 50, hp: hpB, max: hpB, gift: Math.random() < .5 ? 'rate' : 'dmg' });
    } else if (e.kind === 'boss') {
      var hpX = Math.round(150 + L * 120 + L * L * 8);
      G.boss = { x: W / 2, y: -90, r: 44, hp: hpX, max: hpX, vy: 14 + Math.min(L, 30) * .9, stop: 130, t: 0 };
    }
  }

  /* ── 부대 모양: 해바라기 배열 ── */
  function squadPos(n) {
    var p = [], m = Math.min(n, 60);
    for (var i = 0; i < m; i++) { var a = i * 2.39996, r = 8.4 * Math.sqrt(i); p.push([Math.cos(a) * r, Math.sin(a) * r * .75]); }
    return p;
  }
  function squadR(n) { return 8.4 * Math.sqrt(Math.min(n, 60)) + 11; }

  /* ── 한 장면 ── */
  function step(dt) {
    var g = G, py = H - 120;
    g.dist += g.speed * dt;
    scroll = (scroll + g.speed * dt) % 48;
    while (g.next < g.ev.length && g.dist >= g.ev[g.next].d - (py + 60)) spawn(g.ev[g.next++]);

    // 이동: 손가락이 가리킨 곳으로 부드럽게
    var R = squadR(g.n);
    g.tx = Math.max(ROAD_L + R, Math.min(ROAD_R - R, g.tx));
    g.px += (g.tx - g.px) * Math.min(1, dt * 14);

    // 사격
    g.cd -= dt;
    if (g.cd <= 0 && g.n > 0) {
      g.cd = 1 / g.rate;
      var shots = Math.min(g.n, 9), per = g.dmg * Math.max(1, Math.sqrt(g.n / 9));
      var spread = Math.min(R - 6, 4 + shots * 3);
      for (var s = 0; s < shots; s++) {
        var ox = shots === 1 ? 0 : -spread + (2 * spread) * s / (shots - 1);
        g.bullets.push({ x: g.px + ox, y: py - 10, d: per, vx: shots === 1 ? 0 : (s / (shots - 1) - .5) * 120 });   // 살짝 부채꼴
      }
    }
    // 총알
    for (var b = g.bullets.length - 1; b >= 0; b--) {
      var B = g.bullets[b]; B.y -= 560 * dt; B.x += B.vx * dt;
      if (B.y < -20 || hitAny(B)) g.bullets.splice(b, 1);
    }
    // 문
    g.gates.forEach(function (gt) {
      gt.y += g.speed * dt;
      gt.parts.forEach(function (p) { p.hit = Math.max(0, p.hit - dt * 4); });
      if (!gt.used && gt.y + gt.h / 2 >= py - 6) {
        gt.used = true;
        var p = gt.parts[g.px < gt.parts[1].x0 ? 0 : 1], before = g.n;
        g.n = p.t === 'x' ? g.n * p.v : g.n + p.v;
        g.n = Math.max(0, Math.round(g.n));
        float(g.px, py - 40, (g.n >= before ? '+' : '') + (g.n - before), g.n >= before ? '#38bdf8' : '#ef4444', 22);
        if (g.n < before) g.shake = .25;
        p.taken = true;
      }
    });
    g.gates = g.gates.filter(function (gt) { return gt.y < H + 60; });
    // 적: 가까워지면 부대 쪽으로 몰려옴
    for (var i = g.mobs.length - 1; i >= 0; i--) {
      var M = g.mobs[i];
      M.y += (g.speed + M.vy) * dt; M.step += dt * 10;
      if (M.y > py - 440) M.x += Math.sign(g.px - M.x) * Math.min(Math.abs(g.px - M.x), 58 * dt);
      var dx = M.x - g.px, dy = M.y - py;
      if (dy > -R && dy < R * .8 && Math.abs(dx) < R + 4) { g.mobs.splice(i, 1); g.n--; g.shake = .12; burst(M.x, M.y, '#ef4444', 6); continue; }
      if (M.y > H + 30) g.mobs.splice(i, 1);
    }
    // 상자: 부딪히면 크게 잃음
    for (var j = g.boxes.length - 1; j >= 0; j--) {
      var X = g.boxes[j]; X.y += g.speed * dt;
      if (X.y + X.h / 2 > py - R * .6 && X.y - X.h / 2 < py + R * .6 && Math.abs(X.x - g.px) < X.w / 2 + R - 6) {
        g.boxes.splice(j, 1); var loss = Math.ceil(X.hp / 4); g.n -= loss; g.shake = .3;
        float(g.px, py - 40, '-' + loss, '#ef4444', 22); burst(X.x, X.y, '#a16207', 14); continue;
      }
      if (X.y > H + 60) g.boxes.splice(j, 1);
    }
    // 보스
    var K = g.boss;
    if (K) {
      K.t += dt;
      if (K.y < K.stop) K.y += (g.speed * .6) * dt; else K.y += K.vy * dt;
      K.x += Math.sin(K.t * 1.3) * 40 * dt;
      if (K.y + K.r > py - R * .5) { g.n = 0; }
    }
    // 효과
    g.fx = g.fx.filter(function (f) { f.t -= dt; f.x += f.vx * dt; f.y += f.vy * dt; f.vy += 300 * dt; return f.t > 0; });
    g.texts = g.texts.filter(function (t) { t.t -= dt; t.y -= 40 * dt; return t.t > 0; });
    g.shake = Math.max(0, g.shake - dt);

    if (g.n <= 0) return end(false);
    if (K && K.hp <= 0) { burst(K.x, K.y, '#ef4444', 40); burst(K.x, K.y, '#facc15', 30); g.boss = null; return end(true); }
    syncHud();
  }

  function hitAny(B) {
    var g = G;
    // 보스
    var K = g.boss;
    if (K && Math.hypot(B.x - K.x, B.y - K.y) < K.r) { K.hp -= B.d; K.hit = .08; if (Math.random() < .3) burst(B.x, B.y, '#fde68a', 2); return true; }
    // 적
    for (var i = 0; i < g.mobs.length; i++) {
      var M = g.mobs[i];
      if (Math.abs(B.x - M.x) < 10 && Math.abs(B.y - M.y) < 12) {
        M.hp -= B.d;
        if (M.hp <= 0) { g.mobs.splice(i, 1); burst(M.x, M.y, '#ef4444', 5); }
        return true;
      }
    }
    // 상자
    for (var j = 0; j < g.boxes.length; j++) {
      var X = g.boxes[j];
      if (Math.abs(B.x - X.x) < X.w / 2 && Math.abs(B.y - X.y) < X.h / 2) {
        X.hp -= B.d;
        if (X.hp <= 0) {
          g.boxes.splice(j, 1); burst(X.x, X.y, '#facc15', 16);
          if (X.gift === 'rate') { g.rate = Math.min(14, g.rate * 1.22); float(X.x, X.y, '연사 UP', '#facc15', 20); }
          else { g.dmg = +(g.dmg * 1.3).toFixed(2); float(X.x, X.y, '위력 UP', '#facc15', 20); }
          g.pow++;
        }
        return true;
      }
    }
    // 문: 쏘면 숫자 +1 (× 문은 그대로)
    for (var k = 0; k < g.gates.length; k++) {
      var gt = g.gates[k];
      if (gt.used || Math.abs(B.y - gt.y) > gt.h / 2) continue;
      for (var q = 0; q < 2; q++) {
        var p = gt.parts[q];
        if (B.x >= p.x0 && B.x <= p.x1) {
          if (p.t === '+') { p.acc = (p.acc || 0) + 1; if (p.acc >= 6) { p.acc = 0; p.v++; p.hit = 1; } }   // 총알 6발에 +1
          return true;
        }
      }
    }
    return false;
  }

  function float(x, y, s, c, size) { G.texts.push({ x: x, y: y, s: s, c: c, size: size || 18, t: .9 }); }
  function burst(x, y, c, n) {
    if (reduce) return;
    for (var i = 0; i < n; i++) G.fx.push({ x: x, y: y, vx: rnd(-90, 90), vy: rnd(-160, -40), c: c, t: rnd(.3, .6), r: rnd(1.5, 3.2) });
  }

  /* ── 그리기 ── */
  function draw() {
    ctx.setTransform(DPR * S, 0, 0, DPR * S, 0, 0);
    var g = G, sh = g && g.shake ? (Math.random() - .5) * 8 * g.shake / .3 : 0;
    ctx.save(); ctx.translate(sh, 0);
    // 바탕: 양옆 물, 다리 길
    ctx.fillStyle = '#0ea5e9'; ctx.fillRect(-10, 0, W + 20, H);
    ctx.fillStyle = 'rgba(255,255,255,.12)';
    for (var w = 0; w < 14; w++) { var wy = ((w * 61 + scroll * 1.3) % (H + 40)) - 20; ctx.fillRect(6 + (w % 2) * 8, wy, 14, 2); ctx.fillRect(W - 24 - (w % 3) * 4, (wy + 30) % H, 12, 2); }
    ctx.fillStyle = '#475569'; ctx.fillRect(ROAD_L - 12, 0, ROAD_R - ROAD_L + 24, H);
    ctx.fillStyle = '#64748b'; ctx.fillRect(ROAD_L, 0, ROAD_R - ROAD_L, H);
    // 난간
    ctx.fillStyle = '#e2e8f0';
    for (var r = -48; r < H + 48; r += 24) { ctx.fillRect(ROAD_L - 12, r + scroll % 24, 4, 14); ctx.fillRect(ROAD_R + 8, r + scroll % 24, 4, 14); }
    ctx.fillStyle = '#f8fafc'; ctx.fillRect(ROAD_L - 2, 0, 3, H); ctx.fillRect(ROAD_R - 1, 0, 3, H);
    // 가운데 점선
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    for (var y = -48; y < H + 48; y += 48) ctx.fillRect(W / 2 - 2, y + scroll, 4, 24);
    if (!g) { ctx.restore(); return; }

    var py = H - 120;
    // 문
    g.gates.forEach(function (gt) {
      gt.parts.forEach(function (p) {
        var good = p.t === 'x' || p.v >= 0, col = good ? '37,99,235' : '239,68,68';
        ctx.fillStyle = 'rgba(' + col + ',' + (p.taken ? .25 : .55 + p.hit * .25) + ')';
        rr(p.x0, gt.y - gt.h / 2, p.x1 - p.x0, gt.h, 6); ctx.fill();
        ctx.fillStyle = good ? '#1d4ed8' : '#b91c1c';
        ctx.fillRect(p.x0, gt.y - gt.h / 2 - 6, 6, gt.h + 12); ctx.fillRect(p.x1 - 6, gt.y - gt.h / 2 - 6, 6, gt.h + 12);
        var label = p.t === 'x' ? '×' + p.v : (p.v > 0 ? '+' : '') + p.v;
        text(label, (p.x0 + p.x1) / 2, gt.y + 1, 26 + p.hit * 4, '#fff', true);
      });
    });
    // 상자
    g.boxes.forEach(function (X) {
      ctx.fillStyle = '#92400e'; rr(X.x - X.w / 2, X.y - X.h / 2, X.w, X.h, 6); ctx.fill();
      ctx.fillStyle = '#b45309'; rr(X.x - X.w / 2 + 4, X.y - X.h / 2 + 4, X.w - 8, X.h - 8, 4); ctx.fill();
      ctx.strokeStyle = '#78350f'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(X.x - X.w / 2 + 6, X.y - X.h / 2 + 6); ctx.lineTo(X.x + X.w / 2 - 6, X.y + X.h / 2 - 6); ctx.stroke();
      text(X.gift === 'rate' ? '연사' : '위력', X.x, X.y - X.h / 2 - 10, 12, '#fde68a', true);
      text(Math.ceil(X.hp), X.x, X.y + 1, 20, '#fff', true);
    });
    // 적
    g.mobs.forEach(function (M) { soldier(M.x, M.y + Math.sin(M.step) * .8, '#dc2626', '#7f1d1d', M.hp < M.max); });
    // 보스
    var K = g.boss;
    if (K) {
      ctx.save(); ctx.translate(K.x, K.y);
      ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(0, K.r * .9, K.r, K.r * .35, 0, 0, 7); ctx.fill();
      ctx.fillStyle = K.hit > 0 ? '#fecaca' : '#991b1b'; ctx.beginPath(); ctx.arc(0, 0, K.r, 0, 7); ctx.fill();
      ctx.fillStyle = '#450a0a'; ctx.beginPath(); ctx.arc(0, -8, K.r * .62, Math.PI, 0); ctx.fill();
      ctx.fillStyle = '#fde047'; ctx.fillRect(-16, -2, 10, 6); ctx.fillRect(6, -2, 10, 6);
      ctx.restore();
      K.hit = Math.max(0, (K.hit || 0) - .016);
      var bw = 150; ctx.fillStyle = 'rgba(15,23,42,.7)'; rr(K.x - bw / 2, K.y - K.r - 22, bw, 10, 5); ctx.fill();
      ctx.fillStyle = '#ef4444'; rr(K.x - bw / 2, K.y - K.r - 22, bw * Math.max(0, K.hp / K.max), 10, 5); ctx.fill();
      text(Math.max(0, Math.ceil(K.hp)), K.x, K.y - K.r - 34, 15, '#fff', true);
    }
    // 총알
    ctx.fillStyle = '#fde047';
    g.bullets.forEach(function (B) { ctx.fillRect(B.x - 1.5, B.y - 7, 3, 10); });
    // 내 부대
    var pos = squadPos(g.n);
    for (var i = pos.length - 1; i >= 0; i--) soldier(g.px + pos[i][0], py + pos[i][1], '#2563eb', '#1e3a8a', false);
    var R = squadR(g.n);
    ctx.fillStyle = 'rgba(15,23,42,.8)'; rr(g.px - 24, py + R * .75 + 4, 48, 22, 11); ctx.fill();
    text(g.n, g.px, py + R * .75 + 15.5, 15, '#fff', true);
    // 효과
    g.fx.forEach(function (f) { ctx.globalAlpha = Math.min(1, f.t * 3); ctx.fillStyle = f.c; ctx.fillRect(f.x, f.y, f.r, f.r); });
    ctx.globalAlpha = 1;
    g.texts.forEach(function (t) { ctx.globalAlpha = Math.min(1, t.t * 2); text(t.s, t.x, t.y, t.size, t.c, true); });
    ctx.globalAlpha = 1;
    ctx.restore();
  }
  function soldier(x, y, body, dark, hurt) {
    ctx.save(); ctx.translate(x, y); ctx.scale(1.4, 1.4); x = 0; y = 0;
    ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.beginPath(); ctx.ellipse(x, y + 7, 6, 2.5, 0, 0, 7); ctx.fill();
    ctx.fillStyle = hurt ? '#fca5a5' : body; ctx.beginPath(); ctx.arc(x, y + 2, 5.5, 0, 7); ctx.fill();
    ctx.fillStyle = dark; ctx.beginPath(); ctx.arc(x, y - 2, 4.6, Math.PI, 0); ctx.fill();
    ctx.fillStyle = '#fcd34d'; ctx.beginPath(); ctx.arc(x, y + 1, 2.4, 0, 7); ctx.fill();
    ctx.restore();
  }
  function rr(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function text(s, x, y, size, c, stroke) {
    ctx.font = '900 ' + size + 'px Pretendard, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (stroke) { ctx.lineWidth = Math.max(3, size / 6); ctx.strokeStyle = 'rgba(15,23,42,.85)'; ctx.lineJoin = 'round'; ctx.strokeText(s, x, y); }
    ctx.fillStyle = c; ctx.fillText(s, x, y);
  }

  /* ── 화면 크기 ── */
  function fit() {
    var r = cv.getBoundingClientRect();
    DPR = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(r.width * DPR); cv.height = Math.round(r.height * DPR);
    S = r.width / W; H = r.height / S;
    draw();
  }

  /* ── 조작 ── */
  var dragX = null, dragTx = 0;
  cv.addEventListener('pointerdown', function (e) { if (state !== 'play') return; dragX = e.clientX; dragTx = G.tx; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener('pointermove', function (e) { if (dragX === null || state !== 'play') return; G.tx = dragTx + (e.clientX - dragX) / S * 1.15; });
  var up = function () { dragX = null; };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  var keys = {};
  window.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'a' || e.key === 'd') { keys[e.key] = true; e.preventDefault(); }
    if ((e.key === 'Enter' || e.key === ' ') && state !== 'play') { e.preventDefault(); (state === 'menu' ? start : next)(); }
  });
  window.addEventListener('keyup', function (e) { keys[e.key] = false; });

  /* ── 흐름 ── */
  function loop(t) {
    var dt = Math.min(.033, (t - last) / 1000 || 0); last = t;
    if (state === 'play') {
      var k = (keys.ArrowLeft || keys.a ? -1 : 0) + (keys.ArrowRight || keys.d ? 1 : 0);
      if (k) G.tx += k * 320 * dt;
      step(dt);
    } else if (G) { G.fx.forEach(function (f) { f.t -= dt; }); }
    else scroll = (scroll + 40 * dt) % 48;
    draw();
    requestAnimationFrame(loop);
  }
  function start() {
    $('#ovStart').hidden = true; $('#ovEnd').hidden = true;
    newGame(); state = 'play';
  }
  function end(win) {
    state = 'end';
    var ov = $('#ovEnd'), btn = $('#btnNext');
    if (win) {
      level++; save('lastshot_level', level);
      if (level > best) { best = level; save('lastshot_best', best); }
      $('#endKicker').textContent = 'CLEAR'; $('#endTitle').textContent = '레벨 ' + (level - 1) + ' 클리어!';
      $('#endSub').textContent = '남은 부대 ' + G.n + '명 · 다음은 더 어려워요.';
      btn.textContent = '레벨 ' + level + ' 시작'; btn.classList.remove('red');
    } else {
      $('#endKicker').textContent = 'GAME OVER'; $('#endTitle').textContent = '부대가 쓰러졌어요';
      var pct = Math.min(100, Math.round(G.dist / G.length * 100));
      $('#endSub').textContent = '레벨 ' + level + ' · ' + pct + '%까지 왔어요. 문을 더 쏴서 키워 보세요.';
      btn.textContent = '다시 도전'; btn.classList.add('red');
    }
    ov.hidden = false; syncHud();
    setTimeout(function () { btn.focus({ preventScroll: true }); }, 50);
  }
  function next() { start(); }
  function home() {
    state = 'menu'; G = null;
    $('#ovEnd').hidden = true; $('#ovStart').hidden = false; syncHud();
  }
  function syncHud() {
    $('#hudLv').textContent = G ? G.L : level;
    $('#hudBest').textContent = best;
    $('#startLv').textContent = level;
    $('#btnReset').hidden = level <= 1;
    $('#hudProg').style.width = G ? Math.min(100, G.dist / G.length * 100) + '%' : '0%';
    var pw = $('#hudPow');
    if (G && G.pow) { pw.hidden = false; pw.textContent = '연사 ×' + (G.rate / 3.4).toFixed(1) + ' · 위력 ×' + G.dmg.toFixed(1); } else pw.hidden = true;
  }

  $('#btnStart').addEventListener('click', start);
  $('#btnNext').addEventListener('click', next);
  $('#btnHome').addEventListener('click', home);
  $('#btnReset').addEventListener('click', function () { level = 1; save('lastshot_level', 1); syncHud(); });
  window.addEventListener('resize', fit);
  document.addEventListener('visibilitychange', function () { last = performance.now(); });
  syncHud(); fit();
  // 확인용(?debug): 시간을 빨리 돌려 본다 — window.__ls.sim(초, 자동조종)
  if (/[?&]debug/.test(location.search)) window.__ls = { play: function (L) { level = L; start(); var G0 = G, peak = 0, atBoss = 0, bt0 = 0; for (var i = 0; i < 60 * 300 && state === 'play'; i++) { autoAim(); step(1 / 60); peak = Math.max(peak, G0.n); if (G0.boss && !atBoss) { atBoss = G0.n; bt0 = i; } } return { L: L, win: state === 'end' && G0.n > 0, n: G0.n, peak: peak, atBoss: atBoss, boss: G0.boss ? Math.round(G0.boss.hp) + '/' + G0.boss.max : '-', pct: Math.round(G0.dist / G0.length * 100), t: Math.round(i / 60), bt: Math.round((i - bt0) / 60) + 's@y' + (G0.boss ? Math.round(G0.boss.y) : 0) + ' H' + Math.round(H) }; }, sim: function (sec, auto) { for (var i = 0; i < sec * 60 && state === 'play'; i++) { if (auto) autoAim(); step(1 / 60); } draw(); return G; }, start: start };
  function autoAim() {   // 확인용 자동 조종: 가까운 문은 좋은 쪽, 보스 · 상자 · 적 순으로 겨눔
    var py = H - 120;
    var gt = G.gates.filter(function (x) { return !x.used && x.y > py - 420; }).sort(function (a, b) { return b.y - a.y; })[0];
    if (gt) { var p = gt.parts[0].t === 'x' || (gt.parts[1].t !== 'x' && gt.parts[0].v > gt.parts[1].v) ? gt.parts[0] : gt.parts[1]; G.tx = (p.x0 + p.x1) / 2; return; }
    if (G.boss) { G.tx = G.boss.x; return; }
    var bx = G.boxes.filter(function (x) { return x.y < py - 120; })[0];
    if (bx) { G.tx = bx.x; return; }
    var m = G.mobs.filter(function (x) { return x.y < py; }).sort(function (a, b) { return b.y - a.y; })[0];
    if (m) G.tx = m.x;
  }

  requestAnimationFrame(function (t) { last = t; loop(t); });
})();
