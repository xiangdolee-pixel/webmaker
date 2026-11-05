// @ts-check
// 2027학년도 초등학교 취학 일정 — 해가 바뀌면 이 파일부터 고친다 (새 연도는 새 파일로, 숫자만 바꿔 복제하지 말고 법령을 다시 확인)
//
// status
//   'verified'   법령 원문으로 확인한 일반 기한 → 화면에 날짜 표시 + 일정 파일(.ics)에 넣는다
//   'unverified' 날짜를 법령 원문으로 확인하지 못함 → '확인 필요'로 표시, .ics 에 넣지 않는다
//   'local'      지역 · 학교마다 다른 일정 → 날짜를 넣지 않고 확인 방법만 안내
// dateType
//   'legal'      법령상 기한(관공서가 지켜야 하는 마감) — 실제 서비스 오픈일 · 학교 행사일과 다르다
//   'reference'  참고 일정

export const VERIFIED_AT = '2026-11-05';
export const DECREE_VERSION = '초·중등교육법 시행령 (대통령령 제36785호, 2026. 10. 29. 시행)';
export const ACT_VERSION = '초·중등교육법 (법률 제21580호, 2026. 10. 29. 시행)';

export const SOURCES = /** @type {const} */ ({
  act13: { title: '초·중등교육법 제13조(취학 의무)', url: 'https://www.law.go.kr/LSW/lsLinkCommonInfo.do?lsJoLnkSeq=1032860055' },
  decree15: { title: '초·중등교육법 시행령 제15조(취학아동명부의 작성 등)', url: 'https://www.law.go.kr/LSW/lsLinkCommonInfo.do?lsJoLnkSeq=1018597255' },
  decree16: { title: '초·중등교육법 시행령 제16조', url: 'https://www.law.go.kr/법령/초·중등교육법시행령' },
  decree17: { title: '초·중등교육법 시행령 제17조(취학의 통지 등)', url: 'https://law.go.kr/LSW/lsLinkCommonInfo.do?chrClsCd=010202&lsJoLnkSeq=1023494997' },
  gov24: { title: '정부24', url: 'https://www.gov.kr' },
  schoolinfo: { title: '학교알리미', url: 'https://www.schoolinfo.go.kr' },
});

/**
 * @typedef {Object} AdmissionItem
 * @property {string} id
 * @property {string} title
 * @property {string | null} start YYYY-MM-DD (날짜 없음 = null)
 * @property {string | null} end   YYYY-MM-DD (하루짜리면 start 와 같음)
 * @property {'legal' | 'reference'} dateType
 * @property {'verified' | 'unverified' | 'local'} status
 * @property {string} who 누가 하는 일인가
 * @property {string} note
 * @property {keyof typeof SOURCES | null} source
 * @property {string | null} verifiedAt
 */

/** @type {AdmissionItem[]} */
export const ITEMS = [
  {
    id: 'roll-survey', title: '취학아동명부 조사 기준일', start: '2026-10-01', end: '2026-10-01',
    dateType: 'legal', status: 'verified', who: '읍·면·동장',
    note: '이날 기준으로 관내에 사는, 2026년에 6세가 되는 아동(2020년생)을 조사합니다.',
    source: 'decree15', verifiedAt: VERIFIED_AT,
  },
  {
    id: 'roll-deadline', title: '취학아동명부 작성 기한', start: '2026-10-31', end: '2026-10-31',
    dateType: 'legal', status: 'verified', who: '읍·면·동장',
    note: '조사한 아동으로 취학아동명부를 만드는 법정 기한입니다.',
    source: 'decree15', verifiedAt: VERIFIED_AT,
  },
  {
    id: 'early-apply', title: '조기입학 신청 기간 (2021년생)', start: '2026-10-01', end: '2026-12-31',
    dateType: 'legal', status: 'verified', who: '보호자 → 읍·면·동장',
    note: '5세가 되는 해(2026년)의 10월 1일부터 12월 31일까지 신청합니다. 해당 보호자만 해당돼요.',
    source: 'decree15', verifiedAt: VERIFIED_AT,
  },
  {
    id: 'defer-apply', title: '입학연기 신청 기간 (2020년생)', start: '2026-10-01', end: '2026-12-31',
    dateType: 'legal', status: 'verified', who: '보호자 → 읍·면·동장',
    note: '6세가 되는 해(2026년)의 10월 1일부터 12월 31일까지 신청합니다. 해당 보호자만 해당돼요.',
    source: 'decree15', verifiedAt: VERIFIED_AT,
  },
  {
    id: 'district-notice', title: '입학기일·통학구역 통보 기한 (교육장 → 읍·면·동)', start: '2026-11-30', end: '2026-11-30',
    dateType: 'legal', status: 'unverified', who: '교육장',
    note: '기획 자료에는 11월 30일로 적혀 있지만 법령 원문(시행령 제16조)을 아직 확인하지 못했어요. 일정 파일에는 넣지 않았습니다.',
    source: 'decree16', verifiedAt: null,
  },
  {
    id: 'notice', title: '취학통지 기한', start: '2026-12-20', end: '2026-12-20',
    dateType: 'legal', status: 'verified', who: '읍·면·동장 → 보호자',
    note: '입학기일이 속한 해의 전해 12월 20일까지 취학통지를 해야 합니다. 받는 방법(우편·방문·온라인)과 시작일은 지역마다 달라요.',
    source: 'decree17', verifiedAt: VERIFIED_AT,
  },
  {
    id: 'entry', title: '법정 입학 기준일', start: '2027-03-01', end: '2027-03-01',
    dateType: 'legal', status: 'verified', who: '보호자',
    note: '법에 정한 입학 시기입니다. 실제 입학식 날짜와 시간은 배정된 학교 공지를 따르세요.',
    source: 'act13', verifiedAt: VERIFIED_AT,
  },
];

/** 날짜를 넣지 않는 항목 — 지역 · 학교마다 달라 공식 공지로만 확인 */
/** @type {{ id: string, title: string, how: string }[]} */
export const LOCAL_ITEMS = [
  { id: 'gov24', title: '정부24 온라인 취학통지서 발급', how: '온라인 발급 여부와 시작일은 해마다 공지됩니다. 정부24 공지와 거주지 주민센터 안내를 확인하세요.' },
  { id: 'assign', title: '배정 학교', how: '취학통지서에 적힌 학교가 배정 학교입니다. 통학구역은 관할 교육지원청에서 정합니다.' },
  { id: 'prelim', title: '예비소집일', how: '학교마다 날짜·시간·방식이 다릅니다. 배정 학교 누리집이나 관할 교육지원청 공지를 확인하세요.' },
  { id: 'ceremony', title: '입학식', how: '배정 학교의 공지를 따르세요.' },
];
