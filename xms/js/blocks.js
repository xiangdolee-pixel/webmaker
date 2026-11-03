// 간단입력 — 카드(사진 · 동영상 · 소제목 · 내용)를 쌓아 글을 만든다.
//   맨 위 "사진·동영상 먼저 / 글 먼저" 는 글 전체에 적용. 카드는 ↑↓ 로 차례를 바꾸고(미끄러지며 비켜남), 삭제한다.
//   값: { order: 'media' | 'text', cards: [{ sub, text, photos: [url], video: id }] }  — 서버가 이걸로 본문 HTML 을 만든다.
import { esc, openDialog, toast, slideTabs } from './common.js';

const CAM = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>';
const PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="18" height="12" rx="3"/><path d="m10 9.5 5 2.5-5 2.5z"/></svg>';
const UP = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6"/></svg>';
const DOWN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M6 13l6 6 6-6"/></svg>';
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export const youtubeId = (u) => {
  const m = String(u).trim().match(/^(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{11})/);
  return m ? m[1] : null;
};

// 미리보기 · 편집기로 옮길 때 쓰는 HTML (서버도 같은 규칙으로 만든다)
export function blocksToHtml(v) {
  return (v.cards || []).map((c) => {
    const media = `${(c.photos || []).map((u) => `<p><img src="${esc(u)}" alt=""></p>`).join('')}${c.video ? `<iframe src="https://www.youtube.com/embed/${esc(c.video)}" width="560" height="315" allowfullscreen></iframe>` : ''}`;
    const text = (c.text || '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean).map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
    return `${c.sub ? `<h3>${esc(c.sub)}</h3>` : ''}${v.order === 'text' ? text + media : media + text}`;
  }).join('');
}

export function mountBlocks(host, { initial, upload }) {
  let state = initial && Array.isArray(initial.cards) && initial.cards.length
    ? { order: initial.order === 'text' ? 'text' : 'media', cards: initial.cards.map((c) => ({ sub: c.sub || '', text: c.text || '', photos: c.photos || [], video: c.video || '', showSub: !!c.sub })) }
    : { order: 'media', cards: [{ sub: '', text: '', photos: [], video: '', showSub: false }] };
  let onChange = () => {};

  host.innerHTML = `<div class="blk-order" role="group" aria-label="사진·동영상과 글 순서"><i class="blk-ind"></i>
      <button type="button" data-order="media">사진·동영상 먼저</button><button type="button" data-order="text">글 먼저</button></div>
    <div class="blk-list"></div>
    <button type="button" class="blk-add">+ 추가</button>
    <button type="button" class="blk-preview">간단입력 미리보기</button>`;
  const list = host.querySelector('.blk-list');
  const orderBox = host.querySelector('.blk-order');

  const setOrder = () => {
    orderBox.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.order === state.order));
    const on = orderBox.querySelector('.on');
    const ind = orderBox.querySelector('.blk-ind');
    ind.style.width = `${on.offsetWidth}px`;
    ind.style.transform = `translateX(${on.offsetLeft - 6}px)`;
  };
  orderBox.addEventListener('click', (e) => {
    const b = e.target.closest('[data-order]');
    if (!b) return;
    state.order = b.dataset.order; setOrder(); onChange();
  });
  addEventListener('resize', setOrder);

  function cardHtml(c, i) {
    return `<div class="blk-card" data-i="${i}">
      <div class="blk-top"><b class="blk-no">${i + 1}</b><span class="blk-tools">
        <button type="button" data-up title="위로" aria-label="위로"${i === 0 ? ' disabled' : ''}>${UP}</button>
        <button type="button" data-down title="아래로" aria-label="아래로"${i === state.cards.length - 1 ? ' disabled' : ''}>${DOWN}</button>
        <button type="button" data-del${state.cards.length === 1 ? ' disabled' : ''}>삭제</button></span></div>
      <div class="blk-body">
        <div class="blk-media">
          ${c.photos.map((u, k) => `<span class="blk-thumb"><img src="${esc(u)}" alt=""><button type="button" data-rm-photo="${k}" aria-label="사진 빼기">✕</button></span>`).join('')}
          ${c.video ? `<span class="blk-thumb"><img src="https://img.youtube.com/vi/${esc(c.video)}/mqdefault.jpg" alt=""><i class="blk-play">${PLAY}</i><button type="button" data-rm-video aria-label="동영상 빼기">✕</button></span>` : ''}
          <button type="button" class="blk-slot" data-photo aria-label="사진 추가">${CAM}<i>+</i></button>
          ${c.video ? '' : `<button type="button" class="blk-slot" data-video aria-label="동영상 추가">${PLAY}<i>+</i></button>`}
        </div>
        ${c.showSub ? `<input class="input blk-sub" data-sub maxlength="100" placeholder="소제목" value="${esc(c.sub)}">` : '<button type="button" class="blk-subbtn" data-showsub>소제목</button>'}
        <textarea class="input blk-text" data-text placeholder="내용을 입력하세요">${esc(c.text)}</textarea>
      </div></div>`;
  }
  const draw = () => { list.innerHTML = state.cards.map(cardHtml).join(''); };

  // ↑↓ : 카드가 서로 미끄러지며 자리를 바꾼다 (FLIP)
  function moveCard(i, to) {
    const els = [...list.children];
    const first = new Map(els.map((el) => [el.dataset.i, el.getBoundingClientRect().top]));
    const [c] = state.cards.splice(i, 1);
    state.cards.splice(to, 0, c);
    const order = els.map((el) => el.dataset.i);
    const [m] = order.splice(i, 1);
    order.splice(to, 0, m);
    draw();
    if (reduced()) return;
    [...list.children].forEach((el, k) => {
      const dy = first.get(order[k]) - el.getBoundingClientRect().top;
      if (!dy) return;
      el.style.transition = 'none';
      el.style.transform = `translateY(${dy}px)`;
      void el.offsetHeight;
      el.style.transition = 'transform .3s cubic-bezier(.22, .8, .24, 1)';
      el.style.transform = '';
    });
  }

  list.addEventListener('input', (e) => {
    const card = e.target.closest('.blk-card');
    if (!card) return;
    const c = state.cards[+card.dataset.i];
    if (e.target.matches('[data-text]')) c.text = e.target.value;
    if (e.target.matches('[data-sub]')) c.sub = e.target.value;
    onChange();
  });
  list.addEventListener('click', async (e) => {
    const card = e.target.closest('.blk-card');
    if (!card) return;
    const i = +card.dataset.i;
    const c = state.cards[i];
    if (e.target.closest('[data-up]')) { moveCard(i, i - 1); onChange(); return; }
    if (e.target.closest('[data-down]')) { moveCard(i, i + 1); onChange(); return; }
    if (e.target.closest('[data-del]')) {
      if ((c.text.trim() || c.photos.length || c.video) && !card.querySelector('.blk-confirm')) {
        card.querySelector('.blk-top').insertAdjacentHTML('afterend', '<div class="confirm blk-confirm"><div>이 카드를 지웁니다. 넣은 사진과 글이 함께 빠집니다.</div><div class="actions"><button type="button" class="btn sm" data-no>그만두기</button><button type="button" class="btn sm danger fill" data-yes>삭제</button></div></div>');
        return;
      }
      state.cards.splice(i, 1); draw(); onChange(); return;
    }
    if (e.target.closest('[data-yes]')) { state.cards.splice(i, 1); draw(); onChange(); return; }
    if (e.target.closest('[data-no]')) { card.querySelector('.blk-confirm')?.remove(); return; }
    if (e.target.closest('[data-showsub]')) { c.showSub = true; draw(); list.children[i].querySelector('[data-sub]').focus(); return; }
    const rp = e.target.closest('[data-rm-photo]');
    if (rp) { c.photos.splice(+rp.dataset.rmPhoto, 1); draw(); onChange(); return; }
    if (e.target.closest('[data-rm-video]')) { c.video = ''; draw(); onChange(); return; }
    if (e.target.closest('[data-photo]')) {
      const input = document.createElement('input');
      input.type = 'file'; input.multiple = true; input.accept = 'image/png,image/jpeg,image/gif,image/webp';
      input.onchange = async () => {
        for (const f of input.files) {
          try { toast(`${f.name} 올리는 중…`); const url = await upload(f); c.photos.push(url); draw(); onChange(); } catch (er) { toast(er.message); }
        }
      };
      input.click();
      return;
    }
    if (e.target.closest('[data-video]')) {
      openDialog(`<h2>동영상 넣기</h2><form><label class="field"><span>YouTube 주소</span><input class="input" name="u" placeholder="https://www.youtube.com/watch?v=..." required autocomplete="off"></label>
        <p class="err" role="alert"></p><div class="dlg-foot"><button class="btn" type="button" data-close>취소</button><button class="btn primary" type="submit">넣기</button></div></form>`, (dlg) => {
        dlg.querySelector('form').addEventListener('submit', (ev) => {
          ev.preventDefault();
          const id = youtubeId(dlg.querySelector('[name=u]').value);
          if (!id) { dlg.querySelector('.err').textContent = 'YouTube 주소를 알아보지 못했습니다. 주소를 다시 확인해 주세요.'; return; }
          c.video = id; dlg.close(); draw(); onChange();
        });
      });
    }
  });
  host.querySelector('.blk-add').addEventListener('click', () => {
    state.cards.push({ sub: '', text: '', photos: [], video: '', showSub: false });
    draw(); onChange();
    const last = list.lastElementChild;
    last.classList.add('blk-new');
    last.querySelector('[data-text]').focus({ preventScroll: true });
    last.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'center' });
  });
  host.querySelector('.blk-preview').addEventListener('click', () => {
    openDialog(`<h2>간단입력 미리보기</h2><div class="prose blk-pv">${blocksToHtml(state) || '<p class="meta">아직 넣은 내용이 없습니다.</p>'}</div>
      <div class="dlg-foot"><button class="btn primary" type="button" data-close>닫기</button></div>`);
  });

  draw();
  requestAnimationFrame(setOrder);
  return {
    value: () => ({ order: state.order, cards: state.cards.map(({ sub, text, photos, video }) => ({ sub: sub.trim(), text, photos, video })) }),
    html: () => blocksToHtml(state),
    set(v) { state = { order: v.order || 'media', cards: v.cards.map((c) => ({ ...c, showSub: !!c.sub })) }; draw(); setOrder(); },
    onChange(fn) { onChange = fn; },
    relayout: setOrder,
  };
}
