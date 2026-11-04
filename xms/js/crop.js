// 그림 자르기: 고른 그림에서 원하는 부분만 틀 안에 맞춘다 (사용자 지시 2026-11-04)
//   끌어서 옮기기 · 두 손가락 벌리기 / 마우스 휠 / 아래 막대로 확대.
//   cropCircle(file) → 프로필 사진: 동그라미, 정사각 512px WEBP(안 되면 JPEG) — 보여 줄 때 동그랗게 자른다
//   cropImage(file, { w, h, round, type, title, help }) → 다른 틀 (예: 카톡 미리보기 1200×630 JPEG)
//   결과는 File | null(취소)
export const cropCircle = (file) => cropImage(file, { w: 512, h: 512, round: true });

export function cropImage(file, opt = {}) {
  const o = { w: 512, h: 512, round: false, type: 'image/webp', title: '사진 맞추기', help: '끌어서 옮기고, 벌리거나 아래 막대로 크게 · 작게', ...opt };
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.onload = () => open(img, url, file, resolve, o);
    img.src = url;
  });
}

function open(img, url, file, resolve, o) {
  const host = document.querySelector('.xms-c') || document.body; // 사이트 안 화면이면 xms 글꼴 · 색이 걸리는 곳에
  const el = document.createElement('div');
  el.className = 'crop-cover';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', '프로필 사진 자르기');
  const ratio = o.w / o.h;
  el.innerHTML = `<div class="crop-box${ratio > 1.2 ? ' wide' : ''}">
    <b class="crop-title"></b>
    <small class="crop-help"></small>
    <div class="crop-stage" style="aspect-ratio:${o.w} / ${o.h}"><img alt="" draggable="false"><span class="crop-ring${o.round ? '' : ' rect'}" aria-hidden="true"></span></div>
    <label class="crop-zoom"><span aria-hidden="true">－</span><input type="range" min="1" max="4" step="0.01" value="1" aria-label="확대"><span aria-hidden="true">＋</span></label>
    <div class="crop-acts"><button type="button" class="btn" data-no>취소</button><button type="button" class="btn primary" data-ok>이 사진 쓰기</button></div>
  </div>`;
  host.append(el);
  el.querySelector('.crop-title').textContent = o.title;
  el.querySelector('.crop-help').textContent = o.help;
  const stage = el.querySelector('.crop-stage');
  const view = el.querySelector('img');
  const range = el.querySelector('input');
  view.src = url;

  const W = img.naturalWidth, H = img.naturalHeight;
  let SW = stage.clientWidth, SH = stage.clientHeight;   // 보이는 틀 크기
  let base = Math.max(SW / W, SH / H);  // 그림이 틀을 꽉 채우는 배율
  let zoom = 1, x = 0, y = 0;           // x, y = 그림 가운데가 틀 가운데에서 떨어진 거리(px)
  const clamp = () => {
    const w = W * base * zoom, h = H * base * zoom;
    const mx = Math.max(0, (w - SW) / 2), my = Math.max(0, (h - SH) / 2);
    x = Math.min(mx, Math.max(-mx, x)); y = Math.min(my, Math.max(-my, y));
  };
  const draw = () => {
    clamp();
    const w = W * base * zoom, h = H * base * zoom;
    view.style.width = `${w}px`; view.style.height = `${h}px`;
    view.style.transform = `translate(${(SW - w) / 2 + x}px, ${(SH - h) / 2 + y}px)`;
    range.value = String(zoom);
  };
  const setZoom = (z, cx = 0, cy = 0) => { // cx, cy = 네모 가운데 기준 확대 중심
    const nz = Math.min(4, Math.max(1, z));
    x = cx - (cx - x) * (nz / zoom); y = cy - (cy - y) * (nz / zoom);
    zoom = nz; draw();
  };
  draw();
  const onResize = () => { const k = stage.clientWidth / SW; SW = stage.clientWidth; SH = stage.clientHeight; base = Math.max(SW / W, SH / H); x *= k; y *= k; draw(); };
  addEventListener('resize', onResize);

  // 끌기 · 두 손가락 확대
  const pts = new Map();
  let last = null;
  const center = () => { const r = stage.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
  stage.addEventListener('pointerdown', (e) => { stage.setPointerCapture(e.pointerId); pts.set(e.pointerId, [e.clientX, e.clientY]); last = null; });
  stage.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) return;
    const prev = pts.get(e.pointerId);
    pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pts.size === 1) { x += e.clientX - prev[0]; y += e.clientY - prev[1]; draw(); return; }
    const [a, b] = [...pts.values()];
    const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
    const [ox, oy] = center();
    if (last) setZoom(zoom * (d / last), (a[0] + b[0]) / 2 - ox, (a[1] + b[1]) / 2 - oy);
    last = d;
  });
  const up = (e) => { pts.delete(e.pointerId); last = null; };
  stage.addEventListener('pointerup', up);
  stage.addEventListener('pointercancel', up);
  stage.addEventListener('wheel', (e) => {
    e.preventDefault();
    const [ox, oy] = center();
    setZoom(zoom * Math.exp(-e.deltaY / 400), e.clientX - ox, e.clientY - oy);
  }, { passive: false });
  range.addEventListener('input', () => setZoom(+range.value));

  const close = (v) => {
    removeEventListener('resize', onResize);
    removeEventListener('keydown', onKey);
    URL.revokeObjectURL(url);
    el.remove();
    resolve(v);
  };
  const onKey = (e) => { if (e.key === 'Escape') close(null); };
  addEventListener('keydown', onKey);
  el.querySelector('[data-no]').onclick = () => close(null);
  el.addEventListener('click', (e) => { if (e.target === el) close(null); });
  el.querySelector('[data-ok]').onclick = async () => {
    // 틀 안에 들어온 원본 부분을 o.w × o.h 로
    const k = base * zoom;                    // 원본 1px → 화면 k px
    const sw = SW / k, sh = SH / k;           // 원본에서 잘라 낼 크기
    const sx = W / 2 - x / k - sw / 2;       // 그림 가운데에서 (x, y) 만큼 옮긴 자리
    const sy = H / 2 - y / k - sh / 2;
    const c = document.createElement('canvas');
    c.width = o.w; c.height = o.h;
    const g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    if (o.type === 'image/jpeg') { g.fillStyle = '#fff'; g.fillRect(0, 0, o.w, o.h); } // JPEG 는 투명이 없다
    g.drawImage(img, sx, sy, sw, sh, 0, 0, o.w, o.h);
    let blob = await new Promise((r) => c.toBlob(r, o.type, o.type === 'image/jpeg' ? 0.88 : 0.86));
    if (!blob || blob.type !== o.type) {
      g.globalCompositeOperation = 'destination-over'; g.fillStyle = '#fff'; g.fillRect(0, 0, o.w, o.h);
      blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.88));
    }
    const ext = blob.type === 'image/webp' ? 'webp' : 'jpg';
    close(new File([blob], `${(file.name || 'avatar').replace(/\.\w+$/, '')}.${ext}`, { type: blob.type }));
  };
  el.querySelector('[data-ok]').focus({ preventScroll: true });
}
