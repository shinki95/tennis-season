// 기기 등록: 앱이 4자리 코드를 받고, 사장님이 Slack에서 Aside에게 그 코드를 말하면 Aside가 승인한다.
// POST {action:'start'}               -> { code, nonce }          (누구나, 30분 유효)
// GET  ?nonce=...                     -> { ok:true } + 쿠키 / { ok:false }
// POST {action:'approve', code}       -> Aside(에이전트 키)만
// GET  ?me=1                          -> { authed }
import crypto from 'node:crypto';
import { isAuthed, readJson, writeJson, readBody, send, makeSessionCookie } from './_lib.js';

const PATH = 'pair/pending.json';
const TTL = 30 * 60e3;

export default async function handler(req, res) {
  try {
    const url = new URL(req.url, 'http://x');
    if (req.method === 'GET' && url.searchParams.get('me')) return send(res, 200, { authed: !!isAuthed(req) });
    const now = Date.now();
    let list = (await readJson(PATH, [])).filter((p) => now - p.at < TTL);
    if (req.method === 'POST') {
      const b = await readBody(req);
      if (b.action === 'start') {
        if (list.filter((p) => !p.approved).length >= 8) return send(res, 429, { error: 'too many' });
        let code; do { code = String(crypto.randomInt(1000, 10000)); } while (list.some((p) => p.code === code));
        const nonce = crypto.randomBytes(18).toString('base64url');
        list.push({ code, nonce, at: now, approved: false, ua: String(req.headers['user-agent'] || '').slice(0, 80) });
        await writeJson(PATH, list);
        return send(res, 200, { code, nonce });
      }
      if (b.action === 'approve') {
        if (isAuthed(req) !== 'agent') return send(res, 403, { error: 'agent only' });
        const p = list.find((x) => x.code === String(b.code));
        if (!p) return send(res, 404, { error: 'no such code (30분 지남?)' });
        p.approved = true; await writeJson(PATH, list);
        return send(res, 200, { ok: true, ua: p.ua });
      }
      return send(res, 400, { error: 'action' });
    }
    if (req.method === 'GET') {
      const nonce = url.searchParams.get('nonce') || '';
      const p = list.find((x) => x.nonce === nonce);
      if (!p) return send(res, 404, { ok: false, error: 'expired' });
      if (!p.approved) return send(res, 200, { ok: false, code: p.code });
      list = list.filter((x) => x !== p); await writeJson(PATH, list);
      return send(res, 200, { ok: true }, { 'set-cookie': makeSessionCookie(crypto.randomBytes(9).toString('base64url')) });
    }
    return send(res, 405, { error: 'method' });
  } catch (e) {
    return send(res, 500, { error: 'storage', detail: String(e?.message || e).slice(0, 200) });
  }
}
