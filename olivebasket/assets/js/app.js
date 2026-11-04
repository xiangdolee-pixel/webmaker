/* 올리브바스켓 랜딩 — 바닐라 JS (ES5) */
(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var clamp = function (v) { return v < 0 ? 0 : v > 1 ? 1 : v; };
  var vh = window.innerHeight;

  /* 탭할 때마다 바뀌는 카드 색 (평면, 그라데이션 없음) */
  var SCENES = [
    { bg: '#D5F04B', ink: '#10120E', soft: 'rgba(16,18,14,.56)' },
    { bg: '#12150E', ink: '#EEF0E8', soft: '#D5F04B' },
    { bg: '#3F4B28', ink: '#F3F4F0', soft: 'rgba(243,244,240,.62)' },
    { bg: '#C7D3B4', ink: '#12150E', soft: 'rgba(18,21,14,.56)' },
    { bg: '#FFFFFF', ink: '#10120E', soft: 'rgba(16,18,14,.5)' }
  ];

  var QUOTES = [
    ['우리에게 주어진 시간이 짧은 것이 아니라, 우리가 그 많은 시간을 허비하는 것이다.', '세네카, 『인생의 짧음에 관하여』', 3],
    ['네 영혼은 네가 자주 하는 생각의 빛깔로 물든다.', '마르쿠스 아우렐리우스, 『명상록』', 3],
    ['천 리 길도 발밑에서 시작된다.', '노자, 『도덕경』', 2],
    ['나는 숲으로 갔다. 삶을 의도적으로 살아 보고 싶었기 때문이다.', '헨리 데이비드 소로, 『월든』', 3],
    ['서두르지 말되, 쉬지도 말라.', '괴테', 2],
    ['사람을 괴롭히는 것은 일 그 자체가 아니라, 그 일에 대한 생각이다.', '에픽테토스, 『엥케이리디온』', 2],
    ['배우고 때때로 익히면 또한 기쁘지 아니한가.', '공자, 『논어』', 2],
    ['인간은 생각하는 갈대다.', '블레즈 파스칼, 『팡세』', 1]
  ];

  /* ── 1. 첫 화면: 누를 때마다 한 줄 + 카드 색 ── */
  var hero = $('#hero'), live = $('#live'), scene = 0, qi = 0, busy = false;
  function sceneVars(s) {
    live.style.setProperty('--c-bg', s.bg);
    live.style.setProperty('--c-ink', s.ink);
    live.style.setProperty('--c-soft', s.soft);
  }
  $('#liveAll').textContent = ('0' + QUOTES.length).slice(-2);

  function nextQuote() {
    if (busy) return;
    busy = true;
    qi = (qi + 1) % QUOTES.length;
    var n;
    do { n = Math.floor(Math.random() * SCENES.length); } while (n === scene);
    scene = n;
    sceneVars(SCENES[n]);

    live.classList.add('out');
    setTimeout(function () {
      var q = QUOTES[qi];
      $('#liveQ').textContent = q[0];
      $('#liveS').textContent = q[1];
      $('#liveStar').textContent = '★★★'.slice(0, q[2]);
      $('#liveNo').textContent = ('0' + (qi + 1)).slice(-2);
      live.classList.remove('out');
      busy = false;
    }, 380);
  }
  hero.addEventListener('click', function (e) {
    if (e.target.closest('a')) return;
    nextQuote();
  });

  /* 제목의 한 단어만 바뀜 */
  var WORDS = ['붙잡는', '채우는', '키우는', '다독이는', '깨우는'];
  // 새로고침할 때마다 첫 단어도 순서도 랜덤 (바로 앞 단어는 다시 안 나옴)
  var swap = $('#swap'), swapWrap = $('#swapWrap'), wi = Math.floor(Math.random() * WORDS.length);
  swap.textContent = WORDS[wi];
  setInterval(function () {
    var n;
    do { n = Math.floor(Math.random() * WORDS.length); } while (n === wi);
    wi = n;
    swap.classList.remove('go'); void swap.offsetWidth; swap.classList.add('go');
    setTimeout(function () {
      swap.textContent = WORDS[wi];
      swapWrap.classList.remove('draw'); void swapWrap.offsetWidth; swapWrap.classList.add('draw');
    }, 300);
  }, 2600);

  /* ── 2. 쇼츠: 진짜 쇼츠 화면처럼 넘어감 ── */
  // [자막, 이모지, 색1, 색2, 계정, 설명]
  var SHORTS = [
    ['이거 보면\n인생 바뀜', '😱', '#ff3b30', '#5e0b0b', '@인생역전TV', '끝까지 보면 소름 #추천 #fyp'],
    ['3초 만에\n−5kg?!', '🤯', '#ffd60a', '#ff6b00', '@다이어트비법', '의사들이 숨기는 방법 #광고'],
    ['역대급\n반전 ㄷㄷ', '😳', '#5e2bff', '#14063d', '@반전킹', '마지막 3초 주목 👀'],
    ['ㅋㅋㅋㅋㅋ\nㅋㅋㅋㅋ', '🤣', '#ff9f0a', '#a12d00', '@웃참실패', '이거 보고 안 웃으면 돈 드림'],
    ['부자 되는\n습관 7가지', '🤑', '#30d158', '#063b19', '@돈버는남자', '아직도 월급만 받아? #재테크'],
    ['충격 실화', '😨', '#1c1c1e', '#ff2d55', '@이슈속보', '댓글 난리난 영상 #실화'],
    ['ASMR\n먹방 2시간', '🍜', '#ff2d92', '#4a0026', '@먹방요정', '소리 키우고 보세요 🔊'],
    ['알고리즘이\n데려옴', '🫠', '#0a84ff', '#03224a', '@랜덤영상', '여기까지 온 사람 손 🙋'],
    ['다음 편\n보러가기', '👉', '#bf5af2', '#2b0942', '@시리즈맛집', '2편은 프로필 링크에서'],
    ['한 번만\n더 볼까', '🔁', '#ff375f', '#3b0010', '@무한반복', '벌써 3번째 보는 중 ㅋㅋ']
  ];
  var SVG = {
    heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
    talk: '<path d="M5 18.5V6.5A1.5 1.5 0 0 1 6.5 5h11A1.5 1.5 0 0 1 19 6.5v8a1.5 1.5 0 0 1-1.5 1.5H8z"/>',
    share: '<path d="M13 5l7 6-7 6v-3.5c-4 0-6.5 1-9 4 .8-5 3.5-8.5 9-9z"/>'
  };
  var reel = $('#reel'), html = '';
  for (var t = 0; t < SHORTS.length; t++) {
    var d = SHORTS[t];
    html += '<div class="short" style="--c1:' + d[2] + ';--c2:' + d[3] + ';--w:' + (24 + (t * 37) % 70) + '%">' +
      '<b class="sh-cap">' + d[0].replace('\n', '<br>') + '</b>' +
      '<span class="sh-emo">' + d[1] + '</span>' +
      '<ul class="sh-rail">' +
        '<li><svg viewBox="0 0 24 24">' + SVG.heart + '</svg>' + (3 + (t * 7) % 40) + '.' + (t * 3) % 10 + '만</li>' +
        '<li><svg viewBox="0 0 24 24">' + SVG.talk + '</svg>' + (1 + (t * 5) % 9) + ',' + (100 + (t * 137) % 900) + '</li>' +
        '<li><svg viewBox="0 0 24 24">' + SVG.share + '</svg>공유</li>' +
      '</ul>' +
      '<div class="sh-meta"><b>' + d[4] + '</b><p>' + d[5] + '</p><span>♪ 원본 사운드 · ' + d[4].slice(1) + '</span></div>' +
      '<u></u></div>';
  }
  reel.innerHTML = html;
  var shortEls = $$('.short', reel);
  var sfTime = $('#sfTime'), sfPct = $('#sfPct'), sfBat = $('#sfBat'), toast = $('#toast');
  function smoother(f) { return f * f * f * (f * (f * 6 - 15) + 10); }

  /* ── 3. 바느질 구멍 + 물들이기 ── */
  var holes = $('#holes');
  ['#th1', '#th2'].forEach(function (id, k) {
    var p = $(id), len = p.getTotalLength(), n = k ? 6 : 7;
    for (var i = 1; i < n; i++) {
      var pt = p.getPointAtLength(len * i / n);
      if (pt.x < 2 || pt.x > 98) continue;
      var h = document.createElement('i');
      h.style.left = pt.x + '%';
      h.style.top = pt.y + '%';
      h.setAttribute('data-x', pt.x / 100);
      holes.appendChild(h);
    }
  });
  var holeEls = $$('i', holes);

  // [바탕, 글자, 실, 어두운 바탕 여부]
  var PALETTES = [
    ['#D5F04B', '#12150E', '#12150E', 0],
    ['#12150E', '#D5F04B', '#EEF0E8', 1],
    ['#F3F4F0', '#10120E', '#7A9A2A', 0],
    ['#3F4B28', '#F3F4F0', '#D5F04B', 1],
    ['#FFFFFF', '#3F4B28', '#10120E', 0]
  ];
  var stitch = $('#stitch'), pal = 0;
  stitch.addEventListener('click', function () {
    pal = (pal + 1) % PALETTES.length;
    var c = PALETTES[pal];
    stitch.style.setProperty('--st-bg', c[0]);
    stitch.style.setProperty('--st-ink', c[1]);
    stitch.style.setProperty('--st-th', c[2]);
  });

  /* 글자를 줄 폭에 꽉 맞춤 */
  function fitAll() {
    $$('.fit').forEach(function (el) {
      var w = el.parentNode.clientWidth;
      el.style.fontSize = '100px';
      el.style.fontSize = (100 * w / el.scrollWidth) + 'px';
    });
  }
  fitAll();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitAll);

  /* ── 4. 폰 단계 ── */
  var how = $('#how'), steps = $$('.step', how), shots = $$('.scr img', how), bars = $$('.bar i', how);
  var curStep = -1, loopTimer = null, loopIdx = 0;
  // 단계별로 크게 보여 줄 부분 (원본 780×1688 캡처 기준 x, y, 너비, 높이)
  var ZOOM = [
    [56, 262, 668, 210, '구절 적기'],
    [56, 738, 668, 245, '별 1~3개'],
    [56, 84, 690, 196, '보여 주는 방식'],
    [40, 690, 700, 400, '탭하면 다음 한 줄']
  ];
  var spot = $('#spot'), zoom = $('#zoom'), zoomBox = $('#zoomBox'), zoomImg = $('#zoomImg'), zoomTag = $('#zoomTag');
  function placeZoom() {
    var z = ZOOM[curStep < 0 ? 0 : curStep], k = zoomBox.clientWidth / z[2];
    zoomBox.style.height = Math.round(z[3] * k) + 'px';
    zoomImg.style.width = Math.round(780 * k) + 'px';
    zoomImg.style.transform = 'translate(' + (-z[0] * k) + 'px,' + (-z[1] * k) + 'px)';
    spot.style.left = (z[0] / 780 * 100) + '%';
    spot.style.top = (z[1] / 1688 * 100) + '%';
    spot.style.width = (z[2] / 780 * 100) + '%';
    spot.style.height = (z[3] / 1688 * 100) + '%';
  }
  function showShot(list, i) {
    shots.forEach(function (im) { im.classList.toggle('on', im === list[i]); });
    if (list[i]) zoomImg.src = list[i].getAttribute('src');
  }
  function setStep(s) {
    if (s === curStep) return;
    curStep = s;
    steps.forEach(function (el, i) { el.classList.toggle('on', i === s); });
    bars.forEach(function (el, i) { el.classList.toggle('on', i === s); });
    var mine = shots.filter(function (im) { return (' ' + im.getAttribute('data-s') + ' ').indexOf(' ' + s + ' ') > -1; });
    zoomTag.textContent = ZOOM[s][4];
    placeZoom();
    zoom.classList.remove('pop'); void zoom.offsetWidth; zoom.classList.add('pop');
    clearInterval(loopTimer);
    loopIdx = 0;
    showShot(mine, 0);
    if (mine.length > 1) {
      loopTimer = setInterval(function () {
        loopIdx = (loopIdx + 1) % mine.length;
        showShot(mine, loopIdx);
      }, 1700);
    }
  }
  setStep(0);

  /* ── 7. 바구니에 쌓이는 올리브 ── */
  var pile = $('#pile'), olives = [];
  (function buildPile() {
    var COLORS = ['#6f7f35', '#8a9a45', '#3a2e35', '#4b3b43', '#7c8c3c', '#56652c'];
    var rows = [10, 10, 9, 9, 8, 7, 6, 4, 2], k = 0, frag = document.createDocumentFragment();
    for (var r = 0; r < rows.length; r++) {
      var n = rows[r], gap = 9.2 - r * .25, span = (n - 1) * gap, start = 50 - span / 2 - 6.25;
      for (var i = 0; i < n; i++) {
        var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        var u = document.createElementNS('http://www.w3.org/2000/svg', 'use');
        u.setAttribute('href', '#olive');
        s.appendChild(u);
        s.style.left = (start + i * gap + ((r + i) % 3 - 1) * 1.4) + '%';
        // 가운데가 봉긋한 더미: 가장자리일수록 낮게
        var edge = Math.abs(i - (n - 1) / 2) / ((n - 1) / 2 || 1);
        s.style.bottom = (r * 8.5 - edge * edge * 6 + ((i * 7) % 3)) + '%';
        s.style.color = COLORS[(k * 5 + r) % COLORS.length];
        s.style.setProperty('--r', (((k * 47) % 70) - 35) + 'deg');
        frag.appendChild(s);
        olives.push(s);
        k++;
      }
    }
    pile.appendChild(frag);
  })();
  var caps = $$('.cap'), grow = $('#grow');

  /* ── 6. 남의 밑줄 담기 ── */
  var myBasket = $('#myBasket'), myCount = $('#myCount');
  $$('.qcard button').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var card = btn.closest('.qcard');
      var a = card.getBoundingClientRect(), b = myBasket.querySelector('img').getBoundingClientRect();
      var ghost = card.cloneNode(true);
      ghost.classList.add('fly');
      ghost.style.left = a.left + 'px';
      ghost.style.top = a.top + 'px';
      ghost.style.width = a.width + 'px';
      ghost.style.height = a.height + 'px';
      document.body.appendChild(ghost);
      void ghost.offsetWidth;
      var dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + b.height / 2 - (a.top + a.height / 2);
      ghost.style.transform = 'translate(' + dx + 'px,' + dy + 'px) scale(.06) rotate(-12deg)';
      ghost.style.opacity = '.4';
      btn.disabled = true;
      btn.textContent = '담았어요';
      setTimeout(function () {
        ghost.parentNode.removeChild(ghost);
        myCount.textContent = +myCount.textContent + 1;
        myBasket.classList.remove('bump'); void myBasket.offsetWidth; myBasket.classList.add('bump');
      }, 760);
    });
  });

  /* ── 8. 설치 안내: 폰 종류에 맞춰 ── */
  var ua = navigator.userAgent;
  var os = /android/i.test(ua) ? 'android' : 'ios';
  function setOs(o) {
    $$('.os button').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-os') === o); });
    $$('.guide').forEach(function (g) { g.hidden = g.getAttribute('data-os') !== o; });
  }
  setOs(os);
  $$('.os button').forEach(function (b) {
    b.addEventListener('click', function () { setOs(b.getAttribute('data-os')); });
  });

  /* ── 스크롤 ── */
  var top = $('#top'), doom = $('#doom'), swiped = $('#swiped'), kept = $('#kept');
  var darkSecs = $$('[data-dark]').concat([$('.foot')]);
  var modeItems = $$('.mode-list li'), dayEl = $('#day');

  function pinP(el) {
    var r = el.getBoundingClientRect(), d = r.height - vh;
    return d > 0 ? clamp(-r.top / d) : 0;
  }
  function viewP(el) {
    var r = el.getBoundingClientRect();
    return clamp((vh - r.top) / (vh + r.height));
  }

  function onScroll() {
    var y = window.pageYOffset;
    top.classList.toggle('scrolled', y > 20);
    var dark = false;
    darkSecs.forEach(function (s) {
      var r = s.getBoundingClientRect();
      if (r.top <= 30 && r.bottom > 30) dark = true;
    });
    top.classList.toggle('dark', dark || overDarkStitch());

    // 2. 쇼츠: 넘길수록 빨라지고, 밤은 깊어지고, 배터리는 줄고
    var p = pinP(doom), p2 = clamp(p / .44);
    var x = Math.pow(p2, 1.35) * (shortEls.length - 1), xi = Math.floor(x);
    var pos = xi + smoother(x - xi);
    reel.style.transform = 'translate3d(0,' + (-pos * 100) + '%,0)';
    swiped.textContent = Math.round(287 * p2);
    var mins = (23 * 60 + 12 + Math.round(p2 * 215)) % 1440, hh = Math.floor(mins / 60) % 12 || 12, mm = mins % 60;
    sfTime.textContent = hh + ':' + (mm < 10 ? '0' : '') + mm;
    var bat = Math.round(78 - p2 * 72);
    sfPct.textContent = bat;
    sfBat.style.width = bat + '%';
    doom.classList.toggle('low', bat < 20);
    toast.classList.toggle('on', p2 > .45 && p < .46);
    // 멈춘 뒤 메시지를 충분히 머물게: 0.46 멈춤 → 0.52 문장 → 0.6 한 줄 담기 → 1까지 그대로
    doom.classList.toggle('stop', p > .46);
    doom.classList.toggle('calm', p > .52);
    doom.classList.toggle('done', p > .6);
    kept.textContent = p > .52 ? 1 : 0;

    // 3. 실 꿰기
    var sp = clamp((viewP(stitch) - .12) / .5);
    stitch.style.setProperty('--p', sp);
    holeEls.forEach(function (h) { h.classList.toggle('in', +h.getAttribute('data-x') < sp); });

    // 4. 폰 단계
    setStep(Math.min(3, Math.floor(pinP(how) * 4)));

    // 5. 보는 방식: 화면 가운데 줄이 채워짐
    modeItems.forEach(function (li) {
      var r = li.getBoundingClientRect();
      if (r.top < vh * .62) li.classList.add('on');
      else li.classList.remove('on');
    });

    // 7. 바구니
    var g = pinP(grow), cnt = Math.round(clamp(g / .86) * olives.length);
    olives.forEach(function (o, i) { o.classList.toggle('in', i < cnt); });
    dayEl.textContent = 1 + Math.round(clamp(g / .86) * 364);
    var ci = g < .3 ? 0 : g < .62 ? 1 : 2;
    caps.forEach(function (c, i) { c.classList.toggle('on', i === ci); });
    grow.classList.toggle('end', g > .88);
    grow.style.setProperty('--g', clamp(g / .86));
  }
  // 물들이기 마지막 팔레트(어두운 바탕) 위에서는 상단도 밝은 글자
  function overDarkStitch() {
    var r = stitch.getBoundingClientRect();
    return PALETTES[pal][3] && r.top <= 30 && r.bottom > 30;
  }

  var ticking = false;
  window.addEventListener('scroll', function () {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () { ticking = false; onScroll(); });
  }, { passive: true });
  window.addEventListener('resize', function () { vh = window.innerHeight; fitAll(); placeZoom(); onScroll(); });
  onScroll();

  /* 나타나기 */
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -12% 0px' });
    $$('.rv').forEach(function (el) { io.observe(el); });
  } else {
    $$('.rv').forEach(function (el) { el.classList.add('in'); });
  }
})();
