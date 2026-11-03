/* xip — 실시간 시세
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
  // 15초 안에 답이 없으면 실패로 본다(멈춘 채 기다리지 않게)
  function getJSON(url, ms) {
    var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var t = ctl && setTimeout(function () { ctl.abort(); }, ms || 15000);
    return fetch(url, { cache: 'no-store', signal: ctl ? ctl.signal : undefined }).then(function (r) {
      if (!r.ok) throw new Error(url + ' ' + r.status);
      return r.json();
    }).finally(function () { if (t) clearTimeout(t); });
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
  // 그 거래소 현지 날짜 'YYYY-MM-DD' (+d 일)
  function zoneDate(tz, d) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(Date.now() + (d || 0) * 864e5));
  }
  // 평일·휴장일을 따져 지금 장중인지, 마감/다음 개장까지 몇 분인지
  // hol: { 'YYYY-MM-DD': 이름 }, early: { 'YYYY-MM-DD': 이름 } (조기폐장 13:00)
  function session(tz, open, close, hol, early) {
    hol = hol || {}; early = early || {};
    var n = zoneNow(tz);
    var today = zoneDate(tz, 0);
    var trading = function (wd, date) { return wd >= 1 && wd <= 5 && !hol[date]; };
    var cl = early[today] ? 780 : close;
    if (trading(n.wd, today) && n.min >= open && n.min < cl) return { open: true, left: cl - n.min, early: early[today] || null, close: cl };
    if (trading(n.wd, today) && n.min < open) return { open: false, left: open - n.min, next: today, early: early[today] || null };
    for (var d = 1; d <= 14; d++) {
      var w = (n.wd + d) % 7, date = zoneDate(tz, d);
      if (trading(w, date)) return { open: false, left: d * 1440 - n.min + open, next: date, holidayToday: hol[today] || null };
    }
    return { open: false, left: 0 };
  }
  var WDK = ['일', '월', '화', '수', '목', '금', '토'];
  function mdw(date) {
    var d = new Date(date + 'T12:00:00Z');
    return (d.getUTCMonth() + 1) + '/' + d.getUTCDate() + '(' + WDK[d.getUTCDay()] + ')';
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
  var naverStatus = {}; // KOSPI / .INX 의 네이버 장 상태(목록에 없는 임시 휴장 판단용)
  var market = null;    // /api/market : 휴장일·조기폐장·서킷브레이커
  function toMap(list) { var m = {}; (list || []).forEach(function (h) { m[h.date] = h.name; }); return m; }
  function renderHours() {
    var off = nyOffsetMin(); // EST -300, EDT -240
    var diff = 540 - off;    // 한국 - 뉴욕 (분)
    var conf = [
      { id: 'hr-kr', tz: 'Asia/Seoul', open: 540, close: 930, nv: 'KOSPI', key: 'kr' },
      { id: 'hr-us', tz: 'America/New_York', open: 570, close: 960, nv: '.INX', key: 'us' },
    ];
    conf.forEach(function (h) {
      var box = $(h.id);
      var mk = market && market[h.key];
      var hol = toMap(mk && mk.holidays), early = toMap(mk && mk.early);
      var s = session(h.tz, h.open, h.close, hol, early);
      var st = box.querySelector('[data-st]');
      var left = box.querySelector('[data-left]');
      var holEl = box.querySelector('[data-hol]');
      var today = zoneDate(h.tz, 0);
      var ns = naverStatus[h.nv];
      // 목록에 없는 임시 휴장: 장 시간인데 네이버가 계속 '마감'이면
      var adhoc = s.open && ns && ns !== 'OPEN';
      var holName = hol[today] || null;
      var kst = function (min) { return h.key === 'us' ? ' (한국 ' + hm(min + diff) + ')' : ''; };
      var closedToday = holName || adhoc;
      st.className = 'badge ' + (s.open && !adhoc ? 'open' : 'close');
      st.textContent = closedToday ? '휴장' : s.open ? '장중' : '장마감';
      if (holName) left.textContent = '오늘은 ' + holName + ' — 휴장 · 다음 개장 ' + mdw(s.next) + ' ' + hm(h.open) + kst(h.open);
      else if (adhoc) left.textContent = '오늘은 휴장이에요 (거래소 임시 휴장)';
      else if (s.open) left.textContent = '마감까지 ' + fmtLeft(s.left) + (s.early ? ' · 오늘은 ' + s.early + ' 조기 폐장 13:00' + kst(780) : '');
      else left.textContent = '개장까지 ' + fmtLeft(s.left) + (s.next && s.next !== today ? ' · ' + mdw(s.next) + ' 개장' : '');
      // 다음 휴장일
      var up = (mk && mk.holidays || []).filter(function (x) { return x.date > today; }).sort(function (a, b) { return a.date < b.date ? -1 : 1; })[0];
      var ne = (mk && mk.early || []).filter(function (x) { return x.date >= today; }).sort(function (a, b) { return a.date < b.date ? -1 : 1; })[0];
      var t = up ? '다음 휴장 ' + mdw(up.date) + ' ' + up.name : '';
      if (ne && (!up || ne.date < up.date) && ne.date !== today) t += (t ? ' · ' : '') + mdw(ne.date) + ' 조기 폐장';
      holEl.textContent = t;
      renderCB(box.querySelector('[data-cb]'), h.key, diff);
    });
    $('hr-us').querySelector('[data-kst]').textContent = hm(570 + diff) + ' ~ ' + hm(960 + diff);
    $('hr-us').querySelector('[data-dst]').textContent = off === -240 ? '서머타임 적용 중' : '서머타임 아님';
  }

  // 서킷브레이커: 발동 시각 · 매매 정지 · (단일가) · 재개 시각과 지금 상태
  function renderCB(el, key, diff) {
    var list = (market && market.cb || []).filter(function (e) { return e.market === key; });
    if (!list.length) { el.hidden = true; el.innerHTML = ''; return; }
    var e = list[list.length - 1]; // 가장 높은 단계
    var now = key === 'us' ? zoneNow('America/New_York').min : zoneNow('Asia/Seoul').min;
    var toMin = function (t) { var a = t.split(':'); return +a[0] * 60 + +a[1]; };
    var k = function (t) { return key === 'us' ? t + ' (한국 ' + hm(toMin(t) + diff) + ')' : t; };
    var state;
    if (!e.resume) state = '오늘 장 종료';
    else if (now < toMin(e.haltEnd)) state = '지금 매매 정지 중 · 재개까지 ' + fmtLeft(toMin(e.resume) - now);
    else if (e.auctionEnd && now < toMin(e.auctionEnd)) state = '지금 단일가 매매 중 · 재개까지 ' + fmtLeft(toMin(e.resume) - now);
    else state = '거래 재개됨';
    var lines = [
      '<b>⚠ 서킷브레이커 ' + e.level + '단계 발동</b> — ' + e.index + ' 전일 대비 −' + e.pct + '%' + (key === 'us' ? ' (뉴욕시간)' : ''),
      '발동 ' + k(e.at) + (e.resume
        ? ' · 매매 정지 ' + e.at + '~' + e.haltEnd + (e.auctionEnd ? ' · 단일가 ' + e.haltEnd + '~' + e.auctionEnd : '') + ' · 재개 ' + k(e.resume)
        : ' · 그대로 장 마감'),
      '<span class="cb-now">' + state + '</span>',
    ];
    if (list.length > 1) lines.push('<small>이전 단계: ' + list.slice(0, -1).map(function (x) { return x.level + '단계 ' + x.at; }).join(', ') + '</small>');
    el.innerHTML = lines.join('<br>');
    el.hidden = false;
  }
  function applyMarket(d) {
    if (!d) return;
    if (/[?&]cbtest=1/.test(location.search)) { // 화면 확인용 가짜 발동
      d.cb = [
        { market: 'kr', index: '코스피', level: 1, pct: 8, at: '10:12', haltEnd: '10:32', auctionEnd: '10:42', resume: '10:42' },
        { market: 'us', index: 'S&P 500', level: 1, pct: 7, at: '09:58', haltEnd: '10:13', resume: '10:13' },
      ];
    }
    market = d;
    renderHours();
  }
  function loadMarket() {
    return getJSON('/api/market').then(applyMarket).catch(function (e) { console.warn('[market]', e); });
  }

  /* ---------- 아이콘 (국기·원소 기호 등, 직접 그린 SVG) ---------- */
  var SVG = function (body) { return '<svg viewBox="0 0 24 24" aria-hidden="true">' + body + '</svg>'; };
  var FLAG = {
    kr: SVG('<rect width="24" height="24" fill="#fff"/><path d="M3.5 12a8.5 8.5 0 0 1 17 0 4.25 4.25 0 0 1-8.5 0 4.25 4.25 0 0 0-8.5 0z" fill="#cd2e3a"/><path d="M3.5 12a4.25 4.25 0 0 0 8.5 0 4.25 4.25 0 0 1 8.5 0 8.5 8.5 0 0 1-17 0z" fill="#0047a0"/>'),
    us: SVG('<rect width="24" height="24" fill="#fff"/><g fill="#b22234"><rect y="0" width="24" height="2.6"/><rect y="5.2" width="24" height="2.6"/><rect y="10.4" width="24" height="2.6"/><rect y="15.6" width="24" height="2.6"/><rect y="20.8" width="24" height="3.2"/></g><rect width="12" height="12.4" fill="#3c3b6e"/><g fill="#fff"><circle cx="3" cy="3" r=".9"/><circle cx="7" cy="3" r=".9"/><circle cx="5" cy="6" r=".9"/><circle cx="9" cy="6" r=".9"/><circle cx="3" cy="9" r=".9"/><circle cx="7" cy="9" r=".9"/></g>'),
    jp: SVG('<rect width="24" height="24" fill="#fff"/><circle cx="12" cy="12" r="7" fill="#bc002d"/>'),
    cn: SVG('<rect width="24" height="24" fill="#de2910"/><path d="M7 4.5l1.3 3.9h4.1l-3.3 2.4 1.3 3.9L7 12.3l-3.4 2.4 1.3-3.9-3.3-2.4h4.1z" fill="#ffde00"/><g fill="#ffde00"><circle cx="14" cy="4" r="1"/><circle cx="16.5" cy="7" r="1"/><circle cx="16.5" cy="11" r="1"/><circle cx="14" cy="14" r="1"/></g>'),
    eu: SVG('<rect width="24" height="24" fill="#003399"/><g fill="#ffcc00">' + (function () {
      var s = '';
      for (var i = 0; i < 12; i++) { var a = i * Math.PI / 6; s += '<circle cx="' + (12 + 6.5 * Math.sin(a)).toFixed(2) + '" cy="' + (12 - 6.5 * Math.cos(a)).toFixed(2) + '" r="1.1"/>'; }
      return s;
    })() + '</g>'),
  };
  function metal(sym, a, b, fg) {
    return '<span class="ic ic-txt" style="background:linear-gradient(135deg,' + a + ',' + b + ');color:' + fg + '">' + sym + '</span>';
  }
  function drop(color) {
    return '<span class="ic ic-txt" style="background:#f2f4f7">' + SVG('<path d="M12 3.5c3 4.2 6 7.6 6 11a6 6 0 0 1-12 0c0-3.4 3-6.8 6-11z" fill="' + color + '"/><path d="M9.2 14.6a2.8 2.8 0 0 0 2.4 2.9" stroke="#fff" stroke-width="1.4" fill="none" stroke-linecap="round" opacity=".8"/>') + '</span>';
  }
  var flag = function (k) { return '<span class="ic">' + FLAG[k] + '</span>'; };
  var ICONS = {
    'index:KOSPI': flag('kr'), 'index:KOSDAQ': flag('kr'),
    'index:.INX': flag('us'), 'index:.IXIC': flag('us'), 'index:.DJI': flag('us'),
    'fx:FX_USDKRW': flag('us'), 'fx:FX_JPYKRW': flag('jp'), 'fx:FX_CNYKRW': flag('cn'), 'fx:FX_EURKRW': flag('eu'),
    'cmdty:GCcv1': metal('Au', '#f7d774', '#c99a1e', '#5a3d00'),
    'cmdty:SIcv1': metal('Ag', '#f1f3f5', '#a9b1bb', '#3b4350'),
    'cmdty:PLcv1': metal('Pt', '#e6eef5', '#8fa3b5', '#24384a'),
    'cmdty:HGcv1': metal('Cu', '#f0a37a', '#b5582e', '#fff'),
    'cmdty:CLcv1': drop('#1f2937'),
    'cmdty:LCOcv1': drop('#6b4423'),
  };

  /* ---------- 지수·환율·원자재 칸 ---------- */
  var tiles = {}; // 'index:KOSPI' -> 칸
  var latest = {}; // 'index:KOSPI' -> 마지막 항목 (차트 창 머리글에 씀)
  var fxRate = null, fxData = null;

  // ref: 자릿수 기준 값(등락폭은 가격 자릿수를 따른다)
  function tileFmt(kind, v, ref) {
    if (v == null) return '—';
    // 원자재는 달러 시세 → $ 를 붙인다 (금 $3,953.40, 등락 $15.20)
    if (kind === 'cmdty') { var d = decFor(ref == null ? v : ref); return '$' + nf(v, d, d); }
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
        if (ICONS[key]) c.name.insertAdjacentHTML('beforebegin', ICONS[key]);
        tappable(card, function () { openChart({ kind: kind, code: it.code }); });
      }
      if (kind === 'fx') {
        c.badge.style.display = 'none';
      } else {
        var open = it.status === 'OPEN';
        c.badge.className = 'badge ' + (open ? 'open' : 'close');
        c.badge.textContent = kind === 'cmdty' ? (open ? '거래중' : '마감') : open ? '장중' : '장마감';
        c.badge.title = c.badge.textContent;
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

  // 못 받으면 빈 칸 대신 이유를 보여준다 (프로그램이 멈춘 줄 알지 않게)
  var idxFails = 0;
  function tileMsg(text) {
    ['indices', 'fxs', 'cmdty'].forEach(function (id) {
      var box = $(id);
      if (text && box.querySelector('.skel')) box.setAttribute('data-msg', text);
      else box.removeAttribute('data-msg');
    });
  }
  function applyIndices(data) {
    if (!data || !data.items) return;
    idxFails = 0;
    tileMsg('');
    if (data.fx && data.fx.rate) { fxRate = data.fx.rate; fxData = data.fx; renderFxNote(); }
    (data.items || []).forEach(function (it) { naverStatus[it.code] = it.status; });
    renderTiles('indices', 'index', data.items);
    renderTiles('fxs', 'fx', data.fxs);
    renderTiles('cmdty', 'cmdty', data.cmdty);
    renderHours();
    chartTick();
  }
  function indicesFailed(e) {
    idxFails++;
    tileMsg('네이버 증권 응답이 늦어요 · 다시 받는 중 (' + idxFails + '번째)');
    console.warn('[indices]', e);
  }
  function loadIndices() {
    return getJSON('/api/indices').then(applyIndices).catch(indicesFailed);
  }

  /* 한 번에 받기: 지수·환율·원자재 + 거래대금(보고 있는 시장) + 휴장·서킷브레이커 → 요청 1번
     받은 값은 브라우저에 저장해 두고, 다음에 열 때 기다리지 않고 바로 보여준다 */
  var SNAP_KEY = 'xip:snap:v1';
  function saveSnap(d) {
    try { localStorage.setItem(SNAP_KEY, JSON.stringify({ at: Date.now(), d: d })); } catch (e) {}
  }
  // d 는 전체일 수도, 바뀐 묶음만일 수도 있다(웹소켓 'part'). 받은 것만 그리고, 저장본에는 합쳐 둔다
  var whole = { top: {} };
  function applyAll(d, fromSnap) {
    if (!d) return;
    if (d.market) { applyMarket(d.market); whole.market = d.market; }
    if (d.indices) { applyIndices(d.indices); whole.indices = d.indices; }
    if (d.top) {
      if (d.top.market) { renderTop(d.top); whole.top[d.top.market] = d.top; }
      else ['kr', 'us'].forEach(function (k) { if (d.top[k]) { renderTop(d.top[k]); whole.top[k] = d.top[k]; } });
    }
    if (!fromSnap) { snapShown(false); saveSnap(whole); }
  }
  function loadAll() {
    return getJSON('/api/all?top=' + topMarket).then(function (d) { applyAll(d); }).catch(indicesFailed);
  }

  /* 서버가 밀어주기(웹소켓 /ws): 연결돼 있는 동안은 묻지 않고 기다리기만 한다.
     끊기면 다시 붙고, 그 사이에는 /api/all 로 직접 묻는다 */
  var hub = null, hubLive = false, hubRetry = 0, hubTimer = null, hubPing = null;
  function connectHub() {
    if (hub || document.hidden || typeof WebSocket === 'undefined') return;
    var sock;
    try { sock = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws'); } catch (e) { return retryHub(); }
    hub = sock;
    sock.onopen = function () {
      if (hub !== sock) return;
      hubLive = true;
      hubRetry = 0;
      clearInterval(hubPing);
      hubPing = setInterval(function () { try { sock.send('ping'); } catch (e) {} }, 60000);
    };
    sock.onmessage = function (ev) {
      if (ev.data === 'pong') return;
      var m;
      try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (m && (m.t === 'all' || m.t === 'part')) applyAll(m.d);
    };
    sock.onclose = function () {
      if (hub !== sock) return;
      hub = null;
      hubLive = false;
      clearInterval(hubPing);
      retryHub();
    };
    sock.onerror = function () { try { sock.close(); } catch (e) {} };
  }
  function retryHub() {
    clearTimeout(hubTimer);
    hubRetry++;
    if (!document.hidden) hubTimer = setTimeout(connectHub, Math.min(30000, 1000 * Math.pow(2, Math.min(hubRetry, 5))));
  }
  function closeHub() {
    clearTimeout(hubTimer);
    clearInterval(hubPing);
    hubLive = false;
    if (hub) { var s = hub; hub = null; try { s.close(); } catch (e) {} }
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
  function qLabel(q) { return q.slice(0, 4) + '년 ' + q.slice(5) + '분기'; }
  function md(d) { return +d.slice(5, 7) + '/' + +d.slice(8, 10); }
  function render13f(d) {
    if (d.key !== f13Key) return;
    // 연도·분기 선택 상자: 새 보고서가 나오면 자동으로 한 줄 늘어난다
    var sel = $('f13-q');
    sel.innerHTML = '';
    (d.periods || []).forEach(function (p, i) {
      var o = document.createElement('option');
      o.value = i === 0 ? '' : p.q;
      o.textContent = qLabel(p.q) + (i === 0 ? ' (최신)' : '');
      if (p.q === d.q) o.selected = true;
      sel.appendChild(o);
    });
    var idx = (d.periods || []).map(function (p) { return p.q; }).indexOf(d.q);
    var prev = d.periods && d.periods[idx + 1];
    $('f13-info').innerHTML = '';
    var b = document.createElement('b');
    b.textContent = d.who + ' · ' + d.fund;
    $('f13-info').appendChild(b);
    $('f13-info').appendChild(document.createTextNode(
      ' — ' + d.report.slice(0, 4) + '.' + md(d.report) + ' 기준 · ' + d.filed.slice(0, 4) + '.' + md(d.filed) + ' 제출 · 보유 ' + d.holdings + '종목 ' + fmtUsdKor(d.total) +
      ' · ' + (prev ? qLabel(prev.q) + ' 대비 매수 ' + d.buyCount + '종목' : '직전 보고서가 없어 전부 신규로 표시')));
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
  var f13Q = ''; // '' = 최신
  function load13f() {
    var k = f13Key, q = f13Q, ck = k + ':' + q;
    if (f13Cache[ck]) { render13f(f13Cache[ck]); return; }
    $('f13-info').textContent = '불러오는 중…';
    $('f13').innerHTML = '';
    getJSON('/api/13f?m=' + k + (q ? '&q=' + q : '')).then(function (d) {
      f13Cache[ck] = d;
      if (f13Key === k && f13Q === q) render13f(d);
    }).catch(function () { if (f13Key === k) $('f13-info').textContent = 'SEC 자료를 불러오지 못했어요. 잠시 뒤 다시 눌러 주세요.'; });
  }
  slideSeg($('f13-seg'), function (b) { f13Key = b.getAttribute('data-m'); f13Q = ''; load13f(); });
  $('f13-q').addEventListener('change', function () { f13Q = this.value; load13f(); });
  // 최신 보고서는 6시간마다 다시 확인(새 분기 보고서가 나오면 자동 반영)
  setInterval(function () {
    Object.keys(f13Cache).forEach(function (ck) { if (/:$/.test(ck)) delete f13Cache[ck]; });
    if (!f13Q && !document.hidden) load13f();
  }, 6 * 3600e3);

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
          '<span class="c-name"><img alt="" width="34" height="34" loading="lazy"><span class="c-label"><b class="c-sym"></b><span class="c-full"></span><span class="c-srcs"></span></span></span>' +
          '<span class="c-price"><span class="c-l1"><b class="c-usd"></b><em class="src"></em></span><span class="c-krw"><span class="c-krwv"></span><em class="src"></em></span></span>' +
          '<span class="c-chg"></span><span class="c-cap"></span>';
        li.querySelector('img').src = c.image || '';
        li.querySelector('.c-sym').textContent = c.symbol;
        li.querySelector('.c-full').textContent = c.name;
        var srcs = li.querySelectorAll('.src');
        r = rows[c.id] = {
          row: li, rank: li.querySelector('.c-rank'), usd: li.querySelector('.c-usd'), krw: li.querySelector('.c-krwv'),
          su: srcs[0], sk: srcs[1], srcs: li.querySelector('.c-srcs'),
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
    // 출처 표시: 달러 BN(바이낸스 실시간) / CG(코인게코 1분), 원화 UP(업비트) / NV(네이버 환율 환산)
    var us = pairOf[c.id] && c.live ? 'bn' : 'cg';
    if (r.su.getAttribute('data-s') !== us) {
      r.su.setAttribute('data-s', us);
      r.su.className = 'src ' + us;
      r.su.textContent = SRC[us][0];
      r.su.title = SRC[us][1];
    }
    var kt = krwText(c);
    var ks = kt ? (usdtKrw ? 'up' : 'nv') : '';
    var kTitle = ks === 'up' ? (kt.charAt(0) === '≈' ? '업비트에 없는 코인 — 달러 × 업비트 USDT 원화 시세로 환산' : '업비트 원화 시세 (실시간)') : '네이버 원/달러 환율로 환산';
    r.sk.className = ks ? 'src ' + ks : 'src';
    r.sk.textContent = ks ? SRC[ks][0] : '';
    r.sk.title = ks ? kTitle : '';
    r.krw.textContent = kt;
    // 아주 좁은 폰(320px)에서는 출처 표시를 심볼 아래 줄에 모아 보여준다
    var sk2 = us + '|' + ks;
    if (r.srcs.getAttribute('data-s') !== sk2) {
      r.srcs.setAttribute('data-s', sk2);
      r.srcs.innerHTML = '';
      [r.su, r.sk].forEach(function (s) { if (s.textContent) r.srcs.appendChild(s.cloneNode(true)); });
    }
    r.chg.className = 'c-chg ' + dirCls(c.change24h);
    r.chg.textContent = fmtPct(c.change24h);
    r.cap.textContent = fmtCap(c.marketCap);
  }
  var SRC = {
    bn: ['BN', '바이낸스 (실시간, USDT 기준)'],
    cg: ['CG', '코인게코 (1분마다 갱신)'],
    up: ['UP', '업비트'],
    nv: ['NV', '네이버 환율로 환산'],
  };

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
      try { localStorage.setItem('xip:coins:v1', JSON.stringify(list)); } catch (e) {}
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
      sock.send(JSON.stringify([{ ticket: 'xip-' + Date.now() }, { type: 'ticker', codes: codes }, { format: 'SIMPLE' }]));
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
    var gl = $('ch-glyph');
    var g = !info.icon && ICONS[chart.kind + ':' + chart.code];
    if (g) { if (gl.getAttribute('data-k') !== chart.kind + chart.code) { gl.innerHTML = g; gl.setAttribute('data-k', chart.kind + chart.code); } gl.hidden = false; } else gl.hidden = true;
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

  var KLINE = { '1d': ['5m', 288], '1w': ['1h', 168], '1m': ['4h', 180], '1y': ['1d', 365], '10y': ['1w', 522], all: ['1w', 1000] };
  // 코인게코 무료 API 는 1년까지만 준다
  var CG_DAYS = { '1d': 1, '1w': 7, '1m': 30, '1y': 365, '10y': 365, all: 365 };
  var LONG = { '1y': 1, '10y': 1, all: 1 };

  function fetchSeries(kind, code, range) {
    if (kind === 'coin') {
      var pair = pairOf[code];
      var yr = !!LONG[range];
      if (pair) {
        var k = KLINE[range];
        return getJSON(REST_HOSTS[0] + '/api/v3/klines?symbol=' + pair + '&interval=' + k[0] + '&limit=' + k[1]).then(function (list) {
          var pts = list.map(function (x) { return { t: fmtTs(x[0], yr), v: +x[4] }; });
          var note = '';
          if (range === 'all' && pts.length) note = '바이낸스 상장(' + pts[0].t.slice(0, 7) + ')부터';
          if (range === '10y' && pts.length && list.length < 522) note = '바이낸스 상장(' + pts[0].t.slice(0, 7) + ')부터 — 10년이 안 됐어요';
          return { points: pts, note: note };
        });
      }
      return getJSON(CG + '/coins/' + encodeURIComponent(code) + '/market_chart?vs_currency=usd&days=' + CG_DAYS[range]).then(function (j) {
        return {
          points: (j.prices || []).map(function (x) { return { t: fmtTs(x[0], yr), v: x[1] }; }),
          note: range === '10y' || range === 'all' ? '이 코인은 바이낸스에 없어 코인게코 무료 범위(최근 1년)만 보여줘요' : '',
        };
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
    $('ch-note').textContent = '';
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
    var src = chart.kind === 'coin' ? (pairOf[chart.code] ? '바이낸스 (USDT 기준)' : '코인게코') : '네이버 증권';
    $('ch-note').textContent = chart.points.length >= 2 ? '차트 출처: ' + src + (chart.note ? ' · ' + chart.note : '') : '';
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
    var allPos = lo >= 0;
    hi += span * 0.08; lo -= span * 0.08;
    if (allPos && lo < 0) lo = 0; // 가격은 0 아래로 눈금을 내리지 않는다
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

  /* ---------- 주기 갱신 (탭을 안 볼 때는 쉰다) ----------
     - 앞 요청이 끝나기 전에는 다음 요청을 보내지 않는다(쌓여서 다른 요청까지 막히지 않게)
     - 장이 열려 있을 때만 자주, 닫혀 있으면 천천히 (호출 수 절약) */
  var timers = [];
  function marketOpen(key) {
    var h = key === 'us' ? ['America/New_York', 570, 960] : ['Asia/Seoul', 540, 930];
    var mk = market && market[key];
    return session(h[0], h[1], h[2], toMap(mk && mk.holidays), toMap(mk && mk.early)).open;
  }
  // fn 을 '끝나고 나서 다음 간격' 으로 반복. every() 가 그때그때 간격(ms)을 정한다
  function loop(fn, every) {
    var alive = true, t = null;
    var run = function () {
      if (!alive) return;
      Promise.resolve(fn()).catch(function () {}).then(function () {
        if (alive) t = setTimeout(run, every());
      });
    };
    run();
    return function () { alive = false; clearTimeout(t); };
  }
  function start() {
    stop();
    // 지수·환율·원자재 + 거래대금 + 휴장/서킷브레이커: 웹소켓(/ws)이 밀어준다.
    // 웹소켓이 안 붙어 있을 때만 /api/all 로 직접 묻는다(장중 7초, 아니면 30초)
    connectHub();
    timers.push(closeHub);
    var first = true;
    timers.push(loop(function () {
      if (hubLive && !first) return null;
      first = false;
      return loadAll();
    }, function () { return hubLive ? 15000 : marketOpen('kr') || marketOpen('us') ? INDEX_EVERY : 30000; }));
    timers.push(loop(loadCoins, function () { return COINS_EVERY; }));
    var h = setInterval(renderHours, 30000);
    timers.push(function () { clearInterval(h); });
  }
  function stop() {
    timers.forEach(function (s) { s(); });
    timers = [];
  }
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) stop();
    else start();
  });

  // 열자마자: 마지막으로 받은 값을 먼저 보여준다(서버를 기다리지 않음). 새 값이 오면 바로 바뀐다
  function snapShown(on, at) {
    var el = $('snap-note');
    if (!el) return;
    el.hidden = !on;
    if (on) el.textContent = '마지막 저장 값 (' + fmtTime(new Date(at).toISOString()) + ') · 새 값 받는 중';
  }
  try {
    var snap = JSON.parse(localStorage.getItem(SNAP_KEY) || 'null');
    if (snap && snap.d && Date.now() - snap.at < 3 * 864e5) { applyAll(snap.d, true); snapShown(true, snap.at); }
    var cs = JSON.parse(localStorage.getItem('xip:coins:v1') || 'null');
    if (cs && cs.length && !coins.length) {
      byId = {};
      coins = cs.map(function (c) { c.live = false; byId[c.id] = c; dirty[c.id] = true; return c; });
      buildRows();
      schedule();
    }
  } catch (e) {}

  renderHours();
  start();
  load13f();
})();
