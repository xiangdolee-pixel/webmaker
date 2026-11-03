// 사이트 대표 도메인을 Cloudflare Email Sending 에 자동 등록 (회원가입 인증 메일을 noreply@<대표 도메인> 으로 보내려고)
//   xim 에서 대표 도메인을 저장할 때 부른다 (deploy.mjs 의 --mail 도 같은 함수를 쓴다).
//   토큰 권한: Zone:Read · DNS:Edit · Email Sending:Edit — xim Worker 비밀값 CF_MAIL_TOKEN (리포에 두지 않음)
const API = 'https://api.cloudflare.com/client/v4';

export const asciiHost = (domain) => {
  const d = String(domain || '').trim().replace(/^https?:[/][/]/, '').replace(/[/].*$/, '');
  if (!d) return '';
  try { return new URL(`https://${d}`).hostname; } catch { return ''; }
};

async function cf(token, method, p, data) {
  const r = await fetch(`${API}${p}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: data ? JSON.stringify(data) : undefined,
  });
  const out = await r.json().catch(() => ({}));
  if (!r.ok || out.success === false) {
    const err = new Error((out.errors || []).map((e) => `${e.code} ${e.message}`).join(', ') || `HTTP ${r.status}`);
    err.codes = (out.errors || []).map((e) => e.code);
    throw err;
  }
  return out.result;
}

// 도메인이 속한 존 (www.example.kr → example.kr)
async function findZone(token, host) {
  const parts = host.split('.');
  for (let i = 0; i < parts.length - 1; i++) {
    const zones = await cf(token, 'GET', `/zones?name=${encodeURIComponent(parts.slice(i).join('.'))}`);
    if (zones?.length) return zones[0];
  }
  return null;
}

// 결과: { status: 'ok' | 'added' | 'skip' | 'error', message }
export async function ensureMailDomain(token, domain) {
  const host = asciiHost(domain);
  if (!host) return { status: 'skip', message: '대표 도메인이 없습니다' };
  if (!token) return { status: 'skip', message: '메일 등록용 토큰(CF_MAIL_TOKEN)이 아직 없습니다' };
  try {
    const zone = await findZone(token, host);
    if (!zone) return { status: 'error', message: `${domain} 이(가) 이 Cloudflare 계정의 도메인에 없습니다` };
    const subs = await cf(token, 'GET', `/zones/${zone.id}/email/sending/subdomains`);
    if ((subs || []).some((s) => s.name === host)) return { status: 'ok', message: '이미 등록돼 있습니다' };
    const sub = await cf(token, 'POST', `/zones/${zone.id}/email/sending/subdomains`, { name: host });
    // 필요한 DNS 기록(SPF · DKIM · MX · DMARC) 중 없는 것만 넣는다
    const want = await cf(token, 'GET', `/zones/${zone.id}/email/sending/subdomains/${sub.tag}/dns`).catch(() => []);
    const list = Array.isArray(want) ? want : (want?.records || []);
    let added = 0;
    const failed = [];
    for (const rec of list) {
      const b = { type: rec.type, name: rec.name, content: rec.content, ttl: rec.ttl || 1 };
      if (rec.priority != null) b.priority = rec.priority;
      try { await cf(token, 'POST', `/zones/${zone.id}/dns_records`, b); added++; } catch (e) {
        if (!(e.codes || []).some((c) => c === 81057 || c === 81058)) failed.push(`${rec.type} ${rec.name}: ${e.message}`);
      }
    }
    if (failed.length) return { status: 'error', message: `등록은 했지만 DNS 기록 일부를 넣지 못했습니다 — ${failed.join(' / ')}` };
    return { status: 'added', message: `등록했습니다 (DNS 기록 ${added}개, 반영까지 5~15분)` };
  } catch (e) {
    return { status: 'error', message: e.message };
  }
}

// 사이트마다 Cloudflare 봇 확인(Turnstile) 위젯을 하나씩 만든다 (가입 인증번호 보내기 앞에 붙는다)
//   토큰 권한: Account · Turnstile · Edit (CF_MAIL_TOKEN 에 함께)
//   hosts: 대표 도메인 + workers.dev 주소. 이미 있으면 주소 목록만 맞춘다.
export async function ensureTurnstile(token, accountId, { slug, hosts, sitekey }) {
  if (!token) return { status: 'skip', message: '토큰(CF_MAIL_TOKEN)이 아직 없습니다' };
  const domains = [...new Set(hosts.map(asciiHost).filter(Boolean))];
  try {
    if (sitekey) {
      await cf(token, 'PUT', `/accounts/${accountId}/challenges/widgets/${sitekey}`, { name: `xms ${slug}`, domains, mode: 'managed' });
      return { status: 'ok', message: '봇 확인 준비됨', sitekey };
    }
    const w = await cf(token, 'POST', `/accounts/${accountId}/challenges/widgets`, { name: `xms ${slug}`, domains, mode: 'managed' });
    return { status: 'added', message: '봇 확인을 만들었습니다', sitekey: w.sitekey, secret: w.secret };
  } catch (e) {
    return { status: 'error', message: `봇 확인: ${e.message}` };
  }
}
