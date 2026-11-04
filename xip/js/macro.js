// xip 미국 경제지표 블록 — /api/macro (누구나). 마지막 값을 먼저 보여 주고, 보이는 동안 10분마다 새로 묻는다.
//   서버가 원본별로 저장본을 써서 답하므로(발표는 한 달에 한 번) 자주 물을 필요가 없다.
const $ = (id) => document.getElementById(id);
const KEY = 'xip:macro:v1';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const nf = (v, d) => (v == null || !Number.isFinite(v) ? '—' : v.toLocaleString('ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d }));
const WD = '일월화수목금토';
const md = (iso) => { const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`); return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${WD[d.getUTCDay()]})`; };
const kst = (iso) => new Date(iso).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
const dDay = (iso) => { const n = Math.ceil((Date.parse(`${iso}T23:59:00-05:00`) - Date.now()) / 864e5); return n <= 0 ? '오늘' : `D-${n}`; };
const mon = (p) => `${+p.slice(5, 7)}월분`;

// 값 형식: 비농업 고용은 천 명(부호), 나머지는 %
function fmt(r, v) {
  if (v == null) return '—';
  if (r.key === 'nfp') return `${v > 0 ? '+' : v < 0 ? '−' : ''}${nf(Math.abs(v), 0)}K`;
  return `${nf(v, 1)}%`;
}
// 실제가 예상보다 높으면 빨강, 낮으면 파랑 (국내 관례 색, 좋고 나쁨이 아니라 높고 낮음)
function vsCls(r) {
  const f = r.forecast != null ? parseFloat(String(r.forecast).replace(/[%K,]/g, '')) : null;
  if (f == null || r.actual == null) return '';
  const a = r.key === 'nfp' ? r.actual : Math.round(r.actual * 10) / 10;
  return a > f ? 'up' : a < f ? 'down' : '';
}

function render(d) {
  const fed = d.fed;
  if (fed) {
    $('mc-rate').textContent = `${nf(fed.from, 2)} ~ ${nf(fed.to, 2)}%`;
    $('mc-next').textContent = fed.next ? `실효금리 ${nf(fed.effr, 2)}% · 다음 FOMC ${md(fed.next.end)} ${dDay(fed.next.end)}` : `실효금리 ${nf(fed.effr, 2)}%`;
  } else {
    $('mc-rate').textContent = '—';
    $('mc-next').textContent = '연준 값을 지금 못 받았어요';
  }
  const fw = d.fedwatch;
  if (fw && fw.length) {
    const n = fw[0];
    const seg = (c, p) => (p >= 0.5 ? `<i class="${c}" style="width:${p.toFixed(1)}%"></i>` : '');
    const lab = (c, t, p) => `<span class="${c}"><b>${t}</b> ${nf(p, 1)}%</span>`;
    $('mc-fw').innerHTML = `<div class="mc-fw-h"><b>${md(n.date)} 회의 확률</b><small>연방기금 선물로 계산 (CME FedWatch 방식)</small></div>
      <div class="mc-bar">${seg('cut', n.cut)}${seg('hold', n.hold)}${seg('hike', n.hike)}</div>
      <div class="mc-leg">${lab('cut', '인하', n.cut)}${lab('hold', '동결', n.hold)}${lab('hike', '인상', n.hike)}</div>
      ${fw.length > 1 ? `<div class="mc-later">${fw.slice(1).map((m) => {
        const top = m.dist.slice().sort((a, b) => b.p - a.p)[0];
        return `<span>${md(m.date)} <b>${nf(top.from, 2)}~${nf(top.to, 2)}%</b> ${nf(top.p, 0)}%</span>`;
      }).join('')}</div>` : ''}`;
  } else {
    $('mc-fw').innerHTML = '<div class="mc-fw-h"><small>다음 회의 확률을 지금 계산하지 못했어요 (선물 가격 없음)</small></div>';
  }
  const rows = d.rows || [];
  $('mc-rows').innerHTML = rows.length ? rows.map((r) => {
    const next = r.next && !r.next.released ? `<small class="mc-up">다음 ${kst(r.next.date)} · 예상 ${esc(r.next.forecast)}</small>`
      : r.next && r.next.released ? '<small class="mc-up">발표됨 · 반영 기다리는 중</small>' : '';
    const sub = r.sub && r.sub.v != null ? `<small>${r.sub.label} ${nf(r.sub.v, 1)}%${r.sub.forecast ? ` (예상 ${esc(r.sub.forecast)})` : ''}</small>` : '';
    return `<tr>
      <th><b>${r.label}</b><small>${r.unit} · ${mon(r.period)}</small>${sub}${next}</th>
      <td class="mc-a ${vsCls(r)}">${fmt(r, r.actual)}</td>
      <td>${r.forecast ? esc(r.forecast) : '<span class="dim">—</span>'}</td>
      <td>${fmt(r, r.prev)}</td></tr>`;
  }).join('') : '<tr class="mc-wait"><td colspan="4">지표를 지금 못 받았어요 · 다시 받는 중</td></tr>';
  $('macro').classList.remove('mc-loading');
}

try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s) render(s); else $('macro').classList.add('mc-loading'); } catch (e) { /* 저장본 없음 */ }
// 서버가 BLS(CPI · 고용) 하루 한도에 걸렸을 때: 이 브라우저가 BLS 에서 직접 받는다 (계열 하나씩 GET — 미리 묻기 없이 되는 방식).
//   12시간 동안은 받은 것을 다시 쓴다 → 한 사람이 하루 BLS 를 많아야 12번.
const BKEY = 'xip:bls:v1';
async function blsFromBrowser(ids) {
  try { const s = JSON.parse(localStorage.getItem(BKEY) || 'null'); if (s && Date.now() - s.at < 12 * 3600e3 && s.ids === ids.join()) return s.series; } catch (e) { /* 없음 */ }
  const series = await Promise.all(ids.map((id) => fetch(`https://api.bls.gov/publicAPI/v1/timeseries/data/${id}`)
    .then((r) => r.json()).then((j) => (j.status === 'REQUEST_SUCCEEDED' ? j.Results.series[0] : null)).catch(() => null)));
  if (series.some((x) => !x)) return null;
  try { localStorage.setItem(BKEY, JSON.stringify({ at: Date.now(), ids: ids.join(), series })); } catch (e) { /* 저장 안 됨 */ }
  return series;
}

let timer = 0;
async function load() {
  clearTimeout(timer);
  try {
    const r = await fetch('/api/macro');
    if (r.ok) {
      let d = await r.json();
      if (!d.sources.bls && d.blsIds) {
        const series = await blsFromBrowser(d.blsIds);
        if (series) {
          const r2 = await fetch('/api/macro', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bls: series }) });
          if (r2.ok) d = await r2.json();
        }
      }
      render(d);
      try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) { /* 저장 안 됨 */ }
    }
  } catch (e) { console.warn('[macro]', e); }
  if (!document.hidden) timer = setTimeout(load, 10 * 60e3);
}
load();
document.addEventListener('visibilitychange', () => { if (!document.hidden) load(); else clearTimeout(timer); });
