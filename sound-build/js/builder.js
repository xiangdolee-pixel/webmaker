/* 구조 생성기 화면 — 문장을 넣으면 문장마다 표시 · 조립도 · 설명 카드, 고치기, 전체화면(흰 바탕에 문장과 구조만) */
(function () {
  'use strict';
  var SB = window.SB, $ = SB.$, $$ = SB.$$, esc = SB.esc;
  var box = $('#genOut'); if (!box) return;

  var MK = { 'pp-n': '빨간 괄호', 'pp-j': '노란 괄호', 'pp-v': '파란 괄호', 'pp-s': '초록 괄호', 'cl-n': '빨간 사선 /', 'cl-j': '노란 박스', 'cl-v': '빨간 박스', 'cl-s': '초록 박스' };
  var PLACE = { 'pp-n': '명사 뒤', 'pp-j': '형용사 뒤', 'pp-v': '동사 뒤', 'pp-s': '문장 앞', 'cl-n': '명사 뒤', 'cl-j': '형용사 뒤', 'cl-v': '동사 앞·뒤 (주어 · 목적어 자리)', 'cl-s': '문장 앞·뒤' };
  var KIND = { pp: '전치사구', cl: '절' };
  var ROLE = { n: '명사', v: '동사', j: '형용사' };
  var REL7 = /^(who|whom|which|whose|when|where|why)$/, WH = /^(who|whom|which|what|whose|when|where|why|how|whether|if)$/;
  var IC = {
    sound: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5L6 9H3v6h3l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg>',
    edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/></svg>',
    full: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
    steps: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6h7M8 12h7M12 18h8"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>'
  };
  var cards = [];

  function ls(k, v) { try { if (v === undefined) return JSON.parse(localStorage.getItem(k)); localStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; } }

  /* ── 설명 ── */
  function bond(A, p) {
    var t = A.toks, w = t[p.from].t.toLowerCase(), w2 = t[p.from + 1] && t[p.from + 1].w ? t[p.from + 1].t.toLowerCase() : '';
    if (w === 'that') return '본드 <b>THAT</b>';
    if (w === 'to' && p.kind === 'cl') return '본드 <b>TO</b>';
    if (/ing$/.test(w)) return '본드 <b>ING</b>';
    if (REL7.test(w) && p.att === 'n') return '본드 <b>WH</b> · 관계사 ' + w;
    if (/^(which|whom|whose)$/.test(w2) && p.att === 'n') return '본드 <b>WH</b> · 관계사 ' + w2 + ' (앞에 전치사 ' + w + ')';
    if (WH.test(w) && p.att !== 's') return '본드 <b>WH</b> · 의문사 ' + w;
    if (!WH.test(w) && /(ed|en)$/.test(w) || /^(written|done|made|built|known|seen|given|taken)$/.test(w)) return '분사(-ed) 로 시작';
    if (p.att === 's') return '이음말 <b>' + esc(SB.markText(t, p.from, p.from).toLowerCase()) + '</b>';
    return '본드가 숨어 있음 (that 생략)';
  }
  function boneHTML(A, lines) {
    var bones = [];
    lines.forEach(function (L) {
      if (L.p) return;
      L.ids.forEach(function (i) { if (A.roles[i]) bones.push('<span class="w-' + (A.roles[i] === 'j' ? 'p' : A.roles[i]) + '">' + esc(A.toks[i].t) + '</span> <small>' + ROLE[A.roles[i]] + '</small>'); });
    });
    return '<i class="tier-chip t1">1차</i><div><b>뼈대</b> — ' + (bones.join(' · ') || '<small>뼈대를 찾지 못했어요. 고치기로 표시해 주세요.</small>') +
      '<p>문장의 가장 중요한 정보예요. 나머지는 모두 이 뼈대를 설명하러 붙은 부품이에요.</p>' + inlNote(A, lines.filter(function (L) { return !L.p; })) + '</div>';
  }
  // 명사 자리(동사 앞뒤 · 전치사 뒤)에 든 절 = 빨간 박스 = 계단을 내리지 않는 1차 정보
  function inlNote(A, ls) {
    var q = []; ls.forEach(function (L) { (L.inl || []).forEach(function (p) { q.push(p); }); });
    return q.map(function (p) {
      return '<p><span class="mk cl a-v">' + esc(SB.markText(A.toks, p.from, p.to)) + '</span> → <b class="mkname m-cl-v">빨간 박스</b> · 명사 자리(주어 · 목적어 · 전치사 뒤)에 통째로 든 절이라 설명이 아니라 <b>뼈대</b>예요. 계단을 내리지 않고 같은 줄에 둬요 · ' + bond(A, p) + '</p>';
    }).join('');
  }
  function explain(A) {
    var lines = SB.markLines(A.toks, A.roles, A.parts);
    var h = '<li class="ex-row ex-bone">' + boneHTML(A, lines) + '</li>';
    lines.forEach(function (L) { if (L.p) h += '<li class="ex-row" style="--d:' + Math.min(L.tier - 1, 4) + '">' + partHTML(A, lines, L) + '</li>'; });
    return h;
  }
  function partHTML(A, lines, L) {
    var h = '';
    (function () {
      var key = L.p.kind + '-' + L.p.att, head = L.head != null ? A.toks[L.head].t : '';
      var sib = lines.filter(function (x) { return x.p && x.parent === L.parent && x.head === L.head; }).length;
      var who = L.p.att === 's' ? '문장 전체' : '<b>' + esc(head) + '</b>';
      var how = L.parent && L.parent.p ? '<em class="ser">직렬</em> 바로 위 덩어리 속 ' + who + ' 을(를) 설명 — 꼬리 물기'
        : sib > 1 ? '<em class="par">병렬</em> ' + who + ' 에 다른 부품과 나란히' : who + ' 을(를) 설명';
      var sample = L.p.kind === 'pp' ? '<span class="mk pp a-' + L.p.att + '"><b class="br">(</b>' + esc(SB.markText(A.toks, L.p.from, L.p.to)) + '<b class="br">)</b></span>'
        : L.p.att === 'n' ? '<span class="mk cl a-n"><b class="sl">/</b>' + esc(SB.markText(A.toks, L.p.from, L.p.to)) + '</span>'
        : '<span class="mk cl a-' + L.p.att + '">' + esc(SB.markText(A.toks, L.p.from, L.p.to)) + '</span>';
      h = '<i class="tier-chip t' + Math.min(L.tier, 4) + '">' + L.tier + '차</i><div>' + sample +
        '<p>' + how + ' · ' + PLACE[key] + '에 붙은 <b>' + KIND[L.p.kind] + '</b> → <b class="mkname m-' + key + '">' + MK[key] + '</b>' +
        (L.p.kind === 'cl' ? ' · ' + bond(A, L.p) : '') + '</p>' + inlNote(A, [L]) + '</div>';
    })();
    return h;
  }

  /* ── 카드 ── */
  function card(src, k, code) {
    var c = { src: src, k: k, edit: false, pen: 'n', selA: null, sel: null };
    c.A = SB.markParse(code || SB.analyze(src));
    var el = document.createElement('article');
    el.className = 'gen-card';
    el.innerHTML = '<header class="gen-head"><span class="gen-no">' + ('0' + (k + 1)).slice(-2) + '</span><div class="gen-tools">' +
      '<button class="icon-btn" type="button" data-act="say" aria-label="소리 듣기" title="소리 듣기">' + IC.sound + '</button>' +
      '<button class="icon-btn" type="button" data-act="edit" aria-label="고치기" aria-pressed="false" title="고치기">' + IC.edit + '</button>' +
      '<button class="icon-btn" type="button" data-act="full" aria-label="전체화면" title="전체화면">' + IC.full + '</button></div></header>' +
      '<div class="gen-edit" hidden><div class="seg seg-light gen-pens" aria-label="펜"><button data-v="n" class="on">명사</button><button data-v="v">동사</button><button data-v="j">형용사</button><button data-v="part">덩어리</button><button data-v="x">지우개</button></div>' +
      '<p class="gen-tip"></p></div>' +
      '<div class="mk-text gen-sent"></div><div class="mk-sheet gen-sheet" hidden></div>' +
      '<div class="tr-diagram gen-tree"></div>' +
      '<details class="gen-exp" open><summary>구조 설명</summary><ol class="ex-list"></ol></details>' +
      '<div class="gen-code" hidden><label>기호로 고치기 <small>{동사} &lt;명사&gt; *형용사* · 자리( 전치사구 ) · 자리[ 절 ] — 자리 n 명사 뒤 · j 형용사 뒤 · v 동사 · s 문장</small></label>' +
      '<textarea rows="3" spellcheck="false"></textarea><div class="btns"><button class="btn btn-line btn-sm" type="button" data-act="auto">자동으로 다시</button><button class="btn btn-ink btn-sm" type="button" data-act="train">문장 훈련으로 보내기</button></div></div>';
    c.el = el;
    c.sent = $('.gen-sent', el); c.tree = $('.gen-tree', el); c.list = $('.ex-list', el); c.sheet = $('.gen-sheet', el);
    c.code = $('.gen-code textarea', el);
    SB.seg($('.gen-pens', el), function (v) { c.pen = v; c.selA = null; c.sel = null; draw(c); });
    el.addEventListener('click', function (e) { onClick(c, e); });
    c.code.addEventListener('input', function () {
      var A = SB.markParse(c.code.value);
      if (A.toks.length) { c.A = A; draw(c, true); }
    });
    return c;
  }
  var TIP = {
    n: '낱말을 누르면 <b class="w-n">명사</b> 표시가 켜지고 꺼져요.', v: '낱말을 누르면 <b class="w-v">동사</b> 표시가 켜지고 꺼져요.', j: '낱말을 누르면 <b class="w-p">형용사</b> 표시가 켜지고 꺼져요.',
    part: '덩어리의 <b>첫 낱말</b>과 <b>끝 낱말</b>을 차례로 누르고, 어디에 붙는지 고르세요. 같은 범위를 다시 고르면 바뀝니다.',
    x: '표시를 지울 낱말이나 덩어리 안 낱말을 누르세요. (덩어리는 가장 안쪽 것부터 지워져요)'
  };
  function draw(c, fromCode) {
    var A = c.A;
    c.el.classList.toggle('editing', c.edit);
    $('.gen-edit', c.el).hidden = !c.edit;
    $('.gen-code', c.el).hidden = !c.edit;
    $('.gen-tip', c.el).innerHTML = TIP[c.pen];
    c.sent.innerHTML = SB.markInline(A.toks, A.roles, A.parts, { sel: c.sel, selA: c.selA, tiers: !c.edit });
    c.list.innerHTML = explain(A);
    if (!fromCode) c.code.value = SB.markSerialize(A.toks, A.roles, A.parts);
    drawSheet(c);
    SB.markDiagram(c.tree, A.toks, A.roles, A.parts, 0);
  }
  function drawSheet(c) {
    if (!c.sel) { c.sheet.hidden = true; return; }
    c.sheet.hidden = false;
    var row = function (kind) {
      return '<div class="mk-row"><span class="mk-row-h">' + KIND[kind] + '</span>' + ['n', 'j', 'v', 's'].map(function (att) {
        var key = kind + '-' + att;
        var sample = kind === 'pp' ? '<span class="mk pp a-' + att + '"><b class="br">(</b>…<b class="br">)</b></span>'
          : att === 'n' ? '<span class="mk cl a-n"><b class="sl">/</b>…</span>' : '<span class="mk cl a-' + att + '">…</span>';
        return '<button class="mk-opt" type="button" data-kind="' + kind + '" data-att="' + att + '">' + sample + '<small>' + PLACE[key].replace(/ \(.*\)/, '') + '</small></button>';
      }).join('') + '</div>';
    };
    c.sheet.innerHTML = '<p class="mk-sel-t">“' + esc(SB.markText(c.A.toks, c.sel[0], c.sel[1])) + '” 은 어디에 붙나요?</p>' + row('pp') + row('cl') +
      '<div class="mk-sheet-foot"><button class="btn btn-line btn-sm" type="button" data-act="unpart">이 덩어리 지우기</button> <button class="btn btn-line btn-sm" type="button" data-act="cancel">취소</button></div>';
  }
  function onClick(c, e) {
    var b = e.target.closest('button[data-act]');
    if (b) {
      var act = b.dataset.act;
      if (act === 'say') return say(c.src, b);
      if (act === 'full') return full.open(cards.indexOf(c), 'step');   // 전체화면은 '한 단계씩'이 기본
      if (act === 'edit') { c.edit = !c.edit; b.setAttribute('aria-pressed', c.edit); b.classList.toggle('on', c.edit); c.sel = c.selA = null; return draw(c); }
      if (act === 'auto') { c.A = SB.markParse(SB.analyze(c.src)); return draw(c); }
      if (act === 'cancel') { c.sel = null; return draw(c); }
      if (act === 'unpart') { c.A.parts = c.A.parts.filter(function (p) { return !(p.from === c.sel[0] && p.to === c.sel[1]); }); c.sel = null; return draw(c); }
      if (act === 'train') return toTraining(c);
    }
    var o = e.target.closest('.mk-opt');
    if (o && c.sel) {
      var a = c.sel[0], z = c.sel[1];
      var cross = c.A.parts.some(function (p) { return !(z < p.from || a > p.to || (a <= p.from && p.to <= z) || (p.from <= a && z <= p.to)); });
      if (cross) { $('.gen-tip', c.el).innerHTML = '<span class="bad">다른 덩어리와 엇갈려요. 덩어리는 겹치지 않거나, 한쪽이 다른 쪽 안에 쏙 들어가야 해요.</span>'; return; }
      c.A.parts = c.A.parts.filter(function (p) { return !(p.from === a && p.to === z); });
      c.A.parts.push({ from: a, to: z, kind: o.dataset.kind, att: o.dataset.att });
      c.A.parts.sort(function (x, y) { return x.from - y.from || y.to - x.to; });
      c.sel = null; return draw(c);
    }
    var w = e.target.closest('.gen-sent .wd');
    if (!w || !c.edit) return;
    var i = +w.dataset.i, A = c.A;
    if (c.pen === 'part') {
      if (c.selA === null || c.sel) { c.selA = i; c.sel = null; return draw(c); }
      c.sel = [Math.min(c.selA, i), Math.max(c.selA, i)]; c.selA = null;
      return draw(c);
    }
    if (c.pen === 'x') {
      if (A.roles[i]) delete A.roles[i];
      else {
        var inner = A.parts.filter(function (p) { return i >= p.from && i <= p.to; }).sort(function (x, y) { return (x.to - x.from) - (y.to - y.from); })[0];
        if (inner) A.parts.splice(A.parts.indexOf(inner), 1);
      }
      return draw(c);
    }
    if (A.roles[i] === c.pen) delete A.roles[i]; else A.roles[i] = c.pen;
    draw(c);
  }
  function toTraining(c) {
    var list = ls('sb_marks_custom') || [], id = 'g' + Date.now().toString(36);
    list.push({ id: id, level: '내 문장', title: c.src.split(/\s+/).slice(0, 3).join(' ') + '…', a: SB.markSerialize(c.A.toks, c.A.roles, c.A.parts) });
    ls('sb_marks_custom', list);
    location.href = 'training.html?s=' + id;
  }

  /* ── 소리 ── */
  function say(text, btn) {
    var syn = window.speechSynthesis; if (!syn) return;
    syn.cancel();
    var u = new SpeechSynthesisUtterance(text); u.lang = 'en-US'; u.rate = .88;
    var v = syn.getVoices().filter(function (x) { return /^en(-|_)US/i.test(x.lang); })[0]; if (v) u.voice = v;
    if (btn) { btn.classList.add('on'); u.onend = u.onerror = function () { btn.classList.remove('on'); }; }
    syn.speak(u);
  }

  /* ── 전체화면: 흰 바탕에 문장과 구조만 — '한눈에' 또는 '한 단계씩'(뼈대 → 2차 → 3차 …) ── */
  var full = (function () {
    var fs = document.createElement('div'), at = 0, idle, mode = 'step', step = 0, order = [], drawn = null;
    fs.className = 'fs'; fs.hidden = true; fs.setAttribute('role', 'dialog'); fs.setAttribute('aria-modal', 'true'); fs.setAttribute('aria-label', '문장 구조 전체화면');
    fs.innerHTML = '<div class="fs-bar"><div class="fs-left"><span class="fs-no"></span>' +
      '<div class="seg seg-light fs-mode" aria-label="보기 방식"><button data-v="step" class="on">한 단계씩</button><button data-v="all">한눈에</button></div></div><div class="fs-btns">' +
      '<button class="icon-btn" type="button" data-fs="prev" aria-label="앞 문장">' + SB.IC.prev + '</button>' +
      '<button class="icon-btn" type="button" data-fs="next" aria-label="다음 문장">' + SB.IC.next + '</button>' +
      '<button class="icon-btn" type="button" data-fs="say" aria-label="소리 듣기">' + IC.sound + '</button>' +
      '<button class="icon-btn" type="button" data-fs="close" aria-label="닫기 (Esc)">' + IC.close + '</button></div></div>' +
      '<div class="fs-body"><p class="fs-sent"></p><div class="tr-diagram fs-tree"></div></div>' +
      '<div class="fs-step" hidden><div class="fs-cap ex-row"></div><div class="fs-step-nav">' +
      '<button class="btn btn-line btn-sm" type="button" data-fs="back">' + SB.IC.prev + '이전 단계</button><span class="fs-count"></span>' +
      '<button class="btn btn-ink btn-sm" type="button" data-fs="fwd">다음 단계' + SB.IC.next + '</button></div></div>';
    document.body.appendChild(fs);
    var seg = SB.seg($('.fs-mode', fs), function (v) { mode = v; step = 0; show(); });

    function fit(el) {
      el.style.fontSize = ''; el.classList.add('one-line');
      var base = parseFloat(getComputedStyle(el).fontSize), min = 16;
      if (el.scrollWidth > el.clientWidth) {
        var size = Math.floor(base * el.clientWidth / el.scrollWidth * 0.98);
        el.style.fontSize = Math.max(size, min) + 'px';
        if (el.scrollWidth > el.clientWidth) el.classList.remove('one-line');   // 너무 긴 문장은 줄바꿈 허용
      }
    }
    function show(anim) {
      var c = cards[at]; if (!c) return;
      var A = c.A, sent = $('.fs-sent', fs), tree = $('.fs-tree', fs);
      $('.fs-no', fs).textContent = (at + 1) + ' / ' + cards.length;
      $('[data-fs="prev"]', fs).disabled = at === 0;
      $('[data-fs="next"]', fs).disabled = at === cards.length - 1;
      fs.classList.toggle('stepping', mode === 'step');
      $('.fs-step', fs).hidden = mode !== 'step';
      // 위 문장은 한 줄에 — 다 표시된 모양 기준으로 글자 크기를 한 번 정한다(단계가 바뀌어도 크기가 튀지 않게)
      sent.innerHTML = SB.markInline(A.toks, A.roles, A.parts, { tiers: true });
      fit(sent);
      drawn = SB.markDiagram(tree, A.toks, A.roles, A.parts, 0);
      if (mode !== 'step') return;
      // 뼈대(1차) 먼저, 그다음 조립도 순서대로 한 덩어리씩
      order = drawn.filter(function (L) { return !L.p; }).concat(drawn.filter(function (L) { return L.p; }));
      var bones = order.filter(function (L) { return !L.p; }).length;
      // step 0 = 문장만(표시 없음) → 1 = 뼈대 → 2… = 부품 하나씩
      var upto = step === 0 ? -1 : bones - 1 + (step - 1), seen = order.slice(0, upto + 1);
      var ids = {}, roles = {}, parts = [];
      seen.forEach(function (L) { if (L.p) { parts.push(L.p); for (var i = L.p.from; i <= L.p.to; i++) ids[i] = 1; } else L.ids.forEach(function (i) { ids[i] = 1; }); (L.inl || []).forEach(function (q) { parts.push(q); }); });
      // 아직 안 나온 덩어리 안 낱말은 흐리게
      order.slice(upto + 1).forEach(function (L) { if (L.p) L.ids.forEach(function (i) { delete ids[i]; }); });
      Object.keys(A.roles).forEach(function (i) { if (ids[i]) roles[i] = A.roles[i]; });
      sent.innerHTML = SB.markInline(A.toks, roles, parts, { tiers: step > 0 });
      if (step > 0) $$('.wd', sent).forEach(function (w) { if (!ids[w.dataset.i]) w.classList.add('fs-later'); });
      order.forEach(function (L, k) {
        L.el.classList.toggle('pending', k > upto);
        L.el.classList.remove('reveal');
        if (anim && (k === upto || (step === 1 && k < bones))) { void L.el.offsetWidth; L.el.classList.add('reveal'); }
      });
      var cur = order[upto];
      $('.fs-cap', fs).innerHTML = step === 0 ? '<i class="tier-chip">시작</i><div><b>먼저 문장을 소리 내어 읽어 보세요.</b><p>다음 단계를 누르면 문장의 뼈대(1차 정보)부터 하나씩 나타나요.</p></div>' : cur && cur.p ? partHTML(A, drawn, cur) : boneHTML(A, drawn);
      var tot = order.length - bones + 1;     // 뼈대 1 + 부품 수 (시작 화면은 세지 않음)
      $('.fs-count', fs).textContent = step === 0 ? '시작' : step + ' / ' + tot + ' 단계';
      $('[data-fs="back"]', fs).disabled = step === 0 && at === 0;
      $('[data-fs="fwd"]', fs).disabled = step >= tot && at === cards.length - 1;
    }
    function total() { var c = cards[at]; return c ? c.A.parts.length + 2 : 2; }   // 시작 + 뼈대 + 부품 수
    function fwd() {
      if (mode !== 'step') { if (at < cards.length - 1) { at++; show(); } return; }
      if (step < total() - 1) { step++; show(true); }
      else if (at < cards.length - 1) { at++; step = 0; show(); }
    }
    function back() {
      if (mode !== 'step') { if (at > 0) { at--; show(); } return; }
      if (step > 0) { step--; show(); }
      else if (at > 0) { at--; step = total() - 1; show(); }
    }
    function wake() { fs.classList.remove('idle'); clearTimeout(idle); idle = setTimeout(function () { fs.classList.add('idle'); }, 2500); }
    function open(k, m) {
      at = k; step = 0; fs.hidden = false; document.body.classList.add('fs-on');
      if (m && m !== mode) { mode = m; seg.set(m); }
      if (fs.requestFullscreen) fs.requestFullscreen().catch(function () {});
      show(); wake();
      setTimeout(function () { seg.place(true); show(); }, 150);    // 전체화면으로 커진 뒤 계단 다시 재기
      $('[data-fs="close"]', fs).focus({ preventScroll: true });
    }
    function close() {
      if (document.fullscreenElement) document.exitFullscreen().catch(function () {});
      fs.hidden = true; document.body.classList.remove('fs-on');
      if (window.speechSynthesis) speechSynthesis.cancel();
    }
    fs.addEventListener('click', function (e) {
      var b = e.target.closest('[data-fs]');
      if (!b) { if (mode === 'step' && e.target.closest('.fs-body')) fwd(); return; }   // 단계 보기: 화면을 누르면 다음 단계
      var a = b.dataset.fs;
      if (a === 'close') close();
      if (a === 'prev' && at > 0) { at--; step = 0; show(); }
      if (a === 'next' && at < cards.length - 1) { at++; step = 0; show(); }
      if (a === 'fwd') fwd();
      if (a === 'back') back();
      if (a === 'say') say(cards[at].src, b);
    });
    fs.addEventListener('mousemove', wake);
    document.addEventListener('fullscreenchange', function () { if (!document.fullscreenElement && !fs.hidden) close(); else if (!fs.hidden) show(); });
    document.addEventListener('keydown', function (e) {
      if (fs.hidden) return;
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown' || e.key === 'Enter') { e.preventDefault(); fwd(); }
      if (e.key === 'ArrowLeft' || e.key === 'PageUp' || e.key === 'Backspace') { e.preventDefault(); back(); }
    });
    window.addEventListener('resize', function () { if (!fs.hidden) show(); });
    return { open: open };
  })();

  /* ── 입력 ── */
  var input = $('#genText');
  function run() {
    var list = SB.splitSentences(input.value);
    ls('sb_gen_text', input.value);
    cards = []; box.innerHTML = '';
    if (!list.length) { box.innerHTML = '<p class="gen-empty">위에 영어 문장을 넣고 <b>구조 보기</b>를 누르세요.</p>'; return; }
    if (list.length > 1) box.insertAdjacentHTML('beforeend', '<p class="gen-count">넣은 글을 마침표 기준으로 <b>문장 ' + list.length + '개</b>로 나눠, 문장마다 따로 보여 줍니다.</p>');
    list.forEach(function (s, k) { var c = card(s, k); cards.push(c); box.appendChild(c.el); draw(c); });
  }
  $('#genRun').addEventListener('click', function () { run(); box.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  $('#genClear').addEventListener('click', function () { input.value = ''; input.focus(); run(); });
  input.addEventListener('keydown', function (e) { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); $('#genRun').click(); } });
  $$('#genSamples [data-s]').forEach(function (b) {
    b.addEventListener('click', function () { input.value = b.dataset.s; run(); });
  });
  var rt; window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(function () { cards.forEach(function (c) { SB.markDiagram(c.tree, c.A.toks, c.A.roles, c.A.parts, 0); }); }, 100); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { cards.forEach(function (c) { SB.markDiagram(c.tree, c.A.toks, c.A.roles, c.A.parts, 0); }); });
  input.value = ls('sb_gen_text') || 'Elephants in the jungle of Africa play in the mud of this river.';   // 처음엔 한 문장만
  run();
})();
