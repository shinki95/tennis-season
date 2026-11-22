// 구글 로그인 (서버 코드 흐름). 허용 이메일(ALLOWED_EMAILS)만 들어온다.
// GET ?me=1 -> {authed,email} | ?start=1 -> 구글로 | ?code=&state= -> 콜백 | ?logout=1
import crypto from 'node:crypto';
import { send, sign, safeEq, makeSessionCookie, clearSessionCookie, sessionEmail, isAuthed } from './_lib.js';

const BASE = 'https://tennis-season.vercel.app';
const REDIRECT = `${BASE}/api/auth`;
const ST = 'ts_oauth';
const go = (res, loc, cookies = []) => { res.statusCode = 302; if (cookies.length) res.setHeader('set-cookie', cookies); res.setHeader('location', loc); res.end(); };
const cookieVal = (req, name) => { const r = (req.headers.cookie || '').split(';').map((s) => s.trim()).find((s) => s.startsWith(name + '=')); return r ? r.slice(name.length + 1) : null; };

async function verifyIdToken(idToken, nonce) {
  const [h, p, s] = String(idToken).split('.');
  const header = JSON.parse(Buffer.from(h, 'base64url')); const payload = JSON.parse(Buffer.from(p, 'base64url'));
  if (header.alg !== 'RS256') throw new Error('alg');
  const jwks = await (await fetch('https://www.googleapis.com/oauth2/v3/certs')).json();
  const jwk = (jwks.keys || []).find((k) => k.kid === header.kid); if (!jwk) throw new Error('kid');
  const ok = crypto.verify('RSA-SHA256', Buffer.from(`${h}.${p}`), crypto.createPublicKey({ key: jwk, format: 'jwk' }), Buffer.from(s, 'base64url'));
  if (!ok) throw new Error('sig');
  if (!['accounts.google.com', 'https://accounts.google.com'].includes(payload.iss)) throw new Error('iss');
  if (payload.aud !== process.env.GOOGLE_OAUTH_CLIENT_ID) throw new Error('aud');
  if (payload.exp < Date.now() / 1000 - 30) throw new Error('exp');
  if (payload.nonce !== nonce) throw new Error('nonce');
  if (payload.email_verified !== true) throw new Error('email');
  return { email: String(payload.email).toLowerCase(), name: payload.name || '' };
}

export default async function handler(req, res) {
  const url = new URL(req.url, BASE);
  const q = url.searchParams;
  if (q.get('me')) { const who = isAuthed(req); return send(res, 200, { authed: !!who, email: who === 'owner' ? sessionEmail(req) : who }); }
  if (q.get('logout')) return go(res, '/', [clearSessionCookie()]);
  if (q.get('start')) {
    const state = crypto.randomBytes(16).toString('base64url'), nonce = crypto.randomBytes(16).toString('base64url');
    const exp = Date.now() + 600e3; const v = `${state}.${nonce}.${exp}`;
    const a = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    a.search = new URLSearchParams({ client_id: process.env.GOOGLE_OAUTH_CLIENT_ID, redirect_uri: REDIRECT, response_type: 'code', scope: 'openid email profile', state, nonce, prompt: 'select_account' }).toString();
    return go(res, a.toString(), [`${ST}=${v}.${sign(v)}; Path=/api/auth; HttpOnly; Secure; SameSite=Lax; Max-Age=600`]);
  }
  if (q.get('code')) {
    const fail = (why) => go(res, `/?login=${why}`, [`${ST}=; Path=/api/auth; Max-Age=0`]);
    try {
      const raw = cookieVal(req, ST); if (!raw) return fail('state');
      const [state, nonce, exp, sig] = raw.split('.');
      if (!safeEq(sig, sign(`${state}.${nonce}.${exp}`)) || Number(exp) < Date.now() || state !== q.get('state')) return fail('state');
      const body = new URLSearchParams({ code: q.get('code'), grant_type: 'authorization_code', redirect_uri: REDIRECT, client_id: process.env.GOOGLE_OAUTH_CLIENT_ID, client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET });
      const t = await (await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body })).json();
      if (!t.id_token) return fail('token');
      const me = await verifyIdToken(t.id_token, nonce);
      const allowed = String(process.env.ALLOWED_EMAILS || '').toLowerCase().split(',').map((x) => x.trim()).filter(Boolean);
      if (!allowed.includes(me.email)) return fail('notallowed');
      return go(res, '/', [makeSessionCookie(Buffer.from(me.email).toString('base64url')), `${ST}=; Path=/api/auth; Max-Age=0`]);
    } catch (e) { return fail('error'); }
  }
  return send(res, 400, { error: 'bad request' });
}
