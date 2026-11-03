/* pan — 실시간 시세
 * 지수·환율·원자재: /api/indices (Worker 가 네이버 증권을 대신 부름) — 7초마다
 * 거래대금 상위: /api/top?market=kr|us — 10초마다
 * 코인: 코인게코 상위 20위(1분, 브라우저가 직접 → 안 되면 /api/coins) + 바이낸스 웹소켓(miniTicker)
 * 원화: 업비트 원화 시세(웹소켓). 업비트에 없는 코인은 ≈ 달러 × 업비트 USDT
 * 차트: 코인은 바이낸스 klines(없으면 코인게코), 나머지는 /api/chart — 라이브러리 없이 canvas 로 그림
 */
(function () {
  'use strict';

  var INDEX_EVERY = 7000;
  var TOP_EVERY = 10000;
  var COINS_EVERY = 60000;
  var WS_HOSTS = ['wss://data-stream.binance.vision/stream?streams=', 'wss://stream.binance.com:9443/stream?streams='];
  var REST_HOSTS = ['https://data-api.binance.vision', 'https://api.binance.com'];
  var UPBIT_WS = 'wss://api.upbit.com/websocket/v1';
  var CG = 'https://api.coingecko.com/api/v3';

  var $ = function (id) { return document.getElementById(id); };
  var elFx = $('fx');
  var elConn = $('conn');
  var elCoins = $('coins');
  var elTop = $('top');

  /* ---------- 숫자 표시 ---------- */
  function nf(v, min, max) {
    return Number(v).toLocaleString('en-US', { minimumFractionDigits: min, maximumFractionDigits: max });
  }
  function fmtUSD(v) {
    if (v == null || isNaN(v)) return '—';
    if (v >= 1000) return '$' + nf(v, 2, 2);
    if (v >= 1) return '$' + nf(v, 2, 4);
    if (v >= 0.01) return '$' + nf(v, 4, 5);
    return '$' + Number(Number(v).toPrecision(4)).toString();
  }
  function fmtKRW(v) {
    if (v == null || isNaN(v)) return '';
    if (v >= 100) return '₩' + Math.round(v).toLocaleString('ko-KR');
    return '₩' + nf(v, 2, 2);
  }
  function fmtCap(v) {
    if (!v) return '—';
    if (v >= 1e12) return '$' + (v / 1e12).toFixed(2) + 'T';
    if (v >= 1e9) return '$' + (v / 1e9).toFixed(1) + 'B';
    return '$' + (v / 1e6).toFixed(0) + 'M';
  }
  function fmtPct(v) {
    if (v == null || isNaN(v)) return '—';
    return (v > 0 ? '+' : '') + Number(v).toFixed(2) + '%';
  }
  // 1조 4,837억 / 256억 / 3,120만
  function fmtKor(n) {
    if (n == null || isNaN(n)) return '—';
    if (n >= 1e12) {
      var jo = Math.floor(n / 1e12), eok = Math.floor((n % 1e12) / 1e8);
      return jo.toLocaleString('ko-KR') + '조' + (eok ? ' ' + eok.toLocaleString('ko-KR') + '억' : '');
    }
    if (n >= 1e8) return Math.floor(n / 1e8).toLocaleString('ko-KR') + '억';
    if (n >= 1e4) return Math.floor(n / 1e4).toLocaleString('ko-KR') + '만';
    return Math.round(n).toLocaleString('ko-KR');
  }
  function fmtKorShort(n) {
    if (n == null || isNaN(n)) return '—';
    if (n >= 1e12) return (n / 1e12).toFixed(n >= 1e13 ? 0 : 1) + '조';
    if (n >= 1e8) return Math.round(n / 1e8).toLocaleString('ko-KR') + '억';
    return fmtKor(n);
  }
  function dirCls(v) { return v > 0 ? 'up' : v < 0 ? 'down' : ''; }
  function arrow(v) { return v > 0 ? '▲ ' : v < 0 ? '▼ ' : ''; }
  function kstParts(d) {
    var p = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d);
    var g = {};
    p.forEach(function (x) { g[x.type] = x.value; });
    if (g.hour === '24') g.hour = '00';
    return g;
  }
  function fmtTime(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d)) return '';
    var g = kstParts(d);
    return g.month + '.' + g.day + ' ' + g.hour + ':' + g.minute;
  }
  function fmtTs(ms, withYear) {
    var g = kstParts(new Date(ms));
    return withYear ? g.year + '.' + g.month + '.' + g.day : g.month + '.' + g.day + ' ' + g.hour + ':' + g.minute;
  }
  function decFor(v) { return Math.abs(v) < 10 ? 4 : 2; }

  // 값이 바뀌면 글자를 바꾸고 오르내림에 맞춰 깜빡인다
  function setFlash(el, text, dir) {
    if (el.textContent === text) return;
    var had = el.textContent !== '' && el.textContent !== '—';
    el.textContent = text;
    if (!had || !dir) return;
    el.classList.remove('flash-up', 'flash-down');
    void el.offsetWidth;
    el.classList.add(dir > 0 ? 'flash-up' : 'flash-down');
  }
  function setConn(state, text) {
    elConn.setAttribute('data-state', state);
    elConn.querySelector('b').textContent = text;
  }
  function getJSON(url) {
    return fetch(url, { cache: 'no-store' }).then(function (r) {
      if (!r.ok) throw new Error(url + ' ' + r.status);
      return r.json();
    });
  }
  function tappable(el, fn) {
    el.classList.add('tap');
    el.setAttribute('role', 'button');
    el.tabIndex = 0;
    el.addEventListener('click', fn);
    el.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fn(); }
    });
  }

  /* ---------- 알약 탭: 떠 있는 배경 하나를 미끄러뜨린다 ---------- */
  var segs = [];
  function slideSeg(root, onPick) {
    var ind = root.querySelector('.seg-ind');
    var btns = [].slice.call(root.querySelectorAll('button'));
    var first = true;
    function place(btn) {
      if (!root.offsetWidth) { root.classList.add('no-ind'); return; } // 숨겨져 폭을 못 재면 칸 배경으로 대신
      root.classList.remove('no-ind');
      if (first) ind.style.transition = 'none';
      ind.style.width = btn.offsetWidth + 'px';
      ind.style.transform = 'translateX(' + btn.offsetLeft + 'px)';
      if (first) { void ind.offsetWidth; ind.style.transition = ''; first = false; }
    }
    function current() { return root.querySelector('button.on') || btns[0]; }
    btns.forEach(function (b) {
      b.addEventListener('click', function () {
        if (b.classList.contains('on')) return;
        btns.forEach(function (x) { x.classList.toggle('on', x === b); x.setAttribute('aria-selected', x === b); });
        place(b); // 누르는 즉시 배경부터 옮기고, 자료는 뒤따라
        onPick(b);
      });
    });
    var api = {
      measure: function () { place(current()); },
      pick: function (pred) {
        btns.forEach(function (x) { x.classList.toggle('on', pred(x)); x.setAttribute('aria-selected', pred(x)); });
        first = true;
        place(current());
      },
    };
    segs.push(api);
    api.measure();
    return api;
  }
  function measureSegs() { segs.forEach(function (s) { s.measure(); }); }
  window.addEventListener('resize', measureSegs);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(measureSegs);

  /* ---------- 장 시간 ---------- */
  var WD = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  function zoneNow(tz) {
    var p = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date());
    var g = {};
    p.forEach(function (x) { g[x.type] = x.value; });
    return { wd: WD[g.weekday], min: (+g.hour % 24) * 60 + +g.minute };
  }
  // 평일 open~close(분). 지금 장중이면 마감까지, 아니면 다음 개장까지 남은 분
  function session(tz, open, close) {
    var n = zoneNow(tz);
    var weekday = n.wd >= 1 && n.wd <= 5;
    if (weekday && n.min >= open && n.min < close) return { open: true, left: close - n.min };
    if (weekday && n.min < open) return { open: false, left: open - n.min };
    for (var d = 1; d <= 7; d++) {
      var w = (n.wd + d) % 7;
      if (w >= 1 && w <= 5) return { open: false, left: d * 1440 - n.min + open };
    }
    return { open: false, left: 0 };
  }
  function fmtLeft(m) {
    var h = Math.floor(m / 60), mm = m % 60;
    if (h >= 24) return Math.floor(h / 24) + '일 ' + (h % 24) + '시간';
    return (h ? h + '시간 ' : '') + mm + '분';
  }
  function nyOffsetMin() {
    var d = new Date();
    var ny = new Date(d.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    var utc = new Date(d.toLocaleString('en-US', { timeZone: 'UTC' }));
    return Math.round((ny - utc) / 60000);
  }
  function hm(min) {
    min = ((min % 1440) + 1440) % 1440;
    return String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0');
  }
  var naverStatus = {}; // KOSPI / .INX 의 네이버 장 상태(휴장 판단용)
  function renderHours() {
    [['hr-kr', 'Asia/Seoul', 540, 930, 'KOSPI'], ['hr-us', 'America/New_York', 570, 960, '.INX']].forEach(function (h) {
      var box = $(h[0]);
      var s = session(h[1], h[2], h[3]);
      var st = box.querySelector('[data-st]');
      var left = box.querySelector('[data-left]');
      var ns = naverStatus[h[4]];
      var holiday = s.open && ns && ns !== 'OPEN';
      st.className = 'badge ' + (s.open && !holiday ? 'open' : 'close');
      st.textContent = holiday ? '휴장' : s.open ? '장중' : '장마감';
      left.textContent = holiday ? '오늘은 휴장일이에요' : s.open ? '마감까지 ' + fmtLeft(s.left) : '개장까지 ' + fmtLeft(s.left);
    });
    var off = nyOffsetMin(); // EST -300, EDT -240
    var diff = 540 - off;    // 한국 - 뉴욕 (분)
    $('hr-us').querySelector('[data-kst]').textContent = hm(570 + diff) + ' ~ ' + hm(960 + diff);
    $('hr-us').querySelector('[data-dst]').textContent = off === -240 ? '서머타임 적용 중' : '서머타임 아님';
  }

  /* ---------- 지수·환율·원자재 칸 ---------- */
  var tiles = {}; // 'index:KOSPI' -> 칸
  var latest = {}; // 'index:KOSPI' -> 마지막 항목 (차트 창 머리글에 씀)
  var fxRate = null, fxData = null;

  // ref: 자릿수 기준 값(등락폭은 가격 자릿수를 따른다)
  function tileFmt(kind, v, ref) {
    if (v == null) return '—';
    if (kind === 'cmdty') { var d = decFor(ref == null ? v : ref); return nf(v, d, d); }
    return nf(v, 2, 2);
  }
  function renderTiles(elId, kind, items) {
    var box = $(elId);
    if (box.querySelector('.skel')) box.innerHTML = '';
    (items || []).forEach(function (it) {
      var key = kind + ':' + it.code;
      latest[key] = it;
      var c = tiles[key];
      if (!c) {
        var card = document.createElement('div');
        card.className = 'card tile';
        card.innerHTML = '<div class="tile-top"><span class="tile-name"></span><em class="badge"></em></div>' +
          '<div class="tile-price"></div><div class="tile-chg"></div><div class="tile-time"></div>';
        box.appendChild(card);
        c = tiles[key] = {
          name: card.querySelector('.tile-name'), badge: card.querySelector('.badge'), price: card.querySelector('.tile-price'),
          chg: card.querySelector('.tile-chg'), time: card.querySelector('.tile-time'), last: null,
        };
        c.name.textContent = it.name;
        tappable(card, function () { openChart({ kind: kind, code: it.code }); });
      }
      if (kind === 'fx') {
        c.badge.style.display = 'none';
      } else {
        var open = it.status === 'OPEN';
        c.badge.className = 'badge ' + (open ? 'open' : 'close');
        c.badge.textContent = kind === 'cmdty' ? (open ? '거래중' : '마감') : open ? '장중' : '장마감';
      }
      var dir = c.last == null || it.price == null ? 0 : it.price - c.last;
      setFlash(c.price, tileFmt(kind, it.price), dir);
      c.last = it.price;
      c.chg.className = 'tile-chg ' + dirCls(it.change);
      c.chg.textContent = it.change == null ? '' : arrow(it.change) + tileFmt(kind, Math.abs(it.change), it.price) + ' (' + fmtPct(it.ratio) + ')';
      var t = it.tradedAt ? fmtTime(it.tradedAt) + ' 기준' : '';
      c.time.textContent = it.unit ? it.unit + (t ? ' · ' + t : '') : t;
    });
  }

  function loadIndices() {
    return getJSON('/api/indices').then(function (data) {
      if (data.fx && data.fx.rate) { fxRate = data.fx.rate; fxData = data.fx; renderFxNote(); }
      (data.items || []).forEach(function (it) { naverStatus[it.code] = it.status; });
      renderTiles('indices', 'index', data.items);
      renderTiles('fxs', 'fx', data.fxs);
      renderTiles('cmdty', 'cmdty', data.cmdty);
      renderHours();
      chartTick();
    }).catch(function (e) { console.warn('[indices]', e); });
  }

  /* ---------- 거래대금 상위 ---------- */
  var topMarket = 'kr';
  var topRows = {};
  var topData = { kr: null, us: null };

  function stockPrice(market, v) {
    if (v == null) return '—';
    return market === 'kr' ? nf(v, 0, 0) : '$' + nf(v, 2, 2);
  }
  function renderTop(data) {
    topData[data.market] = data;
    (data.items || []).forEach(function (s) { latest['stock:' + s.code] = Object.assign({ market: data.market }, s); });
    if (data.market !== topMarket) return;
    var items = data.items || [];
    var key = data.market + ':' + items.map(function (s) { return s.code; }).join(',');
    var rebuild = elTop.getAttribute('data-key') !== key;
    if (rebuild) {
      elTop.setAttribute('data-key', key);
      var frag = document.createDocumentFragment();
      items.forEach(function (s) {
        var rk = data.market + ':' + s.code;
        var r = topRows[rk];
        if (!r) {
          var li = document.createElement('li');
          li.className = 'st-row';
          li.innerHTML =
            '<span class="c-rank"></span>' +
            '<span class="c-name"><img alt="" width="34" height="34" loading="lazy"><span class="c-label"><b class="s-name"></b><span class="c-full"></span></span></span>' +
            '<span class="c-price"><b class="c-usd"></b><span class="s-mchg"></span></span>' +
            '<span class="s-chg"></span><span class="s-vol"></span><span class="s-val"></span>';
          var img = li.querySelector('img');
          if (s.logo) { img.src = s.logo; img.onerror = function () { img.style.visibility = 'hidden'; }; } else img.style.visibility = 'hidden';
          li.querySelector('.s-name').textContent = s.name;
          li.querySelector('.c-full').textContent = data.market === 'us' ? s.symbol + (s.exchange ? ' · ' + s.exchange : '') : s.symbol;
          r = topRows[rk] = {
            row: li, rank: li.querySelector('.c-rank'), price: li.querySelector('.c-usd'), mchg: li.querySelector('.s-mchg'),
            chg: li.querySelector('.s-chg'), vol: li.querySelector('.s-vol'), val: li.querySelector('.s-val'), last: null,
          };
          tappable(li, function () { openChart({ kind: 'stock', code: s.code }); });
        }
        frag.appendChild(r.row);
      });
      elTop.innerHTML = '';
      elTop.appendChild(frag);
    }
    items.forEach(function (s, i) {
      var r = topRows[data.market + ':' + s.code];
      r.rank.textContent = i + 1;
      setFlash(r.price, stockPrice(data.market, s.price), r.last == null ? 0 : s.price - r.last);
      r.last = s.price;
      var chgText = arrow(s.change) + stockPrice(data.market, Math.abs(s.change)).replace('$', '') + ' (' + fmtPct(s.ratio) + ')';
      r.chg.className = 's-chg ' + dirCls(s.change);
      r.chg.textContent = chgText;
      r.mchg.className = 's-mchg ' + dirCls(s.change);
      r.mchg.textContent = fmtPct(s.ratio);
      r.vol.textContent = s.volume == null ? '—' : s.volume.toLocaleString('ko-KR') + '주';
      // 넓은 화면은 '1조 5,360억원', 폰은 '1.5조'
      var cur = data.market === 'kr' ? '' : '$';
      var unit = data.market === 'kr' ? '원' : '';
      r.val.innerHTML = '';
      var vf = document.createElement('span');
      vf.className = 'v-full';
      vf.textContent = cur + fmtKor(s.value) + unit;
      var vs = document.createElement('span');
      vs.className = 'v-short';
      vs.textContent = cur + fmtKorShort(s.value);
      r.val.appendChild(vf);
      r.val.appendChild(vs);
      if (data.market === 'us') {
        if (s.valueKrw) {
          var sm = document.createElement('small');
          sm.textContent = '≈ ' + s.valueKrw;
          r.val.appendChild(sm);
        }
      }
    });
    var first = items[0];
    var note = '';
    if (first && first.status !== 'OPEN') note = (data.market === 'kr' ? '국내장' : '미국장') + ' 마감 · 마지막 거래일 기준 (' + fmtTime(first.tradedAt) + ')';
    $('top-note').textContent = note;
  }
  function loadTop() {
    var m = topMarket;
    return getJSON('/api/top?market=' + m).then(renderTop).catch(function (e) { console.warn('[top]', e); });
  }
  slideSeg($('top-seg'), function (b) {
    topMarket = b.getAttribute('data-market');
    elTop.setAttribute('data-key', '');
    if (topData[topMarket]) renderTop(topData[topMarket]);
    else elTop.innerHTML = '';
    loadTop();
  });

  /* ---------- 13F 매수 종목 ---------- */
  var f13Cache = {};
  var f13Key = 'buffett';
  function titleCase(s) {
    return String(s || '').toLowerCase().replace(/\b([a-z])/g, function (m) { return m.toUpperCase(); })
      .replace(/\b(Inc|Corp|Co|Ltd|Plc|Hldgs|Hldg|Grp|Sa|Nv|Ag|Se|Lp|Llc|Adr|Etf)\b/g, function (m) { return m.length <= 3 ? m.toUpperCase().replace('INC', 'Inc').replace('LTD', 'Ltd') : m; });
  }
  function fmtUsdKor(n) { return '$' + fmtKorShort(n); }
  function render13f(d) {
    if (d.key !== f13Key) return;
    var q = d.report ? d.report.slice(0, 4) + '년 ' + Math.ceil(+d.report.slice(5, 7) / 3) + '분기' : '';
    $('f13-info').innerHTML = '';
    var b = document.createElement('b');
    b.textContent = d.who + ' · ' + d.fund;
    $('f13-info').appendChild(b);
    $('f13-info').appendChild(document.createTextNode(' — ' + q + ' 보고서 (' + d.report + ' 기준, ' + d.filed + ' 제출) · 보유 ' + d.holdings + '종목 · ' + fmtUsdKor(d.total) + ' · 매수 ' + d.buyCount + '종목'));
    var el = $('f13');
    el.innerHTML = '';
    var names = {};
    d.buys.forEach(function (x) { names[x.name] = (names[x.name] || 0) + 1; });
    if (!d.buys.length) {
      var e = document.createElement('li');
      e.className = 'f-row';
      e.textContent = '이번 보고서에서 새로 사거나 늘린 종목이 없어요.';
      el.appendChild(e);
      return;
    }
    d.buys.forEach(function (x, i) {
      var li = document.createElement('li');
      li.className = 'f-row';
      li.innerHTML = '<span class="c-rank"></span><span class="c-name"><span class="c-label"><b class="s-name"></b><span class="f-sub"></span></span></span><span class="f-amt"></span><span class="f-wt"></span>';
      li.querySelector('.c-rank').textContent = i + 1;
      var nm = titleCase(x.name);
      if (names[x.name] > 1 && x.cls) nm += ' (' + x.cls.replace(/^CAP STK |^COM /, '').trim() + ')'; // 알파벳 A·C 처럼 같은 회사 두 종류
      li.querySelector('.s-name').textContent = nm;
      li.title = x.name + ' · ' + x.cls + ' · CUSIP ' + x.cusip;
      var sub = li.querySelector('.f-sub');
      sub.className = 'f-sub ' + x.type;
      sub.textContent = x.type === 'new' ? '신규 매수' : '+' + Math.round(x.changePct).toLocaleString('ko-KR') + '% 늘림';
      li.querySelector('.f-amt').textContent = fmtUsdKor(x.bought);
      li.querySelector('.f-wt').textContent = x.weight.toFixed(1) + '%';
      el.appendChild(li);
    });
  }
  function load13f() {
    var k = f13Key;
    if (f13Cache[k]) { render13f(f13Cache[k]); return; }
    $('f13-info').textContent = '불러오는 중…';
    $('f13').innerHTML = '';
    getJSON('/api/13f?m=' + k).then(function (d) {
      f13Cache[k] = d;
      render13f(d);
    }).catch(function () { if (f13Key === k) $('f13-info').textContent = 'SEC 자료를 불러오지 못했어요. 잠시 뒤 다시 눌러 주세요.'; });
  }
  slideSeg($('f13-seg'), function (b) { f13Key = b.getAttribute('data-m'); load13f(); });

  /* ---------- 코인 ---------- */
  var coins = [];            // 순위 순서
  var byId = {};             // id -> coin
  var rows = {};             // id -> 줄
  var pairOf = {};           // id -> 'BTCUSDT'
  var idOfPair = {};         // 'BTCUSDT' -> id
  var binancePrices = null;  // 바이낸스 거래쌍 확인용
  var ws = null, wsKey = '', wsHost = 0, wsRetry = 0, wsTimer = null;
  var upbitSet = null, upbitKrw = {}, usdtKrw = null;
  var up = null, upKey = '', upRetry = 0, upTimer = null;
  var dirty = {}, rafOn = false;

  function renderFxNote() {
    var h = '';
    if (fxData && fxData.rate) h += '원/달러 <b>' + nf(fxData.rate, 2, 2) + '</b> <span class="' + dirCls(fxData.change) + '">' + fmtPct(fxData.ratio) + '</span>';
    if (usdtKrw) h += (h ? ' · ' : '') + '업비트 USDT <b>₩' + nf(usdtKrw, 0, 2) + '</b>';
    if (h) elFx.innerHTML = h;
  }

  // 원화: 업비트 원화 시세 그대로. 업비트에 없으면 ≈ 달러 × 업비트 USDT (그것도 없으면 네이버 환율)
  function krwText(c) {
    var rate = usdtKrw || fxRate;
    var k = upbitKrw[c.symbol];
    if (c.symbol === 'USDT' && usdtKrw) k = usdtKrw;
    if (k && rate && c.price && Math.abs(k - c.price * rate) / (c.price * rate) > 0.3) k = null; // 같은 심볼 다른 코인
    if (k) return fmtKRW(k);
    if (rate && c.price) return '≈ ' + fmtKRW(c.price * rate);
    return '';
  }

  function buildRows() {
    var key = coins.map(function (c) { return c.id; }).join(',');
    if (elCoins.getAttribute('data-key') === key) return;
    elCoins.setAttribute('data-key', key);
    var frag = document.createDocumentFragment();
    coins.forEach(function (c) {
      var r = rows[c.id];
      if (!r) {
        var li = document.createElement('li');
        li.className = 'coin-row';
        li.innerHTML =
          '<span class="c-rank"></span>' +
          '<span class="c-name"><img alt="" width="34" height="34" loading="lazy"><span class="c-label"><b class="c-sym"></b><span class="c-full"></span></span></span>' +
          '<span class="c-price"><b class="c-usd"></b><span class="c-krw"></span></span>' +
          '<span class="c-chg"></span><span class="c-cap"></span>';
        li.querySelector('img').src = c.image || '';
        li.querySelector('.c-sym').textContent = c.symbol;
        li.querySelector('.c-full').textContent = c.name;
        r = rows[c.id] = {
          row: li, rank: li.querySelector('.c-rank'), usd: li.querySelector('.c-usd'), krw: li.querySelector('.c-krw'),
          chg: li.querySelector('.c-chg'), cap: li.querySelector('.c-cap'), last: null,
        };
        var id = c.id;
        tappable(li, function () { openChart({ kind: 'coin', code: id }); });
      }
      frag.appendChild(r.row);
    });
    elCoins.innerHTML = '';
    elCoins.appendChild(frag);
  }

  function renderCoin(id) {
    var c = byId[id], r = rows[id];
    if (!c || !r) return;
    r.rank.textContent = c.rank || '';
    setFlash(r.usd, fmtUSD(c.price), r.last == null ? 0 : c.price - r.last);
    r.last = c.price;
    r.krw.textContent = krwText(c);
    r.chg.className = 'c-chg ' + dirCls(c.change24h);
    r.chg.textContent = fmtPct(c.change24h);
    r.cap.innerHTML = '';
    r.cap.appendChild(document.createTextNode(fmtCap(c.marketCap)));
    var b = document.createElement('em');
    b.className = 'badge c-src ' + (c.live ? 'live' : 'slow');
    b.textContent = c.live ? '실시간' : '1분';
    r.cap.appendChild(b);
  }

  function schedule() {
    if (rafOn) return;
    rafOn = true;
    requestAnimationFrame(function () {
      rafOn = false;
      var ids = Object.keys(dirty);
      dirty = {};
      ids.forEach(renderCoin);
      if (chart && chart.kind === 'coin' && ids.indexOf(chart.code) >= 0) chartTick();
    });
  }

  // 바이낸스에 USDT 거래쌍이 있고 가격이 코인게코와 5% 안쪽이면 실시간 대상(같은 심볼 다른 코인 걸러냄)
  function mapPairs() {
    pairOf = {}; idOfPair = {};
    if (!binancePrices) return;
    coins.forEach(function (c) {
      if (c.symbol === 'USDT') return;
      var p = c.symbol + 'USDT';
      var bp = binancePrices[p];
      if (bp && c.price && Math.abs(bp - c.price) / c.price < 0.05) { pairOf[c.id] = p; idOfPair[p] = c.id; }
    });
  }
  function loadBinanceList(i) {
    i = i || 0;
    if (i >= REST_HOSTS.length) return Promise.resolve(null);
    return getJSON(REST_HOSTS[i] + '/api/v3/ticker/price').then(function (list) {
      var m = {};
      list.forEach(function (t) { m[t.symbol] = +t.price; });
      return m;
    }).catch(function () { return loadBinanceList(i + 1); });
  }

  // 코인게코는 클라우드플레어 서버 IP 를 자주 막는다(429) → 방문자 브라우저가 직접 받고, 안 되면 Worker 로
  function fetchCoinList() {
    return getJSON(CG + '/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=20&page=1&price_change_percentage=24h').then(function (list) {
      if (!Array.isArray(list) || !list.length) throw new Error('coingecko empty');
      return {
        coins: list.map(function (c) {
          return {
            id: c.id, rank: c.market_cap_rank, symbol: String(c.symbol || '').toUpperCase(), name: c.name,
            image: c.image, price: c.current_price, change24h: c.price_change_percentage_24h, marketCap: c.market_cap,
          };
        }),
      };
    }).catch(function () { return getJSON('/api/coins'); });
  }

  function loadCoins() {
    return fetchCoinList().then(function (data) {
      var list = data.coins || [];
      if (!list.length) return;
      var prev = byId;
      byId = {};
      coins = list.map(function (c) {
        var old = prev[c.id];
        // 실시간으로 받고 있던 코인은 웹소켓 가격을 유지하고 순위·시총만 바꾼다
        if (old && old.live && old.liveAt && Date.now() - old.liveAt < 15000) {
          c.price = old.price;
          c.change24h = old.change24h;
          c.liveAt = old.liveAt;
        }
        c.live = !!(old && old.live && pairOf[c.id]);
        byId[c.id] = c;
        dirty[c.id] = true;
        return c;
      });
      buildRows();   // 표는 코인게코 값으로 바로 그리고, 실시간은 뒤따라 붙인다
      schedule();
      loadUpbitSet().then(connectUpbit);
      return (binancePrices ? Promise.resolve(binancePrices) : loadBinanceList()).then(function (m) {
        binancePrices = m;
        mapPairs();
        connectWS();
      });
    }).catch(function (e) {
      console.warn('[coins]', e);
      if (!coins.length) setConn('off', '불러오기 실패 · 재시도 중');
    });
  }

  /* 바이낸스 웹소켓 (달러 실시간) */
  function connectWS() {
    var pairs = Object.keys(idOfPair).sort();
    if (!pairs.length) { setConn('wait', '1분마다 갱신'); return; }
    var key = pairs.join(',');
    if (ws && wsKey === key && ws.readyState <= 1) return;
    closeWS();
    wsKey = key;
    var url = WS_HOSTS[wsHost] + pairs.map(function (p) { return p.toLowerCase() + '@miniTicker'; }).join('/');
    var sock;
    try { sock = new WebSocket(url); } catch (e) { return retryWS(); }
    ws = sock;
    setConn('wait', '실시간 연결 중');
    sock.onopen = function () { if (ws !== sock) return; wsRetry = 0; setConn('live', '실시간'); };
    sock.onmessage = function (ev) {
      var msg;
      try { msg = JSON.parse(ev.data); } catch (e) { return; }
      var d = msg && msg.data;
      if (!d || !d.s) return;
      var id = idOfPair[d.s];
      var c = id && byId[id];
      if (!c) return;
      var price = +d.c, open = +d.o;
      if (!price) return;
      c.price = price;
      if (open) c.change24h = (price - open) / open * 100;
      c.live = true;
      c.liveAt = Date.now();
      dirty[id] = true;
      schedule();
    };
    sock.onclose = function () {
      if (ws !== sock) return;
      ws = null;
      coins.forEach(function (c) { if (c.live) { c.live = false; dirty[c.id] = true; } });
      schedule();
      retryWS();
    };
    sock.onerror = function () { try { sock.close(); } catch (e) {} };
  }
  function closeWS() {
    clearTimeout(wsTimer);
    if (ws) { var s = ws; ws = null; try { s.close(); } catch (e) {} }
  }
  function retryWS() {
    clearTimeout(wsTimer);
    wsRetry++;
    if (wsRetry % 2 === 0) wsHost = (wsHost + 1) % WS_HOSTS.length; // 두 번 실패하면 다른 주소로
    setConn('off', '재연결 중');
    wsKey = '';
    wsTimer = setTimeout(connectWS, Math.min(30000, 1000 * Math.pow(2, Math.min(wsRetry, 5))));
  }

  /* 업비트 웹소켓 (원화 실시간) */
  function loadUpbitSet() {
    if (upbitSet) return Promise.resolve(upbitSet);
    return getJSON('https://api.upbit.com/v1/market/all').then(function (list) {
      upbitSet = {};
      list.forEach(function (m) { if (m.market.indexOf('KRW-') === 0) upbitSet[m.market.slice(4)] = true; });
      return upbitSet;
    }).catch(function () { return null; });
  }
  function connectUpbit() {
    var codes = ['KRW-USDT'];
    if (upbitSet) coins.forEach(function (c) { if (c.symbol !== 'USDT' && upbitSet[c.symbol]) codes.push('KRW-' + c.symbol); });
    codes.sort();
    var key = codes.join(',');
    if (up && upKey === key && up.readyState <= 1) return;
    closeUpbit();
    upKey = key;
    var sock;
    try { sock = new WebSocket(UPBIT_WS); } catch (e) { return retryUpbit(); }
    sock.binaryType = 'arraybuffer';
    up = sock;
    var dec = typeof TextDecoder !== 'undefined' ? new TextDecoder() : null;
    sock.onopen = function () {
      if (up !== sock) return;
      upRetry = 0;
      sock.send(JSON.stringify([{ ticket: 'pan-' + Date.now() }, { type: 'ticker', codes: codes }, { format: 'SIMPLE' }]));
    };
    sock.onmessage = function (ev) {
      var t = typeof ev.data === 'string' ? ev.data : dec ? dec.decode(ev.data) : '';
      var d;
      try { d = JSON.parse(t); } catch (e) { return; }
      if (!d || !d.cd || !d.tp) return;
      var sym = d.cd.slice(4);
      if (sym === 'USDT') {
        usdtKrw = d.tp;
        coins.forEach(function (c) { dirty[c.id] = true; });
        renderFxNote();
      } else {
        upbitKrw[sym] = d.tp;
        coins.forEach(function (c) { if (c.symbol === sym) dirty[c.id] = true; });
      }
      schedule();
    };
    sock.onclose = function () { if (up !== sock) return; up = null; retryUpbit(); };
    sock.onerror = function () { try { sock.close(); } catch (e) {} };
  }
  function closeUpbit() {
    clearTimeout(upTimer);
    if (up) { var s = up; up = null; try { s.close(); } catch (e) {} }
  }
  function retryUpbit() {
    clearTimeout(upTimer);
    upRetry++;
    upKey = '';
    upTimer = setTimeout(connectUpbit, Math.min(30000, 1000 * Math.pow(2, Math.min(upRetry, 5))));
  }

  /* ---------- 차트 창 ---------- */
  var sheet = $('sheet');
  var cv = $('ch-canvas');
  var plot = $('ch-plot');
  var tip = $('ch-tip');
  var chart = null;      // { kind, code, range, points, note, hover }
  var chartCache = {};   // key -> { at, data }
  var lastFocus = null;

  var rangeSeg = slideSeg($('ch-seg'), function (b) { if (chart) loadChart(b.getAttribute('data-range')); });

  // 지금 값(머리글): 종류마다 다른 곳에서 가져온다
  function chartInfo() {
    var k = chart.kind, code = chart.code;
    if (k === 'coin') {
      var c = byId[code];
      if (!c) return null;
      return { name: c.name, sub: c.symbol + ' · 코인 · 달러 실시간 ' + (c.live ? '바이낸스' : '코인게코'), icon: c.image, price: c.price, text: fmtUSD(c.price), krw: krwText(c), change: c.change24h, chgText: '24시간 ' + fmtPct(c.change24h), fmt: fmtUSD };
    }
    var it = latest[k + ':' + code];
    if (!it) return null;
    var f;
    if (k === 'stock') {
      var m = it.market;
      f = function (v) { return stockPrice(m, v) + (m === 'kr' ? '원' : ''); };
      return { name: it.name, sub: (m === 'kr' ? '국내 주식 · ' : '미국 주식 · ') + it.symbol, icon: it.logo, price: it.price, text: f(it.price), krw: m === 'us' && fxRate ? '≈ ' + fmtKRW(it.price * fxRate) : '', change: it.ratio, chgText: arrow(it.change) + stockPrice(m, Math.abs(it.change)).replace('$', '') + ' (' + fmtPct(it.ratio) + ')', fmt: f };
    }
    f = function (v) { return tileFmt(k, v, it.price); };
    var sub = k === 'index' ? '지수' : k === 'fx' ? '환율 · ' + it.unit : '원자재 · ' + it.unit + ' · 약 10분 지연';
    return { name: it.name, sub: sub, icon: null, price: it.price, text: f(it.price), krw: '', change: it.change, chgText: arrow(it.change) + f(Math.abs(it.change)) + ' (' + fmtPct(it.ratio) + ')', fmt: f };
  }

  function renderSheetHead() {
    var info = chartInfo();
    if (!info) return null;
    $('ch-name').textContent = info.name;
    $('ch-sub').textContent = info.sub;
    var ic = $('ch-icon');
    if (info.icon) { ic.src = info.icon; ic.hidden = false; } else ic.hidden = true;
    setFlash($('ch-price'), info.text, chart.lastPrice == null ? 0 : info.price - chart.lastPrice);
    chart.lastPrice = info.price;
    $('ch-krw').textContent = info.krw;
    var chg = $('ch-chg');
    chg.className = dirCls(info.change);
    chg.textContent = info.chgText;
    return info;
  }

  function openChart(desc) {
    lastFocus = document.activeElement;
    // 미국 지수·종목은 네이버가 하루(분 단위) 차트를 주지 않아 1주부터 보여준다
    var us = (desc.kind === 'index' && desc.code.charAt(0) === '.') || (desc.kind === 'stock' && !/^\d{6}$/.test(desc.code));
    var range = us ? '1w' : '1d';
    chart = { kind: desc.kind, code: desc.code, range: range, points: [], lastPrice: null };
    $('ch-price').textContent = '';
    if (!renderSheetHead()) return;
    sheet.hidden = false;
    document.body.classList.add('lock');
    rangeSeg.pick(function (b) { return b.getAttribute('data-range') === range; });
    $('ch-seg').querySelector('button.on').focus({ preventScroll: true });
    loadChart(range);
  }
  function closeChart() {
    sheet.hidden = true;
    document.body.classList.remove('lock');
    chart = null;
    tip.hidden = true;
    if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
  }
  sheet.addEventListener('click', function (e) { if (e.target.closest('[data-close]')) closeChart(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && chart) closeChart(); });

  var KLINE = { '1d': ['5m', 288], '1w': ['1h', 168], '1m': ['4h', 180], '1y': ['1d', 365] };
  var CG_DAYS = { '1d': 1, '1w': 7, '1m': 30, '1y': 365 };

  function fetchSeries(kind, code, range) {
    if (kind === 'coin') {
      var pair = pairOf[code];
      if (pair) {
        var k = KLINE[range];
        return getJSON(REST_HOSTS[0] + '/api/v3/klines?symbol=' + pair + '&interval=' + k[0] + '&limit=' + k[1]).then(function (list) {
          return { points: list.map(function (x) { return { t: fmtTs(x[0], range === '1y'), v: +x[4] }; }) };
        });
      }
      return getJSON(CG + '/coins/' + encodeURIComponent(code) + '/market_chart?vs_currency=usd&days=' + CG_DAYS[range]).then(function (j) {
        return { points: (j.prices || []).map(function (x) { return { t: fmtTs(x[0], range === '1y'), v: x[1] }; }) };
      });
    }
    return getJSON('/api/chart?kind=' + kind + '&code=' + encodeURIComponent(code) + '&range=' + range);
  }

  function loadChart(range) {
    if (!chart) return;
    chart.range = range;
    chart.hover = null;
    tip.hidden = true;
    var key = chart.kind + ':' + chart.code + ':' + range;
    var hit = chartCache[key];
    var ttl = range === '1d' ? 30000 : 300000;
    if (hit && Date.now() - hit.at < ttl) { applySeries(hit.data); return; }
    $('ch-msg').textContent = '차트를 불러오는 중…';
    chart.points = [];
    drawChart();
    var me = chart;
    fetchSeries(chart.kind, chart.code, range).then(function (data) {
      chartCache[key] = { at: Date.now(), data: data };
      if (chart === me && chart.range === range) applySeries(data);
    }).catch(function () {
      if (chart === me && chart.range === range) { $('ch-msg').textContent = '차트를 불러오지 못했어요. 잠시 뒤 다시 눌러 주세요.'; }
    });
  }
  function applySeries(data) {
    chart.points = (data.points || []).map(function (p) { return { t: p.t, v: p.v }; });
    chart.note = data.note || '';
    $('ch-msg').textContent = chart.points.length < 2 ? chart.note || '표시할 차트 자료가 없어요.' : '';
    chartTick(true);
  }

  // 새 시세가 들어오면 머리글을 고치고, 1일 차트는 마지막 점을 지금 값으로
  function chartTick(force) {
    if (!chart) return;
    var info = renderSheetHead();
    if (info && chart.range === '1d' && chart.points.length > 1 && info.price != null && chart.kind === 'coin') {
      chart.points[chart.points.length - 1].v = info.price;
      force = true;
    }
    if (force) { renderStats(info); drawChart(); }
  }
  function renderStats(info) {
    var p = chart.points;
    var f = (info && info.fmt) || function (v) { return nf(v, 2, 2); };
    if (p.length < 2) { $('st-high').textContent = $('st-low').textContent = $('st-chg').textContent = '—'; return; }
    var hi = -Infinity, lo = Infinity;
    p.forEach(function (x) { if (x.v > hi) hi = x.v; if (x.v < lo) lo = x.v; });
    $('st-high').textContent = f(hi);
    $('st-low').textContent = f(lo);
    var ch = (p[p.length - 1].v - p[0].v) / p[0].v * 100;
    var el = $('st-chg');
    el.className = dirCls(ch);
    el.textContent = fmtPct(ch);
  }

  function cssVar(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
  var PAD = { l: 6, r: 70, t: 34, b: 28 };

  function drawChart() {
    var w = plot.clientWidth, h = plot.clientHeight;
    if (!w || !h) return;
    var dpr = window.devicePixelRatio || 1;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
    var ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    var p = chart ? chart.points : [];
    if (p.length < 2) return;
    var info = chartInfo();
    var f = (info && info.fmt) || function (v) { return nf(v, 2, 2); };
    var hi = -Infinity, lo = Infinity;
    p.forEach(function (x) { if (x.v > hi) hi = x.v; if (x.v < lo) lo = x.v; });
    if (hi === lo) { hi += Math.abs(hi) * 0.001 || 1; lo -= Math.abs(lo) * 0.001 || 1; }
    var span = hi - lo;
    hi += span * 0.08; lo -= span * 0.08;
    // 오른쪽 눈금 글자: 1,000 넘으면 소수점 버림, 통화 기호·'원' 뺌. 가장 긴 글자 폭만큼 자리 확보
    var axis = function (v) {
      var s = Math.abs(v) >= 1000 ? nf(v, 0, 0) : f(v);
      return String(s).replace(/[$원]/g, '');
    };
    ctx.font = '13px ' + cssVar('--font');
    var labW = 0;
    for (var g0 = 0; g0 <= 4; g0++) labW = Math.max(labW, ctx.measureText(axis(lo + (hi - lo) * g0 / 4)).width);
    var X0 = PAD.l, X1 = w - Math.ceil(labW) - 14, Y0 = PAD.t, Y1 = h - PAD.b;
    chart.plotW = X1 - X0;
    var x = function (i) { return X0 + (X1 - X0) * i / (p.length - 1); };
    var y = function (v) { return Y1 - (Y1 - Y0) * (v - lo) / (hi - lo); };
    var upc = p[p.length - 1].v >= p[0].v;
    var col = upc ? cssVar('--up') : cssVar('--down');
    var font = cssVar('--font');

    // 가로 눈금 + 오른쪽 가격
    ctx.font = '13px ' + font;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    for (var g = 0; g <= 4; g++) {
      var gv = lo + (hi - lo) * g / 4;
      var gy = y(gv);
      ctx.strokeStyle = cssVar('--line');
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(X0, Math.round(gy) + 0.5); ctx.lineTo(X1, Math.round(gy) + 0.5); ctx.stroke();
      ctx.fillStyle = cssVar('--sub');
      ctx.fillText(axis(gv), X1 + 8, gy);
    }
    // 시작 값 점선
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(107,118,132,.5)';
    ctx.beginPath(); ctx.moveTo(X0, y(p[0].v)); ctx.lineTo(X1, y(p[0].v)); ctx.stroke();
    ctx.setLineDash([]);

    // 면 + 선
    var grad = ctx.createLinearGradient(0, Y0, 0, Y1);
    grad.addColorStop(0, upc ? 'rgba(228,41,57,.18)' : 'rgba(27,100,218,.18)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.beginPath();
    p.forEach(function (pt, i) { if (i) ctx.lineTo(x(i), y(pt.v)); else ctx.moveTo(x(i), y(pt.v)); });
    ctx.lineTo(X1, Y1); ctx.lineTo(X0, Y1); ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.beginPath();
    p.forEach(function (pt, i) { if (i) ctx.lineTo(x(i), y(pt.v)); else ctx.moveTo(x(i), y(pt.v)); });
    ctx.strokeStyle = col;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // 아래 날짜
    ctx.fillStyle = cssVar('--sub');
    ctx.textBaseline = 'top';
    var nLab = w < 420 ? 3 : 4;
    for (var j = 0; j < nLab; j++) {
      var idx = Math.round((p.length - 1) * j / (nLab - 1));
      ctx.textAlign = j === 0 ? 'left' : j === nLab - 1 ? 'right' : 'center';
      ctx.fillText(p[idx].t, x(idx), Y1 + 8);
    }

    // 마지막 점
    var lx = x(p.length - 1), ly = y(p[p.length - 1].v);
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(lx, ly, 4, 0, Math.PI * 2); ctx.fill();

    // 누르고 있는 곳
    if (chart.hover != null) {
      var hi2 = chart.hover, hx = x(hi2), hy = y(p[hi2].v);
      ctx.strokeStyle = cssVar('--dark');
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(Math.round(hx) + 0.5, Y0 - 6); ctx.lineTo(Math.round(hx) + 0.5, Y1); ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.strokeStyle = col;
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(hx, hy, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      tip.querySelector('b').textContent = f(p[hi2].v);
      tip.querySelector('span').textContent = p[hi2].t;
      tip.hidden = false;
      var tw = tip.offsetWidth / 2;
      tip.style.left = Math.max(tw, Math.min(w - tw, hx)) + 'px';
    } else tip.hidden = true;
  }

  function hoverAt(clientX) {
    if (!chart || chart.points.length < 2) return;
    var r = cv.getBoundingClientRect();
    var t = (clientX - r.left - PAD.l) / (chart.plotW || (r.width - PAD.l - PAD.r));
    chart.hover = Math.max(0, Math.min(chart.points.length - 1, Math.round(t * (chart.points.length - 1))));
    drawChart();
  }
  cv.addEventListener('pointermove', function (e) { hoverAt(e.clientX); });
  cv.addEventListener('pointerdown', function (e) { hoverAt(e.clientX); });
  cv.addEventListener('pointerleave', function () { if (chart) { chart.hover = null; drawChart(); } });
  if (window.ResizeObserver) new ResizeObserver(function () { if (chart) drawChart(); }).observe(plot);

  /* ---------- 주기 갱신 (탭을 안 볼 때는 쉰다) ---------- */
  var timers = [];
  function start() {
    stop();
    loadIndices();
    loadTop();
    loadCoins();
    timers.push(setInterval(loadIndices, INDEX_EVERY));
    timers.push(setInterval(loadTop, TOP_EVERY));
    timers.push(setInterval(loadCoins, COINS_EVERY));
    timers.push(setInterval(renderHours, 30000));
  }
  function stop() {
    timers.forEach(clearInterval);
    timers = [];
  }
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) stop();
    else start();
  });

  renderHours();
  start();
  load13f();
})();
