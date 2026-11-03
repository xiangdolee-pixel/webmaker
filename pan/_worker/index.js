// pan — 시세 중계 Worker
//   /api/indices : 네이버 증권(코스피·코스닥·S&P500·나스닥 종합·다우존스) + 원/달러 환율
//   /api/coins   : 코인게코 시가총액 상위 20위
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

async function loadIndices() {
  const [dom, world, fx] = await Promise.all([
    getJSON('https://polling.finance.naver.com/api/realtime/domestic/index/KOSPI,KOSDAQ'),
    getJSON('https://polling.finance.naver.com/api/realtime/worldstock/index/.INX,.IXIC,.DJI'),
    getJSON('https://api.stock.naver.com/marketindex/exchange/FX_USDKRW').catch(() => null),
  ]);
  const items = [...(dom.datas || []), ...(world.datas || [])].map(normIndex);
  const order = Object.keys(INDEX_NAMES);
  items.sort((a, b) => order.indexOf(a.code) - order.indexOf(b.code));
  const fi = fx && fx.exchangeInfo;
  return {
    items,
    fx: fi
      ? {
          rate: num(fi.calcPrice ?? fi.closePrice),
          change: num(fi.fluctuations),
          ratio: num(fi.fluctuationsRatio),
          tradedAt: fi.localTradedAt || null,
        }
      : null,
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
    updatedAt: c.last_updated,
  }));
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    try {
      if (pathname === '/api/indices') {
        const r = await cached('indices', 4000, loadIndices);
        return json({ ...r.data, fetchedAt: r.at, stale: r.stale });
      }
      if (pathname === '/api/coins') {
        const r = await cached('coins', 60000, loadCoins);
        return json({ coins: r.data, fetchedAt: r.at, stale: r.stale });
      }
    } catch (err) {
      return json({ error: String(err.message || err) }, 502);
    }
    if (pathname.startsWith('/api/')) return json({ error: 'not found' }, 404);
    return env.ASSETS.fetch(request);
  },
};
