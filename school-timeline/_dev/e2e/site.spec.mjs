import { test, expect } from '@playwright/test';

const PAGES = ['/', '/school-year/', '/admission/2027/', '/methodology/', '/about/', '/privacy/', '/contact/', '/없는-주소'];
const noHScroll = async (page) => {
  const w = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(w[0], `가로 넘침 ${w}`).toBeLessThanOrEqual(w[1]);
};
// 테스트에서는 광고 스크립트를 받지 않는다 (밖으로 나가는 요청 없이 같은 결과)
test.beforeEach(async ({ page }) => { await page.route(/googlesyndication|doubleclick|googleads/, (r) => r.abort()); });
const calcBtn = (page) => page.getByRole('button', { name: '계산하기' });

test('모든 페이지: 정적 본문 · 가로 스크롤 없음', async ({ page, request }) => {
  for (const p of PAGES) {
    const raw = await (await request.get(p)).text();
    expect(raw).toMatch(/<h1>/); // 자바스크립트 없이도 본문이 html 에 있다
    await page.goto(p);
    await expect(page.locator('h1')).toBeVisible();
    await noHScroll(page);
  }
});

test('계산: 2020-12-31 정상 → 2027 입학, 주소 · 네트워크에 생년월일이 나가지 않음', async ({ page }) => {
  const sent = [];
  page.on('request', (r) => sent.push(`${r.url()} ${r.postData() || ''}`));
  await page.goto('/');
  await page.fill('#dob', '20201231');
  await calcBtn(page).click();
  const result = page.locator('#result');
  await expect(result).toBeVisible();
  await expect(result).toContainText('2027년 3월');
  await expect(result.locator('.miles')).toContainText('2033');
  await expect(result.locator('.miles')).toContainText('2036');
  await expect(result.locator('.stage.h .grades li').last()).toContainText('2038학년도');
  await expect(result.locator('.stage-end')).toContainText('2039');
  await expect(page.locator('#calc-status')).toContainText('2027년 초등학교 입학');
  await expect(page.locator('#dob')).toHaveValue('2020-12-31');
  expect(page.url()).not.toContain('?');
  expect(page.url()).not.toContain('2020');
  expect(sent.filter((s) => /2020-?12-?31|20201231/.test(s))).toEqual([]);
  await noHScroll(page);
});

test('입학 방식 · 실제 입학년도 · 기준일', async ({ page }) => {
  await page.goto('/school-year/');
  await page.fill('#dob', '2020-12-31');
  await page.locator('.seg label', { hasText: '조기입학' }).click();
  await calcBtn(page).click();
  await expect(page.locator('.result-big')).toContainText('2026년');
  await expect(page.locator('.result-sub')).toContainText('2027년');

  await page.locator('.seg label', { hasText: '입학연기' }).click();
  await calcBtn(page).click();
  await expect(page.locator('.result-big')).toContainText('2028년');

  await page.locator('.more summary').click();
  await page.fill('#dob', '2019-01-01');
  await page.locator('.seg label', { hasText: '정상' }).click();
  await page.fill('#refdate', '2027.2.28');
  await calcBtn(page).click();
  await expect(page.locator('.now')).toContainText('2026학년도');
  await expect(page.locator('.now-value')).toHaveText('초등학교 1학년');
  await page.fill('#refdate', '2027-03-01');
  await calcBtn(page).click();
  await expect(page.locator('.now-value')).toHaveText('초등학교 2학년');

  await page.fill('#actual', '2028');
  await page.fill('#dob', '2020-12-31');
  await calcBtn(page).click();
  await expect(page.locator('.result-big')).toContainText('2028년');
  await expect(page.locator('.result-head .tag')).toHaveText('실제 입학년도');
});

test('입력 오류: 없는 날짜 · 너무 먼 날짜는 계산하지 않음', async ({ page }) => {
  await page.goto('/');
  for (const v of ['2020-02-30', '2099-01-01', '']) {
    await page.fill('#dob', v);
    await calcBtn(page).click();
    await expect(page.locator('#dob-err')).toBeVisible();
    await expect(page.locator('#dob')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#result')).toBeHidden();
  }
});

test('알약 고르기: 배경이 고른 칸으로 미끄러짐', async ({ page }) => {
  await page.goto('/');
  const ind = page.locator('.seg-ind');
  const x0 = (await ind.boundingBox()).x;
  const label = page.locator('.seg label', { hasText: '입학연기' });
  await label.click();
  await page.waitForTimeout(500);
  const box = await ind.boundingBox();
  const target = await label.boundingBox();
  expect(box.x).toBeGreaterThan(x0 + 50);
  expect(Math.abs(box.x - target.x)).toBeLessThan(2);
  expect(Math.abs(box.width - target.width)).toBeLessThan(2);
});

test('키보드만으로 입력 · 계산', async ({ page, isMobile }) => {
  test.skip(isMobile, '데스크톱 키보드');
  await page.goto('/');
  await page.locator('#dob').focus();
  await page.keyboard.type('2020-12-31');
  await page.keyboard.press('Tab'); // 입학 방식(정상)
  await page.keyboard.press('ArrowRight'); // 조기입학
  await page.keyboard.press('Enter'); // 폼 제출
  await expect(page.locator('.result-big')).toContainText('2026년');
  await expect(page.getByRole('button', { name: '인쇄하기' })).toBeVisible();
});

test('모바일 메뉴: 열고 닫기, 넘침 없음', async ({ page, isMobile }) => {
  test.skip(!isMobile, '모바일만');
  await page.goto('/');
  const nav = page.locator('#gnb');
  await expect(nav).toBeHidden();
  await page.getByRole('button', { name: '메뉴 열기' }).click();
  await expect(nav).toBeVisible();
  await expect(nav.getByRole('link', { name: '초등 입학 준비' })).toBeVisible();
  await noHScroll(page);
  await page.keyboard.press('Escape');
  await expect(nav).toBeHidden();
});

test('320px 에서도 넘침 없음', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  for (const p of ['/', '/school-year/', '/admission/2027/']) {
    await page.goto(p);
    await noHScroll(page);
  }
  await page.goto('/');
  await page.fill('#dob', '2015-05-05');
  await calcBtn(page).click();
  await expect(page.locator('#result')).toBeVisible();
  await noHScroll(page);
});

test('초등 입학 준비: 일정 파일에는 확인된 법정 기한만, 체크리스트', async ({ page }) => {
  await page.goto('/admission/2027/');
  await expect(page.locator('[data-item="district-notice"] .tag-check')).toHaveText('확인 필요');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /캘린더에 넣기/ }).click()]);
  const chunks = [];
  for await (const c of await dl.createReadStream()) chunks.push(c);
  const ics = Buffer.concat(chunks).toString('utf8');
  expect((ics.match(/BEGIN:VEVENT/g) || []).length).toBe(6);
  for (const d of ['20261001', '20261031', '20261220', '20270301']) expect(ics).toContain(`DTSTART;VALUE=DATE:${d}`);
  expect(ics).not.toContain('20261130'); // 원문 미확인
  const summaries = ics.split('\r\n').filter((l) => l.startsWith('SUMMARY:'));
  expect(summaries).toHaveLength(6);
  for (const s of summaries) expect(s).not.toMatch(/예비소집|입학식|배정/); // 학교별 일정은 넣지 않는다
  expect(dl.suggestedFilename()).toMatch(/\.ics$/);

  const progress = page.locator('[data-check-progress]');
  await expect(progress).toHaveText('0 / 8 완료');
  await page.locator('[data-checklist] label').first().click();
  await page.locator('[data-checklist] label').nth(2).click();
  await expect(progress).toHaveText('2 / 8 완료');
  await page.getByRole('button', { name: '체크 지우기' }).click();
  await expect(progress).toHaveText('0 / 8 완료');
});

test('인쇄 화면: 폼 · 머리 · 꼬리는 숨김', async ({ page }) => {
  await page.goto('/');
  await page.fill('#dob', '2020-03-15');
  await calcBtn(page).click();
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('#calc')).toBeHidden();
  await expect(page.locator('.site-header')).toBeHidden();
  await expect(page.locator('#result')).toBeVisible();
});

test('404 는 404 상태', async ({ request }) => {
  expect((await request.get('/nope/')).status()).toBe(404);
});

test('일정마다 구글 캘린더 링크 (확인된 기한만)', async ({ page }) => {
  await page.goto('/admission/2027/');
  await expect(page.locator('.sched-add a')).toHaveCount(6);
  await expect(page.locator('[data-item="district-notice"] .sched-add')).toHaveCount(0);
  const href = await page.locator('[data-item="notice"] .sched-add a').getAttribute('href');
  expect(href).toContain('dates=20261220%2F20261221');
});

test('해가 바뀌면: 학년표는 그 학년도로, 2027 안내는 지난 일정 알림', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2027-03-05T10:00:00+09:00'));
  await page.goto('/');
  await expect(page.locator('[data-grade-title]')).toHaveText('2027학년도 학년표');
  await expect(page.locator('[data-grade-table] tbody tr').nth(1)).toContainText('2020년생');
  await expect(page.locator('[data-grade-table] tbody tr').nth(1)).toContainText('초등학교 1학년');
  await page.goto('/admission/2027/');
  await expect(page.locator('[data-past-notice]')).toBeVisible();
});

test('지금 날짜(2026-11)에는 알림 없음', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-06T10:00:00+09:00'));
  await page.goto('/admission/2027/');
  await expect(page.locator('[data-past-notice]')).toBeHidden();
  await page.goto('/');
  await expect(page.locator('[data-grade-title]')).toHaveText('2026학년도 학년표');
});

test('출산 예정일(아직 오지 않은 날짜)도 계산', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-06T10:00:00+09:00'));
  await page.goto('/');
  await page.fill('#dob', '2027-04-10');
  await page.getByRole('button', { name: '계산하기' }).click();
  await expect(page.locator('.result-big')).toContainText('2034년');
  await expect(page.locator('.notes')).toContainText('출산 예정일');
  await expect(page.locator('#dob-err')).toBeHidden();
});
