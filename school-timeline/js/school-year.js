// @ts-check
// 스쿨타임라인 — 학년 · 입학년도 계산 (순수 함수, 화면 · 네트워크와 무관)
//
// 날짜는 Date 로 파싱하지 않고 "YYYY-MM-DD" 문자열을 숫자로 나눠 다룬다.
//   new Date('2020-12-31') 는 UTC 자정으로 읽혀 한국 밖 시간대에서 하루 밀릴 수 있다 → 쓰지 않는다.
// 근거
//   초·중등교육법 제13조 ① 6세가 된 날이 속하는 해의 다음 해 3월 1일 입학 → 출생연도 + 7
//                        ② 5세가 된 해의 다음 해(1년 빨리) 또는 7세가 된 해의 다음 해(1년 늦게) 입학 가능
//   초·중등교육법 제24조 ① 학년도는 3월 1일부터 다음 해 2월 말일까지

/** @typedef {{ y: number, m: number, d: number }} Ymd */
/** @typedef {'normal' | 'early' | 'late'} EntryMode */
/** @typedef {'elementary' | 'middle' | 'high'} Stage */
/** @typedef {{ stage: Stage, grade: number, year: number }} TimelineRow */
/**
 * @typedef {Object} GradeStatus
 * @property {number} academicYear 기준일이 속한 학년도
 * @property {'before' | Stage | 'graduated'} stage
 * @property {number} grade 학년(입학 전 · 졸업 후는 0)
 * @property {string} label 사람이 읽는 문구
 */
/**
 * @typedef {Object} CalcInput
 * @property {string} birthDate 생년월일 YYYY-MM-DD
 * @property {EntryMode} [mode] 입학 방식 (기본 normal)
 * @property {number | string | null} [actualEntryYear] 실제 초등 입학년도 (있으면 mode 보다 우선)
 * @property {string} [referenceDate] 기준일 YYYY-MM-DD (기본 오늘 — 한국 시간)
 * @property {string} [today] 오늘 YYYY-MM-DD (테스트용, 기본 한국 시간 오늘)
 */
/**
 * @typedef {Object} CalcOk
 * @property {true} ok
 * @property {number} birthYear
 * @property {number} legalEntryYear 법정(정상) 초등 입학년도
 * @property {number} entryYear 최종 초등 입학년도
 * @property {'normal' | 'early' | 'late' | 'actual'} basis 최종 입학년도의 근거
 * @property {string} referenceDate
 * @property {GradeStatus} status
 * @property {TimelineRow[]} timeline 초1 ~ 고3
 * @property {{ elementary: number, middle: number, high: number, graduation: number }} milestones
 *   graduation = 고3 학년도 + 1 (그 해 2월 무렵 졸업 · 다음 진학 연도)
 * @property {string[]} notes 알아 두면 좋은 안내
 */
/** @typedef {{ ok: false, errors: { field: string, message: string }[] }} CalcFail */

export const MIN_BIRTH = '1900-01-01';
/** 출산 예정일도 받되, 오타를 막으려고 오늘부터 몇 년 뒤까지만 */
export const MAX_FUTURE_YEARS = 10;
/** 2009학년도(2002년생)부터 1~12월생이 같은 해에 입학 — 그 전에는 1·2월생이 한 해 먼저 입학했다 */
export const CALENDAR_YEAR_RULE_FROM = 2002;

export const STAGE_NAME = /** @type {const} */ ({ elementary: '초등학교', middle: '중학교', high: '고등학교' });
export const STAGE_SHORT = /** @type {const} */ ({ elementary: '초', middle: '중', high: '고' });
export const MODE_NAME = /** @type {const} */ ({ normal: '정상 입학', early: '1년 조기입학', late: '1년 입학연기', actual: '실제 입학년도' });

const pad = (/** @type {number} */ n, w = 2) => String(n).padStart(w, '0');

/** @param {number} y */
export const isLeapYear = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
/** @param {number} y @param {number} m */
export const daysInMonth = (y, m) => [31, isLeapYear(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];

/**
 * 엄격한 YYYY-MM-DD 파싱. 없는 날짜(2020-02-30 등)는 null.
 * @param {unknown} s
 * @returns {Ymd | null}
 */
export function parseYmd(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s ?? '').trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) return null;
  return { y, m: mo, d };
}

/** @param {Ymd} v */
export const formatYmd = (v) => `${pad(v.y, 4)}-${pad(v.m)}-${pad(v.d)}`;

/** 두 날짜 비교 (문자열 비교와 같지만 뜻을 분명히) @param {Ymd} a @param {Ymd} b */
export const compareYmd = (a, b) => (a.y - b.y) || (a.m - b.m) || (a.d - b.d);

/**
 * 사람이 친 날짜를 YYYY-MM-DD 로 다듬는다. 2020.3.5 · 2020/03/05 · 2020 3 5 · 20200305 → 2020-03-05
 * 다듬을 수 없으면 입력을 그대로 돌려준다(검증에서 걸린다).
 * @param {string} raw
 */
export function normalizeDateInput(raw) {
  const s = String(raw ?? '').trim();
  let m = /^(\d{4})(\d{2})(\d{2})$/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{4})\s*[-./년\s]\s*(\d{1,2})\s*[-./월\s]\s*(\d{1,2})\s*일?\.?$/.exec(s);
  if (m) return `${m[1]}-${pad(Number(m[2]))}-${pad(Number(m[3]))}`;
  return s;
}

/**
 * 지금 한국(Asia/Seoul) 날짜 YYYY-MM-DD. 브라우저 시간대와 상관없다.
 * @param {Date} [now]
 */
export function todayInSeoul(now = new Date()) {
  // 한국은 일광절약시간이 없어 UTC+9 고정
  const t = new Date(now.getTime() + 9 * 3600000);
  return `${pad(t.getUTCFullYear(), 4)}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** 기준일이 속한 학년도: 3월 이후면 그 해, 1 · 2월이면 전년도 @param {Ymd} ref */
export const academicYearOf = (ref) => (ref.m >= 3 ? ref.y : ref.y - 1);

/** 법정(정상) 초등 입학년도 @param {number} birthYear */
export const legalEntryYear = (birthYear) => birthYear + 7;

/** @param {number} birthYear @param {EntryMode} mode */
export function entryYearFor(birthYear, mode) {
  const base = legalEntryYear(birthYear);
  return mode === 'early' ? base - 1 : mode === 'late' ? base + 1 : base;
}

/** 초1 ~ 고3 연도 목록 @param {number} entryYear @returns {TimelineRow[]} */
export function buildTimeline(entryYear) {
  /** @type {TimelineRow[]} */
  const rows = [];
  for (let i = 0; i < 12; i++) {
    const stage = i < 6 ? 'elementary' : i < 9 ? 'middle' : 'high';
    const grade = i < 6 ? i + 1 : i < 9 ? i - 5 : i - 8;
    rows.push({ stage, grade, year: entryYear + i });
  }
  return rows;
}

/**
 * 기준 학년도의 학년
 * @param {number} entryYear @param {number} academicYear
 * @returns {GradeStatus}
 */
export function gradeIn(entryYear, academicYear) {
  const k = academicYear - entryYear; // 0 = 초1
  if (k < 0) {
    const left = -k;
    return { academicYear, stage: 'before', grade: 0, label: left === 1 ? '초등학교 입학 전 (다음 학년도에 입학)' : `초등학교 입학 전 (${left}년 뒤 입학)` };
  }
  if (k >= 12) return { academicYear, stage: 'graduated', grade: 0, label: '고등학교 졸업 후' };
  const row = buildTimeline(entryYear)[k];
  return { academicYear, stage: row.stage, grade: row.grade, label: `${STAGE_NAME[row.stage]} ${row.grade}학년` };
}

/**
 * 입력 검증 + 계산. 오류가 하나라도 있으면 계산하지 않는다.
 * @param {CalcInput} input
 * @returns {CalcOk | CalcFail}
 */
export function calculate(input) {
  /** @type {{ field: string, message: string }[]} */
  const errors = [];
  const todayStr = input.today ?? todayInSeoul();
  const today = parseYmd(todayStr);
  if (!today) throw new Error(`today 형식 오류: ${todayStr}`);

  const rawBirth = String(input.birthDate ?? '').trim();
  const birth = parseYmd(rawBirth);
  if (!rawBirth) errors.push({ field: 'birthDate', message: '생년월일을 입력해 주세요.' });
  else if (!birth) errors.push({ field: 'birthDate', message: '없는 날짜이거나 형식이 맞지 않아요. 예) 2020-03-15' });
  else if (compareYmd(birth, /** @type {Ymd} */ (parseYmd(MIN_BIRTH))) < 0) errors.push({ field: 'birthDate', message: '1900년 1월 1일 이후 날짜만 계산할 수 있어요.' });
  // 아직 태어나지 않은 아이(출산 예정일)도 계산한다 — 오타를 막으려고 10년 뒤까지만
  else if (birth.y > today.y + MAX_FUTURE_YEARS) errors.push({ field: 'birthDate', message: `너무 먼 날짜예요. ${today.y + MAX_FUTURE_YEARS}년까지 넣을 수 있어요.` });

  const mode = input.mode ?? 'normal';
  if (!['normal', 'early', 'late'].includes(mode)) errors.push({ field: 'mode', message: '입학 방식을 다시 골라 주세요.' });

  let ref = today;
  const rawRef = String(input.referenceDate ?? '').trim();
  if (rawRef) {
    const r = parseYmd(rawRef);
    if (!r) errors.push({ field: 'referenceDate', message: '기준일이 없는 날짜이거나 형식이 맞지 않아요. 예) 2027-03-01' });
    else if (r.y < 1900 || r.y > 2200) errors.push({ field: 'referenceDate', message: '기준일은 1900년부터 2200년 사이로 넣어 주세요.' });
    else ref = r;
  }

  /** @type {number | null} */
  let actual = null;
  const rawActual = input.actualEntryYear;
  if (rawActual !== undefined && rawActual !== null && String(rawActual).trim() !== '') {
    const s = String(rawActual).trim();
    if (!/^\d{4}$/.test(s)) errors.push({ field: 'actualEntryYear', message: '실제 입학년도는 네 자리 연도로 넣어 주세요. 예) 2027' });
    else {
      actual = Number(s);
      // 일반적인 범위(만 4~9세 무렵 입학)를 벗어나면 오타로 본다
      if (birth && (actual < birth.y + 4 || actual > birth.y + 10)) {
        errors.push({ field: 'actualEntryYear', message: `출생연도와 맞지 않는 입학년도예요. ${birth.y + 4}~${birth.y + 10}년 사이로 넣어 주세요.` });
      }
    }
  }

  if (errors.length || !birth) return { ok: false, errors };

  const legal = legalEntryYear(birth.y);
  const entryYear = actual ?? entryYearFor(birth.y, /** @type {EntryMode} */ (mode));
  const basis = actual !== null ? 'actual' : /** @type {EntryMode} */ (mode);
  const notes = [];
  if (compareYmd(birth, today) > 0) notes.push('아직 오지 않은 날짜라 출산 예정일 기준으로 계산했어요. 태어난 해가 바뀌면 입학년도도 달라져요.');
  if (birth.y < CALENDAR_YEAR_RULE_FROM && birth.m <= 2 && actual === null) {
    notes.push('2001년 이전 1·2월생은 당시 기준에 따라 한 해 먼저 입학한 경우가 많아요. 실제 입학년도를 넣으면 더 정확해요.');
  }
  return {
    ok: true,
    birthYear: birth.y,
    legalEntryYear: legal,
    entryYear,
    basis,
    referenceDate: formatYmd(ref),
    status: gradeIn(entryYear, academicYearOf(ref)),
    timeline: buildTimeline(entryYear),
    milestones: { elementary: entryYear, middle: entryYear + 6, high: entryYear + 9, graduation: entryYear + 12 },
    notes,
  };
}
