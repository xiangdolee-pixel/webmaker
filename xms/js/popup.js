// 홈 화면 팝업 — 사이트 Worker 가 노출 중인 팝업을 window.__XMS_POPUPS 로 넣고 이 파일을 붙인다.
//   1개: 가운데 크게.  2개 이상: 모두 나란히 보여 주고(몇 개인지 한눈에), 하나를 누르면 크게(‹ › 로 넘기기, '전체 보기' 로 돌아가기).
//   위 오른쪽 "팝업닫기 ✕", 아래 "오늘 하루 보지 않기"(운영 모드에 따라). Esc 로 닫기.
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
.xp-dim{position:fixed;inset:0;z-index:2147482500;display:grid;place-items:center;padding:16px;background:rgba(10,12,16,.66);overflow:auto;
  font-family:"Pretendard Variable",Pretendard,-apple-system,"Apple SD Gothic Neo","Noto Sans KR",sans-serif;-webkit-tap-highlight-color:transparent;
  opacity:0;transition:opacity .28s ease}
.xp-dim.xp-on{opacity:1}
.xp-wrap{position:relative;width:min(480px,100%);display:grid;gap:14px;justify-items:center;transform:translateY(14px) scale(.98);transition:transform .34s cubic-bezier(.22,.8,.24,1)}
.xp-wrap.xp-wide{width:min(1120px,100%)}
.xp-dim.xp-on .xp-wrap{transform:none}
.xp-top{width:100%;display:flex;align-items:center;justify-content:space-between;gap:10px}
.xp-count{color:#fff;font-size:15px;font-weight:700;letter-spacing:-.01em}
.xp-count b{display:inline-grid;place-items:center;min-width:24px;height:24px;margin-left:6px;padding:0 7px;border-radius:99px;background:#fff;color:#111;font-size:13px}
.xp-close,.xp-hide,.xp-back{display:inline-flex;align-items:center;gap:8px;min-height:38px;padding:0 16px;border:1px solid rgba(255,255,255,.75);border-radius:99px;
  background:rgba(20,22,28,.55);color:#fff;font-family:inherit;font-size:14px;font-weight:600;line-height:1;cursor:pointer;transition:background .2s}
.xp-close:hover,.xp-hide:hover,.xp-back:hover{background:rgba(20,22,28,.85)}
.xp-top .xp-close:only-child{margin-left:auto}
.xp-close:focus-visible,.xp-hide:focus-within,.xp-nav:focus-visible,.xp-thumb:focus-visible,.xp-back:focus-visible{outline:2px solid #fff;outline-offset:2px}
.xp-hide input{width:16px;height:16px;margin:0;accent-color:#fff;cursor:pointer}
/* 여러 개: 나란히 */
.xp-grid{width:100%;display:flex;justify-content:center;gap:16px;overflow-x:auto;scroll-snap-type:x mandatory;padding:4px 2px 10px;scrollbar-width:thin}
.xp-thumb{position:relative;flex:0 0 clamp(220px,30%,340px);scroll-snap-align:center;padding:0;border:0;border-radius:6px;overflow:hidden;background:#fff;cursor:zoom-in;
  box-shadow:0 24px 60px -24px rgba(0,0,0,.7);transition:transform .25s cubic-bezier(.22,.8,.24,1),box-shadow .25s;text-align:left;font-family:inherit}
.xp-thumb:hover{transform:translateY(-4px);box-shadow:0 30px 70px -24px rgba(0,0,0,.8)}
.xp-thumb img{display:block;width:100%;height:auto;max-height:58vh;object-fit:contain;background:#fff}
.xp-thumb .xp-body{display:-webkit-box;-webkit-line-clamp:6;-webkit-box-orient:vertical;overflow:hidden}
.xp-num{position:absolute;left:10px;top:10px;min-width:26px;height:26px;padding:0 8px;border-radius:99px;background:rgba(0,0,0,.6);color:#fff;font-size:13px;font-weight:700;display:grid;place-items:center}
.xp-zoom{position:absolute;right:10px;bottom:10px;padding:5px 10px;border-radius:99px;background:rgba(0,0,0,.6);color:#fff;font-size:12px;font-weight:600;opacity:0;transition:opacity .2s}
.xp-thumb:hover .xp-zoom,.xp-thumb:focus-visible .xp-zoom{opacity:1}
@media (hover:none){.xp-zoom{opacity:1}}
@media (max-width:640px){.xp-grid{justify-content:flex-start}.xp-thumb{flex-basis:78%}}
/* 하나 크게 */
.xp-card{position:relative;width:100%;border-radius:6px;overflow:hidden;background:#fff;box-shadow:0 30px 80px -20px rgba(0,0,0,.6)}
.xp-card img{display:block;width:100%;height:auto;max-height:76vh;object-fit:contain;background:#fff}
.xp-card a,.xp-card .xp-in{display:block;color:inherit;text-decoration:none}
.xp-body{margin:0;padding:16px 18px;font-size:15px;line-height:1.65;color:#222;white-space:pre-wrap;overflow-wrap:anywhere}
.xp-nav{position:absolute;top:50%;transform:translateY(-50%);width:42px;height:42px;border:0;border-radius:50%;background:rgba(0,0,0,.5);color:#fff;
  font-size:24px;line-height:1;cursor:pointer;display:grid;place-items:center;z-index:2}
.xp-prev{left:8px}.xp-next{right:8px}
.xp-pos{position:absolute;left:50%;bottom:10px;transform:translateX(-50%);padding:4px 10px;border-radius:99px;background:rgba(0,0,0,.55);color:#fff;font-size:12px;font-weight:700;z-index:2}
.xp-fade{animation:xp-in .3s cubic-bezier(.22,.8,.24,1)}
@keyframes xp-in{from{opacity:0;transform:scale(.97)}}
@media (prefers-reduced-motion:reduce){.xp-dim,.xp-wrap,.xp-thumb{transition:none}.xp-fade{animation:none}}`;

  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  const inner = (p) => `${p.image ? `<img src="${esc(p.image)}" alt="">` : ''}${p.body ? `<p class="xp-body">${esc(p.body)}</p>` : ''}`;
  const many = items.length > 1;
  // 아래 체크: 하나라도 "다시 열지 않음" 이면 그 문구, 모두 "무조건 열림" 이면 숨긴다
  const modes = new Set(items.map((p) => p.mode));
  const hideLabel = modes.has('TODAY') ? '오늘 하루 보지 않기' : modes.has('FOREVER') ? '다시 보지 않기' : '';
  const hideHtml = hideLabel ? `<label class="xp-hide"><input type="checkbox"> ${hideLabel}</label>` : '';

  function open() {
    const st = document.createElement('style');
    st.textContent = CSS;
    document.head.append(st);
    const dim = document.createElement('div');
    dim.className = 'xp-dim';
    dim.setAttribute('role', 'dialog');
    dim.setAttribute('aria-modal', 'true');
    dim.setAttribute('aria-label', many ? `알림 팝업 ${items.length}개` : '알림 팝업');
    document.body.append(dim);
    const prevOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    let hideChecked = false;
    let cur = -1; // -1 = 나란히 보기, 0.. = 그 팝업 크게

    const draw = () => {
      if (cur < 0) {
        dim.innerHTML = `<div class="xp-wrap xp-wide">
          <div class="xp-top"><span class="xp-count">알림<b>${items.length}</b></span><button type="button" class="xp-close">팝업닫기 <span aria-hidden="true">✕</span></button></div>
          <div class="xp-grid">${items.map((p, i) => `<button type="button" class="xp-thumb" data-i="${i}" aria-label="${i + 1}번째 팝업 크게 보기">${inner(p)}<span class="xp-num">${i + 1}</span><span class="xp-zoom">크게 보기</span></button>`).join('')}</div>
          ${hideHtml}</div>`;
      } else {
        const p = items[cur];
        dim.innerHTML = `<div class="xp-wrap">
          <div class="xp-top">${many ? '<button type="button" class="xp-back">‹ 전체 보기</button>' : ''}<button type="button" class="xp-close">팝업닫기 <span aria-hidden="true">✕</span></button></div>
          <div class="xp-card xp-fade">${p.link ? `<a href="${esc(p.link)}" target="_blank" rel="noopener">${inner(p)}</a>` : `<div class="xp-in">${inner(p)}</div>`}
            ${many ? `<button type="button" class="xp-nav xp-prev" aria-label="이전 팝업">‹</button><button type="button" class="xp-nav xp-next" aria-label="다음 팝업">›</button><span class="xp-pos">${cur + 1} / ${items.length}</span>` : ''}</div>
          ${hideHtml}</div>`;
      }
      const cb = dim.querySelector('.xp-hide input');
      if (cb) { cb.checked = hideChecked; cb.addEventListener('change', () => { hideChecked = cb.checked; }); }
      requestAnimationFrame(() => dim.classList.add('xp-on'));
    };
    const show = (i) => { cur = i < 0 ? -1 : (i + items.length) % items.length; draw(); };

    const close = () => {
      if (hideChecked) {
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
      if (e.key === 'Escape') { if (many && cur >= 0) show(-1); else close(); }
      if (many && cur >= 0 && e.key === 'ArrowRight') show(cur + 1);
      if (many && cur >= 0 && e.key === 'ArrowLeft') show(cur - 1);
    };
    document.addEventListener('keydown', onKey);
    dim.addEventListener('click', (e) => {
      const t = e.target;
      if (t === dim) { close(); return; }
      if (t.closest('.xp-close')) { close(); return; }
      if (t.closest('.xp-back')) { show(-1); return; }
      if (t.closest('.xp-prev')) { show(cur - 1); return; }
      if (t.closest('.xp-next')) { show(cur + 1); return; }
      const th = t.closest('.xp-thumb');
      if (th) show(+th.dataset.i);
    });
    // 크게 보기에서 옆으로 밀어 넘기기
    let sx = null;
    dim.addEventListener('pointerdown', (e) => { if (cur >= 0 && e.target.closest('.xp-card')) sx = e.clientX; });
    dim.addEventListener('pointerup', (e) => { if (many && cur >= 0 && sx !== null && Math.abs(e.clientX - sx) > 40) show(cur + (e.clientX < sx ? 1 : -1)); sx = null; });

    show(many ? -1 : 0);
    dim.querySelector('.xp-close')?.focus({ preventScroll: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', open); else open();
})();
