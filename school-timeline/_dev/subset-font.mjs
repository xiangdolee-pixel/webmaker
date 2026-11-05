// 이 사이트(html · js)와 공통 계정 버튼에 쓰인 글자를 모아 _dev/subset-font.py 로 글꼴을 줄인다
//   node _dev/subset-font.mjs <PretendardVariable.woff2 경로> [python 경로]
//   원본: https://github.com/orioncactus/pretendard (npm pretendard@1.3.9 dist/web/variable/woff2/PretendardVariable.woff2)
//   글이 바뀌어 새 글자가 생기면 다시 돌린다 (_dev/check-site.mjs 가 빠진 글자를 알려 준다)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { siteChars } from './site-chars.mjs';

const DEV = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(DEV, '..');
const [src, py = 'python'] = process.argv.slice(2);
if (!src) { console.error('원본 PretendardVariable.woff2 경로를 넣어 주세요.'); process.exit(1); }
const tmp = path.join(os.tmpdir(), 'st-font-text.txt');
const chars = siteChars(ROOT).join('');
fs.writeFileSync(tmp, chars);
fs.writeFileSync(path.join(DEV, 'font-chars.txt'), chars); // check-site.mjs 가 새로 생긴 글자를 찾는 기준
const out = path.join(ROOT, 'fonts', 'st-sans.woff2');
const r = spawnSync(py, [path.join(DEV, 'subset-font.py'), src, tmp, out], { stdio: 'inherit' });
if (r.status !== 0) process.exit(r.status ?? 1);
console.log(`fonts/st-sans.woff2 ${(fs.statSync(out).size / 1024).toFixed(0)}KB`);
