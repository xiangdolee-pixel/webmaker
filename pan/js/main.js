/* pan — 실시간 시세
 * 지수: /api/indices (Worker 가 네이버 증권을 대신 부름) — 7초마다
 * 코인: /api/coins (코인게코 상위 20위, 1분) + 바이낸스 웹소켓(miniTicker, 1초마다 밀려옴)
 * 원화: 네이버 원/달러(하나은행 고시) × 달러 가격
 */
(function () {
  'use strict';

  var INDEX_EVERY = 7000;
  var COINS_EVERY = 60000;
  var WS_HOSTS = ['wss://data-stream.binance.vision/stream?streams=', 'wss://stream.binance.com:9443/stream?streams='];
  var REST_HOSTS = ['https://data-api.binance.vision', 'https://api.binance.com'];

  var $ = function (id) { return document.getElementById(id); };
  var elIdx = $('indices');
  var elCoins = $('coins');
  var elFx = $('fx');
  var elConn = $('conn');

  var fxRate = null;
  var coins = [];            // 순위 순서
  var byId = {};             // id -> coin
  var rows = {};             // id -> { row, usd, krw, chg, cap, src }
  var pairOf = {};           // id -> 'BTCUSDT'
  var idOfPair = {};         // 'BTCUSDT' -> id
  var binancePrices = null;  // 'BTCUSDT' -> 가격 (바이낸스에 있는 거래쌍 확인용)
  var ws = null, wsKey = '', wsHost = 0, wsRetry = 0, wsTimer = null;
  var dirty = {}, rafOn = false;
  var idxTimer = null, coinTimer = null;
  var idxCards = {};

  /* ---------- 숫자 표시 ---------- */
  function nf(v, min, max) {
    return v.toLocaleString('en-US', { minimumFractionDigits: min, maximumFractionDigits: max });
  }
  function fmtUSD(v) {
    if (v == null || isNaN(v)) return '—';
    if (v >= 1000) return '$' + nf(v, 2, 2);
    if (v >= 1) return '$' + nf(v, 2, 4);
    if (v >= 0.01) return '$' + nf(v, 4, 5);
    return '$' + Number(v.toPrecision(4)).toString();
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
    return (v > 0 ? '+' : '') + v.toFixed(2) + '%';
  }
  function dirCls(v) { return v > 0 ? 'up' : v < 0 ? 'down' : ''; }
  function fmtTime(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d)) return '';
    var p = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d);
    var g = {};
    p.forEach(function (x) { g[x.type] = x.value; });
    return g.month + '.' + g.day + ' ' + g.hour + ':' + g.minute;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

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

  /* ---------- 지수 ---------- */
  function renderIndices(data) {
    if (data.fx && data.fx.rate) {
      fxRate = data.fx.rate;
      elFx.innerHTML = '원/달러 <b>' + nf(fxRate, 2, 2) + '</b> <span class="' + dirCls(data.fx.change) + '">' + fmtPct(data.fx.ratio) + '</span>';
      coins.forEach(function (c) { dirty[c.id] = true; });
      schedule();
    }
    if (elIdx.querySelector('.skel')) elIdx.innerHTML = '';
    (data.items || []).forEach(function (it) {
      var c = idxCards[it.code];
      if (!c) {
        var card = document.createElement('div');
        card.className = 'card idx';
        card.innerHTML = '<div class="idx-top"><span class="idx-name"></span><em class="badge"></em></div>' +
          '<div class="idx-price"></div><div class="idx-chg"></div><div class="idx-time"></div>';
        elIdx.appendChild(card);
        c = idxCards[it.code] = {
          name: card.querySelector('.idx-name'), badge: card.querySelector('.badge'),
          price: card.querySelector('.idx-price'), chg: card.querySelector('.idx-chg'),
          time: card.querySelector('.idx-time'), last: null,
        };
        c.name.textContent = it.name;
      }
      var open = it.status === 'OPEN';
      c.badge.className = 'badge ' + (open ? 'open' : 'close');
      c.badge.textContent = open ? '장중' : '장마감';
      var dir = c.last == null || it.price == null ? 0 : it.price - c.last;
      setFlash(c.price, it.price == null ? '—' : nf(it.price, 2, 2), dir);
      c.last = it.price;
      c.chg.className = 'idx-chg ' + dirCls(it.change);
      c.chg.textContent = it.change == null ? '' : (it.change > 0 ? '▲ ' : it.change < 0 ? '▼ ' : '') + nf(Math.abs(it.change), 2, 2) + ' (' + fmtPct(it.ratio) + ')';
      c.time.textContent = it.tradedAt ? fmtTime(it.tradedAt) + ' 기준' : '';
    });
  }

  function loadIndices() {
    return getJSON('/api/indices').then(renderIndices).catch(function (e) { console.warn('[indices]', e); });
  }

  /* ---------- 코인 ---------- */
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
          '<span class="c-name"><img alt="" width="28" height="28" loading="lazy"><span class="c-label"><b class="c-sym"></b><span class="c-full"></span></span></span>' +
          '<span class="c-price"><b class="c-usd"></b><span class="c-krw"></span></span>' +
          '<span class="c-chg"></span>' +
          '<span class="c-cap"></span>';
        li.querySelector('img').src = c.image || '';
        li.querySelector('.c-sym').textContent = c.symbol;
        li.querySelector('.c-full').textContent = c.name;
        r = rows[c.id] = {
          row: li, rank: li.querySelector('.c-rank'), usd: li.querySelector('.c-usd'), krw: li.querySelector('.c-krw'),
          chg: li.querySelector('.c-chg'), cap: li.querySelector('.c-cap'), last: null,
        };
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
    var dir = r.last == null ? 0 : c.price - r.last;
    setFlash(r.usd, fmtUSD(c.price), dir);
    r.last = c.price;
    r.krw.textContent = fxRate ? fmtKRW(c.price * fxRate) : '';
    r.chg.className = 'c-chg ' + dirCls(c.change24h);
    r.chg.textContent = fmtPct(c.change24h);
    r.cap.innerHTML = esc(fmtCap(c.marketCap)) + (c.live ? '<em class="badge live c-src">실시간</em>' : '<em class="badge slow c-src">1분</em>');
  }

  function schedule() {
    if (rafOn) return;
    rafOn = true;
    requestAnimationFrame(function () {
      rafOn = false;
      Object.keys(dirty).forEach(renderCoin);
      dirty = {};
    });
  }

  // 바이낸스에 USDT 거래쌍이 있고 가격이 코인게코와 5% 안쪽이면 실시간 대상으로 쓴다(같은 심볼 다른 코인 걸러냄)
  function mapPairs() {
    pairOf = {}; idOfPair = {};
    if (!binancePrices) return;
    coins.forEach(function (c) {
      if (c.symbol === 'USDT') return;
      var p = c.symbol + 'USDT';
      var bp = binancePrices[p];
      if (bp && c.price && Math.abs(bp - c.price) / c.price < 0.05) {
        pairOf[c.id] = p;
        idOfPair[p] = c.id;
      }
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
  var CG_URL = 'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=20&page=1&price_change_percentage=24h';
  function fetchCoinList() {
    return getJSON(CG_URL).then(function (list) {
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
        }
        c.live = !!(old && old.live && pairOf[c.id]);
        byId[c.id] = c;
        dirty[c.id] = true;
        return c;
      });
      // 표는 코인게코 값으로 바로 그리고, 바이낸스 실시간은 뒤따라 붙인다
      buildRows();
      schedule();
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

  /* ---------- 바이낸스 웹소켓 ---------- */
  function connectWS() {
    var pairs = Object.keys(idOfPair).sort();
    if (!pairs.length) {
      setConn('wait', '1분마다 갱신');
      return;
    }
    var key = pairs.join(',');
    if (ws && wsKey === key && ws.readyState <= 1) return;
    closeWS();
    wsKey = key;
    var url = WS_HOSTS[wsHost] + pairs.map(function (p) { return p.toLowerCase() + '@miniTicker'; }).join('/');
    var sock;
    try { sock = new WebSocket(url); } catch (e) { return retryWS(); }
    ws = sock;
    setConn('wait', '실시간 연결 중');
    sock.onopen = function () {
      if (ws !== sock) return;
      wsRetry = 0;
      setConn('live', '실시간');
    };
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
    if (ws) {
      var s = ws;
      ws = null;
      try { s.close(); } catch (e) {}
    }
  }

  function retryWS() {
    clearTimeout(wsTimer);
    wsRetry++;
    if (wsRetry % 2 === 0) wsHost = (wsHost + 1) % WS_HOSTS.length; // 두 번 실패하면 다른 주소로
    setConn('off', '재연결 중');
    wsKey = '';
    wsTimer = setTimeout(connectWS, Math.min(30000, 1000 * Math.pow(2, Math.min(wsRetry, 5))));
  }

  /* ---------- 주기 갱신 (탭을 안 볼 때는 쉰다) ---------- */
  function start() {
    stop();
    loadIndices();
    loadCoins();
    idxTimer = setInterval(loadIndices, INDEX_EVERY);
    coinTimer = setInterval(loadCoins, COINS_EVERY);
  }
  function stop() {
    clearInterval(idxTimer);
    clearInterval(coinTimer);
  }
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) stop();
    else start();
  });

  start();
})();
