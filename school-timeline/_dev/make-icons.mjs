// favicon.svg → img/icon-32 · 180 · 192 · 512.png, 공유 그림 img/og-default.png(1200×630) — Playwright 크로미움으로 그린다
//   node _dev/make-icons.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const svg = fs.readFileSync(path.join(ROOT, 'favicon.svg'), 'utf8');
const font = `data:font/woff2;base64,${fs.readFileSync(path.join(ROOT, 'fonts', 'st-sans.woff2')).toString('base64')}`;
fs.mkdirSync(path.join(ROOT, 'img'), { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage();
for (const n of [32, 180, 192, 512]) {
  await page.setViewportSize({ width: n, height: n });
  // 큰 아이콘(홈 화면용)은 모서리를 둥글리지 않은 꽉 찬 바탕 — 기기가 알아서 깎는다
  const body = n >= 180 ? svg.replace('rx="8"', 'rx="0"') : svg;
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${n}px;height:${n}px}</style>${body}`);
  await page.screenshot({ path: path.join(ROOT, 'img', `icon-${n}.png`), omitBackground: true });
}
await page.setViewportSize({ width: 1200, height: 630 });
const cells = (n, cls) => Array.from({ length: n }, (_, i) => `<i class="${cls}">${i + 1}</i>`).join('');
await page.setContent(`<style>
@font-face{font-family:P;src:url(${font}) format("woff2");font-weight:400 800}
html,body{margin:0}body{width:1200px;height:630px;background:#fff;font-family:P,sans-serif;color:#1f2f4a;display:flex;flex-direction:column;justify-content:center;padding:0 88px;box-sizing:border-box;letter-spacing:-.02em}
.b{display:flex;align-items:center;gap:16px;font-weight:800;font-size:34px}.b svg{width:56px;height:56px}
h1{font-size:72px;font-weight:800;margin:36px 0 14px;line-height:1.2}h1 em{font-style:normal;color:#3f5f48}
p{font-size:30px;color:#4a5464;margin:0 0 48px}
.bar{display:grid;grid-template-columns:6fr 3fr 3fr;gap:10px}.s{display:grid;gap:6px}.s>div{display:grid;gap:5px}
.e>div{grid-template-columns:repeat(6,1fr)}.m>div,.h>div{grid-template-columns:repeat(3,1fr)}
i{font-style:normal;height:54px;border-radius:8px;display:grid;place-items:center;font-weight:700;font-size:22px;color:#fff}
.e i{background:#6f8f77}.m i{background:#9aa8bd;color:#1f2f4a}.h i{background:#2f4366}b{font-size:20px;color:#6b7482}
</style><div class="b">${svg}스쿨타임라인</div><h1>우리 아이, 지금 <em>몇 학년</em>일까요?</h1><p>생년월일로 보는 초·중·고 12년 타임라인 · 2027 입학 준비</p>
<div class="bar"><div class="s e"><b>초등학교</b><div>${cells(6, '')}</div></div><div class="s m"><b>중학교</b><div>${cells(3, '')}</div></div><div class="s h"><b>고등학교</b><div>${cells(3, '')}</div></div></div>`);
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: path.join(ROOT, 'img', 'og-default.png') });
await browser.close();
console.log('img/ 아이콘 4개 + og-default.png');
