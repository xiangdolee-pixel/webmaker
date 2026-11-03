// xim 관할 모든 서비스(고객 홈페이지) 공통 계정 버튼 — 사이트 Worker 가 모든 html 에 자동으로 넣는다.
//   놓을 자리: 사이트 헤더 안에 <span data-xms-account></span>  (없으면 화면 오른쪽 위에 떠 있는 버튼)
//   로그인 전: "로그인" 링크   로그인 후: 사람 모양 동그라미 → 관리 · 유지보수 요청(레벨1만) / 내 정보 / 로그아웃
//   서비스와 xms 는 같은 로그인(SSO, 같은 주소의 xms_sess 쿠키). 관리 화면은 레벨1만 들어간다.
//   색 바꾸기: 자리 요소에 --xa-bg(동그라미 색) · --xa-fg(사람 색) CSS 변수를 주면 된다.
(() => {
  if (window.__xmsAccount) return;
  window.__xmsAccount = true;

  const CSS = `
.xa-host{position:relative;display:inline-flex;align-items:center;vertical-align:middle}
.xa-host.xa-float{position:fixed;top:12px;right:12px;z-index:2147482000}
.xa-host *{-webkit-tap-highlight-color:transparent;box-sizing:border-box}
.xa-avatar{display:inline-grid;place-items:center;width:38px;height:38px;padding:0;border:0;border-radius:50%;cursor:pointer;
  background:var(--xa-bg,#b8913f);color:var(--xa-fg,#fff);box-shadow:0 2px 8px -2px rgba(0,0,0,.35);transition:transform .2s cubic-bezier(.22,.8,.24,1),box-shadow .2s}
.xa-avatar:hover{transform:translateY(-1px);box-shadow:0 6px 14px -4px rgba(0,0,0,.4)}
.xa-avatar svg{width:22px;height:22px;display:block}
.xa-avatar:focus-visible,.xa-menu a:focus-visible,.xa-menu button:focus-visible{outline:2px solid #2f5fd0;outline-offset:2px}
.xa-float .xa-login{display:inline-flex;align-items:center;min-height:38px;padding:0 16px;border-radius:99px;background:#fff;color:#1d2433;
  font:600 14px/1 -apple-system,"Apple SD Gothic Neo","Noto Sans KR",sans-serif;text-decoration:none;box-shadow:0 2px 10px -3px rgba(0,0,0,.3)}
.xa-menu{position:fixed;z-index:2147483000;min-width:220px;padding:10px 0;margin:0;list-style:none;background:#fff;color:#1d2433;
  border:1px solid #e3e5ea;border-radius:18px;box-shadow:0 18px 50px -14px rgba(10,14,30,.35);
  font-family:"Pretendard Variable",Pretendard,-apple-system,"Apple SD Gothic Neo","Noto Sans KR",sans-serif;
  opacity:0;transform:translateY(-6px) scale(.98);transform-origin:top right;transition:opacity .18s,transform .22s cubic-bezier(.22,.8,.24,1);pointer-events:none}
.xa-menu.xa-open{opacity:1;transform:none;pointer-events:auto}
.xa-menu .xa-who{padding:6px 28px 10px;font-size:13px;color:#8a909c;border-bottom:1px solid #eef0f3;margin-bottom:6px}
.xa-menu a,.xa-menu button{display:block;width:100%;padding:14px 28px;border:0;background:none;color:inherit;text-align:left;text-decoration:none;
  font-family:inherit;font-size:18px;font-weight:700;line-height:1.3;letter-spacing:-.01em;cursor:pointer}
.xa-menu a:hover,.xa-menu button:hover{background:#f4f5f8}
@media (prefers-reduced-motion:reduce){.xa-avatar,.xa-menu{transition:none}}`;

  const PERSON = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8.2" r="4" fill="currentColor"/><path d="M4 20.2c0-4.1 3.6-6.7 8-6.7s8 2.6 8 6.7" fill="currentColor"/></svg>';
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

  function host() {
    let el = document.querySelector('[data-xms-account]');
    if (!el) {
      el = document.createElement('div');
      el.className = 'xa-float';
      document.body.append(el);
    }
    el.classList.add('xa-host');
    return el;
  }

  async function start() {
    if (!document.getElementById('xa-style')) {
      const st = document.createElement('style');
      st.id = 'xa-style';
      st.textContent = CSS;
      document.head.append(st);
    }
    let me = { guest: true };
    try {
      const r = await fetch('/xms-api/me', { credentials: 'same-origin', cache: 'no-store' });
      if (r.ok) me = await r.json();
    } catch { /* 엔진이 없으면 로그인 링크만 */ }
    const el = host();
    if (me.guest) {
      const next = encodeURIComponent(location.pathname + location.search);
      el.innerHTML = `<a class="xa-login" href="/member/login?next=${next}">로그인</a>`;
      return;
    }
    const admin = !!me.admin;
    el.innerHTML = `<button type="button" class="xa-avatar" aria-haspopup="menu" aria-expanded="false" aria-label="내 계정 메뉴">${PERSON}</button>`;
    const menu = document.createElement('div');
    menu.className = 'xa-menu';
    menu.setAttribute('role', 'menu');
    menu.innerHTML = `<div class="xa-who">${me.staff ? '웹촌 직원' : `${esc(me.name)} 님`}</div>
      ${admin ? '<a role="menuitem" href="/admin/">관리</a><a role="menuitem" href="/admin/#/requests">유지보수 요청</a>' : ''}
      ${me.staff ? '' : '<a role="menuitem" href="/member/mypage">내 정보</a>'}
      <button type="button" role="menuitem" data-xa-logout>로그아웃</button>`;
    document.body.append(menu);
    const btn = el.querySelector('.xa-avatar');

    const place = () => {
      const r = btn.getBoundingClientRect();
      menu.style.top = `${Math.round(r.bottom + 10)}px`;
      menu.style.right = `${Math.max(8, Math.round(innerWidth - r.right))}px`;
    };
    const open = (v, keyboard = false) => {
      if (v) place();
      menu.classList.toggle('xa-open', v);
      btn.setAttribute('aria-expanded', String(v));
      if (v && keyboard) menu.querySelector('a,button')?.focus({ preventScroll: true });
    };
    // 키보드(Enter · Space)로 열었을 때만 첫 항목으로 초점을 옮긴다 (e.detail === 0)
    btn.addEventListener('click', (e) => { e.stopPropagation(); open(!menu.classList.contains('xa-open'), e.detail === 0); });
    document.addEventListener('click', (e) => { if (!menu.contains(e.target)) open(false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && menu.classList.contains('xa-open')) { open(false); btn.focus(); } });
    addEventListener('resize', () => menu.classList.contains('xa-open') && place());
    addEventListener('scroll', () => menu.classList.contains('xa-open') && place(), { passive: true });
    menu.querySelector('[data-xa-logout]').addEventListener('click', async () => {
      try { await fetch('/xms-api/logout', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{}' }); } catch { /* 이미 끊김 */ }
      location.reload();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
