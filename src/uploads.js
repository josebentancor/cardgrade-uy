// Subida de fotos: en memoria, con límites, verificación del contenido real (magic bytes)
// y nombre aleatorio. Nunca se usa el nombre ni el tipo que manda el navegador.
import multer from 'multer';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { UPLOAD_DIR } from './db.js';

export const upload = (maxFiles) => multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 6 * 1024 * 1024, files: maxFiles, fields: 30, fieldSize: 20 * 1024 },
});

function detectType(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length > 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

// Devuelve los nombres guardados; descarta silenciosamente lo que no sea imagen válida.
export function saveImages(files = []) {
  const saved = [];
  for (const f of files) {
    const ext = detectType(f.buffer);
    if (!ext) continue;
    const name = `${crypto.randomBytes(16).toString('hex')}.${ext}`;
    fs.writeFileSync(path.join(UPLOAD_DIR, name), f.buffer, { flag: 'wx' });
    saved.push(name);
  }
  return saved;
}

export function deleteImage(name) {
  if (!/^[a-f0-9]{32}\.(jpg|png|webp)$/.test(name)) return;
  fs.rm(path.join(UPLOAD_DIR, name), { force: true }, () => {});
}
