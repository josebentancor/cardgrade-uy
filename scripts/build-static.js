// Genera una versión estática del sitio (catálogo, fichas, guía y "Vendé tus cartas") para GitHub Pages.
// No incluye pagos ni panel: la compra se hace por WhatsApp. Uso: npm run build-static -- /nombre-del-repo
import fs from 'node:fs';
import path from 'node:path';
import { db, getSettings, parseImages, UPLOAD_DIR } from '../src/db.js';
import * as v from '../src/views.js';

const BASE = (process.argv[2] || '/cardgrade-uy').replace(/\/$/, '');
const OUT = path.resolve('docs');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'static'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'uploads'), { recursive: true });
for (const f of ['style.css', 'app.js', 'logo.jpg']) fs.copyFileSync(path.join('public', f), path.join(OUT, 'static', f));
fs.writeFileSync(path.join(OUT, '.nojekyll'), '');

const settings = getSettings();
const ctx = (p) => ({ settings, cartCount: 0, csrf: '', flash: null, path: p, isAdmin: false, static: true });
const fix = (page) => String(page)
  .replace(/(href|src|action)="\/(?!\/)/g, `$1="${BASE}/`)
  .replace('<body>', '<body data-static>');
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
write('index.html', v.catalogPage(ctx('/'), { cards, stats, q, teams, page: 1, pages: 1 }));

for (const card of cards) {
  const related = cards.filter((c) => c.status === 'disponible' && c.id !== card.id)
    .sort((a, b) => (b.team === card.team) - (a.team === card.team)).slice(0, 4);
  write(`carta/${card.slug}/index.html`, v.cardPage(ctx('/carta'), { card, related }));
}
write('vender/index.html', v.sellPage(ctx('/vender'), {}));
write('guia/index.html', v.guidePage(ctx('/guia')));
write('404.html', v.errorPage(ctx('/404'), { status: 404, message: 'No encontramos esta página' }));
console.log(`Sitio estático generado en docs/ (${cards.length} cartas, base ${BASE}).`);
