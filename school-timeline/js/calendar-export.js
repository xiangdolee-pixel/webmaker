// @ts-check
// 일정 파일(.ics, RFC 5545) 만들기 — 종일 일정만. 브라우저 안에서 만들고 서버로 보내지 않는다.

/** @typedef {{ uid: string, title: string, start: string, end: string, description?: string, url?: string }} IcsEvent */

/** YYYY-MM-DD → YYYYMMDD */
const compact = (/** @type {string} */ ymd) => ymd.replace(/-/g, '');

/** 종일 일정의 DTEND 는 다음 날(배타적) @param {string} ymd */
export function nextDay(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + 1)); // UTC 로만 셈해 시간대 영향 없음
  return `${t.getUTCFullYear()}${String(t.getUTCMonth() + 1).padStart(2, '0')}${String(t.getUTCDate()).padStart(2, '0')}`;
}

/** TEXT 값 이스케이프 @param {string} s */
export const escapeText = (s) => String(s).replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/([,;])/g, '\\$1');

/** 75 옥텟마다 줄 접기 (UTF-8 글자를 자르지 않게) @param {string} line */
export function foldLine(line) {
  const enc = new TextEncoder();
  const out = [];
  let cur = '';
  let bytes = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    const limit = out.length ? 74 : 75; // 이어지는 줄은 앞의 공백 1바이트
    if (bytes + n > limit) { out.push(cur); cur = ''; bytes = 0; }
    cur += ch;
    bytes += n;
  }
  out.push(cur);
  return out.join('\r\n ');
}

/**
 * @param {IcsEvent[]} events
 * @param {{ calendarName: string, stamp: string }} opt stamp = UTC 'YYYYMMDDTHHMMSSZ'
 */
export function buildIcs(events, opt) {
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//school-timeline//2027 admission//KO', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(opt.calendarName)}`, 'X-WR-TIMEZONE:Asia/Seoul',
  ];
  for (const e of events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.uid}`,
      `DTSTAMP:${opt.stamp}`,
      `DTSTART;VALUE=DATE:${compact(e.start)}`,
      `DTEND;VALUE=DATE:${nextDay(e.end)}`,
      `SUMMARY:${escapeText(e.title)}`,
      ...(e.description ? [`DESCRIPTION:${escapeText(e.description)}`] : []),
      ...(e.url ? [`URL:${e.url}`] : []),
      'TRANSP:TRANSPARENT',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(foldLine).join('\r\n') + '\r\n';
}

/** Date → 'YYYYMMDDTHHMMSSZ' @param {Date} d */
export const icsStamp = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
