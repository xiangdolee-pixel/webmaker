// WebMaker2 폴더 하나를 xiangdolee@gmail.com 계정 Cloudflare Workers 로 올린다.
//
//   node deploy.mjs <폴더>     빌드(build.mjs) + 배포
//   node deploy.mjs --login    xiangdolee 계정으로 wrangler 로그인(최초 1회, 브라우저에서 승인)
//   node deploy.mjs --whoami   지금 로그인된 계정 확인
//   node deploy.mjs --wrangler <명령…>   xiangdolee 계정으로 wrangler 명령 실행(D1 · secret 등)
//
// design 리포가 쓰는 master@webchon.com 로그인과 섞이지 않도록
// wrangler 로그인 정보를 사용자 폴더의 .wrangler-xiangdolee 에 따로 둔다(리포 밖 — 공개 리포라 절대 안에 두지 않음).
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const ACCOUNT_ID = 'f225d506d8cf6ddf97704a36c69f5ce7';
const AUTH_HOME = path.join(os.homedir(), '.wrangler-xiangdolee');
fs.mkdirSync(AUTH_HOME, { recursive: true });

const env = { ...process.env, XDG_CONFIG_HOME: AUTH_HOME, CLOUDFLARE_ACCOUNT_ID: ACCOUNT_ID };
delete env.CLOUDFLARE_API_TOKEN;
delete env.CF_API_TOKEN;

function run(cmd, args) {
  const r = spawnSync([cmd, ...args].join(' '), { cwd: ROOT, env, stdio: 'inherit', shell: true });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

const arg = process.argv[2];
if (!arg) {
  console.error('사용법: node deploy.mjs <폴더> | --login | --whoami | --wrangler <명령…>');
  process.exit(1);
}
if (arg === '--login') run('npx', ['wrangler', 'login']);
else if (arg === '--whoami') run('npx', ['wrangler', 'whoami']);
else if (arg === '--wrangler') run('npx', ['wrangler', ...process.argv.slice(3)]); // 예) node deploy.mjs --wrangler d1 list
else {
  run('node', ['build.mjs', arg]);
  run('npx', ['wrangler', 'deploy']);
}
