// 고객 폴더 하나만 Cloudflare Workers(정적 사이트)로 올리기 위한 빌드
//
//   Workers 대시보드 설정
//     Project name   : 폴더 이름과 같게        (예: ganghwa)
//     Build command  : node build.mjs 폴더이름  (예: node build.mjs ganghwa)
//     Deploy command : npx wrangler deploy     (기본값 그대로)
//
//   하는 일: 폴더를 dist/ 로 복사(웹에 안 올릴 파일은 뺌) → 루트에 wrangler.jsonc 생성
//            → 배포 명령이 dist/ 만 올린다
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(ROOT, 'dist');
const MAX_FILE = 25 * 1024 * 1024; // Workers 정적 파일 한 개 최대 크기

function fail(msg) {
  console.error(`\n[build] ${msg}\n`);
  process.exit(1);
}

const slug = (process.argv[2] || '').replace(/[\\/]+$/, '');
if (!slug) fail('폴더 이름을 넣어 주세요.  예) node build.mjs ganghwa');
if (!/^[\w.-]+$/.test(slug) || slug.startsWith('.') || ['dist', 'node_modules'].includes(slug)) {
  fail(`쓸 수 없는 폴더 이름입니다: ${slug}`);
}
const SRC = path.join(ROOT, slug);
if (!fs.existsSync(SRC) || !fs.statSync(SRC).isDirectory()) fail(`폴더가 없습니다: ${slug}`);

// 웹에 올리지 않는 것: 숨김 파일 · 작업 메모(.md) · 배포/스크립트 설정 · 원본 문서 · Pages Functions
const SKIP_DIRS = new Set(['node_modules', 'functions', '_src', 'uploads', '_worker']);
const SKIP_FILE = /\.(md|ps1|bat|sh|docx?|log)$|^wrangler\.(toml|json|jsonc)$|^package(-lock)?\.json$/i;

fs.rmSync(OUT, { recursive: true, force: true });
fs.cpSync(SRC, OUT, {
  recursive: true,
  filter: (src) => {
    if (src === SRC) return true;
    const name = path.basename(src);
    if (name.startsWith('.')) return false;
    if (fs.statSync(src).isDirectory()) return !SKIP_DIRS.has(name);
    return !SKIP_FILE.test(name);
  },
});
if (fs.existsSync(path.join(SRC, 'functions'))) {
  console.warn('[build] functions/ (Pages Functions)는 Workers 정적 배포에서 동작하지 않아 뺐습니다.');
}

// 첫 화면: index.html 이 없으면 최상위 html(landing.html 등)을 index.html 로도 둔다
if (!fs.existsSync(path.join(OUT, 'index.html'))) {
  const htmls = fs.readdirSync(OUT).filter((f) => /\.html?$/i.test(f));
  const pick = ['landing.html', 'main.html', 'home.html'].find((f) => htmls.includes(f))
    ?? (htmls.length === 1 ? htmls[0] : null);
  if (!pick) {
    fail(htmls.length
      ? `index.html 이 없고 첫 화면을 고를 수 없습니다(${htmls.join(', ')}). index.html 을 만들어 주세요.`
      : `${slug} 에 html 파일이 없습니다. 정적(html) 사이트만 올릴 수 있어요.`);
  }
  fs.copyFileSync(path.join(OUT, pick), path.join(OUT, 'index.html'));
  console.log(`[build] index.html 이 없어 ${pick} 를 첫 화면으로 씁니다.`);
}

// 올릴 파일 집계 · 너무 큰 파일 확인
let count = 0;
let bytes = 0;
const tooBig = [];
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) { walk(full); continue; }
    const size = fs.statSync(full).size;
    count += 1;
    bytes += size;
    if (size > MAX_FILE) tooBig.push(path.relative(OUT, full));
  }
})(OUT);
if (tooBig.length) fail(`25MB 가 넘는 파일은 올릴 수 없습니다: ${tooBig.join(', ')}`);

// Worker 이름: 영문 소문자 · 숫자 · 하이픈만. 대시보드 Project name 과 같아야 한다
const name = slug.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
const config = {
  name,
  compatibility_date: '2026-10-01',
  assets: {
    directory: './dist',
    ...(fs.existsSync(path.join(OUT, '404.html')) && { not_found_handling: '404-page' }),
  },
};
// 폴더에 _worker/index.js 가 있으면 정적 파일 + 그 Worker(/api 등)를 같이 올린다.
//   _worker/ 는 웹에 공개하지 않고(위 SKIP_DIRS), _worker/bindings.json 의 D1 · KV 연결을 그대로 붙인다.
const WORKER = path.join(SRC, '_worker', 'index.js');
if (fs.existsSync(WORKER)) {
  config.main = `./${slug}/_worker/index.js`;
  config.assets.binding = 'ASSETS';
  const extra = path.join(SRC, '_worker', 'bindings.json');
  if (fs.existsSync(extra)) Object.assign(config, JSON.parse(fs.readFileSync(extra, 'utf8')));
  console.log(`[build] ${slug}/_worker/index.js 를 Worker 로 함께 올립니다.`);
}
fs.writeFileSync(
  path.join(ROOT, 'wrangler.jsonc'),
  `// node build.mjs ${slug} 가 만든 파일입니다. 직접 고치지 마세요.\n${JSON.stringify(config, null, 2)}\n`,
);

console.log(`[build] ${slug} → dist/  파일 ${count}개, ${(bytes / 1024 / 1024).toFixed(1)}MB`);
console.log(`[build] Worker 이름: ${name}  (대시보드 Project name 과 같아야 합니다)`);
