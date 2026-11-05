// 사이트에 나오는 글자 모음 (글꼴 줄이기 · 빠진 글자 검사에 같이 쓴다)
import fs from 'node:fs';
import path from 'node:path';

export function siteChars(root) {
  let text = '';
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith('.') || ['node_modules', '_dev', 'fonts', 'img'].includes(e.name)) continue;
      const f = path.join(dir, e.name);
      if (e.isDirectory()) walk(f);
      else if (/\.(html|js)$/.test(e.name)) text += fs.readFileSync(f, 'utf8');
    }
  };
  walk(root);
  const acc = path.join(root, '..', 'xms', 'js', 'account.js'); // 공통 계정 버튼(로그인 · 내 정보 …)
  if (fs.existsSync(acc)) text += fs.readFileSync(acc, 'utf8');
  for (let c = 0x20; c < 0x7f; c++) text += String.fromCharCode(c);
  text += '·…—–~‘’“”→←↑↓×−';
  return [...new Set(text)].filter((c) => c >= ' ').sort();
}
