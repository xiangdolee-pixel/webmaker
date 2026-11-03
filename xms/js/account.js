// xim 관할 모든 서비스(고객 홈페이지) 공통 계정 버튼.
//   사이트 Worker 가 처음부터 버튼을 그려서(로그인 링크 / 사람 동그라미) 보내고 스타일도 머리에 바로 넣는다 → 화면이 흔들리지 않는다.
//   이 스크립트는 그 버튼에 메뉴(관리 · 유지보수 요청(레벨1만) / 내 정보 / 로그아웃)를 붙이기만 한다. 서버가 못 그린 경우에만 직접 묻고 그린다.
//   놓을 자리: 사이트 헤더 안에 <span data-xms-account></span>  (없으면 화면 오른쪽 위에 떠 있는 버튼)
//   서비스와 xms 는 같은 로그인(SSO). 색: 자리 요소에 --xa-bg(동그라미) · --xa-fg(사람) CSS 변수.
(() => {
  if (window.__xmsAccount) return;
  window.__xmsAccount = true;

  const PERSON = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8.2" r="4" fill="currentColor"/><path d="M4 20.2c0-4.1 3.6-6.7 8-6.7s8 2.6 8 6.7" fill="currentColor"/></svg>';

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
      const l = document.createElement('link');
      l.id = 'xa-style'; l.rel = 'stylesheet'; l.href = '/xms/css/account.css';
      document.head.append(l);
    }
    const el = host();
    let me = null;
    try { me = JSON.parse(el.dataset.xaMe || 'null'); } catch { me = null; }
    if (!me) {
      me = { guest: true };
      try {
        const r = await fetch('/xms-api/me', { credentials: 'same-origin', cache: 'no-store' });
        if (r.ok) me = await r.json();
      } catch { /* 엔진이 없으면 로그인 링크만 */ }
    }
    if (me.guest) {
      if (!el.querySelector('.xa-login')) {
        el.innerHTML = '<a class="xa-login" href="/member/login">로그인</a>'; // 로그인하면 홈으로
      }
      return;
    }
    const admin = !!me.admin;
    if (!el.querySelector('.xa-avatar')) el.innerHTML = `<button type="button" class="xa-avatar" aria-haspopup="menu" aria-expanded="false" aria-label="내 계정 메뉴">${PERSON}</button>`;
    const menu = document.createElement('div');
    menu.className = 'xa-menu';
    menu.setAttribute('role', 'menu');
    // 운영자 = xim "관리 화면 열기" 로 대신 들어온 로그인 (8시간). 업체 계정으로 오해하지 않게 분명히 적는다.
    menu.innerHTML = `${admin ? '<a role="menuitem" href="/xms/">관리</a><a role="menuitem" href="/xms/#/requests">유지보수 요청</a>' : ''}
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
