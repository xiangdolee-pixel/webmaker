/* 라스트샷 — 세로 화면 달리기 슈팅 (3D)
   손가락(또는 ← →)으로 좌우 이동. 부대는 앞으로 자동 사격.
   문: 쏘면 숫자 +1, 지나가면 부대 수가 바뀜(+ · − · ×). 적 무리: 머리 위 숫자가 맞을 때마다 줄어듦, 닿으면 한 명씩 잃음.
   상자: 숫자만큼 쏘면 부서지며 연사 · 위력 UP. 끝에 보스. 레벨이 오를수록 어려워짐. 결제 · 아이템 없음.
   구조: 게임 계산은 위에서 본 평면(가로 360, 세로 H)으로 하고, 그림은 three.js 3D(#gl) + 숫자 · 효과 겹침(#cv 2D). */
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.min.js';

const $ = (s) => document.querySelector(s);
const cv = $('#cv'), ctx = cv.getContext('2d'), glc = $('#gl');
let W = 360, H = 640, CW = 360, CH = 640, DPR = 1;
const ROAD_L = 34, ROAD_R = 326, TOP = -90, U = 22;      // U: 평면 22 = 3D 1칸
const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ── 저장 ── */
function load(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : +v || d; } catch (e) { return d; } }
function save(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
let level = load('lastshot_level', 1), best = load('lastshot_best', 1), muted = load('lastshot_mute', 0) === 1;

let G = null, state = 'menu', last = 0, scroll = 0, slow = 0;
const rnd = (a, b) => a + Math.random() * (b - a);
const ri = (a, b) => Math.floor(rnd(a, b + 1));

/* ── 소리: 짧은 합성음 ── */
let AC = null, lastShot = 0;
function audio() { if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } if (AC && AC.state === 'suspended') AC.resume(); }
function tone(f0, f1, dur, type, vol, noise) {
  if (muted || !AC) return;
  const t = AC.currentTime, g = AC.createGain(); g.connect(AC.destination);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
  if (noise) {
    const buf = AC.createBuffer(1, Math.floor(AC.sampleRate * dur), AC.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = AC.createBufferSource(); src.buffer = buf;
    const lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = f0; src.connect(lp); lp.connect(g); src.start(t);
  } else {
    const o = AC.createOscillator(); o.type = type || 'square'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t + dur);
    o.connect(g); o.start(t); o.stop(t + dur);
  }
}
const SFX = {
  shot() { const n = performance.now(); if (n - lastShot < 70) return; lastShot = n; tone(900, 300, .05, 'square', .025); },
  hit() { tone(1800, 600, .04, 'triangle', .03); },
  kill() { tone(2400, 200, .09, 'square', .035, true); },
  gateUp() { tone(660, 1320, .12, 'sine', .08); },
  gateDown() { tone(220, 90, .25, 'sawtooth', .07); },
  gateTick() { tone(1200, 1500, .03, 'sine', .03); },
  boom() { tone(700, 60, .45, 'square', .12, true); },
  hurt() { tone(160, 70, .15, 'sawtooth', .06); },
  power() { tone(520, 1560, .3, 'triangle', .09); },
  win() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, f, .18, 'triangle', .09), i * 110)); },
  lose() { [392, 330, 262].forEach((f, i) => setTimeout(() => tone(f, f * .9, .25, 'sawtooth', .06), i * 160)); }
};
function buzz(ms) { if (!muted && navigator.vibrate) try { navigator.vibrate(ms); } catch (e) {} }

/* ══════════ 게임 계산 (평면) ══════════ */
function makeLevel(L) {
  const ev = []; let d = 520; const rows = Math.min(7 + L, 22);
  for (let i = 0; i < rows; i++) {
    const k = i % 3;
    if (k === 0) ev.push({ d, kind: 'gate' });
    else if (k === 1) ev.push({ d, kind: 'mob' });
    else ev.push({ d, kind: Math.random() < .55 ? 'box' : 'mob' });
    d += Math.max(250, 330 - L * 4);
  }
  ev.push({ d: d + 160, kind: 'boss' });
  return { ev, length: d + 160 };
}
function newGame() {
  const L = level, lv = makeLevel(L);
  G = { L, ev: lv.ev, length: lv.length, dist: 0, next: 0, speed: 78 + Math.min(L, 30) * 2.2,
    px: W / 2, tx: W / 2, n: 10 + L, shown: 10 + L, rate: 3.4, dmg: 1, cd: 0, pow: 0, flash: 0,
    bullets: [], gates: [], mobs: [], groups: [], boxes: [], boss: null, fx: [], texts: [], rings: [], tint: null, shake: 0, t: 0 };
  clearScene(); syncHud();
}
function spawn(e) {
  const L = G.L, y = TOP;
  if (e.kind === 'gate') {
    let good = Math.random() < .2 ? { t: 'x', v: 2 } : { t: '+', v: ri(3, 6) + Math.floor(L / 2) };
    const bad = { t: '+', v: -(ri(3, 6) + Math.floor(L * 1.5)) };
    if (Math.random() < .2 && L > 3) good = { t: '+', v: -(ri(1, 3) + Math.floor(L / 2)) };
    const left = Math.random() < .5, mid = (ROAD_L + ROAD_R) / 2, A = left ? good : bad, B = left ? bad : good;
    G.gates.push({ y, h: 46, used: false, parts: [
      { x0: ROAD_L, x1: mid - 3, t: A.t, v: A.v, hit: 0, acc: 0 },
      { x0: mid + 3, x1: ROAD_R, t: B.t, v: B.v, hit: 0, acc: 0 }] });
  } else if (e.kind === 'mob') {
    const c = Math.min(3 + Math.floor(L * 1.3), 40), hp = 1 + Math.floor(L / 5), cx = rnd(ROAD_L + 60, ROAD_R - 60);
    const grp = { alive: c, pop: 0 }; G.groups.push(grp);
    for (let i = 0; i < c; i++) {
      const a = i * 2.39996, r = 9.5 * Math.sqrt(i + 1);
      G.mobs.push({ x: Math.max(ROAD_L + 10, Math.min(ROAD_R - 10, cx + Math.cos(a) * r * 1.4)), y: y - Math.abs(Math.sin(a) * r) - 10, hp, max: hp,
        vy: 22 + Math.min(L, 25) * 1.6, step: Math.random() * 6, g: grp, flash: 0, kb: 0 });
    }
  } else if (e.kind === 'box') {
    const hpB = 14 + L * 7;
    G.boxes.push({ x: rnd(ROAD_L + 50, ROAD_R - 50), y, w: 64, h: 50, hp: hpB, max: hpB, gift: Math.random() < .5 ? 'rate' : 'dmg', flash: 0, pop: 0 });
  } else if (e.kind === 'boss') {
    const hpX = Math.round(150 + L * 120 + L * L * 8);
    G.boss = { x: W / 2, y: TOP - 20, r: 44, hp: hpX, max: hpX, vy: 14 + Math.min(L, 30) * .9, stop: H - 120 - 380, t: 0, flash: 0, pop: 0, acc: 0, accT: 0 };
  }
}
function squadPos(n) {
  const p = [], m = Math.min(n, 60);
  for (let i = 0; i < m; i++) { const a = i * 2.39996, r = 8.4 * Math.sqrt(i); p.push([Math.cos(a) * r, Math.sin(a) * r * .75]); }
  return p;
}
const squadR = (n) => 8.4 * Math.sqrt(Math.min(n, 60)) + 11;
function lose(k, x, y) {
  if (k <= 0) return;
  G.n -= k;
  for (let i = 0; i < Math.min(k, 14); i++) G.fx.push({ x: x + rnd(-14, 14), y: y + rnd(-8, 8), h: 18, vx: rnd(-80, 80), vh: rnd(80, 200), c: '#3b82f6', t: rnd(.4, .7), r: rnd(3, 5) });
}
function step(dt) {
  const g = G, py = H - 120;
  g.t += dt; g.dist += g.speed * dt;
  scroll = (scroll + g.speed * dt) % 48;
  while (g.next < g.ev.length && g.dist >= g.ev[g.next].d - (py - TOP)) spawn(g.ev[g.next++]);
  const R = squadR(g.n);
  g.tx = Math.max(ROAD_L + R, Math.min(ROAD_R - R, g.tx));
  g.px += (g.tx - g.px) * Math.min(1, dt * 14);
  g.cd -= dt; g.flash = Math.max(0, g.flash - dt);
  if (g.cd <= 0 && g.n > 0) {
    g.cd = 1 / g.rate; g.flash = .06;
    const shots = Math.min(g.n, 9), per = g.dmg * Math.max(1, Math.sqrt(g.n / 9)), spread = Math.min(R - 6, 4 + shots * 3);
    for (let s = 0; s < shots; s++) {
      const ox = shots === 1 ? 0 : -spread + (2 * spread) * s / (shots - 1);
      const by = py - 12 - Math.random() * 16;
      g.bullets.push({ x: g.px + ox, y: by, y0: by, d: per, vx: shots === 1 ? 0 : (s / (shots - 1) - .5) * 120 });
    }
    SFX.shot();
  }
  for (let b = g.bullets.length - 1; b >= 0; b--) {
    const B = g.bullets[b]; B.y -= 600 * dt; B.x += B.vx * dt;
    if (B.y < B.y0 - 470 || hitAny(B)) g.bullets.splice(b, 1);
  }
  g.gates.forEach((gt) => {
    gt.y += g.speed * dt;
    gt.parts.forEach((p) => { p.hit = Math.max(0, p.hit - dt * 5); });
    if (!gt.used && gt.y + gt.h / 2 >= py - 6) {
      gt.used = true;
      const p = gt.parts[g.px < gt.parts[1].x0 ? 0 : 1], before = g.n;
      const after = Math.max(0, Math.round(p.t === 'x' ? g.n * p.v : g.n + p.v));
      if (after < before) { lose(before - after, g.px, py); SFX.gateDown(); buzz(60); g.shake = .3; g.tint = { c: '239,68,68', t: .35 }; }
      else { g.n = after; SFX.gateUp(); g.tint = { c: '56,189,248', t: .3 }; g.rings.push({ x: g.px, y: py, r: 10, t: .4, c: '56,189,248' }); }
      float(g.px, py - 30, (after >= before ? '+' : '') + (after - before), after >= before ? '#7dd3fc' : '#f87171', 34);
      p.taken = true;
    }
  });
  g.gates = g.gates.filter((gt) => gt.y < H + 80);
  for (let i = g.mobs.length - 1; i >= 0; i--) {
    const M = g.mobs[i];
    M.flash = Math.max(0, M.flash - dt); M.kb = Math.max(0, M.kb - dt * 60);
    M.y += (g.speed + M.vy) * dt - M.kb * dt * 8; M.step += dt * 9;
    if (M.y > py - 440) M.x += Math.sign(g.px - M.x) * Math.min(Math.abs(g.px - M.x), 58 * dt);
    const dx = M.x - g.px, dy = M.y - py;
    if (dy > -R && dy < R * .8 && Math.abs(dx) < R + 4) { g.mobs.splice(i, 1); M.g.alive--; lose(1, M.x, M.y); g.shake = Math.max(g.shake, .12); SFX.hurt(); burst(M.x, M.y, '#ef4444', 6); continue; }
    if (M.y > H + 30) { g.mobs.splice(i, 1); M.g.alive--; }
  }
  g.groups = g.groups.filter((q) => { q.pop = Math.max(0, q.pop - dt * 6); return q.alive > 0; });
  for (let j = g.boxes.length - 1; j >= 0; j--) {
    const X = g.boxes[j]; X.y += g.speed * dt; X.flash = Math.max(0, X.flash - dt); X.pop = Math.max(0, X.pop - dt * 6);
    if (X.y + X.h / 2 > py - R * .6 && X.y - X.h / 2 < py + R * .6 && Math.abs(X.x - g.px) < X.w / 2 + R - 6) {
      g.boxes.splice(j, 1); const loss = Math.ceil(X.hp / 4); lose(loss, g.px, py); g.shake = .35; buzz(80); SFX.boom();
      float(g.px, py - 30, '-' + loss, '#f87171', 34); burst(X.x, X.y, '#b45309', 18); continue;
    }
    if (X.y > H + 60) g.boxes.splice(j, 1);
  }
  const K = g.boss;
  if (K) {
    K.t += dt; K.flash = Math.max(0, K.flash - dt); K.pop = Math.max(0, K.pop - dt * 6);
    if (K.y < K.stop) K.y += g.speed * .6 * dt; else K.y += K.vy * dt;
    K.x += Math.sin(K.t * 1.3) * 40 * dt;
    K.accT -= dt; if (K.acc > 0 && K.accT <= 0) { float(K.x + rnd(-30, 30), K.y, '-' + Math.round(K.acc), '#fde68a', 20, true, 70); K.acc = 0; K.accT = .15; }
    if (K.y + K.r > py - R * .5) lose(g.n, g.px, py);
  }
  g.fx = g.fx.filter((f) => { f.t -= dt; f.x += f.vx * dt; f.h += f.vh * dt; f.vh -= 520 * dt; if (f.h < 0) { f.h = 0; f.vh *= -.3; } f.y += g.speed * dt * .5; return f.t > 0; });
  g.texts = g.texts.filter((t) => { t.t -= dt; t.h += (t.small ? 40 : 26) * dt; return t.t > 0; });
  g.rings = g.rings.filter((r) => { r.t -= dt; r.r += 260 * dt; return r.t > 0; });
  if (g.tint) { g.tint.t -= dt; if (g.tint.t <= 0) g.tint = null; }
  g.shake = Math.max(0, g.shake - dt);
  if (g.shown > g.n) g.shown = Math.max(g.n, g.shown - Math.max(1, (g.shown - g.n) * dt * 10)); else g.shown = g.n;
  if (g.n <= 0) { g.n = 0; return end(false); }
  if (K && K.hp <= 0) {
    burst(K.x, K.y, '#ef4444', 50, 60); burst(K.x, K.y, '#facc15', 40, 60); g.rings.push({ x: K.x, y: K.y, r: 20, t: .6, c: '250,204,21' });
    g.boss = null; g.shake = .5; buzz([60, 40, 120]); SFX.boom(); slow = .9; state = 'dying';
    setTimeout(() => { if (state === 'dying') end(true); }, 900);
    return;
  }
  syncHud();
}
function hitAny(B) {
  const g = G, K = g.boss;
  if (K && Math.hypot(B.x - K.x, B.y - K.y) < K.r) {
    K.hp -= B.d; K.acc += B.d; K.flash = .06; K.pop = 1; spark(B.x, B.y + 8, '#fde68a', 3, 40); SFX.hit(); g.shake = Math.max(g.shake, .05); return true;
  }
  for (let i = 0; i < g.mobs.length; i++) {
    const M = g.mobs[i];
    if (Math.abs(B.x - M.x) < 10 && Math.abs(B.y - M.y) < 12) {
      M.hp -= B.d; M.flash = .08; M.kb = 6; spark(B.x, M.y + 4, '#fecaca', 2, 18);
      if (M.hp <= 0) { g.mobs.splice(i, 1); M.g.alive--; M.g.pop = 1; burst(M.x, M.y, '#ef4444', 8); SFX.kill(); } else SFX.hit();
      return true;
    }
  }
  for (let j = 0; j < g.boxes.length; j++) {
    const X = g.boxes[j];
    if (Math.abs(B.x - X.x) < X.w / 2 && Math.abs(B.y - X.y) < X.h / 2) {
      X.hp -= B.d; X.flash = .05; X.pop = 1; spark(B.x, X.y + X.h / 2, '#fde68a', 2, 16); SFX.hit();
      if (X.hp <= 0) {
        g.boxes.splice(j, 1); burst(X.x, X.y, '#facc15', 22, 20); burst(X.x, X.y, '#b45309', 16, 20); g.rings.push({ x: X.x, y: X.y, r: 12, t: .45, c: '250,204,21' });
        if (X.gift === 'rate') { g.rate = Math.min(14, g.rate * 1.22); float(X.x, X.y, '연사 UP!', '#facc15', 28); }
        else { g.dmg = +(g.dmg * 1.3).toFixed(2); float(X.x, X.y, '위력 UP!', '#facc15', 28); }
        g.pow++; g.shake = .2; SFX.power(); buzz(40);
      }
      return true;
    }
  }
  for (const gt of g.gates) {
    if (gt.used || Math.abs(B.y - gt.y) > gt.h / 2) continue;
    for (const p of gt.parts) {
      if (B.x >= p.x0 && B.x <= p.x1) {
        if (p.t === '+') { p.acc++; if (p.acc >= 6) { p.acc = 0; p.v++; p.hit = 1; SFX.gateTick(); } }
        spark(B.x, gt.y + gt.h / 2, '#e0f2fe', 1, 30);
        return true;
      }
    }
  }
  return false;
}
function float(x, y, s, c, size, small, h) { G.texts.push({ x, y, h: h || 40, s, c, size: size || 18, t: small ? .5 : 1, small }); }
function burst(x, y, c, n, h) {
  if (reduce) n = Math.ceil(n / 4);
  for (let i = 0; i < n; i++) G.fx.push({ x, y, h: h || 18, vx: rnd(-140, 140), vh: rnd(60, 260), c, t: rnd(.35, .75), r: rnd(3, 6) });
}
function spark(x, y, c, n, h) { for (let i = 0; i < n; i++) G.fx.push({ x, y, h: h || 18, vx: rnd(-90, 90), vh: rnd(-40, 120), c, t: rnd(.08, .18), r: rnd(2, 3.5) }); }

/* ══════════ 3D 장면 ══════════ */
const renderer = new THREE.WebGLRenderer({ canvas: glc, antialias: true, powerPreference: 'high-performance' });
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#9fd8f5');
scene.fog = new THREE.Fog('#bfe6fa', 38, 85);
const cam = new THREE.PerspectiveCamera(56, 1, .1, 300);
const CAM = new THREE.Vector3(0, 11.5, 13.5), LOOK = new THREE.Vector3(0, 0, -12);

scene.add(new THREE.HemisphereLight('#e0f2fe', '#475569', 1.15));
const sun = new THREE.DirectionalLight('#fff7e6', 2.2);
sun.position.set(-6, 14, 6); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 22, bottom: -22, near: 1, far: 70 });
sun.shadow.bias = -.0006;
scene.add(sun); scene.add(sun.target); sun.target.position.set(0, 0, -6);

const toX = (x) => (x - W / 2) / U;
const toZ = (y) => (y - (H - 120)) / U;
const ROADW = (ROAD_R - ROAD_L) / U;

// 바다 · 다리
const sea = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: '#1e88d6', roughness: .35, metalness: .1 }));
sea.rotation.x = -Math.PI / 2; sea.position.y = -2.2; sea.receiveShadow = true; scene.add(sea);
const deck = new THREE.Mesh(new THREE.BoxGeometry(ROADW + 1.4, .6, 120), new THREE.MeshStandardMaterial({ color: '#6b7280', roughness: .9 }));
deck.position.set(0, -.3, -40); deck.receiveShadow = true; scene.add(deck);
const curbM = new THREE.MeshStandardMaterial({ color: '#e5e7eb', roughness: .7 });
[-1, 1].forEach((s) => {
  const curb = new THREE.Mesh(new THREE.BoxGeometry(.35, .3, 120), curbM); curb.position.set(s * (ROADW / 2 + .5), .15, -40); curb.castShadow = curb.receiveShadow = true; scene.add(curb);
  const rail = new THREE.Mesh(new THREE.BoxGeometry(.12, .1, 120), new THREE.MeshStandardMaterial({ color: '#dc2626', roughness: .5 })); rail.position.set(s * (ROADW / 2 + .5), .95, -40); scene.add(rail);
  const side = new THREE.Mesh(new THREE.BoxGeometry(.5, 1.6, 120), new THREE.MeshStandardMaterial({ color: '#94a3b8', roughness: .8 })); side.position.set(s * (ROADW / 2 + .9), -1.1, -40); scene.add(side);
});
// 움직이는 것: 차선 · 난간 기둥 · 가로등
const dashGeo = new THREE.BoxGeometry(.14, .02, 1.1), dashes = new THREE.InstancedMesh(dashGeo, new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: .6 }), 40);
dashes.receiveShadow = true; scene.add(dashes);
const postGeo = new THREE.BoxGeometry(.12, .8, .12), posts = new THREE.InstancedMesh(postGeo, new THREE.MeshStandardMaterial({ color: '#b91c1c', roughness: .5 }), 120);
posts.castShadow = true; scene.add(posts);
const lampGeo = new THREE.CylinderGeometry(.07, .09, 4.2, 8), lamps = new THREE.InstancedMesh(lampGeo, new THREE.MeshStandardMaterial({ color: '#475569', roughness: .4, metalness: .6 }), 16);
lamps.castShadow = true; scene.add(lamps);
const headGeo = new THREE.BoxGeometry(.9, .14, .3), lampHeads = new THREE.InstancedMesh(headGeo, new THREE.MeshStandardMaterial({ color: '#334155', emissive: '#fde68a', emissiveIntensity: .25 }), 16);
scene.add(lampHeads);
const dummy = new THREE.Object3D();
function updateRoad() {
  const off = scroll / U, step = 48 / U;
  for (let i = 0; i < 40; i++) { dummy.position.set(0, .01, 6 - i * step + off); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); dashes.setMatrixAt(i, dummy.matrix); }
  dashes.instanceMatrix.needsUpdate = true;
  for (let i = 0; i < 60; i++) for (let s = 0; s < 2; s++) {
    dummy.position.set((s ? 1 : -1) * (ROADW / 2 + .5), .55, 6 - i * step / 2 + (off % (step / 2))); dummy.updateMatrix(); posts.setMatrixAt(i * 2 + s, dummy.matrix);
  }
  posts.instanceMatrix.needsUpdate = true;
  const lstep = step * 5, loff = (scroll / U) % lstep;
  for (let i = 0; i < 8; i++) for (let s = 0; s < 2; s++) {
    const z = 6 - i * lstep + loff, x = (s ? 1 : -1) * (ROADW / 2 + .9);
    dummy.position.set(x, 2.1, z); dummy.updateMatrix(); lamps.setMatrixAt(i * 2 + s, dummy.matrix);
    dummy.position.set(x - (s ? .45 : -.45), 4.2, z); dummy.updateMatrix(); lampHeads.setMatrixAt(i * 2 + s, dummy.matrix);
  }
  lamps.instanceMatrix.needsUpdate = true; lampHeads.instanceMatrix.needsUpdate = true;
}

/* 병사: 부품(다리 · 몸통 · 팔 · 머리 · 헬멧 · 총 …)마다 InstancedMesh 하나, 걷기는 팔다리 흔들기 */
function stdMat(c, o) { return new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: .65 }, o || {})); }
const PART = {
  leg: new THREE.BoxGeometry(.17, .42, .19),
  boot: new THREE.BoxGeometry(.2, .12, .27),
  body: new THREE.BoxGeometry(.48, .46, .3),
  belt: new THREE.BoxGeometry(.5, .07, .32),
  arm: new THREE.BoxGeometry(.13, .38, .14),
  head: new THREE.SphereGeometry(.2, 16, 12),
  helmet: new THREE.SphereGeometry(.25, 18, 12, 0, Math.PI * 2, 0, Math.PI * .55),
  brim: new THREE.CylinderGeometry(.27, .27, .04, 18),
  gun: new THREE.BoxGeometry(.07, .08, .58),
  pack: new THREE.BoxGeometry(.32, .32, .14),
  eye: new THREE.SphereGeometry(.03, 6, 6)
};
function makeArmy(max, look) {
  const parts = {};
  const add = (k, geo, mat) => { const m = new THREE.InstancedMesh(geo, mat, max * (k === 'leg' || k === 'boot' || k === 'arm' || k === 'eye' ? 2 : 1)); m.castShadow = true; m.count = 0; m.frustumCulled = false; scene.add(m); parts[k] = m; };
  add('leg', PART.leg, stdMat(look.pants));
  add('boot', PART.boot, stdMat('#3b2a1e'));
  add('body', PART.body, stdMat(look.shirt));
  add('belt', PART.belt, stdMat('#4b3621'));
  add('arm', PART.arm, stdMat(look.shirt));
  add('head', PART.head, stdMat('#f1c29b', { roughness: .8 }));
  add('helmet', PART.helmet, stdMat(look.helmet, { roughness: .35, metalness: .15 }));
  add('brim', PART.brim, stdMat(look.helmetD, { roughness: .4 }));
  add('gun', PART.gun, stdMat('#1f2937', { roughness: .4, metalness: .5 }));
  if (look.pack) add('pack', PART.pack, stdMat('#5c6b2f'));
  if (look.eyes) add('eye', PART.eye, stdMat('#111827'));
  // 맞았을 때 흰색으로 — 인스턴스 색
  const white = new THREE.Color('#ffffff'), base = new THREE.Color('#ffffff');
  Object.values(parts).forEach((m) => { for (let i = 0; i < m.instanceMatrix.count; i++) m.setColorAt(i, base); });
  return { parts, look, white };
}
const ME = makeArmy(60, { pants: '#2b4c9a', shirt: '#e9c79a', helmet: '#2f6fe4', helmetD: '#1d4ed8', pack: true });
const FOE = makeArmy(260, { pants: '#7a5a35', shirt: '#d9b07a', helmet: '#e3342f', helmetD: '#b91c1c', eyes: true });
const BOSS = makeArmy(1, { pants: '#3f2a14', shirt: '#8b5a2b', helmet: '#b91c1c', helmetD: '#7f1d1d', eyes: true });
const M4 = new THREE.Matrix4(), Mc = new THREE.Matrix4(), Mp = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(), V = new THREE.Vector3(), Sv = new THREE.Vector3(), FLASH = new THREE.Color('#ffffff'), NORM = new THREE.Color('#ffffff'), HURT = new THREE.Color('#ffb4b4');
function local(px_, py_, pz, rx, rz, s) { E.set(rx || 0, 0, rz || 0); Q.setFromEuler(E); Sv.set(s || 1, s || 1, s || 1); V.set(px_, py_, pz); return Mp.compose(V, Q, Sv); }
function putPart(army, k, idx, m, flash) { const im = army.parts[k]; if (!im) return; im.setMatrixAt(idx, m); im.setColorAt(idx, flash ? FLASH : NORM); }
function beginArmy(a) { a.n = 0; }
function addSoldier(a, x, z, face, s, phase, flash, aim) {
  // face: 0 = 앞(-z)을 봄(내 부대, 카메라엔 뒷모습), Math.PI = 카메라 쪽을 봄(적)
  E.set(0, face, 0); Q.setFromEuler(E); Sv.set(s, s, s); V.set(x, 0, z); Mc.compose(V, Q, Sv);
  const i = a.n++, sw = Math.sin(phase) * .55, bob = Math.abs(Math.cos(phase)) * .04;
  const P = (k, idx, lm) => putPart(a, k, idx, M4.multiplyMatrices(Mc, lm), flash);
  P('leg', i * 2, local(-.11, .32 + bob, 0, sw, 0)); P('leg', i * 2 + 1, local(.11, .32 + bob, 0, -sw, 0));
  P('boot', i * 2, local(-.11, .07, -Math.sin(phase) * .12 - .03)); P('boot', i * 2 + 1, local(.11, .07, Math.sin(phase) * .12 - .03));
  P('body', i, local(0, .78 + bob, 0)); P('belt', i, local(0, .58 + bob, 0));
  if (aim) { P('arm', i * 2, local(-.3, .8 + bob, -.12, -1.2, 0)); P('arm', i * 2 + 1, local(.3, .8 + bob, -.14, -1.3, 0)); P('gun', i, local(.12, .88 + bob, -.42)); }
  else { P('arm', i * 2, local(-.31, .76 + bob, 0, -sw * .8, 0)); P('arm', i * 2 + 1, local(.31, .76 + bob, 0, sw * .8, 0)); P('gun', i, local(0, .74 + bob, -.25, 0, Math.PI / 2)); }
  P('head', i, local(0, 1.16 + bob, 0)); P('helmet', i, local(0, 1.2 + bob, 0)); P('brim', i, local(0, 1.2 + bob, 0));
  if (a.parts.pack) P('pack', i, local(0, .82 + bob, .2));
  if (a.parts.eye) { P('eye', i * 2, local(-.075, 1.15 + bob, -.185)); P('eye', i * 2 + 1, local(.075, 1.15 + bob, -.185)); }
}
function endArmy(a) {
  Object.entries(a.parts).forEach(([k, m]) => {
    m.count = a.n * (k === 'leg' || k === 'boot' || k === 'arm' || k === 'eye' ? 2 : 1);
    m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
  });
}

// 총알
const bulletMesh = new THREE.InstancedMesh(new THREE.CapsuleGeometry(.05, .45, 4, 6), new THREE.MeshBasicMaterial({ color: '#fff3a3' }), 500);
bulletMesh.frustumCulled = false; scene.add(bulletMesh);
const glowMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(.16, 8, 6), new THREE.MeshBasicMaterial({ color: '#fde047', transparent: true, opacity: .35, depthWrite: false, blending: THREE.AdditiveBlending }), 500);
glowMesh.frustumCulled = false; scene.add(glowMesh);
// 총구 불꽃
const muzzle = new THREE.InstancedMesh(new THREE.SphereGeometry(.13, 8, 6), new THREE.MeshBasicMaterial({ color: '#ffd166', transparent: true, opacity: .9, blending: THREE.AdditiveBlending, depthWrite: false }), 12);
muzzle.frustumCulled = false; scene.add(muzzle);

// 문 · 상자: 생길 때 만들고 없어지면 치운다
const live = [];
const gateMat = (good) => new THREE.MeshStandardMaterial({ color: good ? '#3b82f6' : '#ef4444', emissive: good ? '#1d4ed8' : '#b91c1c', emissiveIntensity: .35, transparent: true, opacity: .55, roughness: .2, depthWrite: false });
const poleGeo = new THREE.BoxGeometry(.22, 2.2, .22), barGeo = new THREE.BoxGeometry(1, .16, .22);
function buildGate(gt) {
  const grp = new THREE.Group();
  gt.parts.forEach((p) => {
    const w = (p.x1 - p.x0) / U, good = p.t === 'x' || p.v >= 0;
    const mat = gateMat(good), panel = new THREE.Mesh(new THREE.BoxGeometry(w, 1.8, .08), mat);
    panel.position.set(toX((p.x0 + p.x1) / 2), 1.05, 0); grp.add(panel);
    const pm = new THREE.MeshStandardMaterial({ color: good ? '#1d4ed8' : '#b91c1c', roughness: .4, metalness: .3 });
    [p.x0, p.x1].forEach((xx) => { const pole = new THREE.Mesh(poleGeo, pm); pole.position.set(toX(xx), 1.1, 0); pole.castShadow = true; grp.add(pole); });
    const bar = new THREE.Mesh(barGeo, pm); bar.scale.x = w; bar.position.set(toX((p.x0 + p.x1) / 2), 2.12, 0); bar.castShadow = true; grp.add(bar);
    p._mat = mat; p._pm = pm; p._good = good;
  });
  return grp;
}
const crateTex = (() => {   // 나무 상자 무늬
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  x.fillStyle = '#b7792f'; x.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 6; i++) { x.fillStyle = i % 2 ? '#a86b25' : '#c4883c'; x.fillRect(0, i * 21, 128, 20); }
  x.strokeStyle = '#6b3f12'; x.lineWidth = 10; x.strokeRect(5, 5, 118, 118);
  x.beginPath(); x.moveTo(10, 10); x.lineTo(118, 118); x.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
function buildBox(X) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(X.w / U, 1.3, X.h / U), new THREE.MeshStandardMaterial({ map: crateTex, roughness: .8 }));
  m.position.y = .65; m.castShadow = m.receiveShadow = true;
  const g = new THREE.Group(); g.add(m); X._mesh = m; return g;
}
let frameNo = 0;
function sync(list, build, place) {
  list.forEach((o) => { if (!o._g) { o._g = build(o); scene.add(o._g); live.push(o); } o._seen = frameNo; place(o); });
}
function sweep() {
  for (let i = live.length - 1; i >= 0; i--) {
    const o = live[i];
    if (o._seen !== frameNo) { scene.remove(o._g); o._g.traverse((c) => { if (c.geometry && c.geometry !== poleGeo && c.geometry !== barGeo) c.geometry.dispose(); }); live.splice(i, 1); }
  }
}
function clearScene() { live.forEach((o) => scene.remove(o._g)); live.length = 0; }

function render3d() {
  frameNo++;
  updateRoad();
  const g = G, py = H - 120;
  // 카메라: 부대를 살짝 따라가고, 흔들림
  const sh = g && g.shake && !reduce ? g.shake * .9 : 0, follow = g ? toX(g.px) * .35 : 0;
  cam.position.set(CAM.x + follow + rnd(-sh, sh) * .4, CAM.y + rnd(-sh, sh) * .25, CAM.z);
  cam.lookAt(LOOK.x + follow, LOOK.y, LOOK.z);
  beginArmy(ME); beginArmy(FOE); beginArmy(BOSS);
  let bi = 0, mi = 0;
  if (g) {
    const walk = g.t * 11;
    squadPos(g.n).forEach((p, i) => addSoldier(ME, toX(g.px + p[0] * 1.15), toZ(py + p[1] * 1.15), 0, 1, walk + i * 1.3, 0, i < 9));
    if (g.flash > 0) squadPos(Math.min(g.n, 9)).forEach((p, i) => { dummy.position.set(toX(g.px + p[0] * 1.15) + .12, .9, toZ(py + p[1] * 1.15) - .78); dummy.scale.setScalar(1 + Math.random() * .5); dummy.updateMatrix(); muzzle.setMatrixAt(mi++, dummy.matrix); });
    g.mobs.forEach((M) => addSoldier(FOE, toX(M.x), toZ(M.y), Math.PI, 1, M.step, M.flash > 0, false));
    if (g.boss) { const K = g.boss; addSoldier(BOSS, toX(K.x), toZ(K.y), Math.PI, 3.2, K.t * 5, K.flash > 0, false); }
    g.bullets.forEach((B) => {
      dummy.position.set(toX(B.x), .9, toZ(B.y)); dummy.rotation.set(Math.PI / 2, 0, 0); dummy.scale.setScalar(1); dummy.updateMatrix();
      bulletMesh.setMatrixAt(bi, dummy.matrix); glowMesh.setMatrixAt(bi, dummy.matrix); bi++;
    });
    dummy.rotation.set(0, 0, 0);
    sync(g.gates, buildGate, (gt) => {
      gt._g.position.z = toZ(gt.y);
      gt.parts.forEach((p) => {
        const good = p.t === 'x' || p.v >= 0;
        if (good !== p._good) { p._good = good; p._mat.color.set(good ? '#3b82f6' : '#ef4444'); p._mat.emissive.set(good ? '#1d4ed8' : '#b91c1c'); p._pm.color.set(good ? '#1d4ed8' : '#b91c1c'); }
        p._mat.opacity = p.taken ? .18 : .5 + p.hit * .3; p._mat.emissiveIntensity = .35 + p.hit * .9;
      });
    });
    sync(g.boxes, buildBox, (X) => {
      X._g.position.set(toX(X.x) + (X.flash > 0 ? rnd(-.05, .05) : 0), 0, toZ(X.y));
      X._mesh.material.emissive.set(X.flash > 0 ? '#ffffff' : '#000000'); X._mesh.material.emissiveIntensity = X.flash > 0 ? .6 : 0;
    });
  }
  sweep();
  endArmy(ME); endArmy(FOE); endArmy(BOSS);
  bulletMesh.count = glowMesh.count = bi; bulletMesh.instanceMatrix.needsUpdate = glowMesh.instanceMatrix.needsUpdate = true;
  muzzle.count = mi; muzzle.instanceMatrix.needsUpdate = true;
  renderer.render(scene, cam);
}

/* ══════════ 겹침(숫자 · 효과) ══════════ */
const PV = new THREE.Vector3();
let refUnit = 40;
function scr(x, y, h) {   // 평면 좌표 + 높이(평면 단위) → 화면 좌표, 그 자리의 크기 배율
  PV.set(toX(x), h / U, toZ(y)).project(cam);
  const sx = (PV.x + 1) / 2 * CW, sy = (1 - PV.y) / 2 * CH;
  PV.set(toX(x), h / U + 1, toZ(y)).project(cam);
  const u = sy - (1 - PV.y) / 2 * CH;
  return { x: sx, y: sy, s: u / refUnit };
}
function overlay() {
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.clearRect(0, 0, CW, CH);
  const g = G; if (!g) return;
  const py = H - 120;
  refUnit = scr(W / 2, py, 0).s * refUnit || 40;
  // 문 숫자
  g.gates.forEach((gt) => gt.parts.forEach((p) => {
    const P = scr((p.x0 + p.x1) / 2, gt.y, 24);
    const label = p.t === 'x' ? '×' + p.v : (p.v > 0 ? '+' : '') + p.v;
    if (P.s > .08) text(label, P.x, P.y, (40 + p.hit * 10) * P.s, '#fff', true, p.taken ? .35 : 1);
  }));
  // 상자 숫자
  g.boxes.forEach((X) => {
    const P = scr(X.x, X.y, 34), T = scr(X.x, X.y, 58);
    pill(T.x, T.y, X.gift === 'rate' ? '연사' : '위력', T.s * .9, '#ca8a04');
    text(Math.max(0, Math.ceil(X.hp)), P.x, P.y, 30 * P.s * (1 + X.pop * .25), '#fff', true);
  });
  // 적 무리 숫자
  g.groups.forEach((q) => {
    let top = null, sx = 0, n = 0;
    g.mobs.forEach((M) => { if (M.g === q) { sx += M.x; n++; if (!top || M.y < top.y) top = M; } });
    if (!top) return;
    const P = scr(sx / n, top.y, 42);
    pill(P.x, P.y, String(q.alive), P.s * (1.15 + q.pop * .4), '#dc2626');
  });
  // 보스 체력
  if (g.boss) {
    const K = g.boss, P = scr(K.x, K.y, 100), bw = 190 * Math.max(.6, P.s);
    ctx.fillStyle = 'rgba(15,23,42,.75)'; rr(P.x - bw / 2, P.y, bw, 14, 7); ctx.fill();
    ctx.fillStyle = '#ef4444'; rr(P.x - bw / 2, P.y, bw * Math.max(0, K.hp / K.max), 14, 7); ctx.fill();
    text(Math.max(0, Math.ceil(K.hp)), P.x, P.y - 18, 30 * (1 + K.pop * .2), '#fff', true);
  }
  // 내 부대 숫자
  const R = squadR(g.n), LB = scr(g.px, py + R * .9 + 16, 0);
  pill(LB.x, LB.y, String(Math.round(g.shown)), 1.25, '#1d4ed8');
  // 파동 · 파편 · 글자
  g.rings.forEach((r) => { const P = scr(r.x, r.y, 2); ctx.strokeStyle = 'rgba(' + r.c + ',' + (r.t * 2) + ')'; ctx.lineWidth = 4 * P.s; ctx.beginPath(); ctx.ellipse(P.x, P.y, r.r * P.s * 1.8, r.r * P.s * .7, 0, 0, 7); ctx.stroke(); });
  g.fx.forEach((f) => { const P = scr(f.x, f.y, f.h); ctx.globalAlpha = Math.min(1, f.t * 3); ctx.fillStyle = f.c; const r = f.r * P.s * 1.6; ctx.fillRect(P.x - r / 2, P.y - r / 2, r, r); });
  ctx.globalAlpha = 1;
  g.texts.forEach((t) => {
    const P = scr(t.x, t.y, t.h), life = t.small ? t.t / .5 : t.t, pop = life > .85 ? 1 + (life - .85) * 3 : 1;
    ctx.globalAlpha = Math.min(1, life * 2.2);
    text(t.s, P.x, P.y, t.size * Math.max(.75, P.s) * pop, t.c, true);
  });
  ctx.globalAlpha = 1;
  if (g.tint) { ctx.fillStyle = 'rgba(' + g.tint.c + ',' + (g.tint.t * .4) + ')'; ctx.fillRect(0, 0, CW, CH); }
}
function pill(x, y, s, sc, col) {
  const fs = 15 * sc; ctx.font = '900 ' + fs + 'px Pretendard, sans-serif';
  const w = Math.max(fs * 2, ctx.measureText(s).width + fs * 1.1), h = fs * 1.45;
  ctx.fillStyle = col; rr(x - w / 2, y - h / 2, w, h, h / 2); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 2; ctx.stroke();
  text(s, x, y + fs * .04, fs, '#fff', false);
}
function rr(x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function text(s, x, y, size, c, stroke, alpha) {
  if (alpha !== undefined) ctx.globalAlpha = alpha;
  ctx.font = '900 ' + size + 'px Pretendard, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (stroke) { ctx.lineWidth = Math.max(3, size / 5); ctx.strokeStyle = 'rgba(15,23,42,.9)'; ctx.lineJoin = 'round'; ctx.strokeText(s, x, y); }
  ctx.fillStyle = c; ctx.fillText(s, x, y);
  if (alpha !== undefined) ctx.globalAlpha = 1;
}

/* ── 화면 크기 ── */
function fit() {
  const r = cv.getBoundingClientRect();
  DPR = Math.min(2, window.devicePixelRatio || 1);
  CW = r.width; CH = r.height;
  cv.width = Math.round(CW * DPR); cv.height = Math.round(CH * DPR);
  renderer.setPixelRatio(Math.min(1.75, window.devicePixelRatio || 1));
  renderer.setSize(CW, CH, false);
  cam.aspect = CW / CH; cam.updateProjectionMatrix();
  H = Math.max(560, Math.min(820, CH / CW * W));   // 평면 세로 길이(게임 계산용)
}

/* ── 조작 ── */
let dragX = null, dragTx = 0;
cv.addEventListener('pointerdown', (e) => { if (state !== 'play') return; dragX = e.clientX; dragTx = G.tx; try { cv.setPointerCapture(e.pointerId); } catch (_) {} });
cv.addEventListener('pointermove', (e) => { if (dragX === null || state !== 'play') return; G.tx = dragTx + (e.clientX - dragX) / CW * W * 1.25; });
const up = () => { dragX = null; };
cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
const keys = {};
window.addEventListener('keydown', (e) => {
  if (['ArrowLeft', 'ArrowRight', 'a', 'd'].includes(e.key)) { keys[e.key] = true; e.preventDefault(); }
  if ((e.key === 'Enter' || e.key === ' ') && (state === 'menu' || state === 'end')) { e.preventDefault(); start(); }
});
window.addEventListener('keyup', (e) => { keys[e.key] = false; });

/* ── 흐름 ── */
function loop(t) {
  let dt = Math.min(.033, (t - last) / 1000 || 0); last = t;
  if (slow > 0) { slow -= dt; dt *= .3; }
  if (state === 'play') {
    const k = (keys.ArrowLeft || keys.a ? -1 : 0) + (keys.ArrowRight || keys.d ? 1 : 0);
    if (k) G.tx += k * 320 * dt;
    step(dt);
  } else if (G) {
    G.t += dt * .3;
    G.fx = G.fx.filter((f) => { f.t -= dt; f.x += f.vx * dt; f.h += f.vh * dt; f.vh -= 520 * dt; return f.t > 0; });
    G.rings = G.rings.filter((r) => { r.t -= dt; r.r += 260 * dt; return r.t > 0; });
    G.texts = G.texts.filter((x) => { x.t -= dt; return x.t > 0; });
    G.shake = Math.max(0, G.shake - dt);
  } else scroll = (scroll + 40 * dt) % 48;
  render3d(); overlay();
  requestAnimationFrame(loop);
}
function start() { audio(); $('#ovStart').hidden = true; $('#ovEnd').hidden = true; newGame(); state = 'play'; }
function end(win) {
  state = 'end';
  const btn = $('#btnNext');
  if (win) {
    level++; save('lastshot_level', level);
    if (level > best) { best = level; save('lastshot_best', best); }
    $('#endKicker').textContent = 'CLEAR'; $('#endTitle').textContent = '레벨 ' + (level - 1) + ' 클리어!';
    $('#endSub').textContent = '남은 부대 ' + G.n + '명 · 다음은 더 어려워요.';
    btn.textContent = '레벨 ' + level + ' 시작'; btn.classList.remove('red'); SFX.win();
  } else {
    $('#endKicker').textContent = 'GAME OVER'; $('#endTitle').textContent = '부대가 쓰러졌어요';
    const pct = Math.min(100, Math.round(G.dist / G.length * 100));
    $('#endSub').textContent = '레벨 ' + level + ' · ' + pct + '%까지 왔어요. 문을 더 쏴서 키워 보세요.';
    btn.textContent = '다시 도전'; btn.classList.add('red'); SFX.lose(); buzz(200);
  }
  $('#ovEnd').hidden = false; syncHud();
  setTimeout(() => { try { btn.focus({ preventScroll: true }); } catch (e) {} }, 50);
}
function home() { state = 'menu'; G = null; clearScene(); $('#ovEnd').hidden = true; $('#ovStart').hidden = false; syncHud(); }
function syncHud() {
  $('#hudLv').textContent = G ? G.L : level;
  $('#hudBest').textContent = best;
  $('#startLv').textContent = level;
  $('#btnReset').hidden = level <= 1;
  $('#hudProg').style.width = G ? Math.min(100, G.dist / G.length * 100) + '%' : '0%';
  const pw = $('#hudPow');
  if (G && G.pow) { pw.hidden = false; pw.textContent = '연사 ×' + (G.rate / 3.4).toFixed(1) + ' · 위력 ×' + G.dmg.toFixed(1); } else pw.hidden = true;
}
function paintMute() { const b = $('#btnMute'); b.setAttribute('aria-pressed', muted ? 'true' : 'false'); b.textContent = muted ? '소리 끔' : '소리 켬'; }

$('#btnStart').addEventListener('click', start);
$('#btnNext').addEventListener('click', start);
$('#btnHome').addEventListener('click', home);
$('#btnReset').addEventListener('click', () => { level = 1; save('lastshot_level', 1); syncHud(); });
$('#btnMute').addEventListener('click', () => { muted = !muted; save('lastshot_mute', muted ? 1 : 0); paintMute(); if (!muted) audio(); });
window.addEventListener('resize', fit);
document.addEventListener('visibilitychange', () => { last = performance.now(); });
syncHud(); paintMute(); fit();

// 확인용(?debug): __ls.play(레벨) = 자동 조종 한 판, sim(초) = 지금 판을 빨리 돌림
if (/[?&]debug/.test(location.search)) window.__ls = {
  start,
  sim(sec) { for (let i = 0; i < sec * 60 && state === 'play'; i++) { autoAim(); step(1 / 60); } return G; },
  play(L) { muted = true; level = L; start(); const G0 = G; let i = 0; for (; i < 60 * 300 && state === 'play'; i++) { autoAim(); step(1 / 60); } return { L, win: G0.n > 0 && !G0.boss, n: G0.n, pct: Math.round(G0.dist / G0.length * 100) }; }
};
function autoAim() {
  const py = H - 120;
  const gt = G.gates.filter((x) => !x.used && x.y > py - 420).sort((a, b) => b.y - a.y)[0];
  if (gt) { const p = gt.parts[0].t === 'x' || (gt.parts[1].t !== 'x' && gt.parts[0].v > gt.parts[1].v) ? gt.parts[0] : gt.parts[1]; G.tx = (p.x0 + p.x1) / 2; return; }
  if (G.boss) { G.tx = G.boss.x; return; }
  const bx = G.boxes.filter((x) => x.y < py - 120)[0];
  if (bx) { G.tx = bx.x; return; }
  const m = G.mobs.filter((x) => x.y < py).sort((a, b) => b.y - a.y)[0];
  if (m) G.tx = m.x;
}
requestAnimationFrame((t) => { last = t; loop(t); });
