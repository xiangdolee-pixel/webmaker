// 글 편집기 — 에디터 ↔ 간단입력. 서버가 다시 한 번 HTML 을 정리하므로(허용 태그 · 정렬 · 글자 크기만) 여기서는 편하게.
//   <div data-editor data-board="<게시판 주소>"><textarea name="content" hidden>기존 HTML</textarea></div>
//   도구: 이미지 · 동영상(유튜브) · PDF | 제목1~3 | 굵게 · 기울임 · 밑줄 · 취소선 | 글자 크기 | 목록 · 번호 · 인용 · 코드 | 정렬 | 링크 · 가로줄 | 되돌리기 · 다시
import { openDialog, toast, slideTabs, esc } from './common.js';

const I = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const ICON = {
  image: I('<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="m4 18 5-5 4 4 3-3 4 4"/>'),
  video: I('<rect x="3" y="6" width="18" height="12" rx="3"/><path d="m10 9.5 5 2.5-5 2.5z"/>'),
  pdf: I('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>'),
  ul: I('<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>'),
  ol: I('<path d="M10 6h10M10 12h10M10 18h10M4 5l1.5-1v5M3.5 14.5c.5-1 2.5-1 2.5.3 0 1-2.5 1.6-2.5 3.2h2.6"/>'),
  quote: I('<path d="M7 17c-2 0-3-1.5-3-3.5C4 10 6 7.5 9 7l.5 1C7.6 9 7 10.2 7 11h2v6zM16 17c-2 0-3-1.5-3-3.5 0-3.5 2-6 5-6.5l.5 1c-1.9 1-2.5 2.2-2.5 3h2v6z"/>'),
  code: I('<path d="m8 8-4 4 4 4M16 8l4 4-4 4"/>'),
  justify: I('<path d="M4 6h16M4 10h16M4 14h16M4 18h16"/>'),
  left: I('<path d="M4 6h16M4 10h10M4 14h16M4 18h10"/>'),
  center: I('<path d="M4 6h16M7 10h10M4 14h16M7 18h10"/>'),
  right: I('<path d="M4 6h16M10 10h10M4 14h16M10 18h10"/>'),
  link: I('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'),
  hr: I('<path d="M4 12h16"/>'),
  undo: I('<path d="M9 7 5 11l4 4"/><path d="M5 11h9a5 5 0 0 1 0 10h-2"/>'),
  redo: I('<path d="m15 7 4 4-4 4"/><path d="M19 11h-9a5 5 0 0 0 0 10h2"/>'),
  editor: I('<path d="M4 7h16M4 12h10M4 17h13"/>'),
  simple: I('<rect x="3" y="5" width="18" height="11" rx="2"/><path d="M8 20h8"/>'),
};
const SIZES = [12, 14, 16, 18, 20, 24, 28, 32];
const ALIGN = { justify: 'justifyFull', left: 'justifyLeft', center: 'justifyCenter', right: 'justifyRight' };

// 모든 사진은 올릴 때 WEBP 로 바꾼다 (저장 공간 아끼기, 사용자 지시). 긴 변 1920px 까지, 화질 0.82 부터 900KB 안으로.
//   움직이는 GIF 는 그대로(바꾸면 움직임이 사라진다). 브라우저가 WEBP 를 못 만들면 JPEG 로.
export async function shrinkImage(file, { max = 1920, maxBytes = 900000 } = {}) {
  if (!/^image\/(png|jpeg|webp|bmp)$/.test(file.type)) return file;
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file); });
  const r = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * r); c.height = Math.round(img.naturalHeight * r);
  const g = c.getContext('2d');
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, 0, 0, c.width, c.height); // WEBP 는 투명을 그대로 담는다
  let q = 0.82; let blob;
  do { blob = await new Promise((res) => c.toBlob(res, 'image/webp', q)); q -= 0.08; } while (blob && blob.type === 'image/webp' && blob.size > maxBytes && q > 0.4);
  if (!blob || blob.type !== 'image/webp') { // WEBP 를 못 만드는 브라우저
    g.globalCompositeOperation = 'destination-over'; g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    q = 0.85;
    do { blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', q)); q -= 0.08; } while (blob.size > maxBytes && q > 0.4);
  }
  // 바꾼 게 더 크면(이미 작은 WEBP 등) 원래 파일을 쓴다
  if (file.type === 'image/webp' && file.size <= blob.size && r === 1) return file;
  const ext = blob.type === 'image/webp' ? 'webp' : 'jpg';
  return new File([blob], `${file.name.replace(/\.\w+$/, '')}.${ext}`, { type: blob.type });
}
export async function uploadFile(board, kind, file) {
  const res = await fetch(`/xms-api/uploads?board=${encodeURIComponent(board)}&kind=${kind}`, {
    method: 'POST', credentials: 'same-origin',
    headers: { 'Content-Type': file.type || 'application/octet-stream', 'X-File-Name': encodeURIComponent(file.name) },
    body: file,
  });
  const out = await res.json().catch(() => null);
  if (!res.ok) throw new Error(out?.error || '올리지 못했습니다.');
  return out;
}
const pickFile = (accept) => new Promise((resolve) => {
  const i = document.createElement('input');
  i.type = 'file'; i.accept = accept;
  i.onchange = () => resolve(i.files[0] || null);
  i.click();
});
const youtubeId = (u) => {
  const m = String(u).trim().match(/^(?:https?:\/\/)?(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{11})/);
  return m ? m[1] : null;
};
const textToHtml = (t) => t.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean).map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
const htmlToText = (h) => { const d = document.createElement('div'); d.innerHTML = h.replace(/<\/(p|h[1-6]|li|blockquote|pre|div)>/gi, '\n\n').replace(/<br\s*\/?>/gi, '\n'); return d.textContent.replace(/\n{3,}/g, '\n\n').trim(); };

export function mountEditor(host, { modeBox = null, placeholder = '내용을 입력하세요' } = {}) {
  const ta = host.querySelector('textarea');
  const board = host.dataset.board || '';
  const canUpload = !!board && host.dataset.guest !== '1'; // 게시판 글에서만 (약관 편집 등은 올리기 없음)
  const b = (cmd, title, inner, cls = '') => `<button type="button" data-cmd="${cmd}" title="${title}" aria-label="${title}" class="${cls}">${inner}</button>`;
  host.insertAdjacentHTML('afterbegin', `<div class="ed-bar" role="toolbar" aria-label="글 꾸미기">
      <div class="ed-g">${canUpload ? b('image', '이미지 넣기', `${ICON.image}<span>이미지</span>`, 'wide') : ''}${b('video', '동영상 넣기 (YouTube 주소)', `${ICON.video}<span>동영상</span>`, 'wide')}${canUpload ? b('pdf', 'PDF 넣기 (본문에서 바로 넘겨 봅니다)', `${ICON.pdf}<span>PDF</span>`, 'wide') : ''}</div>
      <div class="ed-g">${b('h2', '제목1', '<b>제목1</b>', 'txt')}${b('h3', '제목2', '<b>제목2</b>', 'txt')}${b('h4', '제목3', '제목3', 'txt')}</div>
      <div class="ed-g">${b('bold', '굵게', '<b>B</b>')}${b('italic', '기울임', '<i>I</i>')}${b('underline', '밑줄', '<u>U</u>')}${b('strikeThrough', '취소선', '<s>S</s>')}</div>
      <div class="ed-g"><select class="ed-size" title="글자 크기" aria-label="글자 크기">${SIZES.map((n) => `<option value="${n}"${n === 18 ? ' selected' : ''}>${n}px</option>`).join('')}</select></div>
      <div class="ed-g">${b('insertUnorderedList', '글머리 목록', ICON.ul)}${b('insertOrderedList', '번호 목록', ICON.ol)}${b('blockquote', '인용', ICON.quote)}${b('pre', '코드', ICON.code)}</div>
      <div class="ed-g">${b('justify', '양쪽 맞춤', ICON.justify, 'al')}${b('left', '왼쪽 맞춤', ICON.left, 'al')}${b('center', '가운데 맞춤', ICON.center, 'al')}${b('right', '오른쪽 맞춤', ICON.right, 'al')}</div>
      <div class="ed-g">${b('link', '링크', ICON.link)}${b('insertHorizontalRule', '가로줄', ICON.hr)}</div>
      <div class="ed-g">${b('undo', '되돌리기', ICON.undo)}${b('redo', '다시 하기', ICON.redo)}</div>
    </div>
    <div class="ed-area prose" contenteditable="true" role="textbox" aria-multiline="true" data-ph="${placeholder}"></div>
    <textarea class="ed-simple" hidden placeholder="${placeholder}"></textarea>`);
  const area = host.querySelector('.ed-area');
  const simple = host.querySelector('.ed-simple');
  const bar = host.querySelector('.ed-bar');
  area.innerHTML = ta.value;
  let mode = 'editor';
  const sync = () => {
    if (mode === 'simple') ta.value = textToHtml(simple.value);
    else ta.value = area.innerHTML.trim() === '<br>' ? '' : area.innerHTML;
  };
  area.addEventListener('input', sync);
  simple.addEventListener('input', sync);
  area.addEventListener('paste', (e) => {
    const f = [...(e.clipboardData?.files || [])].find((x) => x.type.startsWith('image/'));
    if (f && canUpload) { e.preventDefault(); insertImage(f); return; }
    const text = e.clipboardData?.getData('text/plain');
    if (text === undefined) return;
    e.preventDefault();
    document.execCommand('insertText', false, text); // 다른 곳 서식은 떼고 글자만
  });

  let saved = null;
  const save = () => { const s = getSelection(); if (s.rangeCount && area.contains(s.anchorNode)) saved = s.getRangeAt(0).cloneRange(); };
  const restore = () => { area.focus(); if (saved) { const s = getSelection(); s.removeAllRanges(); s.addRange(saved); } };
  const insert = (html) => { restore(); document.execCommand('insertHTML', false, html); sync(); };

  async function insertImage(file) {
    if (!file) return;
    try {
      toast('그림을 올리는 중…');
      const up = await uploadFile(board, 'INLINE', await shrinkImage(file));
      insert(`<img src="${up.url}" alt="">`);
      toast('그림을 넣었습니다.');
    } catch (e) { toast(e.message); }
  }
  const ask = (title, label, ph, done) => openDialog(`<h2>${title}</h2><form><label class="field"><span>${label}</span><input class="input" name="u" placeholder="${ph}" required autocomplete="off"></label>
      <p class="err" role="alert"></p><div class="dlg-foot"><button class="btn" type="button" data-close>취소</button><button class="btn primary" type="submit">넣기</button></div></form>`, (dlg) => {
    dlg.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault();
      const v = dlg.querySelector('[name=u]').value.trim();
      const err = done(v);
      if (err) { dlg.querySelector('.err').textContent = err; return; }
      dlg.close();
    });
  });

  bar.addEventListener('mousedown', (e) => { if (e.target.closest('button')) { save(); e.preventDefault(); } });
  bar.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-cmd]');
    if (!btn) return;
    const c = btn.dataset.cmd;
    if (c === 'image') { save(); insertImage(await pickFile('image/png,image/jpeg,image/gif,image/webp')); return; }
    if (c === 'pdf') {
      save();
      const f = await pickFile('application/pdf');
      if (!f) return;
      try { toast('PDF를 올리는 중…'); const up = await uploadFile(board, 'INLINE', f); insert(`<iframe src="${up.url}"></iframe><p><a href="${up.url}">${esc(f.name)}</a></p>`); toast('PDF를 넣었습니다.'); } catch (er) { toast(er.message); }
      return;
    }
    if (c === 'video') {
      save();
      ask('동영상 넣기', 'YouTube 주소', 'https://www.youtube.com/watch?v=...', (v) => {
        const id = youtubeId(v);
        if (!id) return 'YouTube 주소를 알아보지 못했습니다. 주소를 다시 확인해 주세요.';
        insert(`<iframe src="https://www.youtube.com/embed/${id}" width="560" height="315" allowfullscreen></iframe><p><br></p>`);
        return null;
      });
      return;
    }
    if (c === 'link') {
      save();
      ask('링크 넣기', '주소', 'https://', (v) => {
        if (!/^(https?:\/\/|\/|mailto:|tel:)/i.test(v)) return '주소는 https:// 로 시작하게 넣어 주세요.';
        restore(); document.execCommand('createLink', false, v); sync(); return null;
      });
      return;
    }
    area.focus();
    if (['h2', 'h3', 'h4', 'blockquote', 'pre'].includes(c)) {
      const cur = document.queryCommandValue('formatBlock').toLowerCase();
      document.execCommand('formatBlock', false, cur === c ? 'p' : c); // 같은 것을 다시 누르면 본문으로
    } else if (ALIGN[c]) {
      document.execCommand('styleWithCSS', false, true);
      document.execCommand(ALIGN[c], false, null);
      document.execCommand('styleWithCSS', false, false);
    } else document.execCommand(c, false, null);
    sync(); refresh();
  });
  // 글자 크기: 고른 글자를 span style="font-size" 로 감싼다
  bar.querySelector('.ed-size').addEventListener('change', (e) => {
    restore();
    document.execCommand('fontSize', false, '7');
    area.querySelectorAll('font[size="7"]').forEach((f) => {
      const s = document.createElement('span');
      s.style.fontSize = `${e.target.value}px`;
      s.innerHTML = f.innerHTML;
      f.replaceWith(s);
    });
    sync();
  });
  bar.addEventListener('focusin', (e) => { if (e.target.matches('.ed-size')) save(); });
  // 지금 정렬 · 서식 표시
  function refresh() {
    if (mode !== 'editor') return;
    const sel = getSelection();
    if (!sel.rangeCount || !area.contains(sel.anchorNode)) return;
    bar.querySelectorAll('[data-cmd]').forEach((x) => {
      const c = x.dataset.cmd;
      let on = false;
      try {
        if (ALIGN[c]) on = document.queryCommandState(ALIGN[c]) || (c === 'left' && !['justifyCenter', 'justifyRight', 'justifyFull'].some((k) => document.queryCommandState(k)));
        else if (['bold', 'italic', 'underline', 'strikeThrough', 'insertUnorderedList', 'insertOrderedList'].includes(c)) on = document.queryCommandState(c);
        else if (['h2', 'h3', 'h4', 'blockquote', 'pre'].includes(c)) on = document.queryCommandValue('formatBlock').toLowerCase() === c;
      } catch { /* 지원 안 하는 브라우저 */ }
      x.classList.toggle('on', on);
    });
  }
  document.addEventListener('selectionchange', refresh);

  // 에디터 ↔ 간단입력
  if (modeBox) {
    modeBox.innerHTML = `<button type="button" data-v="editor" class="on">${ICON.editor}에디터</button><button type="button" data-v="simple">${ICON.simple}간단입력</button>`;
    requestAnimationFrame(() => slideTabs(modeBox));
    modeBox.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-v]');
      if (!btn || btn.dataset.v === mode) return;
      modeBox.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === btn));
      slideTabs(modeBox);
      mode = btn.dataset.v;
      if (mode === 'simple') {
        simple.value = htmlToText(area.innerHTML);
        if (/<(img|iframe|h[2-4]|ul|ol|blockquote|table)/i.test(area.innerHTML)) toast('간단입력에서는 글자만 남습니다. 그림 · 동영상 · 서식은 에디터로 돌아가면 다시 넣어야 합니다.');
      } else area.innerHTML = textToHtml(simple.value);
      bar.hidden = mode === 'simple';
      area.hidden = mode === 'simple';
      simple.hidden = mode !== 'simple';
      (mode === 'simple' ? simple : area).focus();
      sync();
    });
  }
  return { sync, area };
}
