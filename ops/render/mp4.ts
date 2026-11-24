// Fichier MP4 720p d'une vidéo de match, à la demande (publication sur YouTube) : assemble les segments HLS 720p déjà en ligne,
// sans refaire le montage. Lancé par le Worker (/mp4) via le workflow mp4.yml.
import { mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ff } from './run';
import { admin, R2, notifyUsers } from '../lib/admin';

const ROOT = resolve(import.meta.dirname, '../..');

/** Assemble le fichier MP4 d'une vidéo de match (segments HLS déjà en ligne, sans réencodage) et le met dans R2 ;
 *  renvoie sa clé. notify : prévenir l'auteur (pas quand c'est une étape de la publication YouTube). */
export async function buildMp4(id: string, q: '1080p' | '720p', notify = true): Promise<string> {
  const { db } = admin();
  const r2 = new R2();
  const ref = db.doc(`matchVideos/${id}`);
  try {
    const mv = (await ref.get()).data()!;
    const dir = mv.hls.masterKey.replace(/\/master\.m3u8$/, '');
    const work = join(ROOT, 'out', 'mp4', id); rmSync(work, { recursive: true, force: true }); mkdirSync(work, { recursive: true });
    const field = q === '1080p' ? 'mp4Key1080' : 'mp4Key', status = q === '1080p' ? 'mp4Status1080' : 'mp4Status';
    await ref.update({ [status]: 'running', [`${status}Since`]: Date.now() });
    await r2.download(`${dir}/${q}/index.m3u8`, join(work, 'index.m3u8'));
    const segs = readFileSync(join(work, 'index.m3u8'), 'utf8').split('\n').filter((l) => l && !l.startsWith('#'));
    console.log(`${segs.length} segments ${q} à rassembler`);
    for (let i = 0; i < segs.length; i += 8) {
      await Promise.all(segs.slice(i, i + 8).map((s) => r2.download(`${dir}/${q}/${s}`, join(work, s))));
      if ((i / 8) % 10 === 9 || i + 8 >= segs.length) console.log(`  téléchargés : ${Math.min(i + 8, segs.length)}/${segs.length}`);
    }
    const out = join(work, `film_${q}.mp4`);
    await ff(['-y', '-i', join(work, 'index.m3u8'), '-c', 'copy', '-bsf:a', 'aac_adtstoasc', '-movflags', '+faststart', out]);
    console.log(`assemblé : ${(statSync(out).size / 1e6).toFixed(0)} Mo`);
    await r2.upload(`${dir}/film_${q}.mp4`, out, 'video/mp4');
    console.log('envoyé');
    await ref.update({ [`hls.${field}`]: `${dir}/film_${q}.mp4`, [status]: 'ready' });
    if (notify) await notifyUsers([mv.authorUid], { title: { fr: '🎬 Fichier prêt pour YouTube', nl: '🎬 Bestand klaar voor YouTube', en: '🎬 File ready for YouTube' }, body: mv.title, url: `/app/#/video/${id}` }, 'videoReady', null).catch(() => 0);
    rmSync(work, { recursive: true, force: true });
    return `${dir}/film_${q}.mp4`;
  } catch (e) {
    await ref.update({ [q === '1080p' ? 'mp4Status1080' : 'mp4Status']: 'error' }).catch(() => {});
    throw e;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const id = process.argv[2];
  /** 1080p (grands écrans, YouTube) ou 720p (plus léger) */
  const q = process.argv[3] === '720p' ? '720p' : '1080p';
  if (!id || !/^[a-z0-9]{8,32}$/.test(id)) throw new Error('identifiant de vidéo invalide');
  await buildMp4(id, q);
}
