/* 영소립 English Sound & Build — 사이트 공통 스크립트
   강의 · 진도 · 노트는 xms 강의 기능(/xms-api/courses …)에서 온다. 관리 화면 /xms/ → 강의 관리 에서 고친다.
   로컬 미리보기(서버 없음)에서는 data.js 의 예시 강의로 보여 준다. */
(function () {
  'use strict';
  var SB = window.SB = window.SB || {};
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
  var TITLE = '영소립 English Sound & Build';

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
      if (instant) { void ind.offsetWidth; ind.style.transition = ''; }
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

  /* ── 서버 (xms 강의) — 없으면 예시 자료 ── */
  var LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  function api(path, opt) {
    if (LOCAL) return Promise.resolve(demo(path, opt));
    opt = opt || {};
    return fetch('/xms-api' + path, {
      method: opt.method || 'GET', credentials: 'same-origin', cache: 'no-store',
      headers: opt.data ? { 'Content-Type': 'application/json' } : undefined,
      body: opt.data ? JSON.stringify(opt.data) : undefined
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok) { var e = new Error(d.error || '불러오지 못했습니다.'); e.status = r.status; throw e; }
        return d;
      });
    });
  }
  SB.api = api;
  // 로컬 미리보기용: data.js 예시 강의를 서버와 같은 모양으로
  var demoData = null;
  function demo(path, opt) {
    if (!demoData) {
      var lid = 0, thumb = { sound: 'red', build: 'black', real: 'split' };
      demoData = (SB.courses || []).map(function (c, ci) {
        return {
          id: ci + 1, title: c.title, no_label: c.no, track: SB.tracks[c.track], level: c.level, thumb: thumb[c.track], description: c.desc,
          opened_on: c.date, who: c.who, learn: c.learn, can_view: true,
          sections: c.sections.map(function (s, si) {
            return { id: ci * 100 + si, title: s.title, lessons: s.lessons.map(function (l) { lid++; return { id: lid, title: l.t, duration_sec: sec(l.d), is_free: !!l.free, open: true, has_video: !!l.v, v: l.v || '' }; }) };
          })
        };
      });
      demoData.forEach(function (c) { var ls = flat(c); c.lessons = ls.length; c.total_sec = ls.reduce(function (n, x) { return n + x.l.duration_sec; }, 0); c.done = 0; });
    }
    var m;
    if (path === '/courses') return demoData;
    if ((m = path.match(/^\/courses\/(\d+)$/))) { var c = demoData[+m[1] - 1] || demoData[0]; return Object.assign({ done: [], last: null, guest: false }, c); }
    if ((m = path.match(/^\/lessons\/(\d+)$/))) {
      var hit = null; demoData.forEach(function (c) { flat(c).forEach(function (x) { if (x.l.id === +m[1]) hit = x.l; }); });
      return { id: +m[1], video_url: hit ? hit.v : '', note: '', member: false };
    }
    if (path === '/my/courses') return { done: 0, completed: 0, streak: 0, last: null, courses: [], local: true };
    return { ok: true };
  }
  function sec(d) { var p = String(d || '').split(':'); return (+p[0]) * 60 + (+p[1] || 0); }

  /* ── 강의 공통 ── */
  function flat(c) {
    var out = [];
    (c.sections || []).forEach(function (s) { s.lessons.forEach(function (l) { out.push({ l: l, sect: s }); }); });
    return out;
  }
  function total(secs) {
    var h = Math.floor(secs / 3600), m = Math.round(secs % 3600 / 60);
    return secs ? (h ? h + '시간 ' : '') + m + '분' : '';
  }
  function dur(s) { s = s || 0; return Math.floor(s / 60) + ':' + ('0' + s % 60).slice(-2); }
  function rate(c) { return c.lessons ? Math.min(100, Math.round((c.done || 0) / c.lessons * 100)) : 0; }
  SB.thumb = function (c) {
    var word = esc(c.no_label || c.title).replace(/(\d+|&amp;)/, '<span>$1</span>');
    return '<div class="thumb t-' + esc(c.thumb || 'red') + '"><b class="thumb-word">' + word + '</b><span class="thumb-sub">' + esc([c.track, c.level].filter(Boolean).join(' · ')) + '</span></div>';
  };
  function tags(c) {
    return (c.track ? '<span class="badge badge-dark">' + esc(c.track) + '</span>' : '') + (c.level ? '<span class="badge">' + esc(c.level) + '</span>' : '') +
      (c.hidden ? '<span class="badge badge-r">숨김</span>' : '');
  }
  SB.card = function (c) {
    var r = rate(c);
    return '<a class="course-card" href="course.html?id=' + c.id + '">' + SB.thumb(c) +
      '<div class="course-body"><div class="course-tags">' + tags(c) + '</div>' +
      '<h3>' + esc(c.title) + '</h3><p>' + esc(c.description) + '</p>' +
      (r ? '<div class="prog-row"><div class="progress"><i style="width:' + r + '%"></i></div><span>' + r + '%</span></div>' : '') +
      '<div class="course-meta"><span>강의 ' + (c.lessons || 0) + '개</span><span>' + total(c.total_sec || 0) + '</span></div></div></a>';
  };
  // 강의 목록 한 줄 (스터디언처럼: 그림 · 정보 · 단추)
  SB.row = function (c) {
    var r = rate(c), href = 'course.html?id=' + c.id;
    return '<article class="course-row"><a href="' + href + '" tabindex="-1" aria-hidden="true">' + SB.thumb(c) + '</a>' +
      '<div class="cr-body"><div class="course-tags">' + tags(c) + '</div><h3><a href="' + href + '">' + esc(c.title) + '</a></h3>' +
      (c.description ? '<p>' + esc(c.description) + '</p>' : '') +
      '<div class="cr-meta"><span><b>강의 수</b>' + (c.lessons || 0) + '개</span>' + (c.total_sec ? '<span><b>총 시간</b>' + total(c.total_sec) + '</span>' : '') +
      (c.level ? '<span><b>수준</b>' + esc(c.level) + '</span>' : '') + '</div>' +
      (r ? '<div class="prog-row"><div class="progress"><i style="width:' + r + '%"></i></div><span>' + r + '%</span></div>' : '') + '</div>' +
      '<div class="cr-act"><a class="btn btn-red btn-sm" href="' + href + '">' + (r ? '이어서 보기' : '강의 보기') + '</a>' +
      '<a class="btn btn-line btn-sm" href="' + href + '#curri">커리큘럼</a></div></article>';
  };
  function curriculum(c, curId) {
    var done = c.done || [];
    return c.sections.map(function (s, si) {
      var open = curId ? s.lessons.some(function (l) { return l.id === curId; }) : si === 0;
      var rows = s.lessons.map(function (l) {
        var isDone = done.indexOf(l.id) >= 0, now = l.id === curId;
        var ic = !l.open ? IC.lock : isDone ? IC.check : IC.play;
        var inner = '<span class="lesson-ic">' + ic + '</span><span class="lesson-t">' + esc(l.title) +
          (l.is_free ? ' <span class="badge badge-y">맛보기</span>' : '') + '</span><span class="lesson-d">' + (l.duration_sec ? dur(l.duration_sec) : '') + '</span>';
        var cls = 'lesson' + (isDone ? ' done' : '') + (now ? ' now' : '') + (l.open ? '' : ' locked');
        return '<li><a class="' + cls + '" href="classroom.html?c=' + c.id + '&l=' + l.id + '"' + (now ? ' aria-current="true"' : '') + '>' + inner + '</a></li>';
      }).join('');
      return '<div class="sect' + (open ? ' open' : '') + '"><button class="sect-btn" type="button" aria-expanded="' + open + '">' + esc(s.title) +
        '<small>강의 ' + s.lessons.length + '개</small></button><div class="sect-body"><ol>' + rows + '</ol></div></div>';
    }).join('');
  }
  function bindSects(root) {
    $$('.sect-btn', root).forEach(function (b) {
      b.addEventListener('click', function () { var s = b.parentNode, o = s.classList.toggle('open'); b.setAttribute('aria-expanded', o); });
    });
  }
  function qs(k) { return new URLSearchParams(location.search).get(k); }
  function loginHref() { return '/member/login?next=' + encodeURIComponent(location.pathname + location.search); }
  function failBox(el, e) { el.innerHTML = '<div class="empty">' + esc(e.message || '불러오지 못했습니다.') + '</div>'; }

  /* ── 홈 ── */
  var LEVEL_EN = { '입문': 'Beginner', '기초': 'Basic', '중급': 'Intermediate', '고급': 'Advanced' };
  function initHome() {
    var g = $('#roadmap'); if (!g) return;
    api('/courses').then(function (list) {
      var levels = [];
      list.forEach(function (c) { var k = c.level || '전체'; if (levels.indexOf(k) < 0) levels.push(k); });
      var order = ['입문', '기초', '중급', '고급'];
      levels.sort(function (a, b) { return (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99); });
      g.innerHTML = levels.length ? levels.map(function (lv, i) {
        var rows = list.filter(function (c) { return (c.level || '전체') === lv; });
        return '<section class="rm-level rm-' + Math.min(i, 2) + '"><h3 class="rm-badge">' + esc(lv) + (LEVEL_EN[lv] ? '<small>(' + LEVEL_EN[lv] + ')</small>' : '') + '</h3>' +
          '<div class="rm-table"><div class="rm-head" aria-hidden="true"><span>LEVEL</span><span>강의명</span><span>강의 소개</span></div>' +
          rows.map(function (c) {
            return '<a class="rm-row" href="course.html?id=' + c.id + '"><div class="rm-thumb">' + SB.thumb(c) + '</div>' +
              '<div class="rm-name"><b>' + esc(c.title) + '</b><small>강의 ' + (c.lessons || 0) + '개' + (c.total_sec ? ' (약 ' + total(c.total_sec) + ')' : '') + '</small></div>' +
              '<div class="rm-desc"><p>' + esc(c.description) + '</p>' +
              ((c.learn || []).length ? '<div class="rm-tags">' + c.learn.slice(0, 3).map(function (t) { return '<span>#' + esc(t.replace(/\s+/g, '')) + '</span>'; }).join('') + '</div>' : '') +
              '</div></a>';
          }).join('') + '</div></section>';
      }).join('') : '<div class="empty">곧 강의가 열립니다.</div>';
    }).catch(function (e) { failBox(g, e); });
  }

  /* ── 강의 목록 ── */
  function initCourses() {
    var grid = $('#courseGrid'); if (!grid) return;
    var st = { track: 'all', level: 'all', sort: 'rec' }, all = [];
    function draw() {
      var list = all.filter(function (c) { return (st.track === 'all' || c.track === st.track) && (st.level === 'all' || c.level === st.level); });
      if (st.sort === 'new') list.sort(function (a, b) { return a.opened_on < b.opened_on ? 1 : -1; });
      if (st.sort === 'abc') list.sort(function (a, b) { return a.title.localeCompare(b.title, 'ko'); });
      $('#courseCount').innerHTML = '강의 <b>' + list.length + '</b>개';
      grid.innerHTML = list.length ? list.map(SB.row).join('') : '<div class="empty">조건에 맞는 강의가 없습니다.</div>';
    }
    api('/courses').then(function (list) {
      all = list;
      // 분야 탭 · 수준 칩은 강의에 적힌 값으로 만든다 (관리 화면에서 고친 그대로)
      var uniq = function (k) { var o = []; list.forEach(function (c) { if (c[k] && o.indexOf(c[k]) < 0) o.push(c[k]); }); return o; };
      var tracks = uniq('track'), levels = uniq('level');
      $('#trackSeg').innerHTML = '<button data-v="all" class="on">전체</button>' + tracks.map(function (t) { return '<button data-v="' + esc(t) + '">' + esc(t) + '</button>'; }).join('');
      $('#trackSeg').hidden = tracks.length < 2;
      $('#levelChips').innerHTML = '<button class="chip on" type="button" data-v="all" aria-pressed="true">모든 수준</button>' +
        levels.map(function (l) { return '<button class="chip" type="button" data-v="' + esc(l) + '" aria-pressed="false">' + esc(l) + '</button>'; }).join('');
      $('#levelChips').hidden = levels.length < 2;
      var want = qs('track');
      SB.seg($('#trackSeg'), function (v) { st.track = v; draw(); });
      if (want && tracks.indexOf(want) >= 0) $('#trackSeg button[data-v="' + want + '"]').click();
      $$('#levelChips .chip').forEach(function (b) {
        b.addEventListener('click', function () {
          $$('#levelChips .chip').forEach(function (x) { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); });
          st.level = b.dataset.v; draw();
        });
      });
      draw();
    }).catch(function (e) { failBox(grid, e); });
    SB.seg($('#sortSeg'), function (v) { st.sort = v; draw(); });
  }

  /* ── 강의 상세 ── */
  function initDetail() {
    var root = $('#courseDetail'); if (!root) return;
    root.classList.add('has-bar');
    api('/courses/' + (+qs('id') || 0)).then(function (c) {
      document.title = c.title + ' · ' + TITLE;
      var ls = flat(c), r = c.lessons ? Math.round(c.done.length / c.lessons * 100) : 0;
      var start = c.last || (ls[0] && ls[0].l.id);
      var free = ls.filter(function (x) { return x.l.is_free; })[0];
      $('#dTags').innerHTML = tags(c);
      $('#dTitle').textContent = c.title;
      $('#dDesc').textContent = c.description;
      $('#dFacts').innerHTML = '<span>강의 <b>' + c.lessons + '</b>개</span>' + (c.total_sec ? '<span>총 <b>' + total(c.total_sec) + '</b></span>' : '') + '<span>섹션 <b>' + c.sections.length + '</b>개</span>';
      $('#dWho').innerHTML = c.who.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('');
      $('#dWho').closest('.box').hidden = !c.who.length;
      $('#dLearn').innerHTML = c.learn.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('');
      $('#dLearn').closest('.box').hidden = !c.learn.length;
      $('#dCurriMeta').textContent = '섹션 ' + c.sections.length + '개 · 강의 ' + c.lessons + '개' + (c.total_sec ? ' · ' + total(c.total_sec) : '');
      $('#dCurri').innerHTML = curriculum(c, null);
      bindSects($('#dCurri'));
      var main = c.can_view
        ? '<a class="btn btn-red" href="classroom.html?c=' + c.id + '&l=' + start + '">' + IC.play + (c.last ? '이어서 보기' : '강의실 입장') + '</a>'
        : c.guest ? '<a class="btn btn-red" href="' + loginHref() + '">로그인하고 수강하기</a>'
        : '<span class="btn btn-line" aria-disabled="true">' + IC.lock + '수강 권한이 필요합니다</span>';
      var note = c.can_view ? '' : c.guest ? '회원은 수강 권한을 받으면 모든 강의를 볼 수 있습니다.' : '관리자가 수강 권한을 주면 모든 강의가 열립니다.';
      $('#dSide').innerHTML = SB.thumb(c) + '<div class="side-in">' +
        (r ? '<div class="prog-row"><div class="progress"><i style="width:' + r + '%"></i></div><span>' + r + '%</span></div>' : '') + main +
        (free ? '<a class="btn btn-line" href="classroom.html?c=' + c.id + '&l=' + free.l.id + '">맛보기 1강</a>' : '') +
        (note ? '<p class="side-note">' + note + '</p>' : '') + '</div>';
    }).catch(function (e) { failBox($('.detail', root) || root, e); });
  }

  /* ── 강의실 ── */
  SB.embed = function (url) {
    if (!url) return '';
    var m = url.match(/(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/))([\w-]{11})/);
    if (m) return 'https://www.youtube-nocookie.com/embed/' + m[1] + '?rel=0&playsinline=1&modestbranding=1';
    m = url.match(/vimeo\.com\/(?:video\/)?(\d+)(?:\/([\da-f]+))?(?:.*[?&]h=([\da-f]+))?/);
    if (m) return 'https://player.vimeo.com/video/' + m[1] + '?dnt=1&title=0&byline=0&portrait=0' + ((m[2] || m[3]) ? '&h=' + (m[2] || m[3]) : '');
    return /^https:\/\//.test(url) ? url : '';
  };
  function initClassroom() {
    var root = $('#classroom'); if (!root) return;
    api('/courses/' + (+qs('c') || 0)).then(function (c) {
      var ls = flat(c);
      var idx = Math.max(0, ls.map(function (x) { return x.l.id; }).indexOf(+qs('l')));
      var cur = ls[idx];
      if (!cur) { failBox($('#player'), new Error('아직 차시가 없습니다.')); return; }
      document.title = cur.l.title + ' · ' + (c.no_label || c.title) + ' · ' + TITLE;
      $('#cSect').textContent = (c.no_label ? c.no_label + ' · ' : '') + cur.sect.title;
      $('#cTitle').textContent = cur.l.title;
      var prev = ls[idx - 1], next = ls[idx + 1];
      var href = function (x) { return 'classroom.html?c=' + c.id + '&l=' + x.l.id; };
      $('#cNav').innerHTML = (prev ? '<a class="btn btn-line btn-sm" href="' + href(prev) + '">' + IC.prev + '이전</a>' : '<span></span>') +
        '<button class="btn btn-sm btn-red" id="doneBtn" type="button" hidden></button>' +
        (next ? '<a class="btn btn-line btn-sm" href="' + href(next) + '">다음' + IC.next + '</a>' : '<span></span>');
      var doneBtn = $('#doneBtn');
      var isDone = function () { return c.done.indexOf(cur.l.id) >= 0; };
      function side() {
        var r = c.lessons ? Math.round(c.done.length / c.lessons * 100) : 0;
        $('#cSide').innerHTML = '<div class="class-side-head"><a href="course.html?id=' + c.id + '"><h2>' + esc(c.title) + '</h2></a>' +
          '<div class="prog-row"><div class="progress"><i style="width:' + r + '%"></i></div><span>' + r + '%</span></div></div>' + curriculum(c, cur.l.id);
        bindSects($('#cSide'));
      }
      function paintDone() {
        var d = isDone();
        doneBtn.className = 'btn btn-sm ' + (d ? 'btn-line' : 'btn-red');
        doneBtn.innerHTML = d ? IC.check + '완료' : '완료로 표시';
      }
      side();
      // 영상 · 노트: 볼 수 있을 때만 서버가 영상 주소를 준다
      api('/lessons/' + cur.l.id).then(function (L) {
        var src = SB.embed(L.video_url);
        $('#player').innerHTML = src
          ? '<iframe src="' + esc(src) + '" title="' + esc(cur.l.title) + '" allow="autoplay; fullscreen; picture-in-picture; encrypted-media" allowfullscreen></iframe>'
          : '<div class="player-empty"><div><b class="serif">Sound <span>&amp;</span> Build</b>이 차시는 아직 영상이 연결되지 않았습니다.</div></div>';
        if (L.member) {
          doneBtn.hidden = false; paintDone();
          doneBtn.addEventListener('click', function () {
            var on = !isDone();
            api('/lessons/' + cur.l.id + '/done', { method: 'PUT', data: { done: on } }).then(function () {
              if (on) c.done.push(cur.l.id); else c.done = c.done.filter(function (x) { return x !== cur.l.id; });
              paintDone(); side();
            });
          });
        }
        // 노트: 회원이면 계정에 저장 (입력 멈추고 0.8초 뒤)
        var na = $('#noteArea'), help = $('.note-help');
        na.value = L.note || '';
        if (L.member) {
          help.textContent = '내 계정에 저장되어 어느 기기에서나 보입니다.';
          var t; na.addEventListener('input', function () {
            clearTimeout(t); help.textContent = '저장하는 중…';
            t = setTimeout(function () {
              api('/lessons/' + cur.l.id + '/note', { method: 'PUT', data: { body: na.value } })
                .then(function () { help.textContent = '저장했습니다.'; }).catch(function () { help.textContent = '저장하지 못했습니다. 잠시 뒤 다시 적어 주세요.'; });
            }, 800);
          });
        } else { na.disabled = true; help.innerHTML = '<a class="hl" href="' + loginHref() + '">로그인</a>하면 노트를 남길 수 있습니다.'; }
      }).catch(function (e) {
        $('#player').innerHTML = '<div class="player-empty"><div>' + IC.lock.replace('<svg', '<svg width="34" height="34"') + '<b>' + esc(e.message) + '</b>' +
          (e.status === 401 ? '<a class="btn btn-yellow btn-sm" href="' + loginHref() + '">로그인</a>' : '') + '</div></div>';
        $('#noteArea').disabled = true;
      });
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
    }).catch(function (e) { failBox($('#player'), e); });
  }

  /* ── 내 강의실 ── */
  function initMy() {
    var root = $('#myRoom'); if (!root) return;
    api('/my/courses').then(function (d) {
      if (d.guest) {
        $('.stats', root).hidden = true;
        $('#resume').outerHTML = '<div class="empty empty-gap">로그인하면 보던 강의와 진도가 여기에 모입니다. <a class="hl" href="' + loginHref() + '">로그인</a></div>';
        $('#myCourses').innerHTML = '';
        return;
      }
      $('#stLessons').innerHTML = '<em>' + d.done + '</em><span>개</span>';
      $('#stCourses').innerHTML = d.completed + '<span>개</span>';
      $('#stStreak').innerHTML = '<em>' + d.streak + '</em><span>일</span>';
      if (d.last) {
        var c = d.last.course, r = rate(c);
        $('#resume').innerHTML = SB.thumb(c) + '<div class="resume-body"><small>이어서 보기</small><h2>' + esc(d.last.lesson.title) + '</h2>' +
          '<div class="prog-row"><div class="progress"><i style="width:' + r + '%"></i></div><span>' + esc(c.no_label || c.title) + ' · ' + r + '%</span></div>' +
          '<a class="btn btn-red btn-sm" href="classroom.html?c=' + c.id + '&l=' + d.last.lesson.id + '">' + IC.play + '계속 보기</a></div>';
      } else {
        $('#resume').outerHTML = '<div class="empty empty-gap">아직 본 강의가 없습니다. <a class="hl" href="courses.html">강의 둘러보기</a></div>';
      }
      $('#myCourses').innerHTML = d.courses.length ? d.courses.map(SB.card).join('') : '<div class="empty">강의를 열면 여기에 모입니다.</div>';
    }).catch(function (e) { failBox(root, e); });
  }

  function init() {
    initHeader(); initHome(); initCourses(); initDetail(); initClassroom(); initMy();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
