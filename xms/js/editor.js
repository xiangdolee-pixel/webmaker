// 아주 작은 글 편집기 (contenteditable). 서버가 다시 한 번 HTML 을 정리하므로 여기서는 편하게만.
//   <div data-editor><textarea name="content" hidden>기존 HTML</textarea></div>
import { openDialog } from './common.js';

const TOOLS = [
  ['B', 'bold', '굵게'], ['I', 'italic', '기울임'], ['U', 'underline', '밑줄'], ['S', 'strikeThrough', '취소선'],
  ['제목', 'h3', '소제목'], ['본문', 'p', '본문'], ['•', 'insertUnorderedList', '글머리 목록'], ['1.', 'insertOrderedList', '번호 목록'],
  ['“', 'blockquote', '인용'], ['링크', 'link', '링크 넣기'], ['그림', 'image', '그림 주소 넣기'], ['―', 'insertHorizontalRule', '가로줄'],
];
const URL_OK = /^https?:\/\//i;

export function mountEditor(host, placeholder = '내용을 입력하세요') {
  const ta = host.querySelector('textarea');
  host.insertAdjacentHTML('afterbegin', `<div class="ed-bar" role="toolbar" aria-label="글 꾸미기">${TOOLS.map(([t, c, l]) =>
    `<button type="button" data-cmd="${c}" title="${l}" aria-label="${l}">${t}</button>`).join('')}</div>
    <div class="ed-area prose" contenteditable="true" role="textbox" aria-multiline="true" data-ph="${placeholder}"></div>`);
  const area = host.querySelector('.ed-area');
  area.innerHTML = ta.value;
  const sync = () => { ta.value = area.innerHTML.trim() === '<br>' ? '' : area.innerHTML; };
  area.addEventListener('input', sync);
  area.addEventListener('paste', (e) => {
    // 다른 곳에서 붙여 넣은 서식은 떼고 글자만
    const text = e.clipboardData?.getData('text/plain');
    if (text === undefined) return;
    e.preventDefault();
    document.execCommand('insertText', false, text);
  });

  // 선택 영역을 기억해 두고 대화상자에서 주소를 받는다
  function askUrl(label, done) {
    const sel = getSelection();
    const range = sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
    openDialog(`<h2>${label}</h2><form><label class="field"><span>주소</span><input class="input" name="u" type="url" placeholder="https://" required></label>
      <div class="dlg-foot"><button class="btn" type="button" data-close>취소</button><button class="btn primary" type="submit">넣기</button></div></form>`, (dlg) => {
      dlg.querySelector('form').addEventListener('submit', (e) => {
        e.preventDefault();
        const u = dlg.querySelector('[name=u]').value.trim();
        dlg.close();
        if (!URL_OK.test(u)) return;
        area.focus();
        if (range) { sel.removeAllRanges(); sel.addRange(range); }
        done(u);
        sync();
      });
    });
  }

  const bar = host.querySelector('.ed-bar');
  bar.addEventListener('mousedown', (e) => e.preventDefault());
  bar.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-cmd]');
    if (!b) return;
    const c = b.dataset.cmd;
    area.focus();
    if (c === 'h3' || c === 'p' || c === 'blockquote') document.execCommand('formatBlock', false, c);
    else if (c === 'link') { askUrl('링크 주소', (u) => document.execCommand('createLink', false, u)); return; }
    else if (c === 'image') { askUrl('그림 주소', (u) => document.execCommand('insertImage', false, u)); return; }
    else document.execCommand(c, false, null);
    sync();
  });
  return { sync, area };
}
