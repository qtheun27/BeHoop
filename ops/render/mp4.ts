// Fichier MP4 720p d'une vidéo de match, à la demande (publication sur YouTube) : assemble les segments HLS 720p déjà en ligne,
// sans refaire le montage. Lancé par le Worker (/mp4) via le workflow mp4.yml.
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ff } from './run';
import { admin, R2, notifyUsers } from '../lib/admin';

const id = process.argv[2];
if (!id || !/^[a-z0-9]{8,32}$/.test(id)) throw new Error('identifiant de vidéo invalide');
const ROOT = resolve(import.meta.dirname, '../..');
const { db } = admin();
const r2 = new R2();
const ref = db.doc(`matchVideos/${id}`);
try {
  const mv = (await ref.get()).data()!;
  const dir = mv.hls.masterKey.replace(/\/master\.m3u8$/, '');
  const work = join(ROOT, 'out', 'mp4', id); rmSync(work, { recursive: true, force: true }); mkdirSync(work, { recursive: true });
  await ref.update({ mp4Status: 'running' });
  await r2.download(`${dir}/720p/index.m3u8`, join(work, 'index.m3u8'));
  const segs = readFileSync(join(work, 'index.m3u8'), 'utf8').split('\n').filter((l) => l && !l.startsWith('#'));
  for (let i = 0; i < segs.length; i += 8) await Promise.all(segs.slice(i, i + 8).map((s) => r2.download(`${dir}/720p/${s}`, join(work, s))));
  const out = join(work, 'film_720p.mp4');
  await ff(['-y', '-i', join(work, 'index.m3u8'), '-c', 'copy', '-bsf:a', 'aac_adtstoasc', '-movflags', '+faststart', out]);
  await r2.upload(`${dir}/film_720p.mp4`, out, 'video/mp4');
  await ref.update({ 'hls.mp4Key': `${dir}/film_720p.mp4`, mp4Status: 'ready' });
  await notifyUsers([mv.authorUid], { title: { fr: '🎬 Fichier prêt pour YouTube', nl: '🎬 Bestand klaar voor YouTube', en: '🎬 File ready for YouTube' }, body: mv.title, url: `/app/#/video/${id}` }, 'videoReady', null).catch(() => 0);
  rmSync(work, { recursive: true, force: true });
} catch (e) {
  await ref.update({ mp4Status: 'error' }).catch(() => {});
  throw e;
}
