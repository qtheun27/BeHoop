// Préparation des vidéos d'un montage en parallèle (render.yml, tâches « norm » 0 à N-1) : chaque tâche prend sa part des
// vidéos (répartie par durée, la plus longue d'abord), les prépare (1080p30, HDR → SDR, débruitage) et les dépose dans R2
// (render-tmp/{id}/). Le montage (run.ts) les récupère ensuite ; une vidéo manquante (tâche en échec) y est préparée.
import { mkdirSync, rmSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';
import { normalizeFile, videoOrder, normKey } from './run';
import type { MediaItem } from '../../shared/types';

/** Répartit les vidéos entre n tâches, la plus longue d'abord, chacune vers la tâche la moins chargée */
export function shard(videos: MediaItem[], n: number): MediaItem[][] {
  const out = Array.from({ length: n }, () => [] as MediaItem[]), load = Array(n).fill(0);
  for (const v of [...videos].sort((a, b) => (b.duration ?? 0) - (a.duration ?? 0) || a.id.localeCompare(b.id))) {
    const i = load.indexOf(Math.min(...load)); out[i].push(v); load[i] += v.duration ?? 60;
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [id, k, n] = [process.argv[2], Number(process.argv[3]), Number(process.argv[4])];
  if (!id || !/^[a-z0-9]{8,32}$/.test(id) || !(k >= 0 && k < n)) throw new Error('paramètres invalides');
  const { admin, R2 } = await import('../lib/admin');
  const { db } = admin();
  const r2 = new R2();
  const mv = (await db.doc(`matchVideos/${id}`).get()).data();
  if (!mv) throw new Error('Montage introuvable');
  const all = videoOrder(mv.media as MediaItem[]);
  const mine = shard(all, n)[k];
  const work = join(resolve(import.meta.dirname, '../..'), 'out', 'norm', id); mkdirSync(work, { recursive: true });
  const jobRef = db.doc(`renderJobs/${id}`);
  console.log(`tâche ${k + 1}/${n} : ${mine.length} vidéo(s) sur ${all.length}`);
  // Dès le départ : l'appli affiche la préparation (sinon « En file d'attente · 0 % » jusqu'à la fin de la première vidéo, longue en 4K)
  const cur = (await jobRef.get()).data();
  if (!cur || cur.status === 'queued' || !(Number(cur.progress) > 5)) await jobRef.set({ status: 'running', progress: Math.max(5, Number(cur?.progress) || 0), step: `Préparation des vidéos (0/${all.length})` }, { merge: true });
  for (const m of mine) {
    const t0 = Date.now();
    const src = join(work, `src_${m.id}${extname(m.name) || '.mov'}`), out = join(work, `norm_${m.id}.mp4`);
    await r2.download(m.r2Key, src);
    await normalizeFile(src, out);
    rmSync(src, { force: true });
    await r2.upload(normKey(id, m.id), out, 'video/mp4', 'no-store');
    rmSync(out, { force: true });
    console.log(`  ${m.name} (${Math.round(m.duration ?? 0)} s) prête en ${Math.round((Date.now() - t0) / 1000)} s`);
    // Avancement commun à toutes les tâches (5 → 55 %) : vidéos déjà déposées, toutes tâches confondues
    const ready = new Set(all.map((v) => normKey(id, v.id)));
    const done = (await r2.list(`render-tmp/${id}/`).catch(() => [])).filter((x) => ready.has(x.key)).length;
    await jobRef.set({ status: 'running', progress: 5 + Math.round((Math.min(done, all.length) / Math.max(1, all.length)) * 50), step: `Préparation des vidéos (${Math.min(done, all.length)}/${all.length})` }, { merge: true });
  }
  rmSync(work, { recursive: true, force: true });
}
