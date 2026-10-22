import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  db, tx, audit, getSettings, setSetting, parseImages, uniqueSlug, expireOrders, UPLOAD_DIR,
} from './db.js';
import { sessions, csrfToken, verifyCsrf, requireAdmin, clean, isEmail, isPhone } from './security.js';
import { upload, saveImages, deleteImage } from './uploads.js';
import { mpEnabled, createPreference, getPayment, verifyWebhookSignature } from './mercadopago.js';
import * as v from './views.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PROD = process.env.NODE_ENV === 'production';
const PORT = Number(process.env.PORT) || 3000;
const BASE_URL = (process.env.BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const DEMO = !PROD && !mpEnabled() && process.env.DEMO_PAYMENTS === '1';
const RESERVATION_MS = 30 * 60 * 1000;
const PAGE_SIZE = 24;

if (PROD && (!mpEnabled() || !process.env.MP_WEBHOOK_SECRET || !BASE_URL.startsWith('https://'))) {
  console.error('En producción se requieren MP_ACCESS_TOKEN, MP_WEBHOOK_SECRET y BASE_URL con https.');
  process.exit(1);
}

const app = express();
app.disable('x-powered-by');
if (PROD) app.set('trust proxy', 1); // detrás de un proxy/CDN con HTTPS

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'blob:'],
      formAction: ["'self'", 'https://www.mercadopago.com.uy', 'https://www.mercadopago.com'],
      frameAncestors: ["'none'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      upgradeInsecureRequests: PROD ? [] : null,
    },
  },
  strictTransportSecurity: PROD ? { maxAge: 31536000, includeSubDomains: true } : false,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));
app.use((req, res, next) => {
  res.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  next();
});

app.use('/static', express.static(path.join(ROOT, '..', 'public'), { maxAge: PROD ? '7d' : 0 }));
app.use('/uploads', express.static(UPLOAD_DIR, {
  maxAge: '30d', index: false, dotfiles: 'deny',
  setHeaders: (res) => res.set('Content-Security-Policy', "default-src 'none'; img-src 'self'"),
}));
app.get('/robots.txt', (req, res) => res.type('text/plain').send('User-agent: *\nDisallow: /admin\nDisallow: /checkout\nDisallow: /pago\n'));

app.use(rateLimit({ windowMs: 60_000, limit: 300, standardHeaders: 'draft-7', legacyHeaders: false }));

/* ---------- Webhook de Mercado Pago (antes de sesiones/CSRF) ---------- */

app.post('/webhooks/mercadopago', express.json({ limit: '50kb' }), async (req, res) => {
  if (!verifyWebhookSignature(req)) return res.sendStatus(401);
  const type = req.query.type || req.body?.type;
  const paymentId = String(req.query['data.id'] || req.body?.data?.id || '');
  res.sendStatus(200); // responder rápido; el procesamiento es idempotente
  if (type !== 'payment' || !/^\d+$/.test(paymentId)) return;
  try {
    const payment = await getPayment(paymentId);
    applyPayment(payment);
  } catch (err) {
    console.error('Webhook MP:', err.message, err.details || '');
  }
});

// Confirma un pago verificado contra la API de MP. Idempotente.
function applyPayment(payment) {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(String(payment.external_reference || ''));
  if (!order) return;
  if (payment.status === 'approved') {
    if (['pagada', 'enviada', 'entregada'].includes(order.status) && order.mp_payment_id === String(payment.id)) return;
    const items = db.prepare('SELECT card_id FROM order_items WHERE order_id = ?').all(order.id);
    const amountOk = payment.currency_id === 'UYU' && Math.round(payment.transaction_amount) === order.total;
    tx(() => {
      const now = Date.now();
      const cardsOk = items.every(({ card_id }) => {
        const c = db.prepare('SELECT status, reserved_order FROM cards WHERE id = ?').get(card_id);
        return c && (c.status === 'disponible' || (c.status === 'reservada' && c.reserved_order === order.id));
      });
      const status = amountOk && cardsOk ? 'pagada' : 'revisar';
      db.prepare('UPDATE orders SET status = ?, mp_payment_id = ?, paid_at = ? WHERE id = ?').run(status, String(payment.id), now, order.id);
      if (status === 'pagada') {
        for (const { card_id } of items) {
          db.prepare("UPDATE cards SET status = 'vendida', reserved_order = NULL, sold_at = ?, updated_at = ? WHERE id = ?").run(now, now, card_id);
        }
      }
    });
    audit('mercadopago', 'pago_aprobado', `${order.id} pago ${payment.id}`);
  } else if (['rejected', 'cancelled', 'refunded', 'charged_back'].includes(payment.status) && order.status === 'pendiente') {
    tx(() => {
      db.prepare("UPDATE orders SET status = 'cancelada', mp_payment_id = ? WHERE id = ?").run(String(payment.id), order.id);
      db.prepare("UPDATE cards SET status = 'disponible', reserved_order = NULL, updated_at = ? WHERE reserved_order = ? AND status = 'reservada'").run(Date.now(), order.id);
    });
  }
}

/* ---------- Sesión, CSRF y contexto ---------- */

app.use(sessions({ secure: PROD }));
app.use(express.urlencoded({ extended: false, limit: '30kb', parameterLimit: 50 }));
app.use((req, res, next) => {
  const cart = Array.isArray(req.session.cart) ? req.session.cart : [];
  const flash = req.session.flash;
  if (flash) delete req.session.flash;
  const ticker = db.prepare("SELECT title, price FROM cards WHERE status = 'disponible' ORDER BY created_at DESC LIMIT 10").all();
  res.locals.ctx = { settings: getSettings(), cartCount: cart.length, csrf: csrfToken(req), flash, path: req.path, isAdmin: Boolean(req.session.adminId), ticker };
  next();
});
// Las rutas con fotos verifican CSRF después de multer (ver cada ruta); el resto, acá.
const MULTIPART_ROUTES = [/^\/vender$/, /^\/admin\/cartas\/(nueva|\d+)$/];
app.use((req, res, next) => {
  if (req.method !== 'POST') return next();
  if (req.is('multipart/form-data') && MULTIPART_ROUTES.some((r) => r.test(req.path))) return next();
  verifyCsrf(req, res, next);
});

const send = (res, page) => res.send(String(page));
const flash = (req, type, msg) => { req.session.flash = { type, msg }; };

/* ---------- Catálogo ---------- */

app.get('/', (req, res) => {
  const q = {
    q: clean(req.query.q, 80),
    estado: ['disponible', 'reservada', 'vendida'].includes(req.query.estado) ? req.query.estado : '',
    tipo: ['raw', 'graded', 'sealed'].includes(req.query.tipo) ? req.query.tipo : '',
    equipo: clean(req.query.equipo, 60),
    orden: ['precio-asc', 'precio-desc'].includes(req.query.orden) ? req.query.orden : '',
    rookie: req.query.rookie === '1' ? '1' : '',
    numerada: req.query.numerada === '1' ? '1' : '',
  };
  const where = ["status != 'oculta'"];
  const params = [];
  if (q.q) {
    where.push("(title LIKE ? ESCAPE '\\' OR player LIKE ? ESCAPE '\\' OR team LIKE ? ESCAPE '\\' OR brand LIKE ? ESCAPE '\\')");
    const like = `%${q.q.replace(/[\\%_]/g, (c) => '\\' + c)}%`;
    params.push(like, like, like, like);
  }
  if (q.estado) { where.push('status = ?'); params.push(q.estado); }
  if (q.tipo) { where.push('kind = ?'); params.push(q.tipo); }
  if (q.equipo) { where.push('team = ?'); params.push(q.equipo); }
  if (q.rookie) where.push('rookie = 1');
  if (q.numerada) where.push("serial != ''");
  const order = { 'precio-asc': 'price ASC', 'precio-desc': 'price DESC' }[q.orden] ||
    "CASE status WHEN 'disponible' THEN 0 WHEN 'reservada' THEN 1 ELSE 2 END, created_at DESC";
  const whereSql = where.join(' AND ');
  const total = db.prepare(`SELECT COUNT(*) n FROM cards WHERE ${whereSql}`).get(...params).n;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, parseInt(req.query.page, 10) || 1));
  const cards = db.prepare(`SELECT * FROM cards WHERE ${whereSql} ORDER BY ${order} LIMIT ? OFFSET ?`)
    .all(...params, PAGE_SIZE, (page - 1) * PAGE_SIZE);

  const counts = db.prepare("SELECT SUM(status='disponible') disponibles, SUM(status='vendida') vendidas, COUNT(*) total FROM cards WHERE status != 'oculta'").get();
  const featured = db.prepare("SELECT * FROM cards WHERE status = 'disponible' ORDER BY (images != '[]') DESC, price DESC LIMIT 3").all();
  const teams = db.prepare("SELECT DISTINCT team FROM cards WHERE team != '' AND status != 'oculta' ORDER BY team").all().map((r) => r.team);
  const tabCounts = db.prepare(`SELECT COUNT(*) todas, SUM(status = 'disponible') disponibles, SUM(team = 'Uruguay') uruguay,
    SUM(team = 'River Plate') river, SUM(team = 'Boca Juniors') boca, SUM(rookie = 1) rookies, SUM(serial != '') numeradas
    FROM cards WHERE status != 'oculta'`).get();
  send(res, v.catalogPage(res.locals.ctx, {
    cards, q, teams, page, pages, counts: tabCounts, offset: (page - 1) * PAGE_SIZE,
    stats: { disponibles: counts.disponibles || 0, vendidas: counts.vendidas || 0, total: counts.total || 0, featured },
  }));
});

app.get('/carta/:slug', (req, res, next) => {
  const card = db.prepare("SELECT * FROM cards WHERE slug = ? AND status != 'oculta'").get(String(req.params.slug));
  if (!card) return next();
  const related = db.prepare("SELECT * FROM cards WHERE status = 'disponible' AND id != ? ORDER BY (team = ?) DESC, created_at DESC LIMIT 4").all(card.id, card.team);
  send(res, v.cardPage(res.locals.ctx, { card, related }));
});

app.get('/guia', (req, res) => send(res, v.guidePage(res.locals.ctx)));

/* ---------- Carrito y checkout ---------- */

function cartCards(req) {
  const ids = (req.session.cart || []).filter(Number.isInteger);
  if (!ids.length) return [];
  return db.prepare(`SELECT * FROM cards WHERE id IN (${ids.map(() => '?').join(',')})`).all(...ids);
}

app.post('/carrito/agregar', (req, res) => {
  const id = parseInt(req.body.card_id, 10);
  const card = db.prepare("SELECT id, slug, status FROM cards WHERE id = ?").get(id);
  if (!card) return res.redirect('/');
  if (card.status !== 'disponible') {
    flash(req, 'error', 'Esa carta ya no está disponible.');
    return res.redirect(`/carta/${card.slug}`);
  }
  const cart = Array.isArray(req.session.cart) ? req.session.cart : [];
  if (!cart.includes(id) && cart.length < 30) cart.push(id);
  req.session.cart = cart;
  if (req.body.comprar === '1') return res.redirect('/checkout');
  flash(req, 'ok', 'Agregada al carrito.');
  res.redirect(`/carta/${card.slug}`);
});

app.post('/carrito/quitar', (req, res) => {
  const id = parseInt(req.body.card_id, 10);
  req.session.cart = (req.session.cart || []).filter((x) => x !== id);
  res.redirect('/carrito');
});

app.get('/carrito', (req, res) => {
  const all = cartCards(req);
  const items = all.filter((c) => c.status === 'disponible');
  if (items.length !== all.length) {
    req.session.cart = items.map((c) => c.id);
    res.locals.ctx.cartCount = items.length;
    res.locals.ctx.flash = { type: 'error', msg: 'Quitamos del carrito cartas que ya no están disponibles.' };
  }
  send(res, v.cartPage(res.locals.ctx, { items, subtotal: items.reduce((s, c) => s + c.price, 0) }));
});

app.get('/checkout', (req, res) => {
  const items = cartCards(req).filter((c) => c.status === 'disponible');
  if (!items.length) return res.redirect('/carrito');
  send(res, v.checkoutPage(res.locals.ctx, { items, subtotal: items.reduce((s, c) => s + c.price, 0), form: req.session.buyer || {} }));
});

const checkoutLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 15, standardHeaders: 'draft-7', legacyHeaders: false });

app.post('/checkout', checkoutLimiter, async (req, res, next) => {
  const form = {
    name: clean(req.body.name, 80), email: clean(req.body.email, 120).toLowerCase(), phone: clean(req.body.phone, 20),
    delivery: req.body.delivery === 'retiro' ? 'retiro' : 'envio', address: clean(req.body.address, 300),
  };
  const errors = [];
  if (form.name.length < 3) errors.push('Ingresá tu nombre.');
  if (!isEmail(form.email)) errors.push('El email no es válido.');
  if (!isPhone(form.phone)) errors.push('El celular no es válido.');
  if (form.delivery === 'envio' && form.address.length < 6) errors.push('Ingresá la dirección de envío.');

  const ids = (req.session.cart || []).filter(Number.isInteger);
  if (!ids.length) return res.redirect('/carrito');
  if (errors.length) {
    const items = cartCards(req).filter((c) => c.status === 'disponible');
    return send(res.status(400), v.checkoutPage(res.locals.ctx, { items, subtotal: items.reduce((s, c) => s + c.price, 0), form, errors }));
  }
  req.session.buyer = { name: form.name, email: form.email, phone: form.phone, address: form.address, delivery: form.delivery };

  // Reserva atómica: si alguna carta ya no está disponible, no se reserva ninguna.
  const shipping = form.delivery === 'envio' ? Math.max(0, parseInt(getSettings().shipping_cost, 10) || 0) : 0;
  const now = Date.now();
  const order = { id: crypto.randomUUID(), ...form, buyer_name: form.name, buyer_email: form.email, shipping, expires_at: now + RESERVATION_MS };
  let items;
  try {
    items = tx(() => {
      const cards = ids.map((id) => db.prepare('SELECT id, title, price, status FROM cards WHERE id = ?').get(id));
      if (cards.some((c) => !c || c.status !== 'disponible')) return null;
      order.total = cards.reduce((s, c) => s + c.price, 0) + shipping;
      db.prepare(`INSERT INTO orders (id, buyer_name, buyer_email, buyer_phone, delivery, address, shipping, total, created_at, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(order.id, form.name, form.email, form.phone, form.delivery, form.address, shipping, order.total, now, order.expires_at);
      for (const c of cards) {
        db.prepare('INSERT INTO order_items (order_id, card_id, title, price) VALUES (?, ?, ?, ?)').run(order.id, c.id, c.title, c.price);
        db.prepare("UPDATE cards SET status = 'reservada', reserved_order = ?, updated_at = ? WHERE id = ?").run(order.id, now, c.id);
      }
      return cards.map((c) => ({ card_id: c.id, title: c.title, price: c.price }));
    });
  } catch (err) { return next(err); }
  if (!items) {
    flash(req, 'error', 'Alguien se adelantó: una de las cartas ya no está disponible.');
    return res.redirect('/carrito');
  }
  req.session.cart = [];
  req.session.orders = [...(req.session.orders || []), order.id].slice(-10);

  if (DEMO) return res.redirect(`/pago/demo/${order.id}`);
  try {
    const pref = await createPreference(order, items, BASE_URL);
    db.prepare('UPDATE orders SET mp_preference_id = ? WHERE id = ?').run(pref.id, order.id);
    res.redirect(303, pref.url);
  } catch (err) {
    console.error('Preferencia MP:', err.message, err.details || '');
    tx(() => {
      db.prepare("UPDATE orders SET status = 'cancelada' WHERE id = ?").run(order.id);
      db.prepare("UPDATE cards SET status = 'disponible', reserved_order = NULL WHERE reserved_order = ?").run(order.id);
    });
    req.session.cart = ids;
    flash(req, 'error', 'No pudimos conectar con Mercado Pago. Probá de nuevo en unos minutos.');
    res.redirect('/carrito');
  }
});

app.get('/pago/resultado', async (req, res, next) => {
  const id = String(req.query.pedido || '');
  // Sólo quien creó el pedido (misma sesión) puede ver su detalle.
  if (!(req.session.orders || []).includes(id)) return next();
  // Si MP volvió con payment_id, se verifica contra la API (por si el webhook todavía no llegó).
  const paymentId = String(req.query.payment_id || '');
  if (mpEnabled() && /^\d+$/.test(paymentId)) {
    try {
      const payment = await getPayment(paymentId);
      if (String(payment.external_reference) === id) applyPayment(payment);
    } catch (err) { console.error('Consulta pago MP:', err.message); }
  }
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  if (!order) return next();
  const items = db.prepare('SELECT title, price FROM order_items WHERE order_id = ?').all(id);
  res.set('Cache-Control', 'no-store');
  send(res, v.resultPage(res.locals.ctx, { order, items, demo: DEMO }));
});

if (DEMO) {
  // Simulación del paso de Mercado Pago para probar el flujo sin credenciales (nunca en producción).
  app.get('/pago/demo/:id', (req, res, next) => {
    const id = req.params.id;
    if (!(req.session.orders || []).includes(id)) return next();
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
    if (!order) return next();
    if (order.status !== 'pendiente') return res.redirect(`/pago/resultado?pedido=${id}`);
    const items = db.prepare('SELECT title, price FROM order_items WHERE order_id = ?').all(id);
    send(res, v.mpDemoPage(res.locals.ctx, { order, items, action: `/pago/demo/${id}` }));
  });
  app.post('/pago/demo/:id', (req, res, next) => {
    const id = req.params.id;
    if (!(req.session.orders || []).includes(id)) return next();
    const order = db.prepare('SELECT total, status FROM orders WHERE id = ?').get(id);
    if (!order) return next();
    const status = { approved: 'approved', rejected: 'rejected' }[req.body.result];
    if (status && order.status === 'pendiente') {
      applyPayment({ id: `demo-${Date.now()}`, external_reference: id, status, currency_id: 'UYU', transaction_amount: order.total });
    }
    res.redirect(`/pago/resultado?pedido=${id}`);
  });
}

/* ---------- Vendeme tus cartas ---------- */

const offerLimiter = rateLimit({ windowMs: 60 * 60_000, limit: 5, standardHeaders: 'draft-7', legacyHeaders: false,
  handler: (req, res) => res.status(429).send('Recibimos varias ofertas desde tu conexión. Probá más tarde o escribinos por WhatsApp.') });

app.get('/vender', (req, res) => send(res, v.sellPage(res.locals.ctx, { sent: req.query.enviado === '1' })));

app.post('/vender', offerLimiter, upload(6).array('photos', 6), verifyCsrf, (req, res) => {
  if (req.body.website) return res.redirect('/vender?enviado=1'); // honeypot anti-bots
  const form = {
    name: clean(req.body.name, 80), email: clean(req.body.email, 120).toLowerCase(), phone: clean(req.body.phone, 20),
    cards_desc: clean(req.body.cards_desc, 2000), asking_price: clean(req.body.asking_price, 60),
  };
  const errors = [];
  if (form.name.length < 2) errors.push('Ingresá tu nombre.');
  if (!isEmail(form.email)) errors.push('El email no es válido.');
  if (!isPhone(form.phone)) errors.push('El celular no es válido.');
  if (form.cards_desc.length < 5) errors.push('Contanos qué cartas querés vender.');
  if (errors.length) return send(res.status(400), v.sellPage(res.locals.ctx, { form, errors }));
  const images = saveImages(req.files);
  db.prepare('INSERT INTO offers (name, email, phone, cards_desc, asking_price, images, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(form.name, form.email, form.phone, form.cards_desc, form.asking_price, JSON.stringify(images), Date.now());
  res.redirect('/vender?enviado=1');
});

/* ---------- Panel de administración ---------- */

const loginLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 10, standardHeaders: 'draft-7', legacyHeaders: false,
  handler: (req, res) => send(res.status(429), v.loginPage(res.locals.ctx, { error: 'Demasiados intentos. Esperá 15 minutos.' })) });
const DUMMY_HASH = bcrypt.hashSync(crypto.randomBytes(16).toString('hex'), 12);

app.get('/admin/login', (req, res) => {
  if (req.session.adminId) return res.redirect('/admin');
  send(res, v.loginPage(res.locals.ctx));
});

app.post('/admin/login', loginLimiter, (req, res) => {
  const email = clean(req.body.email, 120).toLowerCase();
  const password = String(req.body.password || '').slice(0, 200);
  const admin = db.prepare('SELECT * FROM admins WHERE email = ?').get(email);
  const now = Date.now();
  // Se compara siempre (incluso si el usuario no existe) para no filtrar qué emails existen.
  const ok = bcrypt.compareSync(password, admin ? admin.password_hash : DUMMY_HASH);
  if (!admin || !ok || admin.locked_until > now) {
    if (admin && !ok) {
      const fails = admin.failed_logins + 1;
      db.prepare('UPDATE admins SET failed_logins = ?, locked_until = ? WHERE id = ?')
        .run(fails >= 5 ? 0 : fails, fails >= 5 ? now + 15 * 60_000 : admin.locked_until, admin.id);
    }
    audit(email || '?', 'login_fallido', '', req.ip);
    return send(res.status(401), v.loginPage(res.locals.ctx, { error: 'Email o contraseña incorrectos.' }));
  }
  db.prepare('UPDATE admins SET failed_logins = 0, locked_until = 0, last_login = ? WHERE id = ?').run(now, admin.id);
  req.regenerateSession({ adminId: admin.id, adminEmail: admin.email });
  csrfToken(req);
  audit(admin.email, 'login', '', req.ip);
  res.redirect('/admin');
});

app.post('/admin/logout', (req, res) => {
  req.destroySession();
  res.redirect('/');
});

const admin = express.Router();
admin.use(requireAdmin);
const actor = (req) => req.session.adminEmail;

admin.get('/', (req, res) => {
  const since = Date.now() - 30 * 86400_000;
  const stats = {
    disponibles: db.prepare("SELECT COUNT(*) n FROM cards WHERE status = 'disponible'").get().n,
    vendidas30: db.prepare("SELECT COUNT(*) n FROM cards WHERE status = 'vendida' AND sold_at > ?").get(since).n,
    ingresos30: db.prepare("SELECT COALESCE(SUM(total),0) n FROM orders WHERE status IN ('pagada','enviada','entregada') AND paid_at > ?").get(since).n,
    ofertasNuevas: db.prepare("SELECT COUNT(*) n FROM offers WHERE status = 'nueva'").get().n,
  };
  const recentOrders = db.prepare("SELECT * FROM orders WHERE status != 'expirada' ORDER BY created_at DESC LIMIT 8").all();
  const newOffers = db.prepare("SELECT * FROM offers WHERE status = 'nueva' ORDER BY created_at DESC LIMIT 8").all();
  send(res, v.adminDashboard(res.locals.ctx, { stats, recentOrders, newOffers }));
});

admin.get('/cartas', (req, res) => {
  send(res, v.adminCards(res.locals.ctx, { cards: db.prepare('SELECT * FROM cards ORDER BY created_at DESC').all() }));
});

function readCardForm(body) {
  const card = {
    title: clean(body.title, 120), player: clean(body.player, 80), team: clean(body.team, 60), brand: clean(body.brand, 60),
    serial: clean(body.serial, 20), kind: ['raw', 'graded', 'sealed'].includes(body.kind) ? body.kind : 'raw',
    grade: clean(body.grade, 20), rookie: body.rookie === '1' ? 1 : 0, price: parseInt(body.price, 10),
    status: ['disponible', 'reservada', 'vendida', 'oculta'].includes(body.status) ? body.status : 'disponible',
    description: clean(body.description, 2000),
  };
  const errors = [];
  if (card.title.length < 3) errors.push('El título es obligatorio.');
  if (!Number.isInteger(card.price) || card.price < 1 || card.price > 10_000_000) errors.push('El precio no es válido.');
  return { card, errors };
}

admin.get('/cartas/nueva', (req, res) => send(res, v.adminCardForm(res.locals.ctx, {})));

admin.post('/cartas/nueva', upload(6).array('photos', 6), verifyCsrf, (req, res) => {
  const { card, errors } = readCardForm(req.body);
  if (errors.length) return send(res.status(400), v.adminCardForm(res.locals.ctx, { card, errors }));
  const images = saveImages(req.files);
  const now = Date.now();
  const r = db.prepare(`INSERT INTO cards (slug, title, player, team, brand, serial, kind, grade, rookie, price, status, description, images, created_at, updated_at, sold_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    uniqueSlug(card.title), card.title, card.player, card.team, card.brand, card.serial, card.kind, card.grade, card.rookie,
    card.price, card.status, card.description, JSON.stringify(images), now, now, card.status === 'vendida' ? now : null);
  audit(actor(req), 'carta_creada', `${r.lastInsertRowid} ${card.title}`, req.ip);
  flash(req, 'ok', 'Carta publicada.');
  res.redirect('/admin/cartas');
});

admin.get('/cartas/:id', (req, res, next) => {
  const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(parseInt(req.params.id, 10));
  if (!card) return next();
  send(res, v.adminCardForm(res.locals.ctx, { card }));
});

admin.post('/cartas/:id', upload(6).array('photos', 6), verifyCsrf, (req, res, next) => {
  const existing = db.prepare('SELECT * FROM cards WHERE id = ?').get(parseInt(req.params.id, 10));
  if (!existing) return next();
  const { card, errors } = readCardForm(req.body);
  if (errors.length) return send(res.status(400), v.adminCardForm(res.locals.ctx, { card: { ...existing, ...card }, errors }));
  const remove = [].concat(req.body.remove_images || []);
  const kept = parseImages(existing).filter((img) => !remove.includes(img));
  parseImages(existing).filter((img) => remove.includes(img)).forEach(deleteImage);
  const images = [...kept, ...saveImages(req.files)].slice(0, 12);
  const now = Date.now();
  db.prepare(`UPDATE cards SET slug = ?, title = ?, player = ?, team = ?, brand = ?, serial = ?, kind = ?, grade = ?, rookie = ?, price = ?,
    status = ?, description = ?, images = ?, updated_at = ?, sold_at = ?, reserved_order = CASE WHEN ? = 'reservada' THEN reserved_order ELSE NULL END WHERE id = ?`).run(
    existing.title === card.title ? existing.slug : uniqueSlug(card.title, existing.id),
    card.title, card.player, card.team, card.brand, card.serial, card.kind, card.grade, card.rookie, card.price, card.status,
    card.description, JSON.stringify(images), now, card.status === 'vendida' ? existing.sold_at || now : null, card.status, existing.id);
  audit(actor(req), 'carta_editada', `${existing.id} ${card.title}`, req.ip);
  flash(req, 'ok', 'Cambios guardados.');
  res.redirect('/admin/cartas');
});

admin.get('/pedidos', (req, res) => {
  send(res, v.adminOrders(res.locals.ctx, { orders: db.prepare('SELECT * FROM orders ORDER BY created_at DESC LIMIT 200').all() }));
});

admin.get('/pedidos/:id', (req, res, next) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(String(req.params.id));
  if (!order) return next();
  send(res, v.adminOrder(res.locals.ctx, { order, items: db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id) }));
});

admin.post('/pedidos/:id', (req, res, next) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(String(req.params.id));
  if (!order) return next();
  const allowed = { pagada: 'enviada', enviada: 'entregada' }[order.status];
  if (req.body.status === allowed) {
    db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(allowed, order.id);
    audit(actor(req), 'pedido_estado', `${order.id} → ${allowed}`, req.ip);
  }
  res.redirect(`/admin/pedidos/${order.id}`);
});

admin.get('/ofertas', (req, res) => {
  send(res, v.adminOffers(res.locals.ctx, { offers: db.prepare('SELECT * FROM offers ORDER BY created_at DESC LIMIT 200').all() }));
});

admin.get('/ofertas/:id', (req, res, next) => {
  const offer = db.prepare('SELECT * FROM offers WHERE id = ?').get(parseInt(req.params.id, 10));
  if (!offer) return next();
  send(res, v.adminOffer(res.locals.ctx, { offer }));
});

admin.post('/ofertas/:id', (req, res, next) => {
  const offer = db.prepare('SELECT id FROM offers WHERE id = ?').get(parseInt(req.params.id, 10));
  if (!offer) return next();
  const status = ['nueva', 'contactado', 'aceptada', 'rechazada'].includes(req.body.status) ? req.body.status : 'nueva';
  db.prepare('UPDATE offers SET status = ?, admin_note = ? WHERE id = ?').run(status, clean(req.body.admin_note, 1000), offer.id);
  flash(req, 'ok', 'Oferta actualizada.');
  res.redirect(`/admin/ofertas/${offer.id}`);
});

admin.get('/ajustes', (req, res) => send(res, v.adminSettings(res.locals.ctx)));

admin.post('/ajustes', (req, res) => {
  for (const key of ['store_name', 'tagline', 'whatsapp', 'instagram', 'shipping_cost', 'pickup_info']) {
    if (req.body[key] !== undefined) setSetting(key, clean(req.body[key], 200));
  }
  audit(actor(req), 'ajustes', '', req.ip);
  flash(req, 'ok', 'Ajustes guardados.');
  res.redirect('/admin/ajustes');
});

app.use('/admin', admin);

/* ---------- Errores ---------- */

app.use((req, res) => send(res.status(404), v.errorPage(res.locals.ctx || { settings: getSettings(), cartCount: 0, csrf: '' }, { status: 404, message: 'No encontramos esta página' })));
app.use((err, req, res, _next) => {
  if (err.code === 'LIMIT_FILE_SIZE' || err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
    return res.status(400).send('Las fotos superan el máximo permitido (6 fotos de hasta 6 MB).');
  }
  console.error(err);
  res.status(500).send('Ocurrió un error. Probá de nuevo.');
});

setInterval(expireOrders, 60_000).unref();
expireOrders();

app.listen(PORT, () => {
  console.log(`Card Grade Uy escuchando en ${BASE_URL}${DEMO ? ' (pagos en modo demo)' : ''}`);
});
