// xip 미국 경제지표 (/api/macro, 누구나) — 묶음마다 알맞은 간격으로만 원본에 묻는다 (그 사이엔 저장본, 기존 swr 그대로)
//   fed   : 연준 기준금리 목표 범위 · 실효금리(EFFR) — 뉴욕 연준                                   30분 / 7일
//   fomc  : FOMC 회의 일정 — 연준 누리집 표                                                        12시간 / 30일
//   bls   : CPI · 근원 CPI(계절조정 · 비조정) · 비농업 고용 · 실업률 — 미국 노동통계국 BLS v1(키 없음)   3시간 / 40일
//   pce   : PCE · 근원 PCE 물가지수 — 미국 경제분석국 BEA 표 2.8.4 (DBnomics 사본)                   3시간 / 40일
//   cal   : 이번 주 발표 예정 지표의 예상치(컨센서스) — Forex Factory 주간 달력                      1시간 / 14일
//   zq    : 연방기금 선물(30일) 가격 — Yahoo Finance → 다음 FOMC 들의 인하 · 동결 · 인상 확률을 계산    10분 / 1일
// 원본마다 마지막 좋은 값을 Durable Object(PREFS, 이름 xip:macro)에 남겨 둔다 → 처음 뜬 데이터센터 · 원본이 막혀도 값이 있다.
// 예상치는 "발표 전 주"에만 달력에 나오므로, 본 예상치를 저장해 두었다가 실제 값이 나오면 그 옆에 붙인다(본 적 없으면 "—").
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
async function get(url, as = 'json', ms = 12000, init = {}) {
  const res = await fetch(url, { ...init, headers: { 'User-Agent': UA, Accept: as === 'json' ? 'application/json' : 'text/html,*/*', ...(init.headers || {}) }, signal: AbortSignal.timeout(ms) });
  if (!res.ok) throw new Error(`${new URL(url).host} ${res.status}`);
  return as === 'json' ? res.json() : res.text();
}
const num = (v) => { const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[,%K]/g, '')); return Number.isFinite(n) ? n : null; };
const pad = (n) => String(n).padStart(2, '0');
const MON = { January: 1, February: 2, March: 3, April: 4, May: 5, June: 6, July: 7, August: 8, September: 9, October: 10, November: 11, December: 12 };
const MON3 = Object.fromEntries(Object.entries(MON).map(([k, v]) => [k.slice(0, 3), v]));
const monOf = (s) => MON[s] || MON3[s.slice(0, 3)];

/* ---------- 원본별 ---------- */
async function loadFed() {
  const r = (await get('https://markets.newyorkfed.org/api/rates/unsecured/effr/last/1.json')).refRates[0];
  return { from: num(r.targetRateFrom), to: num(r.targetRateTo), effr: num(r.percentRate), date: r.effectiveDate };
}

// 연준 누리집 FOMC 일정 표: 연도마다 "2026 FOMC Meetings" 아래 월 · 날짜(예: 8-9*, Apr/May 30-1). * = 경제전망(SEP) 함께
async function loadFomc() {
  const html = await get('https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm', 'text', 15000);
  const out = [];
  for (const part of html.split(/<h4[^>]*>/).slice(1)) {
    const y = +((part.match(/(\d{4})\s*FOMC Meetings/) || [])[1] || 0);
    if (!y) continue;
    for (const m of part.matchAll(/fomc-meeting__month[^>]*>\s*<strong>([A-Za-z/]+)<\/strong>[\s\S]*?fomc-meeting__date[^>]*>([^<]+)</g)) {
      const raw = m[2].trim();
      if (/notation|unscheduled|cancel/i.test(raw)) continue;
      const months = m[1].split('/').map(monOf);
      const days = raw.replace(/[*()]/g, '').trim().split('-').map((d) => parseInt(d, 10)).filter(Number.isFinite);
      if (!months[0] || !days.length) continue;
      const endM = months[months.length - 1];
      const endD = days[days.length - 1];
      const endY = endM < months[0] ? y + 1 : y;
      out.push({ start: `${y}-${pad(months[0])}-${pad(days[0])}`, end: `${endY}-${pad(endM)}-${pad(endD)}`, sep: raw.includes('*') });
    }
  }
  if (!out.length) throw new Error('fomc: no meetings');
  out.sort((a, b) => (a.end < b.end ? -1 : 1));
  return { meetings: out.filter((x, i, a) => !i || a[i - 1].end !== x.end) };
}

// BLS v1: 한 번에 여러 계열 (키 없이 하루 25번까지 → 3시간마다만)
const BLS = {
  cpiN: 'CUUR0000SA0', coreN: 'CUUR0000SA0L1E', cpiS: 'CUSR0000SA0', coreS: 'CUSR0000SA0L1E', nfp: 'CES0000000001', unemp: 'LNS14000000',
};
// BLS 는 키 없이 IP 하나에 하루 25번 — 클라우드플레어는 여러 사이트가 같은 IP 를 써서 자주 막힌다.
//   막히면 30분 동안은 다시 묻지 않고(저장본 · DO 값), 화면(방문자 브라우저)이 BLS 에서 직접 받아 보내 주면 그 응답에만 쓴다.
let blsFailAt = 0;
async function loadBls() {
  if (Date.now() - blsFailAt < 30 * 60e3) throw new Error('bls: 잠시 쉬는 중(하루 한도)');
  try {
    const d = await get('https://api.bls.gov/publicAPI/v1/timeseries/data/', 'json', 15000, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ seriesid: Object.values(BLS) }),
    });
    if (d.status !== 'REQUEST_SUCCEEDED') throw new Error(`bls ${d.status} ${(d.message || []).join(' ').slice(0, 80)}`);
    return parseBls(d.Results.series);
  } catch (e) { blsFailAt = Date.now(); throw e; }
}
export const BLS_IDS = Object.values(BLS);
function parseBls(series) {
  const out = {};
  for (const [k, id] of Object.entries(BLS)) {
    const s = (series || []).find((x) => x && x.seriesID === id);
    if (!s) throw new Error(`bls missing ${id}`);
    out[k] = s.data.filter((x) => /^M(0[1-9]|1[0-2])$/.test(x.period) && x.value !== '-')
      .map((x) => ({ p: `${x.year}-${x.period.slice(1)}`, v: num(x.value) })).filter((x) => x.v != null)
      .sort((a, b) => (a.p < b.p ? -1 : 1));
  }
  return out;
}

async function loadPce() {
  const d = await get('https://api.db.nomics.world/v22/series?series_ids=BEA/NIPA-T20804/DPCERG-M,BEA/NIPA-T20804/DPCCRG-M&observations=1&metadata=false', 'json', 15000);
  const pick = (code) => {
    const s = d.series.docs.find((x) => x.series_code === code);
    if (!s) throw new Error(`pce missing ${code}`);
    return s.period.map((p, i) => ({ p, v: num(s.value[i]) })).filter((x) => x.v != null).slice(-30);
  };
  return { pce: pick('DPCERG-M'), core: pick('DPCCRG-M') };
}

// Forex Factory 주간 달력 (미국 · 지켜보는 지표만)
const CAL_TITLES = ['CPI y/y', 'CPI m/m', 'Core CPI m/m', 'Core CPI y/y', 'PCE Price Index m/m', 'PCE Price Index y/y', 'Core PCE Price Index m/m', 'Core PCE Price Index y/y',
  'Non-Farm Employment Change', 'Unemployment Rate', 'Federal Funds Rate'];
let calFailAt = 0;
async function loadCal() {
  if (Date.now() - calFailAt < 20 * 60e3) throw new Error('cal: 잠시 쉬는 중(429)');
  let list;
  try { list = await get('https://nfs.faireconomy.media/ff_calendar_thisweek.json', 'json', 12000); } catch (e) { calFailAt = Date.now(); throw e; }
  return { events: list.filter((e) => e.country === 'USD' && CAL_TITLES.includes(e.title)).map((e) => ({ title: e.title, date: e.date, forecast: e.forecast || '', previous: e.previous || '' })) };
}

// 연방기금 선물: ZQ + 월 기호 + 연도 2자리 (예: 2026년 12월 = ZQZ26.CBT). 가격 100 − 그달 평균 금리
const MCODE = 'FGHJKMNQUVXZ';
async function loadZq(months) {
  const res = await Promise.all(months.map(async (ym) => {
    const [y, m] = ym.split('-').map(Number);
    const sym = `ZQ${MCODE[m - 1]}${String(y).slice(2)}.CBT`;
    try {
      const j = await get(`https://query1.finance.yahoo.com/v8/finance/chart/${sym}?range=1d&interval=1d`, 'json', 8000);
      const p = num(j.chart.result[0].meta.regularMarketPrice);
      return p ? [ym, p] : null;
    } catch { return null; }
  }));
  const prices = Object.fromEntries(res.filter(Boolean));
  if (Object.keys(prices).length < 2) throw new Error('zq: too few prices');
  return { prices };
}

/* ---------- 계산 ---------- */
const ymOf = (iso) => iso.slice(0, 7);
const addMonth = (ym, n) => { const [y, m] = ym.split('-').map(Number); const t = new Date(Date.UTC(y, m - 1 + n, 1)); return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}`; };
const daysIn = (ym) => { const [y, m] = ym.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };

// CME FedWatch 와 같은 방식: 회의 달 선물 평균 금리에서 회의 뒤 금리를 풀고, 0.25%p 단위 두 결과로 나눠 확률을 이어 곱한다
function fedwatch(meetings, prices, fed) {
  if (!fed || !prices) return null;
  const today = new Date(Date.now() - 5 * 3600e3).toISOString().slice(0, 10); // 뉴욕 날짜쯤
  const next = meetings.filter((m) => m.end >= today).slice(0, 4);
  if (!next.length) return null;
  const meetMonths = new Set(next.map((m) => ymOf(m.end)));
  const curYm = ymOf(today);
  let rStart = !meetMonths.has(curYm) && prices[curYm] ? 100 - prices[curYm] : fed.effr;
  let dist = { [fed.from.toFixed(2)]: 1 };
  const out = [];
  for (const m of next) {
    const ym = ymOf(m.end);
    if (!prices[ym]) break;
    const N = daysIn(ym);
    const d = +m.end.slice(8); // 결정일 다음 날부터 새 금리
    const after = N - d;
    const nextYm = addMonth(ym, 1);
    let rEnd;
    if (!meetMonths.has(nextYm) && prices[nextYm]) rEnd = 100 - prices[nextYm]; // 다음 달에 회의가 없으면 그 달 선물이 곧 회의 뒤 금리
    else if (after > 0) rEnd = ((100 - prices[ym]) * N - rStart * d) / after;
    else break;
    const steps = (rEnd - rStart) / 0.25;
    const k = Math.floor(steps);
    const frac = steps - k;
    const nd = {};
    for (const [lo, p] of Object.entries(dist)) {
      const a = (+lo + k * 0.25).toFixed(2);
      const b = (+lo + (k + 1) * 0.25).toFixed(2);
      nd[a] = (nd[a] || 0) + p * (1 - frac);
      nd[b] = (nd[b] || 0) + p * frac;
    }
    dist = Object.fromEntries(Object.entries(nd).filter(([, p]) => p > 0.0005));
    const cur = fed.from;
    let cut = 0; let hold = 0; let hike = 0;
    for (const [lo, p] of Object.entries(dist)) { if (+lo < cur - 1e-9) cut += p; else if (+lo > cur + 1e-9) hike += p; else hold += p; }
    out.push({
      date: m.end, sep: m.sep, rate: rEnd,
      cut: cut * 100, hold: hold * 100, hike: hike * 100,
      dist: Object.entries(dist).map(([lo, p]) => ({ from: +lo, to: +lo + 0.25, p: p * 100 })).sort((a, b) => a.from - b.from),
    });
    rStart = rEnd;
  }
  return out.length ? out : null;
}

const at = (list, i) => list[list.length - 1 - i] || null;
const yoy = (list, i = 0) => { const a = at(list, i); const b = list.find((x) => x.p === addMonth(a.p, -12)); return a && b ? (a.v / b.v - 1) * 100 : null; };
const mom = (list, i = 0) => { const a = at(list, i); const b = at(list, i + 1); return a && b ? (a.v / b.v - 1) * 100 : null; };
const diffK = (list, i = 0) => { const a = at(list, i); const b = at(list, i + 1); return a && b ? a.v - b.v : null; };

// 줄: 실제(최근 달) · 이전(그 전 달) · 예상(그 발표의 예상치, 본 적 있을 때) · 다음 발표 예정
function rows(bls, pce) {
  const R = [];
  const add = (key, label, unit, list, f, cal, sub) => {
    if (!list || list.length < 14) return;
    R.push({ key, label, unit, period: at(list, 0).p, actual: f(list, 0), prev: f(list, 1), cal, sub: sub ? sub(list) : null });
  };
  if (bls) {
    add('cpi', 'CPI', '전년비 %', bls.cpiN, yoy, 'CPI y/y', () => ({ label: '전월비', v: mom(bls.cpiS, 0), cal: 'CPI m/m' }));
    add('core_cpi', '근원 CPI', '전월비 %', bls.coreS, mom, 'Core CPI m/m', () => ({ label: '전년비', v: yoy(bls.coreN, 0), cal: 'Core CPI y/y' }));
  }
  if (pce) {
    add('pce', 'PCE 물가', '전년비 %', pce.pce, yoy, 'PCE Price Index y/y', (l) => ({ label: '전월비', v: mom(l, 0), cal: 'PCE Price Index m/m' }));
    add('core_pce', '근원 PCE', '전월비 %', pce.core, mom, 'Core PCE Price Index m/m', (l) => ({ label: '전년비', v: yoy(l, 0), cal: 'Core PCE Price Index y/y' }));
  }
  if (bls) {
    add('nfp', '비농업 고용', '천 명', bls.nfp, diffK, 'Non-Farm Employment Change');
    add('unemp', '실업률', '%', bls.unemp, (l, i) => (at(l, i) ? at(l, i).v : null), 'Unemployment Rate');
  }
  return R;
}

/* ---------- 묶음 ---------- */
// 원본을 받으면 DO 에도 남기고, 못 받으면 DO 에 남은 값을 쓴다
function durable(store, key, loader) {
  return async () => {
    try {
      const v = await loader();
      if (store) store.setVal(key, { at: Date.now(), v }).catch(() => {});
      return v;
    } catch (e) {
      const s = store ? await store.getVal(key).catch(() => null) : null;
      if (s && s.v) return s.v;
      throw e;
    }
  };
}

export async function macroAll(ctx, swr, env, opts = {}) {
  const H = 3600e3;
  const store = env.PREFS ? env.PREFS.get(env.PREFS.idFromName('xip:macro')) : null;
  const errors = {};
  const part = (key, ttl, stale, f) => swr(ctx, `m:${key}`, ttl, stale, durable(store, key, f)).then((r) => r.data)
    .catch((e) => { errors[key.split(':')[0]] = String(e.message || e).slice(0, 160); return null; });
  let [fed, fomc, bls, pce, cal] = await Promise.all([
    part('fed', 30 * 60e3, 7 * 24 * H, loadFed),
    part('fomc', 12 * H, 30 * 24 * H, loadFomc),
    part('bls', 3 * H, 40 * 24 * H, loadBls),
    part('pce', 3 * H, 40 * 24 * H, loadPce),
    part('cal', H, 14 * 24 * H, loadCal),
  ]);
  // 서버가 BLS 를 못 받았으면, 방문자 브라우저가 보낸 BLS 응답을 이 응답에만 쓴다(저장하지 않음)
  let blsFrom = bls ? 'server' : null;
  if (!bls && Array.isArray(opts.blsSeries)) {
    try { bls = parseBls(opts.blsSeries); blsFrom = 'browser'; } catch (e) { errors.blsClient = String(e.message || e).slice(0, 120); }
  }
  // 선물: 다음 회의들이 있는 달 + 그 다음 달까지
  let zq = null;
  if (fomc) {
    const today = new Date().toISOString().slice(0, 10);
    const next = fomc.meetings.filter((m) => m.end >= today).slice(0, 4);
    if (next.length) {
      const months = [];
      for (let ym = today.slice(0, 7); ym <= addMonth(ymOf(next[next.length - 1].end), 1); ym = addMonth(ym, 1)) months.push(ym);
      zq = await part(`zq:${months[0]}`, 10 * 60e3, 24 * H, () => loadZq(months));
    }
  }
  const fw = fomc ? fedwatch(fomc.meetings, zq && zq.prices, fed) : null;

  // 예상치 장부: 달력에서 본 예상치를 "그 발표가 담는 달"(발표 달의 전달 — CPI · PCE · 고용 모두)과 함께 남긴다.
  //   발표 시각이 지나면 그 달의 예상으로 옮기고, 실제 값이 그 달이 되면 옆에 붙인다.
  const R = rows(bls, pce);
  const book = (store && (await store.getVal('book').catch(() => null))) || {};
  const before = JSON.stringify(book);
  const now = Date.now();
  const etYm = (iso) => new Date(Date.parse(iso) - 5 * 3600e3).toISOString().slice(0, 7);
  for (const e of (cal && cal.events) || []) {
    if (!e.forecast) continue;
    const b = book[e.title] || {};
    if (Date.parse(e.date) > now) b.up = { date: e.date, forecast: e.forecast, period: e.title === 'Federal Funds Rate' ? e.date.slice(0, 10) : addMonth(etYm(e.date), -1) };
    book[e.title] = b;
  }
  for (const b of Object.values(book)) {
    if (b.up && Date.parse(b.up.date) <= now) { b.done = { period: b.up.period, forecast: b.up.forecast, date: b.up.date }; delete b.up; }
  }
  if (store && JSON.stringify(book) !== before) store.setVal('book', book).catch(() => {});
  const fc = (title, period) => { const b = book[title]; return b && b.done && b.done.period === period ? b.done.forecast : null; };
  const up = (title, period) => {
    const b = book[title];
    if (b && b.up) return { date: b.up.date, forecast: b.up.forecast, released: false };
    if (b && b.done && period && b.done.period > period) return { date: b.done.date, forecast: b.done.forecast, released: true }; // 발표됐는데 원본에 아직 없음
    return null;
  };
  for (const r of R) {
    r.forecast = fc(r.cal, r.period);
    r.next = up(r.cal, r.period);
    if (r.sub) { r.sub.forecast = fc(r.sub.cal, r.period); r.sub.next = up(r.sub.cal, r.period); }
  }
  const nextMeeting = fomc ? fomc.meetings.find((m) => m.end >= new Date().toISOString().slice(0, 10)) || null : null;
  return {
    fed: fed ? { ...fed, next: nextMeeting, forecast: up('Federal Funds Rate') } : null,
    fedwatch: fw,
    rows: R,
    sources: { fed: !!fed, fomc: !!fomc, bls: blsFrom, pce: !!pce, cal: !!cal, zq: !!zq },
    blsIds: blsFrom === 'server' ? undefined : BLS_IDS,
    errors,
  };
}
