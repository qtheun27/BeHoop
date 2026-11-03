// Logos des planches : marges vides retirées (beaucoup de logos de clubs ont un cadre blanc ou transparent
// décentré), puis recentrés dans un carré. Servis depuis le dossier de travail.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');
import sharp from 'sharp';

/** Logo recadré et centré (PNG 800 × 800) ; en cas de souci, le logo d'origine */
export async function prepLogo(src: string, work: string, name: string): Promise<string> {
  if (!src) return src;
  try {
    // Logo du site (/logos/…) lu sur place, sinon téléchargé
    let buf: Buffer;
    if (src.startsWith('/') && !src.startsWith('/work/') && existsSync(join(ROOT, src))) buf = readFileSync(join(ROOT, src));
    else if (/^https?:\/\//.test(src)) { const r = await fetch(src, { signal: AbortSignal.timeout(15000) }); if (!r.ok) return src; buf = Buffer.from(await r.arrayBuffer()); }
    else return src;
    // Fond uni (blanc ou transparent, celui du coin) retiré, puis carré centré avec une petite marge
    const trimmed = await sharp(buf).ensureAlpha().trim({ threshold: 25 }).png().toBuffer();
    const out = await sharp(trimmed).resize(760, 760, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .extend({ top: 20, bottom: 20, left: 20, right: 20, background: { r: 255, g: 255, b: 255, alpha: 0 } }).png().toBuffer();
    writeFileSync(join(work, `${name}.png`), out);
    return `/work/${name}.png`;
  } catch { return src; }
}
