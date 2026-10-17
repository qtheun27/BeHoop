// Crée un montage de test complet dans out/demo-job : vidéos synthétiques (paysage H.264, verticale sans son, HEVC)
// + photos du match test, horodatées pour que le découpage automatique retrouve les 4 quarts-temps.
import { mkdirSync, writeFileSync, copyFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ff } from './run';
import { demoSettings } from '../../shared/demo';
import { assignQuarters } from '../../shared/quarters';
import type { MediaItem } from '../../shared/types';

const ROOT = resolve(import.meta.dirname, '../..');
const dir = join(ROOT, 'out/demo-job');
mkdirSync(dir, { recursive: true });
const secs = Number(process.argv[2] ?? 6);
const t0 = Date.UTC(2026, 9, 10, 11, 5);
const media: MediaItem[] = [];
const quarterStart = [0, 14, 30, 44]; // minutes : les pauses entre quarts créent les « 3 plus grands écarts »
let n = 0;
for (let q = 0; q < 4; q++) {
  for (let k = 0; k < 2; k++) {
    const id = `v${q}${k}`, file = `${id}.mp4`;
    const vertical = q === 1 && k === 1, hevc = q === 2 && k === 0;
    const size = vertical ? '1080x1920' : '1920x1080';
    await ff(['-y', '-f', 'lavfi', '-i', `testsrc2=size=${size}:rate=30:duration=${secs}`, ...(vertical ? [] : ['-f', 'lavfi', '-i', `sine=frequency=${300 + q * 100}:duration=${secs}`]),
      '-c:v', hevc ? 'libx265' : 'libx264', '-preset', 'ultrafast', ...(vertical ? [] : ['-c:a', 'aac']), '-shortest', join(dir, file)]).catch(async () =>
      ff(['-y', '-f', 'lavfi', '-i', `testsrc2=size=${size}:rate=30:duration=${secs}`, '-c:v', 'libx264', '-preset', 'ultrafast', join(dir, file)]));
    media.push({ id, r2Key: file, kind: 'video', name: file, takenAt: t0 + (quarterStart[q] + k * 3) * 60000, duration: secs });
  }
}
const photos = readdirSync(join(ROOT, 'docs/test/photos')).filter((f) => f.endsWith('.jpg'));
for (const p of photos) {
  const q = Number(p[1]) - 1; copyFileSync(join(ROOT, 'docs/test/photos', p), join(dir, p));
  media.push({ id: p.replace('.jpg', ''), r2Key: p, kind: 'photo', name: p, takenAt: t0 + (quarterStart[q] + 1 + n++ % 3) * 60000, featured: p.endsWith('_1.jpg') });
}
const st = demoSettings('/docs/test');
writeFileSync(join(dir, 'job.json'), JSON.stringify({ id: 'demo', version: 1, settings: st, media: assignQuarters(media), visibility: 'team', teamIdPrivate: 51656 }, null, 1));
console.log(`job de test : ${media.length} médias → ${dir}`);
