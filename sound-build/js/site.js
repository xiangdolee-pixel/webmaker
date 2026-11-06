/* 영소립 Sound & Build — 사이트 공통 스크립트 (시안: 진도는 이 브라우저에만 저장, 2단계에서 xms 서버 저장으로) */
(function () {
  'use strict';
  var SB = window.SB = window.SB || {};
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  SB.$ = $; SB.$$ = $$;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  SB.esc = esc;

  var IC = {
    play: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.6-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    prev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>',
    next: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>'
  };
  SB.IC = IC;

  /* ── 헤더 ── */
  function initHeader() {
    var hdr = $('.site-header'); if (!hdr) return;
    var onScroll = function () { hdr.classList.toggle('scrolled', window.scrollY > 4); };
    onScroll(); window.addEventListener('scroll', onScroll, { passive: true });
    var tg = $('.nav-toggle');
    if (tg) tg.addEventListener('click', function () {
      var open = document.body.classList.toggle('nav-open');
      tg.setAttribute('aria-expanded', open ? 'true' : 'false');
      tg.setAttribute('aria-label', open ? '메뉴 닫기' : '메뉴 열기');
    });
    $$('.gnb a').forEach(function (a) {
      a.addEventListener('click', function () { document.body.classList.remove('nav-open'); });
      var p = a.getAttribute('href').split('?')[0].split('/').pop().replace(/\.html$/, '');
      var here = location.pathname.split('/').pop().replace(/\.html$/, '');
      if (here === 'course' || here === 'classroom') here = 'courses';
      if (p && here === p) a.setAttribute('aria-current', 'page');
    });
  }

  /* ── 알약 탭: 떠 있는 배경 하나가 미끄러진다 ── */
  SB.seg = function (el, onChange) {
    var ind = document.createElement('i'); ind.className = 'seg-ind'; ind.setAttribute('aria-hidden', 'true');
    el.insertBefore(ind, el.firstChild);
    var btns = $$('button', el);
    function place(instant) {
      var on = $('button.on', el);
      if (!on || !on.offsetWidth) { el.classList.add('no-ind'); return; }
      el.classList.remove('no-ind');
      if (instant) ind.style.transition = 'none';
      ind.style.width = on.offsetWidth + 'px';
      ind.style.transform = 'translateX(' + on.offsetLeft + 'px)';
      if (instant) { ind.offsetWidth; ind.style.transition = ''; }
    }
    btns.forEach(function (b) {
      b.setAttribute('type', 'button');
      b.addEventListener('click', function () {
        if (b.classList.contains('on')) return;
        btns.forEach(function (x) { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
        place(false);                          // 배경 먼저
        if (onChange) requestAnimationFrame(function () { onChange(b.dataset.v, b); });  // 자료는 뒤따라
      });
    });
    place(true);
    window.addEventListener('resize', function () { place(true); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { place(true); });
    el._place = place;
    return { place: place, set: function (v) { var b = $('button[data-v="' + v + '"]', el); if (b) b.click(); } };
  };

  /* ── 진도 (시안: localStorage) ── */
  var KEY = 'sb_progress_v1';
  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
  function save(d) { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) {} }
  SB.prog = {
    get: load,
    done: function (cid, lk) { var d = load(); return !!(d.done && d.done[cid] && d.done[cid][lk]); },
    set: function (cid, lk, on) {
      var d = load(); d.done = d.done || {}; d.done[cid] = d.done[cid] || {};
      if (on) d.done[cid][lk] = 1; else delete d.done[cid][lk];
      save(d);
    },
    visit: function (cid, lk) {
      var d = load(); d.last = { c: cid, l: lk, t: Date.now() };
      d.days = d.days || []; var today = new Date().toISOString().slice(0, 10);
      if (d.days.indexOf(today) < 0) d.days.push(today);
      d.days = d.days.slice(-400); save(d);
    },
    rate: function (c) {
      var n = SB.lessonCount(c); if (!n) return 0;
      var d = load(), m = (d.done && d.done[c.id]) || {}; return Math.round(Object.keys(m).length / n * 100);
    },
    streak: function () {
      var d = load(), set = {}, n = 0, day = new Date();
      (d.days || []).forEach(function (x) { set[x] = 1; });
      if (!set[day.toISOString().slice(0, 10)]) day.setDate(day.getDate() - 1);
      while (set[day.toISOString().slice(0, 10)]) { n++; day.setDate(day.getDate() - 1); }
      return n;
    }
  };

  /* ── 강의 공통 ── */
  SB.course = function (id) { return SB.courses.filter(function (c) { return c.id === id; })[0]; };
  SB.lessonCount = function (c) { return c.sections.reduce(function (n, s) { return n + s.lessons.length; }, 0); };
  SB.flat = function (c) {
    var out = [];
    c.sections.forEach(function (s, si) { s.lessons.forEach(function (l, li) { out.push({ s: si, i: li, key: si + '-' + li, l: l, sect: s }); }); });
    return out;
  };
  function sec(d) { var p = d.split(':'); return (+p[0]) * 60 + (+p[1] || 0); }
  SB.total = function (c) {
    var t = SB.flat(c).reduce(function (n, x) { return n + sec(x.l.d); }, 0);
    var h = Math.floor(t / 3600), m = Math.round(t % 3600 / 60);
    return (h ? h + '시간 ' : '') + m + '분';
  };
  SB.thumb = function (c) {
    var word = c.no.replace(/(\d+|&)/, '<span>$1</span>');
    return '<div class="thumb t-' + c.track + '"><b class="thumb-word">' + word + '</b><span class="thumb-sub">' + esc(SB.tracks[c.track]) + ' · ' + esc(c.level) + '</span></div>';
  };
  SB.card = function (c) {
    var r = SB.prog.rate(c);
    return '<a class="course-card" href="course.html?id=' + c.id + '">' + SB.thumb(c) +
      '<div class="course-body"><div class="course-tags"><span class="badge badge-dark">' + esc(SB.tracks[c.track]) + '</span><span class="badge">' + esc(c.level) + '</span></div>' +
      '<h3>' + esc(c.title) + '</h3><p>' + esc(c.desc) + '</p>' +
      (r ? '<div class="prog-row"><div class="progress"><i style="width:' + r + '%"></i></div><span>' + r + '%</span></div>' : '') +
      '<div class="course-meta"><span>' + SB.lessonCount(c) + '강</span><span>' + SB.total(c) + '</span></div></div></a>';
  };
  function curriculum(c, cur, linkAll) {
    return c.sections.map(function (s, si) {
      var open = cur ? cur.s === si : si === 0;
      var rows = s.lessons.map(function (l, li) {
        var k = si + '-' + li, done = SB.prog.done(c.id, k), now = cur && cur.key === k;
        var ic = done ? IC.check : IC.play;
        var inner = '<span class="lesson-ic">' + ic + '</span><span class="lesson-t">' + esc(l.t) +
          (l.free ? ' <span class="badge badge-y">맛보기</span>' : '') + '</span><span class="lesson-d">' + l.d + '</span>';
        var cls = 'lesson' + (done ? ' done' : '') + (now ? ' now' : '');
        return '<li><a class="' + cls + '" href="classroom.html?c=' + c.id + '&l=' + k + '"' + (now ? ' aria-current="true"' : '') + '>' + inner + '</a></li>';
      }).join('');
      return '<div class="sect' + (open ? ' open' : '') + '"><button class="sect-btn" type="button" aria-expanded="' + open + '">' + esc(s.title) +
        '<small>' + s.lessons.length + '강</small></button><div class="sect-body"><ol>' + rows + '</ol></div></div>';
    }).join('');
  }
  function bindSects(root) {
    $$('.sect-btn', root).forEach(function (b) {
      b.addEventListener('click', function () {
        var s = b.parentNode, o = s.classList.toggle('open'); b.setAttribute('aria-expanded', o);
      });
    });
  }
  function qs(k) { return new URLSearchParams(location.search).get(k); }

  /* ── 홈 ── */
  function initHome() {
    var g = $('#homeCourses'); if (g) g.innerHTML = SB.courses.slice(0, 3).map(SB.card).join('');
  }

  /* ── 강의 목록 ── */
  function initCourses() {
    var grid = $('#courseGrid'); if (!grid) return;
    var st = { track: qs('track') || 'all', level: 'all', sort: 'rec' };
    var trackSeg = $('#trackSeg');
    if (st.track !== 'all') $$('button', trackSeg).forEach(function (b) { b.classList.toggle('on', b.dataset.v === st.track); });
    function draw() {
      var list = SB.courses.filter(function (c) {
        return (st.track === 'all' || c.track === st.track) && (st.level === 'all' || c.level === st.level);
      });
      if (st.sort === 'new') list.sort(function (a, b) { return a.date < b.date ? 1 : -1; });
      if (st.sort === 'abc') list.sort(function (a, b) { return a.title.localeCompare(b.title, 'ko'); });
      $('#courseCount').innerHTML = '강의 <b>' + list.length + '</b>개';
      grid.innerHTML = list.length ? list.map(SB.card).join('') : '<div class="empty">조건에 맞는 강의가 없습니다.</div>';
    }
    SB.seg(trackSeg, function (v) { st.track = v; draw(); });
    SB.seg($('#sortSeg'), function (v) { st.sort = v; draw(); });
    $$('#levelChips .chip').forEach(function (b) {
      b.addEventListener('click', function () {
        $$('#levelChips .chip').forEach(function (x) { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); });
        st.level = b.dataset.v; draw();
      });
    });
    draw();
  }

  /* ── 강의 상세 ── */
  function initDetail() {
    var root = $('#courseDetail'); if (!root) return;
    var c = SB.course(qs('id')) || SB.courses[0];
    root.classList.add('has-bar');
    document.title = c.title + ' · 영소립 English, Sound & Build';
    var flat = SB.flat(c), r = SB.prog.rate(c);
    var last = SB.prog.get().last, startKey = (last && last.c === c.id) ? last.l : flat[0].key;
    var free = flat.filter(function (x) { return x.l.free; })[0];
    $('#dTags').innerHTML = '<span class="badge badge-dark">' + esc(SB.tracks[c.track]) + '</span><span class="badge">' + esc(c.level) + '</span>';
    $('#dTitle').textContent = c.title;
    $('#dDesc').textContent = c.desc;
    $('#dFacts').innerHTML = '<span><b>' + flat.length + '</b>강</span><span>총 <b>' + SB.total(c) + '</b></span><span>섹션 <b>' + c.sections.length + '</b>개</span>';
    $('#dWho').innerHTML = c.who.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('');
    $('#dLearn').innerHTML = c.learn.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('');
    $('#dCurriMeta').textContent = c.sections.length + '개 섹션 · ' + flat.length + '강 · ' + SB.total(c);
    $('#dCurri').innerHTML = curriculum(c, null);
    bindSects($('#dCurri'));
    $('#dSide').innerHTML = SB.thumb(c) + '<div class="side-in">' +
      (r ? '<div class="prog-row"><div class="progress"><i style="width:' + r + '%"></i></div><span>' + r + '%</span></div>' : '') +
      '<a class="btn btn-red" href="classroom.html?c=' + c.id + '&l=' + startKey + '">' + IC.play + (r ? '이어서 보기' : '강의실 입장') + '</a>' +
      (free ? '<a class="btn btn-line" href="classroom.html?c=' + c.id + '&l=' + free.key + '">맛보기 1강</a>' : '') +
      '<p class="side-note">관리자가 수강 권한을 주면 모든 강의가 열립니다.</p></div>';
  }

  /* ── 강의실 ── */
  SB.embed = function (url) {
    if (!url) return '';
    var m = url.match(/(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/))([\w-]{11})/);
    if (m) return 'https://www.youtube-nocookie.com/embed/' + m[1] + '?rel=0&playsinline=1&modestbranding=1';
    m = url.match(/vimeo\.com\/(?:video\/)?(\d+)(?:\/([\da-f]+))?(?:.*[?&]h=([\da-f]+))?/);
    if (m) return 'https://player.vimeo.com/video/' + m[1] + '?dnt=1&title=0&byline=0&portrait=0' + ((m[2] || m[3]) ? '&h=' + (m[2] || m[3]) : '');
    return '';
  };
  function initClassroom() {
    var root = $('#classroom'); if (!root) return;
    var c = SB.course(qs('c')) || SB.courses[0], flat = SB.flat(c);
    var idx = Math.max(0, flat.map(function (x) { return x.key; }).indexOf(qs('l')));
    var cur = flat[idx];
    document.title = cur.l.t + ' · ' + c.no + ' · 영소립 English, Sound & Build';
    SB.prog.visit(c.id, cur.key);
    var src = SB.embed(cur.l.v);
    $('#player').innerHTML = src
      ? '<iframe src="' + src + '" title="' + esc(cur.l.t) + '" allow="autoplay; fullscreen; picture-in-picture; encrypted-media" allowfullscreen></iframe>'
      : '<div class="player-empty"><div><b class="serif">Sound <span>&amp;</span> Build</b>영상 주소를 연결하면 여기서 재생됩니다.</div></div>';
    $('#cSect').textContent = c.no + ' · ' + cur.sect.title;
    $('#cTitle').textContent = cur.l.t;
    var prev = flat[idx - 1], next = flat[idx + 1];
    var nav = '';
    nav += prev ? '<a class="btn btn-line btn-sm" href="classroom.html?c=' + c.id + '&l=' + prev.key + '">' + IC.prev + '이전</a>' : '<span></span>';
    nav += '<button class="btn btn-sm ' + (SB.prog.done(c.id, cur.key) ? 'btn-line' : 'btn-red') + '" id="doneBtn" type="button"></button>';
    nav += next ? '<a class="btn btn-line btn-sm" href="classroom.html?c=' + c.id + '&l=' + next.key + '">다음' + IC.next + '</a>' : '<span></span>';
    $('#cNav').innerHTML = nav;
    var doneBtn = $('#doneBtn');
    function paintDone() {
      var d = SB.prog.done(c.id, cur.key);
      doneBtn.className = 'btn btn-sm ' + (d ? 'btn-line' : 'btn-red');
      doneBtn.innerHTML = d ? IC.check + '완료' : '완료로 표시';
    }
    paintDone();
    doneBtn.addEventListener('click', function () {
      SB.prog.set(c.id, cur.key, !SB.prog.done(c.id, cur.key)); paintDone(); side();
    });
    function side() {
      var r = SB.prog.rate(c);
      $('#cSide').innerHTML = '<div class="class-side-head"><a href="course.html?id=' + c.id + '"><h2>' + esc(c.title) + '</h2></a>' +
        '<div class="prog-row"><div class="progress"><i style="width:' + r + '%"></i></div><span>' + r + '%</span></div></div>' + curriculum(c, cur);
      bindSects($('#cSide'));
    }
    side();
    // 노트 (시안: 이 브라우저에만)
    var nk = 'sb_note_' + c.id + '_' + cur.key, na = $('#noteArea');
    try { na.value = localStorage.getItem(nk) || ''; } catch (e) {}
    na.addEventListener('input', function () { try { localStorage.setItem(nk, na.value); } catch (e) {} });
    // 탭: 폰에서는 커리큘럼도 탭 하나로
    var side$ = $('#cSide');
    function show(v) {
      $$('.tab-panel', root).forEach(function (p) { p.hidden = p.dataset.panel !== v; });
      side$.classList.toggle('m-hide', v !== 'curri');
    }
    var mobile = matchMedia('(max-width: 860px)');
    var tabs = $('#classTabs');
    SB.seg(tabs, show);
    function sync() {
      var on = $('button.on', tabs).dataset.v;
      if (!mobile.matches && on === 'curri') { $('button[data-v="note"]', tabs).click(); return; }
      show(on); tabs._place(true);
    }
    if (mobile.addEventListener) mobile.addEventListener('change', sync);
    if (!mobile.matches) $$('button', tabs).forEach(function (b) { b.classList.toggle('on', b.dataset.v === 'note'); });
    sync();
  }

  /* ── 내 강의실 ── */
  function initMy() {
    var root = $('#myRoom'); if (!root) return;
    var d = SB.prog.get(), doneN = 0, started = [];
    SB.courses.forEach(function (c) {
      var m = (d.done && d.done[c.id]) || {}, n = Object.keys(m).length; doneN += n;
      if (n || (d.last && d.last.c === c.id)) started.push(c);
    });
    $('#stLessons').innerHTML = '<em>' + doneN + '</em><span>강</span>';
    $('#stCourses').innerHTML = SB.courses.filter(function (c) { return SB.prog.rate(c) === 100; }).length + '<span>개</span>';
    $('#stStreak').innerHTML = '<em>' + SB.prog.streak() + '</em><span>일</span>';
    var last = d.last && SB.course(d.last.c);
    if (last) {
      var x = SB.flat(last).filter(function (f) { return f.key === d.last.l; })[0] || SB.flat(last)[0];
      $('#resume').innerHTML = SB.thumb(last) + '<div class="resume-body"><small>이어서 보기</small><h2>' + esc(x.l.t) + '</h2>' +
        '<div class="prog-row"><div class="progress"><i style="width:' + SB.prog.rate(last) + '%"></i></div><span>' + esc(last.no) + ' · ' + SB.prog.rate(last) + '%</span></div>' +
        '<a class="btn btn-red btn-sm" href="classroom.html?c=' + last.id + '&l=' + x.key + '">' + IC.play + '계속 보기</a></div>';
    } else {
      $('#resume').outerHTML = '<div class="empty empty-gap">아직 본 강의가 없습니다. <a class="hl" href="courses.html">강의 둘러보기</a></div>';
    }
    $('#myCourses').innerHTML = started.length ? started.map(SB.card).join('') : '<div class="empty">강의를 열면 여기에 모입니다.</div>';
  }

  function init() {
    initHeader(); initHome(); initCourses(); initDetail(); initClassroom(); initMy();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
