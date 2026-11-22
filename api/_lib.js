// 공용: 인증(기기 쿠키 또는 Aside 에이전트 키) + 비공개 Vercel Blob 위 작은 JSON DB.
// 원칙(2026-10-30 케이터링 사고 교훈): 읽기가 실패하면 절대 쓰지 않는다. 쓰기는 레코드 단위 병합.
import crypto from 'node:crypto';
import { put, get } from '@vercel/blob';

export const COLLECTIONS = ['logs', 'factors', 'events', 'settings', 'todos', 'notes'];
const COOKIE = 'ts_s';
const DAYS = 400;

export const sign = (v) => crypto.createHmac('sha256', process.env.SESSION_SECRET || 'dev').update(v).digest('hex');

export function makeSessionCookie(dev) {
  const exp = Date.now() + DAYS * 864e5;
  const v = `${exp}.${dev}`;
  return `${COOKIE}=${v}.${sign(v)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${DAYS * 86400}`;
}

export function safeEq(a, b) {
  const x = Buffer.from(String(a)); const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

export function isAuthed(req) {
  const key = req.headers['x-agent-key'];
  if (key && process.env.AGENT_KEY && safeEq(key, process.env.AGENT_KEY)) return 'agent';
  const raw = (req.headers.cookie || '').split(';').map((s) => s.trim()).find((s) => s.startsWith(COOKIE + '='));
  if (!raw) return null;
  const parts = raw.slice(COOKIE.length + 1).split('.');
  if (parts.length !== 3) return null;
  const [exp, dev, sig] = parts;
  if (Number(exp) < Date.now()) return null;
  if (!safeEq(sig, sign(`${exp}.${dev}`))) return null;
  // 구글 로그인 쿠키만 인정 (예전 기기 등록 쿠키는 이메일이 없어서 거절)
  let email = ''; try { email = Buffer.from(dev, 'base64url').toString(); } catch {}
  return /^[^@\s]+@[^@\s]+$/.test(email) ? 'owner' : null;
}

export function sessionEmail(req) {
  if (isAuthed(req) !== 'owner') return null;
  const raw = (req.headers.cookie || '').split(';').map((s) => s.trim()).find((s) => s.startsWith(COOKIE + '='));
  try { return Buffer.from(raw.slice(COOKIE.length + 1).split('.')[1], 'base64url').toString(); } catch { return null; }
}
export const clearSessionCookie = () => `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

export async function readJson(path, fallback) {
  try {
    const r = await get(path, { access: 'private', useCache: false });
    if (!r || !r.stream) return fallback;
    return JSON.parse(await new Response(r.stream).text());
  } catch (e) {
    if (String(e?.message || e).match(/not.?found|404/i)) return fallback;
    throw e; // 읽기 실패: 호출한 쪽이 500으로 끝내고 아무것도 쓰지 않는다
  }
}

export async function writeJson(path, data) {
  await put(path, JSON.stringify(data), {
    access: 'private', addRandomSuffix: false, allowOverwrite: true, contentType: 'application/json',
  });
}

export async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const chunks = []; for await (const c of req) chunks.push(c);
  const s = Buffer.concat(chunks).toString('utf8');
  return s ? JSON.parse(s) : {};
}

export function send(res, status, obj, headers = {}) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(JSON.stringify(obj));
}
