/* 문장 표시 훈련 — 학생이 직접 기호를 쳐서 문장구조(조립도)를 만든다.
   ① 뼈대 찾기: 1차 정보의 명사 · 동사 · 형용사 표시 → 채점
   ② 부품 붙이기: 덩어리를 고르고 '붙는 자리 × 부품(전치사구 · 절)' 표시 → 채점
   ③ 조립도: 표시대로 1차 · 2차 · 3차 계단을 그린다
   강사 모드: 같은 화면에서 정답을 만든다(시안: 이 브라우저에 저장, 2단계에서 xms 로). */
(function () {
  'use strict';
  var SB = window.SB, $ = SB.$, $$ = SB.$$, esc = SB.esc;
  var ROLE = { n: '명사', v: '동사', j: '형용사' };
  var ATT = { n: '명사 뒤', j: '형용사 뒤', v: '동사', s: '문장' };
  var KIND = { pp: '전치사구', cl: '절' };
  var MARKS = [   // 붙는 자리 × 부품 = 표시 (강사 규칙)
    { kind: 'pp', att: 'n', sym: '( )', name: '명사 뒤' }, { kind: 'pp', att: 'j', sym: '( )', name: '형용사 뒤' },
    { kind: 'pp', att: 'v', sym: '( )', name: '동사 뒤' }, { kind: 'pp', att: 's', sym: '( )', name: '문장 앞' },
    { kind: 'cl', att: 'n', sym: '/', name: '명사 뒤' }, { kind: 'cl', att: 'j', sym: '', name: '형용사 뒤' },
    { kind: 'cl', att: 'v', sym: '', name: '동사 앞·뒤' }, { kind: 'cl', att: 's', sym: '', name: '문장 앞·뒤' }
  ];
  var TIER = ['', '1차', '2차', '3차', '4차', '5차', '6차'];

  /* ── 정답 기호 읽기 / 쓰기 ── */
  var WORD = /[A-Za-z0-9'’\-]/;
  function parseA(s) {
    var toks = [], parts = [], stack = [], role = null, sp = false, i = 0;
    function lastWord() { for (var k = toks.length - 1; k >= 0; k--) if (toks[k].w) return k; return 0; }
    while (i < s.length) {
      var c = s[i];
      if (/\s/.test(c)) { sp = true; i++; continue; }
      if ('njvs'.indexOf(c) >= 0 && (s[i + 1] === '(' || s[i + 1] === '[') && (i === 0 || /[\s(\[]/.test(s[i - 1]))) {
        stack.push({ from: toks.length, kind: s[i + 1] === '(' ? 'pp' : 'cl', att: c, close: s[i + 1] === '(' ? ')' : ']', sp: sp });
        i += 2; continue;
      }
      if ((c === ')' || c === ']') && stack.length && stack[stack.length - 1].close === c) {
        var p = stack.pop(); parts.push({ from: p.from, to: lastWord(), kind: p.kind, att: p.att }); i++; continue;
      }
      if (c === '{') { role = 'v'; i++; continue; }
      if (c === '<') { role = 'n'; i++; continue; }
      if (c === '}' || c === '>') { role = null; i++; continue; }
      if (c === '*') { role = role === 'j' ? null : 'j'; i++; continue; }
      if (WORD.test(c)) {
        var j = i; while (j < s.length && WORD.test(s[j])) j++;
        toks.push({ t: s.slice(i, j), w: true, sp: sp, role: role }); sp = false; i = j; continue;
      }
      toks.push({ t: c, w: false, sp: sp }); sp = false; i++;
    }
    var roles = {};
    toks.forEach(function (t, k) { if (t.role) roles[k] = t.role; delete t.role; });
    parts.sort(byPos);
    return { toks: toks, roles: roles, parts: parts };
  }
  function byPos(a, b) { return a.from - b.from || b.to - a.to; }
  function serialize(toks, roles, parts) {
    var out = '', opens = {}, closes = {};
    parts.forEach(function (p) { (opens[p.from] = opens[p.from] || []).push(p); (closes[p.to] = closes[p.to] || []).push(p); });
    toks.forEach(function (t, i) {
      if (t.sp && out) out += ' ';
      (opens[i] || []).sort(function (a, b) { return b.to - a.to; }).forEach(function (p) { out += p.att + (p.kind === 'pp' ? '(' : '['); });
      var r = t.w && roles[i];
      out += r === 'v' ? '{' + t.t + '}' : r === 'n' ? '<' + t.t + '>' : r === 'j' ? '*' + t.t + '*' : t.t;
      (closes[i] || []).sort(function (a, b) { return b.from - a.from; }).forEach(function (p) { out += p.kind === 'pp' ? ')' : ']'; });
    });
    return out;
  }
  function inside(i, parts) { return parts.some(function (p) { return i >= p.from && i <= p.to; }); }
  function plainText(toks, a, b) {
    var s = ''; for (var i = a; i <= b; i++) s += (s && toks[i].sp ? ' ' : '') + toks[i].t; return s;
  }

  /* ── 문장에 표시 그리기 (수업 때 손으로 하던 모양 그대로) ── */
  function inline(toks, roles, parts, o) {
    o = o || {};
    var list = parts.map(function (p, k) { return { p: p, k: k }; }).sort(function (a, b) { return byPos(a.p, b.p); });
    var h = '', stack = [];
    toks.forEach(function (t, i) {
      if (t.sp && h) h += ' ';
      list.forEach(function (x) {
        if (x.p.from !== i) return;
        var g = o.pg && o.pg[x.k] ? ' g-' + o.pg[x.k] : '';
        h += '<span class="mk ' + x.p.kind + ' a-' + x.p.att + g + '" data-k="' + x.k + '">' +
          (x.p.kind === 'pp' ? '<b class="br">(</b>' : x.p.att === 'n' ? '<b class="sl">/</b>' : '');
        stack.push(x);
      });
      if (!t.w) h += '<span class="pu">' + esc(t.t) + '</span>';
      else {
        var c = 'wd' + (roles[i] ? ' r-' + roles[i] : '');
        if (o.wg && o.wg[i]) c += ' g-' + o.wg[i];
        if (o.sel && i >= o.sel[0] && i <= o.sel[1]) c += ' insel';
        if (o.selA === i) c += ' sel-a';
        h += '<span class="' + c + '" data-i="' + i + '">' + esc(t.t) + '</span>';
      }
      while (stack.length && stack[stack.length - 1].p.to === i) h += closeMk(stack.pop());
    });
    while (stack.length) h += closeMk(stack.pop());
    return h;
  }
  function closeMk(x) { return (x.p.kind === 'pp' ? '<b class="br">)</b>' : '') + '</span>'; }

  /* ── 조립도: 표시에서 계단을 만든다 ── */
  function buildLines(toks, roles, parts) {
    var root = { from: 0, to: toks.length - 1, kids: [] }, stack = [root];
    parts.slice().sort(byPos).forEach(function (p) {
      var n = { p: p, from: p.from, to: p.to, kids: [] };
      while (stack.length > 1 && !(stack[stack.length - 1].from <= p.from && p.to <= stack[stack.length - 1].to)) stack.pop();
      stack[stack.length - 1].kids.push(n); stack.push(n);
    });
    function own(n) {
      var ids = [];
      for (var i = n.from; i <= n.to; i++) if (!n.kids.some(function (k) { return i >= k.from && i <= k.to; })) ids.push(i);
      return ids;
    }
    var out = [];
    function emit(n, depth, parentLine, tier) {
      var L = { n: n, p: n.p, ids: own(n), depth: depth, tier: tier, parent: parentLine };
      out.push(L);
      n.kids.forEach(function (k) { emit(k, depth + 1, L, tier + 1); });
      return L;
    }
    var rootIds = own(root), firstOwn = rootIds.filter(function (i) { return toks[i].w; })[0];
    var front = root.kids.filter(function (k) { return k.p.att === 's' && k.to < firstOwn; });
    front.forEach(function (k) { emit(k, 0, null, 2); });
    // 쌍반점(;)으로 나뉜 뼈대는 따로 한 줄씩 — 각자의 부품이 자기 줄 아래로 붙는다
    var segs = [], cur = [];
    rootIds.forEach(function (i) { cur.push(i); if (toks[i].t === ';') { segs.push(cur); cur = []; } });
    if (cur.length) segs.push(cur);
    segs.forEach(function (ids, si) {
      var R = { n: root, p: null, ids: ids, depth: 0, tier: 1, parent: null, gap: si > 0 };
      out.push(R);
      var lo = si ? segs[si - 1][segs[si - 1].length - 1] : -1, hi = si < segs.length - 1 ? ids[ids.length - 1] : Infinity;
      root.kids.forEach(function (k) { if (front.indexOf(k) < 0 && k.from > lo && k.from <= hi) emit(k, 1, R, 2); });
    });
    // 매달 단어 = 붙는 자리 규칙대로
    out.forEach(function (L) {
      if (!L.parent) return;
      L.parent.kids = true;
      var P = L.parent, words = P.ids.filter(function (i) { return toks[i].w; });
      var att = L.p.att, head = null;
      if (att !== 's') {
        var want = att, before = words.filter(function (i) { return roles[i] === want && i < L.p.from; });
        var after = words.filter(function (i) { return roles[i] === want && i > L.p.to; });
        head = before.length ? before[before.length - 1] : after.length ? after[0] : null;
      }
      if (head === null) {
        var prev = words.filter(function (i) { return i < L.p.from; });
        head = prev.length ? prev[prev.length - 1] : words[words.length - 1];
      }
      L.head = head;
    });
    return out;
  }
  function lineHTML(toks, roles, L) {
    var h = '<i class="tier">' + TIER[Math.min(L.tier, 6)] + '</i>', first = true;
    if (L.p && L.p.kind === 'pp') h += '<b class="br a-' + L.p.att + '">(</b>';
    if (L.p && L.p.kind === 'cl' && L.p.att === 'n') h += '<b class="sl">/</b>';
    L.ids.forEach(function (i) {
      var t = toks[i];
      if (!first && (t.sp || (t.w && toks[i - 1] && toks[i - 1].w))) h += ' ';
      first = false;
      if (!t.w) { h += esc(t.t); return; }
      var r = roles[i];
      h += '<span class="' + (r === 'v' ? 'w-v' : r === 'n' ? 'w-n' : r === 'j' ? 'w-p' : 'ww') + '" data-i="' + i + '">' + esc(t.t) + '</span>';
    });
    if (L.p && L.p.kind === 'pp') h += '<b class="br a-' + L.p.att + '">)</b>';
    return h;
  }
  function drawDiagram(box, toks, roles, parts, tierMax) {
    var lines = buildLines(toks, roles, parts);
    box.innerHTML = lines.map(function (L, k) {
      var c = 'dl' + (L.parent ? ' kid' : '') + (L.kids ? ' has-kids' : '');
      if (L.p && L.p.kind === 'cl' && L.p.att !== 'n') c += ' bx bx-' + L.p.att;
      if (L.gap) c += ' gap';
      return '<span class="' + c + '" data-tier="' + L.tier + '">' + lineHTML(toks, roles, L) + '</span>';
    }).join('');
    var els = $$('.dl', box);
    lines.forEach(function (L, k) {
      L.el = els[k];
      if (L.parent) L.anchorNode = $('[data-i="' + L.head + '"]', L.parent.el) || L.parent.el;
      L.el.classList.toggle('dim', tierMax > 0 && L.tier > tierMax);
    });
    box.classList.toggle('show-tier', true);
    SB.layoutDiagram(box, lines);
    return lines;
  }

  /* ── 저장 (시안: 이 브라우저) ── */
  function ls(k, v) {
    try { if (v === undefined) return JSON.parse(localStorage.getItem(k)); localStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; }
  }
  function allSets() {
    var custom = ls('sb_marks_custom') || [], over = ls('sb_marks_over') || {};
    return SB.marks.map(function (m) { return over[m.id] ? { id: m.id, level: m.level, title: m.title, a: over[m.id] } : m; })
      .concat(custom);
  }

  /* ── 화면 ── */
  function init() {
    var root = $('#marker'); if (!root) return;
    var setsBox = $('#markSets'), text = $('#mkText'), sheet = $('#mkSheet'), partsBox = $('#mkParts'),
      diag = $('#mkDiagram'), guide = $('#mkGuide'), result = $('#mkResult'), pensBox = $('#mkPens');
    var st = { step: 'bone', pen: 'v', teacher: false, show: false, selA: null, sel: null, tier: 0, src: 'mine' };
    var set, A, me, grade = { w: null, p: null };

    var GUIDE = {
      bone: '<b>① 뼈대 찾기</b> — 문장의 1차 정보부터. 펜을 고르고 뼈대가 되는 <b class="w-n">명사</b> · <b class="w-v">동사</b> · <b class="w-p">형용사</b> 낱말을 누르세요. 설명으로 붙은 말(2차 정보 이하)은 표시하지 않습니다.',
      part: '<b>② 부품 붙이기</b> — 붙어 있는 덩어리(전치사구 · 절)의 <b>첫 낱말</b>과 <b>끝 낱말</b>을 차례로 누르고, 어디에 붙는지 고르세요. 덩어리 안의 덩어리는 3차 정보입니다.',
      tree: '<b>③ 조립도</b> — 표시한 대로 1차 · 2차 · 3차 정보가 계단으로 붙습니다.'
    };
    var TGUIDE = '<b>강사 모드</b> — 지금 표시하는 것이 정답이 됩니다. 뼈대(명사 · 동사 · 형용사)는 덩어리 안의 것까지 모두 표시해 두면 조립도가 더 잘 나옵니다.';

    function key() { return 'sb_mark_' + set.id; }
    function load(id) {
      var list = allSets();
      set = list.filter(function (s) { return s.id === id; })[0] || list[0];
      A = parseA(set.a);
      me = ls(key()) || { roles: {}, parts: [] };
      grade = { w: null, p: null }; st.show = false; st.sel = null; st.selA = null;
      drawSets(); draw();
    }
    function save() { if (!st.teacher) ls(key(), me); }
    function cur() { return st.teacher ? A : (st.show ? A : me); }

    function drawSets() {
      var list = allSets();
      setsBox.innerHTML = list.map(function (s) {
        var done = ls('sb_mark_ok_' + s.id);
        return '<button class="chip' + (s.id === set.id ? ' on' : '') + '" type="button" data-id="' + esc(s.id) + '">' +
          esc(s.title) + ' <small>' + esc(s.level || '') + '</small>' + (done ? ' ✓' : '') + '</button>';
      }).join('');
    }
    setsBox.addEventListener('click', function (e) {
      var b = e.target.closest('[data-id]'); if (b) load(b.dataset.id);
    });

    function topRoles() {
      var r = {};
      Object.keys(A.roles).forEach(function (i) { if (!inside(+i, A.parts)) r[i] = A.roles[i]; });
      return r;
    }

    function draw() {
      var d = cur();
      root.classList.toggle('teacher', st.teacher);
      root.dataset.step = st.step;
      guide.innerHTML = st.teacher ? TGUIDE + '<br>' + GUIDE[st.step].replace(/<b>[^<]*<\/b> — /, '') : GUIDE[st.step];
      pensBox.hidden = st.step !== 'bone';
      $('#mkTreeBar').hidden = st.step !== 'tree';
      diag.hidden = st.step !== 'tree';
      text.hidden = st.step === 'tree';
      partsBox.hidden = st.step !== 'part';
      var o = { sel: st.sel, selA: st.selA };
      if (!st.show && !st.teacher) {
        if (st.step === 'bone' && grade.w) o.wg = grade.w;
        if (st.step === 'part' && grade.p) o.pg = grade.p;
      }
      text.innerHTML = inline(A.toks, d.roles, d.parts, o);
      drawSheet(); drawParts(); drawResult();
      if (st.step === 'tree') {
        var src = st.teacher || st.src === 'ans' ? A : me;
        var roles = src === A ? A.roles : mergeRoles();
        drawDiagram(diag, A.toks, roles, src.parts, st.tier);
      }
      $('#mkCheck').hidden = st.teacher || st.step === 'tree';
      $('#mkShow').hidden = st.teacher || st.step === 'tree';
      $('#mkShow').textContent = st.show ? '내 표시로' : '정답 보기';
      $('#mkReset').hidden = st.teacher;
      $('#mkTeacherBox').hidden = !st.teacher;
      if (st.teacher) $('#mkCode').value = serialize(A.toks, A.roles, A.parts);
    }
    // 내 조립도: 내가 친 뼈대 + 덩어리 안쪽 낱말은 정답의 품사를 빌려 쓴다
    function mergeRoles() {
      var r = {};
      Object.keys(me.roles).forEach(function (i) { r[i] = me.roles[i]; });
      Object.keys(A.roles).forEach(function (i) { if (inside(+i, me.parts) && !r[i]) r[i] = A.roles[i]; });
      return r;
    }

    function drawSheet() {
      if (!(st.step === 'part' && st.sel && !st.show)) { sheet.hidden = true; return; }
      sheet.hidden = false;
      var row = function (kind) {
        return '<div class="mk-row"><span class="mk-row-h">' + KIND[kind] + '</span>' + MARKS.filter(function (m) { return m.kind === kind; }).map(function (m) {
          var sample = kind === 'pp' ? '<span class="mk pp a-' + m.att + '"><b class="br">(</b>…<b class="br">)</b></span>'
            : m.att === 'n' ? '<span class="mk cl a-n"><b class="sl">/</b>…</span>' : '<span class="mk cl a-' + m.att + '">…</span>';
          return '<button class="mk-opt" type="button" data-kind="' + kind + '" data-att="' + m.att + '">' + sample + '<small>' + m.name + '</small></button>';
        }).join('') + '</div>';
      };
      sheet.innerHTML = '<p class="mk-sel-t">“' + esc(plainText(A.toks, st.sel[0], st.sel[1])) + '” 은 어디에 붙나요?</p>' +
        row('pp') + row('cl') + '<div class="mk-sheet-foot"><button class="btn btn-line btn-sm" type="button" data-act="cancel">취소</button></div>';
    }
    function drawParts() {
      var d = cur();
      if (!d.parts.length) { partsBox.innerHTML = '<p class="mk-empty">아직 붙인 부품이 없습니다.</p>'; return; }
      partsBox.innerHTML = d.parts.map(function (p, k) {
        var g = (!st.show && !st.teacher && grade.p && grade.p[k]) ? ' g-' + grade.p[k] : '';
        return '<li class="mk-part' + g + '"><span class="mk-part-tag a-' + p.att + '">' + KIND[p.kind] + ' · ' + (p.kind === 'pp' && p.att === 'v' ? '동사 뒤' : p.kind === 'pp' && p.att === 's' ? '문장 앞' : p.kind === 'cl' && p.att === 'v' ? '동사 앞·뒤' : p.kind === 'cl' && p.att === 's' ? '문장 앞·뒤' : ATT[p.att]) + '</span>' +
          '<span class="mk-part-t">' + esc(plainText(A.toks, p.from, p.to)) + '</span>' +
          (st.show ? '' : '<button class="icon-btn sm" type="button" data-del="' + k + '" aria-label="이 부품 지우기">✕</button>') + '</li>';
      }).join('');
    }
    function drawResult() {
      if (st.teacher) { result.textContent = ''; return; }
      if (st.show) { result.innerHTML = '<span class="ok">정답을 보고 있습니다.</span>'; return; }
      result.innerHTML = grade.msg || '';
    }

    /* 낱말 누르기 */
    text.addEventListener('click', function (e) {
      var w = e.target.closest('.wd'); if (!w || st.show) return;
      var i = +w.dataset.i, d = cur();
      if (st.step === 'bone') {
        if (st.pen === 'x' || d.roles[i] === st.pen) delete d.roles[i]; else d.roles[i] = st.pen;
        grade.w = null; grade.msg = ''; save(); draw(); return;
      }
      if (st.step === 'part') {
        if (st.selA === null || st.sel) { st.selA = i; st.sel = null; draw(); return; }
        st.sel = [Math.min(st.selA, i), Math.max(st.selA, i)];
        // 첫 · 끝이 문장부호면 낱말로 줄인다
        while (!A.toks[st.sel[0]].w && st.sel[0] < st.sel[1]) st.sel[0]++;
        while (!A.toks[st.sel[1]].w && st.sel[1] > st.sel[0]) st.sel[1]--;
        st.selA = null; draw();
        sheet.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    });
    sheet.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.dataset.act === 'cancel') { st.sel = null; draw(); return; }
      var d = cur(), a = st.sel[0], z = st.sel[1];
      var cross = d.parts.some(function (p) {
        var disjoint = z < p.from || a > p.to, nested = (a <= p.from && p.to <= z) || (p.from <= a && z <= p.to);
        return !(disjoint || nested);
      });
      if (cross) { result.innerHTML = '<span class="bad">다른 덩어리와 엇갈립니다. 덩어리는 서로 겹치지 않거나, 한쪽이 다른 쪽 안에 들어가야 합니다.</span>'; return; }
      d.parts = d.parts.filter(function (p) { return !(p.from === a && p.to === z); });
      d.parts.push({ from: a, to: z, kind: b.dataset.kind, att: b.dataset.att });
      d.parts.sort(byPos);
      st.sel = null; grade.p = null; grade.msg = ''; save(); draw();
    });
    partsBox.addEventListener('click', function (e) {
      var b = e.target.closest('[data-del]'); if (!b) return;
      cur().parts.splice(+b.dataset.del, 1); grade.p = null; grade.msg = ''; save(); draw();
    });

    /* 채점 */
    $('#mkCheck').addEventListener('click', function () {
      if (st.step === 'bone') {
        var ans = topRoles(), wg = {}, ok = 0, bad = 0, miss = 0, total = Object.keys(ans).length;
        Object.keys(ans).forEach(function (i) {
          if (me.roles[i] === ans[i]) { wg[i] = 'ok'; ok++; } else if (me.roles[i]) { wg[i] = 'bad'; bad++; } else { wg[i] = 'miss'; miss++; }
        });
        Object.keys(me.roles).forEach(function (i) { if (!ans[i]) { wg[i] = 'bad'; bad++; } });
        grade.w = wg;
        grade.msg = ok === total && !bad
          ? '<span class="ok">뼈대 ' + total + '개를 모두 찾았습니다! 이제 ② 부품 붙이기로 가세요.</span>'
          : '<span>뼈대 ' + total + '개 중 <b class="ok">' + ok + '개 맞음</b>' + (bad ? ' · <b class="bad">' + bad + '개 틀림</b>' : '') + (miss ? ' · <b class="miss">' + miss + '개 빠짐</b>(점선)' : '') + '</span>';
      } else {
        var used = {}, pg = {}, okp = 0;
        me.parts.forEach(function (p, k) {
          var hit = -1;
          A.parts.forEach(function (q, qi) { if (!used[qi] && q.from === p.from && q.to === p.to) hit = qi; });
          if (hit >= 0) {
            used[hit] = 1;
            var q = A.parts[hit];
            if (q.kind === p.kind && q.att === p.att) { pg[k] = 'ok'; okp++; } else pg[k] = 'half';
          } else pg[k] = 'bad';
        });
        var missP = A.parts.length - Object.keys(used).length, half = Object.keys(pg).filter(function (k) { return pg[k] === 'half'; }).length,
          badP = Object.keys(pg).filter(function (k) { return pg[k] === 'bad'; }).length;
        grade.p = pg;
        var all = okp === A.parts.length && !badP && !half;
        if (all) ls('sb_mark_ok_' + set.id, 1);
        grade.msg = all
          ? '<span class="ok">부품 ' + okp + '개를 모두 맞게 붙였습니다! ③ 조립도에서 계단을 확인하세요.</span>'
          : '<span>부품 ' + A.parts.length + '개 중 <b class="ok">' + okp + '개 맞음</b>' + (half ? ' · <b class="half">' + half + '개 범위는 맞고 표시가 다름</b>' : '') +
            (badP ? ' · <b class="bad">' + badP + '개 범위가 다름</b>' : '') + (missP > 0 ? ' · <b class="miss">' + missP + '개 더 있음</b>' : '') + '</span>';
        if (all) drawSets();
      }
      draw();
    });
    $('#mkShow').addEventListener('click', function () { st.show = !st.show; st.sel = null; st.selA = null; draw(); });
    $('#mkReset').addEventListener('click', function () {
      if (st.step === 'bone') me.roles = {}; else me.parts = [];
      grade = { w: null, p: null }; st.sel = null; st.selA = null; save(); draw();
    });

    /* 단계 · 펜 · 조립도 보기 */
    var steps = SB.seg($('#mkSteps'), function (v) { st.step = v; st.sel = null; st.selA = null; grade.msg = ''; draw(); });
    SB.seg($('#mkPenSeg'), function (v) { st.pen = v; });
    SB.seg($('#mkTierSeg'), function (v) { st.tier = +v; draw(); });
    SB.seg($('#mkSrcSeg'), function (v) { st.src = v; draw(); });
    var rt; window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(function () { if (st.step === 'tree') draw(); }, 100); });

    /* 강사 모드 */
    $('#mkTeacher').addEventListener('click', function () {
      st.teacher = !st.teacher; st.show = false; st.sel = null; st.selA = null; grade = { w: null, p: null };
      this.classList.toggle('on', st.teacher); this.setAttribute('aria-pressed', st.teacher);
      draw();
    });
    $('#mkNewBtn').addEventListener('click', function () {
      var v = $('#mkNew').value.replace(/[{}<>*\[\]]/g, '').trim(); if (!v) return;
      var custom = ls('sb_marks_custom') || [], id = 'c' + Date.now().toString(36);
      custom.push({ id: id, level: '내 문장', title: v.split(/\s+/).slice(0, 3).join(' ') + '…', a: v });
      ls('sb_marks_custom', custom); $('#mkNew').value = ''; steps.set('bone'); load(id);
    });
    $('#mkSave').addEventListener('click', function () {
      var code = serialize(A.toks, A.roles, A.parts);
      var custom = ls('sb_marks_custom') || [], hit = custom.filter(function (c) { return c.id === set.id; })[0];
      if (hit) { hit.a = code; ls('sb_marks_custom', custom); }
      else { var over = ls('sb_marks_over') || {}; over[set.id] = code; ls('sb_marks_over', over); }
      $('#mkSaved').textContent = '저장했습니다. 학생 화면에서 이 정답으로 채점됩니다.';
      setTimeout(function () { $('#mkSaved').textContent = ''; }, 2500);
    });

    load(new URLSearchParams(location.search).get('s') || SB.marks[0].id);
  }
  SB.markParse = parseA; SB.markSerialize = serialize;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
