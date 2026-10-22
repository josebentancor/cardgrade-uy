// Carga el catálogo actual de Card Grade Uy (sin fotos) para arrancar. Sólo inserta si la tabla está vacía.
import { db, uniqueSlug } from '../src/db.js';

const cards = [
  ['Sebastián Driussi Prizm /199 River Plate', 'Sebastián Driussi', 'River Plate', 'Prizm', '/199', 0, 180],
  ['Ian Subiabre Rookie /99 New Era River Plate', 'Ian Subiabre', 'River Plate', 'New Era', '/99', 1, 250],
  ['Facundo Colidio Prizm /99 River Plate', 'Facundo Colidio', 'River Plate', 'Prizm', '/99', 0, 200],
  ['Manuel Lanzini Optic /99 River Plate', 'Manuel Lanzini', 'River Plate', 'Optic', '/99', 0, 200],
  ['Ignacio Fernández Prizm /125 Rookie', 'Ignacio Fernández', 'River Plate', 'Prizm', '/125', 1, 180],
  ['Logo River Plate Prizm Base', 'River Plate', 'River Plate', 'Prizm', '', 0, 150],
  ['Sergio Romero Select /299 Argentina', 'Sergio Romero', 'Argentina', 'Select', '/299', 0, 150],
  ['Miguel Merentiel Prizm /99 Rookie Boca Juniors', 'Miguel Merentiel', 'Boca Juniors', 'Prizm', '/99', 1, 280],
  ['Agustín Marchesin Prizm /99 Boca Juniors', 'Agustín Marchesin', 'Boca Juniors', 'Prizm', '/99', 0, 200],
  ['Luis Advíncula Prizm /99 Boca Juniors', 'Luis Advíncula', 'Boca Juniors', 'Prizm', '/99', 0, 250],
  ['Kevin Zenón Prizm /125 Rookie Boca', 'Kevin Zenón', 'Boca Juniors', 'Prizm', '/125', 1, 200],
  ['André Herrera Prizm /199 Boca Juniors', 'André Herrera', 'Boca Juniors', 'Prizm', '/199', 0, 220],
  ['Ezequiel Zeballos Prizm /199 Rookie Boca', 'Ezequiel Zeballos', 'Boca Juniors', 'Prizm', '/199', 1, 250],
  ['Rodrigo Battaglia Prizm /175', 'Rodrigo Battaglia', 'Boca Juniors', 'Prizm', '/175', 0, 180],
  ['Escudo Boca Juniors Prizm Base', 'Boca Juniors', 'Boca Juniors', 'Prizm', '', 0, 150],
  ['Erling Haaland Prizm Base', 'Erling Haaland', '', 'Prizm', '', 0, 80],
  ['Neymar Topps Chrome Starball Debut', 'Neymar', '', 'Topps Chrome', '', 0, 400],
  ['Ronald Araujo Donruss Optic', 'Ronald Araujo', 'Uruguay', 'Donruss Optic', '', 0, 50],
  ['Maxi Pereira Donruss', 'Maxi Pereira', 'Uruguay', 'Donruss', '', 0, 70],
  ['Darwin Núñez Topps Now Liverpool', 'Darwin Núñez', 'Liverpool', 'Topps Now', '', 0, 250],
];

if (db.prepare('SELECT COUNT(*) n FROM cards').get().n > 0) {
  console.log('La tabla de cartas ya tiene datos; no se cargó nada.');
} else {
  const now = Date.now();
  const insert = db.prepare(`INSERT INTO cards (slug, title, player, team, brand, serial, rookie, price, status, created_at, updated_at, sold_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  cards.forEach(([title, player, team, brand, serial, rookie, price], i) => {
    const t = now - i * 60_000;
    const status = i === 13 ? 'vendida' : 'disponible';
    insert.run(uniqueSlug(title), title, player, team, brand, serial, rookie, price, status, t, t, status === 'vendida' ? t : null);
  });
  console.log(`Cargadas ${cards.length} cartas.`);
}
