// 수정 모드 — 관리자가 홈페이지 위에서 글자를 바로 고친다.
//   고칠 수 있는 자리 = 사이트 Worker 가 페이지 끝에서 표시해 둔 [data-xe] (글자가 든 요소). 원래 글자 조각은 window.__XE_ORIG.
//   글자 조각(text node)만 바꾸므로 굵게 · 색 · 링크 같은 모양은 사이트 그대로 남는다. 저장하면 xms(page_texts)에 들어가
//   다음부터 모든 방문자에게 고친 글자로 보인다. 원래 글자로 되돌리면 저장할 때 지운다.
let on = false;

const CSS = `
body.xe-on [data-xe]{outline:1.5px dashed rgba(59,130,246,.55);outline-offset:2px;border-radius:2px;cursor:text;transition:outline-color .15s,background-color .15s}
body.xe-on [data-xe]:hover{outline-color:#3b82f6;background-color:rgba(59,130,246,.07)}
body.xe-on [data-xe]:focus{outline:2px solid #3b82f6;background-color:rgba(59,130,246,.1);box-shadow:0 0 0 4px rgba(255,255,255,.55)}
body.xe-on [data-xe].xe-dirty{outline-color:#f59e0b;outline-style:solid}
.xe-bar{position:fixed;left:50%;bottom:max(16px,env(safe-area-inset-bottom));transform:translateX(-50%);z-index:2147483000;display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:center;
 max-width:calc(100vw - 24px);padding:10px 12px;border-radius:16px;background:#111827;color:#fff;box-shadow:0 12px 40px rgba(0,0,0,.35);
 font:600 15px/1.3 "Pretendard Variable",Pretendard,system-ui,sans-serif;-webkit-tap-highlight-color:transparent}
.xe-bar b{font-weight:800;color:#fde047;margin-right:2px}
.xe-bar span{color:rgba(255,255,255,.75);font-weight:500;font-size:14px}
.xe-bar button{height:38px;padding:0 14px;border-radius:999px;border:1px solid rgba(255,255,255,.25);background:transparent;color:#fff;font:inherit;cursor:pointer;transition:background .15s,color .15s}
.xe-bar button:hover{background:#fff;color:#111827}
.xe-bar button.xe-save{background:#3b82f6;border-color:#3b82f6}
.xe-bar button.xe-save:hover{background:#fff;color:#1d4ed8}
.xe-bar button:disabled{opacity:.4;cursor:default;background:transparent;color:#fff}
.xe-bar button:focus-visible{outline:2px solid #fde047;outline-offset:2px}
.xe-toast{position:fixed;left:50%;bottom:90px;transform:translateX(-50%);z-index:2147483001;padding:10px 16px;border-radius:12px;background:#065f46;color:#fff;font:600 14px/1.3 "Pretendard Variable",Pretendard,system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.25)}
.xe-toast.err{background:#991b1b}
@media (prefers-reduced-motion: reduce){body.xe-on [data-xe]{transition:none}}
`;

const nodesOf = (el) => {
  const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const a = []; let n;
  while ((n = w.nextNode())) a.push(n);
  return a;
};
const valuesOf = (el) => nodesOf(el).map((n) => n.nodeValue);
const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => v === b[i]);
const keyOf = (el) => el.dataset.xeG + el.dataset.xe;
const pagePath = () => {
  let s = location.pathname;
  try { s = decodeURIComponent(s); } catch { /* 그대로 */ }
  return s.replace(/\/index\.html?$/i, '/').replace(/\.html?$/i, '').replace(/(.)\/+$/, '$1') || '/';
};

function toast(msg, err) {
  const t = document.createElement('div');
  t.className = 'xe-toast' + (err ? ' err' : '');
  t.setAttribute('role', 'status');
  t.textContent = msg;
  document.body.append(t);
  setTimeout(() => t.remove(), 2600);
}

export function startEdit() {
  if (on) return;
  on = true;
  const ORIG = window.__XE_ORIG || {};
  const els = [...document.querySelectorAll('[data-xe]')];
  const start = new Map(els.map((el) => [el, valuesOf(el)])); // 수정 모드에 들어올 때 보이던 글자
  const dirty = new Set();
  let current = null;

  const style = document.createElement('style');
  style.id = 'xe-style';
  style.textContent = CSS;
  document.head.append(style);
  document.body.classList.add('xe-on');

  let plainOk = true;
  els.forEach((el) => {
    try { el.contentEditable = 'plaintext-only'; } catch { plainOk = false; }
    if (!plainOk || el.contentEditable !== 'plaintext-only') el.contentEditable = 'true';
    el.spellcheck = false;
  });

  const bar = document.createElement('div');
  bar.className = 'xe-bar';
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('aria-label', '수정 모드');
  bar.innerHTML = '<b>수정 모드</b><span data-c>글자를 눌러 고치세요</span>' +
    '<button type="button" data-a="undo" disabled>원래 글자로</button>' +
    '<button type="button" data-a="save" class="xe-save" disabled>저장</button>' +
    '<button type="button" data-a="exit">끝내기</button>';
  document.body.append(bar);
  const $ = (s) => bar.querySelector(s);

  function paint() {
    $('[data-c]').textContent = dirty.size ? `고친 곳 ${dirty.size}군데` : '글자를 눌러 고치세요';
    $('[data-a="save"]').disabled = !dirty.size;
    const k = current && keyOf(current);
    $('[data-a="undo"]').disabled = !current || same(valuesOf(current), ORIG[k]);
    $('[data-a="exit"]').textContent = $('[data-a="exit"]').dataset.sure ? '저장 안 하고 끝내기' : '끝내기';
  }
  const mark = (el) => {
    if (same(valuesOf(el), start.get(el))) { dirty.delete(el); el.classList.remove('xe-dirty'); }
    else { dirty.add(el); el.classList.add('xe-dirty'); }
    delete $('[data-a="exit"]').dataset.sure;
    paint();
  };

  // 링크 · 단추를 눌러도 넘어가지 않게 (글자만 고친다)
  const block = (e) => {
    if (bar.contains(e.target)) return;
    const el = e.target.closest('[data-xe]');
    if (e.target.closest('a,button') || el) { if (e.target.closest('a,button,[data-xe]')) e.preventDefault(); }
  };
  const onInput = (e) => { const el = e.target.closest?.('[data-xe]'); if (el) mark(el); };
  const onFocus = (e) => { const el = e.target.closest?.('[data-xe]'); if (el) { current = el; paint(); } };
  // 엔터 = 줄바꿈 대신 다 고침, Esc = 나가기 전 확인
  const onKey = (e) => {
    const el = e.target.closest?.('[data-xe]');
    if (!el) return;
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); el.blur(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); }
  };
  const onPaste = (e) => {
    const el = e.target.closest?.('[data-xe]');
    if (!el) return;
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData('text/plain').replace(/\s*\n\s*/g, ' ');
    document.execCommand('insertText', false, text);
  };
  const leave = (e) => { if (dirty.size) { e.preventDefault(); e.returnValue = ''; } };
  document.addEventListener('click', block, true);
  document.addEventListener('input', onInput, true);
  document.addEventListener('focusin', onFocus, true);
  document.addEventListener('keydown', onKey, true);
  document.addEventListener('paste', onPaste, true);
  addEventListener('beforeunload', leave);

  async function save() {
    if (!dirty.size) return;
    const items = [...dirty].map((el) => {
      const v = valuesOf(el);
      return { g: el.dataset.xeG, k: el.dataset.xe, t: same(v, ORIG[keyOf(el)]) ? null : v };
    });
    $('[data-a="save"]').disabled = true;
    try {
      const r = await fetch('/xms-api/admin/page-texts', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: pagePath(), items }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || '저장하지 못했습니다.');
      dirty.forEach((el) => { start.set(el, valuesOf(el)); el.classList.remove('xe-dirty'); });
      dirty.clear();
      toast('저장했습니다. 방문자에게도 곧 고친 글자로 보입니다.');
    } catch (e) {
      toast(e.message || '저장하지 못했습니다.', true);
    }
    paint();
  }

  bar.addEventListener('click', (e) => {
    const a = e.target.closest('button')?.dataset.a;
    if (a === 'save') save();
    if (a === 'undo' && current) {
      const o = ORIG[keyOf(current)];
      const ns = nodesOf(current);
      if (o && o.length === ns.length) ns.forEach((n, i) => { n.nodeValue = o[i]; });
      else if (o) current.textContent = o.join('');
      mark(current);
    }
    if (a === 'exit') {
      const b = $('[data-a="exit"]');
      if (dirty.size && !b.dataset.sure) { b.dataset.sure = '1'; paint(); return; }
      // 저장하지 않은 것은 들어올 때 글자로 되돌린다
      dirty.forEach((el) => {
        const v = start.get(el), ns = nodesOf(el);
        if (v.length === ns.length) ns.forEach((n, i) => { n.nodeValue = v[i]; }); else el.textContent = v.join('');
        el.classList.remove('xe-dirty');
      });
      stop();
    }
  });

  function stop() {
    on = false;
    els.forEach((el) => { el.removeAttribute('contenteditable'); el.removeAttribute('spellcheck'); });
    document.body.classList.remove('xe-on');
    document.removeEventListener('click', block, true);
    document.removeEventListener('input', onInput, true);
    document.removeEventListener('focusin', onFocus, true);
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('paste', onPaste, true);
    removeEventListener('beforeunload', leave);
    bar.remove(); style.remove();
  }
  paint();
  toast('수정 모드 — 파란 점선 글자를 눌러 고치고 저장하세요.');
}
