// xim · xms 함께 쓰는 것 (wrangler 가 각 Worker 에 넣어 묶는다)

// 수정 요청 지우기: 주고받은 글 · 붙인 파일(R2 + xms uploads)까지 함께
export async function deleteRequest(ximDb, xmsDb, files, requestId, slug) {
  const r = await ximDb.prepare('SELECT attachments FROM requests WHERE id = ?').bind(requestId).first();
  if (!r) return false;
  const { results } = await ximDb.prepare('SELECT attachments FROM request_messages WHERE request_id = ?').bind(requestId).all();
  const ids = [r, ...results].flatMap((x) => { try { return JSON.parse(x.attachments || '[]'); } catch { return []; } }).map((a) => a.id).filter((id) => /^[0-9a-f]{32}$/.test(id));
  {
    const { results: ups } = await xmsDb.prepare(`SELECT id, r2_key FROM uploads WHERE site = ? AND (post_id = ?${ids.length ? ` OR id IN (${ids.map(() => '?').join(',')})` : ''})`).bind(slug, -requestId, ...ids).all();
    const keys = ups.map((u) => u.r2_key).filter(Boolean);
    if (keys.length && files) await files.delete(keys);
    if (ups.length) await xmsDb.prepare(`DELETE FROM uploads WHERE site = ? AND id IN (${ups.map(() => '?').join(',')})`).bind(slug, ...ups.map((u) => u.id)).run();
  }
  await ximDb.batch([
    ximDb.prepare('DELETE FROM request_messages WHERE request_id = ?').bind(requestId),
    ximDb.prepare('DELETE FROM requests WHERE id = ?').bind(requestId),
  ]);
  return true;
}
