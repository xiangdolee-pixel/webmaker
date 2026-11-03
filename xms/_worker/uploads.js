// 올린 파일 — 글 첨부(이미지 · 파일), 본문 안 그림 · PDF
//   저장: env.FILES(R2) 바인딩이 있으면 R2, 없으면 D1 uploads.data(base64, 한 파일 1.4MB 까지)
//   주소: /xms/upload/<id>  (내려받기는 ?dl=1). id 는 추측할 수 없는 임의 값.
//   용량: 사이트 전체 크기를 xim sites.used_mb 에 적고, quota_mb 를 넘으면 받지 않는다.
import { now, bad, forbidden, notFound, json, randomHex, HttpError, canBy } from './lib.js';

const D1_MAX = 1400000;
const R2_MAX = 20 * 1024 * 1024;
const KINDS = ['IMAGE', 'FILE', 'INLINE'];
const SAFE_INLINE = /^(image\/(png|jpeg|gif|webp)|application\/pdf)$/;

async function usage(env, site) {
  const r = await env.DB.prepare('SELECT COALESCE(SUM(size), 0) AS n FROM uploads WHERE site = ?').bind(site).first();
  return r.n;
}

// POST /xms-api/uploads?board=<slug>&kind=IMAGE|FILE|INLINE  (본문 = 파일 그대로, 헤더 X-File-Name)
export async function uploadApi(ctx) {
  const { request, env, site, me, url } = ctx;
  const board = await env.DB.prepare('SELECT * FROM boards WHERE site = ? AND slug = ? AND deleted_at IS NULL').bind(site, url.searchParams.get('board') || '').first();
  if (!board) throw notFound('없는 게시판입니다.');
  if (!canBy(board.write_levels, board.allow_guest_write, me, true)) throw forbidden('이 게시판에 글을 쓸 수 없습니다.');
  if (me.kind === 'guest') throw new HttpError(401, '사진과 파일은 로그인한 뒤 올릴 수 있습니다.');
  const kind = KINDS.includes(url.searchParams.get('kind')) ? url.searchParams.get('kind') : 'FILE';
  const mime = (request.headers.get('Content-Type') || 'application/octet-stream').split(';')[0].trim().toLowerCase();
  let name = '';
  try { name = decodeURIComponent(request.headers.get('X-File-Name') || ''); } catch { name = ''; }
  name = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 120) || 'file';
  if (kind !== 'FILE' && !SAFE_INLINE.test(mime)) throw bad('사진(PNG · JPG · GIF · WEBP) 이나 PDF 만 넣을 수 있습니다.');
  const buf = await request.arrayBuffer();
  const max = env.FILES ? R2_MAX : D1_MAX;
  if (!buf.byteLength) throw bad('빈 파일입니다.');
  if (buf.byteLength > max) {
    throw bad(env.FILES ? '파일이 너무 큽니다 (20MB 까지).' : `파일이 너무 큽니다. 지금은 ${(D1_MAX / 1e6).toFixed(1)}MB 까지 올릴 수 있습니다.`);
  }
  const site_ = await env.XIM_DB.prepare('SELECT quota_mb FROM sites WHERE slug = ?').bind(site).first();
  const used = await usage(env, site);
  if (site_?.quota_mb && used + buf.byteLength > site_.quota_mb * 1024 * 1024) throw bad('저장 공간이 가득 찼습니다. 운영자에게 늘려 달라고 요청하세요.');

  const id = randomHex(16);
  let data = null; let r2Key = null;
  if (env.FILES) {
    r2Key = `${site}/${id}`;
    await env.FILES.put(r2Key, buf, { httpMetadata: { contentType: mime } });
  } else {
    let s = '';
    const b = new Uint8Array(buf);
    for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
    data = btoa(s);
  }
  await env.DB.prepare('INSERT INTO uploads (id, site, post_id, kind, name, mime, size, data, r2_key, created_by, created_at) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, site, kind, name, mime, buf.byteLength, data, r2Key, me.kind === 'member' ? me.member.id : null, now()).run();
  await env.XIM_DB.prepare('UPDATE sites SET used_mb = ? WHERE slug = ?').bind(Math.round(((used + buf.byteLength) / 1048576) * 10) / 10, site).run();
  return json({ id, url: `/xms/upload/${id}`, name, size: buf.byteLength, mime, kind });
}

// GET /xms/upload/<id>[?dl=1]
export async function serveUpload(env, site, id, download) {
  const u = await env.DB.prepare('SELECT * FROM uploads WHERE id = ? AND site = ?').bind(id, site).first();
  if (!u) throw notFound();
  let body;
  if (u.r2_key && env.FILES) {
    const o = await env.FILES.get(u.r2_key);
    if (!o) throw notFound();
    body = o.body;
  } else if (u.data) {
    body = Uint8Array.from(atob(u.data), (c) => c.charCodeAt(0));
  } else throw notFound();
  // 사진 · PDF 만 화면에서 바로 열고, 그 밖의 파일은 늘 내려받기로 (html 같은 파일이 사이트 주소에서 실행되지 않게)
  const inline = !download && SAFE_INLINE.test(u.mime);
  return new Response(body, {
    headers: {
      'Content-Type': inline ? u.mime : 'application/octet-stream',
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(u.name)}`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}

// 글 저장 때: 첨부 목록(id 차례대로)을 그 글에 붙이고, 빠진 것은 떼어 낸다
export async function attachToPost(env, site, postId, ids, me) {
  const list = (Array.isArray(ids) ? ids : []).map(String).filter((x) => /^[0-9a-f]{32}$/.test(x)).slice(0, 50);
  const stmts = [env.DB.prepare("UPDATE uploads SET post_id = NULL WHERE site = ? AND post_id = ? AND kind != 'INLINE'").bind(site, postId)];
  list.forEach((id, i) => stmts.push(env.DB.prepare(`UPDATE uploads SET post_id = ?, sort = ? WHERE id = ? AND site = ? AND kind != 'INLINE'
    AND (post_id IS NULL OR post_id = ?) AND (created_by IS ? OR ? = 1)`).bind(postId, i, id, site, postId, me.kind === 'member' ? me.member.id : null, me.level === 1 ? 1 : 0)));
  await env.DB.batch(stmts);
}

export async function postAttachments(env, site, postId) {
  const { results } = await env.DB.prepare("SELECT id, kind, name, mime, size FROM uploads WHERE site = ? AND post_id = ? AND kind != 'INLINE' ORDER BY sort, created_at")
    .bind(site, postId).all();
  return results.map((u) => ({ ...u, url: `/xms/upload/${u.id}` }));
}
