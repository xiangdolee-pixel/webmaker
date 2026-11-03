// pan — 시세 중계 Worker
//   /api/indices : 네이버 증권 지수 5종 + 원자재 6종 + 환율 4종(달러·엔·위안·유로)
//   /api/coins   : 코인게코 시가총액 상위 20위 (브라우저 직접 호출이 실패할 때 쓰는 예비)
//   /api/top     : 거래대금 상위 20 종목 (?market=kr|us) — 국내는 ETF 제외, 미국은 나스닥+뉴욕+아멕스 합쳐 정렬
//   /api/market  : 국내·미국 휴장일(조기폐장 포함) + 서킷브레이커 발동 여부·시각 (30초)
//   /api/13f     : 유명 투자자 최신 13F 에서 새로 산·늘린 미국 주식 (?m=buffett|ackman|druck|tepper, SEC EDGAR)
//   /api/chart   : 지수·환율·원자재·종목 차트 (?kind=index|fx|cmdty|stock&code=…&range=1d|1w|1m|1y|10y|all)
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
    low: num(d.lowPriceRaw ?? d.lowPrice),
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

// 네이버 지수·종목 차트 공통. 1일=분, 1주=10분(없으면 일), 1달·1년=일, 10년=주, 전체=월(국내 1990년~, 미국 2010년~)
async function naverSeries(base, range, what) {
  const q = (unit, back) => getJSON(`${base}/${unit}?startDateTime=${back === 'all' ? '190001010000' : kstStamp(back)}&endDateTime=${kstStamp(-DAY)}`).then(toPoints);
  if (range === '1d') {
    const pts = lastDay(await q('minute', 7 * DAY));
    return pts.length ? { points: pts } : { points: [], note: `이 ${what}는 하루 단위 차트를 받을 수 없어요. 1주 이상을 골라 주세요.` };
  }
  if (range === '1w') {
    const pts = await q('minute10', 8 * DAY).catch(() => []);
    if (pts.length) return { points: pts.filter((p) => p.k >= kstStamp(7 * DAY)) };
    return { points: await q('day', 10 * DAY) };
  }
  if (range === '1m') return { points: await q('day', 31 * DAY) };
  if (range === '1y') return { points: await q('day', 366 * DAY) };
  if (range === '10y') return { points: await q('week', 3653 * DAY) };
  const pts = await q('month', 'all');
  return { points: pts, note: pts.length ? `${pts[0].t.slice(0, 4)}년부터 (네이버 제공 범위)` : '' };
}

async function indexChart(code, range) {
  const seg = DOMESTIC[code] ? 'domestic' : 'foreign';
  return naverSeries(`https://api.stock.naver.com/chart/${seg}/index/${encodeURIComponent(code)}`, range, '지수');
}

async function cmdtyChart(code, range) {
  const fx = !!FXS[code];
  const cat = fx ? 'exchange' : CMDTY[code][0];
  const info = fx ? 'marketindex' : 'futures';
  // 네이버는 환율·원자재를 10년(주 단위)까지만 준다 → '전체'도 10년
  const type = { '1d': 'day', '1w': 'areaMonth', '1m': 'areaMonth', '1y': 'areaYear', '10y': 'areaYearTen', all: 'areaYearTen' }[range];
  const j = await getJSON(
    `https://m.stock.naver.com/front-api/chart/pricesByPeriod?reutersCode=${code}&category=${cat}&chartInfoType=${info}&scriptChartType=${type}`,
  );
  let pts = toPoints(j.result && j.result.priceInfos);
  if (range === '1d') pts = lastDay(pts);
  if (range === '1w') pts = pts.slice(-6);
  return { points: pts, note: range === 'all' ? '네이버는 환율·원자재를 10년까지만 제공해요' : '' };
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
  return naverSeries(`https://api.stock.naver.com/chart/${seg}/item/${encodeURIComponent(code)}`, range, '종목');
}

/* ---------- 13F (SEC EDGAR) : 최신 보고서와 직전 보고서를 비교해 새로 산·늘린 종목 ---------- */
const MANAGERS = {
  buffett: { cik: 1067983, who: '워런 버핏', fund: '버크셔 해서웨이' },
  ackman: { cik: 1336528, who: '빌 애크먼', fund: '퍼싱 스퀘어' },
  druck: { cik: 1536411, who: '스탠리 드러켄밀러', fund: '듀케인 패밀리오피스' },
  tepper: { cik: 1656456, who: '데이비드 테퍼', fund: '아팔루사' },
};
const SEC_UA = { 'User-Agent': 'pan-dashboard/1.0 (https://pan.xiangdolee.workers.dev)', Accept: 'application/json, text/xml' };

async function secFetch(url, as) {
  const res = await fetch(url, { headers: SEC_UA });
  if (!res.ok) throw new Error(`sec ${res.status}`);
  return as === 'text' ? res.text() : res.json();
}

const xmlTag = (block, tag) => {
  const m = block.match(new RegExp(`<(?:\\w+:)?${tag}>([^<]*)</(?:\\w+:)?${tag}>`));
  return m ? m[1].trim() : '';
};

// 정보표(XML) → cusip 별 합계 (옵션 put/call 은 뺀다)
function parseInfoTable(xml) {
  const out = {};
  const blocks = xml.split(/<(?:\w+:)?infoTable>/).slice(1);
  for (const b of blocks) {
    if (xmlTag(b, 'putCall')) continue;
    if (xmlTag(b, 'sshPrnamtType') && xmlTag(b, 'sshPrnamtType') !== 'SH') continue;
    const cusip = xmlTag(b, 'cusip');
    if (!cusip) continue;
    const o = out[cusip] || (out[cusip] = { cusip, name: xmlTag(b, 'nameOfIssuer'), cls: xmlTag(b, 'titleOfClass'), shares: 0, value: 0 });
    o.shares += Number(xmlTag(b, 'sshPrnamt')) || 0;
    o.value += Number(xmlTag(b, 'value')) || 0;
  }
  // 규정상 달러 단위인데 천 달러 단위로 내는 곳이 있다(드러켄밀러 등) → 주당 평가액 중앙값이 2달러 미만이면 ×1000
  const per = Object.values(out).filter((x) => x.shares).map((x) => x.value / x.shares).sort((a, b) => a - b);
  if (per.length && per[Math.floor(per.length / 2)] < 2) Object.values(out).forEach((x) => { x.value *= 1000; });
  return out;
}

async function loadFiling(cik, acc) {
  const dir = `https://www.sec.gov/Archives/edgar/data/${cik}/${acc.replace(/-/g, '')}`;
  const idx = await secFetch(`${dir}/index.json`);
  const xmls = (idx.directory.item || []).filter((f) => /\.xml$/i.test(f.name) && !/primary_doc/i.test(f.name));
  if (!xmls.length) throw new Error('no info table');
  // 정보표가 여러 개면 가장 큰 파일
  xmls.sort((a, b) => (Number(b.size) || 0) - (Number(a.size) || 0));
  return parseInfoTable(await secFetch(`${dir}/${xmls[0].name}`, 'text'));
}

// '2026-06-30' → '2026Q2'
const quarterOf = (d) => `${d.slice(0, 4)}Q${Math.ceil(Number(d.slice(5, 7)) / 3)}`;

// 투자자의 13F 보고서 목록(최신 순). 같은 분기는 가장 최근 제출본 하나만
async function periods13f(key) {
  const r0 = await cached(`sub:${key}`, 6 * 3600e3, async () => {
    const m = MANAGERS[key];
    const sub = await secFetch(`https://data.sec.gov/submissions/CIK${String(m.cik).padStart(10, '0')}.json`);
    const r = sub.filings.recent;
    const seen = new Set();
    const list = [];
    for (let i = 0; i < r.form.length; i++) {
      // 2013년 2분기 이전 13F 는 XML 정보표가 없는 옛 형식이라 뺀다
      if (r.form[i] !== '13F-HR' || !r.reportDate[i] || r.reportDate[i] < '2013-06-30') continue;
      const q = quarterOf(r.reportDate[i]);
      if (seen.has(q)) continue;
      seen.add(q);
      list.push({ q, acc: r.accessionNumber[i], report: r.reportDate[i], filed: r.filingDate[i] });
    }
    list.sort((a, b) => (a.report < b.report ? 1 : -1));
    return list;
  });
  return r0.data;
}

async function load13f(key, q) {
  const m = MANAGERS[key];
  const all = await periods13f(key);
  if (!all.length) throw new Error('no 13F');
  let i = q ? all.findIndex((p) => p.q === q) : 0;
  if (i < 0) i = 0;
  const list = [all[i], all[i + 1]].filter(Boolean);
  const [cur, prev] = await Promise.all([loadFiling(m.cik, list[0].acc), list[1] ? loadFiling(m.cik, list[1].acc) : {}]);
  const total = Object.values(cur).reduce((s, x) => s + x.value, 0);
  const buys = [];
  for (const c of Object.values(cur)) {
    const p = prev[c.cusip];
    if (!p) buys.push({ type: 'new', ...c, prevShares: 0 });
    else if (c.shares > p.shares) buys.push({ type: 'add', ...c, prevShares: p.shares });
  }
  // 산 금액(늘린 주식 수 × 이번 분기 주당 평가액) 큰 순
  buys.forEach((b) => {
    const per = b.shares ? b.value / b.shares : 0;
    b.bought = (b.shares - b.prevShares) * per;
    b.weight = total ? (b.value / total) * 100 : 0;
    b.changePct = b.prevShares ? ((b.shares - b.prevShares) / b.prevShares) * 100 : null;
  });
  buys.sort((a, b) => b.bought - a.bought);
  return {
    key,
    q: list[0].q,
    periods: all.map((p) => ({ q: p.q, report: p.report, filed: p.filed })),
    hasPrev: !!list[1],
    who: m.who,
    fund: m.fund,
    report: list[0].report,
    filed: list[0].filed,
    prevReport: list[1] ? list[1].report : null,
    holdings: Object.keys(cur).length,
    total,
    buys: buys.slice(0, 20),
    buyCount: buys.length,
  };
}

/* ---------- 휴장일 · 서킷브레이커 ---------- */
const pad2 = (n) => String(n).padStart(2, '0');
const ymd = (y, m, d) => `${y}-${pad2(m)}-${pad2(d)}`;
const dow = (y, m, d) => new Date(Date.UTC(y, m - 1, d)).getUTCDay();
// n번째 요일 (n=-1 이면 마지막)
function nthDow(y, m, wd, n) {
  if (n > 0) { const first = dow(y, m, 1); return 1 + ((wd - first + 7) % 7) + (n - 1) * 7; }
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return last - ((dow(y, m, last) - wd + 7) % 7);
}
// 부활절(그레고리력) → 성금요일 계산용
function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return [month, day];
}
function addDays(s, n) {
  const d = new Date(s + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
// 토요일이면 금요일, 일요일이면 월요일로 (NYSE 규칙)
function observed(y, m, d) {
  const w = dow(y, m, d), s = ymd(y, m, d);
  return w === 6 ? addDays(s, -1) : w === 0 ? addDays(s, 1) : s;
}

// 뉴욕증권거래소 휴장일·조기폐장(13:00 ET)
function usHolidays(y) {
  const H = [];
  const add = (date, name) => H.push({ date, name });
  if (dow(y, 1, 1) !== 6) add(observed(y, 1, 1), '새해 첫날'); // 1/1 이 토요일이면 대체 휴장 없음
  add(ymd(y, 1, nthDow(y, 1, 1, 3)), '마틴 루서 킹 데이');
  add(ymd(y, 2, nthDow(y, 2, 1, 3)), '대통령의 날');
  const [em, ed] = easter(y);
  add(addDays(ymd(y, em, ed), -2), '성금요일');
  add(ymd(y, 5, nthDow(y, 5, 1, -1)), '메모리얼 데이');
  add(observed(y, 6, 19), '준틴스 (노예해방 기념일)');
  add(observed(y, 7, 4), '독립기념일');
  add(ymd(y, 9, nthDow(y, 9, 1, 1)), '노동절 (Labor Day)');
  const tg = ymd(y, 11, nthDow(y, 11, 4, 4));
  add(tg, '추수감사절');
  add(observed(y, 12, 25), '크리스마스');
  const early = [];
  const jul3 = ymd(y, 7, 3);
  if (dow(y, 7, 3) >= 1 && dow(y, 7, 3) <= 4) early.push({ date: jul3, name: '독립기념일 전날' });
  early.push({ date: addDays(tg, 1), name: '추수감사절 다음 날 (블랙 프라이데이)' });
  if (dow(y, 12, 24) >= 1 && dow(y, 12, 24) <= 4) early.push({ date: ymd(y, 12, 24), name: '크리스마스 이브' });
  return { holidays: H, early };
}

async function krHolidays(y) {
  const r = await cached(`krhol:${y}`, 12 * 3600e3, async () => {
    const list = await getJSON(`https://date.nager.at/api/v3/PublicHolidays/${y}/KR`);
    const out = list.map((h) => ({ date: h.date, name: h.localName === '새해' ? '신정' : h.localName }));
    // 대체공휴일: 주말과 겹치면 다음 월요일 (자료에 빠진 해가 있어 보충)
    const SUB = ['3·1절', '어린이날', '부처님 오신 날', '광복절', '개천절', '한글날', '크리스마스'];
    const have = new Set(out.map((h) => h.date));
    for (const h of out.slice()) {
      if (!SUB.includes(h.name)) continue;
      const [yy, mm, dd] = h.date.split('-').map(Number);
      const w0 = dow(yy, mm, dd);
      if (w0 !== 0 && w0 !== 6) continue;
      if (out.some((x) => x.name === h.name && x.date !== h.date)) continue;
      let s = addDays(h.date, w0 === 6 ? 2 : 1);
      while (have.has(s)) s = addDays(s, 1);
      out.push({ date: s, name: `대체공휴일 (${h.name})` });
      have.add(s);
    }
    const w = dow(y, 12, 31);
    if (w >= 1 && w <= 5) out.push({ date: ymd(y, 12, 31), name: '연말 휴장 (KRX)' });
    return out;
  });
  return r.data;
}

// 오늘 분봉에서 처음으로 기준선(전일 종가 대비 -x%) 아래로 떨어진 분을 찾는다
function firstCross(points, prev, pct) {
  for (const p of points) if ((p.v / prev - 1) * 100 <= -pct) return p;
  return null;
}
const hhmm = (s) => `${s.slice(8, 10)}:${s.slice(10, 12)}`;
const addMin = (t, n) => { const [h, m] = t.split(':').map(Number); const x = h * 60 + m + n; return `${pad2(Math.floor(x / 60) % 24)}:${pad2(x % 60)}`; };

async function detectKrCB(it) {
  const prev = it.price - it.change;
  const low = it.low ?? it.price;
  if (!prev || (low / prev - 1) * 100 > -8) return [];
  const pts = lastDay(await getJSON(`https://api.stock.naver.com/chart/domestic/index/${it.code}/minute?startDateTime=${kstStamp(DAY)}&endDateTime=${kstStamp(-DAY)}`).then(toPoints));
  const today = kstStamp(0).slice(0, 8);
  const tp = pts.filter((p) => p.k.slice(0, 8) === today);
  const ev = [];
  for (const [lv, pct] of [[1, 8], [2, 15], [3, 20]]) {
    const p = firstCross(tp, prev, pct);
    if (!p) continue;
    const at = hhmm(p.k);
    if (lv < 3 && at >= '14:50') continue; // 14:50 이후에는 1·2단계 발동 안 함
    ev.push(lv === 3
      ? { market: 'kr', index: it.name, level: lv, pct, at, haltEnd: '15:30', resume: null, note: '3단계 — 오늘 장 종료' }
      : { market: 'kr', index: it.name, level: lv, pct, at, haltEnd: addMin(at, 20), auctionEnd: addMin(at, 30), resume: addMin(at, 30), note: '20분 매매 정지 후 10분 단일가 매매' });
  }
  return ev;
}

async function detectUsCB(it) {
  const prev = it.price - it.change;
  const low = it.low ?? it.price;
  if (!prev || (low / prev - 1) * 100 > -7) return [];
  // 네이버는 미국 분봉을 주지 않아 Yahoo 1분봉으로 발동 시각을 찾는다
  const j = await getJSON('https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC?interval=1m&range=1d');
  const r = j.chart.result[0];
  const pc = r.meta.chartPreviousClose || prev;
  const closes = r.indicators.quote[0].close;
  const nyTime = (ts) => new Date(ts * 1000).toLocaleTimeString('en-GB', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false });
  const pts = r.timestamp.map((t, i) => ({ t: nyTime(t), v: closes[i] })).filter((p) => p.v);
  const ev = [];
  for (const [lv, pct] of [[1, 7], [2, 13], [3, 20]]) {
    const p = pts.find((x) => (x.v / pc - 1) * 100 <= -pct);
    if (!p) continue;
    if (lv < 3 && p.t >= '15:25') continue; // 15:25 이후에는 1·2단계 발동 안 함
    ev.push(lv === 3
      ? { market: 'us', index: 'S&P 500', level: lv, pct, at: p.t, haltEnd: '16:00', resume: null, tz: '뉴욕', note: '3단계 — 오늘 장 종료' }
      : { market: 'us', index: 'S&P 500', level: lv, pct, at: p.t, haltEnd: addMin(p.t, 15), resume: addMin(p.t, 15), tz: '뉴욕', note: '15분 매매 정지' });
  }
  return ev;
}

async function loadMarket() {
  const y = Number(kstStamp(0).slice(0, 4));
  const [k1, k2, idx] = await Promise.all([krHolidays(y).catch(() => []), krHolidays(y + 1).catch(() => []), cached('indices', 4000, loadIndices)]);
  const u1 = usHolidays(y), u2 = usHolidays(y + 1);
  const items = idx.data.items || [];
  const cb = [];
  for (const it of items) {
    try {
      if (it.code === 'KOSPI' || it.code === 'KOSDAQ') cb.push(...(await detectKrCB(it)));
      if (it.code === '.INX') cb.push(...(await detectUsCB(it)));
    } catch (e) { /* 발동 시각을 못 찾으면 건너뛴다 */ }
  }
  return {
    kr: { holidays: [...k1, ...k2] },
    us: { holidays: [...u1.holidays, ...u2.holidays], early: [...u1.early, ...u2.early] },
    cb,
  };
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
      if (pathname === '/api/market') {
        const r = await cached('market', 30000, loadMarket);
        return json({ ...r.data, fetchedAt: r.at });
      }
      if (pathname === '/api/13f') {
        const key = url.searchParams.get('m');
        if (!MANAGERS[key]) return json({ error: 'bad manager' }, 400);
        const q = url.searchParams.get('q') || '';
        if (q && !/^\d{4}Q[1-4]$/.test(q)) return json({ error: 'bad quarter' }, 400);
        // 최신(분기 지정 없음)은 6시간마다 새 보고서 확인, 지난 분기는 바뀌지 않으니 하루
        const r = await cached(`13f:${key}:${q}`, q ? 24 * 3600e3 : 6 * 3600e3, () => load13f(key, q));
        return json({ ...r.data, fetchedAt: r.at });
      }
      if (pathname === '/api/chart') {
        const kind = url.searchParams.get('kind');
        const code = url.searchParams.get('code');
        const range = url.searchParams.get('range');
        if (!['1d', '1w', '1m', '1y', '10y', 'all'].includes(range)) return json({ error: 'bad range' }, 400);
        let loader;
        if (kind === 'index' && INDEX_NAMES[code]) loader = () => indexChart(code, range);
        else if ((kind === 'cmdty' && CMDTY[code]) || (kind === 'fx' && FXS[code])) loader = () => cmdtyChart(code, range);
        else if (kind === 'stock' && /^(\d{6}|[A-Za-z0-9-]{1,10}(\.[A-Z]{1,2})?)$/.test(code || '')) loader = () => stockChart(code, range);
        else return json({ error: 'bad code' }, 400);
        const r = await cached(`chart:${kind}:${code}:${range}`, range === '1d' ? 30000 : range === '10y' || range === 'all' ? 6 * 3600e3 : 300000, loader);
        return json({ ...r.data, fetchedAt: r.at });
      }
    } catch (err) {
      return json({ error: String(err.message || err) }, 502);
    }
    if (pathname.startsWith('/api/')) return json({ error: 'not found' }, 404);
    return env.ASSETS.fetch(request);
  },
};
