// GET  /api/db  -> { sessions, measures, matches, settings }
// POST /api/db  { collection, upserts:[{id,_u,...}], deletes:[id] } -> 레코드 단위 병합(더 새로운 _u 가 이김)
// 쓸 때마다 그날 백업 사본 backup/YYYY-MM-DD/<collection>.json 도 남긴다.
import { COLLECTIONS, isAuthed, readJson, writeJson, readBody, send } from './_lib.js';

export default async function handler(req, res) {
  const who = isAuthed(req);
  if (!who) return send(res, 401, { error: 'login' });
  try {
    if (req.method === 'GET') {
      const out = {};
      await Promise.all(COLLECTIONS.map(async (c) => { out[c] = await readJson(`db/${c}.json`, []); }));
      return send(res, 200, out);
    }
    if (req.method === 'POST') {
      const { collection, upserts = [], deletes = [] } = await readBody(req);
      if (!COLLECTIONS.includes(collection)) return send(res, 400, { error: 'collection' });
      const rows = await readJson(`db/${collection}.json`, []);
      if (!Array.isArray(rows)) return send(res, 500, { error: 'bad stored data, not writing' });
      const byId = new Map(rows.map((r) => [r.id, r]));
      const now = new Date().toISOString();
      for (const u of upserts) {
        if (!u || !u.id) continue;
        const prev = byId.get(u.id);
        if (prev && prev._u && u._u && prev._u > u._u) continue;
        byId.set(u.id, { ...(prev || {}), ...u, _u: u._u || now, _by: who });
      }
      for (const id of deletes) byId.delete(id);
      const next = [...byId.values()];
      await writeJson(`db/${collection}.json`, next);
      const day = new Date(Date.now() - 8 * 3600e3).toISOString().slice(0, 10);
      await writeJson(`backup/${day}/${collection}.json`, next);
      return send(res, 200, { ok: true, count: next.length });
    }
    return send(res, 405, { error: 'method' });
  } catch (e) {
    return send(res, 500, { error: 'storage', detail: String(e?.message || e).slice(0, 200) });
  }
}
