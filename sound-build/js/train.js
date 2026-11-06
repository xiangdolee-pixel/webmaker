/* 문장 훈련 — 정보의 계층화 [1차 - 2차 - 3차 정보]
   SB.trainer(el, set) : el 안에 훈련 화면을 그린다. 입력 기호는 data.js 위쪽 설명 참고. */
(function () {
  'use strict';
  var SB = window.SB, $ = SB.$, $$ = SB.$$, esc = SB.esc;
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var TIER = ['', '1차', '2차', '3차', '4차', '5차', '6차'];

  /* ── 해석: 줄 → { depth, tier, anchor, tokens, gap } ── */
  var TOK = /\{([^}]*)\}|<([^>]*)>|\[([^\]]*)\]|\(([^)]*)\)|\*([^*]*)\*|~([^~]*)~|\+(\S+)|(\/)|\|([^|]*)\||([^{<\[(*~+\/|]+)/g;
  var TYPES = ['v', 'n', 'c', 'm', 'p', 'a', 'k', 'r', 'y', 't'];
  function tokenize(s) {
    var out = [], m; TOK.lastIndex = 0;
    while ((m = TOK.exec(s))) {
      for (var i = 1; i <= 10; i++) if (m[i] !== undefined) { out.push({ type: TYPES[i - 1], text: m[i] }); break; }
    }
    return out;
  }
  function parse(text) {
    var lines = [], gap = false;
    String(text || '').split('\n').forEach(function (raw) {
      if (!raw.trim()) { gap = lines.length > 0; return; }
      var ind = raw.match(/^\s*/)[0].replace(/\t/g, '  ').length, s = raw.trim(), tier = 0, anchor = '', m;
      while ((m = s.match(/^#(\d)\s+/)) || (m = s.match(/^@(\S+)\s+/))) {
        if (m[0][0] === '#') tier = +m[1]; else anchor = m[1];
        s = s.slice(m[0].length);
      }
      var depth = Math.floor(ind / 2), tokens = tokenize(s);
      var real = tokens.filter(function (t) { return t.text.trim() && !/^[,.;:]+$/.test(t.text.trim()); });
      lines.push({
        depth: depth, tier: tier || depth + 1, anchor: anchor, tokens: tokens, gap: gap,
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
        case 'm': t.att = attachOf(L, idx);
          h += '<span class="pp pp-' + t.att + '" data-w="(' + esc(t.text) + ')"><b>(</b>' + words(t.text) + '<b>)</b></span>'; break;
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
      if (!L.parent) return;
      var P = L.parent, a = anchorEl(P, L.anchor);
      var x = a.getBoundingClientRect().left - base - 2;
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
    var en = parse(set.en), ko = parse(set.ko);
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
    return { destroy: function () { stopAuto(); if (synth) synth.cancel(); } };
  };

  /* ── 페이지 연결 ── */
  function init() {
    var demo = $('#homeTrainer');
    if (demo) SB.trainer(demo, SB.sets[0], { mode: 'all' });
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
      history.replaceState(null, '', '?t=' + s.id);
    }
    SB.seg(sets, open);
    open(id);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
