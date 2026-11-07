/* 라스트샷 — 세로 화면 달리기 슈팅
   손가락(또는 ← →)으로 좌우 이동. 부대는 앞으로 자동 사격.
   문: 쏘면 숫자 +1, 지나가면 부대 수가 바뀜(+ · − · ×). 적 무리: 머리 위 숫자가 맞을 때마다 줄어듦, 닿으면 한 명씩 잃음.
   상자: 숫자만큼 쏘면 부서지며 연사 · 위력 UP. 끝에 보스. 레벨이 오를수록 어려워짐. 결제 · 아이템 없음.
   그리기: 게임 계산은 위에서 본 평면(가로 360)으로 하고, 화면에는 원근(멀수록 작게)으로 투영해 그린다. */
(function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };
  var cv = $('#cv'), ctx = cv.getContext('2d');
  var W = 360, H = 640, S = 1, DPR = 1;
  var ROAD_L = 34, ROAD_R = 326, TOP = -90;
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── 저장 ── */
  function load(k, d) { try { var v = localStorage.getItem(k); return v === null ? d : +v || d; } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  var level = load('lastshot_level', 1), best = load('lastshot_best', 1), muted = load('lastshot_mute', 0) === 1;

  var G = null, state = 'menu', last = 0, scroll = 0, slow = 0;
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function ri(a, b) { return Math.floor(rnd(a, b + 1)); }

  /* ── 소리: 짧은 합성음(파일 없음) ── */
  var AC = null, lastShot = 0;
  function audio() { if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } if (AC && AC.state === 'suspended') AC.resume(); }
  function tone(f0, f1, dur, type, vol, noise) {
    if (muted || !AC) return;
    var t = AC.currentTime, g = AC.createGain(); g.connect(AC.destination);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    if (noise) {
      var buf = AC.createBuffer(1, Math.floor(AC.sampleRate * dur), AC.sampleRate), d = buf.getChannelData(0);
      for (var i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
      var src = AC.createBufferSource(); src.buffer = buf;
      var bp = AC.createBiquadFilter(); bp.type = 'lowpass'; bp.frequency.value = f0; src.connect(bp); bp.connect(g); src.start(t);
    } else {
      var o = AC.createOscillator(); o.type = type || 'square'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
      o.connect(g); o.start(t); o.stop(t + dur);
    }
  }
  var SFX = {
    shot: function () { var n = performance.now(); if (n - lastShot < 70) return; lastShot = n; tone(900, 300, .05, 'square', .025); },
    hit: function () { tone(1800, 600, .04, 'triangle', .03); },
    kill: function () { tone(2400, 200, .09, 'square', .035, true); },
    gateUp: function () { tone(660, 1320, .12, 'sine', .08); },
    gateDown: function () { tone(220, 90, .25, 'sawtooth', .07); },
    gateTick: function () { tone(1200, 1500, .03, 'sine', .03); },
    boom: function () { tone(700, 60, .45, 'square', .12, true); },
    hurt: function () { tone(160, 70, .15, 'sawtooth', .06); },
    power: function () { tone(520, 1560, .3, 'triangle', .09); },
    win: function () { [523, 659, 784, 1047].forEach(function (f, i) { setTimeout(function () { tone(f, f, .18, 'triangle', .09); }, i * 110); }); },
    lose: function () { [392, 330, 262].forEach(function (f, i) { setTimeout(function () { tone(f, f * .9, .25, 'sawtooth', .06); }, i * 160); }); }
  };
  function buzz(ms) { if (!muted && navigator.vibrate) try { navigator.vibrate(ms); } catch (e) {} }

  /* ── 레벨 ── */
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
      px: W / 2, tx: W / 2, n: 10 + L, shown: 10 + L,
      rate: 3.4, dmg: 1, cd: 0, pow: 0, flash: 0,
      bullets: [], gates: [], mobs: [], groups: [], boxes: [], boss: null, fx: [], texts: [], rings: [], tint: null,
      shake: 0
    };
    syncHud();
  }

  /* ── 놓기 ── */
  function spawn(e) {
    var L = G.L, y = TOP;
    if (e.kind === 'gate') {
      var good = Math.random() < .2 ? { t: 'x', v: 2 } : { t: '+', v: ri(3, 6) + Math.floor(L / 2) };
      var bad = { t: '+', v: -(ri(3, 6) + Math.floor(L * 1.5)) };
      if (Math.random() < .2 && L > 3) good = { t: '+', v: -(ri(1, 3) + Math.floor(L / 2)) };
      var left = Math.random() < .5, mid = (ROAD_L + ROAD_R) / 2, A = left ? good : bad, B = left ? bad : good;
      G.gates.push({ y: y, h: 46, used: false, parts: [
        { x0: ROAD_L, x1: mid - 3, t: A.t, v: A.v, hit: 0, acc: 0 },
        { x0: mid + 3, x1: ROAD_R, t: B.t, v: B.v, hit: 0, acc: 0 }
      ] });
    } else if (e.kind === 'mob') {
      var c = Math.min(3 + Math.floor(L * 1.3), 40), hp = 1 + Math.floor(L / 5), cx = rnd(ROAD_L + 60, ROAD_R - 60);
      var grp = { alive: c, shown: c, pop: 0 };
      G.groups.push(grp);
      for (var i = 0; i < c; i++) {
        var a = i * 2.39996, r = 9.5 * Math.sqrt(i + 1);
        G.mobs.push({ x: Math.max(ROAD_L + 10, Math.min(ROAD_R - 10, cx + Math.cos(a) * r * 1.4)), y: y - Math.abs(Math.sin(a) * r) - 10, hp: hp, max: hp,
          vy: 22 + Math.min(L, 25) * 1.6, step: Math.random() * 6, g: grp, flash: 0, kb: 0 });
      }
    } else if (e.kind === 'box') {
      var hpB = 14 + L * 7;
      G.boxes.push({ x: rnd(ROAD_L + 50, ROAD_R - 50), y: y, w: 64, h: 50, hp: hpB, max: hpB, gift: Math.random() < .5 ? 'rate' : 'dmg', flash: 0, pop: 0 });
    } else if (e.kind === 'boss') {
      var hpX = Math.round(150 + L * 120 + L * L * 8);
      G.boss = { x: W / 2, y: TOP - 20, r: 44, hp: hpX, max: hpX, vy: 14 + Math.min(L, 30) * .9, stop: H - 120 - 380, t: 0, flash: 0, pop: 0, acc: 0, accT: 0 };
    }
  }

  /* ── 부대 ── */
  function squadPos(n) {
    var p = [], m = Math.min(n, 60);
    for (var i = 0; i < m; i++) { var a = i * 2.39996, r = 8.4 * Math.sqrt(i); p.push([Math.cos(a) * r, Math.sin(a) * r * .75]); }
    return p;
  }
  function squadR(n) { return 8.4 * Math.sqrt(Math.min(n, 60)) + 11; }
  function lose(k, x, y) {   // 부대가 k 명 줄어듦: 쓰러지는 파란 조각
    if (k <= 0) return;
    G.n -= k;
    var m = Math.min(k, 14);
    for (var i = 0; i < m; i++) G.fx.push({ x: x + rnd(-14, 14), y: y + rnd(-8, 8), vx: rnd(-80, 80), vy: rnd(-200, -80), c: '#3b82f6', t: rnd(.4, .7), r: rnd(2.5, 4) });
  }

  /* ── 한 장면 ── */
  function step(dt) {
    var g = G, py = H - 120;
    g.dist += g.speed * dt;
    scroll = (scroll + g.speed * dt) % 48;
    while (g.next < g.ev.length && g.dist >= g.ev[g.next].d - (py - TOP)) spawn(g.ev[g.next++]);

    var R = squadR(g.n);
    g.tx = Math.max(ROAD_L + R, Math.min(ROAD_R - R, g.tx));
    g.px += (g.tx - g.px) * Math.min(1, dt * 14);

    // 사격
    g.cd -= dt; g.flash = Math.max(0, g.flash - dt);
    if (g.cd <= 0 && g.n > 0) {
      g.cd = 1 / g.rate; g.flash = .05;
      var shots = Math.min(g.n, 9), per = g.dmg * Math.max(1, Math.sqrt(g.n / 9));
      var spread = Math.min(R - 6, 4 + shots * 3);
      for (var s = 0; s < shots; s++) {
        var ox = shots === 1 ? 0 : -spread + (2 * spread) * s / (shots - 1);
        g.bullets.push({ x: g.px + ox, y: py - 12, y0: py - 12, d: per, vx: shots === 1 ? 0 : (s / (shots - 1) - .5) * 120 });
      }
      SFX.shot();
    }
    for (var b = g.bullets.length - 1; b >= 0; b--) {
      var B = g.bullets[b]; B.y -= 600 * dt; B.x += B.vx * dt;
      if (B.y < B.y0 - 470 || hitAny(B)) g.bullets.splice(b, 1);   // 사거리: 화면 가운데 위쯤까지
    }
    // 문
    g.gates.forEach(function (gt) {
      gt.y += g.speed * dt;
      gt.parts.forEach(function (p) { p.hit = Math.max(0, p.hit - dt * 5); });
      if (!gt.used && gt.y + gt.h / 2 >= py - 6) {
        gt.used = true;
        var p = gt.parts[g.px < gt.parts[1].x0 ? 0 : 1], before = g.n;
        var after = Math.max(0, Math.round(p.t === 'x' ? g.n * p.v : g.n + p.v));
        if (after < before) { lose(before - after, g.px, py); SFX.gateDown(); buzz(60); g.shake = .3; g.tint = { c: '239,68,68', t: .35 }; }
        else { g.n = after; SFX.gateUp(); g.tint = { c: '56,189,248', t: .3 }; g.rings.push({ x: g.px, y: py, r: 10, t: .4, c: '56,189,248' }); }
        float(g.px, py - 50, (after >= before ? '+' : '') + (after - before), after >= before ? '#7dd3fc' : '#f87171', 30);
        p.taken = true;
      }
    });
    g.gates = g.gates.filter(function (gt) { return gt.y < H + 80; });
    // 적
    for (var i = g.mobs.length - 1; i >= 0; i--) {
      var M = g.mobs[i];
      M.flash = Math.max(0, M.flash - dt); M.kb = Math.max(0, M.kb - dt * 60);
      M.y += (g.speed + M.vy) * dt - M.kb * dt * 8; M.step += dt * 12;
      if (M.y > py - 440) M.x += Math.sign(g.px - M.x) * Math.min(Math.abs(g.px - M.x), 58 * dt);
      var dx = M.x - g.px, dy = M.y - py;
      if (dy > -R && dy < R * .8 && Math.abs(dx) < R + 4) { g.mobs.splice(i, 1); M.g.alive--; lose(1, M.x, M.y); g.shake = Math.max(g.shake, .12); SFX.hurt(); burst(M.x, M.y, '#ef4444', 6); continue; }
      if (M.y > H + 30) { g.mobs.splice(i, 1); M.g.alive--; }
    }
    g.groups = g.groups.filter(function (q) { q.pop = Math.max(0, q.pop - dt * 6); if (q.shown > q.alive) q.shown = q.alive; return q.alive > 0; });
    // 상자
    for (var j = g.boxes.length - 1; j >= 0; j--) {
      var X = g.boxes[j]; X.y += g.speed * dt; X.flash = Math.max(0, X.flash - dt); X.pop = Math.max(0, X.pop - dt * 6);
      if (X.y + X.h / 2 > py - R * .6 && X.y - X.h / 2 < py + R * .6 && Math.abs(X.x - g.px) < X.w / 2 + R - 6) {
        g.boxes.splice(j, 1); var loss = Math.ceil(X.hp / 4); lose(loss, g.px, py); g.shake = .35; buzz(80); SFX.boom();
        float(g.px, py - 50, '-' + loss, '#f87171', 30); burst(X.x, X.y, '#b45309', 18); continue;
      }
      if (X.y > H + 60) g.boxes.splice(j, 1);
    }
    // 보스
    var K = g.boss;
    if (K) {
      K.t += dt; K.flash = Math.max(0, K.flash - dt); K.pop = Math.max(0, K.pop - dt * 6);
      if (K.y < K.stop) K.y += g.speed * .6 * dt; else K.y += K.vy * dt;
      K.x += Math.sin(K.t * 1.3) * 40 * dt;
      // 맞은 양을 모아서 0.15초마다 숫자로 튀게
      K.accT -= dt; if (K.acc > 0 && K.accT <= 0) { float(K.x + rnd(-30, 30), K.y - 10, '-' + Math.round(K.acc), '#fde68a', 18, true); K.acc = 0; K.accT = .15; }
      if (K.y + K.r > py - R * .5) lose(g.n, g.px, py);
    }
    // 효과
    g.fx = g.fx.filter(function (f) { f.t -= dt; f.x += f.vx * dt; f.y += f.vy * dt; f.vy += 420 * dt; return f.t > 0; });
    g.texts = g.texts.filter(function (t) { t.t -= dt; t.y -= (t.small ? 60 : 36) * dt; return t.t > 0; });
    g.rings = g.rings.filter(function (r) { r.t -= dt; r.r += 260 * dt; return r.t > 0; });
    if (g.tint) { g.tint.t -= dt; if (g.tint.t <= 0) g.tint = null; }
    g.shake = Math.max(0, g.shake - dt);
    if (g.shown > g.n) g.shown = Math.max(g.n, g.shown - Math.max(1, (g.shown - g.n) * dt * 10)); else g.shown = g.n;

    if (g.n <= 0) { g.n = 0; return end(false); }
    if (K && K.hp <= 0) {
      burst(K.x, K.y, '#ef4444', 50); burst(K.x, K.y, '#facc15', 40); g.rings.push({ x: K.x, y: K.y, r: 20, t: .6, c: '250,204,21' });
      g.boss = null; g.shake = .5; buzz([60, 40, 120]); SFX.boom(); slow = .9;
      setTimeout(function () { if (state === 'dying') end(true); }, 900);
      state = 'dying';
      return;
    }
    syncHud();
  }

  function hitAny(B) {
    var g = G, K = g.boss;
    if (K && Math.hypot(B.x - K.x, B.y - K.y) < K.r) {
      K.hp -= B.d; K.acc += B.d; K.flash = .06; K.pop = 1;
      spark(B.x, B.y + 6, '#fde68a', 3); SFX.hit(); g.shake = Math.max(g.shake, .06); return true;
    }
    for (var i = 0; i < g.mobs.length; i++) {
      var M = g.mobs[i];
      if (Math.abs(B.x - M.x) < 10 && Math.abs(B.y - M.y) < 12) {
        M.hp -= B.d; M.flash = .07; M.kb = 6; spark(B.x, M.y + 4, '#fecaca', 2);
        if (M.hp <= 0) { g.mobs.splice(i, 1); M.g.alive--; M.g.pop = 1; burst(M.x, M.y, '#ef4444', 7); SFX.kill(); }
        else SFX.hit();
        return true;
      }
    }
    for (var j = 0; j < g.boxes.length; j++) {
      var X = g.boxes[j];
      if (Math.abs(B.x - X.x) < X.w / 2 && Math.abs(B.y - X.y) < X.h / 2) {
        X.hp -= B.d; X.flash = .05; X.pop = 1; spark(B.x, X.y + X.h / 2 - 4, '#fde68a', 2); SFX.hit();
        if (X.hp <= 0) {
          g.boxes.splice(j, 1); burst(X.x, X.y, '#facc15', 22); burst(X.x, X.y, '#b45309', 14); g.rings.push({ x: X.x, y: X.y, r: 12, t: .45, c: '250,204,21' });
          if (X.gift === 'rate') { g.rate = Math.min(14, g.rate * 1.22); float(X.x, X.y - 10, '연사 UP!', '#facc15', 26); }
          else { g.dmg = +(g.dmg * 1.3).toFixed(2); float(X.x, X.y - 10, '위력 UP!', '#facc15', 26); }
          g.pow++; g.shake = .2; SFX.power(); buzz(40);
        }
        return true;
      }
    }
    for (var k = 0; k < g.gates.length; k++) {
      var gt = g.gates[k];
      if (gt.used || Math.abs(B.y - gt.y) > gt.h / 2) continue;
      for (var q = 0; q < 2; q++) {
        var p = gt.parts[q];
        if (B.x >= p.x0 && B.x <= p.x1) {
          if (p.t === '+') { p.acc++; if (p.acc >= 6) { p.acc = 0; p.v++; p.hit = 1; SFX.gateTick(); } }
          spark(B.x, gt.y + gt.h / 2, '#e0f2fe', 1);
          return true;
        }
      }
    }
    return false;
  }

  function float(x, y, s, c, size, small) { G.texts.push({ x: x, y: y, s: s, c: c, size: size || 18, t: small ? .5 : 1, small: small }); }
  function burst(x, y, c, n) {
    if (reduce) n = Math.ceil(n / 4);
    for (var i = 0; i < n; i++) G.fx.push({ x: x, y: y, vx: rnd(-140, 140), vy: rnd(-260, -60), c: c, t: rnd(.35, .7), r: rnd(2, 4.5) });
  }
  function spark(x, y, c, n) { for (var i = 0; i < n; i++) G.fx.push({ x: x, y: y, vx: rnd(-90, 90), vy: rnd(-40, 80), c: c, t: rnd(.08, .18), r: rnd(1.5, 2.5) }); }

  /* ── 원근 투영: 평면 y → 화면 y · 크기 ── */
  var HZ = 96;   // 지평선
  function proj(y) {
    var t = (y - TOP) / (H + 60 - TOP); if (t < 0) t = 0;
    var e = t * (.68 + .32 * t);              // 멀수록 촘촘히
    return { y: HZ + (H + 40 - HZ) * e, s: .42 + .64 * t };
  }
  function px(x, s) { return W / 2 + (x - W / 2) * s; }

  /* ── 그리기 ── */
  function draw() {
    ctx.setTransform(DPR * S, 0, 0, DPR * S, 0, 0);
    var g = G, sh = g && g.shake && !reduce ? g.shake * 22 : 0;
    ctx.save(); ctx.translate(rnd(-sh, sh), rnd(-sh, sh) * .6);
    // 하늘 · 물
    var sky = ctx.createLinearGradient(0, 0, 0, HZ + 20); sky.addColorStop(0, '#7dd3fc'); sky.addColorStop(1, '#e0f2fe');
    ctx.fillStyle = sky; ctx.fillRect(-20, -20, W + 40, HZ + 24);
    var sea = ctx.createLinearGradient(0, HZ, 0, H); sea.addColorStop(0, '#38bdf8'); sea.addColorStop(1, '#0369a1');
    ctx.fillStyle = sea; ctx.fillRect(-20, HZ, W + 40, H - HZ + 20);
    // 물결
    ctx.fillStyle = 'rgba(255,255,255,.18)';
    for (var w = 0; w < 22; w++) {
      var wy = TOP + ((w * 47 + scroll * 2.2) % (H + 60 - TOP)), P = proj(wy);
      ctx.fillRect(px(6 + (w % 3) * 6, P.s) - 30 * P.s, P.y, 18 * P.s, 2 * P.s);
      ctx.fillRect(px(W - 10 - (w % 2) * 6, P.s) + 14 * P.s, P.y, 18 * P.s, 2 * P.s);
    }
    // 길(사다리꼴) · 난간 · 차선
    var a = proj(TOP), z = proj(H + 60);
    poly([[px(ROAD_L - 14, a.s), a.y], [px(ROAD_R + 14, a.s), a.y], [px(ROAD_R + 14, z.s), z.y], [px(ROAD_L - 14, z.s), z.y]], '#334155');
    poly([[px(ROAD_L, a.s), a.y], [px(ROAD_R, a.s), a.y], [px(ROAD_R, z.s), z.y], [px(ROAD_L, z.s), z.y]], '#64748b');
    for (var y = TOP - 48 + scroll; y < H + 60; y += 48) {
      var p1 = proj(y), p2 = proj(y + 22);
      poly([[px(W / 2 - 2, p1.s), p1.y], [px(W / 2 + 2, p1.s), p1.y], [px(W / 2 + 2, p2.s), p2.y], [px(W / 2 - 2, p2.s), p2.y]], 'rgba(255,255,255,.6)');
      var q = proj(y + 10);
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(px(ROAD_L - 10, q.s) - 2 * q.s, q.y - 16 * q.s, 4 * q.s, 16 * q.s);
      ctx.fillRect(px(ROAD_R + 10, q.s) - 2 * q.s, q.y - 16 * q.s, 4 * q.s, 16 * q.s);
    }
    line(px(ROAD_L - 10, a.s), a.y - 12 * a.s, px(ROAD_L - 10, z.s), z.y - 16 * z.s, '#f1f5f9', 2);
    line(px(ROAD_R + 10, a.s), a.y - 12 * a.s, px(ROAD_R + 10, z.s), z.y - 16 * z.s, '#f1f5f9', 2);
    if (!g) { ctx.restore(); return; }

    var py = H - 120;
    // 멀리 있는 것부터: 문 · 상자 · 적 · 보스를 y 순으로
    var items = [];
    g.gates.forEach(function (o) { items.push({ y: o.y, f: drawGate, o: o }); });
    g.boxes.forEach(function (o) { items.push({ y: o.y, f: drawBox, o: o }); });
    g.mobs.forEach(function (o) { items.push({ y: o.y, f: drawMob, o: o }); });
    if (g.boss) items.push({ y: g.boss.y, f: drawBoss, o: g.boss });
    items.sort(function (p, q) { return p.y - q.y; }).forEach(function (it) { it.f(it.o); });
    // 적 무리 숫자: 무리 맨 앞 위에, 줄어들 때 튐
    g.groups.forEach(function (q) {
      var top = null, sx = 0, n = 0;
      g.mobs.forEach(function (M) { if (M.g === q) { sx += M.x; n++; if (!top || M.y < top.y) top = M; } });
      if (!top) return;
      var P = proj(top.y - 22), x = px(sx / n, P.s), sc = P.s * (1 + q.pop * .35);
      pill(x, P.y, String(q.alive), sc, '#dc2626');
    });
    // 총알: 빛나는 줄
    ctx.globalCompositeOperation = 'lighter';
    g.bullets.forEach(function (B) {
      var P = proj(B.y), x = px(B.x, P.s);
      ctx.fillStyle = 'rgba(253,224,71,.35)'; ctx.fillRect(x - 3 * P.s, P.y - 12 * P.s, 6 * P.s, 16 * P.s);
      ctx.fillStyle = '#fef9c3'; ctx.fillRect(x - 1.2 * P.s, P.y - 10 * P.s, 2.4 * P.s, 12 * P.s);
    });
    ctx.globalCompositeOperation = 'source-over';
    // 내 부대
    var pos = squadPos(g.n), PP = proj(py);
    for (var i = pos.length - 1; i >= 0; i--) {
      var Q = proj(py + pos[i][1]);
      soldier(px(g.px + pos[i][0], Q.s), Q.y, Q.s * 1.4, '#2563eb', '#1e3a8a', 0, true);
      if (g.flash > 0 && i < 9) { ctx.fillStyle = 'rgba(254,240,138,.9)'; ctx.beginPath(); ctx.arc(px(g.px + pos[i][0], Q.s), Q.y - 14 * Q.s, 3.5 * Q.s, 0, 7); ctx.fill(); }
    }
    var R = squadR(g.n), LB = proj(py + R * .75 + 14);
    pill(px(g.px, LB.s), LB.y, String(Math.round(g.shown)), LB.s * 1.15, '#1d4ed8');
    // 효과
    g.rings.forEach(function (r) { var P = proj(r.y); ctx.strokeStyle = 'rgba(' + r.c + ',' + (r.t * 2) + ')'; ctx.lineWidth = 4 * P.s; ctx.beginPath(); ctx.ellipse(px(r.x, P.s), P.y, r.r * P.s, r.r * P.s * .5, 0, 0, 7); ctx.stroke(); });
    g.fx.forEach(function (f) { var P = proj(f.y); ctx.globalAlpha = Math.min(1, f.t * 3); ctx.fillStyle = f.c; ctx.fillRect(px(f.x, P.s), P.y, f.r * P.s * 1.3, f.r * P.s * 1.3); });
    ctx.globalAlpha = 1;
    g.texts.forEach(function (t) {
      var P = proj(t.y), life = t.small ? t.t / .5 : t.t;
      ctx.globalAlpha = Math.min(1, life * 2.2);
      var pop = life > .85 ? 1 + (life - .85) * 3 : 1;
      text(t.s, px(t.x, P.s), P.y, t.size * Math.max(.7, P.s) * pop, t.c, true);
    });
    ctx.globalAlpha = 1;
    ctx.restore();
    if (g.tint) { ctx.fillStyle = 'rgba(' + g.tint.c + ',' + (g.tint.t * .45) + ')'; ctx.fillRect(0, 0, W, H); }
  }

  function drawGate(gt) {
    var P = proj(gt.y), top = proj(gt.y - gt.h), hgt = P.y - top.y;
    gt.parts.forEach(function (p) {
      var good = p.t === 'x' || p.v >= 0, col = good ? '37,99,235' : '220,38,38';
      var x0 = px(p.x0, P.s), x1 = px(p.x1, P.s), alpha = p.taken ? .2 : .5 + p.hit * .35;
      var gr = ctx.createLinearGradient(0, top.y, 0, P.y);
      gr.addColorStop(0, 'rgba(' + col + ',' + (alpha * .5) + ')'); gr.addColorStop(1, 'rgba(' + col + ',' + alpha + ')');
      ctx.fillStyle = gr; ctx.fillRect(x0, top.y, x1 - x0, hgt);
      ctx.fillStyle = good ? '#1d4ed8' : '#b91c1c';
      ctx.fillRect(x0 - 3 * P.s, top.y - 8 * P.s, 7 * P.s, hgt + 8 * P.s); ctx.fillRect(x1 - 4 * P.s, top.y - 8 * P.s, 7 * P.s, hgt + 8 * P.s);
      ctx.fillStyle = 'rgba(255,255,255,' + (.25 + p.hit * .4) + ')'; ctx.fillRect(x0, top.y, x1 - x0, 3 * P.s);
      var label = p.t === 'x' ? '×' + p.v : (p.v > 0 ? '+' : '') + p.v;
      text(label, (x0 + x1) / 2, top.y + hgt * .55, (34 + p.hit * 8) * P.s, '#fff', true);
    });
  }
  function drawBox(X) {
    var P = proj(X.y + X.h / 2), T = proj(X.y - X.h / 2), x = px(X.x, P.s), w = X.w * P.s, h = P.y - T.y + 14 * P.s;
    var j = X.flash > 0 ? rnd(-2, 2) : 0;
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(x, P.y, w * .55, 7 * P.s, 0, 0, 7); ctx.fill();
    ctx.fillStyle = X.flash > 0 ? '#fff7ed' : '#92400e'; rr(x - w / 2 + j, P.y - h, w, h, 6 * P.s); ctx.fill();
    ctx.fillStyle = X.flash > 0 ? '#ffffff' : '#b45309'; rr(x - w / 2 + 4 * P.s + j, P.y - h + 4 * P.s, w - 8 * P.s, h * .45, 4 * P.s); ctx.fill();
    ctx.strokeStyle = '#78350f'; ctx.lineWidth = 3 * P.s; ctx.strokeRect(x - w / 2 + j, P.y - h, w, h);
    pill(x, P.y - h - 12 * P.s, X.gift === 'rate' ? '연사' : '위력', P.s * .85, '#ca8a04');
    text(Math.max(0, Math.ceil(X.hp)), x + j, P.y - h * .45, 26 * P.s * (1 + X.pop * .25), '#fff', true);
  }
  function drawMob(M) {
    var P = proj(M.y);
    soldier(px(M.x, P.s), P.y + Math.sin(M.step) * P.s, P.s * 1.4, '#dc2626', '#7f1d1d', M.flash, false);
  }
  function drawBoss(K) {
    var P = proj(K.y), x = px(K.x, P.s), r = K.r * P.s * 1.6, j = K.flash > 0 ? rnd(-2, 2) : 0;
    ctx.save(); ctx.translate(x + j, P.y);
    ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(0, r * .85, r * 1.1, r * .32, 0, 0, 7); ctx.fill();
    ctx.fillStyle = K.flash > 0 ? '#ffffff' : '#7f1d1d'; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill();
    ctx.fillStyle = K.flash > 0 ? '#fee2e2' : '#b91c1c'; ctx.beginPath(); ctx.arc(0, -r * .1, r * .82, 0, 7); ctx.fill();
    ctx.fillStyle = '#450a0a'; ctx.beginPath(); ctx.arc(0, -r * .25, r * .62, Math.PI, 0); ctx.fill();
    ctx.fillStyle = '#fde047'; ctx.fillRect(-r * .38, -r * .05, r * .24, r * .14); ctx.fillRect(r * .14, -r * .05, r * .24, r * .14);
    ctx.fillStyle = '#1f2937'; ctx.fillRect(-r * .12, r * .4, r * .24, r * .7);
    ctx.restore();
    var bw = 170 * Math.max(.6, P.s), by = P.y - r - 26 * P.s;
    ctx.fillStyle = 'rgba(15,23,42,.75)'; rr(x - bw / 2, by, bw, 12, 6); ctx.fill();
    ctx.fillStyle = '#ef4444'; rr(x - bw / 2, by, bw * Math.max(0, K.hp / K.max), 12, 6); ctx.fill();
    text(Math.max(0, Math.ceil(K.hp)), x, by - 16, 26 * (1 + K.pop * .2), '#fff', true);
  }
  function soldier(x, y, s, body, dark, flash, me) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s * 1.2, s * 1.2);
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(0, 7, 6, 2.5, 0, 0, 7); ctx.fill();
    ctx.fillStyle = flash > 0 ? '#ffffff' : body; ctx.beginPath(); ctx.arc(0, 2, 5.5, 0, 7); ctx.fill();
    ctx.fillStyle = flash > 0 ? '#ffffff' : dark; ctx.beginPath(); ctx.arc(0, -2, 4.6, Math.PI, 0); ctx.fill();
    ctx.fillStyle = '#fcd34d'; ctx.beginPath(); ctx.arc(0, 1, 2.4, 0, 7); ctx.fill();
    if (me) { ctx.fillStyle = '#111827'; ctx.fillRect(1.5, -9, 2, 7); }
    ctx.restore();
  }
  function pill(x, y, s, sc, col) {
    var fs = 15 * sc; ctx.font = '900 ' + fs + 'px Pretendard, sans-serif';
    var w = Math.max(fs * 2, ctx.measureText(s).width + fs * 1.1), h = fs * 1.45;
    ctx.fillStyle = col; rr(x - w / 2, y - h / 2, w, h, h / 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 1.5; ctx.stroke();
    text(s, x, y + fs * .04, fs, '#fff', false);
  }
  function poly(pts, c) { ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath(); ctx.fill(); }
  function line(x0, y0, x1, y1, c, w) { ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); }
  function rr(x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function text(s, x, y, size, c, stroke) {
    ctx.font = '900 ' + size + 'px Pretendard, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    if (stroke) { ctx.lineWidth = Math.max(3, size / 5); ctx.strokeStyle = 'rgba(15,23,42,.9)'; ctx.lineJoin = 'round'; ctx.strokeText(s, x, y); }
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
  cv.addEventListener('pointerdown', function (e) { if (state !== 'play') return; dragX = e.clientX; dragTx = G.tx; try { cv.setPointerCapture(e.pointerId); } catch (_) {} });
  cv.addEventListener('pointermove', function (e) { if (dragX === null || state !== 'play') return; G.tx = dragTx + (e.clientX - dragX) / S * 1.15; });
  var up = function () { dragX = null; };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  var keys = {};
  window.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'a' || e.key === 'd') { keys[e.key] = true; e.preventDefault(); }
    if ((e.key === 'Enter' || e.key === ' ') && (state === 'menu' || state === 'end')) { e.preventDefault(); start(); }
  });
  window.addEventListener('keyup', function (e) { keys[e.key] = false; });

  /* ── 흐름 ── */
  function loop(t) {
    var dt = Math.min(.033, (t - last) / 1000 || 0); last = t;
    if (slow > 0) { slow -= dt; dt *= .3; }
    if (state === 'play') {
      var k = (keys.ArrowLeft || keys.a ? -1 : 0) + (keys.ArrowRight || keys.d ? 1 : 0);
      if (k) G.tx += k * 320 * dt;
      step(dt);
    } else if (G) {
      G.fx = G.fx.filter(function (f) { f.t -= dt; f.x += f.vx * dt; f.y += f.vy * dt; f.vy += 420 * dt; return f.t > 0; });
      G.rings = G.rings.filter(function (r) { r.t -= dt; r.r += 260 * dt; return r.t > 0; });
      G.texts = G.texts.filter(function (x) { x.t -= dt; return x.t > 0; });
      G.shake = Math.max(0, G.shake - dt);
    } else scroll = (scroll + 40 * dt) % 48;
    draw();
    requestAnimationFrame(loop);
  }
  function start() {
    audio();
    $('#ovStart').hidden = true; $('#ovEnd').hidden = true;
    newGame(); state = 'play';
  }
  function end(win) {
    state = 'end';
    var btn = $('#btnNext');
    if (win) {
      level++; save('lastshot_level', level);
      if (level > best) { best = level; save('lastshot_best', best); }
      $('#endKicker').textContent = 'CLEAR'; $('#endTitle').textContent = '레벨 ' + (level - 1) + ' 클리어!';
      $('#endSub').textContent = '남은 부대 ' + G.n + '명 · 다음은 더 어려워요.';
      btn.textContent = '레벨 ' + level + ' 시작'; btn.classList.remove('red'); SFX.win();
    } else {
      $('#endKicker').textContent = 'GAME OVER'; $('#endTitle').textContent = '부대가 쓰러졌어요';
      var pct = Math.min(100, Math.round(G.dist / G.length * 100));
      $('#endSub').textContent = '레벨 ' + level + ' · ' + pct + '%까지 왔어요. 문을 더 쏴서 키워 보세요.';
      btn.textContent = '다시 도전'; btn.classList.add('red'); SFX.lose(); buzz(200);
    }
    $('#ovEnd').hidden = false; syncHud();
    setTimeout(function () { try { btn.focus({ preventScroll: true }); } catch (e) {} }, 50);
  }
  function home() { state = 'menu'; G = null; $('#ovEnd').hidden = true; $('#ovStart').hidden = false; syncHud(); }
  function syncHud() {
    $('#hudLv').textContent = G ? G.L : level;
    $('#hudBest').textContent = best;
    $('#startLv').textContent = level;
    $('#btnReset').hidden = level <= 1;
    $('#hudProg').style.width = G ? Math.min(100, G.dist / G.length * 100) + '%' : '0%';
    var pw = $('#hudPow');
    if (G && G.pow) { pw.hidden = false; pw.textContent = '연사 ×' + (G.rate / 3.4).toFixed(1) + ' · 위력 ×' + G.dmg.toFixed(1); } else pw.hidden = true;
  }
  function paintMute() { var b = $('#btnMute'); b.setAttribute('aria-pressed', muted ? 'true' : 'false'); b.textContent = muted ? '소리 끔' : '소리 켬'; }

  $('#btnStart').addEventListener('click', start);
  $('#btnNext').addEventListener('click', start);
  $('#btnHome').addEventListener('click', home);
  $('#btnReset').addEventListener('click', function () { level = 1; save('lastshot_level', 1); syncHud(); });
  $('#btnMute').addEventListener('click', function () { muted = !muted; save('lastshot_mute', muted ? 1 : 0); paintMute(); if (!muted) audio(); });
  window.addEventListener('resize', fit);
  document.addEventListener('visibilitychange', function () { last = performance.now(); });
  syncHud(); paintMute(); fit();

  // 확인용(?debug): window.__ls.play(레벨) = 자동 조종으로 한 판, sim(초) = 지금 판을 빨리 돌림
  if (/[?&]debug/.test(location.search)) window.__ls = {
    start: start,
    sim: function (sec) { for (var i = 0; i < sec * 60 && state === 'play'; i++) { autoAim(); step(1 / 60); } draw(); return G; },
    play: function (L) { muted = true; level = L; start(); var G0 = G; for (var i = 0; i < 60 * 300 && state === 'play'; i++) { autoAim(); step(1 / 60); } return { L: L, win: G0.n > 0 && !G0.boss, n: G0.n, pct: Math.round(G0.dist / G0.length * 100) }; }
  };
  function autoAim() {
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
