// Sesiones en servidor, protección CSRF y autenticación del panel.
import crypto from 'node:crypto';
import { db } from './db.js';

const COOKIE = 'cg_sid';
const PUBLIC_TTL = 7 * 24 * 60 * 60 * 1000; // 7 días (carrito)
const ADMIN_TTL = 8 * 60 * 60 * 1000;       // 8 horas para el panel

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');

function readCookie(header, name) {
  if (!header) return null;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

// En la base sólo se guarda el hash del id de sesión: una filtración de la base no permite robar sesiones.
export function sessions({ secure }) {
  const getRow = db.prepare('SELECT data, expires_at FROM sessions WHERE id_hash = ?');
  const upsert = db.prepare(`INSERT INTO sessions (id_hash, data, expires_at) VALUES (?, ?, ?)
    ON CONFLICT(id_hash) DO UPDATE SET data = excluded.data, expires_at = excluded.expires_at`);
  const remove = db.prepare('DELETE FROM sessions WHERE id_hash = ?');

  return (req, res, next) => {
    let sid = readCookie(req.headers.cookie, COOKIE);
    if (sid && !/^[A-Za-z0-9_-]{43}$/.test(sid)) sid = null;
    let row = sid ? getRow.get(sha256(sid)) : null;
    if (!row || row.expires_at < Date.now()) {
      if (sid) remove.run(sha256(sid));
      sid = null;
      row = null;
    }
    req.session = row ? JSON.parse(row.data) : {};
    let destroyed = false;

    // Nuevo id tras login/logout para evitar fijación de sesión.
    req.regenerateSession = (data = {}) => {
      if (sid) remove.run(sha256(sid));
      sid = null;
      req.session = data;
    };
    req.destroySession = () => {
      if (sid) remove.run(sha256(sid));
      sid = null;
      req.session = {};
      destroyed = true;
    };

    const cookieOpts = (maxAge) =>
      `${COOKIE}=${sid}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(maxAge / 1000)}${secure ? '; Secure' : ''}`;

    const writeHead = res.writeHead;
    let committed = false;
    res.writeHead = function (...args) {
      if (!committed) {
        committed = true;
        if (destroyed && !Object.keys(req.session).length) {
          res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`);
        } else if (Object.keys(req.session).length) {
          const ttl = req.session.adminId ? ADMIN_TTL : PUBLIC_TTL;
          if (!sid) sid = randomToken();
          upsert.run(sha256(sid), JSON.stringify(req.session), Date.now() + ttl);
          res.setHeader('Set-Cookie', cookieOpts(ttl));
        }
      }
      return writeHead.apply(this, args);
    };
    next();
  };
}

export function csrfToken(req) {
  if (!req.session.csrf) req.session.csrf = randomToken();
  return req.session.csrf;
}

// Se ejecuta después de parsear el body (urlencoded o multipart).
export function verifyCsrf(req, res, next) {
  const sent = String(req.body?._csrf || req.get('x-csrf-token') || '');
  const expected = req.session.csrf || '';
  const ok = sent.length === expected.length && expected.length > 0 &&
    crypto.timingSafeEqual(Buffer.from(sent), Buffer.from(expected));
  if (!ok) return res.status(403).send('La sesión expiró o el formulario no es válido. Volvé atrás y recargá la página.');
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.session.adminId) return res.redirect('/admin/login');
  res.set('Cache-Control', 'no-store');
  next();
}

// Normaliza y limita texto de formularios.
export function clean(value, max = 200) {
  return String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);
}

export const isEmail = (s) => /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(s);
export const isPhone = (s) => /^[+\d][\d\s-]{6,19}$/.test(s);
