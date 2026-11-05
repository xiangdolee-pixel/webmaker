import { describe, it, expect } from 'vitest';
import {
  calculate, parseYmd, normalizeDateInput, todayInSeoul, academicYearOf, gradeIn, buildTimeline,
} from '../../js/school-year.js';

const TODAY = '2026-11-05';
const calc = (o) => calculate({ today: TODAY, ...o });
const ok = (o) => {
  const r = calc(o);
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r;
};

describe('PRD 9절 계산 사례', () => {
  it('2020-12-31 정상: 초1 2027, 중1 2033, 고1 2036, 고3 2038', () => {
    const r = ok({ birthDate: '2020-12-31' });
    expect(r.entryYear).toBe(2027);
    expect(r.milestones.middle).toBe(2033);
    expect(r.milestones.high).toBe(2036);
    expect(r.timeline.at(-1)).toEqual({ stage: 'high', grade: 3, year: 2038 });
    expect(r.milestones.graduation).toBe(2039);
  });
  it('2020-01-01 정상: 초1 2027 (12월생과 같음)', () => {
    expect(ok({ birthDate: '2020-01-01' }).entryYear).toBe(2027);
  });
  it('2020-12-31 조기입학: 초1 2026', () => {
    expect(ok({ birthDate: '2020-12-31', mode: 'early' }).entryYear).toBe(2026);
  });
  it('2020-12-31 입학연기: 초1 2028', () => {
    expect(ok({ birthDate: '2020-12-31', mode: 'late' }).entryYear).toBe(2028);
  });
  it('2019-01-01, 기준일 2027-02-28: 2026학년도 초1', () => {
    const r = ok({ birthDate: '2019-01-01', referenceDate: '2027-02-28', today: '2027-02-28' });
    expect(r.status).toMatchObject({ academicYear: 2026, stage: 'elementary', grade: 1 });
  });
  it('2019-01-01, 기준일 2027-03-01: 2027학년도 초2', () => {
    const r = ok({ birthDate: '2019-01-01', referenceDate: '2027-03-01' });
    expect(r.status).toMatchObject({ academicYear: 2027, stage: 'elementary', grade: 2 });
  });
  it('2020-12-31, 기준일 2026-11-04: 초등학교 입학 전', () => {
    const r = ok({ birthDate: '2020-12-31', referenceDate: '2026-11-04' });
    expect(r.status.stage).toBe('before');
    expect(r.status.academicYear).toBe(2026);
  });
  it('2020-12-31, 실제 입학년도 2028: 결과 2028 (입학 방식보다 우선)', () => {
    const r = ok({ birthDate: '2020-12-31', mode: 'early', actualEntryYear: 2028 });
    expect(r.entryYear).toBe(2028);
    expect(r.basis).toBe('actual');
    expect(r.legalEntryYear).toBe(2027);
  });
  it('2020-02-30: 입력 오류, 계산하지 않음', () => {
    const r = calc({ birthDate: '2020-02-30' });
    expect(r.ok).toBe(false);
    expect(r.errors[0].field).toBe('birthDate');
  });
  it('미래 출생일: 입력 오류, 계산하지 않음', () => {
    expect(calc({ birthDate: '2026-11-06' }).ok).toBe(false);
    expect(calc({ birthDate: '2026-11-05' }).ok).toBe(true); // 오늘 태어난 아이는 계산 가능
  });
});

describe('시간대 · UTC 로 날짜가 밀리지 않음', () => {
  it('여러 시간대에서 같은 결과', () => {
    const before = process.env.TZ;
    const results = [];
    for (const tz of ['Asia/Seoul', 'UTC', 'America/Los_Angeles', 'Pacific/Kiritimati', 'Pacific/Pago_Pago']) {
      process.env.TZ = tz;
      const r = ok({ birthDate: '2020-01-01', referenceDate: '2027-03-01' });
      results.push([r.entryYear, r.status.academicYear, r.status.grade]);
    }
    process.env.TZ = before;
    expect(new Set(results.map(String)).size).toBe(1);
    expect(results[0]).toEqual([2027, 2027, 1]);
  });
  it('한국 날짜: UTC 2월 28일 15시 = 한국 3월 1일 0시', () => {
    expect(todayInSeoul(new Date('2027-02-28T15:00:00Z'))).toBe('2027-03-01');
    expect(todayInSeoul(new Date('2027-02-28T14:59:59Z'))).toBe('2027-02-28');
  });
  it('학년도 경계', () => {
    expect(academicYearOf(parseYmd('2027-02-28'))).toBe(2026);
    expect(academicYearOf(parseYmd('2027-03-01'))).toBe(2027);
    expect(academicYearOf(parseYmd('2028-02-29'))).toBe(2027);
  });
});

describe('날짜 검증 · 입력 다듬기', () => {
  it('윤년', () => {
    expect(parseYmd('2020-02-29')).toEqual({ y: 2020, m: 2, d: 29 });
    expect(parseYmd('2021-02-29')).toBeNull();
    expect(parseYmd('1900-02-29')).toBeNull();
    expect(parseYmd('2000-02-29')).not.toBeNull();
  });
  it('형식', () => {
    for (const bad of ['', '2020-1-1', '2020/01/01', '20-01-01', '2020-13-01', '2020-00-10', '2020-04-31', 'abc']) {
      expect(parseYmd(bad)).toBeNull();
    }
  });
  it('여러 꼴의 입력을 YYYY-MM-DD 로', () => {
    expect(normalizeDateInput('20200305')).toBe('2020-03-05');
    expect(normalizeDateInput('2020.3.5')).toBe('2020-03-05');
    expect(normalizeDateInput('2020. 3. 5.')).toBe('2020-03-05');
    expect(normalizeDateInput('2020/03/05')).toBe('2020-03-05');
    expect(normalizeDateInput('2020년 3월 5일')).toBe('2020-03-05');
    expect(normalizeDateInput(' 2020-03-05 ')).toBe('2020-03-05');
  });
  it('1900년 이전 · 잘못된 기준일 · 실제 입학년도 오류', () => {
    expect(calc({ birthDate: '1899-12-31' }).ok).toBe(false);
    expect(calc({ birthDate: '2020-01-01', referenceDate: '2027-02-30' }).errors[0].field).toBe('referenceDate');
    expect(calc({ birthDate: '2020-01-01', actualEntryYear: '27' }).errors[0].field).toBe('actualEntryYear');
    expect(calc({ birthDate: '2020-01-01', actualEntryYear: 2040 }).errors[0].field).toBe('actualEntryYear');
    expect(calc({ birthDate: '2020-01-01', actualEntryYear: '' }).ok).toBe(true);
  });
});

describe('타임라인 · 학년', () => {
  it('초1~고3 12칸', () => {
    const t = buildTimeline(2027);
    expect(t).toHaveLength(12);
    expect(t[5]).toEqual({ stage: 'elementary', grade: 6, year: 2032 });
    expect(t[6]).toEqual({ stage: 'middle', grade: 1, year: 2033 });
    expect(t[8]).toEqual({ stage: 'middle', grade: 3, year: 2035 });
    expect(t[9]).toEqual({ stage: 'high', grade: 1, year: 2036 });
  });
  it('졸업 후 · 입학 전', () => {
    expect(gradeIn(2027, 2039).stage).toBe('graduated');
    expect(gradeIn(2027, 2038)).toMatchObject({ stage: 'high', grade: 3 });
    expect(gradeIn(2027, 2026).label).toContain('다음 학년도');
    expect(gradeIn(2027, 2024).label).toContain('3년 뒤');
  });
  it('2001년 이전 1·2월생 안내', () => {
    expect(ok({ birthDate: '1995-02-10' }).notes).toHaveLength(1);
    expect(ok({ birthDate: '2002-02-10' }).notes).toHaveLength(0);
    expect(ok({ birthDate: '1995-02-10', actualEntryYear: 2001 }).notes).toHaveLength(0);
  });
});
