// 강의 (사이트 기능 'courses' 를 켠 사이트만): 강의 → 섹션 → 차시(YouTube · Vimeo 영상 주소)
//   관리자 API  /xms-api/admin/courses…   방문자 API  /xms-api/courses… · /xms-api/lessons/… · /xms-api/my/courses
//   볼 권한: 강의마다 view_levels(등급 비트). 관리자(등급 1)는 언제나, '맛보기' 차시는 누구나(로그인 안 해도).
//   영상 주소는 볼 수 있는 사람에게만 내준다(목록 · 상세에는 넣지 않는다).
import { now, bad, forbidden, notFound, json, str, body, audit, canBy, maskFrom, levelsOf, HttpError } from './lib.js';

const THUMBS = ['red', 'black', 'split'];
const kstDay = (t = Date.now()) => new Date(t + 9 * 3600000).toISOString().slice(0, 10);
const memberId = (me) => (me.kind === 'member' ? me.member.id : 0);
const list = (v, max = 12) => (Array.isArray(v) ? v : String(v || '').split('\n')).map((x) => str(x, 200)).filter(Boolean).slice(0, max);
const parseList = (s) => { try { const a = JSON.parse(s || '[]'); return Array.isArray(a) ? a : []; } catch { return []; } };
// 영상 주소: https 만 (YouTube · Vimeo 를 권장, 그 밖의 https 도 허용 — 사이트가 알아서 띄운다)
const videoUrl = (v) => { const s = str(v, 500); if (!s) return ''; if (!/^https:\/\//i.test(s)) throw bad('영상 주소는 https:// 로 시작해야 합니다.'); return s; };
// "12:30" · "1:02:03" · "750" → 초
function seconds(v) {
  if (typeof v === 'number') return Math.max(0, Math.min(86400, Math.round(v)));
  const p = String(v || '').trim().split(':').map((x) => parseInt(x, 10) || 0);
  if (!p.length) return 0;
  const s = p.reduce((a, x) => a * 60 + x, 0);
  return Math.max(0, Math.min(86400, s));
}

export async function featureOn(db, site, feature) {
  return !!(await db.prepare('SELECT 1 FROM site_features WHERE site = ? AND feature = ?').bind(site, feature).first());
}
async function need(db, site) {
  if (!(await featureOn(db, site, 'courses'))) throw notFound('이 사이트는 강의 기능을 쓰지 않습니다.');
}
const canView = (c, me) => canBy(c.view_levels, false, me);

async function curriculum(db, courseIds) {
  if (!courseIds.length) return { sections: [], lessons: [] };
  const q = courseIds.map(() => '?').join(',');
  const [s, l] = await db.batch([
    db.prepare(`SELECT id, course_id, title, sort FROM course_sections WHERE course_id IN (${q}) ORDER BY sort, id`).bind(...courseIds),
    db.prepare(`SELECT id, course_id, section_id, title, video_url, duration_sec, is_free, sort FROM course_lessons WHERE course_id IN (${q}) ORDER BY sort, id`).bind(...courseIds),
  ]);
  return { sections: s.results, lessons: l.results };
}

// ───────── 관리자 ─────────
export async function adminCourses(ctx, path, method) {
  const { request, env, site, me } = ctx;
  const db = env.DB;
  let m;
  if (!path.startsWith('/courses')) return null;
  await need(db, site);

  if (path === '/courses' && method === 'GET') {
    const { results } = await db.prepare(`SELECT c.*, (SELECT COUNT(*) FROM course_lessons l WHERE l.course_id = c.id) AS lessons,
      (SELECT COALESCE(SUM(duration_sec), 0) FROM course_lessons l WHERE l.course_id = c.id) AS total_sec,
      (SELECT COUNT(DISTINCT member_id) FROM course_last v WHERE v.course_id = c.id) AS students
      FROM courses c WHERE c.site = ? AND c.deleted_at IS NULL ORDER BY c.sort, c.id`).bind(site).all();
    return json(results.map(outCourse));
  }
  if (path === '/courses/order' && method === 'PUT') {
    const ids = (await body(request)).ids;
    if (!Array.isArray(ids)) throw bad('차례가 없습니다.');
    await db.batch(ids.slice(0, 500).map((id, i) => db.prepare('UPDATE courses SET sort = ? WHERE id = ? AND site = ?').bind(i, Number(id), site)));
    return json({ ok: true });
  }
  if (path === '/courses' && method === 'POST') {
    const b = await body(request);
    const t = now();
    const top = await db.prepare('SELECT COALESCE(MAX(sort), -1) + 1 AS n FROM courses WHERE site = ?').bind(site).first();
    const r = await db.prepare(`INSERT INTO courses (site, title, no_label, track, level, thumb, opened_on, sort, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(site, str(b.title, 100) || '새 강의', str(b.no_label, 30), str(b.track, 30), str(b.level, 20), THUMBS.includes(b.thumb) ? b.thumb : 'red', kstDay(), top.n, t, t).run();
    const id = r.meta.last_row_id;
    await saveCourse(db, site, id, b);
    await audit(db, site, me, request, 'COURSE_CREATE', String(id), str(b.title, 100));
    return json({ id });
  }
  if ((m = path.match(/^\/courses\/(\d+)$/))) {
    const id = +m[1];
    const c = await db.prepare('SELECT * FROM courses WHERE id = ? AND site = ? AND deleted_at IS NULL').bind(id, site).first();
    if (!c) throw notFound('없는 강의입니다.');
    if (method === 'GET') {
      const { sections, lessons } = await curriculum(db, [id]);
      return json({ ...outCourse(c), sections: sections.map((s) => ({ id: s.id, title: s.title, lessons: lessons.filter((l) => l.section_id === s.id).map(outLessonAdmin) })) });
    }
    if (method === 'PUT') {
      const b = await body(request);
      await saveCourse(db, site, id, b);
      await audit(db, site, me, request, 'COURSE_UPDATE', String(id), str(b.title, 100) || c.title);
      return json({ ok: true });
    }
    if (method === 'DELETE') {
      await db.prepare('UPDATE courses SET deleted_at = ? WHERE id = ?').bind(now(), id).run();
      await audit(db, site, me, request, 'COURSE_DELETE', String(id), c.title);
      return json({ ok: true });
    }
  }
  return null;
}
const outCourse = (c) => ({
  id: c.id, title: c.title, no_label: c.no_label, track: c.track, level: c.level, thumb: c.thumb, description: c.description,
  who: parseList(c.who), learn: parseList(c.learn), view_levels: levelsOf(c.view_levels), visible: !!c.visible, opened_on: c.opened_on,
  lessons: c.lessons, total_sec: c.total_sec, students: c.students, updated_at: c.updated_at,
});
const outLessonAdmin = (l) => ({ id: l.id, title: l.title, video_url: l.video_url, duration_sec: l.duration_sec, is_free: !!l.is_free });

// 강의 저장: 기본 정보 + 커리큘럼 전체(섹션 · 차시). id 가 있는 섹션 · 차시는 고치고, 없으면 새로, 빠진 것은 지운다(그 차시 수강 기록도).
async function saveCourse(db, site, id, b) {
  const t = now();
  const sets = []; const binds = [];
  const put = (col, v) => { sets.push(`${col} = ?`); binds.push(v); };
  if (b.title !== undefined) { const v = str(b.title, 100); if (!v) throw bad('강의 이름을 넣어 주세요.'); put('title', v); }
  if (b.no_label !== undefined) put('no_label', str(b.no_label, 30));
  if (b.track !== undefined) put('track', str(b.track, 30));
  if (b.level !== undefined) put('level', str(b.level, 20));
  if (b.thumb !== undefined) put('thumb', THUMBS.includes(b.thumb) ? b.thumb : 'red');
  if (b.description !== undefined) put('description', str(b.description, 1000));
  if (b.who !== undefined) put('who', JSON.stringify(list(b.who)));
  if (b.learn !== undefined) put('learn', JSON.stringify(list(b.learn)));
  if (b.view_levels !== undefined) put('view_levels', maskFrom(b.view_levels));
  if (b.visible !== undefined) put('visible', b.visible ? 1 : 0);
  if (b.opened_on !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(b.opened_on || '')) put('opened_on', b.opened_on);
  put('updated_at', t);
  await db.prepare(`UPDATE courses SET ${sets.join(', ')} WHERE id = ? AND site = ?`).bind(...binds, id, site).run();
  if (!Array.isArray(b.sections)) return;

  const sections = b.sections.slice(0, 60);
  const { sections: oldS, lessons: oldL } = await curriculum(db, [id]);
  const keepS = new Set(); const keepL = new Set();
  const stmts = [];
  for (let si = 0; si < sections.length; si++) {
    const s = sections[si];
    const title = str(s.title, 100) || `${si + 1}장`;
    let sid = Number(s.id) || 0;
    if (sid && oldS.some((x) => x.id === sid)) {
      stmts.push(db.prepare('UPDATE course_sections SET title = ?, sort = ? WHERE id = ?').bind(title, si, sid));
    } else {
      sid = (await db.prepare('INSERT INTO course_sections (site, course_id, title, sort) VALUES (?, ?, ?, ?)').bind(site, id, title, si).run()).meta.last_row_id;
    }
    keepS.add(sid);
    const lessons = Array.isArray(s.lessons) ? s.lessons.slice(0, 200) : [];
    lessons.forEach((l, li) => {
      const lt = str(l.title, 150) || `${li + 1}강`;
      const v = videoUrl(l.video_url);
      const d = seconds(l.duration ?? l.duration_sec);
      const lid = Number(l.id) || 0;
      if (lid && oldL.some((x) => x.id === lid)) {
        keepL.add(lid);
        stmts.push(db.prepare('UPDATE course_lessons SET section_id = ?, title = ?, video_url = ?, duration_sec = ?, is_free = ?, sort = ? WHERE id = ?')
          .bind(sid, lt, v, d, l.is_free ? 1 : 0, si * 1000 + li, lid));
      } else {
        stmts.push(db.prepare('INSERT INTO course_lessons (site, course_id, section_id, title, video_url, duration_sec, is_free, sort) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
          .bind(site, id, sid, lt, v, d, l.is_free ? 1 : 0, si * 1000 + li));
      }
    });
  }
  for (const s of oldS) if (!keepS.has(s.id)) stmts.push(db.prepare('DELETE FROM course_sections WHERE id = ?').bind(s.id));
  for (const l of oldL) {
    if (keepL.has(l.id)) continue;
    stmts.push(db.prepare('DELETE FROM course_lessons WHERE id = ?').bind(l.id));
    stmts.push(db.prepare('DELETE FROM course_done WHERE lesson_id = ? AND site = ?').bind(l.id, site));
    stmts.push(db.prepare('DELETE FROM course_notes WHERE lesson_id = ? AND site = ?').bind(l.id, site));
  }
  if (stmts.length) await db.batch(stmts);
}

// ───────── 방문자 ─────────
export async function publicCourses(ctx, path, method) {
  const { request, env, site, me } = ctx;
  const db = env.DB;
  let m;
  if (!/^\/(courses|lessons|my\/courses)(\/|$)/.test(path)) return null;
  await need(db, site);
  const mid = memberId(me);

  // 목록: 보이는 강의 + 차시 수 · 총 시간 · 내 진도
  if (path === '/courses' && method === 'GET') {
    const { results } = await db.prepare(`SELECT c.*, (SELECT COUNT(*) FROM course_lessons l WHERE l.course_id = c.id) AS lessons,
      (SELECT COALESCE(SUM(duration_sec), 0) FROM course_lessons l WHERE l.course_id = c.id) AS total_sec
      FROM courses c WHERE c.site = ? AND c.deleted_at IS NULL AND (c.visible = 1 OR ? = 1) ORDER BY c.sort, c.id`).bind(site, me.level === 1 ? 1 : 0).all();
    const done = mid ? (await db.prepare('SELECT course_id, COUNT(*) AS n FROM course_done WHERE site = ? AND member_id = ? GROUP BY course_id').bind(site, mid).all()).results : [];
    return json(results.map((c) => ({ ...pubCourse(c, me), done: done.find((d) => d.course_id === c.id)?.n || 0 })));
  }
  // 상세: 커리큘럼(영상 주소 빼고) + 내 기록
  if ((m = path.match(/^\/courses\/(\d+)$/)) && method === 'GET') {
    const c = await pubFind(db, site, +m[1], me);
    const { sections, lessons } = await curriculum(db, [c.id]);
    const done = mid ? (await db.prepare('SELECT lesson_id FROM course_done WHERE site = ? AND member_id = ? AND course_id = ?').bind(site, mid, c.id).all()).results.map((r) => r.lesson_id) : [];
    const last = mid ? await db.prepare('SELECT lesson_id FROM course_last WHERE site = ? AND member_id = ? AND course_id = ?').bind(site, mid, c.id).first() : null;
    const view = canView(c, me);
    return json({
      ...pubCourse(c, me), lessons: lessons.length, total_sec: lessons.reduce((n, l) => n + l.duration_sec, 0),
      who: parseList(c.who), learn: parseList(c.learn), can_view: view, guest: me.kind === 'guest',
      last: last?.lesson_id || null, done,
      sections: sections.map((s) => ({ id: s.id, title: s.title, lessons: lessons.filter((l) => l.section_id === s.id)
        .map((l) => ({ id: l.id, title: l.title, duration_sec: l.duration_sec, is_free: !!l.is_free, open: view || !!l.is_free, has_video: !!l.video_url })) })),
    });
  }
  // 차시 열기: 볼 수 있으면 영상 주소 + 노트, 기록(마지막 차시 · 공부한 날)
  if ((m = path.match(/^\/lessons\/(\d+)$/)) && method === 'GET') {
    const { l, c } = await lessonOf(db, site, +m[1], me);
    if (!(l.is_free || canView(c, me))) {
      throw new HttpError(me.kind === 'guest' ? 401 : 403, me.kind === 'guest' ? '로그인한 뒤 볼 수 있습니다.' : '이 강의를 볼 수 있는 권한이 아직 없습니다. 관리자에게 수강 권한을 요청해 주세요.');
    }
    let note = '';
    if (mid) {
      const t = now();
      const [n] = await db.batch([
        db.prepare('SELECT body FROM course_notes WHERE site = ? AND member_id = ? AND lesson_id = ?').bind(site, mid, l.id),
        db.prepare('INSERT INTO course_last (site, member_id, course_id, lesson_id, at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(site, member_id, course_id) DO UPDATE SET lesson_id = excluded.lesson_id, at = excluded.at').bind(site, mid, c.id, l.id, t),
        db.prepare('INSERT OR IGNORE INTO course_days (site, member_id, day) VALUES (?, ?, ?)').bind(site, mid, kstDay(t)),
      ]);
      note = n.results[0]?.body || '';
    }
    return json({ id: l.id, video_url: l.video_url, note, member: !!mid });
  }
  if ((m = path.match(/^\/lessons\/(\d+)\/done$/)) && method === 'PUT') {
    if (!mid) throw new HttpError(401, '로그인한 뒤 기록할 수 있습니다.');
    const { l, c } = await lessonOf(db, site, +m[1], me);
    if (!(l.is_free || canView(c, me))) throw forbidden();
    const on = !!(await body(request)).done;
    if (on) await db.prepare('INSERT OR REPLACE INTO course_done (site, member_id, lesson_id, course_id, at) VALUES (?, ?, ?, ?, ?)').bind(site, mid, l.id, c.id, now()).run();
    else await db.prepare('DELETE FROM course_done WHERE site = ? AND member_id = ? AND lesson_id = ?').bind(site, mid, l.id).run();
    return json({ ok: true });
  }
  if ((m = path.match(/^\/lessons\/(\d+)\/note$/)) && method === 'PUT') {
    if (!mid) throw new HttpError(401, '로그인한 뒤 노트를 남길 수 있습니다.');
    const { l, c } = await lessonOf(db, site, +m[1], me);
    if (!(l.is_free || canView(c, me))) throw forbidden();
    const text = str((await body(request)).body, 20000);
    if (text) await db.prepare('INSERT INTO course_notes (site, member_id, lesson_id, body, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(site, member_id, lesson_id) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at').bind(site, mid, l.id, text, now()).run();
    else await db.prepare('DELETE FROM course_notes WHERE site = ? AND member_id = ? AND lesson_id = ?').bind(site, mid, l.id).run();
    return json({ ok: true });
  }
  // 내 강의실: 다 본 차시 수 · 완강 · 연속 학습일 · 마지막 강의 · 수강 중 강의
  if (path === '/my/courses' && method === 'GET') {
    if (!mid) return json({ guest: me.kind === 'guest', done: 0, completed: 0, streak: 0, last: null, courses: [] });
    const [done, last, days] = await db.batch([
      db.prepare('SELECT course_id, COUNT(*) AS n FROM course_done WHERE site = ? AND member_id = ? GROUP BY course_id').bind(site, mid),
      db.prepare('SELECT course_id, lesson_id, at FROM course_last WHERE site = ? AND member_id = ? ORDER BY at DESC').bind(site, mid),
      db.prepare('SELECT day FROM course_days WHERE site = ? AND member_id = ? ORDER BY day DESC LIMIT 400').bind(site, mid),
    ]);
    const ids = [...new Set([...done.results.map((r) => r.course_id), ...last.results.map((r) => r.course_id)])];
    let courses = [];
    if (ids.length) {
      const { results } = await db.prepare(`SELECT c.*, (SELECT COUNT(*) FROM course_lessons l WHERE l.course_id = c.id) AS lessons,
        (SELECT COALESCE(SUM(duration_sec), 0) FROM course_lessons l WHERE l.course_id = c.id) AS total_sec
        FROM courses c WHERE c.site = ? AND c.deleted_at IS NULL AND c.id IN (${ids.map(() => '?').join(',')})`).bind(site, ...ids).all();
      const order = last.results.map((r) => r.course_id);
      courses = results.map((c) => ({ ...pubCourse(c, me), done: done.results.find((d) => d.course_id === c.id)?.n || 0 }))
        .sort((a, b) => (order.indexOf(a.id) + 1 || 1e9) - (order.indexOf(b.id) + 1 || 1e9));
    }
    let lastOut = null;
    const L = last.results[0];
    if (L) {
      const l = await db.prepare('SELECT id, title FROM course_lessons WHERE id = ?').bind(L.lesson_id).first();
      const c = courses.find((x) => x.id === L.course_id);
      if (l && c) lastOut = { course: c, lesson: { id: l.id, title: l.title } };
    }
    // 연속 학습: 오늘(없으면 어제)부터 거꾸로 하루도 안 빠진 날 수
    const set = new Set(days.results.map((r) => r.day));
    let streak = 0; let d = Date.now();
    if (!set.has(kstDay(d))) d -= 86400000;
    while (set.has(kstDay(d))) { streak++; d -= 86400000; }
    return json({
      done: done.results.reduce((n, r) => n + r.n, 0),
      completed: courses.filter((c) => c.lessons && c.done >= c.lessons).length,
      streak, last: lastOut, courses,
    });
  }
  return null;
}
const pubCourse = (c, me) => ({
  id: c.id, title: c.title, no_label: c.no_label, track: c.track, level: c.level, thumb: c.thumb, description: c.description,
  opened_on: c.opened_on, lessons: c.lessons, total_sec: c.total_sec, can_view: canView(c, me), hidden: !c.visible,
});
async function pubFind(db, site, id, me) {
  const c = await db.prepare('SELECT * FROM courses WHERE id = ? AND site = ? AND deleted_at IS NULL').bind(id, site).first();
  if (!c || (!c.visible && me.level !== 1)) throw notFound('없는 강의입니다.');
  return c;
}
async function lessonOf(db, site, id, me) {
  const l = await db.prepare('SELECT * FROM course_lessons WHERE id = ? AND site = ?').bind(id, site).first();
  if (!l) throw notFound('없는 차시입니다.');
  const c = await pubFind(db, site, l.course_id, me);
  return { l, c };
}
