// Importa el catálogo público de Card Grade Uy desde Yala (títulos, precios, estado y fotos).
// Uso: npm run import-yala            (agrega sólo las publicaciones que todavía no existen)
//      npm run import-yala -- --reset (borra primero las cartas sin pedidos asociados)
import { db, uniqueSlug, parseImages } from '../src/db.js';
import { saveImages, deleteImage } from '../src/uploads.js';

const SELLER = 'card-grade-uy';
const API = `https://api.yala-collect.com/api/public/sellers/${SELLER}/listings`;
const STATUS = { AVAILABLE: 'disponible', RESERVED: 'reservada', SOLD: 'vendida' };
const BRANDS = ['Topps Chrome', 'Stadium Chrome', 'Topps Now', 'Donruss Optic', 'Panini Instant', 'New Era', 'Prizm', 'Optic', 'Select', 'Donruss', 'Merlin', 'Instant'];
const TEAMS = [['River', 'River Plate'], ['Boca', 'Boca Juniors'], ['Argentina', 'Argentina'], ['Liverpool', 'Liverpool'], ['Copa América', 'Uruguay']];
const URUGUAYOS = ['Valverde', 'Araujo', 'Pereira', 'Núñez', 'Arrascaeta', 'Cáceres', 'Pellistri', 'Olivera', 'Muslera', 'Ugarte', 'Sánchez', 'Bentancur', 'Godin', 'Suárez', 'Cavani', 'Giménez', 'Forlán', 'De La Cruz', 'Rodríguez'];

function parseTitle(title) {
  const brand = BRANDS.find((b) => title.toLowerCase().includes(b.toLowerCase())) || '';
  const serial = (title.match(/\/\d+/) || [''])[0];
  const team = (TEAMS.find(([k]) => title.includes(k)) || [])[1] ||
    (URUGUAYOS.some((u) => title.includes(u)) ? 'Uruguay' : '');
  const cut = brand ? title.toLowerCase().indexOf(brand.toLowerCase()) : title.search(/\s\/\d+/);
  const player = (cut > 0 ? title.slice(0, cut) : title).trim();
  return { brand, serial, team, player, rookie: /rookie/i.test(title) ? 1 : 0 };
}

async function fetchAll() {
  const all = [];
  for (let page = 0; page < 50; page++) {
    const res = await fetch(`${API}?page=${page}&size=50`, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw new Error(`Yala respondió ${res.status}`);
    const json = await res.json();
    all.push(...json.content);
    if (page + 1 >= json.total_pages) break;
  }
  return all;
}

async function download(url) {
  if (!/^https:\/\/yala\.sfo3\.cdn\.digitaloceanspaces\.com\//.test(url)) return [];
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) return [];
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length > 8 * 1024 * 1024) return [];
  return saveImages([{ buffer }]); // valida que sea JPG/PNG/WEBP real
}

if (process.argv.includes('--reset')) {
  const removable = db.prepare('SELECT * FROM cards WHERE id NOT IN (SELECT card_id FROM order_items)').all();
  for (const c of removable) parseImages(c).forEach(deleteImage);
  db.prepare('DELETE FROM cards WHERE id NOT IN (SELECT card_id FROM order_items)').run();
  console.log(`Borradas ${removable.length} cartas sin pedidos.`);
}

const listings = await fetchAll();
const exists = db.prepare('SELECT id FROM cards WHERE external_ref = ?');
const insert = db.prepare(`INSERT INTO cards (slug, title, player, team, brand, serial, kind, rookie, price, status, external_ref, images, created_at, updated_at, sold_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
let added = 0;
for (const l of listings) {
  const ref = `yala:${l.id}`;
  if (exists.get(ref)) continue;
  const meta = parseTitle(l.title);
  const images = await download(l.main_image_url);
  const t = Date.parse(l.published_at) || Date.now();
  const status = STATUS[l.status] || 'disponible';
  insert.run(uniqueSlug(l.title), l.title, meta.player, meta.team, meta.brand, meta.serial, l.graded ? 'graded' : 'raw',
    meta.rookie || (l.rookie ? 1 : 0), Math.round(l.price_amount), status, ref, JSON.stringify(images), t, t, status === 'vendida' ? t : null);
  added++;
  process.stdout.write('.');
}
console.log(`\nImportadas ${added} cartas (de ${listings.length} publicaciones en Yala).`);
