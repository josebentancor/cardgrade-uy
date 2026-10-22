// Genera una versión estática del sitio (catálogo, fichas, guía y "Vendé tus cartas") para GitHub Pages.
// No incluye pagos ni panel: la compra se hace por WhatsApp. Uso: npm run build-static -- /nombre-del-repo
import fs from 'node:fs';
import path from 'node:path';
import { db, getSettings, parseImages, UPLOAD_DIR } from '../src/db.js';
import * as v from '../src/views.js';

const BASE = (process.argv[2] || '/cardgrade-uy').replace(/\/$/, '');
const OUT = path.resolve('docs');
const VERSION = Date.now().toString(36);
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'static'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'uploads'), { recursive: true });
for (const f of ['style.css', 'app.js', 'logo.jpg']) fs.copyFileSync(path.join('public', f), path.join(OUT, 'static', f));
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');

const settings = getSettings();
const ticker = db.prepare("SELECT title, price FROM cards WHERE status = 'disponible' ORDER BY created_at DESC LIMIT 10").all();
const ctx = (p) => ({ settings, cartCount: 0, csrf: '', flash: null, path: p, isAdmin: false, static: true, ticker });
const fix = (page) => String(page)
  .replace(/(href|src|action)="\/(?!\/)/g, `$1="${BASE}/`)
  .replace(/<body( class="[^"]*")?>/, '<body$1 data-static>')
  .replace(/static\/(app\.js|style\.css)"/g, `static/$1?v=${VERSION}"`);
function write(rel, page) {
  const file = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, fix(page));
}

const cards = db.prepare("SELECT * FROM cards WHERE status != 'oculta' ORDER BY CASE status WHEN 'disponible' THEN 0 WHEN 'reservada' THEN 1 ELSE 2 END, created_at DESC").all();
for (const c of cards) for (const img of parseImages(c)) fs.copyFileSync(path.join(UPLOAD_DIR, img), path.join(OUT, 'uploads', img));

const count = (s) => cards.filter((c) => c.status === s).length;
const stats = {
  disponibles: count('disponible'), vendidas: count('vendida'), total: cards.length,
  featured: cards.filter((c) => c.status === 'disponible' && parseImages(c).length).sort((a, b) => b.price - a.price).slice(0, 3),
};
const teams = [...new Set(cards.map((c) => c.team).filter(Boolean))].sort();
const q = { q: '', estado: '', tipo: '', equipo: '', orden: '', rookie: '', numerada: '' };
const counts = {
  todas: cards.length, disponibles: count('disponible'), uruguay: cards.filter((c) => c.team === 'Uruguay').length,
  river: cards.filter((c) => c.team === 'River Plate').length, boca: cards.filter((c) => c.team === 'Boca Juniors').length,
  rookies: cards.filter((c) => c.rookie).length, numeradas: cards.filter((c) => c.serial).length,
};
write('index.html', v.catalogPage(ctx('/'), { cards, stats, q, teams, page: 1, pages: 1, counts }));

for (const card of cards) {
  const related = cards.filter((c) => c.status === 'disponible' && c.id !== card.id)
    .sort((a, b) => (b.team === card.team) - (a.team === card.team)).slice(0, 4);
  write(`carta/${card.slug}/index.html`, v.cardPage(ctx('/carta'), { card, related }));
}
// Demostración del flujo de compra: datos → Mercado Pago (simulado) → resultado.
for (const card of cards.filter((c) => c.status === 'disponible')) {
  const base = `carta/${card.slug}`;
  const order = { id: '', total: card.price, shipping: 0 };
  write(`${base}/comprar/index.html`, v.checkoutPage(ctx('/checkout'), { items: [card], subtotal: card.price, action: `/${base}/pagar/` }));
  write(`${base}/pagar/index.html`, v.mpDemoPage(ctx('/pago'), { order, items: [card],
    links: { approved: `/${base}/pago-aprobado/`, pending: `/${base}/pago-pendiente/`, rejected: `/${base}/pago-rechazado/` } }));
  for (const [dir, status] of [['pago-aprobado', 'pagada'], ['pago-pendiente', 'pendiente'], ['pago-rechazado', 'cancelada']]) {
    write(`${base}/${dir}/index.html`, v.resultPage(ctx('/pago'), { order: { ...order, id: 'DEMO0000', status }, items: [card], demo: true, retryHref: `/${base}/pagar/` }));
  }
}
write('vender/index.html', v.sellPage(ctx('/vender'), {}));
write('guia/index.html', v.guidePage(ctx('/guia')));
write('404.html', v.errorPage(ctx('/404'), { status: 404, message: 'No encontramos esta página' }));
console.log(`Sitio estático generado en docs/ (${cards.length} cartas, base ${BASE}).`);
