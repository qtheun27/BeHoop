// Analyse des moments forts d'une vidéo de match déjà montée (après le montage, ou en rattrapage pour les anciennes) :
// son et mouvement mesurés sur la version 720p, résultat rangé dans matchVideos/{id}.highlights. Ne modifie jamais la vidéo.
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { admin, R2 } from '../lib/admin';
import { findHighlights, HL_STEP } from '../../shared/highlights';

const ROOT = resolve(import.meta.dirname, '../..');
const FFMPEG = process.env.FFMPEG ?? 'ffmpeg';

/** Sortie brute de FFmpeg (flux d'octets) */
function raw(args: string[]): Promise<Buffer> {
  return new Promise((res, rej) => {
    const p = spawn(FFMPEG, ['-hide_banner', '-loglevel', 'error', ...args], { stdio: ['ignore', 'pipe', 'inherit'] });
    const chunks: Buffer[] = []; p.stdout.on('data', (c) => chunks.push(c));
    p.on('close', (code) => (code === 0 ? res(Buffer.concat(chunks)) : rej(new Error(`ffmpeg ${code}`)))); p.on('error', rej);
  });
}

/** Mesures d'un fichier vidéo : niveau sonore (dB), mouvement et coupures, par pas de 0,25 s */
export async function measure(file: string): Promise<{ rmsDb: number[]; motion: number[]; cuts: number[] }> {
  const SR = 8000, per = Math.round(SR * HL_STEP);
  const pcm = await raw(['-i', file, '-vn', '-ac', '1', '-ar', String(SR), '-f', 's16le', '-']);
  const rmsDb: number[] = [];
  for (let o = 0; o + per * 2 <= pcm.length; o += per * 2) {
    let s = 0; for (let i = 0; i < per; i++) { const v = pcm.readInt16LE(o + i * 2) / 32768; s += v * v; }
    rmsDb.push(10 * Math.log10(s / per + 1e-9));
  }
  const W = 64, H = 36, F = W * H;
  const img = await raw(['-i', file, '-an', '-vf', `fps=${1 / HL_STEP},scale=${W}:${H},format=gray`, '-f', 'rawvideo', '-']);
  const motion: number[] = [0];
  for (let k = 1; (k + 1) * F <= img.length; k++) { let d = 0; for (let i = 0; i < F; i++) d += Math.abs(img[k * F + i] - img[(k - 1) * F + i]); motion.push(d / F); }
  // Coupure (changement de séquence) : différence très au-dessus de l'habituel
  const sorted = [...motion].sort((a, b) => a - b), p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
  const cuts = motion.flatMap((m, i) => (m > Math.max(25, p95 * 3) ? [i * HL_STEP] : []));
  return { rmsDb, motion, cuts };
}

async function one(id: string, db: FirebaseFirestore.Firestore, r2: R2) {
  const ref = db.doc(`matchVideos/${id}`); const mv = (await ref.get()).data();
  if (!mv || mv.status !== 'ready' || !mv.hls) { console.log(id, 'pas prête'); return; }
  const work = join(ROOT, 'out', 'highlights', id); rmSync(work, { recursive: true, force: true }); mkdirSync(work, { recursive: true });
  try {
    const file = join(work, 'film.mp4');
    if (mv.hls.mp4Key) await r2.download(mv.hls.mp4Key, file);
    else { // pas de MP4 720p : la liste HLS 720p et ses segments
      const pl = mv.hls.masterKey.replace('master.m3u8', '720p/index.m3u8'); await r2.download(pl, join(work, 'index.m3u8'));
      const { readFileSync } = await import('node:fs');
      for (const l of readFileSync(join(work, 'index.m3u8'), 'utf8').split('\n')) if (l && !l.startsWith('#')) await r2.download(pl.replace('index.m3u8', l), join(work, l));
      await new Promise<void>((res, rej) => { const p = spawn(FFMPEG, ['-loglevel', 'error', '-y', '-i', join(work, 'index.m3u8'), '-c', 'copy', file], { stdio: 'inherit' }); p.on('close', (c) => (c === 0 ? res() : rej(new Error('concat')))); });
    }
    if (!existsSync(file)) throw new Error('vidéo introuvable');
    const m = await measure(file);
    const highlights = findHighlights(m.rmsDb, m.motion, mv.hls.chapters ?? [], m.cuts);
    await ref.update({ highlights, highlightsAt: Date.now() });
    console.log(id, `${highlights.length} moments forts`, highlights.map((h) => h.t).join(' '));
  } finally { rmSync(work, { recursive: true, force: true }); }
}

if (process.argv[1]?.endsWith('highlights.ts')) {
  const arg = process.argv[2] ?? '';
  const { db } = admin(); const r2 = new R2();
  if (arg === 'all') { // rattrapage : toutes les vidéos prêtes sans analyse
    const q = await db.collection('matchVideos').where('status', '==', 'ready').get();
    for (const d of q.docs) if (!d.data().highlightsAt) await one(d.id, db, r2).catch((e) => console.error(d.id, e));
  } else await one(arg, db, r2);
}
