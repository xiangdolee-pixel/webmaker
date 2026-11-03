// node deploy.mjs --mail <폴더|도메인> 용: 이 PC 에서 대표 도메인을 Email Sending 에 등록
//   평소에는 xim 에서 대표 도메인을 저장하면 xim 이 알아서 등록한다(xim/_worker/mail-domain.js).
//   토큰: 환경변수 CF_MAIL_TOKEN 또는 %USERPROFILE%\.wrangler-xiangdolee\mail-token.txt (리포 밖)
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ensureMailDomain as ensure } from './xim/_worker/mail-domain.js';

export const TOKEN_FILE = path.join(os.homedir(), '.wrangler-xiangdolee', 'mail-token.txt');

function mailToken() {
  if (process.env.CF_MAIL_TOKEN) return process.env.CF_MAIL_TOKEN.trim();
  try { return fs.readFileSync(TOKEN_FILE, 'utf8').trim(); } catch { return ''; }
}

export async function ensureMailDomain(domain, log = console.log) {
  const r = await ensure(mailToken(), domain);
  log(`[mail] ${domain}: ${r.message}`);
}
