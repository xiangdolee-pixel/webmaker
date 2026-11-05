// @ts-check
// 스쿨타임라인 화면 동작 — 생년월일은 이 브라우저 안에서만 계산한다(서버 · 주소창 · 분석 도구로 보내지 않음).
import { calculate, normalizeDateInput, todayInSeoul, STAGE_NAME, STAGE_SHORT, MODE_NAME } from './school-year.js';
import { ITEMS, SOURCES } from './admission-2027.js';
import { buildIcs, icsStamp } from './calendar-export.js';

const $ = (/** @type {string} */ s, /** @type {ParentNode} */ root = document) => /** @type {HTMLElement | null} */ (root.querySelector(s));
const $$ = (/** @type {string} */ s, /** @type {ParentNode} */ root = document) => /** @type {HTMLElement[]} */ ([...root.querySelectorAll(s)]);
const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** 짧은 알림 @param {string} msg */
function toast(msg) {
  let t = $('.toast');
  if (!t) {
    t = document.createElement('div');
    t.className = 'toast';
    t.setAttribute('role', 'status');
    document.body.append(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(Number(t.dataset.timer));
  t.dataset.timer = String(setTimeout(() => t?.classList.remove('show'), 2200));
}

/* ───── 모바일 메뉴 ───── */
function initNav() {
  const btn = $('.nav-toggle');
  const header = $('.site-header');
  if (!btn || !header) return;
  const set = (/** @type {boolean} */ open) => {
    header.classList.toggle('nav-open', open);
    btn.setAttribute('aria-expanded', String(open));
    btn.setAttribute('aria-label', open ? '메뉴 닫기' : '메뉴 열기');
  };
  btn.addEventListener('click', () => set(!header.classList.contains('nav-open')));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && header.classList.contains('nav-open')) { set(false); btn.focus(); } });
  document.addEventListener('click', (e) => { if (!header.contains(/** @type {Node} */ (e.target))) set(false); });
}

/* ───── 스크롤 등장 ───── */
function initReveal() {
  const els = $$('.reveal');
  if (!('IntersectionObserver' in window) || reduceMotion()) { els.forEach((el) => el.classList.add('in')); return; }
  const io = new IntersectionObserver((entries) => entries.forEach((e) => {
    if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
  }), { rootMargin: '0px 0px -8% 0px' });
  els.forEach((el) => io.observe(el));
}

/* ───── 알약 고르기: 떠 있는 배경 하나를 고른 칸으로 옮긴다 ───── */
/** @param {HTMLElement} seg */
function initSeg(seg) {
  const ind = $('.seg-ind', seg);
  if (!ind) return;
  const place = (/** @type {boolean} */ animate) => {
    const on = /** @type {HTMLInputElement | null} */ (seg.querySelector('input:checked'))?.closest('label');
    if (!on || !on.offsetWidth) { seg.classList.add('no-ind'); return; } // 숨겨져 폭을 못 재면 칸 배경으로 대신
    seg.classList.remove('no-ind');
    if (!animate) ind.style.transition = 'none';
    ind.style.width = `${on.offsetWidth}px`;
    ind.style.transform = `translateX(${on.offsetLeft}px)`;
    if (!animate) { void ind.offsetWidth; ind.style.transition = ''; }
  };
  seg.addEventListener('change', () => place(true));
  window.addEventListener('resize', () => place(false));
  document.fonts?.ready.then(() => place(false));
  place(false);
}

/* ───── 계산기 ───── */
const esc = (/** @type {unknown} */ s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const dotDate = (/** @type {string} */ ymd) => { const [y, m, d] = ymd.split('-').map(Number); return `${y}. ${m}. ${d}.`; };

/** @param {import('./school-year.js').CalcOk} r */
function resultHtml(r) {
  const ac = r.status.academicYear;
  const basisTag = r.basis === 'normal' ? '정상 입학 가정' : MODE_NAME[r.basis];
  const diff = r.entryYear !== r.legalEntryYear ? `<p class="result-sub">법정 기준(정상 입학)으로는 ${r.legalEntryYear}년 입학이에요.</p>` : '';
  const curIdx = ac - r.entryYear;
  const stages = /** @type {const} */ (['elementary', 'middle', 'high']);
  const cls = { elementary: 'e', middle: 'm', high: 'h' };
  const bar = stages.map((st) => {
    const cells = r.timeline.map((row, i) => ({ row, i })).filter(({ row }) => row.stage === st)
      .map(({ row, i }) => `<span class="bar-cell${i < curIdx ? ' past' : ''}${i === curIdx ? ' cur' : ''}" title="${row.year}학년도 ${STAGE_NAME[st]} ${row.grade}학년">${row.grade}</span>`).join('');
    return `<div class="bar-stage ${cls[st]}"><b>${STAGE_NAME[st]}</b><div class="bar-cells">${cells}</div></div>`;
  }).join('');
  const rows = r.timeline.map((row, i) => `<tr class="${i === curIdx ? 'cur' : ''}${i === 6 || i === 9 ? ' stage-start' : ''}">
      <th scope="row"><span class="dot ${cls[row.stage]}" aria-hidden="true"></span>${STAGE_SHORT[row.stage]}${row.grade}</th>
      <td class="n">${row.year}학년도${i === curIdx ? ' <span class="tag tag-ok">지금</span>' : ''}</td>
      <td class="n period">${row.year}. 3. ~ ${row.year + 1}. 2.</td></tr>`).join('');
  const link2027 = r.entryYear === 2027
    ? '<a class="btn" href="/admission/2027/">2027 입학 준비 체크리스트</a>' : '';
  const notes = [
    '일반적인 학제(초 6년 · 중 3년 · 고 3년)를 가정한 결과예요. 유예 · 휴학 · 조기졸업 · 해외 학력 · 검정고시는 반영하지 않아요.',
    '실제 입학식 · 졸업식 날짜는 학교마다 달라요.',
    ...r.notes,
  ];
  return `
    <div class="result-head">
      <p class="result-from">${r.birthYear}년생</p>
      <p class="result-big"><b>${r.entryYear}년 3월</b> 초등학교 입학</p>
      <span class="tag">${esc(basisTag)}</span>
      ${diff}
    </div>
    <div class="card">
      <div class="now">
        <span class="now-label">${ac}학년도 기준 (${dotDate(r.referenceDate)})</span>
        <span class="now-value">${esc(r.status.label)}</span>
      </div>
    </div>
    <dl class="miles">
      <div class="mile"><dt>초등학교 입학</dt><dd>${r.milestones.elementary}<small>년</small></dd></div>
      <div class="mile"><dt>중학교 진학</dt><dd>${r.milestones.middle}<small>년</small></dd></div>
      <div class="mile"><dt>고등학교 진학</dt><dd>${r.milestones.high}<small>년</small></dd></div>
      <div class="mile"><dt>고등학교 졸업</dt><dd>${r.milestones.graduation}<small>년 2월 무렵</small></dd></div>
    </dl>
    <div class="card">
      <h3>12년 한눈에 보기</h3>
      <div class="bar-wrap"><div class="bar" aria-hidden="true">${bar}</div></div>
      <div class="table-scroll">
        <table class="ytable">
          <caption class="sr-only">학년별 학년도</caption>
          <thead><tr><th scope="col">학년</th><th scope="col">학년도</th><th scope="col" class="period">기간</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>
    <ul class="notes">${notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>
    <div class="btn-row no-print">
      <button class="btn" type="button" data-print>인쇄하기</button>
      ${link2027}
    </div>`;
}

/** @param {HTMLFormElement} form */
function initCalc(form) {
  const result = /** @type {HTMLElement} */ ($('#result'));
  const status = /** @type {HTMLElement} */ ($('#calc-status'));
  const fields = {
    birthDate: /** @type {HTMLInputElement} */ ($('#dob', form)),
    actualEntryYear: /** @type {HTMLInputElement} */ ($('#actual', form)),
    referenceDate: /** @type {HTMLInputElement} */ ($('#refdate', form)),
  };
  const today = todayInSeoul();
  fields.referenceDate.placeholder = `오늘 (${today})`;

  // 입력란을 떠날 때 날짜 꼴을 다듬어 보여 준다
  for (const el of [fields.birthDate, fields.referenceDate]) {
    el.addEventListener('blur', () => { if (el.value.trim()) el.value = normalizeDateInput(el.value); });
  }

  const showErrors = (/** @type {{ field: string, message: string }[]} */ errors) => {
    for (const [k, el] of Object.entries(fields)) {
      const e = errors.find((x) => x.field === k);
      const box = /** @type {HTMLElement} */ ($(`#${el.id}-err`));
      el.setAttribute('aria-invalid', e ? 'true' : 'false');
      box.hidden = !e;
      box.textContent = e ? e.message : '';
    }
  };

  form.addEventListener('submit', (ev) => {
    ev.preventDefault(); // 주소창에 아무것도 남기지 않는다
    const mode = /** @type {HTMLInputElement | null} */ (form.querySelector('input[name="mode"]:checked'))?.value || 'normal';
    const r = calculate({
      birthDate: normalizeDateInput(fields.birthDate.value),
      mode: /** @type {import('./school-year.js').EntryMode} */ (mode),
      actualEntryYear: fields.actualEntryYear.value,
      referenceDate: normalizeDateInput(fields.referenceDate.value),
      today,
    });
    if (!r.ok) {
      showErrors(r.errors);
      if (r.errors.some((e) => e.field !== 'birthDate')) /** @type {HTMLDetailsElement} */ ($('.more', form)).open = true;
      const first = fields[/** @type {keyof typeof fields} */ (r.errors[0].field)];
      first?.focus();
      status.textContent = `입력을 확인해 주세요. ${r.errors[0].message}`;
      return;
    }
    showErrors([]);
    fields.birthDate.value = normalizeDateInput(fields.birthDate.value);
    result.innerHTML = resultHtml(r);
    result.hidden = false;
    result.classList.remove('show');
    void result.offsetWidth;
    result.classList.add('show');
    status.textContent = `${r.birthYear}년생, ${r.entryYear}년 초등학교 입학. ${r.status.academicYear}학년도 기준 ${r.status.label}. 중학교 ${r.milestones.middle}년, 고등학교 ${r.milestones.high}년 진학.`;
    const top = result.getBoundingClientRect().top;
    if (top > window.innerHeight * 0.7 || top < 0) result.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' });
  });
}

/* ───── 2027 입학 준비: 체크리스트 · 일정 파일 · 공유 ───── */
function initChecklist() {
  const list = $('[data-checklist]');
  if (!list) return;
  const boxes = /** @type {HTMLInputElement[]} */ ($$('input[type="checkbox"]', list));
  const out = $('[data-check-progress]');
  const update = () => { if (out) out.textContent = `${boxes.filter((b) => b.checked).length} / ${boxes.length} 완료`; };
  list.addEventListener('change', update);
  $('[data-check-reset]')?.addEventListener('click', () => { boxes.forEach((b) => { b.checked = false; }); update(); toast('체크를 모두 지웠어요.'); });
  update();
}

function markPast() {
  const today = todayInSeoul();
  for (const el of $$('[data-end]')) {
    if ((el.dataset.end || '') < today) {
      el.classList.add('past');
      const meta = $('.sched-meta', el);
      if (meta && !$('.tag-past', meta)) meta.insertAdjacentHTML('beforeend', '<span class="tag tag-past">지난 일정</span>');
    }
  }
}

function initIcs() {
  const btn = $('[data-ics]');
  if (!btn) return;
  btn.addEventListener('click', () => {
    // 법령 원문으로 확인한 일반 기한만 넣는다 (학교별 예비소집 · 입학식 · 미확인 항목은 넣지 않음)
    const events = ITEMS.filter((it) => it.status === 'verified' && it.start && it.end).map((it) => {
      const src = it.source ? SOURCES[it.source] : null;
      return {
        uid: `${it.id}-2027@school-timeline`,
        title: `[2027 취학] ${it.title}`,
        start: /** @type {string} */ (it.start),
        end: /** @type {string} */ (it.end),
        description: `${it.note}\n법령상 기한이며 실제 관공서 · 학교 일정과 다를 수 있습니다.${src ? `\n근거: ${src.title}` : ''}\n확인일: ${it.verifiedAt}`,
        url: src?.url,
      };
    });
    const ics = buildIcs(events, { calendarName: '2027학년도 초등 취학 법정 일정', stamp: icsStamp(new Date()) });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
    a.download = '2027-초등취학-법정일정.ics';
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast(`일정 ${events.length}개를 담은 파일을 만들었어요.`);
  });
}

function initShare() {
  for (const btn of $$('[data-share]')) {
    btn.addEventListener('click', async () => {
      const url = location.origin + location.pathname; // 개인 정보 없는 페이지 주소만
      try {
        if (navigator.share) { await navigator.share({ title: document.title, url }); return; }
        await navigator.clipboard.writeText(url);
        toast('페이지 주소를 복사했어요.');
      } catch (e) {
        if (/** @type {Error} */ (e).name !== 'AbortError') toast('공유하지 못했어요. 주소창의 주소를 복사해 주세요.');
      }
    });
  }
}

/* ───── 시작 ───── */
document.addEventListener('click', (e) => {
  if (/** @type {HTMLElement} */ (e.target).closest?.('[data-print]')) window.print();
});
document.documentElement.classList.add('js');
initNav();
initReveal();
$$('[data-seg]').forEach(initSeg);
const calcForm = /** @type {HTMLFormElement | null} */ ($('#calc'));
if (calcForm) initCalc(calcForm);
initChecklist();
markPast();
initIcs();
initShare();
