/* 문장 훈련 — 정보의 계층화 [1차 - 2차 - 3차 정보]
   SB.trainer(el, set) : el 안에 훈련 화면을 그린다. 입력 기호는 data.js 위쪽 설명 참고. */
(function () {
  'use strict';
  var SB = window.SB, $ = SB.$, $$ = SB.$$, esc = SB.esc;
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var TIER = ['', '1차', '2차', '3차', '4차', '5차', '6차'];

  /* ── 해석: 줄 → { depth, tier, anchor, tokens, gap } ── */
  var TOK = /!([njvs])\(([^)]*)\)|\{([^}]*)\}|<([^>]*)>|\[([^\]]*)\]|\(([^)]*)\)|\*([^*]*)\*|~([^~]*)~|\+(\S+)|(\/)|\|([^|]*)\||([^{<\[(*~+\/|]+)/g;
  var TYPES = ['v', 'n', 'c', 'm', 'p', 'a', 'k', 'r', 'y', 't'];
  function tokenize(s) {
    var out = [], m; TOK.lastIndex = 0;
    while ((m = TOK.exec(s))) {
      if (m[1]) { out.push({ type: 'm', text: m[2], force: m[1] }); continue; }
      for (var i = 3; i <= 12; i++) if (m[i] !== undefined) { out.push({ type: TYPES[i - 3], text: m[i] }); break; }
    }
    return out;
  }
  function parse(text) {
    var lines = [], gap = false;
    String(text || '').split('\n').forEach(function (raw) {
      if (!raw.trim()) { gap = lines.length > 0; return; }
      var ind = raw.match(/^\s*/)[0].replace(/\t/g, '  ').length, s = raw.trim(), tier = 0, anchor = '', gx = null, m;
      var bw = 0, bh = 0, gy = 0;
      while ((m = s.match(/^#(\d)\s+/)) || (m = s.match(/^@(\S+)\s+/)) || (m = s.match(/^%([\d.]+)(?:,(-?[\d.]+))?\s+/)) || (m = s.match(/^\^([\d.]+),([\d.]+)\s+/))) {
        if (m[0][0] === '#') tier = +m[1]; else if (m[0][0] === '%') { gx = +m[1]; gy = m[2] ? +m[2] : 0; } else if (m[0][0] === '^') { bw = +m[1]; bh = +m[2]; } else anchor = m[1];
        s = s.slice(m[0].length);
      }
      var depth = Math.floor(ind / 2), tokens = tokenize(s);
      var real = tokens.filter(function (t) { return t.text.trim() && !/^[,.;:]+$/.test(t.text.trim()); });
      lines.push({
        depth: depth, tier: tier || depth + 1, tierSet: tier, anchor: anchor, gx: gx, gy: gy, bw: bw, bh: bh, tokens: tokens, gap: gap,
        clause: tokens[0] && tokens[0].type === 'c',
        coord: real.length > 0 && real.every(function (t) { return t.type === 'k'; })
      });
      gap = false;
    });
    lines.forEach(function (L, i) {
      L.parent = null;
      for (var j = i - 1; j >= 0; j--) if (lines[j].depth < L.depth) { L.parent = lines[j]; break; }
      if (L.parent && !L.coord) L.parent.kids = true;
    });
    return lines;
  }
  SB.parseSentence = parse;
  // 줄 → 입력 기호 (편집기가 고친 것을 다시 글로)
  var WRAP = { v: ['{', '}'], n: ['<', '>'], c: ['[', ']'], m: ['(', ')'], p: ['*', '*'], a: ['~', '~'], y: ['|', '|'] };
  function serialize(lines) {
    return lines.map(function (L) {
      var h = (L.gap ? '\n' : '') + new Array(L.depth + 1).join('  ') + (L.tierSet ? '#' + L.tierSet + ' ' : '') + (L.anchor ? '@' + L.anchor + ' ' : '') + (L.gx != null ? '%' + L.gx + (L.gy ? ',' + L.gy : '') + ' ' : '') + (L.bw ? '^' + L.bw + ',' + L.bh + ' ' : '');
      return h + L.tokens.map(function (t) {
        if (t.type === 'm' && t.force) return '!' + t.force + '(' + t.text + ')';
        if (WRAP[t.type]) return WRAP[t.type][0] + t.text + WRAP[t.type][1];
        if (t.type === 'k') return '+' + t.text;
        if (t.type === 'r') return '/';
        return t.text;
      }).join('');
    }).join('\n');
  }
  var GRID = 12;   // 편집기 격자 한 칸(px)
  SB.layoutDiagram = function (d, l) { layout(d, l); };

  /* ── 그리기 ── */
  function words(text, cls) {
    // 글자 덩어리를 단어 단위 span 으로 (매달 자리를 단어 위치로 재기 위해)
    return text.split(/(\s+)/).map(function (w) {
      if (!w) return '';
      if (/^\s+$/.test(w)) return ' ';
      return '<span class="' + (cls || '') + '" data-w="' + esc(w) + '">' + esc(w) + '</span>';
    }).join('');
  }
  // 전치사구 괄호 색 = 붙는 자리: 명사 뒤 빨강 · 형용사 뒤 노랑 · 동사 뒤 파랑 · 문장 앞 초록
  var ATT = { n: 'n', v: 'v', a: 'v', p: 'j' };
  function attachOf(L, idx) {
    for (var j = idx - 1; j >= 0; j--) { var t = L.tokens[j].type; if (ATT[t]) return ATT[t]; if (t === 'm') return L.tokens[j].att; }
    if (!L.parent) return 's';
    var a = L.anchorType || 'n';
    return a;
  }
  function lineHTML(L) {
    var h = '<i class="tier">' + TIER[Math.min(L.tier, 6)] + '</i>';
    L.tokens.forEach(function (t, idx) {
      var w = ' data-w="' + esc(t.text) + '">' + esc(t.text) + '</span>';
      switch (t.type) {
        case 'v': h += '<span class="w-v"' + w; break;
        case 'n': h += '<span class="w-n"' + w; break;
        case 'c': h += '<span class="w-c"' + w; break;
        case 'p': h += '<span class="w-p"' + w; break;
        case 'a': h += '<span class="w-a"' + w; break;
        case 'k': h += '<span class="w-k"' + w; break;
        case 'y': h += '<span class="w-y">' + words(t.text) + '</span>'; break;
        case 'm': t.att = t.force || attachOf(L, idx);
          h += '<span class="pp pp-' + t.att + '" data-ti="' + idx + '" data-w="(' + esc(t.text) + ')"><b>(</b>' + words(t.text) + '<b>)</b></span>'; break;
        case 'r': h += '<span class="w-r">/</span>'; break;
        default: h += words(t.text);
      }
    });
    return h;
  }
  function plain(L) {
    return L.tokens.map(function (t) { return t.type === 'r' ? '' : t.text; }).join('').replace(/\s+/g, ' ').trim();
  }

  function anchorType(P, word) {
    var toks = P.tokens.filter(function (t) { return t.type !== 'r' && t.text.trim(); });
    var hit = null;
    if (word) hit = toks.filter(function (t) { return t.text.toLowerCase().indexOf(word.toLowerCase()) >= 0; })[0];
    if (!hit) { var last = toks[toks.length - 1]; hit = last; if (last && last.type === 't') { var ws = last.text.trim().split(/\s+/); if (ws.length) return 'n'; } }
    return hit ? ({ n: 'n', v: 'v', a: 'v', p: 'j', m: hit.att || 'n' })[hit.type] || 'n' : 'n';
  }
  function build(diag, lines, lang) {
    lines.forEach(function (L) { if (L.parent) L.anchorType = anchorType(L.parent, L.anchor); });
    diag.innerHTML = lines.map(function (L, i) {
      var cls = 'dl' + (L.clause ? ' clause' : '') + (L.gap ? ' gap' : '') + (L.parent && !L.coord ? ' kid' : '') + (L.kids ? ' has-kids' : '');
      return '<span class="' + cls + '" data-i="' + i + '" data-tier="' + L.tier + '"' + (lang === 'en' ? ' data-speak' : '') + '>' + lineHTML(L) + '</span>';
    }).join('');
    $$('.dl', diag).forEach(function (el, i) { lines[i].el = el; });
  }

  function anchorEl(P, word) {
    var cands = $$('[data-w]', P.el);
    if (word) {
      var w = word.toLowerCase();
      for (var i = 0; i < cands.length; i++) if (cands[i].getAttribute('data-w').toLowerCase().indexOf(w) >= 0) return cands[i];
    }
    for (var j = cands.length - 1; j >= 0; j--) if (/[\w가-힣]/.test(cands[j].getAttribute('data-w'))) return cands[j];
    return P.el;
  }

  // 자식 줄을 부모 줄의 매달 단어 아래에 놓는다. 폭이 모자라면 왼쪽으로 당기고, 그래도 넘치면 줄바꿈.
  function layout(diag, lines) {
    if (!diag.offsetWidth) return;
    var W = diag.clientWidth, narrow = W < 560, step = narrow ? 12 : 22;
    var base = diag.getBoundingClientRect().left;
    lines.forEach(function (L) { L.el.style.marginLeft = '0px'; L.el.style.maxWidth = ''; });
    lines.forEach(function (L) {
      var el = L.el; L.x = 0;
      el.style.top = L.gy ? L.gy * GRID + 'px' : '';
      if (L.gx != null) {
        L.x = Math.max(0, Math.min(L.gx * GRID, Math.max(0, W - 120)));
        el.style.marginLeft = L.x + 'px'; el.style.maxWidth = (W - L.x) + 'px';
        return;
      }
      if (!L.parent) return;
      var P = L.parent, a = L.anchorNode || anchorEl(P, L.anchor);
      // 줄의 내용(단계 표시 뒤 첫 글자)이 설명하는 낱말 바로 아래에서 시작하게, 연결선도 그 자리에서 내려온다
      var fc = null; for (var c = el.firstElementChild; c; c = c.nextElementSibling) if (!c.classList.contains('tier') && !c.classList.contains('dl-box')) { fc = c; break; }
      var off = fc ? fc.offsetLeft : 6;
      el.style.setProperty('--cx', off + 'px');
      var ar = a.getBoundingClientRect();
      var x = (a === P.el ? ar.left : ar.left + ar.width / 2) - base - off + 4;   // 연결선이 설명하는 낱말 가운데에서 내려온다
      if (L.anchorEnd) {   // 문장 전체를 꾸미는 것(초록): 1차 문장이 끝난 뒤에서 시작 — 1차 낱말과 겹치지 않게, 선도 줄(박스) 왼쪽 끝에서
        x = P.el.getBoundingClientRect().right - base + 6;
        el.style.setProperty('--cx', '4px');
      }
      if (L.coord) x -= narrow ? 20 : 36;
      var w = el.offsetWidth;
      var min = P.x + step;
      if (narrow) x = Math.min(x, P.x + step * 2);   // 폰: 계단을 좁게
      x = Math.max(x, min);
      if (x + w > W) x = Math.max(min, W - w);
      x = Math.min(x, Math.max(0, W - 120));
      L.x = x;
      el.style.marginLeft = x + 'px';
      el.style.maxWidth = (W - x) + 'px';
    });
    lines.forEach(function (L) {
      if (!L.parent || L.coord) return;
      var up = L.el.getBoundingClientRect().bottom - L.parent.el.getBoundingClientRect().bottom;
      L.el.style.setProperty('--up', Math.max(8, up) + 'px');
      L.el.style.setProperty('--upb', Math.max(6, up - L.el.offsetHeight + 4) + 'px');   // 박스 줄: 박스 윗변까지만
    });
    // 윗줄 밑줄은 매달린 줄이 설명하는 낱말까지만 (형용사절이면 friend 까지). 문장 전체를 꾸미는 것이 있으면 끝까지
    lines.forEach(function (P) { P._need = 0; });
    lines.forEach(function (L) {
      var P = L.parent; if (!P || L.coord) return;
      var pr = P.el.getBoundingClientRect(), need = pr.width;
      if (!L.anchorEnd) { var a = L.anchorNode || anchorEl(P, L.anchor); if (a !== P.el) need = a.getBoundingClientRect().right - pr.left + 2; }
      P._need = Math.max(P._need, need);
    });
    lines.forEach(function (P) {
      if (!P._need) { P.el.style.removeProperty('--ur'); return; }
      P.el.style.setProperty('--ur', Math.max(0, P.el.getBoundingClientRect().width - P._need) + 'px');
    });
    // 절 박스는 그 절에 매달린 줄(예: as soon as she came 아래 into the room)까지 한 박스로 감싼다
    function under(K, L) { for (var P = K.parent; P; P = P.parent) if (P === L) return true; return false; }
    lines.forEach(function (L) {
      var el = L.el, old = el.querySelector('.dl-box'); if (old) old.remove();
      var c = el.classList.contains('clause') ? 'clause' : el.classList.contains('bx-j') ? 'j' : el.classList.contains('bx-v') ? 'v' : el.classList.contains('bx-s') ? 's' : '';
      if (!c) return;
      el.classList.add('boxed');
      var r0 = el.getBoundingClientRect(), R = { l: r0.left, t: r0.top, r: r0.right, b: r0.bottom };
      lines.forEach(function (K) {
        if (K === L || !under(K, L)) return;
        var r = K.el.getBoundingClientRect();
        R.l = Math.min(R.l, r.left); R.t = Math.min(R.t, r.top); R.r = Math.max(R.r, r.right); R.b = Math.max(R.b, r.bottom);
      });
      var pad = 3, w = R.r - R.l + pad * 2, h = R.b - R.t + pad * 2;
      if (L.bw) { w = L.bw * GRID; h = L.bh * GRID; }
      var bx = document.createElement('i');
      bx.className = 'dl-box c-' + c; bx.setAttribute('aria-hidden', 'true');
      bx.style.left = (R.l - r0.left - pad) + 'px'; bx.style.top = (R.t - r0.top - pad) + 'px';
      bx.style.width = w + 'px'; bx.style.height = h + 'px';
      bx.innerHTML = '<b class="bx-h" title="끌어서 크기 바꾸기"></b>';
      el.appendChild(bx);
    });
  }

  /* ── 소리 (브라우저 음성, 나중에 녹음 파일로 바꿀 수 있게) ── */
  var synth = window.speechSynthesis;
  function speak(text, el) {
    if (!synth) return;
    synth.cancel();
    $$('.dl.speaking').forEach(function (x) { x.classList.remove('speaking'); });
    var u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US'; u.rate = .88;
    var v = synth.getVoices().filter(function (v) { return /^en(-|_)US/i.test(v.lang); })[0];
    if (v) u.voice = v;
    if (el) { el.classList.add('speaking'); u.onend = u.onerror = function () { el.classList.remove('speaking'); }; }
    synth.speak(u);
  }

  var IC = {
    sound: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5L6 9H3v6h3l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg>',
    restart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>',
    auto: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.6-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/></svg>',
    pause: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>'
  };

  SB.trainer = function (root, set, opt) {
    opt = opt || {};
    var st = { lang: 'en', tier: 0, mode: opt.mode || 'step', pos: 0, timer: null };
    root.classList.add('trainer');
    root.innerHTML =
      '<div class="tr-bar">' +
        '<span class="tr-label">보기</span><div class="seg seg-light" data-k="mode">' + [['step', '한 줄씩'], ['all', '한눈에'], ['build', '조립']].map(function (m) { return '<button data-v="' + m[0] + '"' + (st.mode === m[0] ? ' class="on"' : '') + '>' + m[1] + '</button>'; }).join('') + '</div>' +
        '<span class="tr-label">정보 단계</span><div class="seg seg-light" data-k="tier"><button data-v="0" class="on">전체</button><button data-v="1">1차</button><button data-v="2">~2차</button><button data-v="3">~3차</button></div>' +
        '<span class="grow"></span>' +
        '<div class="seg seg-light" data-k="lang"><button data-v="en" class="on">영어</button><button data-v="ko">직독직해</button><button data-v="both">영·한</button></div>' +
      '</div>' +
      '<div class="tr-source"><small>' + esc(set.title) + '</small><p>' + esc(set.src) +
        ' <button class="icon-btn sm tts" type="button" aria-label="문장 전체 듣기" title="문장 전체 듣기">' + IC.sound + '</button></p></div>' +
      '<div class="legend" aria-label="기호 설명">' +
        '<span><b class="w-v">동사</b></span><span><b class="w-n">명사</b></span><span><b class="w-p">형용사</b></span>' +
        '<span class="lg-sep">전치사구</span><span class="pp pp-n"><b>(</b>명사 뒤<b>)</b></span><span class="pp pp-j"><b>(</b>형용사 뒤<b>)</b></span><span class="pp pp-v"><b>(</b>동사 뒤<b>)</b></span><span class="pp pp-s"><b>(</b>문장 앞<b>)</b></span>' +
        '<span class="lg-sep">절</span><span><b class="w-r">/</b>명사 뒤</span><span class="w-y">형용사 뒤</span><span class="lg-box lg-red">동사 앞·뒤</span><span class="lg-box">문장 앞·뒤</span><span><b class="w-k">and</b> 등위</span>' +
      '</div>' +
      '<div class="tr-stage" tabindex="0" aria-live="polite"><div class="tr-diagram" data-lang="en"></div><div class="tr-diagram" data-lang="ko" hidden></div></div>' +
      '<div class="build-pool" hidden></div>' +
      '<div class="tr-foot"><span class="tr-count"></span><div class="btns">' +
        '<button class="icon-btn" type="button" data-act="restart" aria-label="처음부터" title="처음부터">' + IC.restart + '</button>' +
        '<button class="icon-btn" type="button" data-act="auto" aria-label="자동으로 넘기기" title="자동으로 넘기기">' + IC.auto + '</button>' +
        '<button class="btn btn-red btn-sm" type="button" data-act="next">다음 ' + SB.IC.next + '</button>' +
      '</div></div>';

    var dEn = $('.tr-diagram[data-lang="en"]', root), dKo = $('.tr-diagram[data-lang="ko"]', root);
    var fix = savedFix(set);
    var en = parse(fix ? fix[0] : set.en), ko = parse(fix ? fix[1] : set.ko);
    build(dEn, en, 'en'); build(dKo, ko, 'ko');
    var stage = $('.tr-stage', root), pool = $('.build-pool', root), count = $('.tr-count', root);
    var nextBtn = $('[data-act="next"]', root), autoBtn = $('[data-act="auto"]', root);

    function seq() {
      if (st.lang === 'en') return en;
      if (st.lang === 'ko') return ko;
      return en.concat(ko);
    }
    function relayout() {
      dEn.hidden = st.lang === 'ko'; dKo.hidden = st.lang === 'en';
      dKo.classList.toggle('gap', st.lang === 'both');
      layout(dEn, en); layout(dKo, ko);
    }
    function paintTier() {
      root.classList.toggle('show-tier', st.tier > 0);
      en.concat(ko).forEach(function (L) { L.el.classList.toggle('dim', st.tier > 0 && L.tier > st.tier); });
    }
    function stopAuto() {
      if (st.timer) { clearInterval(st.timer); st.timer = null; }
      autoBtn.classList.remove('on'); autoBtn.innerHTML = IC.auto; autoBtn.setAttribute('aria-label', '자동으로 넘기기');
    }
    function paintCount() {
      var list = seq();
      nextBtn.style.visibility = st.mode === 'step' ? '' : 'hidden';
      if (st.mode === 'all') { count.textContent = list.length + '줄 · 줄을 누르면 소리가 나옵니다'; return; }
      count.textContent = st.pos + ' / ' + list.length + (st.mode === 'build' ? ' 조립' : '');
      nextBtn.disabled = st.pos >= list.length;
      nextBtn.style.visibility = st.mode === 'step' ? '' : 'hidden';
    }
    function reset() {
      stopAuto();
      var list = seq();
      en.concat(ko).forEach(function (L) { L.el.classList.remove('reveal', 'pending'); });
      st.pos = 0;
      if (st.mode !== 'all') list.forEach(function (L) { L.el.classList.add('pending'); });
      pool.hidden = st.mode !== 'build';
      $('.tr-foot [data-act="auto"]', root).style.display = st.mode === 'step' ? '' : 'none';
      if (st.mode === 'build') makePool();
      paintCount();
    }
    function reveal(L) {
      L.el.classList.remove('pending');
      if (!reduce) { L.el.classList.remove('reveal'); void L.el.offsetWidth; L.el.classList.add('reveal'); }
    }
    function next() {
      var list = seq(); if (st.pos >= list.length) { stopAuto(); return; }
      reveal(list[st.pos]); st.pos++; paintCount();
      if (st.pos >= list.length) stopAuto();
    }
    function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
    function makePool() {
      var list = seq();
      var pieces = shuffle(list.map(function (L, i) { return { i: i, t: plain(L) }; }));
      pool.innerHTML = '<p>정보의 계단을 위에서부터 쌓아 보세요. 다음에 올 덩어리를 누르세요.</p>' +
        pieces.map(function (p) { return '<button class="piece" type="button" data-i="' + p.i + '">' + esc(p.t) + '</button>'; }).join('');
      $$('.piece', pool).forEach(function (b) {
        b.addEventListener('click', function () {
          var list = seq(), want = list[st.pos], got = list[+b.dataset.i];
          if (got === want || plain(got) === plain(want)) {
            b.classList.add('used'); reveal(want); st.pos++; paintCount();
            if (st.pos >= list.length) { pool.insertAdjacentHTML('beforeend', '<p class="build-done">완성! 정보의 계단을 모두 쌓았습니다.</p>'); }
          } else {
            b.classList.remove('wrong'); void b.offsetWidth; b.classList.add('wrong');
          }
        });
      });
    }

    $$('.seg', root).forEach(function (s) {
      SB.seg(s, function (v) {
        var k = s.dataset.k;
        if (k === 'tier') { st.tier = +v; paintTier(); return; }
        st[k] = v;
        if (k === 'lang') relayout();
        reset();
      });
    });
    nextBtn.addEventListener('click', next);
    $('[data-act="restart"]', root).addEventListener('click', reset);
    autoBtn.addEventListener('click', function () {
      if (st.timer) { stopAuto(); return; }
      if (st.pos >= seq().length) reset();
      autoBtn.classList.add('on'); autoBtn.innerHTML = IC.pause; autoBtn.setAttribute('aria-label', '멈추기');
      next(); st.timer = setInterval(next, 1500);
    });
    stage.addEventListener('click', function (e) {
      var line = e.target.closest('.dl');
      if (st.mode === 'step' && (!line || line.classList.contains('pending'))) { next(); return; }
      if (line && line.hasAttribute('data-speak') && !line.classList.contains('pending')) speak(plain(en[+line.dataset.i]), line);
    });
    stage.addEventListener('keydown', function (e) {
      if (st.mode === 'step' && (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight')) { e.preventDefault(); next(); }
    });
    $('.tts', root).addEventListener('click', function () { speak(set.src); });

    var rt; window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(relayout, 80); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(relayout);
    relayout(); paintTier(); reset();

    /* ── 고치기(관리자): 줄을 끌어 자리 · 순서를 바꾸고, 괄호를 눌러 색을 바꾼다. 격자 · 윗줄 낱말 시작에 착 붙는다 ── */
    var ed = null;
    canEdit().then(function (ok) {
      if (!ok) return;
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'btn btn-line btn-sm tr-edit-btn'; b.textContent = '고치기';
      $('.tr-bar', root).appendChild(b);
      b.addEventListener('click', function () { if (!ed) startEdit(); });
    });
    function rebuild() {
      en = parse(serialize(en)); ko = parse(serialize(ko));
      build(dEn, en, 'en'); build(dKo, ko, 'ko');
      relayout(); paintTier();
      en.concat(ko).forEach(function (L) { L.el.classList.remove('pending'); });
    }
    function startEdit() {
      stopAuto();
      if (st.lang === 'both') $('.seg[data-k="lang"] button[data-v="en"]', root).click();
      $('.seg[data-k="mode"] button[data-v="all"]', root).click();
      var back = [serialize(en), serialize(ko)];
      ed = { dirty: false };
      root.classList.add('tr-editing');
      var bar = document.createElement('div');
      bar.className = 'tr-edbar';
      bar.innerHTML = '<p><b>고치기</b> 줄을 끌어 원하는 곳에 놓으세요 — 끈 줄만 움직이고, 격자와 다른 줄 낱말 시작에 착 붙어요. 괄호를 누르면 색을 고를 수 있어요. 박스는 오른쪽 아래 모서리를 끌어 키워요. 줄을 누른 뒤 ◀ ▶ 로 단계를 바꿔요. (영어 · 직독직해 따로 고쳐요)</p>' +
        '<div class="btns"><button type="button" class="btn btn-line btn-sm" data-ed="depth-">◀ 단계</button><button type="button" class="btn btn-line btn-sm" data-ed="depth+">단계 ▶</button>' +
        '<button type="button" class="btn btn-line btn-sm" data-ed="auto">자리 · 박스 자동</button><span class="grow"></span>' +
        '<button type="button" class="btn btn-line btn-sm" data-ed="reset">처음 것으로</button><button type="button" class="btn btn-line btn-sm" data-ed="cancel">취소</button><button type="button" class="btn btn-red btn-sm" data-ed="save">저장</button></div>';
      root.insertBefore(bar, stage);
      var pick = document.createElement('div'); pick.className = 'tr-pick'; pick.hidden = true;
      pick.innerHTML = [['n', '명사 뒤'], ['j', '형용사 뒤'], ['v', '동사 뒤'], ['s', '문장 앞'], ['', '자동']].map(function (o) {
        return '<button type="button" data-att="' + o[0] + '">' + (o[0] ? '<span class="pp pp-' + o[0] + '"><b>(</b><b>)</b></span> ' : '') + o[1] + '</button>';
      }).join('');
      stage.appendChild(pick);
      var sel = -1, pickAt = null;
      function cur() { return st.lang === 'ko' ? ko : en; }
      function curD() { return st.lang === 'ko' ? dKo : dEn; }
      function mark() { ed.dirty = true; }
      function paintSel() { $$('.dl', curD()).forEach(function (el, i) { el.classList.toggle('ed-sel', i === sel); }); }
      // 단계(들여쓰기): 영어 · 직독직해 두 줄을 함께, 아래에 매달린 줄도 함께
      function depth(i, d) {
        [en, ko].forEach(function (ls) {
          var L = ls[i]; if (!L || i === 0) return;
          var to = Math.max(0, Math.min(L.depth + d, ls[i - 1].depth + 1)), k = to - L.depth; if (!k) return;
          var old = L.depth;
          for (var j = i + 1; j < ls.length && ls[j].depth > old; j++) ls[j].depth = Math.max(0, ls[j].depth + k);
          L.depth = to; if (L.tierSet) L.tierSet = Math.max(1, L.tierSet + k);
        });
      }
      bar.addEventListener('click', function (e) {
        var a = e.target.closest('[data-ed]'); if (!a) return;
        a = a.dataset.ed;
        if (a === 'depth-' || a === 'depth+' || a === 'auto') {
          if (sel < 0) { alertLike('먼저 고칠 줄을 누르세요.'); return; }
          if (a === 'auto') { cur()[sel].gx = null; cur()[sel].bw = cur()[sel].bh = 0; } else depth(sel, a === 'depth+' ? 1 : -1);
          mark(); rebuild(); paintSel(); return;
        }
        if (a === 'reset') { en = parse(set.en); ko = parse(set.ko); sel = -1; mark(); rebuild(); return; }
        if (a === 'cancel') { en = parse(back[0]); ko = parse(back[1]); stop(); return; }
        if (a === 'save') save();
      });
      function stop() {
        root.classList.remove('tr-editing'); bar.remove(); pick.remove(); ed = null;
        stage.removeEventListener('pointerdown', down, true);
        rebuild(); reset();
      }
      function save() {
        var a = serialize(en), b = serialize(ko);
        var same = a === serialize(parse(set.en)) && b === serialize(parse(set.ko));
        putFix(set, same ? null : [a, b]).then(function (where) {
          alertLike(where === 'server' ? '저장했어요. 모든 방문자에게 이렇게 보여요.' : '이 브라우저에만 저장했어요. (관리자로 로그인하면 모두에게 저장돼요)');
          stop();
        });
      }
      // 괄호 색 고르기
      pick.addEventListener('click', function (e) {
        var o = e.target.closest('[data-att]'); if (!o || !pickAt) return;
        var t = cur()[pickAt.i].tokens[pickAt.ti]; t.force = o.dataset.att || null;
        pick.hidden = true; mark(); rebuild(); paintSel();
      });
      // 끌기
      function down(e) {
        if (e.button) return;
        if (e.target.closest('.tr-pick')) return;
        var line = e.target.closest('.dl'); if (!line || !curD().contains(line)) { pick.hidden = true; return; }
        e.stopPropagation();
        var hd = e.target.closest('.bx-h');
        if (hd) {   // 박스 모서리: 끌어서 크기 (격자 칸에 맞춤)
          var bxe = hd.parentNode, BL = cur()[+line.dataset.i], w0 = bxe.offsetWidth, h0 = bxe.offsetHeight, ax = e.clientX, ay = e.clientY;
          var rmv = function (ev) {
            bxe.style.width = Math.max(GRID * 3, Math.round((w0 + ev.clientX - ax) / GRID) * GRID) + 'px';
            bxe.style.height = Math.max(GRID * 2, Math.round((h0 + ev.clientY - ay) / GRID) * GRID) + 'px';
            ev.preventDefault();
          };
          var rup = function () {
            document.removeEventListener('pointermove', rmv); document.removeEventListener('pointerup', rup); document.removeEventListener('pointercancel', rup);
            BL.bw = Math.round(bxe.offsetWidth / GRID); BL.bh = Math.round(bxe.offsetHeight / GRID);
            sel = +line.dataset.i; mark(); rebuild(); paintSel();
          };
          document.addEventListener('pointermove', rmv); document.addEventListener('pointerup', rup); document.addEventListener('pointercancel', rup);
          e.preventDefault(); return;
        }
        var i = +line.dataset.i, ppEl = e.target.closest('.pp[data-ti]');
        var L = cur()[i], sx = e.clientX, sy = e.clientY, moved = false;
        var dr = curD().getBoundingClientRect(), x0 = L.x || 0, W = curD().clientWidth;
        // 붙을 자리: 다른 줄 낱말 시작 (없으면 격자)
        var snaps = [];
        $$('.dl', curD()).forEach(function (el, j) { if (j !== i) $$('[data-w]', el).forEach(function (w) { snaps.push(w.getBoundingClientRect().left - dr.left - 6); }); });
        var guide = document.createElement('i'); guide.className = 'tr-guide'; guide.hidden = true; curD().appendChild(guide);
        var nx = x0, ny = (L.gy || 0) * GRID, y0 = ny;
        function mv(ev) {
          var dx = ev.clientX - sx, dy = ev.clientY - sy;
          if (!moved && Math.abs(dx) + Math.abs(dy) < 5) return;
          if (!moved) {
            moved = true; line.classList.add('ed-drag'); pick.hidden = true;
            cur().forEach(function (K) { if (K.gx == null) K.gx = Math.round((K.x || 0) / GRID * 100) / 100; });   // 다른 줄은 제자리에 고정
          }
          var want = Math.max(0, Math.min(x0 + dx, W - 60)), hit = null;
          snaps.forEach(function (p) { if (Math.abs(p - want) < 8 && (hit === null || Math.abs(p - want) < Math.abs(hit - want))) hit = p; });
          nx = hit !== null ? Math.max(0, hit) : Math.round(want / GRID) * GRID;
          guide.hidden = hit === null; guide.style.left = (nx + 6) + 'px';
          ny = Math.round((y0 + dy) / (GRID / 2)) * (GRID / 2);
          line.style.marginLeft = nx + 'px';
          line.style.top = ny + 'px';
          ev.preventDefault();
        }
        function up() {
          document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up); document.removeEventListener('pointercancel', up);
          guide.remove();
          if (!moved) {
            sel = i; paintSel();
            if (ppEl) {
              pickAt = { i: i, ti: +ppEl.dataset.ti };
              var r = ppEl.getBoundingClientRect(), sr = stage.getBoundingClientRect();
              pick.style.left = Math.max(0, Math.min(r.left - sr.left, sr.width - 240)) + 'px'; pick.style.top = (r.bottom - sr.top + 6) + 'px'; pick.hidden = false;
            } else pick.hidden = true;
            return;
          }
          L.gx = Math.round(nx / GRID * 100) / 100; L.gy = Math.round(ny / GRID * 100) / 100;
          sel = i; mark(); rebuild(); paintSel();
        }
        document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up); document.addEventListener('pointercancel', up);
        e.preventDefault();
      }
      stage.addEventListener('pointerdown', down, true);
    }
    return { destroy: function () { stopAuto(); if (synth) synth.cancel(); } };
  };

  /* ── 고친 조립도 저장: 관리자 → xms(page_texts, 사이트 전체 '*'), 그 밖에는 이 브라우저 ── */
  function fixKey(set) { return 'sbset.' + (SB.sets.indexOf(set) + 1); }
  function savedFix(set) {
    var T = window.__XE_T, k = fixKey(set), v = T && T.all && T.all[k];
    if (v && v.length === 2) return v;
    try { var l = JSON.parse(localStorage.getItem('sb_set_fix') || '{}')[k]; if (l) return l; } catch (e) {}
    return null;
  }
  var adminP = null;
  function canEdit() {
    if (!adminP) adminP = fetch('/xms-api/me', { credentials: 'same-origin', cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : {}; })
      .then(function (me) { return !!me.admin; }, function () { return false; })
      .then(function (ok) { return ok || /^(localhost|127\.0\.0\.1)$/.test(location.hostname); });
    return adminP;
  }
  function putFix(set, val) {
    var k = fixKey(set);
    try { var all = JSON.parse(localStorage.getItem('sb_set_fix') || '{}'); if (val) all[k] = val; else delete all[k]; localStorage.setItem('sb_set_fix', JSON.stringify(all)); } catch (e) {}
    return fetch('/xms-api/admin/page-texts', {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: location.pathname, items: [{ k: k, g: '*', t: val }] })
    }).then(function (r) {
      if (!r.ok) return 'local';
      try { localStorage.removeItem('sb_set_fix'); } catch (e) {}
      if (window.__XE_T) { var A = window.__XE_T.all = window.__XE_T.all || {}; if (val) A[k] = val; else delete A[k]; }
      return 'server';
    }, function () { return 'local'; });
  }
  function alertLike(msg) {
    var t = document.createElement('div'); t.className = 'tr-toast'; t.setAttribute('role', 'status'); t.textContent = msg;
    document.body.appendChild(t); setTimeout(function () { t.remove(); }, 2800);
  }

  /* ── 페이지 연결 ── */
  function init() {
    var demo = $('#homeTrainer');
    if (demo) {
      SB.trainer(demo, SB.sets[0], { mode: 'all' });
      // 위의 단계 카드를 누르면 그 단계까지만 또렷하게 (한 번 더 누르면 전체)
      var cards = $$('.layer-step[data-tier]');
      cards.forEach(function (c) {
        c.setAttribute('aria-pressed', 'false');
        c.addEventListener('click', function () {
          var off = c.classList.contains('on');
          cards.forEach(function (x) { x.classList.toggle('on', !off && x === c); x.setAttribute('aria-pressed', !off && x === c ? 'true' : 'false'); });
          var b = $('.seg[data-k="tier"] button[data-v="' + (off ? 0 : c.dataset.tier) + '"]', demo);
          if (b) b.click();
        });
      });
    }
    var box = $('#trainer'); if (!box) return;
    var sets = $('#trainSets'), cur = null;
    var q = new URLSearchParams(location.search), id = q.get('t') || SB.sets[0].id, mode = q.get('mode');
    sets.innerHTML = SB.sets.map(function (s) { return '<button type="button" data-v="' + s.id + '"' + (s.id === id ? ' class="on"' : '') + '>' + esc(s.title) + '</button>'; }).join('');
    function open(v) {
      var s = SB.sets.filter(function (x) { return x.id === v; })[0] || SB.sets[0];
      if (cur) cur.destroy();
      var fresh = document.createElement('div'); fresh.id = 'trainer';
      box.parentNode.replaceChild(fresh, box); box = fresh;
      cur = SB.trainer(box, s, { mode: mode }); mode = null;
      var u = new URLSearchParams(location.search); u.set('t', s.id); u.delete('mode'); history.replaceState(null, '', '?' + u.toString());
    }
    SB.seg(sets, open);
    open(id);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
