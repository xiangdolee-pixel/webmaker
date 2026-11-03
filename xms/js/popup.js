// 홈 화면 팝업 — 사이트 Worker 가 노출 중인 팝업을 window.__XMS_POPUPS 로 넣고 이 파일을 붙인다.
//   어두운 막 위 가운데에 그림(+본문), 위 오른쪽 "팝업닫기 ✕", 아래 "오늘 하루 보지 않기"(운영 모드에 따라).
//   여러 개면 창 하나 안에서 좌우로 넘어간다(화살표 · 점 · 밀기 · 키보드).
//   스타일은 xp- 접두어로만 — 사이트 CSS 와 섞이지 않는다.
(() => {
  const all = Array.isArray(window.__XMS_POPUPS) ? window.__XMS_POPUPS : [];
  if (!all.length || window.__xmsPopup) return;
  window.__xmsPopup = true;

  const today = () => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
  const key = (p) => `xms-popup-${p.id}-${p.v}`;
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* 저장 못 하면 다음에 또 뜬다 */ } },
  };
  const hidden = (p) => {
    if (p.mode === 'ALWAYS') return false;
    const v = store.get(key(p));
    return v === 'forever' || v === today();
  };
  const items = all.filter((p) => !hidden(p));
  if (!items.length) return;

  const CSS = `
.xp-dim{position:fixed;inset:0;z-index:2147482500;display:grid;place-items:center;padding:16px;background:rgba(10,12,16,.62);
  font-family:"Pretendard Variable",Pretendard,-apple-system,"Apple SD Gothic Neo","Noto Sans KR",sans-serif;-webkit-tap-highlight-color:transparent;
  opacity:0;transition:opacity .28s ease}
.xp-dim.xp-on{opacity:1}
.xp-wrap{position:relative;width:min(480px,100%);display:grid;gap:14px;justify-items:center;transform:translateY(14px) scale(.98);transition:transform .34s cubic-bezier(.22,.8,.24,1)}
.xp-dim.xp-on .xp-wrap{transform:none}
.xp-close,.xp-hide{display:inline-flex;align-items:center;gap:8px;min-height:38px;padding:0 16px;border:1px solid rgba(255,255,255,.75);border-radius:99px;
  background:rgba(20,22,28,.55);color:#fff;font-family:inherit;font-size:14px;font-weight:600;line-height:1;cursor:pointer;transition:background .2s}
.xp-close:hover,.xp-hide:hover{background:rgba(20,22,28,.8)}
.xp-close{justify-self:end}
.xp-close:focus-visible,.xp-hide:focus-within,.xp-nav:focus-visible{outline:2px solid #fff;outline-offset:2px}
.xp-hide input{width:16px;height:16px;margin:0;accent-color:#fff;cursor:pointer}
.xp-card{position:relative;width:100%;overflow:hidden;transition:height .38s cubic-bezier(.22,.8,.24,1);border-radius:4px;background:#fff;box-shadow:0 30px 80px -20px rgba(0,0,0,.6)}
.xp-track{display:flex;align-items:flex-start;transition:transform .42s cubic-bezier(.22,.8,.24,1)}
.xp-slide{flex:0 0 100%;min-width:0}
.xp-slide a,.xp-slide div.xp-in{display:block;color:inherit;text-decoration:none}
.xp-slide img{display:block;width:100%;height:auto;max-height:72vh;object-fit:contain;background:#fff}
.xp-body{margin:0;padding:16px 18px;font-size:15px;line-height:1.65;color:#222;white-space:pre-wrap;overflow-wrap:anywhere}
.xp-many .xp-body{padding:16px 58px 30px}
.xp-nav{position:absolute;top:50%;transform:translateY(-50%);width:40px;height:40px;border:0;border-radius:50%;background:rgba(0,0,0,.45);color:#fff;
  font-size:22px;line-height:1;cursor:pointer;display:grid;place-items:center}
.xp-prev{left:8px}.xp-next{right:8px}
.xp-dots{position:absolute;left:0;right:0;bottom:10px;display:flex;justify-content:center;gap:6px;pointer-events:none}
.xp-dots i{width:7px;height:7px;border-radius:50%;background:rgba(0,0,0,.25);transition:background .2s,transform .2s}
.xp-dots i.xp-cur{background:rgba(0,0,0,.7);transform:scale(1.2)}
@media (prefers-reduced-motion:reduce){.xp-dim,.xp-wrap,.xp-track,.xp-card{transition:none}}`;

  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  const slide = (p) => {
    const inner = `${p.image ? `<img src="${esc(p.image)}" alt="">` : ''}${p.body ? `<p class="xp-body">${esc(p.body)}</p>` : ''}`;
    return `<div class="xp-slide">${p.link ? `<a href="${esc(p.link)}" target="_blank" rel="noopener">${inner}</a>` : `<div class="xp-in">${inner}</div>`}</div>`;
  };
  const many = items.length > 1;
  // 아래 체크: 넘겨 보는 팝업 중 하나라도 "다시 열지 않음" 이면 그 문구, 모두 "무조건 열림" 이면 숨긴다
  const modes = new Set(items.map((p) => p.mode));
  const hideLabel = modes.has('TODAY') ? '오늘 하루 보지 않기' : modes.has('FOREVER') ? '다시 보지 않기' : '';

  function open() {
    const st = document.createElement('style');
    st.textContent = CSS;
    document.head.append(st);
    const dim = document.createElement('div');
    dim.className = many ? 'xp-dim xp-many' : 'xp-dim';
    dim.setAttribute('role', 'dialog');
    dim.setAttribute('aria-modal', 'true');
    dim.setAttribute('aria-label', '알림 팝업');
    dim.innerHTML = `<div class="xp-wrap">
      <button type="button" class="xp-close">팝업닫기 <span aria-hidden="true">✕</span></button>
      <div class="xp-card"><div class="xp-track">${items.map(slide).join('')}</div>
        ${many ? `<button type="button" class="xp-nav xp-prev" aria-label="이전 팝업">‹</button><button type="button" class="xp-nav xp-next" aria-label="다음 팝업">›</button>
        <div class="xp-dots">${items.map((_, i) => `<i class="${i ? '' : 'xp-cur'}"></i>`).join('')}</div>` : ''}</div>
      ${hideLabel ? `<label class="xp-hide"><input type="checkbox"> ${hideLabel}</label>` : ''}
    </div>`;
    document.body.append(dim);
    const prevOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    requestAnimationFrame(() => dim.classList.add('xp-on'));

    let cur = 0;
    const track = dim.querySelector('.xp-track');
    const card = dim.querySelector('.xp-card');
    const slides = [...track.children];
    // 창 높이는 지금 보는 팝업에 맞춘다 (글만 있는 팝업이 그림 팝업만큼 늘어나지 않게)
    const fit = () => { card.style.height = slides[cur].offsetHeight + 'px'; };
    slides.forEach((sl) => sl.querySelectorAll('img').forEach((im) => im.addEventListener('load', fit)));
    addEventListener('resize', fit);
    const go = (i) => {
      cur = (i + items.length) % items.length;
      track.style.transform = `translateX(${-cur * 100}%)`;
      dim.querySelectorAll('.xp-dots i').forEach((d, k) => d.classList.toggle('xp-cur', k === cur));
      fit();
    };
    fit();
    dim.querySelector('.xp-prev')?.addEventListener('click', () => go(cur - 1));
    dim.querySelector('.xp-next')?.addEventListener('click', () => go(cur + 1));
    let sx = null;
    track.addEventListener('pointerdown', (e) => { sx = e.clientX; });
    track.addEventListener('pointerup', (e) => { if (many && sx !== null && Math.abs(e.clientX - sx) > 40) go(cur + (e.clientX < sx ? 1 : -1)); sx = null; });

    const close = () => {
      if (dim.querySelector('.xp-hide input')?.checked) {
        for (const p of items) {
          if (p.mode === 'TODAY') store.set(key(p), today());
          if (p.mode === 'FOREVER') store.set(key(p), 'forever');
        }
      }
      dim.classList.remove('xp-on');
      document.documentElement.style.overflow = prevOverflow;
      document.removeEventListener('keydown', onKey);
      setTimeout(() => { dim.remove(); st.remove(); }, 300);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') close();
      if (many && e.key === 'ArrowRight') go(cur + 1);
      if (many && e.key === 'ArrowLeft') go(cur - 1);
    };
    document.addEventListener('keydown', onKey);
    dim.querySelector('.xp-close').addEventListener('click', close);
    dim.addEventListener('click', (e) => { if (e.target === dim) close(); });
    dim.querySelector('.xp-close').focus({ preventScroll: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', open); else open();
})();
