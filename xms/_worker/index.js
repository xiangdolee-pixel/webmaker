// xms — 업체별 CMS (회원 · 게시판 · 메뉴 · 수정요청)
//
//   Cms (서비스 바인딩 전용) — 고객 사이트 Worker 가 X-Xim-Site 헤더를 붙여 넘긴다. 공개 주소로는 닿지 않는다.
//     /admin/              관리자 화면 (등급 1 회원 · xim 에서 대신 들어온 운영자)
//     /admin/?staff=…      xim "관리 화면 열기" 1회용 입장권 → 운영자 세션
//     /xms/css · /xms/js   화면용 정적 파일
//     /xms-api/admin/*     관리자 API      /xms-api/*  방문자 API (로그인 · 가입 · 글 · 댓글 · 메뉴)
//     /member/* · /board/* 방문자 화면
//   기본 export (xms.….workers.dev) — 아무것도 내주지 않는다.
//
//   바인딩: DB(D1 xms), XIM_DB(D1 xim: 사이트 · 수정요청), ASSETS
import { WorkerEntrypoint } from 'cloudflare:workers';
import { fail, whoAmI, now, createSession, html } from './lib.js';
import { adminApi } from './admin-api.js';
import { publicApi, publicPage, visibleMenus } from './public.js';
import { serveFile, serveRobots, serveSitemap, headData } from './site-meta.js';
import { livePopups } from './popups.js';
import { uploadApi, serveUpload } from './uploads.js';

const SITE_RE = /^[a-z0-9][a-z0-9-]{1,39}$/;

async function asset(env, path, cache = 'no-cache') {
  const res = await env.ASSETS.fetch(new Request(`https://assets${path}`));
  const out = new Response(res.body, res);
  out.headers.set('Cache-Control', cache);
  return out;
}

export class Cms extends WorkerEntrypoint {
  async fetch(request) {
    const env = this.env;
    const url = new URL(request.url);
    const site = request.headers.get('X-Xim-Site') || '';
    if (!SITE_RE.test(site)) return new Response('xms: 사이트를 알 수 없습니다.', { status: 400 });
    const p = url.pathname;

    try {
      // 정적 파일
      // 올린 파일 (파비콘 · 공유 그림 · 팝업 그림)
      let fm = p.match(/^\/xms\/file\/(favicon-(?:32|180|192|512)|og|popup-\d+)(?:\.png)?$/);
      if (fm) return await serveFile(env, site, fm[1]);
      const um = p.match(/^[/]xms[/]upload[/]([0-9a-f]{32})$/);
      if (um) return await serveUpload(env, site, um[1], url.searchParams.get('dl') === '1');
      if (p === '/robots.txt') return await serveRobots(env, site, url.origin);
      if (p === '/sitemap.xml') return await serveSitemap(env, site, url.origin);
      if (p.startsWith('/xms/')) {
        const rest = p.slice(4);
        if (!/^\/(css|js)\/[\w.-]+$/.test(rest)) return new Response('Not found', { status: 404 });
        return await asset(env, rest);
      }

      // 관리자 화면
      if (p === '/admin') return Response.redirect(`${url.origin}/admin/`, 301);
      if (p === '/admin/' || p === '/admin/index.html') {
        const ticket = url.searchParams.get('staff');
        if (ticket && /^[0-9a-f]{64}$/.test(ticket)) {
          const t = await env.DB.prepare('DELETE FROM staff_tickets WHERE token = ? AND site = ? AND expires_at > ? RETURNING token').bind(ticket, site, now()).first();
          if (!t) return html('<!doctype html><meta charset="utf-8"><p style="font-family:sans-serif;padding:24px">입장권이 만료됐습니다. xim 에서 "관리 화면 열기" 를 다시 눌러 주세요.</p>', 410);
          return new Response(null, { status: 302, headers: { Location: `${url.origin}/admin/`, 'Set-Cookie': await createSession(env.DB, site, 'staff') } });
        }
        const res = await asset(env, '/admin/');
        res.headers.set('X-Robots-Tag', 'noindex');
        return res;
      }

      const me = await whoAmI(env.DB, request, site);
      const ctx = { request, env, site, me, url };
      // 사이트 Worker 가 html 을 내보낼 때 한 번에 묻는다: 메뉴 · 머리(head) 값 · 홈 팝업
      if (p === '/xms-api/site-head') {
        const home = url.searchParams.get('home') === '1';
        const [menu, head, popups] = await Promise.all([visibleMenus(env.DB, site, me), headData(env, site), home ? livePopups(env.DB, site) : []]);
        return new Response(JSON.stringify({ menu, head, popups }), { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
      }
      if (p === '/xms-api/uploads' && request.method === 'POST') return await uploadApi(ctx);
      if (p.startsWith('/xms-api/admin/')) return await adminApi(ctx);
      if (p.startsWith('/xms-api/')) return await publicApi(ctx);
      if (p.startsWith('/member/') || p.startsWith('/board/') || p === '/board') return await publicPage(ctx);
      return new Response('Not found', { status: 404 });
    } catch (e) {
      return fail(e);
    }
  }
}

export default {
  async fetch() {
    return new Response('xms', { status: 404 });
  },
};
