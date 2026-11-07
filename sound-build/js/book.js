/* 카툰 보기 — 쪽 그림(img/cartoon/pNN.webp)을 전자책처럼 넘겨 본다.
   넓은 화면: 두 쪽 펼침(표지 · 마지막 쪽은 한 쪽) + 종이 넘김 / 좁은 화면: 한 쪽씩 밀어 넘김.
   ← → · 스페이스, 쪽 누르기(왼쪽 반 = 앞, 오른쪽 반 = 뒤), 손가락 밀기, 쪽 막대, 목차(썸네일), 확대, 전체화면. */
(function () {
  'use strict';
  var SB = window.SB, $ = SB.$, $$ = SB.$$;
  var root = $('#reader'); if (!root) return;
  var N = +root.dataset.pages, RATIO = 1240 / 1753;
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var stage = $('.rd-stage', root), book = $('.rd-book', root), range = $('#rdRange'), count = $('.rd-count', root);
  var page = 1, two = false, zoom = false, busy = false;

  function src(p) { return 'img/cartoon/p' + ('0' + p).slice(-2) + '.webp'; }
  function img(p) { return p ? '<img src="' + src(p) + '" alt="' + p + '쪽" draggable="false">' : ''; }
  var cache = {};
  function preload(p) { if (p >= 1 && p <= N && !cache[p]) { cache[p] = new Image(); cache[p].src = src(p); } }

  // 펼침: [1] [2,3] … [N] — 지금 쪽이 들어 있는 펼침
  function spread(p) {
    if (!two) return [p];
    if (p === 1) return [1];
    var l = p % 2 === 0 ? p : p - 1;
    return l + 1 <= N ? [l, l + 1] : [l];
  }
  function nextP(p) { var s = spread(p); return s[s.length - 1] + 1 <= N ? s[s.length - 1] + 1 : null; }
  function prevP(p) { var s = spread(p); return s[0] - 1 >= 1 ? spread(s[0] - 1)[0] : null; }

  function size() {
    two = root.clientWidth >= 900 && window.innerWidth > window.innerHeight * 1.05;
    root.classList.toggle('two', two);
    var W = stage.clientWidth - (two ? 120 : 24), H = stage.clientHeight - 24;
    var ph = zoom && !two ? W / RATIO : Math.min(H, W / (two ? 2 : 1) / RATIO);
    root.style.setProperty('--ph', Math.floor(ph) + 'px');
    root.style.setProperty('--pw', Math.floor(ph * RATIO) + 'px');
    root.classList.toggle('zoomed', zoom && !two);
  }
  function paint(s) {
    book.classList.toggle('solo', s.length === 1);
    book.innerHTML = s.length === 2
      ? '<div class="rd-pg rd-l">' + img(s[0]) + '</div><div class="rd-pg rd-r">' + img(s[1]) + '</div>'
      : '<div class="rd-pg rd-one">' + img(s[0]) + '</div>';
  }
  function label(s) {
    count.textContent = (s.length === 2 ? s[0] + '–' + s[1] : s[0]) + ' / ' + N;
    range.value = s[0];
    $('[data-rd="prev"]', root).disabled = !prevP(page);
    $('[data-rd="next"]', root).disabled = !nextP(page);
    try { localStorage.setItem('sb_cartoon_page', page); } catch (e) {}
    history.replaceState(null, '', '#p' + page);
    var s2 = spread(page); preload(s2[0] - 1); preload(s2[0] - 2); preload(s2[s2.length - 1] + 1); preload(s2[s2.length - 1] + 2);
  }
  function show(p) { page = Math.min(Math.max(1, p), N); var s = spread(page); paint(s); label(s); }

  /* 넘기기 */
  function go(dir) {
    if (busy) return;
    var to = dir > 0 ? nextP(page) : prevP(page);
    if (!to) { book.classList.remove('bump'); void book.offsetWidth; book.classList.add('bump'); return; }
    var from = spread(page), dest = spread(to);
    if (reduce) { show(to); return; }
    if (two && from.length === 2 && dest.length === 2) return flip(dir, from, dest, to);
    slide(dir, to);
  }
  // 두 쪽 펼침: 종이 한 장이 책등을 축으로 넘어간다
  function flip(dir, from, dest, to) {
    busy = true;
    var L = $('.rd-l', book), R = $('.rd-r', book), leaf = document.createElement('div');
    leaf.className = 'rd-leaf ' + (dir > 0 ? 'to-left' : 'to-right');
    if (dir > 0) { R.innerHTML = img(dest[1]); leaf.innerHTML = '<div class="rd-face front">' + img(from[1]) + '</div><div class="rd-face back">' + img(dest[0]) + '</div>'; }
    else { L.innerHTML = img(dest[0]); leaf.innerHTML = '<div class="rd-face front">' + img(from[0]) + '</div><div class="rd-face back">' + img(dest[1]) + '</div>'; }
    book.appendChild(leaf);
    void leaf.offsetWidth; leaf.classList.add('go');
    var done = function () {
      if (!busy) return; busy = false;
      page = to; paint(dest); label(dest);
    };
    leaf.addEventListener('transitionend', done, { once: true });
    setTimeout(done, 900);
    page = to; label(dest);
  }
  // 한 쪽 · 펼침이 바뀌는 곳: 옆으로 밀어 넘김
  function slide(dir, to) {
    busy = true;
    var old = book.cloneNode(true); old.classList.add('rd-old'); old.removeAttribute('id');
    book.parentNode.insertBefore(old, book);
    show(to);
    book.classList.add('rd-in', dir > 0 ? 'from-r' : 'from-l');
    old.classList.add(dir > 0 ? 'out-l' : 'out-r');
    void book.offsetWidth;
    book.classList.add('go'); old.classList.add('go');
    setTimeout(function () { old.remove(); book.classList.remove('rd-in', 'from-r', 'from-l', 'go'); busy = false; }, 380);
  }

  /* 조작 */
  root.addEventListener('click', function (e) {
    var b = e.target.closest('[data-rd]');
    if (b) {
      var a = b.dataset.rd;
      if (a === 'prev') go(-1);
      if (a === 'next') go(1);
      if (a === 'toc') toc(true);
      if (a === 'zoom') { zoom = !zoom; b.classList.toggle('on', zoom); b.setAttribute('aria-pressed', zoom); size(); stage.scrollTop = 0; }
      if (a === 'full') { if (document.fullscreenElement) document.exitFullscreen(); else if (root.requestFullscreen) root.requestFullscreen().catch(function () {}); }
      return;
    }
    if (moved || zoom) return;
    var pg = e.target.closest('.rd-book'); if (!pg) return;
    var r = pg.getBoundingClientRect();
    go(e.clientX < r.left + r.width / 2 ? -1 : 1);
  });
  range.max = N;
  range.addEventListener('input', function () { show(+range.value); });
  document.addEventListener('keydown', function (e) {
    if (/INPUT|TEXTAREA/.test(document.activeElement.tagName) && document.activeElement !== range) return;
    if (!$('.rd-toc', root).hidden) { if (e.key === 'Escape') toc(false); return; }
    if (e.key === 'ArrowRight' || e.key === 'PageDown' || (e.key === ' ' && !zoom)) { e.preventDefault(); go(1); }
    if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); go(-1); }
    if (e.key === 'Home') show(1);
    if (e.key === 'End') show(N);
  });
  // 손가락으로 밀기
  var sx = 0, sy = 0, moved = false;
  stage.addEventListener('pointerdown', function (e) { sx = e.clientX; sy = e.clientY; moved = false; });
  stage.addEventListener('pointerup', function (e) {
    var dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.4) { moved = true; go(dx < 0 ? 1 : -1); setTimeout(function () { moved = false; }, 50); }
  });

  /* 목차(썸네일) */
  var tocBox = $('.rd-toc', root);
  tocBox.querySelector('.rd-thumbs').innerHTML = Array.apply(null, Array(N)).map(function (x, i) {
    return '<button type="button" data-p="' + (i + 1) + '"><img src="img/cartoon/t' + ('0' + (i + 1)).slice(-2) + '.webp" alt="" loading="lazy" width="180" height="254"><span>' + (i + 1) + '</span></button>';
  }).join('');
  function toc(open) {
    tocBox.hidden = !open;
    if (open) {
      $$('[data-p]', tocBox).forEach(function (b) { b.classList.toggle('on', spread(page).indexOf(+b.dataset.p) >= 0); });
      var on = $('[data-p].on', tocBox); if (on) on.scrollIntoView({ block: 'center' });
    }
  }
  tocBox.addEventListener('click', function (e) {
    var b = e.target.closest('[data-p]');
    if (b) { show(+b.dataset.p); toc(false); return; }
    if (e.target === tocBox || e.target.closest('[data-rd-close]')) toc(false);
  });

  var rt; window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(function () { var was = two; size(); if (was !== two) show(page); }, 80); });
  document.addEventListener('fullscreenchange', function () { root.classList.toggle('is-full', !!document.fullscreenElement); size(); show(page); });

  var saved = 0; try { saved = +localStorage.getItem('sb_cartoon_page') || 0; } catch (e) {}
  var start = +(location.hash.match(/^#p(\d+)/) || [])[1] || saved || 1;   // 주소 > 읽던 쪽 > 표지
  size(); show(start);
})();
