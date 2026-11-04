// 방문 통계 — 사이트 Worker 가 html 페이지를 내보낼 때마다 Cms.visit() 으로 알린다 (방문자에게는 기다림 없음, waitUntil)
//   하루 단위로 더해 두고, 1년(366일)이 지난 날은 지운다. 날짜는 한국 시간.
import { json } from './lib.js';

const KEEP_DAYS = 366;
export const kstDay = (t = Date.now()) => new Date(t + 9 * 3600000).toISOString().slice(0, 10);
const cutoff = () => kstDay(Date.now() - KEEP_DAYS * 86400000);

async function purge(db, site) {
  const c = cutoff();
  const w = site ? 'site = ? AND day < ?' : 'day < ?';
  const args = site ? [site, c] : [c];
  await db.batch(['visit_days', 'visit_pages', 'visit_refs'].map((t) => db.prepare(`DELETE FROM ${t} WHERE ${w}`).bind(...args)));
}

// hit = { path, fresh(그날 첫 방문), ref(들어온 곳 호스트), mobile }
export async function recordVisit(db, site, hit) {
  const day = kstDay();
  const path = String(hit.path || '/').slice(0, 200);
  const fresh = hit.fresh ? 1 : 0;
  const mob = fresh && hit.mobile ? 1 : 0;
  const stmts = [
    db.prepare(`INSERT INTO visit_days (site, day, views, visitors, mobile) VALUES (?, ?, 1, ?, ?)
      ON CONFLICT(site, day) DO UPDATE SET views = views + 1, visitors = visitors + excluded.visitors, mobile = mobile + excluded.mobile`).bind(site, day, fresh, mob),
    db.prepare(`INSERT INTO visit_pages (site, day, path, views) VALUES (?, ?, ?, 1)
      ON CONFLICT(site, day, path) DO UPDATE SET views = views + 1`).bind(site, day, path),
  ];
  if (fresh) {
    stmts.push(db.prepare(`INSERT INTO visit_refs (site, day, ref, visitors) VALUES (?, ?, ?, 1)
      ON CONFLICT(site, day, ref) DO UPDATE SET visitors = visitors + 1`).bind(site, day, String(hit.ref || '').slice(0, 100)));
  }
  await db.batch(stmts);
  if (Math.random() < 0.002) await purge(db); // 가끔 모든 사이트의 1년 지난 기록을 지운다
}

// 관리 화면: GET /xms-api/admin/stats?range=7|30|365
export async function statsApi(db, site, q) {
  await purge(db, site);
  const range = [7, 30, 365].includes(Number(q.get('range'))) ? Number(q.get('range')) : 30;
  const today = kstDay();
  const yesterday = kstDay(Date.now() - 86400000);
  const monthly = range === 365;
  // 12개월 = 11달 전 1일부터 (달 단위로 끊어 보이게)
  const from = monthly ? (() => { const [y, m] = today.split('-').map(Number); const d = new Date(Date.UTC(y, m - 12, 1)); return d.toISOString().slice(0, 10); })()
    : kstDay(Date.now() - (range - 1) * 86400000);
  const [days, sum, near, pages, refs, menus, boards] = await db.batch([
    monthly
      ? db.prepare(`SELECT substr(day, 1, 7) AS day, SUM(views) AS views, SUM(visitors) AS visitors FROM visit_days WHERE site = ? AND day >= ? GROUP BY 1 ORDER BY 1`).bind(site, from)
      : db.prepare('SELECT day, views, visitors FROM visit_days WHERE site = ? AND day >= ? ORDER BY day').bind(site, from),
    db.prepare(`SELECT COALESCE(SUM(views), 0) AS views, COALESCE(SUM(visitors), 0) AS visitors, COALESCE(SUM(mobile), 0) AS mobile,
        (SELECT COUNT(*) FROM visit_days WHERE site = ?1) AS kept_days, (SELECT MIN(day) FROM visit_days WHERE site = ?1) AS first_day
      FROM visit_days WHERE site = ?1 AND day >= ?2`).bind(site, from),
    db.prepare('SELECT day, views, visitors FROM visit_days WHERE site = ? AND day IN (?, ?)').bind(site, today, yesterday),
    db.prepare('SELECT path, SUM(views) AS views FROM visit_pages WHERE site = ? AND day >= ? GROUP BY path ORDER BY views DESC LIMIT 20').bind(site, from),
    db.prepare('SELECT ref, SUM(visitors) AS visitors FROM visit_refs WHERE site = ? AND day >= ? GROUP BY ref ORDER BY visitors DESC LIMIT 15').bind(site, from),
    db.prepare("SELECT title, path FROM menus WHERE site = ? AND path != ''").bind(site),
    db.prepare('SELECT slug, name FROM boards WHERE site = ?').bind(site),
  ]);
  // 주소 → 이름 (메뉴 이름, 게시판 이름)
  const names = { '/': '첫 화면' };
  for (const b of boards.results) names[`/board/${b.slug}`] = b.name;
  for (const m of menus.results) { try { names[new URL(m.path, 'https://x').pathname] = m.title; } catch { /* 외부 주소 */ } }
  const s = sum.results[0];
  const pick = (d) => { const r = near.results.find((x) => x.day === d); return { views: r?.views || 0, visitors: r?.visitors || 0 }; };
  return json({
    range, monthly, today, from,
    today_stat: pick(today), yesterday: pick(yesterday),
    total: { views: s.views, visitors: s.visitors, mobile: s.mobile },
    kept_days: s.kept_days, first_day: s.first_day,
    days: days.results,
    pages: pages.results.map((p) => ({ ...p, name: names[p.path] || names[p.path.replace(/\/\d+$/, '')] || '' })),
    refs: refs.results,
  });
}
