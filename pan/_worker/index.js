// pan — 시세 중계 Worker
//   /api/indices : 네이버 증권 지수 5종 + 원자재 6종 + 환율 4종(달러·엔·위안·유로)
//   /api/coins   : 코인게코 시가총액 상위 20위 (브라우저 직접 호출이 실패할 때 쓰는 예비)
//   /api/top     : 거래대금 상위 20 종목 (?market=kr|us) — 국내는 ETF 제외, 미국은 나스닥+뉴욕+아멕스 합쳐 정렬
//   /api/chart   : 지수·원자재·종목 차트 (?kind=index|cmdty|stock&code=…&range=1d|1w|1m|1y)
// 네이버 API 는 브라우저(다른 사이트 Origin)에서 부르면 403 이라 여기서 대신 부른다.
// workers.dev 에서는 Cache API 가 동작하지 않으므로 isolate 메모리에 잠깐 들고 있는다.

const UA = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  Accept: 'application/json',
};

const INDEX_NAMES = {
  KOSPI: '코스피',
  KOSDAQ: '코스닥',
  '.INX': 'S&P 500',
  '.IXIC': '나스닥 종합',
  '.DJI': '다우존스',
};
const DOMESTIC = { KOSPI: 1, KOSDAQ: 1 };

// 원자재: 코드 → [네이버 분류, 표시 이름]
const CMDTY = {
  GCcv1: ['metals', '금'],
  SIcv1: ['metals', '은'],
  PLcv1: ['metals', '플래티넘'],
  HGcv1: ['metals', '구리'],
  CLcv1: ['energy', 'WTI 원유'],
  LCOcv1: ['energy', '브렌트유'],
};
// 환율: 코드 → 표시 이름, 단위
const FXS = {
  FX_USDKRW: ['미국 달러', '원 / 1달러'],
  FX_JPYKRW: ['일본 엔', '원 / 100엔'],
  FX_CNYKRW: ['중국 위안', '원 / 1위안'],
  FX_EURKRW: ['유로', '원 / 1유로'],
};
const UNITS = { 'USD/OZS': '달러/온스', 'USD/LBS': '달러/파운드', 'USD/BBL': '달러/배럴' };

const memo = new Map(); // key -> { at, data, pending }

// ttl 동안은 저장된 값을, 지나면 새로 받는다. 받다가 실패하면 마지막 값(stale)을 돌려준다.
async function cached(key, ttlMs, loader) {
  const now = Date.now();
  const hit = memo.get(key);
  if (hit && hit.data && now - hit.at < ttlMs) return { data: hit.data, at: hit.at, stale: false };
  if (hit && hit.pending) return hit.pending;
  const pending = loader()
    .then((data) => {
      memo.set(key, { at: Date.now(), data });
      return { data, at: Date.now(), stale: false };
    })
    .catch((err) => {
      if (hit && hit.data) {
        memo.set(key, { at: hit.at, data: hit.data });
        return { data: hit.data, at: hit.at, stale: true, error: String(err.message || err) };
      }
      memo.delete(key);
      throw err;
    });
  memo.set(key, { ...(hit || {}), pending });
  if (memo.size > 200) memo.delete(memo.keys().next().value);
  return pending;
}

async function getJSON(url) {
  const res = await fetch(url, { headers: UA, cf: { cacheTtl: 0 } });
  if (!res.ok) throw new Error(`${new URL(url).host} ${res.status}`);
  return res.json();
}

const num = (v) => (v == null || v === '' ? null : Number(String(v).replace(/,/g, '')));

function normIndex(d) {
  const code = d.itemCode || d.reutersCode;
  return {
    code,
    name: INDEX_NAMES[code] || d.stockName || d.indexName || code,
    price: num(d.closePrice),
    change: num(d.compareToPreviousClosePrice),
    ratio: num(d.fluctuationsRatio),
    status: d.marketStatus || null, // OPEN | CLOSE | PREOPEN …
    tradedAt: d.localTradedAt || null,
  };
}

async function loadCmdty(code) {
  const [cat, name] = CMDTY[code];
  const j = await getJSON(`https://api.stock.naver.com/marketindex/${cat}/${code}`);
  const i = j.closePrice != null ? j : j.metalsInfo || j.energyInfo || j;
  return {
    code,
    name,
    price: num(i.closePrice),
    change: num(i.fluctuations),
    ratio: num(i.fluctuationsRatio),
    status: i.marketStatus || null,
    tradedAt: i.localTradedAt || null,
    unit: UNITS[i.unit] || i.unit || '',
    delay: num(i.delayTime) || 0,
  };
}

async function loadFx(code) {
  const j = await getJSON(`https://api.stock.naver.com/marketindex/exchange/${code}`);
  const i = j.exchangeInfo;
  return {
    code,
    name: FXS[code][0],
    unit: FXS[code][1],
    price: num(i.calcPrice ?? i.closePrice),
    change: num(i.fluctuations),
    ratio: num(i.fluctuationsRatio),
    status: i.marketStatus || null,
    tradedAt: i.localTradedAt || null,
  };
}

async function loadIndices() {
  const fxCodes = Object.keys(FXS);
  const cmCodes = Object.keys(CMDTY);
  const [dom, world, ...rest] = await Promise.all([
    getJSON('https://polling.finance.naver.com/api/realtime/domestic/index/KOSPI,KOSDAQ'),
    getJSON('https://polling.finance.naver.com/api/realtime/worldstock/index/.INX,.IXIC,.DJI'),
    ...fxCodes.map((c) => loadFx(c).catch(() => null)),
    ...cmCodes.map((c) => loadCmdty(c).catch(() => null)),
  ]);
  const fxs = rest.slice(0, fxCodes.length).filter(Boolean);
  const cm = rest.slice(fxCodes.length).filter(Boolean);
  const items = [...(dom.datas || []), ...(world.datas || [])].map(normIndex);
  const order = Object.keys(INDEX_NAMES);
  items.sort((a, b) => order.indexOf(a.code) - order.indexOf(b.code));
  const usd = fxs.find((f) => f.code === 'FX_USDKRW');
  return {
    items,
    cmdty: cm,
    fxs,
    fx: usd ? { rate: usd.price, change: usd.change, ratio: usd.ratio, tradedAt: usd.tradedAt } : null,
  };
}

async function loadCoins() {
  const list = await getJSON(
    'https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=20&page=1&price_change_percentage=24h',
  );
  if (!Array.isArray(list) || !list.length) throw new Error('coingecko empty');
  return list.map((c) => ({
    id: c.id,
    rank: c.market_cap_rank,
    symbol: String(c.symbol || '').toUpperCase(),
    name: c.name,
    image: c.image,
    price: c.current_price,
    change24h: c.price_change_percentage_24h,
    marketCap: c.market_cap,
  }));
}

/* ---------- 차트 ---------- */
// 네이버 날짜 인자: 한국 시각 yyyyMMddHHmm
function kstStamp(msAgo) {
  const d = new Date(Date.now() + 9 * 3600e3 - msAgo);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}`;
}
const DAY = 86400e3;

// "20261103090000" → "11.03 09:00",  "20261103" → "2026.11.03"
function label(s) {
  s = String(s || '');
  if (s.length >= 12) return `${s.slice(4, 6)}.${s.slice(6, 8)} ${s.slice(8, 10)}:${s.slice(10, 12)}`;
  if (s.length === 8) return `${s.slice(0, 4)}.${s.slice(4, 6)}.${s.slice(6, 8)}`;
  return s;
}
function toPoints(list) {
  return (list || [])
    .map((p) => {
      const v = num(p.currentPrice ?? p.closePrice);
      const k = p.localDateTime || p.localDate;
      return v == null || !k ? null : { k: String(k), t: label(k), v };
    })
    .filter(Boolean);
}
// 분봉은 가장 최근 거래일 하루치만
function lastDay(points) {
  if (!points.length) return points;
  const d = points[points.length - 1].k.slice(0, 8);
  return points.filter((p) => p.k.slice(0, 8) === d);
}

async function indexChart(code, range) {
  const seg = DOMESTIC[code] ? 'domestic' : 'foreign';
  const base = `https://api.stock.naver.com/chart/${seg}/index/${encodeURIComponent(code)}`;
  const q = (unit, back) => getJSON(`${base}/${unit}?startDateTime=${kstStamp(back)}&endDateTime=${kstStamp(-DAY)}`).then(toPoints);
  if (range === '1d') {
    const pts = lastDay(await q('minute', 7 * DAY));
    return pts.length ? { points: pts } : { points: [], note: '이 지수는 하루 단위 차트를 받을 수 없어요. 1주 이상을 골라 주세요.' };
  }
  if (range === '1w') {
    const pts = await q('minute10', 8 * DAY);
    if (pts.length) return { points: pts.filter((p) => p.k >= kstStamp(7 * DAY)) };
    return { points: await q('day', 10 * DAY) };
  }
  if (range === '1m') return { points: await q('day', 31 * DAY) };
  return { points: await q('day', 366 * DAY) };
}

async function cmdtyChart(code, range) {
  const fx = !!FXS[code];
  const cat = fx ? 'exchange' : CMDTY[code][0];
  const info = fx ? 'marketindex' : 'futures';
  const type = { '1d': 'day', '1w': 'areaMonth', '1m': 'areaMonth', '1y': 'areaYear' }[range];
  const j = await getJSON(
    `https://m.stock.naver.com/front-api/chart/pricesByPeriod?reutersCode=${code}&category=${cat}&chartInfoType=${info}&scriptChartType=${type}`,
  );
  let pts = toPoints(j.result && j.result.priceInfos);
  if (range === '1d') pts = lastDay(pts);
  if (range === '1w') pts = pts.slice(-6);
  return { points: pts };
}

/* ---------- 거래대금 상위 종목 ---------- */
function normStock(s, market) {
  const raw = (k) => num(s[k + 'Raw'] ?? s[k]);
  const code = market === 'kr' ? s.itemCode : s.reutersCode;
  return {
    code,
    symbol: market === 'kr' ? s.itemCode : s.symbolCode,
    name: s.stockName,
    logo: s.itemLogoPngUrl || null,
    price: raw('closePrice'),
    change: raw('compareToPreviousClosePrice'),
    ratio: raw('fluctuationsRatio'),
    volume: raw('accumulatedTradingVolume'),
    value: raw('accumulatedTradingValue'), // 국내: 원, 미국: 달러
    valueKrw: s.accumulatedTradingValueKrwHangeul || null,
    status: s.marketStatus || null,
    tradedAt: s.localTradedAt || null,
    exchange: s.stockExchangeType && s.stockExchangeType.name,
  };
}

async function loadTop(market) {
  if (market === 'kr') {
    // 네이버 '거래대금 상위' 전체(코스피+코스닥)에서 ETF·ETN 빼고 주식만
    const j = await getJSON('https://m.stock.naver.com/api/stocks/priceTop/all?page=1&pageSize=60');
    const list = (j.stocks || []).filter((s) => s.stockEndType === 'stock').slice(0, 20).map((s) => normStock(s, 'kr'));
    return { market, status: j.marketStatus || null, items: list };
  }
  const ex = await Promise.all(
    ['NASDAQ', 'NYSE', 'AMEX'].map((e) =>
      getJSON(`https://api.stock.naver.com/stock/exchange/${e}/priceTop?page=1&pageSize=20`).catch(() => ({ stocks: [] })),
    ),
  );
  const all = ex.flatMap((j) => j.stocks || []).filter((s) => s.stockEndType === 'stock').map((s) => normStock(s, 'us'));
  all.sort((a, b) => (b.value || 0) - (a.value || 0));
  return { market, status: all[0] ? all[0].status : null, items: all.slice(0, 20) };
}

async function stockChart(code, range) {
  const seg = /^\d{6}$/.test(code) ? 'domestic' : 'foreign';
  const base = `https://api.stock.naver.com/chart/${seg}/item/${encodeURIComponent(code)}`;
  const q = (unit, back) => getJSON(`${base}/${unit}?startDateTime=${kstStamp(back)}&endDateTime=${kstStamp(-DAY)}`).then(toPoints);
  if (range === '1d') {
    const pts = lastDay(await q('minute', 7 * DAY));
    return pts.length ? { points: pts } : { points: [], note: '이 종목은 하루 단위 차트를 받을 수 없어요. 1주 이상을 골라 주세요.' };
  }
  if (range === '1w') {
    const pts = await q('minute10', 8 * DAY).catch(() => []);
    if (pts.length) return { points: pts.filter((p) => p.k >= kstStamp(7 * DAY)) };
    return { points: await q('day', 10 * DAY) };
  }
  if (range === '1m') return { points: await q('day', 31 * DAY) };
  return { points: await q('day', 366 * DAY) };
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;
    try {
      if (pathname === '/api/indices') {
        const r = await cached('indices', 4000, loadIndices);
        return json({ ...r.data, fetchedAt: r.at, stale: r.stale });
      }
      if (pathname === '/api/coins') {
        const r = await cached('coins', 60000, loadCoins);
        return json({ coins: r.data, fetchedAt: r.at, stale: r.stale });
      }
      if (pathname === '/api/top') {
        const market = url.searchParams.get('market') === 'us' ? 'us' : 'kr';
        const r = await cached(`top:${market}`, 8000, () => loadTop(market));
        return json({ ...r.data, fetchedAt: r.at, stale: r.stale });
      }
      if (pathname === '/api/chart') {
        const kind = url.searchParams.get('kind');
        const code = url.searchParams.get('code');
        const range = url.searchParams.get('range');
        if (!['1d', '1w', '1m', '1y'].includes(range)) return json({ error: 'bad range' }, 400);
        let loader;
        if (kind === 'index' && INDEX_NAMES[code]) loader = () => indexChart(code, range);
        else if ((kind === 'cmdty' && CMDTY[code]) || (kind === 'fx' && FXS[code])) loader = () => cmdtyChart(code, range);
        else if (kind === 'stock' && /^(\d{6}|[A-Za-z0-9-]{1,10}(\.[A-Z]{1,2})?)$/.test(code || '')) loader = () => stockChart(code, range);
        else return json({ error: 'bad code' }, 400);
        const r = await cached(`chart:${kind}:${code}:${range}`, range === '1d' ? 30000 : 300000, loader);
        return json({ ...r.data, fetchedAt: r.at });
      }
    } catch (err) {
      return json({ error: String(err.message || err) }, 502);
    }
    if (pathname.startsWith('/api/')) return json({ error: 'not found' }, 404);
    return env.ASSETS.fetch(request);
  },
};
