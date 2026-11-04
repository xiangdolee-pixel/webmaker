// 프로필 사진 자르기: 고른 사진을 동그라미 안에 원하는 부분만 맞춰 넣는다 (사용자 지시 2026-11-04)
//   끌어서 옮기기 · 두 손가락 벌리기 / 마우스 휠 / 아래 막대로 확대. 결과는 정사각 512px WEBP(안 되면 JPEG) — 보여 줄 때 동그랗게 자른다.
//   cropCircle(file) → File | null(취소)
const OUT = 512;

export function cropCircle(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.onload = () => open(img, url, file, resolve);
    img.src = url;
  });
}

function open(img, url, file, resolve) {
  const host = document.querySelector('.xms-c') || document.body; // 사이트 안 화면이면 xms 글꼴 · 색이 걸리는 곳에
  const el = document.createElement('div');
  el.className = 'crop-cover';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', '프로필 사진 자르기');
  el.innerHTML = `<div class="crop-box">
    <b class="crop-title">사진 맞추기</b>
    <small class="crop-help">끌어서 옮기고, 벌리거나 아래 막대로 크게 · 작게</small>
    <div class="crop-stage"><img alt="" draggable="false"><span class="crop-ring" aria-hidden="true"></span></div>
    <label class="crop-zoom"><span aria-hidden="true">－</span><input type="range" min="1" max="4" step="0.01" value="1" aria-label="확대"><span aria-hidden="true">＋</span></label>
    <div class="crop-acts"><button type="button" class="btn" data-no>취소</button><button type="button" class="btn primary" data-ok>이 사진 쓰기</button></div>
  </div>`;
  host.append(el);
  const stage = el.querySelector('.crop-stage');
  const view = el.querySelector('img');
  const range = el.querySelector('input');
  view.src = url;

  const W = img.naturalWidth, H = img.naturalHeight;
  let S = stage.clientWidth;          // 보이는 네모(=동그라미 지름) 크기
  let base = S / Math.min(W, H);      // 짧은 변이 동그라미를 꽉 채우는 배율
  let zoom = 1, x = 0, y = 0;         // x, y = 사진 가운데가 네모 가운데에서 떨어진 거리(px)
  const clamp = () => {
    const w = W * base * zoom, h = H * base * zoom;
    const mx = Math.max(0, (w - S) / 2), my = Math.max(0, (h - S) / 2);
    x = Math.min(mx, Math.max(-mx, x)); y = Math.min(my, Math.max(-my, y));
  };
  const draw = () => {
    clamp();
    const w = W * base * zoom, h = H * base * zoom;
    view.style.width = `${w}px`; view.style.height = `${h}px`;
    view.style.transform = `translate(${(S - w) / 2 + x}px, ${(S - h) / 2 + y}px)`;
    range.value = String(zoom);
  };
  const setZoom = (z, cx = 0, cy = 0) => { // cx, cy = 네모 가운데 기준 확대 중심
    const nz = Math.min(4, Math.max(1, z));
    x = cx - (cx - x) * (nz / zoom); y = cy - (cy - y) * (nz / zoom);
    zoom = nz; draw();
  };
  draw();
  const onResize = () => { const k = stage.clientWidth / S; S = stage.clientWidth; base = S / Math.min(W, H); x *= k; y *= k; draw(); };
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
    // 동그라미 안(보이는 네모)에 들어온 원본 부분을 512px 로
    const k = base * zoom;                    // 원본 1px → 화면 k px
    const sw = S / k;                         // 원본에서 잘라 낼 한 변
    const sx = W / 2 - x / k - sw / 2;       // 사진 가운데에서 (x, y) 만큼 옮긴 자리
    const sy = H / 2 - y / k - sw / 2;
    const c = document.createElement('canvas');
    c.width = OUT; c.height = OUT;
    const g = c.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, sx, sy, sw, sw, 0, 0, OUT, OUT);
    let blob = await new Promise((r) => c.toBlob(r, 'image/webp', 0.86));
    if (!blob || blob.type !== 'image/webp') {
      g.globalCompositeOperation = 'destination-over'; g.fillStyle = '#fff'; g.fillRect(0, 0, OUT, OUT);
      blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.88));
    }
    const ext = blob.type === 'image/webp' ? 'webp' : 'jpg';
    close(new File([blob], `${(file.name || 'avatar').replace(/\.\w+$/, '')}.${ext}`, { type: blob.type }));
  };
  el.querySelector('[data-ok]').focus({ preventScroll: true });
}
