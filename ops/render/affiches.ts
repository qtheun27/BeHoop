// Affiches d'une vidéo déjà montée (sans refaire le montage) : planches avant-match, fins de quart et score final,
// rendues image par image comme pendant le montage, à partir des réglages et des photos déjà en ligne.
// Lancé par le Worker (/affiches) via le workflow affiches.yml.
import { mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { serve, captureAffiches } from './run';
import { admin, R2 } from '../lib/admin';
import { mosaicPhotos } from '../../shared/quarters';
import { settingsFromStore, type MatchSettings, type MediaItem, type PlancheType } from '../../shared/types';

const id = process.argv[2];
if (!id || !/^[a-z0-9]{8,32}$/.test(id)) throw new Error('identifiant de vidéo invalide');
const ROOT = resolve(import.meta.dirname, '../..');
const { db } = admin();
const r2 = new R2();
const ref = db.doc(`matchVideos/${id}`);
const work = join(ROOT, 'out', 'affiches', id);
try {
  await ref.update({ affichesStatus: 'running' });
  const mv = (await ref.get()).data()!;
  const prefix = mv.hls.masterKey.replace(/\/master\.m3u8$/, '');
  const vis = mv.visibility === 'team' ? `team-${mv.teamIdPrivate}` : 'public';
  rmSync(work, { recursive: true, force: true }); mkdirSync(join(work, 'photos'), { recursive: true });
  // Photos : copie gardée pour la galerie (photos/…) sinon l'original envoyé (rushes/…, s'il n'a pas encore été purgé)
  const media = (mv.media as (MediaItem & { local?: string })[]).filter((m) => !m.excluded);
  for (const m of media.filter((x) => x.kind === 'photo')) {
    const to = join(work, 'photos', `${m.id}.jpg`);
    const ok = await r2.download(`photos/${vis}/${id}/${m.id}.jpg`, to).then(() => true).catch(() => r2.download(m.r2Key, to).then(() => true).catch(() => false));
    if (ok) m.local = to;
  }
  const url = (p: string) => `/work/${p.slice(work.length + 1)}`;
  const withPhoto = media.filter((m) => m.local);
  const play = withPhoto.filter((m) => m.kind === 'photo' && !m.offPlay && !m.scoreboardOfQuarter).map((m) => url(m.local!));
  const of = (q: number) => { const p = mosaicPhotos(withPhoto, q).map((m) => url(m.local!)); return p.length ? p : play.slice(0, 4); };
  const q1 = of(1), q2 = of(2), q3 = of(3);
  const fin = play.length >= 4 ? play.filter((_, i, a) => i % Math.max(1, Math.floor(a.length / 8)) === 0).slice(0, 8) : [...q1, ...q2, ...q3].slice(0, 8);
  const featured = withPhoto.find((m) => m.featured && m.quarter === 1);
  const st: MatchSettings = { ...settingsFromStore(mv.settings), photos: { pre: featured ? url(featured.local!) : q1[0], q1, q2, q3, fin } };
    // Dernière image de chaque planche (1080p, comme la vidéo)
  const { server, base } = await serve(work);
  const browser = await chromium.launch();
  const keys: string[] = [];
  // Nouveau dossier à chaque création : les anciennes images, gardées en cache par les téléphones, ne réapparaissent pas
  const stamp = Date.now().toString(36);
  try {
    await captureAffiches(browser, base, st, join(work, 'affiches'));
    for (const t of ['pre', 'q1', 'q2', 'q3', 'fin'] as PlancheType[]) {
      await r2.upload(`${prefix}/affiches/${stamp}/${t}.jpg`, join(work, 'affiches', `${t}.jpg`), 'image/jpeg');
      keys.push(`${prefix}/affiches/${stamp}/${t}.jpg`);
    }
  } finally { await browser.close(); server.close(); }
  await ref.update({ 'hls.affiches': keys, affichesStatus: 'ready' });
  rmSync(work, { recursive: true, force: true });
} catch (e) {
  await ref.update({ affichesStatus: 'error' }).catch(() => {});
  throw e;
}
