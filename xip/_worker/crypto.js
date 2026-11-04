// xip 크립토 탭 데이터 (회원 전용 /api/crypto) — 묶음마다 알맞은 간격으로만 원본에 묻는다 (그 사이엔 저장본, 기존 swr 그대로)
//   etf  : 비트코인 현물 ETF 일별 순유입(백만 달러, 최근 7거래일) — Farside Investors 표          15분 / 최대 3일
//   dom  : 비트코인 · 이더리움 도미넌스, 전체 시가총액 — CoinGecko /global                         5분 / 1일
//   hash : 해시레이트 · 난이도 — mempool.space                                                    30분 / 2일
//   fng  : 크립토 공포 · 탐욕 지수 — alternative.me                                                30분 / 3일
//   mvrv : MVRV Z-Score — Coin Metrics 일별 값으로 직접 계산(예비: bitcoin-data.com)                 6시간 / 7일
//   m2   : 미국 M2 통화량 — 연준 H.6(예비: FRED M2SL), 월 단위, 10억 달러                           12시간 / 30일
//   kimp : 김치 프리미엄 상위 10 — 업비트 원화 시세 ÷ (OKX USDT 시세 × 원/달러 하나은행 고시)       20초 / 10분
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

async function get(url, as = 'json', ms = 10000) {
  const headers = as === 'json' ? { 'User-Agent': UA, Accept: 'application/json' }
    : { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'Accept-Language': 'en-US,en;q=0.9,ko;q=0.8', 'Cache-Control': 'no-cache' };
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(ms) });
  if (!res.ok) throw new Error(`${new URL(url).host} ${res.status}`);
  return as === 'json' ? res.json() : res.text();
}
const num = (v) => { const n = typeof v === 'number' ? v : parseFloat(v); return Number.isFinite(n) ? n : null; };

// Farside 표: [날짜, 종목별 값 …, 합계]. "(12.3)" = −12.3, "-" = 아직 집계 전
export function parseFarside(html, days = 7) {
  const txt = (c) => c.replace(/<[^>]+>/g, '').replace(/&nbsp;|&#160;/g, ' ').replace(/\s+/g, ' ').trim();
  const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)]
    .map((m) => [...m[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((c) => txt(c[1])).filter(Boolean));
  const head = rows.find((r) => r.includes('IBIT') && r.includes('FBTC'));
  if (!head) throw new Error('farside: no header');
  const tickers = head.filter((h) => /^[A-Z]{3,5}$/.test(h) && h !== 'Total');
  const n = (s) => { if (!s || s === '-') return null; const neg = /^\(.*\)$/.test(s); const v = parseFloat(s.replace(/[(),]/g, '')); return Number.isFinite(v) ? (neg ? -v : v) : null; };
  const data = rows.filter((r) => /^\d{1,2} [A-Z][a-z]{2} \d{4}$/.test(r[0]) && r.length === tickers.length + 2);
  if (!data.length) throw new Error('farside: no rows');
  const MON = { Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12 };
  const iso = (d) => { const [dd, mm, yy] = d.split(' '); return `${yy}-${String(MON[mm]).padStart(2, '0')}-${dd.padStart(2, '0')}`; };
  return {
    tickers,
    days: data.slice(-days).map((r) => ({ date: iso(r[0]), total: n(r[r.length - 1]), by: Object.fromEntries(tickers.map((t, i) => [t, n(r[i + 1])])) })),
  };
}
const loadEtf = async () => parseFarside(await get('https://farside.co.uk/btc/', 'text', 15000));

// 도미넌스: CoinGecko → (막히면) CoinPaprika
async function loadDom() {
  try {
    const d = (await get('https://api.coingecko.com/api/v3/global')).data;
    return {
      btc: num(d.market_cap_percentage.btc), eth: num(d.market_cap_percentage.eth),
      total: num(d.total_market_cap.usd), change: num(d.market_cap_change_percentage_24h_usd), src: 'CoinGecko',
    };
  } catch (e) {
    const [g, eth] = await Promise.all([get('https://api.coinpaprika.com/v1/global'), get('https://api.coinpaprika.com/v1/tickers/eth-ethereum').catch(() => null)]);
    return {
      btc: num(g.bitcoin_dominance_percentage), eth: eth ? (num(eth.quotes.USD.market_cap) / num(g.market_cap_usd)) * 100 : null,
      total: num(g.market_cap_usd), change: num(g.market_cap_change_24h), src: 'CoinPaprika',
    };
  }
}

async function loadHash() {
  const d = await get('https://mempool.space/api/v1/mining/hashrate/1m');
  const list = (d.hashrates || []).map((h) => ({ t: h.timestamp * 1000, v: h.avgHashrate / 1e18 }));
  const now = d.currentHashrate / 1e18;
  const weekAgo = list.length > 7 ? list[list.length - 8].v : null;
  return { eh: now, difficulty: num(d.currentDifficulty), weekChange: weekAgo ? (now / weekAgo - 1) * 100 : null, series: list.slice(-30).map((p) => Math.round(p.v)) };
}

async function loadFng() {
  const d = (await get('https://api.alternative.me/fng/?limit=31')).data || [];
  const at = (i) => (d[i] ? { v: +d[i].value, label: d[i].value_classification } : null);
  return { now: at(0), yesterday: at(1), week: at(7), month: at(30), series: d.slice(0, 30).map((x) => +x.value).reverse() };
}

// MVRV Z-Score = (시가총액 − 실현 시가총액) ÷ 시가총액 전체 기간 표준편차
//   Coin Metrics 무료 API 의 일별 시가총액 · MVRV(=시가총액/실현시가총액) 전체 기록으로 직접 계산 (bitcoin-data.com 값과 같음, 하루 늦음)
//   막히면 bitcoin-data.com (무료는 약 7일 늦음)
async function loadMvrv() {
  try {
    const j = await get('https://community-api.coinmetrics.io/v4/timeseries/asset-metrics?assets=btc&metrics=CapMrktCurUSD,CapMVRVCur&frequency=1d&page_size=10000&start_time=2010-07-18', 'json', 20000);
    const rows = (j.data || []).map((r) => ({ t: r.time.slice(0, 10), mc: +r.CapMrktCurUSD, mv: +r.CapMVRVCur })).filter((r) => r.mc > 0 && r.mv > 0);
    if (rows.length < 3000) throw new Error('coinmetrics short');
    const mean = rows.reduce((a, r) => a + r.mc, 0) / rows.length;
    const sd = Math.sqrt(rows.reduce((a, r) => a + (r.mc - mean) ** 2, 0) / rows.length);
    const zOf = (r) => (r.mc - r.mc / r.mv) / sd;
    const last = rows[rows.length - 1];
    return { z: zOf(last), mvrv: last.mv, date: last.t, delayed: false, src: 'Coin Metrics', series: rows.slice(-90).map((r) => +zOf(r).toFixed(3)) };
  } catch (e) {
    const d = await get('https://bitcoin-data.com/v1/mvrv-zscore/last');
    const z = num(d.mvrvZscore);
    if (z == null) throw new Error('mvrv empty');
    return { z, date: d.d, delayed: !!d.delayed, src: 'bitcoin-data.com' };
  }
}

// 미국 M2(계절 조정, 10억 달러): 연준 H.6 통계 내려받기 → (막히면) FRED
async function loadM2() {
  let rows;
  try {
    const csv = await get('https://www.federalreserve.gov/datadownload/Output.aspx?rel=H6&series=798e2796917702a5f8423426ba7e6b42&lastobs=25&from=&to=&filetype=csv&label=include&layout=seriescolumn', 'text', 20000);
    const lines = csv.trim().split(/\r?\n/).map((l) => l.split(',').map((c) => c.replace(/"/g, '').trim()));
    const head = lines.find((l) => l[0] === 'Time Period');
    const ci = head ? head.indexOf('M2.M') : -1;
    if (ci < 0) throw new Error('h6 no M2.M');
    rows = lines.filter((l) => /^\d{4}-\d{2}$/.test(l[0])).map((l) => ({ d: `${l[0]}-01`, v: num(l[ci]) })).filter((r) => r.v != null);
  } catch (e) {
    const csv = await get('https://fred.stlouisfed.org/graph/fredgraph.csv?id=M2SL', 'text', 20000);
    rows = csv.trim().split(/\r?\n/).slice(1).map((l) => l.split(',')).map(([d, v]) => ({ d, v: num(v) })).filter((r) => r.v != null);
  }
  if (rows.length < 14) throw new Error('m2 short');
  const last = rows[rows.length - 1];
  const prev = rows[rows.length - 2];
  const yearAgo = rows[rows.length - 13];
  return {
    date: last.d, value: last.v, // 10억 달러
    mom: (last.v / prev.v - 1) * 100, yoy: (last.v / yearAgo.v - 1) * 100,
    series: rows.slice(-24).map((r) => r.v),
  };
}

// 김프: 업비트 원화 거래대금 50억 원 이상 · OKX USDT 마켓에 있는 코인만 (같은 기호 다른 코인은 ±30% 넘으면 뺀다)
const STABLE = new Set(['USDT', 'USDC', 'USDS', 'DAI', 'FDUSD', 'USDE', 'TUSD', 'PYUSD']);
let upbitNames = { at: 0, map: {} };
async function loadKimp(usdkrw) {
  if (!usdkrw) throw new Error('no usdkrw');
  const [up, okx] = await Promise.all([
    get('https://api.upbit.com/v1/ticker/all?quote_currencies=KRW'),
    get('https://www.okx.com/api/v5/market/tickers?instType=SPOT'),
  ]);
  if (Date.now() - upbitNames.at > 864e5) {
    try {
      const all = await get('https://api.upbit.com/v1/market/all');
      upbitNames = { at: Date.now(), map: Object.fromEntries(all.filter((m) => m.market.startsWith('KRW-')).map((m) => [m.market.slice(4), m.korean_name])) };
    } catch { /* 이름 없이 기호만 */ }
  }
  const usdt = {};
  for (const t of okx.data || []) if (t.instId.endsWith('-USDT')) usdt[t.instId.slice(0, -5)] = num(t.last);
  const tether = up.find((t) => t.market === 'KRW-USDT');
  const list = [];
  for (const t of up) {
    const sym = t.market.slice(4);
    if (STABLE.has(sym) || !usdt[sym] || t.acc_trade_price_24h < 5e9) continue;
    const global = usdt[sym] * usdkrw;
    const p = (t.trade_price / global - 1) * 100;
    if (Math.abs(p) > 30) continue;
    list.push({ sym, name: upbitNames.map[sym] || sym, krw: t.trade_price, global, premium: p, value: t.acc_trade_price_24h });
  }
  list.sort((a, b) => b.premium - a.premium);
  const pick = (s) => list.find((x) => x.sym === s) || null;
  return {
    usdkrw,
    tether: tether ? { krw: tether.trade_price, premium: (tether.trade_price / usdkrw - 1) * 100 } : null,
    btc: pick('BTC'), eth: pick('ETH'),
    top: list.slice(0, 10),
    count: list.length,
  };
}

// 한 번에: 묶음 하나가 실패해도 나머지는 보여준다
export async function cryptoAll(ctx, swr, usdkrw) {
  const H = 3600e3;
  const part = (key, ttl, stale, f) => swr(ctx, `c:${key}`, ttl, stale, f).then((r) => ({ ...r.data, at: r.at })).catch(() => null);
  const [etf, dom, hash, fng, mvrv, m2, kimp] = await Promise.all([
    part('etf', 15 * 60e3, 72 * H, loadEtf),
    part('dom', 5 * 60e3, 24 * H, loadDom),
    part('hash', 30 * 60e3, 48 * H, loadHash),
    part('fng', 30 * 60e3, 72 * H, loadFng),
    part('mvrv', 6 * H, 7 * 24 * H, loadMvrv),
    part('m2', 12 * H, 30 * 24 * H, loadM2),
    part('kimp', 20e3, 10 * 60e3, async () => loadKimp(await usdkrw())),
  ]);
  return { etf, dom, hash, fng, mvrv, m2, kimp };
}
