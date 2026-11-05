import { describe, it, expect } from 'vitest';
import { buildIcs, foldLine, nextDay, escapeText, icsStamp } from '../../js/calendar-export.js';
import { ITEMS, LOCAL_ITEMS, SOURCES } from '../../js/admission-2027.js';
import { parseYmd } from '../../js/school-year.js';

describe('.ics', () => {
  it('종일 일정 · 다음 날 DTEND · CRLF', () => {
    const ics = buildIcs([{ uid: 'a@x', title: '취학통지 기한', start: '2026-12-20', end: '2026-12-20' }], { calendarName: '테스트', stamp: '20261105T000000Z' });
    expect(ics).toContain('DTSTART;VALUE=DATE:20261220\r\n');
    expect(ics).toContain('DTEND;VALUE=DATE:20261221\r\n');
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics.split('\r\n').every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);
  });
  it('해 · 달 넘김', () => {
    expect(nextDay('2026-12-31')).toBe('20270101');
    expect(nextDay('2028-02-28')).toBe('20280229');
  });
  it('이스케이프 · 줄 접기', () => {
    expect(escapeText('a,b;c\\d\ne')).toBe('a\\,b\\;c\\\\d\\ne');
    const long = 'DESCRIPTION:' + '가'.repeat(60);
    const folded = foldLine(long);
    expect(folded.replace(/\r\n /g, '')).toBe(long);
    expect(folded.split('\r\n').every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);
  });
  it('icsStamp', () => {
    expect(icsStamp(new Date('2026-11-05T01:02:03.456Z'))).toBe('20261105T010203Z');
  });
});

describe('2027 취학 데이터', () => {
  it('모든 항목: 날짜 형식 · 출처 · 확인일 규칙', () => {
    for (const it of ITEMS) {
      expect(parseYmd(it.start), it.id).not.toBeNull();
      expect(parseYmd(it.end), it.id).not.toBeNull();
      expect(it.start <= it.end).toBe(true);
      expect(SOURCES[it.source], it.id).toBeTruthy();
      if (it.status === 'verified') expect(it.verifiedAt, it.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      else expect(it.verifiedAt, it.id).toBeNull();
    }
  });
  it('학교별 일정(예비소집 · 배정 · 정부24 발급)에는 날짜를 넣지 않는다', () => {
    for (const it of LOCAL_ITEMS) expect(JSON.stringify(it)).not.toMatch(/\d{4}-\d{2}-\d{2}|\d+월 \d+일/);
  });
});
