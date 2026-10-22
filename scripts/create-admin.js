// Crea o actualiza el usuario del panel.
// Uso: npm run create-admin -- email@ejemplo.com
// La contraseña se pide por consola (no queda en el historial de comandos).
import bcrypt from 'bcryptjs';
import readline from 'node:readline';
import { db } from '../src/db.js';

const email = String(process.argv[2] || '').trim().toLowerCase();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error('Uso: npm run create-admin -- email@ejemplo.com');
  process.exit(1);
}

async function ask(question) {
  if (process.env.ADMIN_PASSWORD) return process.env.ADMIN_PASSWORD; // para despliegues automatizados
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (a) => { rl.close(); resolve(a); }));
}

const password = await ask('Contraseña (mínimo 12 caracteres): ');
if (password.length < 12) {
  console.error('La contraseña debe tener al menos 12 caracteres.');
  process.exit(1);
}
const hash = bcrypt.hashSync(password, 12);
db.prepare(`INSERT INTO admins (email, password_hash) VALUES (?, ?)
  ON CONFLICT(email) DO UPDATE SET password_hash = excluded.password_hash, failed_logins = 0, locked_until = 0`).run(email, hash);
console.log(`Usuario ${email} listo.`);
