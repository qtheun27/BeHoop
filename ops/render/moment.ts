// Rendu d'un Moment : 1 à 6 passages (5–30 s chacun, 60 s au total) en vertical 9:16, plein écran recadré ou image entière
// sur fond flou, enchaînés par une vague ; bandeau score + logos des clubs, logo BeHoop animé sous le bandeau.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';
import { ff, probe } from './run';
import { waveFrames, WAVE_CUT } from './wave';
import { bugTrack } from './bug';
import { momentClipArgs, momentJoinArgs, type MomentLayout } from '../../shared/ffmpeg';
import { admin, R2, notifyUsers } from '../lib/admin';
import { settingsFromStore } from '../../shared/types';
import { N } from '../../shared/notifText';

const ROOT = resolve(import.meta.dirname, '../..');
const SITE = process.env.SITE_URL ?? 'https://behoop.be';
const id = process.argv[2];
const { db, FieldValue } = admin();
const r2 = new R2();
const ref = db.doc(`moments/${id}`);
try {
  const m = (await ref.get()).data()!;
  const mv = (await db.doc(`matchVideos/${m.matchVideoId}`).get()).data()!;
  const work = join(ROOT, 'out', 'moment', id); rmSync(work, { recursive: true, force: true }); mkdirSync(work, { recursive: true });
  await ref.update({ status: 'running' });
  // Passages (plusieurs possibles, enchaînés par une vague) ; anciens Moments : un seul passage, image entière
  const clips: { start: number; end: number }[] = Array.isArray(m.clips) && m.clips.length ? m.clips : [{ start: m.start, end: m.end }];
  const layout: MomentLayout = m.layout === 'full' ? 'full' : 'fit';
  const pos = typeof m.pos === 'number' ? m.pos : 0.5;
  // Source : variante 1080p HLS (seuls les segments utiles sont téléchargés)
  const src1080 = mv.hls.masterKey.replace('master.m3u8', '1080p/index.m3u8');
  await r2.download(src1080, join(work, 'index.m3u8'));
  const list = readFileSync(join(work, 'index.m3u8'), 'utf8').split('\n');
  // Segments de la vidéo avec leur heure de début ; chaque passage aura sa propre petite liste (seuls ses segments,
  // téléchargés) : FFmpeg n'a plus à chercher dans la liste complète du match, où les autres segments manquent
  const head = list.slice(0, list.findIndex((l) => l.startsWith('#EXTINF'))).filter((l) => l && !l.startsWith('#EXT-X-MEDIA-SEQUENCE') && !l.startsWith('#EXT-X-ENDLIST'));
  const segs: { name: string; t: number; dur: number }[] = [];
  let t = 0;
  for (let i = 0; i < list.length; i++) {
    const d = /#EXTINF:([\d.]+)/.exec(list[i]); if (!d) continue;
    segs.push({ name: list[i + 1], t, dur: Number(d[1]) }); t += Number(d[1]);
  }
  const segsOf = (c: { start: number; end: number }) => segs.filter((g) => g.t + g.dur > c.start - 1 && g.t < c.end + 1);
  const need = [...new Set(clips.flatMap((c) => segsOf(c).map((g) => g.name)))];
  for (const s of need) await r2.download(src1080.replace('index.m3u8', s), join(work, s));
  // Bandeau du score 1080×300 rendu par Chromium. Logos des clubs : adresses du site (/logos/…) rendues absolues
  // (le bandeau est une page locale : une adresse relative ne trouverait pas l'image).
  const st = settingsFromStore(mv.settings); const [h, a] = st.scores[3];
  const abs = (u: string) => (/^\/[^/]/.test(u ?? '') ? `${SITE}${u}` : u ?? '');
  const logo = (u: string, c: string) => `<div class="l" style="box-shadow:0 0 0 5px ${c}">${u ? `<img src="${abs(u)}">` : ''}</div>`;
  const html = `<html><head><style>body{margin:0;width:1080px;height:300px;background:linear-gradient(#0a0c12f0,#0a0c1200);font-family:Oswald,Arial;color:#fff;display:flex;align-items:center;justify-content:center;gap:28px}
    .l{width:110px;height:110px;border-radius:50%;background:#fff;display:grid;place-items:center;overflow:hidden}.l img{width:78%;height:78%;object-fit:contain}
    .s{font-family:Anton,Impact;font-size:96px}.g{color:#f2c14e}</style></head>
    <body>${logo(st.home.logo, st.home.color)}<div class="s ${h > a ? 'g' : ''}">${h}</div><div class="s" style="opacity:.5">–</div>
    <div class="s ${a > h ? 'g' : ''}">${a}</div>${logo(st.away.logo, st.away.color)}</body></html>`;
  writeFileSync(join(work, 'banner.html'), html);
  const b = await chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});
  let bug: string | undefined, wave: string | undefined;
  try {
    const p = await b.newPage({ viewport: { width: 1080, height: 300 } });
    await p.goto('file://' + join(work, 'banner.html')); await p.waitForLoadState('networkidle');
    await p.screenshot({ path: join(work, 'banner.png'), omitBackground: true });
    // Logo BeHoop animé sous le bandeau — sauf si le logo incrusté dans la vidéo du match reste visible
    // (image entière, ou cadrage poussé tout à droite, là où il se trouve) : jamais deux logos à l'écran
    const filmLogoVisible = !!mv.hls?.logo && (layout === 'fit' || pos > 0.85);
    if (!filmLogoVisible) bug = await bugTrack(b, work);
    if (clips.length > 1) wave = await waveFrames(b, work, [st.home.color, st.away.color]);
  } finally { await b.close(); }
  // Chaque passage au format vertical, puis assemblage (une seule passe finale)
  const parts: { path: string; duration: number }[] = [];
  for (const [i, c] of clips.entries()) {
    const f = join(work, `clip_${i}.mp4`);
    const own = segsOf(c); if (!own.length) throw new Error(`passage ${i + 1} hors de la vidéo`);
    const pl = join(work, `clip_${i}.m3u8`);
    writeFileSync(pl, [...head, ...own.flatMap((g) => [`#EXTINF:${g.dur.toFixed(6)},`, g.name]), '#EXT-X-ENDLIST', ''].join('\n'));
    await ff(momentClipArgs(pl, c.start - own[0].t, c.end - own[0].t, layout, pos, f));
    const d = (await probe(f)).duration;
    if (!(d > 1)) throw new Error(`passage ${i + 1} vide (${c.start}–${c.end} s)`);
    parts.push({ path: f, duration: d });
  }
  const out = join(work, 'moment.mp4');
  const whoosh = join(ROOT, 'render/assets/whoosh.m4a');
  const joined = momentJoinArgs({ clips: parts, banner: join(work, 'banner.png'), output: out, bug, wave, waveCut: WAVE_CUT, whoosh: existsSync(whoosh) ? whoosh : undefined });
  await ff(joined.args);
  const vis = mv.visibility === 'team' ? `team-${mv.teamIdPrivate}` : 'public';
  const key = `moments/${vis}/${m.matchVideoId}/${id}.mp4`;
  await r2.upload(key, out, 'video/mp4');
  await ref.update({ status: 'ready', r2Key: key, duration: Math.round(joined.duration * 10) / 10, readyAt: FieldValue.serverTimestamp() });
  await db.doc(`posts/moment-${id}`).set({
    type: 'moment', authorUid: m.authorUid, authorName: m.authorName ?? '', clubId: null, teamIds: mv.teamIds, targets: mv.teamIds.filter(Boolean).map((x: number) => `t:${x}`),
    visibility: mv.visibility, teamIdPrivate: mv.teamIdPrivate ?? null, hidden: false, reactions: {}, createdAt: FieldValue.serverTimestamp(),
    payload: { matchVideoId: m.matchVideoId, momentId: id, title: st.title, duration: Math.round(joined.duration), posterKey: mv.hls.posterKey, score: `${h} – ${a}` },
  });
  await notifyUsers([m.authorUid], { title: N.momentReady, body: st.title, url: `/app/#/video/${m.matchVideoId}/m-${id}` }, 'videoReady', null).catch(() => 0);
} catch (e) {
  console.error(e); await ref.update({ status: 'error', error: String((e as Error).message).slice(0, 300) }); process.exitCode = 1;
}
