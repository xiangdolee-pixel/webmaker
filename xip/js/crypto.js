// xip 크립토 탭 — 회원만 데이터(/api/crypto). 손님은 페이지만 열리고 값은 하나도 받지 않는다.
//   받는 방식은 시세 화면과 같은 결: 서버가 묶음마다 저장본으로 답하고(원본 호출 일정), 화면은 마지막 값을 먼저 보여 주고,
//   보이는 동안만 30초마다 다시 묻는다(김프만 자주 바뀜). 탭이 숨으면 멈춘다.
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
const trillion = (b) => `${nf(b / 1000, 2)}조 달러`; // FRED 는 10억 달러 단위

function render(d) {
  if (d.dom) setKpi('dom', `${nf(d.dom.btc, 1)}%`, `이더리움 ${nf(d.dom.eth, 1)}% · 전체 ${trillion(d.dom.total / 1e9)}`);
  if (d.fng && d.fng.now) {
    const n = d.fng.now;
    setKpi('fng', `${n.v}`, `${FNG_KO[n.label] || n.label} · 어제 ${d.fng.yesterday ? d.fng.yesterday.v : '—'} · 1주 전 ${d.fng.week ? d.fng.week.v : '—'}`);
    const bar = kpi('fng').querySelector('.kpi-bar i');
    bar.style.left = `${n.v}%`;
  }
  if (d.hash) setKpi('hash', `${nf(d.hash.eh, 0)} EH/s`, `1주 전보다 ${sign(d.hash.weekChange)}%`, cls(d.hash.weekChange));
  if (d.mvrv) {
    const z = d.mvrv.z;
    const zone = z < 0 ? '저평가 구간' : z < 2 ? '보통' : z < 6 ? '과열 주의' : '과열';
    setKpi('mvrv', nf(z, 2), `${zone} · MVRV ${d.mvrv.mvrv ? nf(d.mvrv.mvrv, 2) : '—'} · ${md(d.mvrv.date)} 기준${d.mvrv.delayed ? ' (약 7일 늦음)' : ''}`);
    kpi('mvrv').querySelector('.kpi-bar i').style.left = `${Math.max(0, Math.min(100, ((z + 1) / 9) * 100))}%`; // −1 ~ 8
  }
  if (d.kimp) {
    const b = d.kimp.btc;
    setKpi('kimp', b ? `${sign(b.premium, 2)}%` : '—', d.kimp.tether ? `테더 ${sign(d.kimp.tether.premium, 2)}% · 원/달러 ${nf(d.kimp.usdkrw, 1)}` : '', '');
    if (b) kpi('kimp').querySelector('.kpi-v').className = `kpi-v ${cls(b.premium)}`;
    $('kimp').querySelector('tbody').innerHTML = (d.kimp.top || []).map((c, i) => `<tr>
      <td class="rk">${i + 1}</td>
      <td class="nm"><b>${esc(c.name)}</b><small>${esc(c.sym)}</small></td>
      <td>${nf(c.krw, c.krw < 100 ? 2 : 0)}</td>
      <td class="hide-sm">${nf(c.global, c.global < 100 ? 2 : 0)}</td>
      <td class="${cls(c.premium)}"><b>${sign(c.premium, 2)}%</b></td></tr>`).join('') || '<tr><td colspan="5" class="empty">받은 값이 없어요</td></tr>';
  }
  if (d.m2) setKpi('m2', trillion(d.m2.value), `1년 전보다 ${sign(d.m2.yoy)}% · ${d.m2.date.slice(0, 7).replace('-', '.')} 기준`, cls(d.m2.yoy));
  if (d.etf) {
    const main = ['IBIT', 'FBTC', 'BITB', 'ARKB', 'GBTC', 'BTC'];
    const cell = (v, extra = '') => `<td class="${cls(v)}${extra}">${v == null ? '<span class="dim">집계 전</span>' : sign(v)}</td>`;
    const max = Math.max(1, ...d.etf.days.map((r) => Math.abs(r.total || 0)));
    $('etf').querySelector('tbody').innerHTML = d.etf.days.slice().reverse().map((r) => {
      const known = Object.entries(r.by).filter(([t]) => !main.includes(t)).map(([, v]) => v);
      const etc = known.some((v) => v != null) ? known.reduce((a, v) => a + (v || 0), 0) : null;
      const w = r.total == null ? 0 : (Math.abs(r.total) / max) * 100;
      return `<tr><th>${md(r.date)}</th>
        <td class="tot ${cls(r.total)}"><span class="bar" style="width:${w.toFixed(1)}%"></span><b>${r.total == null ? '—' : sign(r.total)}</b></td>
        ${cell(r.by.IBIT)}${cell(r.by.FBTC)}${cell(r.by.BITB, ' hide-sm')}${cell(r.by.ARKB, ' hide-sm')}${cell(r.by.GBTC)}${cell(r.by.BTC, ' hide-sm')}${cell(etc)}</tr>`;
    }).join('');
    const wk = d.etf.days.reduce((a, r) => a + (r.total || 0), 0);
    $('etf-note').innerHTML = `최근 ${d.etf.days.length}거래일 합계 <b class="${cls(wk)}">${sign(wk)}</b> 백만 달러 · + 순유입 · − 순유출 · "집계 전" 은 운용사가 아직 발표하지 않은 날`;
  }
  ['dom', 'fng', 'hash', 'mvrv', 'kimp', 'm2'].forEach((k) => { kpi(k).classList.remove('wait'); kpi(k).classList.toggle('na', !d[k]); if (!d[k]) kpi(k).querySelector('.kpi-v').textContent = '—'; });
  if (d.fetchedAt) $('cx-time').textContent = `${new Date(d.fetchedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })} 기준 · 김프 30초마다`;
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
