// 로컬 미리보기 · E2E 용 정적 서버: 이 사이트 폴더를 / 로 연다 (배포된 Worker 와 같은 주소 꼴)
//   node _dev/serve.mjs [포트]   기본 8740
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.argv[2] || process.env.PORT || 8740);
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8' };
const hidden = (p) => p.split('/').some((s) => s.startsWith('.') || s.startsWith('_dev') || s === 'node_modules') || /\.(md|json)$/i.test(p);

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  let rel = decodeURIComponent(url.pathname);
  if (hidden(rel)) rel = '/__none__';
  let file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT)) file = path.join(ROOT, '__none__');
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
    if (!rel.endsWith('/')) { res.writeHead(307, { Location: `${rel}/` }); res.end(); return; }
    file = path.join(file, 'index.html');
  }
  let status = 200;
  if (!fs.existsSync(file)) { status = 404; file = path.join(ROOT, '404.html'); }
  res.writeHead(status, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`스쿨타임라인 미리보기: http://localhost:${PORT}/`));
