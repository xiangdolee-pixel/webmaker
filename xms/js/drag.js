// 손잡이(⠿)로 끌어 순서 바꾸기 — 부드럽게 (WebMaker2 공통 규칙: 순서 바꾸는 모든 UI)
//   · 끄는 항목은 손가락/마우스를 그대로 따라오고(살짝 떠오름), 나머지 항목은 미끄러지듯 비켜난다(FLIP 애니메이션).
//   · 놓으면 끄던 항목이 제자리로 부드럽게 내려앉는다.
//   · nest 를 켜면 오른쪽으로 끌면 위 항목 아래로, 왼쪽으로 끌면 한 단계 밖으로(들여쓰기도 부드럽게).
//   행: [data-id][data-depth]   손잡이: .handle
//   onDrop([{ id, depth }...]) — 바뀐 전체 순서
//   nest 일 때 끄는 동안: 놓일 자리에 들여쓴 안내선 + 글자(‘소개’ 안으로 · 맨 위 메뉴), 들어갈 위 메뉴는 색으로 표시
//     guideLeft: 안내선 시작 x(0단계, 행 왼쪽에서 px)   labelOf(row): 안내 글자에 쓸 메뉴 이름
const EASE = 'cubic-bezier(.22, .8, .24, 1)';
const SLIDE_MS = 220;
const SETTLE_MS = 240;
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export function sortable(box, { rowSel, nest = false, indent = 28, canParent = () => true, onDrop, guideLeft = 44, labelOf = (r) => (r.querySelector('b') || r).textContent.trim() }) {
  box.addEventListener('pointerdown', (e) => {
    const handle = e.target.closest('.handle');
    if (!handle || !box.contains(handle) || e.button > 0) return;
    const row = handle.closest(rowSel);
    if (!row) return;
    e.preventDefault();

    const rows = () => [...box.querySelectorAll(rowSel)];
    const all = rows();
    const i0 = all.indexOf(row);
    const d0 = +row.dataset.depth || 0;
    let n = i0 + 1;
    while (nest && n < all.length && (+all[n].dataset.depth || 0) > d0) n++;
    const block = all.slice(i0, n);
    const rel = block.map((r) => (+r.dataset.depth || 0) - d0);
    const lastRel = rel[rel.length - 1];
    const before = all.map((r) => `${r.dataset.id}:${r.dataset.depth || 0}`).join();
    const startX = e.clientX;
    const startY = e.clientY;
    let lastX = startX;
    let lastY = startY;
    // 끄는 묶음의 "원래 화면 위치" — DOM 이 바뀌어도 손가락 아래 그대로 두기 위한 기준
    let originTop = block[0].getBoundingClientRect().top;

    document.body.classList.add('is-sorting');
    // 안내선 (nest 일 때만)
    let guide = null;
    let parentRow = null;
    if (nest) {
      box.classList.add('sort-host');
      guide = document.createElement('div');
      guide.className = 'sort-guide';
      guide.innerHTML = '<span></span>';
      box.append(guide);
    }
    const showGuide = () => {
      if (!guide) return;
      const list = rows();
      const at = list.indexOf(block[0]);
      const d = +block[0].dataset.depth || 0;
      let parent = null;
      for (let k = at - 1; k >= 0 && d > 0; k--) if ((+list[k].dataset.depth || 0) === d - 1) { parent = list[k]; break; }
      if (parentRow !== parent) { parentRow?.classList.remove('sort-parent'); parent?.classList.add('sort-parent'); parentRow = parent; }
      const br = box.getBoundingClientRect();
      const top = block[0].getBoundingClientRect().top - (parseFloat(block[0].dataset.ty) || 0) - br.top + box.scrollTop;
      guide.style.transform = 'translateY(' + Math.round(top) + 'px)';
      guide.style.left = (guideLeft + d * indent) + 'px';
      const move = d > d0 ? '→ ' : d < d0 ? '← ' : '';
      const name = parent ? labelOf(parent) : '';
      guide.classList.toggle('in', d > 0);
      guide.firstChild.textContent = d > 0 ? move + '‘' + (name.length > 16 ? name.slice(0, 15) + '…' : name) + '’ 안으로 (하위 메뉴)' : move + '맨 위 메뉴' + (d0 > 0 ? '로 꺼냄' : ' · 순서 바꾸기');
    };
    block.forEach((r) => {
      r.classList.add('dragging');
      r.style.transition = reduced() ? 'none' : `padding-left 180ms ${EASE}`; // 위치는 바로 따라오고, 들여쓰기만 부드럽게
      r.style.position = 'relative';
      r.style.zIndex = '5';
    });

    const follow = () => {
      const top = block[0].getBoundingClientRect().top - (parseFloat(block[0].dataset.ty) || 0);
      const ty = (lastY - startY) - (top - originTop);
      block.forEach((r) => { r.dataset.ty = ty; r.style.transform = `translateY(${ty}px)`; });
    };

    // FLIP: DOM 을 옮기기 전 위치를 재 두고, 옮긴 뒤 차이만큼 되돌려 놓았다가 0 으로 미끄러지게
    const flip = (mutate) => {
      const others = rows().filter((r) => !block.includes(r));
      const first = new Map(others.map((r) => [r, r.getBoundingClientRect().top]));
      mutate();
      if (reduced()) return;
      for (const r of others) {
        const dy = first.get(r) - r.getBoundingClientRect().top;
        if (!dy) continue;
        r.style.transition = 'none';
        r.style.transform = `translateY(${dy}px)`;
        void r.offsetHeight;
        r.style.transition = `transform ${SLIDE_MS}ms ${EASE}`;
        r.style.transform = '';
      }
    };

    const setDepth = (d) => block.forEach((r, k) => { r.dataset.depth = d + rel[k]; r.style.setProperty('--d', d + rel[k]); });
    const clampDepth = () => {
      if (!nest) return;
      const list = rows();
      const at = list.indexOf(block[0]);
      const prev = list[at - 1];
      const next = list[at + block.length];
      const want = d0 + Math.round((lastX - startX) / indent);
      const max = prev ? (+prev.dataset.depth || 0) + (canParent(prev) ? 1 : 0) : 0;
      let min = next ? Math.max(0, (+next.dataset.depth || 0) - 1 - lastRel) : 0;
      if (min > max) min = max;
      const d = Math.max(min, Math.min(max, want));
      if (d !== (+block[0].dataset.depth || 0)) setDepth(d);
    };

    const move = (ev) => {
      lastX = ev.clientX;
      lastY = ev.clientY;
      const others = rows().filter((r) => !block.includes(r));
      // 끄는 묶음의 가운데가 어느 항목의 가운데를 넘었는지로 자리를 정한다
      const bTop = block[0].getBoundingClientRect().top;
      const bBottom = block[block.length - 1].getBoundingClientRect().bottom;
      const mid = (bTop + bBottom) / 2;
      let target = null;
      for (const r of others) {
        const b = r.getBoundingClientRect();
        const ty = parseFloat(getComputedStyle(r).transform.split(',')[5]) || 0; // 미끄러지는 중이면 도착 위치로 계산
        if (mid < b.top - ty + b.height / 2) { target = r; break; }
      }
      const parent = block[0].parentNode;
      const nextOfBlock = block[block.length - 1].nextElementSibling;
      const needMove = target ? target !== nextOfBlock : (others.length && others[others.length - 1].nextElementSibling !== block[0]);
      if (needMove) flip(() => block.forEach((r) => parent.insertBefore(r, target)));
      clampDepth();
      follow();
      showGuide();
    };

    const up = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', up);
      document.body.classList.remove('is-sorting');
      guide?.remove();
      parentRow?.classList.remove('sort-parent');
      box.classList.remove('sort-host');
      // 제자리로 부드럽게 내려앉기
      block.forEach((r) => {
        r.style.transition = reduced() ? 'none' : `transform ${SETTLE_MS}ms ${EASE}`;
        r.style.transform = '';
        delete r.dataset.ty;
      });
      setTimeout(() => block.forEach((r) => {
        r.classList.remove('dragging');
        r.style.transition = ''; r.style.position = ''; r.style.zIndex = '';
      }), reduced() ? 0 : SETTLE_MS);
      const after = rows().map((r) => ({ id: r.dataset.id, depth: +r.dataset.depth || 0 }));
      if (after.map((r) => `${r.id}:${r.depth}`).join() !== before) onDrop(after);
    };

    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', up);
    originTop = block[0].getBoundingClientRect().top;
    showGuide();
  });
}

// 깊이 목록 → [{ id, parent_id, sort }]
export function treeFromDepths(list) {
  const stack = [];
  const counters = new Map();
  return list.map((r) => {
    stack.length = r.depth;
    const parent = r.depth ? stack[r.depth - 1] ?? null : null;
    const key = parent ?? 'root';
    const sort = (counters.get(key) || 0) + 1;
    counters.set(key, sort);
    stack[r.depth] = r.id;
    return { id: Number(r.id), parent_id: parent ? Number(parent) : null, sort };
  });
}
