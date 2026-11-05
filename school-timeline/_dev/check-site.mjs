// 올리기 전 점검: 페이지 머리(title · description · canonical) · 내부 링크 · 2027 일정 html 과 데이터 일치 · 인라인 style · 글꼴에 빠진 글자
//   node _dev/check-site.mjs   (npm run build 가 먼저 돌린다)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { siteChars } from './site-chars.mjs';

const DEV = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(DEV, '..');
const problems = [];
const bad = (f, m) => problems.push(`${f}: ${m}`);

const htmls = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || ['node_modules', '_dev'].includes(e.name)) continue;
    const f = path.join(dir, e.name);
    if (e.isDirectory()) walk(f);
    else if (e.name.endsWith('.html')) htmls.push(f);
  }
})(ROOT);

const urlOf = (f) => {
  const rel = path.relative(ROOT, f).split(path.sep).join('/');
  return rel === 'index.html' ? '/' : rel.endsWith('/index.html') ? `/${rel.slice(0, -10)}` : `/${rel}`;
};
const exists = (href) => {
  const p = href.split(/[?#]/)[0];
  if (/^\/(xms|xms-api|member|board|admin)(\/|$)/.test(p) || p === '/robots.txt' || p === '/sitemap.xml') return true; // xms 가 내보냄
  const f = path.join(ROOT, decodeURIComponent(p));
  return fs.existsSync(f) && (fs.statSync(f).isFile() || fs.existsSync(path.join(f, 'index.html')));
};

const titles = new Map();
for (const f of htmls) {
  const name = path.relative(ROOT, f);
  const html = fs.readFileSync(f, 'utf8');
  const special = /^(404|_layout)\.html$/.test(name);
  if (!/<html lang="ko">/.test(html)) bad(name, 'lang="ko" 없음');
  if (!/<meta name="viewport"/.test(html)) bad(name, 'viewport 없음');
  const title = (html.match(/<title>([^<]+)<\/title>/) || [])[1];
  if (!title) bad(name, 'title 없음');
  else if (!special) {
    if (titles.has(title)) bad(name, `title 이 ${titles.get(title)} 와 같음`);
    titles.set(title, name);
  }
  if (!special) {
    const desc = (html.match(/<meta name="description" content="([^"]+)"/) || [])[1];
    if (!desc || desc.length < 40) bad(name, 'description 없음/너무 짧음');
    const canon = (html.match(/<link rel="canonical" href="([^"]+)"/) || [])[1];
    if (canon !== urlOf(f)) bad(name, `canonical ${canon} ≠ ${urlOf(f)}`);
    if ((html.match(/<h1[\s>]/g) || []).length !== 1) bad(name, 'h1 이 하나가 아님');
    if (!/<main id="main">/.test(html)) bad(name, '<main id="main"> 없음');
  } else if (/rel="canonical"/.test(html)) bad(name, '틀 · 404 에는 canonical 을 두지 않는다');
  if (/\sstyle="/.test(html)) bad(name, '인라인 style="" — css/style.css 로');
  for (const m of html.matchAll(/(?:href|src)="(\/[^"]*)"/g)) if (!exists(m[1])) bad(name, `없는 주소 ${m[1]}`);
  // 생년월일 입력이 폼 전송으로 주소창에 실리지 않게 — 입력란에 name 을 두지 않는다
  for (const m of html.matchAll(/<input\b[^>]*\bid="(dob|actual|refdate)"[^>]*>/g)) if (/\bname=/.test(m[0])) bad(name, `#${m[1]} 에 name 속성`);
}

// 2027 일정: html 의 항목이 js/admission-2027.js 와 같은지
const { ITEMS } = await import(pathToFileURL(path.join(ROOT, 'js', 'admission-2027.js')).href);
const adm = fs.readFileSync(path.join(ROOT, 'admission', '2027', 'index.html'), 'utf8');
for (const it of ITEMS) {
  const m = adm.match(new RegExp(`data-item="${it.id}" data-start="([^"]+)" data-end="([^"]+)" data-status="([^"]+)"`));
  if (!m) bad('admission/2027', `${it.id} 항목 없음`);
  else if (m[1] !== it.start || m[2] !== it.end || m[3] !== it.status) bad('admission/2027', `${it.id} 날짜/상태가 데이터와 다름`);
}
const htmlIds = [...adm.matchAll(/data-item="([^"]+)"/g)].map((m) => m[1]);
for (const id of htmlIds) if (!ITEMS.some((it) => it.id === id)) bad('admission/2027', `데이터에 없는 항목 ${id}`);

// 글꼴: 줄인 뒤 새로 생긴 글자
const had = new Set(fs.readFileSync(path.join(DEV, 'font-chars.txt'), 'utf8'));
const missing = siteChars(ROOT).filter((c) => !had.has(c) && /[가-힣]/.test(c));
if (missing.length) bad('fonts/st-sans.woff2', `빠진 글자 ${missing.join('')} → node _dev/subset-font.mjs 다시 실행`);

if (problems.length) {
  console.error(`[check-site] 문제 ${problems.length}개\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log(`[check-site] html ${htmls.length}개 이상 없음`);
