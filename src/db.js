// Base de datos SQLite (módulo nativo de Node, sin dependencias externas).
// Todas las consultas usan parámetros preparados: nunca se concatena input del usuario en SQL.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

export const DATA_DIR = path.resolve(process.env.DATA_DIR || './data');
export const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

export const db = new DatabaseSync(path.join(DATA_DIR, 'cardgrade.db'));
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS cards (
    id INTEGER PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    player TEXT NOT NULL DEFAULT '',
    team TEXT NOT NULL DEFAULT '',
    brand TEXT NOT NULL DEFAULT '',
    serial TEXT NOT NULL DEFAULT '',
    kind TEXT NOT NULL DEFAULT 'raw' CHECK (kind IN ('raw','graded','sealed')),
    grade TEXT NOT NULL DEFAULT '',
    rookie INTEGER NOT NULL DEFAULT 0,
    price INTEGER NOT NULL CHECK (price > 0),
    status TEXT NOT NULL DEFAULT 'disponible' CHECK (status IN ('disponible','reservada','vendida','oculta')),
    description TEXT NOT NULL DEFAULT '',
    images TEXT NOT NULL DEFAULT '[]',
    reserved_order TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    sold_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS cards_status ON cards(status, created_at);

  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'pendiente'
      CHECK (status IN ('pendiente','pagada','enviada','entregada','cancelada','expirada','revisar')),
    buyer_name TEXT NOT NULL,
    buyer_email TEXT NOT NULL,
    buyer_phone TEXT NOT NULL,
    delivery TEXT NOT NULL CHECK (delivery IN ('retiro','envio')),
    address TEXT NOT NULL DEFAULT '',
    shipping INTEGER NOT NULL DEFAULT 0,
    total INTEGER NOT NULL,
    mp_preference_id TEXT,
    mp_payment_id TEXT,
    note TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    paid_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS order_items (
    order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    card_id INTEGER NOT NULL REFERENCES cards(id),
    title TEXT NOT NULL,
    price INTEGER NOT NULL,
    PRIMARY KEY (order_id, card_id)
  );

  CREATE TABLE IF NOT EXISTS offers (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    phone TEXT NOT NULL,
    cards_desc TEXT NOT NULL,
    asking_price TEXT NOT NULL DEFAULT '',
    images TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'nueva' CHECK (status IN ('nueva','contactado','aceptada','rechazada')),
    admin_note TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    failed_logins INTEGER NOT NULL DEFAULT 0,
    locked_until INTEGER NOT NULL DEFAULT 0,
    last_login INTEGER
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id_hash TEXT PRIMARY KEY,
    data TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY,
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT '',
    ip TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL
  );
`);

// Migraciones simples
try { db.exec('ALTER TABLE cards ADD COLUMN external_ref TEXT'); } catch {}

const DEFAULT_SETTINGS = {
  store_name: 'Card Grade Uy',
  tagline: 'A card. A life!',
  whatsapp: '59892746567',
  instagram: 'cardgradeuy',
  shipping_cost: '200',
  pickup_info: 'Retiro coordinado en Montevideo.',
};
const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) insertSetting.run(k, v);

export function getSettings() {
  const out = {};
  for (const row of db.prepare('SELECT key, value FROM settings').all()) out[row.key] = row.value;
  return out;
}

export function setSetting(key, value) {
  if (!(key in DEFAULT_SETTINGS)) throw new Error('Ajuste desconocido');
  db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(value, key);
}

export function audit(actor, action, detail = '', ip = '') {
  db.prepare('INSERT INTO audit_log (actor, action, detail, ip, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(actor, action, detail, ip, Date.now());
}

export function tx(fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export function parseImages(row) {
  try {
    const list = JSON.parse(row.images || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function slugify(text) {
  return String(text)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'carta';
}

export function uniqueSlug(base, exceptId = 0) {
  let slug = slugify(base);
  let n = 2;
  const check = db.prepare('SELECT id FROM cards WHERE slug = ? AND id != ?');
  while (check.get(slug, exceptId)) slug = `${slugify(base)}-${n++}`;
  return slug;
}

// Libera reservas de pedidos que no se pagaron a tiempo.
export function expireOrders() {
  const now = Date.now();
  const expired = db.prepare("SELECT id FROM orders WHERE status = 'pendiente' AND expires_at < ?").all(now);
  for (const { id } of expired) {
    tx(() => {
      db.prepare("UPDATE orders SET status = 'expirada' WHERE id = ? AND status = 'pendiente'").run(id);
      db.prepare("UPDATE cards SET status = 'disponible', reserved_order = NULL, updated_at = ? WHERE reserved_order = ? AND status = 'reservada'")
        .run(now, id);
    });
  }
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now);
}
