// 손잡이(⠿)로 끌어 순서 바꾸기. nest 를 켜면 오른쪽으로 끌면 위 항목 아래로, 왼쪽으로 끌면 한 단계 밖으로.
//   행: [data-id][data-depth]   손잡이: .handle
//   onDrop([{ id, depth }...]) — 바뀐 전체 순서
export function sortable(box, { rowSel, nest = false, indent = 28, canParent = () => true, onDrop }) {
  box.addEventListener('pointerdown', (e) => {
    const handle = e.target.closest('.handle');
    if (!handle || !box.contains(handle)) return;
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
    const startX = e.clientX;
    let depth = d0;
    block.forEach((r) => r.classList.add('dragging'));
    // 행을 DOM 에서 옮기면 포인터 캡처가 풀리므로 문서 전체에서 받는다
    const before = rows().map((r) => `${r.dataset.id}:${r.dataset.depth || 0}`).join();

    const setDepth = (d) => {
      depth = d;
      block.forEach((r, k) => { r.dataset.depth = d + rel[k]; r.style.setProperty('--d', d + rel[k]); });
    };
    const clampDepth = () => {
      if (!nest) return;
      const list = rows();
      const at = list.indexOf(block[0]);
      const prev = list[at - 1];
      const next = list[at + block.length];
      const want = d0 + Math.round((e2x - startX) / indent);
      let max = prev ? (+prev.dataset.depth || 0) + (canParent(prev) ? 1 : 0) : 0;
      let min = next ? Math.max(0, (+next.dataset.depth || 0) - 1 - lastRel) : 0;
      if (min > max) min = max;
      setDepth(Math.max(min, Math.min(max, want)));
    };
    let e2x = startX;

    const move = (ev) => {
      e2x = ev.clientX;
      const others = rows().filter((r) => !block.includes(r));
      let target = null;
      for (const r of others) {
        const b = r.getBoundingClientRect();
        if (ev.clientY < b.top + b.height / 2) { target = r; break; }
      }
      // 다른 항목의 하위 묶음 한가운데로 들어가지 않도록, 고른 자리 바로 앞은 그대로 둔다
      const parent = block[0].parentNode;
      if (target) { if (target !== block[block.length - 1].nextElementSibling) block.forEach((r) => parent.insertBefore(r, target)); } else {
        const last = others[others.length - 1];
        if (last && last.nextElementSibling !== block[0]) block.forEach((r) => parent.insertBefore(r, null));
      }
      clampDepth();
    };
    const up = () => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', up);
      block.forEach((r) => r.classList.remove('dragging'));
      const after = rows().map((r) => ({ id: r.dataset.id, depth: +r.dataset.depth || 0 }));
      if (after.map((r) => `${r.id}:${r.depth}`).join() !== before) onDrop(after);
    };
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', up);
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
