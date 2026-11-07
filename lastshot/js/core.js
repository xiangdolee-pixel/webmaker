/* 라스트샷 — 게임 규칙(화면 없음). 화면(game.js)과 균형 시험(node)이 같이 쓴다.
   좌표: 위에서 본 평면. x = 길 가로(ROAD_L ~ ROAD_R), y = 길 세로(내 부대 = 0, 앞쪽이 음수).
   물건은 SPAWN 에서 생겨 +y 로 다가온다. 화면은 이 평면을 3D 로 세워 그린다.
   난이도: 레벨이 오를수록 + 한 판 안에서도 뒤로 갈수록 세짐. 낮은 레벨은 짧게(20초 안팎) 끝난다. */
export const ROAD_L = 34, ROAD_R = 326, MID = 180, SPAWN = -1150, RANGE = 620, START = 680;
const GAP = 22;                       // 병사 사이 간격
export const TIERS = [                // 부대 등급: 상자에서 '진급'을 얻으면 오른다
  { name: '소총', bullet: 0, mul: 1 },
  { name: '기관총', bullet: 1, mul: 1.6 },
  { name: '레이저', bullet: 2, mul: 2.5 }
];
const rnd = (a, b) => a + Math.random() * (b - a);
const ri = (a, b) => Math.floor(rnd(a, b + 1));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const NOOP = () => {};

export function squadPos(n) {
  const p = [], m = Math.min(n, 60);
  for (let i = 0; i < m; i++) { const a = i * 2.39996, r = GAP * .52 * Math.sqrt(i); p.push([Math.cos(a) * r, Math.sin(a) * r * .8]); }
  return p;
}
export function squadR(n) { return GAP * .52 * Math.sqrt(Math.min(n, 60)) + 13; }

/* ── 레벨 설계 ── */
export function makeLevel(L) {
  const ev = [], rows = Math.min(4 + Math.round(L * .7), 18);
  let d = 0;
  // 낮은 레벨은 금방, 높은 레벨은 촘촘하고 길게
  const space = Math.max(400, 470 - L * 4);
  const pat = ['gate', 'mob', 'gate', 'box', 'mob', 'gate', 'mob', 'box'];
  for (let i = 0; i < rows; i++) {
    let k = pat[i % pat.length];
    if (i === 0) k = 'gate';
    
    ev.push({ d, kind: k, p: rows > 1 ? i / (rows - 1) : 1 });
    d += space;
  }
  ev.push({ d: d + 220, kind: 'boss', p: 1 });
  return { ev, length: d + 220 + 1150 - START + 600 };
}

export function newGame(L, hooks) {
  const lv = makeLevel(L);
  return {
    L, ev: lv.ev, length: lv.length, dist: START, next: 0, t: 0,
    speed: Math.min(176, 142 + L * 3),
    px: MID, tx: MID, n: 3, shown: 3, tier: 0,
    rate: 5, dmg: 1, cd: 0, pow: 0, flash: 0,
    bullets: [], gates: [], mobs: [], groups: [], boxes: [], boss: null,
    h: Object.assign({ burst: NOOP, spark: NOOP, float: NOOP, sfx: NOOP, buzz: NOOP, shake: NOOP, tint: NOOP, ring: NOOP, gateHit: NOOP, smoke: NOOP }, hooks || {}),
    over: 0          // 0 진행 · 1 이김 · -1 짐
  };
}

/* ── 놓기 ── */
function gateVal(G, good, p) {
  const L = power(G.L), n = Math.max(1, G.n);
  if (good) {
    if (L >= 3 && Math.random() < .22 && n < 60) return { t: 'x', v: 2 };
    return { t: '+', v: ri(4, 8) + Math.round(L + n * .3 + p * 4) };
  }
  if (L >= 5 && Math.random() < .2) return { t: '/', v: 2 };
  return { t: '+', v: -(ri(3, 6) + Math.round(L + n * .4 + p * 5)) };
}
// 레벨 → 실제 세기: 8 까지는 가파르게, 그 뒤로는 완만하게(그래도 계속 오른다)
export const power = L => L <= 6 ? 4.4 + L * 1 : 10.4 + (L - 6) * .25;
function spawn(G, e, y) {
  const L = power(G.L), p = e.p;
  if (e.kind === 'gate') {
    let A = gateVal(G, true, p), B = gateVal(G, false, p);
    if (G.next === 1) { A = { t: '+', v: 8 + Math.round(L * 2.5) }; B = { t: '+', v: ri(1, 3) }; }   // 첫 문은 넉넉히
    // 둘 다 마이너스(쏴서 올려야 함) — 레벨 2부터 가끔
    if (G.next > 1 && L >= 2 && Math.random() < .18 + Math.min(.2, L * .012)) A = { t: '+', v: -(ri(2, 5) + Math.round(L * .4)) };
    if (Math.random() < .5) [A, B] = [B, A];
    G.gates.push({ y, h: 56, used: false, parts: [
      { x0: ROAD_L, x1: MID - 3, t: A.t, v: A.v, hit: 0, acc: 0 },
      { x0: MID + 3, x1: ROAD_R, t: B.t, v: B.v, hit: 0, acc: 0 }
    ] });
  } else if (e.kind === 'mob') {
    const c = Math.min(Math.round((4 + L * 2.1) * (1 + p * 1.1) * rnd(.85, 1.15)), 320);
    const hp = 1 + Math.floor(L / 5 + p * (L / 8));
    const cols = clamp(Math.ceil(Math.sqrt(c * 1.6)), 2, 16);
    const w = (cols - 1) * 17, cx = clamp(rnd(ROAD_L + 20 + w / 2, ROAD_R - 20 - w / 2), ROAD_L + 14 + w / 2, ROAD_R - 14 - w / 2);
    const grp = { alive: c, pop: 0 };
    G.groups.push(grp);
    for (let i = 0; i < c; i++) {
      const col = i % cols, row = Math.floor(i / cols);
      G.mobs.push({
        x: clamp(cx - w / 2 + col * 17 + rnd(-4, 4), ROAD_L + 8, ROAD_R - 8), y: y - row * 16 + rnd(-4, 4), hp, max: hp,
        vy: 14 + Math.min(L, 30) * 1.3, side: 40 + Math.min(L, 30) * 2.5, step: Math.random() * 6, g: grp, flash: 0, kb: 0
      });
    }
  } else if (e.kind === 'box') {
    const hp = Math.round((18 + L * 8) * (1 + p * .8));
    const r = Math.random(), gift = G.tier < TIERS.length - 1 && r < .34 ? 'tier' : r < .67 ? 'rate' : 'dmg';
    const two = L >= 4;   // 두 개 나란히(하나만 고를 수 있게)
    const xs = two ? [ROAD_L + 50, ROAD_R - 50] : [rnd(ROAD_L + 60, ROAD_R - 60)];
    xs.forEach((x, k) => G.boxes.push({ x, y, w: 92, h: 46, hp: k ? Math.round(hp * 1.15) : hp, max: hp, gift: k ? (gift === 'rate' ? 'dmg' : 'rate') : gift, flash: 0, pop: 0 }));
  } else if (e.kind === 'boss') {
    const hp = Math.round(120 + L * 95 + L * L * 5);
    G.boss = { x: MID, y: y - 40, r: 62, hp, max: hp, vy: 100 + Math.min(L, 20) * 3, stop: -800, t: 0, flash: 0, pop: 0, acc: 0, accT: 0, summon: 2.5, bite: 0 };
  }
}

function lose(G, k, x, y) {
  if (k <= 0) return;
  G.n -= k; G.h.burst(x, y, 'blue', Math.min(k, 14));
}

/* ── 한 장면 ── */
export function step(G, dt) {
  if (G.over) return;
  const g = G, h = g.h;
  g.t += dt;
  g.dist += g.speed * dt;
  while (g.next < g.ev.length && g.dist >= g.ev[g.next].d) { const e = g.ev[g.next++]; spawn(g, e, SPAWN + (g.dist - e.d)); }

  const R = squadR(g.n);
  g.tx = clamp(g.tx, ROAD_L + R * .7, ROAD_R - R * .7);
  g.px += (g.tx - g.px) * Math.min(1, dt * 14);

  // 사격: 총알 수는 병사 수만큼(최대 14), 위력은 병사 수에 따라 커짐
  const T = TIERS[g.tier];
  g.cd -= dt; g.flash = Math.max(0, g.flash - dt);
  if (g.cd <= 0 && g.n > 0) {
    g.cd = 1 / g.rate; g.flash = .06;
    const shots = Math.min(g.n, 18), per = g.dmg * T.mul * Math.pow(g.n, .72) / shots;
    const pos = squadPos(g.n);
    for (let s = 0; s < shots; s++) {
      const q = pos[s] || [0, 0];
      g.bullets.push({ x: g.px + q[0] + rnd(-2, 2), y: q[1] - 10, y0: q[1] - 10, d: per, vx: q[0] * .25 + rnd(-6, 6) });
    }
    h.sfx('shot');
  }
  for (let b = g.bullets.length - 1; b >= 0; b--) {
    const B = g.bullets[b]; B.y -= 900 * dt; B.x += B.vx * dt;
    if (B.y < B.y0 - RANGE || hitAny(g, B)) g.bullets.splice(b, 1);
  }
  // 문
  for (const gt of g.gates) {
    gt.y += g.speed * dt;
    for (const p of gt.parts) p.hit = Math.max(0, p.hit - dt * 5);
    if (!gt.used && gt.y >= -6) {
      gt.used = true;
      const p = gt.parts[g.px < MID ? 0 : 1], before = g.n;
      const after = Math.max(0, Math.round(p.t === 'x' ? g.n * p.v : p.t === '/' ? g.n / p.v : g.n + p.v));
      if (after < before) { lose(g, before - after, g.px, 0); h.sfx('gateDown'); h.buzz(60); h.shake(.3); h.tint('red'); }
      else { g.n = after; h.sfx('gateUp'); h.tint('blue'); h.ring(g.px, 0, 'blue'); }
      h.float(g.px, -40, (after >= before ? '+' : '') + (after - before), after >= before ? '#7dd3fc' : '#f87171', 34);
      p.taken = true;
    }
  }
  g.gates = g.gates.filter(gt => gt.y < 160);
  // 적
  for (let i = g.mobs.length - 1; i >= 0; i--) {
    const M = g.mobs[i];
    M.flash = Math.max(0, M.flash - dt); M.kb = Math.max(0, M.kb - dt * 60);
    M.y += (g.speed + M.vy) * dt - M.kb * dt * 8; M.step += dt * 13;
    if (M.y > -520) M.x += Math.sign(g.px - M.x) * Math.min(Math.abs(g.px - M.x), M.side * dt);
    const dx = M.x - g.px, dy = M.y;
    if (dy > -R * .9 && dy < R * .8 && Math.abs(dx) < R + 4) {
      g.mobs.splice(i, 1); M.g.alive--; lose(g, 1, M.x, M.y); h.shake(.12); h.sfx('hurt'); h.burst(M.x, M.y, 'red', 5); continue;
    }
    if (M.y > 150) { g.mobs.splice(i, 1); M.g.alive--; }
  }
  g.groups = g.groups.filter(q => { q.pop = Math.max(0, q.pop - dt * 6); return q.alive > 0; });
  // 상자(타이어 더미)
  for (let j = g.boxes.length - 1; j >= 0; j--) {
    const X = g.boxes[j]; X.y += g.speed * dt; X.flash = Math.max(0, X.flash - dt); X.pop = Math.max(0, X.pop - dt * 6);
    if (X.y + X.h / 2 > -R * .6 && X.y - X.h / 2 < R * .6 && Math.abs(X.x - g.px) < X.w / 2 + R * .5) {
      g.boxes.splice(j, 1); const loss = Math.ceil(X.hp / 3); lose(g, loss, g.px, 0); h.shake(.4); h.buzz(80); h.sfx('boom');
      h.float(g.px, -40, '-' + loss, '#f87171', 34); h.burst(X.x, X.y, 'tire', 18); continue;
    }
    if (X.y > 160) g.boxes.splice(j, 1);
  }
  // 보스: 다가오며 졸병을 부르고, 닿으면 부대를 계속 깎는다
  const K = g.boss;
  if (K) {
    K.t += dt; K.flash = Math.max(0, K.flash - dt); K.pop = Math.max(0, K.pop - dt * 6);
    // 곧장 성큼성큼 걸어오며 내 쪽으로 몸을 튼다(멀 때는 더 빨리 다가옴)
    K.y += (K.y < K.stop ? Math.max(g.speed, K.vy) * 1.1 : K.vy) * dt;
    const dx = g.px - K.x; K.x += Math.sign(dx) * Math.min(Math.abs(dx), 60 * dt);
    K.accT -= dt; if (K.acc > 0 && K.accT <= 0) { h.float(K.x + rnd(-30, 30), K.y - 20, '-' + Math.round(K.acc), '#fde68a', 20, true); K.acc = 0; K.accT = .15; }
    if (K.y > K.stop) {
      K.summon -= dt;
      if (K.summon <= 0) {
        K.summon = Math.max(1.8, 4 - power(g.L) * .1);
        const PL = power(g.L), c = Math.min(4 + Math.floor(PL * 1.2), 36), grp = { alive: c, pop: 0 };
        g.groups.push(grp);
        for (let i = 0; i < c; i++) g.mobs.push({ x: clamp(K.x + rnd(-70, 70), ROAD_L + 8, ROAD_R - 8), y: K.y + 30 + rnd(-20, 10), hp: 1 + Math.floor(PL / 5), max: 1, vy: 40 + PL * 2, side: 60 + PL * 3, step: Math.random() * 6, g: grp, flash: 0, kb: 0 });
      }
    }
    if (K.y > -R * .4 - K.r) {
      K.y = -R * .4 - K.r; K.bite -= dt;
      if (K.bite <= 0) { K.bite = .25; lose(g, 2 + Math.floor(power(g.L) / 4), g.px, 0); h.shake(.25); h.sfx('hurt'); h.buzz(40); }
    }
  }
  g.shown = g.shown > g.n ? Math.max(g.n, g.shown - Math.max(1, (g.shown - g.n) * dt * 10)) : g.n;

  if (g.n <= 0) { g.n = 0; g.over = -1; return; }
  if (K && K.hp <= 0) {
    h.burst(K.x, K.y, 'red', 50); h.burst(K.x, K.y, 'gold', 40); h.ring(K.x, K.y, 'gold');
    g.boss = null; h.shake(.6); h.buzz([60, 40, 120]); h.sfx('boom'); g.over = 1;
    for (const M of g.mobs) h.burst(M.x, M.y, 'red', 1);
    g.mobs = []; g.groups = [];
  }
}

function hitAny(g, B) {
  const h = g.h, K = g.boss;
  if (K && Math.abs(B.x - K.x) < K.r && Math.abs(B.y - K.y) < K.r * .7) {
    K.hp -= B.d; K.acc += B.d; K.flash = .06; K.pop = 1;
    h.spark(B.x, K.y + K.r * .5, 'gold', 2); h.sfx('hit'); h.shake(.05); return true;
  }
  for (let i = 0; i < g.mobs.length; i++) {
    const M = g.mobs[i];
    if (Math.abs(B.x - M.x) < 10 && Math.abs(B.y - M.y) < 12) {
      const left = B.d - M.hp; M.hp -= B.d; M.flash = .08; M.kb = 6; h.spark(B.x, M.y + 4, 'hot', 2);
      if (M.hp <= 0) { B.d = left; g.mobs.splice(i, 1); M.g.alive--; M.g.pop = 1; h.burst(M.x, M.y, 'red', 6); h.smoke(M.x, M.y); h.sfx('kill'); return B.d < .3; }
      h.sfx('hit');
      return true;
    }
  }
  for (let j = 0; j < g.boxes.length; j++) {
    const X = g.boxes[j];
    if (Math.abs(B.x - X.x) < X.w / 2 && Math.abs(B.y - X.y) < X.h / 2) {
      X.hp -= B.d; X.flash = .05; X.pop = 1; h.spark(B.x, X.y + X.h / 2, 'hot', 2); h.sfx('hit');
      if (X.hp <= 0) {
        g.boxes.splice(j, 1); h.burst(X.x, X.y, 'tire', 26); h.burst(X.x, X.y, 'gold', 16); h.ring(X.x, X.y, 'gold'); h.smoke(X.x, X.y, 3);
        // 나란한 짝 상자는 함께 사라진다(하나만 얻음)
        g.boxes = g.boxes.filter(o => { if (Math.abs(o.y - X.y) < 4) { h.burst(o.x, o.y, 'tire', 10); return false; } return true; });
        if (X.gift === 'tier' && g.tier < TIERS.length - 1) { g.tier++; h.float(X.x, X.y - 10, TIERS[g.tier].name + ' 진급!', '#facc15', 30); }
        else if (X.gift === 'rate') { g.rate = Math.min(14, g.rate * 1.25); h.float(X.x, X.y - 10, '연사 UP!', '#facc15', 28); }
        else { g.dmg = +(g.dmg * 1.3).toFixed(2); h.float(X.x, X.y - 10, '위력 UP!', '#facc15', 28); }
        g.pow++; h.shake(.25); h.sfx('power'); h.buzz(40);
      }
      return true;
    }
  }
  for (const gt of g.gates) {
    if (gt.used || Math.abs(B.y - gt.y) > gt.h / 2) continue;
    for (const p of gt.parts) {
      if (B.x >= p.x0 && B.x <= p.x1) {
        if (p.t === '+') { p.acc += 1; const need = 7 + Math.floor(power(g.L) * .5); if (p.acc >= need) { p.acc = 0; p.v++; p.hit = 1; h.sfx('gateTick'); h.gateHit(gt, p); } }
        h.spark(B.x, gt.y + gt.h / 2, 'cool', 1);
        return true;
      }
    }
  }
  return false;
}

/* ── 자동 조종(균형 시험 · 확인용). skill 1 = 잘하는 사람, 0 = 대충 하는 사람 ── */
export function autoAim(G, skill, dt, mem) {
  mem.t = (mem.t || 0) - dt;
  if (mem.t > 0) { if (mem.x !== undefined) G.tx = mem.x; return; }
  mem.t = skill > .5 ? .12 : .45;
  const pick = x => { mem.x = x + (1 - skill) * rnd(-50, 50); G.tx = mem.x; };
  const near = G.boxes.filter(x => x.y > -230 && Math.abs(x.x - G.px) < x.w / 2 + squadR(G.n) && !G.boxes.some(o => o !== x && Math.abs(o.y - x.y) < 4));
  if (near.length && skill > .3) { const x = near[0].x, w = near[0].w / 2 + squadR(G.n) + 10; return pick(x < MID ? Math.min(ROAD_R - 30, x + w) : Math.max(ROAD_L + 30, x - w)); }
  const gt = G.gates.filter(x => !x.used && x.y > -520).sort((a, b) => b.y - a.y)[0];
  if (gt) {
    const val = p => p.t === 'x' ? G.n * p.v : p.t === '/' ? G.n / p.v : G.n + p.v;
    let best = val(gt.parts[0]) >= val(gt.parts[1]) ? 0 : 1;
    if (mem.gate !== gt) { mem.gate = gt; mem.wrong = Math.random() < (1 - skill) * .3; }
    if (mem.wrong) best = 1 - best;
    const p = gt.parts[best]; return pick((p.x0 + p.x1) / 2);
  }
  if (G.boss) return pick(G.boss.x);
  const bxs = G.boxes.filter(x => x.y < -60);
  if (bxs.length) { const bx = bxs.sort((a, b) => (G.tier < TIERS.length - 1 && a.gift === 'tier' ? -1 : 0) - (G.tier < TIERS.length - 1 && b.gift === 'tier' ? -1 : 0) || a.hp - b.hp)[0]; return pick(bx.x); }
  const m = G.mobs.filter(x => x.y < 0).sort((a, b) => b.y - a.y)[0];
  if (m) return pick(m.x);
}
