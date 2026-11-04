// xip 크립토 탭 — 회원만 데이터(/api/crypto). 손님은 페이지만 열리고 값은 하나도 받지 않는다.
//   받는 방식은 시세 화면과 같은 결: 서버가 묶음마다 저장본으로 답하고(원본 호출 일정), 화면은 마지막 값을 먼저 보여 주고,
//   보이는 동안만 30초마다 다시 묻는다(김프만 자주 바뀜). 탭이 숨으면 멈춘다.
//   카드 · 표를 누르면 시세 탭과 같은 차트 창 (/api/crypto/chart, 회원만)
import { topTabs } from './tabs.js?v=1';

topTabs(document.getElementById('top-tabs'));

const $ = (id) => document.getElementById(id);
const KEY = 'xip:crypto:v1';
let me = { guest: true };
try { me = JSON.parse(document.querySelector('[data-xa-me]').getAttribute('data-xa-me')) || me; } catch (e) { /* 손님 */ }

const nf = (v, d = 0) => (v == null || !Number.isFinite(v) ? '—' : v.toLocaleString('ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d }));
const sign = (v, d = 1) => (v == null ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${nf(Math.abs(v), d)}`);
const cls = (v) => (v > 0 ? 'up' : v < 0 ? 'down' : '');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const kpi = (k) => document.querySelector(`.kpi[data-k="${k}"]`);
function setKpi(k, v, sub, subCls = '') {
  const el = kpi(k);
  el.querySelector('.kpi-v').textContent = v;
  const s = el.querySelector('.kpi-s');
  s.textContent = sub;
  s.className = `kpi-s ${subCls}`;
}
const FNG_KO = { 'Extreme Fear': '극단적 공포', Fear: '공포', Neutral: '중립', Greed: '탐욕', 'Extreme Greed': '극단적 탐욕' };
const md = (iso) => { const d = new Date(`${iso}T12:00:00Z`); return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${'일월화수목금토'[d.getUTCDay()]})`; };
const trillion = (b) => `${nf(b / 1000, 2)}조 달러`; // 10억 달러 단위 → 조 달러

// 카드 아래 작은 추세선 (최근 값들)
function spark(k, list) {
  const svg = kpi(k).querySelector('.spark');
  if (!svg || !list || list.length < 2) return;
  const lo = Math.min(...list);
  const hi = Math.max(...list);
  const sp = hi - lo || 1;
  const xy = list.map((v, i) => `${((i / (list.length - 1)) * 100).toFixed(2)},${(26 - ((v - lo) / sp) * 24).toFixed(2)}`);
  const col = list[list.length - 1] >= list[0] ? 'var(--up)' : 'var(--down)';
  svg.innerHTML = `<polygon points="0,28 ${xy.join(' ')} 100,28" fill="${col}" opacity=".1"/><polyline points="${xy.join(' ')}" fill="none" stroke="${col}" stroke-width="1.6" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>`;
}

function render(d) {
  if (d.dom) {
    setKpi('dom', `${nf(d.dom.btc, 1)}%`, `${d.dom.eth != null ? `이더리움 ${nf(d.dom.eth, 1)}% · ` : ''}전체 ${trillion(d.dom.total / 1e9)}`);
    const bars = kpi('dom').querySelectorAll('.kpi-dom i');
    bars[0].style.width = `${d.dom.btc}%`;
    bars[1].style.width = `${d.dom.eth || 0}%`;
  }
  if (d.fng && d.fng.now) {
    const n = d.fng.now;
    setKpi('fng', `${n.v}`, `${FNG_KO[n.label] || n.label} · 어제 ${d.fng.yesterday ? d.fng.yesterday.v : '—'} · 1주 전 ${d.fng.week ? d.fng.week.v : '—'}`);
    kpi('fng').querySelector('.kpi-bar i').style.left = `${n.v}%`;
    spark('fng', d.fng.series);
  }
  if (d.hash) {
    setKpi('hash', `${nf(d.hash.eh, 0)} EH/s`, `1주 전보다 ${sign(d.hash.weekChange)}%`, cls(d.hash.weekChange));
    spark('hash', d.hash.series);
  }
  if (d.mvrv) {
    const z = d.mvrv.z;
    const zone = z < 0 ? '저평가 구간' : z < 2 ? '보통' : z < 6 ? '과열 주의' : '과열';
    setKpi('mvrv', nf(z, 2), `${zone} · MVRV ${d.mvrv.mvrv ? nf(d.mvrv.mvrv, 2) : '—'} · ${md(d.mvrv.date)} 기준${d.mvrv.delayed ? ' (약 7일 늦음)' : ''}`);
    kpi('mvrv').querySelector('.kpi-bar i').style.left = `${Math.max(0, Math.min(100, ((z + 1) / 9) * 100))}%`; // −1 ~ 8
    spark('mvrv', d.mvrv.series);
  }
  if (d.kimp) {
    const b = d.kimp.btc;
    setKpi('kimp', b ? `${sign(b.premium, 2)}%` : '—', d.kimp.tether ? `테더 ${sign(d.kimp.tether.premium, 2)}% · 원/달러 ${nf(d.kimp.usdkrw, 1)}` : '');
    if (b) kpi('kimp').querySelector('.kpi-v').className = `kpi-v ${cls(b.premium)}`;
    $('kimp').querySelector('tbody').innerHTML = (d.kimp.top || []).map((c, i) => `<tr data-chart="up" data-code="${esc(c.sym)}" data-name="${esc(c.name)}" tabindex="0">
      <td class="rk">${i + 1}</td>
      <td class="nm"><b>${esc(c.name)}</b><small>${esc(c.sym)}</small></td>
      <td>${nf(c.krw, c.krw < 100 ? 2 : 0)}</td>
      <td class="hide-sm">${nf(c.global, c.global < 100 ? 2 : 0)}</td>
      <td class="${cls(c.premium)}"><b>${sign(c.premium, 2)}%</b></td></tr>`).join('') || '<tr><td colspan="5" class="empty">받은 값이 없어요</td></tr>';
  }
  if (d.m2) {
    setKpi('m2', trillion(d.m2.value), `1년 전보다 ${sign(d.m2.yoy)}% · ${d.m2.date.slice(0, 7).replace('-', '.')} 기준`, cls(d.m2.yoy));
    spark('m2', d.m2.series);
  }
  if (d.etf) {
    const main = ['IBIT', 'FBTC', 'BITB', 'ARKB', 'GBTC', 'BTC'];
    const cell = (v, extra = '') => `<td class="${cls(v)}${extra}">${v == null ? '<span class="dim">집계 전</span>' : sign(v)}</td>`;
    const max = Math.max(1, ...d.etf.days.map((r) => Math.abs(r.total || 0)));
    $('etf').querySelector('tbody').innerHTML = d.etf.days.slice().reverse().map((r) => {
      const known = Object.entries(r.by).filter(([t]) => !main.includes(t)).map(([, v]) => v);
      const etc = known.some((v) => v != null) ? known.reduce((a, v) => a + (v || 0), 0) : null;
      const w = r.total == null ? 0 : (Math.abs(r.total) / max) * 100;
      return `<tr data-chart="etf" tabindex="0"><th>${md(r.date)}</th>
        <td class="tot ${cls(r.total)}"><span class="bar" style="width:${w.toFixed(1)}%"></span><b>${r.total == null ? '—' : sign(r.total)}</b></td>
        ${cell(r.by.IBIT)}${cell(r.by.FBTC)}${cell(r.by.BITB, ' hide-sm')}${cell(r.by.ARKB, ' hide-sm')}${cell(r.by.GBTC)}${cell(r.by.BTC, ' hide-sm')}${cell(etc)}</tr>`;
    }).join('');
    const wk = d.etf.days.reduce((a, r) => a + (r.total || 0), 0);
    $('etf-note').innerHTML = `최근 ${d.etf.days.length}거래일 합계 <b class="${cls(wk)}">${sign(wk)}</b> 백만 달러 · + 순유입 · − 순유출 · "집계 전" 은 운용사가 아직 발표하지 않은 날`;
  }
  ['dom', 'fng', 'hash', 'mvrv', 'kimp', 'm2'].forEach((k) => {
    kpi(k).classList.remove('wait');
    kpi(k).classList.toggle('na', !d[k]);
    if (!d[k]) kpi(k).querySelector('.kpi-v').textContent = '—';
  });
  if (d.fetchedAt) $('cx-time').textContent = `${new Date(d.fetchedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })} 기준 · 김프 30초마다 · 누르면 차트`;
}

if (me.guest) {
  // 손님: 값은 하나도 받지 않는다 — 자리만 흐리게, 가입 · 로그인 안내
  document.body.classList.add('cx-locked');
  document.querySelectorAll('.kpi').forEach((k) => { k.classList.remove('wait'); k.querySelector('.kpi-v').textContent = '00.0'; });
  document.querySelectorAll('.cx-loading').forEach((r) => r.remove());
  $('cx-lock').hidden = false;
  $('top-flow').hidden = false;
  try { localStorage.removeItem(KEY); } catch (e) { /* 없음 */ }
} else {
  try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s) render(s); } catch (e) { /* 저장본 없음 */ }
  let timer = 0;
  const load = async () => {
    clearTimeout(timer);
    try {
      const r = await fetch('/api/crypto', { credentials: 'same-origin' });
      if (r.status === 401) { location.reload(); return; } // 로그아웃됨 → 손님 화면으로
      const d = await r.json();
      if (r.ok) {
        render(d);
        try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) { /* 저장 안 됨 */ }
      }
    } catch (e) { console.warn('[crypto]', e); }
    if (!document.hidden) timer = setTimeout(load, 30000);
  };
  load();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); else clearTimeout(timer); });
}

/* ---------- 차트 창 (시세 탭과 같은 모양) ---------- */
const sheet = $('sheet');
const cv = $('ch-canvas');
const plot = $('ch-plot');
const tip = $('ch-tip');
const segEl = $('ch-seg');
const RANGES = { std: [['1m', '1달'], ['3m', '3달'], ['1y', '1년'], ['all', '전체']], up: [['1d', '1일'], ['1m', '1달'], ['1y', '1년'], ['all', '전체']] };
const META = {
  fng: { name: '공포 · 탐욕 지수', sub: '0 극단적 공포 ~ 100 극단적 탐욕 · alternative.me', fmt: (v) => nf(v, 0) },
  hash: { name: '해시레이트', sub: '비트코인 채굴 연산력 · mempool.space', fmt: (v) => `${nf(v, 0)} EH/s` },
  mvrv: { name: 'MVRV Z-Score', sub: '(시가총액 − 실현 시가총액) ÷ 표준편차 · Coin Metrics 로 계산', fmt: (v) => nf(v, 2) },
  m2: { name: '미국 M2 통화량', sub: '연준 H.6 · 계절 조정 · 월 단위', fmt: (v) => trillion(v) },
  etf: { name: '비트코인 현물 ETF 순유입', sub: 'Farside Investors · 하루 순유입(백만 달러)', fmt: (v) => `${sign(v)}M`, bars: true },
  up: { name: '', sub: '업비트 원화 시세', fmt: (v) => `${nf(v, v < 100 ? 2 : 0)}원` },
};
let chart = null;
let lastFocus = null;
const cache = {};
const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// 알약 칸: 고른 칸 배경이 미끄러져 간다 (한 번 그리고 .on 만 바꾼다)
function placeInd(btn, first) {
  const ind = segEl.querySelector('.seg-ind');
  if (!btn || !segEl.offsetWidth) return;
  if (first || reduced()) ind.style.transition = 'none';
  ind.style.width = `${btn.offsetWidth}px`;
  ind.style.transform = `translateX(${btn.offsetLeft}px)`;
  if (first) { void ind.offsetWidth; ind.style.transition = ''; }
}
function drawSeg(kind, range) {
  const list = RANGES[kind === 'up' ? 'up' : 'std'];
  const want = kind === 'up' ? 'up' : 'std';
  if (segEl.dataset.kind !== want) {
    segEl.dataset.kind = want;
    segEl.querySelectorAll('button').forEach((b) => b.remove());
    list.forEach(([r, t]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.dataset.range = r;
      b.textContent = t;
      segEl.append(b);
    });
  }
  segEl.querySelectorAll('button').forEach((b) => { b.classList.toggle('on', b.dataset.range === range); b.setAttribute('aria-selected', b.dataset.range === range); });
  placeInd(segEl.querySelector('button.on'), true);
}
segEl.addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b || b.classList.contains('on') || !chart) return;
  segEl.querySelectorAll('button').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-selected', x === b); });
  placeInd(b); // 누르는 즉시 배경부터, 자료는 뒤따라
  loadChart(b.dataset.range);
});
addEventListener('resize', () => { if (chart) placeInd(segEl.querySelector('button.on'), true); });

function openChart(kind, code, name) {
  const m = META[kind];
  if (!m) return;
  lastFocus = document.activeElement;
  const range = kind === 'up' ? '1m' : kind === 'etf' ? '3m' : '1y';
  chart = { kind, code, range, points: [], hover: null, fmt: m.fmt, bars: !!m.bars };
  $('ch-name').textContent = kind === 'up' ? `${name || code} (${code})` : kind === 'etf' ? `${code || '전체 ETF'} 순유입` : m.name;
  $('ch-sub').textContent = kind === 'etf' ? `Farside Investors · ${code ? code : '모든 ETF 합계'} · 하루 순유입(백만 달러)` : m.sub;
  $('ch-price').textContent = '';
  $('ch-chg').textContent = '';
  $('ch-note').textContent = '';
  sheet.hidden = false;
  document.body.classList.add('lock');
  drawSeg(kind, range);
  segEl.querySelector('button.on').focus({ preventScroll: true });
  loadChart(range);
}
function closeChart() {
  sheet.hidden = true;
  chart = null;
  document.body.classList.remove('lock');
  if (lastFocus) lastFocus.focus({ preventScroll: true });
}
sheet.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeChart(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && chart) closeChart(); });

async function loadChart(range) {
  const c = chart;
  c.range = range;
  c.hover = null;
  const key = `${c.kind}:${c.code}:${range}`;
  const msg = $('ch-msg');
  msg.textContent = '불러오는 중…';
  msg.hidden = false;
  try {
    let d = cache[key] && Date.now() - cache[key].at < 120000 ? cache[key].d : null;
    if (!d) {
      const r = await fetch(`/api/crypto/chart?k=${c.kind}&code=${encodeURIComponent(c.code || '')}&range=${range}`, { credentials: 'same-origin' });
      d = await r.json();
      if (!r.ok) throw new Error(r.status === 401 ? '회원 로그인이 필요해요' : '차트를 받지 못했어요 · 잠시 뒤 다시');
      cache[key] = { at: Date.now(), d };
    }
    if (chart !== c || c.range !== range) return; // 그 사이 다른 걸 골랐다
    c.points = d.points || [];
    $('ch-note').textContent = d.note || '';
    msg.textContent = c.points.length < 2 ? '이 기간 자료가 없어요' : '';
    msg.hidden = c.points.length >= 2;
    stats();
    draw();
  } catch (e) {
    if (chart === c) { msg.textContent = e.message; msg.hidden = false; }
  }
}
function stats() {
  const p = chart.points;
  const f = chart.fmt;
  if (p.length < 2) { ['st-high', 'st-low', 'st-chg'].forEach((id) => { $(id).textContent = '—'; }); return; }
  const vs = p.map((x) => x.v);
  const last = vs[vs.length - 1];
  $('ch-price').textContent = f(last);
  $('ch-chg').textContent = `${p[p.length - 1].t} 기준`;
  $('st-high').textContent = f(Math.max(...vs));
  $('st-low').textContent = f(Math.min(...vs));
  if (chart.bars) {
    const sum = vs.reduce((a, v) => a + v, 0);
    $('st-chg').textContent = `합계 ${sign(sum)}M`;
    $('st-chg').className = cls(sum);
    return;
  }
  // 점수형(공포탐욕 · MVRV-Z)은 % 대신 차이만
  if (chart.kind === 'fng' || chart.kind === 'mvrv') {
    const diff = last - vs[0];
    $('st-chg').textContent = sign(diff, chart.kind === 'fng' ? 0 : 2);
    $('st-chg').className = cls(diff);
    return;
  }
  const ch = ((last - vs[0]) / Math.abs(vs[0] || 1)) * 100;
  $('st-chg').textContent = `${sign(ch, 2)}%`;
  $('st-chg').className = cls(ch);
}
const PAD = { l: 6, t: 30, b: 28 };
function draw() {
  const w = plot.clientWidth;
  const h = plot.clientHeight;
  if (!chart || !w || !h) return;
  const dpr = devicePixelRatio || 1;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  const p = chart.points;
  if (p.length < 2) return;
  const f = chart.fmt;
  let hi = Math.max(...p.map((x) => x.v));
  let lo = Math.min(...p.map((x) => x.v));
  if (chart.bars) { hi = Math.max(hi, 0); lo = Math.min(lo, 0); }
  if (hi === lo) { hi += 1; lo -= 1; }
  const span = hi - lo;
  hi += span * 0.08;
  lo -= span * 0.08;
  const font = cssVar('--font');
  const axis = (v) => (Math.abs(v) >= 1000 ? nf(v, 0) : nf(v, Math.abs(v) < 10 ? 2 : 1));
  g.font = `13px ${font}`;
  let labW = 0;
  for (let i = 0; i <= 4; i++) labW = Math.max(labW, g.measureText(axis(lo + ((hi - lo) * i) / 4)).width);
  const X0 = PAD.l;
  const X1 = w - Math.ceil(labW) - 14;
  const Y0 = PAD.t;
  const Y1 = h - PAD.b;
  chart.X0 = X0;
  chart.X1 = X1;
  const x = (i) => X0 + ((X1 - X0) * i) / (p.length - 1);
  const y = (v) => Y1 - ((Y1 - Y0) * (v - lo)) / (hi - lo);
  g.textBaseline = 'middle';
  g.textAlign = 'left';
  for (let i = 0; i <= 4; i++) {
    const gv = lo + ((hi - lo) * i) / 4;
    g.strokeStyle = cssVar('--line');
    g.lineWidth = 1;
    g.beginPath(); g.moveTo(X0, Math.round(y(gv)) + 0.5); g.lineTo(X1, Math.round(y(gv)) + 0.5); g.stroke();
    g.fillStyle = cssVar('--sub');
    g.fillText(axis(gv), X1 + 8, y(gv));
  }
  const up = cssVar('--up');
  const down = cssVar('--down');
  if (chart.bars) {
    // 하루 순유입: 0 선 위는 빨강(유입), 아래는 파랑(유출)
    const bw = Math.max(1, ((X1 - X0) / p.length) * 0.7);
    p.forEach((pt, i) => {
      g.fillStyle = pt.v >= 0 ? up : down;
      const top = y(Math.max(pt.v, 0));
      const bot = y(Math.min(pt.v, 0));
      g.fillRect(x(i) - bw / 2, top, bw, Math.max(1, bot - top));
    });
    g.strokeStyle = cssVar('--sub');
    g.beginPath(); g.moveTo(X0, Math.round(y(0)) + 0.5); g.lineTo(X1, Math.round(y(0)) + 0.5); g.stroke();
  } else {
    const rising = p[p.length - 1].v >= p[0].v;
    const col = rising ? up : down;
    const grad = g.createLinearGradient(0, Y0, 0, Y1);
    grad.addColorStop(0, rising ? 'rgba(228,41,57,.18)' : 'rgba(27,100,218,.18)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.beginPath();
    p.forEach((pt, i) => (i ? g.lineTo(x(i), y(pt.v)) : g.moveTo(x(i), y(pt.v))));
    g.lineTo(X1, Y1); g.lineTo(X0, Y1); g.closePath();
    g.fillStyle = grad; g.fill();
    g.beginPath();
    p.forEach((pt, i) => (i ? g.lineTo(x(i), y(pt.v)) : g.moveTo(x(i), y(pt.v))));
    g.strokeStyle = col; g.lineWidth = 2; g.lineJoin = 'round'; g.stroke();
    g.fillStyle = col;
    g.beginPath(); g.arc(x(p.length - 1), y(p[p.length - 1].v), 4, 0, Math.PI * 2); g.fill();
  }
  g.fillStyle = cssVar('--sub');
  g.textBaseline = 'top';
  const n = w < 420 ? 3 : 4;
  for (let j = 0; j < n; j++) {
    const i = Math.round(((p.length - 1) * j) / (n - 1));
    g.textAlign = j === 0 ? 'left' : j === n - 1 ? 'right' : 'center';
    g.fillText(p[i].t, x(i), Y1 + 8);
  }
  if (chart.hover != null) {
    const i = chart.hover;
    const hx = x(i);
    g.strokeStyle = cssVar('--dark');
    g.lineWidth = 1;
    g.beginPath(); g.moveTo(Math.round(hx) + 0.5, Y0 - 6); g.lineTo(Math.round(hx) + 0.5, Y1); g.stroke();
    if (!chart.bars) {
      g.fillStyle = '#fff'; g.strokeStyle = cssVar('--dark'); g.lineWidth = 2.5;
      g.beginPath(); g.arc(hx, y(p[i].v), 5, 0, Math.PI * 2); g.fill(); g.stroke();
    }
    tip.querySelector('b').textContent = f(p[i].v);
    tip.querySelector('span').textContent = p[i].t;
    tip.hidden = false;
    const tw = tip.offsetWidth / 2;
    tip.style.left = `${Math.max(tw, Math.min(w - tw, hx))}px`;
  } else tip.hidden = true;
}
const hoverAt = (cx) => {
  if (!chart || chart.points.length < 2) return;
  const r = cv.getBoundingClientRect();
  const t = (cx - r.left - chart.X0) / (chart.X1 - chart.X0);
  chart.hover = Math.max(0, Math.min(chart.points.length - 1, Math.round(t * (chart.points.length - 1))));
  draw();
};
cv.addEventListener('pointermove', (e) => hoverAt(e.clientX));
cv.addEventListener('pointerdown', (e) => hoverAt(e.clientX));
cv.addEventListener('pointerleave', () => { if (chart) { chart.hover = null; draw(); } });
if (window.ResizeObserver) new ResizeObserver(() => { if (chart) draw(); }).observe(plot);

// 누르면 차트 (회원만 — 손님은 값이 없다)
document.addEventListener('click', (e) => {
  if (me.guest) return;
  const el = e.target.closest('[data-chart]');
  if (!el || sheet.contains(el)) return;
  if (el.matches('tr[data-chart="etf"]')) {
    // 날짜 줄: 누른 칸의 종목 차트 (날짜 · 합계 · 기타는 전체 합계)
    const cell = e.target.closest('td, th');
    const col = [...el.children].indexOf(cell);
    const th = $('etf').querySelectorAll('thead th')[col];
    const btn = th && th.querySelector('[data-code]');
    openChart('etf', btn ? btn.dataset.code : '');
    return;
  }
  openChart(el.dataset.chart, el.dataset.code || '', el.dataset.name || '');
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || me.guest) return;
  const tr = e.target.closest('tr[data-chart]');
  if (tr) openChart(tr.dataset.chart, tr.dataset.code || '', tr.dataset.name || '');
});
